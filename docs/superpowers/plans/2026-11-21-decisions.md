# Jobsmith Prep build: decisions taken without asking

Date started: 2026-11-21. Branch: `build/prep` (local, not pushed), cut from `docs/plans-2026-11-21`.

The owner's instruction, relayed by the coordinating session: "please do all tasks dont' wait for my confiramtion - just make recomemned decisiosn". Each line below is a decision taken on that basis, with its reason, so it can be reviewed and overruled. The question numbers refer to `2026-11-21-status.md`.

## From the status file's questions

| # | Decision | Reason |
|---|---|---|
| Q1 | The seven specs and their section 11 assumptions are treated as approved | The owner said to build and not wait |
| Q2 | Build from the plans without Figma drafts; copy marked "proposed" stays in `lib/prep/copy.ts`, `lib/library/copy.ts` and `lib/offline/copy.ts` | Same instruction; the copy sits in three files so drafts can replace it later |
| Q3 | **Not decided, unconfirmed.** The parsers follow the spec's grammar and are proven on new fixtures (`tests/fixtures/prep/`). Whether the owner's real question banks use `### N.` headings is a fact about his files that nobody checked | The repo's old fixtures have no such headings and parse to zero rows |
| Q4 | Not taken. The hosted-service milestones (11 to 15) and everything behind them stay unbuilt | Paid services and accounts are off limits without the owner |
| Q7 | Clips uploaded by the CLI play on a server with TTS off, through the constant `CLI_TTS_IDENTITY` | The plan's default; the milestone 7 done-when needs it; one constant reverses it |
| Q5, Q6, Q8 to Q12 | Not reached: they belong to cycles after Prep | Nothing in Prep depends on them |

## How the build is run

| Decision | Reason |
|---|---|
| One branch `build/prep` for milestones 6 to 10, in place of the plan's one branch per milestone (`feat/mNN-...`) | The coordinating session asked for one branch; milestones stay separable by commit range, listed in "Progress" |
| The branch is cut from `docs/plans-2026-11-21`, so it carries the specs and plans as well as code | Executors need the plan next to the code, and this account cannot fetch or push the repo |
| Sonnet executors take a few related tasks each, one commit per task, in place of one executor per task | Each executor re-reads the plan and spec; batches cost far fewer tokens while the weekly cap is near its limit. Review is still per commit |
| A task with a `Blocked on:` line is built up to the live check, and the check is skipped and listed under "Skipped" | No accounts, stores, keys or devices are created or used |
| Package versions the plan leaves open are pinned at install time and recorded here | The plan invents no versions |

## Decisions made while building

