# Milestone 17: Feed

**Done when (spec section 9):** "A role from a tracked company reaches the board from Home in two taps with its score on the card, and with the cap set to 2, a scan of 5 passing roles makes exactly 2 model calls."

**Branch:** `feat/m17-feed`, cut from `main` after Milestone 16 is merged.

**Blocked on (live part only):** a model key on the preview to see a real score (Task 27 Step 6). Every test runs on the fake AI driver.

## Before starting

```bash
bash -c 'test -f lib/feed/schedule.ts && test -f lib/feed/items.ts && test -f lib/feed/sources.ts && test -f lib/db/system.ts && test -f lib/feed/steps.ts && echo m16-present'
bash -c 'test -f lib/credits/meter.ts && grep -n "export" lib/credits/meter.ts | head -20 || echo hosted-m14-missing'
bash -c 'grep -n "meter" lib/fit/deps.ts || echo fitdeps-has-no-meter'
```

If Milestone 16 is missing, stop: nothing here works without it. If `lib/credits/meter.ts` or `FitDeps.meter` is missing (Hosted milestones 13 and 14 not merged), Task 19 reserves only the feed counter and `meterScore` and `refundScore` stay named no-op functions with a comment pointing at Hosted 5.7; the tests that need a refusing Meter are skipped with `it.skip` and a reason string, and the task report says so. Read `lib/credits/meter.ts` now: Task 19 calls `reserve` and `refund` through `meterScore` and `refundScore` only. Read the `feed-view` source (`components/super-ai/feed-view.tsx`, `data-views-shared.tsx`) before Task 23.

---

### Task 18: `findClosedDuplicate`, `adoptFit`, scoped helpers

**Files:**
- Modify: `lib/pipeline/duplicates.ts` (add `findClosedDuplicate`), `lib/db/scoped/opportunity.ts` (add `listClosedForDedupe`), `lib/db/scoped/profile.ts` (add `reserveFeedScore`, `feedScoreUsage`), `lib/time/zone.ts` (add `zonedDate`)
- Create: `lib/fit/adopt.ts`
- Test: `tests/integration/pipeline-duplicates.test.ts` (new file), `tests/integration/fit-adopt.test.ts`, `tests/integration/feed-reserve.test.ts`, `tests/unit/time-zone.test.ts`

