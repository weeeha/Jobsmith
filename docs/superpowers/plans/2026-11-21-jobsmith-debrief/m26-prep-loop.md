# Milestone 26: Prep loop

> Done when: "After the Milestone 25 debrief, the hub shows the chip, the next Drill opens on the missed question, Home's next interview item says '1 question missed last round', and one drill of that question removes the line"

Branch: `feat/m26-prep-loop`, cut from `main` once Milestone 25 is merged.

**Before starting:**

```bash
test -f lib/debrief/apply.ts && test -f lib/prep/asked.ts && echo m25-ok       # absent: stop, build Milestone 25 first
test -f lib/prep/order.ts && echo prep-8-ok                                   # Drill ordering; absent: Tasks 19 and 25's drill step wait
test -d lib/library && echo prep-9-ok                                         # absent: Task 22 and the "Answer in Library" chip wait
test -f lib/artifacts/carry.ts && echo apply-22-ok                            # absent: skip Task 24
grep -rn "research" lib/attention/copy.ts lib/attention/items.ts | head       # which interview lines exist today (Apply 23, Prep 6)
pnpm install && pnpm typecheck && pnpm test
```

Open `lib/attention/copy.ts` and write down, in the first task report, which lines the interview item's meta already carries ("No research yet" exists in Core; "Research is N days old" arrives with Apply milestone 23; "No prep yet" and the confidence summary arrive with Prep milestone 6). Task 21 inserts the missed line at its fixed position among whichever of them exist.

### Task 18: `lib/prep/asked.ts` reads

**Files:**
- Modify: `lib/prep/asked.ts` (from Milestone 25 Task 5: reads), `lib/db/scoped/asked-question.ts` (`listLatestForOpportunity`, `listOtherCompanyAsks`, `listHistory`, `listLatestAll`), `lib/debrief/prep-port.ts` (`listAnswerableByOpportunity`, `lastDrilledByOpportunity`)
- Test: `tests/integration/asked-reads.test.ts`

**Interfaces:**
- Consumes: `askedQuestion` scoped helper, Prep's `prep_question` (`has_answer`, latest version of each bank) and `prep_mark` (`last_drilled_at`) through the port
- Produces:
  ```ts
  export type LatestAsk = { questionKey: string; stageId: string | null; stageLabel: string | null; outcome: AskOutcome; askedAt: Date; askedText: string };
  export async function latestAsks(s: Scoped, opportunityId: string): Promise<Map<string, LatestAsk>>;
  export async function otherCompanyCounts(s: Scoped, opportunityId: string, keys: string[]): Promise<Map<string, number>>;
  export type MissedTier = { missed: string[]; wobbled: string[] };       // question keys, oldest ask first
  export async function missedTierKeys(s: Scoped, opportunityId: string): Promise<MissedTier>;
  export async function missedCounts(s: Scoped): Promise<Map<string, number>>;   // opportunity id to tier size, active jobs only
  export type AskedHistoryRow = { opportunityId: string; slug: string; companyName: string; roleTitle: string; stageLabel: string | null; askedAt: Date; outcome: AskOutcome };
  export async function askedHistory(s: Scoped, questionKey: string): Promise<AskedHistoryRow[]>;   // newest first
  ```

- [ ] **Step 1: Write the failing tests**

```ts
it("latestAsks keeps the newest ask per question key across two stages of one job", ...);
it("otherCompanyCounts counts distinct other companies, not jobs, and never the job's own company", ...);
it("the tier holds a question with an answer whose latest ask is missed and that was not drilled since", ...);
it("a question drilled after the ask leaves the tier; one drilled before the ask stays", ...);   // last_drilled_at later than asked_at removes it
it("wobbled questions follow missed ones; each list is oldest ask first", ...);
it("a missed question with no answer in the bank is not in the tier", ...);
it("missedCounts covers active jobs only and sums the tier per job", ...);
it("askedHistory lists every job's ask for a key, newest first, with company, stage label and outcome", ...);
it("another user's asks never appear in any read", ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/asked-reads.test.ts`
Expected: FAIL, the read functions do not exist.

- [ ] **Step 3: Implement the reads**

