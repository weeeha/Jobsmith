# Jobsmith Prep: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pushed question bank becomes rows the user can hear, drill and mark as shaky, okay or solid, on a phone, offline, with any text-to-speech provider or none.

**Architecture:** The markdown artifact stays the source. A tolerant parser in `lib/prep` rebuilds `prep_question` rows inside the same transaction that stores a new `question_bank` or `call_card` version, and confidence marks key on a hash of the question text so a rebuild never loses them. Audio is derived: one content-addressed clip per spoken step, produced through a `TtsDriver` interface (four drivers), stored behind a `Storage` interface (four drivers), served with range support, and played by one client engine that drives Listen, Drill and Quick-fire and falls back to the browser's voices. The phone app is the same web app: a manifest, a hand-written service worker, per-job caches filled by "Save for offline", and an IndexedDB queue for marks made offline.

**Tech stack additions:** a pure JavaScript MP3 encoder from the lamejs family (LGPL-3.0; pick the fork that ships ESM and types at install time, wrap it only in `lib/audio/encode.ts`, record the package and version in the Task 18 report), `@aws-sdk/client-s3` (Apache-2.0), `@vercel/blob` (Apache-2.0). Pin every version at install time and record it in the task report; no version is given here on purpose. No ffmpeg, no native modules, no new test runner. The icon script in Task 47 uses Playwright, which is already a dev dependency.

**Spec:** `docs/superpowers/specs/2026-11-01-jobsmith-prep-design.md`, all sections (1 to 12). Core spec sections 2, 3, 4 and 8 carry over.

## Status on 2026-11-21

**Already built:**
- Core milestones 1 to 5 plus the demo sign-in: `lib/artifacts/upsert.ts` (`applyUpserts`, `upsertArtifacts`), `lib/artifacts/edit.ts` (`saveArtifactEdit`), `lib/artifacts/kinds.ts` (kinds `question_bank`, `call_card`, `pitch` already exist), `lib/db/scoped/*`, `lib/bridge/*`, `lib/attention/*`, `lib/export/collect.ts`, `lib/fit/card.ts` (`FIT_POLL_MS`, `FIT_POLL_MAX`), `lib/forms/submit.ts`, `components/job/tab-prep.tsx`, `cli/src/*`, `scripts/build-cli.mjs`, `tests/e2e/*`, the Playwright project chain in `playwright.config.ts`, `docker-compose.yml` (Postgres only).
- `app/(app)/library/page.tsx` is an empty-state placeholder; Milestone 9 replaces it.
- Test content that exists: `tests/fixtures/packet/nwl-answers-full.md`, `nwl-call-card.md`, `nwl-hr-bank.md`, `nwl-pitch.md`. Read for this plan: none of the three question-like files has a `### N.` heading (`nwl-answers-full.md` uses `### Longer version`), so each parses to zero rows. The parser tests assert exactly that, and Task 4 adds a new fixture that has real question headings.
- Nothing from this spec. No `prep_*` table, no `lib/prep`, `lib/tts`, `lib/storage`, `lib/audio`, `lib/library`, `lib/offline`, no manifest or service worker.

**Depends on:**
- No other plan's milestone. Prep depends only on Core. The five milestones depend on each other in order: 7 needs 6, 8 needs 7, 9 needs 6 to 8, 10 needs 6 to 8 (the Library is not cached offline).
- Merge order against the other cycle plans: every cycle changes `EVENT_KINDS` and the `event_kind_check` constraint, and every cycle generates a migration. Whichever branch merges second regenerates its migration with `pnpm db:generate` and re-adds its event kinds on top of the merged list. This plan adds `prep_drilled` in Task 1.
- Other plans consume this one: Hosted milestone 11 adds `Storage.list` and `deletePrefix` to `lib/storage/*` (Task 15 and 16 leave room, nothing else); Hosted milestone 13 uses `lib/prep/parse.ts` and the rebuild hook (Task 5); Bridge part two reads `prep_question` and `prep_mark` (Task 2 helpers `prepQuestion.listForJob` and `prepMark.listForJob`); Widen reads `STORAGE_LOCAL_DIR` and the `S3_*`, `BLOB_READ_WRITE_TOKEN`, `TTS_*` names (Task 15, 19).
- If a later milestone's dependency has not shipped: Milestone 8 cannot ship without Milestone 7 (it reuses the playback engine; the spec's note that Drill in text mode could follow Milestone 6 is not split out here). Milestone 9 without Milestone 7 drills with browser voices only (leave out the on-demand audio step of Task 44). Milestone 10 without Milestone 8 caches Listen and Quick-fire only (leave out the Drill row of Task 50).

