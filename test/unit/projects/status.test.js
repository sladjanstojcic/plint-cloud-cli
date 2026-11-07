import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveProjectStatus,
  formatProjectRow
} from '../../../src/lib/projects/status.js';

describe('project status helper', () => {
  it('returns ok when the remote storage zone exists', () => {
    const status = deriveProjectStatus(
      { binding: { storage_zone_id: '1', pull_zone_id: '2' } },
      [{ Id: 1, Name: 'random-zone' }]
    );
    assert.equal(status, 'ok');
  });

  it('returns stale when the remote storage zone is missing', () => {
    const status = deriveProjectStatus(
      { binding: { storage_zone_id: '1', pull_zone_id: '2' } },
      []
    );
    assert.equal(status, 'stale');
  });

  it('formats list rows from local state and binding data', () => {
    const row = formatProjectRow('docs', {
      url: 'https://example.b-cdn.net/',
      last_deploy_at: '2026-04-18T10:00:00Z',
      binding: {
        storage_zone_id: '1',
        pull_zone_id: '2'
      }
    });
    assert.deepEqual(row, {
      project: 'docs',
      zone_id: '1',
      cdn_id: '2',
      url: 'https://example.b-cdn.net/',
      last_deploy_at: '2026-04-18T10:00:00Z'
    });
  });
});
