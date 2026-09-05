// T016: partnerSearchClient unit tests — SCRUM-26 / SCRUM-28

const mockFetch = jest.fn();
global.fetch = mockFetch;

// Workaround: module uses top-level env var check at import time
process.env.PARTNER_SEARCH_SERVICE_URL = 'http://test-partner-search:8080';

const { searchPartnerServices } = await import('../../partnerSearchClient.js');

const validInput = {
  query: 'yoga',
  semanticQuery: 'relaxing exercise',
  page: 0,
  pageSize: 20,
};

const mockServiceResponse = {
  results: {
    keywordResults: [
      { serviceId: 'svc-1', serviceName: 'Yoga Class', serviceDescription: 'Daily yoga', category: 'FITNESS', partnerId: 'partner-1' },
    ],
    semanticResults: [
      { serviceId: 'svc-2', serviceName: 'Meditation', serviceDescription: 'Calm', category: 'WELLNESS_COACHING', partnerId: 'partner-2' },
    ],
  },
  totalKeywordResults: 1,
  totalSemanticResults: 1,
};

function makeOkResponse(body) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  };
}

function makeErrorResponse(status) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ error: `HTTP ${status}` }),
  };
}

describe('partnerSearchClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('uses PARTNER_SEARCH_SERVICE_URL env var (no hardcoded URL)', async () => {
    mockFetch.mockResolvedValue(makeOkResponse(mockServiceResponse));
    await searchPartnerServices(validInput);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('http://test-partner-search:8080'),
      expect.any(Object)
    );
  });

  it('constructs correct JSON request body with mapped field names', async () => {
    mockFetch.mockResolvedValue(makeOkResponse(mockServiceResponse));
    await searchPartnerServices(validInput);
    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({ keyword: 'yoga', semantic: 'relaxing exercise', page: 0, size: 20 });
    // Assert old contract field names are NOT used
    expect(body.query).toBeUndefined();
    expect(body.semanticQuery).toBeUndefined();
    expect(body.pageSize).toBeUndefined();
  });

  it('propagates W3C traceparent header when provided', async () => {
    mockFetch.mockResolvedValue(makeOkResponse(mockServiceResponse));
    await searchPartnerServices(validInput, '00-traceid-spanid-01');
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['traceparent']).toBe('00-traceid-spanid-01');
  });

  it('translates HTTP 400 response to a typed error', async () => {
    mockFetch.mockResolvedValue(makeErrorResponse(400));
    await expect(searchPartnerServices(validInput)).rejects.toMatchObject({ code: 'HTTP_400' });
  });

  it('translates HTTP 500 response to a typed error', async () => {
    mockFetch.mockResolvedValue(makeErrorResponse(500));
    await expect(searchPartnerServices(validInput)).rejects.toMatchObject({ code: 'HTTP_500' });
  });

  it('translates HTTP 503 response to a retryable error', async () => {
    mockFetch.mockResolvedValue(makeErrorResponse(503));
    await expect(searchPartnerServices(validInput)).rejects.toMatchObject({
      code: 'HTTP_503',
      retryable: true,
    });
  });
});
