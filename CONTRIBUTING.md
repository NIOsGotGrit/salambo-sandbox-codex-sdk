# Contributing

Thanks for contributing to this template.

## Working Principles

- Protect platform compatibility first.
- Optimize for confidence, not raw coverage.
- Keep the customizable surface easy to understand.
- Avoid changing the HTTP and S2 contracts casually.

## Before Opening a PR

Run:

```bash
npm run typecheck
npm test
npm run harness:materialize
```

If your change touches Docker or runtime bootstrap, also build the image locally when practical:

```bash
docker build .
```

## What We Protect Strictly

- `src/routes/*`
- `src/core/agent-runner.ts`
- `src/core/event-store.ts`
- bootstrap/runtime behavior
- HTTP contract
- S2 event contract

See [docs/testing.md](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/docs/testing.md) and [docs/event-contract.md](/C:/Users/nicol/WebstormProjects/salambo-sandbox/salambo-sandbox-codex-sdk/docs/event-contract.md).

## What Should Stay Flexible

- `harness-config/agent.ts`
- `harness-config/docker.ts`
- `harness-config/codex-home/config.toml`
- `harness-config/initial-workspace/`

This is a template, so the framework should be stable while the configuration surface stays easy to customize.

## PR Expectations

- Keep changes scoped.
- Add or update tests when changing contract-sensitive behavior.
- Update docs when a user-facing setup or invariant changes.
- Call out breaking changes explicitly.
