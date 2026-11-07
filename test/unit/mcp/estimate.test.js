import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { estimateHandler, estimateInput } from '../../../src/mcp/tools/estimate.js';

describe('mcp estimate tool', () => {
  it('requires an absolute path', () => {
    assert.equal(estimateInput.safeParse({ path: 'relative/site' }).success, false);
    assert.equal(estimateInput.safeParse({ path: '/tmp/site' }).success, true);
  });

  it('returns estimate structured content', async () => {
    const handler = estimateHandler({
      scanLocalTarget: async () => ({
        path: '/tmp/site',
        targetType: 'directory',
        files: [{ path: 'index.html', size: 12 }],
        warnings: []
      }),
      summarizeScan: ({ files }) => ({
        file_count: files.length,
        bytes: 12,
        warnings: [],
        cost_estimate: { provider: 'bunny' }
      })
    });
    const result = await handler({ path: '/tmp/site' });
    assert.equal(result.structuredContent.file_count, 1);
    assert.equal(result.structuredContent.cost_estimate.provider, 'bunny');
  });
});
