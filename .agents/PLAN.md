# Hoardcore plan

This document records product/architecture direction. Once Beads is initialized, implementation work belongs in Beads rather than being duplicated here as a checkbox backlog.

## Product direction

Hoardcore is a self-hosted inventory research application. It should turn public catalog/sale inventory into durable, searchable observations; help users organize outside research; and retain the evidence behind buying decisions.

The project is FOSS under MIT. It is not designed around a hosted Hoardcore SaaS service.

## Architecture direction

Keep the deployable system small:

- one TanStack Start application process/container;
- one PostgreSQL database;
- Graphile Worker embedded in the application process for scheduled/durable jobs;
- generic OIDC authentication via Better Auth.

Prefer the TanStack ecosystem for application primitives when a suitable native tool exists. Adopt primitives when they solve a real problem, but establish the intended native choice early enough to avoid accidental parallel patterns.

## Phase sequence

### Foundation

Establish the application shell, authentication, database/migrations, module contracts, in-process Graphile Worker lifecycle, configuration model, and basic administrative surfaces.

### Shopify source module

Build the first platform source integration around Shopify storefront/catalog behavior. Keep collection conservative and configurable. Separate fetching, parsing, normalization, and persistence so store-specific quirks do not leak into core models.

The Shopify module is reusable platform support, not a singleton source. An installation may
register many independent storefronts, collections, or other supported scopes against the same
module. Core workflows operate on source registrations and module capabilities rather than
assuming one retailer, one URL, or one collection.

The module should support catalog snapshots and change observations before deeper retailer-specific behavior is considered.

### Source media

Catalog collection records image URLs and evidence without downloading binaries as a hidden
per-product fan-out. A separate, operator-controlled media capture workflow should fetch from the
approved deployment location with its own conservative request budget and access checks. Retain
small decoded/re-encoded thumbnail and detail-preview derivatives, source URL, checksum, capture
time, and dimensions. Serve captured images through authenticated Hoardcore routes so browsers do
not have to contact source CDNs. Start with deduplicated PostgreSQL binary storage and measure
backup size and performance before introducing an object store.

### Research interchange

Add provider-neutral research batches that export selected product/source facts with an immutable Hoardcore reference and a versioned research prompt/schema. Accept structured results back through validated preview/import.

Direct AI APIs are intentionally not required for this phase.

Research should have a small typed baseline for market comparables: marketplace/channel,
active asking versus completed-sale versus retail-offer evidence, price, shipping, currency,
condition, observation/sale time, sample/window when summarized, URL/citation, and notes.
Marketplace names are values, not core enum branches. Manual editing, JSON interchange, and
future agent APIs must validate through the same server-side contract and preserve provenance
and prior submissions. Aggregates and financial calculations are deterministic application code.

### Opportunity workflow

Add review states, collaborative notes, watch/ignore/buy decisions, source evidence, historical pricing/availability views, and deterministic resale/ROI calculations based on normalized research inputs.

Users can watch specific listings independently of saved filter views. An optional notification
pipeline can evaluate both watched items and saved views against new observations, with explicit
per-user opt-in and deduplication; ntfy is one delivery adapter, not a core dependency.

### Additional source modules

Make new commerce/catalog integrations possible through the same module contracts without changing core product/research models for each platform.

### Direct AI integration

When useful, add direct research/model execution with TanStack AI. It should use the same research contracts already used by manual export/import so AI providers remain replaceable and historical research stays portable.

## Non-goals until demonstrated otherwise

- hosted multi-tenant SaaS architecture;
- separate worker services;
- Redis or message brokers;
- Elasticsearch/Meilisearch;
- object storage;
- proxy rotation or anti-bot evasion;
- provider-specific AI data models;
- a second state/form/table framework alongside TanStack primitives.