**Needs an account, a paid service, hosting or the owner's answer:**
- Milestone 6: nothing external. Owner answer, assumed until said otherwise (spec section 11): three mark levels with no decay (Task 7), Quick-fire pool is questions that have a Spine (Task 8, the spec says only "spine only"), the Home line "12 of 30 solid" counts every row of the job's banks and call cards (Task 12).
- Milestone 7, Task 16: a private Vercel Blob store on the owner's Vercel project and its `BLOB_READ_WRITE_TOKEN` (the live test is skipped without it; the driver and its unit tests run on a fake client). A MinIO container for the `s3` live test (free, local, started from the compose file; skipped without `JOBSMITH_LIVE_STORAGE=1`).
- Milestone 7, Task 27 and Task 31: the owner's local Qwen3-TTS server on `http://127.0.0.1:8890/v1` for the live CLI check. The CLI and the plan endpoint run in CI against a fake OpenAI-compatible server on 127.0.0.1, so only the last step of each task is blocked.
- Milestone 7, Task 20: live checks of the `gemini` and `elevenlabs` drivers need the owner's keys. No test requires them; both drivers are covered with an injected `fetch`. Skip the live check unless the owner asks for it.
- Milestone 7, Task 31: the preview check on the owner's Vercel project with `STORAGE_PROVIDER=vercel_blob` (decided 2026-09-18 in the spec).
- Milestone 7, owner answers: (1) section 5.3 says a step speaks through the browser voice when "TTS is off", while section 5.5 and the Done-when send clips from the owner's laptop to a deployment. Task 23 (segments) and Task 19 (`ttsIdentity`) play any `done` clip whose hash matches, using the server's `TTS_PROVIDER` and `TTS_MODEL` when set and the constant `CLI_TTS_IDENTITY` (`openai_compatible`, `local`) when not. The owner confirms or says clips must be ignored when `TTS_PROVIDER` is unset. One constant, one function (`ttsIdentity` in `lib/tts/config.ts`) change it. (2) Which lamejs-family package (Task 18). (3) `elevenlabs` needs `TTS_MODEL` set because the spec gives it no default (Task 19). (4) The default voices `Vivian` and `Ryan` are the spec's assumption 2; they live in one constant (`DEFAULT_LOCAL_VOICES`, Task 21).
- Milestone 8, Task 36 (optional, the first cut): microphone on a real device for the live check; the permission-refused path runs with a stubbed `getUserMedia`. Owner answer: the spec gives `asset` no question column, so a kept recording is linked to its question through `prep_session.meta.recordings` (Task 36). The owner confirms or adds a column in a later migration.
- Milestone 9: nothing external. Owner answers: saving the same question twice from one job returns the existing item instead of a duplicate (Task 39); Library Quick-fire gives an item that has no matching question row its first body line as the Spine (Task 43).
- Milestone 10, Task 54: a real phone with the app installed, in airplane mode, for the done-when check; everything else runs in Playwright with `context.setOffline`. Owner answer: the install hint and offline notice wording is not fixed by the spec; Tasks 52 and 53 write proposed copy in one file (`lib/offline/copy.ts`) to replace from the Figma drafts.
- Milestones 6 to 10: the spec asks for Figma drafts on the "Prep" page of the "JS - Design" file before each milestone plan. None were made for this plan. Copy the spec does not fix is marked "proposed" in the Contract and lives in `lib/prep/copy.ts` or `lib/offline/copy.ts`, so the drafts can replace it in one place.

**Left out on purpose, with the reason:**
- Listen sessions are not recorded as `prep_session` rows: the spec asks for a session and an event only for Drill and Quick-fire (section 4). The `listen` mode value stays valid.
- Drill and Quick-fire run offline from the saved pages, and their marks queue, but the `prep_session` row and the `prep_drilled` event are written only when online. The spec's offline queue covers marks only (section 5.9).
- Offline, only the saved jobs' Listen, Drill and Quick-fire pages and the `/offline` page open. The board, Home and every other page are never cached (section 5.9).
- Everything in the spec's non-goals and in section 12 (live AI interviewer, in-app answer generation, notifications, voice cloning, PDF export, sharing library items).

**Spec ambiguities settled in this plan** (each is one constant or one function to change, and each is listed so the owner can overrule it):
1. Section 5.3 says a step uses the browser voice when "TTS is off", while section 5.5 and the Milestone 7 Done-when send clips from the owner's laptop to a deployment: clips play whenever a `done` segment matches (Task 19, 23).
2. Section 5.5 hashes provider and model, which a server with TTS off does not have: `CLI_TTS_IDENTITY` stands in (Task 19).
3. Section 5.1 rule 6 names include files "without the owner's company prefix": `includeMatches` accepts an exact key, a file name ending in `-<key>` or a key ending in `-<file name>` (Task 5).
4. Section 5.1 rule 2 ignores a `####` heading: its text, up to the next label or heading, stays off the tape too (Task 4).
5. Section 5.1 names only `### N.` and `##` headings: any other `###` heading ends the current question and is section text (Task 4).
6. Section 4 says `guard` is "lifted out of `blocks` for display", and section 5.3 shows Guard dimmed in the transcript: `blocks` keeps every block and `spine`, `last_line`, `guard` are copies for queries and display (Task 4).
7. Section 5.4 lists kept recordings under the question, and `asset` has no question column: the link lives in `prep_session.meta.recordings` (Task 36).
8. Section 5.9 caches "the player routes' static assets on install": hashed `/_next/static` URLs are unknown at install, so the worker precaches `/offline` and stores static files on first fetch and during Save for offline (Task 48, 50).
9. The Milestone 6 Done-when names a pushed `answers-full` file: the repo fixture `tests/fixtures/packet/nwl-answers-full.md` has no `### N.` heading and parses to zero rows, so Task 4 adds a Northwind fixture that does (Task 4, 14).
10. Section 5.6 shows the Spine only, and library items have none: an item without a matching question row uses its first body line (Task 43).
11. Section 4 says `prep_session.questions` is a count: it is the planned count at start and the number seen at the end (Task 8).
12. Section 5.5 gives the `elevenlabs` driver no model default: `TTS_MODEL` is required for it (Task 19).
13. The spec names the interface `Storage`, which shadows the DOM global of that name where imported; the plan keeps the spec's name and imports it explicitly (Task 15).

## Global Constraints

