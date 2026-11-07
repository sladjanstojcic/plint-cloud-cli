import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPullZone,
  deleteStorageZone,
  findPullZoneByName,
  findStorageZoneByName
} from '../../src/lib/bunny.js';

describe('managed Bunny helpers', () => {
  it('finds an exact storage zone match', async () => {
    const zone = await findStorageZoneByName('key', 'plint-demo', async () => ([
      { Id: 1, Name: 'demo' },
      { Id: 2, Name: 'plint-demo' }
    ]));
    assert.equal(zone.Id, 2);
  });

  it('finds an exact pull zone match', async () => {
    const zone = await findPullZoneByName('key', 'plint-demo', async () => ([
      { Id: 9, Name: 'plint-demo' }
    ]));
    assert.equal(zone.Id, 9);
  });

  it('creates a pull zone with OriginType 2', async () => {
    let body;
    await createPullZone('key', 'plint-demo', 10, async (_url, options) => {
      body = JSON.parse(options.body);
      return new Response(JSON.stringify({ Id: 1, Name: 'plint-demo' }), { status: 200 });
    });
    assert.equal(body.StorageZoneId, 10);
    assert.equal(body.OriginType, 2);
  });

  it('deletes a storage zone and linked pull zones', async () => {
    let url = '';
    await deleteStorageZone('key', 10, { deleteLinkedPullZones: true }, async (nextUrl) => {
      url = nextUrl;
      return new Response(null, { status: 204 });
    });
    assert.match(url, /deleteLinkedPullZones=true/);
  });
});
