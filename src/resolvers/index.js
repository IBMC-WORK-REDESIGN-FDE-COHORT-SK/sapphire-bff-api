import { pubsub } from '../utils/redis.js';
import { track, identify, page } from '../utils/analytics.js';
import { GraphQLJSON } from 'graphql-scalars';
import { withFilter } from 'graphql-subscriptions';

/**
 * Convert period enum to time range in nanoseconds
 * @param {string} period - Period enum (TODAY, WEEK, MONTH, YEAR)
 * @returns {Object} Time range with from/to in nanoseconds
 */
function periodToTimeRange(period) {
  const now = Date.now();
  const nowNanos = now * 1000000; // Convert milliseconds to nanoseconds
  let fromNanos;

  switch (period) {
    case 'TODAY':
      // Start of today
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      fromNanos = startOfDay.getTime() * 1000000;
      break;
    case 'WEEK':
      // 7 days ago
      fromNanos = (now - 7 * 24 * 60 * 60 * 1000) * 1000000;
      break;
    case 'MONTH':
      // 30 days ago
      fromNanos = (now - 30 * 24 * 60 * 60 * 1000) * 1000000;
      break;
    case 'YEAR':
      // 365 days ago
      fromNanos = (now - 365 * 24 * 60 * 60 * 1000) * 1000000;
      break;
    default:
      // Default to today
      const defaultStart = new Date(now);
      defaultStart.setHours(0, 0, 0, 0);
      fromNanos = defaultStart.getTime() * 1000000;
  }

  const timeRange = {
    from: fromNanos,
    to: nowNanos
  };

  console.info(`[Resolver] Period '${period}' converted to time range:`, {
    from: new Date(fromNanos / 1000000).toISOString(),
    to: new Date(nowNanos / 1000000).toISOString()
  });

  return timeRange;
}

/**
 * Transform chart API response to match GraphQL schema
 * @param {Object} chartData - Chart API response
 * @returns {Array} Transformed data points
 */
function transformChartResponse(chartData) {
  if (!chartData || !chartData.series || chartData.series.length === 0) {
    console.warn('[Resolver] transformChartResponse - No data to transform');
    return [];
  }

  // For single series, return array of points
  const series = chartData.series[0];
  const transformed = series.points.map(point => ({
    timestamp: new Date(point.timestamp).toISOString(),
    value: Math.round(point.value)
  }));

  console.info(`[Resolver] transformChartResponse - Transformed ${transformed.length} data points`);
  return transformed;
}

/**
 * Transform activity chart response to match GraphQL schema
 * @param {Object} chartData - Chart API response
 * @returns {Array} Transformed activity data
 */
function transformActivityResponse(chartData) {
  if (!chartData || !chartData.series || chartData.series.length === 0) {
    console.warn('[Resolver] transformActivityResponse - No data to transform');
    return [];
  }

  const series = chartData.series[0];
  const transformed = series.points.map(point => {
    const date = new Date(point.timestamp);
    return {
      date: date.toISOString().split('T')[0],
      day: date.toLocaleDateString('en-US', { weekday: 'short' }),
      steps: Math.round(point.value)
    };
  });

  console.info(`[Resolver] transformActivityResponse - Transformed ${transformed.length} activity data points`);
  return transformed;
}

/**
 * Transform blood pressure chart response to match GraphQL schema
 * @param {Object} chartData - Chart API response
 * @returns {Object} Transformed blood pressure history
 */
function transformBloodPressureResponse(chartData) {
  if (!chartData || !chartData.series || chartData.series.length < 2) {
    console.warn('[Resolver] transformBloodPressureResponse - Insufficient data to transform');
    return { systolic: [], diastolic: [] };
  }

  const systolicSeries = chartData.series.find(s => s.name === 'Systolic');
  const diastolicSeries = chartData.series.find(s => s.name === 'Diastolic');

  const result = {
    systolic: (systolicSeries?.points || []).map(point => ({
      timestamp: new Date(point.timestamp).toISOString(),
      value: Math.round(point.value)
    })),
    diastolic: (diastolicSeries?.points || []).map(point => ({
      timestamp: new Date(point.timestamp).toISOString(),
      value: Math.round(point.value)
    }))
  };

  console.info(`[Resolver] transformBloodPressureResponse - Transformed systolic: ${result.systolic.length}, diastolic: ${result.diastolic.length} points`);
  return result;
}

