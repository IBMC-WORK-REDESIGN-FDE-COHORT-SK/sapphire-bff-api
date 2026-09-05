import { RESTDataSource } from '@apollo/datasource-rest';
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('partner-onboarding-api');

export class PartnerOnboardingAPI extends RESTDataSource {
  baseURL = process.env.PARTNER_ONBOARDING_API_URL || 'http://localhost:8086/business-onboarding/partner-onboarding';
  partnerServicesBaseURL = process.env.PARTNER_SERVICES_ONBOARDING_API_URL || 'http://localhost:8086/business-onboarding/service-onboarding';

  /**
   * Convert country name to ISO-2 code
   * @param {string} country - Country name or ISO-2 code
   * @returns {string} ISO-2 country code
   */
  getCountryCode(country) {
    const countryMap = {
      'India': 'IN',
      'United States': 'US',
      'United Kingdom': 'GB',
      'Canada': 'CA',
      'Australia': 'AU',
      'Germany': 'DE',
      'France': 'FR',
      'Japan': 'JP',
      'China': 'CN',
      'Brazil': 'BR'
    };
    
    // If already ISO-2 code (2 characters), return as is
    if (country && country.length === 2) {
      return country.toUpperCase();
    }
    
    // Otherwise, look up in map or return as is
    return countryMap[country] || country;
  }

