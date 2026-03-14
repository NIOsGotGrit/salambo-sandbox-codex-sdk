import type {
  HookCallbackMatcher,
  HookEvent,
  McpServerConfig,
  PermissionMode,
  SandboxMode,
} from 'salambo-codex-agent-sdk';

export type SandboxConfig = {
  runtime: {
    model: string;
    provider: string;
    codexPath?: string;
  };
  agent: {
    permissionMode: PermissionMode;
    sandboxMode: SandboxMode;
    instructions: string;
  };
  mcp: McpServerConfig[];
  hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
  workspace: {
    seedDir: string;
    directories: string[];
  };
};

export function defineSandbox(config: SandboxConfig): SandboxConfig {
  return config;
}
