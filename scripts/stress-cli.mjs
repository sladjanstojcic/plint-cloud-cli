#!/usr/bin/env node
// Stress-test the plint CLI against realistic temp folders and files.
// Each scenario builds a fixture, runs plint via node, asserts against
// either structured JSON on stdout or a thrown commander usage error.
//
// Run: node scripts/stress-cli.mjs
// Exit 0 if every scenario passes, exit 1 otherwise.

import { execFile } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const cliBin = join(repoRoot, 'src', 'cli-bin.js');

const results = [];

function tempPath(prefix) {
  return mkdtemp(join(tmpdir(), `plint-stress-${prefix}-`));
}

async function runCli(args, { home, env = {}, expectNonZero = false } = {}) {
  try {
    const { stdout, stderr } = await run(
      process.execPath,
      [cliBin, ...args, '--json'],
      {
        env: {
          ...process.env,
          HOME: home,
          BUNNY_API_KEY: '',
          ...env
        },
        maxBuffer: 16 * 1024 * 1024
      }
    );
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    if (!expectNonZero) throw error;
    return {
      exitCode: error.code ?? 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? ''
    };
  }
}

function record(name, passed, detail = '') {
  results.push({ name, passed, detail });
  const marker = passed ? 'PASS' : 'FAIL';
  const line = detail ? `${marker} ${name} - ${detail}` : `${marker} ${name}`;
  console.log(line);
}

async function scenario(name, body) {
  const home = await tempPath('home');
  const workspace = await tempPath('ws');
  try {
    await body({ home, workspace });
  } catch (error) {
    record(name, false, `threw ${error.message}`);
  } finally {
    await rm(home, { recursive: true, force: true });
    await rm(workspace, { recursive: true, force: true });
  }
}

const assertParsedJson = (stdout) => JSON.parse(stdout);

