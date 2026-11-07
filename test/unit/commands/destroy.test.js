import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import destroy from '../../../src/commands/destroy.js';

const createBuffer = () => {
  let value = '';
  return {
    stream: { write: (chunk) => { value += chunk; } },
    read: () => value
  };
};

describe('destroy command', () => {
  it('destroys a project and reserves its name', async () => {
    const buffer = createBuffer();
    const calls = [];

    await destroy([], { json: true, stdout: buffer.stream, options: { project: 'docs' } }, {
      resolveApiKey: () => 'account-key',
      getProject: async () => ({
        binding: {
          storage_zone_id: '10',
          pull_zone_id: '11'
        }
      }),
      confirm: async () => true,
      deleteStorageZone: async (_apiKey, zoneId) => {
        calls.push(['deleteStorageZone', zoneId]);
      },
      persistDestroy: async ({ project, entry }) => {
        calls.push(['persistDestroy', project]);
        return {
          project,
          zone_id: entry.binding.storage_zone_id,
          cdn_id: entry.binding.pull_zone_id
        };
      }
    });

    const parsed = JSON.parse(buffer.read());
    assert.equal(parsed.data.project, 'docs');
    assert.deepEqual(calls, [
      ['deleteStorageZone', '10'],
      ['persistDestroy', 'docs']
    ]);
  });

  it('returns INVALID_USAGE without project', async () => {
    await assert.rejects(
      () => destroy([], { options: {} }, { resolveApiKey: () => 'account-key' }),
      (error) => error.code === 'INVALID_USAGE'
    );
  });

  it('skips the interactive confirm when --json is set', async () => {
    const buffer = createBuffer();
    let confirmCalled = false;

    await destroy([], { json: true, stdout: buffer.stream, options: { project: 'docs' } }, {
      resolveApiKey: () => 'account-key',
      getProject: async () => ({
        binding: { storage_zone_id: '10', pull_zone_id: '11' }
      }),
      confirm: async () => {
        confirmCalled = true;
        return false;
      },
      deleteStorageZone: async () => {},
      persistDestroy: async ({ project, entry }) => ({
        project,
        zone_id: entry.binding.storage_zone_id,
        cdn_id: entry.binding.pull_zone_id
      })
    });

    assert.equal(confirmCalled, false);
    const parsed = JSON.parse(buffer.read());
    assert.equal(parsed.data.project, 'docs');
  });
});
