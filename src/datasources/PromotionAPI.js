import { RESTDataSource } from '@apollo/datasource-rest';

/**
 * REST data source for the sapphire-user-service Promotions endpoint.
 *
 * Calls GET /api/v1/promotions/active with an X-User-Tier header derived
 * from the authenticated user's JWT tier claim. The BFF acts as a trusted
 * internal caller — no end-user JWT is forwarded to this service.
 *
 * Response semantics:
 *  - 200 JSON  → active promotion object
 *  - 204        → no active promotion (returns null)
 *  - non-2xx   → logged as warning and treated as null (non-blocking)
 */
export class PromotionAPI extends RESTDataSource {
  baseURL = process.env.USER_SERVICE_URL || 'http://localhost:8091';

  /**
   * Returns the active promotion for a given tier, or null when none exists.
   *
   * @param {string} tier - User tier value (e.g. 'FREE' | 'PREMIUM')
   * @returns {Promise<Object|null>} Promotion data or null
   */
  async getActivePromotion(tier) {
    try {
      console.info(`[PromotionAPI] getActivePromotion tier=${tier}`);

      const response = await this.get('/api/v1/promotions/active', {
        headers: { 'X-User-Tier': tier },
      });

      // RESTDataSource throws on non-2xx, so reaching here means 2xx.
      // A 204 body is undefined/null — treat as no active promotion.
      if (!response) {
        console.info('[PromotionAPI] getActivePromotion: 204 No Content');
        return null;
      }

      console.info(`[PromotionAPI] getActivePromotion: promotion id=${response.id}`);
      return response;
    } catch (error) {
      // 404 / 204 from RESTDataSource shows as an error with status property.
      // Treat any downstream error as "no promotion" — non-blocking (FR-018).
      if (error.extensions?.response?.status === 204) {
        return null;
      }
      console.warn(`[PromotionAPI] getActivePromotion error: ${error.message}`);
      return null;
    }
  }
}

// Made with Bob
