import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, chmod, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile, spawn } from 'node:child_process';
import * as tar from 'tar';

function runCommand(command, args, { cwd = process.cwd(), env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd, env }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function runInstall({ home, releaseUrl }) {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['install.sh'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOME: home,
        SHELL: '/bin/zsh',
        PLINT_RELEASE_URL: releaseUrl
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('install.sh does not append PATH twice on repeat install', async () => {
  const root = await mkdtemp(join(tmpdir(), 'plint-install-itest-'));
  const home = join(root, 'home');
  const releaseDir = join(root, 'release');
  const distDir = join(releaseDir, 'dist');

  await mkdir(join(home, '.plint'), { recursive: true });
  await mkdir(distDir, { recursive: true });
  await writeFile(join(distDir, 'plint'), '#!/bin/sh\nexit 0\n');
  await writeFile(join(distDir, 'plint.cjs'), 'console.log("ok");\n');
  await chmod(join(distDir, 'plint'), 0o755);
  await chmod(join(distDir, 'plint.cjs'), 0o755);
  await tar.create({
    cwd: distDir,
    file: join(distDir, 'plint.tar.gz'),
    gzip: true
  }, ['plint', 'plint.cjs']);

  const releaseUrl = `file://${join(distDir, 'plint.tar.gz')}`;
  const first = await runInstall({ home, releaseUrl });
  const second = await runInstall({ home, releaseUrl });

  assert.equal(first.code, 0);
  assert.equal(second.code, 0);

  const profile = await readFile(join(home, '.zshrc'), 'utf8');
  const lines = profile.split('\n').filter((line) => line.includes('.plint/bin'));
  assert.equal(lines.length, 1);
});

test('installed release can run estimate from the bundled binary', async () => {
  const root = await mkdtemp(join(tmpdir(), 'plint-install-real-'));
  const home = join(root, 'home');
  const site = join(root, 'site');
  await mkdir(home, { recursive: true });
  await mkdir(site, { recursive: true });
  await writeFile(join(site, 'index.html'), '<h1>ok</h1>');

  const distDir = join(root, 'dist');
  await runCommand('node', ['scripts/build-release.mjs'], {
    env: { ...process.env, PLINT_DIST_DIR: distDir }
  });
  const releaseUrl = `file://${join(distDir, 'plint.tar.gz')}`;
  const install = await runInstall({ home, releaseUrl });
  assert.equal(install.code, 0);

  const { stdout } = await runCommand(join(home, '.plint', 'bin', 'plint'), [
    '--json',
    'estimate',
    site
  ], {
    env: {
      ...process.env,
      HOME: home,
      BUNNY_API_KEY: ''
    }
  });
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.command, 'estimate');
  assert.equal(parsed.data.file_count, 1);
});
