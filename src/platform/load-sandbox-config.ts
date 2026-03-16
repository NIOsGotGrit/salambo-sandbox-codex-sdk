import sandboxConfig from '../../harness-config/agent';
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

  if (!config.configProfile || typeof config.configProfile !== 'string') {
    errors.push('configProfile must be a non-empty string');
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

  if (errors.length > 0) {
    console.error('\n[harness-config] Invalid harness-config/agent.ts:');
    for (const e of errors) {
      console.error(`  - ${e}`);
    }
    console.error('');
    process.exit(1);
  }

  console.log('[harness-config] Agent config validated');
}
