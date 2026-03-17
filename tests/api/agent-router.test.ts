import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import express from 'express';

import { createAgentRouter } from '../../src/routes/agent.js';
import type { WorkspacePaths } from '../../src/core/workspace.js';
import type { ActiveSandbox } from '../../src/core/session-state.js';
import type { RunSandboxOptions } from '../../src/core/agent-runner.js';
import type { SandboxConfig } from '../../src/platform/schema.js';

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

function createDeferred(): Deferred {
  let resolve = () => {};
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function makeWorkspace(): WorkspacePaths {
  return {
    root: '/workspace',
    workDir: '/workspace/work',
    outputsDir: '/workspace/outputs',
    filesDir: '/workspace/work/files',
    templatesDir: '/workspace/work/templates',
  };
}

function makeSandboxConfig(): SandboxConfig {
  return {
    configProfile: 'default',
    instructions: 'Test instructions',
    workspace: {
      seed: 'harness-config/initial-workspace',
      dirs: ['work', 'work/files', 'work/templates', 'outputs'],
    },
  };
}

function createRouterHarness(options?: {
  activeSandbox?: ActiveSandbox | null;
  queueLength?: number;
  localEvents?: unknown;
  enqueuePromise?: Promise<void>;
}) {
  let activeSandbox = options?.activeSandbox ?? null;
  const runCalls: RunSandboxOptions[] = [];
  const workspace = makeWorkspace();

  const deps = {
    setupWorkspace: async () => workspace,
    ensureFileWatcher: async () => {},
    runAgentSandbox: async (runOptions: RunSandboxOptions) => {
      runCalls.push(runOptions);
    },
    buildStreamName: (sandboxId: string) => `agent-session:${sandboxId}`,
    getEventBackend: () => 'local' as const,
    getLocalEvents: () => options?.localEvents ?? null,
    clearActiveSandbox: () => {
      activeSandbox = null;
    },
    enqueue: async () => {
      await (options?.enqueuePromise ?? Promise.resolve());
    },
    getActiveSandbox: () => activeSandbox,
    getQueueLength: () => options?.queueLength ?? 0,
    setActiveSandbox: (sandbox: ActiveSandbox | null) => {
      activeSandbox = sandbox;
    },
    getSandboxConfig: () => makeSandboxConfig(),
  };

  const app = express();
  app.use(express.json());
  app.use(createAgentRouter(deps));

  return {
    app,
    deps,
    getRunCalls: () => runCalls,
    getActiveSandbox: () => activeSandbox,
  };
}

async function withServer<T>(
  app: express.Express,
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to get test server address');
  }

  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

test('GET /health returns contract shape', async () => {
  const harness = createRouterHarness();

  await withServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, 'healthy');
    assert.equal(body.configProfile, 'default');
    assert.equal(body.eventBackend, 'local');
    assert.equal(typeof body.timestamp, 'string');
  });
});

test('POST /agent/query validates prompt and sandboxId', async () => {
  const harness = createRouterHarness();

  await withServer(harness.app, async (baseUrl) => {
    const missingPrompt = await fetch(`${baseUrl}/agent/query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sandboxId: 'sbx-1' }),
    });

    assert.equal(missingPrompt.status, 400);
    assert.deepEqual(await missingPrompt.json(), {
      error: 'prompt is required and must be a string',
    });

    const missingSandboxId = await fetch(`${baseUrl}/agent/query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'hello' }),
    });

    assert.equal(missingSandboxId.status, 400);
    assert.deepEqual(await missingSandboxId.json(), {
      error: 'sandboxId is required and must be a string',
    });
  });
});

test('POST /agent/query accepts and schedules a sandbox run', async () => {
  const harness = createRouterHarness();

  await withServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/agent/query`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-token',
      },
      body: JSON.stringify({
        sandboxId: 'sbx-1',
        prompt: 'hello',
        systemPrompt: 'override',
        metadata: { source: 'test' },
      }),
    });

    const body = await response.json();

    assert.equal(response.status, 202);
    assert.deepEqual(body, {
      sandboxId: 'sbx-1',
      status: 'accepted',
    });

    assert.equal(harness.getRunCalls().length, 1);
    assert.equal(harness.getRunCalls()[0]?.sandboxId, 'sbx-1');
    assert.equal(harness.getRunCalls()[0]?.prompt, 'hello');
    assert.equal(harness.getRunCalls()[0]?.systemPrompt, 'override');
    assert.deepEqual(harness.getRunCalls()[0]?.metadata, { source: 'test' });

    const activeSandbox = harness.getActiveSandbox();
    assert.ok(activeSandbox);
    assert.equal(activeSandbox?.sandboxId, 'sbx-1');
    assert.equal(activeSandbox?.agentToken, 'Bearer test-token');
  });
});

test('POST /agent/query returns queued when another sandbox run is active', async () => {
  const enqueueDeferred = createDeferred();
  const harness = createRouterHarness({
    activeSandbox: {
      sandboxId: 'active-1',
      abortController: new AbortController(),
      streamName: 'agent-session:active-1',
      workspace: makeWorkspace(),
    },
    queueLength: 1,
    enqueuePromise: enqueueDeferred.promise,
  });

  await withServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/agent/query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sandboxId: 'sbx-queued',
        prompt: 'hello',
      }),
    });

    const body = await response.json();

    assert.equal(response.status, 202);
    assert.deepEqual(body, {
      sandboxId: 'sbx-queued',
      status: 'queued',
      position: 2,
    });

    assert.equal(harness.getRunCalls().length, 0);
  });

  enqueueDeferred.resolve();
});

test('GET /agent/status returns current sandbox and queue state', async () => {
  const harness = createRouterHarness({
    activeSandbox: {
      sandboxId: 'active-1',
      abortController: new AbortController(),
      streamName: 'agent-session:active-1',
      workspace: makeWorkspace(),
    },
    queueLength: 3,
  });

  await withServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/agent/status`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.hasActiveSandbox, true);
    assert.equal(body.sandbox.sandboxId, 'active-1');
    assert.equal(body.queueLength, 3);
    assert.equal(body.configProfile, 'default');
  });
});

test('GET /agent/events/:sandboxId returns stored local events', async () => {
  const harness = createRouterHarness({
    localEvents: {
      sandboxId: 'sbx-1',
      eventBackend: 'local',
      totalEvents: 1,
      returnedEvents: 1,
      updatedAt: '2026-03-16T12:00:00.000Z',
      events: [
        {
          sequence: 1,
          streamName: 'agent-session:sbx-1',
          payload: {
            type: 'sandbox.run.init',
            sandboxId: 'sbx-1',
          },
        },
      ],
    },
  });

  await withServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/agent/events/sbx-1`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.sandboxId, 'sbx-1');
    assert.equal(body.events.length, 1);
    assert.equal(body.events[0]?.payload.type, 'sandbox.run.init');
  });
});

test('POST /agent/interrupt aborts matching active sandbox', async () => {
  const abortController = new AbortController();
  const harness = createRouterHarness({
    activeSandbox: {
      sandboxId: 'active-1',
      abortController,
      streamName: 'agent-session:active-1',
      workspace: makeWorkspace(),
    },
  });

  await withServer(harness.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/agent/interrupt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sandboxId: 'active-1' }),
    });

    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, { success: true, sandboxId: 'active-1' });
    assert.equal(abortController.signal.aborted, true);
    assert.equal(harness.getActiveSandbox(), null);
  });
});
