import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import destroy from '../../../src/commands/destroy.js';
import { ERROR_CODES } from '../../../src/lib/error-codes.js';

function baseDeps(confirmFn) {
  return {
    resolveApiKey: () => 'key',
    getProject: async () => ({ binding: { storage_zone_id: '1', pull_zone_id: '2' } }),
    deleteStorageZone: async () => {},
    persistDestroy: async ({ project }) => ({ project, destroyed: true }),
    confirm: confirmFn ?? (async () => true)
  };
}

function context({ interactive = false, json = false } = {}) {
  return {
    json,
    interactive,
    stdout: { write: () => true },
    options: { project: 'my-project' }
  };
}

describe('destroy command: confirmation policy', () => {
  it('JSON mode proceeds without prompt', async () => {
    let confirmCalled = false;
    await destroy([], context({ json: true, interactive: false }), baseDeps(async () => {
      confirmCalled = true;
      return true;
    }));
    assert.equal(confirmCalled, false);
  });

  it('non-interactive human mode REFUSES without confirmation', async () => {
    let deleted = false;
    await assert.rejects(
      () =>
        destroy([], context({ json: false, interactive: false }), {
          ...baseDeps(),
          deleteStorageZone: async () => {
            deleted = true;
          }
        }),
      (error) => error.code === ERROR_CODES.CONFIRMATION_REQUIRED
    );
    assert.equal(deleted, false, 'destroy must not reach deleteStorageZone without confirmation');
  });

  it('interactive mode with decline aborts silently', async () => {
    let deleted = false;
    await destroy([], context({ json: false, interactive: true }), {
      ...baseDeps(async () => false),
      deleteStorageZone: async () => {
        deleted = true;
      }
    });
    assert.equal(deleted, false);
  });

  it('interactive mode with approve proceeds', async () => {
    let deleted = false;
    await destroy([], context({ json: false, interactive: true }), {
      ...baseDeps(async () => true),
      deleteStorageZone: async () => {
        deleted = true;
      }
    });
    assert.equal(deleted, true);
  });
});
