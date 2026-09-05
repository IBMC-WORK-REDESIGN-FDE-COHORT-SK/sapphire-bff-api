// Initialize OpenTelemetry FIRST (before any other imports)
import { initializeTracing } from './utils/tracing.js';
initializeTracing();

import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { makeExecutableSchema } from '@graphql-tools/schema';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { typeDefs } from './schema/typeDefs.js';
import { resolvers } from './resolvers/index.js';
import { HealthMetricsAPI } from './datasources/HealthMetricsAPI.js';
import { TrendsAPI } from './datasources/TrendsAPI.js';
import { ReadingsAPI } from './datasources/ReadingsAPI.js';
import { InsightsAPI } from './datasources/InsightsAPI.js';
import { PartnersAPI } from './datasources/PartnersAPI.js';
import { PartnerServicesAPI } from './datasources/PartnerServicesAPI.js';
import { PartnerOnboardingAPI } from './datasources/PartnerOnboardingAPI.js';
import { UsersAPI } from './datasources/UsersAPI.js';
import { verifyToken, extractTokenFromHeader } from './utils/auth.js';
import { initializeRedisSubscriber, pubsub } from './utils/redis.js';
import { initializeAnalytics } from './utils/analytics.js';
import { createClient } from 'redis';

// Load environment variables
dotenv.config();

// Initialize Segment analytics (server-side) – must be after dotenv.config()
initializeAnalytics();

const app = express();
const PORT = process.env.PORT || 4000;
const KEYCLOAK_JWKS_URL = process.env.KEYCLOAK_JWKS_URL;
const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER;
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

// Validate required environment variables
if (!KEYCLOAK_JWKS_URL) {
  throw new Error('KEYCLOAK_JWKS_URL environment variable is required');
}

if (!KEYCLOAK_ISSUER) {
  throw new Error('KEYCLOAK_ISSUER environment variable is required');
}

console.log('✅ Keycloak JWKS URL:', KEYCLOAK_JWKS_URL);
console.log('✅ Keycloak Issuer:', KEYCLOAK_ISSUER);

const schema = makeExecutableSchema({ typeDefs, resolvers });

const server = new ApolloServer({
  schema,
  introspection: true,
  csrfPrevention: false, // Disabled for development to allow SSE and other non-GraphQL endpoints
  plugins: [
    ApolloServerPluginLandingPageLocalDefault({
      embed: true,
      includeCookies: true
    })
  ],
});

function createDataSources() {
  return {
    healthMetricsAPI: new HealthMetricsAPI(),
    trendsAPI: new TrendsAPI(),
    readingsAPI: new ReadingsAPI(),
    insightsAPI: new InsightsAPI(),
    partnersAPI: new PartnersAPI(),
    partnerServicesAPI: new PartnerServicesAPI(),
    partnerOnboardingAPI: new PartnerOnboardingAPI(),
    usersAPI: new UsersAPI(),
  };
}

async function buildGraphQLContext(authHeader, { allowAnonymous = false } = {}) {
  const token = extractTokenFromHeader(authHeader);

  if (!token) {
    if (allowAnonymous) {
      return {
        user: null,
        dataSources: createDataSources(),
      };
    }

    throw new Error('Authentication required. Please provide a Bearer token.');
  }

  const { isValid, user, error } = await verifyToken(token, KEYCLOAK_JWKS_URL, KEYCLOAK_ISSUER);

  if (!isValid) {
    if (allowAnonymous) {
      console.warn(`[GraphQL WS] Ignoring invalid connection token: ${error}`);
      return {
        user: null,
        dataSources: createDataSources(),
      };
    }

    throw new Error(`Invalid token: ${error}`);
  }

  return {
    user,
    dataSources: createDataSources(),
  };
}

