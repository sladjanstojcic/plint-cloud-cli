import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveApiKey, saveGlobalConfig } from '../../src/lib/config.js';

describe('config', () => {
  it('reads BUNNY_API_KEY from env first', () => {
    assert.equal(
      resolveApiKey({ env: { BUNNY_API_KEY: 'from-env' }, globalConfigDir: '/does/not/exist' }),
      'from-env'
    );
  });

  it('falls back to the global config file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'plint-config-'));
    await writeFile(join(dir, 'config.json'), JSON.stringify({ apiKey: 'from-file' }));
    assert.equal(resolveApiKey({ env: {}, globalConfigDir: dir }), 'from-file');
  });

  it('returns null when neither source has a key', () => {
    assert.equal(
      resolveApiKey({ env: {}, globalConfigDir: '/does/not/exist' }),
      null
    );
  });

  it('persists the API key via saveGlobalConfig', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'plint-config-'));
    await saveGlobalConfig({ apiKey: 'written' }, dir);
    assert.deepEqual(
      JSON.parse(await readFile(join(dir, 'config.json'), 'utf8')),
      { apiKey: 'written' }
    );
  });
});
