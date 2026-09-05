# Health Dashboard GraphQL API Design

## Overview
This design document outlines the GraphQL API architecture for the WellnessHub Health Dashboard using Apollo Server with REST API data sources.

## UI Components Analysis

Based on the screenshot, the dashboard contains:

1. **User Greeting Section**
   - User name
   - Date/time context

2. **Health Metrics Cards** (4 cards)
   - Heart Rate: 56 BPM (with status indicator)
   - Steps: 9,692 steps (with goal percentage)
   - Blood Pressure: 123/77 (with range status)
   - Sleep: 8.2h (with goal comparison)

3. **Heart Rate Trends Chart**
   - Time-series data with date/time points
   - Filter by period (Today, Week, etc.)

4. **Activity Summary Chart**
   - Bar chart showing daily activity
   - Weekly view with day labels

5. **Blood Pressure History Chart**
   - Dual-line chart (Systolic/Diastolic)
   - Time-series data

6. **Recent Blood Pressure Readings Table**
   - Date, Systolic, Diastolic, Status

7. **Health Insights Section**
   - Activity Goal insight
   - Blood Pressure insight

## GraphQL Schema Design

### Types

```graphql
type Query {
  dashboard(userId: ID!): Dashboard!
  heartRateTrends(userId: ID!, period: Period!): [HeartRateData!]!
  activitySummary(userId: ID!, period: Period!): [ActivityData!]!
  bloodPressureHistory(userId: ID!, period: Period!): BloodPressureHistory!
  recentBloodPressureReadings(userId: ID!, limit: Int): [BloodPressureReading!]!
  healthInsights(userId: ID!): [HealthInsight!]!
}

type Dashboard {
  user: User!
  healthMetrics: HealthMetrics!
  heartRateTrends: [HeartRateData!]!
  activitySummary: [ActivityData!]!
  bloodPressureHistory: BloodPressureHistory!
  recentReadings: [BloodPressureReading!]!
  insights: [HealthInsight!]!
}

type User {
  id: ID!
  name: String!
  greeting: String!
}

type HealthMetrics {
  heartRate: HeartRateMetric!
  steps: StepsMetric!
  bloodPressure: BloodPressureMetric!
  sleep: SleepMetric!
}

type HeartRateMetric {
  value: Int!
  unit: String!
  status: String!
  statusMessage: String!
}

type StepsMetric {
  value: Int!
  goal: Int!
  percentageOfGoal: Int!
  statusMessage: String!
}

type BloodPressureMetric {
  systolic: Int!
  diastolic: Int!
  status: String!
  statusMessage: String!
}

type SleepMetric {
  hours: Float!
  goal: Float!
  status: String!
  statusMessage: String!
}

type HeartRateData {
  timestamp: String!
  value: Int!
}

type ActivityData {
  date: String!
  day: String!
  steps: Int!
}

type BloodPressureHistory {
  systolic: [DataPoint!]!
  diastolic: [DataPoint!]!
}

type DataPoint {
  timestamp: String!
  value: Int!
}

type BloodPressureReading {
  date: String!
  systolic: Int!
  diastolic: Int!
  status: String!
}

type HealthInsight {
  id: ID!
  type: InsightType!
  title: String!
  message: String!
  icon: String!
}

enum Period {
  TODAY
  WEEK
  MONTH
  YEAR
}

enum InsightType {
  ACTIVITY_GOAL
  BLOOD_PRESSURE
  HEART_RATE
  SLEEP
}
```

## REST API Endpoints (Data Sources)

The GraphQL resolvers will call these REST API endpoints:

1. **User Service**
   - `GET /api/users/{userId}` - Get user information

2. **Health Metrics Service**
   - `GET /api/health-metrics/{userId}/heart-rate` - Current heart rate
   - `GET /api/health-metrics/{userId}/steps` - Current steps
   - `GET /api/health-metrics/{userId}/blood-pressure` - Current blood pressure
   - `GET /api/health-metrics/{userId}/sleep` - Current sleep data

3. **Trends Service**
   - `GET /api/trends/{userId}/heart-rate?period={period}` - Heart rate trends
   - `GET /api/trends/{userId}/activity?period={period}` - Activity summary
   - `GET /api/trends/{userId}/blood-pressure?period={period}` - Blood pressure history

4. **Readings Service**
   - `GET /api/readings/{userId}/blood-pressure?limit={limit}` - Recent readings

5. **Insights Service**
   - `GET /api/insights/{userId}` - Health insights

## Project Structure

```
sapphire-bff-api/
├── src/
│   ├── index.ts                 # Apollo Server setup
│   ├── schema/
│   │   └── typeDefs.ts          # GraphQL type definitions
│   ├── resolvers/
│   │   ├── index.ts             # Resolver aggregator
│   │   ├── dashboardResolver.ts # Dashboard queries
│   │   ├── healthMetricsResolver.ts
│   │   ├── trendsResolver.ts
│   │   └── insightsResolver.ts
│   ├── datasources/
│   │   ├── UserAPI.ts           # User REST API
│   │   ├── HealthMetricsAPI.ts  # Health metrics REST API
│   │   ├── TrendsAPI.ts         # Trends REST API
│   │   ├── ReadingsAPI.ts       # Readings REST API
│   │   └── InsightsAPI.ts       # Insights REST API
│   ├── types/
│   │   └── index.ts             # TypeScript interfaces
│   └── utils/
│       └── helpers.ts           # Helper functions
├── package.json
├── tsconfig.json
└── .env
```

## Implementation Notes

1. **Apollo Server**: Use `@apollo/server` v4 with Express integration
2. **Data Sources**: Use `RESTDataSource` from `@apollo/datasource-rest`
3. **Type Safety**: Full TypeScript support with generated types
4. **Caching**: Leverage Apollo's built-in caching for REST responses
5. **Error Handling**: Proper error handling and logging
6. **Environment Variables**: REST API base URLs in `.env`

## Benefits of This Design

1. **Single Query**: Frontend can fetch all dashboard data in one GraphQL query
2. **Flexible**: Can query specific sections independently
3. **Type-Safe**: Strong typing with GraphQL and TypeScript
4. **Cacheable**: Apollo caching reduces REST API calls
5. **Maintainable**: Clear separation of concerns
6. **Scalable**: Easy to add new metrics or data sources