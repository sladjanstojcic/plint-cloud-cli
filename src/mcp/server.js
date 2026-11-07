import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerDeploy } from './tools/deploy.js';
import { registerEstimate } from './tools/estimate.js';
import { registerProjectTools } from './tools/project.js';
import { registerSystemTools } from './tools/system.js';

export async function startMcpServer(deps = {}) {
  const server = new McpServer({
    name: 'plint',
    version: process.env.npm_package_version ?? '0.1.0'
  });
  registerEstimate(server, deps);
  registerDeploy(server, deps);
  registerProjectTools(server, deps);
  registerSystemTools(server, deps);
  await server.connect(new StdioServerTransport());
  return server;
}
