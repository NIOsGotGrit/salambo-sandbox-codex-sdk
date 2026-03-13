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
} from '../config';
import type { WorkspacePaths } from '../workspace';
import {
  appendJsonEvent,
  createEventSink,
  sanitizePayload,
  sendAgentMessageToStream,
  type EventSink,
} from './event-store';
import { clearActiveSession } from './session-state';

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

export function buildStreamName(sessionId: string): string {
  return `${S2_STREAM_PREFIX}:${sessionId}`;
}

function resolveSystemPrompt(context: unknown): string | undefined {
  if (typeof context === 'string' && context.trim()) {
    return context;
  }

  if (
    context &&
    typeof context === 'object' &&
    typeof (context as { systemPrompt?: unknown }).systemPrompt === 'string'
  ) {
    const systemPrompt = (context as { systemPrompt: string }).systemPrompt.trim();
    return systemPrompt || undefined;
  }

  return undefined;
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
  console.log(`[${new Date().toISOString()}] ⚙️  DÉMARRAGE runAgentSession:`);
  console.log(`  - Session interne: "${options.sessionId}"`);
  console.log(`  - Session SDK: ${options.sdkSessionId ? `"${options.sdkSessionId}"` : 'sera généré'}`);
  console.log(`  - Stream S2: "${options.streamName}"`);
  console.log(`  - Type: ${options.isResuming ? 'REPRISE' : 'NOUVELLE'}`);
  console.log(`  - Capture SDK ID: ${options.captureSdkSessionId}`);
  console.log(`  - Prompt preview: "${options.prompt.substring(0, 100)}${options.prompt.length > 100 ? '...' : ''}"`);

  const stream = createEventSink(options.sessionId, options.streamName);
  const timestamp = () => new Date().toISOString();
  let sdkSessionId: string | undefined = options.sdkSessionId;
  let messageCount = 0;
  const systemPrompt = resolveSystemPrompt(options.context);
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

  console.log(
    `[${new Date().toISOString()}] 📡 Event stream ready (${stream.kind}): "${options.streamName}"`,
  );

  try {
    await appendJsonEvent(stream, {
      type: 'session_init',
      sessionId: options.sessionId,
      workspace: options.workspace.root,
      promptPreview: options.prompt.slice(0, 2000),
      context: sanitizePayload(options.context ?? null),
      timestamp: timestamp(),
    });
  } catch (streamError) {
    console.error(`[${new Date().toISOString()}] 💥 ERREUR lors de l'envoi session_init:`, streamError);
    throw streamError;
  }

  if (options.isResuming && sdkSessionId) {
    try {
      await publishSessionReady({
        stream,
        sdkSessionId,
        sessionId: options.sessionId,
        ourSessionId: options.ourSessionId,
        timestamp: timestamp(),
      });
    } catch (streamError) {
      console.error(`[${new Date().toISOString()}] 💥 ERREUR lors de l'envoi session_ready (reprise):`, streamError);
      throw streamError;
    }
  }

  try {
    const sessionOptions: SessionOptions = {
      model: CODEX_MODEL,
      provider: CODEX_PROVIDER,
      cwd: options.workspace.root,
      permissionMode: 'bypassPermissions',
      sandboxMode: 'workspace-write',
      codexPath: SALAMBO_CODEX_PATH || undefined,
      systemPrompt,
    };

    if (options.isResuming && options.sdkSessionId) {
      sessionOptions.resume = options.sdkSessionId;
    }

    sdkSession = createSession(sessionOptions);

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
    const sessionDuration = Date.now() - sessionStartTime;

    console.error(`[${new Date().toISOString()}] 💥 ERREUR SESSION ${options.sessionId}:`);
    console.error(`  - Type: ${aborted ? 'ANNULÉE' : 'ERREUR'}`);
    console.error(`  - Durée: ${sessionDuration}ms`);
    console.error(`  - Messages traités: ${messageCount}`);
    console.error(`  - SDK Session ID: ${sdkSessionId || 'non capturé'}`);
    console.error(`  - Erreur:`, error);

    try {
      await appendJsonEvent(stream, {
        type: aborted ? 'session_cancelled' : 'session_error',
        sessionId: options.sessionId,
        sdkSessionId,
        error: aborted ? undefined : serializeError(error),
        timestamp: timestamp(),
      });
    } catch (streamError) {
      console.error(`[${new Date().toISOString()}] 💥 ÉCHEC ENVOI ÉVÉNEMENT D'ERREUR:`, streamError);
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
    console.log(`[${new Date().toISOString()}] 🧹 Nettoyage session ${options.sessionId} terminé`);
    console.log(`  - Durée totale: ${sessionDuration}ms`);
    console.log(`  - Messages traités: ${messageCount}`);
    console.log(`  - SDK Session ID: ${sdkSessionId || 'non capturé'}`);
    console.log(`=== FIN SESSION ${options.sessionId} ===`);
  }
}
