import packageJson from '../../package.json' with { type: 'json' };
import { listStorageZones, probeManagementApi } from './bunny.js';
import { resolveApiKey } from './config.js';
import { readProjectsState } from './projects/store.js';
import { deriveProjectStatus } from './projects/status.js';

function bunnyReachDetail({ status }) {
  if (status === null) return 'unreachable';
  if (status === 401) return 'auth failed (status 401) — check BUNNY_API_KEY or run `plint login`';
  return `status ${status}`;
}

export async function collectDoctor({
  env = process.env,
  probeManagementApiFn = probeManagementApi,
  readProjectsStateFn = readProjectsState,
  listStorageZonesFn = listStorageZones,
  resolveApiKeyFn = resolveApiKey,
  deriveProjectStatusFn = deriveProjectStatus
} = {}) {
  const apiKey = resolveApiKeyFn({ env });
  const reachable = await probeManagementApiFn(apiKey).catch(() => ({
    reachable: false,
    status: null
  }));
  const state = await readProjectsStateFn().catch(() => null);
  const projects = state?.projects ?? {};
  const hasProjects = Object.keys(projects).length > 0;
  const bunnyZones =
    apiKey && hasProjects ? await listStorageZonesFn(apiKey).catch(() => []) : [];
  const staleCount = Object.values(projects).filter(
    (entry) => deriveProjectStatusFn(entry, bunnyZones) === 'stale'
  ).length;

  return {
    checks: [
      {
        name: 'auth',
        ok: Boolean(apiKey),
        detail: apiKey ? 'API key available' : 'Run `plint login` or set BUNNY_API_KEY.'
      },
      {
        name: 'bunny_reach',
        ok: reachable.reachable,
        detail: bunnyReachDetail(reachable)
      },
      {
        name: 'state_rw',
        ok: Boolean(state),
        detail: state ? '~/.plint/state.json readable' : 'state unreadable'
      },
      {
        name: 'state_reconciled',
        ok: staleCount === 0,
        detail: `${staleCount} stale projects`
      }
    ],
    version: packageJson.version
  };
}
