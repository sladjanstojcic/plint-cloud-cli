import { ERROR_CODES } from '../lib/error-codes.js';
import { writeJsonSuccess } from '../lib/output.js';
import { readHistory } from '../lib/projects/history.js';

export default async function history(
  _args = [],
  context = {},
  deps = { readHistory }
) {
  const project = context.options?.project;
  if (!project) {
    const error = new Error('Usage: plint history -p <project>');
    error.code = ERROR_CODES.INVALID_USAGE;
    throw error;
  }
  const entries = await deps.readHistory({ project, limit: 20 });
  if (context.json) {
    writeJsonSuccess('history', { entries }, context.stdout);
    return;
  }
  if (entries.length === 0) {
    console.log('No history found for this project.');
    return;
  }
  console.table(entries);
}
