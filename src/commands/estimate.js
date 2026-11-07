import { resolve } from 'node:path';
import { ERROR_CODES } from '../lib/error-codes.js';
import { assertSafePath } from '../lib/files/safety.js';
import { scanLocalTarget } from '../lib/files.js';
import { summarizeScan } from '../lib/preflight/index.js';
import { writeJsonSuccess } from '../lib/output.js';

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatMarginalCost(cost) {
  const marginal = cost.raw_storage_monthly;
  if (marginal >= 0.01) return `+$${marginal.toFixed(2)}/mo`;
  return '<$0.01/mo';
}

function printHuman(summary, stdout = process.stdout) {
  const cost = summary.cost_estimate;
  stdout.write(`Path: ${summary.path}\n`);
  stdout.write(`Target: ${summary.target_type}\n`);
  stdout.write(`Files: ${summary.file_count}\n`);
  stdout.write(`Size: ${formatBytes(summary.bytes)}\n`);
  stdout.write(
    `Marginal Bunny storage: ${formatMarginalCost(cost)} (Bunny's $${cost.minimum_monthly_charge.toFixed(2)}/mo account minimum applies once per account)\n`
  );
  stdout.write('CDN bandwidth is not estimated; it depends on visitor traffic.\n');
  for (const warning of summary.warnings) stdout.write(`Warning: ${warning.message}\n`);
}

export default async function estimate(args, context = {}, deps = { scanLocalTarget, summarizeScan }) {
  const path = resolve(args[0] ?? '.');
  assertSafePath(path);
  let scan;
  try {
    scan = await deps.scanLocalTarget(path);
  } catch (error) {
    if (error.code === ERROR_CODES.PATH_EXCLUDED) {
      const summary = deps.summarizeScan({
        path,
        targetType: 'file',
        files: [],
        warnings: error.warnings ?? []
      });
      if (context.json) return writeJsonSuccess('estimate', summary, context.stdout);
      return printHuman(summary, context.stdout);
    }
    throw error;
  }
  const summary = deps.summarizeScan(scan);
  if (context.json) return writeJsonSuccess('estimate', summary, context.stdout);
  printHuman(summary, context.stdout);
}
