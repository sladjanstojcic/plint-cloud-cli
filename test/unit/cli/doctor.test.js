import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { collectDoctor } from '../../../src/lib/doctor.js';

const createBuffer = () => {
  let value = '';
  return {
    stream: { write: (chunk) => { value += chunk; } },
    read: () => value
  };
};

describe('collectDoctor', () => {
  it('reports stale projects count', async () => {
    const result = await collectDoctor({
      env: { BUNNY_API_KEY: 'env-key' },
      resolveApiKeyFn: () => 'env-key',
      readProjectsStateFn: async () => ({
        reserved_project_names: {},
        projects: {
          docs: {
            binding: { storage_zone_id: '1' }
          }
        }
      }),
      probeManagementApiFn: async () => ({ reachable: true, status: 200 }),
      listStorageZonesFn: async () => []
    });

    const check = result.checks.find((entry) => entry.name === 'state_reconciled');
    assert.equal(check.ok, false);
  });

  it('reports bunny_reach as not ok when probe returns 401', async () => {
    const result = await collectDoctor({
      env: { BUNNY_API_KEY: 'bad-key' },
      resolveApiKeyFn: () => 'bad-key',
      readProjectsStateFn: async () => ({ projects: {} }),
      probeManagementApiFn: async () => ({ reachable: false, status: 401 }),
      listStorageZonesFn: async () => []
    });

    const reach = result.checks.find((c) => c.name === 'bunny_reach');
    assert.equal(reach.ok, false);
    assert.match(reach.detail, /auth/i);
  });

  it('reports bunny_reach as ok when probe returns 200', async () => {
    const result = await collectDoctor({
      env: { BUNNY_API_KEY: 'good' },
      resolveApiKeyFn: () => 'good',
      readProjectsStateFn: async () => ({ projects: {} }),
      probeManagementApiFn: async () => ({ reachable: true, status: 200 }),
      listStorageZonesFn: async () => []
    });

    const reach = result.checks.find((c) => c.name === 'bunny_reach');
    assert.equal(reach.ok, true);
  });

  it('does not crash when state lacks a projects key', async () => {
    const result = await collectDoctor({
      env: {},
      resolveApiKeyFn: () => null,
      readProjectsStateFn: async () => ({ version: 1, slugs: {} }),
      listProjectsFn: async () => undefined,
      probeManagementApiFn: async () => ({ reachable: false, status: null }),
      listStorageZonesFn: async () => []
    });

    assert.equal(Array.isArray(result.checks), true);
  });
});

describe('doctor command', () => {
  it('emits json under --json', async () => {
    const buffer = createBuffer();
    const { default: doctor } = await import('../../../src/commands/doctor.js');

    await doctor([], { json: true, stdout: buffer.stream }, {
      collectDoctor: async () => ({
        version: '0.1.0',
        checks: [{ name: 'auth', ok: true, detail: 'ok' }]
      })
    });

    const parsed = JSON.parse(buffer.read());
    assert.equal(parsed.data.checks[0].name, 'auth');
  });
});
