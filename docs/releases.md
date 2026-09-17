# Release policy

Hoardcore uses SemVer tags (`vMAJOR.MINOR.PATCH`) and GitHub Releases. Before `v1.0.0`, minor
versions may change the product shape; patch releases should contain compatible fixes only.
The application image is built from a reviewed tag or exact commit, not an unpinned branch.

There is no tagged release yet. `main` is the integration branch and `package.json` remains at
`0.0.0` until the first release candidate is accepted. Cloudflare Pages may publish the public
project site from `main`; that is separate from an application release.

## First release: v0.1.0

The first tag should describe a usable self-hosted tracker, not a feature-complete purchasing
system. Before tagging:

1. Run CI, typecheck, production build, migration checks, and database-backed integration tests
   against PostgreSQL 18.
2. Verify an upgrade from the previous deployed revision using only the regular application
   container and a restorable database backup. No sidecar or disposable migration container.
3. Validate OIDC login, optional existing-account magic-link delivery on an operator SMTP relay,
   source pause/schedule behavior, catalog run logs, listings/detail navigation, media access,
   research import/API, and opt-in alerts on an approved installation.
4. Document known limits honestly: a source may expose availability without a numeric quantity;
   partial collections do not prove a listing is missing; opportunity/ROI workflow is still planned.
5. Update `package.json` to `0.1.0`, write release notes describing included migrations and
   upgrade/backup steps, then create an annotated `v0.1.0` tag on the accepted commit.

For later releases, use the same review/backup/upgrade path. Apply Drizzle migrations on app
startup, keep old observation evidence, and call out any manual operator action in release notes.
Do not automatically deploy a new tag to a private installation merely because the public site
or `main` changed.
