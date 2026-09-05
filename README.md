# Sapphire BFF API - Health Dashboard GraphQL API

A GraphQL Backend-for-Frontend (BFF) API for the WellnessHub Health Dashboard, built with Apollo Server and JavaScript. This API uses Keycloak JWT authentication to identify users and aggregates data from multiple REST APIs.

## Features

- **Keycloak JWT Authentication** - User identification via Bearer token
- **GraphQL API** with Apollo Server v4
- **GraphQL Subscriptions** - Real-time alerts via WebSocket
- **REST Data Sources** for backend integration
- **OpenTelemetry Instrumentation** - Distributed tracing and observability
- **Redis Pub/Sub** - Real-time alert notifications
- **JavaScript ES Modules** for modern development
- **Single Query Dashboard** - Fetch all dashboard data in one request
- **Flexible Queries** - Query specific sections independently
- **Built-in Caching** - Apollo's caching reduces REST API calls
- **Clean Code** - No unnecessary code, only what's needed

## Architecture

The API serves as a BFF layer that:
1. Validates Keycloak JWT tokens using JWKS (public key verification)
2. Extracts user information (email, name) from the token
3. Exposes a GraphQL schema for the frontend
4. Aggregates data from multiple REST APIs using the authenticated user's ID
5. Provides optimized data fetching with parallel requests
6. Handles data transformation and caching

## Authentication Flow

1. Frontend sends GraphQL request with `Authorization: Bearer <KEYCLOAK_JWT_TOKEN>` header
2. BFF validates the JWT token using Keycloak's public keys (JWKS)
3. User information is extracted from token claims (email, name, preferred_username)
4. User information is added to GraphQL context
5. Resolvers use the authenticated user's ID to fetch data from REST APIs
6. No separate user API call needed - user info comes from JWT

## Project Structure

```
sapphire-bff-api/
├── src/
│   ├── index.js                      # Apollo Server setup with Keycloak JWT auth
│   ├── schema/
│   │   └── typeDefs.js               # GraphQL type definitions (queries, subscriptions)
│   ├── resolvers/
│   │   └── index.js                  # GraphQL resolvers (queries, subscriptions)
│   ├── datasources/
│   │   ├── HealthMetricsAPI.js       # Health metrics REST API client (with OTEL)
│   │   ├── TrendsAPI.js              # Trends REST API client (with OTEL)
│   │   ├── ReadingsAPI.js            # Readings REST API client (with OTEL)
│   │   └── InsightsAPI.js            # Insights REST API client (with OTEL)
│   └── utils/
│       ├── auth.js                   # Keycloak JWT validation with JWKS
│       ├── redis.js                  # Redis Pub/Sub for real-time alerts
│       └── tracing.js                # OpenTelemetry configuration
├── package.json
├── .env.example
└── README.md
```

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```
   PORT=4000
   
   # Keycloak
   KEYCLOAK_JWKS_URL=http://keycloak:8080/realms/sapphire-ui/protocol/openid-connect/certs
   KEYCLOAK_ISSUER=http://localhost:8090/realms/sapphire-ui
   
   # REST APIs
   HEALTH_METRICS_API_URL=http://localhost:8089/api/v1
   TRENDS_API_URL=http://localhost:8089/api/v1
   READINGS_API_URL=http://localhost:3004/api
   INSIGHTS_API_URL=http://localhost:3005/api
   
   # Redis
   REDIS_HOST=localhost
   REDIS_PORT=6379
   
   # OpenTelemetry
   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
   OTEL_SERVICE_NAME=sapphire-bff-api
   OTEL_SERVICE_VERSION=1.0.0
   OTEL_LOG_LEVEL=info
   ```

   **Important Notes:**
   - `KEYCLOAK_JWKS_URL` - URL to fetch Keycloak's public keys (JWKS endpoint)
   - `KEYCLOAK_ISSUER` - The issuer claim in your JWT tokens (must match exactly)
   - `REDIS_HOST` and `REDIS_PORT` - Redis server for real-time alerts
   - `OTEL_EXPORTER_OTLP_ENDPOINT` - OpenTelemetry collector endpoint (OTLP/HTTP)
   - Use the appropriate hostname for your environment (localhost, keycloak, etc.)

3. **Run in development mode:**
   ```bash
   npm run dev
   ```

4. **Run in production:**
   ```bash
   npm start
   ```

## Keycloak Configuration

### JWKS URL
The API fetches Keycloak's public keys from the JWKS endpoint:
```
{KEYCLOAK_HOST}/realms/{REALM_NAME}/protocol/openid-connect/certs
```

Example:
```
http://keycloak:8080/realms/sapphire-ui/protocol/openid-connect/certs
```

### Issuer
The issuer must match the `iss` claim in your JWT tokens. This is typically:
```
http://localhost:8090/realms/sapphire-ui
```

**Note:** The JWKS URL and Issuer may use different hostnames depending on your setup:
- JWKS URL: Internal hostname (e.g., `keycloak:8080` in Docker)
- Issuer: External hostname (e.g., `localhost:8090` for browser access)

### Token Claims Used

