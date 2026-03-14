import sandboxConfig from '../../sandbox/config';
import type { SandboxConfig } from './sandbox-schema';

export function getSandboxConfig(): SandboxConfig {
  return sandboxConfig;
}

export function resolveSandboxSystemPrompt(context: unknown): string | undefined {
  const config = getSandboxConfig();

  if (typeof context === 'string' && context.trim()) {
    return context.trim();
  }

  if (
    context &&
    typeof context === 'object' &&
    typeof (context as { systemPrompt?: unknown }).systemPrompt === 'string'
  ) {
    const systemPrompt = (context as { systemPrompt: string }).systemPrompt.trim();
    return systemPrompt || config.agent.instructions;
  }

  return config.agent.instructions;
}
