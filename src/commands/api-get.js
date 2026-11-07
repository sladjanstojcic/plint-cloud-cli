import { apiGet } from '../lib/bunny.js';
import { requireApiKey, resolveApiKey } from '../lib/config.js';
import { ERROR_CODES } from '../lib/error-codes.js';
import { writeJsonSuccess } from '../lib/output.js';

export default async function apiGetCommand(args, context = {}, deps = { apiGet, resolveApiKey }) {
  const path = args[0];
  if (!path || !path.startsWith('/')) {
    const error = new Error('Usage: plint api get /path');
    error.code = ERROR_CODES.INVALID_USAGE;
    throw error;
  }

  const apiKey = requireApiKey(deps.resolveApiKey);
  const data = await deps.apiGet(apiKey, path);

  if (context.json) {
    writeJsonSuccess('api get', data, context.stdout);
    return;
  }

  console.log(JSON.stringify(data, null, 2));
}
