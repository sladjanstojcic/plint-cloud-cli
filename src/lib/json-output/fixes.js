import { ERROR_CODES } from '../error-codes.js';

const COMMANDER_FIXES = {
  'commander.missingArgument': 'Pass the missing argument, or run `plint --help`.',
  'commander.optionMissingArgument': 'That flag needs a value. Run `plint --help`.',
  'commander.unknownOption': 'Check the flag name or run `plint --help`.',
  'commander.unknownCommand': 'Run `plint --help` to see available commands.',
  'commander.excessArguments': 'Remove the extra arguments, or run `plint --help`.',
  'commander.invalidArgument': 'Check the value passed to the flag.'
};

export function commanderFix(code) {
  return COMMANDER_FIXES[code];
}

export function fixFor(error) {
  switch (error.code) {
    case ERROR_CODES.AUTH_MISSING:
      return 'Run `plint login` or set BUNNY_API_KEY.';
    case ERROR_CODES.PATH_NOT_FOUND:
      return 'Check the path and rerun with an existing file or directory.';
    case ERROR_CODES.PROJECT_NOT_FOUND:
      return 'Add `--create` to create the named project, or run `plint list`.';
    case ERROR_CODES.PROJECT_NAME_RESERVED:
      return 'Choose a new project name. Destroyed project names cannot be reused.';
    case ERROR_CODES.DIRECTORY_EMPTY:
      return 'Add deployable files or choose a different path.';
    case ERROR_CODES.PROJECT_REQUIRED:
      return 'Pass `-p <project>` (and `--create` if the project is new) or run `plint list`.';
    case ERROR_CODES.UNKNOWN_COMMAND:
      return 'Run `plint --help` to see available commands.';
    case ERROR_CODES.BUNNY_API_ERROR:
      return 'Verify the path, your API key, and Bunny reachability with `plint doctor`.';
    case ERROR_CODES.CONFIRMATION_REQUIRED:
      return 'Run the command in a terminal, or pass `--json` to skip confirmation prompts.';
    case ERROR_CODES.PATH_UNSAFE:
      return 'Refusing to deploy a top-level system path. Pass a subdirectory.';
    case ERROR_CODES.PATH_NOT_SUPPORTED:
      return 'Deploy only accepts regular files and directories, with names Bunny can store (no ? \\ " < >).';
    case ERROR_CODES.BROWSER_OPEN_FAILED:
      return 'No browser opener is available here. Open the URL yourself; `plint url -p <project>` prints it.';
    case ERROR_CODES.STATE_CORRUPT:
      return 'Inspect `~/.plint/state.json`. Restore a backup, or delete the file and re-run `plint login` (projects must be re-linked).';
    default:
      return undefined;
  }
}
