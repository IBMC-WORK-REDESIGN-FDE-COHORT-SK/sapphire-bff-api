import gql from 'graphql-tag';

export const typeDefs = gql`
  type Query {
    dashboard: Dashboard!
    partners(searchQuery: String, type: String, location: String): [Partner!]!
    partnerServices(searchQuery: String, category: String, availability: String): [PartnerService!]!
    fetchUser(email: String!): UserProfile!
    getPartnerReview(partnerId: ID!): PartnerReview!
    getServiceReview(serviceId: ID!): ServiceReview!
    latestWellnessSummary(email: String!): WellnessSummary!
    userSubscriptions(email: String!): [UserSubscriptionSummary!]!
    userAlerts(userEmail: String!): [UserAlert!]!
    userPartnerServices(email: String!): [UserPartnerService!]!
    userRecommendations(userEmail: String!): [UserRecommendation!]!
    """
    Hybrid partner service search combining keyword and semantic matching.
    Requires a valid Keycloak-issued JWT (RS256) in the Authorization header.
    At least one of query or semanticQuery must be non-empty.
    """
    findPartners(query: PartnerSearchInput!): HybridSearchResult!
  }

  """
  Input for the hybrid partner service search.
  At least one of query or semanticQuery must be a non-empty string.
  Validated in the BFF resolver before the downstream REST call is made.
  """
  input PartnerSearchInput {
    "Keyword search text. Matched against service name, description, and attributes."
    query: String
    "Semantic (natural-language) search text. Used for vector-based similarity matching."
    semanticQuery: String
    "0-based page index. Defaults to 0."
    page: Int = 0
    "Number of results per page. Maximum enforced at 100 by the backend. Defaults to 20."
    pageSize: Int = 20
  }

  """
  Combined result of a hybrid partner service search.
  Contains two independent result arrays — keyword matches and semantic matches.
  """
  type HybridSearchResult {
    "Partner services matched by keyword/text search. Empty array if none."
    keywordResults: [PartnerServiceItem!]!
    "Partner services matched by semantic (vector) similarity. Empty array if none."
    semanticResults: [PartnerServiceItem!]!
    "Total number of keyword-matched results available across all pages."
    totalKeywordResults: Int!
    "Total number of semantically-matched results available across all pages."
    totalSemanticResults: Int!
  }

  """
  A single wellness partner service item returned in search results.
  Appears in both keywordResults and semanticResults arrays.
  """
  type PartnerServiceItem {
    "Unique identifier for the partner service."
    id: ID!
    "Display name of the partner service."
    name: String!
    "Full description of the service offering."
    description: String!
    "Service category (e.g., Mental Health, Fitness, Nutrition)."
    category: String!
    "Name of the partner organisation providing this service."
    partnerName: String!
  }

  type Mutation {
    onboardPartner(input: OnboardPartnerInput!): Partner!
    onboardPartnerService(input: OnboardPartnerServiceInput!): PartnerService!
    executeReviewAction(webhookURL: String!, userId: String!, notes: String): ReviewActionResult!
    upgradeUserToPremium(email: String!): UserProfile!
    subscribeToService(email: String!, serviceId: ID!, endDate: String!): UserSubscription!
    unsubscribeFromService(email: String!, serviceId: ID!): UnsubscribeResult!
    generateRecommendation(userId: String!): GenerateRecommendationResult!
    trackAnalyticsEvent(userId: String!, event: String!, properties: JSON): AnalyticsResult!
    identifyAnalyticsUser(userId: String!, traits: JSON): AnalyticsResult!
    trackAnalyticsPage(userId: String!, name: String, properties: JSON): AnalyticsResult!
  }

  input OnboardPartnerInput {
    partnerCode: String!
    name: String!
    partnerType: String!
    country: String!
    city: String!
    state: String!
    postalCode: String!
  }

  input OnboardPartnerServiceInput {
    partnerId: ID!
    serviceCode: String!
    name: String!
    category: String!
    serviceType: String!
    description: String!
    pricingModel: String!
    currency: String!
    amount: Float!
    billingCycle: String
    tags: [String!]
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
    email: String!
    greeting: String!
  }

  type HealthMetrics {
    heartRate: HeartRateMetric
    steps: StepsMetric
    bloodPressure: BloodPressureMetric
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

  type Partner {
    id: ID!
    name: String!
    type: String!
    city: String!
    state: String!
    country: String!
    postalCode: String!
    description: String
    status: String!
  }

  type PartnerService {
    id: ID!
    name: String!
    description: String!
    partner: Partner!
    category: String!
    serviceType: String!
    price: Float!
    currency: String!
    billingCycle: String
    status: String!
  }

  type UserProfile {
    name: String!
    email: String!
    address: Address!
    userTier: String!
    physicalAttributes: PhysicalAttributes!
  }

  type Address {
    city: String!
    state: String!
    country: String!
    zip: String!
  }

  type PhysicalAttributes {
    gender: String!
    heightCm: Int!
    weightKg: Int!
  }

  type WellnessSummary {
    id: ID!
    userId: ID!
    profileSummary: String!
    dataSummary: String!
    createdAt: String!
    updatedAt: String!
  }

  type UserSubscription {
    id: ID!
    userId: ID!
    partnerServiceId: ID!
    associationContext: AssociationContext!
    isActive: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  type UserSubscriptionSummary {
    partnerServiceId: ID!
    isActive: Boolean!
  }

  type UserPartnerService {
    subscription: UserSubscription!
    service: PartnerService!
  }

  type AssociationContext {
    endDate: String!
  }

  type UnsubscribeResult {
    success: Boolean!
    message: String
  }

  type PartnerReview {
    partnerId: ID!
    review: [ReviewAction!]!
  }

  type ServiceReview {
    serviceId: ID!
    review: [ReviewAction!]!
  }

  type ReviewAction {
    type: String!
    webhookURL: String!
    buttonName: String!
  }

  type ReviewActionResult {
    success: Boolean!
    message: String
  }

  type GenerateRecommendationResult {
    success: Boolean!
    message: String!
    workflowId: String
  }

  type AnalyticsResult {
    success: Boolean!
    message: String
  }

  scalar JSON

  type UserAlert {
    id: ID!
    userId: ID!
    metricName: String!
    metricType: String!
    alertMessage: String!
    labels: AlertLabels
    metadata: AlertMetadata
    annotations: String
    links: String
    tags: String
    createdAt: String!
  }

  type AlertLabels {
    category: String
    severity: String
  }

  type AlertMetadata {
    deviceId: String
    alertTimestamp: Float
  }

  type Alert {
    userId: String!
    deviceId: String
    windowStartTime: Float!
    windowEndTime: Float!
    totalSteps: Int!
    alertTimestamp: Float!
    alertMessage: String!
  }

  type UserRecommendation {
    id: ID!
    createdAt: String!
    updatedAt: String!
    metadata: RecommendationMetadata!
    spec: RecommendationSpec!
  }

  type RecommendationMetadata {
    labels: RecommendationLabels
    tags: [String!]
    annotations: RecommendationAnnotations
  }

  type RecommendationLabels {
    priority: String
    difficulty: String
  }

  type RecommendationAnnotations {
    lastUpdatedBy: String
    matchAlgorithm: String
    telemetrySource: String
    partnerServiceCode: String
    recommendationEngineVersion: String
  }

  type RecommendationSpec {
    recommendation: RecommendationDetails!
    partnerService: RecommendedPartnerService!
  }

  type RecommendationDetails {
    relevanceScore: Int!
    generatedAt: Float!
  }

  type RecommendedPartnerService {
    serviceId: ID!
    serviceCode: String!
    name: String!
    category: String!
    serviceType: String!
    description: String!
    status: String!
    labels: ServiceLabels
    annotations: ServiceAnnotations
    tags: [String!]
    links: [ServiceLink!]
  }

  type ServiceLabels {
    duration: String
    ageGroup: String
    difficulty: String
  }

  type ServiceAnnotations {
    sla: String
    contentOwner: String
  }

  type ServiceLink {
    rel: String!
    href: String!
  }

  type Subscription {
    alertReceived(userId: ID!): Alert!
  }
`;

// Made with Bob
