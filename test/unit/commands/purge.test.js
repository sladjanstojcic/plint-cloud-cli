import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import purge from '../../../src/commands/purge.js';

const createBuffer = () => {
  let value = '';
  return {
    stream: { write: (chunk) => { value += chunk; } },
    read: () => value
  };
};

describe('purge command', () => {
  it('purges by project name in json mode', async () => {
    const buffer = createBuffer();
    let purged = null;

    await purge([], { json: true, stdout: buffer.stream, options: { project: 'docs' } }, {
      resolveApiKey: () => 'account-key',
      getProject: async () => ({
        binding: {
          pull_zone_id: '11'
        }
      }),
      purgePullZone: async (_apiKey, cdnId) => {
        purged = cdnId;
      }
    });

    const parsed = JSON.parse(buffer.read());
    assert.equal(parsed.data.project, 'docs');
    assert.equal(parsed.data.cdn_id, '11');
    assert.equal(purged, '11');
  });

  it('returns INVALID_USAGE without project', async () => {
    await assert.rejects(
      () => purge([], { options: {} }, { resolveApiKey: () => 'account-key' }),
      (error) => error.code === 'INVALID_USAGE'
    );
  });
});
