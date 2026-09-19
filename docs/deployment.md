# Deployment runbook

Hoardcore runs as one application container plus PostgreSQL. Graphile Worker is embedded in the
application process; do not deploy a second worker service.

## Configuration and secrets

Copy `.env.example` to `.env` and set:

- `DATABASE_URL` (or the Compose-provided database URL)
- `BETTER_AUTH_SECRET` to a long random value
- `BETTER_AUTH_URL` to the externally reachable HTTPS application URL
- `OIDC_ISSUER`, `OIDC_CLIENT_ID`, and `OIDC_CLIENT_SECRET` together
- optionally `OIDC_PROVIDER_NAME` and a same-origin `OIDC_PROVIDER_ICON_URL` for the login button
- optionally `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` together
  for magic-link fallback sign-in; `SMTP_SECURE=true` is available for implicit TLS
- `MEDIA_CAPTURE_ENABLED=true` only on an approved collection host when server-side photo
  capture is intended; it is disabled by default. Optional `MEDIA_CAPTURE_CONCURRENCY` (1–4),
  `MEDIA_CAPTURE_MINIMUM_DELAY_MS` (at least 1000), and `MEDIA_CAPTURE_AUTO_REQUEST_LIMIT` (2–100)
  tune the bounded automatic batches; defaults are 3, 1500, and 20 respectively
- `CATALOG_COLLECTION_ENABLED=false` on any host that must not make catalog source requests;
  queued jobs are also rejected by the worker before network access

Register the application's exact `/api/auth/callback/oidc` URL in the identity provider. The
client must permit the `openid`, `email`, and `profile` scopes so Hoardcore can create and identify
an operator account.

OIDC is the only path that creates accounts. Once a user has signed in with OIDC, the same
account can request a magic link at its OIDC email address if SMTP is configured. Unknown
addresses receive the same public response but no email. Links are single-use and expire after
10 minutes. Magic-link sessions expire after 24 hours; OIDC sessions expire after 30 days.
Both are absolute limits, not sliding refreshes. SMTP uses TLS, and configuration errors should
be checked in app logs without ever logging links or credentials. A magic link is not a substitute
for the identity provider's access policy: anyone with access to the user's mailbox can sign in
as that user during the link window.
For a branded OIDC button, set `OIDC_PROVIDER_NAME` and optionally place an icon in the app's
`public/` directory before building, then set `OIDC_PROVIDER_ICON_URL` to its same-origin path.

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

### Verify a production image

The runtime stage contains only production dependencies, while retaining
Nitro's external runtime packages and Sharp's Alpine/musl native addon. Before
pushing a locally built image, verify the native image pipeline without
starting the application or contacting a source:

```sh
pnpm docker:build
pnpm docker:smoke
```

`docker:smoke` runs a one-pixel Sharp conversion inside the built image. It
does not need application configuration or a database.

For upgrades, take a backup first, then rebuild/restart the same app service. A migration failure
stops the app instance and leaves readiness unavailable; inspect `docker compose logs app` before
retrying. Do not start multiple app instances against the same database during an upgrade.

If shipping source with `git archive`, do not simply extract it over an older persistent source
tree: an archive cannot remove files deleted in Git. Stale route files can override current routes.
Extract into a fresh release directory, or reconcile the exact deleted tracked paths from the
previous revision before rebuilding. Keep `.env` and backup storage outside that replacement
scope. Verify the built image does not contain obsolete routes before routing traffic to it.

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
the collection-run history for queued, succeeded, and failed jobs. Queued jobs, including future
`Retry-After` work, remain in PostgreSQL. A running collection with a saved page checkpoint is
requeued from its next page; an interrupted run without a checkpoint is marked failed for operator
review. A queued run with no matching durable job is also failed so it cannot block future runs.
An in-flight request may be repeated if the process exits after receiving its response but before
the page checkpoint commits. Request counts and finite ceilings remain durable.

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
because retained source evidence, research payloads, notification settings, and cached image
bytes are included in PostgreSQL backups.

