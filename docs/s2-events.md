# S2 Events Reference

All events sent by the sandbox via S2 (StreamStore).

Events are appended to a stream named `{S2_STREAM_PREFIX}:{sandboxId}` (default: `agent-session:{sandboxId}`).

The formal JSON Schema is available at [`s2-events-schema.json`](./s2-events-schema.json).

---

## Event Lifecycle

```
sandbox.init ─> sandbox.ready ─> session.event (xN) ─> sandbox.complete
                                                    ─> sandbox.cancelled
                                                    ─> sandbox.error
```

## Common Fields

Every event contains:

| Field       | Type     | Required | Description                                      |
|-------------|----------|----------|--------------------------------------------------|
| `type`      | `string` | yes      | Event type discriminator.                        |
| `sandboxId` | `string` | yes      | Outer platform/sandbox run identifier.           |
| `timestamp` | `string` | yes      | ISO-8601 timestamp (`2026-03-17T12:00:00.000Z`). |

---

## 1. `sandbox.init`

Emitted when a sandbox run starts.

| Field            | Type              | Required | Description                                    |
|------------------|-------------------|----------|------------------------------------------------|
| `type`           | `"sandbox.init"`  | yes      |                                                |
| `sandboxId`      | `string`          | yes      | Outer platform/sandbox run identifier.         |
| `workspace`      | `string`          | yes      | Absolute path to the workspace root.           |
| `promptPreview`  | `string`          | yes      | First 2000 characters of the user prompt.      |
| `metadata`       | `object \| null`  | yes      | Sanitized caller metadata, or `null`.          |
| `timestamp`      | `string`          | yes      | ISO-8601.                                      |

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

**Source:** `src/core/agent-runner.ts` lines 130-137.

---

## 2. `sandbox.ready`

Emitted once the inner SDK session ID becomes known.

| Field       | Type               | Required | Description                           |
|-------------|--------------------|----------|---------------------------------------|
| `type`      | `"sandbox.ready"`  | yes      |                                       |
| `sandboxId` | `string`           | yes      | Outer platform/sandbox run identifier.|
| `sessionId` | `string`           | yes      | Inner SDK/Codex session identifier.   |
| `timestamp` | `string`           | yes      | ISO-8601.                             |

```json
{
  "type": "sandbox.ready",
  "sandboxId": "sandbox-123",
  "sessionId": "sdk-session-123",
  "timestamp": "2026-03-17T12:00:01.000Z"
}
```

**Source:** `src/core/agent-runner.ts` lines 71-83.

---

## 3. `sandbox.complete`

Emitted when the sandbox run finishes successfully (not aborted).

| Field       | Type                  | Required | Description                                          |
|-------------|-----------------------|----------|------------------------------------------------------|
| `type`      | `"sandbox.complete"`  | yes      |                                                      |
| `sandboxId` | `string`              | yes      | Outer platform/sandbox run identifier.               |
| `sessionId` | `string`              | no       | May be undefined if session was never established.   |
| `timestamp` | `string`              | yes      | ISO-8601.                                            |

```json
{
  "type": "sandbox.complete",
  "sandboxId": "sandbox-123",
  "sessionId": "sdk-session-123",
  "timestamp": "2026-03-17T12:00:05.000Z"
}
```

**Source:** `src/core/agent-runner.ts` lines 191-196.

---

## 4. `sandbox.cancelled`

Emitted when the sandbox run is cancelled or aborted.

| Field       | Type                   | Required | Description                            |
|-------------|------------------------|----------|----------------------------------------|
| `type`      | `"sandbox.cancelled"`  | yes      |                                        |
| `sandboxId` | `string`               | yes      | Outer platform/sandbox run identifier. |
| `sessionId` | `string`               | no       | May be undefined.                      |
| `timestamp` | `string`               | yes      | ISO-8601.                              |

