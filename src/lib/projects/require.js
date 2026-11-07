import { ERROR_CODES } from '../error-codes.js';
import { getProject, isProjectNameReserved } from './store.js';

export function requireProjectName(options, command) {
  const project = options?.project;
  if (!project) {
    const error = new Error(`Usage: plint ${command} -p <project>`);
    error.code = ERROR_CODES.INVALID_USAGE;
    throw error;
  }
  return project;
}

export async function requireExistingProject(
  project,
  { getProjectFn = getProject, isReservedFn = isProjectNameReserved } = {}
) {
  const entry = await getProjectFn(project);
  if (entry) return entry;

  if (await isReservedFn(project)) {
    const error = new Error(
      `Project name '${project}' has already been used and cannot be reused.`
    );
    error.code = ERROR_CODES.PROJECT_NAME_RESERVED;
    throw error;
  }

  const error = new Error(`Project '${project}' does not exist.`);
  error.code = ERROR_CODES.PROJECT_NOT_FOUND;
  throw error;
}