async function main() {
  await scenario('estimate: happy-path directory with nested files', async ({ home, workspace }) => {
    await writeFile(join(workspace, 'index.html'), '<h1>ok</h1>');
    await mkdir(join(workspace, 'css'));
    await writeFile(join(workspace, 'css', 'style.css'), 'body{font-size:14px;}');
    await mkdir(join(workspace, 'assets', 'images'), { recursive: true });
    await writeFile(join(workspace, 'assets', 'images', 'logo.svg'), '<svg/>');

    const { stdout } = await runCli(['estimate', workspace], { home });
    const parsed = assertParsedJson(stdout);
    const ok =
      parsed.ok === true &&
      parsed.command === 'estimate' &&
      parsed.data.target_type === 'directory' &&
      parsed.data.file_count === 3 &&
      parsed.data.bytes > 0 &&
      parsed.data.cost_estimate.provider === 'bunny' &&
      Array.isArray(parsed.next_actions) &&
      parsed.next_actions.length > 0;
    record('estimate: happy-path directory with nested files', ok,
      `file_count=${parsed.data.file_count}, bytes=${parsed.data.bytes}`);
  });

  await scenario('estimate: single file target', async ({ home, workspace }) => {
    const target = join(workspace, 'report.pdf');
    await writeFile(target, 'pdf-bytes');
    const { stdout } = await runCli(['estimate', target], { home });
    const parsed = assertParsedJson(stdout);
    const ok =
      parsed.ok === true &&
      parsed.data.target_type === 'file' &&
      parsed.data.file_count === 1 &&
      parsed.data.bytes === 9;
    record('estimate: single file target', ok, `bytes=${parsed.data.bytes}`);
  });

  await scenario('estimate: empty directory returns 0 files', async ({ home, workspace }) => {
    const { stdout } = await runCli(['estimate', workspace], { home });
    const parsed = assertParsedJson(stdout);
    const ok =
      parsed.ok === true &&
      parsed.data.file_count === 0 &&
      parsed.data.bytes === 0;
    record('estimate: empty directory returns 0 files', ok);
  });

  await scenario('estimate: path not found maps to PATH_NOT_FOUND', async ({ home, workspace }) => {
    const missing = join(workspace, 'does-not-exist');
    const { exitCode, stdout } = await runCli(['estimate', missing], { home, expectNonZero: true });
    const parsed = assertParsedJson(stdout);
    const ok =
      exitCode === 1 &&
      parsed.ok === false &&
      parsed.error.code === 'PATH_NOT_FOUND' &&
      typeof parsed.fix === 'string' &&
      parsed.fix.includes('path');
    record('estimate: path not found maps to PATH_NOT_FOUND', ok,
      `exit=${exitCode}, code=${parsed.error?.code}`);
  });

  await scenario('estimate: single secret file returns zero-file warning summary', async ({ home, workspace }) => {
    const secret = join(workspace, '.env');
    await writeFile(secret, 'API_KEY=123');
    const { stdout } = await runCli(['estimate', secret], { home });
    const parsed = assertParsedJson(stdout);
    const warnings = parsed.data.warnings ?? [];
    const ok =
      parsed.ok === true &&
      parsed.data.file_count === 0 &&
      warnings.some((warning) => warning.code === 'SECRET_LIKE_PATH');
    record('estimate: single secret file returns zero-file warning summary', ok,
      `warnings=${warnings.length}`);
  });

  await scenario('estimate: symlink is warned, not followed', async ({ home, workspace }) => {
    await writeFile(join(workspace, 'real.txt'), 'hello');
    await symlink(join(workspace, 'real.txt'), join(workspace, 'link.txt'));
    const { stdout } = await runCli(['estimate', workspace], { home });
    const parsed = assertParsedJson(stdout);
    const warnings = parsed.data.warnings ?? [];
    const ok =
      parsed.ok === true &&
      parsed.data.file_count === 1 &&
      warnings.some((warning) => warning.code === 'SKIPPED_SYMLINK');
    record('estimate: symlink is warned, not followed', ok,
      `file_count=${parsed.data.file_count}, warnings=${warnings.length}`);
  });

  await scenario('estimate: .gitignore excludes files', async ({ home, workspace }) => {
    await writeFile(join(workspace, '.gitignore'), 'drafts/\n*.log\n');
    await writeFile(join(workspace, 'index.html'), '<h1>ok</h1>');
    await writeFile(join(workspace, 'error.log'), 'bad');
    await mkdir(join(workspace, 'drafts'));
    await writeFile(join(workspace, 'drafts', 'note.txt'), 'draft');
    const { stdout } = await runCli(['estimate', workspace], { home });
    const parsed = assertParsedJson(stdout);
    const ok = parsed.ok === true && parsed.data.file_count === 1;
    record('estimate: .gitignore excludes files', ok, `file_count=${parsed.data.file_count}`);
  });

  await scenario('estimate: .plintignore adds additional excludes', async ({ home, workspace }) => {
    await writeFile(join(workspace, '.plintignore'), 'drafts/\n');
    await writeFile(join(workspace, 'index.html'), '<h1>ok</h1>');
    await mkdir(join(workspace, 'drafts'));
    await writeFile(join(workspace, 'drafts', 'note.txt'), 'draft');
    const { stdout } = await runCli(['estimate', workspace], { home });
    const parsed = assertParsedJson(stdout);
    const ok = parsed.ok === true && parsed.data.file_count === 1;
    record('estimate: .plintignore adds additional excludes', ok,
      `file_count=${parsed.data.file_count}`);
  });

  await scenario('estimate: .plintignore cannot re-include hard excludes', async ({ home, workspace }) => {
    await writeFile(join(workspace, '.plintignore'), '!.env\n!private.key\n');
    await writeFile(join(workspace, 'index.html'), '<h1>ok</h1>');
    await writeFile(join(workspace, '.env'), 'secret');
    await writeFile(join(workspace, 'private.key'), 'secret');
    const { stdout } = await runCli(['estimate', workspace], { home });
    const parsed = assertParsedJson(stdout);
    const warnings = parsed.data.warnings ?? [];
    const ok =
      parsed.ok === true &&
      parsed.data.file_count === 1 &&
      warnings.filter((warning) => warning.code === 'SECRET_LIKE_PATH').length === 2;
    record('estimate: .plintignore cannot re-include hard excludes', ok,
      `file_count=${parsed.data.file_count}, secret_warnings=${
        warnings.filter((warning) => warning.code === 'SECRET_LIKE_PATH').length
      }`);
  });

  await scenario('estimate: node_modules excluded by default', async ({ home, workspace }) => {
    await writeFile(join(workspace, 'index.html'), '<h1>ok</h1>');
    await mkdir(join(workspace, 'node_modules', 'foo'), { recursive: true });
    await writeFile(join(workspace, 'node_modules', 'foo', 'index.js'), 'module.exports = 1;');
    const { stdout } = await runCli(['estimate', workspace], { home });
    const parsed = assertParsedJson(stdout);
    const ok = parsed.ok === true && parsed.data.file_count === 1;
    record('estimate: node_modules excluded by default', ok,
      `file_count=${parsed.data.file_count}`);
  });

  await scenario('estimate: hidden dotfile directories excluded', async ({ home, workspace }) => {
    await writeFile(join(workspace, 'index.html'), '<h1>ok</h1>');
    await mkdir(join(workspace, '.next'));
    await writeFile(join(workspace, '.next', 'build.json'), '{}');
    const { stdout } = await runCli(['estimate', workspace], { home });
    const parsed = assertParsedJson(stdout);
    const ok = parsed.ok === true && parsed.data.file_count === 1;
    record('estimate: hidden dotfile directories excluded', ok);
  });

  await scenario('estimate: filenames with unicode and spaces', async ({ home, workspace }) => {
    await writeFile(join(workspace, 'héllo world.html'), '<h1>héllo</h1>');
    await writeFile(join(workspace, 'café menu.txt'), 'espresso');
    await writeFile(join(workspace, '\u{1F4A9}.txt'), 'yep');
    const { stdout } = await runCli(['estimate', workspace], { home });
    const parsed = assertParsedJson(stdout);
    const paths = parsed.data.largest_files.map((file) => file.path);
    const ok =
      parsed.ok === true &&
      parsed.data.file_count === 3 &&
      paths.some((path) => path.includes('héllo')) &&
      paths.some((path) => path.includes('café'));
    record('estimate: filenames with unicode and spaces', ok,
      `paths=${JSON.stringify(paths)}`);
  });

  await scenario('estimate: individual-file guardrail fires at 25MB+', async ({ home, workspace }) => {
    const big = join(workspace, 'big.bin');
    const buffer = Buffer.alloc(26 * 1024 * 1024, 0x41);
    await writeFile(big, buffer);
    await writeFile(join(workspace, 'tiny.txt'), 'ok');
    const { stdout } = await runCli(['estimate', workspace], { home });
    const parsed = assertParsedJson(stdout);
    const warnings = parsed.data.warnings ?? [];
    const ok =
      parsed.ok === true &&
      parsed.data.file_count === 2 &&
      warnings.some((warning) => warning.code === 'FILE_SIZE_HIGH');
    record('estimate: individual-file guardrail fires at 25MB+', ok,
      `warnings=${warnings.map((w) => w.code).join(',')}`);
  });

  await scenario('deploy dry-run: unnamed non-interactive requires project', async ({ home, workspace }) => {
    await writeFile(join(workspace, 'index.html'), '<h1>ok</h1>');
    const { exitCode, stdout } = await runCli(['deploy', workspace, '--dry-run'], {
      home,
      expectNonZero: true
    });
    const parsed = assertParsedJson(stdout);
    const ok =
      exitCode === 1 &&
      parsed.ok === false &&
      parsed.error.code === 'PROJECT_REQUIRED' &&
      typeof parsed.fix === 'string' &&
      parsed.fix.includes('-p');
    record('deploy dry-run: unnamed non-interactive requires project', ok,
      `code=${parsed.error?.code}`);
  });

  await scenario('deploy dry-run: named --create without auth succeeds', async ({ home, workspace }) => {
    await writeFile(join(workspace, 'index.html'), '<h1>ok</h1>');
    const { stdout } = await runCli(
      ['deploy', workspace, '-p', 'stress-demo', '--create', '--dry-run'],
      { home }
    );
    const parsed = assertParsedJson(stdout);
    const ok =
      parsed.ok === true &&
      parsed.data.project === 'stress-demo' &&
      parsed.data.dry_run === true &&
      parsed.data.would_create_binding === true;
    record('deploy dry-run: named --create without auth succeeds', ok);
  });

  await scenario('deploy dry-run: missing project without --create rejects', async ({ home, workspace }) => {
    await writeFile(join(workspace, 'index.html'), '<h1>ok</h1>');
    const { exitCode, stdout } = await runCli(
      ['deploy', workspace, '-p', 'stress-missing', '--dry-run'],
      { home, expectNonZero: true }
    );
    const parsed = assertParsedJson(stdout);
    const ok =
      exitCode === 1 &&
      parsed.ok === false &&
      parsed.error.code === 'PROJECT_NOT_FOUND' &&
      typeof parsed.fix === 'string' &&
      parsed.fix.includes('--create');
    record('deploy dry-run: missing project without --create rejects', ok,
      `code=${parsed.error?.code}`);
  });

  await scenario('cli: unknown flag emits INVALID_USAGE in JSON', async ({ home }) => {
    const { exitCode, stdout } = await runCli(['--no-such-flag'], { home, expectNonZero: true });
    const parsed = assertParsedJson(stdout);
    const ok = exitCode === 1 && parsed.ok === false && parsed.error.code === 'INVALID_USAGE';
    record('cli: unknown flag emits INVALID_USAGE in JSON', ok,
      `code=${parsed.error?.code}`);
  });

  await scenario('cli: unknown positional degrades to PATH_NOT_FOUND, not crash', async ({ home }) => {
    // By design the root argument is the deploy path, so a stray token
    // becomes a nonexistent path. This confirms we fail cleanly with a
    // structured error instead of throwing or printing human text.
    const { exitCode, stdout } = await runCli(['bogus-command'], { home, expectNonZero: true });
    const parsed = assertParsedJson(stdout);
    const ok =
      exitCode === 1 &&
      parsed.ok === false &&
      parsed.error.code === 'PATH_NOT_FOUND' &&
      typeof parsed.fix === 'string';
    record('cli: unknown positional degrades to PATH_NOT_FOUND, not crash', ok,
      `code=${parsed.error?.code}`);
  });

  await scenario('cli: help exits 0 without parsing errors', async ({ home }) => {
    const { exitCode } = await runCli(['--help'], { home });
    record('cli: help exits 0 without parsing errors', exitCode === 0, `exit=${exitCode}`);
  });

  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;
  console.log(`\nStress run complete: ${passed}/${results.length} passed, ${failed} failed.`);

  if (failed > 0) {
    console.log('\nFailed scenarios:');
    for (const result of results.filter((r) => !r.passed)) {
      console.log(`  - ${result.name}${result.detail ? ` (${result.detail})` : ''}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Stress runner crashed:', error);
  process.exit(2);
});
