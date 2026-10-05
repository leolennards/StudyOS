# The background worker on its own, for hosts that build one service per
# Dockerfile (Render; see docs/DEPLOYMENT.md). It is the runtime stage of
# docker/Dockerfile without the Next.js build, which the worker never uses,
# so the image builds faster and is smaller.

FROM node:22-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# LibreOffice (writer and impress only, no GUI) turns Word and PowerPoint files
# into PDFs for the viewer.
RUN apt-get update \
  && apt-get install -y --no-install-recommends libreoffice-writer-nogui libreoffice-impress-nogui fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*
RUN groupadd --system --gid 1001 studyos \
  && useradd --system --uid 1001 --gid studyos studyos
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
USER studyos
# The worker's health endpoint; Render routes its public address here.
ENV WORKER_HEALTH_PORT=10000
EXPOSE 10000
# Started with node directly (the same command as `pnpm worker`): pnpm itself
# is not in the image and would have to be downloaded at start-up.
CMD ["node", "--conditions=react-server", "--import", "tsx", "src/worker/index.ts"]
