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
- Fixture-driven, conservative Shopify collection transport and snapshot persistence, with
  durable page checkpoints, default `robots.txt` checks, an explicit operator-approved access
  mode, and an optional collection-card stock-count supplement. Each installation must validate
  access and behavior against its own approved sources.
- Per-source collection enable/pause and opt-in five-field cron schedules with explicit IANA
  timezones and bounded request ceilings. New sources default to manual-only; the deployment-wide
  collection gate still applies.
- UI-managed response safety on each source: request spacing, minimum scan intervals, immediate
  stops on throttling/access failures, configurable breaks and review pauses, escalating 429
  cooldowns, operator breaks, event history, and opt-in ntfy notifications. Cooldowns are durable
  and shared by origin across catalog, stock supplements and photo capture. A one-request probe
  tool respects required preflights and all safety gates. Defaults use ten
  seconds between requests, 24 hours between scans, and 24/72/168-hour breaks after repeated
  429s; the third rate-limit strike requires operator review. Longer Retry-After values are
  honored automatically; an explicit, confirmed, audited UI override can release
  a cooldown early without erasing strike history or request/scan pacing.
- Current listings tracker with source/product/variant detail, observation history, and retained
  evidence. The listings workbench has URL-persisted filters/sort, saved views, and source-specific
  category-group corrections. Listing detail includes bounded, paginated observation history,
  price/stock trends, private notes, shared decision history, and saved opportunity scenarios.
  A separate queue ranks opportunities from deterministic economics and research signals. The
  overview shows inventory totals, source health, activity, observed price/stock changes, and
  listings newly missing from or returning to a complete source snapshot. Numeric stock quantity
  is shown only when a source actually provides it; missing is distinct from out of stock.
- Versioned research packet export, validated preview/import, immutable raw submissions,
  manual comparable entry, and a scoped bearer-token API for coding agents.
- Opt-in photo capture that automatically queues paced, bounded follow-up batches after collection,
  plus manual capture. It stores 96px thumbnails and 480px previews in PostgreSQL; browsers load
  captured images from authenticated Hoardcore routes, not source CDNs.
- Per-user watched listings and opt-in ntfy alerts for watched items or saved filter views.
- Liveness and database-readiness endpoints at `/api/health` and `/api/ready`.

The [public API reference](https://hoardcore.com/api.html) includes the
[OpenAPI 3.1 specification](https://hoardcore.com/openapi.yaml) for implemented HTTP routes.

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

After `pnpm build`, run `TEST_DATABASE_URL=... pnpm test:ui:panel` against an isolated,
migrated test database (never production) with Playwright Chromium installed. It creates
and cleans up its own fixtures, checks source-save feedback, immediate collection-toggle
updates, navigation/sign-out, and expanded mobile layouts in light and dark mode. It
starts a local app with catalog/photo workers disabled and makes no source requests.
Screenshots are saved under `/tmp/hoardcore-panel-verification`.

Settings has a shared navigation workspace for general defaults, source configuration,
notifications, catalog organization, research API tokens, and Loxep connections. Sources
is focused on running and monitoring collections; its Configure source links open the
matching source under Settings → Sources & crawling.

Changes provides a searchable, paginated date-range feed of price, stock, new,
missing, and reappearing listing changes, plus net comparisons between two runs
of the same source. Rows show before/after values, price movements and run evidence.
Complete successful runs establish absence; partial and not-modified runs carry
forward unobserved state. Dashboard links open the full feed rather than only its
largest movers. Historical observations without linked run evidence use their
observation timestamps for reconstruction.
Changes assumes USD when a stored currency is absent, including historical price
drop/increase classifications and deltas; explicitly reported currencies are retained.
This reporting assumption does not rewrite original observations or raw evidence.
Fetched snapshots retain observations even when the price is unchanged. Changes
reconstructs partial/304 snapshots and fills missing price/quantity fields from earlier
known values, labeling inherited values and retaining original price evidence links and
timestamps. Last-known quantities are not presented as newly measured stock. First
appearances, removals, returns, unchanged prices, and actual price movements have distinct
explanations. Older runs without an observation timestamp use their evidence capture time.
Changes shows representative cached listing thumbnails, with green price drops,
red increases, amber removals, and event text/icons instead of a separate badge column.
Thumbnails are current cached media, not historical image reconstructions.

Source HTTP routing and catalog headers can be configured in Settings → Sources & crawling → Network routing & request headers. Each source
can use direct connections or an authenticated HTTP CONNECT proxy with an
encrypted password. Proxy failures do not fall back to direct connections;
changing routes does not reset source cooldowns or request budgets. The same UI
offers an opt-in Chromium catalog transport with native browser networking.
It fetches only the requested HTTPS document; redirects, JavaScript, service workers,
and background resources are disabled. Each request uses a fresh browser context,
the configured route, and the existing source response policy. Photos retain the
standard HTTP transport. The image includes Chromium; Compose enables its sandbox
using the [upstream Playwright seccomp profile](https://github.com/microsoft/playwright/blob/v1.63.0/utils/docker/seccomp_profile.json)
vendored in `deploy/browser-seccomp.json`. Keep that profile enabled when deploying
the browser transport. See
[shared VPN setup](deploy/gluetun/README.md#hoardcore-source-routing) for the optional
application-only network overlay.

The header editor includes User-Agent, Accept, Accept-Language, additional public
headers, a preview, and reset-to-defaults. Overrides apply to HTTP and Chromium
catalog/robots requests; photo acquisition retains its own headers. Response safety
offers **Release cooldown now** with a reason, confirmation, and optional lifting
of a review pause. This explicit origin-wide override is audited; it never clears
strike history, request pacing, scan intervals, or budgets, and never queues a scan.

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
