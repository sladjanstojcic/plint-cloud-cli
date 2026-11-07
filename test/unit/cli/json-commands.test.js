import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stubScanDeps } from '../../helpers/scan-stub.js';

const createBuffer = () => {
  let value = '';
  return {
    stream: { write: (chunk) => { value += chunk; } },
    read: () => value
  };
};

describe('deploy JSON mode', () => {
  it('returns deploy output with project and url', async () => {
    const buffer = createBuffer();
    const { default: deploy } = await import('../../../src/commands/deploy.js');

    await deploy(
      ['dist'],
      {
        json: true,
        stdout: buffer.stream,
        options: { project: 'docs', create: true }
      },
      {
      resolveApiKey: () => 'account-key',
      stat: async () => ({ isFile: () => false }),
      validateProjectName: () => {},
      getProject: async () => null,
      isProjectNameReserved: async () => false,
      ...stubScanDeps(),
      deployCore: async () => ({
        storageZoneId: '10',
        storageHostname: 'storage.bunnycdn.com',
        zonePassword: 'secret',
        pullZoneId: '11',
        pullZoneHostname: 'plint-docs.b-cdn.net',
        remoteFiles: ['index.html'],
        fileCount: 1,
        bytes: 12,
        uploaded: 1,
        deleted: 0,
        unchanged: 0
      }),
      persistDeploy: async ({ project, created }) => ({
        project,
        url: 'https://plint-docs.b-cdn.net/',
        zone_id: '10',
        cdn_id: '11',
        file_count: 1,
        bytes: 12,
        uploaded: 1,
        deleted: 0,
        unchanged: 0,
        created
      })
    }
    );

    const parsed = JSON.parse(buffer.read());
    assert.equal(parsed.command, 'deploy');
    assert.equal(parsed.data.project, 'docs');
    assert.equal(parsed.data.url, 'https://plint-docs.b-cdn.net/');
  });
});

describe('list JSON mode', () => {
  it('lists local projects in json mode', async () => {
    const buffer = createBuffer();
    const { default: list } = await import('../../../src/commands/list.js');

    await list([], { json: true, stdout: buffer.stream }, {
      listProjects: async () => ({
        docs: {
          url: 'https://plint-xyz.b-cdn.net/',
          last_deploy_at: '2026-04-18T10:00:00Z',
          binding: {
            storage_zone_id: '10',
            pull_zone_id: '11'
          }
        }
      }),
      formatProjectRow: (project, entry) => ({
        project,
        zone_id: entry.binding.storage_zone_id,
        cdn_id: entry.binding.pull_zone_id,
        url: entry.url,
        last_deploy_at: entry.last_deploy_at
      })
    });

    const parsed = JSON.parse(buffer.read());
    assert.equal(parsed.data.projects[0].project, 'docs');
  });
});
