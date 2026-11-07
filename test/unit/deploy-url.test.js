import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deployUrl } from '../../src/lib/deploy-url.js';

describe('deployUrl', () => {
  it('returns the single-file URL', () => {
    assert.deepEqual(
      deployUrl('plint-demo.b-cdn.net', ['report.pdf']),
      { url: 'https://plint-demo.b-cdn.net/report.pdf' }
    );
  });

  it('prefers the root URL when index.html exists', () => {
    assert.deepEqual(
      deployUrl('plint-demo.b-cdn.net', ['index.html', 'assets/app.js']),
      { url: 'https://plint-demo.b-cdn.net/' }
    );
  });

  it('returns a warning when there is no root index', () => {
    assert.deepEqual(
      deployUrl('plint-demo.b-cdn.net', ['docs/index.html']),
      {
        url: 'https://plint-demo.b-cdn.net/',
        warning: 'no index.html at root — this URL may not render'
      }
    );
  });
});
