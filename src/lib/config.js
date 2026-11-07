import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ERROR_CODES } from './error-codes.js';

export const GLOBAL_DIR = join(homedir(), '.plint');
const GLOBAL_FILE = 'config.json';

export function resolveApiKey({ env = process.env, globalConfigDir = GLOBAL_DIR } = {}) {
  if (env.BUNNY_API_KEY) return env.BUNNY_API_KEY;
  try {
    const raw = readFileSync(join(globalConfigDir, GLOBAL_FILE), 'utf8');
    return JSON.parse(raw).apiKey ?? null;
  } catch {
    return null;
  }
}

export function requireApiKey(resolveKey = resolveApiKey) {
  const apiKey = resolveKey();
  if (!apiKey) {
    const error = new Error('No API key found. Run `plint login` or set BUNNY_API_KEY.');
    error.code = ERROR_CODES.AUTH_MISSING;
    throw error;
  }
  return apiKey;
}

export async function saveGlobalConfig(data, globalConfigDir = GLOBAL_DIR) {
  await mkdir(globalConfigDir, { recursive: true });
  await writeFile(join(globalConfigDir, GLOBAL_FILE), `${JSON.stringify(data, null, 2)}\n`);
}
