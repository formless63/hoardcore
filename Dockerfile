FROM node:24-alpine AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:24-alpine AS production-dependencies

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Keep native optional packages enabled: sharp's musl addon and libvips are
# production dependencies of the in-container media capture workflow.
RUN pnpm install --frozen-lockfile --prod

FROM node:24-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build --chown=node:node /app/.output ./.output
COPY --from=build --chown=node:node /app/drizzle ./drizzle
# Nitro externalizes runtime packages. Copy only production dependencies rather
# than the build stage's Vite, TypeScript, test, and other development tools.
# This includes sharp and its musl-native optional addon for media capture.
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]
USER node
CMD ["node", ".output/server/index.mjs"]
