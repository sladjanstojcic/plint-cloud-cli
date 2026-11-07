import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createPullZone, createStorageZone, deleteStorageZone, getPullZone, getStorageZone, purgePullZone } from '../../src/lib/bunny.js';
import { listRemoteFiles, uploadRemoteFile, waitForStorageReady } from '../../src/lib/storage.js';
import { buildSingleFileEntry } from '../../src/lib/files.js';

const apiKey = process.env.BUNNY_API_KEY || process.env.BUNNY_API_KEY_TEST;
const run = apiKey ? test : test.skip;

run('Bunny round-trip', async () => {
  const zoneName = `plint-itest-${Date.now().toString(36)}`;
  const workDir = join(tmpdir(), `plint-itest-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });
  await writeFile(join(workDir, 'index.html'), '<!doctype html><h1>ok</h1>');

  let zoneId;
  let pullZoneId;

  try {
    const zone = await createStorageZone(apiKey, zoneName);
    zoneId = zone.Id;

    const pullZone = await createPullZone(apiKey, zone.Name, zone.Id);
    pullZoneId = pullZone.Id;

    const config = {
      zoneId: zone.Id,
      zoneName: zone.Name,
      zonePassword: zone.Password,
      region: zone.Region,
      storageHostname: zone.StorageHostname,
      pullZoneId: pullZone.Id,
      pullZoneUrl: `https://${pullZone.Hostnames.find((hostname) => hostname.IsSystemHostname).Value}`
    };

    await waitForStorageReady(config);

    const file = await buildSingleFileEntry(workDir, join(workDir, 'index.html'));
    await uploadRemoteFile(config, file.path, file.localPath, file.checksum);

    const remoteFiles = await listRemoteFiles(config);
    assert.deepEqual(remoteFiles, [{ path: 'index.html', size: file.size, checksum: file.checksum }]);

    await purgePullZone(apiKey, pullZoneId);
    assert.equal((await getStorageZone(apiKey, zoneId)).Id, zoneId);
  } finally {
    if (zoneId) {
      await deleteStorageZone(apiKey, zoneId);
      await assert.rejects(() => getPullZone(apiKey, pullZoneId), (error) => error.status === 404);
    }
    await rm(workDir, { recursive: true, force: true });
  }
});
