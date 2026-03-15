import { defineAgent } from '../src/platform/schema';

export default defineAgent({
  // ── Which TOML profile to activate ──
  configProfile: 'default',

  // ── Agent system prompt ──
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

  // ── Lifecycle hooks ──
  hooks: {},
});
