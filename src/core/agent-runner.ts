import {
  createSession,
  type PermissionMode,
  type SalamboSession,
  type SandboxMode as SdkSandboxMode,
  type SessionOptions,
} from 'salambo-codex-agent-sdk';
import { S2_STREAM_PREFIX } from '../config/env';
import type { WorkspacePaths } from './workspace';
import {
  appendJsonEvent,
  createEventSink,
  sanitizePayload,
  sendAgentMessageToStream,
  type EventSink,
} from './event-store';
import { clearActiveTask } from './session-state';
import {
  getSandboxConfig,
  resolveSystemPrompt,
} from '../platform/load-sandbox-config';
import { resolvePermissionMode } from '../platform/schema';

export type RunTaskOptions = {
  taskId: string;
  sdkSessionId?: string;
  prompt: string;
  systemPrompt?: string;
  metadata?: Record<string, unknown>;
  abortController: AbortController;
  streamName: string;
  isResuming: boolean;
  workspace: WorkspacePaths;
};

export function buildStreamName(taskId: string) {
  return `${S2_STREAM_PREFIX}:${taskId}`;
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }
  if (typeof error === 'string') {
    return { message: error };
  }
  return { message: 'Unknown error' };
}

async function publishTaskReady(params: {
  stream: EventSink;
  sdkSessionId: string;
  taskId: string;
  timestamp: string;
}) {
  await appendJsonEvent(params.stream, {
    type: 'task_ready',
    taskId: params.taskId,
    sdkSessionId: params.sdkSessionId,
    timestamp: params.timestamp,
  });
}

export async function runAgentTask(options: RunTaskOptions) {
  const startTime = Date.now();
  const stream = createEventSink(options.taskId, options.streamName);
  const ts = () => new Date().toISOString();
  let sdkSessionId: string | undefined = options.sdkSessionId;
  let messageCount = 0;
  let sdkSession: SalamboSession | null = null;
  const abortSignal = options.abortController.signal;

  const interruptSdk = async () => {
    if (!sdkSession) return;
    try { await sdkSession.interrupt(); } catch { /* best effort */ }
    try { sdkSession.abort(); } catch { /* best effort */ }
  };

  const abortListener = () => { void interruptSdk(); };
  abortSignal.addEventListener('abort', abortListener, { once: true });

  await appendJsonEvent(stream, {
    type: 'task_init',
    taskId: options.taskId,
    workspace: options.workspace.root,
    promptPreview: options.prompt.slice(0, 2000),
    metadata: sanitizePayload(options.metadata ?? null),
    timestamp: ts(),
  });

  if (options.isResuming && sdkSessionId) {
    await publishTaskReady({ stream, sdkSessionId, taskId: options.taskId, timestamp: ts() });
  }

  try {
    const config = getSandboxConfig();
    const sessionOptions: SessionOptions = {
      model: config.model,
      provider: config.provider,
      cwd: options.workspace.root,
      codexPath: config.codexPath,
      permissionMode: resolvePermissionMode(config.permissions) as PermissionMode,
      sandboxMode: config.sandbox as SdkSandboxMode,
      systemPrompt: resolveSystemPrompt(config, options.systemPrompt),
      hooks: config.hooks,
      mcpServers: config.mcp,
    };

    if (options.isResuming && options.sdkSessionId) {
      sessionOptions.resume = options.sdkSessionId;
    }

    sdkSession = createSession(sessionOptions);

    if (abortSignal.aborted) {
      throw new Error('Task aborted before prompt dispatch');
    }

    await sdkSession.send(options.prompt);

    // Capture SDK session ID from the session object
    if (!sdkSessionId) {
      const id = sdkSession.sessionId || sdkSession.threadId;
      if (id) {
        sdkSessionId = id;
        await publishTaskReady({ stream, sdkSessionId, taskId: options.taskId, timestamp: ts() });
      }
    }

    for await (const message of sdkSession.stream()) {
      messageCount++;
      if (abortSignal.aborted) break;

      // Capture SDK session ID from init message if we still don't have it
      const msgSessionId = (message as { session_id?: string }).session_id;
      if (
        !sdkSessionId &&
        message.type === 'system' &&
        (message as { subtype?: string }).subtype === 'init' &&
        msgSessionId
      ) {
        sdkSessionId = msgSessionId;
        await publishTaskReady({ stream, sdkSessionId, taskId: options.taskId, timestamp: ts() });
      }

      await sendAgentMessageToStream({
        stream,
        taskId: options.taskId,
        sdkSessionId,
        message,
        timestamp: ts(),
      });
    }

    await appendJsonEvent(stream, {
      type: abortSignal.aborted ? 'task_cancelled' : 'task_complete',
      taskId: options.taskId,
      sdkSessionId,
      timestamp: ts(),
    });
  } catch (error) {
    const aborted = abortSignal.aborted;
    console.error(`[${ts()}] Task failed: ${options.taskId}`, error);

    try {
      await appendJsonEvent(stream, {
        type: aborted ? 'task_cancelled' : 'task_error',
        taskId: options.taskId,
        sdkSessionId,
        error: aborted ? undefined : serializeError(error),
        timestamp: ts(),
      });
    } catch (streamError) {
      console.error(`[${ts()}] Failed to publish task error`, streamError);
    }
  } finally {
    abortSignal.removeEventListener('abort', abortListener);

    if (sdkSession) {
      try { await sdkSession[Symbol.asyncDispose](); } catch { /* best effort */ }
    }

    clearActiveTask();
    const duration = Date.now() - startTime;
    console.log(`[${ts()}] Task ${options.taskId} finished in ${duration}ms (${messageCount} messages)`);
  }
}
