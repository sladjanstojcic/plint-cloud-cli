import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { apiGet } from '../../../src/lib/bunny.js';
import { ERROR_CODES } from '../../../src/lib/error-codes.js';
import { withFetch } from '../../helpers/fetch-mock.js';

describe('bunny.js request(): defensive parsing', () => {
  it('throws BUNNY_API_ERROR on 404 with HTML body', async () => {
    await withFetch(
      { status: 404, body: '<!DOCTYPE html><html>Not Found</html>' },
      async () => {
        await assert.rejects(
          () => apiGet('key', '/bogus'),
          (error) =>
            error.code === ERROR_CODES.BUNNY_API_ERROR &&
            error.status === 404 &&
            /404/.test(error.message) &&
            /\/bogus/.test(error.message)
        );
      }
    );
  });

  it('surfaces Bunny Message on 500 with JSON body', async () => {
    const body = JSON.stringify({ Message: 'Server blew up', ErrorKey: 'x' });
    await withFetch({ status: 500, body }, async () => {
      await assert.rejects(
        () => apiGet('key', '/thing'),
        (error) =>
          error.code === ERROR_CODES.BUNNY_API_ERROR &&
          error.status === 500 &&
          error.message === 'Server blew up' &&
          error.errorKey === 'x'
      );
    });
  });

  it('throws BUNNY_API_ERROR on 200 with malformed JSON body', async () => {
    await withFetch({ status: 200, body: 'not-json-<html>' }, async () => {
      await assert.rejects(
        () => apiGet('key', '/thing'),
        (error) =>
          error.code === ERROR_CODES.BUNNY_API_ERROR && /non-JSON/i.test(error.message)
      );
    });
  });

  it('returns null on 204', async () => {
    await withFetch({ status: 204, body: '' }, async () => {
      const result = await apiGet('key', '/ok');
      assert.equal(result, null);
    });
  });

  it('returns parsed body on 200 with valid JSON', async () => {
    await withFetch({ status: 200, body: JSON.stringify({ ok: true }) }, async () => {
      const result = await apiGet('key', '/ok');
      assert.deepEqual(result, { ok: true });
    });
  });
});
