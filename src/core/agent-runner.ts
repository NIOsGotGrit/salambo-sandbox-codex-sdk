import {
  createSession,
  type SalamboSession,
  type SessionOptions,
} from 'salambo-codex-agent-sdk';
import {
  CODEX_MODEL,
  CODEX_PROVIDER,
  SALAMBO_CODEX_PATH,
  S2_STREAM_PREFIX,
} from '../config/env';
import type { WorkspacePaths } from './workspace';
import {
  appendJsonEvent,
  createEventSink,
  sanitizePayload,
  sendAgentMessageToStream,
  type EventSink,
} from './event-store';
import { clearActiveSession } from './session-state';
import { applyTemplateSessionPolicy } from '../template/session-policy';

export type RunSessionOptions = {
  sessionId: string;
  sdkSessionId?: string;
  prompt: string;
  context?: unknown;
  abortController: AbortController;
  streamName: string;
  captureSdkSessionId?: boolean;
  ourSessionId?: string;
  isResuming: boolean;
  workspace: WorkspacePaths;
};

export function buildStreamName(sessionId: string) {
  return `${S2_STREAM_PREFIX}:${sessionId}`;
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

async function publishSessionReady(params: {
  stream: EventSink;
  sdkSessionId: string;
  sessionId: string;
  ourSessionId?: string;
  timestamp: string;
}) {
  await appendJsonEvent(params.stream, {
    type: 'session_ready',
    ourSessionId: params.ourSessionId ?? params.sessionId,
    sdkSessionId: params.sdkSessionId,
    timestamp: params.timestamp,
  });
}

export async function runAgentSession(options: RunSessionOptions) {
  const sessionStartTime = Date.now();
  const stream = createEventSink(options.sessionId, options.streamName);
  const timestamp = () => new Date().toISOString();
  let sdkSessionId: string | undefined = options.sdkSessionId;
  let messageCount = 0;
  let sdkSession: SalamboSession | null = null;
  const abortSignal = options.abortController.signal;

  const interruptSdkSession = async () => {
    if (!sdkSession) {
      return;
    }

    try {
      await sdkSession.interrupt();
    } catch (error) {
      console.warn(`[${new Date().toISOString()}] Failed to interrupt SDK session`, error);
    }

    try {
      sdkSession.abort();
    } catch (error) {
      console.warn(`[${new Date().toISOString()}] Failed to abort SDK session`, error);
    }
  };

  const abortListener = () => {
    void interruptSdkSession();
  };

  abortSignal.addEventListener('abort', abortListener, { once: true });

  await appendJsonEvent(stream, {
    type: 'session_init',
    sessionId: options.sessionId,
    workspace: options.workspace.root,
    promptPreview: options.prompt.slice(0, 2000),
    context: sanitizePayload(options.context ?? null),
    timestamp: timestamp(),
  });

  if (options.isResuming && sdkSessionId) {
    await publishSessionReady({
      stream,
      sdkSessionId,
      sessionId: options.sessionId,
      ourSessionId: options.ourSessionId,
      timestamp: timestamp(),
    });
  }

  try {
    const sessionOptions: SessionOptions = {
      model: CODEX_MODEL,
      provider: CODEX_PROVIDER,
      cwd: options.workspace.root,
      codexPath: SALAMBO_CODEX_PATH || undefined,
    };

    sdkSession = createSession(
      applyTemplateSessionPolicy(sessionOptions, {
        context: options.context,
        resumeSessionId: options.isResuming ? options.sdkSessionId : undefined,
      }),
    );

    if (abortSignal.aborted) {
      throw new Error('Session aborted before prompt dispatch');
    }

    await sdkSession.send(options.prompt);

    if (options.captureSdkSessionId && !sdkSessionId) {
      const createdSessionId = sdkSession.sessionId || sdkSession.threadId;

      if (createdSessionId) {
        sdkSessionId = createdSessionId;
        await publishSessionReady({
          stream,
          sdkSessionId,
          sessionId: options.sessionId,
          ourSessionId: options.ourSessionId,
          timestamp: timestamp(),
        });
      }
    }

    for await (const message of sdkSession.stream()) {
      messageCount++;

      if (abortSignal.aborted) {
        break;
      }

      const messageSessionId = (message as { session_id?: string }).session_id;
      if (
        options.captureSdkSessionId &&
        !sdkSessionId &&
        message.type === 'system' &&
        (message as { subtype?: string }).subtype === 'init' &&
        messageSessionId
      ) {
        sdkSessionId = messageSessionId;
        await publishSessionReady({
          stream,
          sdkSessionId,
          sessionId: options.sessionId,
          ourSessionId: options.ourSessionId,
          timestamp: timestamp(),
        });
      }

      await sendAgentMessageToStream({
        stream,
        sessionId: options.sessionId,
        sdkSessionId,
        message,
        timestamp: timestamp(),
      });
    }

    if (abortSignal.aborted) {
      await appendJsonEvent(stream, {
        type: 'session_cancelled',
        sessionId: options.sessionId,
        sdkSessionId,
        timestamp: timestamp(),
      });
      return;
    }

    await appendJsonEvent(stream, {
      type: 'session_complete',
      sessionId: options.sessionId,
      sdkSessionId,
      timestamp: timestamp(),
    });
  } catch (error) {
    const aborted = abortSignal.aborted;
    console.error(`[${new Date().toISOString()}] Session failed for ${options.sessionId}`, error);

    try {
      await appendJsonEvent(stream, {
        type: aborted ? 'session_cancelled' : 'session_error',
        sessionId: options.sessionId,
        sdkSessionId,
        error: aborted ? undefined : serializeError(error),
        timestamp: timestamp(),
      });
    } catch (streamError) {
      console.error(`[${new Date().toISOString()}] Failed to publish session error`, streamError);
    }
  } finally {
    abortSignal.removeEventListener('abort', abortListener);

    if (sdkSession) {
      try {
        await sdkSession[Symbol.asyncDispose]();
      } catch (error) {
        console.warn(`[${new Date().toISOString()}] Failed to dispose SDK session`, error);
      }
    }

    clearActiveSession();
    const sessionDuration = Date.now() - sessionStartTime;
    console.log(
      `[${new Date().toISOString()}] Session ${options.sessionId} finished in ${sessionDuration}ms with ${messageCount} streamed messages`,
    );
  }
}
