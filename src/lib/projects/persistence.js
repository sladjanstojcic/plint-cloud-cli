import { deployUrl } from '../deploy-url.js';
import { appendHistory } from './history.js';
import { removeProject, reserveProjectName, upsertProject } from './store.js';

const defaults = {
  deployUrl,
  appendHistory,
  upsertProject,
  removeProject,
  reserveProjectName
};

// The state.json binding for a project's Bunny zones (deployCore config shape).
function bindingRecord(zones) {
  return {
    storage_zone_id: String(zones.zoneId),
    pull_zone_id: String(zones.pullZoneId),
    storage_hostname: zones.storageHostname,
    pull_zone_hostname: zones.pullZoneHostname,
    zone_name: zones.zoneName,
    zone_password: zones.zonePassword
  };
}

// Records a new project the moment its Bunny zones exist, before any upload, so an
// interrupted first deploy leaves a project that can be redeployed or destroyed
// instead of zones plint no longer knows about.
export async function persistBinding({ project, config }, overrides = {}) {
  const deps = { ...defaults, ...overrides };
  await deps.upsertProject(project, {
    url: `https://${config.pullZoneHostname}/`,
    last_deploy_at: null,
    binding: bindingRecord(config)
  });
}

export async function persistDeploy({ project, result, created, previousUrl }, overrides = {}) {
  const deps = { ...defaults, ...overrides };
  // A single file added to an existing project keeps that project's URL.
  const keepUrl = !created && result.targetType === 'file' && previousUrl;
  const { url, warning } = keepUrl
    ? { url: previousUrl }
    : deps.deployUrl(result.pullZoneHostname, result.remoteFiles);
  const now = new Date().toISOString();

  await deps.upsertProject(project, {
    url,
    last_deploy_at: now,
    binding: bindingRecord({ ...result, zoneId: result.storageZoneId })
  });

  await deps.appendHistory({
    ts: now,
    project,
    op: 'deploy',
    ok: true,
    file_count: result.fileCount,
    bytes: result.bytes,
    url,
    duration_ms: 0
  });

  const payload = {
    project,
    url,
    zone_id: String(result.storageZoneId),
    cdn_id: String(result.pullZoneId),
    file_count: result.fileCount,
    bytes: result.bytes,
    uploaded: result.uploaded,
    deleted: result.deleted,
    unchanged: result.unchanged,
    created,
    local_path: result.localPath,
    warnings: result.warnings ?? [],
    cache_purge: result.cachePurge ?? 'skipped'
  };
  return warning ? { ...payload, warning } : payload;
}

export async function persistDestroy({ project, entry }, overrides = {}) {
  const deps = { ...defaults, ...overrides };
  await deps.removeProject(project);
  await deps.reserveProjectName(project);
  await deps.appendHistory({
    ts: new Date().toISOString(),
    project,
    op: 'destroy',
    ok: true,
    url: entry.url,
    duration_ms: 0
  });
  return {
    project,
    zone_id: entry.binding.storage_zone_id,
    cdn_id: entry.binding.pull_zone_id
  };
}
