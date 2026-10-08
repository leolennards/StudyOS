# StudyOS

An AI-powered university study and knowledge-management platform. This repository
holds the application; the product and architecture documents live in the project's
shared folder.

**Current state: Phases 1 to 4 are built.** Accounts, workspaces, the
subject → sections → topics knowledge structure, the application shell and
settings, documents (upload PDFs, Word files, slides, text and images; text
extraction with OCR for scanned pages; a viewer; linking documents to topics),
notes (a rich-text editor with LaTeX maths, autosave and a trash), keyword
search across all of it (⌘K), flashcards with spaced-repetition review
(basic, reversed and cloze cards with optional pictures, and image occlusion
cards, scheduled with FSRS), a daily goal, streaks, a
focus timer and a progress page, exam dates with a topic confidence checklist,
practice quizzes made from flashcards, card import from Anki, Quizlet and
CSV files, a past-paper tracker (questions, marks per topic, attempts) and a
weekly study plan built from free time, exams and weakest topics are built and
tested. AI (including generated quizzes) and extracting questions from
past-paper files are designed but not implemented — see `CURRENT STATUS.md` in the project documentation for what exists and what does
not.

## Architecture in one paragraph

One TypeScript codebase (a modular monolith), one Postgres database, and layered
boundaries enforced by ESLint: a route or server action calls a service, the
service calls pure domain functions and a workspace-scoped repository, and only
the repository touches the database. Every user-owned row carries a
`workspace_id`, and a dedicated test suite asserts that one account can never
read or write another's data. The reasoning behind each decision is recorded in
`Project Management/DECISIONS.md`.

## Requirements

- Node 22 or newer
- pnpm 10 (`corepack enable`)
- Docker, for Postgres (or your own Postgres 17 instance)
- LibreOffice, for Word and PowerPoint previews (`apt install libreoffice-writer-nogui
libreoffice-impress-nogui`, or `brew install --cask libreoffice`). Without it those
  files are still uploaded and their text extracted; they just show as text only.

## Getting started

```bash
pnpm install
cp .env.example .env            # then fill in the values below
docker compose -f docker/compose.yaml up -d
pnpm db:migrate
pnpm dev                        # http://localhost:3000
pnpm dev:worker                 # in a second terminal: processes uploads, empties old trash
```

Uploaded files go to `.data/storage` in development (gitignored). The worker
reads the text out of each upload; without it running, documents stay at
"Waiting to be processed".

Create an account at `/sign-up`. In development no email is sent: verification
and password-reset links are printed to the server log, and email verification is
not required to sign in unless `RESEND_API_KEY` is set.

## Environment variables

`src/server/lib/env.ts` validates these at boot and refuses to start on bad
configuration, so a typo fails immediately rather than at the first request.

| Variable                                          | Required      | What it does                                                                                                  |
| ------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                    | yes           | Postgres connection string.                                                                                   |
| `DATABASE_URL_UNPOOLED`                           | no            | A direct (unpooled) connection for migrations, if the host offers one. Falls back to `DATABASE_URL`.          |
| `BETTER_AUTH_SECRET`                              | yes           | Signs sessions. At least 32 characters: `openssl rand -base64 32`.                                            |
| `BETTER_AUTH_URL`                                 | yes           | The application's own base URL.                                                                               |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`       | no            | Google sign-in. The button appears only when both are set.                                                    |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | no            | Microsoft sign-in, same rule.                                                                                 |
| `RESEND_API_KEY`                                  | in production | Sends verification and reset emails. Without it they go to the log.                                           |
| `EMAIL_TRANSPORT`                                 | no            | `log` sends no email at all. Production accepts it only when set explicitly; it exists for test environments. |
| `EMAIL_FROM`                                      | no            | The From address on outgoing email.                                                                           |
| `LOG_LEVEL`                                       | no            | `info` by default.                                                                                            |
| `STORAGE_DRIVER`                                  | in production | `local` (files on disk, the default in development) or `s3` (any S3-compatible store, such as Cloudflare R2). |
| `STORAGE_LOCAL_DIR`                               | no            | Where the local driver keeps files. `.data/storage` by default.                                               |
| `S3_ENDPOINT` / `S3_BUCKET`                       | with `s3`     | The bucket's endpoint and name.                                                                               |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`       | with `s3`     | Credentials with read, write and delete on that bucket only.                                                  |
| `S3_REGION` / `S3_FORCE_PATH_STYLE`               | no            | `auto` and `false` by default, which suit R2. Set path style for MinIO.                                       |
| `UPLOAD_MAX_MB`                                   | no            | Largest single upload. 50 by default.                                                                         |
| `STORAGE_QUOTA_MB`                                | no            | Storage per workspace. 2048 by default.                                                                       |
| `OCR_ENABLED`                                     | no            | `true` by default. Scanned pages are read with Tesseract, which runs offline inside the worker.               |
| `OCR_RENDER_WIDTH`                                | no            | Pixels across a scanned page is rendered before OCR. 1650 by default; 1240 fits a 512 MB worker.              |
| `LIBREOFFICE_PATH`                                | no            | The `soffice` binary, if it is not on the `PATH`.                                                             |
| `WORKER_CONCURRENCY`                              | no            | Documents processed at once by one worker. 2 by default.                                                      |
| `WORKER_HEALTH_PORT`                              | no            | When set, the worker answers `GET /health` on this port for the host's health check.                          |
| `WORKER_URL`                                      | no            | Set on the web app when the worker's host sleeps while idle: the app calls it to wake the worker.             |
| `WORKER_PUBLIC_URL`                               | no            | Set on the worker, same address: it calls itself while jobs are waiting so its host does not stop it.         |
| `CRON_SECRET`                                     | no            | The scheduler sends this as `Authorization: Bearer …` to `/api/cron/wake-worker`.                             |
| `SIGNUP_ALLOWED_EMAILS`                           | no            | Comma-separated addresses allowed to create an account. Unset means anyone can.                               |

