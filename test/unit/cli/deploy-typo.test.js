import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import deploy from '../../../src/commands/deploy.js';
import { ERROR_CODES } from '../../../src/lib/error-codes.js';

const knownCommands = [
  'deploy',
  'estimate',
  'login',
  'mcp',
  'list',
  'inspect',
  'history',
  'files',
  'purge',
  'url',
  'open',
  'destroy',
  'repair',
  'doctor'
];

async function runDeploy(args) {
  const context = {
    json: true,
    interactive: false,
    stdout: { write: () => true },
    stderr: { write: () => true },
    options: {},
    knownCommands
  };
  try {
    await deploy(args, context, {
      stat: async () => null, // path does not exist
      resolveApiKey: () => 'key',
      validateProjectName: () => {},
      isProjectNameReserved: async () => false,
      getProject: async () => null,
      deployCore: async () => {},
      scanLocalTarget: async () => ({}),
      summarizeScan: () => ({})
    });
    return null;
  } catch (error) {
    return error;
  }
}

describe('deploy: typo fuzzy-match', () => {
  it('suggests destroy for desotry', async () => {
    const error = await runDeploy(['desotry']);
    assert.equal(error.code, ERROR_CODES.UNKNOWN_COMMAND);
    assert.match(error.fix, /destroy/);
  });

  it('suggests history for histroy', async () => {
    const error = await runDeploy(['histroy']);
    assert.equal(error.code, ERROR_CODES.UNKNOWN_COMMAND);
    assert.match(error.fix, /history/);
  });

  it('suggests inspect for inspet', async () => {
    const error = await runDeploy(['inspet']);
    assert.equal(error.code, ERROR_CODES.UNKNOWN_COMMAND);
    assert.match(error.fix, /inspect/);
  });

  it('does not suggest for far-off strings', async () => {
    const error = await runDeploy(['xyzzy']);
    assert.equal(error.code, ERROR_CODES.PATH_NOT_FOUND);
  });

  it('does not fuzzy-match 3-char commands from short inputs', async () => {
    // 'go' -> closest 'mcp' distance 3, threshold for 3-char is 1
    const error = await runDeploy(['go']);
    assert.equal(error.code, ERROR_CODES.PATH_NOT_FOUND);
  });

  it('treats inputs with path chars as real paths', async () => {
    const error = await runDeploy(['./nope']);
    assert.equal(error.code, ERROR_CODES.PATH_NOT_FOUND);
  });

  it('exact command name hits UNKNOWN_COMMAND with specific fix', async () => {
    const error = await runDeploy(['destroy']);
    assert.equal(error.code, ERROR_CODES.UNKNOWN_COMMAND);
    assert.match(error.fix, /plint destroy/);
  });
});
