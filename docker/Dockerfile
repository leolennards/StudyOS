# One image, built in three stages so the runtime layer carries no build tooling.
#
# Phase 1 runs a single process from this image: the Next.js server. The
# background worker designed in the architecture proposal (pg-boss) will be a
# second process started from this same image with a different command, which
# is why the runtime stage keeps the full node_modules rather than only the
# standalone server output.

FROM node:22-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# next build runs with placeholder configuration: src/server/lib/env.ts detects
# the build phase so a missing DATABASE_URL cannot fail an image build.
RUN pnpm build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN corepack enable \
  && groupadd --system --gid 1001 studyos \
  && useradd --system --uid 1001 --gid studyos studyos
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/scripts ./scripts
# src carries the SQL migrations (src/server/platform/db/migrations) that
# `pnpm db:migrate` applies as a release step before this image starts serving.
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json
USER studyos
EXPOSE 3000
CMD ["pnpm", "start"]
