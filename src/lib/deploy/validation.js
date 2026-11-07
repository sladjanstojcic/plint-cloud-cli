import { ERROR_CODES } from '../error-codes.js';

export function directoryEmptyError(path) {
  const error = new Error(`Directory is empty: ${path}`);
  error.code = ERROR_CODES.DIRECTORY_EMPTY;
  return error;
}

export function assertDeployableScan(scanSummary) {
  if (scanSummary.target_type === 'directory' && scanSummary.file_count === 0) {
    throw directoryEmptyError(scanSummary.path);
  }
}
