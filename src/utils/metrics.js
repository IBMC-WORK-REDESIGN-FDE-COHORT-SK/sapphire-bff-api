import { metrics } from '@opentelemetry/api';

// Get the meter provider
const meter = metrics.getMeter('sapphire-bff-api', '1.0.0');

/**
 * Custom metrics for the application
 */

// Counter: Total GraphQL requests
export const graphqlRequestsCounter = meter.createCounter('graphql.requests.total', {
  description: 'Total number of GraphQL requests',
  unit: '1',
});

// Counter: GraphQL errors
export const graphqlErrorsCounter = meter.createCounter('graphql.errors.total', {
  description: 'Total number of GraphQL errors',
  unit: '1',
});

// Histogram: GraphQL request duration
export const graphqlRequestDuration = meter.createHistogram('graphql.request.duration', {
  description: 'Duration of GraphQL requests',
  unit: 'ms',
});

// Counter: Partner API calls
export const partnerApiCallsCounter = meter.createCounter('partner.api.calls.total', {
  description: 'Total number of partner API calls',
  unit: '1',
});

// Counter: Partner service API calls
export const partnerServiceApiCallsCounter = meter.createCounter('partner_service.api.calls.total', {
  description: 'Total number of partner service API calls',
  unit: '1',
});

// Histogram: External API call duration
export const externalApiDuration = meter.createHistogram('external.api.duration', {
  description: 'Duration of external API calls',
  unit: 'ms',
});

// UpDownCounter: Active WebSocket connections
export const activeWebSocketConnections = meter.createUpDownCounter('websocket.connections.active', {
  description: 'Number of active WebSocket connections',
  unit: '1',
});

// Counter: Redis operations
export const redisOperationsCounter = meter.createCounter('redis.operations.total', {
  description: 'Total number of Redis operations',
  unit: '1',
});

/**
 * Helper function to record API call metrics
 * @param {string} apiName - Name of the API
 * @param {number} duration - Duration in milliseconds
 * @param {string} status - Status (success/error)
 */
export function recordApiCall(apiName, duration, status = 'success') {
  externalApiDuration.record(duration, {
    api: apiName,
    status,
  });

  if (apiName.includes('partner-service')) {
    partnerServiceApiCallsCounter.add(1, { status });
  } else if (apiName.includes('partner')) {
    partnerApiCallsCounter.add(1, { status });
  }
}

/**
 * Helper function to record GraphQL request metrics
 * @param {string} operationType - Query/Mutation/Subscription
 * @param {string} operationName - Name of the operation
 * @param {number} duration - Duration in milliseconds
 * @param {boolean} hasError - Whether the request had an error
 */
export function recordGraphQLRequest(operationType, operationName, duration, hasError = false) {
  graphqlRequestsCounter.add(1, {
    operation_type: operationType,
    operation_name: operationName,
  });

  graphqlRequestDuration.record(duration, {
    operation_type: operationType,
    operation_name: operationName,
  });

  if (hasError) {
    graphqlErrorsCounter.add(1, {
      operation_type: operationType,
      operation_name: operationName,
    });
  }
}

// Made with Bob