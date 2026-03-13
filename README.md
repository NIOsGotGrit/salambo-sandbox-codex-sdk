# Salambo Sandbox Codex SDK

Dockerized sandbox template for `salambo-codex-agent-sdk` with the same HTTP API and S2 event streaming contract as the Claude-based template.

## Template Shape

This repo is split into two layers:

- fixed platform layer: `src/routes` and `src/core`
- customizable template layer: `src/template`, `.codex-home`, `initial-workspace`, and `docker`

The goal is to make the AI-engineer customization points obvious without changing the backend contract.

## Do Not Change Lightly

| Required | Why |
|----------|-----|
| `/workspace/outputs/` | Files here sync back to the app |
| `/workspace/work/` | Agent working directory |
| `src/routes/agent.ts` | The app expects these routes |
| `src/routes/workspace.ts` | The app expects these routes |
| `src/core/agent-runner.ts` | Session lifecycle maps directly to backend events |
| `src/core/event-store.ts` | S2 and local event payloads must remain compatible |

See [event-contract.md](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/docs/event-contract.md) for the fixed event surface.

## Customize First

Edit these first when turning the template into your own sandbox:

- [session-policy.ts](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/src/template/session-policy.ts)
- [instructions.ts](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/src/template/instructions.ts)
- [mcp.ts](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/src/template/mcp.ts)
- [hooks.ts](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/src/template/hooks.ts)
- [config.toml](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/.codex-home/config.toml)
- [initial-workspace](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/initial-workspace)
- [docker](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/docker)

Guides:

- [customize-sdk.md](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/docs/customize-sdk.md)
- [customize-workspace.md](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/docs/customize-workspace.md)
- [customize-docker.md](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/docs/customize-docker.md)

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

The sandbox also defaults `CODEX_HOME` to [`.codex-home/config.toml`](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/.codex-home/config.toml), so project-local Codex settings are used without mutating your global `~/.codex/config.toml`. On first run it seeds `auth.json` from your user Codex home if needed, which keeps ChatGPT/Codex login-based local testing working.

Configuration split:

- `.env` owns runtime values like `CODEX_MODEL`, `CODEX_PROVIDER`, and `SALAMBO_CODEX_PATH`
- `.codex-home/config.toml` owns Codex-native settings such as reasoning configuration
- `src/template/session-policy.ts` owns session behavior like sandbox mode, permission mode, MCP attachment, and hook attachment

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
| `CODEX_HOME` | `./.codex-home` | Codex home used by the sandbox runtime |
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

Customize container tooling through:

- [apt-packages.txt](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/docker/apt-packages.txt)
- [npm-tools.txt](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/docker/npm-tools.txt)
- [bootstrap.sh](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/docker/bootstrap.sh)
- [Dockerfile](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/Dockerfile)

## Notes

- The runtime uses `salambo-codex-agent-sdk` and the SDK V2 `createSession()` flow.
- Binary resolution is handled by `salambo-codex-agent-sdk`; set `SALAMBO_CODEX_PATH` only if you want to override the bundled/default lookup.
