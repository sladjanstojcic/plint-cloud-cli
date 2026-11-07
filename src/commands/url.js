import { writeJsonSuccess } from '../lib/output.js';
import { requireExistingProject, requireProjectName } from '../lib/projects/require.js';
import { getProject } from '../lib/projects/store.js';

export default async function url(_args, context = {}, deps = { getProject }) {
  const project = requireProjectName(context.options, 'url');
  const entry = await requireExistingProject(project, { getProjectFn: deps.getProject });
  if (context.json) {
    writeJsonSuccess('url', { project, url: entry.url }, context.stdout);
    return;
  }
  context.stdout?.write(`${entry.url}\n`);
}