- Never commit to or push `main`. One branch per milestone, cut from `main` once the previous milestone has merged: `feat/m06-questions`, `feat/m07-voice`, `feat/m08-drill`, `feat/m09-library`, `feat/m10-phone`.
- Read the relevant guide in `node_modules/next/dist/docs/` before writing any Next.js API (route handlers, `manifest.ts`, headers, service worker guidance). AGENTS.md says this Next.js has breaking changes.
- `requireUser()` in every page, server action and route handler. Named exceptions: the bridge routes (bearer token only, the proxy does not run on them), `app/manifest.ts`, `public/sw.js` and the public `/offline` page (Task 52), which carry no user data.
- `app/` and `components/` never import `@/lib/db/client`. Pages and actions get a database handle from `scopedFor(user.id)`.
- Every `lib/*` function takes a database handle and a user id: in practice a `Scoped` from `scoped(db, userId)`, as Core does.
- Single writers: `lib/pipeline` for stage and status writes; `lib/artifacts` for artifact writes; `lib/prep/marks.ts` is the only writer of `prep_mark`; `lib/audio/segments.ts` is the only writer of `tts_segment` and of the assets of `tts_segment` rows; `lib/prep/rebuild.ts` is the only writer of `prep_question`; `lib/audio/recordings.ts` writes assets of kind `recording` (Task 36).
- Typed `Result` (`lib/result.ts`) for expected failures. Expected failures are never thrown. A storage `put` that fails throws `StorageError` and the segment code turns it into a failed segment.
- Tests first under `lib/`. No test touches the network: TTS goes through the fake driver or an injected `fetch`, storage through `memory` and `local` in a temp directory, the S3 and Blob clients through injected fakes. Live runs are gated on `JOBSMITH_LIVE_STORAGE=1`.
- Fixtures are fictional (Northwind Traders, Priya Raman) and carry no pay figures. No key-like literals: build keys at runtime as `"k".repeat(24)`; hashes are computed in tests, never pasted.
- No exclamation marks in UI copy. Semantic token utilities only and `pnpm check:tokens`. Registry component first, then `base-nova`, then new code, each new component recorded in `docs/design-system.md` under "New application code" with its reason.
- Axe zero violations in light and dark on every new route. Keyboard-only Drill and Quick-fire (keys 1 to 3 mark, space plays, arrows move). Live-region announcements for marks and for "Audio ready".
- Every new owned table gets a file under `lib/db/scoped/` and a row in `tests/integration/scoped-isolation.test.ts`.
- Spoken text leaves the server only when `TTS_PROVIDER` is set, to that provider, with no other data. Logs: one `[tts]` line per segment (ids, code, provider, model, voice id, milliseconds, bytes, never the text) and one `[prep]` line per rebuild (counts). Playback and marks log nothing.
- Forms through `lib/forms/submit.ts` with explicit Zod messages; times through `LocalTime`; `break-words` on long strings; one `React.useId()` per field; e2e specs share one account and name fixtures with `uniqueName`.
- Commit messages end with the trailer the session provides. Comments state reasons and never cite task numbers.

## Review Focus

1. **A new label in the owner's file turning into speech, or an answer vanishing.** The parser must read an unknown bold label as a note and warn, keep `####` content off the tape, keep the question when a warning marker sits before the closing quote, and parse the repo's packet fixtures to zero rows with no error. Pinned by Task 4 (tables over the Northwind fixture and the three packet files) and Task 14 (hub notice for `answers-full`, none for the call card).
2. **A second push or a hand edit losing marks or leaving stale rows.** Rows rebuild on every version and every in-place edit; marks key on `question_key`, never on a row id. Pinned by Task 5 (rebuild keeps marks, drops stale rows, covers the `edited` and `updated` paths) and Task 14 (mark survives a second push of a changed file).
3. **Another user's audio, marks or questions readable, and range requests that Safari rejects.** The asset route loads through the scoped helper, returns 404 for foreign ids, and answers `Range` with 206, 416 and `Accept-Ranges`. Pinned by Task 2 (isolation rows for all six tables), Task 24 (route tests with two users) and Task 31 (WebKit playback).
4. **Server plan and CLI upload disagreeing on a clip's identity.** The hash covers provider, model, voice, style and spoken text; the CLI path stores only hashes that are in the current plan. A voice changed in Settings starts a new plan and never deletes old clips. Pinned by Task 23 (hash and planner), Task 26 (only planned hashes accepted) and Task 27 (CLI against a fake server).
5. **Offline marks and caches crossing accounts or overwriting newer marks.** A queued mark carries its own `marked_at`, the newer one wins, a queue is keyed by user hash and drained only for that user, and sign-out deletes every cache of that user hash. Pinned by Task 7 (conflict rule), Task 51 (queue reducer and replay) and Task 53 (sign-out clearing).

## Module map

**Milestone 6: Questions**

| File | New/changed | One responsibility |
|---|---|---|
| `lib/db/schema/prep.ts`, `library.ts`, `audio.ts` | new | the six tables |
| `lib/db/schema/index.ts`, `app.ts`, `pipeline.ts`, `lib/pipeline/values.ts`, `lib/pipeline/event-text.ts` | changed | exports, `profile.prep`, `prep_drilled` event kind |
| `lib/prep/values.ts` | new | leaf constants and unions used by the schema and the code |
| `lib/db/migrations/0004_*.sql` (name from drizzle-kit) | new | the migration (the next free number when it is generated) |
| `lib/db/scoped/prep-question.ts`, `prep-mark.ts`, `prep-session.ts`, `library-item.ts`, `asset.ts`, `tts-segment.ts`, `index.ts` | new, changed | scoped helpers |
| `lib/prep/question-key.ts` | new | normalize question text, `questionKey` |
| `lib/prep/labels.ts` | new | `classifyLabel` for spoken and note labels |
| `lib/prep/parse.ts` | new | `parseQuestionBank`, the grammar |
| `lib/prep/includes.ts` | new | include matching and resolver |
| `lib/prep/rebuild.ts` | new | `rebuildForArtifact`, `rebuildForJob`, the only `prep_question` writer |
| `lib/artifacts/upsert.ts`, `lib/artifacts/edit.ts` | changed | call the rebuild inside the write transaction |
| `lib/prep/backfill.ts`, `scripts/prep-backfill.ts` | new | `pnpm prep:backfill` |
| `lib/prep/marks.ts`, `lib/prep/summary.ts` | new | mark writer; counts and band words |
| `lib/prep/sessions.ts`, `lib/prep/quick-fire.ts` | new | session start and end, `prep_drilled` event; seeded pick |
| `lib/prep/hub.ts`, `lib/prep/copy.ts` | new | hub view model; binding copy |
| `app/(app)/jobs/[slug]/prep-actions.ts` | new | mark, rebuild, session actions |
| `components/prep/*` | new | hub, bank card, question list, mark chips |
| `components/job/tab-prep.tsx` | changed | hub above the document list |
| `app/(app)/jobs/[slug]/quick-fire/page.tsx`, `components/player/quick-fire-card.tsx` | new | Quick-fire in text mode |
| `lib/attention/items.ts`, `load.ts`, `copy.ts`, `components/home/attention-item.tsx` | changed | confidence line on the interview item |
| `lib/db/scoped/*`, `lib/export/collect.ts` | changed | export additions |
| `tests/fixtures/prep/*`, `tests/e2e/prep-questions.spec.ts`, `tests/e2e/token.ts`, `playwright.config.ts` | new, changed | fixtures, e2e, `prep-*` project chain |

