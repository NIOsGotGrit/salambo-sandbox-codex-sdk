import type { McpServerConfig } from 'salambo-codex-agent-sdk';

// Add MCP servers here to extend the sandbox without touching the backend contract.
export const TEMPLATE_MCP_SERVERS: McpServerConfig[] = [];

export function getTemplateMcpServers() {
  return TEMPLATE_MCP_SERVERS;
}
