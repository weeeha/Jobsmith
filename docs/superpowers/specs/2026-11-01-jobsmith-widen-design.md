# Jobsmith Widen: design spec

- Date: 2026-11-01
- Status: draft for owner review
- Scope: cycle 8 of 8 (Widen). Builds on the Core spec, `docs/superpowers/specs/2026-09-18-jobsmith-core-design.md`, and the Prep spec, `docs/superpowers/specs/2026-11-01-jobsmith-prep-design.md`, and on the Hosted beta, Feed, Apply and Research, Debrief and Bridge part two specs in the same folder (`2026-11-01-jobsmith-{hosted,feed,apply-research,debrief,bridge-two}-design.md`), whose rules stay in force unless a section here says otherwise.
- Visual plan: a "Widen" page in the "JS - Design" Figma file, drafted before each milestone plan: the pack picker on `/setup` and `/welcome`, the Settings pack section and its switch dialog, suggestion chips on Preferences, the source link.

## TL;DR

- Widen makes Jobsmith usable by job seekers outside product design, runnable by anyone with Docker, and open to outside pull requests under a policy that keeps the owner's licensing options.
- A role pack is one versioned JSON file checked by a Zod schema: labels and column titles over the seven fixed stage kinds, seniority levels, title suggestions, prompt addenda for every prompt (extraction, scoring, Hosted's four tasks, and the call card and research instructions in Bridge part two's request bundles), question bank sections and counts, and optional demo seed data. Four ship: product design (today's behavior, proven by snapshots taken before the refactor), software engineering, product management and data.
- A profile has one pack, picked at first run, at hosted sign-up and in Settings. Switching changes what happens next and rewrites nothing. A self-hoster adds a pack by dropping a JSON file into `PACKS_DIR` and restarting.
- Self-hosting: a multi-stage `Dockerfile` on Next's standalone output, an image on GitHub Container Registry for every tag (amd64 and arm64), and `deploy/compose.yaml` with the app, Postgres, a scheduler, a storage volume, and optional Caddy (automatic TLS, one-address `X-Forwarded-For`) and TTS profiles. Migrations run on start under the existing advisory lock; `/api/health`, backup and restore scripts and forward-only upgrades complete it.
- Section 5.11 lists all 60 variables the app reads from an operator across all eight specs, with what needs each, its default and whether it is hosted only, and a test fails CI when a config parser reads a name the list lacks.
- Contributions: a license-grant CLA (recommended over a DCO, section 5.14), Contributor Covenant 2.1, `SECURITY.md` with private reporting, templates, a maintainers file, a changelog, semantic versions with `v1.0.0` at the end of this cycle, and an AGPL source link in the app.
- Interface localization waits until after 1.0. Accessibility and performance get public statements backed by CI jobs and budgets for the board and the player. Four milestones, 33 to 36.

## 1. Context and goals

Core is live; Prep, Hosted beta, Feed, Apply and Research, Debrief and Bridge part two are specified and not built. Everything so far serves product designers, the first audience (Core 1). In code that assumption is narrow: the audit in 5.1 finds it in the `portfolio_case` stage's wording ("Portfolio review", column "Portfolio / case", `lib/pipeline/kinds.ts`), the seniority list (`lib/preferences/schema.ts`), the demo seed (`scripts/seed.ts`) and the audience lines Hosted puts into its generation prompts, which Hosted 12 hands to this cycle as `ROLE_PACK`. The extraction and scoring instructions (`lib/ai/extract-posting.ts`, `lib/ai/score-fit.ts`) already name no profession.

Self-hosting today means cloning the repo, starting the Postgres in `docker-compose.yml` (it runs nothing else), `pnpm install`, `pnpm db:migrate`, `pnpm build` and `pnpm start`, with proxy advice in the README. The later cycles add files on disk, a 15-minute tick and 49 more variables, so a stranger needs one image, one compose file and one list. The README still says outside pull requests are not merged until a contribution policy exists (Core 7). Earlier specs hand this cycle web push (Feed 12), PDF export of prep packets (Apply and Research 12), and service units, a tray app and a published CLI (Bridge part two 12); section 12 places each, and this cycle takes the service units and the CLI download.

### Goals

1. A software engineer, product manager or data scientist runs a search whose board, stage names, seniority list, fit prompt and generated documents use their profession's words.
2. A product designer sees no change: same labels, same prompts, same scores.
3. A stranger with a Linux server and Docker reaches Jobsmith over HTTPS by following `docs/self-hosting.md`, backs it up, restores it and upgrades it.
4. A stranger can contribute a fix or a pack, and the owner keeps the right to dual-license and to run the hosted service.
5. Public statements on accessibility and performance, each backed by a CI job or a recorded manual check.

### Non-goals for Widen

A translated interface, packs uploaded through the app or a pack directory, more than one pack per profile, new stage kinds or a different column order, renaming Saved, Applied or Offer, Kubernetes or Helm, one-click deploy templates, managed backups, multi-replica guidance beyond one note, OAuth for remote MCP connectors (Bridge part two 12), web push, prep packet export, a tray app. Section 12 maps each.

### Success criteria

The four done-when tests in section 9, verified in Chrome and Safari on desktop and at a phone viewport, plus one install on a clean Linux machine by someone other than the owner, following the guide verbatim, recorded in the Milestone 35 pull request.

## 2. Principles

The principles of the seven earlier specs carry over. Widen adds five.

35. **Role vocabulary is data.** Words that change between professions live in a pack file. Stage kinds, their order and every rule about them stay in code.
36. **A pack changes the future only.** Choosing or switching a pack changes what new jobs, new prompts and new suggestions use. Stored labels, scores, documents and preferences stay as written.
37. **One image, configured at runtime.** Every self-hosted copy runs the same published image. Operator values arrive through the environment when the container starts, and a CI check proves the build output holds none.
38. **Contributions keep the license open.** Every contribution ships under AGPL-3.0 here and grants the owner the right to license it on other terms, so dual licensing stays possible without a consent hunt.
39. **A public promise names its check.** Each line of the accessibility and performance statements names the CI job that tests it, or the manual check and the pull request that records it.

## 3. Architecture

### Stack additions

| Concern | Choice | Self-host note |
|---|---|---|
| Role packs | `lib/packs`: JSON files in `packs/` imported as modules (bundled, so no tracing), plus files from `PACKS_DIR` read once per process; one Zod schema, `jobsmith-pack/v1`; `packs/schema.json` generated with `z.toJSONSchema` for editor hints | drop a file, restart |
| Boot checks | `instrumentation.ts` `register()`, Next's startup hook (`node_modules/next/dist/docs/01-app/02-guides/self-hosting.md`), runs `env()` and the pack load once, so a bad variable or pack file fails at start | same on Vercel |
| Image | `Dockerfile`, four stages on `node:24-slim` by digest; `output: "standalone"` only when `JOBSMITH_STANDALONE=1` (`.../05-config/01-next-config-js/output.md`) | the owner's Vercel build is unchanged |
| Image commands | `scripts/build-scripts.mjs` bundles `migrate`, `seed`, `tick`, `scheduler`, `feed-scan`, `packs-check` and `import-applications` with esbuild (already used for the CLI); `docker-entrypoint.sh` dispatches | `docker compose run --rm app <command>` |
| Compose and backups | `deploy/compose.yaml`: `app`, `postgres` 17, `scheduler`, profiles `proxy` (Caddy 2) and `tts`; `deploy/backup.sh` and `restore.sh` | cron on the host |
| Registry | `.github/workflows/release.yml` on `v*` tags: native `ubuntu-24.04` and `ubuntu-24.04-arm` builds, smoke test, manifest list, provenance and SBOM, pushed to `ghcr.io/weeeha/jobsmith` | `docker compose pull` |
| Contribution checks | CLA Assistant Lite (`contributor-assistant/github-action`), CodeQL, Dependabot, `pnpm check:licenses` (an allowlist over `pnpm licenses list --prod --json`), `pnpm check:copy` (the writing rules), a changelog check | none |
| Performance | a `perf` Playwright project on Chromium with CDP CPU and network throttling, budgets in `tests/perf/budgets.json` | none |

### Module map additions

```
packs/               product-design, software-engineering, product-management, data (.json); schema.json
lib/packs/           schema, builtin, files, registry, active (with fallback), vocabulary, prompts, seed,
                     choose (sole writer of the pack columns), template (question bank skeleton)
lib/health/          database and schema checks behind app/api/health/
lib/pipeline/ lib/board/ lib/preferences/ lib/ai/ lib/requests/   take the pack's vocabulary and addenda
app/                 /setup pack select, /welcome pack step, Settings pack section and source link
instrumentation.ts   boot checks;  scripts/: build-scripts, packs-check, perf-seed, check-copy, check-licenses
Dockerfile  .dockerignore  docker-entrypoint.sh;  deploy/: compose.yaml, Caddyfile, env.example,
                     backup.sh, restore.sh, packs/, runner/ (systemd user unit, launchd agent)
docs/                self-hosting, releasing, accessibility, performance (.md);  tests/perf/
.github/             workflows release, image, cla, codeql, changelog; dependabot; CODEOWNERS; templates
CONTRIBUTING.md  CLA.md  CODE_OF_CONDUCT.md  SECURITY.md  MAINTAINERS.md  CHANGELOG.md  THIRD_PARTY_NOTICES.md
```

Core's rules hold: `requireUser()` in every page, action and handler (the health route serves no user data and takes no session), `app/` and `components/` never import the database client, `lib/pipeline` keeps every stage write. New single writer: `lib/packs/choose.ts` for the two profile pack columns.

## 4. Data model

Widen adds no table. **profile** gains `pack_id` (text, not null, default `'product-design'`, check `pack_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'` and length 3 to 40; no foreign key, because packs are files) and `pack_version` (integer, not null, default 1, at least 1: the pack's version when it was chosen or its update was last acknowledged). Defaults backfill every existing row, so the owner and today's self-hosters stay on product design with no step. Bridge part two's **work_request** gains `pack_id` (text, nullable, the same format check): the pack active when `createRequest` ran (5.4).

Document changes, no migration: `profile.preferences.seniority` accepts the superset `SENIORITY_VALUES` (`junior`, `mid`, `senior`, `staff`, `principal`, `lead`, `manager`, `director`, `executive`) with the document version still 1; `opportunity.fit` gains an optional `pack` (`"software-engineering@1"`), read by `storedFitSchema` (`lib/fit/stored.ts`) with `FIT_VERSION` still 1; the `created` event's `meta` and Hosted's `generation.inputs` gain `pack`, so `input_hash` differs per pack and a run after a switch is a new run; the context document gains `pack: <id>@<version>` in its frontmatter and a `## Question bank conventions` section (each interview stage's label, count and sections) and stays `context/v1`, since both are additive; export (`lib/export/collect.ts`) adds `profile.pack { id, version }` and its version goes up by one. Unchanged: the `stage.kind` check constraint, the seven kinds and their column order.

## 5. Behavior

### 5.1 What is role-specific today

| Place | Today | After Widen |
|---|---|---|
| `lib/pipeline/kinds.ts`, `rules.ts` (`defaultStages`, `planMove` rule 2), `create.ts` | `columnTitle` and `defaultLabel` constants per kind | kinds and order stay in code; labels and titles come from the active pack, loaded inside `createOpportunity`'s transaction |
| board, card, move menu, phone sheet, add job, edit stages, move announcements; `lib/board/optimistic.ts`, `keys.ts` | import `STAGE_KINDS` | receive a `StageVocabulary` prop from the server page |
| `lib/preferences/schema.ts` `SENIORITY_LEVELS` | Mid, Senior, Staff, Principal, Manager | a superset of nine values; each pack picks and labels 2 to 9 |
| `lib/ai/extract-posting.ts`, `lib/ai/score-fit.ts` | no audience lines | an optional addendum after the instructions; empty for product design |
| Hosted 5.4 and 5.6 | `ROLE_PACK` per task, banks of 10, 12, 8 and 12 questions, `SENIORITY_LEVELS` in `extract_resume` | `prompts.generate`, `prep.questionCounts`, the pack's seniority values |
| Bridge part two `lib/requests/kinds.ts` | per-kind instructions in each bundle's `request.md`; a bank's default count is Hosted's | the bundle carries the request's pack addendum: `prompts.generate` for the four kinds that match Hosted's tasks, `prompts.callCard` for `call_card`, `prompts.research` for `research` and a research or people notes `research_refresh`; counts from `prep.questionCounts` |
| Preferences titles, Feed's `titlesExclude` | no suggestions | the pack's suggestions as one-tap chips under an empty field |
| `scripts/seed.ts` | six product design jobs, two with pay ranges | each pack's `seed`, which has no pay fields |
| Prep grammar, `lib/attention`, Home copy, Apply and Research templates, Feed readers, Debrief | role-neutral | unchanged |

### 5.2 The pack file

Strict object (an unknown key fails), at most 64 KB:

- `schema`: `"jobsmith-pack/v1"`. `id`: lowercase words joined by hyphens, 3 to 40 characters. `version`: integer, 1 to 9999. `name`: up to 40 characters. `description`: up to 160.
- `stages`: exactly the seven kind keys, each `{ label (1 to 40), column (1 to 24), hidden (default false) }`. `saved`, `applied` and `offer` read Saved, Applied and Offer for both and cannot be hidden, because Home's copy ("In Saved for 3 days", "In Applied since") and the stage rules name them. Labels are unique within a pack ignoring case, because a bridge `stage` reference matches labels before kinds (Core 5.3). At least one of the four middle kinds stays visible.
- `seniority`: 2 to 9 `{ value, label (1 to 24) }` with values from `SENIORITY_VALUES`, unique, in display order. `titleSuggestions` and `titleExcludeSuggestions`: up to 12 each, under Preferences' list rules.
- `prompts`: `extractPosting` and `scoreFit` up to 1,000 characters each; `generate { fitBrief, tailoredCv, coverLetter, questionBank }`, `callCard` and `research` up to 1,500 each; all empty by default. `prep`: `questionCounts` for the four interview kinds (4 to 20) and `sections` for the same kinds (up to 8 names of 60 characters).
- `seed` (optional): `headline` (up to 200, `HEADLINE_MAX`) and up to 8 `jobs`, each `{ company, roleTitle, location, workMode, stage, schedule? { inDays 1 to 14, format }, people? (up to 3: name, role, title), notes? (up to 2, 300 characters), closed? (a closed reason) }`. The schema has no pay fields, so a seed cannot carry one (Core principle 6). `packs-check --repo`, which CI runs on every file under `packs/`, requires a seed, so a contributed pack ships fictional demo data; a `PACKS_DIR` file may leave it out, and `seed --pack` on such a pack exits 1 with "The pack 'sales' has no demo data."

Rules the code applies: a new job gets one stage per visible kind, in kind order, labeled from the pack. An addendum is appended to the task's instructions after one blank line; an empty one appends nothing, which is how the product design pack reproduces today's prompts exactly, and user text stays inside the tagged data block the prompts already use. A hidden kind is left out of the default template, Add stage, Add job's start column, the Move to menu and the phone sheet; its board column renders only while a card sits in it, and board digits number the visible columns in order. `lib/pipeline` still accepts a hidden kind as a target, so imports and older jobs keep working. No shipped pack hides a kind; a fixture pack in `tests/fixtures/packs/` covers the rule. Decision: no per-pack reordering. Reason: the board's columns follow kind order (Core 5.1), and a template in another order moves a typical card left on every advance. Cost if wrong: a schema v2 with an order list, read alongside v1.

### 5.3 The four packs

| Pack (`id`) | `portfolio_case` label (column) | `panel_final` label (column) | Seniority (value when it differs) | Questions per bank: screen, manager, case, panel |
|---|---|---|---|---|
| Product design (`product-design`) | Portfolio review (Portfolio / case) | Panel (Panel / final) | Mid, Senior, Staff, Principal, Manager | 10, 12, 8, 12 |
| Software engineering (`software-engineering`) | Technical interview (Technical) | Onsite loop (Onsite / final) | Junior, Mid, Senior, Staff, Principal, Engineering manager (`manager`), Director | 10, 12, 10, 12 |
| Product management (`product-management`) | Product case (Case / exercise) | Final loop (Panel / final) | Associate (`junior`), Mid, Senior, Group or lead (`lead`), Principal, Director | 10, 12, 8, 12 |
| Data (`data`) | Take-home (Technical / case) | Final loop (Panel / final) | Junior, Mid, Senior, Staff, Principal, Manager, Director | 10, 12, 8, 12 |

All four keep Recruiter screen (column Recruiter) and Hiring manager. The product design pack is today's `STAGE_KINDS` and `SENIORITY_LEVELS` moved into data, with empty extraction and scoring addenda, Hosted's `ROLE_PACK` lines and counts as its generation data, and title suggestions cut to 12 each from the owner's Design Career Ops Web keyword lists (section 10). Features every pack gets, the suggestion chips and the question bank template, also appear for product design; nothing it already shows changes. Suggestion lists, addenda and section names are copy, fixed in the Milestone 34 plan and each reviewed before merge by one person who works in that role. Example scoring addendum for software engineering: "Weigh the languages, frameworks and systems the posting requires against the resume. Count years with a named stack only when the resume states them."

Decision: data (data science, analytics, analytics engineering, machine learning) is the fourth pack. Reason: its interview flow has a stage the other three packs do not describe (a take-home, or a SQL and statistics screen), and its titles share words while the work differs, the case a scoring addendum exists for. Marketing spans brand, growth, content and product marketing, too unlike for one stage template; design engineering is product design plus a technical stage, which a user gets by adding one stage. Cost if wrong: one JSON file swapped in a minor release.

### 5.4 Choosing and switching

- `/setup` (first account) gains "Roles you're looking for", a select of installed packs defaulting to product design, saved with the profile row. `pnpm seed --pack <id>` seeds a demo account with that pack.
- Hosted `/welcome` gains a first step with one card per pack before the resume; `/signup?pack=<id>` preselects one; skipping keeps product design. Packs are the same on every plan.
- Settings, Profile section: "Role pack" lists each pack's name and description. Picking another opens the switch dialog: the new template as a list, "Board columns are renamed now", "Jobs you already have keep their stages, scores and documents", a line when stored seniority values fall outside the new list, Cancel and Switch. `choosePack(s, packId)` updates both columns in one statement; an unknown id returns `unknown_pack`.

After a switch, board column titles, menus, the phone sheet, Add job, Edit stages and move announcements use the new pack at once. A card shows its stage label as a chip whenever it differs from the new pack's label for that kind, so older jobs show their own wording. New jobs, and a stage created by moving to a kind a job lacks (Core 5.1 rule 2), get the new labels. Preferences shows the new seniority list, plus any stored value outside it, still checked, until the user removes it, and the new title chips. New scores, retries and feed scores use the new addendum and record it in `fit.pack`; Hosted's runs use the new audience lines, counts and sections. Nothing is rescored, regenerated or relabeled by a switch. Cost if wrong: a user who wanted older cards relabeled renames them per job (a bulk action is in section 12). When a loaded pack's version is above `profile.pack_version`, Settings shows "The Software engineering pack was updated to version 2." with its template once, and dismissing it or switching stamps the current version. A profile whose `pack_id` is not installed reads as product design, keeps its stored id, and Settings says "The role pack 'sales' is not installed here. Using Product design until it is." The Prep hub's empty state gains "Copy a template" (with Prep Milestone 6): markdown with a `#` title, the pack's `##` sections for the chosen stage and one instruction line under each ("Write questions here as `### 1. "Question"` followed by **Say:** and **Spine:**."), which parses to zero rows if pasted unchanged.

Requests in flight: `createRequest` (Bridge part two) writes the active pack's id to `work_request.pack_id`, and the bundle built at claim time uses that snapshot for addenda, counts and sections; a null (a request created before Widen) uses the pack active when the bundle is built, and a snapshot pack no longer installed falls back to product design as a profile does. Decision: snapshot at creation. Reason: a request queued under one pack and claimed hours later after a switch should still produce the document the user asked for, as Hosted's runs do through `generation.inputs`. Cost if wrong: a user who switched and wanted the new wording cancels and requests again.

### 5.5 Packs from a file

`PACKS_DIR` names a directory; every `*.json` directly inside it is loaded at boot (no subfolders, at most 20 files), passes the 5.2 schema, and must use an id no built-in or other file uses. Decision: any failure stops boot with the file name and up to five issues, as `EnvError` does (`PackError: sales.json: stages.panel_final.column: at most 24 characters`). Reason: a skipped pack silently drops its users to product design. Cost if wrong: a typo keeps the instance down until fixed, which `packs-check` prevents. To add one: copy `packs/product-design.json`, change `id`, `name` and the fields (an operator's pack may drop `seed`), put the file in `deploy/packs/`, run `docker compose run --rm app packs-check /packs/sales.json` (or `pnpm packs:check <file>` from source; it prints the template, levels and counts and exits 1 on failure), then `docker compose restart app scheduler`. A built-in pack is a pull request to `packs/` (5.14). The owner's deployment sets no `PACKS_DIR`.

### 5.6 The image

`Dockerfile` stages: `base` (`node:24-slim` by digest, `corepack enable` for the pnpm in `packageManager`), `deps` (`pnpm install --frozen-lockfile` with a BuildKit cache mount), `build`, `runtime`. The `build` stage sets `JOBSMITH_STANDALONE=1`, `NEXT_TELEMETRY_DISABLED=1` and placeholder `DATABASE_URL`, `BETTER_AUTH_SECRET` and `APP_URL=http://build.invalid` that exist only in that stage, runs `pnpm build`, `pnpm scripts:build` and `pnpm licenses:collect` (every production dependency's license text into `THIRD_PARTY_LICENSES.txt`, because standalone tracing copies no license files), and copies `public` and `.next/static` into the standalone folder as the Next docs require. Decision: placeholders at build. Reason: `lib/auth/index.ts` builds Better Auth from `env()` at import, and `next build` imports route modules. A CI step greps `.next/standalone` for `build.invalid` and the placeholder secret, and its own test plants the string first to prove it finds it. Cost if wrong: an operator value baked into a public image, which that grep blocks. `next/font/google` fetches Geist during the build, so the build needs network access; the runtime does not.

`runtime`: `node:24-slim` by digest; `NODE_ENV=production`, `PORT=3000`, `HOSTNAME=0.0.0.0`, `NEXT_TELEMETRY_DISABLED=1`, `STORAGE_LOCAL_DIR=/data/storage`; build arguments `JOBSMITH_VERSION` and `JOBSMITH_COMMIT` become environment values and OCI labels (`source`, `version`, `revision`, `licenses=AGPL-3.0-only`); user `node` (uid 1000) owns `/data`; `lib/db/migrations/` sits beside the bundled commands; `HEALTHCHECK` runs a Node one-liner against `/api/health` every 30 seconds (timeout 5, start period 60, 3 retries). `outputFileTracingIncludes` carries what is read from disk at runtime: `content/legal/**` and `lib/auth/disposable-domains.txt` (Hosted) and `lib/doc-export/fonts/**` (Apply and Research); the health check imports the migration journal as a module. Budget: 400 MB uncompressed for amd64, checked in CI. `docker-entrypoint.sh` commands: `serve` (default: `migrate` unless `MIGRATE_ON_START=false`, then `exec node server.js`), `migrate`, `seed [--pack <id>]`, `scheduler`, `tick` (one run), `feed-scan`, `packs-check <file>`, `import-applications <file> [--email] [--dry-run]`; an unknown command prints the list and exits 64. `serve` refuses to start when the database has applied more migrations than the image ships: "Database schema is newer than this version (applied 41, known 38). Restore a backup or run a newer image." `.dockerignore` drops `.env*`, `.git`, `node_modules`, `.next`, `tests`, `docs`, `.claude`, `.superpowers` and `cli/dist`.

### 5.7 Compose

`deploy/compose.yaml`, with `deploy/env.example` copied to `deploy/.env`; start with `docker compose --profile proxy up -d`, add demo data with `docker compose run --rm app seed --pack software-engineering`:

- `app`: `ghcr.io/weeeha/jobsmith:${JOBSMITH_TAG:-1}`, `env_file: .env`, `DATABASE_URL` built from `POSTGRES_PASSWORD`, `PACKS_DIR=/packs`; volumes `storage:/data` and `./packs:/packs:ro`; `init: true`, `restart: unless-stopped`, `stop_grace_period: 30s` (Next finishes in-flight requests and `after()` work on SIGTERM, and its self-hosting guide advises 10 to 30 seconds; a longer generation is settled and refunded by Hosted's stalled-run rule); `read_only: true` with tmpfs on `/tmp` and `/app/.next/cache`; `cap_drop: [ALL]`, `no-new-privileges`; no host port, with a commented `127.0.0.1:3000:3000` for use without the proxy; starts once `postgres` is healthy.
- `postgres`: `postgres:17-alpine` by digest, user and database `jobsmith`, `POSTGRES_PASSWORD` required (`${POSTGRES_PASSWORD:?}`), volume `pgdata`, `pg_isready` every 5 seconds, no host port.
- `scheduler`: the same image with `command: scheduler`, env, storage and packs, starting once `app` is healthy. It is a sleep-and-call loop that holds no queue and no connection between calls: every `TICK_INTERVAL_MINUTES` (default 15, 5 to 60, plus up to 60 seconds of jitter) it calls the same tick function Vercel Cron reaches through `POST /api/jobs/tick` (`lib/jobs`, Hosted 5.13), in process, with Feed's `cron` trigger and the cron budget, so `scan_run.trigger` needs no new value. One call runs every step the tick holds (Hosted's, Feed's scans, Debrief's expired audio, Bridge part two's `requests` sweep), then the loop sleeps; it needs no `CRON_SECRET`, and the steps' own leases make an extra HTTP tick safe.
- `caddy` (profile `proxy`): `caddy:2-alpine` by digest, ports 80, 443 and 443/udp, `./Caddyfile`, volumes `caddy_data` and `caddy_config`.
- `tts` (profile `tts`): Kokoro-FastAPI's CPU image by digest, no host port; the guide sets `TTS_PROVIDER=openai_compatible` and `TTS_BASE_URL=http://tts:8880/v1`, and Settings lists its voices (Prep 5.5). Any OpenAI-compatible server works the same way, the owner's Qwen3-TTS included, and a whisper server does the same for `TRANSCRIBE_BASE_URL` (Debrief).

```yaml
  scheduler:
    image: ghcr.io/weeeha/jobsmith:${JOBSMITH_TAG:-1}
    command: scheduler    # sleep, then call the tick function once (trigger cron), repeat
    env_file: .env
    environment: { PACKS_DIR: /packs, TICK_INTERVAL_MINUTES: "15" }
    volumes: [storage:/data, ./packs:/packs:ro]
    depends_on: { app: { condition: service_healthy } }
    restart: unless-stopped
```

The root `docker-compose.yml` and CI's service move to `postgres:17-alpine` too, so development, CI and compose agree. `deploy/runner/` holds a systemd user unit and a launchd agent that keep `jobsmith work` (Bridge part two 5.6) running on a user's own computer, with install steps in the guide.

### 5.8 Reverse proxy and routes with no session

```
{$JOBSMITH_DOMAIN} {
	tls {$ACME_EMAIL}
	header Strict-Transport-Security "max-age=31536000"
	request_body {
		max_size 32MB
	}
	reverse_proxy app:3000 {
		header_up X-Forwarded-For {remote_host}
	}
}
```

Core 7 trusts `X-Forwarded-For` only when it holds one address, so `header_up` replaces whatever a client sent with the address Caddy saw, and the per-client sign-in limit works. 32 MB covers Debrief's 25 MB recording upload (`TRANSCRIBE_MAX_MB`) with multipart room; the guide says to raise both together, and every route keeps its own smaller cap (4 MB for the bridge, Core D9; 2 MB for server actions, `next.config.ts`). Caddy issues and renews certificates and passes streamed responses through. `APP_URL` is `https://<JOBSMITH_DOMAIN>`. The bridge, MCP, Stripe's webhook (hosted only) and Telegram's webhook mode need the domain reachable from the internet; Telegram's poll mode and the runner work from behind a home router. The README's nginx line and `trustedProxies` note stay for other proxies. The Milestone 35 plan confirms each directive against Caddy's current docs.

Every route that answers without a session cookie, so `proxy.ts` must let it through: API routes and static files sit in the matcher's exclusion list (the proxy never runs, so it never buffers or redirects), pages sit in `PUBLIC_PATHS` (the proxy runs and passes them on).

| Route | Ships in | Why no session | Its own check |
|---|---|---|---|
| `/login`, `/setup` (pages), `/api/auth/*` | Core | signing in | Better Auth, the setup token, the sign-in limit |
| `/api/bridge/*`, including Prep's audio routes, Apply and Research's document reads, Bridge part two's MCP, runner, request and event routes | Core, extended by later cycles | the CLI, MCP clients and runners send bearer tokens | `authenticateBearer` and the token's rate row |
| `/signup`, `/verify-email`, `/reset-password`, `/pricing`, `/privacy`, `/terms` (pages) | Hosted | strangers and accounts not yet verified | 404 unless hosted; Better Auth |
| `POST /api/billing/webhook`; `POST /api/jobs/tick` | Hosted | Stripe; Vercel Cron and other schedulers | signature over the raw body; `CRON_SECRET` |
| `POST /api/telegram/webhook`; `POST /api/notify/unsubscribe` | Feed | Telegram; one-click unsubscribe from a mail client | the secret header; the HMAC token |
| `PUT /api/debrief/upload/[token]` | Debrief | a recording streamed to `local` storage; with the proxy in the path Next buffers up to `proxyClientMaxBodySize` (10 MB) and cuts the rest (the comment in `proxy.ts`) | the single-use HMAC token |
| `/manifest.webmanifest` and the app icons (`/icon.svg`, `/apple-icon.png`, the manifest's PNGs) | Prep, found here | browsers fetch a manifest without credentials, and the sign-in page shows the icon to signed-out visitors | static, no user data |
| `GET /api/health` | Widen | the container probe carries no cookie | status and version only (5.10) |

Rule: the cycle that ships a no-session route adds its matcher exclusion or `PUBLIC_PATHS` entry in the same milestone, and a row here. A unit test checks `proxy.ts` against this table, and Widen's image smoke test calls every route in it with no cookie and fails on a redirect to `/login`; any other answer (200, 401, 403, 404, 405) passes, since each route applies its own check. Cost if wrong: a route left out redirects its webhook, probe or upload to `/login`, which the smoke test reports by name.

### 5.9 Backups, restore and upgrades

`deploy/backup.sh` runs `pg_dump -Fc` through `docker compose exec -T postgres`, then tars the `storage` volume through a throwaway container, both into `./backups/` under UTC timestamps with `umask 077`; it deletes files older than `KEEP_DAYS` (default 14) only after both succeed, and exits non-zero on any failure. The guide's crontab line is `15 3 * * * cd /opt/jobsmith && ./backup.sh >> backups/backup.log 2>&1`. Database first, then files: an object written between the two is an unused file, and a row whose object is missing falls back as Prep 6 and Apply and Research 6 describe. Copying `backups/` to another machine, encrypted, is the operator's step, and the guide says so. `deploy/restore.sh <dump> <tar>` checks the dump with `pg_restore --list`, stops `app` and `scheduler`, runs `pg_restore --clean --if-exists --no-owner`, replaces the volume's contents, starts both and waits for health.

Upgrade: read the release notes, run `backup.sh`, then `docker compose pull && docker compose up -d`. The app migrates under the advisory lock (`scripts/migrate.ts`) before serving, and the scheduler waits for its health. `JOBSMITH_TAG=1` follows every 1.x minor and patch; a new major's notes list its steps. Migrations only move forward (README, Deploying), so going back is a restore plus the older tag, and `serve`'s schema check stops an older image from running on a newer schema. A Postgres major upgrade is a dump and restore, written out in the guide.

### 5.10 Health

`GET /api/health`, no session, `Cache-Control: no-store`. Body: `{ "status": "ok" | "down", "version": "1.0.0", "checks": { "database": "ok" | "down", "schema": "current" | "pending" | "ahead" } }`, 200 when every check is ok and 503 otherwise. The database check is `select 1` under a 1.5-second statement timeout; the schema check compares the row count of `drizzle.__drizzle_migrations` with the bundled journal. It reports nothing else: no counts, no provider status, no environment values. The image's `HEALTHCHECK`, compose's `depends_on` and any uptime monitor read it.

### 5.11 Environment variables

The root `.env.example` stays the full reference, grouped as below with "hosted only" marked; `deploy/env.example` holds what compose needs. Each config parser (`lib/env.ts`, `lib/ai/config.ts`, `lib/auth/policy.ts`, and the later ones in `lib/tts`, `lib/storage`, `lib/transcribe`, `lib/hosted`, `lib/email`, `lib/billing`, `lib/notify`, `lib/feed`, `lib/packs`) exports an `ENV_NAMES` list, and a unit test fails when a name is missing from `.env.example` or from this table in `docs/self-hosting.md`; it first catches a planted unknown name. A later cycle's variables join the same way.

| Variable | Needed for | Default | Hosted only | From |
|---|---|---|---|---|
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | always (compose builds it); migrations behind a pooler | none; `DATABASE_URL` | no | Core |
| `BETTER_AUTH_SECRET` | always, 32 or more characters; also keys Feed's unsubscribe links and Debrief's upload tokens | none | no | Core |
| `APP_URL` | always off Vercel; emailed, Telegram and MCP origin links | Vercel's system URL on Vercel | no | Core |
| `SETUP_TOKEN` | the first account on a production build, 16 or more | unset locks `/setup` | no | Core |
| `ALLOW_SIGNUP`, `AUTH_SIGNIN_MAX_PER_MINUTE` | later accounts when self-hosted; sign-in tuning | `false` (ignored when hosted); 5 | no | Core |
| `AI_PROVIDER`; `AI_GATEWAY_API_KEY` or `ANTHROPIC_API_KEY`; `AI_MODEL`, `AI_MODEL_WRITE` | extraction, scoring, onboarding, generation, debrief suggestions | off; gateway uses OIDC on Vercel; Haiku 4.5, Sonnet 5 | no | Core, Hosted |
| `TTS_PROVIDER`; `TTS_BASE_URL`, `TTS_API_KEY`, `TTS_MODEL`; `GEMINI_API_KEY`, `ELEVENLABS_API_KEY` | generated voices; `openai_compatible` base URL and optional key; the other drivers' keys | off (browser voices); model per driver | no | Prep |
| `TRANSCRIBE_PROVIDER`; `TRANSCRIBE_BASE_URL`, `TRANSCRIBE_API_KEY`, `TRANSCRIBE_MODEL`, `TRANSCRIBE_MAX_MB`, `TRANSCRIBE_TIMEOUT_S` | recorded interviews | off; `whisper-1`, 25 (at most 200), 240 | no | Debrief |
| `STORAGE_PROVIDER`, `STORAGE_LOCAL_DIR` | audio, recordings, exports | `local` (refused when `VERCEL` is set); `.jobsmith/storage` from source, `/data/storage` in the image | no | Prep; Widen names the directory |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`; `BLOB_READ_WRITE_TOKEN` | `s3`; `vercel_blob` | region `auto`, path style `false`; the token comes from the Vercel Blob store | no | Widen names them |
| `HOSTED` | the paid service | off | yes | Hosted |
| `EMAIL_PROVIDER`, `EMAIL_FROM`; `SMTP_URL` or `RESEND_API_KEY` | password reset when self-hosted, required when hosted, Feed's email digests | off | no | Hosted |
| `BILLING_PROVIDER`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STANDARD`, `STRIPE_PRICE_PLUS` | billing | off | yes | Hosted |
| `ADMIN_EMAILS`, `LEGAL_OPERATOR`, `LEGAL_CONTACT_EMAIL`, `LEGAL_HOSTING`, `SIGNUP_INVITE_CODE`, `CREDITS_GLOBAL_DAILY_CAP` | admin and legal pages; an invite-only beta; the daily spend breaker | none; open; 20,000 | yes | Hosted |
| `CRON_SECRET` | the HTTP tick, 32 or more characters | unset: the route is 404, and the compose scheduler needs none | required when hosted | Hosted |
| `NOTIFY_CHANNELS`; `TELEGRAM_BOT_TOKEN`, `TELEGRAM_UPDATES`, `TELEGRAM_WEBHOOK_SECRET`; `FEED_SCAN`, `FEED_SCORES_PER_DAY_MAX` | alerts; the scan kill switch; the instance score ceiling | in-app only, `poll`; on; 100 | no | Feed |
| `PACKS_DIR`, `SOURCE_URL`, `MIGRATE_ON_START`, `TICK_INTERVAL_MINUTES` | extra packs; the AGPL source link; the image's `serve` and `scheduler` | unset; the release tag's URL (the commit's on Vercel); `true`; 15 | no | Widen |
| Compose and Caddy only: `POSTGRES_PASSWORD`, `JOBSMITH_DOMAIN`, `ACME_EMAIL`, `JOBSMITH_TAG` | the stack; the domain and the ACME address are required with the `proxy` profile | tag `1` | no | Widen |
| Build only: `JOBSMITH_STANDALONE`, `JOBSMITH_VERSION`, `JOBSMITH_COMMIT`; `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` for an operator's own multi-replica build | the image | unset | no | Widen, Next |

Not set by an operator: the platform's and the image's `VERCEL`, `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_GIT_COMMIT_SHA`, `NODE_ENV`, `PORT`, `HOSTNAME` and `NEXT_TELEMETRY_DISABLED`; the scripts' and tests' `ALLOW_DB_RESET`, `SEED_PASSWORD`, `JOBSMITH_LIVE_AI`, `CI`, `EMAIL_FAKE_DIR`, `TRANSCRIBE_FAKE_WAIT_MS`, `FEED_FETCH`, `FEED_FIXTURES` and `FEED_LIVE_GREENHOUSE_ORG` with its Lever and Ashby siblings; the CLI's `JOBSMITH_URL`, `JOBSMITH_TOKEN` (refused by `mcp` and `work` without `--allow-env-token`), `JOBSMITH_STT_URL`, `XDG_CONFIG_HOME` and `XDG_STATE_HOME` on the user's own machine. Prep names no variables for its `local`, `s3` and `vercel_blob` drivers; Widen names them and Prep Milestone 7 adopts them. Jobsmith-specific S3 names keep an operator's shell AWS credentials from reaching a bucket by accident, the reasoning behind `AI_PROVIDER` (Core D19). Feed's `FEED_MAX_COMPANIES` and the scoring character limits are constants in code; Apply and Research and Bridge part two add no variables.

### 5.12 Interfaces and drivers

| Interface | Module | Drivers | Picked by | When unset | In compose |
|---|---|---|---|---|---|
| `AiDriver` | `lib/ai` | `gateway`, `anthropic`, `fake` | `AI_PROVIDER` | off | operator's choice |
| `TtsDriver` | `lib/tts` | `openai_compatible`, `gemini`, `elevenlabs`, `fake` | `TTS_PROVIDER` | browser voices | `tts` profile |
| `TranscribeDriver` | `lib/transcribe` | `openai_compatible`, `gateway` (if Debrief Milestone 28 finds a route), `fake` | `TRANSCRIBE_PROVIDER` | off | operator's choice |
| `Storage` (with Debrief's `createUpload` and `head`) | `lib/storage` | `local`, `s3`, `vercel_blob`, `memory` | `STORAGE_PROVIDER` | `local` | `local` on the `storage` volume |
| `EmailDriver` | `lib/email` | `fake`, `smtp`, `resend` | `EMAIL_PROVIDER` | off | operator's choice |
| `BillingDriver`, `Meter` | `lib/billing`, `lib/credits` | `stripe`, `fake`; `dbMeter`, `freeMeter` | `BILLING_PROVIDER`, `HOSTED` | off; `freeMeter` | never; `freeMeter` |
| Notify channels | `lib/notify` | in-app always; `telegram`, `email`, `fake` | `NOTIFY_CHANNELS` | in-app | operator's choice, `poll` |
| `GuardedFetch` | `lib/intake` | live, fixtures | `FEED_FETCH` | live | live |
| Scheduled work | `lib/jobs` and its steps | HTTP tick, `pnpm jobs:tick`, image `scheduler`, lazy on read | `CRON_SECRET` for HTTP | lazy only | `scheduler` |
| Pack source | `lib/packs` | built-in, files | `PACKS_DIR` | built-ins | built-ins plus `deploy/packs` |

### 5.13 What the owner's Vercel deployment leaves out

It builds without `JOBSMITH_STANDALONE`, so none of the image applies; migrations stay in `vercel.ts`'s `buildCommand`; Vercel Cron calls the tick route with `CRON_SECRET` in place of the scheduler; storage is Vercel Blob (`local` is refused there); Vercel terminates TLS and sets `X-Forwarded-For`, so no Caddy; Neon's point-in-time restore replaces the backup scripts; the owner's voices come from `jobsmith audio` on his machine (Prep 5.5), so no `tts` service; there is no `PACKS_DIR`; Vercel deploys `main`, so the hosted service runs at or ahead of the newest tag. It uses the packs, the no-session route table, `/api/health` for an uptime check if the owner wants one, and the source link, which points at `VERCEL_GIT_COMMIT_SHA`.

### 5.14 Contribution policy

`CONTRIBUTING.md`:

- Welcome without asking: bug fixes with a failing test, accessibility fixes, docs, new role packs, drivers behind an existing interface; everything else starts as an issue that a maintainer labels `accepted`, because the roadmap lives in the specs. Run and check: README's First run plus `pnpm seed`; `pnpm typecheck`, `lint`, `check:tokens`, `check:copy`, `check:licenses`, `test`, `test:e2e`. Tests first for everything under `lib/`. Read the bundled Next docs before using a framework API (`AGENTS.md`).
- Code rules: `requireUser()` in every page, action and handler; `app/` and `components/` never import the database client (ESLint enforces it); typed `Result` returns for expected failures; logs carry ids and codes, never user text; the fetch guard is the only path to a user-supplied address; every outside service sits behind an interface with a `fake` driver, off when unset; server actions are module-level exports that take ids and re-check the user (section 7). One write path per concept, kept as a table: `lib/pipeline`, `lib/artifacts`, `lib/prep/marks.ts`, `lib/prep/asked.ts`, `lib/audio/segments.ts`, `lib/library`, `lib/credits/ledger.ts`, `lib/billing/state.ts`, `lib/generate/run.ts`, `lib/account/delete.ts`, `lib/feed/items.ts`, `lib/feed/sources.ts`, `lib/notify/write.ts`, `lib/doc-export/store.ts`, `lib/companies`, `lib/debrief`, `lib/requests`, `lib/packs/choose.ts`.
- Design system: the order of preference (registry item, `base-nova` primitive, Minimal Design System copy, new code recorded in `docs/design-system.md`), semantic tokens only, light and dark, axe at zero; `components/ui` and `components/super-ai` change upstream first and are re-synced.
- Copy and hygiene: the owner's writing rules, checked by `pnpm check:copy` on copy modules (`copy.ts`, `messages.ts`), `content/` and `docs/` (no em or en dashes, no exclamation marks, the banned word list, the "not X but Y" patterns it can match); copy fixed in a milestone plan changes only with a maintainer's review; fictional companies and people, no pay figures, no personal data, screenshots from the seed only (Core principle 6).
- Dependencies: one line in the PR on why and under which license. Allowed: MIT, MIT-0, ISC, 0BSD, BSD-2-Clause, BSD-3-Clause, Apache-2.0, BlueOak-1.0.0, CC0-1.0, MPL-2.0, LGPL-2.1-or-later, LGPL-3.0, AGPL-3.0, OFL-1.1 for fonts. Refused: GPL-2.0-only (incompatible with AGPL-3.0), SSPL, BUSL, Commons Clause, non-commercial licenses, and code with no license.
- A good PR: one concern; about 400 changed lines or fewer outside tests and snapshots; a linked issue; tests; light, dark and phone screenshots for UI; a CHANGELOG line under Unreleased; a Conventional Commits title as the history uses (`feat(home): ...`); the CLA signed. A role pack PR adds one file in `packs/` at version 1 with `pnpm packs:check --repo` green, which requires its fictional seed, and a reviewer who works in that role.

Decision: a contributor license agreement over a DCO sign-off. `CLA.md` holds an individual and a corporate form adapted from the Apache CLA 2.0: the contributor keeps copyright and grants the owner a perpetual, worldwide, royalty-free copyright and patent license with the right to sublicense on any terms, and every contribution also ships here under AGPL-3.0. CLA Assistant Lite asks once per GitHub account and stores signatures in a private repo through a token scoped to it; the owner and Dependabot are allowlisted. Reason: the hosted service runs this same public code and needs no extra rights (Hosted principle 12), but two options the business may want do: a commercial license for a company that will not take AGPL terms, and relicensing later versions. Today the owner holds every copyright, so both are open; under a DCO each outside merge adds one more person whose written consent, or a rewrite of their code, those options would need. Cost if wrong: a CLA turns some drive-by contributors away, visible in PRs closed unsigned and reversible by switching to a DCO in one commit; a DCO that later proves wrong costs a consent hunt that grows with every merge. A lawyer reviews `CLA.md` before the first outside merge.

Other files:

- `CODE_OF_CONDUCT.md`: Contributor Covenant 2.1 (CC BY 4.0, attribution kept); reports go to the project address (section 11) and get an answer within 7 days.
- `SECURITY.md`: GitHub private vulnerability reporting first, the project address second. In scope: the code, the published image and the hosted service, tested with your own accounts only, with no denial of service, social engineering or access to other users' data. Acknowledgment within 3 business days, triage within 7 days, a fix released within 14 days for critical and 30 for high issues, others in the next minor; disclosure at the fix or after 90 days; credit in the advisory unless declined; advisories and CVEs through GitHub. Supported: the latest minor of the current major, and the hosted service.
- `.github/ISSUE_TEMPLATE/`: `bug.yml` (version from the Settings footer or the image tag; hosted, Docker image or source; browser and OS; steps, expected, actual; logs with ids and codes; a required box "I removed company names, people and document text"), `feature.yml` (the problem first), `role-pack.yml` (stage flow, levels, typical titles, a reviewer from the role), `config.yml` (no blank issues; links to `SECURITY.md` and hosted support); `pull_request_template.md` repeats the good-PR list as checkboxes. `MAINTAINERS.md`: the owner (GitHub `weeeha`) as lead maintainer with merge and release rights, review within 7 days, maintainers invited after sustained contributions, the lead deciding when maintainers disagree; `CODEOWNERS` is `* @weeeha`.
- `THIRD_PARTY_NOTICES.md`: vendored code with its license text: shadcn/ui components (MIT), the Minimal Design System token file (MIT), Super AI Components (once licensed), Geist, Source Sans 3 and Source Serif 4 (OFL-1.1), the disposable domain list (CC0); the image adds `THIRD_PARTY_LICENSES.txt` (5.6). The README gains a Trademarks line: the code is AGPL-3.0, and the Jobsmith name and logo are not licensed for another party's hosted service.

Owner's list, outside this repo: add a LICENSE to the Super AI Components repo (MIT, matching the Minimal Design System; Core 10 notes the gap); turn on private vulnerability reporting, Dependabot alerts and branch protection on `main` with the build, e2e, image and CLA checks required; create the private signatures repo and its token; set up the project address; have `CLA.md` reviewed; check the name for trademark conflicts.

### 5.15 Releases and support

Semantic versions over the public surface: the bridge and MCP APIs, the context and `job/v1` formats, CLI commands and flags, environment variables, the pack schema, the export format, image commands and the upgrade path. Major: anything a self-hoster or CLI user must change. Minor: features, new optional variables, migrations that need no step. Patch: fixes. `0.x` tags until `v1.0.0`, tagged when Milestone 36's done-when passes. `CHANGELOG.md` follows Keep a Changelog 1.1; `changelog.yml` fails a PR that changes `app/`, `components/`, `lib/`, `cli/`, `packs/` or `deploy/` without touching it, unless labeled `no-changelog`, and a release that needs a step says so under Changed ("Back up first: this release rewrites stage labels").

Cutting a release (`docs/releasing.md`): bump `package.json`, `cli/package.json` and `cli/src/version.ts` together, move Unreleased under the version and date, merge, then push a signed `vX.Y.Z` tag on that `main` commit. `release.yml` reruns typecheck, lint and the unit and integration suites, builds each architecture on its native runner, runs the image smoke test (section 8) on amd64, pushes by digest, merges the manifest list, tags `X.Y.Z`, `X.Y`, `X` and, for the highest stable version, `latest`, attaches provenance and an SBOM, and creates the GitHub Release with the changelog section and the one-file CLI `jobsmith.mjs`. A `-rc.N` tag pushes only its exact tag, and nothing reaches the registry unless every job passed.

Supported: Node 24 LTS for the app (`.nvmrc`; `engines` moves from `>=22` to `>=24`, since CI runs only 24), with the next LTS line added to CI and the image in a minor release; the CLI on Node 22 or newer (Node 20 reached end of life in April 2026), tested on 22 and 24. Postgres 17, in compose and CI; 16 runs the same migrations and is untested. Chrome and Edge, current and previous major; Safari 17 or newer on macOS and iOS; Firefox current, through a `firefox-smoke` project running the shell and pipeline specs. Docker Engine 24 or newer with Compose v2.

### 5.16 Localization

Decision: copy extraction for other languages waits until after 1.0. Reason: copy is fixed one milestone plan at a time and still changes in every cycle, so a message catalog now would be rewritten by each plan and double every copy review; Russian needs three plural forms that today's count sentences ("1 day", "3 days", `lib/attention/copy.ts`) do not model, so extraction means rewriting every such sentence; and Prep's grammar keys on English labels (`Say`, `Spine`), so a Russian question bank needs label aliases first. The owner's own search and the first audience work in English, and no user has asked for Russian. What already holds stays: copy lives in per-module copy files, times render through `LocalTime` with `Intl`, and documents and exports handle Cyrillic (Apply and Research's glyph check). Packs carry English in v1. Cost if wrong: a Russian-speaking group waits one cycle; nothing built here blocks extraction later.

### 5.17 Accessibility and performance statements

`docs/accessibility.md`, linked from the README, targets WCAG 2.2 AA. Tested on every pull request by the `e2e` job: axe with zero violations on every route in light and dark, in Chromium and WebKit; keyboard-only flows for the board (digits, `c`, Move to), every dialog, Drill and Quick-fire, compare and the pack switch; the phone layout at 390 px. Checked by hand for each release and recorded in its PR: VoiceOver on macOS Safari and iOS Safari through sign-in, a board move, a job page and Listen. Known limits: exported PDFs are untagged (Apply and Research), browser voices vary by device (Prep), and dragging has keyboard and menu equivalents. Reports use the `accessibility` label.

`docs/performance.md` holds these budgets, measured by the `perf` project (Chromium, CPU slowed 4 times, 10 Mbps down, 40 ms round trip) against a production build seeded by `scripts/perf-seed.ts` (60 active jobs across seven columns, one 40-question bank with clips from the fake TTS driver). Byte budgets fail on any overage; timing budgets take the median of 5 runs and fail above 15% over, so runner noise alone does not fail a PR; every run writes its numbers to the job summary. The Listen row waits for Prep Milestone 7, and its cached case for Milestone 10.

| Surface | Budget |
|---|---|
| `/board`, cold load | JavaScript transferred at most 220 KB compressed; largest contentful paint at most 2.0 s; document response at most 500 ms |
| Board, keyboard move | the card shows in its new column within 100 ms; the server confirms within 800 ms |
| Listen, 40-question bank | JavaScript at most 160 KB compressed; first audible step within 300 ms of Play with cached clips, within 1 s uncached; gaps within 100 ms of the planned 0.6 and 1.4 s; no task over 100 ms during playback |
| Image | 400 MB uncompressed; healthy within 20 s of start on a migrated database |

## 6. Error handling

- Packs: a built-in file that fails the schema fails the unit suite; a `PACKS_DIR` file that fails, an unreadable directory or a duplicate id stops boot with names and up to five issues; a missing active pack falls back with the Settings notice and writes nothing; `choosePack` returns `unknown_pack` for an id not installed.
- Image: a failed migration exits 1 with a `[migrate]` line and compose restarts the container with backoff; a newer schema exits 1 with the 5.6 message; a missing required variable exits through `EnvError` with its name; an unknown command exits 64. Health answers 503 with the failing check. The scheduler logs a failed step with its code and continues at the next interval, and on SIGTERM stops after the current step, within 30 seconds.
- `backup.sh` exits non-zero and keeps every older backup; `restore.sh` refuses a dump that fails `pg_restore --list`. A failed release job pushes nothing. An unsigned contributor's PR shows the failing CLA check with the signing link.
- Logs: one `[packs]` line at boot with ids, versions and sources (built-in or file name), never prompt text; one `[scheduler]` line per run with steps, counts and milliseconds; health logs only failures.

## 7. Security and privacy

- Pack files are operator configuration with the trust of code: their addenda enter model instructions, so only someone who can write `PACKS_DIR` or the repo adds one, and the app never accepts one from a user. Files are JSON, size-capped and strict; labels and suggestions render as React text.
- Server Actions key: Next embeds a per-build encryption key for Server Function closures in the build output (`node_modules/next/dist/docs/01-app/02-guides/data-security.md`), so a public image makes that key public. Decision: accept it. Reason: Jobsmith's actions are module-level exports that receive ids and re-check `requireUser()` and the scoped helper, no server component closes over a secret, and the same guide advises against relying on that encryption. Cost if wrong: a later inline action that captures a secret leaks it to anyone with the image, so an ESLint `no-restricted-syntax` rule fails a `"use server"` directive inside a function body in `app/` and `components/`. An operator who wants a private key builds an image with `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`.
- Container: uid 1000, read-only root, all capabilities dropped, `no-new-privileges`, neither the app nor Postgres published on the host, `.env` at mode 600 per the guide, secrets only at runtime, placeholders proven absent (5.6), Next telemetry off, no update check, nothing sent to the owner. Caddy adds TLS and HSTS and overwrites `X-Forwarded-For`. `/api/health` returns status and version only.
- AGPL section 13: Settings and the sign-in page footer link "Source code" to `SOURCE_URL`, defaulting to the running tag or commit; the guide tells an operator who changes the code to point it at their own source. The image's OCI `source` label and each release's tag serve section 6 for the image itself.
- Supply chain: base images by digest and Actions by commit SHA, both updated weekly by Dependabot (npm, Docker, Actions, with security updates); CodeQL on PRs and weekly; gitleaks stays; provenance and SBOM on every image; the license allowlist.
- Stored personal data: CLA signatures (GitHub login and id) live in the private repo for as long as the contributions are distributed; backups hold everything a user has, including resumes and audio, so dumps are written mode 600 and the guide calls for encrypted off-machine copies.

## 8. Testing

Test-driven for everything under `lib/`, as in Core.

- **Unit:** the pack schema as a table of cases (seven keys, fixed kinds, hidden limits, unique labels, seniority superset, lengths, strict keys, no pay in seeds); vocabulary resolution with and without a hidden kind, including digit numbering; product design snapshots of labels, column titles, the seniority list, `EXTRACT_INSTRUCTIONS`, `SCORE_INSTRUCTIONS` and `scorePrompt` on a fixture, taken in the first commit of Milestone 33 before any refactor and compared after; an addendum appended after one blank line; a guard that fails when a pack file's content hash changes without a version bump; preferences read across packs; the entrypoint's command parsing; the schema-ahead comparison; `proxy.ts` against the 5.8 table; the scheduler loop with a fake clock (one tick call per interval, trigger `cron`); `packs-check --repo` refusing a seedless file in `packs/` and the loader accepting one in `PACKS_DIR`; the env inventory test; `check:copy` and `check:licenses` against fixtures with planted positives.
- **Integration (PGlite with the real migrations):** after a switch, `createOpportunity` uses the new labels and older stages keep theirs; a move to a missing kind uses the active pack's label; the missing-pack fallback; `choosePack` through the scoped helper in the isolation test; export additions; `seed --pack` for each pack (six jobs, no pay values, stages placed); the health route with the database up, down and ahead; the context frontmatter and conventions section; a request created under one pack and bundled after a switch carries the first pack's addendum, and a request with a null `pack_id` carries the active one.
- **Image (`image.yml`, every PR and push to `main`, amd64):** build; uid 1000 and a read-only root; the placeholder grep; the size budget; compose up with the fake AI, TTS, transcription and email drivers and `local` storage; the Playwright first-run, pipeline and documents specs against the container; every 5.8 route called with no cookie and none redirected to `/login`; a 24 MB fixture upload through Caddy to the `local` upload route arriving whole (once Debrief Milestone 28 exists); `seed --pack data`; data surviving `down` and `up`; backup, then restore into a fresh project with the same job count; a broken pack file failing start with its name; from the first tag on, an upgrade from the previous release's image with data intact.
- **End to end (Playwright, Chromium and WebKit, desktop and phone):** setup with the software engineering pack shows Technical and Onsite / final; the Settings switch dialog; older cards keep their labels as chips; a suggestion chip adds a title; the source link; the Firefox smoke project.
- **Accessibility and performance:** axe on setup, the Settings pack section and the switch dialog in light and dark, and a keyboard-only switch; the `perf` project and its budgets (5.17).
- **Once, recorded in the PR:** the CLA flow from a second GitHub account; a private security report reaching the owner; the clean-machine install.

## 9. Milestones

Numbering starts at 33. One implementation plan per milestone, each preceded by its Figma drafts. A piece whose dependency has not shipped (Hosted's generation and onboarding, Prep's hub and storage, Feed's scoring, Debrief's upload route, Bridge part two's sweep) is left out of that milestone and named in its plan.

| # | Name | Scope | Done when |
|---|---|---|---|
| 33 | Pack engine | the pre-refactor snapshots; `lib/packs` with the schema, built-ins, `PACKS_DIR`, registry, fallback and `instrumentation.ts`; the product design pack; `profile.pack_id` and `pack_version`; vocabulary through the board, job page, dialogs, `lib/pipeline` and `lib/board`; the seniority superset; addenda in extraction and scoring; the `/setup` select; the Settings section, switch dialog and update notice; export, `fit.pack`, event meta and context frontmatter | Every product design snapshot matches its pre-refactor value, and on the preview an account switched to a fixture pack sees renamed columns while its jobs keep their stages and gain chips; a fixture file in `PACKS_DIR` appears in Settings after a restart and a broken one stops boot naming the file |
| 34 | Packs | software engineering, product management and data with practitioner-reviewed copy; suggestion chips; `seed --pack` and pack seeds; Hosted's audience lines, counts and sections from the pack, the `/welcome` step and `?pack=`; `prompts.callCard` and `prompts.research`, request bundle addenda and `work_request.pack_id`; "Copy a template"; the conventions section; `packs-check` | A new account set up with the software engineering pack gets Technical interview and Onsite loop on a new job, its seniority list and title chips on Preferences, and the fake AI driver records the scoring addendum; `pnpm seed --pack data` makes six data jobs with no pay figures |
| 35 | Self-host | `output: "standalone"` behind its flag, the `Dockerfile`, bundled commands, the entrypoint and schema check, `/api/health`, the 5.8 route table with its unit and smoke tests, `deploy/` (compose, Caddyfile, env example, backup and restore, runner units), `docs/self-hosting.md` with the 5.11 table, the env inventory test, `image.yml`, `release.yml`, `THIRD_PARTY_LICENSES.txt`, Postgres 17 across dev, CI and compose | On a clean Linux machine, someone other than the owner follows the guide verbatim and reaches the app over HTTPS behind Caddy, creates the first account with `SETUP_TOKEN`, adds a job, restores the previous night's backup into a new stack with the same jobs, and upgrades from `v0.9.0-rc.1` to `v0.9.0-rc.2` with data intact; both tags were published to GHCR for amd64 and arm64 by the workflow |
| 36 | Open the repo | `CONTRIBUTING.md`, `CLA.md` and the CLA workflow, `CODE_OF_CONDUCT.md`, `SECURITY.md`, templates, `MAINTAINERS.md`, `CODEOWNERS`, `CHANGELOG.md` and its check, `THIRD_PARTY_NOTICES.md`, `docs/releasing.md`, the copy and license checks, CodeQL and Dependabot, the inline-action lint rule, the source link, `docs/accessibility.md`, `docs/performance.md` with the `perf` project, the Firefox smoke project, the README updates, `v1.0.0` | A pull request from a second GitHub account is blocked until its CLA is signed and then merges with CI green; the perf and accessibility jobs pass on `main` with their numbers in the job summary; `v1.0.0` is tagged and its image, release notes and CLI file are on GHCR and GitHub |

Each milestone ends with a preview link, a pass in Chrome and Safari and the test suites green.

## 10. Port sources and licensing

| Source | What Widen takes | Where |
|---|---|---|
| Design Career Ops Web `lib/scanner/portals-config.ts` (`TITLE_FILTER`) | the product design wanted and excluded title lists, cut to 12 each | `packs/product-design.json` suggestions |
| This repo's `lib/pipeline/kinds.ts`, `lib/preferences/schema.ts`, `scripts/seed.ts` | today's labels, columns and levels; the six fictional jobs with their two pay ranges removed | the product design pack |
| Hosted 5.6 | `ROLE_PACK` lines and bank sizes per stage kind | the product design pack's `prompts.generate` and `prep` |
| Next.js `with-docker` example (MIT), named in the bundled deploy docs | the standalone layout: copy `public` and `.next/static`, run `server.js` | the `Dockerfile`, pattern only, written fresh |

The owner's prototype is unlicensed and his, so its lists are relicensed under AGPL-3.0; nothing comes from the upstream career-ops project. Texts: Contributor Covenant 2.1 (CC BY 4.0), the Apache CLA 2.0 forms as the base of `CLA.md` (the lawyer's review confirms reuse terms), Keep a Changelog 1.1. No new runtime dependency. Tooling: Postgres (PostgreSQL License), Caddy (Apache-2.0) and Kokoro-FastAPI (Apache-2.0, optional) images; `docker/setup-buildx-action`, `docker/build-push-action`, `docker/metadata-action`, `docker/login-action` and `contributor-assistant/github-action` (Apache-2.0); `github/codeql-action` (MIT); esbuild is present (MIT). Design system: the setup select, the Settings section and the switch dialog use the installed `base-nova` `select` and `dialog`, the chips reuse `components/chip-field.tsx`, and anything new is recorded in `docs/design-system.md`.

## 11. Assumed until the owner says otherwise

1. The fourth pack is data. Labels, columns and levels are the 5.3 table; suggestions, addenda and sections are fixed in the Milestone 34 plan and reviewed by one practitioner each.
2. Saved, Applied and Offer read the same in every pack; a template has one stage per visible kind in kind order; hidden kinds follow 5.2 and no shipped pack uses one; the seniority superset is the nine values in section 4.
3. Pack limits: 64 KB and 20 files, addenda of 1,000 and 1,500 characters, 4 to 20 questions, 8 sections, 12 suggestions, 8 seed jobs, a seed required only in the repo. An invalid pack file stops boot; a missing pack falls back to product design.
4. A switch rewrites nothing, and there is no bulk relabel.
5. A license-grant CLA with a sublicensing clause, run by CLA Assistant Lite with signatures in a private repo and reviewed by a lawyer before the first outside merge; Contributor Covenant 2.1; one project address on a domain the owner controls for conduct and security reports, with no personal address in the repo.
6. Security timings: acknowledgment in 3 business days, triage in 7 days, critical fixes in 14 and high in 30, disclosure at 90 days.
7. Images: `node:24-slim`, `postgres:17-alpine`, `caddy:2-alpine`, Kokoro-FastAPI CPU for the `tts` profile (tag, port 8880, voices and memory use confirmed in the Milestone 35 plan); a 400 MB image budget; arm64 built on native runners.
8. Variable names `STORAGE_LOCAL_DIR`, `S3_*`, `BLOB_READ_WRITE_TOKEN`, `PACKS_DIR`, `SOURCE_URL`, `MIGRATE_ON_START`, `TICK_INTERVAL_MINUTES`; Feed's `FEED_MAX_COMPANIES` read as a constant.
9. The scheduler runs every 15 minutes with up to 60 seconds of jitter; stop grace is 30 seconds; Caddy's body limit is 32 MB; backups run daily at 03:15, keep 14 days, and dump the database before the files.
10. `0.x` until `v1.0.0` at the end of Milestone 36, `v0.9.0-rc` tags for the self-host test, tags cut by the owner, Vercel keeps deploying `main`.
11. Support: Node 24 for the app, Node 22 or newer for the CLI, Postgres 17 (16 untested), Safari 17 or newer, Chrome and Edge current and previous, Firefox current through a smoke project; the 5.17 budgets with a 15% timing tolerance over the median of 5 runs.
12. Interface localization waits until after 1.0; the public Server Actions key in the published image is accepted, guarded by the inline-action lint rule.
13. Widen takes Bridge part two's service units and the CLI download on GitHub Releases; npm publishing waits for the owner's package name.
14. The seed's two pay ranges are removed as a Core principle 6 fix, the only change to product design's demo data; a good PR is about 400 changed lines or fewer outside tests and snapshots.

## 12. After Widen

The cycle table in Core section 12 stands, and this is its last cycle. Widen moves these out:

| Item | Where it goes |
|---|---|
| A translated interface, Russian first: a message catalog, plural rules, question bank label aliases | after 1.0, its own spec |
| Web push to the installed phone app (from Feed 12) | after 1.0: a `webpush` channel in `lib/notify` with keys from env |
| PDF export of call cards, research or a whole prep packet (from Apply and Research 12) | after 1.0, through `lib/doc-export`'s document model |
| OAuth for remote MCP connectors and scoped tokens (from Bridge part two 12) | after the hosted launch, a small cycle of its own, since it is a hosted security feature |
| A tray app for the runner; the CLI on npm | the tray app is not planned; npm once the owner picks the package name |
| An `stt` compose profile with a whisper server for Debrief | once a maintained OpenAI-compatible image is chosen; the variables already work |
| Relabeling active jobs after a pack switch | later, if switchers ask: one action over `lib/pipeline` renames |
| Per-job packs, packs uploaded through the app, a pack directory | not planned: one pack per profile, and packs carry prompt text, so they stay operator-installed |
| More packs (marketing, design engineering, sales) | community pull requests to `packs/` |
| A Helm chart, one-click deploy templates, a multi-replica guide with a shared cache handler, managed off-site backups | community, or after 1.0; the hosted service relies on Neon's restore |