**Milestone 7: Voice**

| File | New/changed | One responsibility |
|---|---|---|
| `lib/storage/driver.ts`, `keys.ts`, `config.ts`, `memory.ts`, `local.ts`, `index.ts` | new | `Storage` interface, keys, config, two drivers, factory |
| `lib/storage/s3.ts`, `vercel-blob.ts` | new | the two hosted drivers |
| `lib/env.ts` | changed | `TTS` and `STORAGE` config on `Env` |
| `lib/tts/driver.ts`, `config.ts`, `fake.ts`, `gate.ts`, `spoken.ts`, `index.ts` | new | interface, config, fake, duration gate, spoken text |
| `lib/tts/openai-compatible.ts`, `gemini.ts`, `elevenlabs.ts` | new | the real drivers |
| `lib/audio/wav.ts`, `encode.ts`, `duration.ts`, `normalize.ts` | new | WAV, MP3, duration, clip preparation |
| `lib/prep/settings.ts` | new | `profile.prep` document |
| `lib/audio/segments.ts`, `lib/audio/deps.ts` | new | hash, planner, generation, delete; the only segment writer; production deps |
| `lib/prep/plan.ts`, `lib/prep/player-data.ts` | new | `PlaybackPlan`, pitch chapters, data for the client |
| `lib/prep/audio-status.ts`, `lib/prep/voices.ts` | new | audio status text; provider voice list with a timeout |
| `lib/audio/range.ts`, `lib/audio/serve.ts`, `app/api/assets/[id]/route.ts` | new | range parsing, serving, route |
| `app/(app)/jobs/[slug]/audio-actions.ts`, `components/prep/audio-panel.tsx` | new | batches and the hub panel |
| `lib/bridge/audio-handlers.ts`, `lib/bridge/handlers.ts`, `errors.ts`, `wire.ts`, two route files | new, changed | plan and upload endpoints |
| `cli/src/commands/audio.ts`, `args.ts`, `main.ts` | new, changed | `jobsmith audio` |
| `lib/prep/engine-state.ts`, `components/player/engine.ts` | new | pure reducer; client engine |
| `app/(app)/jobs/[slug]/listen/page.tsx`, `components/player/*` | new | Listen, transcript, controls, Media Session |
| `components/settings/voice-section.tsx`, `app/(app)/settings/*` | new, changed | Voice and Storage |
| `.env.example`, `docker-compose.yml`, `playwright.config.ts`, `README.md`, `docs/design-system.md`, `tests/e2e/prep-voice.spec.ts` | changed, new | env, MinIO, e2e, docs |

**Milestone 8: Drill**

| File | New/changed | One responsibility |
|---|---|---|
| `lib/prep/gaps.ts`, `lib/prep/order.ts` | new | gap formula; drill ordering |
| `lib/prep/drill.ts` | new | session start with fixed order, summary, shaky set |
| `lib/prep/drill-state.ts` | new | pure drill state machine |
| `app/(app)/jobs/[slug]/drill/page.tsx`, `components/player/drill-*.tsx` | new | Drill screen and summary |
| `lib/audio/recordings.ts`, `app/api/assets/route.ts`, `components/player/record-answer.tsx` | new | optional recording |
| `tests/e2e/prep-drill.spec.ts` | new | e2e |

**Milestone 9: Library**

| File | New/changed | One responsibility |
|---|---|---|
| `lib/library/items.ts`, `promote.ts`, `usage.ts`, `practice.ts`, `drill.ts`, `copy.ts` | new | items, Save to library, "Used in N jobs" and history, library practice pools, library drill data, proposed copy |
| `app/(app)/library/page.tsx`, `[id]/page.tsx`, `actions.ts`, `components/library/*` | changed, new | list, item page, edit, archive |
| `app/(app)/library/quick-fire/page.tsx`, `drill/page.tsx` | new | library practice |
| `lib/bridge/context.ts`, `handlers.ts` | changed | `## Prep` and `## Library` |
| `tests/e2e/prep-library.spec.ts` | new | e2e |

**Milestone 10: Phone**

| File | New/changed | One responsibility |
|---|---|---|
| `app/manifest.ts`, `app/layout.tsx`, `lib/pwa/theme.ts`, `scripts/make-icons.ts`, `public/icons/*` | new, changed | installable app |
| `public/sw.js`, `next.config.ts` | new, changed | service worker and its headers |
| `app/api/prep/[slug]/route.ts`, `lib/prep/manifest.ts` | new | the prep manifest |
| `lib/offline/*`, `components/offline/*` | new | registration, save, queue, sync status |
| `components/prep/offline-panel.tsx` | new | Save for offline UI and install hint |
| `app/offline/page.tsx`, `proxy.ts`, `components/app-shell.tsx` | new, changed | offline page, sign-out clearing |
| `tests/e2e/prep-phone.spec.ts` | new | e2e |

