# API Endpoints

This document covers:

1. **App-server protocol** — the JSON-RPC methods the SDK uses to talk to the Codex runtime
2. **Local HTTP server** — the REST endpoints the sandbox exposes
3. **Outbound gateway** — calls made when `GATEWAY_BASE_URL` is set

---

## App-Server Protocol (SDK ↔ Codex Runtime)

The SDK does **not** call the Codex runtime over HTTP. It spawns `codex app-server` as a child process and communicates via **JSON-RPC over stdio** — newline-delimited JSON, one message per line.

### Binary Resolution

The SDK resolves the Codex binary in this order:

1. `SALAMBO_CODEX_PATH` environment variable
2. `codex` found in `PATH` (spawned as `codex app-server`)
3. `codex-app-server` found in `PATH` (spawned directly, no subcommand)

Minimum supported version: `0.114.0`.

### Requests (SDK → app server)

| Method | Params | Response | Purpose |
|--------|--------|----------|---------|
| `initialize` | `{ clientInfo, capabilities }` | `{ userAgent }` | Handshake — declares client name/version |
| `thread/start` | `{ configProfile, cwd, baseInstructions, ephemeral, experimentalRawEvents, ... }` | `{ thread, model, modelProvider, cwd, approvalPolicy, sandbox, reasoningEffort }` | Create a new conversation thread |
| `thread/resume` | `{ threadId }` | `{ thread }` | Resume an existing thread |
| `turn/start` | `{ threadId, input, outputSchema, ... }` | `{ turn }` | Send a user prompt / start a turn |
| `turn/steer` | `{ threadId, expectedTurnId, input }` | `{ turnId, status }` | Redirect the active turn mid-flight |
| `turn/interrupt` | `{ threadId, turnId }` | — | Interrupt the running turn |

### Notifications (SDK → app server)

| Method | Purpose |
|--------|---------|
| `initialized` | Sent after `initialize` succeeds |

### Requests (app server → SDK)

The app server sends these as requests (with an `id`), expecting a JSON-RPC response:

| Method | Purpose |
|--------|---------|
| `item/commandExecution/requestApproval` | Ask permission to run a shell command |
| `item/fileChange/requestApproval` | Ask permission to write/patch files |
| `item/tool/requestUserInput` | Ask the user a question (multi-choice) |
| `item/tool/call` | Dynamic tool call |
| `applyPatchApproval` | Ask permission to apply a multi-file patch |
| `execCommandApproval` | Ask permission to execute a command (legacy) |
| `account/chatgptAuthTokens/refresh` | Request refreshed auth tokens |

### Notifications (app server → SDK)

The app server streams these as notifications (no `id`, no response expected):

| Method | Description |
|--------|-------------|
| `error` | Turn-level error |
| `thread/started` | Thread was created |
| `thread/archived` | Thread was archived |
| `thread/unarchived` | Thread was unarchived |
| `thread/name/updated` | Thread name changed |
| `thread/tokenUsage/updated` | Token usage update |
| `thread/compacted` | Context was compacted |
| `turn/started` | Turn started |
| `turn/completed` | Turn finished |
| `turn/diff/updated` | Aggregated diff updated |
| `turn/plan/updated` | Plan steps updated |
| `item/started` | Turn item started |
| `item/completed` | Turn item completed |
| `item/agentMessage/delta` | Streaming agent message chunk |
| `item/plan/delta` | Streaming plan delta |
| `item/commandExecution/outputDelta` | Command stdout/stderr chunk |
| `item/commandExecution/terminalInteraction` | Terminal stdin interaction |
| `item/fileChange/outputDelta` | File change output chunk |
| `item/mcpToolCall/progress` | MCP tool call progress |
| `item/reasoning/summaryTextDelta` | Reasoning summary delta |
| `item/reasoning/summaryPartAdded` | New reasoning summary section |
| `item/reasoning/textDelta` | Raw reasoning delta |
| `rawResponseItem/completed` | Raw Responses API item (experimental) |
| `mcpServer/oauthLogin/completed` | MCP OAuth login result |
| `account/updated` | Auth mode changed |
| `account/rateLimits/updated` | Rate limit snapshot |
| `account/login/completed` | Login completed |
| `app/list/updated` | App list changed |
| `model/rerouted` | Model was rerouted |
| `deprecationNotice` | Deprecation warning |
| `configWarning` | Config issue |
| `fuzzyFileSearch/sessionUpdated` | File search results |
| `fuzzyFileSearch/sessionCompleted` | File search done |
| `sessionConfigured` | Session config snapshot |

