# Hoardcore

Buy cheap inventory, sell a quarter of it, keep buying more. Go Hoardcore.

Hoardcore is an MIT-licensed, self-hosted inventory research tool. It is intended to help people collect sale/catalog data, review opportunities, and keep research attached to the products they are considering.

## Status

Early development, before the first tagged release. The authenticated catalog tracker, inventory
overview, research interchange, local photo cache, watchlists, and opt-in alerts are available.
Operator acceptance of each deployment remains important.

### Available now

- Runnable TanStack Start application shell.
- NLAN and Cyberpunk UI themes with independently persisted light/dark mode.
- PostgreSQL schema and committed Drizzle migrations.
- Better Auth with provider-neutral OIDC account creation, optional SMTP magic-link fallback for
  existing OIDC-linked accounts, and server-side authorization.
- In-process Graphile Worker for durable jobs; the application and worker run in one container.
- Catalog source registration for many independent source scopes, including module-owned Shopify
  storefront and collection-scope validation.
- Fixture-driven, conservative Shopify collection transport and snapshot persistence. Each
  installation must validate access and behavior against its own approved sources.
- Per-source collection enable/pause and opt-in daily, three-day, or weekly schedules. New sources
  default to manual-only; the deployment-wide collection gate still applies.
- Current listings tracker with source/product/variant detail, observation history, and retained
  evidence. The listings workbench has URL-persisted filters/sort, saved views, and source-specific
  category-group corrections. Listing detail includes bounded, paginated observation history,
  price/stock trends, private review decisions, and a local estimate-only margin calculator. The
  overview shows inventory totals, source health, activity, and observed price/stock changes.
  Numeric stock quantity is shown only when a source actually provides it.
- Versioned research packet export, validated preview/import, immutable raw submissions,
  manual comparable entry, and a scoped bearer-token API for coding agents.
- Opt-in photo capture that automatically queues paced, bounded follow-up batches after collection,
  plus manual capture. It stores 96px thumbnails and 480px previews in PostgreSQL; browsers load
  captured images from authenticated Hoardcore routes, not source CDNs.
- Per-user watched listings and opt-in ntfy alerts for watched items or saved filter views.
- Liveness and database-readiness endpoints at `/api/health` and `/api/ready`.

## Source modules

- **Shopify** — the first source module, collecting and normalizing public product/catalog data.
  It is reusable across many registered storefronts and collection scopes; Hoardcore is not tied to
  one store or source.

Additional source modules use the same generic product, variant, listing, observation, and evidence
contracts.

Hoardcore is software you run yourself. It is not a hosted SaaS service.

## Local development

Requirements: Node.js 24, pnpm 12, Docker, and Docker Compose.

```bash
cp .env.example .env
pnpm install --frozen-lockfile
docker compose up -d db
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000`. The database is bound to localhost only. If port 5432 is already
in use, set `POSTGRES_PORT` and update `DATABASE_URL` in `.env` to the same port.

Before submitting a change, run:

```bash
pnpm check
```

Database integration tests run when `TEST_DATABASE_URL` points at an already-migrated test
database. CI provisions PostgreSQL 18, applies migrations, and enables these tests automatically.

## Container run

The regular app container applies committed migrations before becoming ready; no migration
sidecar or one-off container is needed:

```bash
docker compose up -d --build
```

Use a configured OIDC provider for operator access. Review the deployment runbook before exposing
an early build to an untrusted network.

See [the deployment runbook](docs/deployment.md) for secrets, migrations, health checks, backups,
containerized gateway networking, and conservative collection operations.

## Releases

The project is moving toward its first `v0.1.0` release. Until then, `main` is a development
branch and deployments should be pinned to a reviewed commit. See the [release policy and first
release criteria](docs/releases.md) before treating a build as production-ready.
