#!/usr/bin/env node
// Smoke-tests the library APIs the MCP spec relies on.
//
// Run AFTER installing the MCP deps from
// docs/superpowers/specs/2026-04-17-plint-mcp/README.md:
//
//   npm i @modelcontextprotocol/sdk@^1.29 zod@^4 write-file-atomic@^7 \
//         proper-lockfile@^4 human-id@^4
//   node scripts/verify-mcp-deps.mjs
//
// Exit code: 0 on success, 1 on any failure.
// Expected output: all ✓, no ✗.

import { humanId } from 'human-id';
import { z } from 'zod';
import { isAbsolute } from 'node:path';
import writeAtomic from 'write-file-atomic';
import * as lockfile from 'proper-lockfile';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failures = 0;
const expect = (label, cond, detail) => {
  if (cond) console.log(`✓ ${label}`);
  else { console.log(`✗ ${label}${detail ? ` — ${detail}` : ''}`); failures++; }
};

// ───────── human-id ─────────
console.log('\n== human-id ==');
const slugs = Array.from({ length: 1000 }, () =>
  humanId({ separator: '-', capitalize: false }));
const maxLen = Math.max(...slugs.map((s) => s.length));
expect('kebab-case', slugs.every((s) => /^[a-z-]+$/.test(s)));
expect('3 words', slugs.every((s) => s.split('-').length === 3));
expect(`max length <= 30 (observed max: ${maxLen})`, maxLen <= 30);

// ───────── zod v4 ─────────
console.log('\n== zod v4 ==');
const schema = z.object({
  path: z.string().refine(isAbsolute, { message: 'path must be absolute' }),
  slug: z.string().optional(),
});
expect('absolute path accepted',
  schema.safeParse({ path: '/tmp/x' }).success);
expect('relative path rejected',
  !schema.safeParse({ path: 'relative/x' }).success);
expect('z.url() works', z.url().safeParse('https://ex.com/').success);

// ───────── write-file-atomic + proper-lockfile ─────────
console.log('\n== write-file-atomic + proper-lockfile ==');
const dir = join(tmpdir(), `plint-verify-${Date.now()}`);
await mkdir(dir, { recursive: true });
const stateFile = join(dir, 'state.json');
const historyFile = join(dir, 'history.jsonl');

await writeAtomic(stateFile, '{"version":1,"slugs":{}}\n');
expect('writeAtomic creates file',
  (await readFile(stateFile, 'utf8')).includes('"version":1'));

// Locked RMW on existing file
let release = await lockfile.lock(stateFile, { retries: 5 });
const s = JSON.parse(await readFile(stateFile, 'utf8'));
s.slugs['my-demo'] = { zone_id: '12345' };
await writeAtomic(stateFile, JSON.stringify(s, null, 2) + '\n');
await release();
expect('RMW persists',
  JSON.parse(await readFile(stateFile, 'utf8')).slugs['my-demo']?.zone_id === '12345');

// realpath:false allows locking a file that doesn't exist yet (JSONL first-append case)
release = await lockfile.lock(historyFile, { realpath: false, retries: 5 });
await writeFile(historyFile, '{"ts":"2026-04-17T10:00:00Z"}\n', { flag: 'a' });
await release();
expect('realpath:false locks pre-existing absent file', true);

// Concurrent lock: second waits for first
const order = [];
const first = lockfile.lock(stateFile, { retries: 0 }).then(async (rel) => {
  order.push('first-acquired');
  await new Promise((r) => setTimeout(r, 40));
  await rel();
  order.push('first-released');
});
await new Promise((r) => setTimeout(r, 5));
const second = lockfile.lock(stateFile, { retries: { retries: 10, minTimeout: 10 } }).then(async (rel) => {
  order.push('second-acquired');
  await rel();
});
await Promise.all([first, second]);
expect('concurrent: second waits for first',
  order[0] === 'first-acquired' && order[1] === 'first-released' && order[2] === 'second-acquired',
  JSON.stringify(order));

await rm(dir, { recursive: true, force: true });

// ───────── MCP SDK ─────────
console.log('\n== @modelcontextprotocol/sdk ==');
const server = new McpServer({ name: 'verify', version: '0.0.0' });
expect('McpServer constructs', typeof server.registerTool === 'function');

server.registerTool(
  'echo',
  {
    title: 'Echo',
    description: 'Echo input',
    inputSchema: { msg: z.string() }, // raw shape — SDK convention
  },
  async ({ msg }) => ({ content: [{ type: 'text', text: msg }] }),
);
expect('registerTool accepts raw Zod shape', true);

expect('StdioServerTransport importable', typeof StdioServerTransport === 'function');

console.log(`\n${failures === 0 ? 'ALL PASSED' : `FAILED: ${failures}`}`);
process.exit(failures === 0 ? 0 : 1);
