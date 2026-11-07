import { spawn } from 'node:child_process';
import { writeJsonSuccess } from '../lib/output.js';
import { requireExistingProject, requireProjectName } from '../lib/projects/require.js';
import { getProject } from '../lib/projects/store.js';

function defaultPlatformOpen(url) {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  spawn(cmd, [url], { stdio: 'ignore', detached: true }).unref();
}

export default async function openCommand(
  _args,
  context = {},
  deps = { getProject, platformOpen: defaultPlatformOpen }
) {
  const project = requireProjectName(context.options, 'open');
  const entry = await requireExistingProject(project, { getProjectFn: deps.getProject });
  deps.platformOpen(entry.url);
  if (context.json) {
    writeJsonSuccess('open', { project, url: entry.url, opened: true }, context.stdout);
    return;
  }
  context.stdout?.write(`Opening ${entry.url}\n`);
}
