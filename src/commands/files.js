import { getStorageZone } from '../lib/bunny.js';
import { requireApiKey, resolveApiKey } from '../lib/config.js';
import { writeJsonSuccess } from '../lib/output.js';
import { requireExistingProject, requireProjectName } from '../lib/projects/require.js';
import { bindingToExistingZone, getProject } from '../lib/projects/store.js';
import { listRemoteFiles } from '../lib/storage.js';

export default async function files(
  _args = [],
  context = {},
  deps = { getStorageZone, listRemoteFiles, getProject, resolveApiKey }
) {
  const project = requireProjectName(context.options, 'files');
  const entry = await requireExistingProject(project, { getProjectFn: deps.getProject });
  const apiKey = requireApiKey(deps.resolveApiKey);
  const config = bindingToExistingZone(entry.binding);
  if (!config.zoneName) {
    config.zoneName = (await deps.getStorageZone(apiKey, config.zoneId)).Name;
  }
  const remoteFiles = await deps.listRemoteFiles(config);
  const files = remoteFiles.map((file) => ({ path: file.path, size: file.size }));
  if (context.json) {
    writeJsonSuccess('files', { files }, context.stdout);
    return;
  }
  if (files.length === 0) {
    console.log('No files found for this project.');
    return;
  }
  console.table(files);
}
