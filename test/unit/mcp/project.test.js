import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  destroyHandler,
  filesHandler,
  historyHandler,
  inspectHandler,
  listHandler,
  purgeHandler
} from '../../../src/mcp/tools/project.js';

describe('mcp project tools', () => {
  it('lists local projects only', async () => {
    const result = await listHandler({
      resolveApiKey: () => 'account-key',
      listStorageZones: async () => [{ Id: 1, Name: 'internal-zone' }],
      listProjects: async () => ({
        docs: {
          url: 'https://example.b-cdn.net/',
          last_deploy_at: '2026-04-18T10:00:00Z',
          binding: { storage_zone_id: '1', pull_zone_id: '2' }
        }
      }),
      formatProjectRow: (project, entry) => ({
        project,
        zone_id: entry.binding.storage_zone_id,
        cdn_id: entry.binding.pull_zone_id,
        url: entry.url,
        last_deploy_at: entry.last_deploy_at
      })
    })();

    assert.equal(result.structuredContent.projects[0].project, 'docs');
  });

  it('purges a project', async () => {
    let purged = null;
    const result = await purgeHandler({
      resolveApiKey: () => 'account-key',
      getProject: async () => ({ binding: { pull_zone_id: '11' } }),
      purgePullZone: async (_apiKey, cdnId) => {
        purged = cdnId;
      }
    })({ project: 'docs' });

    assert.equal(result.structuredContent.cdn_id, '11');
    assert.equal(purged, '11');
  });

  it('destroys a project', async () => {
    const calls = [];
    const result = await destroyHandler({
      resolveApiKey: () => 'account-key',
      getProject: async () => ({
        url: 'https://example.b-cdn.net/',
        binding: { storage_zone_id: '10', pull_zone_id: '11' }
      }),
      deleteStorageZone: async (_apiKey, zoneId) =>
        calls.push(['deleteStorageZone', zoneId]),
      persistDestroy: async ({ project, entry }) => {
        calls.push(['persistDestroy', project]);
        return {
          project,
          zone_id: entry.binding.storage_zone_id,
          cdn_id: entry.binding.pull_zone_id
        };
      }
    })({ project: 'docs' });

    assert.equal(result.structuredContent.project, 'docs');
    assert.deepEqual(calls, [
      ['deleteStorageZone', '10'],
      ['persistDestroy', 'docs']
    ]);
  });

  it('reads project history', async () => {
    const result = await historyHandler({
      readHistory: async () => [{ project: 'docs', op: 'deploy' }]
    })({ project: 'docs', limit: 20 });

    assert.equal(result.structuredContent.entries[0].project, 'docs');
  });

  it('reads project files', async () => {
    let receivedConfig = null;
    const result = await filesHandler({
      resolveApiKey: () => 'account-key',
      getProject: async () => ({
        binding: {
          storage_zone_id: '1',
          pull_zone_id: '2',
          storage_hostname: 'storage.bunnycdn.com',
          pull_zone_hostname: 'example.b-cdn.net',
          zone_password: 'secret'
        }
      }),
      getStorageZone: async () => ({ Name: 'internal-zone' }),
      listRemoteFiles: async (config) => {
        receivedConfig = config;
        return [{ path: 'index.html', size: 12 }];
      }
    })({ project: 'docs' });

    assert.equal(result.structuredContent.files[0].path, 'index.html');
    assert.equal(receivedConfig.zoneName, 'internal-zone');
  });

  it('inspects a project', async () => {
    const result = await inspectHandler({
      resolveApiKey: () => 'account-key',
      getProject: async () => ({
        url: 'https://example.b-cdn.net/',
        last_deploy_at: '2026-04-18T10:00:00Z',
        binding: {
          storage_zone_id: '1',
          pull_zone_id: '2',
          storage_hostname: 'storage.bunnycdn.com',
          pull_zone_hostname: 'example.b-cdn.net'
        }
      }),
      listStorageZones: async () => [{ Id: 1, Name: 'internal-zone' }],
      deriveProjectStatus: () => 'ok'
    })({ project: 'docs' });

    assert.equal(result.structuredContent.status, 'ok');
  });

  it('redacts zone_password by default, reveals on opt-in', async () => {
    const deps = {
      resolveApiKey: () => 'account-key',
      getProject: async () => ({
        url: 'https://example.b-cdn.net/',
        last_deploy_at: '2026-04-18T10:00:00Z',
        binding: { storage_zone_id: '1', zone_password: 'SECRET-PASS' }
      }),
      listStorageZones: async () => [],
      deriveProjectStatus: () => 'ok'
    };

    const hidden = await inspectHandler(deps)({ project: 'docs' });
    assert.equal(hidden.structuredContent.binding.zone_password, '[redacted]');

    const shown = await inspectHandler(deps)({ project: 'docs', reveal: true });
    assert.equal(shown.structuredContent.binding.zone_password, 'SECRET-PASS');
  });
});
