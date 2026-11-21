# Milestone 29: Funnel

> Done when: "On the seed, counts, conversions, medians and the response rate match a hand-computed fixture, the window toggle changes them, axe passes in light and dark, and nothing scrolls sideways at 390 px"

Branch: `feat/m29-funnel`, cut from `main`. This milestone depends on nothing beyond Core and can be built first, before Milestones 25 to 28. Task 52 (the Debriefs section) needs Milestone 25's tables; if Milestone 29 ships first, Task 52 moves to a follow-up branch `feat/m29-funnel-debriefs`, and the page leaves that section out until then (`debriefs: null` in the report).

**Before starting:**

```bash
test -f lib/pipeline/move.ts && test -f lib/pipeline/place.ts && test -f lib/demo/seed-jobs.ts && echo core-ok
test -f lib/debrief/apply.ts && echo m25-present-for-task-52        # absent: Task 52 waits, nothing else does
grep -n "chart-1\|chart-grid" app/globals.css | head -3              # the chart tokens exist
sed -n 1,60p lib/time/zone.ts                                        # zonedAt, zonedDayStart, addZonedDays
pnpm install && pnpm typecheck && pnpm test
```

## The hand-computed fixture

All pure tests share `tests/fixtures/funnel/search.ts`, built in Task 46. It exports `FUNNEL_NOW = new Date("2026-11-20T12:00:00Z")`, `FUNNEL_TZ = "UTC"`, `buildFunnelInput(window)` (plain objects, no database) and `seedFunnelSearch(s)` (the same twelve jobs through the real pipeline functions with explicit dates: `createOpportunity(s, input, now)`, `moveOpportunity(s, id, target, now)`, `closeOpportunity`, `reopenOpportunity`, `markArtifactSent`). Fictional companies: Northwind Traders (J1, J2, J3), Adatum Works (J4, J5), Tailspin Studio (J6, J7), Harbor Lane (J8), Maple Row (J9, J10), Cedar Hill (J11, J12). Dates are all in 2026.

| Job | Source | Saved | Applied | Later stages | End |
|---|---|---|---|---|---|
| J1 | url | 09-01 | 09-02 | Recruiter 09-09, Hiring manager 09-16, Portfolio skipped, Panel 09-23, Offer 10-01 | accepted at Offer 10-05 |
| J2 | url | 09-03 | 09-05 | Recruiter 09-12, Hiring manager 09-20 | rejected at Hiring manager 09-27 |
| J3 | text | 09-04 | 09-06 | none | rejected at Applied 09-20 |
| J4 | text | 09-08 | 09-10 | none | ghosted at Applied 10-25 |
| J5 | text | 09-10 | 09-11 | none | active at Applied, last event 09-11 |
| J6 | manual | 09-15 | 11-01 | none | active at Applied, last event 11-01 |
| J7 | manual | 09-20 | 09-21 | Recruiter 10-01 | withdrawn at Recruiter 10-05 |
| J8 | url | 10-01 | 10-02 | Recruiter 10-09, Hiring manager 10-16, Portfolio 10-30 | active at Portfolio |
| J9 | feed | 10-05 | none | none | withdrawn at Saved 10-10 |
| J10 | feed | 10-06 | none | none | active at Saved |
| J11 | manual | 10-12 | 10-14 | Recruiter skipped, Hiring manager 10-24 | active at Hiring manager |
| J12 | manual | 10-15 | 10-16 | Recruiter 10-23, Hiring manager 10-30 | rejected at Hiring manager 11-05, reopened 11-06 and moved back to Recruiter |

CV sent (a `document_sent` event whose artifact kind is `cv`): J1, J2, J11. J8 sent only a cover letter (key `cover-letter`). Each event's meta carries `{ key, version, title }`; J1's also carries `format: "pdf"` and `exportId`, as Apply and Research writes them.

Expected values, computed by hand (window `all`; reached means the furthest stage with an `entered_at`, in column order, with Accepted after Offer):

