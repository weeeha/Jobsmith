# Jobsmith Debrief: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After an interview the user records what happened (quick form, pasted notes or transcript, or an audio recording), reviews proposed changes to prep and to the pipeline, applies the ones they accept in one transaction, starts the next Drill with what went wrong in the room, and sees the whole search as numbers on `/funnel`.

**Architecture:** One debrief document per interview stage (artifact kind `debrief`) is parsed by a pure grammar into `debrief_suggestion` rows with no model, or read by a model run (`debrief_suggest`) into the same rows with quotes checked in code. `lib/debrief` is the only writer of `debrief` and `debrief_suggestion`, `lib/prep/asked.ts` the only writer of `asked_question`, and `lib/debrief/apply.ts` writes nothing itself: it calls marks, asked, bank-append (through `lib/artifacts`), library and pipeline inside one transaction. Recordings go straight to storage, are transcribed by one `TranscribeDriver`, and are deleted when the transcript is saved. The funnel is pure functions over stage dates, close reasons and events, rendered as plain elements with a table twin for every bar list.

**Tech stack additions:** `@aws-sdk/s3-presigned-post` (Apache-2.0, for the `s3` upload target; pin at install time, record the version in the task report). `@vercel/blob` is already added by Prep and ships the client upload helper. No chart library, no other dependency. Everything else is installed.

**Spec:** `docs/superpowers/specs/2026-11-01-jobsmith-debrief-design.md`, all sections (1 to 12), with the Core spec sections 2, 3, 4 and 8.

The plan folder holds this contract plus one file per milestone: `m25-debrief-in.md` (Tasks 1 to 17), `m26-prep-loop.md` (Tasks 18 to 25), `m27-suggestions.md` (Tasks 26 to 34), `m28-recordings.md` (Tasks 35 to 44), `m29-funnel.md` (Tasks 45 to 53). A name, signature, constraint value or copy string in this README is binding character for character; a task that departs from it is a defect.

**Milestone 29 can be built first.** It depends on nothing beyond Core. It reads only `opportunity`, `stage`, `event`, `artifact` (kind, never body), `company` and `profile`, and it is planned against the real `lib/pipeline/*`, `lib/db/scoped/stage.ts`, `lib/db/scoped/event.ts` and the seed (`lib/demo/seed-jobs.ts`, `scripts/seed.ts`). Only Task 52 (the Debriefs section of the page) needs Milestone 25's tables; if the funnel ships first, Task 52 moves to a follow-up branch `feat/m29-funnel-debriefs`, and the page renders without that section until then.

## Status on 2026-11-21

**Already built (Core milestones 1 to 5 plus the demo sign-in):**
- `lib/artifacts/` (`plan.ts` with `planUpsert` and `versionNotice`, `upsert.ts` with `applyUpserts` and `upsertArtifacts`, `edit.ts` with `saveArtifactEdit`, `paste.ts`, `sent.ts`, `kinds.ts` with the `debrief` kind on the Prep tab, `normalize.ts` with `keyFromTitle`, `tabs.ts`, `stage-ref.ts`), `lib/pipeline/` (`move.ts`, `close.ts`, `schedule.ts` with `setStageOutcome`, `next-action.ts` with `setNextAction`, `event-text.ts`, `rules.ts`, `values.ts`, `create.ts`, `place.ts`), `lib/db/scoped/` with one file per table, `lib/attention/` (`items.ts`, `copy.ts`, `load.ts`), `lib/bridge/context.ts`, `lib/export/collect.ts`, `lib/ai/` (`driver.ts` with `AI_TASKS`, `config.ts`, `fake.ts` with `FAKE_DEFAULTS`, `score-fit.ts`), `lib/time/zone.ts`, `lib/profile/index.ts`, `cli/src/` with the built-in `debrief` suffix, `components/job/stage-detail-sheet.tsx`, `components/job/tab-prep.tsx` (read-only Prep tab), `components/super-ai/` (`table-view`, `detail-view-shell`, `section-header`, `field-row`, `empty-state`), `components/ui/` (`radio-group`, `combobox`, `toggle-group`, `textarea`, `dialog`, `sheet`), the chart tokens `--chart-1` and `--chart-grid` in `app/globals.css`, the demo seed.
- The fixture `tests/fixtures/packet/nwl-debrief-round2.md` exists. Checked against the section 5.2 grammar: its headings are `## What went well` and `## What to improve`, which are not grammar headings or synonyms, and its frontmatter stage `Final loop` matches no stage label or kind. It therefore parses to no suggestions and lands unstaged. Task 2 pins this as a test.
- Nothing from this spec is built: no `debrief` table, no `lib/debrief`, no `lib/transcribe`, no `/funnel`.

