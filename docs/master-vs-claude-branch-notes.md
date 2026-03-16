# Master vs Claude Branch Notes

This note captures the current differences between `master` and the Claude exploration branch so we can clean it up intentionally.

## What `master` does today

- Uses `sandbox/config.ts` as the main TypeScript customization file.
- Splits config across:
  - `sandbox/config.ts`
  - `.env`
  - `sandbox/codex-home/config.toml`
- Passes a larger set of options into `createSession()`:
  - model
  - provider
  - codexPath
  - permission mode
  - sandbox mode
  - system prompt
  - hooks
  - MCP servers
- Uses `session` naming throughout the HTTP API and event stream.
- Rejects a second `/agent/query` request with `409` while one session is running.

## What the Claude branch changes

## Good changes to keep and refine

- Renames `sandbox/config.ts` to `sandbox/agent.ts`.
- Shrinks the TypeScript config surface to a smaller agent-focused shape:
  - `configProfile`
  - `instructions`
  - `workspace`
  - `hooks`
- Moves more runtime/session config into TOML profiles in `sandbox/codex-home/config.toml`.
- Simplifies the `createSession()` call so the sandbox mainly passes:
  - `configProfile`
  - `cwd`
  - `systemPrompt`
  - `hooks`
- Adds validation around the sandbox config shape.
- Makes the template feel more TOML-first and closer to the new SDK direction.

## Bad-for-now changes to unwind

### 1. `session` -> `task` rename

This branch renames the external contract from `session` to `task`.

Examples:

- `sessionId` becomes `taskId`
- `session_init` becomes `task_init`
- `session_ready` becomes `task_ready`
- `GET /agent/events/:sessionId` becomes `GET /agent/events/:taskId`
- internal state moves from `getActiveSession()` to `getActiveTask()`

Why this is bad-for-now:

- It changes the public API and event contract.
- We already know `task` is not the final naming we want.
- It creates churn without solving the naming problem cleanly.

The better direction for the outer identifier is `sandbox`, while the inner SDK id stays `session`.

### 2. Queueing

This branch changes runtime behavior when a second request arrives during an active run.

On `master`:

- one active session at a time
- a second request gets `409`

On the Claude branch:

- a second request gets `202`
- the request is queued
- it runs automatically when the current one finishes

Why this is bad-for-now:

- It changes runtime semantics, not just naming.
- Queueing has product implications:
  - ordering
  - cancellation
  - status handling
  - user expectations
- It is unrelated to the SDK config simplification.

### 3. External contract churn

The branch mixes config cleanup with public contract changes.

That means downstream consumers would need to update:

- request payload fields
- event names
- event lookup routes
- status semantics
- conflict vs queue behavior

Why this is bad-for-now:

- It makes the refactor larger than needed.
- It hides product/API decisions inside what should be a config/SDK alignment pass.

## Recommended cleanup direction

For the next pass, keep:

- `harness-config/agent.ts`
- TOML profiles in `harness-config/codex-home/config.toml`
- the slimmer `createSession()` input surface
- config validation

For the next pass, remove or revert:

- `task` naming in favor of `sandbox`
- queueing
- public route and event churn unrelated to config simplification

## Working principle

Do the config/TOML alignment first.

Do the event-contract and naming redesign later, in a dedicated pass, once the new SDK event model is ready.
