# Customize SDK Behavior

Edit these files first:

- `harness-config/agent.ts`
- `harness-config/codex-home/config.toml`

## `harness-config/agent.ts` — what you control in code

- `configProfile` — which TOML profile to activate (e.g. `"default"`, `"heavy-reasoning"`)
- `instructions` — agent system prompt
- `workspace` — directory layout baked into the Docker image

## `harness-config/codex-home/config.toml` — what the SDK reads at runtime

Model, reasoning, permissions, sandbox mode, MCP servers, and other
Codex-native settings live here as **profiles**:

```toml
[profiles.default]
model = "gpt-5.2-codex"
model_reasoning_summary = "detailed"
approval_policy = "never"
sandbox_mode = "workspace-write"

[profiles.heavy-reasoning]
model = "o3-pro"
model_reasoning_summary = "detailed"
approval_policy = "never"
sandbox_mode = "danger-full-access"
```

The `configProfile` value in `harness-config/agent.ts` selects which profile
the SDK activates at session creation time.

## What goes where

| Setting | Where | Why |
|---|---|---|
| Model, provider | TOML profile | Platform concern |
| Permissions, sandbox mode | TOML profile | Platform concern |
| Reasoning summary | TOML profile | Model config |
| MCP servers | TOML profile | Declarative tooling |
| System prompt | `agent.ts` | Code-driven, may be dynamic |
| Workspace layout | `agent.ts` | Tied to Docker image build |
| Profile selection | `agent.ts` | Picks which TOML profile |