## Photos, research, and notifications

Photo capture runs as bounded follow-up jobs rather than inside catalog requests. On an approved
host, set `MEDIA_CAPTURE_ENABLED=true` and restart the regular app service. Future catalog runs
then queue photo batches automatically until discovered uncaptured images have been considered;
the **Capture photos** control can also queue a manual batch. Each batch has an HTTP request ceiling
including access-policy checks. A few image downloads can overlap, but request starts are paced
and catalog jobs have higher queue priority. Automatic continuation stops on access denial or
persistent rejection; review the run before trying again. Leave the flag unset or `false` on a host whose network address should not make
source-CDN requests. Existing image URLs remain catalog evidence, but an uncaptured image shows a
placeholder rather than making the viewer's browser fetch it from the source. PostgreSQL holds
deduplicated, re-encoded small derivatives, so include it in capacity planning and backups.

Research packets can be copied into an external research tool, then validated and imported through
the UI. Manual comparables use the same contract. External coding agents can use a revocable,
scoped research token issued at **Settings → Research API tokens**; treat that token as a secret.
The authenticated user must first create a research packet for the target listings. An agent can
then submit a versioned `ResearchResult` for that packet with
`POST /api/research/import`, `Authorization: Bearer <token>`, and a JSON body shaped as
`{ "result": { ... } }`. The endpoint accepts only the token owner's packets and never contacts an
AI provider. See `src/features/research/research.schemas.ts` for the versioned contract.

Notifications are off by default. Each user must configure a public HTTPS ntfy origin and topic,
enable notifications globally, then opt in individual watched listings or saved filter views and
their event types. The app does not contact ntfy until these settings are enabled. Use a private,
unguessable topic or a protected ntfy deployment; do not treat the topic name alone as an access
control mechanism. For a protected server, set `NTFY_AUTH_ORIGIN` to its exact public HTTPS origin
and `NTFY_ACCESS_TOKEN` to a publish-capable bearer token in the app container's private `.env`.
Set both variables together on each deployment. The token is never exposed in the settings UI or
sent to a different endpoint. Restart the app after changing these variables.

## Collection safety

Collection is operator-controlled and source-specific. Use a stable identifiable user agent,
conservative configured pacing/concurrency and request ceilings, cached or conditional requests,
`Retry-After` handling, and backoff. Respect published access controls and `robots.txt` where
applicable. Stop on persistent rejection.

Schedules are configured per registration on **Sources**, alongside the manual run controls.
New sources remain **manual only** until an operator enters a five-field cron schedule, chooses an
explicit IANA timezone, and sets a scheduled request ceiling. For example, `0 9,21 * * *` with
`America/New_York` runs at 9 AM and 9 PM Eastern and follows daylight-saving changes. Schedules
must leave at least six hours between runs. Older interval schedules remain active until replaced
through the UI. The same page can pause a source; pause
blocks both manual and scheduled runs. The deployment-wide `CATALOG_COLLECTION_ENABLED=false`
gate remains authoritative even if a schedule is saved. The in-process worker checks due sources
once per minute, but does not send source requests for manual-only or paused sources. A scheduled
run never overrides the normal access checks, pacing, request ceiling, or active-run limit.

Manual runs can add an optional 1–5 minute inter-page wait with a live countdown. The **Continue
sooner** control skips only that discretionary wait; it cannot skip minimum pacing, `Retry-After`,
or an access-policy denial. A Shopify source may opt into collection-card stock counts when its
catalog JSON omits them. This adds a paced HTML request for each catalog page, using the same
finite run budget, robots checks, and rejection handling. Increase the request ceiling deliberately
for that mode; it never requests every product page. A complete snapshot alone can mark previously
seen listings missing. Partial, failed, and not-modified runs do not imply absence.

Hoardcore does not rotate proxies or identities, bypass CAPTCHAs, spoof browser fingerprints, or
otherwise evade source controls. Keep fetch, parse, normalize, and persistence stages testable from
fixtures; never use live source access as an automated test requirement.
