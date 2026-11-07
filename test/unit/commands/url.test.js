import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const createBuffer = () => {
  let value = '';
  return {
    stream: { write: (chunk) => { value += chunk; } },
    read: () => value
  };
};

describe('url command', () => {
  it('prints the stored project URL in human mode', async () => {
    const buffer = createBuffer();
    const { default: url } = await import('../../../src/commands/url.js');
    await url([], { options: { project: 'docs' }, stdout: buffer.stream }, {
      getProject: async () => ({ url: 'https://docs.b-cdn.net/' })
    });
    assert.equal(buffer.read(), 'https://docs.b-cdn.net/\n');
  });

  it('returns JSON with project and url fields', async () => {
    const buffer = createBuffer();
    const { default: url } = await import('../../../src/commands/url.js');
    await url([], { options: { project: 'docs' }, json: true, stdout: buffer.stream }, {
      getProject: async () => ({ url: 'https://docs.b-cdn.net/' })
    });
    const parsed = JSON.parse(buffer.read());
    assert.equal(parsed.command, 'url');
    assert.equal(parsed.data.project, 'docs');
    assert.equal(parsed.data.url, 'https://docs.b-cdn.net/');
  });

  it('raises PROJECT_NOT_FOUND for missing projects', async () => {
    const { default: url } = await import('../../../src/commands/url.js');
    await assert.rejects(
      () => url([], { options: { project: 'missing' }, stdout: { write() {} } }, {
        getProject: async () => null
      }),
      (error) => error.code === 'PROJECT_NOT_FOUND'
    );
  });

  it('raises INVALID_USAGE when -p is missing', async () => {
    const { default: url } = await import('../../../src/commands/url.js');
    await assert.rejects(
      () => url([], { options: {}, stdout: { write() {} } }, { getProject: async () => null }),
      (error) => error.code === 'INVALID_USAGE' && error.message.includes('plint url -p')
    );
  });
});
