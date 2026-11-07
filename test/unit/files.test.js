import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const makeTempDir = async () => {
  const dir = join(tmpdir(), `plint-files-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  return dir;
};

describe('files', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await makeTempDir();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('walks a directory and returns normalized relative paths', async () => {
    const { walkLocalFiles } = await import('../../src/lib/files.js');
    await writeFile(join(tempDir, 'index.html'), '<h1>ok</h1>');
    await mkdir(join(tempDir, 'css'));
    await writeFile(join(tempDir, 'css', 'style.css'), 'body{}');

    const result = await walkLocalFiles(tempDir);
    assert.deepEqual(result.files.map((file) => file.path), ['css/style.css', 'index.html']);
  });

  it('skips dotfiles, dotfolders, and .plint', async () => {
    const { walkLocalFiles } = await import('../../src/lib/files.js');
    await writeFile(join(tempDir, 'index.html'), '<h1>ok</h1>');
    await writeFile(join(tempDir, '.env'), 'secret');
    await writeFile(join(tempDir, '.plint'), '{}');
    await mkdir(join(tempDir, '.git'));
    await writeFile(join(tempDir, '.git', 'HEAD'), 'ref: refs/heads/main');

    const result = await walkLocalFiles(tempDir);
    assert.deepEqual(result.files.map((file) => file.path), ['index.html']);
  });

  it('respects the root .gitignore file', async () => {
    const { walkLocalFiles } = await import('../../src/lib/files.js');
    await writeFile(join(tempDir, '.gitignore'), 'dist/\n*.log\n');
    await writeFile(join(tempDir, 'index.html'), '<h1>ok</h1>');
    await writeFile(join(tempDir, 'error.log'), 'bad');
    await mkdir(join(tempDir, 'dist'));
    await writeFile(join(tempDir, 'dist', 'bundle.js'), 'console.log(1)');

    const result = await walkLocalFiles(tempDir);
    assert.deepEqual(result.files.map((file) => file.path), ['index.html']);
  });

  it('warns on symlinks instead of following them', async () => {
    const { walkLocalFiles } = await import('../../src/lib/files.js');
    await writeFile(join(tempDir, 'real.txt'), 'hello');
    await symlink(join(tempDir, 'real.txt'), join(tempDir, 'link.txt'));

    const result = await walkLocalFiles(tempDir);
    assert.equal(result.warnings.length, 1);
    assert.deepEqual(result.files.map((file) => file.path), ['real.txt']);
  });

  it('preserves single-file deploy path relative to cwd', async () => {
    const { buildSingleFileEntry } = await import('../../src/lib/files.js');
    await mkdir(join(tempDir, 'src'));
    await mkdir(join(tempDir, 'src', 'assets'));
    await writeFile(join(tempDir, 'src', 'assets', 'logo.txt'), 'logo');

    const file = await buildSingleFileEntry(tempDir, join(tempDir, 'src', 'assets', 'logo.txt'));
    assert.equal(file.path, 'src/assets/logo.txt');
  });

  it('rejects single-file deploy targets excluded by .gitignore', async () => {
    const { buildSingleFileEntry } = await import('../../src/lib/files.js');
    await writeFile(join(tempDir, '.gitignore'), 'dist/\n');
    await mkdir(join(tempDir, 'dist'));
    await writeFile(join(tempDir, 'dist', 'bundle.js'), 'console.log(1)');

    await assert.rejects(
      () => buildSingleFileEntry(tempDir, join(tempDir, 'dist', 'bundle.js')),
      /excluded by plint rules/
    );
  });

  it('respects .plintignore after .gitignore for user-controlled ignores', async () => {
    const { walkLocalFiles } = await import('../../src/lib/files.js');
    await writeFile(join(tempDir, '.gitignore'), 'logs/\n');
    await writeFile(join(tempDir, '.plintignore'), 'drafts/\n');
    await writeFile(join(tempDir, 'index.html'), '<h1>ok</h1>');
    await mkdir(join(tempDir, 'logs'));
    await writeFile(join(tempDir, 'logs', 'app.log'), 'log');
    await mkdir(join(tempDir, 'drafts'));
    await writeFile(join(tempDir, 'drafts', 'note.txt'), 'draft');
    const result = await walkLocalFiles(tempDir);
    assert.deepEqual(result.files.map((file) => file.path), ['index.html']);
  });

  it('does not allow .plintignore to re-include hard safety excludes', async () => {
    const { walkLocalFiles } = await import('../../src/lib/files.js');
    await writeFile(join(tempDir, '.plintignore'), '!.env\n!private.key\n');
    await writeFile(join(tempDir, 'index.html'), '<h1>ok</h1>');
    await writeFile(join(tempDir, '.env'), 'secret');
    await writeFile(join(tempDir, 'private.key'), 'secret');
    const result = await walkLocalFiles(tempDir);
    assert.deepEqual(result.files.map((file) => file.path), ['index.html']);
    assert.ok(result.warnings.some((warning) => warning.code === 'SECRET_LIKE_PATH' && warning.path === '.env'));
    assert.ok(result.warnings.some((warning) => warning.code === 'SECRET_LIKE_PATH' && warning.path === 'private.key'));
  });

  it('scans single-file targets with scanLocalTarget', async () => {
    const { scanLocalTarget } = await import('../../src/lib/files.js');
    await writeFile(join(tempDir, 'report.pdf'), 'pdf');
    const result = await scanLocalTarget(join(tempDir, 'report.pdf'));
    assert.equal(result.targetType, 'file');
    assert.deepEqual(result.files.map((file) => file.path), ['report.pdf']);
  });
});
