# Browser smoke tests

The Playwright suite defaults to `http://127.0.0.1:3000`, starts the local Vite
server when needed, and never contacts a catalog source directly. Keep it pointed
at a local or otherwise operator-controlled Hoardcore deployment; do not run it
against an unapproved storefront or production by accident.

Install the optional browser test dependency and browser once:

```sh
pnpm add -D @playwright/test
pnpm exec playwright install chromium
pnpm exec playwright test
```

The anonymous suite covers the login shell and protected-route redirect without
requiring a database fixture. Authenticated navigation tests are skipped unless
`PLAYWRIGHT_STORAGE_STATE` points at an operator-created Playwright storage state.
Create that state from a local deployment after logging in manually; never commit
it. Set `PLAYWRIGHT_BASE_URL` when using an already-running local deployment.

The authenticated tests are intentionally read-oriented by default: they verify
filter URL state and listing-detail/back navigation when data exists. Mutation
checks for saved views, watchlist, and manual research should be run as a separate
local acceptance pass with a disposable database rather than against production.

Examples:

```sh
PLAYWRIGHT_STORAGE_STATE=.hoardcore-private/playwright.local.json \
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 \
  pnpm exec playwright test
```
