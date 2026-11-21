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

## Skipped live checks

(added per task)

## Progress

| Milestone | Tasks | Commits | Checked by the reviewer |
|---|---|---|---|
| 6 | 1 to 5 | `7a0612f` to `e5ae55e` | 163 tests rerun (Prep, isolation, migrations, artifact upsert); the diff of `lib/artifacts/upsert.ts` and `edit.ts` read |
