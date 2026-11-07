import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import repair from '../../../src/commands/repair.js';

describe('repair command', () => {
  it('reports stale local projects in dry-run mode', async () => {
    let output = '';

    await repair(
      [],
      {
        stdout: { write: (chunk) => { output += chunk; } },
        options: { pruneStale: true, dryRun: true }
      },
      {
        resolveApiKey: () => 'account-key',
        listStorageZones: async () => [{ Id: 1, Name: 'internal-zone' }],
        listProjects: async () => ({
          docs: {
            binding: { storage_zone_id: '1' }
          },
          old: {
            binding: { storage_zone_id: '2' }
          }
        })
      }
    );

    assert.match(output, /old/);
  });
});
