import { listStorageZones } from '../lib/bunny.js';
import { requireApiKey, resolveApiKey } from '../lib/config.js';
import { writeJsonSuccess } from '../lib/output.js';
import { redactBinding } from '../lib/projects/binding.js';
import { requireExistingProject, requireProjectName } from '../lib/projects/require.js';
import { deriveProjectStatus } from '../lib/projects/status.js';
import { getProject } from '../lib/projects/store.js';

export default async function inspect(
  _args = [],
  context = {},
  deps = { listStorageZones, getProject, deriveProjectStatus, resolveApiKey }
) {
  const project = requireProjectName(context.options, 'inspect');
  const entry = await requireExistingProject(project, { getProjectFn: deps.getProject });
  const apiKey = requireApiKey(deps.resolveApiKey);

  const zones = await deps.listStorageZones(apiKey);
  const status = deps.deriveProjectStatus(entry, zones);
  const data = {
    project,
    url: entry.url,
    last_deploy_at: entry.last_deploy_at,
    status,
    binding: redactBinding(entry.binding, { reveal: context.options?.reveal })
  };

  if (context.json) {
    writeJsonSuccess('inspect', data, context.stdout);
    return;
  }

  console.log(JSON.stringify(data, null, 2));
}
