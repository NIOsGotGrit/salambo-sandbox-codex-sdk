import {
  createSession,
  type SalamboSession,
  type SessionOptions,
} from 'salambo-codex-agent-sdk';

// Extend SessionOptions until the SDK ships configProfile natively
type SandboxSessionOptions = SessionOptions & {
  configProfile?: string;
};
import { S2_STREAM_PREFIX } from '../config/env';
import type { WorkspacePaths } from './workspace';
import {
  appendJsonEvent,
  createEventSink,
  sanitizePayload,
  sendSessionEventToStream,
  type EventSink,
} from './event-store';
import { clearActiveSandbox } from './session-state';
import {
  getSandboxConfig,
  resolveSystemPrompt,
} from '../platform/load-sandbox-config';

export type RunSandboxOptions = {
  sandboxId: string;
  sdkSessionId?: string;
  prompt: string;
  systemPrompt?: string;
  metadata?: Record<string, unknown>;
  abortController: AbortController;
  streamName: string;
  isResuming: boolean;
  workspace: WorkspacePaths;
};

export function buildStreamName(sandboxId: string) {
  return `${S2_STREAM_PREFIX}:${sandboxId}`;
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

async function publishSandboxReady(params: {
  stream: EventSink;
  sdkSessionId: string;
  sandboxId: string;
  timestamp: string;
}) {
  await appendJsonEvent(params.stream, {
    type: 'sandbox.ready',
    sandboxId: params.sandboxId,
    sdkSessionId: params.sdkSessionId,
    timestamp: params.timestamp,
  });
}

function extractSdkSessionId(event: unknown): string | undefined {
  if (!event || typeof event !== 'object') {
    return undefined;
  }

  const rawSessionId = (event as { session_id?: unknown }).session_id;
  if (typeof rawSessionId === 'string' && rawSessionId.length > 0) {
    return rawSessionId;
  }

  const method = (event as { method?: unknown }).method;
  const params = (event as { params?: unknown }).params;
  if (
    method === 'thread/started' &&
    params &&
    typeof params === 'object' &&
    typeof (params as { threadId?: unknown }).threadId === 'string'
  ) {
    return (params as { threadId: string }).threadId;
  }

  return undefined;
}

export async function runAgentSandbox(options: RunSandboxOptions) {
  const startTime = Date.now();
  const stream = createEventSink(options.sandboxId, options.streamName);
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
    type: 'sandbox.init',
    sandboxId: options.sandboxId,
    workspace: options.workspace.root,
    promptPreview: options.prompt.slice(0, 2000),
    metadata: sanitizePayload(options.metadata ?? null),
    timestamp: ts(),
  });

  if (options.isResuming && sdkSessionId) {
    await publishSandboxReady({ stream, sdkSessionId, sandboxId: options.sandboxId, timestamp: ts() });
  }

  try {
    const config = getSandboxConfig();
    const sessionOptions: SandboxSessionOptions = {
      configProfile: config.configProfile,
      cwd: options.workspace.root,
      systemPrompt: resolveSystemPrompt(config, options.systemPrompt),
      hooks: config.hooks,
    };

    if (options.isResuming && options.sdkSessionId) {
      sessionOptions.resume = options.sdkSessionId;
    }

    sdkSession = createSession(sessionOptions as SessionOptions);

    if (abortSignal.aborted) {
      throw new Error('Sandbox aborted before prompt dispatch');
    }

    await sdkSession.send(options.prompt);

    // Capture SDK session ID from the session object
    if (!sdkSessionId) {
      const id = sdkSession.sessionId || sdkSession.threadId;
      if (id) {
        sdkSessionId = id;
        await publishSandboxReady({ stream, sdkSessionId, sandboxId: options.sandboxId, timestamp: ts() });
      }
    }

    for await (const message of sdkSession.stream()) {
      messageCount++;
      if (abortSignal.aborted) break;

      const msgSessionId = extractSdkSessionId(message);
      if (!sdkSessionId && msgSessionId) {
        sdkSessionId = msgSessionId;
        await publishSandboxReady({ stream, sdkSessionId, sandboxId: options.sandboxId, timestamp: ts() });
      }

      await sendSessionEventToStream({
        stream,
        sandboxId: options.sandboxId,
        sdkSessionId,
        event: message,
        timestamp: ts(),
      });
    }

    await appendJsonEvent(stream, {
      type: abortSignal.aborted ? 'sandbox.cancelled' : 'sandbox.complete',
      sandboxId: options.sandboxId,
      sdkSessionId,
      timestamp: ts(),
    });
  } catch (error) {
    const aborted = abortSignal.aborted;
    console.error(`[${ts()}] Sandbox failed: ${options.sandboxId}`, error);

    try {
      await appendJsonEvent(stream, {
        type: aborted ? 'sandbox.cancelled' : 'sandbox.error',
        sandboxId: options.sandboxId,
        sdkSessionId,
        error: aborted ? undefined : serializeError(error),
        timestamp: ts(),
      });
    } catch (streamError) {
      console.error(`[${ts()}] Failed to publish sandbox error`, streamError);
    }
  } finally {
    abortSignal.removeEventListener('abort', abortListener);

    if (sdkSession) {
      try { await sdkSession[Symbol.asyncDispose](); } catch { /* best effort */ }
    }

    clearActiveSandbox();
    const duration = Date.now() - startTime;
    console.log(`[${ts()}] Sandbox ${options.sandboxId} finished in ${duration}ms (${messageCount} messages)`);
  }
}
