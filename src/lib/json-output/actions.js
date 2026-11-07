import { ERROR_CODES } from '../error-codes.js';

const action = (command, description) => ({ command, description });

const ERROR_ACTIONS = {
  [ERROR_CODES.AUTH_MISSING]: [
    action('plint login', 'Save a Bunny API key locally'),
    action('plint estimate <path> --json', 'Inspect a deploy path without Bunny auth')
  ],
  [ERROR_CODES.PROJECT_REQUIRED]: [
    action('plint list --json', 'See existing projects'),
    action('plint <path> -p <name> --create --json', 'Create a new project and deploy')
  ],
  [ERROR_CODES.PROJECT_NOT_FOUND]: [
    action('plint list --json', 'See existing projects'),
    action('plint <path> -p <name> --create --json', 'Create a new project and deploy')
  ],
  [ERROR_CODES.PROJECT_NAME_RESERVED]: [
    action('plint list --json', 'See which names are taken or destroyed')
  ],
  [ERROR_CODES.UNKNOWN_COMMAND]: [action('plint --help', 'Show available commands')],
  [ERROR_CODES.INVALID_USAGE]: [action('plint --help', 'Show available commands')],
  [ERROR_CODES.BUNNY_API_ERROR]: [
    action('plint doctor --json', 'Diagnose auth, state, and Bunny reachability')
  ],
  [ERROR_CODES.CONFIRMATION_REQUIRED]: [
    action('plint --json <command>', 'Re-run in JSON mode to skip confirmation')
  ],
  [ERROR_CODES.STATE_CORRUPT]: [
    action('plint doctor --json', 'Diagnose state file and auth'),
    action('cat ~/.plint/state.json', 'Inspect the state file contents')
  ]
};

function successActions(command, data) {
  if (command === 'deploy' && data.project) {
    return [
      action(`plint inspect -p ${data.project} --json`, 'Inspect project details'),
      action(`plint files -p ${data.project} --json`, 'List deployed files'),
      action(`plint history -p ${data.project} --json`, 'Show deployment history'),
      action(`plint purge -p ${data.project} --json`, 'Purge the CDN cache')
    ];
  }
  if (command === 'estimate') {
    return [
      action('plint deploy <path> --dry-run --json', 'Preview deploy changes'),
      action('plint deploy <path> -p <project> --create --json', 'Create or update a project')
    ];
  }
  return [];
}

export function nextActions(command, data = {}, errorCode = null) {
  if (errorCode) return ERROR_ACTIONS[errorCode] ?? [];
  return successActions(command, data);
}
