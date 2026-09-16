# Deployment runbook

Hoardcore runs as one application container plus PostgreSQL. Graphile Worker is embedded in the
application process; do not deploy a second worker service.

## Configuration and secrets

Copy `.env.example` to `.env` and set:

- `DATABASE_URL` (or the Compose-provided database URL)
- `BETTER_AUTH_SECRET` to a long random value
- `BETTER_AUTH_URL` to the externally reachable HTTPS application URL
- `OIDC_ISSUER`, `OIDC_CLIENT_ID`, and `OIDC_CLIENT_SECRET` together

Keep `.env`, OIDC credentials, database passwords, and backups out of git and container images.
Use your deployment system's secret store where available.

## Start and migrate

Migrations are explicit and should be run before starting a new application version:

```bash
docker compose up -d db
pnpm install --frozen-lockfile
pnpm db:migrate
docker compose up -d --build app
```

The application listener and database listener are bound to loopback by default. Put a reviewed
HTTPS reverse proxy or private access gateway in front of the application rather than publishing
PostgreSQL or an unauthenticated application port directly.

## Health, readiness, and restart

- `/api/health` checks process liveness.
- `/api/ready` checks PostgreSQL and embedded worker readiness.

Only route traffic to an instance returning readiness. After a restart, verify readiness and inspect
the collection-run history for queued, succeeded, and failed jobs. Durable jobs remain in
PostgreSQL and are retried by the embedded worker according to Graphile Worker behavior.

## PostgreSQL backup and restore

Create a logical backup from the database container (replace the output path with protected backup
storage):

```bash
docker compose exec -T db pg_dump -U hoardcore -d hoardcore --format=custom > hoardcore.dump
```

Restore into a newly created empty database, then point a verification instance at that database,
apply any newer migrations, and check the application:

```bash
docker compose exec -T db createdb -U hoardcore hoardcore_restore
docker compose exec -T db pg_restore -U hoardcore -d hoardcore_restore < hoardcore.dump
# Set DATABASE_URL to the restored database for the following verification.
pnpm db:migrate
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:3000/api/ready
```

Test backups by restoring them periodically. Protect backup files as carefully as the database,
because retained source evidence may contain catalog content.

## Collection safety

Collection is operator-controlled and source-specific. Use a stable identifiable user agent,
conservative configured pacing/concurrency and request ceilings, cached or conditional requests,
`Retry-After` handling, and backoff. Respect published access controls and `robots.txt` where
applicable. Stop on persistent rejection.

Hoardcore does not rotate proxies or identities, bypass CAPTCHAs, spoof browser fingerprints, or
otherwise evade source controls. Keep fetch, parse, normalize, and persistence stages testable from
fixtures; never use live source access as an automated test requirement.
