# SDK Stream Taxonomy

This note documents the event model we discussed for the raw `salambo-codex-agent-sdk` stream and what it means for the sandbox and S2.

## Summary

The SDK is no longer just emitting Claude-style adapted messages.

It now exposes the raw app-server protocol stream:

- notifications as raw objects: `{ method, params }`
- server-initiated requests as raw objects: `{ id, method, params }`
- protocol replies as raw objects: `{ id, result }` or `{ id, error }`
- local parse failures as raw objects: `{ type: "parse_error", line, error }`

Unknown/custom inbound methods also pass through untouched.

That means the SDK stream is now best understood as a protocol stream, not a message-only stream.

For the sandbox/S2 contract, the preferred maintenance-friendly shape is:

- outer sandbox lifecycle events under `sandbox.*`
- one inner raw stream lane under `session.event`

The sandbox should preserve the raw SDK event and avoid adding extra transport taxonomy into the contract.

## Important Distinction

There are two different meanings of "response":

1. Protocol RPC reply
- shape: `{ id, result }` or `{ id, error }`
- this is a reply to an SDK/client request
- this is not model output

2. Model response item
- comes through the notification stream
- specifically under `rawResponseItem/completed`
- actual model item is in `params.item`

Because of that, avoid using the word `response` alone when talking about the raw transport.

## Raw SDK Shapes

At the raw SDK stream level, there are four protocol shapes:

- notifications: `{ method, params }`
- server requests: `{ id, method, params }`
- protocol replies: `{ id, result }` or `{ id, error }`
- parse failures: `{ type: "parse_error", line, error }`

These distinctions are useful for understanding the transport, but we do not want to encode them into the sandbox S2 contract.

So this doc distinguishes between:

- what the SDK raw stream can contain
- what the sandbox should actually emit to S2

## Notifications

Standard notification methods currently covered by the generated protocol include:

- `error`
- `thread/started`
- `thread/archived`
- `thread/unarchived`
- `thread/name/updated`
- `thread/tokenUsage/updated`
- `turn/started`
- `turn/completed`
- `turn/diff/updated`
- `turn/plan/updated`
- `item/started`
- `item/completed`
- `rawResponseItem/completed`
- `item/agentMessage/delta`
- `item/plan/delta`
- `item/commandExecution/outputDelta`
- `item/commandExecution/terminalInteraction`
- `item/fileChange/outputDelta`
- `item/mcpToolCall/progress`
- `mcpServer/oauthLogin/completed`
- `account/updated`
- `account/rateLimits/updated`
- `app/list/updated`
- `item/reasoning/summaryTextDelta`
- `item/reasoning/summaryPartAdded`
- `item/reasoning/textDelta`
- `thread/compacted`
- `model/rerouted`
- `deprecationNotice`
- `configWarning`
- `fuzzyFileSearch/sessionUpdated`
- `fuzzyFileSearch/sessionCompleted`
- `windows/worldWritableWarning`
- `account/login/completed`
- `authStatusChange`
- `loginChatGptComplete`
- `sessionConfigured`

Unknown/custom notifications also pass through as long as they arrive in raw `{ method, params }` form.

## Requests

Standard server-initiated request methods currently covered:

- `item/commandExecution/requestApproval`
- `item/fileChange/requestApproval`
- `item/tool/requestUserInput`
- `item/tool/call`
- `account/chatgptAuthTokens/refresh`
- `applyPatchApproval`
- `execCommandApproval`

These come through as raw `{ id, method, params }` objects.

## RPC Results

Protocol replies are not method-based in the same way notifications and requests are.

They come through as:

- `{ id, result }`
- `{ id, error }`

These are protocol replies, not model outputs.

## Parse Errors

Local parse failures from stdout come through as:

- `{ type: "parse_error", line, error }`

These are SDK/client-side transport problems, not app-server notifications.

## Model-Only Path

If we only care about actual model output, the important notification is:

- `rawResponseItem/completed`

The model item lives at:

- `msg.params.item`

So:

- full SDK stream = all protocol traffic
- model-only stream = only `rawResponseItem/completed.params.item`

## What The Sandbox Owns

Even with raw SDK events, the sandbox still owns its outer lifecycle.

Current sandbox lifecycle events are:

- `sandbox.init`
- `sandbox.ready`
- `sandbox.complete`
- `sandbox.cancelled`
- `sandbox.error`

Conceptually these are sandbox lifecycle events, not Codex thread events.

The ID split is:

- `sandboxId` = sandbox/app run
- `sdkSessionId` = underlying Codex thread/session

This is closer to the right long-term direction than the earlier `task` naming, because it clearly separates:

- outer sandbox-owned identity
- inner SDK/Codex session identity

## Naming Guidance

If we evolve the S2 contract, the cleaner long-term naming is:

- `sandbox.init`
- `sandbox.ready`
- `sandbox.complete`
- `sandbox.cancelled`
- `sandbox.error`
- `session.event`

The sandbox should not classify inner protocol frames further than that.

Why:

- less maintenance when the SDK event flow evolves
- less coupling between the sandbox template and SDK internals
- platform remains free to derive richer interpretations later

## S2 Recommendation

If S2 is the transport backbone and the platform derives logs/SSE/views later, the best default is:

- keep sandbox lifecycle events
- send the full SDK stream to S2 through a single `session.event` lane
- sort/filter/project later on the platform side

That preserves information and avoids re-implementing protocol parsing inside the sandbox.

If we ever want a product-friendly extracted lane, that can be derived later from:

- `session.event` where `event.method === "rawResponseItem/completed"`

## Practical Rule

Do not duplicate model items into two lanes by default.

Recommended approach:

- send the full SDK stream through `session.event`
- downstream extracts `rawResponseItem/completed.params.item` when it needs model-only views

## Migration Decision

Current decision:

- no legacy compatibility layer
- no dual-emission period
- no attempt to preserve the old Claude-style adapted inner message contract

Implementation plan:

- wait for the new SDK package to be published
- then switch the sandbox to the new contract in one clean break

That means the intended direction is:

- old contract: removed
- new contract: authoritative

The platform and sandbox should be updated together against the new SDK stream model rather than carrying compatibility baggage forward.

## Current Decision

Current preferred S2 shape:

- outer sandbox lifecycle events:
  - `sandbox.init`
  - `sandbox.ready`
  - `sandbox.complete`
  - `sandbox.cancelled`
  - `sandbox.error`
- one inner raw stream event:
  - `session.event`

`session.event` should:

- preserve the raw SDK event untouched
- avoid adding `kind`
- avoid splitting into `notification` / `request` / `rpc_result` / `parse_error` event families

The platform can interpret and route the raw payload later for:

- SSE
- response-style APIs
- logging
- OTEL/exporter pipelines
