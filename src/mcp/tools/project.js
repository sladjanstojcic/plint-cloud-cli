import { z } from 'zod';
import {
  getStorageZone,
  deleteStorageZone,
  listStorageZones,
  purgePullZone
} from '../../lib/bunny.js';
import { resolveApiKey } from '../../lib/config.js';
import { ERROR_CODES } from '../../lib/error-codes.js';
import { redactBinding } from '../../lib/projects/binding.js';
import { readHistory } from '../../lib/projects/history.js';
import { persistDestroy } from '../../lib/projects/persistence.js';
import {
  bindingToExistingZone,
  getProject,
  listProjects
} from '../../lib/projects/store.js';
import {
  deriveProjectStatus,
  formatProjectRow
} from '../../lib/projects/status.js';
import { listRemoteFiles } from '../../lib/storage.js';
import { errorResult, okResult } from '../errors.js';

export const projectInput = z.object({ project: z.string() });
export const inspectInput = z.object({
  project: z.string(),
  reveal: z.boolean().optional()
});
export const historyInput = z.object({
  project: z.string(),
  limit: z.number().int().min(1).max(200).default(20).optional()
});

const defaults = {
  listStorageZones,
  getStorageZone,
  deleteStorageZone,
  purgePullZone,
  listRemoteFiles,
  resolveApiKey,
  readHistory,
  persistDestroy,
  getProject,
  listProjects,
  deriveProjectStatus,
  formatProjectRow
};

export function listHandler(overrides = {}) {
  const deps = { ...defaults, ...overrides };
  return async () => {
    const projects = await deps.listProjects();
    const rows = Object.entries(projects).map(([project, entry]) =>
      deps.formatProjectRow(project, entry)
    );
    return okResult({ projects: rows }, `Found ${rows.length} projects.`);
  };
}

export function inspectHandler(overrides = {}) {
  const deps = { ...defaults, ...overrides };
  return async ({ project, reveal = false }) => {
    const entry = await deps.getProject(project);
    if (!entry) {
      return errorResult(ERROR_CODES.PROJECT_NOT_FOUND, `Project '${project}' does not exist.`);
    }
    const apiKey = deps.resolveApiKey();
    if (!apiKey) {
      return errorResult(ERROR_CODES.AUTH_MISSING, 'No API key found.');
    }
    const zones = await deps.listStorageZones(apiKey);
    return okResult(
      {
        project,
        url: entry.url,
        last_deploy_at: entry.last_deploy_at,
        status: deps.deriveProjectStatus(entry, zones),
        binding: redactBinding(entry.binding, { reveal })
      },
      `Loaded ${project}.`
    );
  };
}

export function historyHandler(overrides = {}) {
  const deps = { ...defaults, ...overrides };
  return async ({ project, limit = 20 }) => {
    const entries = await deps.readHistory({ project, limit });
    return okResult({ entries }, `Loaded ${entries.length} history entries.`);
  };
}

export function filesHandler(overrides = {}) {
  const deps = { ...defaults, ...overrides };
  return async ({ project }) => {
    const entry = await deps.getProject(project);
    if (!entry) {
      return errorResult(ERROR_CODES.PROJECT_NOT_FOUND, `Project '${project}' does not exist.`);
    }
    const apiKey = deps.resolveApiKey();
    if (!apiKey) {
      return errorResult(ERROR_CODES.AUTH_MISSING, 'No API key found.');
    }
    const config = bindingToExistingZone(entry.binding);
    if (!config.zoneName) {
      config.zoneName = (await deps.getStorageZone(apiKey, config.zoneId)).Name;
    }
    const files = await deps.listRemoteFiles(config);
    return okResult(
      {
        files: files.map((file) => ({ path: file.path, size: file.size }))
      },
      `Loaded ${files.length} files.`
    );
  };
}

export function purgeHandler(overrides = {}) {
  const deps = { ...defaults, ...overrides };
  return async ({ project }) => {
    const entry = await deps.getProject(project);
    if (!entry) {
      return errorResult(ERROR_CODES.PROJECT_NOT_FOUND, `Project '${project}' does not exist.`);
    }
    const apiKey = deps.resolveApiKey();
    if (!apiKey) {
      return errorResult(ERROR_CODES.AUTH_MISSING, 'No API key found.');
    }
    await deps.purgePullZone(apiKey, entry.binding.pull_zone_id);
    return okResult({ project, cdn_id: entry.binding.pull_zone_id }, `Purged ${project}.`);
  };
}

export function destroyHandler(overrides = {}) {
  const deps = { ...defaults, ...overrides };
  return async ({ project }) => {
    const entry = await deps.getProject(project);
    if (!entry) {
      return errorResult(ERROR_CODES.PROJECT_NOT_FOUND, `Project '${project}' does not exist.`);
    }
    const apiKey = deps.resolveApiKey();
    if (!apiKey) {
      return errorResult(ERROR_CODES.AUTH_MISSING, 'No API key found.');
    }
    await deps
      .deleteStorageZone(apiKey, entry.binding.storage_zone_id, {
        deleteLinkedPullZones: true
      })
      .catch((error) => {
        if (error.status !== 404) throw error;
      });
    const payload = await deps.persistDestroy({ project, entry });
    return okResult(payload, `Destroyed ${project}.`);
  };
}

export function registerProjectTools(server, deps) {
  server.registerTool(
    'plint_list',
    {
      title: 'List projects',
      description: 'List local projects with Bunny details.'
    },
    listHandler(deps)
  );
  server.registerTool(
    'plint_inspect',
    {
      title: 'Inspect project',
      description:
        'Show details for one project. Pass `reveal: true` to include zone_password.',
      inputSchema: inspectInput
    },
    inspectHandler(deps)
  );
  server.registerTool(
    'plint_history',
    {
      title: 'Project history',
      description: 'Read history for one project.',
      inputSchema: historyInput
    },
    historyHandler(deps)
  );
  server.registerTool(
    'plint_files',
    {
      title: 'Project files',
      description: 'List files for one project.',
      inputSchema: projectInput
    },
    filesHandler(deps)
  );
  server.registerTool(
    'plint_purge',
    {
      title: 'Purge project',
      description: 'Purge the CDN cache for one project.',
      inputSchema: projectInput
    },
    purgeHandler(deps)
  );
  server.registerTool(
    'plint_destroy',
    {
      title: 'Destroy project',
      description: 'Delete a project and its Bunny resources.',
      inputSchema: projectInput
    },
    destroyHandler(deps)
  );
}
