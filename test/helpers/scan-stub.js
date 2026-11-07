import { summarizeScan } from '../../src/lib/preflight/index.js';

// Deploy flows scan the target before prompting; this stands in for a
// one-file directory so tests don't need a real path on disk.
export function stubScanDeps(files = [{ path: 'index.html', size: 12, checksum: 'abc' }]) {
  return {
    scanLocalTarget: async (path) => ({ path, targetType: 'directory', files, warnings: [] }),
    summarizeScan
  };
}