| Task | Decision | Reason |
|---|---|---|
| 1 | `lib/prep/parse.ts` is created in Task 1 holding only the Contract types; Task 4 adds the parser to it | The `prep_question.blocks` column type imports `ParsedBlock` |
| 4 | A `### N.` heading with no question text after cleaning is ordinary section text, not a question | The plan is silent; an empty question has no key |
| 5 | In `applyUpserts` the rebuild runs once after all writes of the call, inside the same transaction | An include then finds a document pushed in the same call |
| 5 | Known limit: changing document B does not rebuild document A that includes B | The plan does not ask for it; the hub re-parse in Task 9 shows the difference |
| 1, 2 | No red phase was run for Tasks 1 and 2 (schema, helpers and tests were written together) | Reported by the executor; the tests pass and were rerun by the reviewer |
| 6 | `backfillPrep` counts only jobs that rebuilt; a failing job is skipped and logged by id; a dry run does the real rebuild in a rolled-back transaction | Counts of a dry run then match a real run |
| 7 | A library mark with an `opportunityId`, or a job mark without one, returns `invalid` | The plan left the mixed cases open |
| 8 | Known gap: two simultaneous `endSession` calls on one session could both write a timeline event | The scoped update has no "ended_at is null" guard; not fixed in milestone 6 |
| 9 | `needsRebuild` is true when the stored row count differs from the parse or a row carries an older artifact version | The plan said only "rows missing" |
| 9, 10 | No action calls `revalidatePath`; the hub calls `router.refresh()` after a mark or a rebuild | The job page reads the database on every request and has no cache to invalidate |
| 10 | The selected bank reuses the existing `?doc=job:<key>` parameter | Card selection and the document list stay in sync |
| 11 | The Quick-fire page creates nothing; the client starts the session once on mount and seeds the pick from the session id | The seed must come from the session |
| 11 | Quick-fire keys: Space or Enter for next, 1 to 3 for Shaky, Okay, Solid, after the reveal only | Not fixed by the spec; a visible "Next question" button does the same |
| 12 | Home's "N of M solid" counts marks only for questions the job's banks still hold (`keysByOpportunity`) | Counting all marks could show more solid than questions |
| 10 to 12 | Extra copy marked "Proposed" in `lib/prep/copy.ts` (`hub.*`, `quickFire.*`, `homeNoPrep`, `VOICE_LINE`) | No Figma drafts; one file to replace |
| 14 | A question bank with no readable question shows its card with the notice even when it is the job's only bank; the empty state is for a job with no bank card (`components/prep/prep-hub.tsx`, fixed by the reviewer after Task 14) | Spec 5.1 rule 8; the first build showed the empty state and hid the notice |
| 14 | The Postgres for the end-to-end suite is the project's compose container, started through colima, with a database of its own (`jobsmith_m6_e2e`) on port 5432; the app runs on port 3460 | Port 3000 belongs to another project on this machine |
| 28 | Next, previous and repeat keep a paused player paused | They never start sound on their own |
| 29 | Pitch documents get a card with a Listen link; a new hand-written `components/native-select.tsx` serves the speed and device-voice pickers | A native picker suits long voice lists on phones |
| 30 | The provider's voice list loads on demand in Settings; an empty list and a timeout look the same, with a "Load voices again" button | No provider call during a page render |
| 31 | Fixed: the Listen player no longer renders a second `<main>`; `tests/e2e/bridge.spec.ts` scopes two text checks to the Prep documents list | Found by the axe spec; the hub repeats those labels |
| 31 | End-to-end runs use `TTS_PROVIDER=fake` and `STORAGE_PROVIDER=local` under `.data/e2e-storage` | No key and no network |
| 35 | Drill shows a "Start drill" card first; each Drill page request is a fresh run | No sound before a user gesture; "Drill the shaky ones again" reused the finished run's state |
| 36 | A kept recording is linked to its question through `prep_session.meta.recordings`; deleting one has no confirm step; uploads are capped at 8 MiB | The `asset` table has no question column |
| 16 | Packages pinned: `@aws-sdk/client-s3` 3.1174.0 (Apache-2.0), `@vercel/blob` 2.9.0 (Apache-2.0) | The plan gives no versions |
| 18 | MP3 encoder: `@breezystack/lamejs` 1.2.7 (LGPL-3.0), a pure JavaScript lamejs fork with ESM and types | The plan left the fork open |
| 18 | Raw `audio/L16` and `audio/pcm` from a provider is read as 16-bit little-endian; a WAV the encoder cannot encode is stored as WAV | Matches the local server and Gemini behavior; nothing is dropped |
| 15 | `local` storage is refused whenever `VERCEL` is set, also when `STORAGE_PROVIDER` is unset | A Vercel function has no disk that outlives a request |
| 20 | The Gemini driver is built because the spec lists it, and stays unconfigured and uncalled | The owner does not use paid Google AI |
| 23 | Cleanup keeps clips referenced by library items and by each job's latest pitch, not only by questions | Otherwise "Delete audio" would remove pitch audio |
| 17 | Fixed after review: underscores inside words survive spoken-text cleaning (`3bc20dd`) | snake_case words in answers were mangled |
| 25 | Fixed after review: rendering the hub never calls the speech provider; saved voices or code defaults are used | A page render must not depend on a provider call |
| 26 | The bridge upload accepts any hash the job's questions need, including clips already done, and reports them as skipped | A second `jobsmith audio` run is then a no-op |
| 27 | The CLI reads the speech key only from `JOBSMITH_TTS_API_KEY`; a refused clip is skipped and counted, exit 0; an unreachable speech server exits 1 after uploading what exists | The plan was silent |
| 27 | Existing test changed: `tests/unit/cli-imports.test.ts` now allows `@/lib/audio/normalize` and `@/lib/tts/config` in the CLI by name | The audio command shares those leaf modules; the bundle test still limits `node_modules` inputs to the encoder |

## Skipped live checks

| Task | Skipped | Why |
|---|---|---|
| 14 | WebKit and the phone Playwright projects (new Prep specs and the existing ones) | Playwright wants browser build `webkit-2359`; only 2336, 2370 and 2388 are installed, and nothing was downloaded. Fix: `pnpm exec playwright install webkit` |
| 14 | Rerun of the packet end-to-end spec after the reviewer's notice fix | The Playwright chain needs WebKit; the behavior was checked by hand in the Browser pane on a job holding both banks, not on a job with the lone no-questions bank |
| 14 | Preview deployment, the pass in Chrome and Safari on a preview, `pnpm prep:backfill` on a real database | No push, no deploy; Safari was not checked at all |

