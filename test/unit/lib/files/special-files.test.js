import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdir, rm, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanLocalTarget } from '../../../../src/lib/files.js';
import { ERROR_CODES } from '../../../../src/lib/error-codes.js';

const ROOT = join(tmpdir(), `plint-special-${process.pid}-${Date.now()}`);

before(async () => {
  await mkdir(ROOT, { recursive: true });
  await writeFile(join(ROOT, 'index.html'), 'ok');
  await mkdir(join(ROOT, 'sub'));
  await writeFile(join(ROOT, 'sub', 'nested.html'), 'ok');
  execSync(`mkfifo ${JSON.stringify(join(ROOT, 'fifo'))}`);
  execSync(`mkfifo ${JSON.stringify(join(ROOT, 'sub', 'nested-fifo'))}`);
  await symlink('/nonexistent-target', join(ROOT, 'broken-link'));
});

after(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

describe('scanLocalTarget: special files', () => {
  it('skips FIFOs in the tree with a warning instead of hanging', async () => {
    const result = await scanLocalTarget(ROOT);
    const paths = result.files.map((file) => file.path);
    assert.ok(
      !paths.includes('fifo'),
      `FIFO must not be treated as a file. Got files: ${paths.join(',')}`
    );
    assert.ok(
      paths.includes('index.html') && paths.includes('sub/nested.html'),
      'normal files still deployed'
    );
    const hasSkipWarning = result.warnings.some((warning) =>
      /fifo|special|non-regular/i.test(warning.message)
    );
    assert.ok(hasSkipWarning, `Expected a special-file warning. Got: ${JSON.stringify(result.warnings)}`);
  });

  it('refuses to scan a FIFO given as the root path', async () => {
    await assert.rejects(
      () => scanLocalTarget(join(ROOT, 'fifo')),
      (error) => error.code === ERROR_CODES.PATH_NOT_SUPPORTED
    );
  });

  it('caps warnings when many special files are present', async () => {
    const bigDir = join(ROOT, 'many');
    await mkdir(bigDir);
    execSync(`cd ${JSON.stringify(bigDir)} && for i in $(seq 0 149); do mkfifo "fifo-$i"; done`);
    const result = await scanLocalTarget(bigDir);
    assert.ok(
      result.warnings.length < 120,
      `Warnings should be capped, got ${result.warnings.length}`
    );
    const truncation = result.warnings.find((w) => w.code === 'WARNINGS_TRUNCATED');
    assert.ok(truncation, 'Expected a WARNINGS_TRUNCATED sentinel');
    assert.ok(truncation.skipped > 0);
  });
});