### Wire Format

Each message is a single JSON object terminated by `\n`:

```
→ stdin:  {"method":"initialize","id":1,"params":{"clientInfo":{"name":"salambo","title":"Salambo Agent SDK","version":"0.1.0"},"capabilities":{"experimentalApi":false}}}
← stdout: {"id":1,"result":{"userAgent":"codex/0.114.0"}}
→ stdin:  {"method":"initialized","params":{}}
→ stdin:  {"method":"thread/start","id":2,"params":{"configProfile":"default","cwd":"/workspace"}}
← stdout: {"id":2,"result":{"thread":{"id":"..."},...}}
→ stdin:  {"method":"turn/start","id":3,"params":{"threadId":"...","input":[{"type":"text","text":"Hello"}]}}
← stdout: {"id":3,"result":{"turn":{"id":"...","status":"inProgress"}}}
← stdout: {"method":"item/agentMessage/delta","params":{"threadId":"...","turnId":"...","itemId":"...","delta":"Hi"}}
← stdout: {"method":"turn/completed","params":{"threadId":"...","turn":{...}}}
```

---

## Local HTTP Server

Base URL: `http://localhost:{PORT}` (default `PORT` = `3000`).

---

## Local Server Endpoints

### `GET /health`

Health check.

**Response** `200`

