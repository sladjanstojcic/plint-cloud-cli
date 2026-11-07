import pricing from '../../data/bunny-pricing.json' with { type: 'json' };

const bytesToGb = (bytes) => bytes / (1024 * 1024 * 1024);

export function estimateStorageCost(bytes, pricingData = pricing) {
  const storage = pricingData.storage.standard_edge_storage;
  const storageGb = bytesToGb(bytes);
  const rawStorageMonthly = storageGb * storage.price_per_gb_month;
  return {
    provider: pricingData.provider,
    currency: pricingData.currency,
    storage_gb: storageGb,
    raw_storage_monthly: rawStorageMonthly,
    minimum_monthly_charge: storage.minimum_monthly_charge,
    estimated_storage_monthly: Math.max(rawStorageMonthly, storage.minimum_monthly_charge),
    cdn_estimated: pricingData.cdn.included_in_estimate,
    pricing_source: pricingData.source,
    pricing_updated_at: pricingData.updated_at,
    caveats: [
      'Estimate only covers storage inferred from local bytes.',
      'The minimum monthly charge may already be covered by existing Bunny account usage.',
      'CDN bandwidth depends on visitor traffic and is not estimated.'
    ]
  };
}
