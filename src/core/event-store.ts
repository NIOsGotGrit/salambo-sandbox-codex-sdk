import { AppendRecord, S2 } from '@s2-dev/streamstore';
import {
  LOCAL_EVENT_MAX_EVENTS,
  S2_ACCESS_TOKEN,
  S2_BASIN,
  S2_ENABLED,
} from '../config/env.js';

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
  | { kind: 's2'; sandboxId: string; streamName: string; stream: S2Stream }
  | { kind: 'local'; sandboxId: string; streamName: string };

const localEventSessions = new Map<string, LocalEventSession>();

export function getEventBackend(): 's2' | 'local' {
  return S2_ENABLED ? 's2' : 'local';
}

function getOrCreateLocal(sandboxId: string): LocalEventSession {
  const existing = localEventSessions.get(sandboxId);
  if (existing) return existing;

  const created: LocalEventSession = {
    events: [],
    nextSequence: 1,
    updatedAt: new Date().toISOString(),
  };
  localEventSessions.set(sandboxId, created);
  return created;
}

function recordLocalEvent(sandboxId: string, streamName: string, payload: JsonEventPayload) {
  const session = getOrCreateLocal(sandboxId);
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

export function getLocalEvents(sandboxId: string, limit: number) {
  const session = localEventSessions.get(sandboxId);
  if (!session) return null;

  return {
    sandboxId,
    eventBackend: getEventBackend(),
    totalEvents: session.events.length,
    returnedEvents: Math.min(limit, session.events.length),
    updatedAt: session.updatedAt,
    events: session.events.slice(-limit),
  };
}

export function createEventSink(sandboxId: string, streamName: string): EventSink {
  if (!S2_ENABLED) {
    return { kind: 'local', sandboxId, streamName };
  }
  const basin = getS2Basin();
  return { kind: 's2', sandboxId, streamName, stream: basin.stream(streamName) };
}

export async function sendSessionEventToStream(params: {
  stream: EventSink;
  sandboxId: string;
  sdkSessionId?: string;
  event: unknown;
  timestamp: string;
}) {
  const sanitizedEvent = sanitizePayload(params.event);

  await appendJsonEvent(params.stream, {
    type: 'session.event',
    sandboxId: params.sandboxId,
    sdkSessionId: params.sdkSessionId,
    event: sanitizedEvent,
    timestamp: params.timestamp,
  });
}

export async function appendJsonEvent(
  stream: EventSink,
  payload: Record<string, unknown>,
  retryCount = 0,
) {
  // Always record locally first
  if (retryCount === 0) {
    recordLocalEvent(stream.sandboxId, stream.streamName, payload);
  }

  if (stream.kind === 'local') {
    if (retryCount === 0) {
      console.log(`[${new Date().toISOString()}] LOCAL - ${payload.type} for sandbox ${stream.sandboxId}`);
    }
    return;
  }

  const maxRetries = 5;
  const retryDelay = 1000 * Math.pow(2, retryCount);

  try {
    const content = JSON.stringify(payload);
    const record = AppendRecord.make(content, {
      'content-type': 'application/json',
      'event-type': String(payload.type ?? 'event'),
    });

    if (retryCount > 0) {
      console.log(`[${new Date().toISOString()}] S2 - Retry #${retryCount} for ${payload.type}`);
    }

    await stream.stream.append(record);
    console.log(`[${new Date().toISOString()}] S2 - ${payload.type} sent${retryCount > 0 ? ` after ${retryCount} retry(s)` : ''}`);
  } catch (error: any) {
    const isNetworkError =
      error?.code === 'UND_ERR_SOCKET' ||
      error?.cause?.code === 'UND_ERR_SOCKET' ||
      error?.message?.includes('fetch failed');

    if (isNetworkError && retryCount < maxRetries) {
      console.warn(`[${new Date().toISOString()}] S2 - Network error, retry ${retryCount + 1}/${maxRetries} in ${retryDelay}ms`);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      return appendJsonEvent(stream, payload, retryCount + 1);
    }

    console.error(`[${new Date().toISOString()}] S2 - Failed to send ${payload.type}`, error);
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