**Depends on:**
- Milestone 25: `2026-11-21-jobsmith-prep` milestone 6 (`prep_question` rows, `lib/prep/parse.ts`, `lib/prep/marks.ts`, the Prep hub) and milestone 9 (`lib/library`). Apply and Research milestone 20 (`artifact.source_body_md`) and milestone 22 (`lib/compare/merge`). Leave out: without Prep 6, stop (nothing to build on). Without Prep 9, no `library` suggestions and no Library group. Without Apply 20, `fork` writes no `source_body_md`. The bank write always appends its section to the latest body, which equals the spec's three-way merge for an addition at the end (Task 11 proves it), so it needs no Apply 22 code; only the carry offer (Task 24) needs Apply 22 and is skipped without it.
- Milestone 26: Milestone 25; Prep milestones 6 and 8 (hub, `lib/prep/order.ts`) and 9 (Library page); Apply milestone 23 for the "Research is N days old" line (leave that line out if absent); Apply milestone 22 for Task 24.
- Milestone 27: Milestone 25; `2026-11-21-jobsmith-hosted` milestone 13 (`lib/generate`, `startGeneration`) and 14 (`lib/credits`, `Meter`, `lib/admin`); `2026-11-21-jobsmith-feed` milestone 18 (`lib/notify/write.ts`). Leave out: without Hosted 14, the run is unmetered (the port passes `freeMeter` behavior); without Hosted 13, the run is tracked on `debrief.status` only and writes no `generation` row; without Feed 18, no `debrief_ready` notification (Home's review item from Task 21 is the signal); without `lib/admin`, no admin counts.
- Milestone 28: Milestone 25; Prep milestone 7 (`lib/storage`, `lib/audio/duration.ts`, the `asset` table); Hosted milestones 11 (tick, storage prefix), 13 and 14 as for Milestone 27, plus `lib/quota/storage.ts`. Leave out: the same pieces as Milestone 27; without Hosted 11 the expiry step runs lazily only.
- Milestone 29: none beyond Core. Task 52 needs Milestone 25 (its counting is its own small pure function, so it needs no Milestone 27 code).

**Needs an account, a paid service, hosting or the owner's answer:**
- Task 17 (the preview pass in Chrome and Safari, desktop and phone) needs the preview deployment; the Playwright specs run without it.
- Task 34 (live check): one model run on a fictional transcript on the preview needs the owner's AI Gateway or Anthropic key (`JOBSMITH_LIVE_AI=1`, never set in CI). Every other task of Milestone 27 runs on the fake driver.
- Task 27: the model instructions text is fixed in this plan (section "Debrief instructions" of `m27-suggestions.md`) and is snapshot-tested; the owner reads it once. It reads from one named constant, `DEBRIEF_INSTRUCTIONS`.
- Task 36: `gateway` transcription is built only if the current AI Gateway docs show a transcription route; the task records the finding. If there is none, the hosted deployment uses `openai_compatible`, and which provider the hosted deployment names on the privacy page is the owner's answer (it fills `TRANSCRIBE_BASE_URL`).
- Task 36 and Task 42: the notice wording is "settled with the owner". It reads from one constant, `RECORDING_NOTICE_TEMPLATE` in `lib/debrief/notice.ts`, and starts with the spec's own sentence as a placeholder. The `{provider}` display name is derived from the configured host (no spec variable exists for it); the owner may want a friendlier name.
- Task 38: the Vercel Blob and S3 upload calls are confirmed against their current docs at implementation time (needs network for the implementer, never for tests). Their live tests run only when `BLOB_READ_WRITE_TOKEN` or an S3 endpoint with keys is present (the MinIO container).
- Task 44 (live check): one real debrief by the owner through `jobsmith transcribe` against the owner's local whisper server, recorded in the Milestone 28 pull request. This is the spec's success criterion and cannot run in CI. The synthetic-recording transcription through a real provider runs only when the keys are present.
- Task 44: the privacy page processor table and data map rows (Hosted legal content) need the owner's legal review before the hosted launch.
- Task 17, 25 and 44: the quick-form copy, the review copy and the `debrief_applied` event wording are fixed in the Contract below; the owner hand-edits before launch. Task 17 also asks the owner whether the debrief skill can write the section 5.2 headings (spec section 11, item 1), because the only real debrief fixture uses other headings.
- Task 1, Task 29 and Task 35: the `event.kind`, `generation.task`, `notification.kind` and `asset.kind` check rewrites keep every earlier value. Which values earlier cycles added is read from `lib/pipeline/values.ts` and `lib/storage` constants at implementation time, so no owner answer is needed, but the task report lists the final sets.
- The spec asks for Figma drafts before each milestone plan ("Debrief" page in the "JS - Design" file). None were made for this plan.

## Global Constraints

Carried from Core milestone 3 and the other cycles, values copied from the specs:

- Never change git config. Public repo hygiene: fixtures are fictional (company Northwind Traders, fictional people), carry no pay figures, no personal data, no local absolute paths. No key-like literals in tests: build keys at runtime as `"k".repeat(24)`.
- Never commit to or push `main`. One branch per milestone, named `feat/m25-debrief-in`, `feat/m26-prep-loop`, `feat/m27-suggestions`, `feat/m28-recordings`, `feat/m29-funnel`, each cut from `main` once its dependencies are merged.
- This is Next.js 16. Before using any Next.js API, read the matching guide under `node_modules/next/dist/docs/` (the repo's `AGENTS.md` requires it). `proxy.ts` is the interception file, `headers()` and `cookies()` are async, `next typegen` runs before `tsc`, and `after()` runs within the route's configured `maxDuration`.
- `requireUser()` in every page, server action and route handler, except the upload route `PUT /api/debrief/upload/[token]` (single-use signed token) and the Hosted tick route (bearer secret).
- Files under `app/` and `components/` never import `@/lib/db/client`. They reach the database through `scopedFor(userId)` and `lib/` functions that take a `Scoped`.
- Every `lib/*` function takes a database handle (a `Scoped`) and a user id (carried by the `Scoped`).
- Single writers: `lib/debrief` writes `debrief` and `debrief_suggestion`; `lib/prep/asked.ts` writes `asked_question`; `lib/prep/marks.ts` writes marks; `lib/artifacts` writes every artifact row (including the new `fork` intent and `deleteDebriefDocument`); `lib/pipeline` writes stage, status, next action, stage notes (`appendStageOutcome`) and pipeline events; `lib/library` writes library items; `lib/debrief/apply.ts` writes nothing itself.
- Server functions return the typed `Result` from `@/lib/result`. Expected failures are returned, never thrown. Ingest never fails a push or a save.
- Test first for everything under `lib/`: write the failing test, watch it fail, then write the code.
- No test touches the network. Outbound calls go to an injected fake or a local server on `127.0.0.1`. The model runs through the fake driver, transcription through the `fake` driver.
- No exclamation marks in UI copy. Plain words. Times in the UI go through `components/local-time.tsx` and `components/local-datetime-input.tsx`; machine output uses ISO 8601 UTC.
- Semantic token utilities and stock shadcn variable names only in app code; `pnpm check:tokens` passes. Bars size through a CSS variable with `w-[var(--share)]`.
- Registry first, then `base-nova`, then new code; every new piece is recorded in `docs/design-system.md` under "New application code" with its reason (suggestion row, apply bar, bar list, table twin toggle, upload field).
- Axe has zero violations in light and dark on the entry, review and funnel routes and on every new dialog. Every form submits through `submitViaTransition` (`lib/forms/submit.ts`). Zod messages are explicit plain sentences.
- Every new owned table gets a file under `lib/db/scoped/` and a row in `tests/integration/scoped-isolation.test.ts`. Check constraints list every value from Milestone 25's migration, so later milestones add columns and never widen a constraint (the two exceptions are the `event.kind` and `asset.kind` rewrites the spec names).
- Logs: `[debrief]` lines carry the debrief id, counts per kind, analyzer and codes; `[stt]` lines carry ids, provider, model, bytes, audio milliseconds, run milliseconds and code. Never transcript text, quotes, file names or people's names.
- Transcripts hold other people's words: they stay out of the bridge context, the logs and the admin queries (admin's column test forbids `payload`, `edited_payload`, `quote` and `asked_text`).
- Code comments state reasons. They never cite task numbers or decision ids.
- Commit messages end with the co-author trailer supplied by the executing session.
- End-to-end specs share one account across projects: fixture names carry the project name plus a random suffix (`uniqueName`), assertions are satisfiable only by the test's own data, an open overlay is scanned with `scanOpenOverlay`. The `debrief-*` project chain runs after the earlier chains, one engine at a time.
- Before trusting a local timing, flake count or suite verdict, check `uptime`; above 50, timing failures are unproven.

## Review Focus

1. **A debrief that does not follow the grammar must warn, never fail.** An unknown `**Went:**` value, a date that does not parse, a heading with no items, repeated headings and the real fixture `nwl-debrief-round2.md` (no grammar at all). Pinned by Task 2 (parser table) and Task 8 (ingest never throws).
2. **Apply is one transaction and never applies twice.** A stale bank preview, a deleted stage or bank, a closed job, a second Apply, and an error halfway through (everything rolls back). Pinned by Tasks 11 and 12.
3. **Nothing is proposed twice, and a retyped form does not lose edits.** Fingerprints across a re-pushed file, a second debrief of the same stage, a question asked again in a later round, and a form saved twice. Pinned by Tasks 4 and 8.
4. **Recordings leave no trace.** Attestation on every upload, size and hash check, sniffing, the object gone after the transcript saves, kept after a failure for 24 hours, removed by the expiry step, and the upload route reachable without the proxy buffering a body. Pinned by Tasks 37, 39, 40 and 41.
5. **Funnel arithmetic.** A skipped round must not lower a conversion, a reopened job, imported dates, a week that crosses a time zone change, percentages only at a denominator of 10, and the CV split resolving each `document_sent` event's kind through (`opportunity_id`, `key`, `version`). Pinned by Tasks 46, 47 and 48.

## Left out of this plan, with the reason

- **The `debrief` request kind (spec 5.11).** It is an eighth kind in `lib/requests/kinds.ts`, which belongs to Bridge part two (`2026-11-21-jobsmith-bridge-two`, milestones 30 to 32) and does not exist before it. Debrief's milestones 25 to 29 come first in the cycle order, so the Bridge two plan adds the kind, and "Get suggestions" opens that plan's Where dialog only after it. The Bridge two writer takes these values from spec 5.11: params `key` (the debrief document) and `note`; stage-bound; dedupe key the document key; expected output that key, kind `debrief`, job scope, on the stage; bundle the debrief's latest version under `input/` and the latest version of each question bank on the job; in-app task `debrief_suggest`; 20 minutes, files only; its `request.md` asks for the same document rewritten in the section 5.2 grammar with `## Transcript` kept as is, a quote copied from the transcript inside each `**Why:**`, and ISO dates. Nothing else in this plan changes when that kind lands: a pushed result is ingested by Milestone 25's hook as `parser` suggestions at no credit cost.
- **Reviewing a kept Drill recording against its Say clip with a model (spec 12).** A follow-up milestone after 29, as the spec says.
- **Rewriting a bank question in place, a thank-you note task, Telegram or email reminders, a follow-up list, speaker labels from a provider (spec 12).** Moved out by the spec to cycle 7, Hosted after the beta, a later Feed revision, or when the owner asks.

## Module map

| File | New/changed | One responsibility |
|---|---|---|
| **Milestone 25** | | |
| `lib/db/schema/debrief.ts` | new | `debrief`, `debriefSuggestion`, `askedQuestion` tables |
| `lib/db/migrations/<next>_debrief.sql` | new | three tables, `event_kind_check` rewrite |
| `lib/db/scoped/debrief.ts`, `debrief-suggestion.ts`, `asked-question.ts` | new | scoped helpers, one file per table |
| `lib/db/scoped/index.ts` | changed | `debrief`, `debriefSuggestion`, `askedQuestion` on `Scoped` |
| `lib/pipeline/values.ts` | changed | `EVENT_KINDS` gains `debrief_applied` |
| `lib/debrief/values.ts` | new | constants and types for statuses, kinds, warnings, outcomes |
| `lib/debrief/keys.ts` | new | `questionKeyOf`, `normalizeTarget`, `debriefKeyFor`, `formatDebriefDate` |
| `lib/debrief/grammar.ts` | new | `parseDebrief`, pure |
| `lib/debrief/render.ts` | new | `renderDebrief`, `composeBody`, quick form model |
| `lib/debrief/match.ts` | new | Dice matching, thresholds, stop words |
| `lib/debrief/marks-map.ts` | new | `proposeMark` table |
| `lib/debrief/fingerprint.ts` | new | `fingerprintOf` |
| `lib/debrief/prep-port.ts` | new | the only file that names Prep and Library exports |
| `lib/prep/asked.ts` | new | `upsertAsked` (writer; reads arrive in Milestone 26) |
| `lib/artifacts/plan.ts` | changed | `fork` intent in `planUpsert`, `forkBase` |
| `lib/artifacts/manual.ts` | new | `writeManualVersion` (create or fork or edit a manual version) |
| `lib/artifacts/hooks.ts` | new | `runVersionHooks`, the after-write dispatch (kind `debrief` here) |
| `lib/artifacts/upsert.ts`, `edit.ts` | changed | call `runVersionHooks` after every write |
| `lib/artifacts/delete-debrief.ts` | new | `deleteDebriefDocument`, the only artifact delete |
| `lib/pipeline/schedule.ts` | changed | `appendStageOutcome` beside `setStageOutcome` |
| `lib/pipeline/event-text.ts` | changed | text for `debrief_applied` |
| `lib/pipeline/debrief-event.ts` | new | `recordDebriefApplied`, the `debrief_applied` event writer |
| `lib/debrief/payload.ts` | new | payload Zod schemas, `v: 1` |
| `lib/debrief/ingest.ts` | new | `ingestDebrief` |
| `lib/debrief/save.ts` | new | `saveDebriefDocument`, `appendTranscript`, `setDebriefStage`, `defaultDebriefStage` |
| `lib/debrief/review.ts` | new | `loadReview`, decide, edit, group accept, date, reviewed |
| `lib/prep/bank-append.ts` | new | section builder, bank choice, `appendAskedToBank` |
| `lib/debrief/next-action.ts` | new | `composeNextAction` |
| `lib/debrief/apply.ts` | new | `applyDebrief` |
| `lib/debrief/delete.ts` | new | `deleteDebrief` (rows, audio hook, document) |
| `lib/debrief/messages.ts`, `copy.ts` | new | action messages, binding UI copy |
| `lib/export/collect.ts` | changed | `debriefs`, `debriefSuggestions`, `askedQuestions` |
| `app/(app)/jobs/[slug]/debrief/new/page.tsx`, `[id]/page.tsx`, `actions.ts` | new | entry, review, actions |
| `lib/debrief/list.ts` | new | `listDebriefRows`, the Debriefs block's data |
| `components/debrief/*` | new | quick form, notes field, suggestion rows, apply bar, Debriefs block |
| `components/job/stage-detail-sheet.tsx`, `tab-prep.tsx` | changed | "Debrief this interview"; Debriefs block |
| **Milestone 26** | | |
| `lib/prep/asked.ts` | changed | `latestAsks`, `otherCompanyCounts`, `missedCounts`, `askedHistory` |
| `lib/prep/order.ts` | changed | the missed tier |
| `components/prep/*` | changed | asked chip, "Asked at N other companies", "Answer in Library" |
| `lib/attention/items.ts`, `copy.ts`, `load.ts` | changed | `debrief_review`, missed line, rule 5 change |
| `lib/prep/hub-asked.ts` | new | `loadHubAsked`, `askedChipModel` |
| `lib/debrief/context.ts` | new | `loadContextDebriefs` |
| `lib/bridge/context.ts` | changed | `## Debriefs` section |
| `components/library/*` | changed | "Asked in interviews" |
| **Milestone 27** | | |
| `lib/debrief/clean.ts`, `truncate.ts`, `prompt.ts`, `sanitize.ts`, `quotes.ts` | new | cleanup, truncation, prompt, sanitize, quote check |
| `lib/debrief/hosted-port.ts` | new | the only file that names Hosted and Feed exports |
| `lib/debrief/suggest.ts` | new | `requestSuggestions`, `runSuggestions`, `reconcileDebrief` |
| `lib/debrief/ingest-model.ts` | new | `ingestModelResult` |
| `lib/debrief/status.ts` | new | `debriefOffers`, `sourceLine` |
| `lib/generate/start.ts` | changed | `startAnalysis`, `finishAnalysis` for the two debrief tasks |
| `lib/generate/tasks/debrief-suggest.ts` | new | task module (Hosted registry) |
| `lib/ai/driver.ts`, `fake.ts` | changed | `AI_TASKS` gains `debrief_suggest`; fake default |
| `lib/credits/costs.ts` | changed | price 5, cap 10 |
| `lib/debrief/stats.ts` | new | suggestion counts, hit rate |
| **Milestone 28** | | |
| `lib/transcribe/*` | new | driver, config, fake, openai-compatible, gateway if a route exists |
| `lib/storage/*` | changed | `createUpload`, `head` in all four drivers; `putStream` in `local` and `memory` |
| `lib/storage/upload-token.ts` | new | single-use HMAC upload token |
| `proxy.ts` | changed | matcher excludes `api/debrief/upload/` |
| `app/api/debrief/upload/[token]/route.ts` | new | streaming PUT target |
| `lib/audio/sniff.ts`, `duration.ts` | new, changed | magic bytes; M4A `mvhd` |
| `lib/debrief/audio.ts`, `notice.ts`, `transcribe-run.ts`, `expire.ts`, `delete.ts` | new, changed | upload actions, notice constant, run, expiry, deletion of audio |
| `lib/generate/tasks/transcribe-audio.ts` | new | task module |
| `cli/src/commands/transcribe.ts` | new | `jobsmith transcribe` |
| **Milestone 29** | | |
| `lib/funnel/*` | new | types, cohort, reach, median, durations, response, weekly, splits, closes, companies, format, debriefs, report, load |
| `lib/db/scoped/{opportunity,stage,event}.ts` | changed | content-free funnel loaders |
| `lib/profile/index.ts`, `lib/export/collect.ts` | changed | `search_started_on` read and write; export field |
| `tests/fixtures/funnel/search.ts` | new | the hand-computed twelve-job search |
| `lib/db/schema/app.ts`, migration | changed, new | `profile.search_started_on` |
| `app/(app)/funnel/*`, `components/funnel/*` | new | page, tiles, bar list, table twin, window toggle |
| `components/app-shell.tsx` | changed | Funnel after Board, under More on a phone |

## Contract

### Tables (Milestone 25 migration; later milestones add columns only)

All three: uuid `id` primary key, `user_id` text not null with index and cascade to `user`, `created_at` and `updated_at` `timestamptz`, `unique (user_id, id)`.

**`debrief`**: `opportunity_id` uuid not null (composite FK (`user_id`, `opportunity_id`) cascade), `stage_id` uuid null (single-column FK to `stage.id`, set null, as `artifact.stage_id` does), `artifact_key` text not null, `artifact_id` uuid null and `artifact_version` integer null (composite FK (`user_id`, `artifact_id`) to `artifact (user_id, id)`, cascade), `input` text not null check in (`form`, `text`, `audio`, `push`), `analyzer` text null check in (`parser`, `model`), `status` text not null default `ready` check in (`uploading`, `transcribing`, `ready`, `analyzing`, `failed`), `error_code` text null, `occurred_at` timestamptz not null, `rating` smallint null check 1 to 5, `notes_chars` integer not null default 0, `transcript_chars` integer not null default 0, `truncated` boolean not null default false, `reviewed_at` null, `applied_at` null. Unique on `artifact_id` where not null. Indexes (`user_id`, `opportunity_id`) and (`user_id`, `status`).
Added later: Milestone 27 `generation_id` uuid null (FK to `generation.id`, set null). Milestone 28 `audio_asset_id` uuid null (FK to `asset.id`, set null), `audio_ms` integer null, `recording_attested_at` timestamptz null, `keep_audio` boolean not null default false.

**`debrief_suggestion`**: `debrief_id` uuid not null (composite FK cascade), `opportunity_id` uuid not null (composite FK cascade), `stage_id` uuid null (single FK set null), `position` integer not null, `kind` check in (`asked`, `library`, `follow_up`, `outcome`, `pipeline`), `analyzer` check in (`form`, `parser`, `model`), `payload` jsonb not null, `edited_payload` jsonb null, `quote` text null check length <= 240, `warnings` jsonb not null default `[]`, `question_key` text null, `fingerprint` text not null check `^[0-9a-f]{16}$`, `status` check in (`pending`, `accepted`, `rejected`, `superseded`) default `pending`, `decided_at` null, `applied_at` null, `apply_error` text null check in (`stage_gone`, `closed`, `bank_gone`, `invalid`). Unique (`debrief_id`, `position`). Indexes (`user_id`, `opportunity_id`, `fingerprint`) and (`user_id`, `status`).

**`asked_question`**: `opportunity_id` uuid not null (composite FK cascade), `stage_id` uuid null (single FK set null), `debrief_id` uuid null (single FK set null), `suggestion_id` uuid null (single FK set null), `question_key` text not null, `asked_text` text not null check length <= 300, `outcome` check in (`held`, `wobbled`, `missed`, `unclear`), `asked_at` timestamptz not null. Unique (`opportunity_id`, `stage_id`, `question_key`). Indexes (`user_id`, `question_key`) and (`user_id`, `opportunity_id`).

Other changes: `event.kind` check rewritten to every value of `EVENT_KINDS` in `lib/pipeline/values.ts` plus `debrief_applied` (Task 1). Milestone 27: `generation.task` gains `debrief_suggest`, `notification.kind` gains `debrief_ready`. Milestone 28: `generation.task` gains `transcribe_audio`, `asset.kind` gains `interview_audio`, `asset.expires_at` timestamptz null. Milestone 29: `profile.search_started_on` date null.

### Constants and types (`lib/debrief/values.ts`)

```ts
export const DEBRIEF_INPUTS = ["form", "text", "audio", "push"] as const;
export const DEBRIEF_ANALYZERS = ["parser", "model"] as const;
export const DEBRIEF_STATUSES = ["uploading", "transcribing", "ready", "analyzing", "failed"] as const;
export const SUGGESTION_KINDS = ["asked", "library", "follow_up", "outcome", "pipeline"] as const;
export const SUGGESTION_ANALYZERS = ["form", "parser", "model"] as const;
export const SUGGESTION_STATUSES = ["pending", "accepted", "rejected", "superseded"] as const;
export const SUGGESTION_WARNINGS = ["quote_not_found", "low_match", "date_out_of_range", "unknown_value"] as const;
export const APPLY_ERRORS = ["stage_gone", "closed", "bank_gone", "invalid"] as const;
export const ASK_OUTCOMES = ["held", "wobbled", "missed", "unclear"] as const;
export type AskOutcome = (typeof ASK_OUTCOMES)[number];
export type MarkLevel = "shaky" | "okay" | "solid";
export type NextKind = "next_round" | "waiting" | "rejected" | "withdrawn";
export type SuggestionWarning = (typeof SUGGESTION_WARNINGS)[number];
export const QUOTE_MAX_CHARS = 240;
export const ASKED_TEXT_MAX = 300;
export const MAX_DEBRIEF_TEXT_BYTES = 1_048_576;          // 1 MiB of pasted text
export const MAX_FOLLOW_UPS_FORM = 6;
export const ASKED_BANK_KEY = "asked-questions";
export const ASKED_BANK_TITLE = "Questions asked in interviews";
export const INTERVIEW_KINDS = ["recruiter_screen", "hiring_manager", "portfolio_case", "panel_final"] as const;
// error codes written to debrief.error_code (text, not a check): upload_missing, stt_timeout, stt_too_large,
// stt_bad_audio, stt_rate_limited, stt_error, ai_timeout, ai_bad_output, ai_error, gen_stalled
```

### Grammar (`lib/debrief/grammar.ts`, `render.ts`, `keys.ts`)

```ts
export type ParsedAsk = { text: string; outcome: AskOutcome; why: string | null; quote: string | null; said: string | null; spine: string | null; warnings: SuggestionWarning[] };
export type ParsedLanded = { title: string; text: string };
export type ParsedFollowUp = { text: string; dueOn: string | null; warnings: SuggestionWarning[] };   // dueOn: ISO date
export type GrammarProblem = { code: "unknown_went" | "bad_date" | "empty_heading" | "bad_rating"; detail: string };
export type ParsedDebrief = {
  hasGrammar: boolean;                 // rating, or at least one item under a grammar heading
  rating: number | null;               // 1 to 5
  asked: ParsedAsk[]; landed: ParsedLanded[]; didNotLand: string[];
  followUps: ParsedFollowUp[]; next: { kind: NextKind; text: string } | null;
  notes: string;                       // everything the parser does not read, outside the transcript
  transcript: string | null;           // text after the first `## Transcript`
  problems: GrammarProblem[];
};
export function parseDebrief(bodyMd: string): ParsedDebrief;
export function hasDebriefHeading(text: string): boolean;                       // any grammar heading or `## Transcript`
export function questionKeyOf(text: string): string;                            // Prep's normalization and sha256, 16 hex
export function normalizeTarget(text: string): string;                          // lower case, quotes and punctuation removed, one space
export function debriefKeyFor(stage: { id: string; label: string }, docs: { key: string; stageId: string | null }[]): string;
export function formatDebriefDate(at: Date, timeZone: string): string;         // "3 Nov 2026", fixed month names
export type QuickForm = {
  rating: number | null;
  asked: { text: string; outcome: "held" | "wobbled" | "missed"; said?: string; spine?: string; why?: string }[];
  followUps: { text: string; dueOn: string | null }[];
  next: { kind: NextKind | null; text: string };
  anything: string;
};
export function renderDebrief(form: QuickForm, input: { stageLabel: string; transcribed?: boolean }): string;
export function composeBody(input: { formMd: string | null; text: string | null }): string;   // pasted text kept as is when hasDebriefHeading, else under `## Transcript`
```

Heading synonyms (case-insensitive, level 2): `Asked` or `Questions asked`; `Landed` or `What worked`; `Did not land` or `What did not work`; `Follow-ups`; `Next steps`; `Rating`; `Transcript`. Outcome words: held (`held`, `landed`, `good`), wobbled (`wobbled`, `shaky`, `okay`), missed (`missed`, `blanked`, `bad`); anything else is `unclear` with `unknown_value`. `**Next:**` takes the longest leading match of `next round`, `next_round`, `waiting`, `rejected`, `withdrawn` (case-insensitive); the free text is the rest of that line after an optional `:`, `.`, `,`, `;`, `-` or `·`, plus the following lines up to the next heading. A follow-up's date is `(due 2026-11-04)` or `· 2026-11-04` at the end of the item. The quick form renders `# Debrief: <stage label>` (with ` (transcribed)` for a server transcription), `**Rating:** 4/5`, then the sections `## Asked`, `## Follow-ups`, `## Next steps`, `## Anything else` (the last is notes, never parsed).

