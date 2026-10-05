# StudyOS

An AI-powered university study and knowledge-management platform. This repository
holds the application; the product and architecture documents live in the project's
shared folder.

**Current state: Phase 1 is complete.** Accounts, workspaces, the subject →
sections → topics knowledge structure, the application shell and settings are
built and tested. Documents, AI, quizzes, flashcards, past papers and the planner
are designed but not implemented — see `CURRENT STATUS.md` in the project
documentation for what exists and what does not.

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

## Getting started

```bash
pnpm install
cp .env.example .env            # then fill in the values below
docker compose -f docker/compose.yaml up -d
pnpm db:migrate
pnpm dev                        # http://localhost:3000
```

Create an account at `/sign-up`. In development no email is sent: verification
and password-reset links are printed to the server log, and email verification is
not required to sign in unless `RESEND_API_KEY` is set.

## Environment variables

`src/server/lib/env.ts` validates these at boot and refuses to start on bad
configuration, so a typo fails immediately rather than at the first request.

| Variable                                          | Required      | What it does                                                                                                  |
| ------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                    | yes           | Postgres connection string.                                                                                   |
| `BETTER_AUTH_SECRET`                              | yes           | Signs sessions. At least 32 characters: `openssl rand -base64 32`.                                            |
| `BETTER_AUTH_URL`                                 | yes           | The application's own base URL.                                                                               |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`       | no            | Google sign-in. The button appears only when both are set.                                                    |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | no            | Microsoft sign-in, same rule.                                                                                 |
| `RESEND_API_KEY`                                  | in production | Sends verification and reset emails. Without it they go to the log.                                           |
| `EMAIL_TRANSPORT`                                 | no            | `log` sends no email at all. Production accepts it only when set explicitly; it exists for test environments. |
| `EMAIL_FROM`                                      | no            | The From address on outgoing email.                                                                           |
| `LOG_LEVEL`                                       | no            | `info` by default.                                                                                            |

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

`tests/integration/tenant-isolation.test.ts` is the suite to keep green above all
others: it is the enforcement mechanism for the one property whose failure would
leak one student's work to another.

## Scripts

| Script                              | What it does                                        |
| ----------------------------------- | --------------------------------------------------- |
| `pnpm dev`                          | Development server.                                 |
| `pnpm build` / `pnpm start`         | Production build and server.                        |
| `pnpm typecheck`                    | Generates Next's route types, then `tsc --noEmit`.  |
| `pnpm lint`                         | ESLint, including the architectural boundary rules. |
| `pnpm format` / `pnpm format:check` | Prettier.                                           |
| `pnpm db:generate`                  | Writes a new SQL migration from a schema change.    |
| `pnpm db:migrate`                   | Applies pending migrations.                         |
| `pnpm db:studio`                    | Drizzle Studio.                                     |
| `pnpm db:reset`                     | Drops and recreates the schema. Development only.   |

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
    platform/               db, auth, email, observability adapters
    lib/                    env, errors, ids, request context
  proxy.ts                  security headers on every response
tests/
  integration/              services against real Postgres
  e2e/                      Playwright, desktop and mobile
docker/                     Dockerfile and local compose file
```

`eslint.config.mjs` turns those layers into rules: pages cannot reach into the
database, a module's domain functions cannot reach into anything, and a module's
internals cannot be imported from outside it. A boundary violation fails `pnpm
lint` rather than waiting to be noticed in review.

## Deployment

`docker/Dockerfile` builds one image. Phase 1 runs a single process from it
(`pnpm start`); the background worker will be a second process started from the
same image. Run `pnpm db:migrate` as a release step before the new processes
start.
