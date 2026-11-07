import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { ERROR_CODES } from '../../lib/error-codes.js';
import { scanLocalTarget } from '../../lib/files.js';
import { summarizeScan } from '../../lib/preflight/index.js';
import { errorResult, okResult } from '../errors.js';

export const estimateInput = z.object({
  path: z.string().refine(isAbsolute, { message: 'path must be absolute' })
});

const defaults = { scanLocalTarget, summarizeScan };

export function estimateHandler(overrides = {}) {
  const deps = { ...defaults, ...overrides };
  return async ({ path }) => {
    try {
      const scan = await deps.scanLocalTarget(path);
      return okResult(deps.summarizeScan(scan), `Estimated ${path}.`);
    } catch (error) {
      if (error.code === ERROR_CODES.PATH_NOT_FOUND) {
        return errorResult(ERROR_CODES.PATH_NOT_FOUND, error.message);
      }
      throw error;
    }
  };
}

export function registerEstimate(server, deps) {
  server.registerTool(
    'plint_estimate',
    {
      title: 'Estimate deploy',
      description: 'Estimate deploy size, warnings, and rough Bunny storage cost.',
      inputSchema: estimateInput
    },
    estimateHandler(deps)
  );
}
