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

## Skipped live checks

| Task | Skipped | Why |
|---|---|---|
| 14 | WebKit and the phone Playwright projects (new Prep specs and the existing ones) | Playwright wants browser build `webkit-2359`; only 2336, 2370 and 2388 are installed, and nothing was downloaded. Fix: `pnpm exec playwright install webkit` |
| 14 | Rerun of the packet end-to-end spec after the reviewer's notice fix | The Playwright chain needs WebKit; the behavior was checked by hand in the Browser pane on a job holding both banks, not on a job with the lone no-questions bank |
| 14 | Preview deployment, the pass in Chrome and Safari on a preview, `pnpm prep:backfill` on a real database | No push, no deploy; Safari was not checked at all |

## Progress

| Milestone | Tasks | Commits | Checked by the reviewer |
|---|---|---|---|
| 6 | 1 to 5 | `7a0612f` to `e5ae55e` | 163 tests rerun (Prep, isolation, migrations, artifact upsert); the diff of `lib/artifacts/upsert.ts` and `edit.ts` read |
| 6 | 6 to 9 | `8b1e17b` to `f8cefc4` | 73 tests rerun; `requireUser` in all five actions; no database client import under `app/` |
| 6 | 10 to 13 | `e33ea9d` to `d7479fe` | 49 tests rerun; nothing seen in a browser at this point |
| 6 | 14 | `567b1b1` plus the reviewer's fix | Executor: 36 Chromium end-to-end tests passed, axe clean in light and dark, Chromium only. Reviewer, in the Browser pane at 390 px on `localhost:3460`: hub cards, the no-questions notice, the question list, a Solid mark updating the summary to "1 solid", Quick-fire showing question, spine and marks, no sideways scroll, no console errors |
