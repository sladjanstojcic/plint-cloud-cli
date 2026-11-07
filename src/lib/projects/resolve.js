import { ERROR_CODES } from '../error-codes.js';

export const CREATE_DECLINED = Symbol('CREATE_DECLINED');

export async function resolveProjectName({
  explicitProject,
  allowCreate,
  interactive,
  deps
}) {
  if (!explicitProject) {
    if (!interactive) {
      const error = new Error('Deploy requires -p <project> in non-interactive mode.');
      error.code = ERROR_CODES.PROJECT_REQUIRED;
      throw error;
    }
    return resolveInteractiveNew(deps);
  }
  return resolveExplicit({ project: explicitProject, allowCreate, interactive, deps });
}

async function resolveInteractiveNew(deps) {
  const project = await deps.input({ message: 'Project name:' });
  deps.validateProjectName(project);
  if (await deps.isProjectNameReserved(project)) throw reservedError(project);
  const existing = await deps.getProject(project);
  if (existing) {
    const error = new Error(`Project '${project}' already exists. Re-run with -p ${project}.`);
    error.code = ERROR_CODES.PROJECT_EXISTS;
    throw error;
  }
  return { project, existing: null, created: true };
}

async function resolveExplicit({ project, allowCreate, interactive, deps }) {
  deps.validateProjectName(project);
  if (await deps.isProjectNameReserved(project)) throw reservedError(project);
  const existing = await deps.getProject(project);
  if (existing) return { project, existing, created: false };

  if (allowCreate) {
    return { project, existing: null, created: true };
  }

  if (!interactive) {
    const error = new Error(`Project '${project}' does not exist.`);
    error.code = ERROR_CODES.PROJECT_NOT_FOUND;
    throw error;
  }

  const approved = await deps.confirm({
    message: `Project '${project}' does not exist. Create it?`,
    default: false
  });
  return approved ? { project, existing: null, created: true } : CREATE_DECLINED;
}

function reservedError(project) {
  const error = new Error(
    `Project name '${project}' has already been used and cannot be reused.`
  );
  error.code = ERROR_CODES.PROJECT_NAME_RESERVED;
  return error;
}
