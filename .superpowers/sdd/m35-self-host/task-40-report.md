# Task 40 report: End to end, docs and ship

Status: DONE_WITH_CONCERNS (live steps postponed by scope).

## Built
- `README.md` Deploying: summary of the stack, image, `/api/health`, backup and restore, first account; link to the install record.
- `docs/self-hosting-install-record.md`: what was checked locally, the open live steps with owners, the install-record template, and the left-out list.
- `tests/e2e/health.spec.ts`: no-cookie request to `/api/health`, expects 200, no `set-cookie`, status `ok`, checks database ok and schema current.
- `playwright.config.ts`: `health` added to the chromium, webkit and phone `testMatch`.
- `.env.example` and `docs/design-system.md`: confirmed, no change needed (`.env.example` already points to the guide and `deploy/env.example`; the design system doc has no self-host content).

## Tests
- `pnpm typecheck && pnpm lint && pnpm test`: pass. Vitest 162 files passed, 1 skipped; 1576 tests passed, 16 skipped.
- E2E on port 3535, database `jobsmith_m35_e2e`, Chromium: `--project=first-run --project=chromium -g "health|first"`: 5 passed (4 first-run, 1 health).
- `pnpm scripts:build`: built migrate, seed, import-applications, serve-check.
- `git diff --exit-code main -- tests/unit/__snapshots__/product-design-baseline.test.ts.snap`: no diff.
- Not run: the full `pnpm test:e2e` (contract: Chromium only, no WebKit revision 2359). Load was low (4 to 13) throughout.

## Plan fixes
None to the plan file. The brief's Step 5 commit message was used.

## Decisions
- Added the install record as its own doc rather than inside the README, so the README stays a summary and the pull request can paste the template.
- Health spec joined the chromium, webkit and phone projects (cheap, no session needed).

## Postponed
- `image.yml` green on a real pull request; Vercel preview check and Safari board check.
- GHCR publishing (item 8); owner cutting `v0.9.0-rc.1` and `-rc.2` (item 9); `imagetools inspect` check.
- Install by a second person on Linux with a domain (items 10, 11), including backup restore and rc.1 to rc.2 upgrade.
- Not on this branch: scheduler (Hosted 11), feed-scan (Feed), upload step (Debrief 28), runner units (Task 36, needs bridge-two 31), `tts` service, packs (milestone 33).

## Concerns
- No `docker build` ran on this Mac, so the image, compose stack and Caddy are covered by static tests only.
