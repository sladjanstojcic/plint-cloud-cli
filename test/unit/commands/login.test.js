import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import login from '../../../src/commands/login.js';

describe('login command', () => {
  it('explains the TTY requirement when stdin is not interactive', async () => {
    await assert.rejects(
      () => login([], { interactive: false }, { password: async () => assert.fail('must not prompt') }),
      (error) =>
        error.code === 'INVALID_USAGE' &&
        /interactive terminal/.test(error.message) &&
        !/--json/.test(error.message) &&
        /BUNNY_API_KEY/.test(error.message)
    );
  });

  it('mentions --json when JSON mode was requested', async () => {
    await assert.rejects(
      () => login([], { json: true }, { password: async () => assert.fail('must not prompt') }),
      (error) => error.code === 'INVALID_USAGE' && /--json/.test(error.message)
    );
  });
});
