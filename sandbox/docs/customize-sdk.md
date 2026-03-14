# Customize SDK Behavior

Edit these files first:

- `sandbox/config.ts`
- `.env`
- `sandbox/codex-home/config.toml`

Use `sandbox/config.ts` for:

- agent instructions
- permission mode
- sandbox mode
- MCP server registration
- hook registration
- workspace directory defaults

Use `.env` for runtime values such as:

- `CODEX_MODEL`
- `CODEX_PROVIDER`
- `SALAMBO_CODEX_PATH`

Use `sandbox/codex-home/config.toml` for Codex-native settings the SDK call does not override, such as:

- reasoning summary
- model profiles
- trust levels
