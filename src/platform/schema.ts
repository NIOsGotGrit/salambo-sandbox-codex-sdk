export type SandboxConfig = {
  configProfile: string;
  instructions: string;
  workspace: {
    seed: string;
    dirs: string[];
  };
};

export function defineAgent(config: SandboxConfig): SandboxConfig {
  return config;
}
