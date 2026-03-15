import sandboxConfig from '../../sandbox/config';
import type { SandboxConfig } from './schema';

let validated = false;

export function getSandboxConfig(): SandboxConfig {
  if (!validated) {
    validateConfig(sandboxConfig);
    validated = true;
  }
  return sandboxConfig;
}

export function resolveSystemPrompt(
  config: SandboxConfig,
  systemPrompt?: string,
): string {
  if (typeof systemPrompt === 'string' && systemPrompt.trim()) {
    return systemPrompt.trim();
  }
  return config.instructions;
}

function validateConfig(config: SandboxConfig) {
  const errors: string[] = [];

  if (!config.model || typeof config.model !== 'string') {
    errors.push('model must be a non-empty string');
  }
  if (!config.provider || typeof config.provider !== 'string') {
    errors.push('provider must be a non-empty string');
  }
  if (!['bypass', 'ask', 'deny'].includes(config.permissions)) {
    errors.push('permissions must be "bypass", "ask", or "deny"');
  }
  if (!['workspace-write', 'workspace-read', 'full'].includes(config.sandbox)) {
    errors.push('sandbox must be "workspace-write", "workspace-read", or "full"');
  }
  if (!config.instructions || typeof config.instructions !== 'string') {
    errors.push('instructions must be a non-empty string');
  }
  if (!config.workspace?.dirs || !Array.isArray(config.workspace.dirs)) {
    errors.push('workspace.dirs must be an array of strings');
  }
  if (!config.workspace?.seed || typeof config.workspace.seed !== 'string') {
    errors.push('workspace.seed must be a non-empty string');
  }
  if (!Array.isArray(config.mcp)) {
    errors.push('mcp must be an array');
  }

  if (errors.length > 0) {
    console.error('\n[sandbox] Invalid sandbox/config.ts:');
    for (const e of errors) {
      console.error(`  - ${e}`);
    }
    console.error('');
    process.exit(1);
  }

  console.log('[sandbox] Config validated');
}
