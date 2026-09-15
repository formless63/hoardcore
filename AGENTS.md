# Hoardcore agent guide

Hoardcore is an MIT-licensed, self-hosted application for collecting inventory/catalog data, organizing research, and evaluating potential purchases. Keep the public project generic: source modules may support particular commerce platforms, but core architecture and terminology must not assume a specific retailer, deployment, user, or AI provider.

Read `.agents/PLAN.md` before substantial architectural work.

## Task tracking

Once Beads is initialized, Beads is the canonical task/backlog system. Do not create parallel Markdown TODO lists or turn `.agents/PLAN.md` into a task tracker. PLAN.md records direction, boundaries, and sequencing only.

## TanStack Intent

TanStack libraries ship version-matched Agent Skills. Before substantial edits:

1. Run `npx @tanstack/intent@latest list` from the repository root.
2. Load the most specific matching skill with `npx @tanstack/intent@latest load <package>#<skill>`.
3. Follow the loaded guidance for the installed package version.
4. Load more than one skill only when the change genuinely spans those concerns.

`package.json` trusts skills from `@tanstack/*`. Do not vendor copies of upstream TanStack skills into this repository; keeping them tied to installed package versions prevents stale guidance.

## Refined stack

### Application foundation

- TypeScript, React, and TanStack Start.
- TanStack Router is the routing foundation provided by Start.
- TanStack Query owns remote/server state, cache freshness, mutations, and invalidation. Use the Start/Router SSR Query integration and create a QueryClient per router/request; never share a server QueryClient globally.
- TanStack Table is the default data-grid/table primitive.
- TanStack Form is the default form-state/validation integration.
- TanStack Pacer is the preferred client-side debounce/throttle/queue primitive when timing control is needed.
- Tailwind CSS plus shadcn/ui conventions are the default UI layer. Prefer composable local components over introducing another component framework.
- Zod defines validation and interchange contracts at trust boundaries.

### Theme conventions

- `data-theme` on `<html>` selects the named visual preset; the `.dark` class independently selects color mode through `next-themes`.
- Theme presets live in `src/styles/themes/` and should provide both light and dark token sets.
- Use semantic theme utilities such as `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, and `ring-ring`. Do not hard-code Zinc/Slate/etc. colors into application UI where a semantic token exists.
- Add selectable themes through `src/components/themes/theme.config.ts`; do not scatter theme IDs through components.
- Vendored theme values must not require a third-party theme service at runtime.

### Approved TanStack defaults when the feature actually needs them

- TanStack Virtual for large rendered lists/tables.
- TanStack Hotkeys for keyboard-driven review workflows.
- TanStack Store only for genuine cross-route local reactive state not already owned by Router, Query, Table, or Form.
- TanStack DB when reactive client collections/local-first behavior provide a concrete benefit; do not introduce it merely to mirror PostgreSQL.
- TanStack AI when direct model/API integration is added. Until then, keep research interchange provider-neutral and schema-driven.

Do not add overlapping state/form/table libraries without a concrete limitation in the chosen TanStack primitive.

## Server and data architecture

- PostgreSQL is the durable application datastore.
- Drizzle ORM is the database access/schema layer.
- Graphile Worker is the durable background-job system and must run in-process with the application. Do not add a separate worker service/container solely for Graphile Worker.
- The supported deployment shape is one Hoardcore application container plus PostgreSQL. Additional stateful infrastructure must solve a demonstrated requirement.
- Do not introduce Redis, RabbitMQ, Elasticsearch, object storage, or a separate search service preemptively.

### TanStack Start boundaries

- Use server functions for typed same-origin application RPC.
- Use server routes for endpoints intentionally consumed outside the Start application.
- Keep privileged database/network/filesystem implementation in `*.server.ts` modules or equivalent server-only boundaries.
- Validate all untrusted input before it reaches domain/data logic.
- Route loaders are not inherently server-only; never place secrets or privileged direct database access in a normal loader.

## Authentication

- Better Auth is the authentication layer.
- OIDC is the default external identity mechanism.
- Keep auth configuration provider-neutral: an installation chooses its own compliant OIDC provider.
- Authorization is enforced server-side. Hiding a control or route in React is not authorization.
- Do not require a Hoardcore-hosted account service or SaaS dependency.

## Modules

Source/platform integrations live under `src/modules/<module>` and should expose explicit module boundaries rather than scattering platform checks through core code.

The first planned source module is `shopify`.

Core models should describe Hoardcore concepts such as products, source listings, observations, research, opportunities, notes, and purchases. A source module maps external data into those concepts.

Do not embed retailer-specific selectors, URLs, rate limits, or assumptions in core domain code.

## Collection behavior

Source collection must be conservative and operator-controlled:

- Respect published access controls and `robots.txt` where applicable.
- Use a stable, identifiable user agent.
- Keep concurrency and pacing explicit and configurable per source.
- Cache/reuse source data instead of repeatedly requesting identical pages.
- Honor `Retry-After`, back off on throttling, and stop on persistent rejection.
- Never implement proxy rotation, identity rotation, CAPTCHA bypass, or other mechanisms intended to evade a site's controls.
- Store observations/history separately from the current normalized state when history matters.

See `.agents/skills/safe-source-collection/SKILL.md` when implementing collectors.

## Research interchange

The initial research workflow should remain AI-provider-neutral. Prefer exportable research packets plus a versioned Zod schema that can be pasted into an external research/chat tool and imported back into Hoardcore.

- Give exported records immutable Hoardcore references.
- Preserve imported raw structured payloads as well as normalized fields.
- Validate before import and show a preview for partial/invalid results.
- Keep deterministic financial calculations in application code, not in model prose.
- Version both the research prompt and interchange schema.

When direct AI integration is introduced, it should produce/consume the same research contracts rather than replacing them.

## Development principles

- Prefer simple composable code over framework-like abstractions inside the app.
- Avoid speculative infrastructure and speculative schemas.
- Keep source modules testable without live network access by separating fetch, parse, normalize, and persist stages.
- Add migrations for durable schema changes; do not rely on runtime schema mutation.
- Never silently discard source evidence or imported research provenance.
- Keep README claims limited to functionality that actually exists in the current tree.
