// T015: findPartners resolver unit tests — SCRUM-26 / SCRUM-28
// Uses jest.unstable_mockModule for ESM compatibility

const mockSearchPartnerServices = jest.fn();

jest.unstable_mockModule('../../../clients/partnerSearchClient.js', () => ({
  searchPartnerServices: mockSearchPartnerServices,
}));

const { default: resolvers } = await import('../../index.js');

const mockUser = { id: 'user-1', email: 'tester@example.com' };
const validContext = { user: mockUser };

const mockSearchInput = {
  query: 'yoga',
  semanticQuery: 'help me relax',
  page: 0,
  pageSize: 20,
};

const mockResult = {
  keywordResults: [{ id: 'k1', name: 'Yoga Studio', description: 'Yoga', category: 'FITNESS', partnerName: 'Studio A' }],
  semanticResults: [{ id: 's1', name: 'Meditation', description: 'Calm', category: 'WELLNESS_COACHING', partnerName: 'Studio B' }],
  totalKeywordResults: 1,
  totalSemanticResults: 1,
};

describe('findPartners resolver', () => {
  beforeEach(() => {
    mockSearchPartnerServices.mockReset();
  });

  it('happy path: returns HybridSearchResult when both query fields are provided', async () => {
    mockSearchPartnerServices.mockResolvedValue(mockResult);
    const result = await resolvers.Query.findPartners(null, { query: mockSearchInput }, validContext);
    expect(result).toEqual(mockResult);
    expect(mockSearchPartnerServices).toHaveBeenCalledTimes(1);
  });

  it('partial-query valid path: accepts query-only (semanticQuery absent)', async () => {
    mockSearchPartnerServices.mockResolvedValue({ ...mockResult, semanticResults: [], totalSemanticResults: 0 });
    const result = await resolvers.Query.findPartners(
      null,
      { query: { query: 'yoga', page: 0, pageSize: 20 } },
      validContext
    );
    expect(result).toBeDefined();
    expect(mockSearchPartnerServices).toHaveBeenCalledTimes(1);
  });

  it('empty-query rejection: throws BAD_USER_INPUT when both fields are empty', async () => {
    await expect(
      resolvers.Query.findPartners(null, { query: { query: '', semanticQuery: '' } }, validContext)
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    expect(mockSearchPartnerServices).not.toHaveBeenCalled();
  });

  it('missing JWT: throws UNAUTHENTICATED when user is absent from context', async () => {
    await expect(
      resolvers.Query.findPartners(null, { query: mockSearchInput }, { user: null })
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
    expect(mockSearchPartnerServices).not.toHaveBeenCalled();
  });

  it('REST HTTP 500: wraps upstream error, no raw details exposed', async () => {
    const upstreamErr = new Error('Internal error with sensitive details');
    upstreamErr.code = 'HTTP_500';
    mockSearchPartnerServices.mockRejectedValue(upstreamErr);

    await expect(
      resolvers.Query.findPartners(null, { query: mockSearchInput }, validContext)
    ).rejects.toMatchObject({
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    });
    // Verify safe error message (no raw upstream detail)
    try {
      await resolvers.Query.findPartners(null, { query: mockSearchInput }, validContext);
    } catch (err) {
      expect(err.message).not.toContain('sensitive details');
    }
  });

  it('REST timeout: throws SERVICE_UNAVAILABLE with retryable flag', async () => {
    const timeoutErr = new Error('Request timed out');
    timeoutErr.code = 'TIMEOUT';
    timeoutErr.retryable = true;
    mockSearchPartnerServices.mockRejectedValue(timeoutErr);

    await expect(
      resolvers.Query.findPartners(null, { query: mockSearchInput }, validContext)
    ).rejects.toMatchObject({
      extensions: { code: 'SERVICE_UNAVAILABLE', retryable: true },
    });
  });
});
