# Event Contract

The backend integration contract is intentionally fixed in this template.

Do not casually change:

- `src/routes/agent.ts`
- `src/routes/workspace.ts`
- `src/core/agent-runner.ts`
- `src/core/event-store.ts`

Those files define:

- HTTP endpoints expected by the app
- S2 stream naming
- event payload shapes
- local fallback event behavior

Current event types:

- `sandbox.init`
- `sandbox.ready`
- `sandbox.complete`
- `sandbox.cancelled`
- `sandbox.error`
- `session.event`

Identifier split:

- `sandboxId` = outer sandbox/platform run
- `sessionId` = inner SDK/Codex session when known

See [sandbox-event-shapes.md](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/docs/sandbox-event-shapes.md) for the current global payload shapes.