## Contract

Binding character for character across tasks. Names marked "plan" are chosen here because the spec leaves them open.

**Tables (Drizzle export, SQL name).** `prepQuestion` `prep_question`, `prepMark` `prep_mark`, `libraryItem` `library_item`, `asset` `asset`, `ttsSegment` `tts_segment`, `prepSession` `prep_session`; column `profile.prep` (jsonb, not null, default `{}`). Columns exactly as spec section 4. Composite foreign keys reference `(user_id, id)` unique pairs: `prep_question (user_id, artifact_id)` to `artifact` (exists, `artifact_user_id_id_unique`), `prep_question (user_id, opportunity_id)` to `opportunity` (exists), `tts_segment (user_id, asset_id)` to `asset` (plan: `asset_user_id_id_unique`, cascade). Set-null links (`stage_id`, `library_item.source_opportunity_id`, `library_item.source_artifact_id`, `asset.opportunity_id`) are plain single-column foreign keys like `artifact.stage_id`. Check constraints: `prep_mark.scope in ('job','library')`, `prep_mark.level in ('shaky','okay','solid')`, `library_item.kind in ('answer','story','intro','fact')`, `asset.kind in ('tts_segment','recording','other')`, `tts_segment.status in ('pending','done','failed')`, `prep_session.mode in ('listen','drill','quick_fire')`. Unique: `prep_question (artifact_id, position)`; `tts_segment (user_id, hash)`; `asset (storage_key)`; `prep_mark` expression index `prep_mark_scope_key_unique` on `(user_id, scope, coalesce(opportunity_id::text, ''), question_key)`. `EVENT_KINDS` gains `prep_drilled`.

**Constants.** `PARSED_KINDS = ["question_bank", "call_card"]`; `WARNING_MARKER = "⚠️"`; `MARK_LEVELS = ["shaky", "okay", "solid"]`; `PREP_MODES = ["listen", "drill", "quick_fire"]`; `QUICK_FIRE_COUNT = 10`; `QUICK_FIRE_SECONDS = 5`; `DRILL_DEFAULT_COUNT = 10`; `GAP_STEP_MS = 600`; `GAP_QUESTION_MS = 1400`; `IDEAL_CPS = 13`; `GATE_CPS_MIN = 5`; `GATE_CPS_MAX = 18`; `GATE_SHORT_MIN_MS = 500`; `GATE_SHORT_MAX_MS = 30_000`; `GATE_LONG_TEXT_CHARS = 120`; `TTS_STYLE_ID = "v1"`; `STRICT_INSTRUCTION = "Read every sentence to the end"`; `SEGMENT_BATCH_LIMIT = 20`; `BATCH_BUDGET_MS = 45_000` (plan: keeps one call well inside the 60 second `maxDuration`); `AUDIO_PUT_MAX_BYTES = 4_194_304`; `AUDIO_PUT_MAX_SEGMENTS = 50`; `DEFAULT_LOCAL_VOICES = { interviewer: "Vivian", candidate: "Ryan" }`; `CLI_TTS_IDENTITY = { provider: "openai_compatible", model: "local" }` (plan, see owner answer 1); `DEFAULT_CLI_TTS_URL = "http://127.0.0.1:8890/v1"`; speed 0.8 to 1.5 step 0.1 default 1; `gapFactor` 0.5 to 2 default 1; drill gap `clamp(round(sayChars / 13 * 1.2), 15, 120) * gapFactor` seconds; "More time" adds 30 seconds; asset cache header `private, max-age=31536000, immutable`.

Further constants: `RECORDING_MAX_BYTES = 8_388_608` (Task 36), `MAX_FAILURES = 10` (Task 51), `MORE_TIME_SECONDS = 30` (Task 32), `LIBRARY_TITLE_MAX = 200` and `LIBRARY_BODY_MAX = 50_000` (Task 38, plan constants), `THEME_COLOR_LIGHT = "#fafafa"` and `THEME_COLOR_DARK = "#0a0a0a"` (Task 47).

**Environment variables.** `TTS_PROVIDER` (`openai_compatible`, `gemini`, `elevenlabs`, `fake`; unset means off), `TTS_BASE_URL`, `TTS_API_KEY`, `TTS_MODEL`, `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`; `STORAGE_PROVIDER` (`local`, `s3`, `vercel_blob`, `memory`; default `local`; `local` refused when `VERCEL` is set), `STORAGE_LOCAL_DIR` (default `.data/storage`), `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`, `BLOB_READ_WRITE_TOKEN`. Names of the storage variables come from the Widen spec's variable table. Test gate: `JOBSMITH_LIVE_STORAGE=1`.

**Error codes.** TTS: `"tts_timeout" | "tts_bad_output" | "tts_rate_limited" | "tts_error"`. Mark and session: `"not_found" | "invalid"`. Library: `"not_found" | "invalid"`. Bridge (added to `BridgeErrorCode`): `too_many_segments` (413, "An audio upload holds at most 50 clips."). A clip that is not in the current plan is rejected per clip in the upload response (`reason: "not_planned"`), not as a request error.

**Wire shapes.** `GET /api/bridge/opportunities/:slug/audio/plan?voice_interviewer=&voice_candidate=` returns `{ identity: { provider, model, style }, voices: { interviewer, candidate }, total, done, segments: [{ hash, speaker, text }], requestId }`. `PUT /api/bridge/opportunities/:slug/audio` takes `{ segments: [{ hash, contentType, durationMs, base64 }] }` and returns `{ stored: number, skipped: number, rejected: [{ hash, reason }], requestId }`. Caps: 4 MB per request, 50 segments per request.

