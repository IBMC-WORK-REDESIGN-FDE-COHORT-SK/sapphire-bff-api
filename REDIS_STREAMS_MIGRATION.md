# Redis Streams Migration for Recommendation Progress

## Overview

This document describes the migration from Redis Pub/Sub to Redis Streams for recommendation workflow progress tracking. This change ensures that SSE clients receive all progress events, including those published before the client connects.

## Problem Statement

### Original Issue
- **Missing Events**: The first 10% progress event and early workflow events were missing when SSE clients connected
- **Root Cause**: Redis Pub/Sub is ephemeral - messages are only delivered to clients connected at the time of publication
- **Impact**: Users connecting after workflow start would miss initial progress updates, causing poor UX

### Example from Logs
```
Workflow starts:     15:22:08.963
First event (10%):   15:22:09.075
SSE connects:        15:22:36.576  ← 27 seconds late!
First received:      15:24:24.004  ← Missing 10% event
```

## Solution: Redis Streams

Redis Streams provide:
1. **Message Persistence**: Events are stored and can be replayed
2. **Historical Replay**: Clients can read messages from the beginning
3. **Automatic Cleanup**: TTL-based expiration prevents unbounded growth
4. **Consumer Groups**: Future support for multiple consumers if needed

## Changes Made

### 1. BFF API (sapphire-bff-api)

**File**: `src/index.js`

**Key Changes**:
- Replaced Redis Pub/Sub subscription with Redis Streams `XREAD`
- Added historical message replay on connection
- Stream key format: `recommendation-progress:{workflowId}`
- Made `workflowId` query parameter required

**Flow**:
```javascript
1. Client connects to SSE endpoint with workflowId
2. Server reads historical messages from stream (id: '0')
3. Server replays all historical events to client
4. Server starts listening for new messages (id: '$')
5. Server streams new events in real-time
6. Connection closes on 'complete' or 'error' event
```

### 2. Workflow Service (recommendation-workflow-service)

**File**: `src/main/java/com/sapphire/recommendation/service/ProgressPublisherService.java`

**Key Changes**:
- Replaced `redisTemplate.convertAndSend()` with `redisTemplate.opsForStream().add()`
- Stream key format: `recommendation-progress:{workflowId}`
- Added 24-hour TTL on streams for automatic cleanup
- Trim stream to 100 messages on completion to prevent unbounded growth

**Publishing Flow**:
```java
1. Create stream key: "recommendation-progress:{workflowId}"
2. Serialize event to JSON
3. Add to Redis Stream using XADD
4. Set TTL on stream (24 hours)
5. On completion, trim stream to last 100 messages
```

## Stream Structure

### Stream Key Format
```
recommendation-progress:{workflowId}
```

Example:
```
recommendation-progress:recommendation-workflow-maya.patel@sapphirewellness.com-1773222728962
```

### Event Format
Each stream entry contains a JSON-serialized `ProgressEvent`:

```json
{
  "type": "progress",
  "workflowId": "recommendation-workflow-maya.patel@sapphirewellness.com-1773222728962",
  "userId": "maya.patel@sapphirewellness.com",
  "timestamp": "2026-03-11T09:54:24.004496600Z",
  "step": {
    "current": 1,
    "total": 7,
    "name": "Generating Personalized Profile",
    "description": "Analyzing your health data and wellness patterns",
    "status": "completed"
  },
  "percentage": 20
}
```

## Testing

### Prerequisites
1. Redis server running (localhost:6379 or configured host)
2. BFF API running (port 4000)
3. Workflow service running (port 8095)
4. Valid Keycloak token

### Test Scenario 1: Normal Flow