### Matching, marks, fingerprints

```ts
export type MatchCandidate = { questionKey: string; text: string; source: "bank" | "library"; artifactKey: string | null; number: number | null; section: string | null; bankTitle: string | null; stageId: string | null };
export type MatchResult = { questionKey: string; candidate: MatchCandidate | null; similarity: number; lowMatch: boolean; candidates: { candidate: MatchCandidate; similarity: number }[] };
export const MATCH_STRONG = 0.75; export const MATCH_WEAK = 0.45; export const MATCH_OFFER_MIN = 0.25; export const MODEL_LOW_MATCH_BELOW = 0.3; export const LIBRARY_APPEND_MIN = 0.6;
export const STOP_WORDS: readonly string[];   // fixed in Task 4
export function dice(a: string, b: string): number;
export function matchAsk(askText: string, candidates: MatchCandidate[], modelMatchKey?: string | null): MatchResult;
export function proposeMark(went: AskOutcome, current: MarkLevel | null): MarkLevel | null;   // null: no change
export function fingerprintOf(input: { kind: SuggestionKind; stageId: string | null; target: string }): string;   // first 16 hex of sha256 of `${kind}|${stageId ?? ""}|${normalizeTarget(target)}`
```

Mark table (went by current mark; blank is "no change"): held: unmarked okay, shaky okay, okay solid, solid blank. wobbled: unmarked shaky, shaky blank, okay blank, solid okay. missed: unmarked shaky, shaky blank, okay shaky, solid shaky. unclear: always blank.

