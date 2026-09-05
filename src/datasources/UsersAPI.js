import { RESTDataSource } from '@apollo/datasource-rest';
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('users-api');

export class UsersAPI extends RESTDataSource {
  baseURL = process.env.USERS_API_URL || 'http://localhost:8091/api/v1';

  /**
   * Transform user API response to GraphQL schema format
   * @param {Object} user - User from API
   * @returns {Object} Transformed user
   */
  transformUser(user) {
    return {
      name: user.spec.fullName,
      email: user.spec.email,
      userTier: user.spec.tier,
      address: {
        city: user.spec.address.city,
        state: user.spec.address.state,
        country: user.spec.address.country,
        zip: user.spec.address.zip
      },
      physicalAttributes: {
        gender: user.spec.physicalAttributes.gender,
        heightCm: user.spec.physicalAttributes.heightCm,
        weightKg: user.spec.physicalAttributes.weightKg
      }
    };
  }

  /**
   * Fetch user by email
   * @param {string} email - User email address
   * @returns {Promise<Object>} User details
   */
  async fetchUserByEmail(email) {
    return tracer.startActiveSpan('UsersAPI.fetchUserByEmail', async (span) => {
      try {
        span.setAttribute('user.email', email);
        console.info(`[UsersAPI] fetchUserByEmail called for email: ${email}`);

        const user = await this.get(`${this.baseURL}/users/email/${email}`);
        
        const transformed = this.transformUser(user);
        
        span.setStatus({ code: SpanStatusCode.OK });
        console.info(`[UsersAPI] User fetched successfully for email: ${email}`);
        
        return transformed;
      } catch (error) {
        console.error('[UsersAPI] fetchUserByEmail - Error:', error.message);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Fetch latest wellness summary by email
   * @param {string} email - User email address
   * @returns {Promise<Object>} Latest wellness summary
   */
  async getLatestWellnessSummary(email) {
    return tracer.startActiveSpan('UsersAPI.getLatestWellnessSummary', async (span) => {
      try {
        span.setAttribute('user.email', email);
        console.info(`[UsersAPI] getLatestWellnessSummary called for email: ${email}`);

        const summary = await this.get(`${this.baseURL}/users/wellness-summary/latest`, {
          params: { email }
        });
        
        span.setStatus({ code: SpanStatusCode.OK });
        console.info(`[UsersAPI] Wellness summary fetched successfully for email: ${email}`);
        
        return summary;
      } catch (error) {
        console.error('[UsersAPI] getLatestWellnessSummary - Error:', error.message);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Upgrade user to premium tier
   * @param {string} email - User email address
   * @returns {Promise<Object>} Updated user profile
   */
  async upgradeUserToPremium(email) {
    return tracer.startActiveSpan('UsersAPI.upgradeUserToPremium', async (span) => {
      try {
        span.setAttribute('user.email', email);
        console.info(`[UsersAPI] upgradeUserToPremium called for email: ${email}`);

        const user = await this.patch(`${this.baseURL}/users/${email}`, {
          body: { tier: 'premium' }
        });
        
        const transformed = this.transformUser(user);
        
        span.setStatus({ code: SpanStatusCode.OK });
        console.info(`[UsersAPI] User upgraded to premium successfully for email: ${email}`);
        
        return transformed;
      } catch (error) {
        console.error('[UsersAPI] upgradeUserToPremium - Error:', error.message);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Subscribe user to a partner service
   * @param {string} email - User email address
   * @param {string} serviceId - Partner service ID
   * @param {string} endDate - Subscription end date
   * @returns {Promise<Object>} Subscription details
   */
  async subscribeToService(email, serviceId, endDate) {
    return tracer.startActiveSpan('UsersAPI.subscribeToService', async (span) => {
      try {
        span.setAttribute('user.email', email);
        span.setAttribute('service.id', serviceId);
        console.info(`[UsersAPI] subscribeToService called for email: ${email}, serviceId: ${serviceId}`);

        const subscription = await this.post(`${this.baseURL}/users/${email}/subscriptions`, {
          body: {
            serviceId,
            endDate
          }
        });
        
        span.setStatus({ code: SpanStatusCode.OK });
        console.info(`[UsersAPI] User subscribed to service successfully`);
        
        return subscription;
      } catch (error) {
        console.error('[UsersAPI] subscribeToService - Error:', error.message);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Unsubscribe user from a partner service
   * @param {string} email - User email address
   * @param {string} serviceId - Partner service ID
   * @returns {Promise<Object>} Unsubscribe result
   */
  async unsubscribeFromService(email, serviceId) {
    return tracer.startActiveSpan('UsersAPI.unsubscribeFromService', async (span) => {
      try {
        span.setAttribute('user.email', email);
        span.setAttribute('service.id', serviceId);
        console.info(`[UsersAPI] unsubscribeFromService called for email: ${email}, serviceId: ${serviceId}`);

        await this.delete(`${this.baseURL}/users/${email}/subscriptions/${serviceId}`);
        
        span.setStatus({ code: SpanStatusCode.OK });
        console.info(`[UsersAPI] User unsubscribed from service successfully`);
        
        return {
          success: true,
          message: 'Successfully unsubscribed from service'
        };
      } catch (error) {
        console.error('[UsersAPI] unsubscribeFromService - Error:', error.message);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Get user subscriptions
   * @param {string} email - User email address
   * @returns {Promise<Array>} List of user subscriptions (simplified)
   */
  async getUserSubscriptions(email) {
    return tracer.startActiveSpan('UsersAPI.getUserSubscriptions', async (span) => {
      try {
        span.setAttribute('user.email', email);
        console.info(`[UsersAPI] getUserSubscriptions called for email: ${email}`);

        const subscriptions = await this.get(`${this.baseURL}/users/${email}/subscriptions`);
        
        // Transform to simplified format - only partnerServiceId and isActive
        const simplified = subscriptions.map(sub => ({
          partnerServiceId: sub.partnerServiceId,
          isActive: sub.isActive
        }));
        
        span.setStatus({ code: SpanStatusCode.OK });
        console.info(`[UsersAPI] User subscriptions fetched successfully - ${simplified.length} subscriptions`);
        
        return simplified;
      } catch (error) {
        console.error('[UsersAPI] getUserSubscriptions - Error:', error.message);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Get full user subscriptions with all details
   * @param {string} email - User email address
   * @returns {Promise<Array>} List of full user subscriptions
   */
  async getFullUserSubscriptions(email) {
    return tracer.startActiveSpan('UsersAPI.getFullUserSubscriptions', async (span) => {
      try {
        span.setAttribute('user.email', email);
        console.info(`[UsersAPI] getFullUserSubscriptions called for email: ${email}`);

        const subscriptions = await this.get(`${this.baseURL}/users/${email}/subscriptions`);
        
        span.setStatus({ code: SpanStatusCode.OK });
        console.info(`[UsersAPI] Full user subscriptions fetched successfully - ${subscriptions.length} subscriptions`);
        
        return subscriptions;
      } catch (error) {
        console.error('[UsersAPI] getFullUserSubscriptions - Error:', error.message);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Get user alerts
   * @param {string} userEmail - User email address
   * @returns {Promise<Array>} List of user alerts
   */
  async getUserAlerts(userEmail) {
    return tracer.startActiveSpan('UsersAPI.getUserAlerts', async (span) => {
      try {
        span.setAttribute('user.email', userEmail);
        console.info(`[UsersAPI] getUserAlerts called for email: ${userEmail}`);

        const alerts = await this.get(`${this.baseURL}/users/alerts`, {
          params: { userEmail }
        });
        
        span.setStatus({ code: SpanStatusCode.OK });
        console.info(`[UsersAPI] User alerts fetched successfully - ${alerts.length} alerts`);
        
        return alerts;
      } catch (error) {
        console.error('[UsersAPI] getUserAlerts - Error:', error.message);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Transform recommendation API response to GraphQL schema format
   * @param {Object} recommendation - Recommendation from API
   * @returns {Object} Transformed recommendation
   */
  transformRecommendation(recommendation) {
    return {
      id: recommendation.id,
      createdAt: recommendation.createdAt,
      updatedAt: recommendation.updatedAt,
      metadata: {
        labels: recommendation.metadata?.labels ? {
          priority: recommendation.metadata.labels.priority,
          difficulty: recommendation.metadata.labels.difficulty
        } : null,
        tags: recommendation.metadata?.tags || [],
        annotations: recommendation.metadata?.annotations ? {
          lastUpdatedBy: recommendation.metadata.annotations['sapphire.io/last-updated-by'],
          matchAlgorithm: recommendation.metadata.annotations['sapphire.io/match-algorithm'],
          telemetrySource: recommendation.metadata.annotations['sapphire.io/telemetry-source'],
          partnerServiceCode: recommendation.metadata.annotations['sapphire.io/partner-service-code'],
          recommendationEngineVersion: recommendation.metadata.annotations['sapphire.io/recommendation-engine-version']
        } : null
      },
      spec: {
        recommendation: {
          relevanceScore: recommendation.spec.recommendation.relevanceScore,
          generatedAt: recommendation.spec.recommendation.generatedAt
        },
        partnerService: {
          serviceId: recommendation.spec.partnerService.serviceId,
          serviceCode: recommendation.spec.partnerService.serviceCode,
          name: recommendation.spec.partnerService.name,
          category: recommendation.spec.partnerService.category,
          serviceType: recommendation.spec.partnerService.serviceType,
          description: recommendation.spec.partnerService.description,
          status: recommendation.spec.partnerService.status,
          labels: recommendation.spec.partnerService.labels ? {
            duration: recommendation.spec.partnerService.labels.duration,
            ageGroup: recommendation.spec.partnerService.labels.age_group,
            difficulty: recommendation.spec.partnerService.labels.difficulty
          } : null,
          annotations: recommendation.spec.partnerService.annotations ? {
            sla: recommendation.spec.partnerService.annotations['io.sapphire.service.sla'],
            contentOwner: recommendation.spec.partnerService.annotations['io.sapphire.service.contentOwner']
          } : null,
          tags: recommendation.spec.partnerService.tags || [],
          links: recommendation.spec.partnerService.links || []
        }
      }
    };
  }

  /**
   * Get user recommendations
   * @param {string} userEmail - User email address
   * @returns {Promise<Array>} List of user recommendations
   */
  async getUserRecommendations(userEmail) {
    return tracer.startActiveSpan('UsersAPI.getUserRecommendations', async (span) => {
      try {
        span.setAttribute('user.email', userEmail);
        console.info(`[UsersAPI] getUserRecommendations called for email: ${userEmail}`);

        const recommendations = await this.get(`${this.baseURL}/users/recommendations`, {
          params: { userEmail }
        });
        
        // Transform each recommendation to match GraphQL schema
        const transformed = recommendations.map(rec => this.transformRecommendation(rec));
        
        span.setStatus({ code: SpanStatusCode.OK });
        console.info(`[UsersAPI] User recommendations fetched successfully - ${transformed.length} recommendations`);
        
        return transformed;
      } catch (error) {
        console.error('[UsersAPI] getUserRecommendations - Error:', error.message);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Trigger recommendation generation for a user
   * @param {string} userId - User ID (email)
   * @returns {Promise<Object>} Generation result with workflowId
   */
  async generateRecommendation(userId) {
    return tracer.startActiveSpan('UsersAPI.generateRecommendation', async (span) => {
      try {
        span.setAttribute('user.id', userId);
        console.info(`[UsersAPI] generateRecommendation called for userId: ${userId}`);

        // The API endpoint is at a different base URL for recommendations
        const recommendationsBaseURL = process.env.RECOMMENDATIONS_API_URL || 'http://localhost:8095/api/v1';
        
        const response = await this.post(`${recommendationsBaseURL}/recommendations/trigger`, {
          body: {
            userId
          }
        });
        
        span.setStatus({ code: SpanStatusCode.OK });
        console.info(`[UsersAPI] Recommendation generation triggered successfully for userId: ${userId}, workflowId: ${response.workflowId}`);
        
        return {
          success: true,
          message: 'Recommendation generation triggered successfully',
          workflowId: response.workflowId  // Return workflowId from workflow service
        };
      } catch (error) {
        console.error('[UsersAPI] generateRecommendation - Error:', error.message);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    });
  }
}

// Made with Bob