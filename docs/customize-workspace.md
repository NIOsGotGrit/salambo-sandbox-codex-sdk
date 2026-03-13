# Customize Workspace

Use `initial-workspace/` to preload files into the sandbox volume.

Most useful locations:

- `initial-workspace/work/files/` for inputs
- `initial-workspace/work/templates/` for starter assets
- `initial-workspace/outputs/` for preseeded output examples

The runtime also ensures these directories exist at startup from `src/template/workspace-seed.ts`.
