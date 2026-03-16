# Architecture

This repo is split into three layers.

## 1. Platform Code

Located in:

- `src/routes/`
- `src/core/`
- `src/platform/`

This is the framework layer. It owns:

- HTTP endpoints
- sandbox lifecycle orchestration
- SDK session startup and streaming
- local/S2 event emission
- workspace setup and sync plumbing

This layer should stay stable.

## 2. Harness Configuration

Located in:

- `harness-config/agent.ts`
- `harness-config/docker.ts`
- `harness-config/codex-home/config.toml`
- `harness-config/initial-workspace/`
- `harness-config/image.config.mjs`

This is the template customization surface.

Use it to control:

- agent instructions and hooks
- Codex-native profiles
- machine/runtime packages and setup
- initial filesystem contents
- image publishing defaults

## 3. Human Docs

Located in:

- `docs/`

This layer explains:

- architecture
- event contract
- testing expectations
- release flow
- customization entrypoints

## Runtime Flow

1. The HTTP API receives a sandbox request.
2. The platform layer prepares the workspace and event sink.
3. The SDK session starts using `harness-config/agent.ts` and `harness-config/codex-home/config.toml`.
4. The sandbox emits:
   - `sandbox.*` lifecycle events
   - raw `session.event` payloads
5. The platform consumes those events downstream for logging, SSE, and projections.

## Invariants

These should not change lightly:

- route shapes under `src/routes/`
- `sandbox.*` lifecycle events
- `session.event` transport shape
- `/workspace/work` and `/workspace/outputs` semantics
- bootstrap/auth behavior in Docker