**Types and signatures (TypeScript).**

```ts
// lib/prep/question-key.ts
export function normalizeQuestion(text: string): string;
export function questionKey(text: string): string;            // first 16 hex of sha256(normalizeQuestion(text))

// lib/prep/parse.ts
export type ParsedBlock = { label: string; spoken: boolean; text: string };   // label "" for the opening note block
export type ParseWarning = { code: "unknown_label" | "marker_inside_quote" | "unresolved_include"; line: number; question: number | null; message: string };
export type ParsedQuestion = { section: string | null; number: number; position: number; question: string; questionKey: string; blocks: ParsedBlock[]; spine: string | null; lastLine: string | null; guard: string | null; unfilled: boolean; hasAnswer: boolean; unresolvedIncludes: number };
export type IncludeResolver = (file: string, number: number) => ParsedBlock[] | null;
export type ParseResult = { questions: ParsedQuestion[]; warnings: ParseWarning[] };
export function parseQuestionBank(bodyMd: string, options?: { resolveInclude?: IncludeResolver }): ParseResult;

// lib/prep/rebuild.ts
export async function rebuildForArtifact(tx: Scoped, artifact: ArtifactRow): Promise<{ rows: number; warnings: number }>;
export async function rebuildForJob(s: Scoped, opportunityId: string): Promise<Result<{ documents: number; rows: number }, "not_found">>;

// lib/prep/marks.ts
export type MarkLevel = "shaky" | "okay" | "solid";
export type MarkInput = { scope: "job" | "library"; opportunityId: string | null; questionKey: string; level: MarkLevel; markedAt: Date; drilled: boolean };
export type MarkView = { level: MarkLevel; markedAt: Date; drillCount: number; lastDrilledAt: Date | null; applied: boolean };
export async function markQuestion(s: Scoped, input: MarkInput): Promise<Result<MarkView, "not_found" | "invalid">>;

// lib/prep/summary.ts
export type ConfidenceSummary = { solid: number; okay: number; shaky: number; unmarked: number; total: number };
export function summarize(questionKeys: string[], levels: Map<string, MarkLevel>): ConfidenceSummary;
export function summaryLine(c: ConfidenceSummary): string;     // "12 solid · 6 okay · 4 shaky · 8 unmarked"
export function homeLine(c: ConfidenceSummary): string;        // "12 of 30 solid"

// lib/prep/sessions.ts
export async function startSession(s: Scoped, input: { opportunityId: string | null; mode: PrepMode; questions: number; meta?: Record<string, unknown>; now?: Date }): Promise<Result<{ id: string }, "not_found">>;
export async function endSession(s: Scoped, input: { id: string; seen: number; marked: number; solid: number; now?: Date }): Promise<Result<{ eventWritten: boolean }, "not_found">>;   // event body "Drilled 10 questions, 4 marked solid"

// lib/prep/quick-fire.ts
export function seedFromId(id: string): number;
export function pickQuickFire<T>(items: readonly T[], seed: number, count?: number): T[];

// lib/storage/driver.ts
export interface Storage { put(key: string, bytes: Uint8Array, contentType: string): Promise<void>; get(key: string): Promise<Uint8Array | null>; delete(key: string): Promise<void> }
export class StorageError extends Error {}
// lib/storage/keys.ts
export function userHash(userId: string): string;              // first 16 hex of sha256(user id)
export function userPrefix(userId: string): string;            // `u/${userHash}/`
export function newSegmentKey(userId: string, ext: "mp3" | "wav" | "ogg"): string;       // `u/<hash>/tts/<random 32 hex>.<ext>`
export function newRecordingKey(userId: string, ext: "webm" | "mp4" | "ogg"): string;     // `u/<hash>/rec/<random 32 hex>.<ext>`
export const STORAGE_KEY_PATTERN: RegExp;

// lib/tts/driver.ts
export type TtsStyle = "default" | "strict";
export type TtsErrorCode = "tts_timeout" | "tts_bad_output" | "tts_rate_limited" | "tts_error";
export type TtsRequest = { text: string; voice: string; style: TtsStyle; format: "mp3" | "wav" };
export type TtsAudio = { audio: Uint8Array; contentType: string; sampleRate?: number };
export type Voice = { id: string; label: string; language: string | null };
export interface TtsDriver { name: string; synthesize(request: TtsRequest): Promise<Result<TtsAudio, TtsErrorCode>>; voices(): Promise<Voice[]> }

// lib/tts/config.ts
export type TtsConfig = { provider: "openai_compatible" | "gemini" | "elevenlabs" | "fake"; model: string; baseUrl: string | null; apiKey: string | null };
export type TtsIdentity = { provider: string; model: string };
export function parseTtsConfig(source: Record<string, string | undefined>): { ok: true; config: TtsConfig | null } | { ok: false; invalid: string[] };
export function ttsIdentity(config: TtsConfig | null): TtsIdentity;

// lib/audio/segments.ts
export type Speaker = "interviewer" | "candidate";
export type SegmentNeed = { hash: string; speaker: Speaker; text: string };
export type SegmentPlan = { total: number; done: number; failed: number; suspect: number; missing: SegmentNeed[] };
export function segmentHash(input: { provider: string; model: string; voice: string; style: string; spokenText: string }): string;   // first 16 hex of sha256 over `provider | model | voice | style | spokenText`
export async function planSegments(s: Scoped, input: { sources: PlanSource[]; identity: TtsIdentity; voices: { interviewer: string; candidate: string }; includeFailed?: boolean }): Promise<SegmentPlan>;
export type AudioDeps = { tts: TtsDriver | null; storage: Storage; now(): Date; randomHex(bytes: number): string };

// lib/prep/plan.ts
export type PlaybackStep = { id: string; questionIndex: number; blockIndex: number | null; kind: "question" | "label" | "text"; speaker: Speaker; text: string; hash: string; clip: { assetId: string; suspect: boolean } | null; gapAfterMs: number };
export type PlayerBlock = { index: number; label: string; spoken: boolean; text: string };
export type PlayerQuestion = { number: number; section: string | null; questionKey: string; question: string; blocks: PlayerBlock[]; level: MarkLevel | null };
export type PlaybackPlan = { title: string; subtitle: string; questions: PlayerQuestion[]; steps: PlaybackStep[] };

// lib/prep/settings.ts
export type PrepSettings = { version: 1; voices: { interviewer: string | null; candidate: string | null }; speed: number; gapFactor: number; browserVoices: { interviewer: string | null; candidate: string | null } };
export function parsePrepSettings(raw: unknown): PrepSettings;            // tolerant, never throws

// lib/prep/gaps.ts
export function drillGapSeconds(sayChars: number, gapFactor: number): number;
```

