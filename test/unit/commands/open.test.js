import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const createBuffer = () => {
  let value = '';
  return {
    stream: { write: (chunk) => { value += chunk; } },
    read: () => value
  };
};

describe('open command', () => {
  it('resolves the URL and asks the platform to open it', async () => {
    const calls = [];
    const buffer = createBuffer();
    const { default: open } = await import('../../../src/commands/open.js');
    await open([], { options: { project: 'docs' }, stdout: buffer.stream }, {
      getProject: async () => ({ url: 'https://docs.b-cdn.net/' }),
      platformOpen: (url) => calls.push(url)
    });
    assert.deepEqual(calls, ['https://docs.b-cdn.net/']);
    assert.ok(buffer.read().includes('https://docs.b-cdn.net/'));
  });

  it('emits JSON data describing what was opened', async () => {
    const buffer = createBuffer();
    const { default: open } = await import('../../../src/commands/open.js');
    await open([], { options: { project: 'docs' }, json: true, stdout: buffer.stream }, {
      getProject: async () => ({ url: 'https://docs.b-cdn.net/' }),
      platformOpen: () => {}
    });
    const parsed = JSON.parse(buffer.read());
    assert.equal(parsed.command, 'open');
    assert.equal(parsed.data.project, 'docs');
    assert.equal(parsed.data.url, 'https://docs.b-cdn.net/');
    assert.equal(parsed.data.opened, true);
  });

  it('raises PROJECT_NOT_FOUND for missing projects', async () => {
    const { default: open } = await import('../../../src/commands/open.js');
    await assert.rejects(
      () => open([], { options: { project: 'missing' }, stdout: { write() {} } }, {
        getProject: async () => null,
        platformOpen: () => {}
      }),
      (error) => error.code === 'PROJECT_NOT_FOUND'
    );
  });
});
