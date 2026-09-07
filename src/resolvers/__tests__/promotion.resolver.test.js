/**
 * @file promotion.resolver.test.js
 * Jest unit tests for the activePromotion resolver in src/resolvers/index.js.
 *
 * Tests the four behaviour rows defined in contracts/graphql-api.md:
 *  (a) FREE-tier JWT + datasource returns data    → resolver returns Promotion object
 *  (b) premium-tier JWT                           → resolver returns null without calling datasource
 *  (c) missing context.user                       → resolver throws UNAUTHENTICATED
 *  (d) PromotionAPI.getActivePromotion returns null → resolver returns null
 *
 * All tests are isolated — no network, no database.
 */

import { resolvers } from '../index.js';

const activePromotion = resolvers.Query.activePromotion;

// Shared promotion fixture
const promotionFixture = {
  id: 'promo-uuid-001',
  title: 'Summer Upgrade',
  badgeLabel: 'SAVE 20%',
  bodyText: 'Upgrade to Premium today!',
  ctaLabel: 'Upgrade Now',
  ctaUrl: 'https://example.com/upgrade',
  backgroundColour: '#1A73E8',
  textColour: '#FFFFFF',
  targetTier: 'FREE',
  startsAt: new Date('2026-01-01T00:00:00Z').toISOString(),
  expiresAt: new Date('2026-12-31T23:59:59Z').toISOString(),
};

// ────────────────────────────────────────────────────────────────────────────
// (a) FREE-tier user with active promotion → returns Promotion object
// ────────────────────────────────────────────────────────────────────────────
describe('activePromotion resolver — FREE tier with active promotion', () => {
  it('returns the promotion data with ISO-8601 date strings', async () => {
    const mockGetActivePromotion = jest.fn().mockResolvedValue(promotionFixture);
    const context = {
      user: { sub: 'user-1', 'custom:tier': 'FREE' },
      dataSources: { promotionAPI: { getActivePromotion: mockGetActivePromotion } },
    };

    const result = await activePromotion(null, {}, context);

    expect(result).not.toBeNull();
    expect(result.id).toBe('promo-uuid-001');
    expect(result.title).toBe('Summer Upgrade');
    expect(result.ctaLabel).toBe('Upgrade Now');
    expect(mockGetActivePromotion).toHaveBeenCalledWith('FREE');
    expect(mockGetActivePromotion).toHaveBeenCalledTimes(1);
  });

  it('normalises startsAt and expiresAt to ISO-8601 strings', async () => {
    const mockGetActivePromotion = jest.fn().mockResolvedValue(promotionFixture);
    const context = {
      user: { 'custom:tier': 'FREE' },
      dataSources: { promotionAPI: { getActivePromotion: mockGetActivePromotion } },
    };

    const result = await activePromotion(null, {}, context);

    expect(typeof result.startsAt).toBe('string');
    expect(typeof result.expiresAt).toBe('string');
    // Must be valid ISO-8601
    expect(() => new Date(result.startsAt)).not.toThrow();
    expect(() => new Date(result.expiresAt)).not.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// (b) PREMIUM-tier user → returns null without calling datasource
// ────────────────────────────────────────────────────────────────────────────
describe('activePromotion resolver — PREMIUM tier', () => {
  it('returns null and never calls PromotionAPI', async () => {
    const mockGetActivePromotion = jest.fn();
    const context = {
      user: { sub: 'user-2', 'custom:tier': 'PREMIUM' },
      dataSources: { promotionAPI: { getActivePromotion: mockGetActivePromotion } },
    };

    const result = await activePromotion(null, {}, context);

    expect(result).toBeNull();
    expect(mockGetActivePromotion).not.toHaveBeenCalled();
  });

  it('returns null for any non-FREE tier value', async () => {
    const mockGetActivePromotion = jest.fn();
    const context = {
      user: { 'custom:tier': 'ENTERPRISE' },
      dataSources: { promotionAPI: { getActivePromotion: mockGetActivePromotion } },
    };

    const result = await activePromotion(null, {}, context);
    expect(result).toBeNull();
    expect(mockGetActivePromotion).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// (c) Missing context.user → throws UNAUTHENTICATED
// ────────────────────────────────────────────────────────────────────────────
describe('activePromotion resolver — unauthenticated', () => {
  it('throws GraphQLError with UNAUTHENTICATED code when user is null', async () => {
    const context = { user: null, dataSources: {} };

    await expect(activePromotion(null, {}, context)).rejects.toMatchObject({
      extensions: { code: 'UNAUTHENTICATED' },
    });
  });

  it('throws GraphQLError with UNAUTHENTICATED code when user is undefined', async () => {
    const context = { dataSources: {} };

    await expect(activePromotion(null, {}, context)).rejects.toMatchObject({
      extensions: { code: 'UNAUTHENTICATED' },
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// (d) PromotionAPI returns null (204 from backend) → resolver returns null
// ────────────────────────────────────────────────────────────────────────────
describe('activePromotion resolver — no active promotion (204)', () => {
  it('returns null when PromotionAPI.getActivePromotion resolves to null', async () => {
    const mockGetActivePromotion = jest.fn().mockResolvedValue(null);
    const context = {
      user: { 'custom:tier': 'FREE' },
      dataSources: { promotionAPI: { getActivePromotion: mockGetActivePromotion } },
    };

    const result = await activePromotion(null, {}, context);

    expect(result).toBeNull();
    expect(mockGetActivePromotion).toHaveBeenCalledWith('FREE');
  });
});
