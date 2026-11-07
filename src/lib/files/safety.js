import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { ERROR_CODES } from '../error-codes.js';

const UNSAFE_DIRS = new Set([
  '/',
  homedir(),
  join(homedir(), 'Desktop'),
  join(homedir(), 'Documents'),
  join(homedir(), 'Downloads')
]);

export function assertSafePath(path) {
  const abs = resolve(path);
  if (UNSAFE_DIRS.has(abs)) {
    const error = new Error(`Refusing to scan top-level path: ${abs}`);
    error.code = ERROR_CODES.PATH_UNSAFE;
    throw error;
  }
}
