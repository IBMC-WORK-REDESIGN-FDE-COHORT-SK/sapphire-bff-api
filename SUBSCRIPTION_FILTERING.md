# Subscription Filtering Implementation

## Overview
This document describes the subscription filtering mechanism implemented for the GraphQL `alertReceived` subscription. The implementation uses a single-channel approach with subscription-level filtering to efficiently deliver user-specific alerts.

## Architecture

### Before (User-Specific Channels)
```
Redis "alerts" → Parse userId → Publish to "ALERT_user1", "ALERT_user2", etc.
                                         ↓
                                  Each user subscribes to their own channel
```

**Problems:**
- High memory overhead (one channel per user)
- Wasted processing for offline users
- Doesn't scale horizontally with in-memory PubSub
- Single point of failure

### After (Single Channel with Filtering)
```
Redis "alerts" → Publish to single "ALERTS" channel
                          ↓
                  All subscriptions listen to "ALERTS"
                          ↓
                  withFilter() filters by userId at GraphQL layer
                          ↓
                  Each user receives only their alerts
```

**Benefits:**
- ✅ Single channel = Lower memory footprint
- ✅ No processing for offline users (filtering happens only for active subscriptions)
- ✅ Better scalability
- ✅ Cleaner architecture
- ✅ Ready for distributed PubSub (Redis PubSub, etc.)

## Implementation Details

### 1. Redis Publisher (`src/utils/redis.js`)

```javascript
await subscriber.subscribe('alerts', (message) => {
  try {
    const alert = JSON.parse(message);
    
    console.log(`📢 Received alert for user ${alert.userId}:`, alert);
    // Publish to single ALERTS channel - filtering happens at GraphQL subscription level
    pubsub.publish('ALERTS', { alertReceived: alert });
  } catch (error) {
    console.error('Error processing Redis message:', error);
  }
});
```

**Key Changes:**
- Publishes to single `'ALERTS'` channel instead of `ALERT_${userId}`
- Removed user-specific channel creation
- Added comment explaining filtering happens at GraphQL layer

### 2. GraphQL Subscription Resolver (`src/resolvers/index.js`)

```javascript
import { withFilter } from 'graphql-subscriptions';

// ...

Subscription: {
  alertReceived: {
    subscribe: withFilter(
      () => {
        console.log('🔔 New subscription to ALERTS channel');
        return pubsub.asyncIterator(['ALERTS']);
      },
      (payload, variables) => {
        // Filter: only send alert if it matches the subscribed userId
        const match = payload.alertReceived.userId === variables.userId;
        if (match) {
          console.log(`✅ Alert matched for user ${variables.userId}`);
        }
        return match;
      }
    )
  }
}
```

**Key Changes:**
- Added `withFilter` import from `graphql-subscriptions`
- All subscriptions listen to single `'ALERTS'` channel
- Filter function compares `payload.alertReceived.userId` with `variables.userId`
- Only matching alerts are sent to the client

## How withFilter Works

`withFilter` is a higher-order function that wraps a subscription resolver:

1. **First Function (Subscribe)**: Returns the async iterator for the channel
   - Called once when a client subscribes
   - All clients subscribe to the same `'ALERTS'` channel

2. **Second Function (Filter)**: Determines if an event should be sent to a specific subscriber
   - Called for each published event
   - Receives `payload` (the published data) and `variables` (subscription arguments)
   - Returns `true` to send the event, `false` to skip it
   - Only executed for active subscriptions (no wasted processing)

## Testing

### Manual Testing with Apollo Studio

1. Start the server:
   ```bash
   npm run dev
   ```

2. Open Apollo Studio at `http://localhost:4000/graphql`

3. Subscribe to alerts for user "user123":
   ```graphql
   subscription {
     alertReceived(userId: "user123") {
       userId
       deviceId
       windowStartTime
       windowEndTime
       totalSteps
       alertTimestamp
       alertMessage
     }
   }
   ```

4. Publish a test alert to Redis:
   ```bash
   redis-cli PUBLISH alerts '{"userId":"user123","deviceId":"device1","windowStartTime":1234567890,"windowEndTime":1234567900,"totalSteps":5000,"alertTimestamp":1234567895,"alertMessage":"Low activity detected"}'
   ```

5. Verify that:
   - User "user123" receives the alert
   - Other users don't receive it (test with different userId in subscription)

### Expected Console Output

When a user subscribes:
```
🔔 New subscription to ALERTS channel
```

When an alert is published:
```
📢 Received alert for user user123: { userId: 'user123', ... }
✅ Alert matched for user user123
```

## Performance Considerations

### Memory Usage
- **Before**: O(n) channels where n = number of users
- **After**: O(1) single channel

### CPU Usage
- **Before**: Publishing happens for all users (even offline)
- **After**: Filtering only happens for active subscriptions

### Scalability
- Ready for horizontal scaling with distributed PubSub (e.g., `graphql-redis-subscriptions`)
- No changes needed to client code or GraphQL schema

## Future Enhancements

### 1. Distributed PubSub for Horizontal Scaling
```javascript
import { RedisPubSub } from 'graphql-redis-subscriptions';

export const pubsub = new RedisPubSub({
  connection: {
    host: REDIS_HOST,
    port: REDIS_PORT
  }
});
```

### 2. Additional Filtering Criteria
```javascript
withFilter(
  () => pubsub.asyncIterator(['ALERTS']),
  (payload, variables, context) => {
    // Filter by userId AND alert severity
    return payload.alertReceived.userId === variables.userId &&
           (!variables.minSeverity || payload.alertReceived.severity >= variables.minSeverity);
  }
)
```

### 3. Rate Limiting
```javascript
// Add rate limiting to prevent alert flooding
const userAlertCounts = new Map();

withFilter(
  () => pubsub.asyncIterator(['ALERTS']),
  (payload, variables) => {
    const userId = variables.userId;
    const count = userAlertCounts.get(userId) || 0;
    
    if (count >= MAX_ALERTS_PER_MINUTE) {
      return false;
    }
    
    userAlertCounts.set(userId, count + 1);
    setTimeout(() => userAlertCounts.delete(userId), 60000);
    
    return payload.alertReceived.userId === userId;
  }
)
```

## Migration Notes

- ✅ No breaking changes to GraphQL schema
- ✅ No changes required in client code
- ✅ Backward compatible with existing subscriptions
- ✅ No new dependencies required

## References

- [graphql-subscriptions Documentation](https://github.com/apollographql/graphql-subscriptions)
- [Apollo Server Subscriptions Guide](https://www.apollographql.com/docs/apollo-server/data/subscriptions/)
- [withFilter API Reference](https://github.com/apollographql/graphql-subscriptions#filters)