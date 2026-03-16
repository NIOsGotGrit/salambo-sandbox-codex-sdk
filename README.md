# Salambo Sandbox Codex SDK

Dockerized sandbox template for `salambo-codex-agent-sdk` with the same HTTP API and S2 event streaming contract as the Claude-based template.

## Template Shape

This repo is split into two layers:

- fixed platform layer: `src/routes`, `src/core`, and `src/platform`
- customizable surface: `harness-config/`, `docs/`, `.env`, and Docker/runtime files at the root

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

- [agent.ts](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/harness-config/agent.ts)
- [docker.ts](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/harness-config/docker.ts)
- [image.config.mjs](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/harness-config/image.config.mjs)
- [.env.example](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/.env.example)
- [config.toml](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/harness-config/codex-home/config.toml)
- [initial-workspace](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/harness-config/initial-workspace)

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
  -d '{"prompt":"Say hello","sandboxId":"local-test-1"}'

curl http://localhost:3000/agent/events/local-test-1
```

If `S2_ACCESS_TOKEN` and `S2_BASIN` are not set, the server falls back to a built-in local event store for testing.

The sandbox defaults `CODEX_HOME` to [`harness-config/codex-home/config.toml`](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/harness-config/codex-home/config.toml) for local development, so project-local Codex settings are used without mutating your global `~/.codex/config.toml`. On first run it seeds `auth.json` from your user Codex home if needed, which keeps ChatGPT/Codex login-based local testing working.

In Docker, startup switches `CODEX_HOME` to `/home/node/.codex-sandbox`, copies the template `config.toml` there on first boot, and writes `auth.json` from `OPENAI_API_KEY` when present so the runtime can authenticate without writing into `/app` or the synced workspace.

Configuration split:

- `harness-config/agent.ts` is the main customization file for agent behavior, hooks, and workspace defaults
- `harness-config/codex-home/config.toml` owns Codex-native settings such as model, sandbox mode, approvals, and MCP profiles
- `harness-config/docker.ts` is the machine-config source of truth for apt, npm, pip, and bootstrap setup
- `.env` owns runtime/deploy values such as `OPENAI_API_KEY`, `PORT`, and S2 configuration
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
| `CODEX_HOME` | `./harness-config/codex-home` locally, `/home/node/.codex-sandbox` in Docker | Codex home used by the sandbox runtime |
| `GATEWAY_BASE_URL` | unset | Optional file-sync gateway |
| `S2_STREAM_PREFIX` | `agent-session` | Stream naming prefix |
| `LOCAL_EVENT_MAX_EVENTS` | `500` | Max local events retained per sandbox |
| `FILE_WATCH_STABILITY_MS` | `2000` | Chokidar stability threshold for synced files |
| `SANDBOX_FILE_LOGGING` | `true` | Enable file logging in the container/runtime |
| `SANDBOX_LOG_DIR` | `/tmp/sandbox-logs` | Directory for runtime log files |

## API Reference

The HTTP contract stays stable for the platform:

- `GET /health`
- `POST /agent/query`
- `POST /agent/interrupt`
- `GET /agent/status`
- `GET /agent/events/:sandboxId`
- `POST /workspace/files/sync`
- `POST /workspace/files/import`
- `DELETE /workspace/sandbox/:sandboxId`

Internally this sandbox uses the SDK V2 session lifecycle, but it keeps the same outward HTTP contract and emits the S2 event contract documented in [event-contract.md](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/docs/event-contract.md).

Example query:

```json
{
  "prompt": "Your task for the agent",
  "sandboxId": "sandbox-123"
}
```

## Docker

```bash
docker build --provenance=false --sbom=false -t ghcr.io/your-username/my-sandbox:v1.0.0 .
docker push ghcr.io/your-username/my-sandbox:v1.0.0
```

Customize container tooling through:

- [docker.ts](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/harness-config/docker.ts)
- [image.config.mjs](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/harness-config/image.config.mjs)
- [Dockerfile](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/Dockerfile)

Image release commands:

```bash
npm run image:print
npm run image:build
npm run image:push
npm run image:release
```

`image:release` runs `npm run typecheck`, builds the image using the current `package.json` version as the default tag, and then pushes it. Override tags with `-- --tag 1.0.3` and add `-- --latest` if you also want to tag and push `latest`.

For local inspection of the generated build inputs:

```bash
npm run harness:materialize
```

## Notes

- The runtime uses `salambo-codex-agent-sdk` and the SDK V2 `createSession()` flow.
- Binary resolution is handled by `salambo-codex-agent-sdk`; set `SALAMBO_CODEX_PATH` only if you want to override the bundled/default lookup.
