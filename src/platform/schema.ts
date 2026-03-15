import type {
  HookCallbackMatcher,
  HookEvent,
  McpServerConfig,
} from 'salambo-codex-agent-sdk';

export type SandboxPermissions = 'bypass' | 'ask' | 'deny';
export type SandboxMode = 'workspace-write' | 'workspace-read' | 'full';

export type SandboxConfig = {
  model: string;
  provider: string;
  codexPath?: string;
  permissions: SandboxPermissions;
  sandbox: SandboxMode;
  instructions: string;
  workspace: {
    seed: string;
    dirs: string[];
  };
  mcp: McpServerConfig[];
  hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
};

const PERMISSIONS_MAP: Record<SandboxPermissions, string> = {
  bypass: 'bypassPermissions',
  ask: 'askPermissions',
  deny: 'denyPermissions',
};

export function resolvePermissionMode(p: SandboxPermissions): string {
  return PERMISSIONS_MAP[p];
}

export function defineSandbox(config: SandboxConfig): SandboxConfig {
  return config;
}
