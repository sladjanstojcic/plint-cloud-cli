import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const createBuffer = () => {
  let value = '';
  return {
    stream: { write: (chunk) => { value += chunk; } },
    read: () => value
  };
};

describe('api get command', () => {
  it('writes JSON output for raw GET results', async () => {
    const buffer = createBuffer();
    const { default: apiGetCommand } = await import('../../../src/commands/api-get.js');

    await apiGetCommand(['/storagezone'], { json: true, stdout: buffer.stream }, {
      resolveApiKey: () => 'account-key',
      apiGet: async () => ([{ Id: 1 }])
    });

    const parsed = JSON.parse(buffer.read());
    assert.equal(parsed.command, 'api get');
    assert.equal(parsed.data[0].Id, 1);
  });

  it('rejects paths without a leading slash', async () => {
    const { default: apiGetCommand } = await import('../../../src/commands/api-get.js');

    await assert.rejects(
      () => apiGetCommand(['storagezone'], { json: true, stdout: { write: () => {} } }, {
        resolveApiKey: () => 'account-key',
        apiGet: async () => []
      }),
      (error) => error.code === 'INVALID_USAGE'
    );
  });
});