**Exact UI copy the spec fixes.** Summary "12 solid · 6 okay · 4 shaky · 8 unmarked". Audio statuses "Audio ready", "Audio: 61 of 96 clips", "Browser voice", "Preparing audio". Empty "No prep yet. Push a question bank or paste one." Notice "This document has no questions Jobsmith can read. A question is a line like `### 1. "Tell me about yourself"`." Rate limit "Paused, trying again in a minute". Transcript labels "browser voice" and "check this clip" with action "Regenerate". Header "Question 7 of 32". Offline "3 marks waiting to sync" with "Retry" and "Discard" after 10 failures; offline page "Open a saved job"; Save for offline "38 MB, 96 clips", "Saved" with the date. Mark buttons Shaky, Okay, Solid. Buttons Listen, Drill, Quick-fire, Prepare audio, Save for offline, Rebuild questions, "Drill the shaky ones again", "Record my answer", "Done", "More time", "Skip", "Check the bank", "Delete audio", "Delete all audio", "Save to library". Home "12 of 30 solid", "No prep yet", "No research yet" keeps priority. Event body "Drilled 10 questions, 4 marked solid". Voices "Interviewer" and "Me". Off state "Off: the player uses your browser's voices". Context sections `## Prep` and `## Library`, frontmatter stays `context/v1`.

**Proposed copy (plan, not fixed by the spec; in `lib/prep/copy.ts` and `lib/offline/copy.ts`).** Quick-fire empty "Nothing to practice yet. Quick-fire needs questions that have a Spine."; install hint "Install Jobsmith from the share sheet or the browser menu. Safari clears saved jobs after seven days of not opening the site unless the app is on the home screen. Audio on a locked screen depends on your phone."; no-microphone line "Recording is not available: the microphone was refused."

## Task list

