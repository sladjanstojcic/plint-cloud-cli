import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { dryRunPayload } from '../../lib/deploy/dry-run.js';
import { assertDeployableScan } from '../../lib/deploy/validation.js';
import { deployCore } from '../../lib/deploy-core.js';
import { ERROR_CODES } from '../../lib/error-codes.js';
import { scanLocalTarget } from '../../lib/files.js';
import { assertSafePath } from '../../lib/files/safety.js';
import { summarizeScan } from '../../lib/preflight/index.js';
import { validateProjectName } from '../../lib/projects/name.js';
import { persistBinding, persistDeploy } from '../../lib/projects/persistence.js';
import {
  bindingToExistingZone,
  getProject,
  isProjectNameReserved
} from '../../lib/projects/store.js';
import { errorResult, okResult } from '../errors.js';

export const deployInput = z.object({
  path: z.string().refine(isAbsolute, { message: 'path must be absolute' }),
  project: z.string(),
  create: z.boolean().optional(),
  dry_run: z.boolean().optional()
});

export const deployOutput = z.object({
  project: z.string(),
  url: z.url(),
  zone_id: z.string(),
  cdn_id: z.string(),
  file_count: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
  uploaded: z.number().int().nonnegative(),
  deleted: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  created: z.boolean()
});

const MAPPABLE_DEPLOY_CODES = new Set([
  ERROR_CODES.PROJECT_STALE,
  ERROR_CODES.PATH_NOT_FOUND,
  ERROR_CODES.PATH_NOT_SUPPORTED,
  ERROR_CODES.PATH_UNSAFE,
  ERROR_CODES.DIRECTORY_EMPTY,
  ERROR_CODES.AUTH_MISSING
]);

const defaults = {
  deployCore,
  persistDeploy,
  persistBinding,
  validateProjectName,
  getProject,
  isProjectNameReserved,
  scanLocalTarget,
  summarizeScan
};

export function deployHandler(overrides = {}) {
  const deps = { ...defaults, ...overrides };
  return async ({ path, project, create = false, dry_run = false }) => {
    try {
      deps.validateProjectName(project);
    } catch (error) {
      if (error.code === ERROR_CODES.PROJECT_INVALID) {
        return errorResult(ERROR_CODES.PROJECT_INVALID, error.message);
      }
      throw error;
    }

    if (await deps.isProjectNameReserved(project)) {
      return errorResult(
        ERROR_CODES.PROJECT_NAME_RESERVED,
        `Project '${project}' has already been used and cannot be reused.`
      );
    }

    const existing = await deps.getProject(project);
    if (!existing && !create) {
      return errorResult(ERROR_CODES.PROJECT_NOT_FOUND, `Project '${project}' does not exist.`);
    }

    let result;
    try {
      assertSafePath(path);
      const scan = await deps.scanLocalTarget(path);
      const scanSummary = deps.summarizeScan(scan);
      assertDeployableScan(scanSummary);
      const existingZone = existing ? bindingToExistingZone(existing.binding) : undefined;

      if (dry_run) {
        const changeset = existing
          ? await deps.deployCore({ path, existingZone, scan, dryRun: true })
          : null;
        const payload = dryRunPayload({ project, created: !existing, scanSummary, changeset });
        return okResult(payload, `Dry-run complete for ${project}.`);
      }

      result = await deps.deployCore({
        path,
        existingZone,
        scan,
        onBindingCreated: (config) => deps.persistBinding({ project, config })
      });
    } catch (error) {
      if (MAPPABLE_DEPLOY_CODES.has(error.code)) {
        return errorResult(error.code, error.message);
      }
      throw error;
    }

    const payload = await deps.persistDeploy({
      project,
      result,
      created: !existing,
      previousUrl: existing?.url
    });
    return okResult(payload, `Deployed ${payload.project} to ${payload.url}`);
  };
}

export function registerDeploy(server, deps) {
  server.registerTool(
    'plint_deploy',
    {
      title: 'Deploy to a project',
      description: 'Deploy a file or directory into a project.',
      inputSchema: deployInput
    },
    deployHandler(deps)
  );
}
