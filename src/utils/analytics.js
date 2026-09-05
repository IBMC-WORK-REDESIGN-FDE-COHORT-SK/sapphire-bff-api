import { Analytics } from '@segment/analytics-node';

let analyticsClient = null;

/**
 * Initialize the Segment Analytics Node.js client.
 * Called once at server startup.
 */
export function initializeAnalytics() {
  const writeKey = process.env.SEGMENT_WRITE_KEY;

  if (!writeKey) {
    console.warn('⚠️  SEGMENT_WRITE_KEY not set – analytics calls will be no-ops.');
    return;
  }

  analyticsClient = new Analytics({ writeKey });
  console.log('✅ Segment analytics (server-side) initialized');
}

/**
 * Track a custom event via Segment.
 * @param {string} userId
 * @param {string} event
 * @param {Record<string, any>} [properties]
 */
export function track(userId, event, properties = {}) {
  if (!analyticsClient) return Promise.resolve();
  return new Promise((resolve, reject) => {
    analyticsClient.track({ userId, event, properties }, (err) => {
      if (err) {
        console.error('[Analytics] track – delivery error:', err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Identify a user via Segment.
 * @param {string} userId
 * @param {Record<string, any>} [traits]
 */
export function identify(userId, traits = {}) {
  if (!analyticsClient) return Promise.resolve();
  return new Promise((resolve, reject) => {
    analyticsClient.identify({ userId, traits }, (err) => {
      if (err) {
        console.error('[Analytics] identify – delivery error:', err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Track a page view via Segment.
 * @param {string} userId
 * @param {string} [name]
 * @param {Record<string, any>} [properties]
 */
export function page(userId, name, properties = {}) {
  if (!analyticsClient) return Promise.resolve();
  return new Promise((resolve, reject) => {
    analyticsClient.page({ userId, name, properties }, (err) => {
      if (err) {
        console.error('[Analytics] page – delivery error:', err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Flush all pending events (useful for graceful shutdown).
 */
export async function flushAnalytics() {
  if (!analyticsClient) return;
  await analyticsClient.closeAndFlush();
}

// Made with Bob