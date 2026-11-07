import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import inspect from '../../../src/commands/inspect.js';
import { captureStdout } from '../../helpers/stdio.js';

const entry = {
  url: 'https://plint-xyz.b-cdn.net/',
  last_deploy_at: '2026-04-18T10:00:00Z',
  binding: {
    storage_zone_id: '10',
    pull_zone_id: '11',
    storage_hostname: 'storage.bunnycdn.com',
    pull_zone_hostname: 'plint-xyz.b-cdn.net',
    zone_password: 'SECRET-PASS'
  }
};

const baseDeps = {
  listStorageZones: async () => [],
  getProject: async () => entry,
  deriveProjectStatus: () => 'ok',
  resolveApiKey: () => 'key'
};

function context(options = {}) {
  return {
    json: true,
    stdout: captureStdout().stream,
    options: { project: 'docs', ...options }
  };
}

describe('inspect: zone_password redaction', () => {
  it('redacts zone_password by default in JSON mode', async () => {
    const capture = captureStdout();
    await inspect([], { json: true, stdout: capture.stream, options: { project: 'docs' } }, baseDeps);
    const parsed = JSON.parse(capture.output);
    assert.equal(parsed.data.binding.zone_password, '[redacted]');
    assert.notEqual(parsed.data.binding.zone_password, 'SECRET-PASS');
  });

  it('reveals zone_password when --reveal is set', async () => {
    const capture = captureStdout();
    await inspect(
      [],
      { json: true, stdout: capture.stream, options: { project: 'docs', reveal: true } },
      baseDeps
    );
    const parsed = JSON.parse(capture.output);
    assert.equal(parsed.data.binding.zone_password, 'SECRET-PASS');
  });

  it('leaves other binding fields untouched', async () => {
    const capture = captureStdout();
    await inspect([], { json: true, stdout: capture.stream, options: { project: 'docs' } }, baseDeps);
    const parsed = JSON.parse(capture.output);
    assert.equal(parsed.data.binding.storage_zone_id, '10');
    assert.equal(parsed.data.binding.pull_zone_hostname, 'plint-xyz.b-cdn.net');
  });

  it('redacts in human mode output too', async () => {
    const originalLog = console.log;
    const logs = [];
    console.log = (...args) => {
      logs.push(args.join(' '));
    };
    try {
      await inspect([], { stdout: { write: () => true }, options: { project: 'docs' } }, baseDeps);
    } finally {
      console.log = originalLog;
    }
    const combined = logs.join('\n');
    assert.doesNotMatch(combined, /SECRET-PASS/);
    assert.match(combined, /\[redacted\]/);
  });
});
