import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('plint mcp exposes the expected tools', async () => {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['src/cli-bin.js', 'mcp'],
    stderr: 'pipe'
  });
  const client = new Client({ name: 'plint-itest', version: '0.0.0' });

  await client.connect(transport);
  try {
    const result = await client.listTools();
    const names = result.tools.map((tool) => tool.name).sort();

    assert.deepEqual(names, [
      'plint_deploy',
      'plint_destroy',
      'plint_doctor',
      'plint_estimate',
      'plint_files',
      'plint_history',
      'plint_inspect',
      'plint_list',
      'plint_purge',
      'plint_repair'
    ]);
  } finally {
    await client.close();
  }
});

test('plint mcp doctor returns checks over stdio', async () => {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['src/cli-bin.js', 'mcp'],
    stderr: 'pipe'
  });
  const client = new Client({ name: 'plint-itest', version: '0.0.0' });

  await client.connect(transport);
  try {
    const result = await client.callTool({ name: 'plint_doctor', arguments: {} });
    assert.equal(Array.isArray(result.structuredContent?.checks), true);
    assert.equal(result.structuredContent.checks.length > 0, true);
  } finally {
    await client.close();
  }
});

test(
  'plint mcp can create and update a named project',
  { skip: !process.env.BUNNY_API_KEY ? 'requires BUNNY_API_KEY' : undefined },
  async () => {
    const siteDir = await mkdtemp(join(tmpdir(), 'plint-mcp-project-'));
    const home = await mkdtemp(join(tmpdir(), 'plint-mcp-home-'));
    await mkdir(join(home, '.plint'), { recursive: true });
    await writeFile(
      join(home, '.plint', 'config.json'),
      `${JSON.stringify({ apiKey: process.env.BUNNY_API_KEY }, null, 2)}\n`
    );
    await writeFile(join(siteDir, 'index.html'), '<h1>v1</h1>');

    const transport = new StdioClientTransport({
      command: 'node',
      args: ['src/cli-bin.js', 'mcp'],
      stderr: 'pipe',
      env: {
        ...process.env,
        HOME: home
      }
    });
    const client = new Client({ name: 'plint-itest', version: '0.0.0' });
    const project = `docs-${Date.now()}`;

    await client.connect(transport);
    try {
      const created = await client.callTool({
        name: 'plint_deploy',
        arguments: { path: siteDir, project, create: true }
      });
      assert.equal(created.isError, undefined);

      await writeFile(join(siteDir, 'index.html'), '<h1>v2</h1>');
      const updated = await client.callTool({
        name: 'plint_deploy',
        arguments: { path: siteDir, project }
      });
      assert.equal(updated.isError, undefined);
    } finally {
      // Destroy the real Bunny zones this test created so runs don't leak them.
      await client
        .callTool({ name: 'plint_destroy', arguments: { project } })
        .catch(() => {});
      await client.close();
    }
  }
);

test(
  'plint mcp returns an error for missing projects without throwing schema validation errors',
  { skip: !process.env.BUNNY_API_KEY ? 'requires BUNNY_API_KEY' : undefined },
  async () => {
    const siteDir = await mkdtemp(join(tmpdir(), 'plint-mcp-missing-'));
    const home = await mkdtemp(join(tmpdir(), 'plint-mcp-home-'));
    await mkdir(join(home, '.plint'), { recursive: true });
    await writeFile(
      join(home, '.plint', 'config.json'),
      `${JSON.stringify({ apiKey: process.env.BUNNY_API_KEY }, null, 2)}\n`
    );
    await writeFile(join(siteDir, 'index.html'), '<h1>v1</h1>');

    const transport = new StdioClientTransport({
      command: 'node',
      args: ['src/cli-bin.js', 'mcp'],
      stderr: 'pipe',
      env: {
        ...process.env,
        HOME: home
      }
    });
    const client = new Client({ name: 'plint-itest', version: '0.0.0' });
    const project = `missing-${Date.now()}`;

    await client.connect(transport);
    try {
      await client.listTools();
      const result = await client.callTool({
        name: 'plint_deploy',
        arguments: { path: siteDir, project }
      });
      assert.equal(result.isError, true);
    } finally {
      await client.close();
    }
  }
);
