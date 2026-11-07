import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import inspect from '../../../src/commands/inspect.js';

describe('inspect command', () => {
  it('returns project details in json mode', async () => {
    const buffer = { value: '', write(chunk) { this.value += chunk; } };

    await inspect(
      [],
      { json: true, stdout: buffer, options: { project: 'docs' } },
      {
        getProject: async () => ({
          url: 'https://example.b-cdn.net/',
          last_deploy_at: '2026-04-18T10:00:00Z',
          binding: {
            storage_zone_id: '1',
            pull_zone_id: '2',
            storage_hostname: 'storage.bunnycdn.com',
            pull_zone_hostname: 'example.b-cdn.net',
            zone_password: 'secret'
          }
        }),
        listStorageZones: async () => [{ Id: 1, Name: 'internal-zone' }],
        deriveProjectStatus: () => 'ok',
        resolveApiKey: () => 'account-key'
      }
    );

    const parsed = JSON.parse(buffer.value);
    assert.equal(parsed.data.project, 'docs');
    assert.equal(parsed.data.binding.storage_zone_id, '1');
  });

  it('checks local project state before requiring auth', async () => {
    await assert.rejects(
      () =>
        inspect(
          [],
          { json: true, stdout: { write() {} }, options: { project: 'missing' } },
          {
            getProject: async () => null,
            listStorageZones: async () => {
              throw new Error('listStorageZones should not run for missing projects');
            },
            deriveProjectStatus: () => 'ok',
            resolveApiKey: () => null
          }
        ),
      (error) => error.code === 'PROJECT_NOT_FOUND'
    );
  });
});
