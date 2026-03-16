# Backlog

## Test Suite Hardening For The Template

This template needs a much stronger test suite to protect platform compatibility and future SDK refactors.

Current coverage is helpful but not sufficient for a platform-facing template.

### Why this matters

- the value of the template is contract stability, not just successful typechecking
- the platform depends on the HTTP and S2 event shapes staying predictable
- SDK changes can silently break the integration if we only rely on `typecheck`
- Docker/bootstrap/auth behavior also needs regression protection

### What we should add

#### 1. API contract tests

Cover the sandbox HTTP API with strict assertions for:

- `POST /agent/query`
- `POST /agent/interrupt`
- `GET /agent/status`
- `GET /agent/events/:sandboxId`
- workspace routes under `/workspace/*`

These tests should verify:

- request validation
- response payload shape
- expected status codes
- queueing behavior while it still exists

#### 2. S2 / event contract tests

Add strict contract tests for emitted events:

- `sandbox.init`
- `sandbox.ready`
- `sandbox.complete`
- `sandbox.cancelled`
- `sandbox.error`
- `session.event`

Use exact payload assertions or golden JSON fixtures so event regressions are obvious.

#### 3. Runner integration tests

Mock the SDK session stream and verify:

- event ordering
- `sdkSessionId` capture behavior
- resume behavior
- error behavior
- cancellation behavior
- raw `session.event` passthrough

#### 4. Platform compatibility fixtures

Add fixtures representing what the platform consumes from S2.

Goal:

- validate that the template output is compatible with downstream SSE/logging/projection expectations
- catch contract drift before release

#### 5. Docker / boot smoke tests

Add a lightweight smoke path to verify:

- container starts
- `/health` responds
- auth/bootstrap path works
- project-local Codex home setup works

### Suggested structure

Build the test suite in three layers:

1. unit tests
- event store
- runner helpers
- config validation

2. API contract tests
- Express route behavior
- local event store behavior

3. integration tests
- mocked SDK stream
- sandbox boot and end-to-end event emission

### Working principle

For this template, tests should optimize for:

- contract safety
- deterministic fixtures
- easy refactoring confidence

This repo should feel trustworthy as a template, not just functional.
