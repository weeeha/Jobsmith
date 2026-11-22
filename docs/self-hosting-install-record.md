# Self-hosting install record

**TL;DR.** The stack, scripts, image definition and workflows are built and checked locally. Nothing has been built as an image, published, tagged or installed on a Linux machine yet. The live steps below are open and each names who has to do it.

This file is the checklist for the Milestone 35 done-when: someone other than the owner follows `docs/self-hosting.md` verbatim on a clean Linux machine with a domain and records the result. Fill in the open rows in the pull request, with the person's name left out unless they agree.

## Checked locally

| Check | How | State |
|---|---|---|
| Type check, lint, unit and integration tests | `pnpm typecheck && pnpm lint && pnpm test` | Passed on this branch (counts in the task report) |
| `/api/health` with no session, no cookie | `tests/e2e/health.spec.ts` against a normal build, Chromium | Passed on this branch |
| Compose file, Dockerfile, entrypoint, backup and restore scripts, workflows, release scripts | Static and scripted tests under `tests/unit` | Passed |
| Guide matches the environment inventory | `tests/unit/self-hosting-guide.test.ts` | Passed |

## Open live steps

| Step | Needs | State |
|---|---|---|
| Every step of `image.yml` green on the pull request | The pull request on GitHub, Docker on the runner | Open |
| Vercel preview answers `/api/health` with 200 and `ok`, board loads in Chrome and Safari | The pull request preview | Open |
| GHCR publishing for `ghcr.io/weeeha/jobsmith`, package public, `packages: write` | Owner, GHCR settings | Open |
| `v0.9.0-rc.1` signed tag cut on a `main` commit, then `v0.9.0-rc.2` after a visible change | Owner | Open |
| `docker buildx imagetools inspect ghcr.io/weeeha/jobsmith:0.9.0-rc.1` lists `linux/amd64` and `linux/arm64`, provenance and SBOM exist, no `latest` or `0.9` tag moved | After the tags | Open |
| Clean-machine install following the guide verbatim with `JOBSMITH_TAG=0.9.0-rc.1` | A person other than the owner, a Linux machine, a domain | Open |

## Install record (to fill in)

- Date and machine:
- Each step where the guide had to be bent (each is a guide bug to fix):
- App answered over HTTPS behind Caddy:
- First account created with `SETUP_TOKEN`:
- A job added:
- Last night's backup restored into a new stack with the same jobs:
- `JOBSMITH_TAG=0.9.0-rc.2` with `docker compose pull && docker compose up -d` kept the data:

## Left out of this milestone

Each of these waits on a milestone that is not on this branch. The guide marks where each would belong.

- Scheduler service: needs the hosted milestone's job runner (`lib/jobs`).
- `feed-scan` command: needs the feed milestone.
- The 24 MB upload step in the proxy: needs the debrief milestone.
- Local runner units: need the second bridge milestone (`jobsmith work`).
- The `tts` (Kokoro) service.
- Role packs and the `packs-check` command: need the packs milestone.
