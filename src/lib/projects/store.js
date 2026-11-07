import { mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import writeFileAtomic from 'write-file-atomic';
import * as lockfile from 'proper-lockfile';
import { ERROR_CODES } from '../error-codes.js';

const EMPTY = { reserved_project_names: {}, projects: {} };

export function bindingToExistingZone(binding) {
  const zone = {
    zoneId: binding.storage_zone_id,
    zonePassword: binding.zone_password,
    storageHostname: binding.storage_hostname,
    pullZoneId: binding.pull_zone_id,
    pullZoneHostname: binding.pull_zone_hostname
  };
  if (binding.zone_name) zone.zoneName = binding.zone_name;
  return zone;
}

function corruptStateError(detail) {
  const error = new Error(`state.json is corrupt: ${detail}`);
  error.code = ERROR_CODES.STATE_CORRUPT;
  return error;
}

function migrateState(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw corruptStateError('expected a JSON object');
  }
  if (raw.projects && typeof raw.projects === 'object') return raw;
  if (raw.slugs && typeof raw.slugs === 'object') {
    const projects = {};
    for (const [name, entry] of Object.entries(raw.slugs)) {
      projects[name] = {
        url: `https://${entry.pull_zone_hostname}`,
        last_deploy_at: entry.last_deploy_at,
        created_at: entry.created_at,
        binding: {
          storage_zone_id: String(entry.zone_id),
          pull_zone_id: String(entry.pull_zone_id),
          storage_hostname: entry.storage_hostname,
          pull_zone_hostname: entry.pull_zone_hostname,
          zone_password: entry.zone_password
        }
      };
    }
    return { reserved_project_names: {}, projects };
  }
  throw corruptStateError('missing `projects` key');
}

export function createProjectsStore({ rootDir = join(homedir(), '.plint') } = {}) {
  const statePath = join(rootDir, 'state.json');

  async function ensureRoot() {
    await mkdir(rootDir, { recursive: true });
  }

  async function readState() {
    try {
      const raw = JSON.parse(await readFile(statePath, 'utf8'));
      return migrateState(raw);
    } catch (error) {
      if (error.code === 'ENOENT') return structuredClone(EMPTY);
      error.code = ERROR_CODES.STATE_CORRUPT;
      throw error;
    }
  }

  async function writeState(nextState) {
    await ensureRoot();
    await writeFileAtomic(statePath, `${JSON.stringify(nextState, null, 2)}\n`);
  }

  async function withLock(work) {
    await ensureRoot();
    const release = await lockfile.lock(statePath, { realpath: false, retries: 5 });
    try {
      return await work();
    } finally {
      await release();
    }
  }

  return {
    async readState() {
      return readState();
    },
    async getProject(project) {
      return (await readState()).projects[project] ?? null;
    },
    async listProjects() {
      return (await readState()).projects;
    },
    async isProjectNameReserved(project) {
      return Boolean((await readState()).reserved_project_names[project]);
    },
    async upsertProject(project, value) {
      return withLock(async () => {
        const state = await readState();
        state.projects[project] = { ...state.projects[project], ...value };
        await writeState(state);
      });
    },
    async removeProject(project) {
      return withLock(async () => {
        const state = await readState();
        delete state.projects[project];
        await writeState(state);
      });
    },
    async reserveProjectName(project, destroyedAt = new Date().toISOString()) {
      return withLock(async () => {
        const state = await readState();
        state.reserved_project_names[project] = { destroyed_at: destroyedAt };
        await writeState(state);
      });
    }
  };
}

const defaultStore = createProjectsStore();

export const readProjectsState = defaultStore.readState;
export const getProject = defaultStore.getProject;
export const listProjects = defaultStore.listProjects;
export const isProjectNameReserved = defaultStore.isProjectNameReserved;
export const upsertProject = defaultStore.upsertProject;
export const removeProject = defaultStore.removeProject;
export const reserveProjectName = defaultStore.reserveProjectName;
