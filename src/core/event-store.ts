import { AppendRecord, S2 } from '@s2-dev/streamstore';
import {
  LOCAL_EVENT_MAX_EVENTS,
  S2_ACCESS_TOKEN,
  S2_BASIN,
  S2_ENABLED,
} from '../config/env';

type JsonEventPayload = Record<string, unknown>;

export type LocalEventRecord = {
  sequence: number;
  streamName: string;
  payload: JsonEventPayload;
};

type LocalEventSession = {
  events: LocalEventRecord[];
  nextSequence: number;
  updatedAt: string;
};

function getS2Basin() {
  if (!S2_ACCESS_TOKEN || !S2_BASIN) {
    throw new Error('S2_ACCESS_TOKEN and S2_BASIN must be configured');
  }

  const s2Client = new S2({ accessToken: S2_ACCESS_TOKEN });
  return s2Client.basin(S2_BASIN);
}

type S2Stream = ReturnType<ReturnType<typeof getS2Basin>['stream']>;

export type EventSink =
  | {
      kind: 's2';
      sessionId: string;
      streamName: string;
      stream: S2Stream;
    }
  | {
      kind: 'local';
      sessionId: string;
      streamName: string;
    };

const localEventSessions = new Map<string, LocalEventSession>();

export function getEventBackend(): 's2' | 'local' {
  return S2_ENABLED ? 's2' : 'local';
}

function getOrCreateLocalEventSession(sessionId: string): LocalEventSession {
  const existing = localEventSessions.get(sessionId);
  if (existing) {
    return existing;
  }

  const created: LocalEventSession = {
    events: [],
    nextSequence: 1,
    updatedAt: new Date().toISOString(),
  };
  localEventSessions.set(sessionId, created);
  return created;
}

function recordLocalEvent(sessionId: string, streamName: string, payload: JsonEventPayload) {
  const session = getOrCreateLocalEventSession(sessionId);
  session.events.push({
    sequence: session.nextSequence++,
    streamName,
    payload: sanitizePayload(payload),
  });
  session.updatedAt = new Date().toISOString();

  if (session.events.length > LOCAL_EVENT_MAX_EVENTS) {
    session.events.splice(0, session.events.length - LOCAL_EVENT_MAX_EVENTS);
  }
}

export function getLocalEvents(sessionId: string, limit: number) {
  const session = localEventSessions.get(sessionId);
  if (!session) {
    return null;
  }

  return {
    sessionId,
    eventBackend: getEventBackend(),
    totalEvents: session.events.length,
    returnedEvents: Math.min(limit, session.events.length),
    updatedAt: session.updatedAt,
    events: session.events.slice(-limit),
  };
}

export function createEventSink(sessionId: string, streamName: string): EventSink {
  if (!S2_ENABLED) {
    return {
      kind: 'local',
      sessionId,
      streamName,
    };
  }

  const basin = getS2Basin();
  return {
    kind: 's2',
    sessionId,
    streamName,
    stream: basin.stream(streamName),
  };
}

function isAgentSdkMessage(payload: unknown): payload is { type: string } {
  return Boolean(payload && typeof (payload as { type?: unknown }).type === 'string');
}

export async function sendAgentMessageToStream(params: {
  stream: EventSink;
  sessionId: string;
  sdkSessionId?: string;
  message: unknown;
  timestamp: string;
}) {
  const sanitizedMessage = sanitizePayload(params.message);
  const messageType = isAgentSdkMessage(sanitizedMessage) ? sanitizedMessage.type : 'unknown';

  await appendJsonEvent(params.stream, {
    type: 'agent_message',
    sessionId: params.sessionId,
    sdkSessionId: params.sdkSessionId,
    messageType,
    message: sanitizedMessage,
    timestamp: params.timestamp,
  });
}

export async function appendJsonEvent(
  stream: EventSink,
  payload: Record<string, unknown>,
  retryCount = 0,
) {
  if (retryCount === 0) {
    recordLocalEvent(stream.sessionId, stream.streamName, payload);
  }

  if (stream.kind === 'local') {
    if (retryCount === 0) {
      console.log(
        `[${new Date().toISOString()}] LOCAL - Event ${payload.type} stored for session ${stream.sessionId}`,
      );
    }
    return;
  }

  const maxRetries = 5;
  const baseDelay = 1000;
  const retryDelay = baseDelay * Math.pow(2, retryCount);

  try {
    const content = JSON.stringify(payload);
    const record = AppendRecord.make(content, {
      'content-type': 'application/json',
      'event-type': String(payload.type ?? 'event'),
    });

    if (retryCount > 0) {
      console.log(
        `[${new Date().toISOString()}] S2 - Retry #${retryCount} for event ${payload.type}`,
      );
    }

    await stream.stream.append(record);

    if (retryCount === 0) {
      console.log(`[${new Date().toISOString()}] S2 - Event ${payload.type} sent`);
    } else {
      console.log(
        `[${new Date().toISOString()}] S2 - Event ${payload.type} sent after ${retryCount} retry(s)`,
      );
    }
  } catch (error: any) {
    const isNetworkError =
      error?.code === 'UND_ERR_SOCKET' ||
      error?.cause?.code === 'UND_ERR_SOCKET' ||
      error?.message?.includes('fetch failed');

    if (isNetworkError && retryCount < maxRetries) {
      console.warn(
        `[${new Date().toISOString()}] S2 - Network error, retry ${retryCount + 1}/${maxRetries} in ${retryDelay}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      return appendJsonEvent(stream, payload, retryCount + 1);
    }

    console.error(`[${new Date().toISOString()}] S2 - Failed to send event ${payload.type}`, error);
    throw error;
  }
}

export function sanitizePayload<T>(value: T): T {
  try {
    return JSON.parse(
      JSON.stringify(value, (_key, jsonValue) =>
        typeof jsonValue === 'bigint' ? jsonValue.toString() : jsonValue,
      ),
    );
  } catch {
    return value;
  }
}