async function startServer() {
  await initializeRedisSubscriber();
  await server.start();

  const httpServer = createServer(app);

  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql'
  });

  useServer({
    schema,
    onConnect: (ctx) => {
      const hasAuthHeader = typeof ctx.connectionParams?.authorization === 'string' && ctx.connectionParams.authorization.length > 0;
      console.log(`[GraphQL WS] Connection init received. Auth header present: ${hasAuthHeader}`);
    },
    onSubscribe: (_ctx, message) => {
      console.log('[GraphQL WS] Subscription requested:', {
        operationName: message.payload.operationName || 'anonymous',
        hasVariables: Boolean(message.payload.variables),
      });
    },
    context: async (ctx) => {
      const authHeader = typeof ctx.connectionParams?.authorization === 'string'
        ? ctx.connectionParams.authorization
        : undefined;

      return buildGraphQLContext(authHeader, { allowAnonymous: true });
    },
    onError: (_ctx, message, errors) => {
      console.error('[GraphQL WS] Subscription error:', {
        operationName: message.payload.operationName || 'anonymous',
        errors: errors.map((error) => error.message),
      });
    },
  }, wsServer);
  console.log('✅ WebSocket server configured');

  // ============================================================================
  // SSE Endpoint for Recommendation Progress (MUST be before GraphQL middleware)
  // ============================================================================

  app.use(
    '/sse',
    cors({
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      credentials: true
    })
  );

  app.get('/sse/recommendation-progress/:userId', async (req, res) => {
    const { userId } = req.params;
    const { workflowId, token: queryToken } = req.query;
    
    console.log(`[SSE] ===== SSE ENDPOINT HIT =====`);
    console.log(`[SSE] Path: ${req.path}`);
    console.log(`[SSE] URL: ${req.url}`);
    console.log(`[SSE] Connection request from userId: ${userId}, workflowId: ${workflowId}`);
    
    // Verify authentication - accept token from header or query param (for EventSource compatibility)
    const token = extractTokenFromHeader(req.headers.authorization) || queryToken;
    if (!token) {
      console.error('[SSE] No token provided');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { isValid, user, error } = await verifyToken(token, KEYCLOAK_JWKS_URL, KEYCLOAK_ISSUER);
    
    if (!isValid) {
      console.error('[SSE] Invalid token:', error);
      return res.status(401).json({ error: `Invalid token: ${error}` });
    }
    
    // Verify user can only access their own progress
    if (user.email !== userId) {
      console.error('[SSE] User mismatch:', { authenticated: user.email, requested: userId });
      return res.status(403).json({ error: 'Forbidden: Cannot access other user\'s progress' });
    }
    
    if (!workflowId) {
      console.error('[SSE] workflowId is required');
      return res.status(400).json({ error: 'workflowId query parameter is required' });
    }
    
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();
    
    console.log(`[SSE] Client connected for userId: ${userId}, workflowId: ${workflowId}`);
    
    // Create Redis client for this connection
    const redisClient = createClient({
      socket: {
        host: REDIS_HOST,
        port: REDIS_PORT
      }
    });
    
    redisClient.on('error', (err) => {
      console.error('[SSE] Redis client error:', err);
    });
    
    try {
      await redisClient.connect();
      console.log(`[SSE] Redis client connected for userId: ${userId}`);
      
      // Redis Stream key for this workflow
      const streamKey = `recommendation-progress:${workflowId}`;
      
      // Send initial connection event
      res.write(`data: ${JSON.stringify({
        type: 'connected',
        userId,
        workflowId,
        timestamp: new Date().toISOString()
      })}\n\n`);
      
      const decodeRedisValue = (value) => {
        if (value == null) {
          return '';
        }

        if (typeof value === 'string') {
          return value;
        }

        if (Buffer.isBuffer(value)) {
          return value.toString('utf8');
        }

        if (value instanceof Uint8Array) {
          return Buffer.from(value).toString('utf8');
        }

        if (typeof value === 'object') {
          return JSON.stringify(value);
        }

        return String(value);
      };

      const parseEventPayload = (candidate) => {
        let parsed = candidate;

        for (let i = 0; i < 2; i++) {
          if (typeof parsed !== 'string') {
            break;
          }

          try {
            parsed = JSON.parse(parsed);
          } catch {
            break;
          }
        }

        if (
          parsed &&
          typeof parsed === 'object' &&
          typeof parsed.type === 'string' &&
          typeof parsed.workflowId === 'string' &&
          typeof parsed.userId === 'string'
        ) {
          return parsed;
        }

        return null;
      };

      const extractEventPayload = (message = {}) => {
        const preferredKeys = ['data', 'event', 'payload', 'message', '_raw'];
        const entries = Object.entries(message);
        const orderedValues = [
          ...preferredKeys.flatMap((key) =>
            entries
              .filter(([entryKey]) => entryKey === key)
              .map(([, value]) => value)
          ),
          ...entries
            .filter(([entryKey]) => !preferredKeys.includes(entryKey))
            .map(([, value]) => value)
        ];

        for (const rawValue of orderedValues) {
          const decoded = decodeRedisValue(rawValue).trim();
          if (!decoded) {
            continue;
          }

          const parsed = parseEventPayload(decoded);
          if (parsed) {
            return JSON.stringify(parsed);
          }
        }

        return null;
      };

      const sendStreamMessage = (msg, source) => {
        const payload = extractEventPayload(msg.message);
        if (!payload) {
          console.warn(`[SSE] Unable to extract ${source} stream payload from message:`, msg.message);
          return;
        }

        res.write(`data: ${payload}\n\n`);
      };

      let lastId = '0-0';

      try {
        const historicalMessages = await redisClient.xRead(
          { key: streamKey, id: '0-0' },
          { COUNT: 100 }
        );

        if (historicalMessages && historicalMessages.length > 0) {
          const streamMessages = historicalMessages[0].messages;
          console.log(`[SSE] Found ${streamMessages.length} historical messages`);

          for (const msg of streamMessages) {
            sendStreamMessage(msg, 'historical');
          }

          lastId = streamMessages[streamMessages.length - 1].id;
          console.log(`[SSE] Starting live stream from message ID: ${lastId}`);
        } else {
          console.log(`[SSE] No historical messages found in stream: ${streamKey}`);
        }
      } catch (readError) {
        console.error('[SSE] Error reading historical messages:', readError);
      }

      let isPolling = true;
      const pollStream = async () => {
        while (isPolling) {
          try {
            const newMessages = await redisClient.xRead(
              { key: streamKey, id: lastId },
              { BLOCK: 1000, COUNT: 50 }
            );

            if (!newMessages || newMessages.length === 0) {
              continue;
            }

            for (const msg of newMessages[0].messages) {
              lastId = msg.id;
              sendStreamMessage(msg, 'live');
            }
          } catch (pollError) {
            if (!isPolling) {
              break;
            }

            if (pollError.message !== 'Connection is closed.') {
              console.error('[SSE] Error polling for new messages:', pollError);
            }
          }
        }
      };

      pollStream().catch((error) => {
        if (isPolling) {
          console.error('[SSE] Polling loop crashed:', error);
        }
      });

      console.log(`[SSE] Started polling Redis Stream: ${streamKey} from ID: ${lastId}`);
      
      // Send keepalive every 30 seconds
      const keepaliveInterval = setInterval(() => {
        res.write(':keepalive\n\n');
      }, 30000);
      
      // Cleanup on client disconnect
      req.on('close', async () => {
        console.log(`[SSE] Client disconnected for userId: ${userId}`);
        isPolling = false;
        clearInterval(keepaliveInterval);
        await redisClient.quit();
      });
      
    } catch (error) {
      console.error('[SSE] Error setting up SSE connection:', error);
      res.status(500).json({ error: 'Failed to establish SSE connection' });
    }
  });

  console.log('✅ SSE endpoint configured at /sse/recommendation-progress/:userId');

  // ============================================================================
  // GraphQL Endpoint
  // ============================================================================

  const graphqlMiddleware = expressMiddleware(server, {
    context: async ({ req }) => {
      console.log(`[GraphQL] Context creation for path: ${req.path}, URL: ${req.url}`);

      return buildGraphQLContext(req.headers.authorization);
    },
  });

  // CORS configuration for GraphQL
  const corsOptions = {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
  };

  // Apply GraphQL middleware only to /graphql endpoint (POST, GET, and OPTIONS for CORS preflight)
  app.options('/graphql', cors(corsOptions)); // Handle preflight
  
  app.post(
    '/graphql',
    cors(corsOptions),
    express.json({ limit: '50mb' }),
    graphqlMiddleware
  );

  app.get(
    '/graphql',
    cors(corsOptions),
    express.json({ limit: '50mb' }),
    graphqlMiddleware
  );

  httpServer.listen(PORT, () => {
    console.log(`🚀 Server ready at http://localhost:${PORT}/graphql`);
    console.log(`🔌 WebSocket ready at ws://localhost:${PORT}/graphql`);
    console.log(`📝 Use Apollo Studio at http://localhost:${PORT}/graphql`);
  });
}

startServer();

// ============================================================================
// Graceful Shutdown
// ============================================================================

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing connections...');
  await pubsub.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing connections...');
  await pubsub.close();
  process.exit(0);
});

// Made with Bob
