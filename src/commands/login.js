import { password } from '@inquirer/prompts';
import { listStorageZones } from '../lib/bunny.js';
import { saveGlobalConfig } from '../lib/config.js';
import { ERROR_CODES } from '../lib/error-codes.js';
import { spinner } from '../lib/ui.js';

export default async function login(
  _args = [],
  context = {},
  deps = { password, listStorageZones, saveGlobalConfig, spinner }
) {
  if (context.json || context.interactive === false) {
    const reason = context.json
      ? '`plint login` is interactive and does not support --json.'
      : '`plint login` needs an interactive terminal (TTY).';
    const error = new Error(`${reason} For scripts and CI, set BUNNY_API_KEY instead.`);
    error.code = ERROR_CODES.INVALID_USAGE;
    throw error;
  }

  const apiKey = await deps.password({ message: 'Enter your Bunny API key' });
  if (!apiKey) throw new Error('API key is required.');

  const progress = deps.spinner('Verifying API key...');
  await deps.listStorageZones(apiKey);
  await deps.saveGlobalConfig({ apiKey });
  progress.succeed('API key verified and saved to ~/.plint/config.json');
}
