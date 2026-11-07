import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe('bunny core api client', () => {
  it('returns JSON for successful requests', async () => {
    global.fetch = async () => new Response(JSON.stringify([{ Id: 1, Name: 'zone-a' }]), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });

    const { listStorageZones } = await import('../../src/lib/bunny.js');
    const zones = await listStorageZones('account-key');

    assert.equal(zones[0].Name, 'zone-a');
  });

  it('returns null for 204 responses', async () => {
    global.fetch = async () => new Response(null, { status: 204 });

    const { deleteStorageZone } = await import('../../src/lib/bunny.js');
    const result = await deleteStorageZone('account-key', 1);

    assert.equal(result, null);
  });

  it('surfaces status and ErrorKey on failure', async () => {
    global.fetch = async () => new Response(JSON.stringify({
      ErrorKey: 'storagezone.name_taken',
      Message: 'The storage zone name is already taken.'
    }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });

    const { createStorageZone } = await import('../../src/lib/bunny.js');

    await assert.rejects(
      () => createStorageZone('account-key', 'plint-taken'),
      (error) => error.status === 400 && error.errorKey === 'storagezone.name_taken'
    );
  });
});