### Payloads (`lib/debrief/payload.ts`, every one carries `v: 1`)

```ts
export type AskedPayload = { v: 1; askedText: string; outcome: AskOutcome; reason: string | null; match: { questionKey: string; artifactKey: string | null; number: number | null; questionText: string; similarity: number } | null; candidates: { questionKey: string; questionText: string; number: number | null; similarity: number }[]; markTo: MarkLevel | null; newQuestion: { question: string; spine: string | null; say: string | null; bankKey: string } | null };
export type LibraryPayload = { v: 1; mode: "create" | "append"; itemId: string | null; kind: "story" | "answer"; title: string; bodyMd: string; questionKey: string | null; tags: string[] };
export type FollowUpPayload = { v: 1; text: string; dueOn: string | null };
export type OutcomePayload = { v: 1; rating: number | null; summaryMd: string };           // summary, then "Did not land:" list
export type PipelinePayload = { v: 1; action: "move" | "close"; kind: StageKind | null; reason: ClosedReason | null };
export type SuggestionPayload = AskedPayload | LibraryPayload | FollowUpPayload | OutcomePayload | PipelinePayload;
```

### Library functions (names binding)

```ts
// lib/debrief/ingest.ts (runs inside the transaction that writes any debrief version)
export type DebriefVia = "form" | "paste" | "transcript" | "push" | "edit";
export async function ingestDebrief(tx: Scoped, input: { opportunityId: string; artifactId: string; via: DebriefVia; now: Date }): Promise<{ debriefId: string; created: number; dropped: number; superseded: number }>;
// lib/debrief/save.ts
export type SaveDebriefInput = { stageId: string | null; form: QuickForm | null; text: string | null; below?: boolean };
export async function saveDebriefDocument(s: Scoped, opportunityId: string, input: SaveDebriefInput, now?: Date): Promise<Result<{ debriefId: string; key: string; version: number }, "not_found" | "stage_not_found" | "stage_not_allowed" | "empty" | "too_large" | "invalid">>;
export async function appendTranscript(tx: Scoped, opportunityId: string, key: string, transcript: string, origin: "generated" | "pasted", now: Date): Promise<Result<{ version: number; artifactId: string }, "not_found" | "artifact_not_found">>;
export async function setDebriefStage(s: Scoped, opportunityId: string, debriefId: string, stageId: string, now?: Date): Promise<Result<null, "not_found" | "stage_not_found" | "stage_not_allowed">>;
export function defaultDebriefStage(stages: { id: string; kind: StageKind; scheduledAt: Date | null; status: StageStatus }[], currentStageId: string, debriefedStageIds: ReadonlySet<string>, now: Date): string | null;
// lib/debrief/review.ts
export type SuggestionView = { id: string; kind: SuggestionKind; analyzer: SuggestionAnalyzer; status: SuggestionStatus; payload: SuggestionPayload; edited: SuggestionPayload | null; quote: string | null; warnings: SuggestionWarning[]; applyError: ApplyError | null; position: number; live: LiveTarget };
export type LiveTarget = { mark: MarkLevel | null; nextAction: string | null };   // today's state shown before Apply
export type ReviewView = { debrief: DebriefRow; rows: DebriefRow[]; stage: { id: string; label: string; kind: StageKind } | null; groups: Record<SuggestionKind, SuggestionView[]>; pendingCount: number; acceptedUnapplied: number; documentTitle: string; source: string };
export async function loadReview(s: Scoped, opportunityId: string, debriefId: string): Promise<Result<ReviewView, "not_found">>;
export async function decideSuggestion(s: Scoped, suggestionId: string, decision: "accept" | "reject" | "reset", now?: Date): Promise<Result<null, "not_found" | "already_applied">>;
export async function decideGroup(s: Scoped, debriefId: string, kind: SuggestionKind, now?: Date): Promise<Result<{ accepted: number }, "not_found">>;
export async function editSuggestion(s: Scoped, suggestionId: string, payload: unknown, now?: Date): Promise<Result<null, "not_found" | "already_applied" | "invalid">>;   // stores edited_payload and accepts
export async function setOccurredAt(s: Scoped, debriefId: string, at: Date): Promise<Result<null, "not_found">>;
export async function markReviewed(s: Scoped, debriefId: string, now?: Date): Promise<Result<null, "not_found">>;
// lib/prep/bank-append.ts
export type NewBankQuestion = { question: string; spine: string | null; say: string | null; stageLabel: string };
export function buildAskedSection(input: { dateLabel: string; stageLabel: string; startNumber: number; questions: NewBankQuestion[]; joinExisting: boolean }): string;
export function highestQuestionNumber(bodyMd: string): number;
export async function chooseBank(tx: Scoped, opportunityId: string, debriefedStageId: string, preferredKey?: string | null): Promise<{ key: string; exists: boolean }>;
export async function appendAskedToBank(tx: Scoped, opportunityId: string, input: { bankKey: string; questions: NewBankQuestion[]; at: Date; timeZone: string; stageLabel: string }): Promise<Result<{ bankKey: string; version: number; numbers: number[] }, "bank_gone">>;   // always appends to the latest body
// lib/debrief/next-action.ts
export const NEXT_ACTION_MAX = 300;
export function composeNextAction(input: { followUps: { text: string; dueOn: string | null }[]; current: { text: string; at: Date | null } | null; timeZone: string; now: Date }): { text: string; at: Date };
// lib/debrief/apply.ts
export type ApplyCounts = { marks: number; asked: number; newQuestions: number; library: number; followUps: number; notes: number; moves: number; closes: number };
export type ApplyOutcome = { counts: ApplyCounts; skipped: { suggestionId: string; code: ApplyError }[]; nextActionSet: boolean; added: { bankKey: string; number: number; questionKey: string }[] };
export async function applyDebrief(s: Scoped, debriefId: string, now?: Date): Promise<Result<ApplyOutcome, "not_found" | "stage_required">>;
// lib/debrief/delete.ts
export async function deleteDebrief(s: Scoped, opportunityId: string, debriefId: string): Promise<Result<{ versions: number }, "not_found">>;
// lib/artifacts
export async function writeManualVersion(tx: Scoped, opportunityId: string, input: { key: string; kind: ArtifactKind; title: string; stageId: string | null; bodyMd: string; fork?: boolean; baseVersion?: number; via?: DebriefVia }, now: Date): Promise<Result<{ status: "created" | "versioned" | "edited" | "unchanged"; version: number; artifactId: string }, "not_found" | "invalid">>;
export async function runVersionHooks(tx: Scoped, written: { opportunityId: string; artifactId: string; kind: ArtifactKind; origin: ArtifactOrigin; status: UpsertStatus; via?: DebriefVia }, now: Date): Promise<void>;
export async function deleteDebriefDocument(tx: Scoped, opportunityId: string, key: string): Promise<Result<{ versions: number }, "not_found" | "not_debrief">>;
// lib/pipeline/schedule.ts
export async function appendStageOutcome(s: Scoped, opportunityId: string, stageId: string, block: string): Promise<Result<null, "not_found">>;
// lib/prep/asked.ts
export async function upsertAsked(tx: Scoped, input: { opportunityId: string; stageId: string; debriefId: string; suggestionId: string; questionKey: string; askedText: string; outcome: AskOutcome; askedAt: Date }): Promise<void>;
```

