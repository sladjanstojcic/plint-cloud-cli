import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { estimateStorageCost } from '../../../src/lib/preflight/pricing.js';

describe('preflight pricing', () => {
  it('estimates storage from local bytes without CDN claims', () => {
    const estimate = estimateStorageCost(42_800_000);
    assert.equal(estimate.provider, 'bunny');
    assert.equal(estimate.currency, 'USD');
    assert.equal(estimate.minimum_monthly_charge, 1);
    assert.equal(estimate.estimated_storage_monthly, 1);
    assert.equal(estimate.cdn_estimated, false);
    assert.equal(estimate.pricing_source, 'https://docs.bunny.net/storage/pricing');
    assert.ok(estimate.storage_gb > 0.039);
    assert.ok(estimate.raw_storage_monthly < 0.001);
    assert.ok(estimate.caveats.some((item) => item.includes('CDN bandwidth')));
  });
});
