# Jobsmith

Jobsmith is one app for a whole job search: find, qualify, apply, research,
prepare for each interview stage, debrief. It is open source under
AGPL-3.0 and self-hostable with your own database and, later, your own AI
provider key.

## Requirements

- Node.js 24 (see `.nvmrc`)
- pnpm
- Docker, for the local Postgres in `docker-compose.yml`

## First run

```bash
cp .env.example .env
```

Fill in `.env`:

- `DATABASE_URL`: leave the default if you use `docker-compose.yml`.
- `BETTER_AUTH_SECRET`: generate one with `openssl rand -base64 32`.
- `APP_URL`: required for local development and self-hosting. Use
  `http://localhost:3000` here. On Vercel it can be left unset for
  Preview, and for Production unless a custom domain is used, because the
  app derives it from Vercel's system environment variables.
- `SETUP_TOKEN`: generate one with `openssl rand -base64 24`. Until the
  first account exists, anyone who can reach a deployed instance can
  otherwise create that account; a production deployment with no
  `SETUP_TOKEN` set refuses to run first-run setup at all rather than
  allow that. Not required for local development.

**An instance reachable from the internet must have `SETUP_TOKEN` set
before it is deployed.**

The database scripts (`db:migrate`, `seed`, `reset-db`) load `.env`
themselves when the file exists, the same way `next dev` does. Then:

```bash
docker compose up -d
pnpm install
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000`. The first visit redirects to `/setup`, which
creates the only account this instance will accept until you set
`ALLOW_SIGNUP=true`.

## Deploying

On Vercel, the build command is `pnpm db:migrate && pnpm build` (see
`vercel.ts`): every deployment migrates the database before it builds.

Preview and Production must use separate databases. Sharing one means a
Preview deployment's migration can change the schema Production depends
on before Production is ready for it.

Migrations only move forward; there is no down migration. Rolling back a
deployment rolls back the code, not a schema change a later migration
already applied — a column removed or renamed in a migration is gone even
if a subsequent rollback brings back the code that expected it.

Use the provider's pooled connection string for `DATABASE_URL` (what the
app itself uses at runtime, many short-lived queries) and keep its direct,
unpooled connection string in `DATABASE_URL_UNPOOLED` for migrations,
which need a session-scoped advisory lock a pooled connection cannot hold
(see `scripts/migrate.ts`).

## Running behind a reverse proxy

The login rate limit keys on the client address, read from the
`X-Forwarded-For` header (`advanced.ipAddress.ipAddressHeaders` in
`lib/auth/index.ts`). A reverse proxy that sets that header to the real
client address is required for per-client limiting. On Vercel, the
platform sets it for you.

Without a reverse proxy, there is no `X-Forwarded-For` header, so every
visitor shares one counter instead of getting their own. So that this
configuration can't lock every visitor out after a handful of failed
sign-ins from anywhere, the sign-in limit automatically raises itself to
at least 30 attempts per minute whenever a request carries no
`X-Forwarded-For` header; behind a real reverse proxy, each client still
gets the tighter per-client limit below.

`AUTH_SIGNIN_MAX_PER_MINUTE` is optional and defaults to 5.

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Run the app locally |
| `pnpm build` | Production build |
| `pnpm start` | Run a production build |
| `pnpm typecheck` | Generate route types, then check them |
| `pnpm lint` | ESLint, then the token lint (`check:tokens`) |
| `pnpm check:tokens` | Fails on raw colors, palette classes or arbitrary values outside `components/ui` |
| `pnpm test` | Unit and integration tests (Vitest) |
| `pnpm test:e2e` | End-to-end tests (Playwright), resets the database first |
| `pnpm db:generate` | Generate a SQL migration from the schema |
| `pnpm db:migrate` | Apply migrations |
| `pnpm seed` | Create a fictional demo user and profile (only while no account exists) |
| `pnpm reset-db` | Drop and re-migrate a local database (refuses non-local hosts) |

Two more variables are read only by these scripts, never by the app itself:

- `ALLOW_DB_RESET=true`: required to confirm `pnpm reset-db`.
- `SEED_PASSWORD`: the password `pnpm seed` gives its demo user, instead of generating and printing a random one.

## Tests

`pnpm test` runs the unit and integration suite (Vitest).

`pnpm test:e2e` runs the end-to-end suite (Playwright), using the same
environment as First run. It needs the local Postgres running, resets it,
and starts its own server on port 3000, or on `PORT` when set, with a
matching `APP_URL`.

## Design system

Tokens, vendored primitives and the re-sync process are documented in
`docs/design-system.md`. `pnpm check:tokens` enforces the token rules
outside `components/ui`.

## License

AGPL-3.0-only. See `LICENSE`.

Outside pull requests are not merged until a contribution policy exists.
