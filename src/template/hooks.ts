import type { HookCallbackMatcher } from 'salambo-codex-agent-sdk';

// Add SDK hook matchers here when you want to intercept tool usage or session lifecycle events.
// Example events supported by the SDK include SessionStart, PreToolUse, PostToolUse, and Stop.
export const TEMPLATE_HOOKS: Partial<Record<string, HookCallbackMatcher[]>> = {};

export function getTemplateHooks() {
  return TEMPLATE_HOOKS;
}
