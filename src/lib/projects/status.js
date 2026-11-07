export function deriveProjectStatus(project, storageZones) {
  return storageZones.some(
    (zone) => String(zone.Id) === String(project.binding.storage_zone_id)
  )
    ? 'ok'
    : 'stale';
}

export function detectStaleProjects(projects, storageZones) {
  const zoneIds = new Set(storageZones.map((zone) => String(zone.Id)));
  return Object.entries(projects)
    .filter(([, entry]) => !zoneIds.has(String(entry.binding.storage_zone_id)))
    .map(([project]) => project);
}

export function formatProjectRow(project, entry) {
  return {
    project,
    zone_id: entry.binding.storage_zone_id,
    cdn_id: entry.binding.pull_zone_id,
    url: entry.url,
    last_deploy_at: entry.last_deploy_at
  };
}
