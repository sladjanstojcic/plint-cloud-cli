import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

test('repair --dry-run reports stale projects from central state', { skip: !process.env.BUNNY_API_KEY ? 'requires BUNNY_API_KEY' : undefined }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'plint-repair-itest-'));
  await mkdir(join(home, '.plint'), { recursive: true });
  await writeFile(
    join(home, '.plint', 'config.json'),
    `${JSON.stringify({ apiKey: process.env.BUNNY_API_KEY }, null, 2)}\n`
  );
  await writeFile(
    join(home, '.plint', 'state.json'),
    `${JSON.stringify({
      reserved_project_names: {},
      projects: {
        stale: {
          url: 'https://stale.b-cdn.net/',
          last_deploy_at: '2026-04-18T10:00:00Z',
          binding: {
            storage_zone_id: '999999999',
            pull_zone_id: '999999998',
            storage_hostname: 'storage.bunnycdn.com',
            pull_zone_hostname: 'stale.b-cdn.net',
            zone_password: 'secret'
          }
        }
      }
    }, null, 2)}\n`
  );

  const child = spawn('node', ['src/cli-bin.js', 'repair', '--prune-stale', '--dry-run'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOME: home
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });

  const exitCode = await new Promise((resolve) => child.on('close', resolve));
  assert.equal(exitCode, 0);
  assert.match(stdout, /stale/);
});
