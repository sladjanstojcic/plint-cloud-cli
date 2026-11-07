import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHistoryStore } from '../../../src/lib/projects/history.js';

describe('project history store', () => {
  it('returns empty history when file is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plint-project-history-'));
    const store = createHistoryStore({ rootDir: root });
    assert.deepEqual(await store.readHistory({ project: 'docs' }), []);
  });

  it('appends and reads history newest first', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plint-project-history-'));
    const store = createHistoryStore({ rootDir: root });

    await store.appendHistory({
      ts: '2026-04-18T10:00:00Z',
      project: 'docs',
      op: 'deploy',
      ok: true
    });
    await store.appendHistory({
      ts: '2026-04-18T10:01:00Z',
      project: 'docs',
      op: 'purge',
      ok: true
    });

    const entries = await store.readHistory({ project: 'docs', limit: 10 });
    assert.equal(entries[0].op, 'purge');
  });
});