The API extracts the following claims from the Keycloak JWT:
- `email` - Used as the primary user ID
- `preferred_username` - Fallback if email is not present
- `name` or `given_name` - User's display name
- `sub` - Subject identifier (fallback for user ID)

## GraphQL API

The server will be available at `http://localhost:4000/graphql`

### Authentication

All requests must include a Keycloak JWT Bearer token in the Authorization header:

```
Authorization: Bearer <keycloak-jwt-token>
```

### Example Query - Complete Dashboard

Fetch all dashboard data in a single request (no userId parameter needed):

```graphql
query GetDashboard {
  dashboard {
    user {
      id
      name
      email
      greeting
    }
    healthMetrics {
      heartRate {
        value
        unit
        status
        statusMessage
      }
      steps {
        value
        goal
        percentageOfGoal
        statusMessage
      }
      bloodPressure {
        systolic
        diastolic
        status
        statusMessage
      }
      sleep {
        hours
        goal
        status
        statusMessage
      }
    }
    heartRateTrends {
      timestamp
      value
    }
    activitySummary {
      date
      day
      steps
    }
    bloodPressureHistory {
      systolic {
        timestamp
        value
      }
      diastolic {
        timestamp
        value
      }
    }
    recentReadings {
      date
      systolic
      diastolic
      status
    }
    insights {
      id
      type
      title
      message
      icon
    }
  }
}
```

**HTTP Headers:**
```
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJ...
```

### Example Query - Heart Rate Trends

Query specific data with period filter:

```graphql
query GetHeartRateTrends($period: Period!) {
  heartRateTrends(period: $period) {
    timestamp
    value
  }
}
```

**Variables:**
```json
{
  "period": "WEEK"
}
```

**HTTP Headers:**
```
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJ...
```

### Available Periods

- `TODAY` - Today's data
- `WEEK` - Last 7 days
- `MONTH` - Last 30 days
- `YEAR` - Last 12 months

### Example Subscription - Real-time Alerts

Subscribe to real-time health alerts:

```graphql
subscription OnAlertReceived($userId: ID!) {
  alertReceived(userId: $userId) {
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

**Variables:**
```json
{
  "userId": "user@example.com"
}
```

**HTTP Headers:**
```
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJ...
```

**Note:** Subscriptions use WebSocket protocol at `ws://localhost:4000/graphql`

## REST API Integration

The GraphQL resolvers call these REST endpoints using the authenticated user's ID:

### Health Metrics Service
- `GET /api/health-metrics/{userId}/heart-rate` - Current heart rate
- `GET /api/health-metrics/{userId}/steps` - Current steps
- `GET /api/health-metrics/{userId}/blood-pressure` - Current blood pressure
- `GET /api/health-metrics/{userId}/sleep` - Current sleep data

### Trends Service
- `GET /api/trends/{userId}/heart-rate?period={period}` - Heart rate trends
- `GET /api/trends/{userId}/activity?period={period}` - Activity summary
- `GET /api/trends/{userId}/blood-pressure?period={period}` - Blood pressure history

### Readings Service
- `GET /api/readings/{userId}/blood-pressure?limit={limit}` - Recent blood pressure readings

### Insights Service
- `GET /api/insights/{userId}` - Health insights

**Note:** `userId` is automatically extracted from the Keycloak JWT token (email field)

## Dashboard Components

Based on the UI screenshot, the API provides data for:

1. **User Greeting** - Personalized greeting from Keycloak token (name)
2. **Health Metrics Cards:**
   - Heart Rate (BPM with status)
   - Steps (with goal percentage)
   - Blood Pressure (systolic/diastolic with status)
   - Sleep (hours with goal comparison)
3. **Heart Rate Trends Chart** - Time-series data
4. **Activity Summary Chart** - Daily activity bars
5. **Blood Pressure History Chart** - Dual-line chart
6. **Recent Readings Table** - Latest blood pressure readings
7. **Health Insights** - Personalized health recommendations

## Frontend Integration

### Example: React with Apollo Client

```javascript
import { ApolloClient, InMemoryCache, createHttpLink } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';

// Get Keycloak token from your auth system
const token = keycloak.token; // or from localStorage/sessionStorage

const httpLink = createHttpLink({
  uri: 'http://localhost:4000/graphql',
});

const authLink = setContext((_, { headers }) => {
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : "",
    }
  }
});

const client = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache()
});

// Use in your component
import { useQuery, gql } from '@apollo/client';

const GET_DASHBOARD = gql`
  query GetDashboard {
    dashboard {
      user {
        name
        email
      }
      healthMetrics {
        heartRate { value unit status }
        steps { value goal percentageOfGoal }
      }
      # ... rest of the query
    }
  }
`;

function Dashboard() {
  const { loading, error, data } = useQuery(GET_DASHBOARD);
  
  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;
  
  return <div>{/* Render dashboard with data */}</div>;
}
```

## OpenTelemetry Observability

The API is instrumented with OpenTelemetry for distributed tracing and observability.

### Features

