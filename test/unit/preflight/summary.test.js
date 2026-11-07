import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { largestFiles, summarizeScan } from '../../../src/lib/preflight/summary.js';

describe('preflight summary', () => {
  it('sorts largest files by size', () => {
    const files = [
      { path: 'small.txt', size: 1 },
      { path: 'large.bin', size: 30 },
      { path: 'middle.css', size: 10 }
    ];
    assert.deepEqual(largestFiles(files, 2), [
      { path: 'large.bin', size: 30 },
      { path: 'middle.css', size: 10 }
    ]);
  });

  it('summarizes files, warnings, and cost estimate', () => {
    const summary = summarizeScan({
      path: '/tmp/site',
      targetType: 'directory',
      files: [{ path: 'index.html', size: 12 }],
      warnings: [{ code: 'SKIPPED_SYMLINK', message: 'Skipped symlink: link.txt', severity: 'warning' }]
    });
    assert.equal(summary.path, '/tmp/site');
    assert.equal(summary.target_type, 'directory');
    assert.equal(summary.file_count, 1);
    assert.equal(summary.bytes, 12);
    assert.equal(summary.warning_count, 1);
    assert.equal(summary.cost_estimate.provider, 'bunny');
  });
});
