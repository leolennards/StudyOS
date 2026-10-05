# One image, built in three stages so the runtime layer carries no build tooling.
#
# Two processes run from this image: the Next.js server (the default command)
# and the background worker that processes uploaded documents, started with
# `pnpm worker` (docker/worker.Dockerfile builds the worker alone, without the
# Next.js build). The worker runs TypeScript from src through tsx, which is why
# the runtime stage keeps the full node_modules and src rather than only the
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
# LibreOffice (writer and impress only, no GUI) turns Word and PowerPoint files
# into PDFs for the viewer. The worker is the only process that calls it.
RUN apt-get update \
  && apt-get install -y --no-install-recommends libreoffice-writer-nogui libreoffice-impress-nogui fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*
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
# next is started directly: pnpm is not in this stage and would otherwise be
# downloaded at start-up by a user that cannot write a cache.
CMD ["node_modules/.bin/next", "start"]
