import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  persistBinding,
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

describe('persistBinding', () => {
  it('records a new project as soon as its zones exist, before any upload', async () => {
    const calls = [];
    await persistBinding(
      {
        project: 'docs',
        config: {
          zoneId: 10,
          zoneName: 'plint-abc',
          zonePassword: 'secret',
          storageHostname: 'storage.bunnycdn.com',
          pullZoneId: 11,
          pullZoneHostname: 'plint-abc.b-cdn.net'
        }
      },
      { upsertProject: async (project, value) => calls.push([project, value]) }
    );
    assert.deepEqual(calls, [[
      'docs',
      {
        url: 'https://plint-abc.b-cdn.net/',
        last_deploy_at: null,
        binding: {
          storage_zone_id: '10',
          pull_zone_id: '11',
          storage_hostname: 'storage.bunnycdn.com',
          pull_zone_hostname: 'plint-abc.b-cdn.net',
          zone_name: 'plint-abc',
          zone_password: 'secret'
        }
      }
    ]]);
  });
});

describe('persistDeploy project URL', () => {
  const singleFile = { ...stubResult, remoteFiles: ['report.pdf'], targetType: 'file' };
  const capture = () => {
    const saved = {};
    return { saved, deps: { upsertProject: async (_p, value) => Object.assign(saved, value), appendHistory: async () => {} } };
  };

  it('keeps the existing project URL when a single file is added to it', async () => {
    const { saved, deps } = capture();
    const payload = await persistDeploy(
      { project: 'docs', result: singleFile, created: false, previousUrl: 'https://plint-abc.b-cdn.net/' },
      deps
    );
    assert.equal(saved.url, 'https://plint-abc.b-cdn.net/');
    assert.equal(payload.url, 'https://plint-abc.b-cdn.net/');
  });

  it('points a new single-file project at its file', async () => {
    const { saved, deps } = capture();
    await persistDeploy({ project: 'report', result: singleFile, created: true }, deps);
    assert.equal(saved.url, 'https://plint-abc.b-cdn.net/report.pdf');
  });

  it('recomputes the URL on a folder deploy', async () => {
    const { saved, deps } = capture();
    await persistDeploy(
      { project: 'docs', result: { ...stubResult, targetType: 'directory' }, created: false, previousUrl: 'https://plint-abc.b-cdn.net/old.pdf' },
      deps
    );
    assert.equal(saved.url, 'https://plint-abc.b-cdn.net/');
  });
});
