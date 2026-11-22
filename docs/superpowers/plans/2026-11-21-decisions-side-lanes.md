# Side lanes built beside Prep: decisions (branch build/selfhost-m35)

Milestone 35 (Self-host), tasks 27 to 40, built 2026-11-21 on `build/selfhost-m35`, cut from `docs/plans-2026-11-21` (9fdaeee). Each choice below took the recommended option, per the owner's instruction for these runs.

## Setup

- Worktree `.claude/worktrees/selfhost-m35`, its own `pnpm install`, `.env` with `APP_URL=http://localhost:3535` and the e2e database `jobsmith_m35_e2e` on the shared local Postgres. Unit and integration tests use PGlite in process.

## What was built and what was left out

Built: the environment inventory and its doc tables (27); the no-session route table (28); `GET /api/health` (29); standalone output behind `JOBSMITH_STANDALONE=1` plus tracing includes (30); `pnpm scripts:build` bundling `migrate`, `seed`, `import-applications` and `serve-check` into `commands/` (31); `docker-entrypoint.sh` and the schema-ahead check (32); the Dockerfile, `.dockerignore` and license collection (33); `deploy/compose.yaml`, `compose.ci.yaml`, `env.example`, the Caddyfile, Postgres 17 (34); `deploy/backup.sh` and `restore.sh` (35); `.github/workflows/image.yml` and the smoke script (37); `release.yml` with its tag and changelog scripts (38); `docs/self-hosting.md` (39); the health e2e spec, README section and `docs/self-hosting-install-record.md` (40).

Left out because their cycle is not built:

- Task 31: `scripts/tick.ts`, `scripts/scheduler.ts`, `lib/scheduler/loop.ts` and their tests, and the `feed-scan` bundle. Need Hosted milestone 11 (`lib/jobs/index.ts`) and Feed.
- Task 32: the pack registry load in `serve-check`. It takes an injected `loadPacks` hook for milestone 33 to pass.
- Task 34: the `scheduler` and `tts` services (a test asserts neither exists, so adding one forces a test update).
- Task 35: `scheduler` dropped from the stop and start commands.
- Task 36 whole: the systemd and launchd runner units. Need bridge-two milestone 31 (`jobsmith work`).
- Task 37: the 24 MB upload step (needs Debrief milestone 28; it fails on purpose once `app/api/debrief` exists) and the previous-release upgrade step (needs a first tag). Pack steps run only when `lib/packs` exists.
- Task 39: the guide marks the scheduler, packs, the speech container and the runner units as arriving later.

## Decisions

- `DEMO_MODE` stays in the variable inventory as its own row, marked as the demo sign-in. Reason: the code reads it; owner question 12 stays open.
- The `PACKS_DIR` row stays in the doc table with a note that it takes effect once packs ship. Reason: it shares a row with `SOURCE_URL`, `MIGRATE_ON_START` and `TICK_INTERVAL_MINUTES`.
- The health matcher exclusion is `api/health(?:/|$)`. Reason: lookalike paths such as `/api/healthcheck` still go through the proxy.
- With the database down, the health schema check reports "pending". Reason: the schema cannot be read then.
- Standalone output only when `JOBSMITH_STANDALONE` is exactly `1`. Reason: the Vercel build stays unchanged.
- Bundles get a require shim banner for CommonJS dependencies.
- `commands/` is git-ignored and eslint-ignored. Reason: it is generated, and linting it failed `pnpm lint`.
- Packages that ship no license file get their declared `package.json` license recorded (18 on today's tree). Reason: failing the build on them would block every image.
- The base image digest was read with `docker pull`; the plan's `docker buildx imagetools inspect` needs buildx, which this Mac lacks.
- `postgres:17-alpine` and `caddy:2-alpine` are digest-pinned; the app image follows `JOBSMITH_TAG`.
- Caddy runs with `cap_drop: ALL` plus `NET_BIND_SERVICE` and `no-new-privileges`; Postgres keeps its capabilities. Reason: its entrypoint needs `chown` and `gosu`.
- The dev `docker-compose.yml` moves to Postgres 17. Reason: the plan's single supported major; a developer with an old 16 volume runs `docker compose down -v` once.
- `POSTGRES_PASSWORD` is made with `openssl rand -hex 16`. Reason: base64 can add `+`, `/` and `=`, which break the database URL.
- Backups land in `deploy/backups/` (git-ignored); mode 600 by umask plus a warning `chmod`.
- Workflow actions pin by version tag, as `ci.yml` does. Reason: no invented commit SHAs.
- `playwright.config.ts` omits `webServer` when `E2E_EXTERNAL_SERVER=1`. Reason: `image.yml` runs the suite against the running container.
- `changelog-section` fails when `CHANGELOG.md` exists but lacks the version. Reason: a release must not ship empty notes.
- The guide's health check runs through `node`. Reason: the image has no `curl`.
- The install record is its own doc, `docs/self-hosting-install-record.md`. Reason: the README stays a summary and the pull request pastes the template.

## Known gaps to check on the first real run

- `backup.sh` writes the storage tarball as the container user into a host-owned `deploy/backups`; the first real round trip may hit a permission error.
- The image size against the 400 MB limit is unmeasured; the `node:24-slim` base alone is 352 MB.
- `app/icon.svg` and `app/apple-icon.png` are redirected to `/login` for signed-out requests (the proxy matcher does not exclude them). It belongs to Prep milestone 10's manifest rows, which are skipped here.

## Postponed

- Any `docker build`: this Mac has no `docker buildx`, so the legacy builder rejects `--mount`. Installing buildx is the owner's call.
- `image.yml` on a real pull request, and `release.yml`: GHCR publishing and the owner cutting `v0.9.0-rc.1` and `v0.9.0-rc.2` (README items 8 and 9).
- The live compose stack, HTTPS through Caddy, the Caddy directive confirmation and the Kokoro-FastAPI details (README items 10 to 13): need a Linux machine with a public name.
- The guide run by a person other than the owner.
- Preview deploy and the Chrome and Safari check; WebKit e2e locally (revision 2359 is not installed).
