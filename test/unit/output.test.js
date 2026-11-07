import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  errorEnvelope,
  successEnvelope,
  writeJsonError,
  writeJsonSuccess
} from '../../src/lib/output.js';

const createBuffer = () => {
  let value = '';
  return {
    stream: { write: (chunk) => { value += chunk; } },
    read: () => value
  };
};

describe('output', () => {
  it('wraps success payloads with current fields and next actions', () => {
    const envelope = successEnvelope('deploy', { project: 'docs' });
    assert.equal(envelope.ok, true);
    assert.equal(envelope.command, 'deploy');
    assert.deepEqual(envelope.data, { project: 'docs' });
    assert.ok(envelope.next_actions.some((action) => action.command === 'plint inspect -p docs --json'));
  });

  it('wraps errors with current fields, fix, and next actions', () => {
    const error = new Error('No API key found.');
    error.code = 'AUTH_MISSING';
    const envelope = errorEnvelope('doctor', error);
    assert.equal(envelope.ok, false);
    assert.equal(envelope.command, 'doctor');
    assert.deepEqual(envelope.error, {
      code: 'AUTH_MISSING',
      message: 'No API key found.'
    });
    assert.equal(envelope.fix, 'Run `plint login` or set BUNNY_API_KEY.');
    assert.ok(envelope.next_actions.some((action) => action.command === 'plint login'));
  });

  it('lets the thrown error override the fix via error.fix', () => {
    const error = new Error('Path not found: /tmp/deploy');
    error.code = 'PATH_NOT_FOUND';
    error.fix = 'Did you mean `plint deploy`?';
    const envelope = errorEnvelope('deploy', error);
    assert.equal(envelope.fix, 'Did you mean `plint deploy`?');
  });

  it('writes success JSON to stdout only', () => {
    const buffer = createBuffer();
    writeJsonSuccess('estimate', { file_count: 1 }, buffer.stream);
    const parsed = JSON.parse(buffer.read());
    assert.equal(parsed.ok, true);
    assert.equal(parsed.command, 'estimate');
    assert.equal(parsed.data.file_count, 1);
    assert.ok(Array.isArray(parsed.next_actions));
  });

  it('writes error JSON to stdout only', () => {
    const buffer = createBuffer();
    const error = new Error('No API key found.');
    error.code = 'AUTH_MISSING';
    writeJsonError('doctor', error, buffer.stream);
    const parsed = JSON.parse(buffer.read());
    assert.equal(parsed.ok, false);
    assert.equal(parsed.error.code, 'AUTH_MISSING');
    assert.equal(parsed.fix, 'Run `plint login` or set BUNNY_API_KEY.');
  });
});
