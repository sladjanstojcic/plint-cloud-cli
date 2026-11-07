import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import history from '../../../src/commands/history.js';

describe('history command', () => {
  it('returns project history in json mode', async () => {
    const buffer = { value: '', write(chunk) { this.value += chunk; } };

    await history([], { json: true, stdout: buffer, options: { project: 'docs' } }, {
      readHistory: async () => [{ project: 'docs', op: 'deploy' }]
    });

    const parsed = JSON.parse(buffer.value);
    assert.equal(parsed.data.entries[0].project, 'docs');
  });
});
