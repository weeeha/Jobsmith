# Milestone 25: Debrief in

> Done when: "A quick-form debrief of a fictional recruiter screen with one held, one missed and one new question, a follow-up and 'next round' shows its suggestions; Apply changes both marks, adds a bank version whose new question is an unfilled row under 'Asked on', sets the next action, appends the stage notes and moves the job; pushing the same debrief as a file afterwards proposes nothing"

Branch: `feat/m25-debrief-in`, cut from `main` once Prep milestones 6 and 9 are merged. Contract names are in `README.md`; this file adds the steps.

**Before starting** (run from the worktree root; each probe must exit 0):

```bash
test -f lib/prep/parse.ts && test -f lib/prep/marks.ts && echo prep-6-ok
test -d lib/library && echo prep-9-ok                        # absent: no library suggestions (Task 5 stubs, Task 8 skips)
grep -q source_body_md lib/db/schema/artifact.ts && echo apply-20-ok   # absent: fork writes no sourceBodyMd
test -f lib/compare/merge.ts && echo apply-22-present        # not needed by this milestone (see Task 11)
test -f lib/artifacts/hooks.ts && echo hook-registry-exists  # present: register `debrief` in it instead of creating it (Task 6)
pnpm install && pnpm typecheck && pnpm test                  # green baseline before any change
```

Without Prep 6, stop. Open `lib/prep/parse.ts`, `lib/prep/marks.ts`, the Prep scoped helpers and `lib/library/*` and write down, in the first task report, the exported names that Tasks 2 and 5 bind to (heading parser, key normalizer, mark writer, mark reader, bank-question reader, library create, library append).

### Task 1: Migration, schema, scoped helpers, isolation

**Files:**
- Create: `lib/db/schema/debrief.ts`, `lib/db/scoped/debrief.ts`, `lib/db/scoped/debrief-suggestion.ts`, `lib/db/scoped/asked-question.ts`, `lib/db/migrations/<next number>_debrief.sql` (generated)
- Modify: `lib/db/schema/index.ts` (`export * from "./debrief"`), `lib/db/schema/pipeline.ts` (`event_kind_check` built from `EVENT_KINDS`), `lib/pipeline/values.ts` (`EVENT_KINDS` gains `"debrief_applied"`), `lib/pipeline/event-text.ts` (a placeholder case so the switch stays exhaustive), `lib/db/scoped/index.ts` (`debrief`, `debriefSuggestion`, `askedQuestion` on `Scoped` and `scoped()`), `lib/db/scoped/artifact.ts` (`getById(id)`)
- Test: `tests/integration/debrief-schema.test.ts`, `tests/integration/scoped-isolation.test.ts` (new cases), `tests/integration/migrations.test.ts`

**Interfaces:**
- Consumes: `schema.user`, `schema.opportunity`, `schema.stage`, `schema.artifact` (`artifact_user_id_id_unique`, `stage_user_id_id_unique`, `opportunity_user_id_id_unique` exist), `EVENT_KINDS` (`lib/pipeline/values.ts`)
- Produces: `schema.debrief`, `schema.debriefSuggestion`, `schema.askedQuestion` with the README Contract columns and constraints; scoped methods
  `debrief`: `getById(id)`, `findByArtifactId(artifactId)`, `findOpenForUpload(opportunityId, artifactKey)` (status `uploading` or `transcribing`, `artifact_id` null), `listForOpportunity(opportunityId)`, `listForDocument(opportunityId, artifactKey)` (oldest first), `lockForDocument(opportunityId, artifactKey)` (`for update`), `insert`, `update(id, values)`, `remove(id)`, `listAll()`;
  `debriefSuggestion`: `getById(id)`, `listForDebriefs(debriefIds)` (by position), `listDecidedFingerprints(opportunityId)` (`Set<string>` of status `accepted` or `rejected`), `maxPosition(debriefId)`, `insertMany(values)`, `update(id, values)`, `updateMany(ids, values)`, `listAll()`, `supersedePendingForStage(opportunityId, stageId, keepDebriefId?)` and `supersedePendingForDebriefs(debriefIds)`, each returning the count;
  `askedQuestion`: `upsert(values)` (on conflict (`opportunity_id`, `stage_id`, `question_key`) update `outcome`, `asked_at`, `asked_text`, `debrief_id`, `suggestion_id`), `listForOpportunity(opportunityId)`, `listAll()`;
  `artifact.getById(id)`.
- `event.kind` check lists every `EVENT_KINDS` value; the migration is generated, then read: it must contain no `DROP TABLE`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/integration/debrief-schema.test.ts (PGlite, real migrations)
it("rejects a rating of 6, a malformed fingerprint, a quote of 241 characters and asked_text of 301", ...);   // each insert throws a check violation
it("keeps one suggestion per (debrief_id, position) and one debrief per artifact_id", ...);                    // second insert throws unique violation
it("keeps one asked_question per (opportunity, stage, question_key) and updates it through upsert", ...);      // second upsert: outcome and asked_at change, count stays 1
it("deletes debriefs, suggestions and asked rows with their job; sets stage_id to null when a stage goes", ...);
it("accepts every value in EVENT_KINDS in event.kind and rejects 'bogus'", ...);                               // loops EVENT_KINDS, includes 'debrief_applied'
it("supersedePendingForStage flips only pending rows of that stage and returns the count", ...);
// scoped-isolation.test.ts: one case per scoped method above, user B sees nothing and changes nothing
// migrations.test.ts: information_schema lists debrief, debrief_suggestion, asked_question; no timestamp without time zone
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/debrief-schema.test.ts tests/integration/scoped-isolation.test.ts`
Expected: FAIL, `schema.debrief` is undefined and the scoped properties do not exist.

- [ ] **Step 3: Implement the schema and helpers**

Follow `lib/db/schema/artifact.ts`: composite FKs for `opportunity` and `artifact` with `.onDelete("cascade")`, single-column FKs with `set null` for `stage_id`, `debrief_id` and `suggestion_id` (a composite set-null would null `user_id`). `event_kind_check` becomes ``sql`${t.kind} in (${sql.raw(EVENT_KINDS.map((k) => `'${k}'`).join(", "))})` `` so every cycle's kind list stays in one place. In `eventText` add `case "debrief_applied": return "Debrief applied.";` (Task 7 replaces it). Run `pnpm db:generate`, rename nothing, read the SQL.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/db lib/pipeline tests
git commit -m "feat(debrief): debrief, suggestion and asked_question tables with scoped helpers"
```

