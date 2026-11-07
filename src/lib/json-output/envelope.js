import { ERROR_CODES } from '../error-codes.js';
import { nextActions } from './actions.js';
import { fixFor } from './fixes.js';

export function successEnvelope(command, data) {
  return { ok: true, command, data, next_actions: nextActions(command, data) };
}

export function errorEnvelope(command, error) {
  const fix = error.fix ?? fixFor(error);
  const code = error.code ?? ERROR_CODES.UNEXPECTED_ERROR;
  return {
    ok: false,
    command,
    error: { code, message: error.message },
    ...(fix ? { fix } : {}),
    next_actions: nextActions(command, {}, code)
  };
}

export function writeJsonSuccess(command, data, stdout = process.stdout) {
  stdout.write(`${JSON.stringify(successEnvelope(command, data), null, 2)}\n`);
}

export function writeJsonError(command, error, stdout = process.stdout) {
  stdout.write(`${JSON.stringify(errorEnvelope(command, error), null, 2)}\n`);
}
