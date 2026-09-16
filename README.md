# Hoardcore

Buy cheap inventory, sell a quarter of it, keep buying more. Go Hoardcore.

Hoardcore is an MIT-licensed, self-hosted inventory research tool. It is intended to help people collect sale/catalog data, review opportunities, and keep research attached to the products they are considering.

## Status

Early development. The first database-backed operator workflow is available, but authentication,
collection jobs, and production-ready source modules are not implemented yet.

### Available now

- Runnable TanStack Start application shell.
- NLAN and Cyberpunk UI themes with independently persisted light/dark mode.
- PostgreSQL schema and committed Drizzle migrations.
- Catalog source registration with module-owned Shopify storefront and collection-scope validation.
- Liveness and database-readiness endpoints at `/api/health` and `/api/ready`.

## Planned first module

- **Shopify** — collect and normalize public product/catalog data from Shopify stores for research and comparison workflows.

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

The current source-registration surface is intentionally unauthenticated while Better Auth/OIDC
is still a foundation milestone. Do not expose this early build to an untrusted network.
