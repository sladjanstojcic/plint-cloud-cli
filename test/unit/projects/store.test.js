import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProjectsStore } from '../../../src/lib/projects/store.js';
import { ERROR_CODES } from '../../../src/lib/error-codes.js';

describe('project store', () => {
  it('returns empty state when file is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plint-project-store-'));
    const store = createProjectsStore({ rootDir: root });
    assert.deepEqual(await store.readState(), {
      reserved_project_names: {},
      projects: {}
    });
  });

  it('upserts and reads a project', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plint-project-store-'));
    const store = createProjectsStore({ rootDir: root });

    await store.upsertProject('docs', {
      url: 'https://example.b-cdn.net/',
      last_deploy_at: '2026-04-18T10:00:00Z',
      binding: {
        storage_zone_id: '1',
        pull_zone_id: '2',
        storage_hostname: 'storage.bunnycdn.com',
        pull_zone_hostname: 'example.b-cdn.net',
        zone_password: 'secret'
      }
    });

    assert.equal((await store.getProject('docs')).binding.pull_zone_id, '2');
  });

  it('removes and reserves a destroyed project name', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plint-project-store-'));
    const store = createProjectsStore({ rootDir: root });

    await store.upsertProject('docs', {
      url: 'https://example.b-cdn.net/',
      last_deploy_at: '2026-04-18T10:00:00Z',
      binding: {
        storage_zone_id: '1',
        pull_zone_id: '2',
        storage_hostname: 'storage.bunnycdn.com',
        pull_zone_hostname: 'example.b-cdn.net',
        zone_password: 'secret'
      }
    });
    await store.removeProject('docs');
    await store.reserveProjectName('docs', '2026-04-18T10:01:00Z');

    assert.equal(await store.getProject('docs'), null);
    assert.equal(await store.isProjectNameReserved('docs'), true);
  });

  it('throws STATE_CORRUPT when state.json is not valid JSON', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plint-project-store-'));
    await writeFile(join(root, 'state.json'), 'not json {');
    const store = createProjectsStore({ rootDir: root });
    await assert.rejects(
      () => store.readState(),
      (error) => error.code === ERROR_CODES.STATE_CORRUPT
    );
  });

  it('throws STATE_CORRUPT when state.json is the wrong shape', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plint-project-store-'));
    await writeFile(join(root, 'state.json'), JSON.stringify({ foo: 'bar' }));
    const store = createProjectsStore({ rootDir: root });
    await assert.rejects(
      () => store.readState(),
      (error) => error.code === ERROR_CODES.STATE_CORRUPT
    );
  });

  it('still accepts legacy slugs format (migration)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plint-project-store-'));
    await writeFile(
      join(root, 'state.json'),
      JSON.stringify({
        slugs: {
          legacy: {
            zone_id: 1,
            pull_zone_id: 2,
            storage_hostname: 's',
            pull_zone_hostname: 'p.b-cdn.net',
            zone_password: 'x',
            last_deploy_at: '2026-04-18T10:00:00Z'
          }
        }
      })
    );
    const store = createProjectsStore({ rootDir: root });
    const state = await store.readState();
    assert.equal(state.projects.legacy.binding.storage_zone_id, '1');
  });

  it('writes state.json readable only by the owner (it holds zone passwords)', async () => {
    const { stat } = await import('node:fs/promises');
    const root = await mkdtemp(join(tmpdir(), 'plint-project-store-'));
    const store = createProjectsStore({ rootDir: root });
    await store.upsertProject('docs', { binding: { zone_password: 'secret' } });
    const files = await (await import('node:fs/promises')).readdir(root, { recursive: true });
    const statePath = files.map((f) => join(root, f)).find((f) => f.endsWith('state.json'));
    assert.equal((await stat(statePath)).mode & 0o777, 0o600);
  });
});
