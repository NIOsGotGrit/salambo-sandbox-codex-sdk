import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEventSink,
  getLocalEvents,
  sendSessionEventToStream,
} from '../../src/core/event-store.js';

test('sendSessionEventToStream stores raw protocol events under session.event', async () => {
  const sandboxId = 'sandbox-test-1';
  const timestamp = '2026-03-16T12:00:00.000Z';
  const rawEvent = {
    method: 'thread/started',
    params: {
      threadId: 'thread-1',
      cwd: '/workspace',
    },
  };

  await sendSessionEventToStream({
    stream: createEventSink(sandboxId, 'agent-session:sandbox-test-1'),
    sandboxId,
    sdkSessionId: 'sdk-session-1',
    event: rawEvent,
    timestamp,
  });

  const localEvents = getLocalEvents(sandboxId, 10);
  assert.ok(localEvents);
  assert.equal(localEvents.events.length, 1);

  const payload = localEvents.events[0]?.payload;
  assert.deepEqual(payload, {
    type: 'session.event',
    sandboxId,
    sdkSessionId: 'sdk-session-1',
    event: rawEvent,
    timestamp,
  });

  assert.equal(Object.hasOwn(payload, 'message'), false);
  assert.equal(Object.hasOwn(payload, 'messageType'), false);
  assert.equal(Object.hasOwn(payload, 'kind'), false);
});

test('sendSessionEventToStream preserves parse errors without reclassification', async () => {
  const sandboxId = 'sandbox-test-2';
  const timestamp = '2026-03-16T12:05:00.000Z';
  const rawEvent = {
    type: 'parse_error',
    line: 'not-json',
    error: 'Unexpected token',
  };

  await sendSessionEventToStream({
    stream: createEventSink(sandboxId, 'agent-session:sandbox-test-2'),
    sandboxId,
    event: rawEvent,
    timestamp,
  });

  const localEvents = getLocalEvents(sandboxId, 10);
  assert.ok(localEvents);
  assert.equal(localEvents.events.length, 1);

  assert.deepEqual(localEvents.events[0]?.payload, {
    type: 'session.event',
    sandboxId,
    event: rawEvent,
    timestamp,
  });
});
