import { RESTDataSource } from '@apollo/datasource-rest';
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('partners-api');

export class PartnersAPI extends RESTDataSource {
  baseURL = process.env.PARTNERS_API_URL || 'http://localhost:8085/sapphire-wellness-partner-service';

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
   * Transform partner API response to GraphQL schema format
   * @param {Object} partner - Partner from API
   * @returns {Object} Transformed partner
   */
  transformPartner(partner) {
    // Get first address for location
    const firstAddress = partner.addresses?.[0];
    const city = firstAddress 
      ? `${firstAddress.city}`
      : 'Unknown';
    const state = firstAddress 
      ? `${firstAddress.state}`
      : 'Unknown';
    const country = firstAddress 
      ? `${firstAddress.country}`
      : 'Unknown';
    const postalCode = firstAddress 
      ? `${firstAddress.postalCode}`
      : 'Unknown';
    // Get rating from metadata labels
    // const rating = partner.metadata?.labels?.rating 
    //   ? parseFloat(partner.metadata.labels.rating) 
    //   : null;

    return {
      id: partner.id,
      name: partner.spec.name,
      type: partner.spec.partnerType,
      city,
      state,
      country,
      postalCode,
      status: partner.status,
      description: partner.spec.name 
    };
  }

  /**
   * Get all partners with optional filtering
   * @param {string} searchQuery - Search query for partner name
   * @param {string} type - Filter by partner type
   * @param {string} location - Filter by location
   * @returns {Promise<Array>} List of partners
   */
  async getPartners(searchQuery, type, location) {
    return tracer.startActiveSpan('PartnersAPI.getPartners', async (span) => {
      try {
        span.setAttribute('search.query', searchQuery || 'none');
        span.setAttribute('filter.type', type || 'all');
        span.setAttribute('filter.location', location || 'all');
        
        console.info('[PartnersAPI] getPartners called', { searchQuery, type, location });

        // Call the actual API
        const response = await this.get(this.baseURL + '/partners');
        
        console.info(`[PartnersAPI] Received ${response.content?.length || 0} partners from API`);

        // Transform the response
        let partners = (response.content || []).map(partner => this.transformPartner(partner));

        // Apply client-side filtering
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          partners = partners.filter(partner =>
            partner.name.toLowerCase().includes(query)
          );
        }

        if (type && type !== 'All') {
          partners = partners.filter(partner => partner.type === type);
        }

        if (location && location !== 'All') {
          partners = partners.filter(partner =>
            partner.city === location ||
            partner.state === location ||
            partner.country === location
          );
        }

        span.setAttribute('result.count', partners.length);
        span.setStatus({ code: SpanStatusCode.OK });
        console.info(`[PartnersAPI] Returning ${partners.length} partners after filtering`);
        
        return partners;
      } catch (error) {
        console.error('[PartnersAPI] getPartners - Error:', error.message);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Get a single partner by ID
   * @param {string} partnerId - Partner ID
   * @returns {Promise<Object>} Partner details
   */
  async getPartnerById(partnerId) {
    return tracer.startActiveSpan('PartnersAPI.getPartnerById', async (span) => {
      try {
        span.setAttribute('partner.id', partnerId);
        console.info(`[PartnersAPI] getPartnerById called for ID: ${partnerId}`);

        const partner = await this.get(this.baseURL + `/partners/${partnerId}`);
        
        const transformed = this.transformPartner(partner);
        
        span.setStatus({ code: SpanStatusCode.OK });
        return transformed;
      } catch (error) {
        console.error('[PartnersAPI] getPartnerById - Error:', error.message);
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