import { confirm, input } from '@inquirer/prompts';
import { closest, distance } from 'fastest-levenshtein';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertSafePath } from '../lib/files/safety.js';
import { requireApiKey, resolveApiKey } from '../lib/config.js';
import { ERROR_CODES } from '../lib/error-codes.js';
import { deployCore } from '../lib/deploy-core.js';
import { scanLocalTarget } from '../lib/files.js';
import { dryRunPayload } from '../lib/deploy/dry-run.js';
import { assertDeployableScan } from '../lib/deploy/validation.js';
import { validateProjectName } from '../lib/projects/name.js';
import { persistBinding, persistDeploy } from '../lib/projects/persistence.js';
import { CREATE_DECLINED, resolveProjectName } from '../lib/projects/resolve.js';
import {
  bindingToExistingZone,
  getProject,
  isProjectNameReserved
} from '../lib/projects/store.js';
import { summarizeScan } from '../lib/preflight/index.js';
import { writeJsonSuccess } from '../lib/output.js';
import { printDeploySummary } from '../lib/deploy/summary.js';

async function startSpinner(stream) {
  const { default: ora } = await import('ora');
  return ora({ text: 'Preparing deploy', stream: stream ?? process.stderr }).start();
}

function createSpinnerUpdater(spinner) {
  let lastEmit = 0;
  return (event) => {
    const now = Date.now();
    const isLast = event.done === event.total;
    if (!isLast && now - lastEmit < 50) return;
    lastEmit = now;
    const verb = event.phase === 'upload' ? 'Uploading' : 'Deleting';
    spinner.text = `${verb} ${event.done}/${event.total}`;
  };
}

// Path-like tokens (containing /, \, ., or ~) are treated as real paths — we
// don't try to fuzzy-match them against command names.
const PATH_LIKE = /[\\/.~]/;

// Scale the typo threshold by command length so short commands like "mcp" or
// "url" don't get "corrected" from unrelated inputs like "go".
function typoThreshold(name) {
  return Math.min(2, Math.floor(name.length / 2));
}

function makeError(code, message, fix) {
  const error = new Error(message);
  error.code = code;
  if (fix) error.fix = fix;
  return error;
}

function pathNotFoundError(path, rawArg, knownCommands = []) {
  const base = `Path not found: ${path}`;

  if (!rawArg || PATH_LIKE.test(rawArg)) {
    return makeError(ERROR_CODES.PATH_NOT_FOUND, base);
  }

  if (knownCommands.includes(rawArg)) {
    return makeError(
      ERROR_CODES.UNKNOWN_COMMAND,
      `${base}. Did you mean \`plint ${rawArg}\`?`,
      `Did you mean \`plint ${rawArg}\`? Use \`plint <path>\` only for deploys.`
    );
  }

  if (knownCommands.length > 0) {
    const suggestion = closest(rawArg, knownCommands);
    if (distance(rawArg, suggestion) <= typoThreshold(suggestion)) {
      return makeError(
        ERROR_CODES.UNKNOWN_COMMAND,
        `Unknown command '${rawArg}'.`,
        `Did you mean \`plint ${suggestion}\`?`
      );
    }
  }

  return makeError(ERROR_CODES.PATH_NOT_FOUND, base);
}

function printDryRun(path, payload, stdout = process.stdout) {
  const projectLine = payload.generated
    ? `Project: ${payload.project} (proposed, not reserved)`
    : `Project: ${payload.project}`;
  const action = payload.created ? 'would create' : 'would update';
  stdout.write(`${projectLine}\n`);
  stdout.write(`Path: ${path}\n`);
  stdout.write(
    `Dry-run: ${action} (${payload.uploaded} upload, ${payload.deleted} delete, ${payload.unchanged} unchanged, ${payload.bytes} bytes)\n`
  );
  for (const warning of payload.warnings ?? []) stdout.write(`Warning: ${warning.message}\n`);
}

export default async function deploy(
  args,
  context = {},
  deps = {
    input,
    confirm,
    stat,
    resolveApiKey,
    deployCore,
    persistDeploy,
    persistBinding,
    validateProjectName,
    getProject,
    isProjectNameReserved,
    scanLocalTarget,
    summarizeScan
  }
) {
  const path = resolve(args[0] ?? '.');
  assertSafePath(path);
  const dryRun = Boolean(context.options?.dryRun);

  const target = await deps.stat(path).catch(() => null);
  if (!target) {
    throw pathNotFoundError(path, args[0], context.knownCommands);
  }

  if (!dryRun) {
    requireApiKey(deps.resolveApiKey);
  }

  // Scan before any prompt so an empty or unsupported target fails fast.
  const scan = await deps.scanLocalTarget(path);
  const scanSummary = deps.summarizeScan(scan);
  assertDeployableScan(scanSummary);

  const explicitProject = context.options?.project ?? null;
  const allowCreate = Boolean(context.options?.create);

  const resolved = await resolveProjectName({
    explicitProject,
    allowCreate,
    interactive: context.interactive,
    deps
  });
  if (resolved === CREATE_DECLINED) return;
  const { project, existing, created } = resolved;

  if (dryRun) {
    let payload;
    if (!existing) {
      payload = dryRunPayload({
        project,
        created: true,
        generated: !explicitProject,
        scanSummary
      });
    } else {
      requireApiKey(deps.resolveApiKey);
      const result = await deps.deployCore({
        path,
        existingZone: bindingToExistingZone(existing.binding),
        scan,
        dryRun: true
      });
      payload = dryRunPayload({ project, created: false, scanSummary, changeset: result });
    }

    if (context.json) {
      writeJsonSuccess('deploy', payload, context.stdout);
      return;
    }
    printDryRun(path, payload, context.stdout);
    return;
  }

  const spinner = context.json ? null : await startSpinner(context.stderr);
  const result = await deps.deployCore({
    path,
    existingZone: existing ? bindingToExistingZone(existing.binding) : undefined,
    scan,
    onBindingCreated: (config) => deps.persistBinding({ project, config }),
    onProgress: spinner ? createSpinnerUpdater(spinner) : undefined
  }).catch((error) => {
    spinner?.fail('Deploy failed');
    throw error;
  });
  spinner?.succeed('Upload complete');

  const payload = await deps.persistDeploy({ project, result, created, previousUrl: existing?.url });

  if (context.json) {
    writeJsonSuccess('deploy', payload, context.stdout);
    return;
  }

  printDeploySummary(payload, context.stdout);
}