| Task | Milestone | Title | Files touched (short) | Depends on tasks |
|---|---|---|---|---|
| 1 | 6 | Schema and migration | `lib/db/schema/*`, migration, `values.ts`, `event-text.ts` | none |
| 2 | 6 | Scoped helpers and isolation rows | `lib/db/scoped/*`, `tests/helpers/db.ts`, isolation test | 1 |
| 3 | 6 | `question_key` and label classifier | `lib/prep/question-key.ts`, `labels.ts` | 1 |
| 4 | 6 | Parser and the Northwind fixtures | `lib/prep/parse.ts`, `tests/fixtures/prep/*` | 3 |
| 5 | 6 | Rebuild on every new version | `lib/prep/rebuild.ts`, `includes.ts`, `artifacts/upsert.ts`, `edit.ts` | 2, 4 |
| 6 | 6 | Backfill script and Rebuild questions | `lib/prep/backfill.ts`, `scripts/prep-backfill.ts`, `package.json` | 5 |
| 7 | 6 | Marks writer and confidence summary | `lib/prep/marks.ts`, `summary.ts` | 2, 3 |
| 8 | 6 | Sessions and Quick-fire picker | `lib/prep/sessions.ts`, `quick-fire.ts` | 2 |
| 9 | 6 | Prep hub loader, copy and actions | `lib/prep/hub.ts`, `copy.ts`, `prep-actions.ts` | 5, 6, 7, 8 |
| 10 | 6 | Hub screen: bank cards, question list, mark chips | `components/prep/*`, `tab-prep.tsx` | 9 |
| 11 | 6 | Quick-fire screen in text mode | `quick-fire/page.tsx`, `quick-fire-card.tsx` | 8, 9, 10 |
| 12 | 6 | Home confidence line | `lib/attention/*`, `attention-item.tsx` | 7 |
| 13 | 6 | Export additions | `lib/export/collect.ts`, `export.test.ts` | 2 |
| 14 | 6 | End to end, docs and ship | e2e, `playwright.config.ts`, README, design-system | 10, 11, 12, 13 |
| 15 | 7 | Storage interface, keys, config, memory and local drivers | `lib/storage/*`, `lib/env.ts` | 14 |
| 16 | 7 | S3 and Vercel Blob drivers | `lib/storage/s3.ts`, `vercel-blob.ts`, compose | 15 |
| 17 | 7 | TTS contract, duration gate and spoken text | `lib/tts/driver.ts`, `gate.ts`, `spoken.ts` | 14 |
| 18 | 7 | Audio: WAV, MP3 encoder, duration, clip preparation | `lib/audio/wav.ts`, `encode.ts`, `duration.ts`, `normalize.ts` | 17 |
| 19 | 7 | TTS config, fake driver and env | `lib/tts/config.ts`, `fake.ts`, `index.ts`, `lib/env.ts` | 15, 17, 18 |
| 20 | 7 | TTS drivers: openai_compatible, gemini, elevenlabs | `lib/tts/*.ts` | 17, 18, 19 |
| 21 | 7 | Prep settings document | `lib/prep/settings.ts` | 14 |
| 22 | 7 | Playback plan and pitch chapters | `lib/prep/plan.ts` | 17 |
| 23 | 7 | Segments: hash, planner, generation, delete | `lib/audio/segments.ts`, `deps.ts` | 15, 17, 18, 19, 21, 22 |
| 24 | 7 | Asset route with ranges | `lib/audio/range.ts`, `serve.ts`, route | 23 |
| 25 | 7 | In-app audio batches and the hub audio panel | `audio-actions.ts`, `audio-panel.tsx`, `hub.ts` | 10, 23 |
| 26 | 7 | Bridge audio endpoints | `lib/bridge/audio-handlers.ts`, routes | 23 |
| 27 | 7 | CLI `jobsmith audio` | `cli/src/commands/audio.ts`, bundle test | 18, 26 |
| 28 | 7 | Playback engine and Media Session | `lib/prep/engine-state.ts`, `components/player/*` | 22 |
| 29 | 7 | Listen screen | `listen/page.tsx`, `player-data.ts`, `components/player/*` | 23, 24, 25, 28 |
| 30 | 7 | Settings Voice section and storage line | `voice-section.tsx`, settings page | 21, 23 |
| 31 | 7 | End to end, docs and ship | e2e, env, README, design-system | 25, 26, 27, 29, 30 |
| 32 | 8 | Drill gap and ordering | `lib/prep/gaps.ts`, `order.ts` | 31 |
| 33 | 8 | Drill data and summary | `lib/prep/drill.ts`, `player-data.ts` | 32 |
| 34 | 8 | Drill state machine | `lib/prep/drill-state.ts` | 32 |
| 35 | 8 | Drill screen and summary | `drill/page.tsx`, `components/player/drill-*.tsx` | 28, 33, 34 |
| 36 | 8 | Record my answer (optional) | `lib/audio/recordings.ts`, `app/api/assets/route.ts` | 35 |
| 37 | 8 | End to end, docs and ship | e2e, README | 35, 36 |
| 38 | 9 | Library items | `lib/library/items.ts`, `copy.ts` | 37 |
| 39 | 9 | Save to library | `lib/library/promote.ts` | 38 |
| 40 | 9 | Usage and mark history | `lib/library/usage.ts`, scoped `prep-question.ts` | 38 |
| 41 | 9 | Library list, item page, edit, archive | `library/*`, `components/library/*`, `nav.spec.ts` | 38, 40 |
| 42 | 9 | Save to library buttons and creation by hand | hub, Listen, Drill summary, dialog | 39, 41 |
| 43 | 9 | Library Quick-fire | `library/quick-fire/page.tsx`, `practice.ts` | 41 |
| 44 | 9 | Library drill with on-demand audio | `library/drill/page.tsx`, `drill.ts` | 35, 41 |
| 45 | 9 | Context document Prep and Library sections | `lib/bridge/context.ts`, `context-prep.ts`, `handlers.ts` | 38 |
| 46 | 9 | End to end, docs and ship | e2e, README | 42, 43, 44, 45 |
| 47 | 10 | Manifest, theme colour, icons | `app/manifest.ts`, `scripts/make-icons.ts`, `proxy.ts` | 46 |
| 48 | 10 | Service worker core | `public/sw.js`, `next.config.ts` | 47 |
| 49 | 10 | Prep manifest route | `lib/prep/manifest.ts`, route | 46 |
| 50 | 10 | Offline client: register and save | `lib/offline/register.ts`, `save.ts` | 48, 49 |
| 51 | 10 | Offline mark queue and sync | `lib/offline/queue.ts`, `sync-status.tsx`, `mark-buttons.tsx` | 48 |
| 52 | 10 | Hub offline panel and install hint | `offline-panel.tsx`, `install-hint.tsx` | 50, 51 |
| 53 | 10 | Sign-out clearing and the offline page | `app/offline/page.tsx`, `app-shell.tsx` | 48, 51 |
| 54 | 10 | End to end, docs and ship | e2e, README, phone check | 52, 53 |

## Parallel work

- Milestone 6: Tasks 1 and 3 can start together only after Task 1's `values.ts` exists, so run Task 1 first, then Tasks 2 and 3 together (different files). After Task 2: Tasks 7, 8 and 13 touch different files. Task 5 (needs 4) can run beside Tasks 7 and 8. Task 12 needs only Task 7. Tasks 10 and 11 both read Task 9 and touch different files (`components/prep/*` and `quick-fire`), but Task 11 edits `components/prep/bank-card.tsx`, so run Task 10 first, then Task 11.
- Milestone 7: after Task 15, Tasks 16 and 17 are independent. Tasks 18 and 21 and 22 are independent of each other (18 needs 17, 22 needs 17, 21 needs only Milestone 6). Task 19 needs 15, 17 and 18. Tasks 24, 26 and 30 need Task 23 and touch different files. Task 28 needs only Task 22. Task 20 can run beside Tasks 22 and 23.
- Milestone 8: Tasks 33 and 34 need Task 32 and touch different files. Task 36 is last and optional.
- Milestone 9: Tasks 39 and 40 and 45 need only Task 38 and touch different files. Tasks 43 and 44 touch different routes; run them together after Task 41, but Task 44 edits `components/player/drill-player.tsx` and Task 43 edits `quick-fire-card.tsx`, which is safe.
- Milestone 10: Tasks 48 and 49 are independent. Tasks 50 and 51 touch different files in `lib/offline/`; run them together after 48 and 49. Task 53 needs Task 51.
