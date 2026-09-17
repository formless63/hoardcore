---
name: hoardcore-api
description: Use Hoardcore's implemented HTTP API to submit research results from a coding agent; distinguish scoped research tokens from app sessions and ntfy tokens.
---

# Hoardcore API use

Use this skill when an agent needs to exchange research with a running Hoardcore installation over HTTP. The public reference is `docs/api.html` (published at `https://hoardcore.com/api.html`); read `docs/openapi.yaml` for the machine-readable OpenAPI 3.1 contract. For exact versioned research fields, check `src/features/research/research.schemas.ts`.

## Available external workflow

1. Have the user create and export a ResearchPacket for selected listings in the authenticated UI. The packet is immutable and must already be saved under that user's account.
2. Have that same user issue a `research:write` token in **Settings → Research API tokens**. The token is shown only once. Accept it through a secret environment variable or another secure channel; never paste it into source, a committed file, logs, or a prompt sent to a research provider.
3. Build a ResearchResult using the packet's exact `packetId`, version fields, and immutable `reference` values. Use citations and comparables only when supported by evidence. Keep a stable `resultId` for safe retries.
4. Validate against the versioned schema where possible. Submit `POST /api/research/import` to the user's app origin with `Authorization: Bearer <research token>`, `Content-Type: application/json`, and body `{ "result": <ResearchResult> }`. The entire body must be at most 5,000,000 bytes.
5. Treat `201` as imported; an identical retry may return `idempotent: true`. On `400`, correct the payload rather than blindly retrying. On `401`, check the token's owner, expiry, revocation, and scope. On `413`, shrink the payload. Do not replay a changed result under the same `resultId`.

Only submit to the installation the user authorized. Sending a result is a persistent write, so obtain user approval if the current task did not already authorize that import. Do not invent endpoints for listing search, source administration, or packet creation: those are not stable external APIs yet. The app's Better Auth session and ntfy publish credential are distinct from the scoped research token and cannot substitute for it.
