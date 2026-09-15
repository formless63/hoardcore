---
name: safe-source-collection
description: Design or modify catalog/source collectors so they are conservative, testable, and do not evade source controls.
---

# Safe source collection

Use this skill whenever implementing a module that fetches catalog, listing, inventory, or price information from an external site.

## Required shape

Keep these stages separable:

1. `fetch` — HTTP and source pacing only.
2. `parse` — convert a captured response into source-native records.
3. `normalize` — map source-native records into Hoardcore domain contracts.
4. `persist` — update current state and append observations/history.

Tests for parse/normalize must run from fixtures without live network access.

## Traffic controls

Every collector must define or inherit explicit controls for concurrency, minimum pacing, retries, and a request ceiling. Defaults should be conservative.

A collector must:

- identify itself consistently;
- honor `Retry-After` when present;
- back off on throttling and transient failures;
- stop/escalate on persistent rejection rather than increasing pressure;
- reuse cached responses or conditional requests when practical;
- avoid product-detail requests when collection-level data is sufficient.

Do not implement rotating proxies, rotating identities, CAPTCHA bypass, browser fingerprint spoofing, or other mechanisms whose purpose is to evade access controls.

## Data rules

Keep source facts distinguishable from inference. Store timestamps and source identifiers with observations. Preserve raw evidence when it is necessary to re-parse or audit a decision, but do not retain sensitive/session data that the application does not need.

Do not overwrite useful history simply because a normalized current-state record changed.
