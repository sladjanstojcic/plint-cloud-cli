import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { doctorHandler, repairHandler } from '../../../src/mcp/tools/system.js';

describe('mcp system tools', () => {
  it('returns doctor checks', async () => {
    const result = await doctorHandler({
      collectDoctor: async () => ({
        checks: [{ name: 'auth', ok: true, detail: 'ok' }]
      })
    })();
    assert.equal(result.structuredContent.checks[0].name, 'auth');
  });

  it('returns repair dry-run output', async () => {
    const result = await repairHandler({
      resolveApiKey: () => 'account-key',
      listStorageZones: async () => [{ Id: 1, Name: 'internal-zone' }],
      listProjects: async () => ({
        docs: { binding: { storage_zone_id: '1' } },
        old: { binding: { storage_zone_id: '2' } }
      })
    })({ dry_run: true, prune_stale: true });

    assert.deepEqual(result.structuredContent.stale, ['old']);
  });
});
