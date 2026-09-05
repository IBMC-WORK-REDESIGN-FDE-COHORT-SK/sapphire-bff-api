import { RESTDataSource } from '@apollo/datasource-rest';
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('partner-services-api');

export class PartnerServicesAPI extends RESTDataSource {
  baseURL = process.env.PARTNER_SERVICES_API_URL || 'http://localhost:8085/sapphire-wellness-partner-service';

  /**
   * Transform partner service API response to GraphQL schema format
   * @param {Object} service - Service from API
   * @returns {Object} Transformed service
   */
  transformService(service) {
    // Get first pricing entry
    const firstPricing = service.pricing?.[0];
    
    return {
      id: service.id,
      name: service.spec.name,
      partnerId: service.partnerId,
      category: service.spec.category,
      serviceType: service.spec.serviceType,
      description: service.spec.description,
      price: firstPricing?.amount || 0,
      currency: firstPricing?.currency || 'USD',
      billingCycle: firstPricing?.billingCycle || null,
      status: service.status
    };
  }

  /**
   * Get all partner services with optional filtering
   * @param {string} searchQuery - Search query for service name or provider
   * @param {string} category - Filter by service category
   * @param {string} availability - Filter by availability (Available/Unavailable)
   * @returns {Promise<Array>} List of partner services
   */
  async getPartnerServices(searchQuery, category, availability) {
    return tracer.startActiveSpan('PartnerServicesAPI.getPartnerServices', async (span) => {
      try {
        span.setAttribute('search.query', searchQuery || 'none');
        span.setAttribute('filter.category', category || 'all');
        span.setAttribute('filter.availability', availability || 'all');
        
        console.info('[PartnerServicesAPI] getPartnerServices called', { searchQuery, category, availability });

        // Call the actual API
        const response = await this.get(this.baseURL + '/partner-services/services');
        
        console.info(`[PartnerServicesAPI] Received ${response.content?.length || 0} services from API`);

        // Transform the response
        let services = (response.content || []).map(service => this.transformService(service));

        // Apply client-side filtering
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          services = services.filter(service =>
            service.name.toLowerCase().includes(query)
          );
        }

        if (category && category !== 'All') {
          services = services.filter(service => service.category === category);
        }

        if (availability && availability !== 'All') {
          const statusFilter = availability === 'Available' ? 'ACTIVE' : 'DRAFT';
          services = services.filter(service => service.status === statusFilter);
        }

        span.setAttribute('result.count', services.length);
        span.setStatus({ code: SpanStatusCode.OK });
        console.info(`[PartnerServicesAPI] Returning ${services.length} services after filtering`);
        
        return services;
      } catch (error) {
        console.error('[PartnerServicesAPI] getPartnerServices - Error:', error.message);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Get a single service by ID
   * @param {string} serviceId - Service ID
   * @returns {Promise<Object>} Service details
   */
  async getServiceById(serviceId) {
    return tracer.startActiveSpan('PartnerServicesAPI.getServiceById', async (span) => {
      try {
        span.setAttribute('service.id', serviceId);
        console.info(`[PartnerServicesAPI] getServiceById called for ID: ${serviceId}`);

        const service = await this.get(this.baseURL + `/partner-services/services/${serviceId}`);
        
        const transformed = this.transformService(service);
        
        span.setStatus({ code: SpanStatusCode.OK });
        return transformed;
      } catch (error) {
        console.error('[PartnerServicesAPI] getServiceById - Error:', error.message);
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