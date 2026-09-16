# Hoardcore

Buy cheap inventory, sell a quarter of it, keep buying more. Go Hoardcore.

Hoardcore is an MIT-licensed, self-hosted inventory research tool. It is intended to help people collect sale/catalog data, review opportunities, and keep research attached to the products they are considering.

## Status

Early development. The authenticated catalog tracker and provider-neutral research interchange are
usable in development. Live collection and deployment acceptance remain pending verification.

### Available now

- Runnable TanStack Start application shell.
- NLAN and Cyberpunk UI themes with independently persisted light/dark mode.
- PostgreSQL schema and committed Drizzle migrations.
- Better Auth with provider-neutral OIDC configuration and server-side authorization.
- In-process Graphile Worker for durable jobs; the application and worker run in one container.
- Catalog source registration for many independent source scopes, including module-owned Shopify
  storefront and collection-scope validation.
- Fixture-driven, conservative Shopify collection transport and snapshot persistence. Live source
  acceptance is still pending and must be performed by an operator against an approved source.
- Current listings tracker with source/product/variant detail, observation history, and retained
  evidence.
- Versioned research packet export and pasted-result validation preview. Import persistence is not
  enabled yet.
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

Migrations are operator-controlled and are not generated or applied implicitly at runtime:

```bash
docker compose up -d db
pnpm db:migrate
docker compose up --build app
```

Use a configured OIDC provider for operator access. Review the deployment runbook before exposing
an early build to an untrusted network.

See [the deployment runbook](docs/deployment.md) for secrets, migrations, health checks, backups,
and conservative collection operations.
