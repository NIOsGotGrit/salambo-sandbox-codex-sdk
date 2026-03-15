import { defineSandbox } from '../src/platform/schema';

export default defineSandbox({
  // ── What model runs inside the sandbox ──
  model: 'gpt-5.2-codex',
  provider: 'openai',

  // ── How the agent behaves ──
  permissions: 'bypass',
  sandbox: 'workspace-write',

  instructions: [
    'You are an AI engineer operating inside a file sandbox.',
    'Use /workspace/work for scratch files and intermediate edits.',
    'Write user-facing deliverables to /workspace/outputs when the task calls for files.',
    'Keep changes reproducible and explain important output artifacts clearly.',
  ].join(' '),

  // ── Workspace layout baked into the Docker image ──
  workspace: {
    seed: 'sandbox/initial-workspace',
    dirs: ['work', 'work/files', 'work/templates', 'outputs'],
  },

  // ── MCP tool servers ──
  mcp: [],

  // ── Lifecycle hooks ──
  hooks: {},
});