`planUpsert` gains `UpsertIntent.fork?: boolean`. With `fork` and origin `manual`: a changed body is always `versioned` (even when the latest is unsent), `sourceHash: null`, `editedAt: now`, and the plan carries `forkBase: latest body` (the caller passes the base text). An unchanged body is `unchanged`. `NewVersion` gains `sourceBodyMd?: string | null`, written only when `artifact.source_body_md` exists (Apply milestone 20).

### Milestone 27 and 28 names

```ts
// lib/debrief/clean.ts, truncate.ts, prompt.ts, sanitize.ts, quotes.ts
export const NOTES_MAX_CHARS = 8_000; export const TRANSCRIPT_MAX_CHARS = 80_000; export const CHARS_PER_MINUTE = 80_000 / 85;
export const DEBRIEF_MAX_OUTPUT_TOKENS = 6_000; export const DEBRIEF_TIMEOUT_MS = 120_000; export const DEBRIEF_MIN_CHARS = 200;
export function cleanTranscript(raw: string): string;
export type Truncation = { text: string; truncated: boolean; analyzedMinutes: number | null; droppedMinutes: number | null };
export function truncateTranscript(cleaned: string, limit?: number): Truncation;
export function buildDebriefPrompt(input: PromptInput): { instructions: string; prompt: string; notesChars: number; transcriptChars: number; truncated: boolean; analyzedMinutes: number | null };
export const DEBRIEF_INSTRUCTIONS: string;
export const debriefModelSchema: z.ZodType<DebriefModelOutput>;
export function sanitizeModelOutput(raw: DebriefModelOutput, ctx: SanitizeContext): { ok: true; value: SanitizedDebrief } | { ok: false; code: "ai_bad_output" };
export function findQuote(quote: string, haystack: string): boolean;                 // lower-cased, whitespace collapsed
// lib/debrief/suggest.ts
export async function requestSuggestions(s: Scoped, debriefId: string, deps: SuggestDeps): Promise<Result<{ debriefId: string }, SuggestError>>;
export async function runSuggestions(s: Scoped, debriefId: string, deps: SuggestDeps): Promise<void>;   // never throws, never leaves analyzing
export type SuggestError = "not_found" | "ai_off" | "too_short" | "busy" | "no_credits" | "cap_task_day" | "cap_day" | "cap_global" | "suspended" | "already_running";
// lib/credits/costs.ts additions: TASK_COSTS.debrief_suggest = 5, TASK_DAILY_CAPS.debrief_suggest = 10, TASK_COSTS.transcribe_audio per 2 started minutes, TASK_DAILY_CAPS.transcribe_audio = 240 (minutes)
// lib/transcribe
export type TranscribeSegment = { startMs: number; endMs: number; text: string };
export type TranscribeError = "stt_timeout" | "stt_too_large" | "stt_bad_audio" | "stt_rate_limited" | "stt_error";
export interface TranscribeDriver { readonly name: "openai_compatible" | "gateway" | "fake"; readonly modelId: string; readonly maxBytes: number; transcribe(input: { audio: Uint8Array; contentType: string; language?: string; prompt?: string }): Promise<Result<{ text: string; segments: TranscribeSegment[] | null; durationMs: number | null; modelId: string }, TranscribeError>>; }
export function parseTranscribeConfig(source: Record<string, string | undefined>): { ok: true; config: TranscribeConfig | null } | { ok: false; invalid: string[] };
// lib/storage additions
export type UploadTarget = { url: string; method: "PUT" | "POST"; headers: Record<string, string>; fields: Record<string, string> };
// Storage.createUpload(key, { contentType, maxBytes, expiresInSeconds }): Promise<UploadTarget>; Storage.head(key): Promise<{ bytes: number } | null>
// Storage.putStream(key, body, { maxBytes, contentType }): Promise<Result<{ bytes: number }, "too_large">>   // local and memory only, used by the upload route
// lib/storage/upload-token.ts: signUploadToken({ key, maxBytes, expiresAt }, secret), verifyUploadToken(token, secret, now)
// lib/audio/sniff.ts
export type AudioSniff = { ok: true; container: "mp3" | "m4a" | "wav" | "webm" | "ogg" | "flac" } | { ok: false; reason: "video" | "unknown" };
export function sniffAudio(head: Uint8Array): AudioSniff;
// lib/debrief/audio.ts
export async function startAudioUpload(s: Scoped, input: StartAudioUpload, deps: AudioDeps): Promise<Result<{ debriefId: string; assetId: string; upload: UploadTarget }, AudioError>>;
export async function finishAudioUpload(s: Scoped, debriefId: string, deps: AudioDeps): Promise<Result<{ debriefId: string }, AudioError>>;
export const AUDIO_EXTENSIONS = [".m4a", ".mp3", ".wav", ".webm", ".ogg", ".opus", ".flac"] as const;
export const UPLOAD_EXPIRES_SECONDS = 900; export const ASSET_UNFINISHED_HOURS = 24; export const KEEP_AUDIO_DAYS = 30;
export const MAX_AUDIO_MINUTES = 120; export const MAX_UPLOADS_PER_DAY = 10; export const DEFAULT_TRANSCRIBE_MAX_MB = 25; export const TRANSCRIBE_MAX_MB_CEILING = 200;
```