export const resolvers = {
  JSON: GraphQLJSON,

  Query: {
    dashboard: async (_, __, { user }) => {
      // Only return user data - other fields will be resolved on demand
      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          greeting: `Good morning, ${user.name}!`
        }
      };
    },

    partners: async (_, { searchQuery, type, location }, { dataSources }) => {
      console.info('[Resolver] Query.partners called', { searchQuery, type, location });
      return dataSources.partnersAPI.getPartners(searchQuery, type, location);
    },

    partnerServices: async (_, { searchQuery, category, availability }, { dataSources }) => {
      console.info('[Resolver] Query.partnerServices called', { searchQuery, category, availability });
      return dataSources.partnerServicesAPI.getPartnerServices(searchQuery, category, availability);
    },

    fetchUser: async (_, { email }, { dataSources }) => {
      console.info('[Resolver] Query.fetchUser called', { email });
      return dataSources.usersAPI.fetchUserByEmail(email);
    },

    latestWellnessSummary: async (_, { email }, { dataSources }) => {
      console.info('[Resolver] Query.latestWellnessSummary called', { email });
      return dataSources.usersAPI.getLatestWellnessSummary(email);
    },

    userSubscriptions: async (_, { email }, { dataSources }) => {
      console.info('[Resolver] Query.userSubscriptions called', { email });
      return dataSources.usersAPI.getUserSubscriptions(email);
    },

    userAlerts: async (_, { userEmail }, { dataSources }) => {
      console.info('[Resolver] Query.userAlerts called', { userEmail });
      return dataSources.usersAPI.getUserAlerts(userEmail);
    },

    userRecommendations: async (_, { userEmail }, { dataSources }) => {
      console.info('[Resolver] Query.userRecommendations called', { userEmail });
      return dataSources.usersAPI.getUserRecommendations(userEmail);
    },

    userPartnerServices: async (_, { email }, { dataSources }) => {
      console.info('[Resolver] Query.userPartnerServices called', { email });
      
      // Get full user subscriptions
      const subscriptions = await dataSources.usersAPI.getFullUserSubscriptions(email);
      
      // For each subscription, fetch the partner service details
      const userPartnerServices = await Promise.all(
        subscriptions.map(async (subscription) => {
          try {
            const service = await dataSources.partnerServicesAPI.getServiceById(subscription.partnerServiceId);
            return {
              subscription,
              service
            };
          } catch (error) {
            console.error(`[Resolver] Error fetching service ${subscription.partnerServiceId}:`, error.message);
            // Return subscription with null service if fetch fails
            return {
              subscription,
              service: null
            };
          }
        })
      );
      
      // Filter out any entries where service fetch failed
      const validServices = userPartnerServices.filter(ups => ups.service !== null);
      
      console.info(`[Resolver] Query.userPartnerServices completed - ${validServices.length} services`);
      return validServices;
    },

    getPartnerReview: async (_, { partnerId }, { dataSources }) => {
      console.info('[Resolver] Query.getPartnerReview called', { partnerId });
      return dataSources.partnerOnboardingAPI.getPartnerReview(partnerId);
    },

    getServiceReview: async (_, { serviceId }, { dataSources }) => {
      console.info('[Resolver] Query.getServiceReview called', { serviceId });
      return dataSources.partnerOnboardingAPI.getServiceReview(serviceId);
    },

    // T013: findPartners resolver — SCRUM-26 / SCRUM-28
    // TODO: Add @opentelemetry/sdk-node span instrumentation once SDK is installed.
    // TODO: Migrate console logging to pino structured JSON once pino is configured.
    findPartners: async (_, { query: searchInput }, { user }) => {
      // Auth guard: user is already validated by JWKS middleware; reject if absent
      if (!user) {
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'error',
          service: 'sapphire-bff-api',
          message: 'findPartners: unauthorized request — no authenticated user in context',
          environment: process.env.NODE_ENV || 'unknown',
        }));
        const err = new Error('Unauthorized');
        err.extensions = { code: 'UNAUTHENTICATED' };
        throw err;
      }

      // Validate: at least one of query/semanticQuery must be non-empty
      const hasKeyword = typeof searchInput.query === 'string' && searchInput.query.trim().length > 0;
      const hasSemantic = typeof searchInput.semanticQuery === 'string' && searchInput.semanticQuery.trim().length > 0;

      if (!hasKeyword && !hasSemantic) {
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'error',
          service: 'sapphire-bff-api',
          message: 'findPartners: validation error — at least one of query or semanticQuery must be non-empty',
          userId: user.id,
          environment: process.env.NODE_ENV || 'unknown',
        }));
        const err = new Error('At least one of query or semanticQuery must be provided');
        err.extensions = { code: 'BAD_USER_INPUT' };
        throw err;
      }

      console.info(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        service: 'sapphire-bff-api',
        message: 'findPartners: resolver invoked',
        userId: user.id,
        hasKeyword,
        hasSemantic,
        page: searchInput.page ?? 0,
        pageSize: searchInput.pageSize ?? 20,
        environment: process.env.NODE_ENV || 'unknown',
      }));

      const { searchPartnerServices } = await import('../clients/partnerSearchClient.js');

      try {
        const result = await searchPartnerServices(searchInput);

        console.info(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'info',
          service: 'sapphire-bff-api',
          message: 'findPartners: resolver completed',
          userId: user.id,
          keywordCount: result.keywordResults.length,
          semanticCount: result.semanticResults.length,
          environment: process.env.NODE_ENV || 'unknown',
        }));

        return result;
      } catch (err) {
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'error',
          service: 'sapphire-bff-api',
          message: 'findPartners: upstream error',
          userId: user.id,
          errorCode: err.code || 'UNKNOWN',
          retryable: !!err.retryable,
          // Do NOT log err.message to avoid leaking internal details
          environment: process.env.NODE_ENV || 'unknown',
        }));

        const gqlErr = new Error('Partner search is temporarily unavailable. Please try again.');
        gqlErr.extensions = {
          code: err.code === 'TIMEOUT' || err.code === 'NETWORK_ERROR' ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_SERVER_ERROR',
          retryable: !!err.retryable,
        };
        throw gqlErr;
      }
    }
  },

  Mutation: {
    onboardPartner: async (_, { input }, { dataSources }) => {
      console.info('[Resolver] Mutation.onboardPartner called', { input });
      return dataSources.partnerOnboardingAPI.onboardPartner(input);
    },

    onboardPartnerService: async (_, { input }, { dataSources }) => {
      console.info('[Resolver] Mutation.onboardPartnerService called', { input });
      return dataSources.partnerOnboardingAPI.onboardPartnerService(input);
    },

    executeReviewAction: async (_, { webhookURL, userId, notes }, { dataSources }) => {
      console.info('[Resolver] Mutation.executeReviewAction called', { webhookURL, userId, notes });
      return dataSources.partnerOnboardingAPI.executeReviewAction(webhookURL, userId, notes);
    },

    upgradeUserToPremium: async (_, { email }, { dataSources }) => {
      console.info('[Resolver] Mutation.upgradeUserToPremium called', { email });
      return dataSources.usersAPI.upgradeUserToPremium(email);
    },

    subscribeToService: async (_, { email, serviceId, endDate }, { dataSources }) => {
      console.info('[Resolver] Mutation.subscribeToService called', { email, serviceId, endDate });
      return dataSources.usersAPI.subscribeToService(email, serviceId, endDate);
    },

    unsubscribeFromService: async (_, { email, serviceId }, { dataSources }) => {
      console.info('[Resolver] Mutation.unsubscribeFromService called', { email, serviceId });
      return dataSources.usersAPI.unsubscribeFromService(email, serviceId);
    },

    generateRecommendation: async (_, { userId }, { dataSources }) => {
      console.info('[Resolver] Mutation.generateRecommendation called', { userId });
      return dataSources.usersAPI.generateRecommendation(userId);
    },

    trackAnalyticsEvent: async (_, { userId, event, properties }) => {
      console.info('[Resolver] Mutation.trackAnalyticsEvent called', { userId, event });
      try {
        await track(userId, event, properties || {});
        return { success: true, message: 'Event tracked successfully' };
      } catch (error) {
        console.error('[Resolver] trackAnalyticsEvent error:', error.message);
        return { success: false, message: error.message };
      }
    },

    identifyAnalyticsUser: async (_, { userId, traits }, { dataSources }) => {
      console.info('[Resolver] Mutation.identifyAnalyticsUser called', { userId });
      try {
        let demographicTraits = {};
        
        // Enrich traits with demographic info from Users API
        try {
          const user = await dataSources.usersAPI.fetchUserByEmail(userId);
          demographicTraits = {
            city: user?.address?.city,
            state: user?.address?.state,
            region: user?.address?.state,   // Amplitude reserved field for state/region
            country: user?.address?.country,
            gender: user?.physicalAttributes?.gender,
          };
          console.info(`[Resolver] identifyAnalyticsUser – enriched demographic traits for user: ${userId}`);
        } catch (err) {
          console.warn(`[Resolver] identifyAnalyticsUser – could not fetch user profile for ${userId}:`, err.message);
        }

        const enrichedTraits = { ...demographicTraits, ...(traits || {}) };
        await identify(userId, enrichedTraits);
        return { success: true, message: 'User identified successfully' };
      } catch (error) {
        console.error('[Resolver] identifyAnalyticsUser error:', error.message);
        return { success: false, message: error.message };
      }
    },

    trackAnalyticsPage: async (_, { userId, name, properties }) => {
      console.info('[Resolver] Mutation.trackAnalyticsPage called', { userId, name });
      try {
        await page(userId, name, properties || {});
        return { success: true, message: 'Page tracked successfully' };
      } catch (error) {
        console.error('[Resolver] trackAnalyticsPage error:', error.message);
        return { success: false, message: error.message };
      }
    }
  },

  PartnerService: {
    partner: async (parent, _, { dataSources }) => {
      console.info(`[Resolver] PartnerService.partner called for partnerId: ${parent.partnerId}`);
      try {
        return await dataSources.partnersAPI.getPartnerById(parent.partnerId);
      } catch (error) {
        console.error(`[Resolver] PartnerService.partner - Error fetching partner ${parent.partnerId}:`, error.message);
        // Return a placeholder partner if fetch fails
        return {
          id: parent.partnerId,
          name: 'Unknown Partner',
          type: 'Unknown',
          city: 'Unknown',
          state: 'Unknown',
          country: 'Unknown',
          postalCode: 'Unknown',
          status: 'UNKNOWN'
        };
      }
    }
  },

  Dashboard: {
    healthMetrics: async (parent, _, { user, dataSources }) => {
      const userId = user.id;
      const [sleep] = await Promise.all([
        // dataSources.healthMetricsAPI.getHeartRate(userId),
        // dataSources.healthMetricsAPI.getSteps(userId),
        // dataSources.healthMetricsAPI.getBloodPressure(userId),
        dataSources.healthMetricsAPI.getSleep(userId)
      ]);

      return {
        // heartRate,
        // steps,
        // bloodPressure,
        sleep
      };
    },

    heartRateTrends: async (parent, _, { user, dataSources }) => {
      console.info(`[Resolver] Dashboard.heartRateTrends called - User: ${user.id}`);
      const timeRange = periodToTimeRange('TODAY');
      const chartData = await dataSources.trendsAPI.getHeartRateTrends(user.id, timeRange);
      return transformChartResponse(chartData);
    },

    activitySummary: async (parent, _, { user, dataSources }) => {
      console.info(`[Resolver] Dashboard.activitySummary called - User: ${user.id}`);
      const timeRange = periodToTimeRange('WEEK');
      const chartData = await dataSources.trendsAPI.getActivitySummary(user.id, timeRange);
      return transformActivityResponse(chartData);
    },

    bloodPressureHistory: async (parent, _, { user, dataSources }) => {
      console.info(`[Resolver] Dashboard.bloodPressureHistory called - User: ${user.id}`);
      const timeRange = periodToTimeRange('MONTH');
      const chartData = await dataSources.trendsAPI.getBloodPressureHistory(user.id, timeRange);
      return transformBloodPressureResponse(chartData);
    },

    recentReadings: async (parent, _, { user, dataSources }) => {
      return dataSources.readingsAPI.getRecentBloodPressureReadings(user.id, 3);
    },

    insights: async (parent, _, { user, dataSources }) => {
      return dataSources.insightsAPI.getHealthInsights(user.id);
    }
  },

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
};

// Made with Bob
