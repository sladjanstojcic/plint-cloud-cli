import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nextActions } from '../../../src/lib/json-output/actions.js';
import { ERROR_CODES } from '../../../src/lib/error-codes.js';

describe('nextActions by error code', () => {
  const cases = [
    { code: ERROR_CODES.AUTH_MISSING, expect: ['plint login', 'plint estimate <path> --json'] },
    {
      code: ERROR_CODES.PROJECT_NOT_FOUND,
      expect: ['plint list --json', 'plint <path> -p <name> --create --json']
    },
    {
      code: ERROR_CODES.PROJECT_REQUIRED,
      expect: ['plint list --json', 'plint <path> -p <name> --create --json']
    },
    { code: ERROR_CODES.PROJECT_NAME_RESERVED, expect: ['plint list --json'] },
    { code: ERROR_CODES.UNKNOWN_COMMAND, expect: ['plint --help'] },
    { code: ERROR_CODES.INVALID_USAGE, expect: ['plint --help'] },
    { code: ERROR_CODES.BUNNY_API_ERROR, expect: ['plint doctor --json'] },
    {
      code: ERROR_CODES.STATE_CORRUPT,
      expect: ['plint doctor --json', 'cat ~/.plint/state.json']
    }
  ];

  for (const { code, expect } of cases) {
    it(`returns actions for ${code}`, () => {
      const actions = nextActions('any-command', {}, code);
      assert.deepEqual(
        actions.map((a) => a.command),
        expect
      );
    });
  }

  it('returns empty array for error codes with no mapping', () => {
    const actions = nextActions('any-command', {}, ERROR_CODES.UNEXPECTED_ERROR);
    assert.deepEqual(actions, []);
  });
});