  /**
   * Onboard a new partner
   * @param {Object} input - Partner onboarding input
   * @returns {Promise<Object>} Created partner with ID
   */
  async onboardPartner(input) {
    return tracer.startActiveSpan('PartnerOnboardingAPI.onboardPartner', async (span) => {
      try {
        span.setAttribute('partner.code', input.partnerCode);
        span.setAttribute('partner.name', input.name);
        console.info('[PartnerOnboardingAPI] onboardPartner called', { input });

        // Build the request payload with hardcoded values
        // Note: spec.country uses ISO-2 code, addresses.country uses full name
        const countryCode = this.getCountryCode(input.country);
        
        const payload = {
          userId: "admin@sapphire.com",
          status: "DRAFT",
          spec: {
            partnerCode: input.partnerCode,
            name: input.name,
            partnerType: input.partnerType,
            country: countryCode, // ISO-2 code (e.g., "IN")
            timezone: "dummy",
            contactEmail: "admin@sapphire.com"
          },
          addresses: [
            {
              id: `address-${Date.now()}`,
              addressType: "REGISTERED",
              line1: "dummy",
              city: input.city,
              state: input.state,
              country: input.country, // Can be full name or ISO-2 code
              postalCode: input.postalCode
            }
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        console.info('[PartnerOnboardingAPI] Sending POST request to create partner', { payload });

        // Call the POST API
        const response = await this.post(`${this.baseURL}/partners`, {
          body: payload
        });

        console.info('[PartnerOnboardingAPI] Partner created successfully', { partnerId: response.partnerId });

        // Return the response with partner ID
        span.setStatus({ code: SpanStatusCode.OK });
        return {
          id: response.partnerId,
          name: input.name,
          type: input.partnerType,
          city: input.city,
          state: input.state,
          country: input.country,
          postalCode: input.postalCode,
          description: input.name,
          status: "DRAFT"
        };
      } catch (error) {
        console.error('[PartnerOnboardingAPI] onboardPartner - Error:', error.message);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Onboard a new partner service
   * @param {Object} input - Partner service onboarding input
   * @returns {Promise<Object>} Created partner service with ID
   */
  async onboardPartnerService(input) {
    return tracer.startActiveSpan('PartnerOnboardingAPI.onboardPartnerService', async (span) => {
      try {
        span.setAttribute('partner.id', input.partnerId);
        span.setAttribute('service.code', input.serviceCode);
        console.info('[PartnerOnboardingAPI] onboardPartnerService called', { input });

        // Build the request payload
        const payload = {
          userId: "ADMIN",
          partnerId: input.partnerId,
          spec: {
            serviceCode: input.serviceCode,
            name: input.name,
            category: input.category,
            serviceType: input.serviceType,
            description: input.description
          },
          pricing: [
            {
              pricingModel: input.pricingModel,
              currency: input.currency,
              amount: input.amount,
              billingCycle: input.billingCycle
            }
          ]
        };

        // Add metadata with tags if provided
        if (input.tags && input.tags.length > 0) {
          payload.metadata = {
            tags: input.tags
          };
        }

        console.info('[PartnerOnboardingAPI] Sending POST request to create partner service', { payload });

        // Call the POST API - note the endpoint structure
        const response = await this.post(
          `${this.partnerServicesBaseURL}/services`,
          {
            body: payload
          }
        );

        console.info('[PartnerOnboardingAPI] Partner service created successfully', { serviceId: response.serviceId });

        // Return the response with service ID
        span.setStatus({ code: SpanStatusCode.OK });
        return {
          id: response.serviceId,
          name: input.name,
          partnerId: input.partnerId,
          category: input.category,
          serviceType: input.serviceType,
          description: input.description,
          price: input.amount,
          currency: input.currency,
          billingCycle: input.billingCycle,
          status: "DRAFT"
        };
      } catch (error) {
        console.error('[PartnerOnboardingAPI] onboardPartnerService - Error:', error.message);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Get partner review actions
   * @param {string} partnerId - Partner ID
   * @returns {Promise<Object>} Partner review with actions
   */
  async getPartnerReview(partnerId) {
    return tracer.startActiveSpan('PartnerOnboardingAPI.getPartnerReview', async (span) => {
      try {
        span.setAttribute('partner.id', partnerId);
        console.info(`[PartnerOnboardingAPI] getPartnerReview called for partnerId: ${partnerId}`);

        // Call the GET API
        const response = await this.get(`${this.baseURL}/partner/${partnerId}/review`);

        console.info('[PartnerOnboardingAPI] Partner review fetched successfully', { partnerId });

        span.setStatus({ code: SpanStatusCode.OK });
        return response;
      } catch (error) {
        console.error('[PartnerOnboardingAPI] getPartnerReview - Error:', error.message);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Get service review actions
   * @param {string} serviceId - Service ID
   * @returns {Promise<Object>} Service review with actions
   */
  async getServiceReview(serviceId) {
    return tracer.startActiveSpan('PartnerOnboardingAPI.getServiceReview', async (span) => {
      try {
        span.setAttribute('service.id', serviceId);
        console.info(`[PartnerOnboardingAPI] getServiceReview called for serviceId: ${serviceId}`);

        // Call the GET API
        const response = await this.get(`${this.partnerServicesBaseURL}/service/${serviceId}/review`);

        console.info('[PartnerOnboardingAPI] Service review fetched successfully', { serviceId });

        span.setStatus({ code: SpanStatusCode.OK });
        return response;
      } catch (error) {
        console.error('[PartnerOnboardingAPI] getServiceReview - Error:', error.message);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Execute a review action (approve/reject) via webhook
   * @param {string} webhookURL - The webhook URL to call
   * @param {string} userId - User ID performing the action
   * @param {string} notes - Optional notes
   * @returns {Promise<Object>} Action result
   */
  async executeReviewAction(webhookURL, userId, notes) {
    return tracer.startActiveSpan('PartnerOnboardingAPI.executeReviewAction', async (span) => {
      try {
        span.setAttribute('webhook.url', webhookURL);
        span.setAttribute('user.id', userId);
        console.info('[PartnerOnboardingAPI] executeReviewAction called', { webhookURL, userId, notes });

        // Build query parameters
        const params = new URLSearchParams();
        params.append('userId', userId);
        if (notes) {
          params.append('notes', notes);
        }

        // Extract the path from the webhook URL and append query params
        const url = new URL(webhookURL);
        const fullPath = `${url.pathname}?${params.toString()}`;

        console.info('[PartnerOnboardingAPI] Calling webhook', { fullPath });

        // Call the webhook as a GET request
        const response = await this.get(fullPath);

        console.info('[PartnerOnboardingAPI] Review action executed successfully');

        span.setStatus({ code: SpanStatusCode.OK });
        return {
          success: true,
          message: 'Review action executed successfully'
        };
      } catch (error) {
        console.error('[PartnerOnboardingAPI] executeReviewAction - Error:', error.message);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.recordException(error);
        return {
          success: false,
          message: error.message
        };
      } finally {
        span.end();
      }
    });
  }
}

// Made with Bob