**Acceptance:** (1) all three tables have a scoped file and an isolation row (spec 4); (2) every check lists its full value set from this migration (spec 4, Feed's rule); (3) `event.kind` accepts every `EVENT_KINDS` value including `debrief_applied` (spec 4); (4) a deleted job removes its debriefs and suggestions and keeps nothing dangling.

### Task 2: Values, keys and the grammar parser

**Files:**
- Create: `lib/debrief/values.ts`, `lib/debrief/keys.ts`, `lib/debrief/grammar.ts`
- Test: `tests/unit/debrief-keys.test.ts`, `tests/unit/debrief-grammar.test.ts`

**Interfaces:**
- Consumes: Prep's heading rule and key normalizer from `lib/prep/parse.ts` (names recorded in Before starting), `keyFromTitle` (`lib/artifacts/normalize.ts`)
- Produces: everything under "Constants and types" and "Grammar" in the README Contract; also `parseQuestionHeading(line): { number: number; text: string; unfilled: boolean } | null` (a wrapper of Prep's rule 1, used here and by Task 11)

- [ ] **Step 1: Write the failing tests**

```ts
// debrief-keys.test.ts
it("questionKeyOf equals Prep's key for the same text", () => expect(questionKeyOf("How do you decide what not to build?")).toBe(prepKeyOf("How do you decide what not to build?")));
it("formatDebriefDate uses fixed month names and the zone's calendar day", () => {
  expect(formatDebriefDate(new Date("2026-09-03T12:00:00Z"), "UTC")).toBe("3 Sep 2026");
  expect(formatDebriefDate(new Date("2026-11-03T02:30:00Z"), "America/Toronto")).toBe("2 Nov 2026");
});
it("debriefKeyFor slugs the label and adds -2 when another stage holds the key", () => {
  expect(debriefKeyFor({ id: "a", label: "Recruiter screen" }, [])).toBe("debrief-recruiter-screen");
  expect(debriefKeyFor({ id: "b", label: "Recruiter screen" }, [{ key: "debrief-recruiter-screen", stageId: "a" }])).toBe("debrief-recruiter-screen-2");
  expect(debriefKeyFor({ id: "a", label: "Recruiter screen" }, [{ key: "debrief-recruiter-screen", stageId: "a" }])).toBe("debrief-recruiter-screen");
});
// debrief-grammar.test.ts: a table, one row per case, expected fields compared with toMatchObject
```

Grammar table (each is `[name, input, expected]`): every heading and synonym in lower, upper and mixed case (`## ASKED`, `## questions asked`, `## What worked`, `## what did not work`); heading form `### 1. "Why Northwind?"` with `**Went:** held`; list form `- "Why Northwind?"` with indented sub-bullets `**Went:** missed`; both forms in one section; outcome words (`landed`, `good` read held; `shaky`, `okay` wobbled; `blanked`, `bad` missed; `fine` reads `unclear` with `unknown_value`; a missing `**Went:**` reads `unclear` with no warning); `**Why:** He asked "how many people ship it" twice.` gives `quote` `how many people ship it`; `**Rating:** 4/5` before the first heading, `## Rating` with `3`, and `**Rating:** 6/5` giving `bad_rating` and null; `- **Story title:** text` under Landed giving a titled item and a bare list item giving none; Follow-ups `Send the case study (due 2026-11-04)` and `Send the case study · 2026-11-04` both giving `dueOn` `2026-11-04`, `(due 2026-13-40)` giving `bad_date` and null; Next steps `**Next:** next round` then a line of text, `**Next:** Waiting. They will call Friday.` giving `waiting` with text `They will call Friday.`, `**Next:** maybe` giving no `next`; a grammar heading with no items giving `empty_heading`; a repeated `## Asked` merging items; everything after the first `## Transcript` landing in `transcript` and never in `asked`; unknown `## Interviewer notes` content landing in `notes`; Windows line endings; `hasGrammar` false for a body of plain notes and true for a body holding only a rating.

```ts
it("reads the real fixture tests/fixtures/packet/nwl-debrief-round2.md as notes with no grammar", () => {
  const parsed = parseDebrief(readFileSync("tests/fixtures/packet/nwl-debrief-round2.md", "utf8"));
  expect(parsed.hasGrammar).toBe(false);
  expect(parsed.asked).toEqual([]);
  expect(parsed.notes).toContain("Clear examples, good rapport with the panel.");
  expect(parsed.problems).toEqual([]);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/debrief-keys.test.ts tests/unit/debrief-grammar.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `parseDebrief` and the keys**

A single pass over lines. Level-2 headings switch the section; a recognized heading is matched after trimming and dropping a trailing colon. Level-1 lines are the title and are skipped. Unknown level-2 sections go to `notes` with their heading line. Ask items start at a `### N.` heading (use `parseQuestionHeading`) or a list item holding a straight or curly double-quoted span; label lines (`**Went:**`, `**Why:**`, `**Said:**`, `**Spine:**`) belong to the item above them. A list item under Asked with no quoted span goes to `notes`. Dates parse with a strict `YYYY-MM-DD` check including calendar validity. `formatDebriefDate` takes year, month and day from `Intl.DateTimeFormat("en-US", { timeZone, ... }).formatToParts` and maps the month number through `["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]`. Pure: no database, no clock.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/debrief-keys.test.ts tests/unit/debrief-grammar.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/debrief tests/unit
git commit -m "feat(debrief): debrief grammar parser and key helpers"
```

**Acceptance:** (1) every heading and synonym, both question forms, date and rating forms and unknown values are table cases (spec 5.2, 8); (2) a transcript is never parsed (spec 5.2); (3) the real owner fixture reads as notes, pinned (this plan's README); (4) `parseDebrief` never throws on any input, including an empty string.

### Task 3: Render, quick form model, compose body

**Files:**
- Create: `lib/debrief/render.ts`
- Test: `tests/unit/debrief-render.test.ts`

**Interfaces:**
- Consumes: `parseDebrief`, `hasDebriefHeading` (Task 2), `QuickForm` (Contract)
- Produces: `renderDebrief(form, { stageLabel, transcribed? })`, `composeBody({ formMd, text })`, `quickFormSchema` (Zod, explicit messages: rating 1 to 5, asked text 1 to 300 characters after trimming and collapsing whitespace, at most 6 follow-ups, dates `YYYY-MM-DD`)

- [ ] **Step 1: Write the failing test**

```ts
it("renders every field and parses it back to the same values", () => {
  const form: QuickForm = {
    rating: 4,
    asked: [
      { text: "How do you decide what not to build?", outcome: "held", said: "I cut by evidence.", spine: "evidence first" },
      { text: "Tell me (briefly) about a conflict", outcome: "missed", why: "I blanked." },
    ],
    followUps: [{ text: "Send the case study", dueOn: "2026-11-04" }, { text: "Share two availability slots", dueOn: null }],
    next: { kind: "next_round", text: "They will send times." },
    anything: "Nice team.",
  };
  const md = renderDebrief(form, { stageLabel: "Recruiter screen" });
  const parsed = parseDebrief(md);
  expect(md.startsWith("# Debrief: Recruiter screen")).toBe(true);
  expect(parsed.rating).toBe(4);
  expect(parsed.asked.map((a) => [a.text, a.outcome])).toEqual([["How do you decide what not to build?", "held"], ["Tell me (briefly) about a conflict", "missed"]]);
  expect(parsed.followUps).toEqual([expect.objectContaining({ text: "Send the case study", dueOn: "2026-11-04" }), expect.objectContaining({ text: "Share two availability slots", dueOn: null })]);
  expect(parsed.next).toEqual({ kind: "next_round", text: "They will send times." });
  expect(parsed.notes).toContain("Nice team.");
});
it("title says transcribed for a server transcription", ...);          // "# Debrief: Recruiter screen (transcribed)"
it("composeBody keeps pasted text that holds a grammar heading and wraps other text under ## Transcript", ...);
it("composeBody puts the form first, then the text, with one blank line between", ...);
it("replaces a double quote inside a question with a single quote so the list form parses", ...);
it("omits empty sections and renders nothing for a form with no content", ...);
it("quickFormSchema rejects 7 follow-ups with the message 'Six follow-ups at most.'", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/debrief-render.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `renderDebrief` and `composeBody`**

The form renders questions in the list form (`- "text"` with indented `  - **Went:** held` lines), because the heading form cuts a question at the first ` (` under Prep's rule and would lose `(briefly)`. Section order: title, `**Rating:** n/5`, `## Asked`, `## Follow-ups` (`- text (due 2026-11-04)`), `## Next steps` (`**Next:** next round`, newline, text), `## Anything else`. Newlines inside a field collapse to spaces except in Anything else.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/debrief-render.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/debrief tests/unit
git commit -m "feat(debrief): render the quick form into the debrief grammar"
```

**Acceptance:** (1) a unit test renders every field and parses it back (spec 5.2, 8); (2) pasted text with a grammar heading stays as is, other text goes under `## Transcript` (spec 5.1); (3) form text is never lost to the parenthesis rule.

### Task 4: Matching, mark table, fingerprints

**Files:**
- Create: `lib/debrief/match.ts`, `lib/debrief/marks-map.ts`, `lib/debrief/fingerprint.ts`
- Test: `tests/unit/debrief-match.test.ts`, `tests/unit/debrief-marks-map.test.ts`, `tests/unit/debrief-fingerprint.test.ts`

**Interfaces:**
- Consumes: `questionKeyOf`, `normalizeTarget` (Task 2)
- Produces: `dice`, `matchAsk`, `STOP_WORDS`, the threshold constants, `proposeMark`, `fingerprintOf` (Contract)

The fixed stop-word list, lower case: `a an and are as at be by can do does for from had has have how i in is it its me my of on or our so than that the their them then there these they this to was we were what when where which who why will with would you your about`.

- [ ] **Step 1: Write the failing tests**

```ts
const bank = (text: string, n: number): MatchCandidate => ({ questionKey: questionKeyOf(text), text, source: "bank", artifactKey: "questions-recruiter-screen", number: n, section: null, bankTitle: "Questions for Recruiter screen", stageId: null });
it("equal normalized text is similarity 1 and the same key", () => {
  const r = matchAsk("How do you decide what NOT to build?!", [bank("How do you decide what not to build", 12)]);
  expect(r.similarity).toBe(1); expect(r.candidate?.number).toBe(12); expect(r.lowMatch).toBe(false);
});
it("0.857 is a match, 0.5 a low match, 0.2857 no match but offered", () => {
  const a = "How do you prioritize competing requests from stakeholders";
  expect(matchAsk(a, [bank("How do you prioritize requests from stakeholders", 1)]).candidate).not.toBeNull();
  const low = matchAsk(a, [bank("How do you prioritize competing stakeholder asks", 2)]);
  expect(low.similarity).toBeCloseTo(0.5, 5); expect(low.lowMatch).toBe(true);
  const none = matchAsk(a, [bank("How do you handle competing deadlines", 3)]);
  expect(none.candidate).toBeNull(); expect(none.questionKey).toBe(questionKeyOf(a)); expect(none.candidates).toHaveLength(1);
});
it("a model match key is used when it names a candidate and is low_match under 0.3", ...);
it("a model match key that names no candidate is ignored", ...);
it("candidates lists at most three above 0.25, best first, bank before library on ties", ...);
it("drops stop words and returns 0 for two texts with no words left", ...);
// marks-map: 16 cells of the table, test.each over [went, current, expected]
// fingerprint: stable, 16 hex, differs by stage id, same for "Hello, World!" and "hello world"
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/debrief-match.test.ts tests/unit/debrief-marks-map.test.ts tests/unit/debrief-fingerprint.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`dice` works on word sets after lower-casing, splitting on runs of non-letters and non-digits and dropping `STOP_WORDS`; two empty sets give 0. `matchAsk`: equal normalized text first (similarity 1, key shared); else best Dice: 0.75 or more matches, 0.45 up to 0.75 matches with `lowMatch`, below 0.45 no match and `questionKey` of the ask's own text. `proposeMark` is the README table as a nested record.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/debrief-match.test.ts tests/unit/debrief-marks-map.test.ts tests/unit/debrief-fingerprint.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/debrief tests/unit
git commit -m "feat(debrief): question matching, mark table and fingerprints"
```

**Acceptance:** (1) thresholds 0.75 and 0.45 and the three-candidate offer above 0.25 (spec 5.6); (2) every cell of the mark table is a test (spec 5.4); (3) the fingerprint is the first 16 hex of sha256 over kind, stage id and normalized target (spec 5.4 step 4).

### Task 5: Prep port and `upsertAsked`

**Files:**
- Create: `lib/debrief/prep-port.ts`, `lib/prep/asked.ts`
- Test: `tests/integration/debrief-prep-port.test.ts`, `tests/integration/asked-upsert.test.ts`

**Interfaces:**
- Consumes: Prep's mark writer and reader, `prep_question` scoped reads, `lib/library` create and append (names from Before starting), `s.askedQuestion.upsert` (Task 1)
- Produces: in `prep-port.ts`, `BankQuestion`, `LibraryItemLite`, `listBankQuestions(s, opportunityId)`, `currentMarks(s, opportunityId, keys)`, `setJobMark(tx, { opportunityId, questionKey, level, markedAt })` returning `{ changed }`, `listLibraryItems(s)`, `createLibraryItem(tx, input)`, `appendLibraryItem(tx, { itemId, blockMd })`; in `lib/prep/asked.ts`, `upsertAsked(tx, input)` (Contract)

This is the only file in the milestone that names Prep or Library exports; every other file imports from here. When `lib/library` is absent: `listLibraryItems` returns `[]`, `createLibraryItem` and `appendLibraryItem` return `fail("not_found", "The Library is not installed.")`, and the library tests use `it.skipIf`.

- [ ] **Step 1: Write the failing tests**

```ts
it("listBankQuestions reads the latest version of each question bank on the job", ...);   // push v1 then v2 of one bank, plus a second bank: rows come from v2 and the second bank
it("setJobMark writes level and marked_at, leaves drill_count at 0, and writes nothing for an equal level", ...);
it("currentMarks returns only marked keys", ...);
it("createLibraryItem then appendLibraryItem adds the block after a blank line", ...);
it("upsertAsked inserts, then a second call for the same stage and key updates outcome and asked_at in place", ...);
it("upsertAsked keeps a separate row for the same question in another stage", ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/debrief-prep-port.test.ts tests/integration/asked-upsert.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the port and `upsertAsked`**

Each port function is a thin call into the Prep export recorded in the task report; no new Prep logic. `setJobMark` reads the current mark first through `currentMarks` and returns `{ changed: false }` without calling the writer when the level is equal. `upsertAsked` calls `tx.askedQuestion.upsert` and is the only code that does.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/debrief-prep-port.test.ts tests/integration/asked-upsert.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/debrief lib/prep tests/integration
git commit -m "feat(debrief): prep port and the asked_question writer"
```

**Acceptance:** (1) marks are written through `lib/prep/marks.ts` with `drill_count` untouched and an equal level writes nothing (spec 5.8); (2) a later Apply for the same stage and question updates `outcome` and `asked_at` (spec 4); (3) `lib/prep/asked.ts` is the only writer of `asked_question` (spec 3).

### Task 6: `fork` intent, `writeManualVersion`, version hooks

**Files:**
- Create: `lib/artifacts/manual.ts`, `lib/artifacts/hooks.ts` (skip if it exists; add the `debrief` entry instead)
- Modify: `lib/artifacts/plan.ts` (`UpsertIntent.fork`, the manual branch of `planUpsert`, `NewVersion.sourceBodyMd`), `lib/artifacts/upsert.ts` (`applyUpserts`: call `runVersionHooks` after `created`, `versioned` and `updated`), `lib/artifacts/edit.ts` (`saveArtifactEdit`: after `edited` and `versioned`), `lib/db/schema/artifact.ts` (nothing, unless Apply 20 is absent: then nothing)
- Test: `tests/unit/artifact-plan.test.ts` (new cases), `tests/integration/artifact-manual.test.ts`

**Interfaces:**
- Consumes: `planUpsert`, `applyUpserts`, `saveArtifactEdit`, `KEY_PATTERN` and `MAX_ARTIFACT_BYTES` (`lib/bridge/wire`), `tx.artifact.getLatest`, `insert`, `update`, `getById` (Task 1)
- Produces: `writeManualVersion`, `runVersionHooks` (Contract); `planUpsert` with `fork`

- [ ] **Step 1: Write the failing tests**

```ts
// artifact-plan.test.ts
it("fork on an unsent latest makes a new manual version instead of editing in place", () => {
  const plan = planUpsert([v(1, { origin: "pushed", sentAt: null })], { origin: "manual", kind: "question_bank", title: "T", stageId: null, bodyMd: "new", hash: "h2", fork: true }, NOW);
  expect(plan).toMatchObject({ status: "versioned", insert: { version: 2, origin: "manual", sourceHash: null, editedAt: NOW } });
});
it("fork with the latest body unchanged is unchanged; fork on a sent latest versions; fork with no versions creates", ...);
it("manual without fork still edits an unsent latest in place", ...);               // existing behavior, untouched
// artifact-manual.test.ts (PGlite)
it("creates version 1 as origin manual with edited_at set and the debrief hook ingests it", ...);
it("an in-place manual edit of a debrief version runs the hook again and keeps one debrief row", ...);
it("a fork records the pre-fork body in source_body_md when the column exists", ...);   // it.skipIf(!hasColumn)
it("a push of the old bank text after a fork reports unchanged, a changed push versions and carries the notice", ...);   // Core rule 3 plus versionNotice
it("applyUpserts for kind debrief maps origin pushed to via push, pasted to paste, generated to transcript", ...);
it("a failing hook never fails the write", ...);   // vi.spyOn ingest to throw: write still created
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/artifact-plan.test.ts tests/integration/artifact-manual.test.ts`
Expected: FAIL, `fork` is ignored and `writeManualVersion` does not exist.

- [ ] **Step 3: Implement**

In `planUpsert`'s manual branch, after the equal-hash check: `if (intent.fork) return { status: "versioned", insert: { ...manual fields, sourceHash: null, editedAt: now }, fork: true }`. `writeManualVersion` locks the opportunity, validates the key and size, lists versions, plans, writes through `tx.artifact`, loads the latest full row for `sourceBodyMd` when `fork` is set and the column exists, then calls `runVersionHooks`. `runVersionHooks` is a `switch` on `written.kind`; `debrief` calls `ingestDebrief` inside `tx.transaction` (a savepoint) in a try/catch that logs `[debrief] ingest_failed` with the debrief constructor name and Postgres code only. Hook only on statuses `created`, `versioned`, `edited`, `updated`. No top-level calls in `hooks.ts`: it imports `ingestDebrief` lazily inside the case to avoid an import cycle with Prep.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/artifact-plan.test.ts tests/integration/artifact-manual.test.ts tests/integration/artifact-upsert.test.ts tests/integration/artifact-edit.test.ts && pnpm typecheck`
Expected: PASS (the existing upsert and edit suites stay green)

- [ ] **Step 5: Commit**

```bash
git add lib/artifacts tests
git commit -m "feat(artifacts): fork intent, manual version writer and after-write hooks"
```

**Acceptance:** (1) `fork` versions even when the latest is unsent and sets `edited_at` (spec 5.8); (2) a forked manual version leaves the newest pushed version as Core rule 3's reference, so a re-push of the old text is `unchanged` (spec 5.8 decision); (3) every version write path reaches the hook for kind `debrief` (spec 5.4); (4) a hook failure never fails a push or save (spec 6).

### Task 7: `appendStageOutcome`, `deleteDebriefDocument`, event text

**Files:**
- Create: `lib/artifacts/delete-debrief.ts`, `lib/pipeline/debrief-event.ts`
- Modify: `lib/pipeline/schedule.ts` (`appendStageOutcome`), `lib/db/scoped/stage.ts` (`appendOutcome`), `lib/db/scoped/artifact.ts` (`deleteVersions(ref, key)`), `lib/pipeline/event-text.ts` (`debrief_applied` text)
- Test: `tests/integration/pipeline-schedule.test.ts` (new cases), `tests/integration/debrief-delete-document.test.ts`, `tests/unit/event-text.test.ts`

**Interfaces:**
- Consumes: `setStageOutcome` neighbor, `eventText`, `ApplyCounts` (Contract)
- Produces: `appendStageOutcome`, `deleteDebriefDocument`, `recordDebriefApplied(tx, { opportunityId, stageId, stageLabel, debriefId, counts, added, extras: { movedTo?: string; closedAs?: string }, now })` writing the `debrief_applied` event

- [ ] **Step 1: Write the failing tests**

```ts
it("appendStageOutcome joins with a blank line and keeps both of two concurrent appends", async () => {
  await Promise.all([appendStageOutcome(s, oppId, stageId, "First block"), appendStageOutcome(s, oppId, stageId, "Second block")]);
  const text = (await s.stage.listForOpportunity(oppId)).find((x) => x.id === stageId)!.outcomeMd!;
  expect(text).toContain("First block"); expect(text).toContain("Second block");
});
it("appendStageOutcome on empty outcome_md stores only the block, on existing text adds \n\n", ...);
it("setStageOutcome stays the sheet's writer and replaces the text", ...);
it("deleteDebriefDocument removes every version of a debrief key and refuses any other kind with not_debrief", ...);
it("eventText for debrief_applied reads 'Debrief of Recruiter screen: 3 marks, 2 new questions, next action set.'", ...);
it("eventText omits zero parts, pluralizes 1 mark and 1 new question, and names the move and the close", ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/pipeline-schedule.test.ts tests/integration/debrief-delete-document.test.ts tests/unit/event-text.test.ts`
Expected: FAIL, functions do not exist.

- [ ] **Step 3: Implement**

`appendOutcome` is one statement: ``UPDATE stage SET outcome_md = coalesce(outcome_md || E'\n\n', '') || ${block}, updated_at = now() WHERE id = ${id} AND user_id = ${userId} AND opportunity_id = ${opportunityId} RETURNING *`` through drizzle's `sql` template, so a save from the stage sheet at the same moment is never half merged. `deleteDebriefDocument` locks the opportunity, lists versions, returns `not_debrief` unless every version's kind is `debrief`, then deletes through `deleteVersions`. `recordDebriefApplied` builds meta `{ debriefId, stageId, stageLabel, counts, added }` and inserts the event with `stageId` set. `eventText` for `debrief_applied` reads `meta.stageLabel` and `meta.counts` and follows the README wording.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/pipeline-schedule.test.ts tests/integration/debrief-delete-document.test.ts tests/unit/event-text.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(pipeline): append stage notes in one statement, debrief delete and event text"
```

**Acceptance:** (1) stage notes append in one `UPDATE` so a concurrent sheet save is never half merged (spec 5.8); (2) `deleteDebriefDocument` is the only artifact delete and is limited to kind `debrief` (spec 5.1); (3) the event wording matches the Contract.

### Task 8: Payload schemas and ingest

**Files:**
- Create: `lib/debrief/payload.ts`, `lib/debrief/ingest.ts`
- Test: `tests/unit/debrief-payload.test.ts`, `tests/integration/debrief-ingest.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 4, 5 and 6; `parsePreferences` (`lib/preferences/schema`, `attention.followUpDays`); `zonedAt`, `addZonedDays` (`lib/time/zone.ts`); scoped helpers from Task 1
- Produces: the payload types and Zod schemas (`askedPayloadSchema`, `libraryPayloadSchema`, `followUpPayloadSchema`, `outcomePayloadSchema`, `pipelinePayloadSchema`, `parsePayload(kind, value)`), `ingestDebrief` (Contract)

- [ ] **Step 1: Write the failing tests**

```ts
// debrief-payload.test.ts: each schema accepts its example, rejects v: 2, rejects unknown outcome and a 301-character askedText, strips unknown keys
// debrief-ingest.test.ts (PGlite; job with two question banks pushed through Prep; stages Recruiter screen scheduled in the past)
it("creates a debrief row and suggestions in group order for a grammar debrief from a push", ...);   // asked, library, follow_up, outcome, pipeline positions 0..n; analyzer parser, status pending
it("form suggestions start accepted, parser suggestions start pending", ...);
it("a held ask matched at 1.0 proposes okay for an unmarked question and carries match.number", ...);
it("an unmatched ask gets newQuestion with the chosen bank key and Said as the say", ...);
it("a held ask on an unfilled bank question with Said proposes a library answer for that question_key", ...);
it("Landed with a bold title proposes a library story; a title matching an item at 0.6 proposes append", ...);
it("Waiting becomes a follow-up 'Follow up on Recruiter screen' dated followUpDays after the interview", ...);
it("Next round proposes a move to the next non-skipped stage kind; rejected and withdrawn propose closes; no later stage proposes no move", ...);
it("a quote inside Why is kept only when the transcript holds it, else dropped with quote_not_found; with no transcript the quote is dropped without a warning", ...);
it("a second ingest supersedes pending suggestions of the same debrief and of earlier debriefs on the stage", ...);
it("a suggestion whose fingerprint matches an accepted or rejected one on the job is dropped", ...);
it("a question asked again in a later round is proposed again because the stage id is in the fingerprint", ...);
it("re-saving the form supersedes its own accepted but unapplied rows and inserts the retyped ones", ...);
it("pushing the same debrief as a file after the form was accepted proposes nothing", () => expect(result.created).toBe(0));
it("an unstaged push is ingested with stage_id null and no move suggestion", ...);
it("a transcription row (uploading, artifact_id null) is filled in by the first ingest for its key", ...);
it("a version with no grammar and under 200 characters creates a debrief row with analyzer null and no suggestions", ...);
it("never throws: a failing prep port leaves the version written and returns zero counts", ...);
it("status updated with a changed stage runs a full ingest again", ...);
it("writes one [debrief] log line with the debrief id, counts per kind, the analyzer and codes, and no transcript text, quote or name", ...);   // log spy with a sentinel string in the notes
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/debrief-payload.test.ts tests/integration/debrief-ingest.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `ingestDebrief`**

Follow spec 5.4 in order: (1) find or create the debrief row (by `artifact_id`, else the open upload row for the key, else insert with `input` from `via`, `occurred_at` the stage's `scheduled_at` else `now`, status `ready`); (2) parse; set `rating`, set the row `analyzer` to `parser` when there is grammar content; (3) supersede pending suggestions of this debrief and of earlier debriefs on the same stage (same document key when the stage is null), and for `via: "form"` also the accepted, unapplied `form` rows of this document; (4) fingerprint each candidate (asked: the match's question key; library: the title; follow_up: the text; outcome: the summary; pipeline: `${action}:${kind ?? reason}`); (5) drop candidates matching an `accepted` or `rejected` fingerprint on the job, after step 3; (6) insert in group order with positions continuing from `maxPosition + 1`, status `accepted` with `decided_at` for `form`, else `pending`. Ask candidates come from `listBankQuestions` plus `listLibraryItems` items with a `question_key`. The whole body runs inside `tx.transaction` with a try/catch that logs `[debrief] ingest_failed` and returns zeros. `attention.followUpDays` comes from the profile preferences, the time zone from the profile. Each call logs one `[debrief]` line through a small `logDebrief` helper (id, counts per kind, analyzer, codes) and nothing else.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/debrief-payload.test.ts tests/integration/debrief-ingest.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/debrief tests
git commit -m "feat(debrief): ingest every debrief version into suggestions"
```

**Acceptance:** (1) ingest runs for push, paste, form, edit and transcription origins and never fails a save (spec 5.4, 6); (2) supersede and fingerprint rules hold across two debriefs, with the stage id letting a later round propose again (spec 5.4); (3) form suggestions start accepted, others pending (spec 5.4 step 5); (4) an unfilled bank question answered in the room becomes a library answer proposal (spec 5.7); (5) a quote is kept only when found in the transcript (spec principle 27).

### Task 9: Save paths, stage choice, keys

**Files:**
- Create: `lib/debrief/save.ts`
- Test: `tests/integration/debrief-save.test.ts`, `tests/unit/debrief-default-stage.test.ts`

**Interfaces:**
- Consumes: `writeManualVersion` (Task 6), `applyUpserts` (existing), `renderDebrief`, `composeBody`, `quickFormSchema` (Task 3), `debriefKeyFor` (Task 2), `matchStageRef`
- Produces: `saveDebriefDocument`, `appendTranscript`, `setDebriefStage`, `defaultDebriefStage` (Contract)

- [ ] **Step 1: Write the failing tests**

```ts
// debrief-default-stage.test.ts (fixed clock)
it("picks the latest stage whose scheduled_at has passed with no debrief", ...);
it("falls back to the current stage, and never offers Saved or Applied", ...);
it("returns null when only Saved and Applied qualify", ...);
// debrief-save.test.ts
it("a form save writes a manual version titled 'Debrief: Recruiter screen' under key debrief-recruiter-screen and ingests as form", ...);
it("a text-only save writes origin pasted; text without a grammar heading sits under ## Transcript", ...);
it("form plus text writes one version, form first", ...);
it("a second form save for the same stage edits the same document, same key, one debrief row", ...);
it("another stage with the same label gets key -2", ...);
it("below: true puts the form sections above the existing text as a new forked version", ...);
it("empty form and empty text returns empty; text over 1 MiB returns too_large; Saved stage returns stage_not_allowed; a stage of another job returns stage_not_found", ...);
it("appendTranscript adds ## Transcript to the latest version as a new version and the debrief row stays one", ...);
it("a generated transcript's title says transcribed", ...);
it("setDebriefStage patches the stage with no new version and re-ingests", ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/debrief-default-stage.test.ts tests/integration/debrief-save.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`saveDebriefDocument` runs in one `s.transaction`: validate the stage (`kind` not `saved` or `applied`), find an existing debrief document for the stage (latest `debrief` artifacts of the job whose `stageId` matches) and reuse its key, else `debriefKeyFor`. Form present: `writeManualVersion` with `via: "form"` (and `fork: true` when `below`). Text only: `applyUpserts` with origin `pasted`. `appendTranscript` builds the new body (latest body, blank line, `## Transcript`, blank line, text; a second transcript appends after the first, separated by a blank line) and calls `applyUpserts` with origin `generated` (title `Debrief: <label> (transcribed)`) or `pasted` (title kept). `setDebriefStage` calls `applyUpserts` with the same body, origin `pasted`, the new stage id, which plans `updated` and runs the hook.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/debrief-default-stage.test.ts tests/integration/debrief-save.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/debrief tests
git commit -m "feat(debrief): save a debrief from the form or pasted text"
```

**Acceptance:** (1) the form saves as `manual`, a paste as `pasted`, a transcript as `generated` with "transcribed" in its title (spec 5.1); (2) the key is `debrief-<stage label slug>` with `-2` for a clash (spec 5.1); (3) the default stage rule and "Saved and Applied are never offered" (spec 5.1); (4) a pasted file over 1 MiB is refused.

### Task 10: Review library

**Files:**
- Create: `lib/debrief/review.ts`
- Test: `tests/integration/debrief-review.test.ts`

**Interfaces:**
- Consumes: scoped helpers (Task 1), payload schemas (Task 8), `currentMarks` (Task 5)
- Produces: `loadReview`, `decideSuggestion`, `decideGroup`, `editSuggestion`, `setOccurredAt`, `markReviewed`, the view types (Contract)

- [ ] **Step 1: Write the failing tests**

```ts
it("loadReview covers the whole document: suggestions of every debrief row with the same job and artifact_key, superseded ones left out", ...);
it("groups come in the order asked, library, follow_up, outcome, pipeline with live mark and next action", ...);
it("decide accept and reject write status and decided_at at once; reset returns to pending", ...);
it("a decision on an applied suggestion returns already_applied", ...);
it("decideGroup accepts every pending row of the group and counts them", ...);
it("editSuggestion stores edited_payload, accepts, and rejects an invalid payload without changing the row", ...);
it("an edit that changes the outcome and the markTo is stored exactly as sent", ...);   // the server validates; the dialog moves markTo with proposeMark
it("setOccurredAt moves every row of the document; markReviewed sets reviewed_at and leaves pending rows pending", ...);
it("another user's debrief id is not_found", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/debrief-review.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`editSuggestion` validates the whole edited payload with the kind's Zod schema and stores it as sent; the edit dialog (Task 15) moves `markTo` with `proposeMark` when the outcome changes, and "Leave the mark" sends `markTo: null`. Accept and Reject write nothing else. `source` is `From your quick form` for `input` `form`, else `From your debrief`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/debrief-review.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/debrief tests
git commit -m "feat(debrief): review loader and decisions"
```

**Acceptance:** (1) one review covers the whole document (spec 5.7); (2) a decision persists at once and survives a reload (spec 5.7); (3) an edit is stored as `edited_payload` and validated by the same Zod schema (spec 5.7).

### Task 11: Bank append and next action composition

**Files:**
- Create: `lib/prep/bank-append.ts`, `lib/debrief/next-action.ts`
- Test: `tests/unit/bank-append.test.ts`, `tests/integration/bank-append-write.test.ts`, `tests/unit/debrief-next-action.test.ts`

**Interfaces:**
- Consumes: `writeManualVersion` (Task 6), `parseQuestionHeading` (Task 2), `formatDebriefDate`, `ASKED_BANK_KEY`, `ASKED_BANK_TITLE`, `zonedAt`, `addZonedDays`
- Produces: `buildAskedSection`, `highestQuestionNumber`, `chooseBank`, `appendAskedToBank`, `composeNextAction` (Contract; `appendAskedToBank` takes no previewed version, see below)

The spec's three-way merge of the approved change onto a newer bank reduces to appending to the latest body: the change is an addition at the end, and the spec places the other side's end additions first. A test with a latest version that edited a middle line and also added lines at the end proves it, so no call into `lib/compare/merge` is needed.

- [ ] **Step 1: Write the failing tests**

```ts
it("builds the section with heading, note and a block per question numbered from the start number", () => {
  const md = buildAskedSection({ dateLabel: "3 Nov 2026", stageLabel: "Recruiter screen", startNumber: 31, joinExisting: false, questions: [
    { question: "How do you decide what not to build?", spine: "evidence first", say: "I cut by evidence.", stageLabel: "Recruiter screen" },
    { question: "What is your notice period?", spine: null, say: null, stageLabel: "Recruiter screen" } ] });
  expect(md).toContain("## Asked on 3 Nov 2026, add to the bank\n\nFrom the Recruiter screen debrief.");
  expect(md).toContain('### 31. "How do you decide what not to build?"');
  expect(md).toContain("**Say:** I cut by evidence.");
  expect(md).toContain("**Why:** Asked in the Recruiter screen; it held up.");
  expect(md).toContain('### 32. "What is your notice period?" ⚠️');
  expect(md).toContain("**Why:** Asked in the Recruiter screen. Write the Say block.");
  expect(md).not.toContain("**Say:**\n");
});
it("joinExisting omits the heading and note", ...);
it("highestQuestionNumber reads ### N. headings and returns 0 for none", ...);
it("the section parses back through Prep's parser: the unfilled row is flagged, the filled one has an answer", ...);   // uses lib/prep/parse.ts
it("chooseBank prefers the bank on the next interview stage, then the debriefed stage, then the most recently updated bank, then asked-questions", ...);
it("appendAskedToBank forks a manual version with the section, numbers from the latest highest N plus one, and Prep reparses it keeping marks", ...);
it("joins an existing section when the latest bank already ends under the same heading", ...);
it("a latest version that changed a middle line and added lines at the end keeps both and puts our section last", ...);
it("creates the asked-questions document when no bank exists and the key is asked-questions; any other missing key returns bank_gone", ...);
// next action
it("joins follow-ups in date order with '; ' and puts the current action last when it is not among them", ...);
it("undated follow-ups count as tomorrow; the date is 09:00 in the profile zone on the earliest due day, or the current action's date when earlier", ...);
it("cuts at 300 characters keeping whole items and appends '(+2 more in the debrief)'", () => expect(r.text.length).toBeLessThanOrEqual(300));
it("skips the current action when it equals an accepted follow-up ignoring case", ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/bank-append.test.ts tests/integration/bank-append-write.test.ts tests/unit/debrief-next-action.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

The warning marker is `⚠️` after one space following the closing quote. `chooseBank` reads the job's latest `question_bank` versions and stage order from `tx.stage.listForOpportunity`; "next interview stage" is the next stage by position after the debriefed one whose kind is in `INTERVIEW_KINDS` and whose status is not `skipped`. `appendAskedToBank` always writes through `writeManualVersion({ fork: true })` on the latest body. `composeNextAction` cut rule: add items while `joined + " (+N more in the debrief)"` still fits in 300 characters, N counting the dropped items; the suffix is added only when something was dropped.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/bank-append.test.ts tests/integration/bank-append-write.test.ts tests/unit/debrief-next-action.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(prep): append asked questions to a bank; compose the debrief next action"
```

**Acceptance:** (1) the section, the marker and the numbering follow spec 5.8 and parse back through Prep's parser (spec 5.8); (2) a bank write is a forked, edited version and Prep's reparse keeps marks (spec 5.8 decision); (3) the next action composition, the 09:00 rule and the 300-character cut (spec 5.8).

### Task 12: `applyDebrief`

**Files:**
- Create: `lib/debrief/apply.ts`
- Test: `tests/integration/debrief-apply.test.ts`

**Interfaces:**
- Consumes: `upsertAsked` (Task 5), `setJobMark`, `createLibraryItem`, `appendLibraryItem` (Task 5), `appendAskedToBank`, `chooseBank` (Task 11), `composeNextAction` (Task 11), `setNextAction`, `moveOpportunity`, `closeOpportunity`, `appendStageOutcome`, `recordDebriefApplied` (Task 7), `loadReview` neighbors (Task 10), `formatDebriefDate`
- Produces: `applyDebrief` (Contract)

- [ ] **Step 1: Write the failing tests**

```ts
it("the Milestone 25 scenario: one held, one missed and one new question, a follow-up and next round", async () => {
  // quick form saved for a Recruiter screen debrief; bank has the held and missed questions, marks unmarked and okay
  const r = await applyDebrief(s, debriefId, NOW);
  expect(r).toMatchObject({ ok: true, data: { counts: { marks: 2, asked: 3, newQuestions: 1, followUps: 1, notes: 1, moves: 1 }, nextActionSet: true } });
  // marks: held unmarked -> okay, missed okay -> shaky; drill_count 0
  // bank: a new manual version whose body ends with "## Asked on 3 Nov 2026, add to the bank" and a row flagged unfilled
  // next action: text "Send the case study", at 09:00 on 2026-11-04 in the profile zone
  // stage outcome_md starts "Debrief 3 Nov 2026: 4 of 5."
  // job current stage kind is hiring_manager; exactly one debrief_applied event with meta.counts
});
it("a second Apply finds nothing unapplied, writes nothing and writes no second event", ...);
it("pushing the same debrief as a file afterwards proposes nothing", ...);
it("a deleted bank skips the new-question row with bank_gone, applies the rest, and a retry after the bank returns applies it", ...);
it("a closed job skips moves and closes with closed and applies the rest", ...);
it("a move to the column the job is already in is a no-op without an error", ...);
it("a latest bank version newer than the one the review showed keeps its changes and ends with our section", ...);
it("an unexpected error halfway rolls back every row: no asked row, marks as before, suggestions unapplied, no event", ...);   // spy appendStageOutcome to throw
it("requires a stage: a debrief with stage_id null returns stage_required", ...);
it("uses edited_payload over payload and skips an edited payload that no longer validates with invalid", ...);
it("library create and append items are applied through lib/library with source job and artifact", ...);   // it.skipIf(no library)
it("two accepted follow-ups and the current action compose one next action cut at 300", ...);
it("applying a document with two debrief rows (form saved before its transcript arrived) applies both rows' accepted suggestions in position order", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/debrief-apply.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `applyDebrief`**

One `s.transaction`: lock the opportunity (`lockById`), then the document's debrief rows (`lockForDocument`), require the latest row's stage, walk accepted unapplied suggestions in (row `created_at`, `position`) order. `asked`: `upsertAsked` (`askedAt` from the row's `occurred_at`), `setJobMark` when `markTo` is set (`marked_at` now), collect `newQuestion` by `bankKey`. `library`: create or append (an append whose item is gone gets `invalid`). Then one `appendAskedToBank` per bank key (a `bank_gone` marks that bank's rows with the code and leaves them unapplied), then `setNextAction` from `composeNextAction`, then `appendStageOutcome` with the block `Debrief {date}: {rating} of 5.` plus the summary, then pipeline rows through `moveOpportunity` or `closeOpportunity` (`closed` maps to `apply_error` `closed`; `not_found` to `stage_gone`; `same_stage` and `same_column` count as applied with no move). Set `applied_at` on applied suggestions and on every row of the document, write the event through `recordDebriefApplied`, return the outcome. An exception is not caught: the transaction rolls back.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/debrief-apply.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/debrief tests
git commit -m "feat(debrief): apply accepted suggestions in one transaction"
```

**Acceptance:** (1) the Done-when scenario passes end to end on PGlite (spec 9); (2) Apply writes through each owner inside one transaction and a failure rolls everything back (spec 5.8, 6); (3) a second Apply writes nothing (spec 5.8); (4) a gone target skips its row with its code and the rest apply (spec 5.8, 6); (5) a re-push of the debrief proposes nothing (spec 9).

### Task 13: Delete, export, messages and copy

**Files:**
- Create: `lib/debrief/delete.ts`, `lib/debrief/messages.ts`, `lib/debrief/copy.ts`
- Modify: `lib/export/collect.ts` (`debriefs`, `debriefSuggestions`, `askedQuestions`; `EXPORT_VERSION` + 1 once for the whole cycle, marked `// bumped by the Debrief cycle`)
- Test: `tests/integration/debrief-delete.test.ts`, `tests/integration/export.test.ts` (new cases), `tests/unit/debrief-messages.test.ts`

**Interfaces:**
- Consumes: `deleteDebriefDocument` (Task 7), scoped `listAll` helpers (Task 1)
- Produces: `deleteDebrief`, `debriefMessageFor(code)`, the binding copy constants as one exported object `DEBRIEF_COPY` (every string in the README "Binding copy" section, functions for the counted ones)

- [ ] **Step 1: Write the failing tests**

```ts
it("deleteDebrief removes every version, the debrief rows and their suggestions, and keeps asked_question rows with debrief_id null", ...);
it("deleteDebrief of another user's debrief is not_found", ...);
it("the export lists debriefs, debriefSuggestions and askedQuestions for this user only and raises the version by one", ...);
it("debriefMessageFor covers every code and no message contains an exclamation mark", ...);
it("DEBRIEF_COPY has no exclamation mark and pluralizes 'Apply 1 change' and 'Apply 6 changes'", ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/debrief-delete.test.ts tests/integration/export.test.ts tests/unit/debrief-messages.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`deleteDebrief` resolves the row's `artifact_key` in a transaction and calls `deleteDebriefDocument`; the FK cascade removes `debrief` rows (through `artifact_id`) and suggestions. It leaves a clearly named seam, `removeAudioForDocument(tx, debriefIds)`, as a no-op that Milestone 28 fills. Run `git grep "bumped by the Debrief cycle"` before editing the export: bump only when no other task of this cycle has.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/debrief-delete.test.ts tests/integration/export.test.ts tests/unit/debrief-messages.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(debrief): delete a debrief, export additions and message copy"
```

**Acceptance:** (1) delete removes the transcript's document and keeps the user's own asked record (spec 5.1); (2) export adds the three tables and raises its version by one (spec 4); (3) no copy string has an exclamation mark.

### Task 14: Actions and routes

**Files:**
- Create: `app/(app)/jobs/[slug]/debrief/new/page.tsx`, `app/(app)/jobs/[slug]/debrief/[id]/page.tsx`, `app/(app)/jobs/[slug]/debrief/actions.ts`
- Test: `tests/integration/debrief-actions.test.ts`

**Interfaces:**
- Consumes: Tasks 9, 10, 12, 13; `requireUser`, `scopedFor`, `getJobView`; the test harness pattern of `tests/integration/document-actions.test.ts` (mocked `requireUser`, `next/cache`, `scopedFor`)
- Produces: server actions `saveDebriefAction(opportunityId, _prev, formData)`, `decideSuggestionAction(debriefId, suggestionId, decision)`, `acceptGroupAction(debriefId, kind)`, `editSuggestionAction(debriefId, suggestionId, payload)`, `applyDebriefAction(debriefId)`, `markReviewedAction(debriefId)`, `deleteDebriefAction(debriefId)`, `setDebriefStageAction(debriefId, stageId)`, `setOccurredAtAction(debriefId, isoString)`; the two pages

- [ ] **Step 1: Write the failing tests**

```ts
it("every action calls requireUser and rejects a non-uuid id before it reaches SQL", ...);
it("saveDebriefAction with an empty form and empty text returns 'Fill in the form or paste some text first.'", ...);
it("saveDebriefAction saves, returns the debrief id, and revalidates the job page, the debrief page and Home", ...);
it("applyDebriefAction returns counts and skipped rows with their reason words", ...);
it("another user's ids return not_found messages and change nothing", ...);
it("deleteDebriefAction returns the job slug so the client can leave the page", ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/debrief-actions.test.ts`
Expected: FAIL, actions file does not exist.

- [ ] **Step 3: Implement actions and pages**

Read `node_modules/next/dist/docs/` for the route and `PageProps` helpers before writing the pages. The entry page loads the job (`getJobView`), the stages, the set of stage ids that already have a debrief (latest `debrief` artifacts), `defaultDebriefStage` for the `?stage=` default, and `listBankQuestions` for the combobox; it returns `notFound()` for a job outside the user's scope. The review page loads `loadReview` and renders `notFound()` when it fails. Actions follow `document-actions.ts`: Zod-parse ids with `z.uuid()`, take `Result`, map codes through `debriefMessageFor`, and `revalidatePath` `/jobs/${slug}`, the debrief path and `/`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/debrief-actions.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/jobs/[slug]/debrief" tests
git commit -m "feat(debrief): entry and review routes with server actions"
```

**Acceptance:** (1) `requireUser()` in every page and action (spec 3); (2) a debrief saves from `/jobs/[slug]/debrief/new?stage=<id>` and opens `/jobs/[slug]/debrief/[id]` (spec 5.1); (3) ids are validated before SQL.

### Task 15: Components: quick form, notes field, review, apply bar

**Files:**
- Create: `components/debrief/quick-form.tsx`, `components/debrief/notes-field.tsx`, `components/debrief/debrief-entry.tsx`, `components/debrief/suggestion-row.tsx`, `components/debrief/suggestion-group.tsx`, `components/debrief/edit-suggestion-dialog.tsx`, `components/debrief/apply-bar.tsx`, `components/debrief/review-header.tsx`, `components/debrief/delete-debrief-dialog.tsx`, `components/debrief/stage-picker.tsx`
- Modify: `docs/design-system.md` ("New application code": suggestion row, apply bar)
- Test: `tests/unit/debrief-quick-form.test.tsx`, `tests/unit/debrief-suggestion-row.test.tsx`, `tests/unit/debrief-apply-bar.test.tsx`

**Interfaces:**
- Consumes: `DEBRIEF_COPY` (Task 13), actions (Task 14), `quickFormSchema` (Task 3), registry `detail-view-shell`, `section-header`, `field-row`, `empty-state`; `base-nova` `radio-group`, `combobox`, `toggle-group`, `textarea`, `dialog`, `sheet`; `useAnnounce` (`components/live-announcer.tsx`)
- Produces: the components named above

- [ ] **Step 1: Write the failing tests**

```tsx
it("the quick form shows the rating words 1 Rough to 5 Great as one radio group and disables 'Add a follow-up' at six with 'Six follow-ups at most.'", ...);
it("picking a bank question and adding a free-text question both produce rows with Held, Wobbled and Missed", ...);
it("the notes field reads a .vtt file in the browser and fills the text area; a file over 1 MiB shows the limit and does not fill", ...);
it("submitting an empty page shows the empty-submit message and moves focus to it", ...);
it("a suggestion row shows the ask line, match or 'Not in your bank', 'Check this match' for low_match, and the mark effect", ...);
it("a, e and r act on the focused row; Accept and Reject are in tab order", ...);
it("the apply bar reads 'Apply 1 change' and 'Apply 6 changes', is disabled at 0, and announces 'Applied 6 changes' through the live region", ...);
it("the edit dialog offers a combobox of the job's questions plus 'Not in the bank', the outcome toggle, 'Leave the mark', and the new question's text, Spine, Say and bank", ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/debrief-quick-form.test.tsx tests/unit/debrief-suggestion-row.test.tsx tests/unit/debrief-apply-bar.test.tsx`
Expected: FAIL, components do not exist.

- [ ] **Step 3: Implement the components**

Forms submit through `submitViaTransition` with a try/catch and toast for the rejected path, focus fallback through `lib/dom/focus.ts`. Phone: rows stack with full-width buttons; the apply bar sits above the bottom navigation with `pb-safe`. Render suggestion text as text nodes only. Radio words and labels come from `DEBRIEF_COPY`. A grouped "Accept all" per group. Keyboard shortcuts register on the row, never globally, and are added to the shortcuts sheet entry list. Styles use semantic tokens only; run `pnpm check:tokens`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/debrief docs/design-system.md tests/unit
git commit -m "feat(debrief): quick form, notes field, review rows and apply bar"
```

**Acceptance:** (1) the form matches spec 5.2 including the one-word-per-value rating and the six follow-up cap; (2) review rows, groups, Accept all, the sticky bar and `a`, `e`, `r` match spec 5.7; (3) every new piece is in `docs/design-system.md` with its reason (spec 10).

### Task 16: Debriefs block and stage sheet link

**Files:**
- Create: `components/debrief/debriefs-block.tsx`, `lib/debrief/list.ts`
- Modify: `components/job/tab-prep.tsx` (render the block above the document list), `components/job/stage-detail-sheet.tsx` (a "Debrief this interview" link for interview stages; adds a `slug` prop to `StageDetailSheetProps`), `components/job/stage-stepper.tsx` (passes `slug` through), `app/(app)/jobs/[slug]/page.tsx` (loads the block data)
- Test: `tests/integration/debrief-list.test.ts`, `tests/unit/debriefs-block.test.tsx`, `tests/unit/stage-detail-sheet.test.tsx` (new case)

**Interfaces:**
- Consumes: scoped debrief helpers, `INTERVIEW_KINDS`
- Produces: `listDebriefRows(s, opportunityId): Promise<{ stageId: string; stageLabel: string; stageKind: StageKind; scheduledAt: Date | null; latestDebriefId: string | null; state: "none" | "pending" | "applied" | "reviewed"; toReview: number; appliedAt: Date | null }[]>` over the job's past interview stages

- [ ] **Step 1: Write the failing tests**

```ts
it("lists each past interview stage with 'Debrief' when none exists, '4 to review' when 4 suggestions wait, 'Applied 3 Nov' after Apply", ...);
it("never lists Saved, Applied or a future stage", ...);
it("the stage sheet shows 'Debrief this interview' for an interview stage and links to /jobs/<slug>/debrief/new?stage=<id>; Saved and Applied show none", ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/debrief-list.test.ts tests/unit/debriefs-block.test.tsx tests/unit/stage-detail-sheet.test.tsx`
Expected: FAIL, helper and block do not exist.

- [ ] **Step 3: Implement**

`state` derives from the latest debrief row of the stage: pending or unapplied accepted rows give `toReview`; `applied_at` gives `applied`. Dates through `LocalTime`. The Prep tab shows the block only when the job has at least one past interview stage.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/debrief-list.test.ts tests/unit && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components lib app tests
git commit -m "feat(debrief): Debriefs block on the Prep tab and a link in the stage sheet"
```

**Acceptance:** (1) the block lists past interview stages with their debrief state (spec 5.9); (2) "Debrief this interview" is in the stage sheet (spec 3 module map, 5.1); (3) Saved and Applied are never offered (spec 5.1).

### Task 17: End to end, docs and ship

**Files:**
- Create: `tests/e2e/debrief-setup.ts` (creates a job through the add dialog, pastes a question bank through the paste dialog, schedules the Recruiter screen in the past through the stage sheet, returns the slug), `tests/e2e/debrief-form.spec.ts`, `tests/e2e/debrief-push.spec.ts`
- Modify: `playwright.config.ts` (a `debrief-chromium`, `debrief-webkit`, `debrief-phone` chain, each depending on the last project of the previous chain and on the one before it in this chain; `testMatch` `/debrief-(form|push)\.spec\.ts$/`), `README.md` (a Debrief section), `docs/design-system.md`, `.env.example` (nothing new in this milestone)
- Test: the two specs

**Interfaces:**
- Consumes: `login`, `uniqueName`, `addJobAndOpen` (`tests/e2e/session.ts`), `scanForViolations` (`tests/e2e/axe.ts`), `scanOpenOverlay`, `runCli` (`tests/e2e/cli.ts`)
- Produces: the Playwright chain

- [ ] **Step 1: Write the failing specs**

```ts
test("a quick-form debrief from the stage sheet shows its suggestions, Apply changes marks, adds an Asked-on bank section, sets the next action, appends notes and moves the job", async ({ page }, testInfo) => {
  // setup: job with a bank holding two questions, Recruiter screen scheduled yesterday
  // open the stage sheet, click "Debrief this interview", fill rating 4, pick the held question (Held), pick the other (Missed),
  // add "What is your notice period?" as a new question (Held, with Said), add a follow-up due next week, choose Next round, Save debrief
  // review shows the three asks, the follow-up, the notes block, "Move to Hiring manager"; press Apply
  // assert "Applied 6 changes" in the live region; Prep tab shows a new bank version with "Asked on" and the unfilled marker row;
  // the job header shows the Hiring manager stage and the next action text
  await scanForViolations(page, "debrief review", testInfo);
});
test("the same debrief pushed as a file afterwards proposes nothing", async ({ page }, testInfo) => { /* CLI push of a grammar file; review page or Debriefs block shows no new rows */ });
test("a pasted debrief with a stage frontmatter that matches nothing asks 'Which interview was this?'", ...);   // uses the real fixture nwl-debrief-round2.md content
test("keyboard only: Tab reaches the first suggestion row, a accepts it, r rejects the next, e opens Edit, and Apply is reachable without a pointer", ...);
test("phone: the review page and the apply bar do not scroll sideways at 390px", ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm test:e2e --project=debrief-chromium`
Expected: FAIL until every task above is merged (this task runs last), then the specs are the red-green check for wiring problems.

- [ ] **Step 3: Wire the chain, fix what the specs find, update docs**

The `debrief-*` chain runs after the earlier chains and one engine at a time, because the specs change the shared account's marks and next actions. README gets a "Debrief" section: the three ways in, the grammar headings in one table, and "nothing applies itself". `docs/design-system.md` lists the quick form, suggestion row and apply bar under "New application code".

- [ ] **Step 4: Run the full suite and the preview check**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`
Expected: PASS in Chromium, WebKit and the phone project. Then deploy the branch preview, open it in Chrome and Safari at desktop width and at 390 px, and walk one fictional recruiter screen through the form and Apply by hand. Record the preview link in the pull request.

- [ ] **Step 5: Commit**

```bash
git add tests playwright.config.ts README.md docs
git commit -m "test(debrief): end to end quick form, push and phone specs"
```

**Acceptance:** (1) the Done-when sentence passes as a Playwright spec in Chromium and WebKit (spec 9); (2) axe is clean on the entry and review routes in light and dark (spec 8); (3) nothing scrolls sideways at 390 px (spec 5.7); (4) the pull request asks the owner whether the debrief skill can write the section 5.2 headings (spec 11, item 1).
