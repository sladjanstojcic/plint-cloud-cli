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

export async function persistDeploy({ project, result, created }, overrides = {}) {
  const deps = { ...defaults, ...overrides };
  const { url, warning } = deps.deployUrl(result.pullZoneHostname, result.remoteFiles);
  const now = new Date().toISOString();

  await deps.upsertProject(project, {
    url,
    last_deploy_at: now,
    binding: {
      storage_zone_id: String(result.storageZoneId),
      pull_zone_id: String(result.pullZoneId),
      storage_hostname: result.storageHostname,
      pull_zone_hostname: result.pullZoneHostname,
      zone_name: result.zoneName,
      zone_password: result.zonePassword
    }
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
