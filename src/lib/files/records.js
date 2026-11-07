import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { relative } from 'node:path';
import { pipeline } from 'node:stream/promises';

export const toRelativePath = (rootDir, absolutePath) =>
  relative(rootDir, absolutePath).split('\\').join('/');

export async function buildFileRecord(rootDir, absolutePath) {
  const { size } = await stat(absolutePath);
  const hash = createHash('sha256');
  await pipeline(createReadStream(absolutePath), hash);
  return {
    localPath: absolutePath,
    path: toRelativePath(rootDir, absolutePath),
    size,
    checksum: hash.digest('hex').toUpperCase()
  };
}
