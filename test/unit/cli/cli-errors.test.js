import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runCli } from '../../../src/cli.js';
import { captureStdout, silenceStderr } from '../../helpers/stdio.js';

describe('cli errors: -p consumes a flag', () => {
  it('returns INVALID_USAGE when -p is followed by a flag', async () => {
    const capture = captureStdout();
    const stderr = silenceStderr();
    try {
      const code = await runCli(['--json', '-p', '--dry-run', '/tmp'], {
        stdout: capture.stream
      });
      assert.equal(code, 1);
      const parsed = JSON.parse(capture.output);
      assert.equal(parsed.ok, false);
      assert.equal(parsed.error.code, 'INVALID_USAGE');
      assert.match(parsed.error.message, /-p/);
    } finally {
      stderr.restore();
    }
  });
});

describe('cli errors: stderr is silent in JSON mode', () => {
  it('writes zero bytes to stderr for --unknown-flag --json', async () => {
    const capture = captureStdout();
    const stderr = silenceStderr();
    try {
      const code = await runCli(['--json', '--unknown-flag'], { stdout: capture.stream });
      assert.equal(code, 1);
      assert.equal(stderr.writes.length, 0);
      const parsed = JSON.parse(capture.output);
      assert.equal(parsed.error.code, 'INVALID_USAGE');
      assert.ok(!parsed.error.message.startsWith('error:'), parsed.error.message);
    } finally {
      stderr.restore();
    }
  });

  it('writes zero bytes to stderr for too-many-args --json', async () => {
    const capture = captureStdout();
    const stderr = silenceStderr();
    try {
      await runCli(['--json', 'a', 'b'], { stdout: capture.stream });
      assert.equal(stderr.writes.length, 0);
    } finally {
      stderr.restore();
    }
  });
});

describe('cli errors: -p with no value', () => {
  it('emits a fix line when -p is at end of argv', async () => {
    const capture = captureStdout();
    const stderr = silenceStderr();
    try {
      const code = await runCli(['--json', '-p'], { stdout: capture.stream });
      assert.equal(code, 1);
      const parsed = JSON.parse(capture.output);
      assert.equal(parsed.error.code, 'INVALID_USAGE');
      assert.match(parsed.fix, /value|flag/i);
    } finally {
      stderr.restore();
    }
  });
});

describe('cli errors: -p=value syntax', () => {
  it('strips leading = so -p=name parses as name (not =name)', async () => {
    const capture = captureStdout();
    const stderr = silenceStderr();
    try {
      await runCli(['--json', '-p=does-not-exist-xyz', 'inspect'], { stdout: capture.stream });
      const parsed = JSON.parse(capture.output);
      // Project doesn't exist → PROJECT_NOT_FOUND. Key assertion: the message must NOT
      // contain "=does-not-exist-xyz" (= leaked), but "does-not-exist-xyz" (clean).
      assert.equal(parsed.error.code, 'PROJECT_NOT_FOUND');
      assert.doesNotMatch(parsed.error.message, /=does-not-exist/);
      assert.match(parsed.error.message, /'does-not-exist-xyz'/);
    } finally {
      stderr.restore();
    }
  });
});

describe('cli errors: api get missing path', () => {
  it('normalizes the message and attaches a fix', async () => {
    const capture = captureStdout();
    const stderr = silenceStderr();
    try {
      const code = await runCli(['--json', 'api', 'get'], { stdout: capture.stream });
      assert.equal(code, 1);
      const parsed = JSON.parse(capture.output);
      assert.equal(parsed.error.code, 'INVALID_USAGE');
      assert.ok(!parsed.error.message.startsWith('error:'));
      assert.match(parsed.error.message, /^[A-Z]/);
      assert.match(parsed.fix, /missing argument|--help/i);
    } finally {
      stderr.restore();
    }
  });
});

describe('cli errors: login JSON mode', () => {
  it('does not prompt or write non-JSON bytes to stdout', async () => {
    const capture = captureStdout();
    const stderr = silenceStderr();
    try {
      const code = await runCli(['--json', 'login'], { stdout: capture.stream });
      assert.equal(code, 1);
      assert.equal(stderr.writes.length, 0);
      assert.doesNotMatch(capture.output, /^\? Enter your Bunny API key/);
      const parsed = JSON.parse(capture.output);
      assert.equal(parsed.error.code, 'INVALID_USAGE');
    } finally {
      stderr.restore();
    }
  });
});
