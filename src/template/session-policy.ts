import {
  type HookCallbackMatcher,
  type PermissionMode,
  type SandboxMode,
  type SessionOptions,
} from 'salambo-codex-agent-sdk';
import type { HookEvent } from 'salambo-codex-agent-sdk';
import { resolveTemplateSystemPrompt } from './instructions';
import { getTemplateHooks } from './hooks';
import { getTemplateMcpServers } from './mcp';

export const AGENT_PERMISSION_MODE: PermissionMode = 'bypassPermissions';
export const AGENT_SANDBOX_MODE: SandboxMode = 'workspace-write';

export function applyTemplateSessionPolicy(
  sessionOptions: SessionOptions,
  params: {
    context?: unknown;
    resumeSessionId?: string;
  },
): SessionOptions {
  const hooks = getTemplateHooks() as Partial<Record<HookEvent, HookCallbackMatcher[]>>;

  const nextOptions: SessionOptions = {
    ...sessionOptions,
    permissionMode: AGENT_PERMISSION_MODE,
    sandboxMode: AGENT_SANDBOX_MODE,
    systemPrompt: resolveTemplateSystemPrompt(params.context),
    hooks,
    mcpServers: getTemplateMcpServers(),
  };

  if (params.resumeSessionId) {
    nextOptions.resume = params.resumeSessionId;
  }

  return nextOptions;
}
