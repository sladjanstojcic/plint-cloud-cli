import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deployHandler, deployInput } from '../../../src/mcp/tools/deploy.js';
import { stubScanDeps } from '../../helpers/scan-stub.js';

describe('mcp deploy tool', () => {
  it('requires project in the input schema', () => {
    assert.equal(deployInput.safeParse({ path: '/tmp/site' }).success, false);
  });

  it('returns PROJECT_NOT_FOUND when create is false and the project is missing', async () => {
    const handler = deployHandler({
      getProject: async () => null,
      validateProjectName: () => {},
      isProjectNameReserved: async () => false
    });

    const result = await handler({ path: '/tmp/site', project: 'docs' });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.code, 'PROJECT_NOT_FOUND');
  });

  it('creates a missing project when create is true', async () => {
    const handler = deployHandler({
      getProject: async () => null,
      validateProjectName: () => {},
      isProjectNameReserved: async () => false,
      ...stubScanDeps(),
      deployCore: async () => ({
        storageZoneId: '10',
        pullZoneId: '11',
        pullZoneHostname: 'plint-random.b-cdn.net',
        remoteFiles: ['index.html'],
        fileCount: 1,
        bytes: 12,
        uploaded: 1,
        deleted: 0,
        unchanged: 0
      }),
      persistDeploy: async ({ project, created }) => ({
        project,
        url: 'https://plint-random.b-cdn.net/',
        zone_id: '10',
        cdn_id: '11',
        file_count: 1,
        bytes: 12,
        uploaded: 1,
        deleted: 0,
        unchanged: 0,
        created
      })
    });

    const result = await handler({ path: '/tmp/site', project: 'docs', create: true });
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.project, 'docs');
    assert.equal(result.structuredContent.created, true);
  });

  it('updates an existing project', async () => {
    const handler = deployHandler({
      getProject: async () => ({
        binding: {
          storage_zone_id: '10',
          pull_zone_id: '11',
          storage_hostname: 'storage.bunnycdn.com',
          pull_zone_hostname: 'plint-random.b-cdn.net',
          zone_password: 'secret'
        }
      }),
      validateProjectName: () => {},
      isProjectNameReserved: async () => false,
      ...stubScanDeps(),
      deployCore: async () => ({
        storageZoneId: '10',
        pullZoneId: '11',
        pullZoneHostname: 'plint-random.b-cdn.net',
        remoteFiles: ['index.html'],
        fileCount: 1,
        bytes: 12,
        uploaded: 0,
        deleted: 0,
        unchanged: 1
      }),
      persistDeploy: async ({ project, created }) => ({
        project,
        url: 'https://plint-random.b-cdn.net/',
        zone_id: '10',
        cdn_id: '11',
        file_count: 1,
        bytes: 12,
        uploaded: 0,
        deleted: 0,
        unchanged: 1,
        created
      })
    });

    const result = await handler({ path: '/tmp/site', project: 'docs' });
    assert.equal(result.structuredContent.created, false);
    assert.equal(result.structuredContent.unchanged, 1);
  });

  it('dry-runs a new project without persisting', async () => {
    const calls = [];
    const handler = deployHandler({
      getProject: async () => null,
      validateProjectName: () => {},
      isProjectNameReserved: async () => false,
      scanLocalTarget: async () => ({ path: '/tmp/site', targetType: 'directory', files: [{ path: 'index.html', size: 12 }], warnings: [] }),
      summarizeScan: ({ files }) => ({ file_count: files.length, bytes: 12, warnings: [] }),
      deployCore: async () => calls.push('deployCore'),
      persistDeploy: async () => calls.push('persistDeploy')
    });
    const result = await handler({ path: '/tmp/site', project: 'docs', create: true, dry_run: true });
    assert.equal(result.structuredContent.dry_run, true);
    assert.equal(result.structuredContent.project, 'docs');
    assert.deepEqual(calls, []);
  });

  it('rejects empty new-project dry-runs like real deploys', async () => {
    const handler = deployHandler({
      getProject: async () => null,
      validateProjectName: () => {},
      isProjectNameReserved: async () => false,
      scanLocalTarget: async () => ({
        path: '/tmp/site',
        targetType: 'directory',
        files: [],
        warnings: []
      }),
      summarizeScan: ({ path, targetType, files, warnings }) => ({
        path,
        target_type: targetType,
        file_count: files.length,
        bytes: 0,
        warnings
      }),
      deployCore: async () => {
        throw new Error('deployCore should not run for new dry-runs');
      },
      persistDeploy: async () => {
        throw new Error('persistDeploy should not run for dry-runs');
      }
    });
    const result = await handler({
      path: '/tmp/site',
      project: 'docs',
      create: true,
      dry_run: true
    });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.code, 'DIRECTORY_EMPTY');
  });

  it('dry-runs an existing project through deployCore comparison without persisting', async () => {
    const calls = [];
    const handler = deployHandler({
      getProject: async () => ({ binding: { storage_zone_id: '10', pull_zone_id: '11', storage_hostname: 's', pull_zone_hostname: 'h', zone_password: 'p' } }),
      validateProjectName: () => {},
      isProjectNameReserved: async () => false,
      scanLocalTarget: async () => ({ path: '/tmp/site', targetType: 'directory', files: [{ path: 'index.html', size: 12 }], warnings: [] }),
      summarizeScan: ({ files }) => ({ file_count: files.length, bytes: 12, warnings: [] }),
      deployCore: async () => ({ toUpload: [{ path: 'index.html', size: 12 }], toDelete: ['old.html'], unchanged: 2 }),
      persistDeploy: async () => calls.push('persistDeploy')
    });
    const result = await handler({ path: '/tmp/site', project: 'docs', dry_run: true });
    assert.equal(result.structuredContent.uploaded, 1);
    assert.equal(result.structuredContent.deleted, 1);
    assert.equal(result.structuredContent.unchanged, 2);
    assert.deepEqual(calls, []);
  });

  it('rejects dry-run on a missing project without create intent', async () => {
    const handler = deployHandler({
      getProject: async () => null,
      validateProjectName: () => {},
      isProjectNameReserved: async () => false,
      scanLocalTarget: async () => {
        throw new Error('scanLocalTarget should not run when the project is missing and create is false');
      },
      summarizeScan: () => ({}),
      deployCore: async () => {
        throw new Error('deployCore should not run in this branch');
      },
      persistDeploy: async () => {
        throw new Error('persistDeploy should not run in this branch');
      }
    });
    const result = await handler({ path: '/tmp/site', project: 'docs', dry_run: true });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.code, 'PROJECT_NOT_FOUND');
  });

  it('maps PROJECT_STALE from deployCore to an errorResult', async () => {
    const handler = deployHandler({
      getProject: async () => ({
        binding: {
          storage_zone_id: '1',
          pull_zone_id: '2',
          storage_hostname: 's',
          pull_zone_hostname: 'h',
          zone_password: 'p'
        }
      }),
      validateProjectName: () => {},
      isProjectNameReserved: async () => false,
      ...stubScanDeps(),
      deployCore: async () => {
        const error = new Error('stale');
        error.code = 'PROJECT_STALE';
        throw error;
      }
    });

    const result = await handler({ path: '/tmp/site', project: 'docs' });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.code, 'PROJECT_STALE');
  });

  it('maps dry-run errors from deployCore the same way as real deploys', async () => {
    const handler = deployHandler({
      getProject: async () => ({ binding: { storage_zone_id: '1', pull_zone_id: '2', storage_hostname: 's', pull_zone_hostname: 'h', zone_password: 'p' } }),
      validateProjectName: () => {},
      isProjectNameReserved: async () => false,
      ...stubScanDeps(),
      deployCore: async () => {
        const error = new Error('stale');
        error.code = 'PROJECT_STALE';
        throw error;
      }
    });
    const result = await handler({ path: '/tmp/site', project: 'docs', dry_run: true });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.code, 'PROJECT_STALE');
  });

  it('maps a missing path to PATH_NOT_FOUND in dry-run', async () => {
    const handler = deployHandler({
      getProject: async () => null,
      validateProjectName: () => {},
      isProjectNameReserved: async () => false
    });
    const result = await handler({
      path: '/definitely/not/here/plint-test',
      project: 'docs',
      create: true,
      dry_run: true
    });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.code, 'PATH_NOT_FOUND');
  });

  it('refuses top-level paths before scanning', async () => {
    const handler = deployHandler({
      getProject: async () => null,
      validateProjectName: () => {},
      isProjectNameReserved: async () => false,
      scanLocalTarget: async () => {
        throw new Error('scanLocalTarget must not run for unsafe paths');
      }
    });
    const result = await handler({ path: '/', project: 'docs', create: true });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.code, 'PATH_UNSAFE');
  });

  it('passes its scan to deployCore so the tree is walked once', async () => {
    let received;
    const handler = deployHandler({
      getProject: async () => null,
      validateProjectName: () => {},
      isProjectNameReserved: async () => false,
      ...stubScanDeps(),
      deployCore: async (input) => {
        received = input;
        throw Object.assign(new Error('stop'), { code: 'AUTH_MISSING' });
      }
    });
    await handler({ path: '/tmp/site', project: 'docs', create: true });
    assert.equal(received.scan.files.length, 1);
  });
});
