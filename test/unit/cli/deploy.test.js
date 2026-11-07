import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_CODES } from '../../../src/lib/error-codes.js';
import { stubScanDeps } from '../../helpers/scan-stub.js';

const stubDeployResult = {
  storageZoneId: '10',
  storageHostname: 'storage.bunnycdn.com',
  zonePassword: 'secret',
  pullZoneId: '11',
  pullZoneHostname: 'plint-random.b-cdn.net',
  remoteFiles: ['index.html'],
  fileCount: 1,
  bytes: 12,
  uploaded: 1,
  deleted: 0,
  unchanged: 0
};

const stubPersistDeploy = ({ project, created }) => ({
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
});

describe('deploy command project flow', () => {
  it('fails with PROJECT_NOT_FOUND in json mode when named project is missing and create is false', async () => {
    const { default: deploy } = await import('../../../src/commands/deploy.js');

    await assert.rejects(
      () =>
        deploy(
          ['dist'],
          {
            json: true,
            stdout: { write() {} },
            options: { project: 'docs', create: false }
          },
          {
            resolveApiKey: () => 'account-key',
            stat: async () => ({ isFile: () => false }),
            validateProjectName: () => {},
            isProjectNameReserved: async () => false,
            getProject: async () => null,
            ...stubScanDeps()
          }
        ),
      (error) => error.code === 'PROJECT_NOT_FOUND'
    );
  });

  it('rejects an empty directory before prompting for a project name', async () => {
    const { default: deploy } = await import('../../../src/commands/deploy.js');
    const prompts = [];
    await assert.rejects(
      () =>
        deploy(['dist'], { interactive: true, stdout: { write() {} }, options: { dryRun: true } }, {
          resolveApiKey: () => null,
          stat: async () => ({ isFile: () => false }),
          input: async () => prompts.push('input'),
          confirm: async () => prompts.push('confirm'),
          validateProjectName: () => {},
          isProjectNameReserved: async () => false,
          getProject: async () => null,
          ...stubScanDeps([])
        }),
      (error) => error.code === ERROR_CODES.DIRECTORY_EMPTY
    );
    assert.deepEqual(prompts, []);
  });

  it('creates a missing named project when create is true', async () => {
    const buffer = { value: '', write(chunk) { this.value += chunk; } };
    const { default: deploy } = await import('../../../src/commands/deploy.js');

    await deploy(
      ['dist'],
      { json: true, stdout: buffer, options: { project: 'docs', create: true } },
      {
        resolveApiKey: () => 'account-key',
        stat: async () => ({ isFile: () => false }),
        validateProjectName: () => {},
        getProject: async () => null,
        isProjectNameReserved: async () => false,
        deployCore: async () => stubDeployResult,
        persistDeploy: async (args) => stubPersistDeploy(args),
        ...stubScanDeps()
      }
    );

    const parsed = JSON.parse(buffer.value);
    assert.equal(parsed.data.project, 'docs');
    assert.equal(parsed.data.created, true);
  });

  it('hints at a known subcommand when the path looks like one', async () => {
    const { default: deploy } = await import('../../../src/commands/deploy.js');
    await assert.rejects(
      () =>
        deploy(
          ['estimate'],
          {
            json: true,
            stdout: { write() {} },
            knownCommands: ['deploy', 'estimate', 'list']
          },
          { resolveApiKey: () => 'account-key', stat: async () => null }
        ),
      (error) => {
        return (
          error.code === ERROR_CODES.UNKNOWN_COMMAND &&
          typeof error.fix === 'string' &&
          error.fix.includes('plint estimate') &&
          error.message.includes('Did you mean')
        );
      }
    );
  });

  it('does not hint for an ordinary missing path', async () => {
    const { default: deploy } = await import('../../../src/commands/deploy.js');
    await assert.rejects(
      () =>
        deploy(
          ['not-a-real-folder'],
          {
            json: true,
            stdout: { write() {} },
            knownCommands: ['deploy', 'estimate', 'list']
          },
          { resolveApiKey: () => 'account-key', stat: async () => null }
        ),
      (error) => error.code === 'PATH_NOT_FOUND' && error.fix === undefined
    );
  });

  it('dry-runs a new named project without auth when create is true', async () => {
    const buffer = { value: '', write(chunk) { this.value += chunk; } };
    const calls = [];
    const { default: deploy } = await import('../../../src/commands/deploy.js');
    await deploy(['dist'], { json: true, stdout: buffer, options: { project: 'docs', create: true, dryRun: true } }, {
      resolveApiKey: () => null,
      stat: async () => ({ isFile: () => false }),
      validateProjectName: () => {},
      isProjectNameReserved: async () => false,
      getProject: async () => null,
      scanLocalTarget: async () => ({ path: '/tmp/dist', targetType: 'directory', files: [{ path: 'index.html', size: 12 }], warnings: [] }),
      summarizeScan: ({ files }) => ({ file_count: files.length, bytes: 12, warnings: [] }),
      deployCore: async () => calls.push('deployCore'),
      persistDeploy: async () => calls.push('persistDeploy')
    });
    const parsed = JSON.parse(buffer.value);
    assert.equal(parsed.data.dry_run, true);
    assert.equal(parsed.data.project, 'docs');
    assert.deepEqual(calls, []);
  });

  it('rejects empty new-project dry-runs like real deploys', async () => {
    const { default: deploy } = await import('../../../src/commands/deploy.js');
    await assert.rejects(
      () =>
        deploy(
          ['dist'],
          {
            json: true,
            stdout: { write() {} },
            options: { project: 'docs', create: true, dryRun: true }
          },
          {
            resolveApiKey: () => null,
            stat: async () => ({ isFile: () => false }),
            validateProjectName: () => {},
            isProjectNameReserved: async () => false,
            getProject: async () => null,
            scanLocalTarget: async () => ({
              path: '/tmp/dist',
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
          }
        ),
      (error) => error.code === ERROR_CODES.DIRECTORY_EMPTY
    );
  });

  it('dry-runs an existing project and returns changes without persisting', async () => {
    const buffer = { value: '', write(chunk) { this.value += chunk; } };
    const calls = [];
    const { default: deploy } = await import('../../../src/commands/deploy.js');
    await deploy(['dist'], { json: true, stdout: buffer, options: { project: 'docs', dryRun: true } }, {
      resolveApiKey: () => 'account-key',
      stat: async () => ({ isFile: () => false }),
      validateProjectName: () => {},
      isProjectNameReserved: async () => false,
      getProject: async () => ({ binding: { storage_zone_id: '10', pull_zone_id: '11', storage_hostname: 's', pull_zone_hostname: 'h', zone_password: 'p' } }),
      scanLocalTarget: async () => ({ path: '/tmp/dist', targetType: 'directory', files: [{ path: 'index.html', size: 12 }], warnings: [] }),
      summarizeScan: ({ files }) => ({ file_count: files.length, bytes: 12, warnings: [] }),
      deployCore: async () => ({ toUpload: [{ path: 'index.html', size: 12 }], toDelete: ['old.html'], unchanged: 1 }),
      persistDeploy: async () => calls.push('persistDeploy')
    });
    const parsed = JSON.parse(buffer.value);
    assert.equal(parsed.data.uploaded, 1);
    assert.equal(parsed.data.deleted, 1);
    assert.equal(parsed.data.unchanged, 1);
    assert.deepEqual(calls, []);
  });
});

describe('deploy command: non-interactive without -p', () => {
  it('throws PROJECT_REQUIRED in JSON mode with no project flag', async () => {
    const { default: deploy } = await import('../../../src/commands/deploy.js');
    await assert.rejects(
      () =>
        deploy(
          ['/tmp'],
          {
            json: true,
            interactive: false,
            stdout: { write: () => true },
            stderr: { write: () => true },
            options: {},
            knownCommands: ['deploy', 'estimate']
          },
          {
            stat: async () => ({ isDirectory: () => true, isFile: () => false }),
            resolveApiKey: () => 'key',
            validateProjectName: () => {},
            isProjectNameReserved: async () => false,
            getProject: async () => null,
            deployCore: async () => stubDeployResult,
            persistDeploy: async (args) => stubPersistDeploy(args),
            scanLocalTarget: async () => ({
              path: '/tmp',
              targetType: 'directory',
              files: [],
              warnings: []
            }),
            summarizeScan: () => ({ file_count: 0, bytes: 0, warnings: [] })
          }
        ),
      (error) => error.code === ERROR_CODES.PROJECT_REQUIRED
    );
  });
});