- Reached: Saved 12, Applied 10, Recruiter screen 6, Hiring manager 5, Portfolio 2, Panel 1, Offer 1, Accepted 1. Conversions: `83%` (10 of 12, denominator 12), `60%` (6 of 10), `5 of 6`, `2 of 5`, `1 of 2`, `1 of 1`, `1 of 1`. Tiles: Jobs 12, Applied 10, Interviews 6, Offers 1.
- Time in stage (median whole days, count, still here): Saved 2, 11, 1 (J10); Applied 9 (the median of 7, 7, 7, 7, 10, 10, 14, 45 is the mean of 7 and 10, 8.5, rounded up), 8, 2 (J5, J6); Recruiter screen 7, 4, 1 (J12, whose completion was cleared by the reopen); Hiring manager 7, 3, 1 (J11; J12's hiring manager stage is neither open nor counted); Portfolio too few to tell, 0, 1 (J8); Panel too few to tell, 1, 0; Offer too few to tell, 1, 0.
- Response after applying: responded 7 (J1, J2, J3, J7, J8, J11, J12), no response 2 (J4, J5), waiting 1 (J6); rate `7 of 9`. Median days to first response 7 over 7 values (7, 7, 7, 7, 10, 10, 14).
- Applications per week in UTC, keys and counts: 2026-W36 3, W37 2, W38 0, W39 1, W40 1, W41 0, W42 2, W43 0, W44 1 (nine weeks, under 26, so weeks).
- Response by source: url 3 applied, `3 of 3`; text 3 applied, `1 of 3`; manual 4 applied, `3 of 3`; feed has no applied job and is left out. Response by CV: recorded as sent 3 applied, `3 of 3`; none recorded 7 applied, `4 of 6`.
- Where jobs closed: Dropped before applying 1 (withdrawn); `Applied: 1 rejected, 1 ghosted`; `Recruiter screen: 1 withdrawn`; `Hiring manager: 1 rejected`; `Offer: 1 accepted`.
- Companies: Northwind Traders 3 jobs, furthest Accepted, 34 days active (09-01 to the last close, 10-05); Maple Row 2 jobs, furthest Saved, 46 days active (10-05 to now, because J10 is active). The remaining four rows are computed by hand the same way in Task 48.

### Task 45: `search_started_on`, scoped loaders

**Files:**
- Create: `lib/db/migrations/<next>_search_started_on.sql` (generated)
- Modify: `lib/db/schema/app.ts` (`searchStartedOn: date("search_started_on", { mode: "string" })`), `lib/profile/index.ts` (`getSearchStartedOn`, `saveSearchStartedOn`), `lib/export/collect.ts` (`profile.searchStartedOn`; `EXPORT_VERSION` bumped once for the cycle, see Milestone 25 Task 13), `lib/db/scoped/opportunity.ts` (`listForFunnel`), `lib/db/scoped/stage.ts` (`listForFunnel`), `lib/db/scoped/event.ts` (`listSentDocumentKinds`)
- Test: `tests/integration/funnel-loaders.test.ts`, `tests/integration/profile.test.ts` (new cases), `tests/integration/export.test.ts` (new case), `tests/integration/scoped-isolation.test.ts` (new rows)

**Interfaces:**
- Consumes: `lastOccurredByOpportunity()` (existing), `schema.artifact`, `schema.event`
- Produces:
  ```ts
  export type FunnelJobRow = { id: string; companyId: string; companyName: string; source: OpportunitySource; createdAt: Date; status: OpportunityStatus; closedReason: ClosedReason | null; closedAt: Date | null; closedStageId: string | null; currentStageId: string | null };
  export type FunnelStageRow = { id: string; opportunityId: string; kind: StageKind; position: number; status: StageStatus; enteredAt: Date | null; completedAt: Date | null };
  export type SentDocumentRow = { opportunityId: string; kind: ArtifactKind };
  export function getSearchStartedOn(s: Scoped): Promise<string | null>;
  export function saveSearchStartedOn(s: Scoped, value: string | null, now?: Date): Promise<Result<string | null, "invalid">>;   // 'YYYY-MM-DD', a real date, not after today in the profile zone
  ```
  `listSentDocumentKinds` is one query: `event` of kind `document_sent` joined to `artifact` on `user_id`, `opportunity_id`, `key = meta->>'key'` and `version = (meta->>'version')::int`, returning the opportunity id and the artifact's `kind` only. No loader selects `posting_md`, `body_md`, `outcome_md`, `notes_md` or any person field.

- [ ] **Step 1: Write the failing tests**

```ts
it("listForFunnel rows have exactly the documented keys and no content column", () => expect(Object.keys(row).sort()).toEqual([...FUNNEL_JOB_KEYS].sort()));   // same for stages and sent documents
it("listSentDocumentKinds resolves cv and cover_letter through (opportunity, key, version) and ignores an event whose artifact is gone", ...);
it("an event with Apply's extra meta (format, exportId) resolves the same way", ...);
it("saveSearchStartedOn accepts 2026-09-01, clears with null, rejects 2026-02-30, 'yesterday' and a date after today in the profile zone with 'Enter a date that is not in the future.'", ...);
it("the export carries profile.searchStartedOn", ...);
it("every loader hides user A's rows from user B", ...);   // isolation rows
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/funnel-loaders.test.ts tests/integration/profile.test.ts tests/integration/export.test.ts`
Expected: FAIL, columns and methods do not exist.

- [ ] **Step 3: Implement**

The migration is one `ALTER TABLE profile ADD COLUMN search_started_on date`; read the generated SQL. Validation uses `zonedDayStart(now, zone)` to compare calendar days in the profile zone. `listForFunnel` for opportunities joins `company` for the name through `user_id`, like `listBoard`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(funnel): search start date and content-free funnel loaders"
```

**Acceptance:** (1) the loader selects ids, kinds, dates, reasons and sources only (spec 5.10); (2) `profile.search_started_on` is written through `lib/profile` and exported (spec 4, 5.10); (3) each loader is scoped and in the isolation test (spec 7).

### Task 46: Cohort, windows, reach, conversion

**Files:**
- Create: `lib/funnel/types.ts`, `lib/funnel/cohort.ts`, `lib/funnel/reach.ts`, `tests/fixtures/funnel/search.ts`
- Test: `tests/unit/funnel-cohort.test.ts`, `tests/unit/funnel-reach.test.ts`

**Interfaces:**
- Consumes: `STAGE_KINDS` (`lib/pipeline/kinds.ts`), `zonedAt`, `addZonedDays`, `zonedDayStart` (`lib/time/zone.ts`), the row types from Task 45
- Produces:
  ```ts
  export type FunnelWindow = "search" | "90d" | "all";
  export type Conversion = { num: number; den: number; label: string };
  export const MIN_PERCENT_DENOMINATOR = 10;
  export function makeConversion(num: number, den: number): Conversion;     // "83%" when den >= 10 (Math.round), else "3 of 7"; den 0 gives "0 of 0"
  export type FunnelInput = { now: Date; timeZone: string; window: FunnelWindow; searchStartedOn: string | null; jobs: FunnelJobRow[]; stages: FunnelStageRow[]; lastEventAt: Map<string, Date>; sentKinds: SentDocumentRow[] };
  export type JobFacts = { job: FunnelJobRow; stages: FunnelStageRow[]; startedAt: Date; rank: number };
  export const REACH_KINDS: readonly (StageKind | "accepted")[];            // saved, applied, recruiter_screen, hiring_manager, portfolio_case, panel_final, offer, accepted
  export function resolveWindow(param: string | string[] | undefined, searchStartedOn: string | null): FunnelWindow;   // default search when set, else 90d; 'search' without a date reads 90d
  export function windowBounds(window: FunnelWindow, now: Date, timeZone: string, searchStartedOn: string | null): { from: Date | null; to: Date };
  export function jobStart(job: FunnelJobRow, stages: FunnelStageRow[]): Date;       // earliest entered_at among stages, else created_at
  export function selectCohort(input: FunnelInput): JobFacts[];
  export function reachedRank(job: FunnelJobRow, stages: FunnelStageRow[]): number;  // 0 to 7
  export type ReachRow = { kind: StageKind | "accepted"; label: string; reached: number; conversion: Conversion | null; share: number };   // share: percent of Saved, 0 to 100
  export function reachRows(facts: JobFacts[]): ReachRow[];
  ```
  Window rules: `90d` starts at local midnight 90 days before now (`addZonedDays(now, -90, zone, 0)`), `search` at local midnight of the start date, `all` has no start; the end is `now`; a job is in the cohort when `startedAt` is at or after `from`.

- [ ] **Step 1: Write the failing tests**

```ts
it("makeConversion gives a percent at a denominator of 10 and 'n of d' below it", () => {
  expect(makeConversion(10, 12).label).toBe("83%"); expect(makeConversion(6, 10).label).toBe("60%");
  expect(makeConversion(5, 6).label).toBe("5 of 6"); expect(makeConversion(0, 0).label).toBe("0 of 0");
});
it("resolveWindow defaults to search when the date is set and to 90d otherwise; an unknown value falls back to the default", ...);
it("windowBounds uses day boundaries in the profile zone: Toronto's 90d start is local midnight, not UTC midnight", ...);
it("jobStart uses the earliest entered_at, so an imported job keeps its own date, and created_at when no stage was entered", ...);
it("a skipped round does not lower a conversion: J11 (Recruiter skipped, Hiring manager entered) reaches Recruiter screen", ...);
it("a reopened job keeps what it reached: J12 reaches Hiring manager although it is back at Recruiter", ...);
it("Accepted is rank 7, after Offer; a job closed declined at Offer is rank 6", ...);
it("a job with no entered stage is rank 0", ...);
it("the fixture's reach rows are 12, 10, 6, 5, 2, 1, 1, 1 with conversions 83%, 60%, 5 of 6, 2 of 5, 1 of 2, 1 of 1, 1 of 1", ...);
it("share is reached over Saved as a percent, 0 when Saved is 0", ...);
it("the window toggle changes the cohort: a search start of 2026-10-10 keeps J8 to J12 only", ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/funnel-cohort.test.ts tests/unit/funnel-reach.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

Pure functions, no clock and no database. `reachedRank` is `7` for a job closed `accepted`, else the highest `kindRank` among stages with `enteredAt`, else `0`. `kindRank` comes from `STAGE_KINDS` index. Build `tests/fixtures/funnel/search.ts` from the table above: `buildFunnelInput(window)` constructs rows with explicit ids (`"j1"` and stage ids `"j1-saved"`), and `seedFunnelSearch(s)` writes the same search through the pipeline functions with the table's dates.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/funnel-cohort.test.ts tests/unit/funnel-reach.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/funnel tests
git commit -m "feat(funnel): cohort windows, reached ranks and conversions"
```

**Acceptance:** (1) the cohort is by job start with day boundaries in the profile zone (spec 5.10); (2) reached counts a later stage as reaching earlier kinds, so a skipped round never lowers a conversion (spec 5.10); (3) percentages need a denominator of 10 and show "3 of 7" below it (spec 5.10, 11); (4) a reopened job and imported dates are fixture cases (spec 8).

### Task 47: Durations and response

**Files:**
- Create: `lib/funnel/durations.ts`, `lib/funnel/response.ts`, `lib/funnel/median.ts`
- Test: `tests/unit/funnel-durations.test.ts`, `tests/unit/funnel-response.test.ts`

**Interfaces:**
- Consumes: `JobFacts`, `makeConversion` (Task 46)
- Produces:
  ```ts
  export const MIN_MEDIAN_VALUES = 3; export const NO_RESPONSE_DAYS = 30;
  export function median(values: number[]): number | null;     // odd: the middle; even: Math.round of the mean of the two middle; empty: null
  export function wholeDays(from: Date, to: Date): number;     // Math.floor of the milliseconds over 86,400,000, never below 0
  export type StageDaysRow = { kind: StageKind; label: string; median: number | null; count: number; stillHere: number; text: string };   // text "5 days", "1 day", "Too few to tell"
  export function stageDays(facts: JobFacts[]): StageDaysRow[];
  export type ResponseSummary = { responded: number; noResponse: number; waiting: number; rate: Conversion; medianDays: number | null; medianText: string; medianCount: number };
  export type ResponseClass = "responded" | "no_response" | "waiting";
  export function classifyResponse(f: JobFacts, now: Date, lastEventAt: Map<string, Date>): ResponseClass | null;   // null when the job never reached Applied
  export function responseSummary(facts: JobFacts[], now: Date, lastEventAt: Map<string, Date>): ResponseSummary;
  ```
  Time in stage: per kind, for each cohort stage with an `enteredAt`, the end is `completedAt`, else `closedAt` when the job closed at that stage, else none; a job that is active with that stage current counts as `stillHere` and adds no value; any other stage with no end adds nothing. Response: of jobs that reached Applied, `responded` is rank 2 or more, or closed `rejected` at Applied; `no_response` is closed `ghosted` at Applied, or active with rank 1 and no event for 30 days (`lastEventAt`, else the Applied stage's `enteredAt`, at least 30 days before now); everything else is `waiting` (so a job withdrawn at Applied lands there, because the spec names no other class). The rate is responded over responded plus no response. Median days to first response runs from Applied's `enteredAt` to the `enteredAt` of the first later stage that has one, or to `closedAt` for a rejection at Applied.

- [ ] **Step 1: Write the failing tests**

```ts
it("median: [7,7,7,7,10,10,14,45] is 9 (8.5 rounds up), odd lists take the middle, an empty list is null", ...);
it("fewer than 3 values read 'Too few to tell'; 3 values read '7 days'; 1 day reads '1 day'", ...);
it("the fixture's time in stage matches the table: Saved 2 days over 11 with 1 still here; Applied 9 over 8 with 2; Recruiter 7 over 4 with 1; Hiring manager 7 over 3 with 1; Portfolio, Panel and Offer too few", ...);
it("a stage closed at ends at closed_at: J3's Applied stage is 14 days", ...);
it("an open stage of an active job is still here and never in the median", ...);
it("a reopened job's cleared completion makes its Recruiter stage still here, and its Hiring manager stage is not counted", ...);
it("responded, no response and waiting match the fixture: 7, 2 and 1, rate '7 of 9'", ...);
it("an active job at Applied with an event 19 days ago is waiting and with an event 31 days ago is no response; exactly 30 days is no response", ...);
it("rejected at Applied is responded; ghosted at Applied is no response; withdrawn at Applied is waiting", ...);
it("median days to first response is 7 over 7 values on the fixture", ...);
it("a job that never reached Applied is not classified", ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/funnel-durations.test.ts tests/unit/funnel-response.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

Pure and deterministic. `wholeDays` is a plain millisecond division, so a day that has a DST change is 23 or 25 hours long and still counts by elapsed time; the spec says whole days between two dates and names no zone rule.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/funnel-durations.test.ts tests/unit/funnel-response.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/funnel tests
git commit -m "feat(funnel): time in stage and response after applying"
```

**Acceptance:** (1) medians of whole days, open stages as "n still here", fewer than 3 values "Too few to tell" (spec 5.10); (2) the response classes and the 30-day rule (spec 5.10, 11); (3) the fixture medians and rates match the hand-computed table (spec 9).

### Task 48: Weekly, splits, closes, companies

**Files:**
- Create: `lib/funnel/weekly.ts`, `lib/funnel/splits.ts`, `lib/funnel/closes.ts`, `lib/funnel/companies.ts`, `lib/funnel/format.ts`
- Test: `tests/unit/funnel-weekly.test.ts`, `tests/unit/funnel-splits.test.ts`, `tests/unit/funnel-closes.test.ts`, `tests/unit/funnel-companies.test.ts`, `tests/unit/funnel-format.test.ts`

**Interfaces:**
- Consumes: `JobFacts`, `classifyResponse`, `makeConversion`, `STAGE_KINDS`, `CLOSED_REASON_LABELS`
- Produces:
  ```ts
  export const MAX_WEEKLY_BARS = 26; export const PHONE_WEEKS = 12;
  export function isoWeekKey(at: Date, timeZone: string): string;            // "2026-W36"
  export function monthKey(at: Date, timeZone: string): string;              // "2026-09"
  export type Bar = { key: string; label: string; count: number; share: number };
  export type WeeklyBars = { unit: "week" | "month"; bars: Bar[] };            // weeks when the span is at most 26 weeks, else months; the most recent 26 either way
  export function weeklyBars(facts: JobFacts[], timeZone: string): WeeklyBars;
  export type RateRow = { key: string; label: string; applied: number; responded: number; noResponse: number; rate: Conversion };
  export const SOURCE_LABELS: Record<OpportunitySource, string>;           // url "Link", text "Pasted text", manual "Added by hand", feed "Feed"
  export function responseBySource(facts: JobFacts[], now: Date, lastEventAt: Map<string, Date>): RateRow[];   // sources with no applied job are left out
  export function responseByCv(facts: JobFacts[], now: Date, lastEventAt: Map<string, Date>, sent: SentDocumentRow[]): RateRow[];   // "CV recorded as sent", "No CV recorded"
  export type CloseRow = { kind: StageKind; label: string; total: number; reasons: Partial<Record<ClosedReason, number>>; line: string };
  export function closeRows(facts: JobFacts[]): CloseRow[];                 // column order, kinds with no close left out; Saved reads "Dropped before applying"; other labels are the default labels
  export type CompanyRow = { companyId: string; name: string; jobs: number; furthest: StageKind | "accepted"; furthestLabel: string; active: number; closed: Partial<Record<ClosedReason, number>>; daysActive: number };
  export function companyRows(facts: JobFacts[], now: Date): CompanyRow[];  // by jobs descending, then name
  export function formatIsoDate(iso: string): string;                       // "1 Sep 2026", fixed month names
  ```
  Close line: `{label}: {n} {reason word}, ...` with reason words `rejected`, `withdrawn`, `ghosted`, `declined`, `accepted` in that order, zero counts left out. Days active runs from the company's earliest job start to now when any of its jobs is active, else to its latest `closedAt`.

- [ ] **Step 1: Write the failing tests**

```ts
it("isoWeekKey follows ISO weeks in the profile zone: a week that crosses a time zone change", () => {
  // America/Toronto changed to daylight time on 2026-03-08 at 02:00 local
  expect(isoWeekKey(new Date("2026-03-08T04:30:00Z"), "America/Toronto")).toBe("2026-W10");   // Saturday evening, local
  expect(isoWeekKey(new Date("2026-03-09T03:30:00Z"), "America/Toronto")).toBe("2026-W10");   // Sunday evening, local; Monday in UTC
  expect(isoWeekKey(new Date("2026-03-09T04:30:00Z"), "America/Toronto")).toBe("2026-W11");   // Monday 00:30 local
});
it("the fixture's weekly bars are W36 3, W37 2, W38 0, W39 1, W40 1, W41 0, W42 2, W43 0, W44 1 and total 10", ...);
it("more than 26 weeks of span switches to months, capped at the most recent 26 bars; share is count over the largest bar", ...);
it("response by source and by CV match the fixture; J8's cover letter does not count as a CV and the CV is resolved through the join", ...);
it("an event whose key names a cover letter, and one with Apply's extra meta fields, resolve correctly", ...);
it("closes match the fixture and read 'Applied: 1 rejected, 1 ghosted', 'Recruiter screen: 1 withdrawn', 'Dropped before applying'", ...);
it("companies: Northwind Traders 3 jobs, furthest Accepted, 34 days; Maple Row 2 jobs, furthest Saved, 46 days; ordered by jobs then name", ...);
it("formatIsoDate uses fixed month names", () => expect(formatIsoDate("2026-09-01")).toBe("1 Sep 2026"));
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/funnel-weekly.test.ts tests/unit/funnel-splits.test.ts tests/unit/funnel-closes.test.ts tests/unit/funnel-companies.test.ts tests/unit/funnel-format.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`isoWeekKey` takes the calendar day in the zone from `Intl.DateTimeFormat(...).formatToParts`, then applies the ISO rule (the week of the Thursday of that week) on that local date, so a DST change inside a week cannot move a day across a week boundary. Bars between the first and last bucket include zero buckets. Compute the remaining four company rows of the fixture by hand in the test file, in the same way as the two above.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/funnel tests
git commit -m "feat(funnel): weekly bars, source and CV splits, closes and company rows"
```

**Acceptance:** (1) ISO weeks in the profile zone across a time zone change (spec 5.10, 8); (2) at most 26 bars, months for longer windows (spec 5.10); (3) the CV split resolves each `document_sent` event's kind through the join and a cover letter never counts (spec 5.10); (4) closes read "Dropped before applying" at Saved and one line per kind on a phone (spec 5.10).

### Task 49: Report, loader, performance, seed test

**Files:**
- Create: `lib/funnel/report.ts`, `lib/funnel/load.ts`
- Test: `tests/unit/funnel-report.test.ts`, `tests/integration/funnel-load.test.ts`, `tests/integration/funnel-seed.test.ts`, `tests/integration/funnel-perf.test.ts`

**Interfaces:**
- Consumes: Tasks 45 to 48, `getSearchStartedOn`, `getProfile` (time zone)
- Produces: `FunnelReport`, `FunnelTiles`, `buildFunnelReport(input)` and `loadFunnel(s, windowParam, now)` as in the Contract, with `debriefs: null` (Task 52 fills it):
  ```ts
  export type FunnelTiles = { jobs: number; applied: number; interviews: number; offers: number; responseRate: Conversion };
  ```
  Interviews is the number of jobs with rank 2 or more; Offers rank 6 or more.

- [ ] **Step 1: Write the failing tests**

```ts
it("buildFunnelReport on the fixture returns tiles 12, 10, 6, 1 and a response rate of '7 of 9'", ...);
it("an empty cohort returns zero tiles and empty lists, not an error", ...);
it("loadFunnel over seedFunnelSearch(s) deep-equals buildFunnelReport(buildFunnelInput('all')) on tiles, reach rows, stage days, response, weekly bars, splits, closes and companies", ...);   // the loader and the pure input agree
it("the seed: after seedJobs(s), loadFunnel(s, '90d', now) gives Jobs 6, Applied 5, Interviews 4, Offers 0, reach 6, 5, 4, 3, 2, 1, 0, 0 with conversions '5 of 6', '4 of 5', '3 of 4', '2 of 3', '1 of 2', '0 of 1', '0 of 0'; response responded 4, waiting 1, rate '4 of 4'; one close line 'Panel: 1 rejected'; companies Acme Robotics, Lumen Health, Northwind Labs with 2 jobs each", ...);
it("switching the window changes the numbers: a search start after every job started gives an empty cohort", ...);
it("with 1,000 jobs the loader and report take under 200 ms", async () => { /* bulk inserts through scoped helpers, then time loadFunnel */ });   // check uptime first; above 50 the timing is unproven
it("the loader's queries return no content column", ...);   // key-set check from Task 45
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/funnel-report.test.ts tests/integration/funnel-load.test.ts tests/integration/funnel-seed.test.ts tests/integration/funnel-perf.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`loadFunnel` runs the four loaders in parallel (`Promise.all`), the profile read for the zone and start date, resolves the window with `resolveWindow`, then calls `buildFunnelReport`. The 1,000-job test inserts through `s.company.insert`, `s.opportunity.insert` and `s.stage.insertMany` directly (not `createOpportunity`, which is too slow for bulk) with spread dates and a mix of closes.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/funnel-report.test.ts tests/integration && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/funnel tests
git commit -m "feat(funnel): report assembly and loader, checked against the seed"
```

**Acceptance:** (1) on the seed the counts, conversions and response rate equal the hand-computed values (spec 9); (2) the loader and the pure report agree on the same search (spec 5.10 "pure functions over rows"); (3) 1,000 jobs load in under 200 ms (spec 5.10).

### Task 50: Funnel components

**Files:**
- Create: `components/funnel/tiles.tsx`, `components/funnel/bar-list.tsx`, `components/funnel/chart-with-table.tsx`, `components/funnel/window-toggle.tsx`, `components/funnel/search-start.tsx`, `components/funnel/tables.tsx`
- Modify: `docs/design-system.md` ("New application code": bar list, table twin toggle; a "Decision" line: no chart library, with the reason from the spec)
- Test: `tests/unit/funnel-tiles.test.tsx`, `tests/unit/funnel-bar-list.test.tsx`, `tests/unit/funnel-chart-with-table.test.tsx`, `tests/unit/funnel-window-toggle.test.tsx`, `tests/unit/funnel-search-start.test.tsx`

**Interfaces:**
- Consumes: `FunnelReport` (Task 49), registry `table-view`, `section-header`, `empty-state`, `base-nova` `toggle-group`, `dialog`, `input`; `formatIsoDate`
- Produces: `<FunnelTiles>`, `<BarList rows>`, `<ChartWithTable title columns rows>`, `<WindowToggle current basePath>`, `<SearchStart value>`, and the table sections

Rules: a bar is a plain element in one hue, `bg-chart-1` on a `bg-chart-grid` track, sized by `w-[var(--share)]` with the variable set from a `style` prop (`"--share": "43%"`), the number printed on every bar, no legend. Each chart is `aria-hidden` beside its table twin, a `table-view` holding the same numbers, visually hidden (`sr-only`) by default and shown by a `Table` toggle button with `aria-pressed` (when shown, the chart hides). Tiles: `Jobs`, `Applied`, `Interviews`, `Offers`, `Response rate`; the rate tile reads `7 of 9` or `83%` from its `Conversion`, with its count beside any percentage (`83% (10 of 12)`). `SearchStart` reads `This search started on 1 Sep 2026` with an `Edit` button opening a dialog with a date input, or `Set when this search started` when unset.

- [ ] **Step 1: Write the failing tests**

```tsx
it("the bar list prints the number on every bar and sets --share on a w-[var(--share)] element with bg-chart-1 on a bg-chart-grid track", ...);
it("the chart is aria-hidden and its table twin is in the DOM, sr-only until the Table toggle (aria-pressed) is pressed, which hides the chart", ...);
it("a percentage always shows its count beside it", ...);
it("the tiles show the five labels and the values", ...);
it("the window toggle links to ?window=search, 90d and all with aria-current on the active one and 'This search' disabled when no date is set", ...);
it("SearchStart shows the date or the prompt and saves through the action with the dialog's date", ...);
it("'Too few to tell' and '1 still here' render as text in the stage-days table", ...);
it("tables render two-line rows on a phone width and the closes table one line per kind", ...);   // class-based, asserted on the markup
it("no raw color or palette class appears in any component", ...);                                   // pnpm check:tokens covers it; the test imports the check function
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/funnel-tiles.test.tsx tests/unit/funnel-bar-list.test.tsx tests/unit/funnel-chart-with-table.test.tsx tests/unit/funnel-window-toggle.test.tsx tests/unit/funnel-search-start.test.tsx`
Expected: FAIL, components do not exist.

- [ ] **Step 3: Implement**

Read `components/super-ai/table-view.tsx` first: it renders a `role="grid"` and takes `columns` and `items`. Use it unchanged for the desktop table twin and render two-line list rows under `md:hidden` for the phone. Semantic tokens only; `pnpm check:tokens` must pass, which is why the bar width goes through a variable. A change to `components/super-ai/` is not allowed; wrap, never edit.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components docs tests
git commit -m "feat(funnel): tiles, bar lists with table twins and the window toggle"
```

**Acceptance:** (1) bars are plain elements on the chart tokens with the number printed on each and no legend (spec 5.10); (2) each chart is `aria-hidden` beside a table twin shown by a "Table" toggle (spec 5.10); (3) `pnpm check:tokens` passes (spec 5.10); (4) the no-chart-library decision is recorded in `docs/design-system.md` (spec 5.10).

### Task 51: Route, navigation, phone layout

**Files:**
- Create: `app/(app)/funnel/page.tsx`, `app/(app)/funnel/actions.ts`
- Modify: `components/app-shell.tsx` (`NAV_ITEMS` gains Funnel after Board; the phone bar keeps Home, Board and Companies by id and Funnel sits under More)
- Test: `tests/integration/funnel-actions.test.ts`, `tests/unit/app-shell-nav.test.tsx`

**Interfaces:**
- Consumes: `loadFunnel`, `resolveWindow`, `saveSearchStartedOn`, `requireUser`, `scopedFor`, the components of Task 50
- Produces: the page at `/funnel?window=search|90d|all`; `saveSearchStartedAction(_prev, formData)`; empty state `No jobs in this window yet.` with description `Jobs you add show up here once they start inside the window.` and the window toggle still shown

- [ ] **Step 1: Write the failing tests**

```ts
it("the action calls requireUser, saves a valid date, clears on an empty value, rejects a future date with 'Enter a date that is not in the future.', and revalidates /funnel and Home", ...);
it("NAV_ITEMS lists Funnel directly after Board, the phone bar keeps its three tabs, and Funnel is in the More sheet", ...);
it("an unknown ?window value falls back to the default and the page never throws", ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/funnel-actions.test.ts tests/unit/app-shell-nav.test.tsx`
Expected: FAIL, the action and nav item do not exist.

- [ ] **Step 3: Implement**

Read `node_modules/next/dist/docs/` for `PageProps` and `searchParams` handling first (they are async in Next 16). The page order: header and `SearchStart`, `WindowToggle`, the five tiles, the four bar lists (reached per kind with conversions, median days per kind, applications per week, response rate by source), then the tables (response by CV, where jobs closed, by company, and the Debriefs section when the report carries one). Phone: the weekly list shows the last `PHONE_WEEKS` bars, tables become two-line rows, the closes table becomes one line per kind, and the page must not scroll sideways. `NAV_ITEMS` order matters to the phone split today (the first three items become the tabs), so change the split to ids: `PHONE_TAB_IDS = ["home", "board", "companies"]`, everything else under More.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/funnel-actions.test.ts tests/unit && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app components tests
git commit -m "feat(funnel): the /funnel page, its navigation entry and the phone layout"
```

**Acceptance:** (1) `/funnel` sits after Board in the sidebar and under More on a phone (spec 5.10); (2) the window comes from `?window=` with the spec's default (spec 5.10); (3) an empty cohort shows the empty state with the window toggle (spec 6); (4) `requireUser()` runs in the page and the action (spec 3).

### Task 52: Debriefs section (after Milestones 25 and 27)

**Blocked on:** Milestone 25 merged (tables `debrief`, `debrief_suggestion`, `asked_question`). Without it, skip this task and leave the boxes unchecked; the page renders with no Debriefs section.

**Files:**
- Create: `lib/funnel/debriefs.ts`, `components/funnel/debrief-tables.tsx`
- Modify: `lib/funnel/report.ts` and `load.ts` (fill `debriefs`), `lib/db/scoped/debrief.ts`, `debrief-suggestion.ts`, `asked-question.ts` (`listForFunnel` each, content-free: ids, keys, ratings, outcomes, analyzers, statuses and an `edited` boolean, plus `asked_text` for the question table only)
- Test: `tests/unit/funnel-debriefs.test.ts`, `tests/integration/funnel-debriefs.test.ts`

**Interfaces:**
- Consumes: Task 49 report types, `listLibraryItems` (the Milestone 25 port) for Library links
- Produces:
  ```ts
  export type DebriefStats = {
    byKind: { kind: StageKind; label: string; debriefs: number; avgRating: number | null }[];
    topQuestions: { questionKey: string; text: string; asked: number; held: number; wobbled: number; missed: number; href: string }[];   // at most 10, by asked descending then text
    suggestions: { analyzer: SuggestionAnalyzer; acceptedAsProposed: number; acceptedAfterEdit: number; rejected: number; pending: number; hitRate: number | null }[];
  };
  export function debriefStats(input: { cohortJobIds: Set<string>; debriefs: DebriefFunnelRow[]; asks: AskFunnelRow[]; suggestions: SuggestionFunnelRow[]; libraryByKey: Map<string, string>; slugByJob: Map<string, string> }): DebriefStats;
  ```
  A debrief document is one per job and `artifact_key`; its rating is the latest row's. `hitRate` is accepted as proposed over the three decided columns, null at zero decided. A question links to its Library item when one holds its key, else to the job of its latest ask. The counting is a small pure function here, so this task needs no Milestone 27 code.

- [ ] **Step 1: Write the failing tests**

```ts
it("counts debriefs per stage kind and averages ratings over the documents that have one", ...);
it("lists the 10 most asked questions with held, wobbled and missed counts, linking to the Library item or the job", ...);
it("counts suggestions per analyzer as accepted as proposed, accepted after an edit (edited_payload set), rejected and pending; superseded counts nowhere", ...);
it("hitRate is null at zero decided and 0.5 for one accepted as proposed and one rejected", ...);
it("only jobs in the cohort contribute", ...);
it("a search with no debrief gives empty lists and the page omits the section", ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/funnel-debriefs.test.ts tests/integration/funnel-debriefs.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Reuse Task 50's `ChartWithTable` for the per-kind counts and plain tables for the two lists, each with a table twin where it is a chart. The page shows the section only when the report carries a non-empty `debriefs`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/funnel-debriefs.test.ts tests/integration && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib components tests
git commit -m "feat(funnel): debrief ratings, most asked questions and the suggestion hit rate"
```

**Acceptance:** (1) debriefs per stage kind with the average rating, the 10 most asked questions and suggestions per analyzer follow spec 5.10; (2) the hit rate is the first column over the three decided columns (spec 5.10); (3) the loaders select no transcript or body text (spec 5.10, 7).

### Task 53: End to end, docs and ship

**Files:**
- Create: `tests/e2e/funnel.spec.ts`
- Modify: `playwright.config.ts` (`funnel` joins the `debrief-*` chain's `testMatch`: the spec changes the shared account's search start date), `README.md` (a Funnel section: the windows, what "reached" means, the 10 and 30 rules), `docs/design-system.md`
- Test: the spec

**Interfaces:**
- Consumes: `login`, `uniqueName`, `addJobAndOpen`, `scanForViolations`

- [ ] **Step 1: Write the failing specs**

```ts
test("the funnel page loads, tiles agree with the reached table and the Table toggle shows the twin", async ({ page }, testInfo) => {
  // add one job through the add dialog so the account has at least one job; open /funnel
  // the Jobs tile equals the Saved row of the reached table twin; press 'Table': the twin is visible and the chart hidden
  await scanForViolations(page, "funnel", testInfo);
});
test("the window toggle changes the URL and the heading state; Edit sets the search start to today and the default becomes This search", ...);
test("an unknown window value falls back without an error", ...);
test("phone: nothing scrolls sideways at 390px with the weekly list, the closes table and the company table", async ({ page }) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
test("Funnel sits after Board in the sidebar on desktop and under More on a phone", ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm test:e2e --project=debrief-chromium -g "funnel"`
Expected: FAIL until Tasks 45 to 51 are merged, then it is the wiring check. Milestone 29's own chain entry: if no `debrief-*` project exists yet (this milestone shipped first), add the three projects `debrief-chromium`, `debrief-webkit` and `debrief-phone` here, each depending on the last earlier project and on the one before it in the chain, with `testMatch` `/funnel\.spec\.ts$/`; Milestone 25 Task 17 then widens the regex.

- [ ] **Step 3: Fix what the specs find, update docs**

README Funnel section: windows (`This search`, `90 days`, `All time`), "reached" in one sentence with the skipped-round rule, the denominator of 10 for percentages, the 30-day rule for "no response". `docs/design-system.md`: confirm Task 50's entries.

- [ ] **Step 4: Run the full suite and the preview check**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`
Expected: PASS in Chromium, WebKit and the phone project. Deploy the preview, open `/funnel` in Chrome and Safari at desktop width and 390 px, toggle windows and tables by hand, record the link in the pull request.

- [ ] **Step 5: Commit**

```bash
git add tests playwright.config.ts README.md docs
git commit -m "test(funnel): end to end funnel page, windows, table twins and phone layout"
```

**Acceptance:** (1) the Done-when sentence passes: the seed and fixture numbers in Task 49, the window toggle in Task 46 and here, axe and the 390 px check in this spec (spec 9); (2) axe clean on `/funnel` in light and dark (spec 8); (3) the preview link is in the pull request.
