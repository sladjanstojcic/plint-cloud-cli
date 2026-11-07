import { spawn } from 'node:child_process';
import { ERROR_CODES } from '../lib/error-codes.js';
import { writeJsonSuccess } from '../lib/output.js';
import { requireExistingProject, requireProjectName } from '../lib/projects/require.js';
import { getProject } from '../lib/projects/store.js';

function platformOpener(url) {
  if (process.platform === 'darwin') return { command: 'open', args: [url] };
  // `start` is a cmd.exe built-in, not an executable; "" is its window-title argument.
  if (process.platform === 'win32') return { command: 'cmd', args: ['/c', 'start', '""', url] };
  return { command: 'xdg-open', args: [url] };
}

// Resolves once the opener has started; rejects (instead of crashing the process with
// an unhandled 'error' event) when it does not exist, e.g. on a headless server.
export function defaultPlatformOpen(url, opener = platformOpener(url)) {
  return new Promise((resolve, reject) => {
    const child = spawn(opener.command, opener.args, { stdio: 'ignore', detached: true });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

export default async function openCommand(
  _args,
  context = {},
  deps = { getProject, platformOpen: defaultPlatformOpen }
) {
  const project = requireProjectName(context.options, 'open');
  const entry = await requireExistingProject(project, { getProjectFn: deps.getProject });
  try {
    await deps.platformOpen(entry.url);
  } catch (cause) {
    const error = new Error(`Could not open a browser (${cause.message}). URL: ${entry.url}`);
    error.code = ERROR_CODES.BROWSER_OPEN_FAILED;
    throw error;
  }
  if (context.json) {
    writeJsonSuccess('open', { project, url: entry.url, opened: true }, context.stdout);
    return;
  }
  context.stdout?.write(`Opening ${entry.url}\n`);
}
