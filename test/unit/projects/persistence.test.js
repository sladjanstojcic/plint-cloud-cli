import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  persistDeploy,
  persistDestroy
} from '../../../src/lib/projects/persistence.js';

const stubResult = {
  storageZoneId: 10,
  storageHostname: 'storage.bunnycdn.com',
  zonePassword: 'secret',
  pullZoneId: 11,
  pullZoneHostname: 'plint-abc.b-cdn.net',
  remoteFiles: ['index.html'],
  fileCount: 1,
  bytes: 12,
  uploaded: 1,
  deleted: 0,
  unchanged: 0
};

describe('persistDeploy', () => {
  it('saves state, appends history, and returns the deploy payload', async () => {
    const calls = [];

    const payload = await persistDeploy(
      { project: 'docs', result: stubResult, created: true },
      {
        deployUrl: () => ({ url: 'https://plint-abc.b-cdn.net/' }),
        upsertProject: async (project, value) => {
          calls.push(['upsertProject', project, value]);
        },
        appendHistory: async (record) => {
          calls.push(['appendHistory', record.op, record.ok]);
        }
      }
    );

    assert.equal(payload.project, 'docs');
    assert.equal(payload.url, 'https://plint-abc.b-cdn.net/');
    assert.equal(payload.zone_id, '10');
    assert.equal(payload.cdn_id, '11');
    assert.equal(payload.created, true);
    assert.equal(calls.length, 2);
    assert.equal(calls[0][0], 'upsertProject');
    assert.equal(calls[1][0], 'appendHistory');
  });

  it('includes local_path, warnings, and cache_purge in the deploy payload', async () => {
    const payload = await persistDeploy(
      {
        project: 'docs',
        created: true,
        result: {
          storageZoneId: '10',
          zoneName: 'z',
          storageHostname: 's',
          zonePassword: 'p',
          pullZoneId: '11',
          pullZoneHostname: 'docs.b-cdn.net',
          remoteFiles: ['index.html'],
          fileCount: 1,
          bytes: 12,
          uploaded: 1,
          deleted: 0,
          unchanged: 0,
          localPath: '/tmp/site',
          warnings: [
            { code: 'SKIPPED_SYMLINK', message: 'Skipped symlink: link.txt', path: 'link.txt', severity: 'warning' }
          ],
          cachePurge: 'purged'
        }
      },
      {
        deployUrl: () => ({ url: 'https://docs.b-cdn.net/' }),
        appendHistory: async () => {},
        upsertProject: async () => {},
        removeProject: async () => {},
        reserveProjectName: async () => {}
      }
    );
    assert.equal(payload.local_path, '/tmp/site');
    assert.equal(payload.cache_purge, 'purged');
    assert.deepEqual(payload.warnings, [
      { code: 'SKIPPED_SYMLINK', message: 'Skipped symlink: link.txt', path: 'link.txt', severity: 'warning' }
    ]);
  });
});

describe('persistDestroy', () => {
  it('removes the project, reserves the name, appends history, and returns the payload', async () => {
    const calls = [];
    const entry = {
      url: 'https://plint-abc.b-cdn.net/',
      binding: { storage_zone_id: '10', pull_zone_id: '11' }
    };

    const payload = await persistDestroy(
      { project: 'docs', entry },
      {
        removeProject: async (project) => calls.push(['removeProject', project]),
        reserveProjectName: async (project) => calls.push(['reserveProjectName', project]),
        appendHistory: async (record) => calls.push(['appendHistory', record.op, record.url])
      }
    );

    assert.deepEqual(payload, { project: 'docs', zone_id: '10', cdn_id: '11' });
    assert.deepEqual(calls, [
      ['removeProject', 'docs'],
      ['reserveProjectName', 'docs'],
      ['appendHistory', 'destroy', 'https://plint-abc.b-cdn.net/']
    ]);
  });
});
