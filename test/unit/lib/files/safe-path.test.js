import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { assertSafePath } from '../../../../src/lib/files/safety.js';
import { ERROR_CODES } from '../../../../src/lib/error-codes.js';

describe('assertSafePath', () => {
  it('rejects /', () => {
    assert.throws(
      () => assertSafePath('/'),
      (error) => error.code === ERROR_CODES.PATH_UNSAFE
    );
  });

  it('rejects the user home directory', () => {
    assert.throws(
      () => assertSafePath(homedir()),
      (error) => error.code === ERROR_CODES.PATH_UNSAFE
    );
  });

  it('rejects ~/Desktop', () => {
    assert.throws(
      () => assertSafePath(`${homedir()}/Desktop`),
      (error) => error.code === ERROR_CODES.PATH_UNSAFE
    );
  });

  it('rejects ~/Documents and ~/Downloads', () => {
    for (const name of ['Documents', 'Downloads']) {
      assert.throws(
        () => assertSafePath(`${homedir()}/${name}`),
        (error) => error.code === ERROR_CODES.PATH_UNSAFE,
        `Expected ${name} to be rejected`
      );
    }
  });

  it('accepts a normal project subdirectory', () => {
    assert.doesNotThrow(() => assertSafePath(`${homedir()}/Desktop/myproject/dist`));
  });

  it('accepts a /tmp path', () => {
    assert.doesNotThrow(() => assertSafePath('/tmp/deploy-site'));
  });
});
