# Customize SDK Behavior

Edit these files first:

- `src/template/session-policy.ts`
- `src/template/instructions.ts`
- `src/template/mcp.ts`
- `src/template/hooks.ts`
- `.codex-home/config.toml`

Use `src/template/session-policy.ts` for:

- permission mode
- sandbox mode
- MCP server registration
- hook registration
- behavior applied to the SDK session after runtime config is loaded

Use `.env` for runtime values such as:

- `CODEX_MODEL`
- `CODEX_PROVIDER`
- `SALAMBO_CODEX_PATH`

Use `.codex-home/config.toml` for Codex-native settings the SDK call does not override, such as:

- reasoning summary
- model profiles
- trust levels