```json
{
  "status": "healthy",
  "workspace": "/workspace",
  "configProfile": "default",
  "eventBackend": "local",
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

---

### `POST /agent/query`

Submit a prompt to the agent. Returns immediately with `202`; the agent runs in the background.

**Headers**

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | No | Passed through as `agentToken` for gateway file-sync calls |

**Request body**

```json
{
  "prompt": "Your task for the agent",
  "sandboxId": "sandbox-123",
  "sessionId": "optional-session-id-to-resume",
  "systemPrompt": "optional system prompt override",
  "metadata": {}
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | `string` | Yes | The task/instruction for the agent |
| `sandboxId` | `string` | Yes | Unique identifier for this sandbox run |
| `sessionId` | `string` | No | Pass a previous session ID to resume it |
| `systemPrompt` | `string` | No | Override the default system prompt |
| `metadata` | `object` | No | Arbitrary metadata forwarded to the agent runner |

**Response** `202 Accepted`

```json
{
  "sandboxId": "sandbox-123",
  "status": "accepted"
}
```

`status` is one of:

| Value | Meaning |
|-------|---------|
| `accepted` | New session started |
| `resuming` | Existing session resumed (when `sessionId` was provided) |
| `queued` | Another sandbox is active; this request is queued (includes `position`) |

**Errors**

| Code | Body |
|------|------|
| `400` | `{ "error": "prompt is required and must be a string" }` |
| `400` | `{ "error": "sandboxId is required and must be a string" }` |

---

### `POST /agent/interrupt`

Abort a running sandbox.

**Request body**

```json
{
  "sandboxId": "sandbox-123"
}
```

**Response** `200`

```json
{
  "success": true,
  "sandboxId": "sandbox-123"
}
```

**Errors**

| Code | Body |
|------|------|
| `400` | `{ "error": "sandboxId is required" }` |
| `404` | `{ "error": "Sandbox not found or already completed" }` |

---

### `GET /agent/status`

Current agent and queue status.

**Response** `200`

```json
{
  "hasActiveSandbox": true,
  "sandbox": {
    "sandboxId": "sandbox-123",
    "streamName": "agent-session-sandbox-123",
    "workspace": "/workspace"
  },
  "queueLength": 0,
  "configProfile": "default",
  "eventBackend": "local",
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

`sandbox` is `null` when no sandbox is active.

---

### `GET /agent/events/:sandboxId`

Retrieve events for a sandbox run.

**Path parameters**

| Param | Description |
|-------|-------------|
| `sandboxId` | The sandbox to fetch events for |

**Query parameters**

| Param | Default | Max | Description |
|-------|---------|-----|-------------|
| `limit` | `200` | `1000` | Number of events to return |

**Response** `200`

```json
{
  "sandboxId": "sandbox-123",
  "eventBackend": "local",
  "totalEvents": 42,
  "returnedEvents": 42,
  "updatedAt": "2025-01-01T00:00:00.000Z",
  "events": []
}
```

**Errors**

| Code | Body |
|------|------|
| `400` | `{ "error": "sandboxId parameter is required" }` |
| `404` | `{ "error": "No events found for sandbox" }` |

---

### `POST /workspace/files/sync`

Upload files to the workspace using base64 content.

**Headers**

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes | Any non-empty string (used for auth gating) |

**Request body**

```json
{
  "files": [
    {
      "targetPath": "work/hello.txt",
      "contentBase64": "SGVsbG8gd29ybGQ="
    }
  ]
}
```

| Constraint | Value |
|------------|-------|
| Max files per request | 20 |
| Max file size | 100 MB |

**Response** `200`

```json
{
  "success": true,
  "saved": ["/workspace/work/hello.txt"]
}
```

**Errors**

| Code | Body |
|------|------|
| `401` | `{ "error": "Unauthorized" }` |
| `400` | `{ "error": "files[] is required" }` |
| `400` | `{ "error": "Max 20 files per request" }` |
| `400` | `{ "error": "Each file needs targetPath and contentBase64" }` |
| `413` | `{ "error": "File exceeds 100MB limit" }` |

---

### `POST /workspace/files/import`

Import files into the workspace from HTTPS URLs.

**Headers**

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes | Any non-empty string (used for auth gating) |

**Request body**

```json
{
  "files": [
    {
      "targetPath": "work/data.csv",
      "sourceUrl": "https://example.com/data.csv"
    }
  ]
}
```

| Constraint | Value |
|------------|-------|
| Max files per request | 20 |
| Max file size | 100 MB |
| `sourceUrl` protocol | Must be `https://` |

**Response** `200`

```json
{
  "success": true,
  "saved": ["/workspace/work/data.csv"]
}
```

**Errors**

| Code | Body |
|------|------|
| `401` | `{ "error": "Unauthorized" }` |
| `400` | `{ "error": "files[] is required" }` |
| `400` | `{ "error": "Max 20 files per request" }` |
| `400` | `{ "error": "Each file needs targetPath and sourceUrl" }` |
| `400` | `{ "error": "sourceUrl must use https" }` |

---

### `DELETE /workspace/sandbox/:sandboxId`

Abort a running sandbox (if active) and stop the file watcher.

**Path parameters**

| Param | Description |
|-------|-------------|
| `sandboxId` | The sandbox to tear down |

**Response** `200`

```json
{
  "success": true,
  "sandboxId": "sandbox-123"
}
```

**Errors**

| Code | Body |
|------|------|
| `400` | `{ "error": "sandboxId parameter is required" }` |
| `500` | `{ "error": "Failed to cleanup sandbox" }` |

---

## Outbound Gateway Endpoints

These calls are made **by the SDK** to the remote gateway when the `GATEWAY_BASE_URL` environment variable is set. They sync workspace file changes back to the platform.

### `POST {GATEWAY_BASE_URL}/api/daytona/files`

Upload or update a file.

**Headers**

| Header | Value |
|--------|-------|
| `Authorization` | The `agentToken` from the active sandbox |

**Body** — `multipart/form-data`

| Field | Type | Description |
|-------|------|-------------|
| `displayPath` | `string` | Relative path of the file (e.g. `/output.txt`) |
| `event` | `string` | `"add"` or `"change"` |
| `file` | `Blob` | File contents |

---

### `DELETE {GATEWAY_BASE_URL}/api/daytona/files`

Notify the gateway that a file was deleted.

**Headers**

| Header | Value |
|--------|-------|
| `Authorization` | The `agentToken` from the active sandbox |
| `Content-Type` | `application/json` |

**Body**

```json
{
  "displayPath": "/deleted-file.txt"
}
```
