# Jobsmith Widen: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A software engineer, product manager or data scientist runs a search in their own profession's words, a stranger with Docker runs Jobsmith over HTTPS from one published image, and an outside contributor can send a pull request under a policy that keeps the owner's licensing options.

**Architecture:** Role vocabulary becomes data: one Zod-checked JSON file per pack (`jobsmith-pack/v1`) loaded from `packs/` and `PACKS_DIR` into a registry at boot, with the active pack read from two new `profile` columns and every stage label, column title, seniority list and prompt addendum taken from it. Stage kinds, their order and their rules stay in code. Self-hosting adds a multi-stage `Dockerfile` on Next's standalone output (behind `JOBSMITH_STANDALONE=1`), bundled commands behind `docker-entrypoint.sh`, `deploy/compose.yaml` with an in-process scheduler and optional Caddy and TTS profiles, a health route, backup and restore scripts, and GitHub Actions that build, smoke-test and publish the image. Opening the repo adds the contribution files, a license-grant CLA, CI checks for copy and licenses, public accessibility and performance statements backed by jobs, and the `v1.0.0` tag.

**Tech stack additions:** no new runtime dependency (spec section 10). Tooling pinned at install time, with the version recorded in the task report: `node:24-slim`, `postgres:17-alpine`, `caddy:2-alpine` (all by digest, read at the time of the task), `docker/setup-buildx-action`, `docker/build-push-action`, `docker/metadata-action`, `docker/login-action`, `contributor-assistant/github-action`, `github/codeql-action` (Actions by commit SHA). `esbuild` 0.28.2 is already a dev dependency. Kokoro-FastAPI's CPU image tag is not chosen here (see "Needs ... the owner's answer").

**Spec:** `docs/superpowers/specs/2026-11-01-jobsmith-widen-design.md`, all sections. Core spec sections 2, 3, 4 and 8 and the six cycle specs it builds on stay in force.

The plan is four milestone files: `m33-pack-engine.md` (tasks 1 to 16), `m34-packs.md` (17 to 26), `m35-self-host.md` (27 to 40) and `m36-open-the-repo.md` (41 to 52). A name, signature or copy string in this README is binding character for character.

## Status on 2026-11-21

**Already built (Core milestones 1 to 5 plus the demo sign-in; nothing from this spec):**
- Role-specific strings the audit in spec 5.1 finds, all real today: `lib/pipeline/kinds.ts` (`STAGE_KINDS` with `columnTitle` and `defaultLabel`), `lib/pipeline/rules.ts` (`defaultStages`, `planMove` rule 2, `placementIndex`), `lib/pipeline/create.ts`, `lib/pipeline/labels.ts` (`columnTitle`), `lib/pipeline/values.ts` (`STAGE_KIND_VALUES`), `lib/pipeline/stage-forms.ts` (`ADDABLE_STAGE_KINDS`), `lib/board/keys.ts`, `lib/board/optimistic.ts`, `lib/attention/load.ts` (`loadHome` columns), `lib/preferences/schema.ts` (`SENIORITY_LEVELS`), `lib/preferences/summary.ts`, `lib/demo/seed-jobs.ts` (`seedJobs`, six jobs, two with pay ranges), `scripts/seed.ts`, `app/(auth)/setup/{page,actions,setup-form}`, `app/(app)/board/actions.ts`, and the board and job components that import `STAGE_KINDS` or `columnTitle`.
- `lib/ai/extract-posting.ts` and `lib/ai/score-fit.ts` already name no profession; their `EXTRACT_INSTRUCTIONS` and `SCORE_INSTRUCTIONS` constants are module-private, so Task 1 reads them through the fake driver's recorded requests.
- `lib/db/schema/app.ts` (`profile`), `lib/db/scoped/profile.ts` (`get`, `upsert`), `lib/profile/index.ts` (`getProfile`, `saveProfile`), `lib/export/collect.ts` (`collectExport`, `EXPORT_VERSION`), `lib/bridge/context.ts` (`buildContextDocument`), `lib/fit/stored.ts` (`storedFitSchema`, `FIT_VERSION`), `lib/env.ts` (`parseEnv`, `EnvError`), `scripts/migrate.ts` (advisory lock `117642082805122`), `proxy.ts`, `vercel.ts`, `next.config.ts`, `.github/workflows/ci.yml`, `docker-compose.yml` (development Postgres 16), `cli/` with `CLI_VERSION`, `scripts/build-cli.mjs`.
- **Not built, and no trace on any branch:** `lib/packs`, `packs/`, `instrumentation.ts`, `Dockerfile`, `deploy/`, `/api/health`, every file named in spec section 3's module map, and all of the six earlier cycles.

**Depends on (earlier plans, folder `docs/superpowers/plans/2026-11-21-jobsmith-<name>`):**

| Milestone | Core alone? | Needs from another plan | What is left out if it has not shipped |
|---|---|---|---|
| 33 Pack engine | Yes, except one item | nothing for Tasks 1 to 16 | Hosted's `ROLE_PACK` lines for the product design pack's `prompts.generate` (Task 4 leaves them empty; Task 23 fills them) and `work_request.pack_id` (Task 24) |
| 34 Packs | Tasks 17 to 21 and 25 (the conventions half) | Task 22: hosted milestones 11 (`/signup`) and 12 (`/welcome`). Task 23: hosted milestone 13 (`lib/generate/tasks/*`) and 12 (`extract_resume`). Task 24: bridge-two milestone 31 (`lib/requests`, `work_request`). Task 25 "Copy a template": prep milestone 6 (Prep hub empty state) | Each of those tasks is skipped and named in the milestone pull request; the pack files still carry the fields (`prompts.generate`, `prompts.callCard`, `prompts.research`, `prep`) so nothing is rewritten later |
| 35 Self-host | Yes, except the scheduler wiring, upload smoke and two routes | Task 31 (`scripts/scheduler.ts` wiring): hosted milestone 11 (`lib/jobs`, tick). Task 28 rows for routes of later cycles only when their milestone has merged. Task 37 upload check: debrief milestone 28. Task 36: bridge-two milestone 31 (`jobsmith work`). `feed-scan` command: feed milestone 16 (`scripts/feed-scan.ts`). Storage variables `STORAGE_*`, `S3_*`: prep milestone 7 (`lib/storage`) | The `scheduler` command and compose service are left out, `feed-scan` is not bundled, the 24 MB upload step is not run, runner units are not written; each is named in the pull request |
| 36 Open the repo | Yes, except two rows | Task 50 Listen row of the perf budget: prep milestone 7 (cached case: prep milestone 10) | The Listen budget row and its `perf-seed` bank are left out; the board row and image row ship |

