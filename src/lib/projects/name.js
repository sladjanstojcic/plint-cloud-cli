import { ERROR_CODES } from '../error-codes.js';

export const PROJECT_RE = /^(?!-)(?!.*--)[a-z0-9-]{1,30}(?<!-)$/;

export function validateProjectName(project) {
  if (!PROJECT_RE.test(project)) {
    const error = new Error(
      'Invalid project name. Use lowercase letters, numbers, and single hyphens only.'
    );
    error.code = ERROR_CODES.PROJECT_INVALID;
    throw error;
  }
}
