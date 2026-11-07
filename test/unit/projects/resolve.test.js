import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CREATE_DECLINED, resolveProjectName } from '../../../src/lib/projects/resolve.js';
import { ERROR_CODES } from '../../../src/lib/error-codes.js';

const identityValidate = () => {};
const noReserved = async () => false;

describe('resolveProjectName: no explicit, non-interactive', () => {
  it('throws PROJECT_REQUIRED when no project and not interactive', async () => {
    await assert.rejects(
      () =>
        resolveProjectName({
          explicitProject: null,
          allowCreate: false,
          interactive: false,
          deps: {
            validateProjectName: identityValidate,
            isProjectNameReserved: noReserved,
            getProject: async () => null
          }
        }),
      (error) => error.code === ERROR_CODES.PROJECT_REQUIRED
    );
  });
});

describe('resolveProjectName: explicit project + --create', () => {
  it('skips the confirm prompt when allowCreate is true and project does not exist', async () => {
    let confirmCalled = false;
    const result = await resolveProjectName({
      explicitProject: 'new-one',
      allowCreate: true,
      interactive: true,
      deps: {
        validateProjectName: identityValidate,
        isProjectNameReserved: noReserved,
        getProject: async () => null,
        confirm: async () => {
          confirmCalled = true;
          return true;
        }
      }
    });
    assert.equal(confirmCalled, false);
    assert.deepEqual(result, { project: 'new-one', existing: null, created: true });
  });

  it('defaults confirm to false when allowCreate is not set', async () => {
    let receivedDefault;
    await resolveProjectName({
      explicitProject: 'unknown',
      allowCreate: false,
      interactive: true,
      deps: {
        validateProjectName: identityValidate,
        isProjectNameReserved: noReserved,
        getProject: async () => null,
        confirm: async (opts) => {
          receivedDefault = opts.default;
          return false;
        }
      }
    });
    assert.equal(receivedDefault, false);
  });
});

describe('resolveProjectName: no explicit, interactive', () => {
  it('returns the prompted name when available', async () => {
    const result = await resolveProjectName({
      explicitProject: null,
      allowCreate: false,
      interactive: true,
      deps: {
        input: async () => 'docs',
        validateProjectName: identityValidate,
        isProjectNameReserved: noReserved,
        getProject: async () => null
      }
    });
    assert.equal(result.project, 'docs');
    assert.equal(result.created, true);
  });

  it('throws PROJECT_EXISTS if the prompted name already has state', async () => {
    await assert.rejects(
      () =>
        resolveProjectName({
          explicitProject: null,
          allowCreate: false,
          interactive: true,
          deps: {
            input: async () => 'docs',
            validateProjectName: identityValidate,
            isProjectNameReserved: noReserved,
            getProject: async () => ({ binding: {} })
          }
        }),
      (error) => error.code === ERROR_CODES.PROJECT_EXISTS
    );
  });

  it('throws PROJECT_NAME_RESERVED for destroyed-name reuse', async () => {
    await assert.rejects(
      () =>
        resolveProjectName({
          explicitProject: null,
          allowCreate: false,
          interactive: true,
          deps: {
            input: async () => 'docs',
            validateProjectName: identityValidate,
            isProjectNameReserved: async () => true,
            getProject: async () => null
          }
        }),
      (error) => error.code === ERROR_CODES.PROJECT_NAME_RESERVED
    );
  });
});

describe('resolveProjectName: explicit project', () => {
  const existingEntry = { binding: {} };

  it('returns the existing project without creating', async () => {
    const result = await resolveProjectName({
      explicitProject: 'docs',
      allowCreate: false,
      interactive: false,
      deps: {
        validateProjectName: identityValidate,
        isProjectNameReserved: noReserved,
        getProject: async () => existingEntry
      }
    });
    assert.equal(result.project, 'docs');
    assert.equal(result.existing, existingEntry);
    assert.equal(result.created, false);
  });

  it('throws PROJECT_NOT_FOUND when missing and --create is absent (non-interactive)', async () => {
    await assert.rejects(
      () =>
        resolveProjectName({
          explicitProject: 'docs',
          allowCreate: false,
          interactive: false,
          deps: {
            validateProjectName: identityValidate,
            isProjectNameReserved: noReserved,
            getProject: async () => null
          }
        }),
      (error) => error.code === ERROR_CODES.PROJECT_NOT_FOUND
    );
  });

  it('creates a new project when --create is true (non-interactive)', async () => {
    const result = await resolveProjectName({
      explicitProject: 'docs',
      allowCreate: true,
      interactive: false,
      deps: {
        validateProjectName: identityValidate,
        isProjectNameReserved: noReserved,
        getProject: async () => null
      }
    });
    assert.equal(result.created, true);
    assert.equal(result.existing, null);
  });

  it('returns CREATE_DECLINED when the interactive user declines', async () => {
    const result = await resolveProjectName({
      explicitProject: 'docs',
      allowCreate: false,
      interactive: true,
      deps: {
        validateProjectName: identityValidate,
        isProjectNameReserved: noReserved,
        getProject: async () => null,
        confirm: async () => false
      }
    });
    assert.equal(result, CREATE_DECLINED);
  });

  it('creates a new project when the interactive user confirms', async () => {
    const result = await resolveProjectName({
      explicitProject: 'docs',
      allowCreate: false,
      interactive: true,
      deps: {
        validateProjectName: identityValidate,
        isProjectNameReserved: noReserved,
        getProject: async () => null,
        confirm: async () => true
      }
    });
    assert.equal(result.created, true);
  });

  it('throws PROJECT_NAME_RESERVED for destroyed-name reuse even with --create', async () => {
    await assert.rejects(
      () =>
        resolveProjectName({
          explicitProject: 'docs',
          allowCreate: true,
          interactive: false,
          deps: {
            validateProjectName: identityValidate,
            isProjectNameReserved: async () => true,
            getProject: async () => null
          }
        }),
      (error) => error.code === ERROR_CODES.PROJECT_NAME_RESERVED
    );
  });
});