## Postponed

The owner's second instruction, relayed 2026-11-21: "okay for all do recomennder decsiosn or jsut pospone fixes or extranl accounts just bascailly create version". Each line is something left for later and what it needs.

| Item | Needs |
|---|---|
| WebKit and phone end-to-end projects | `pnpm exec playwright install webkit` (a download), then `pnpm test:e2e` |
| Safari check of every Prep screen | A person or a WebKit run |
| Live Vercel Blob storage run | The owner's private Blob store and `BLOB_READ_WRITE_TOKEN`, then `JOBSMITH_LIVE_STORAGE=1` |
| Live S3 run | `docker compose --profile storage up -d minio`, then `JOBSMITH_LIVE_STORAGE=1` |
| Live `jobsmith audio` run | The owner's local Qwen3-TTS server on `http://127.0.0.1:8890/v1` |
| Gemini and ElevenLabs request and response shapes | A read of the provider docs named in the `UNVERIFIED` comments in `lib/tts/gemini.ts` and `lib/tts/elevenlabs.ts`; keys only if a live check is wanted |
| Voice-list endpoints of the OpenAI-compatible driver | A look at what the local server really answers |
| `pnpm prep:backfill` on a real database, and a preview deployment | A push and a deploy, both off limits here |
| Two simultaneous `endSession` calls can both write a timeline event | A guard `where ended_at is null` in the scoped update |
| A change to an included document does not rebuild the document that includes it | A rebuild of dependents in `lib/prep/rebuild.ts` |
| Whether the owner's real question banks use `### N.` headings (status question 3) | The owner, or a read of his files |
| Copy marked "Proposed" in `lib/prep/copy.ts` | Figma drafts or a hand edit |
| The Hosted spec assumes Gemini as the hosted TTS provider | A different provider choice before the Hosted cycle, since paid Google AI is not used |
| A clip that fails while playing falls back to the browser voice but is not relabelled "Browser voice" | `ListenPlayer` passing `onClipFailed` to the transcript |
| The asset route's refusal for another user's clip was tested with a random id only | A second account in the end-to-end suite |
| `tests/e2e/prep-voice.spec.ts:276` (voice change in Settings) failed once under load and passes alone | A wait for the voice list before `selectOption` |
| No single clean pass of the whole Chromium suite in milestone 8; two runs together cover every spec | A rerun on a quiet machine |
| Live microphone check of Record my answer | A phone or a laptop microphone and a person |

## Progress

| Milestone | Tasks | Commits | Checked by the reviewer |
|---|---|---|---|
| 6 | 1 to 5 | `7a0612f` to `e5ae55e` | 163 tests rerun (Prep, isolation, migrations, artifact upsert); the diff of `lib/artifacts/upsert.ts` and `edit.ts` read |
| 6 | 6 to 9 | `8b1e17b` to `f8cefc4` | 73 tests rerun; `requireUser` in all five actions; no database client import under `app/` |
| 6 | 10 to 13 | `e33ea9d` to `d7479fe` | 49 tests rerun; nothing seen in a browser at this point |
| 6 | 14 | `567b1b1` plus the reviewer's fix | Executor: 36 Chromium end-to-end tests passed, axe clean in light and dark, Chromium only. Reviewer, in the Browser pane at 390 px on `localhost:3460`: hub cards, the no-questions notice, the question list, a Solid mark updating the summary to "1 solid", Quick-fire showing question, spine and marks, no sideways scroll, no console errors |
| 7 | 15 to 18 | `400af6e` to `7d994fc` | 99 tests rerun |
| 7 | 19 to 23 | `339081e` to `804f9d1` | 124 tests rerun |
| 7 | 24 to 27 | `3bc20dd` to `0cd30e6` | 68 tests rerun; `requireUser` in the asset route |
| 7 | 28 to 31 | `670f5f8` to `9e0959d` | 66 tests rerun; the Listen screen seen at 390 px in the Browser pane (Play not pressed). Executor: 45 Chromium end-to-end tests passed, axe clean on Listen, the hub and Settings Voice |
| 8 | 32 to 37 | `57f094d` to `36517fa` | 116 tests rerun; `requireUser` in the upload route. Executor: 9 Drill specs passed in Chromium at 1280 and 390 px, axe clean; whole-suite runs had one spec failure each (one fixed, one a load flake) |
