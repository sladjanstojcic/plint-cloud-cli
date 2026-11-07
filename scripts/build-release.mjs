import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import * as tar from 'tar';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const rootDir = join(scriptDir, '..');
// PLINT_DIST_DIR lets tests build into a temp dir instead of overwriting dist/.
const outDir = process.env.PLINT_DIST_DIR ? resolve(process.env.PLINT_DIST_DIR) : join(rootDir, 'dist');

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await build({
  entryPoints: [join(rootDir, 'src', 'cli-bin.js')],
  outfile: join(outDir, 'plint.cjs'),
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node22'
});

await writeFile(
  join(outDir, 'plint'),
  '#!/bin/sh\nDIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nexec node "$DIR/plint.cjs" "$@"\n'
);
await chmod(join(outDir, 'plint'), 0o755);
await chmod(join(outDir, 'plint.cjs'), 0o755);
await tar.create({
  cwd: outDir,
  file: join(outDir, 'plint.tar.gz'),
  gzip: true
}, ['plint', 'plint.cjs']);