```bash
# Terminal 1: Start workflow
curl -X POST http://localhost:8095/api/v1/recommendations/trigger \
  -H "Content-Type: application/json" \
  -d '{"userId": "maya.patel@sapphirewellness.com"}'

# Response will include workflowId
# {"workflowId": "recommendation-workflow-maya.patel@sapphirewellness.com-1773222728962"}

# Terminal 2: Connect SSE (can connect AFTER workflow starts)
curl --request GET \
  --url 'http://localhost:4000/sse/recommendation-progress/maya.patel@sapphirewellness.com?workflowId=recommendation-workflow-maya.patel@sapphirewellness.com-1773222728962' \
  --header 'Accept: text/event-stream' \
  --header 'Authorization: Bearer YOUR_TOKEN'
```

**Expected Result**: Client receives ALL events including the first 10% event, even if connected late.

### Test Scenario 2: Late Connection

```bash
# 1. Start workflow
# 2. Wait 30 seconds
# 3. Connect SSE client
# 4. Verify all historical events are replayed
```

**Expected Result**: All events from workflow start are received immediately, then real-time events follow.

### Test Scenario 3: Multiple Clients

```bash
# 1. Start workflow
# 2. Connect Client A immediately
# 3. Wait 10 seconds
# 4. Connect Client B
# 5. Both clients should receive all events
```

**Expected Result**: Both clients receive complete event history.

### Verify Redis Streams

```bash
# Check stream exists
redis-cli XLEN recommendation-progress:recommendation-workflow-maya.patel@sapphirewellness.com-1773222728962

# Read all messages
redis-cli XREAD COUNT 100 STREAMS recommendation-progress:recommendation-workflow-maya.patel@sapphirewellness.com-1773222728962 0

# Check TTL
redis-cli TTL recommendation-progress:recommendation-workflow-maya.patel@sapphirewellness.com-1773222728962
```

## Benefits

1. **No Lost Events**: All progress events are captured and can be replayed
2. **Better UX**: Users see complete progress from 0% to 100%
3. **Debugging**: Historical events available for troubleshooting
4. **Scalability**: Multiple clients can connect and receive same events
5. **Automatic Cleanup**: 24-hour TTL prevents Redis memory issues

## Backward Compatibility

- The `storeProgress()` method is kept but no longer stores data (Redis Streams handle persistence)
- Old pub/sub channel is no longer used
- Frontend must provide `workflowId` query parameter (now required)

## Performance Considerations

1. **Memory**: Streams are trimmed to 100 messages on completion
2. **TTL**: Streams expire after 24 hours automatically
3. **Read Performance**: XREAD with BLOCK is efficient for real-time updates
4. **Write Performance**: XADD is O(1) operation

## Monitoring

### Key Metrics to Monitor

1. **Stream Length**: Should not exceed 100 messages per workflow
2. **Memory Usage**: Monitor Redis memory for stream storage
3. **TTL**: Verify streams are expiring after 24 hours
4. **Client Connections**: Monitor SSE connection count

### Redis Commands for Monitoring

```bash
# List all recommendation streams
redis-cli KEYS "recommendation-progress:*"

# Check stream info
redis-cli XINFO STREAM recommendation-progress:{workflowId}

# Monitor stream operations
redis-cli MONITOR | grep "recommendation-progress"
```

## Rollback Plan

If issues occur, rollback by:

1. Revert `src/index.js` in BFF API
2. Revert `ProgressPublisherService.java` in workflow service
3. Restart both services
4. Old pub/sub mechanism will be active

## Future Enhancements

1. **Consumer Groups**: Use Redis Stream consumer groups for load balancing
2. **Acknowledgment**: Track which clients have received which events
3. **Replay Control**: Allow clients to specify starting position
4. **Compression**: Compress event data for large workflows
5. **Metrics**: Add Prometheus metrics for stream operations

## References

- [Redis Streams Documentation](https://redis.io/docs/data-types/streams/)
- [Spring Data Redis Streams](https://docs.spring.io/spring-data/redis/docs/current/reference/html/#redis.streams)
- [Node Redis Streams](https://github.com/redis/node-redis/blob/master/docs/streams.md)

---

**Migration Date**: 2026-03-11  
**Author**: Bob (AI Assistant)  
**Status**: ✅ Complete