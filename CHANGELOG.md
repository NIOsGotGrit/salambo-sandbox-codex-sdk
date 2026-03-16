# Changelog

All notable changes to this template should be documented here.

The format is intentionally lightweight and human-readable.

## Unreleased

### Changed

- Unified the template configuration surface under `harness-config/`.
- Moved human documentation to `docs/`.
- Made `harness-config/docker.ts` the machine-config source of truth.
- Added contract-oriented tests for API, runner, event, and machine-config behavior.

## 2.0.0

### Changed

- Migrated the sandbox runtime to the current `salambo-codex-agent-sdk` session flow.
