import { confirm } from '@inquirer/prompts';
import { deleteStorageZone } from '../lib/bunny.js';
import { requireApiKey, resolveApiKey } from '../lib/config.js';
import { ERROR_CODES } from '../lib/error-codes.js';
import { writeJsonSuccess } from '../lib/output.js';
import { persistDestroy } from '../lib/projects/persistence.js';
import { requireExistingProject, requireProjectName } from '../lib/projects/require.js';
import { getProject } from '../lib/projects/store.js';

export default async function destroy(
  _args = [],
  context = {},
  deps = {
    confirm,
    deleteStorageZone,
    resolveApiKey,
    persistDestroy,
    getProject
  }
) {
  const project = requireProjectName(context.options, 'destroy');
  const entry = await requireExistingProject(project, { getProjectFn: deps.getProject });
  const apiKey = requireApiKey(deps.resolveApiKey);

  if (context.interactive) {
    if (
      !(await deps.confirm({
        message: `Delete project '${project}' and its Bunny resources?`,
        default: false
      }))
    ) {
      return;
    }
  } else if (!context.json) {
    const error = new Error(
      `Refusing to destroy '${project}' without confirmation. Run in a terminal or pass --json.`
    );
    error.code = ERROR_CODES.CONFIRMATION_REQUIRED;
    throw error;
  }

  await deps
    .deleteStorageZone(apiKey, entry.binding.storage_zone_id, {
      deleteLinkedPullZones: true
    })
    .catch((error) => {
      if (error.status !== 404) throw error;
    });
  const payload = await deps.persistDestroy({ project, entry });

  if (context.json) {
    writeJsonSuccess('destroy', payload, context.stdout);
    return;
  }

  console.log(`Destroyed ${project}.`);
}
