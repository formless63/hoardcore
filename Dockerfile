FROM node:24-bookworm-slim AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:24-bookworm-slim AS production-dependencies

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Keep native optional packages enabled: sharp's addon and libvips are
# production dependencies of the in-container media capture workflow.
RUN pnpm install --frozen-lockfile --prod

FROM node:24-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/hoardcore-browser

COPY --from=build --chown=node:node /app/.output ./.output
COPY --from=build --chown=node:node /app/drizzle ./drizzle
# Nitro externalizes runtime packages. Copy only production dependencies rather
# than the build stage's Vite, TypeScript, test, and other development tools.
# This includes sharp and its native optional addon for media capture.
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules

# Chromium needs glibc and OS libraries; install the browser matching the locked
# Playwright version. Runtime remains non-root and Chromium's sandbox is enabled.
RUN node node_modules/playwright-core/cli.js install --with-deps chromium --no-shell

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]
USER node
CMD ["node", ".output/server/index.mjs"]
