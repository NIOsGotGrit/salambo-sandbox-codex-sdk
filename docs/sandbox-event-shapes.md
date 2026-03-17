# Sandbox Event Shapes

This file describes the global event shapes emitted by the sandbox.

It intentionally does **not** document the inner SDK payload schema in detail.
`session.event.event` is passed through as-is so the sandbox can stay neutral.

## Event Families

The sandbox emits two families of events:

- `sandbox.*`
- `session.event`

## `sandbox.init`

Emitted when a sandbox run starts.

```json
{
  "type": "sandbox.init",
  "sandboxId": "sandbox-123",
  "workspace": "/workspace",
  "promptPreview": "User prompt preview",
  "metadata": {},
  "timestamp": "2026-03-17T12:00:00.000Z"
}
```

## `sandbox.ready`

Emitted once the inner SDK session is known.

```json
{
  "type": "sandbox.ready",
  "sandboxId": "sandbox-123",
  "sessionId": "sdk-session-123",
  "timestamp": "2026-03-17T12:00:01.000Z"
}
```

## `sandbox.complete`

Emitted when the sandbox run finishes successfully.

```json
{
  "type": "sandbox.complete",
  "sandboxId": "sandbox-123",
  "sessionId": "sdk-session-123",
  "timestamp": "2026-03-17T12:00:05.000Z"
}
```

## `sandbox.cancelled`

Emitted when the sandbox run is cancelled or aborted.

```json
{
  "type": "sandbox.cancelled",
  "sandboxId": "sandbox-123",
  "sessionId": "sdk-session-123",
  "timestamp": "2026-03-17T12:00:05.000Z"
}
```

## `sandbox.error`

Emitted when the sandbox run fails.

```json
{
  "type": "sandbox.error",
  "sandboxId": "sandbox-123",
  "sessionId": "sdk-session-123",
  "error": {
    "message": "Something failed",
    "name": "Error",
    "stack": "..."
  },
  "timestamp": "2026-03-17T12:00:05.000Z"
}
```

## `session.event`

Emitted for every raw event coming from the inner SDK session stream.

The sandbox does not reinterpret this payload. It forwards it under the `event`
key so downstream systems can decide how to project it.

```json
{
  "type": "session.event",
  "sandboxId": "sandbox-123",
  "sessionId": "sdk-session-123",
  "event": {},
  "timestamp": "2026-03-17T12:00:02.000Z"
}
```

## Notes

- `sandboxId` is the outer platform/sandbox identifier.
- `sessionId` is the inner SDK/Codex session identifier when known.
- `session.event.event` is intentionally opaque at the sandbox contract level.
- These events are suitable as an internal transport contract.
- Client-facing projections should be derived from these events rather than exposing them blindly.
