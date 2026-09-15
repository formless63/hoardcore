FROM node:24-alpine AS build

WORKDIR /app
RUN corepack enable

COPY package.json ./
RUN pnpm install

COPY . .
RUN pnpm build

FROM node:24-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/.output ./.output

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