```json
{
  "type": "sandbox.cancelled",
  "sandboxId": "sandbox-123",
  "sessionId": "sdk-session-123",
  "timestamp": "2026-03-17T12:00:05.000Z"
}
```

**Source:** `src/core/agent-runner.ts` lines 191-196 (happy path) and 201-208 (error path with abort).

---

## 5. `sandbox.error`

Emitted when the sandbox run fails with an exception (and was **not** aborted).

| Field       | Type                | Required | Description                            |
|-------------|---------------------|----------|----------------------------------------|
| `type`      | `"sandbox.error"`   | yes      |                                        |
| `sandboxId` | `string`            | yes      | Outer platform/sandbox run identifier. |
| `sessionId` | `string`            | no       | May be undefined.                      |
| `error`     | `object`            | no       | Serialized error (see below).          |
| `timestamp` | `string`            | yes      | ISO-8601.                              |

**`error` object:**

| Field     | Type     | Required | Description         |
|-----------|----------|----------|---------------------|
| `message` | `string` | yes      | Error message.      |
| `name`    | `string` | no       | Error class name.   |
| `stack`   | `string` | no       | Stack trace string. |

```json
{
  "type": "sandbox.error",
  "sandboxId": "sandbox-123",
  "sessionId": "sdk-session-123",
  "error": {
    "message": "Something failed",
    "name": "Error",
    "stack": "Error: Something failed\n    at ..."
  },
  "timestamp": "2026-03-17T12:00:05.000Z"
}
```

**Source:** `src/core/agent-runner.ts` lines 201-208.

---

## 6. `session.event`

Wrapper for every raw event from the inner SDK session stream.

The sandbox intentionally does **not** reinterpret the inner `event` payload. It forwards it unchanged for platform-side interpretation.

| Field       | Type                | Required | Description                                         |
|-------------|---------------------|----------|-----------------------------------------------------|
| `type`      | `"session.event"`   | yes      |                                                     |
| `sandboxId` | `string`            | yes      | Outer platform/sandbox run identifier.              |
| `sessionId` | `string`            | no       | May be undefined early in the session.              |
| `event`     | `any`               | yes      | Raw SDK protocol event, passed through unchanged.   |
| `timestamp` | `string`            | yes      | ISO-8601.                                           |

The `event` field can contain:
- **Notification**: `{ method, params }` (e.g. `turn/started`, `item/completed`)
- **Server request**: `{ id, method, params }` (e.g. `item/commandExecution/requestApproval`)
- **Protocol reply**: `{ id, result }` or `{ id, error }`
- **Parse error**: `{ type: "parse_error", line, error }`

```json
{
  "type": "session.event",
  "sandboxId": "sandbox-123",
  "sessionId": "sdk-session-123",
  "event": {
    "method": "item/agentMessage/delta",
    "params": { "delta": "Hello" }
  },
  "timestamp": "2026-03-17T12:00:02.000Z"
}
```

**Source:** `src/core/event-store.ts` lines 92-108.

---

## S2 Record Headers

Each appended record includes:

| Header         | Value                            |
|----------------|----------------------------------|
| `content-type` | `application/json`               |
| `event-type`   | Value of `payload.type` (e.g. `sandbox.init`, `session.event`) |

---

## Identifiers

| ID          | Scope                          |
|-------------|--------------------------------|
| `sandboxId` | Outer platform/sandbox run     |
| `sessionId` | Inner SDK/Codex session        |

---

## Configuration

| Env Variable       | Description                          | Default           |
|--------------------|--------------------------------------|--------------------|
| `S2_ACCESS_TOKEN`  | Bearer token for S2 authentication   | (required)         |
| `S2_BASIN`         | S2 basin identifier                  | (required)         |
| `S2_STREAM_PREFIX` | Prefix for stream naming             | `agent-session`    |

S2 is enabled when both `S2_ACCESS_TOKEN` and `S2_BASIN` are set. Otherwise events are stored in-memory locally.