**Which milestones could be built on Core alone:** 33 (all of it but the two items above), 36 (all of it but the Listen row), and 35 (everything but the scheduler wiring, `feed-scan`, the upload smoke step and the runner units). 34 builds its pack files, seeds, `packs-check`, chips and conventions section on Core and needs the other plans for four tasks. Milestone 35 needs milestone 33 only for `PACKS_DIR` and `packs-check`.

**Needs an account, a paid service, hosting or the owner's answer** (the tasks each item blocks; "live check only" means the task runs on fakes or local files in CI and only its last step needs the item):

1. **Practitioner review of the three new packs' copy** (suggestion lists, addenda, section names; spec 5.3 and 11 item 1): one person who works in each of software engineering, product management and data. Blocks Task 20 (the pack files cannot be merged without their entries in `packs/reviews.json`), Tasks 21, 26. Task 19 writes the gate and the schema-valid fixture pack and runs without any review. The plan holds no pack copy.
2. **Product design pack's title suggestion lists** (spec 5.3, section 10): "cut to 12 each from the owner's Design Career Ops Web keyword lists", a repository outside this one. The product design pack's `prep.sections` (copy, fixed "in the Milestone 34 plan") is the same kind of answer. Blocks Task 4's suggestions and sections fields (shipped empty) and Task 21's chips and Task 25's template sections for product design; read from `packs/product-design.json` only.
3. **Hosted `ROLE_PACK` lines** for the product design pack (spec 5.3): they live in the unbuilt Hosted plan's task modules. Blocks Task 23.
4. **CLA choice and lawyer review** (spec 5.14, 11 item 5): the spec recommends a license-grant CLA and asks the owner to confirm it, and a lawyer reviews `CLA.md` before the first outside merge. Blocks Task 46 (live check) and the first outside merge in Task 52. Task 46 writes the files and the workflow with the CLA text as the Apache CLA 2.0 forms adapted per spec; the lawyer's review is a recorded gate in Task 52.
5. **Project email address and its domain** (spec 5.14, 11 item 5): one address on a domain the owner controls, no personal address in the repo. Blocks the address line in Tasks 45 (config.yml, MAINTAINERS), 47 (`CODE_OF_CONDUCT.md`, `SECURITY.md`) and the 7-day conduct reply. Every place holds the marker text `PROJECT_EMAIL_NOT_SET` until the owner runs `node scripts/set-project-email.mjs <address>` (Task 45); Task 52's check fails while the marker exists. The CLA licensee name works the same way with the marker `CLA_LICENSEE_NOT_SET` (Task 46).
6. **Private signatures repo and its token for CLA Assistant Lite**; GitHub settings: private vulnerability reporting, Dependabot alerts, branch protection on `main` with the build, e2e, image and CLA checks required (spec 5.14 owner's list). Blocks Tasks 46, 47, 52 (live check only).
7. **A second GitHub account for the CLA flow test** (spec 8 "Once"): blocks Task 52 only.
8. **GHCR publishing** (`ghcr.io/weeeha/jobsmith`, package visibility public, workflow permission `packages: write`): blocks Task 38 (live check) and Task 40's upgrade test. Both `v0.9.0-rc.1` and `v0.9.0-rc.2` tags are cut by the owner (spec 11 item 10).
9. **The `v1.0.0` tag, signed, cut by the owner** after Task 52's done-when passes. Nothing in this plan tags.
10. **The person other than the owner who runs the self-host guide** on a clean Linux machine with a domain pointing at it (spec section 1 success criteria; milestone 35 done-when). Blocks Task 40 and the Milestone 35 pull request's recorded install.
11. **A Linux machine with a public IP and DNS name** for the Caddy HTTPS check (live check in Tasks 34, 40) and Docker Engine 24 or newer with Compose v2 on the executor's machine for Tasks 33 to 35 and 37 (local `docker build`).
12. **Kokoro-FastAPI details "confirmed in the Milestone 35 plan"** (spec 5.7, 11 item 7): CPU image name, tag by digest, port (spec: 8880), voices and memory use. Task 34 holds a confirm step and a constant `KOKORO_IMAGE` in `deploy/compose.yaml`; the plan invents no tag. Blocks Task 34's `tts` profile check and Task 39's TTS section (live check only; the profile can be written with the confirmed value and run later).
13. **Caddy directives confirmed against Caddy's current docs** (spec 5.8 "The Milestone 35 plan confirms each directive"): Task 34 holds the confirm step (network access to Caddy docs).
14. **The banned word list for `check:copy`** (spec 5.14: "the owner's writing rules ... the banned word list"). The list lives outside this repo. Task 41 reads it from `scripts/check-copy.words.json`, which the owner supplies; the dash, exclamation and "not X but Y" rules need no list. Blocks Task 41's word rule (live check only; the tests use a planted word).
15. **Super AI Components repo needs a LICENSE** (spec 5.14 owner's list) so `THIRD_PARTY_NOTICES.md` can list it "once licensed": Task 42 writes that row as `omitted until licensed` behind a constant.
16. **Check the Jobsmith name for trademark conflicts** (spec 5.14 owner's list): the README Trademarks line in Task 51 is written as the spec words it; the check itself is the owner's.
17. **npm package name for the CLI** (spec 11 item 13): npm publishing stays out; the CLI file ships on GitHub Releases only (Task 38).
18. **DEMO_MODE** is read by `lib/env.ts` today and is absent from the spec's table of 60 (see "Spec ambiguities"); Task 27 documents it as a 61st row. The owner confirms or removes it.

The spec asks for Figma drafts before each milestone plan. None were made for this plan.

## Global Constraints

Carried from the earlier milestone plans, still applying: git config untouched; public repo hygiene; Next.js 16 docs under `node_modules/next/dist/docs/` read before any Next API (the worktree has no `node_modules`; use the parent checkout's); `app/` and `components/` never import `@/lib/db/client` (ESLint enforces it); `lib/pipeline` owns stage and status writes; typed `Result`; test first under `lib/`; semantic token utilities only and `pnpm check:tokens`; registry item, then `base-nova` primitive, then new code recorded in `docs/design-system.md`; accessibility and axe zero violations in light and dark; no exclamation marks in UI copy; commit trailer from the session; `requireUser()` in every page and action; times through `LocalTime`; forms through `lib/forms/submit.ts` with try/catch and toast and focus fallbacks; Select `items`; `React.useId()` ids; `break-words` on long strings; explicit Zod messages from the frame; comments state reasons and never cite decision ids; e2e specs share one account, name fixtures with project plus suffix, and scan open overlays with `scanOpenOverlay`.

Widen additions:

- Never commit to or push `main`. One branch per milestone, cut from `main`: `feat/m33-pack-engine`, `feat/m34-packs`, `feat/m35-self-host`, `feat/m36-open-the-repo`.
- `requireUser()` in every page, action and handler. The one exception is `GET /api/health`, which serves no user data and takes no session (spec section 3).
- `app/` and `components/` never import the database client. Every `lib/*` function takes a database handle and a user id (`Scoped`); `lib/health` takes a `Db` because it serves no user.
- Single writers: `lib/packs/choose.ts` for `profile.pack_id` and `profile.pack_version` (nothing else passes those keys to `s.profile.upsert`, whose input type drops them in Task 2); `lib/pipeline` for every stage write (labels from a pack reach it only through `StageVocabulary`).
- Typed `Result` (`lib/result.ts`: `ok`, `fail(code, message)`) for expected failures; `PackError` and `EnvError` for boot failures.
- Test first under `lib/`. Product design snapshots are taken in Task 1, the first commit of milestone 33, and the snapshot file is never edited afterwards (Task 16 runs `git diff --exit-code` on it).
- No test touches the network. Image, compose, backup and Caddy checks run in `image.yml` or by hand on a Docker machine, never in `pnpm test`.
- Fixtures are fictional (Northwind Traders, fictional people) and carry no pay figures. Seeds in packs have no pay fields (Core principle 6). No key-like literals in tests: build keys at runtime as `"k".repeat(24)`.
- Pack files are operator configuration with the trust of code: only `PACKS_DIR` or the repo adds one; the app never accepts one from a user.
- Copy that the spec fixes is in the Contract below and changes only with a maintainer's review. Pack copy written by a practitioner is never edited by an executor except to fit a schema limit, and then the practitioner re-reviews.
- Public prose (docs, templates, policy): no em dashes, no en dashes, no exclamation marks, no "not X but Y" constructions (the later `pnpm check:copy` enforces this on `copy.ts`, `messages.ts`, `content/` and `docs/`).
- Semantic token utilities and `pnpm check:tokens`; axe zero violations in light and dark; every new owned table gets a file under `lib/db/scoped/` and a row in the isolation test. Widen adds no table; its one scoped addition is `profile.setPack` with its isolation row (Task 2).
- Migrations only move forward (README, Deploying). The generated migration file keeps drizzle's own name; do not hand-number it.
- Workflows pin Actions by commit SHA and images by digest, read at the time of the task (spec section 7). No update check and no outbound call to the owner from the image.

## Review Focus

1. **Product design must not change.** The snapshot file from Task 1 is the proof: labels, columns, seniority, `EXTRACT_INSTRUCTIONS`, `SCORE_INSTRUCTIONS`, `scorePrompt`, default stages. Pinned by Task 1 (taken), Task 7 (labels and `planMove`), Task 12 (empty addendum appends nothing) and Task 16 (`git diff --exit-code`).
2. **A switch rewrites nothing.** After `choosePack` new jobs use the new labels while older stages keep theirs and show as chips; a move to a missing kind uses the active pack's label; no score, document or preference changes. Pinned by Task 7 (integration), Task 9 (chip rule), Task 14 (dialog copy) and Task 16 (e2e).
3. **A bad pack file silently dropping users to product design.** A `PACKS_DIR` file that fails the schema, shares an id or sits in an unreadable directory must stop boot naming the file; a missing active pack falls back with a notice and writes nothing. Pinned by Task 5 (registry), Task 6 (boot check and fallback) and Task 37 (broken pack file fails container start).
4. **An operator value baked into the public image.** Placeholder `DATABASE_URL`, `BETTER_AUTH_SECRET` and `APP_URL=http://build.invalid` exist only in the build stage and a grep with its own planted positive proves they are absent. Pinned by Task 33 (build stage) and Task 37 (grep and its planted test).
5. **A route that answers without a session being redirected to `/login`.** Probes, webhooks and uploads would fail by redirect. Pinned by Task 28 (`proxy.ts` against the table) and Task 37 (every route called with no cookie).

## Module map

**Milestone 33**

| File | New/changed | One responsibility |
|---|---|---|
| `tests/unit/product-design-baseline.test.ts`, `tests/integration/product-design-seed-baseline.test.ts`, their `__snapshots__`, `tests/fixtures/pack-baseline/score-input.ts` | new | the pre-refactor snapshots |
| `lib/db/schema/app.ts`, new migration, `lib/db/scoped/profile.ts` | changed | `profile.pack_id`, `profile.pack_version`, `setPack`, `upsert` drops the pack keys |
| `lib/packs/schema.ts` | new | the `jobsmith-pack/v1` Zod schema, limits, `Pack`, `parsePack` |
| `packs/product-design.json`, `packs/schema.json`, `packs/pack-hashes.json`, `scripts/packs-schema-json.ts`, `scripts/packs-hash.ts` | new | the product design pack with its seed, generated editor schema, append-only hash guard data |
| `lib/packs/builtin.ts` | new | the bundled packs as imported modules |
| `lib/packs/files.ts`, `lib/packs/registry.ts` | new | `PACKS_DIR` reader, `PackError`, registry with duplicate-id check and the `[packs]` log |
| `lib/packs/active.ts` | new | active pack with fallback and notices |
| `instrumentation.ts` | new | boot checks: `env()` and the registry |
| `lib/packs/vocabulary.ts` | new | `StageVocabulary`, visible kinds, digits (client-safe) |
| `lib/pipeline/kinds.ts`, `rules.ts`, `create.ts`, `move.ts`, `labels.ts`, `values.ts`, `stage-forms.ts` | changed | kinds stay in code; labels and titles come from the vocabulary |
| `lib/board/keys.ts`, `lib/board/optimistic.ts`, `lib/attention/load.ts`, `app/(app)/board/page.tsx` | changed | vocabulary through board data |
| `components/board/*`, `app/(app)/board/actions.ts` | changed | vocabulary prop on board, card, menus, sheet, Add job |
| `components/job/edit-stages-dialog.tsx`, `stage-detail-sheet.tsx`, `app/(app)/jobs/[slug]/page.tsx` | changed | vocabulary on the job page |
| `lib/preferences/schema.ts`, `summary.ts`, `components/preferences/preferences-form.tsx`, `app/(app)/preferences/page.tsx` | changed | `SENIORITY_VALUES` superset, pack levels |
| `lib/packs/prompts.ts`, `lib/ai/extract-posting.ts`, `lib/ai/score-fit.ts`, `lib/intake/resolve.ts`, `lib/intake/add-job.ts`, `lib/fit/score-opportunity.ts`, `lib/fit/test-posting.ts`, `lib/fit/stored.ts` | new/changed | addenda, `fit.pack`, `created` event `meta.pack` |
| `lib/packs/choose.ts`, `app/(auth)/setup/*` | new/changed | `choosePack`, the setup select |
| `components/settings/pack-section.tsx`, `components/settings/pack-switch-dialog.tsx`, `app/(app)/settings/*` | new/changed | Role pack section, switch dialog, notices |
| `lib/export/collect.ts`, `lib/bridge/context.ts`, `lib/bridge/handlers.ts` | changed | `profile.pack`, `pack:` frontmatter |

**Milestone 34**

| File | New/changed | One responsibility |
|---|---|---|
| `lib/packs/seed.ts`, `lib/demo/seed-jobs.ts`, `scripts/seed.ts` | new/changed | `seedPackJobs`, `seed --pack`, pay removed from the product design seed |
| `lib/packs/check.ts`, `scripts/packs-check.ts`, `package.json` | new/changed | `packs-check`, `--repo` mode |
| `packs/reviews.json`, `tests/unit/pack-review-gate.test.ts`, `tests/fixtures/packs/valid-full.json` | new | review gate and the schema-valid fixture pack |
| `packs/software-engineering.json`, `packs/product-management.json`, `packs/data.json` | new | the three packs |
| `components/preferences/preferences-form.tsx`, `components/chip-field.tsx` | changed | suggestion chips |
| `app/(app)/welcome/*`, `app/(auth)/signup/*` | changed (from hosted milestones 11, 12) | pack step, `?pack=` |
| `lib/generate/tasks/*` | changed (from hosted milestone 13) | pack audience lines, counts, sections |
| `lib/requests/*` | changed (from bridge-two milestone 31) | `pack_id` snapshot, bundle addenda |
| `lib/packs/template.ts`, `lib/bridge/context.ts`, Prep hub (from prep milestone 6) | new/changed | "Copy a template", conventions section |

**Milestone 35**

| File | New/changed | One responsibility |
|---|---|---|
| `lib/env.ts`, `lib/ai/config.ts`, `lib/auth/policy.ts`, `lib/packs/files.ts`, `.env.example`, `tests/helpers/env-inventory.ts`, `tests/fixtures/env-inventory.ts` | changed/new | `ENV_NAMES` and the inventory test |
| `tests/fixtures/no-session-routes.json`, `proxy.ts` | new/changed | the 5.8 route table and its unit test |
| `lib/health/check.ts`, `lib/health/schema.ts`, `app/api/health/route.ts` | new | database and schema checks |
| `next.config.ts` | changed | standalone behind the flag, tracing includes |
| `scripts/build-scripts.mjs`, `scripts/{tick,scheduler,packs-check,feed-scan}.ts`, `lib/scheduler/loop.ts` | new | bundled commands, the sleep-and-call loop |
| `docker-entrypoint.sh`, `scripts/serve-check.ts` | new | command dispatch, schema-ahead refusal |
| `Dockerfile`, `.dockerignore`, `scripts/licenses-collect.mjs` | new | the image and `THIRD_PARTY_LICENSES.txt` |
| `deploy/compose.yaml`, `deploy/compose.ci.yaml`, `Caddyfile`, `env.example`, `packs/.gitkeep`, `docker-compose.yml`, `.github/workflows/ci.yml` | new/changed | compose (plus a CI-only override that publishes two loopback ports) and Postgres 17 everywhere |
| `deploy/backup.sh`, `deploy/restore.sh` | new | backup and restore |
| `deploy/runner/*` | new | systemd user unit, launchd agent |
| `.github/workflows/image.yml`, `scripts/image-smoke.mjs` | new | image checks |
| `.github/workflows/release.yml`, `scripts/release-tags.mjs`, `scripts/changelog-section.mjs`, `scripts/check-version.mjs` | new | tag-driven publish and its helpers |
| `docs/self-hosting.md`, `README.md` | new/changed | the guide, the env table |

**Milestone 36**

| File | New/changed | One responsibility |
|---|---|---|
| `scripts/check-copy.mjs`, `scripts/check-copy.words.json` | new | `pnpm check:copy` |
| `scripts/check-licenses.mjs`, `scripts/licenses-allowlist.json`, `THIRD_PARTY_NOTICES.md` | new | `pnpm check:licenses`, notices |
| `eslint.config.mjs` | changed | inline `"use server"` rule |
| `lib/source-url.ts`, `components/source-link.tsx`, login page, Settings | new/changed | AGPL source link |
| `CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/*`, `.github/pull_request_template.md`, `MAINTAINERS.md`, `CODEOWNERS`, `scripts/set-project-email.mjs` | new | contribution surface |
| `CLA.md`, `.github/workflows/cla.yml` | new | CLA and its workflow |
| `CODE_OF_CONDUCT.md`, `SECURITY.md`, `.github/workflows/codeql.yml`, `.github/dependabot.yml`, `.github/workflows/changelog.yml`, `CHANGELOG.md` | new | conduct, security, supply chain, changelog |
| `docs/releasing.md`, `scripts/bump-version.mjs`, `package.json`, `.nvmrc`, `cli/package.json`, `cli/src/version.ts` | new/changed | releases, Node 24 |
| `docs/accessibility.md`, `tests/e2e/keyboard-*.spec.ts` | new | statement and keyboard flows |
| `playwright.config.ts`, `tests/perf/*`, `scripts/perf-seed.ts`, `docs/performance.md`, `.github/workflows/perf.yml` | new/changed | perf project and budgets |
| `README.md`, `.github/workflows/ci.yml` | changed | Firefox smoke, README updates |

## Contract

**Pack schema (`lib/packs/schema.ts`).** Strict (unknown key fails), at most `PACK_MAX_BYTES = 64 * 1024` bytes of file.

```ts
export const PACK_SCHEMA_ID = "jobsmith-pack/v1";
export const PACK_MAX_BYTES = 64 * 1024;
export const PACK_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const PACK_LIMITS = {
  idMin: 3, idMax: 40, versionMin: 1, versionMax: 9999, nameMax: 40, descriptionMax: 160,
  labelMax: 40, columnMax: 24, seniorityMin: 2, seniorityMax: 9, seniorityLabelMax: 24,
  suggestionsMax: 12, suggestionMax: 80,            // 80 = LIST_ENTRY_MAX of Preferences
  extractScoreAddendumMax: 1000, generateAddendumMax: 1500,   // generate fields, callCard, research
  questionCountMin: 4, questionCountMax: 20, sectionsMax: 8, sectionNameMax: 60,
  seedJobsMax: 8, seedPeopleMax: 3, seedNotesMax: 2, seedNoteMax: 300, inDaysMin: 1, inDaysMax: 14,
} as const;
export type PackStage = { label: string; column: string; hidden: boolean };
export type PackSeedJob = {
  company: string; roleTitle: string; location: string; workMode: WorkMode; stage: StageKind;
  schedule?: { inDays: number; format: StageFormat };
  people?: { name: string; role: PersonRole; title?: string }[];
  notes?: string[]; closed?: ClosedReason;
};
export type Pack = {
  schema: typeof PACK_SCHEMA_ID; id: string; version: number; name: string; description: string;
  stages: Record<StageKind, PackStage>;
  seniority: { value: Seniority; label: string }[];
  titleSuggestions: string[]; titleExcludeSuggestions: string[];
  prompts: { extractPosting: string; scoreFit: string;
    generate: { fitBrief: string; tailoredCv: string; coverLetter: string; questionBank: string };
    callCard: string; research: string };
  prep: { questionCounts: Record<MiddleKind, number>; sections: Record<MiddleKind, string[]> };
  seed?: { headline: string; jobs: PackSeedJob[] };
};
export type PackIssue = { path: string; message: string };
export function parsePack(raw: unknown): { ok: true; pack: Pack } | { ok: false; issues: PackIssue[] };
export function packRef(pack: Pick<Pack, "id" | "version">): string;   // "software-engineering@1"
```

Schema rules the parser applies: all `prompts` strings default to `""`; `hidden` defaults to `false`; `saved`, `applied` and `offer` must have label and column equal to `Saved`, `Applied`, `Offer` and `hidden: false`; stage labels unique within a pack ignoring case; at least one of the four middle kinds not hidden; seniority values unique and from `SENIORITY_VALUES`; `seed.jobs[].stage` is any of the seven kinds; the schema has no pay fields. Issue messages are exact strings the tests assert (Task 3).

**Kinds (`lib/pipeline/kinds.ts`, Task 7).**

```ts
export const STAGE_KIND_LIST = ["saved", "applied", "recruiter_screen", "hiring_manager", "portfolio_case", "panel_final", "offer"] as const;
export type StageKind = (typeof STAGE_KIND_LIST)[number];
export const FIXED_KINDS = ["saved", "applied", "offer"] as const;
export const MIDDLE_KINDS = ["recruiter_screen", "hiring_manager", "portfolio_case", "panel_final"] as const;
export type MiddleKind = (typeof MIDDLE_KINDS)[number];
```

**Seniority (`lib/preferences/schema.ts`, Task 11).**

```ts
export const SENIORITY_VALUES = ["junior", "mid", "senior", "staff", "principal", "lead", "manager", "director", "executive"] as const;
export type Seniority = (typeof SENIORITY_VALUES)[number];
export const GENERIC_SENIORITY_LABELS: Record<Seniority, string>;  // Junior, Mid, Senior, Staff, Principal, Lead, Manager, Director, Executive
```

**Vocabulary (`lib/packs/vocabulary.ts`, client-safe: imports types only).**

```ts
export type StageVocabulary = { packId: string; packVersion: number;
  stages: { kind: StageKind; label: string; column: string; hidden: boolean }[] };   // all seven, kind order
export function vocabularyOf(pack: Pack): StageVocabulary;
export function labelFor(v: StageVocabulary, kind: StageKind): string;
export function columnFor(v: StageVocabulary, kind: StageKind): string;
export function visibleKinds(v: StageVocabulary): StageKind[];                       // kind order, hidden dropped
export function boardColumns(v: StageVocabulary, cardKinds: readonly StageKind[]): StageKind[];   // visible, plus a hidden kind while a card sits in it
export function digitKind(v: StageVocabulary, digit: number): StageKind | null;     // digits number visible columns only
```

**Registry and active pack (Tasks 5, 6).**

```ts
export class PackError extends Error {}                    // name "PackError"; message: the file name, ": ", then up to five "<path>: <message>" issues joined by "; "
export type LoadedPack = { pack: Pack; source: "builtin" | { file: string } };
export type PackRegistry = { list(): LoadedPack[]; get(id: string): LoadedPack | undefined };
export function loadRegistry(options: { dir?: string; builtins?: Pack[] }): PackRegistry;   // throws PackError
export function getRegistry(): PackRegistry;                // memoized; reads PACKS_DIR once per process
export const DEFAULT_PACK_ID = "product-design";
export type ActivePack = { pack: Pack; storedId: string; storedVersion: number; fallback: boolean };
export async function getActivePack(s: Scoped): Promise<ActivePack>;   // no profile row reads as the defaults
export type PackNotice = { kind: "missing"; packId: string; message: string } | { kind: "updated"; packId: string; version: number; message: string };
export function packNotices(active: ActivePack): PackNotice[];
export const PACK_ENV_NAMES: readonly ["PACKS_DIR"];       // also exported as ENV_NAMES from lib/packs/files.ts
// lib/packs/choose.ts
export async function choosePack(s: Scoped, packId: string): Promise<Result<{ packId: string; packVersion: number }, "unknown_pack">>;
// lib/packs/prompts.ts
export function withAddendum(instructions: string, addendum: string): string;   // addendum.trim() === "" returns instructions; else instructions + "\n\n" + addendum.trim()
```

**Tables and columns.**
- `profile.pack_id` text not null default `'product-design'`, check `profile_pack_id_format`: `pack_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(pack_id) BETWEEN 3 AND 40`. `profile.pack_version` integer not null default 1, check `profile_pack_version_min`: `pack_version >= 1`. No foreign key.
- `work_request.pack_id` text nullable, same format check `work_request_pack_id_format` (Task 24, table from bridge-two milestone 31).
- Scoped helper: `s.profile.setPack(packId: string, packVersion: number): Promise<ProfileRow>`, one `INSERT ... ON CONFLICT DO UPDATE` statement setting both columns (the single writer's only caller is `choosePack`).
- Documents: `opportunity.fit.pack` optional string `"<id>@<version>"` (`FIT_VERSION` stays 1); `event.meta.pack` on `created`; context frontmatter line `pack: <id>@<version>`; export `profile.pack { id, version }` with `EXPORT_VERSION` plus one.

**Exact UI copy (spec-fixed; other strings are plan copy marked in the tasks).**
- Setup select label: `Roles you're looking for`. Settings section heading and list: `Role pack`.
- Switch dialog lines: `Board columns are renamed now`, `Jobs you already have keep their stages, scores and documents`; buttons `Cancel`, `Switch`.
- Update notice: `The Software engineering pack was updated to version 2.` (pattern `The <name> pack was updated to version <n>.`).
- Missing pack: `The role pack 'sales' is not installed here. Using Product design until it is.`
- Seedless pack: `The pack 'sales' has no demo data.` (exit 1).
- Boot failure: `PackError: sales.json: stages.panel_final.column: at most 24 characters`.
- Template (Prep hub): button `Copy a template`; instruction line under each section: `Write questions here as `### 1. "Question"` followed by **Say:** and **Spine:**.`
- Source link text: `Source code`.
- Schema ahead: `Database schema is newer than this version (applied 41, known 38). Restore a backup or run a newer image.` (the numbers are runtime values).
- Bug template box: `I removed company names, people and document text`.

**Health (`GET /api/health`, Task 29).** `Cache-Control: no-store`; body `{ "status": "ok" | "down", "version": string, "checks": { "database": "ok" | "down", "schema": "current" | "pending" | "ahead" } }`; 200 when every check is ok (`database: ok`, `schema: current`), else 503. `lib/health/check.ts`: `export async function runHealth(db: Db, journalCount: number, version: string): Promise<HealthBody>`. Statement timeout 1.5 s on the database check.

**Env names (spec 5.11 table, 60 variables; `tests/fixtures/env-inventory.ts` holds them in this order).**
`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `BETTER_AUTH_SECRET`, `APP_URL`, `SETUP_TOKEN`, `ALLOW_SIGNUP`, `AUTH_SIGNIN_MAX_PER_MINUTE`, `AI_PROVIDER`, `AI_GATEWAY_API_KEY`, `ANTHROPIC_API_KEY`, `AI_MODEL`, `AI_MODEL_WRITE`, `TTS_PROVIDER`, `TTS_BASE_URL`, `TTS_API_KEY`, `TTS_MODEL`, `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`, `TRANSCRIBE_PROVIDER`, `TRANSCRIBE_BASE_URL`, `TRANSCRIBE_API_KEY`, `TRANSCRIBE_MODEL`, `TRANSCRIBE_MAX_MB`, `TRANSCRIBE_TIMEOUT_S`, `STORAGE_PROVIDER`, `STORAGE_LOCAL_DIR`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`, `BLOB_READ_WRITE_TOKEN`, `HOSTED`, `EMAIL_PROVIDER`, `EMAIL_FROM`, `SMTP_URL`, `RESEND_API_KEY`, `BILLING_PROVIDER`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STANDARD`, `STRIPE_PRICE_PLUS`, `ADMIN_EMAILS`, `LEGAL_OPERATOR`, `LEGAL_CONTACT_EMAIL`, `LEGAL_HOSTING`, `SIGNUP_INVITE_CODE`, `CREDITS_GLOBAL_DAILY_CAP`, `CRON_SECRET`, `NOTIFY_CHANNELS`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_UPDATES`, `TELEGRAM_WEBHOOK_SECRET`, `FEED_SCAN`, `FEED_SCORES_PER_DAY_MAX`, `PACKS_DIR`, `SOURCE_URL`, `MIGRATE_ON_START`, `TICK_INTERVAL_MINUTES`.

Compose and Caddy only: `POSTGRES_PASSWORD`, `JOBSMITH_DOMAIN`, `ACME_EMAIL`, `JOBSMITH_TAG`. Build only: `JOBSMITH_STANDALONE`, `JOBSMITH_VERSION`, `JOBSMITH_COMMIT`, `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`. Not set by an operator (the test's ignore list): `VERCEL`, `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_GIT_COMMIT_SHA`, `NODE_ENV`, `PORT`, `HOSTNAME`, `NEXT_TELEMETRY_DISABLED`, `ALLOW_DB_RESET`, `SEED_PASSWORD`, `JOBSMITH_LIVE_AI`, `CI`, `EMAIL_FAKE_DIR`, `TRANSCRIBE_FAKE_WAIT_MS`, `FEED_FETCH`, `FEED_FIXTURES`, `FEED_LIVE_GREENHOUSE_ORG` and its Lever and Ashby siblings, `JOBSMITH_URL`, `JOBSMITH_TOKEN`, `JOBSMITH_STT_URL`, `XDG_CONFIG_HOME`, `XDG_STATE_HOME`. Extra, found in code and missing from the spec's table: `DEMO_MODE` (Task 27).

**Image and commands (Tasks 31 to 33).**
- Build stage env: `JOBSMITH_STANDALONE=1`, `NEXT_TELEMETRY_DISABLED=1`, placeholders `DATABASE_URL`, `BETTER_AUTH_SECRET`, `APP_URL=http://build.invalid`.
- Runtime env: `NODE_ENV=production`, `PORT=3000`, `HOSTNAME=0.0.0.0`, `NEXT_TELEMETRY_DISABLED=1`, `STORAGE_LOCAL_DIR=/data/storage`; build args `JOBSMITH_VERSION`, `JOBSMITH_COMMIT`; OCI labels `source`, `version`, `revision`, `licenses=AGPL-3.0-only`; user `node` (uid 1000) owns `/data`.
- `HEALTHCHECK`: Node one-liner against `/api/health`, interval 30 s, timeout 5, start period 60, retries 3. Budget: 400 MB uncompressed (amd64). Healthy within 20 s of start on a migrated database.
- `docker-entrypoint.sh` commands: `serve` (default), `migrate`, `seed [--pack <id>]`, `scheduler`, `tick`, `feed-scan`, `packs-check <file>`, `import-applications <file> [--email] [--dry-run]`; an unknown command prints the list and exits 64. `serve` runs `migrate` unless `MIGRATE_ON_START=false`, then `exec node server.js`.
- `.dockerignore` drops `.env*`, `.git`, `node_modules`, `.next`, `tests`, `docs`, `.claude`, `.superpowers`, `cli/dist`.
- Scheduler: `TICK_INTERVAL_MINUTES` default 15 (5 to 60), plus up to 60 seconds of jitter; calls the tick function in process with trigger `cron`; log line `[scheduler]` with steps, counts and milliseconds; SIGTERM stops after the current step within 30 seconds.
- Compose: `app`, `postgres` (`postgres:17-alpine` by digest, user and database `jobsmith`, `${POSTGRES_PASSWORD:?}`), `scheduler`, profile `proxy` (`caddy:2-alpine`), profile `tts`; `stop_grace_period: 30s`; `read_only: true`, tmpfs `/tmp` and `/app/.next/cache`, `cap_drop: [ALL]`, `no-new-privileges`; no host port (commented `127.0.0.1:3000:3000`).
- Caddyfile: the block in spec 5.8, verbatim.
- Backups: `./backups/`, UTC timestamps, `umask 077`, `KEEP_DAYS` default 14, `15 3 * * *`; `restore.sh <dump> <tar>`.

**No-session route table (spec 5.8) as data in `tests/fixtures/no-session-routes.json`:** entries `{ "path", "method", "ships": "<cycle>", "why", "check" }` for exactly the eight rows of the spec table; a route is "in the matcher exclusion" or "in PUBLIC_PATHS".

**Contribution constants.** Allowed licenses: MIT, MIT-0, ISC, 0BSD, BSD-2-Clause, BSD-3-Clause, Apache-2.0, BlueOak-1.0.0, CC0-1.0, MPL-2.0, LGPL-2.1-or-later, LGPL-3.0, AGPL-3.0, and OFL-1.1 for fonts. Refused: GPL-2.0-only, SSPL, BUSL, Commons Clause, non-commercial licenses, no license. Security timings: acknowledgment 3 business days, triage 7 days, fix 14 days (critical) and 30 (high), disclosure at the fix or after 90 days; conduct reply within 7 days. PR size: about 400 changed lines outside tests and snapshots.

**Log lines.** `[packs]` one per boot: ids, versions and sources (`builtin` or the file name), never prompt text. `[scheduler]` as above. Health logs only failures.

**Performance budgets (spec 5.17), `tests/perf/budgets.json`.** `/board` cold: JavaScript transferred at most 220 KB compressed, LCP at most 2.0 s, document response at most 500 ms. Keyboard move: new column within 100 ms, server confirm within 800 ms. Listen (40-question bank): JavaScript at most 160 KB compressed, first audible step within 300 ms (cached) and 1 s (uncached), gaps within 100 ms of 0.6 and 1.4 s, no task over 100 ms during playback. Image: 400 MB, healthy within 20 s. Conditions: Chromium, CPU slowed 4 times, 10 Mbps down, 40 ms round trip, production build seeded by `scripts/perf-seed.ts` (60 active jobs across seven columns, one 40-question bank with fake TTS clips). Byte budgets fail on any overage; timing budgets take the median of 5 runs and fail above 15% over.

## Task list

| Task | Milestone | Title | Files touched (short) | Depends on tasks |
|---|---|---|---|---|
| 1 | 33 | Pre-refactor snapshots | tests/unit, tests/integration, fixtures | none |
| 2 | 33 | Profile pack columns and `setPack` | schema, migration, scoped/profile, tests | 1 |
| 3 | 33 | Pack schema, limits and fixture packs | lib/packs/schema.ts, packs/schema.json, fixtures | 1 |
| 4 | 33 | The product design pack and its guards | packs/, lib/packs/builtin.ts | 3 |
| 5 | 33 | Pack files loader and registry | lib/packs/files.ts, registry.ts | 3, 4 |
| 6 | 33 | Active pack, fallback, notices and boot checks | lib/packs/active.ts, instrumentation.ts | 2, 5 |
| 7 | 33 | Stage vocabulary through `lib/pipeline` | kinds, rules, create, move, labels, values | 4, 6 |
| 8 | 33 | Vocabulary through board data and Home | lib/board, lib/attention, board page | 7 |
| 9 | 33 | Board, card, menus, sheet and Add job | components/board, board actions | 8 |
| 10 | 33 | Job page dialogs and announcements | components/job, job page | 8 |
| 11 | 33 | Seniority superset and Preferences | preferences schema, summary, form, page | 4, 6 |
| 12 | 33 | Addenda, `fit.pack` and event meta | lib/packs/prompts.ts, ai, intake, fit | 6, 7 |
| 13 | 33 | `choosePack` and the setup select | lib/packs/choose.ts, app/(auth)/setup | 2, 6 |
| 14 | 33 | Settings pack section, switch dialog and notices | components/settings, settings page | 9, 13 |
| 15 | 33 | Export and context frontmatter | export/collect, bridge/context, handlers | 6 |
| 16 | 33 | End to end, docs and ship | e2e, README, design-system, .env.example | 1 to 15 |
| 17 | 34 | Pack seeds and `seed --pack` | lib/packs/seed.ts, lib/demo, scripts/seed.ts | 4 |
| 18 | 34 | `packs-check` | lib/packs/check.ts, scripts/packs-check.ts | 17 |
| 19 | 34 | Review gate and the full fixture pack | packs/reviews.json, tests | 18 |
| 20 | 34 | The three pack files | packs/*.json | 19 |
| 21 | 34 | Suggestion chips on Preferences | preferences form, chip-field | 11, 20 |
| 22 | 34 | Welcome pack step and `?pack=` | welcome, signup | 13, 20 |
| 23 | 34 | Hosted audience lines, counts and sections | lib/generate/tasks | 20 |
| 24 | 34 | Request bundle addenda and `work_request.pack_id` | lib/requests, migration | 20 |
| 25 | 34 | "Copy a template" and the conventions section | lib/packs/template.ts, context, Prep hub | 20 |
| 26 | 34 | End to end, docs and ship | e2e, README | 17 to 25 |
| 27 | 35 | Environment inventory | ENV_NAMES, tests, .env.example | none |
| 28 | 35 | No-session route table | fixtures, proxy test | none |
| 29 | 35 | Health route | lib/health, app/api/health | 28 |
| 30 | 35 | Standalone output and tracing includes | next.config.ts | none |
| 31 | 35 | Bundled commands and the scheduler loop | build-scripts.mjs, scripts, lib/scheduler | 27, 29 |
| 32 | 35 | Entrypoint and schema-ahead check | docker-entrypoint.sh, serve-check | 29, 31 |
| 33 | 35 | Dockerfile, ignore file and license collection | Dockerfile, licenses-collect | 30, 31, 32 |
| 34 | 35 | Compose, Caddyfile, env example, Postgres 17 | deploy/, docker-compose.yml, ci.yml | 33 |
| 35 | 35 | Backup and restore scripts | deploy/backup.sh, restore.sh | 34 |
| 36 | 35 | Runner units | deploy/runner | 34 |
| 37 | 35 | `image.yml` and the smoke script | workflow, scripts/image-smoke.mjs | 28, 33, 34, 35 |
| 38 | 35 | `release.yml` | workflow | 37 |
| 39 | 35 | Self-hosting guide | docs/self-hosting.md, README | 27, 34, 35, 36 |
| 40 | 35 | End to end, docs and ship | recorded install, upgrade test | 37, 38, 39 |
| 41 | 36 | `check:copy` | scripts/check-copy.mjs | none |
| 42 | 36 | `check:licenses` and notices | scripts, THIRD_PARTY_NOTICES.md | none |
| 43 | 36 | Inline server-action lint rule | eslint.config.mjs | none |
| 44 | 36 | Source link | lib/source-url.ts, components, pages | 27 |
| 45 | 36 | Contributor docs and templates | CONTRIBUTING, templates, MAINTAINERS | 41, 42 |
| 46 | 36 | CLA and its workflow | CLA.md, cla.yml | 45 |
| 47 | 36 | Conduct, security, CodeQL, Dependabot, changelog | docs, workflows | 45 |
| 48 | 36 | Releasing, version bump and Node 24 | docs/releasing.md, scripts, engines | 47 |
| 49 | 36 | Accessibility statement and keyboard specs | docs/accessibility.md, e2e | none |
| 50 | 36 | Perf project and budgets | perf project, budgets, perf.yml | 33 |
| 51 | 36 | Firefox smoke and README updates | playwright.config.ts, README | 49, 50 |
| 52 | 36 | End to end, docs and ship | recorded checks | 41 to 51 |

## Parallel work

- **Milestone 33:** after Task 1, Tasks 2 and 3 run together (schema and migration versus `lib/packs/schema.ts`). Tasks 4 and 5 follow 3 and share only `lib/packs/`: 4 touches `packs/` and `builtin.ts`, 5 touches `files.ts` and `registry.ts`, so they run together once 3 merges. After Task 7: Tasks 8, 11 and 12 run together (board lib, preferences, AI modules touch disjoint files). Tasks 9 and 10 both need 8 and touch disjoint component folders, so they run together. Task 13 runs beside 7 to 12 once 2 and 6 are in. Tasks 14 and 15 run together after their dependencies.
- **Milestone 34:** Task 17 then 18, 19, 20 in sequence. Tasks 21 to 25 run together once 20 merges, since they touch disjoint areas (Preferences form, welcome and signup, `lib/generate`, `lib/requests`, `lib/packs/template.ts` plus the Prep hub). Task 26 last.
- **Milestone 35:** Tasks 27, 28 and 30 start together (env files, route table and proxy, `next.config.ts`). Task 29 follows 28 (both edit `proxy.ts`). Tasks 31 and 32 share `scripts/` only through `package.json`; run them in order 31, 32. Tasks 35 and 36 run together after 34. Tasks 38 and 39 run together after 37 and 35.
- **Milestone 36:** Tasks 41, 42, 43, 49 and 50 start together (disjoint files; 50 needs the image only for its last CI step). Task 44 runs beside them. Tasks 45, 46 and 47 follow 41 and 42; 46 and 47 run together after 45. Task 48 after 47. Task 51 after 49 and 50. Task 52 last.

## Spec ambiguities and plan decisions

- **Section 5.11 says 60 variables but `lib/env.ts` also reads `DEMO_MODE`.** The demo sign-in (`lib/demo/`) landed after the spec. Task 27 documents `DEMO_MODE` as a row marked "showcase instances only" and the inventory test treats it as a known extra. The owner confirms.
- **Section 5.1 says the seniority list becomes "a superset of nine values" while `SENIORITY_LEVELS` today pairs values with labels.** Task 11 keeps one generic label per value (`GENERIC_SENIORITY_LABELS`) for the scoring prompt, so product design's prompt text stays identical, and a pack's own labels apply only in forms. A pack that labels `lead` as "Group or lead" still sends "Lead" to the model. The owner confirms or asks for pack labels in the prompt (a prompt change).
- **Section 5.2 requires a seed only for files in `packs/`; the product design pack in milestone 33 has none of the Hosted `ROLE_PACK` lines yet.** Task 4 ships the product design pack with empty `prompts.generate` fields and empty suggestion lists, and Tasks 20, 21 and 23 fill what the owner provides.
- **Section 5.7 names `trigger cron` for the scheduler but Hosted's section 5.13 does not name the tick function.** Task 31's loop takes the tick as a parameter and `scripts/scheduler.ts` is the only file that names it, resolved when hosted milestone 11 has merged.
- **Section 5.14 lists `no-changelog` as a label and a `changelog.yml` rule over `deploy/` and `packs/`.** Task 47 implements exactly those paths.
- **Section 5.15 moves `engines` to `>=24` and says "Node 24 LTS" while `.nvmrc` already holds 24.** Task 48 changes `engines` only.
- **Section 9 puts "the source link" in milestone 36 but the Settings footer version (for bug reports) is used by the issue template.** Task 44 adds the version to the same Settings footer.
- **Section 5.1 lists `lib/attention` as unchanged, but `loadHome` in `lib/attention/load.ts` reads `columnTitle` from `STAGE_KINDS`.** Task 8 changes that one block to read the vocabulary and nothing else in `lib/attention`.
- **Section 8 says an end-to-end spec sets up an account "with the software engineering pack" at `/setup`, but `/setup` closes after the first account and the suite shares one account.** Task 13's integration test covers `setupAction` with a pack id, and Task 26's e2e covers the same state by switching in Settings.
- **Section 5.5 says "no subfolders" without saying whether a subfolder is an error.** Task 5 ignores subfolders and non-JSON files and reads only `*.json` directly inside `PACKS_DIR`.
- **Section 5.7 gives `TICK_INTERVAL_MINUTES` a range of 5 to 60 without saying what an out-of-range value does.** Task 31 treats it as an `EnvError` naming the variable, consistent with every other bad variable.
- **Section 5.17 says "400 MB uncompressed".** Task 37 reads it as 400 MiB (419,430,400 bytes) in one constant, `SIZE_BUDGET_BYTES`.
- **Section 5.15 tags `X.Y`, `X` and `latest`, without saying what happens when a newer patch or minor already exists.** Task 38 moves a floating tag only when the new version is the highest within it.
- **Section 5.15 says nothing reaches the registry unless every job passed, while the build pushes by digest.** Task 38 starts the push only after verify and smoke pass; a push that fails for one architecture leaves an untagged digest that no tag reaches.
- **Section 5.1 says suggestions appear "under an empty field".** Task 21 shows them only while the field has no chips and no typed text.
- **Section 5.17 gives a download speed and a round trip for the perf profile and no upload speed.** Task 50 leaves upload unlimited.
- **Section 5.14 lists a "Settings footer" version in the bug template; no spec adds a version to Settings.** Task 44 adds `Version <n>` next to the source link in the Settings footer.
- **Section 5.16 (localization) and the non-goals build nothing.** Left out on purpose: a translated interface, packs through the app, more than one pack per profile, new stage kinds or a different column order, renaming Saved, Applied or Offer, Helm, one-click templates, web push, prep packet export, a tray app, npm publishing.

