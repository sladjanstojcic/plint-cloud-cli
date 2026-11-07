import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { errorResult, okResult } from '../../../src/mcp/errors.js';

describe('mcp result helpers', () => {
  it('returns a success envelope', () => {
    assert.deepEqual(okResult({ project: 'docs' }, 'ok'), {
      content: [{ type: 'text', text: 'ok' }],
      structuredContent: { project: 'docs' }
    });
  });

  it('returns an error envelope', () => {
    const result = errorResult('PROJECT_NOT_FOUND', 'Missing project.', 'Use plint_deploy.');
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.code, 'PROJECT_NOT_FOUND');
  });

  it('puts the error code in the text clients actually show', () => {
    const result = errorResult('PATH_UNSAFE', 'Refusing to scan top-level path: /', 'Pick a subfolder.');
    assert.equal(result.content[0].text, 'PATH_UNSAFE: Refusing to scan top-level path: / Pick a subfolder.');
  });
});