The tier rule is one pure function over rows, `tierFrom({ asks, answerable, lastDrilled })`, so Task 19 and Home share it. A question is in the tier when its key is in `answerable` for that job, its latest ask has outcome `missed` or `wobbled`, and `lastDrilled.get(key)` is absent or earlier than the ask's `askedAt`. `missedCounts` loads every latest ask once and groups in memory (one query per table, no per-job loop).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/asked-reads.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(prep): read asked questions for the hub, Drill, Home and the Library"
```

**Acceptance:** (1) the tier rule matches spec 5.9 (latest ask in this job, not drilled since, with an answer); (2) "Asked at N other companies" counts other jobs' rows with the same key (spec 5.9); (3) reads are scoped to the user (spec 7).

### Task 19: Drill's missed tier

**Files:**
- Modify: `lib/prep/order.ts` (from 2026-11-21-jobsmith-prep milestone 8: `withMissedTier`, `missedOnly`), the Drill route and its session start (`app/(app)/jobs/[slug]/drill/page.tsx` from 2026-11-21-jobsmith-prep milestone 8) to read `?missed=1` and pass the tier
- Test: `tests/unit/prep-order-missed.test.ts`, `tests/integration/drill-missed.test.ts`

**Interfaces:**
- Consumes: `MissedTier`, `missedTierKeys` (Task 18), Prep's existing drill ordering function (name recorded in the task report)
- Produces: `withMissedTier<T extends { questionKey: string }>(ordered: T[], tier: MissedTier): T[]`, `missedOnly<T extends { questionKey: string }>(ordered: T[], tier: MissedTier): T[]`

- [ ] **Step 1: Write the failing tests**

```ts
it("withMissedTier puts missed keys first, then wobbled, each oldest first, and leaves the rest in Prep's order", () => {
  const ordered = ["a", "b", "c", "d", "e"].map((questionKey) => ({ questionKey }));
  expect(withMissedTier(ordered, { missed: ["d", "b"], wobbled: ["e"] }).map((q) => q.questionKey)).toEqual(["d", "b", "e", "a", "c"]);
});
it("missedOnly returns the tier alone, in tier order; an empty tier returns an empty list", ...);
it("a key in the tier that has no row in the session pool is ignored", ...);
it("a session never repeats a question when it is in the tier and in the pool", ...);
// drill-missed.test.ts (PGlite)
it("after the Milestone 25 debrief the next session starts with the missed question", ...);
it("drilling that question (a mark through the drill path) takes it out of the tier, so a miss leads once", ...);
it("/jobs/<slug>/drill?missed=1 drills the tier alone and shows 'Nothing missed since your last drill.' when it is empty", ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/prep-order-missed.test.ts tests/integration/drill-missed.test.ts`
Expected: FAIL, functions do not exist.

- [ ] **Step 3: Implement and wire**

`withMissedTier` stable-partitions: tier keys in tier order, then everything else in its incoming order, no duplicates. Wire it where Prep fixes the session order ("The order is fixed when the session starts", Prep 5.4): load the tier with `missedTierKeys`, apply `withMissedTier`, or `missedOnly` when `missed=1`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/prep-order-missed.test.ts tests/integration/drill-missed.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib app tests
git commit -m "feat(prep): drill starts with the questions missed in the room"
```

**Acceptance:** (1) a first tier of missed, then wobbled questions, oldest ask first, ahead of Prep's order (spec 5.9); (2) `?missed=1` drills that tier alone (spec 5.9); (3) drilling a question after the ask removes it from the tier, so a miss leads once (spec 5.9).

### Task 20: Hub chips

**Files:**
- Create: `lib/prep/hub-asked.ts`, `components/prep/asked-chip.tsx`
- Modify: the hub's question list item (`components/prep/question-list.tsx` from 2026-11-21-jobsmith-prep milestone 6; name recorded in the task report), `components/job/tab-prep.tsx` (loads the asked model), `lib/debrief/prep-port.ts` (nothing new)
- Test: `tests/unit/hub-asked.test.ts`, `tests/unit/asked-chip.test.tsx`, `tests/integration/hub-asked.test.ts`

**Interfaces:**
- Consumes: `latestAsks`, `otherCompanyCounts` (Task 18), `listLibraryItems` (port)
- Produces:
  ```ts
  export type AskedChipModel = { askedLine: string | null; tone: "solid" | "okay" | "shaky" | null; otherCompaniesLine: string | null; answerInLibrary: boolean };
  export async function loadHubAsked(s: Scoped, opportunityId: string, keys: string[]): Promise<Map<string, AskedChipModel>>;
  export function askedChipModel(input: { latest: LatestAsk | null; otherCompanies: number; libraryAnswer: boolean }): AskedChipModel;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
it("askedLine reads 'Asked in Recruiter screen · missed' from the latest ask, tone shaky for missed, okay for wobbled, solid for held, none for unclear", ...);
it("otherCompaniesLine reads 'Asked at 2 other companies' and 'Asked at 1 other company', and is null at 0", ...);
it("answerInLibrary is true when a non-archived answer item holds the question key", ...);
it("the chip row shows 'Answer in Library' in place of the unfilled chip and the bank text is unchanged", ...);   // component test
it("the words carry the meaning: each chip has text and an accessible name, never color alone", ...);
it("a question with no ask shows no asked chip", ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/hub-asked.test.ts tests/unit/asked-chip.test.tsx tests/integration/hub-asked.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

The tone follows the mark chips Prep defined (reuse their variant names). "Answer in Library" is derived at read time and nothing is written to the bank (spec 5.7). Record in `docs/design-system.md` that the chip reuses Prep's mark chip.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration/hub-asked.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib components tests docs
git commit -m "feat(prep): asked chips, other-company counts and Answer in Library on the hub"
```

**Acceptance:** (1) "Asked in Recruiter screen · missed" shows from the latest ask and "Asked at N other companies" from other jobs (spec 5.9); (2) "Answer in Library" replaces the unfilled chip with nothing written to the bank (spec 5.7); (3) the outcome word carries the meaning (spec 5.9).

### Task 21: Home: `debrief_review`, the missed line, rule 5

**Files:**
- Modify: `lib/attention/items.ts` (`AttentionJob.missedToDrill`, `AttentionJob.pendingDebrief`, `AttentionStage.debriefed`, kind `debrief_review`, rule 5 change), `lib/attention/copy.ts` (group title, item copy, primary action), `lib/attention/load.ts` (`loadHome` reads), `lib/db/scoped/debrief.ts` (`listStageIdsWithDebrief`), `lib/db/scoped/debrief-suggestion.ts` (`countOpenByDebrief`), `components/home/attention-item.tsx` and `attention-list.tsx` (render the new kind)
- Test: `tests/unit/attention.test.ts`, `tests/unit/attention-copy.test.ts`, `tests/integration/attention.test.ts`

**Interfaces:**
- Consumes: `missedCounts` (Task 18), existing `attentionItems`, `itemCopy`, `primaryAction`
- Produces:
  ```ts
  export const ATTENTION_KINDS = ["interview", "due", "debrief_review", "follow_up", "saved", "passed"] as const;
  // AttentionJob gains: missedToDrill: number; pendingDebrief: { debriefId: string; stageLabel: string; count: number } | null
  // AttentionStage gains: debriefed: boolean
  // AttentionItem gains: { kind: "debrief_review"; job: AttentionJobRef; debrief: { id: string; stageLabel: string; count: number } }
  // AttentionItem interview variant gains: missedToDrill: number
  ```
  `pendingDebrief` is the newest document of the job (by `occurred_at`) that is `ready`, has no `reviewed_at`, and has at least one pending or accepted-unapplied row; `count` is that number.

- [ ] **Step 1: Write the failing tests**

```ts
it("a ready, unreviewed debrief with open rows gives a debrief_review item after the due items and before follow_up", ...);
it("a reviewed debrief, or one with no open rows, or one not ready gives none", ...);
it("an interview item for a job with missedToDrill 2 carries 'Drill missed' as its action and the line '2 questions missed last round'; 1 reads '1 question missed last round'", ...);
it("the missed line sits after 'No research yet' and 'Research is N days old' and 'No prep yet', and before the confidence summary", ...);   // only the lines that exist today
it("with missedToDrill 0 nothing changes in the interview item", ...);
it("rule 5 leaves out a stage that has a debrief and offers 'Debrief' linking to /jobs/<slug>/debrief/new?stage=<id> for the rest", ...);
it("debrief_review copy reads 'Review the Recruiter screen debrief', '9 suggestions' and '1 suggestion', action 'Review' linking to /jobs/<slug>/debrief/<id>", ...);
it("attentionItems stays one pure function: no clock, no database", ...);
// integration: loadHome fills missedToDrill from the tier and pendingDebrief and debriefed from the rows
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/attention.test.ts tests/unit/attention-copy.test.ts tests/integration/attention.test.ts`
Expected: FAIL, the new fields and kind do not exist.

- [ ] **Step 3: Implement**

Rule 5 (`passed`) filters scheduled stages whose `debriefed` is true. `GROUP_TITLES.debrief_review` is `Debriefs to review`. The interview item's primary action becomes `{ type: "link", label: "Drill missed", href: `${job}/drill?missed=1` }` when the job is researched and `missedToDrill > 0`; an unresearched job keeps "Open research", since research comes first. `loadHome` calls `missedCounts`, `s.debrief.listStageIdsWithDebrief()` and the open-row counts once each.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/attention.test.ts tests/unit/attention-copy.test.ts tests/integration/attention.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib components tests
git commit -m "feat(home): debrief review item, missed line and Debrief action"
```

**Acceptance:** (1) the interview item says "2 questions missed last round" and its action becomes "Drill missed" (spec 5.9); (2) rule 5 leaves out debriefed stages and offers "Debrief" (spec 5.9); (3) `debrief_review` sits after `due` with the fixed copy (spec 5.9); (4) `attentionItems` stays pure (spec 5.9).

### Task 22: Library history

**Files:**
- Create: `components/library/asked-history.tsx`
- Modify: the Library item page (`app/(app)/library/[id]/page.tsx` from 2026-11-21-jobsmith-prep milestone 9; path recorded in the task report)
- Test: `tests/unit/asked-history.test.tsx`

**Interfaces:**
- Consumes: `askedHistory` (Task 18), `LocalTime`
- Produces: `<AskedHistory rows={AskedHistoryRow[]} />`, rendered under the heading "Asked in interviews", rows with company, stage, date and outcome word, each linking to `/jobs/<slug>`; nothing renders for an item with no `question_key` or no asks

- [ ] **Step 1: Write the failing tests**

```tsx
it("lists company, stage label, date and outcome, newest first, each linking to the job", ...);
it("shows nothing for an item with no asks", ...);
it("an ask whose stage was removed shows the company and date with no stage label", ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/asked-history.test.tsx`
Expected: FAIL, component not found.

- [ ] **Step 3: Implement**

Use the registry `table-view` for the list on a desktop width and two-line rows on a phone; dates through `LocalTime`. Add the piece to `docs/design-system.md`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/asked-history.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components app tests docs
git commit -m "feat(library): show where each question was asked"
```

**Acceptance:** (1) an item page lists "Asked in interviews" for its `question_key` with company, stage, date and outcome (spec 5.9).

### Task 23: Context document `## Debriefs`

**Files:**
- Create: `lib/debrief/context.ts`
- Modify: `lib/bridge/context.ts` (`ContextInput.debriefs?`, the section), `lib/bridge/handlers.ts` (loads and passes), `tests/unit/bridge-context.test.ts`
- Test: `tests/unit/bridge-context.test.ts` (new cases), `tests/integration/debrief-context.test.ts`

**Interfaces:**
- Consumes: scoped debrief helpers, `listBankQuestions` (port), the `debrief_applied` event meta `added` (Task 7), `formatDebriefDate`
- Produces:
  ```ts
  export type ContextDebrief = { stageLabel: string; dateLabel: string; rating: number | null; lines: string[]; waiting: number };
  export async function loadContextDebriefs(s: Scoped, opportunityId: string, timeZone: string): Promise<ContextDebrief[]>;   // newest first
  ```

- [ ] **Step 1: Write the failing tests**

```ts
it("renders '### Recruiter screen, 3 Nov 2026 (4 of 5)' and one line per applied ask, 'Q12 missed: How do you decide what not to build?'", ...);
it("renders 'Added to questions-recruiter-screen as 31' from the event meta and '- Follow-up: Send the case study (due 2026-11-04)'", ...);
it("an applied ask with no bank number reads 'Asked, missed: <text>'", ...);
it("renders '3 suggestions waiting for review' for pending and accepted-unapplied rows", ...);
it("carries no transcript text and no quote: a sentinel string in the transcript and in a quote never appears in the document", ...);
it("the instruction line reads: Questions from debriefs sit under `## Asked on` headings in the bank; pull the bank before rewriting it.", ...);
it("the section sits after Prep's Library block when present, else after Prep, else before Artifacts; frontmatter stays context/v1", ...);
it("a job with no debrief gets no Debriefs section", ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/bridge-context.test.ts tests/integration/debrief-context.test.ts`
Expected: FAIL, no `## Debriefs` section.

- [ ] **Step 3: Implement**

`buildContextDocument` stays pure: it receives `debriefs` already shaped. The numbers for `Q12` come from the bank question for the ask's `question_key`; a question added by the debrief appears through the event's `added` list. The loader never selects `body_md` of a debrief version or any suggestion `quote`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/bridge-context.test.ts tests/integration/debrief-context.test.ts tests/integration/bridge-handlers.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(bridge): Debriefs section in the context document"
```

**Acceptance:** (1) per debriefed stage, newest first, with the fixed line shapes (spec 5.11); (2) no transcript text and no quotes (spec 5.11, 7); (3) the frontmatter version stays `context/v1` (spec 5.11).

### Task 24: Carry offer on the Prep tab

**Blocked on:** Apply and Research milestone 22 merged (`lib/artifacts/carry.ts`). Without it, skip this task, say so in the pull request, and leave the unchecked boxes. Everything else in the milestone runs without it.

**Files:**
- Modify: `components/job/tab-prep.tsx` (render the offer above a question bank whose latest version carries the notice), reusing the component and eligibility function Apply milestone 22 added for the Documents tab (names recorded in the task report)
- Test: `tests/unit/prep-carry-offer.test.tsx`, `tests/integration/debrief-carry.test.ts`

**Interfaces:**
- Consumes: Apply's carry offer component, `versionNotice` (`lib/artifacts/plan.ts`), `carryEditsForward` (`lib/artifacts/carry.ts`)
- Produces: the offer on the Prep tab for kind `question_bank` documents

- [ ] **Step 1: Write the failing tests**

```ts
it("shows 'Version 4 was pushed after you edited version 3. Carry your edits into version 4.' above a bank whose latest is pushed after a debrief's forked version", ...);
it("shows nothing above a bank with no notice", ...);
// debrief-carry.test.ts (PGlite): Apply a debrief (forks the bank), push a rewritten bank, call carryEditsForward
it("the carried version holds the Asked on section and the rewrite, with the pre-debrief bank as the merge base", ...);
it("a re-push of the old bank text after Apply reports unchanged, and a changed push carries 'Pushed after you edited version N'", ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/prep-carry-offer.test.tsx tests/integration/debrief-carry.test.ts`
Expected: FAIL, the Prep tab shows no offer.

- [ ] **Step 3: Implement**

Pass the same props the Documents tab passes; the base for the merge is the `source_body_md` that Task 6's `fork` recorded.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/prep-carry-offer.test.tsx tests/integration/debrief-carry.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components tests
git commit -m "feat(prep): offer to carry debrief questions onto a rewritten bank"
```

**Acceptance:** (1) the Prep tab shows the carry offer above a bank carrying the notice (spec 5.8); (2) the section moves onto a rewritten bank with the pre-debrief bank as base (spec 5.8).

### Task 25: End to end, docs and ship

**Files:**
- Create: `tests/e2e/debrief-loop.spec.ts`
- Modify: `playwright.config.ts` (add `debrief-loop` to the `debrief-*` chain's `testMatch`), `README.md`, `docs/design-system.md`
- Test: the spec

**Interfaces:**
- Consumes: `tests/e2e/debrief-setup.ts` (Milestone 25 Task 17), `scanForViolations`

- [ ] **Step 1: Write the failing spec**

```ts
test("after a debrief, the hub shows the chip, Drill opens on the missed question, Home says '1 question missed last round', and one drill removes the line", async ({ page }, testInfo) => {
  // setup (debrief-setup.ts): job, bank with two questions, quick-form debrief with one question Missed, Apply
  // Prep tab: the chip "Asked in Recruiter screen · missed" sits on that question
  // start Drill: the first question shown is the missed one
  // Home: the job's next interview item contains "1 question missed last round" and the action "Drill missed"
  // finish a drill of that question with a mark; Home no longer shows the line
  await scanForViolations(page, "prep hub with asked chips", testInfo);
});
test("phone: the hub chips and the Home item wrap without sideways scroll at 390px", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test:e2e --project=debrief-chromium -g "after a debrief"`
Expected: FAIL until Tasks 18 to 23 are merged, then it is the wiring check.

- [ ] **Step 3: Fix what the spec finds, update docs**

README: add a paragraph to the Debrief section ("The next Drill starts with what went wrong in the room"). `docs/design-system.md`: the asked chip and the history list.

- [ ] **Step 4: Run the full suite and the preview check**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`
Expected: PASS in Chromium, WebKit and the phone project. Deploy the preview, repeat the Done-when sentence by hand in Chrome and Safari, record the link in the pull request.

- [ ] **Step 5: Commit**

```bash
git add tests playwright.config.ts README.md docs
git commit -m "test(prep): end to end debrief loop"
```

**Acceptance:** (1) the Done-when sentence passes as a Playwright spec in Chromium and WebKit (spec 9); (2) axe clean on the Prep hub with chips in light and dark (spec 8); (3) the preview link is in the pull request.
