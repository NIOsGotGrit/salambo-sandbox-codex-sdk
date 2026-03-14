import type { HookCallback } from 'salambo-codex-agent-sdk';
import { defineSandbox } from '../src/platform/sandbox-schema';

const examplePreToolUseHook: HookCallback = async (input, toolName) => {
  console.log('[sandbox hook example] PreToolUse', {
    toolName,
    sessionId: input.session_id,
    cwd: input.cwd,
  });

  return {
    decision: 'allow',
  };
};

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
  hooks: {
    // Example: log every shell command before it runs.
    // Uncomment this block to enable it.
    //
    // PreToolUse: [
    //   {
    //     matcher: 'functions.exec_command',
    //     hooks: [examplePreToolUseHook],
    //   },
    // ],
  },
  workspace: {
    seedDir: 'sandbox/initial-workspace',
    directories: ['work', 'work/files', 'work/templates', 'outputs'],
  },
});
