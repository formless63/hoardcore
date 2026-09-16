# Deployment runbook

Hoardcore runs as one application container plus PostgreSQL. Graphile Worker is embedded in the
application process; do not deploy a second worker service.

## Configuration and secrets

Copy `.env.example` to `.env` and set:

- `DATABASE_URL` (or the Compose-provided database URL)
- `BETTER_AUTH_SECRET` to a long random value
- `BETTER_AUTH_URL` to the externally reachable HTTPS application URL
- `OIDC_ISSUER`, `OIDC_CLIENT_ID`, and `OIDC_CLIENT_SECRET` together

Register the application's exact `/api/auth/callback/oidc` URL in the identity provider. The
client must permit the `openid`, `email`, and `profile` scopes so Hoardcore can create and identify
an operator account.

Keep `.env`, OIDC credentials, database passwords, and backups out of git and container images.
Use your deployment system's secret store where available.

## Start and migrate

The regular application container applies committed Drizzle migrations on startup, before its
embedded worker becomes ready. No sidecar, one-off migration container, or host-installed Node.js
toolchain is required for deployment:

```bash
docker compose up -d --build
curl -fsS http://127.0.0.1:3000/api/ready
```

For upgrades, take a backup first, then rebuild/restart the same app service. A migration failure
stops the app instance and leaves readiness unavailable; inspect `docker compose logs app` before
retrying. Do not start multiple app instances against the same database during an upgrade.

The application listener and database listener are bound to loopback by default. Put a reviewed
HTTPS reverse proxy or private access gateway in front of the application rather than publishing
PostgreSQL or an unauthenticated application port directly.

If that gateway runs in a container, `127.0.0.1` refers to the gateway container, not the app.
Attach the app to the gateway's existing Docker network with the optional overlay:

```bash
# Set APP_CONTAINER_NAME and GATEWAY_NETWORK in the host's ignored .env first.
docker compose -f compose.yaml -f compose.gateway.yaml up -d --build
```

Keep the app on its default Compose network for PostgreSQL. Configure the gateway's upstream as
`http://<APP_CONTAINER_NAME>:3000` on the shared network. Use a distinct container name on each
host; do not put installation-specific hostnames or network names in the public Compose files.

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

Restore into a newly created empty database, then point the normal application service at that
database. Its startup applies any newer migrations before readiness succeeds:

```bash
docker compose exec -T db createdb -U hoardcore hoardcore_restore
docker compose exec -T db pg_restore -U hoardcore -d hoardcore_restore < hoardcore.dump
# Set the app service DATABASE_URL to the restored database, then restart app.
docker compose up -d --build app
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
