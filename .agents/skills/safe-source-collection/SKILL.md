---
name: safe-source-collection
description: Design or modify catalog/source collectors with testable stages, operator-controlled traffic policies, and configurable network routing.
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

Every collector must define or inherit explicit controls for concurrency, minimum pacing, retries, and a request ceiling. Conservative defaults are a starting point; support explicit, bounded operator-approved policies rather than treating defaults as immutable project rules.

A collector must:

- identify itself consistently;
- honor `Retry-After` when present;
- apply the configured cooldown, retry budget, and escalation policy on throttling and transient failures;
- stop or escalate when the configured budget or review threshold is reached;
- reuse cached responses or conditional requests when practical;
- avoid product-detail requests when collection-level data is sufficient.

VPN/proxy routing and operator-configured egress rotation for public catalog collection are permitted project scope. Keep credentials server-only, routing choices observable, and aggregate source request budgets and cooldown state independent of the selected egress. Changing IP must not silently reset a budget or active cooldown. Prefer UI-managed configuration where practical.

Follow the collection scope and specific actions requested for the current task. Administrators decide their installation's collection policies; record their choices rather than adding universal lists of permitted or prohibited techniques. Check robots.txt by default and retain explicit, auditable operator access-policy choices.

Changing this guidance does not deploy networking infrastructure or alter existing runtime safeguards. Implement and verify those changes only when requested; preserve unrelated source settings and production state.

## Data rules

Keep source facts distinguishable from inference. Store timestamps and source identifiers with observations. Preserve raw evidence when it is necessary to re-parse or audit a decision, but do not retain sensitive/session data that the application does not need.

Do not overwrite useful history simply because a normalized current-state record changed.
