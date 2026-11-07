import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeChangeset } from '../../src/lib/sync.js';

describe('computeChangeset', () => {
  it('uploads new local files', () => {
    const result = computeChangeset(
      [{ path: 'index.html', size: 10, checksum: 'AAA' }],
      []
    );

    assert.equal(result.toUpload.length, 1);
    assert.equal(result.toDelete.length, 0);
  });

  it('deletes orphaned remote files', () => {
    const result = computeChangeset(
      [{ path: 'index.html', size: 10, checksum: 'AAA' }],
      [
        { path: 'index.html', size: 10, checksum: 'AAA' },
        { path: 'old.html', size: 5, checksum: 'BBB' }
      ]
    );

    assert.deepEqual(result.toDelete, ['old.html']);
  });

  it('re-uploads files whose checksum changed', () => {
    const result = computeChangeset(
      [{ path: 'index.html', size: 10, checksum: 'AAA' }],
      [{ path: 'index.html', size: 10, checksum: 'BBB' }]
    );

    assert.equal(result.toUpload[0].path, 'index.html');
  });
});
