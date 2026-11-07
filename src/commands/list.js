import { listProjects } from '../lib/projects/store.js';
import { formatProjectRow } from '../lib/projects/status.js';
import { writeJsonSuccess } from '../lib/output.js';

export default async function list(
  _args = [],
  context = {},
  deps = { listProjects, formatProjectRow }
) {
  const projects = await deps.listProjects();
  const rows = Object.entries(projects).map(([project, entry]) =>
    deps.formatProjectRow(project, entry)
  );

  if (context.json) {
    writeJsonSuccess('list', { projects: rows }, context.stdout);
    return;
  }

  if (rows.length === 0) {
    console.log('No projects found. Run `plint` from a project directory to deploy.');
    return;
  }

  console.table(rows);
}
