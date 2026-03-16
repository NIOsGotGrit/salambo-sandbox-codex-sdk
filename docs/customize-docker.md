# Customize Docker

The machine/runtime config lives in `harness-config/docker.ts`.

That file is the source of truth for:

- `apt` system packages
- `npm` global CLI tools
- `pip` Python dependencies
- `setup` one-off bootstrap shell steps

By default the template installs the Codex CLI plus its Linux runtime package there so the SDK has a Codex runtime available in Docker.

During Docker build, the repo materializes `docker.ts` into temporary build inputs automatically.

Edit `Dockerfile` only when you need a deeper image change than the typed machine config can express.
