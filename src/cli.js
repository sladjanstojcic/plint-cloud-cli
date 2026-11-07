import { Command, InvalidArgumentError } from 'commander';
import isInteractive from 'is-interactive';
import packageJson from '../package.json' with { type: 'json' };
import { ERROR_CODES } from './lib/error-codes.js';
import { commanderFix } from './lib/json-output/fixes.js';
import { writeJsonError } from './lib/output.js';

function normalizeCommanderError(error) {
  const message = error.message
    .replace(/^error:\s*/i, '')
    .replace(/^([a-z])/, (c) => c.toUpperCase());
  const wrapped = new Error(message);
  wrapped.code = ERROR_CODES.INVALID_USAGE;
  const fix = commanderFix(error.code);
  if (fix) wrapped.fix = fix;
  return wrapped;
}

export async function runCli(argv = process.argv.slice(2), io = { stdout: process.stdout }) {
  const program = new Command();
  let exitCode = 0;

  const runWrapped = (command, handler) => async (...args) => {
    const options = args.at(-1);
    const params = args.slice(0, -1);
    const flags =
      typeof options?.optsWithGlobals === 'function' ? options.optsWithGlobals() : options ?? {};
    const context = {
      json: Boolean(flags.json),
      interactive: !flags.json && isInteractive({ stream: process.stdin }),
      stdout: io.stdout,
      stderr: process.stderr,
      options: flags,
      knownCommands: program.commands.map((sub) => sub.name())
    };
    try {
      await handler(params, context);
    } catch (error) {
      if (context.json) {
        writeJsonError(command, error, io.stdout);
        exitCode = 1;
        return;
      }
      throw error;
    }
  };

  program
    .name('plint')
    .version(packageJson.version, '-v, --version', 'Show plint version')
    .description('Static hosting on Bunny.net')
    .option('--json', 'Return structured JSON on stdout')
    .option('-p, --project <project>', 'Target project', (value) => {
      if (value.startsWith('-')) {
        throw new InvalidArgumentError(`Expected a project name after -p, got '${value}'.`);
      }
      return value.startsWith('=') ? value.slice(1) : value;
    })
    .option('--create', 'Create the named project if it does not exist')
    .option('--dry-run', 'Preview deploy changes without mutating state')
    .helpOption('--help', 'Show this help')
    .exitOverride();

  program.configureOutput({ writeErr: () => {} });

  program
    .argument('[path]', 'Deploy the current directory or one file')
    .action(
      runWrapped('deploy', async ([path], context) => {
        const { default: deploy } = await import('./commands/deploy.js');
        await deploy(path ? [path] : ['.'], context);
      })
    );

  program
    .command('deploy')
    .argument('[path]', 'Deploy the current directory or one file')
    .description('Deploy a directory or file')
    .action(
      runWrapped('deploy', async ([path], context) => {
        const { default: deploy } = await import('./commands/deploy.js');
        await deploy(path ? [path] : ['.'], context);
      })
    );

  program
    .command('estimate')
    .argument('[path]', 'Estimate deployable files and rough storage cost')
    .description('Estimate deploy size, warnings, and rough Bunny storage cost')
    .action(
      runWrapped('estimate', async ([path], context) => {
        const { default: estimate } = await import('./commands/estimate.js');
        await estimate(path ? [path] : ['.'], context);
      })
    );

  program
    .command('login')
    .description('Save your Bunny API key')
    .action(
      runWrapped('login', async (_args, context) => {
        const { default: login } = await import('./commands/login.js');
        await login([], context);
      })
    );

  program
    .command('mcp')
    .description('Run the plint MCP stdio server')
    .action(
      runWrapped('mcp', async () => {
        const { default: mcp } = await import('./commands/mcp.js');
        await mcp();
      })
    );

  program
    .command('list')
    .description('List local projects with Bunny details')
    .action(
      runWrapped('list', async (_args, context) => {
        const { default: list } = await import('./commands/list.js');
        await list([], context);
      })
    );

  program
    .command('inspect')
    .option('--reveal', 'Include the Bunny storage zone password in the output')
    .description('Show details for one project')
    .action(
      runWrapped('inspect', async (_args, context) => {
        const { default: inspect } = await import('./commands/inspect.js');
        await inspect([], context);
      })
    );

  program
    .command('history')
    .description('Show project history')
    .action(
      runWrapped('history', async (_args, context) => {
        const { default: history } = await import('./commands/history.js');
        await history([], context);
      })
    );

  program
    .command('files')
    .description('List files in a project')
    .action(
      runWrapped('files', async (_args, context) => {
        const { default: files } = await import('./commands/files.js');
        await files([], context);
      })
    );

  program
    .command('purge')
    .description('Purge the CDN cache for a project')
    .action(
      runWrapped('purge', async (_args, context) => {
        const { default: purge } = await import('./commands/purge.js');
        await purge([], context);
      })
    );

  program
    .command('url')
    .description('Print the public URL for a project')
    .action(
      runWrapped('url', async (_args, context) => {
        const { default: url } = await import('./commands/url.js');
        await url([], context);
      })
    );

  program
    .command('open')
    .description('Open the public URL for a project in your browser')
    .action(
      runWrapped('open', async (_args, context) => {
        const { default: open } = await import('./commands/open.js');
        await open([], context);
      })
    );

  program
    .command('destroy')
    .description('Delete a project and its Bunny resources')
    .action(
      runWrapped('destroy', async (_args, context) => {
        const { default: destroy } = await import('./commands/destroy.js');
        await destroy([], context);
      })
    );

  program
    .command('repair')
    .option('--prune-stale', 'Remove local projects whose Bunny bindings are gone')
    .option('--dry-run', 'Show what would change without mutating state')
    .description('Find and optionally prune stale local projects')
    .action(
      runWrapped('repair', async (_args, context) => {
        const { default: repair } = await import('./commands/repair.js');
        await repair([], context);
      })
    );

  program
    .command('doctor')
    .description('Diagnose auth, state, and Bunny reachability')
    .action(
      runWrapped('doctor', async (_args, context) => {
        const { default: doctor } = await import('./commands/doctor.js');
        await doctor([], context);
      })
    );

  const api = program.command('api').description('Read-only Bunny management API access');
  api
    .command('get <path>')
    .description('Read-only Bunny management API GET')
    .action(
      runWrapped('api get', async ([path], context) => {
        const { default: apiGetCommand } = await import('./commands/api-get.js');
        await apiGetCommand([path], context);
      })
    );

  try {
    await program.parseAsync(argv, { from: 'user' });
    return exitCode;
  } catch (error) {
    if (error.code === 'commander.helpDisplayed' || error.code === 'commander.version') {
      return 0;
    }
    if (error.code?.startsWith('commander.')) {
      const wrapped = normalizeCommanderError(error);
      if (argv.includes('--json')) {
        writeJsonError('cli', wrapped, io.stdout);
        return 1;
      }
      throw wrapped;
    }
    throw error;
  }
}
