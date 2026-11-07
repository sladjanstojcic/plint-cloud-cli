import { z } from 'zod';
import { listStorageZones } from '../../lib/bunny.js';
import { resolveApiKey } from '../../lib/config.js';
import { collectDoctor } from '../../lib/doctor.js';
import { ERROR_CODES } from '../../lib/error-codes.js';
import { listProjects, removeProject } from '../../lib/projects/store.js';
import { detectStaleProjects } from '../../lib/projects/status.js';
import { errorResult, okResult } from '../errors.js';

export const repairInput = z.object({
  dry_run: z.boolean().default(true).optional(),
  prune_stale: z.boolean().default(true).optional()
});

export function doctorHandler(overrides = {}) {
  const deps = { collectDoctor, ...overrides };
  return async () => okResult(await deps.collectDoctor(), 'Doctor checks complete.');
}

export function repairHandler(overrides = {}) {
  const deps = { listStorageZones, resolveApiKey, listProjects, removeProject, ...overrides };
  return async ({ dry_run = true, prune_stale = true } = {}) => {
    const apiKey = deps.resolveApiKey();
    if (!apiKey) {
      return errorResult(ERROR_CODES.AUTH_MISSING, 'No API key found.');
    }

    const projects = await deps.listProjects();
    const zones = Object.keys(projects).length > 0 ? await deps.listStorageZones(apiKey) : [];
    const stale = detectStaleProjects(projects, zones);

    if (!dry_run && prune_stale) {
      for (const project of stale) {
        await deps.removeProject(project);
      }
    }

    return okResult(
      {
        stale,
        pruned: !dry_run && prune_stale ? stale.length : 0,
        dry_run
      },
      dry_run
        ? `Found ${stale.length} stale project(s).`
        : `Pruned ${stale.length} stale project(s).`
    );
  };
}

export function registerSystemTools(server, deps) {
  server.registerTool(
    'plint_doctor',
    {
      title: 'Run doctor',
      description: 'Check auth, state, and Bunny reachability.'
    },
    doctorHandler(deps)
  );
  server.registerTool(
    'plint_repair',
    {
      title: 'Repair state',
      description: 'Find and optionally prune stale local projects.',
      inputSchema: repairInput
    },
    repairHandler(deps)
  );
}
