import { purgePullZone } from '../lib/bunny.js';
import { requireApiKey, resolveApiKey } from '../lib/config.js';
import { writeJsonSuccess } from '../lib/output.js';
import { requireExistingProject, requireProjectName } from '../lib/projects/require.js';
import { getProject } from '../lib/projects/store.js';

export default async function purge(
  _args = [],
  context = {},
  deps = { purgePullZone, resolveApiKey, getProject }
) {
  const project = requireProjectName(context.options, 'purge');
  const entry = await requireExistingProject(project, { getProjectFn: deps.getProject });
  const apiKey = requireApiKey(deps.resolveApiKey);

  await deps.purgePullZone(apiKey, entry.binding.pull_zone_id);

  if (context.json) {
    writeJsonSuccess('purge', { project, cdn_id: entry.binding.pull_zone_id }, context.stdout);
    return;
  }

  console.log(`Purged ${project}.`);
}
