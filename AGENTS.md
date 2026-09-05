# Sapphire BFF API - Agent Documentation

## Overview
The Sapphire BFF (Backend-for-Frontend) API is a GraphQL API built with Apollo Server that serves as an aggregation and orchestration layer between the React frontend and multiple backend REST services. It provides a unified GraphQL interface with Keycloak JWT authentication and real-time capabilities.

## Purpose & Role in Landscape
This service acts as the **Backend-for-Frontend (BFF) pattern implementation** that:
- Provides a single GraphQL endpoint for the frontend to consume
- Aggregates data from multiple REST APIs into cohesive responses
- Validates Keycloak JWT tokens using JWKS (public key verification)
- Extracts user identity from JWT claims (no separate user service calls needed)
- Enables real-time health alerts via GraphQL subscriptions over WebSocket
- Optimizes data fetching with parallel requests and caching
- Transforms and shapes data to match frontend requirements

The BFF eliminates the need for the frontend to manage multiple REST endpoints, authentication tokens, and data aggregation logic.

## Integration Points
- **Upstream**: 
  - Sapphire React UI (port 5173) - GraphQL queries/mutations/subscriptions
  - Any GraphQL client with valid Keycloak JWT token
- **Downstream Services**:
  - Keycloak (port 8090) - JWKS endpoint for JWT validation
  - Health Metrics API (port 8089) - Current health metrics
  - Trends API (port 8089) - Historical trend data
  - Readings API (port 3004) - Blood pressure readings
  - Insights API (port 3005) - Health insights
  - Redis (port 6379) - Pub/Sub for real-time alerts
- **Observability**: OpenTelemetry Collector (port 4318) - Distributed tracing

## Boundary Conditions

### Authentication Requirements
- **JWT Token**: Required in Authorization header (`Bearer <token>`)
- **Token Validation**: RS256 algorithm with JWKS public key verification
- **Token Claims**: Must contain `email` or `preferred_username` for user identification
- **Issuer Validation**: Token `iss` claim must match configured `KEYCLOAK_ISSUER`
- **Token Expiration**: Handled by Keycloak; expired tokens rejected

### API Constraints
- **Single GraphQL Endpoint**: `/graphql` for queries, mutations, and subscriptions
- **WebSocket Protocol**: `ws://` for GraphQL subscriptions
- **CORS**: Must be configured for frontend origin
- **Request Size**: Limited by Express body parser (default 100kb)

### Data Aggregation Limits
- **Parallel Requests**: Uses Promise.all() for concurrent REST API calls
- **Timeout**: Individual REST API calls subject to datasource timeouts
- **Caching**: Apollo Server in-memory cache (no persistence)
- **Period Filters**: TODAY, WEEK, MONTH, YEAR for trend queries

### Real-time Capabilities
- **Redis Pub/Sub**: Subscribes to `alerts` channel
- **User-specific Subscriptions**: Filters alerts by userId
- **WebSocket Connections**: One per subscribed client
- **Alert Format**: Predefined schema for health alerts

### Error Handling
- **Authentication Errors**: Returns `UNAUTHENTICATED` code
- **REST API Failures**: Propagated to GraphQL errors
- **Invalid Queries**: GraphQL validation errors
- **Network Issues**: Timeout and connection errors

### Known Limitations
- **No Batch Operations**: Single user per request
- **No Offline Support**: Requires active connections
- **In-memory PubSub**: Alerts not persisted (Redis only for inter-service)
- **No Rate Limiting**: Should be added for production
- **JWKS Caching**: 24-hour cache (key rotation may cause brief issues)

## Tech Stack

### Core Framework
- **Node.js 20** - JavaScript runtime (LTS Alpine)
- **Express 4.18.2** - HTTP server framework
- **ES Modules** - Modern JavaScript module system

### GraphQL
- **@apollo/server 4.10.0** - GraphQL server implementation
- **graphql 16.8.1** - GraphQL query language
- **@graphql-tools/schema 10.0.2** - Schema composition utilities
- **graphql-tag 2.12.6** - GraphQL query parsing
- **graphql-scalars 1.25.0** - Custom scalar types

### Real-time & Subscriptions
- **graphql-ws 5.14.3** - GraphQL over WebSocket protocol
- **graphql-subscriptions 2.0.0** - PubSub implementation
- **graphql-redis-subscriptions 2.7.0** - Redis-backed PubSub
- **ws 8.16.0** - WebSocket server
- **redis 4.6.12** - Redis client for Pub/Sub

### Authentication & Security
- **jsonwebtoken 9.0.2** - JWT token handling
- **jwks-rsa 3.1.0** - JWKS (JSON Web Key Set) client for Keycloak
- **cors 2.8.5** - Cross-Origin Resource Sharing

### Data Sources
- **@apollo/datasource-rest 6.2.2** - REST API integration with caching

### Observability
- **@opentelemetry/sdk-node 0.211.0** - OpenTelemetry SDK
- **@opentelemetry/auto-instrumentations-node 0.69.0** - Auto-instrumentation
- **@opentelemetry/exporter-trace-otlp-http 0.211.0** - OTLP trace exporter
- **@opentelemetry/exporter-logs-otlp-http 0.211.0** - OTLP log exporter
- **@opentelemetry/exporter-metrics-otlp-http 0.211.0** - OTLP metrics exporter
- **@opentelemetry/api 1.9.0** - OpenTelemetry API
- **@opentelemetry/resources 2.5.0** - Resource attributes
- **@opentelemetry/semantic-conventions 1.39.0** - Standard conventions

### Analytics
- **@segment/analytics-node 2.3.0** - Segment analytics integration

### Development
- **nodemon 3.0.3** - Hot reload for development
- **dotenv 16.4.1** - Environment variable management

### Deployment
- **Docker** - Node 20 Alpine container
- **Port 4000** - HTTP/GraphQL endpoint
- **Health Check** - HTTP endpoint for container orchestration

## Architecture Pattern
- **Backend-for-Frontend (BFF)** - Dedicated API for frontend needs
- **GraphQL Gateway** - Single entry point for multiple REST services
- **Data Aggregation** - Combines multiple API responses
- **JWT Authentication** - Stateless token-based auth with JWKS
- **Real-time Subscriptions** - WebSocket-based push notifications
- **Distributed Tracing** - OpenTelemetry instrumentation across all layers
- **Pub/Sub Pattern** - Redis for inter-service messaging
- **REST DataSources** - Encapsulated REST API clients with caching