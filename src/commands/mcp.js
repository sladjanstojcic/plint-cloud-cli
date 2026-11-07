import { startMcpServer } from '../mcp/server.js';

export default async function mcp() {
  await startMcpServer();
}
