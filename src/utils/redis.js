import { RedisPubSub } from 'graphql-redis-subscriptions';
import { createClient } from 'redis';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

const redisSocketConfig = {
  socket: {
    host: REDIS_HOST,
    port: REDIS_PORT
  },
  password: REDIS_PASSWORD
};

// Let graphql-redis-subscriptions create ioredis clients with the interface it expects.
export const pubsub = new RedisPubSub({
  connection: {
    host: REDIS_HOST,
    port: Number(REDIS_PORT),
    password: REDIS_PASSWORD
  },
  connectionListener: (err) => {
    if (err) {
      console.error('Redis GraphQL PubSub Error', err);
    }
  }
});

export async function initializeRedisSubscriber() {
  // Create separate client for external alert subscription
  const alertSubscriber = createClient(redisSocketConfig);

  alertSubscriber.on('error', (err) => console.error('Redis Alert Subscriber Error', err));
  await alertSubscriber.connect();
  console.log('✅ Connected to Redis for external alerts');

  // Subscribe to alerts channel from external source
  await alertSubscriber.subscribe('alerts', async (message) => {
    try {
      const alert = JSON.parse(message);
      console.log(`📢 Received alert for user ${alert.userId}:`, alert);
      
      // Publish to distributed Redis-based pubsub
      await pubsub.publish('ALERTS', { alertReceived: alert });
    } catch (error) {
      console.error('Error processing Redis message:', error);
    }
  });

  console.log('✅ Subscribed to Redis channel: alerts');
}

// Made with Bob
