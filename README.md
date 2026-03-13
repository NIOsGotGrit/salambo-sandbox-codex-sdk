# Salambo Sandbox Codex SDK

Dockerized sandbox template for `salambo-codex-agent-sdk` with the same HTTP API and S2 event streaming contract as the Claude-based template.

## What Changed

- The runtime uses `salambo-codex-agent-sdk` instead of `@anthropic-ai/claude-agent-sdk`.
- The runtime now uses the SDK V2 `createSession()` flow internally.
- The sandbox runs on Node.js 20+, not Bun.
- Environment variables now default to Codex/OpenAI-style settings:
  - `CODEX_MODEL`
  - `CODEX_PROVIDER`
  - `SALAMBO_CODEX_PATH`
  - `OPENAI_API_KEY`

## What Must Stay

| Required | Why |
|----------|-----|
| `/workspace/outputs/` | Files here sync back to the app |
| `/workspace/work/` | Agent working directory |
| API endpoints | The app expects these routes |
| S2 event streaming | Real-time updates to the app |

## Local Development

```bash
cp .env.example .env
npm install
npm run dev
```

Health check:

```bash
curl http://localhost:3000/health
```

Local no-S2 testing:

```bash
curl -X POST http://localhost:3000/agent/query \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Say hello","ourSessionId":"local-test-1"}'

curl http://localhost:3000/agent/events/local-test-1
```

If `S2_ACCESS_TOKEN` and `S2_BASIN` are not set, the server now falls back to a built-in local event store for testing.

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| None for the event backend in local mode | The server can run without S2 for local testing |

### Usually Required

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | API key for the default `openai` provider |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `WORKSPACE_DIR` | `/workspace` | Workspace directory |
| `CODEX_MODEL` | `gpt-5.2-codex` | Codex model to use |
| `CODEX_PROVIDER` | `openai` | Provider passed to the SDK |
| `SALAMBO_CODEX_PATH` | unset | Explicit path to `codex` or `codex-app-server` |
| `OPENAI_BASE_URL` | unset | Optional provider-specific base URL |
| `GATEWAY_BASE_URL` | unset | Optional file-sync gateway |
| `S2_STREAM_PREFIX` | `agent-session` | Stream naming prefix |
| `LOCAL_EVENT_MAX_EVENTS` | `500` | Max local events retained per session |

## API Reference

The HTTP contract stays the same as the template:

- `GET /health`
- `POST /agent/query`
- `POST /agent/interrupt`
- `GET /agent/status`
- `GET /agent/events/:sessionId`
- `POST /workspace/files/sync`
- `POST /workspace/files/import`
- `DELETE /workspace/session/:sessionId`

Internally this sandbox uses the SDK V2 session lifecycle, but it keeps the same outward HTTP and S2 event contract for compatibility with the existing app flow.

Example query:

```json
{
  "prompt": "Your task for the agent",
  "ourSessionId": "thread-123"
}
```

## Docker

```bash
docker build --provenance=false --sbom=false -t ghcr.io/YOUR_USERNAME/my-sandbox:v1.2.0 .
docker push ghcr.io/YOUR_USERNAME/my-sandbox:v1.2.0
```

## Notes

- The SDK keeps V1-compatible `query()` streaming, so the server can preserve the existing S2 message flow.
- Binary resolution is handled by `salambo-codex-agent-sdk`; set `SALAMBO_CODEX_PATH` only if you want to override the bundled/default lookup.