**Interfaces:**
- Consumes: `dedupeHash`, `DedupeParts`, `StoredFit`, `Scoped`.
- Produces: `findClosedDuplicate(s, parts): Promise<{ id: string; slug: string } | null>` (same hash, status `closed`, newest `created_at` first); `listClosedForDedupe()` (same row shape as `listActiveForDedupe`); `adoptFit(s, opportunityId, from: { score: number; fit: StoredFit }): Promise<boolean>` (true when a row changed); `profile.reserveFeedScore(input: { day: string; cap: number }): Promise<boolean>`; `profile.feedScoreUsage(): Promise<{ day: string | null; count: number }>`; `zonedDate(instant: Date, timeZone: string): string` (`YYYY-MM-DD` of the zone's calendar day).

- [ ] **Step 1: Write the failing tests**

```ts
// duplicates: it("findClosedDuplicate returns the newest closed job with the same hash") two closed matches, newest created wins
//   it("ignores active jobs") ; it("ignores closed jobs with another location") ; it("findActiveDuplicate still ignores closed jobs")
// adopt: it("copies score and the stored fit onto a job with fit_status none, setting fit_status done") 
//   it("never overwrites a done score") ; it("returns false for another user's job")
// reserve (the spec's one UPDATE ... RETURNING): it("increments feed_score_count while under the cap on the same day")
//   it("resets to 1 on a new day") ; it("refuses at the cap") cap 2: true, true, false
//   it("cap 0 always refuses, even on a new day") ; it("two concurrent reservations at one below the cap: exactly one wins") Promise.all
//   it("a profile row is required: no row, no reservation") 
// zone: zonedDate("2026-03-08T04:30:00Z", "America/Toronto") === "2026-03-07"; ("2026-03-08T06:30:00Z", same) === "2026-03-08"; UTC input unchanged
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/pipeline-duplicates.test.ts tests/integration/fit-adopt.test.ts tests/integration/feed-reserve.test.ts tests/unit/time-zone.test.ts`
Expected: FAIL, functions missing.

- [ ] **Step 3: Implement**

`reserveFeedScore` is one statement:

```sql
UPDATE profile
SET feed_score_day = $day,
    feed_score_count = CASE WHEN feed_score_day = $day THEN feed_score_count + 1 ELSE 1 END
WHERE user_id = $user AND $cap > 0
  AND (feed_score_day IS DISTINCT FROM $day OR feed_score_count < $cap)
RETURNING feed_score_count
```

True when a row came back. `zonedDate` formats the zone's wall clock through the module's existing private `wallClock`. `adoptFit` is one `UPDATE opportunity SET fit_status = 'done', fit_score = $score, fit = $fit WHERE id = $id AND user_id = $user AND fit_status <> 'done'`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration tests/unit/time-zone.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(feed): closed duplicates, adoptFit and the daily reservation"
```

**Acceptance:** (1) a closed match is found, an active one is not (spec 5.4). (2) the reservation is a single statement and exactly one of two concurrent callers wins (spec 5.5, 8). (3) the day is the profile time zone's day (spec 5.5).

---

### Task 19: Scoring under a cap

**Files:**
- Create: `lib/feed/score.ts`, `lib/feed/settings.ts` (`FeedSettings`, `DEFAULT_FEED_SETTINGS`, `parseFeedSettings`, `effectiveScoreCap`)
- Modify: `lib/feed/steps.ts` (add `scoringStep` to `userSteps`); `lib/fit/deps.ts` is read, not changed: Hosted Task 42 gives `FitDeps` an optional `meter?: Meter` and `fitDeps()` passes `getMeter()`
- Test: `tests/integration/feed-score.test.ts`, `tests/unit/feed-settings.test.ts`

**Interfaces:**
- Consumes: `reserveFeedScore`, `zonedDate`, `scoreFit`, `toStoredFit`, `fitReadiness`, `loadFitProfile`, `FitDeps`, Hosted's `Meter` (`reserve(db: Db, { userId, task: "score_fit", now }): Promise<Result<{ reservationId: string; credits: number }, "suspended" | "cap_task_day" | "cap_day" | "cap_global" | "no_credits">>` and `refund(db: Db, { userId, ref: { reservationId }, now })`), `FEED_SCORES_PER_DAY_MAX` through `env().FEED.scoresPerDayMax`, `SCORE_DEFAULTS`.
- Produces: the Contract's `reserveScore`, `scoreItem`, `scoreEligibleItems`, `ScoreItemResult` (with reasons `"misses_filters" | "not_primary" | "wrong_state"` added to the Contract list); `FeedSettings` as spec section 4 lists it (`version: 1`, `scoresPerDay`, `alerts { threshold, trackedWithoutScore, telegramMode, emailMode, digestHours, quietHours }`), `effectiveScoreCap(settings, instanceCeiling): number` (`min(scoresPerDay, ceiling)`, never negative); `scoringStep: UserStep`.

- [ ] **Step 1: Write the failing tests** (fake AI driver recording calls; a stub Meter shaped like Hosted's, recording reserve and refund)

```ts
// settings: it("an empty document reads as the defaults") scoresPerDay 30, threshold null, trackedWithoutScore true, telegramMode "digest", emailMode "off", digestHours [9,17], quietHours { start: 21, end: 8 }
//   it("each field falls back on its own") ; it("scoresPerDay is bounded to the ceiling") effectiveScoreCap({ scoresPerDay: 80 }, 50) === 50 ; ceiling 0 -> 0
// eligibility (scoreItem, force false): it("scores a primary new item with a body that passes the filters")
//   it("is not_eligible with ai_off") ; "no_resume" ; "no_body" ; "misses_filters" (force true scores it) ; "not_primary" for duplicate_of_id set ; "wrong_state" for saved, dismissed, expired
// it("a done score stores fit_status done, fit_score and the stored fit document")
// it("makes one model call per score and none for an ineligible item")
// cap: with scoresPerDay 2 and 5 eligible items, scoreEligibleItems makes exactly 2 model calls, 2 items done, 3 capped; counters reserved 2 refused 1 (the loop stops at the first refusal)
//   it("a capped item is offered again the next local day while under 7 days old") ; it("not after 7 days")
//   it("a refusal from the Meter (no_credits, cap_task_day, cap_day, cap_global) marks the item capped and rolls back the feed count") count unchanged
//   it("a Meter that throws rolls back both") ; it("a crash after the feed reservation but before the Meter rolls back the feed count")
//   it("two concurrent scoreItem calls one below the cap: exactly one model call")
// failure: it("a failed call sets failed, keeps the feed count and refunds the Meter")
//   it("a failed item is retried once in the next pass and not again") (marker per decision below) ; it("the retry reserves again")
// order: it("scores tracked companies first, then newest") 
// it("scoreItem with force true scores an item that misses the filters, still under the cap")
// it("Meter off (freeMeter) changes nothing else")
// step: it("the scoring step runs for cron and command passes only") not home ; it("uses profile.feed.scoresPerDay bounded by FEED_SCORES_PER_DAY_MAX")
//   it("stops when the pass budget is spent")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/feed-score.test.ts tests/unit/feed-settings.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement `scoreItem`**

Sequence inside one `ctx.db.transaction(async (tx) => ...)`: check eligibility; `reserveScore(scoped(tx, userId), ...)` then `meterScore(tx, deps, ...)` (Hosted's `reserve(tx, ...)` as `score_fit`, 1 credit, on the same transaction handle; `deps.meter` absent or `freeMeter` allows everything); a refusal from either returns `capped` and the transaction rolls back (throw a private sentinel, catch it outside, then write `fit_status = "capped"` in a second small write); set `fit_status = "pending"`; after commit call `scoreFit` (same input shape as `scoreOpportunity`, `bodyMd` from `posting_md`, 20-second timeout from `scoreFit` itself); on success write `done`, `fit_score`, `fit: toStoredFit(...)`; on failure write `failed` and call `refundScore` (the Meter refund, not the feed count). `meterScore` and `refundScore` are the only two functions that touch Hosted's Meter; `refundScore` calls `deps.meter.refund(ctx.db, { userId, ref: { reservationId }, now })`. Retry marker: the spec gives `failed` no attempt counter, so a failed item carries `fit = { "failedAttempts": 1 }` (not a stored fit, so `parseStoredFit` reads it as none); the next pass retries items with `failedAttempts` of 1 and a second failure sets 2, which is final. List this under "Needs the owner's answer" in the report: a `score_attempts` column is the clean alternative. `scoreEligibleItems` selects capped items (age under 7 days), `none` items that pass, and `failed` items with `failedAttempts` 1, ordered tracked company sources first, then `first_seen_at` descending; the daily reservation stops the loop.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/feed-score.test.ts tests/unit/feed-settings.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(feed): score under a daily cap and the credit meter"
```

**Acceptance:** (1) the cap of 2 over 5 passing roles makes exactly 2 model calls (done-when, spec 5.5). (2) the feed counter and the Meter roll back together on a refusal or a crash (spec 5.5). (3) browsing misses cannot spend the cap: a miss waits for the tap (spec 5.5). (4) the Home fallback never scores (spec 5.10).

---

### Task 20: `saveFeedItem`

**Files:**
- Create: `lib/feed/save.ts`
- Modify: `lib/pipeline/create.ts` (`CreateOpportunityInput.eventMeta?: Record<string, unknown>`; the `created` event's `meta` becomes `input.eventMeta ?? {}`), `lib/db/scoped/feed-item.ts` (`listDuplicatesOf(itemId)`, `linkToOpportunity(ids, opportunityId, now)`)
- Test: `tests/integration/feed-save.test.ts`, `tests/integration/pipeline-create.test.ts`

**Interfaces:**
- Consumes: `createOpportunity`, `findActiveDuplicate`, `adoptFit`, `queueFitScoring`, `fetchAtsPosting`, `readCareersDetail`, `parseStoredFit`, `GuardedFetch`, `FitDeps`.
- Produces: `saveFeedItem`, `SaveDeps`, `SaveOutcome = { slug: string; kind: "created" | "already_saved" | "already_on_board"; scoreJob: boolean }` (the Contract's `SaveOutcome` gains `scoreJob`: true when the job was queued for scoring and the caller must run `scoreSafely` in `after()`).

- [ ] **Step 1: Write the failing tests**

```ts
// it("an already saved item returns its job's slug with kind already_saved")
// it("an item with no body gets one detail call first, 8 seconds at most") ATS item -> fetchAtsPosting called once; careers item -> readCareersDetail
// it("a failed detail call continues with no posting text") job created with posting_md null
// it("an active duplicate links the item, sets saved and returns already_on_board with the job's slug") no new job
// it("creates the job with source feed, source_url, posting text, the company's ats and allowDuplicate")
// it("the job lands in Saved with the seven stages") ; it("the created event meta is { via: 'feed', sourceKind: 'company' }")
// it("a closed duplicate does not block the add") 
// it("sets the item saved with opportunity_id and its duplicates follow") duplicates inserted with duplicate_of_id
// it("copies a done fit to the job with adoptFit") fit_status done, same score, same document
// it("an item with no fit queues the job for scoring and returns scoreJob true, outside the feed cap") feed_score_count unchanged
// it("scoreJob is false when AI is off or the resume is missing")
// it("a createOpportunity failure keeps the item's state and returns its message") 
// it("a second call after a first returns already_saved and creates no second job")
// it("returns not_found for another user's item")
// create: it("writes eventMeta on the created event and keeps {} when absent")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/feed-save.test.ts tests/integration/pipeline-create.test.ts`
Expected: FAIL, module and option missing.

- [ ] **Step 3: Implement `saveFeedItem`**

Follow spec 5.8 step for step. The `ats` input is built from the company when `ats_kind` is greenhouse, ashby or lever (`{ kind, org, region: company.atsRegion }`). The detail call uses `AbortSignal.timeout(8_000)`. The job write, the item update and the duplicate linking run in one `s.transaction`; the detail call happens before it.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/feed-save.test.ts tests/integration/pipeline-create.test.ts tests/integration/intake-add-job.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(feed): add a feed role to the board"
```

**Acceptance:** (1) all six steps of spec 5.8 are tested. (2) the job's `created` event carries `via: "feed"` (spec 4). (3) board scoring of a saved role is outside the feed cap (spec 5.8 step 6, 11.14).

---

### Task 21: Item actions, snooze and refilter

**Files:**
- Modify: `lib/feed/items.ts` (add `markSeen`, `markAllSeen`, `markGroupSeen`, `dismissItem`, `restoreItem`), `lib/feed/sources.ts` (add `snoozeSource`, `unsnoozeSource`), `app/(app)/preferences/actions.ts` (`savePreferencesAction` calls `refilterOpenItems` after saving), `lib/db/scoped/feed-item.ts` (`listOpen()`, `updateMany`)
- Create: `lib/feed/refilter.ts`
- Test: `tests/integration/feed-actions.test.ts`, `tests/integration/feed-refilter.test.ts`, `tests/integration/preferences.test.ts`

**Interfaces:**
- Consumes: `itemFilter`, `parsePreferences`, `SNOOZE_DAYS`.
- Produces: `markSeen(s, itemId, now): Promise<Result<void, "not_found">>`; `markAllSeen(s, now): Promise<number>`; `markGroupSeen(s, group: { companyId: string } | { sourceId: string }, now): Promise<number>`; `dismissItem(s, itemId, now): Promise<Result<void, "not_found" | "wrong_state">>`; `restoreItem(s, itemId, now): Promise<Result<void, "not_found" | "wrong_state">>`; `snoozeSource(s, sourceId, days: 1 | 7 | 30, now): Promise<Result<{ until: Date }, "not_found" | "invalid">>`; `unsnoozeSource(s, sourceId)`; `refilterOpenItems(s, preferences, now): Promise<{ updated: number }>`.

- [ ] **Step 1: Write the failing tests**

```ts
// it("markSeen moves new to seen, leaves seen, saved, dismissed and expired alone")
// it("dismissItem moves new or seen to dismissed and sets state_changed_at") ; it("is wrong_state from saved") ; it("dismissing a primary dismisses its duplicates in the same write")
// it("restoreItem returns a dismissed item to seen") ; it("is wrong_state from new")
// it("markGroupSeen marks only that company's or source's new items") ; it("markAllSeen marks every new item and returns the count")
// it("snoozeSource sets snoozed_until to now plus 1, 7 or 30 days") ; it("rejects 5 days") ; it("unsnoozeSource clears it")
// it("a snoozed source is not due, and a source whose snooze has passed is due again") (via dueSources)
// refilter: it("reruns the filters over new and seen items when preferences change") item flips filter_pass and filter_failed
//   it("leaves saved, dismissed and expired items alone") ; it("touches only the caller's items")
// preferences: it("saving preferences reruns the filters over the user's open items")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/feed-actions.test.ts tests/integration/feed-refilter.test.ts tests/integration/preferences.test.ts`
Expected: FAIL, functions missing.

- [ ] **Step 3: Implement**

Every state write stays in `lib/feed/items.ts` (single writer). `snoozeSource` lives in `lib/feed/sources.ts` and writes only `snoozed_until`. `savePreferencesAction` calls `refilterOpenItems(s, parsed document, new Date())` after `savePreferences`, inside the action, before `revalidatePath`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/feed-actions.test.ts tests/integration/feed-refilter.test.ts tests/integration/preferences.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib app tests
git commit -m "feat(feed): dismiss, restore, mark seen, snooze and refilter"
```

**Acceptance:** (1) the lifecycle transitions of spec 5.3 hold, including `Undo` and `Restore` returning to `seen`. (2) a preferences save reruns the filters over open items (spec 5.5). (3) snooze lengths are 1, 7 and 30 days (spec 5.6).

---

### Task 22: Feed query and loader

**Files:**
- Create: `lib/feed/query.ts` (`parseFeedQuery`, `FeedQuery`, `feedHref`), `lib/feed/list.ts` (`loadFeed`)
- Modify: `lib/db/scoped/feed-item.ts` (`listForFeed(views)` returning light columns), `lib/db/scoped/feed-source.ts` (`listWithCompany()`)
- Test: `tests/unit/feed-query.test.ts`, `tests/integration/feed-list.test.ts`

**Interfaces:**
- Consumes: `hardFilters`, `fitBand`, `parsePreferences`, `ItemFacts`.
- Produces: `FeedQuery = { view: "review" | "saved" | "dismissed" | "expired"; group: "company" | "source"; sources: string[]; min: "any" | "40" | "threshold"; misses: "hide" | "show"; modes: WorkMode[]; q: string; item: string | null; cursor: number }`; `parseFeedQuery(params: Record<string, string | string[] | undefined>): FeedQuery`; `loadFeed(s, query, now): Promise<FeedPage>` with `FeedPage = { groups: FeedGroup[]; sources: FeedSourceOption[]; total: number; shown: number; nextCursor: number | null; threshold: number; hasSources: boolean }`. Two query parameters go beyond the spec's list (`mode` for the work mode filter and `cursor` for "Show more"), recorded under D19 in the report.

- [ ] **Step 1: Write the failing tests**

```ts
// query: defaults -> { view "review", group "company", sources [], min "any", misses "hide", modes [], q "", item null, cursor 0 }
//   it("keeps valid values and falls back on invalid ones each on their own") view=bogus -> review, min=99 -> any
//   it("reads several source parameters") ; it("trims q and cuts it to 100 characters") ; it("item must be a uuid, otherwise null")
//   it("misses=show shows misses") ; it("feedHref round-trips a query") 
// loader: it("review view lists new and seen primary items, not duplicates") ; saved, dismissed, expired views
//   it("groups by company by default and by source on request") ; it("groups sort by their best item, inside a group scored items by score then newest first")
//   it("min 40 hides lower and unscored items; min threshold uses the preferences score threshold")
//   it("hides jobs that miss the filters by default, recomputed from the current preferences") item stored filter_pass true but preferences now fail it -> hidden; misses=show lists it with failed names
//   it("filters by source, work mode and a text search over title and company, case-insensitive")
//   it("renders 200 items and returns nextCursor, then the next 200 from the cursor") 450 items -> 200, 200, 50
//   it("a snoozed source's group shows its snoozed_until") ; it("another user's items never appear")
//   it("each item carries fitBand and its words from lib/fit/bands") 
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/feed-query.test.ts tests/integration/feed-list.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

`loadFeed` reads the view's light rows once, recomputes `hardFilters` from the current preferences for each, sorts in memory (the cursor is an offset into that sorted list, up to 3,000 rows plus saved ones), and slices 200. Dates stay `Date`; formatting happens in the browser through `LocalTime`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/feed-query.test.ts tests/integration/feed-list.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(feed): feed query parameters and the page loader"
```

**Acceptance:** (1) views, filters and grouping of spec 5.6 are tested. (2) pages recompute filters from current preferences (spec 5.5). (3) 200 items per page with a cursor (spec 5.6).

---

### Task 23: The Feed page

**Files:**
- Create: `app/(app)/feed/page.tsx`, `app/(app)/feed/actions.ts` (`addToBoardAction`, `dismissAction`, `restoreAction`, `markGroupSeenAction`, `markAllSeenAction`, `snoozeSourceAction`, `stopTrackingAction` re-used from Companies), `components/feed/feed-list.tsx`, `item-row.tsx`, `feed-filters.tsx`, `group-menu.tsx`, `lib/feed/row-model.ts` (chips and row copy as pure functions)
- Modify: `lib/feed/messages.ts` (add row, toast and announcement copy), `docs/design-system.md`
- Test: `tests/unit/feed-row-model.test.ts`, `tests/unit/feed-item-row.test.tsx`, `tests/unit/feed-list.test.tsx`, `tests/integration/feed-page-actions.test.ts`

**Interfaces:**
- Consumes: `loadFeed`, `parseFeedQuery`, `saveFeedItem`, `dismissItem`, `restoreItem`, `markGroupSeen`, `snoozeSource`, `fitBand`, `FIT_BAND_WORDS`, `EmptyState`, `ModeTabs`, `useAnnounce`, `LocalTime`, `Sheet`.
- Produces: `rowChips(item, ctx): string[]` returning, in order, `New`, `Changed`, the band words, `Also on N sources`, `Misses: location`; page props follow `FeedPage`.

- [ ] **Step 1: Write the failing tests**

```ts
// row model: it("chips: New for state new, Changed when changed_at is set, the fit band words when scored")
//   it("'Also on 1 source' and 'Also on 2 sources'") ; it("'Misses: location' and 'Misses: title, pay' for failed filters")
//   it("attribution via Remotive and via Remote OK for preset items") ; it("a row shows role, company, location, work mode and the posted date")
// row component: it("has 'Add to board' as the primary action and 'Dismiss'") ; it("the role button and the action buttons are siblings, never nested")
//   it("Add to board calls the action and announces 'Added to your board.'") ; it("the toast for an item already on the board says 'This job is already on your board.' with 'Open it'")
//   it("Dismiss shows a toast with 'Undo' and announces 'Dismissed.'") ; it("the Dismissed view shows 'Restore'")
// list: it("renders groups with sticky headers and counts") ; it("a snoozed group shows 'Snoozed until <date>'")
//   it("the group menu offers Snooze source (1, 7, 30 days), Mark group seen and, for a company, Stop tracking")
//   it("with no sources shows 'Track a company to see its new roles here.' and a link to Companies")
//   it("'Show more' loads the next page through the cursor") ; it("filters write the query parameters")
// actions: it("addToBoardAction returns the slug and revalidates /feed, / and /board") ; it("dismissAction and restoreAction round-trip")
//   it("every action calls requireUser") (unauthenticated -> redirect/throw as the other actions do)
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/feed-row-model.test.ts tests/unit/feed-item-row.test.tsx tests/unit/feed-list.test.tsx tests/integration/feed-page-actions.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

The registry's `FeedView` wraps each row in one `<button>`, so a row cannot also hold the action buttons without nesting interactive elements (axe `nested-interactive`). Read `data-views-shared.tsx`: use `FeedView` only if its row slot can sit beside sibling actions; otherwise build `components/feed/feed-groups.tsx` with the registry's sticky header markup (`groupAccessibleName`, `GROUP_TONE_MARK`) and rows that are an `<li>` with a role button (opens `?item=<id>`) and a sibling actions area, and record that in `docs/design-system.md` under "New application code" with the reason. Filters: source (several, combobox), "Hide jobs that miss my filters" toggle, minimum score (`Any`, `40`, `At my threshold`), work mode, search; views and grouping through `ModeTabs`. Every mutation announces itself through the live region. `app/(app)/feed/page.tsx` calls `requireUser()`, loads the page and renders `?item=` through Task 24's sheet.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration/feed-page-actions.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app components lib docs tests
git commit -m "feat(feed): the Feed page with views, filters, grouping and row actions"
```

**Acceptance:** (1) views, filters, grouping, chips and row actions follow spec 5.6. (2) every list mutation announces itself (spec 5.6). (3) no nested interactive elements (spec 8, Accessibility). (4) the empty state copy is the spec's (spec 5.6).

---

### Task 24: The item sheet

**Files:**
- Create: `components/feed/item-sheet.tsx`, `lib/feed/detail.ts` (`loadItemDetail`), `lib/feed/sheet-model.ts` (`feedFitView`), additions to `app/(app)/feed/actions.ts` (`openItemAction`, `scoreThisJobAction`)
- Modify: `app/(app)/feed/page.tsx` (render the sheet for `?item=`), `lib/feed/messages.ts`
- Test: `tests/unit/feed-sheet-model.test.ts`, `tests/unit/feed-item-sheet.test.tsx`, `tests/integration/feed-detail.test.ts`

**Interfaces:**
- Consumes: `findClosedDuplicate`, `hardFilters`, `filterDetail`, `FILTER_ROW_LABELS`, `FitResult` and the fit card pieces (`components/fit/fit-result.tsx`, `use-scoring-refresh.ts`), `scoreItem`, `markSeen`, `Markdown`, `FIT_POLL_MS`, `FIT_POLL_MAX`.
- Produces: `ItemDetail = { item; bodyMd: string | null; checks: HardFilterCheck[]; fit: FeedFitView; sourceLabel: string; attribution: string | null; originalUrl: string; closedDuplicate: { slug: string } | null; onBoard: { slug: string } | null }`; `FeedFitView = "scored" | "scoring" | "unscored" | "capped" | "failed" | "ai_off" | "no_resume" | "no_body"` with its model; `openItemAction(itemId): Promise<{ state: ...; fit: FeedFitView }>`; `scoreThisJobAction(itemId)`.

- [ ] **Step 1: Write the failing tests**

```ts
// model: it("scored shows the fit card with the band words") ; it("capped says 'Scoring resumes tomorrow.'") ; it("unscored and eligible shows the button 'Score this job'")
//   it("ai_off and no_resume give their reason once, not a button") ; it("failed offers 'Score this job' again")
// detail: it("loads the body, the recomputed filter checks and the source label") ; it("closed duplicate: 'You had this job before' with a link to that job")
//   it("a saved item shows 'On your board' with its job link") ; it("a Remotive item carries 'via Remotive'")
// sheet: it("renders the body through the sanitized markdown renderer, raw HTML off") ; it("Open original is a link with rel 'noopener noreferrer nofollow'")
//   it("shows the filter checks as the fit card does") ; it("full height on phone") ; it("closing removes ?item from the URL")
// actions: it("opening marks a new item seen") ; it("opening an eligible unscored item scores it at once under the cap") 
//   it("opening an item that misses the filters scores nothing until Score this job") ; it("scoreThisJobAction scores a miss with force and reserves from the cap")
//   it("the sheet polls at FIT_POLL_MS while the item is pending, at most FIT_POLL_MAX times")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/feed-sheet-model.test.ts tests/unit/feed-item-sheet.test.tsx tests/integration/feed-detail.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

The sheet is the `base-nova` `Sheet`, opened by the `item` query parameter. It sets focus to the sheet heading on open and returns focus to the row on close. A missing body triggers one detail call from `openItemAction` (the 8-second rule of spec 5.8 step 2 applies to saving; opening follows spec 5.2: a detail call for an item the user opens). The page `export const maxDuration = 60` covers a scoring action.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration/feed-detail.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app components lib tests
git commit -m "feat(feed): the item sheet, opening marks seen and scores under the cap"
```

**Acceptance:** (1) the sheet shows body, checks, fit or the reason there is none, source and "Open original" as spec 5.6 lists. (2) opening an eligible unscored item scores it; a miss waits for the tap (spec 5.5). (3) "You had this job before" links to the closed job (spec 5.4).

---

### Task 25: Home card and navigation

**Files:**
- Create: `components/home/new-roles-card.tsx`, `lib/attention/new-roles.ts` (`loadNewRoles`)
- Modify: `lib/attention/load.ts` (`HomeData.newRoles`), `app/(app)/page.tsx` (card under the attention list in the main column, after it on phone), `components/app-shell.tsx` (`NAV_ITEMS` becomes Home, Board, Companies, Feed, Library, Preferences, Settings with `{ id: "feed", label: "Feed", href: "/feed" }`), `components/home/home-skeleton.tsx`
- Test: `tests/integration/home-new-roles.test.ts`, `tests/unit/new-roles-card.test.tsx`, `tests/unit/app-shell-nav.test.tsx`; update `tests/e2e/nav.spec.ts` expectations

**Interfaces:**
- Consumes: `hardFilters`, `fitBand`, `saveFeedItem` actions from Task 23, `parsePreferences`.
- Produces: `NewRolesCard = { items: NewRoleRow[]; total: number; lastCheck: Date | null }` and `loadNewRoles(s, now, preferences): Promise<NewRolesCard | null>` (null when the user has no enabled source); rows are up to 5 `new` primary items passing the filters from sources that are not snoozed, ordered by score (unscored after scored) then newest.

- [ ] **Step 1: Write the failing tests**

```ts
// loader: it("is null when the user has no source") ; it("lists up to 5 new primary items that pass the filters")
//   it("orders scored before unscored, higher score first, then newest") ; it("skips snoozed sources, seen items, duplicates and misses")
//   it("total counts every such item, not just 5") ; it("lastCheck is the newest last_scan_at")
// card: it("shows 'New roles' with role, company, location, the fit chip when scored, 'Add to board' and 'Dismiss'")
//   it("the footer reads 'See all 14 new on Feed' and links to /feed") ; it("with sources and nothing new shows 'Last checked <time>.'")
//   it("is absent with no sources") ; it("Add to board and Dismiss call the Feed actions")
// nav: it("NAV_ITEMS order is Home, Board, Companies, Feed, Library, Preferences, Settings") ; it("phone tabs stay Home, Board, Companies and Feed is the first More item")
//   it("Feed is marked current on /feed")
// home: it("the card sits under the attention list and the attention items are unchanged")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/home-new-roles.test.ts tests/unit/new-roles-card.test.tsx tests/unit/app-shell-nav.test.tsx tests/integration/attention.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

`loadHome` calls `loadNewRoles` in its existing `Promise.all`. The Home page keeps its `Suspense` boundary; the card renders inside `HomeContent` below `AttentionList`. The bell is not part of this task (Milestone 18).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration/home-new-roles.test.ts tests/integration/attention.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app components lib tests
git commit -m "feat(home): the New roles card and Feed in the navigation"
```

**Acceptance:** (1) the card follows spec 5.7 (five rows, ordering, footer, one-line empty case, absent with no sources). (2) the attention list stays first and unchanged (spec 5.7, principle 17). (3) Feed is the first More item on phone (spec 5.7).

---

### Task 26: Export additions (feed tables)

**Files:**
- Modify: `lib/export/collect.ts` (`feedSources`, `feedItems`, `scanRuns`, `profile.feed`), `lib/db/scoped/feed-source.ts`, `feed-item.ts`, `scan-run.ts` (add `listAll()` to each)
- Test: `tests/integration/export.test.ts`

**Interfaces:**
- Consumes: `withoutUserId`, `parseFeedSettings`.
- Produces: `collectExport` keys `feedSources`, `feedItems`, `scanRuns` (rows without `userId`) and `profile.feed` (parsed `FeedSettings`).

- [ ] **Step 1: Write the failing tests**

```ts
// it("exports the user's feed sources, items and scan runs without userId")
// it("exports profile.feed as a parsed document with defaults filled")
// it("exports nothing of another user")
// it("an export of an account with no feed data has empty arrays")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/export.test.ts`
Expected: FAIL, keys missing.

- [ ] **Step 3: Implement**

Extend the `Promise.all` and the returned object; keep `EXPORT_VERSION` at 1 (additive keys).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/export.test.ts tests/integration && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(export): feed sources, items, scan runs and feed settings"
```

**Acceptance:** (1) the export carries the three tables and `profile.feed` (spec 4, last paragraph). (2) no `userId` and nothing of other users (spec 7).

---

### Task 27: End to end, docs and ship

**Files:**
- Create: `tests/e2e/feed-page.spec.ts`, `tests/integration/feed-done-when-m17.test.ts`
- Modify: `playwright.config.ts` (the `feed-*` chain already matches `feed-.*\.spec\.ts`), `tests/fixtures/feed/manifest.json` (a five-role board for the cap test), `.env.example` (`FEED_SCORES_PER_DAY_MAX` comment), `README.md` (Feed page and scoring cap paragraph), `docs/design-system.md` (new row, card, sheet pieces)
- Test: the files above

**Blocked on:** Step 6 needs a model key on the preview.

- [ ] **Step 1: Write the integration test of the cap**

```ts
// tests/integration/feed-done-when-m17.test.ts
// it("with scoresPerDay 2, a scan of 5 passing roles makes exactly 2 model calls") fake driver calls.length === 2; 2 items done, 3 capped
// it("a saved role from a tracked company has its score on the job") saveFeedItem -> job.fit_status done, fit_score equals the item's
```

- [ ] **Step 2: Write the Playwright spec** (fixture fetch, fake AI driver; the spec sets a resume and title preferences through the existing forms, as `fit.spec.ts` does)

```ts
// feed-page.spec.ts
// test("a role reaches the board from Home in two taps with its score on the card") track Northwind Traders, runFeedScan, open Home,
//   tap 'Add to board' on the New roles card, tap 'Open it' in the toast, the job page shows the fit card with the score
// test("dismiss and undo on Feed") toast 'Undo' returns the row ; test("restore from the Dismissed view")
// test("snooze a source for 7 days") group shows 'Snoozed until'; its items leave the Home card
// test("open an item sheet from /feed?item=<id>") body, filter checks, 'Open original'; the row becomes seen
// test("a miss waits for 'Score this job'") ; test("Mark group seen")
// test("keyboard only: Add to board and Dismiss") focus order and live-region text
// axe on /feed (with sheet open), Home with the card, in light and dark
// phone project: Feed reached from the More sheet, the item sheet is full height, no horizontal scroll
```

- [ ] **Step 3: Run the new tests and watch the e2e fail first**

Run: `pnpm vitest run tests/integration/feed-done-when-m17.test.ts && pnpm test:e2e --project=feed-chromium -g "two taps"`
Expected: the integration test passes if Tasks 18 to 26 are right; the e2e FAILS until the spec's fixtures exist.

- [ ] **Step 4: Add the fixtures and docs**

Add the five-role board to the manifest; write the README paragraph on the cap (30 a day, $0.29 a day at most per user who hits it every day, spec 5.12).

- [ ] **Step 5: Run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`
Expected: PASS in Chromium, WebKit and the phone project.

- [ ] **Step 6: Preview check with a real model (blocked on the owner's key)**

On the preview with `AI_PROVIDER` set: track a real board, open an item, see a real score; confirm `[fit]` log lines and that the daily count stops at the cap. Record in the PR.

- [ ] **Step 7: Commit and open the pull request**

```bash
git add -A
git commit -m "feat(feed): milestone 17 feed page, scoring cap, home card, end to end"
git push -u origin feat/m17-feed
```

Open a PR to `main`, deploy a Vercel preview, give the link, and check Chrome and Safari by hand on desktop and at a phone viewport (Feed, the sheet, Home).

**Acceptance:** (1) both halves of the done-when pass (spec 9, row 17). (2) the e2e covers Home to board, dismiss and undo, snooze, the sheet, keyboard use and the phone path (spec 8). (3) axe clean in light and dark on `/feed` and Home (spec 8).
