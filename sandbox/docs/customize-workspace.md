# Customize Workspace

Use `sandbox/initial-workspace/` to preload files into the sandbox volume.

Most useful locations:

- `sandbox/initial-workspace/work/files/` for inputs
- `sandbox/initial-workspace/work/templates/` for starter assets
- `sandbox/initial-workspace/outputs/` for preseeded output examples

The runtime also ensures these directories exist at startup from `sandbox/config.ts`.
