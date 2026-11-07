// Minimal MCP client: raw newline-delimited JSON-RPC over stdio to `<plint> mcp`,
// with no SDK, so tests see the bundled binary exactly as an MCP client does.
import { spawn } from 'node:child_process';

export function startMcp(plint) {
  const child = spawn(plint, ['mcp'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const waiting = new Map();
  const session = { child, stderr: '', nonJsonStdout: 0 };
  let buf = '';
  let id = 0;
  child.stderr.on('data', (d) => (session.stderr += d));
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { session.nonJsonStdout += 1; continue; }
      waiting.get(msg.id)?.(msg);
    }
  });
  session.rpc = (method, params) => {
    const myId = ++id;
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: myId, method, params }) + '\n');
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timeout on ${method}`)), 120000);
      waiting.set(myId, (m) => { clearTimeout(t); resolve(m); });
    });
  };
  session.call = (name, args) => session.rpc('tools/call', { name, arguments: args }).then((m) => m.result);
  session.init = async () => {
    const init = await session.rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'plint-e2e', version: '0' }
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    return init;
  };
  session.close = () => child.kill();
  return session;
}

export function checker(prefix = 'mcp') {
  const state = { failed: 0 };
  state.check = (name, cond, detail = '') => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${prefix}: ${name}${cond ? '' : `  ${detail}`}`);
    if (!cond) state.failed += 1;
  };
  return state;
}
