import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import files from '../../../src/commands/files.js';

describe('files command', () => {
  it('returns remote files for a project in json mode', async () => {
    const buffer = { value: '', write(chunk) { this.value += chunk; } };
    let receivedConfig = null;

    await files([], { json: true, stdout: buffer, options: { project: 'docs' } }, {
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
    });

    const parsed = JSON.parse(buffer.value);
    assert.equal(parsed.data.files[0].path, 'index.html');
    assert.equal(receivedConfig.zoneName, 'internal-zone');
  });
});
