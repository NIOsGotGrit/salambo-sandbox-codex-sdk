import type {
  HookCallbackMatcher,
  HookEvent,
} from 'salambo-codex-agent-sdk';

export type SandboxConfig = {
  configProfile: string;
  instructions: string;
  workspace: {
    seed: string;
    dirs: string[];
  };
  hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
};

export function defineAgent(config: SandboxConfig): SandboxConfig {
  return config;
}
