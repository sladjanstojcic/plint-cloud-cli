import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { requireExistingProject } from '../../../src/lib/projects/require.js';
import { ERROR_CODES } from '../../../src/lib/error-codes.js';

describe('requireExistingProject', () => {
  it('returns the project when it exists', async () => {
    const entry = { binding: { storage_zone_id: '1' } };
    const result = await requireExistingProject('docs', {
      getProjectFn: async (name) => (name === 'docs' ? entry : null),
      isReservedFn: async () => false
    });
    assert.equal(result, entry);
  });

  it('throws PROJECT_NAME_RESERVED when name is reserved and project missing', async () => {
    await assert.rejects(
      () =>
        requireExistingProject('plint-test-manual', {
          getProjectFn: async () => null,
          isReservedFn: async (name) => name === 'plint-test-manual'
        }),
      (error) => error.code === ERROR_CODES.PROJECT_NAME_RESERVED
    );
  });

  it('throws PROJECT_NOT_FOUND when not reserved and not found', async () => {
    await assert.rejects(
      () =>
        requireExistingProject('never-existed', {
          getProjectFn: async () => null,
          isReservedFn: async () => false
        }),
      (error) => error.code === ERROR_CODES.PROJECT_NOT_FOUND
    );
  });

  it('does not call isReservedFn if project exists', async () => {
    let reservedCalled = false;
    await requireExistingProject('docs', {
      getProjectFn: async () => ({ binding: {} }),
      isReservedFn: async () => {
        reservedCalled = true;
        return true;
      }
    });
    assert.equal(reservedCalled, false);
  });
});