With S3 storage the browser uploads straight to the bucket, so the bucket needs a
CORS rule allowing `PUT` and `GET` from the application's origin with the
`content-type` header. On R2 that is set in the bucket's settings.

Secrets belong in `.env` locally and in the host's environment settings in
production. `.env` is gitignored and must stay that way.

## Running the tests

```bash
pnpm test              # unit tests, no database needed
pnpm test:integration  # services and repositories against real Postgres
pnpm test:e2e          # Playwright, against a production build
pnpm test:all          # typecheck, lint, unit and integration
```

The integration and end-to-end suites need their own database, which they reset:
never point them at a database you care about. With `docker/compose.yaml`
running, the test instance is on port 5433.

```bash
export TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5433/studyos_test
export E2E_DATABASE_URL=postgres://postgres:postgres@localhost:5433/studyos_test
```

The end-to-end run starts the worker alongside the server, so uploads are
processed exactly as in production. Both suites use LibreOffice when it is
installed; without it, they expect Word and PowerPoint files to show as text only.

`tests/integration/tenant-isolation.test.ts` is the suite to keep green above all
others: it is the enforcement mechanism for the one property whose failure would
leak one student's work to another.

## Scripts

| Script                              | What it does                                        |
| ----------------------------------- | --------------------------------------------------- |
| `pnpm dev`                          | Development server.                                 |
| `pnpm dev:worker`                   | Background worker, restarting on changes.           |
| `pnpm build` / `pnpm start`         | Production build and server.                        |
| `pnpm worker`                       | Background worker, for production.                  |
| `pnpm typecheck`                    | Generates Next's route types, then `tsc --noEmit`.  |
| `pnpm lint`                         | ESLint, including the architectural boundary rules. |
| `pnpm format` / `pnpm format:check` | Prettier.                                           |
| `pnpm db:generate`                  | Writes a new SQL migration from a schema change.    |
| `pnpm db:migrate`                   | Applies pending migrations.                         |
| `pnpm db:studio`                    | Drizzle Studio.                                     |
| `pnpm db:reset`                     | Drops and recreates the schema. Development only.   |
| `pnpm storage:cors`                 | Allows an address to upload to the bucket.          |

## Project structure

```
src/
  app/                      routes only: pages, layouts, route handlers
    (auth)/                 sign-in, sign-up, password reset
    (app)/                  the signed-in application, behind the shell
  components/               ui/ primitives and shared/ layout pieces
  features/                 client components, grouped by feature
  server/
    actions/                "use server" entry points, one thin wrapper each
    modules/<name>/         service.ts, repository.ts, schemas.ts, domain/
    platform/               db, auth, email, storage, jobs, OCR, observability adapters
    lib/                    env, errors, ids, request context
  worker/                   the background worker process (pg-boss)
  proxy.ts                  security headers on every response
tests/
  integration/              services against real Postgres
  e2e/                      Playwright, desktop and mobile
docker/                     Dockerfile and local compose file
```

Search is Postgres full-text search (with the `pg_trgm` extension for
typo-tolerant titles), so it needs nothing beyond the database. The search
module owns no tables: each module searches its own data and the search service
combines the results.

Flashcard scheduling is FSRS through the MIT-licensed `ts-fsrs` library. The
scheduler is pure code in `src/server/modules/flashcards/domain`, used by the
server to record each rating and by the review screen to label the rating
buttons and show the next card without waiting.

Pictures on cards are uploaded straight to storage, then re-encoded by the
server with sharp (WebP, at most 1600 pixels, EXIF removed). Pages show them
through `/api/card-images/[imageId]`, which checks the session and redirects
to a short-lived signed URL. Image occlusion boxes are stored on the card as
fractions of the picture's size, one review item per box (ADR-021).

`eslint.config.mjs` turns those layers into rules: pages cannot reach into the
database, a module's domain functions cannot reach into anything, and a module's
internals cannot be imported from outside it. A boundary violation fails `pnpm
lint` rather than waiting to be noticed in review.

## Deployment

**[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) is the step-by-step guide** to
running StudyOS online on free plans: Vercel for the web app, Neon for
Postgres, Cloudflare R2 for files and Render for the worker.

`docker/Dockerfile` builds one image that runs two processes: the web server
(the default command) and the worker (`pnpm worker`). The image includes
LibreOffice for the worker. `docker/worker.Dockerfile` builds the worker alone,
for hosts that take one Dockerfile per service. Run `pnpm db:migrate` as a
release step before the new processes start; it also installs the job queue's
tables. Production needs `STORAGE_DRIVER=s3`: local storage only works when the
web server and the worker share a disk.

Where the worker's host sleeps while idle, set `WORKER_URL` on the web app and
`WORKER_PUBLIC_URL` on the worker: the app wakes the worker when a file is
uploaded, and the worker keeps itself awake while its queue has work.
