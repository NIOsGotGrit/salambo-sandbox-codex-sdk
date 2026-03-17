import test from 'node:test';
import assert from 'node:assert/strict';

import { getLocalEvents } from '../../src/core/event-store.js';
import { runAgentSandbox } from '../../src/core/agent-runner.js';
import type { SessionOptions } from 'salambo-codex-agent-sdk';

function makeWorkspace() {
  return {
    root: '/workspace',
    workDir: '/workspace/work',
    outputsDir: '/workspace/outputs',
    filesDir: '/workspace/work/files',
    templatesDir: '/workspace/work/templates',
  };
}

function makeConfig() {
  return {
    configProfile: 'default',
    instructions: 'Default instructions',
    workspace: {
      seed: 'harness-config/initial-workspace',
      dirs: ['work', 'work/files', 'work/templates', 'outputs'],
    },
  };
}

test('runAgentSandbox emits ordered sandbox run lifecycle and raw session events', async () => {
  const clearCalls: string[] = [];
  const sentPrompts: string[] = [];
  let capturedOptions: SessionOptions | undefined;

  const fakeSession = {
    sessionId: 'sdk-session-1',
    threadId: 'thread-1',
    async send(prompt: string) {
      sentPrompts.push(prompt);
    },
    async interrupt() {},
    abort() {},
    async *stream() {
      yield { method: 'thread/started', params: { threadId: 'sdk-session-1' } };
      yield { method: 'turn/completed', params: { turnId: 'turn-1' } };
    },
    async [Symbol.asyncDispose]() {},
  };

  await runAgentSandbox(
    {
      sandboxId: 'runner-sandbox-1',
      prompt: 'Say hello',
      abortController: new AbortController(),
      streamName: 'agent-session:runner-sandbox-1',
      isResuming: false,
      workspace: makeWorkspace(),
    },
    {
      createSession(options: SessionOptions) {
        capturedOptions = options;
        return fakeSession as never;
      },
      createEventSink: (sandboxId, streamName) => ({
        kind: 'local',
        sandboxId,
        streamName,
      }),
      appendJsonEvent: (await import('../../src/core/event-store.js')).appendJsonEvent,
      sendSessionEventToStream: (await import('../../src/core/event-store.js')).sendSessionEventToStream,
      clearActiveSandbox: () => {
        clearCalls.push('cleared');
      },
      getSandboxConfig: () => makeConfig(),
      resolveSystemPrompt: (_config, systemPrompt) => systemPrompt ?? 'Default instructions',
    },
  );

  assert.equal(sentPrompts[0], 'Say hello');
  assert.equal(capturedOptions?.configProfile, 'default');
  assert.equal(capturedOptions?.cwd, '/workspace');

  const localEvents = getLocalEvents('runner-sandbox-1', 10);
  assert.ok(localEvents);
  assert.deepEqual(
    localEvents.events.map((event) => event.payload.type),
    [
      'sandbox.run.init',
      'sandbox.run.ready',
      'session.event',
      'session.event',
      'sandbox.run.complete',
    ],
  );

  assert.deepEqual(clearCalls, ['cleared']);
});

test('runAgentSandbox emits sandbox.run.cancelled when aborted', async () => {
  const abortController = new AbortController();
  let yielded = false;

  const fakeSession = {
    sessionId: undefined,
    threadId: undefined,
    async send() {
      abortController.abort();
    },
    async interrupt() {},
    abort() {},
    async *stream() {
      yielded = true;
      yield { method: 'thread/started', params: { threadId: 'sdk-session-2' } };
    },
    async [Symbol.asyncDispose]() {},
  };

  await runAgentSandbox(
    {
      sandboxId: 'runner-sandbox-2',
      prompt: 'Cancel me',
      abortController,
      streamName: 'agent-session:runner-sandbox-2',
      isResuming: false,
      workspace: makeWorkspace(),
    },
    {
      createSession: () => fakeSession as never,
      createEventSink: (sandboxId, streamName) => ({
        kind: 'local',
        sandboxId,
        streamName,
      }),
      appendJsonEvent: (await import('../../src/core/event-store.js')).appendJsonEvent,
      sendSessionEventToStream: (await import('../../src/core/event-store.js')).sendSessionEventToStream,
      clearActiveSandbox: () => {},
      getSandboxConfig: () => makeConfig(),
      resolveSystemPrompt: (_config, systemPrompt) => systemPrompt ?? 'Default instructions',
    },
  );

  assert.equal(yielded, true);

  const localEvents = getLocalEvents('runner-sandbox-2', 10);
  assert.ok(localEvents);
  assert.deepEqual(
    localEvents.events.map((event) => event.payload.type),
    ['sandbox.run.init', 'sandbox.run.cancelled'],
  );
});