### Environment variables (each in `.env.example` with a comment)

`TRANSCRIBE_PROVIDER` (`openai_compatible`, `gateway`, `fake`; unset means off), `TRANSCRIBE_BASE_URL`, `TRANSCRIBE_API_KEY` (optional), `TRANSCRIBE_MODEL` (default `whisper-1`), `TRANSCRIBE_MAX_MB` (default 25, at most 200), `TRANSCRIBE_TIMEOUT_S` (default 240), `TRANSCRIBE_FAKE_WAIT_MS` (fake only, default 0). The CLI reads `JOBSMITH_STT_URL`; its default is `http://127.0.0.1:8000/v1`.

### Funnel names (Milestone 29)

```ts
export type FunnelWindow = "search" | "90d" | "all";
export type Conversion = { num: number; den: number; label: string };      // label "43%" when den >= 10, else "3 of 7"
export type FunnelReport = { window: FunnelWindow; searchStartedOn: string | null; tiles: FunnelTiles; reached: ReachRow[]; stageDays: StageDaysRow[]; response: ResponseSummary; weekly: WeeklyBars; responseBySource: RateRow[]; responseByCv: RateRow[]; closes: CloseRow[]; companies: CompanyRow[]; debriefs: DebriefStats | null };
export function buildFunnelReport(input: FunnelInput): FunnelReport;      // pure
export async function loadFunnel(s: Scoped, window: FunnelWindow, now: Date): Promise<FunnelReport>;
export const MIN_PERCENT_DENOMINATOR = 10; export const MIN_MEDIAN_VALUES = 3; export const NO_RESPONSE_DAYS = 30; export const MAX_WEEKLY_BARS = 26; export const PHONE_WEEKS = 12;
```

