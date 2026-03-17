# Testing

This template optimizes for confidence, not coverage percentage.

If the tests pass, maintainers should have strong confidence that:

- the platform contract still holds
- the sandbox still boots
- event emission still matches expectations
- the config surface still loads correctly

## Current Test Layers

### Unit Tests

Protect:

- event-store behavior
- runner event ordering
- machine-config loading and materialization

### API Contract Tests

Protect:

- `/health`
- `/agent/*`
- `/workspace/*`

These tests focus on request validation, status codes, and payload shape.

### Smoke Tests

Protect:

- server boot
- route mounting
- config validation wiring

## Confidence Targets

We care most about:

- `src/routes/*`
- `src/core/agent-runner.ts`
- `src/core/event-store.ts`
- bootstrap/runtime behavior
- HTTP contract stability
- S2 event contract stability

## What We Do Not Overfit

Because this repo is a template, we avoid over-testing:

- the exact prompt wording in `harness-config/agent.ts`
- the exact starter files in `harness-config/initial-workspace/`
- user-specific Docker customizations

The framework should be rigid where the platform depends on it, and flexible where users customize it.
