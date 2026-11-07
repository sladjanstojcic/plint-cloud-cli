#!/usr/bin/env node
import { listStorageZones, deleteStorageZone } from '../src/lib/bunny.js';
import { resolveApiKey } from '../src/lib/config.js';

const apiKey = resolveApiKey();
if (!apiKey) {
  console.error('Missing Bunny API key.');
  process.exit(1);
}

const zones = await listStorageZones(apiKey);
for (const zone of zones) {
  if (zone.Name.startsWith('plint-itest-')) {
    await deleteStorageZone(apiKey, zone.Id, { deleteLinkedPullZones: true }).catch(() => {});
    console.log(`deleted ${zone.Name}`);
  }
}