### Binding copy

- Entry page title `Debrief: {stage label}`; subline `{role} at {company}`. Sections and labels: `How it went` with radio words `1 Rough`, `2 Below par`, `3 Fine`, `4 Good`, `5 Great`; `Questions asked` with combobox label `Pick a question from your bank`, button `Add a question they asked`, text label `What they asked`, outcome toggle `Held`, `Wobbled`, `Missed`; `Follow-ups promised` with `What you promised`, `Due (optional)`, button `Add a follow-up`, and at six `Six follow-ups at most.`; `Next steps heard` with radios `Next round`, `Waiting`, `Rejected`, `Withdrawn` and text label `What they said`; `Anything else`; `Transcript or notes`, file picker `Choose a file (.txt, .md, .vtt, .srt)`; save button `Save debrief`; empty submit `Fill in the form or paste some text first.`; `Which interview was this?`.
- Review: group titles `Asked`, `Library`, `Follow-ups`, `Stage notes`, `What's next`, each with `Accept all`; row buttons `Accept`, `Edit`, `Reject`, `Undo`; ask line `They asked: '{text}'`; match `Question {n} in {bank title}` or `Not in your bank`; low match `Check this match`; mark effect `{from} to {to}` or `Already {level}`; bar `Apply {n} changes` (`Apply 1 change`); `Done reviewing`; announcements `Suggestions ready`, `Applied {n} changes`; skipped toast `Applied {n} changes. Skipped {k}: {reason}.` with reasons `the stage was removed`, `the job is closed`, `the bank was removed`, `the suggestion no longer fits`; delete `Delete this debrief`, body `This removes every version of this debrief, its suggestions and any recording. Questions you recorded as asked and anything already applied stay.`, button `Delete debrief`; sources `From your quick form`, `From your debrief`, `Suggested by AI from {n} minutes of transcript`; truncation `Analyzed the first {n} minutes`.
- Event text for `debrief_applied`: `Debrief of {stage label}: ` then the nonzero parts joined by `, ` (`{n} mark` or `{n} marks`, `{n} new question` or `{n} new questions`, `{n} library item` or `{n} library items`, `next action set`, `stage notes added`, `moved to {label}`, `closed as {reason label}`), then `.`. Meta `{ debriefId, stageId, stageLabel, counts, added }`.
- Stage notes block opens `Debrief {date}: {rating} of 5.` (`Debrief {date}.` with no rating). Bank section heading `## Asked on {date}, add to the bank`, note `From the {stage label} debrief.`, library append lead `From the {stage label} at {company}, {date}:`.
- Home: `Review the {stage label} debrief`, meta `{n} suggestions` (`1 suggestion`), action `Review`; missed line `{n} questions missed last round` (`1 question missed last round`), action `Drill missed`; rule 5 action `Debrief`. Hub chips `Asked in {stage label} · {outcome}`, `Asked at {n} other companies` (`1 other company`), `Answer in Library`.
- Also fixed here: Drill with `?missed=1` and an empty tier `Nothing missed since your last drill.`; Home group title `Debriefs to review`; run status `Reading your debrief. {n} seconds so far.`, failure `Suggestions could not be made: {reason}.`, ceiling `This is taking longer than usual. Reload to check again.`; Get suggestions dialog body `Jobsmith sends your notes and transcript to the AI provider once, and proposes changes you review.`; recording copy lives in `lib/debrief/notice.ts` and Task 42; empty funnel `No jobs in this window yet.` with `Jobs you add show up here once they start inside the window.`; search start error `Enter a date that is not in the future.`.
- Funnel: tiles `Jobs`, `Applied`, `Interviews`, `Offers`, `Response rate`; `Too few to tell`; `{n} still here`; `Dropped before applying`; `This search started on {date}` with `Edit`; window toggle `This search`, `90 days`, `All time`; `Table` toggle; phone close line `{stage label}: {n} rejected, {k} ghosted`.

