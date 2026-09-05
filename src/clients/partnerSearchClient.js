/**
 * REST client for sapphire-partner-service-search.
 *
 * Contract discrepancy noted (T004 verification):
 *   - Spec contract doc: POST /api/v1/partner-services/search, fields: query/semanticQuery/page/pageSize
 *   - Actual service:    POST /api/v1/services/search,         fields: keyword/semantic/page/size
 *   - Response: actual nests results under results.keywordResults / results.semanticResults
 *   - partnerName is not available in ServiceSearchResultDTO (only partnerId UUID)
 *   - This client maps the GraphQL input to the actual service contract.
 *
 * TODO: Migrate to pino structured JSON logging once pino is configured in this service.
 * TODO: Add @opentelemetry/sdk-node span instrumentation once the SDK is installed.
 */

const PARTNER_SEARCH_SERVICE_URL = process.env.PARTNER_SEARCH_SERVICE_URL;

if (!PARTNER_SEARCH_SERVICE_URL) {
  // Log at startup so misconfiguration is caught early. Not fatal — fails at request time.
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    service: 'sapphire-bff-api',
    message: 'PARTNER_SEARCH_SERVICE_URL environment variable is not set',
    environment: process.env.NODE_ENV || 'unknown',
  }));
}

const SEARCH_ENDPOINT = '/partner-service-search/api/v1/services/search';
const REQUEST_TIMEOUT_MS = 3000;

/**
 * Map a GraphQL PartnerSearchInput to the REST request body accepted by
 * sapphire-partner-service-search.
 *
 * @param {Object} input - GraphQL PartnerSearchInput
 * @param {string|null|undefined} input.query
 * @param {string|null|undefined} input.semanticQuery
 * @param {number|null|undefined} input.page
 * @param {number|null|undefined} input.pageSize
 * @returns {Object} REST request body
 */
function buildRequestBody(input) {
  return {
    keyword: input.query || undefined,
    semantic: input.semanticQuery || undefined,
    page: input.page ?? 0,
    size: Math.min(input.pageSize ?? 20, 100),
  };
}

/**
 * Map a REST ServiceSearchResultDTO to a GraphQL PartnerServiceItem.
 * NOTE: partnerName is not available in the actual DTO (only partnerId UUID).
 * Mapped to empty string — follow-up: enrich via Partner service lookup if required.
 *
 * @param {Object} dto
 * @returns {Object} PartnerServiceItem
 */
function mapResultItem(dto) {
  return {
    id: dto.id ? String(dto.id) : '',
    name: dto.name || '',
    description: dto.description || '',
    category: dto.category || '',
    // partnerName is absent in the actual DTO — see contract discrepancy note above
    partnerName: dto.partnerName || '',
  };
}

/**
 * Call sapphire-partner-service-search POST /api/v1/services/search and map the
 * response to the GraphQL HybridSearchResult shape.
 *
 * @param {Object} input - GraphQL PartnerSearchInput
 * @param {string} [traceparent] - W3C traceparent header value for OTEL propagation
 * @returns {Promise<{keywordResults: Object[], semanticResults: Object[], totalKeywordResults: number, totalSemanticResults: number}>}
 * @throws {Error} on network error, timeout, or HTTP 4xx/5xx
 */
export async function searchPartnerServices(input, traceparent) {
  if (!PARTNER_SEARCH_SERVICE_URL) {
    throw new Error('PARTNER_SEARCH_SERVICE_URL is not configured');
  }

  const url = `${PARTNER_SEARCH_SERVICE_URL}${SEARCH_ENDPOINT}`;
  const body = buildRequestBody(input);

  const headers = {
    'Content-Type': 'application/json',
  };

  // Propagate W3C traceparent for OTEL context propagation
  // TODO: Replace manual propagation with @opentelemetry/sdk-node automatic HTTP instrumentation
  if (traceparent) {
    headers['traceparent'] = traceparent;
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      const error = new Error('Partner search service timed out after 3000ms');
      error.code = 'TIMEOUT';
      error.retryable = true;
      throw error;
    }
    const error = new Error(`Partner search service network error: ${err.message}`);
    error.code = 'NETWORK_ERROR';
    error.retryable = true;
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!response.ok) {
    let errorBody = '';
    try {
      errorBody = await response.text();
    } catch (_) {
      // swallow — we only include status info in the thrown error
    }

    const error = new Error(`Partner search service returned HTTP ${response.status}`);
    error.statusCode = response.status;
    error.retryable = response.status === 503;

    if (response.status === 400) {
      error.code = 'VALIDATION_ERROR';
      error.retryable = false;
    } else if (response.status >= 500) {
      error.code = 'UPSTREAM_ERROR';
    }

    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'sapphire-bff-api',
      message: 'Partner search service HTTP error',
      statusCode: response.status,
      // Do NOT log errorBody — may contain internal server details
      environment: process.env.NODE_ENV || 'unknown',
    }));

    throw error;
  }

  /** @type {import('./types').SearchResponseDTO} */
  const data = await response.json();

  // Map nested REST response → flat GraphQL HybridSearchResult
  const keywordResults = (data.results?.keywordResults || []).map(mapResultItem);
  const semanticResults = (data.results?.semanticResults || []).map(mapResultItem);

  return {
    keywordResults,
    semanticResults,
    totalKeywordResults: typeof data.keywordResultCount === 'number' ? data.keywordResultCount : keywordResults.length,
    totalSemanticResults: typeof data.semanticResultCount === 'number' ? data.semanticResultCount : semanticResults.length,
  };
}
