import { listStorageZones } from '../lib/bunny.js';
import { requireApiKey, resolveApiKey } from '../lib/config.js';
import { writeJsonSuccess } from '../lib/output.js';
import { listProjects, removeProject } from '../lib/projects/store.js';
import { detectStaleProjects } from '../lib/projects/status.js';

export default async function repair(
  _args = [],
  context = {},
  deps = { listStorageZones, resolveApiKey, listProjects, removeProject }
) {
  const apiKey = requireApiKey(deps.resolveApiKey);

  const options = context.options ?? {};
  const projects = await deps.listProjects();
  const zones = Object.keys(projects).length > 0 ? await deps.listStorageZones(apiKey) : [];
  const stale = detectStaleProjects(projects, zones);

  const dryRun = Boolean(options.dryRun);
  const pruneStale = Boolean(options.pruneStale);

  if (!dryRun && pruneStale) {
    for (const project of stale) {
      await deps.removeProject(project);
    }
  }

  const payload = {
    stale,
    pruned: !dryRun && pruneStale ? stale.length : 0,
    dry_run: dryRun
  };

  if (context.json) {
    writeJsonSuccess('repair', payload, context.stdout);
    return;
  }

  context.stdout?.write(`${JSON.stringify(payload, null, 2)}\n`);
}