## Task list

| Task | Milestone | Title | Files touched (short) | Depends on tasks |
|---|---|---|---|---|
| 1 | 25 | Migration, schema, scoped helpers, isolation | schema, migration, scoped, values | none |
| 2 | 25 | Values, keys and the grammar parser | `lib/debrief/values,keys,grammar` | 1 |
| 3 | 25 | Render, quick form model, compose body | `lib/debrief/render` | 2 |
| 4 | 25 | Matching, mark table, fingerprints | `lib/debrief/match,marks-map,fingerprint` | 2 |
| 5 | 25 | Prep port and `upsertAsked` | `prep-port`, `lib/prep/asked` | 1 |
| 6 | 25 | `fork` intent, `writeManualVersion`, version hooks | `lib/artifacts/*` | 1 |
| 7 | 25 | `appendStageOutcome`, `deleteDebriefDocument`, event text | pipeline, artifacts | 1, 6 |
| 8 | 25 | Payload schemas and ingest | `payload`, `ingest` | 2, 4, 5, 6 |
| 9 | 25 | Save paths, stage choice, keys | `save` | 3, 6, 8 |
| 10 | 25 | Review library | `review` | 8 |
| 11 | 25 | Bank append and next action composition | `bank-append`, `next-action` | 6, 5 |
| 12 | 25 | `applyDebrief` | `apply` | 5, 7, 10, 11 |
| 13 | 25 | Delete, export, messages | `delete`, `export`, `messages` | 7, 12 |
| 14 | 25 | Actions and routes | `app/(app)/jobs/[slug]/debrief/*` | 9, 10, 12, 13 |
| 15 | 25 | Components: form, notes field, review, apply bar | `components/debrief/*` | 14 |
| 16 | 25 | Debriefs block and stage sheet link | `tab-prep`, `stage-detail-sheet` | 14 |
| 17 | 25 | End to end, docs and ship | e2e, docs, config | 15, 16 |
| 18 | 26 | `lib/prep/asked.ts` reads | `asked`, scoped | 12 |
| 19 | 26 | Drill's missed tier | `lib/prep/order`, drill route | 18 |
| 20 | 26 | Hub chips | `components/prep/*` | 18 |
| 21 | 26 | Home: `debrief_review`, missed line, rule 5 | `lib/attention/*` | 18 |
| 22 | 26 | Library history | library item page | 18 |
| 23 | 26 | Context document Debriefs section | `lib/bridge/context` | 12 |
| 24 | 26 | Carry offer on the Prep tab | `components/prep`, tab-prep | 12 |
| 25 | 26 | End to end, docs and ship | e2e, docs | 19 to 24 |
| 26 | 27 | Transcript cleanup and truncation | `clean`, `truncate` | none |
| 27 | 27 | Prompt, instructions, model schema | `prompt` | 26 |
| 28 | 27 | Sanitize and quote check | `sanitize`, `quotes` | 27 |
| 29 | 27 | Task, price, cap, migration, fake default | ai, credits, migration | 1 |
| 30 | 27 | Hosted port and run lifecycle | `hosted-port`, `suggest` | 28, 29 |
| 31 | 27 | Model results into suggestions | `ingest` | 28, 30 |
| 32 | 27 | Notification, hit-rate counts, admin counts | `stats`, notify, admin | 30 |
| 33 | 27 | Review page states and Get suggestions | components, routes | 30, 31 |
| 34 | 27 | End to end, live check, docs and ship | e2e, docs | 33 |
| 35 | 28 | Migration, sniffing, M4A duration | schema, `lib/audio/*` | 1 |
| 36 | 28 | `lib/transcribe` | `lib/transcribe/*` | 35 |
| 37 | 28 | Upload target, token, route, proxy exclusion | storage, route, `proxy.ts` | 35 |
| 38 | 28 | Blob and S3 upload drivers | storage drivers | 37 |
| 39 | 28 | Start and finish upload | `lib/debrief/audio` | 36, 37 |
| 40 | 28 | `transcribe_audio` run | `transcribe-run` | 39, 8 |
| 41 | 28 | Expiry, tick step, delete now | jobs, `delete` | 40 |
| 42 | 28 | Upload field, notice, attestation, states | components | 39, 40 |
| 43 | 28 | `jobsmith transcribe` | `cli/src` | 36 |
| 44 | 28 | End to end, live check, docs and ship | e2e, docs, legal | 41, 42, 43 |
| 45 | 29 | `search_started_on`, scoped loaders | schema, scoped, profile | none |
| 46 | 29 | Cohort, windows, reach, conversion | `lib/funnel/cohort,reach` | 45 |
| 47 | 29 | Durations and response | `durations`, `response` | 46 |
| 48 | 29 | Weekly, splits, closes, companies | `weekly`, `closes`, `companies` | 47 |
| 49 | 29 | Report, loader, performance, seed test | `report`, `load` | 48 |
| 50 | 29 | Funnel components | `components/funnel/*` | 49 |
| 51 | 29 | Route, navigation, phone layout | page, shell | 50 |
| 52 | 29 | Debriefs section (after Milestone 25) | `debriefs` | 49, 12 |
| 53 | 29 | End to end, docs and ship | e2e, docs | 51 |

## Parallel work

- Milestone 25: after Task 1, Tasks 2, 5, 6 can run at the same time (different files). After Task 2: Tasks 3 and 4. Task 7 needs 6 (both touch `lib/artifacts`). Tasks 10 and 11 can run together once 8 and 6 are done. Tasks 15 and 16 can run together after 14.
- Milestone 26: Tasks 19, 20, 21, 22, 23 touch different files and can run together after Task 18. Task 24 touches `tab-prep.tsx`, which Task 20 also touches, so run it after Task 20.
- Milestone 27: Tasks 26 and 29 are independent. Tasks 27 and 28 are sequential. Tasks 32 and 33 can run together after 30 and 31.
- Milestone 28: Tasks 36, 37 and 43 can run together after Task 35 (Task 43 needs only 36's request shape). Task 38 follows 37. Tasks 41 and 42 can run together after 40.
- Milestone 29: Tasks 46 to 48 are sequential in the contract but touch separate files, so 47 and 48 can start once 46's types are merged. Tasks 50 and 52 are independent after 49. Milestone 29 as a whole can run in parallel with Milestones 25 to 28; the only shared files are `components/app-shell.tsx`, `lib/export/collect.ts` and `lib/db/schema/app.ts`, so merge in any order and resolve those three.