- **Automatic Instrumentation** - HTTP, Express, GraphQL, Redis
- **Custom Spans** - All datasource methods are traced
- **Span Attributes** - User IDs, metric types, response counts
- **Error Tracking** - Exceptions recorded in spans
- **OTLP Export** - Traces exported via OTLP/HTTP protocol

### Configuration

Configure OpenTelemetry via environment variables:

```bash
# OTLP Collector endpoint (default: http://localhost:4318/v1/traces)
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces

# Service identification
OTEL_SERVICE_NAME=sapphire-bff-api
OTEL_SERVICE_VERSION=1.0.0

# Debug logging (optional)
OTEL_LOG_LEVEL=debug
```

### Viewing Traces

Traces can be viewed in any OpenTelemetry-compatible backend:
- **Jaeger** - `http://localhost:16686`
- **Zipkin** - `http://localhost:9411`
- **Grafana Tempo** - Via Grafana UI
- **Cloud providers** - AWS X-Ray, Google Cloud Trace, Azure Monitor

### Example Trace Hierarchy

```
HTTP POST /graphql
├── GraphQL Operation: GetDashboard
│   ├── Dashboard.healthMetrics
│   │   └── HealthMetricsAPI.getSleep
│   │       └── HTTP POST /charts/query
│   ├── Dashboard.heartRateTrends
│   │   ├── TrendsAPI.getHeartRateTrends
│   │   │   └── TrendsAPI.queryChart
│   │   │       └── HTTP POST /charts/query
│   └── Dashboard.insights
│       └── InsightsAPI.getHealthInsights
│           └── HTTP GET /insights/{userId}
```

## Real-time Alerts

The API supports real-time health alerts via GraphQL subscriptions and Redis Pub/Sub.

### Architecture

1. External services publish alerts to Redis channel `alerts`
2. BFF subscribes to Redis and receives alerts
3. BFF publishes to user-specific GraphQL PubSub channels
4. Frontend clients receive alerts via WebSocket subscriptions

### Alert Flow

```
Health Device/Service
        ↓
   Redis 'alerts' channel
        ↓
   BFF Redis Subscriber
        ↓
   GraphQL PubSub (in-memory)
        ↓
   WebSocket to Frontend
```

### Redis Configuration

```bash
REDIS_HOST=localhost
REDIS_PORT=6379
```

## Benefits

1. **Secure** - Keycloak JWT-based authentication with public key verification
2. **Single Request** - Frontend fetches all dashboard data in one GraphQL query
3. **Real-time Updates** - WebSocket subscriptions for instant alerts
4. **Reduced Latency** - Parallel REST API calls using Promise.all()
5. **Observable** - Full distributed tracing with OpenTelemetry
6. **No User API** - User info extracted from Keycloak JWT token
7. **Type Safety** - GraphQL schema validation
8. **Flexible** - Query only the data you need
9. **Cacheable** - Built-in Apollo caching reduces backend load
10. **Maintainable** - Clean separation of concerns
11. **No Extra Code** - Minimal, focused implementation
12. **JWKS Support** - Automatic public key rotation handling

## Error Handling

The API returns appropriate errors for:
- Missing Authorization header
- Invalid JWT token
- Expired JWT token
- Invalid signature
- REST API failures

Example error response:
```json
{
  "errors": [
    {
      "message": "Authentication required. Please provide a Bearer token.",
      "extensions": {
        "code": "UNAUTHENTICATED"
      }
    }
  ]
}
```

## Security Features

1. **RS256 Algorithm** - Asymmetric key verification
2. **JWKS Integration** - Automatic public key fetching from Keycloak
3. **Token Caching** - JWKS keys cached for 24 hours
4. **Issuer Validation** - Verifies token is from correct Keycloak realm
5. **No Secret Storage** - Uses public keys only

## Development

- **Hot Reload:** Enabled with nodemon in development mode
- **ES Modules:** Modern JavaScript with import/export
- **Environment Variables:** Configured via .env file
- **Keycloak Integration:** Automatic JWT validation with JWKS

## Troubleshooting

### "Invalid JWKS URI: The provided URI is not a valid URL"
- Ensure `KEYCLOAK_JWKS_URL` is a complete, valid URL in `.env`
- Check that the URL is accessible from your server
- Example: `http://keycloak:8080/realms/sapphire-ui/protocol/openid-connect/certs`

### "Invalid token: secret or public key must be provided"
- Verify `KEYCLOAK_JWKS_URL` is correctly set in `.env`
- Ensure Keycloak is running and accessible
- Check that the realm name is correct

### "Unable to reach server"
- Ensure the server is running (`npm run dev`)
- Check that the port is not in use
- Verify Keycloak JWKS URL is accessible

### Token Validation Fails
- Ensure you're using a valid Keycloak token
- Check token hasn't expired
- Verify the token is from the correct realm
- Ensure `KEYCLOAK_ISSUER` matches the `iss` claim in your token

### Hostname Issues
If you're running in Docker or different environments:
- `KEYCLOAK_JWKS_URL` should use the internal hostname (e.g., `keycloak:8080`)
- `KEYCLOAK_ISSUER` should match the `iss` claim in your JWT (often uses external hostname like `localhost:8090`)

## License

ISC