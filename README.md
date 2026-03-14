# Salambo Sandbox Codex SDK

Dockerized sandbox template for `salambo-codex-agent-sdk` with the same HTTP API and S2 event streaming contract as the Claude-based template.

## Template Shape

This repo is split into two layers:

- fixed platform layer: `src/routes`, `src/core`, and `src/platform`
- customizable surface: `sandbox/`, `.env`, and Docker/runtime files at the root

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

See [event-contract.md](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/sandbox/docs/event-contract.md) for the fixed event surface.

## Customize First

Edit these first when turning the template into your own sandbox:

- [config.ts](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/sandbox/config.ts)
- [image.config.mjs](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/sandbox/image.config.mjs)
- [.env.example](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/.env.example)
- [config.toml](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/sandbox/codex-home/config.toml)
- [initial-workspace](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/sandbox/initial-workspace)
- [docker](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/sandbox/docker)

Guides:

- [customize-sdk.md](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/sandbox/docs/customize-sdk.md)
- [customize-workspace.md](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/sandbox/docs/customize-workspace.md)
- [customize-docker.md](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/sandbox/docs/customize-docker.md)

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

The sandbox defaults `CODEX_HOME` to [`sandbox/codex-home/config.toml`](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/sandbox/codex-home/config.toml) for local development, so project-local Codex settings are used without mutating your global `~/.codex/config.toml`. On first run it seeds `auth.json` from your user Codex home if needed, which keeps ChatGPT/Codex login-based local testing working.

In Docker, startup switches `CODEX_HOME` to `/home/node/.codex-sandbox`, copies the template `config.toml` there on first boot, and writes `auth.json` from `OPENAI_API_KEY` when present so the runtime can authenticate without writing into `/app` or the synced workspace.

Configuration split:

- `sandbox/config.ts` is the main customization file for agent behavior, hooks, MCP, and workspace defaults
- `.env` owns runtime values like `CODEX_MODEL`, `CODEX_PROVIDER`, and `SALAMBO_CODEX_PATH`
- `sandbox/codex-home/config.toml` owns Codex-native settings such as reasoning configuration
- `src/platform/*` is internal platform plumbing and should rarely need edits

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
| `CODEX_HOME` | `./sandbox/codex-home` locally, `/home/node/.codex-sandbox` in Docker | Codex home used by the sandbox runtime |
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
docker build --provenance=false --sbom=false -t ghcr.io/your-username/my-sandbox:v1.0.0 .
docker push ghcr.io/your-username/my-sandbox:v1.0.0
```

Customize container tooling through:

- [apt-packages.txt](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/sandbox/docker/apt-packages.txt)
- [npm-tools.txt](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/sandbox/docker/npm-tools.txt)
- [bootstrap.sh](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/sandbox/docker/bootstrap.sh)
- [image.config.mjs](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/sandbox/image.config.mjs)
- [Dockerfile](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/Dockerfile)

Image release commands:

```bash
npm run image:print
npm run image:build
npm run image:push
npm run image:release
```

`image:release` runs `npm run typecheck`, builds the image using the current `package.json` version as the default tag, and then pushes it. Override tags with `-- --tag 1.0.3` and add `-- --latest` if you also want to tag and push `latest`.

## Notes

- The runtime uses `salambo-codex-agent-sdk` and the SDK V2 `createSession()` flow.
- Binary resolution is handled by `salambo-codex-agent-sdk`; set `SALAMBO_CODEX_PATH` only if you want to override the bundled/default lookup.
