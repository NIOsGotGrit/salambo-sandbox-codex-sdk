import { defineSandbox } from '../src/platform/sandbox-schema';

export default defineSandbox({
  runtime: {
    model: 'gpt-5.2-codex',
    provider: 'openai',
    codexPath: undefined,
  },
  agent: {
    permissionMode: 'bypassPermissions',
    sandboxMode: 'workspace-write',
    instructions: [
      'You are an AI engineer operating inside a file sandbox.',
      'Use /workspace/work for scratch files and intermediate edits.',
      'Write user-facing deliverables to /workspace/outputs when the task calls for files.',
      'Keep changes reproducible and explain important output artifacts clearly.',
    ].join(' '),
  },
  mcp: [],
  hooks: {},
  workspace: {
    seedDir: 'sandbox/initial-workspace',
    directories: ['work', 'work/files', 'work/templates', 'outputs'],
  },
});
