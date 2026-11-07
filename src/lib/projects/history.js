import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as lockfile from 'proper-lockfile';
import { ERROR_CODES } from '../error-codes.js';

export function createHistoryStore({ rootDir = join(homedir(), '.plint') } = {}) {
  const historyPath = join(rootDir, 'history.jsonl');

  async function ensureRoot() {
    await mkdir(rootDir, { recursive: true });
  }

  async function withLock(work) {
    await ensureRoot();
    const release = await lockfile.lock(historyPath, { realpath: false, retries: 5 });
    try {
      return await work();
    } finally {
      await release();
    }
  }

  return {
    async appendHistory(record) {
      return withLock(async () => {
        await appendFile(historyPath, `${JSON.stringify(record)}\n`);
      });
    },
    async readHistory({ project, limit = 20 } = {}) {
      try {
        const lines = (await readFile(historyPath, 'utf8')).trim().split('\n').filter(Boolean);
        return lines
          .map((line) => JSON.parse(line))
          .reverse()
          .filter((entry) => !project || entry.project === project)
          .slice(0, limit);
      } catch (error) {
        if (error.code === 'ENOENT') return [];
        error.code = ERROR_CODES.STATE_CORRUPT;
        throw error;
      }
    }
  };
}

const defaultHistoryStore = createHistoryStore();

export const appendHistory = defaultHistoryStore.appendHistory;
export const readHistory = defaultHistoryStore.readHistory;
