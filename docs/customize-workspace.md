# Customize Workspace

Use `harness-config/initial-workspace/` to preload files into the sandbox volume.

Most useful locations:

- `harness-config/initial-workspace/work/files/` for inputs
- `harness-config/initial-workspace/work/templates/` for starter assets
- `harness-config/initial-workspace/outputs/` for preseeded output examples

The runtime also ensures these directories exist at startup from `harness-config/agent.ts`.
