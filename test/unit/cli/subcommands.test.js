import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../../src/cli.js';

describe('cli subcommand parsing', () => {
  it('passes -p to inspect instead of failing commander validation', async () => {
    const originalHome = process.env.HOME;
    const originalApiKey = process.env.BUNNY_API_KEY;
    const home = await mkdtemp(join(tmpdir(), 'plint-cli-home-'));
    const stdout = {
      value: '',
      write(chunk) {
        this.value += chunk;
      }
    };

    process.env.HOME = home;
    delete process.env.BUNNY_API_KEY;

    try {
      const exitCode = await runCli(['inspect', '-p', 'docs', '--json'], { stdout });
      const parsed = JSON.parse(stdout.value);
      assert.equal(exitCode, 1);
      assert.equal(parsed.error.code, 'PROJECT_NOT_FOUND');
    } finally {
      process.env.HOME = originalHome;
      if (originalApiKey === undefined) {
        delete process.env.BUNNY_API_KEY;
      } else {
        process.env.BUNNY_API_KEY = originalApiKey;
      }
    }
  });

  it('routes estimate without requiring auth', async () => {
    const originalHome = process.env.HOME;
    const originalApiKey = process.env.BUNNY_API_KEY;
    const home = await mkdtemp(join(tmpdir(), 'plint-cli-home-'));
    const site = await mkdtemp(join(tmpdir(), 'plint-cli-site-'));
    await writeFile(join(site, 'index.html'), '<h1>ok</h1>');
    const stdout = { value: '', write(chunk) { this.value += chunk; } };

    process.env.HOME = home;
    delete process.env.BUNNY_API_KEY;

    try {
      const exitCode = await runCli(['estimate', site, '--json'], { stdout });
      const parsed = JSON.parse(stdout.value);
      assert.equal(exitCode, 0);
      assert.equal(parsed.command, 'estimate');
      assert.equal(parsed.data.file_count, 1);
    } finally {
      process.env.HOME = originalHome;
      if (originalApiKey === undefined) delete process.env.BUNNY_API_KEY;
      else process.env.BUNNY_API_KEY = originalApiKey;
    }
  });

  it('routes explicit deploy command with project flags and dry-run', async () => {
    const originalHome = process.env.HOME;
    const originalApiKey = process.env.BUNNY_API_KEY;
    const home = await mkdtemp(join(tmpdir(), 'plint-cli-home-'));
    const site = await mkdtemp(join(tmpdir(), 'plint-cli-site-'));
    await writeFile(join(site, 'index.html'), '<h1>ok</h1>');
    const stdout = { value: '', write(chunk) { this.value += chunk; } };

    process.env.HOME = home;
    delete process.env.BUNNY_API_KEY;

    try {
      const exitCode = await runCli(
        ['deploy', site, '-p', 'docs', '--create', '--dry-run', '--json'],
        { stdout }
      );
      const parsed = JSON.parse(stdout.value);
      assert.equal(exitCode, 0);
      assert.equal(parsed.command, 'deploy');
      assert.equal(parsed.data.project, 'docs');
      assert.equal(parsed.data.dry_run, true);
    } finally {
      process.env.HOME = originalHome;
      if (originalApiKey === undefined) delete process.env.BUNNY_API_KEY;
      else process.env.BUNNY_API_KEY = originalApiKey;
    }
  });

  it('keeps the repair --dry-run subcommand working when root --dry-run is defined', async () => {
    const originalHome = process.env.HOME;
    const originalApiKey = process.env.BUNNY_API_KEY;
    const home = await mkdtemp(join(tmpdir(), 'plint-cli-home-'));
    const stdout = { value: '', write(chunk) { this.value += chunk; } };

    process.env.HOME = home;
    delete process.env.BUNNY_API_KEY;

    try {
      const exitCode = await runCli(['repair', '--dry-run', '--json'], { stdout });
      const parsed = JSON.parse(stdout.value);
      assert.equal(exitCode, 1);
      assert.equal(parsed.error.code, 'AUTH_MISSING');
    } finally {
      process.env.HOME = originalHome;
      if (originalApiKey === undefined) delete process.env.BUNNY_API_KEY;
      else process.env.BUNNY_API_KEY = originalApiKey;
    }
  });
});
