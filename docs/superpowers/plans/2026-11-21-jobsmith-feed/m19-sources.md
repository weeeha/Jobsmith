# Milestone 19: Sources

**Done when (spec section 9):** "A fictional posting that arrives from a tracked company and from an RSS feed shows once on `/feed` with 'Also on 1 source', and a Remotive item shows 'via Remotive' and links to its site."

**Branch:** `feat/m19-sources`, cut from `main` after Milestone 18 is merged.

**Blocked on:** a person reads the current terms of Remotive and Remote OK and copies the category and tag lists (Task 40 Step 0 and Task 42 Step 0). If either site's terms forbid this use, that preset is dropped: the owner decides, the task report says which, and the rest of the plan is unchanged. This milestone is the first cut if the cycle runs long (spec 11.12).

## Before starting

```bash
bash -c 'test -f lib/feed/schedule.ts && test -f lib/feed/score.ts && test -f lib/notify/write.ts && test -f app/\(app\)/feed/page.tsx && test -f lib/feed/items.ts && echo m16-m18-present'
bash -c 'grep -n "alsoOn" lib/feed/row-model.ts lib/feed/list.ts | head'
```

If Milestones 16 to 18 are not merged, stop. Milestone 19 touches no Hosted module, so a missing Hosted milestone changes nothing here. Run `pnpm install` and `pnpm test` first and note the green baseline.

---

### Task 40: Preset lists, XML helper, RSS title parsing

**Files:**
- Modify: `lib/feed/values.ts` (`REMOTIVE_CATEGORIES`, `REMOTEOK_TAGS`, `PRESET_ATTRIBUTION`)
- Create: `lib/feed/listing/xml.ts` (`parseXml`), `lib/feed/listing/rss-title.ts` (`splitTitle`), `tests/fixtures/feed/rss-2.xml`, `atom.xml`, `rss-doctype.xml`
- Test: `tests/unit/feed-xml.test.ts`, `tests/unit/feed-rss-title.test.ts`, `tests/unit/feed-values.test.ts`

**Interfaces:**
- Consumes: `parseHTML` or `DOMParser` from `linkedom` (XML mode).
- Produces: `REMOTIVE_CATEGORIES: readonly string[]` and `REMOTEOK_TAGS: readonly string[]` (slugs copied from each site's current public documentation in Step 0); `PRESET_ATTRIBUTION = { remotive: "Remotive", remoteok: "Remote OK" } as const`; `parseXml(text: string): Result<Document, "unreadable">` (strips any `<!DOCTYPE ...>` including an internal subset before parsing, so no entity expansion happens); `splitTitle(title: string, fallback: { author: string | null; feedTitle: string | null; host: string }): { companyName: string; roleTitle: string; workMode: WorkMode | null }`.

- [ ] **Step 0: Read the terms and copy the lists (a person)**

Open Remotive's and Remote OK's current API documentation and terms. Confirm each still allows a personal job tracker to read the public endpoint, store the items and show them with attribution and a link back. Copy the category list (Remotive) and the tag list (Remote OK) into `lib/feed/values.ts`. If a site's terms forbid the use, leave that list out, delete that preset's tasks from this plan and tell the owner. Record the date and the two terms URLs in the task report.

- [ ] **Step 1: Write the failing tests**

```ts
// xml: it("parses RSS 2.0 and Atom 1.0") ; it("strips a DOCTYPE with an internal entity subset so no entity expands") billion-laughs fixture: the text of the parsed title never contains the expansion
//   it("returns unreadable for text that is not XML") ; it("keeps namespaces readable") (dc:creator, atom:link)
// title: it("'Northwind Traders: Senior Product Designer' splits on the colon when the part before it is up to 60 characters")
//   it("'Senior Product Designer at Northwind Traders' splits on the last ' at '") ; it("a colon part over 60 characters is not a company: whole title is the role, company from the author")
//   it("a trailing '(Remote)' sets workMode remote and is removed from the role") ; it("'(Remote)' is case-insensitive and only trailing")
//   it("with no company in the title, the item's author is the company, then the feed's title, then the host")
//   it("colon rule wins over ' at ' when both are present") ; it("trims whitespace and never returns an empty role: an empty title returns the host as role is not allowed, the item is skipped by the caller")
// values: it("preset lists are non-empty, unique slugs matching ^[a-z0-9-]+$") ; it("attribution words are 'Remotive' and 'Remote OK'")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/feed-xml.test.ts tests/unit/feed-rss-title.test.ts tests/unit/feed-values.test.ts`
Expected: FAIL, modules and constants missing.

- [ ] **Step 3: Implement**

`splitTitle` returns `roleTitle: ""` for an empty title so the reader can skip that item and count it in `skipped`. The regex for the DOCTYPE strip must handle `<!DOCTYPE name [ ... ]>`; test it with the nested-bracket fixture.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/feed-xml.test.ts tests/unit/feed-rss-title.test.ts tests/unit/feed-values.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(feed): preset lists, safe XML parsing and RSS title rules"
```

**Acceptance:** (1) title rules match spec 5.9 (colon up to 60 characters, "Role at Company", fallbacks, trailing "(Remote)"). (2) a doctype never expands entities (spec 7). (3) the preset lists come from the sites' current documentation (spec 5.9).

---

### Task 41: RSS and Atom reader

**Files:**
- Create: `lib/feed/listing/rss.ts` (`readRss`, `validateFeedUrl`)
- Modify: `tests/helpers/feed.ts` (`rssFeed(items)` builder)
- Test: `tests/unit/feed-rss.test.ts`

**Interfaces:**
- Consumes: `parseXml`, `splitTitle`, `htmlToMarkdown`, `urlExternalId`, `matchAtsUrl`, `GuardedFetch` (`accept: "xml"`), `FEED_LIMITS.rssItems`.
- Produces: `readRss: ListingReader` (always returns `complete: false`: feeds roll items off with no signal, so nothing is ever counted missing; age expiry covers them in Task 43); `validateFeedUrl(url: string, deps: ReaderDeps): Promise<Result<{ title: string | null; items: number }, "not_a_feed" | ScanErrorCode>>`.

- [ ] **Step 1: Write the failing tests**

```ts
// it("maps RSS 2.0: guid to externalId, link to url, pubDate to postedAt, description through htmlToMarkdown to bodyMd")
// it("maps Atom 1.0: id, the link with rel alternate (not self or edit), published else updated, content")
// it("uses the url hash as externalId when there is no guid or id") ; it("skips an item with no link or an empty role and counts it in skipped")
// it("company and role come from splitTitle with the item's author (author, dc:creator, Atom author name) and the feed's title as fallbacks")
// it("a trailing (Remote) sets workMode remote")
// it("reads at most 200 items per fetch and leaves skipped untouched for the rest")
// it("always returns complete false") ; it("sends If-None-Match from the source etag and returns notModified on a 304")
// it("accepts application/rss+xml, application/atom+xml, application/xml and text/xml and fails unsupported_type on text/html")
// it("a doctype in the feed does not expand entities") ; it("passes rate_limited through with retryAfterSeconds")
// it("makes no robots request") assert the fetch calls never include /robots.txt
// validate: it("accepts a feed with at least one item and returns its title and item count") ; it("an HTML page is not_a_feed")
//   it("a feed with zero items is not_a_feed") ; it("XML that is neither RSS nor Atom is not_a_feed") ; it("a fetch failure passes its code through")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/feed-rss.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement**

One guarded request per read, `accept: "xml"`, `headers: { "user-agent": FEED_USER_AGENT }`. Items read in document order and cut at 200; the Listing's `etag` and `lastModified` come from the response. An item link that matches an ATS posting is left for the detail step in Task 44 (the reader does not make that call).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/feed-rss.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(feed): RSS and Atom reader and feed link validation"
```

**Acceptance:** (1) the mapping table of spec 5.9 holds for RSS and Atom. (2) a link that is not a feed is detected by one fetch (spec 5.9). (3) feeds skip robots (spec 5.2, 5.9).

---

### Task 42: Remotive and Remote OK readers

**Files:**
- Create: `lib/feed/listing/remotive.ts`, `lib/feed/listing/remoteok.ts`, `tests/fixtures/feed/remotive.json`, `remoteok.json`
- Test: `tests/unit/feed-presets.test.ts`

**Interfaces:**
- Consumes: `htmlToMarkdown`, `REMOTIVE_CATEGORIES`, `REMOTEOK_TAGS`, `GuardedFetch` (`accept: "json"`), `workModeFromText`.
- Produces: `readRemotive: ListingReader` (`GET https://remotive.com/api/remote-jobs?category=<slug>`; slug from `source.params.category`) and `readRemoteOk: ListingReader` (`GET https://remoteok.com/api?tag=<tag>`; tag from `source.params.tag`). Both return `complete: false` (window listings), `workMode: "remote"`, `url` the posting's own page on that site, and no pay unless the site states numbers.

**Blocked on:** Step 0 (the terms check of Task 40 stays in force; drop a preset the owner rules out).

- [ ] **Step 0: Confirm the field names against the live API documentation (a person)**

Read each site's current API documentation. Confirm the fields the mapping below uses; if a name changed, change the mapping and the fixtures, and note it in the report. Do not call either API from a test.

- [ ] **Step 1: Write the failing tests** (fictional postings from Northwind Traders)

```ts
// remotive: it("requests remote-jobs with the category parameter") ; it("an unknown category fails invalid_url with zero requests")
//   it("maps id to externalId, url, title, company_name, candidate_required_location to location, publication_date to postedAt, description through htmlToMarkdown")
//   it("sets workMode remote and no pay") ; it("an element that fails its schema is skipped and counted") ; it("a non-object answer is unreadable")
// remoteok: it("requests the api with the tag parameter") ; it("an unknown tag fails invalid_url with zero requests")
//   it("skips the first array element, which is the legal notice") ; it("an array holding only the notice is an empty listing")
//   it("maps id to externalId, url (the posting on remoteok.com, not apply_url), position, company, location, epoch seconds to postedAt, description to bodyMd")
//   it("pay: salary_min and salary_max become compMin and compMax only when above 0, with no currency") ; it("sets workMode remote")
// both: it("complete is false") ; it("sends the Jobsmith user agent") ; it("passes rate_limited through") ; it("reads at most 500 entries")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/feed-presets.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

Zod-parse each element on its own. Build the request URL with `URLSearchParams`. Attribution is not set here: `lib/feed/items.ts` sets `attribution` from the source kind (Task 43).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/feed-presets.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(feed): Remotive and Remote OK preset readers"
```

**Acceptance:** (1) endpoints and field mapping follow spec 5.9 and the port sources of section 10. (2) Remote OK's first element is skipped (spec 5.9). (3) every item links to its posting on the site (spec 5.9).

---

### Task 43: Cross-source dedupe, takeover, expiry

**Files:**
- Modify: `lib/feed/dedupe.ts` (`findCrossSourcePrimary`), `lib/feed/items.ts` (`applyListing` new-item path: cross-source match, takeover, attribution, aggregator `company_id` by `name_key`; `expireByAge`; promotion when a primary expires), `lib/db/scoped/feed-item.ts` (`findPrimaryByHash(hash, excludeSourceId)`, `repointDuplicates(fromId, toId)`, `countDuplicatesByPrimary(ids)`, `listDuplicatesOf(id)`)
- Test: `tests/integration/feed-cross-source.test.ts`

**Interfaces:**
- Consumes: `companyNameKey`, `PRESET_ATTRIBUTION`, `FEED_LIMITS.aggregatorExpiryDays`.
- Produces: `findCrossSourcePrimary(s, hash, excludeSourceId): Promise<FeedItemRow | null>`; `expireByAge(s, source: FeedSourceRow, now: Date): Promise<number>`; the new-item path writes `duplicate_of_id`, takes over, sets `attribution`, sets `company_id`; `countDuplicatesByPrimary(ids): Promise<Map<string, number>>`.

- [ ] **Step 1: Write the failing tests**

```ts
// it("an RSS item whose hash matches a non-expired company item becomes its duplicate: hidden, never scored, never alerted, counted on the primary")
// it("a company item arriving after an aggregator primary takes over in one transaction: it inherits state, opportunity_id and the fit, and the old primary becomes its duplicate")
//   the old primary's own duplicates are repointed to the new primary
// it("between two aggregators the earliest first_seen_at stays primary")
// it("two roles with the same hash inside one source are both primary") 
// it("an expired item from another source does not match") ; it("a duplicate of a dismissed primary stays hidden under it")
// it("when a primary expires the earliest remaining duplicate becomes primary and the others repoint") (decision D22: otherwise a role would stay hidden forever)
// it("sets attribution Remotive or Remote OK from the source kind and null for RSS and company sources")
// it("an aggregator item whose company name matches one of the user's companies by name_key gets that company_id, otherwise null")
// it("an RSS or preset item expires 30 days after first_seen_at when new or seen, and not at 29 days") ; it("saved items never expire by age")
// it("countDuplicatesByPrimary counts duplicates per primary") ; it("dismissing or saving a primary applies to its duplicates in the same write") (Tasks 20 and 21 cases re-run on real duplicates)
// it("a duplicate stores no posting_md") ; it("never touches another user's items")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/feed-cross-source.test.ts`
Expected: FAIL, functions missing.

- [ ] **Step 3: Implement**

Order in the new-item path: board dedupe first (born `saved`), then cross-source (duplicate or takeover), then filters. The takeover runs in `s.transaction`: update the new row with the old primary's `state`, `opportunity_id`, `fit_status`, `fit_score`, `fit`, `notified_at`; set the old primary's `duplicate_of_id`; `repointDuplicates(old.id, new.id)`. The primary rule is spec 5.4: tracked-company item first, otherwise earliest. The promotion rule when a primary expires is a plan decision (D22, add to the report). `lib/feed/items.ts` stays the only writer of item state.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/feed-cross-source.test.ts tests/integration/feed-items.test.ts tests/integration/feed-actions.test.ts tests/integration/feed-save.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(feed): cross-source duplicates, takeover and aggregator expiry"
```

**Acceptance:** (1) primary selection and takeover follow spec 5.4. (2) duplicates are hidden and counted (spec 5.4). (3) aggregator items expire at 30 days (spec 5.3). (4) `company_id` is set by `name_key` for aggregator items (spec 4, `feed_item`).

---

### Task 44: Sources writer and scan by kind

**Files:**
- Modify: `lib/feed/sources.ts` (`addSource`, `setSourceEnabled`, `setSourceInterval`, `deleteSource`; types `AddSourceInput`, `AddSourceError`), `lib/feed/scan.ts` (`readerFor` handles `rss`, `remotive`, `remoteok`; the detail step covers RSS items whose link matches an ATS posting; `expireByAge` runs for those kinds; robots never run for them), `lib/db/scoped/feed-source.ts` (`countOtherSources()`)
- Test: `tests/integration/feed-sources-other.test.ts`, `tests/integration/feed-scan-kinds.test.ts`

**Interfaces:**
- Consumes: `validateFeedUrl`, `readRss`, `readRemotive`, `readRemoteOk`, `isLoginWalled`, `matchAtsUrl`, `fetchAtsPosting`, `FEED_LIMITS`, `PRESET_MIN_INTERVAL_HOURS`, `REMOTIVE_CATEGORIES`, `REMOTEOK_TAGS`.
- Produces: `addSource(s, input: { kind: "rss" | "remotive" | "remoteok"; url?: string; label?: string; params?: { category?: string; tag?: string }; intervalHours?: number }, deps: { fetch: GuardedFetch; now: Date }): Promise<Result<{ sourceId: string }, "invalid" | "login_walled" | "not_a_feed" | "limit" | "duplicate" | "fetch_failed">>` (RSS validated by one fetch; presets need none); `setSourceEnabled(s, sourceId, enabled)`; `setSourceInterval(s, sourceId, hours: 3 | 6 | 12 | 24): Promise<Result<void, "not_found" | "invalid">>` (presets at least 12); `deleteSource(s, sourceId): Promise<Result<void, "not_found">>`.

- [ ] **Step 1: Write the failing tests**

```ts
// add: it("adds an RSS feed after one validating fetch, interval 6 by default") ; it("rejects a link that is not a feed with not_a_feed and writes nothing")
//   it("refuses a LinkedIn link before any request") ; it("rejects a label over 80 characters") ; it("adds a Remotive preset with a category from the list, interval 12 by default, and no validating fetch")
//   it("rejects a category or tag outside the fixed list") ; it("rejects a preset interval under 12") ; it("limits other sources to 20; tracked companies do not count")
//   it("refuses the same feed link twice with duplicate") ; it("a failed validating fetch returns fetch_failed and writes nothing")
// manage: it("pause and resume toggle enabled; for a company source they toggle company.tracked together and keep the items" ) (decision D23: Stop tracking, not Pause, deletes items)
//   it("changing the interval accepts 3, 6, 12 and 24 for feeds and company sources and refuses under 12 for presets") ; it("deleteSource removes an RSS or preset source and its items and scan runs, and for a company source calls stopTracking")
// scan by kind (fixture fetch): it("scans an RSS source: items inserted with no attribution, listed_count, scan_run, next_scan_at")
//   it("an RSS item linking to a Greenhouse posting gets its body, location and work mode from the vendor adapter") 
//   it("a Remotive item has attribution Remotive and a Remote OK item Remote OK") ; it("no robots.txt request is made for RSS, Remotive or Remote OK")
//   it("an RSS or preset scan never counts anything missing") ; it("expires aggregator items older than 30 days during the scan")
//   it("a failing feed follows the same health and backoff rules") ; it("presets are not scanned more often than every 12 hours")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/feed-sources-other.test.ts tests/integration/feed-scan-kinds.test.ts`
Expected: FAIL, functions missing.

- [ ] **Step 3: Implement**

`addSource` validates fields with one Zod schema (explicit messages: `Enter a link that starts with http or https.`, `That link is not a feed.`, `Keep the name under 80 characters.`, `Pick a category from the list.`, `Presets check at most every 12 hours.`, `You have 20 other sources. Delete one to add another.`). `lib/feed/sources.ts` stays the only writer of `feed_source` and `company.tracked`; `setSourceEnabled` on a company source writes both inside one transaction.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/feed-sources-other.test.ts tests/integration/feed-scan-kinds.test.ts tests/integration/feed-scan.test.ts tests/integration/feed-sources.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(feed): add, pause and delete other sources and scan them by kind"
```

**Acceptance:** (1) at most 20 other sources, intervals as spec 5.12. (2) feeds are validated by one fetch (spec 5.9). (3) presets at 12 hours or more (spec 5.9, 5.12). (4) robots never apply to ATS APIs and feeds (spec 5.2, 11.9).

---

### Task 45: `/feed/sources` and Add source

**Files:**
- Create: `app/(app)/feed/sources/page.tsx` (`maxDuration = 60`), `app/(app)/feed/sources/actions.ts` (`addSourceAction`, `pauseSourceAction`, `resumeSourceAction`, `setIntervalAction`, `checkNowSourceAction`, `deleteSourceAction`), `components/feed/source-row.tsx`, `components/feed/add-source-dialog.tsx`, `lib/feed/sources-view.ts` (`loadSourcesView`)
- Modify: `app/(app)/feed/page.tsx` (a link `Sources` in the page header), `app/(app)/companies/page.tsx` (card `id={company.id}` so a source row can link to its card), `lib/feed/messages.ts`, `docs/design-system.md`
- Test: `tests/integration/feed-sources-view.test.ts`, `tests/unit/feed-source-row.test.tsx`, `tests/unit/add-source-dialog.test.tsx`, `tests/integration/feed-sources-actions.test.ts`

**Interfaces:**
- Consumes: `addSource`, `setSourceEnabled`, `setSourceInterval`, `deleteSource`, `canCheckNow`, `scanSource`, `trackingView`, `HEALTH_REASONS`, `UNSUPPORTED_MESSAGES`, `warningLine`, `EmptyState`.
- Produces: `SourceRowView = { id; label: string; kindLabel: string; companyHref: string | null; health: FeedHealth; healthLine: string | null; lastCheck: Date | null; listed: number; intervalHours: number; enabled: boolean; snoozedUntil: Date | null; canCheckNow: boolean; attribution: string | null }`; `loadSourcesView(s, now): Promise<SourceRowView[]>`.

- [ ] **Step 1: Write the failing tests**

```ts
// view: it("lists every source, tracked companies first, each company source linking to /companies#<companyId>") ; it("shows kind labels 'Company', 'RSS or Atom feed', 'Remotive', 'Remote OK'")
//   it("health, last check and roles listed per source") ; it("another user's sources never appear")
// row: it("shows pause, resume, interval, check now and delete") ; it("an unsupported or failing source shows its reason in words and no Check now while unsupported")
//   it("check now is disabled with 'Checked a moment ago' inside 10 minutes") ; it("an interval select offers 3, 6, 12, 24 and only 12 and 24 for presets")
//   it("delete asks 'Delete this source and its roles? Roles already on your board stay.'")
// dialog: it("offers 'RSS or Atom feed', 'Remotive' and 'Remote OK'") ; it("the feed kind has a link and an optional name; presets have a category or tag select")
//   it("shows 'That link is not a feed.' for not_a_feed") ; it("states the attribution line for presets: items show 'via Remotive' and link to the posting on that site")
//   it("announces 'Source added.'") ; it("the 20-source limit message is shown")
// actions: it("every action calls requireUser") ; it("addSourceAction runs the first scan with trigger first and returns the sentence of Found N open roles") 
//   it("checkNowSourceAction answers too soon inside 10 minutes") ; it("deleteSourceAction deletes a feed source and stops tracking a company source")
// page: it("with no sources shows the empty state 'Track a company to see its new roles here.' with 'Add source'")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/feed-sources-view.test.ts tests/unit/feed-source-row.test.tsx tests/unit/add-source-dialog.test.tsx tests/integration/feed-sources-actions.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

The dialog follows the Add job dialog and the Track dialog (Task 15): one form, typed result, focus and toast fallbacks through `lib/forms/submit.ts`. Reuse `tracking-line`'s health words so Companies and `/feed/sources` read the same. Record the source row and dialog under "New application code" in `docs/design-system.md`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration/feed-sources-view.test.ts tests/integration/feed-sources-actions.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app components lib docs tests
git commit -m "feat(feed): the sources page and the Add source dialog"
```

**Acceptance:** (1) every action of spec 5.6 (pause, resume, interval, check now, delete) exists with its health and last check. (2) Add source offers the three kinds of spec 5.9. (3) with no sources the empty state is the spec's (spec 5.6).

---

### Task 46: Row and sheet: Also on N, attribution

**Files:**
- Modify: `lib/feed/list.ts` (`alsoOnCount` per item from `countDuplicatesByPrimary`), `lib/feed/row-model.ts` (the chip reads the count), `lib/feed/detail.ts` and `components/feed/item-sheet.tsx` (a line `Also on 1 source: <label>` listing the other sources' labels; the attribution line `via Remotive` and an `Open original` link to the posting on that site), `components/feed/item-row.tsx`
- Test: `tests/integration/feed-list.test.ts`, `tests/unit/feed-row-model.test.ts`, `tests/unit/feed-item-sheet.test.tsx`, `tests/integration/feed-detail.test.ts`

**Interfaces:**
- Consumes: `countDuplicatesByPrimary`, `listDuplicatesOf`, `PRESET_ATTRIBUTION`.
- Produces: `FeedItemView.alsoOnCount: number`; `ItemDetail.alsoOn: { label: string }[]` (source labels: the company's name or the source's `label`, or `Remotive` and `Remote OK`).

- [ ] **Step 1: Write the failing tests**

```ts
// list: it("a primary with one duplicate from another source has alsoOnCount 1 and its duplicate is not listed")
//   it("alsoOnCount counts duplicates, never the item itself") ; it("a duplicate is hidden from every view including Saved") 
// row: it("shows 'Also on 1 source' and 'Also on 2 sources'") ; it("shows 'via Remotive' and 'via Remote OK' for preset items and nothing for RSS")
// sheet: it("lists the other sources by label") ; it("shows the attribution and 'Open original' pointing at the site's own posting URL with rel 'noopener noreferrer nofollow'")
// detail: it("alsoOn labels come from the duplicates' sources")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/feed-list.test.ts tests/unit/feed-row-model.test.ts tests/unit/feed-item-sheet.test.tsx tests/integration/feed-detail.test.ts`
Expected: FAIL on the new assertions.

- [ ] **Step 3: Implement**

The loader batches one `countDuplicatesByPrimary` call per page. Titles stay plain text; the attribution word is fixed copy, never the feed's own text.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration/feed-list.test.ts tests/integration/feed-detail.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib components tests
git commit -m "feat(feed): also-on counts and attribution on rows and the item sheet"
```

**Acceptance:** (1) "Also on N sources" shows on the primary only (spec 5.4, 5.6). (2) preset items show "via Remotive" or "via Remote OK" and link to the site (spec 5.9).

---

### Task 47: End to end, docs and ship

**Files:**
- Create: `tests/e2e/feed-sources.spec.ts`, `tests/integration/feed-done-when-m19.test.ts`, `tests/fixtures/feed/rss-northwind.xml`, `tests/fixtures/feed/remotive-northwind.json`
- Modify: `tests/fixtures/feed/manifest.json` (the RSS feed URL, the Remotive endpoint for one category, a Remote OK endpoint for one tag), `README.md` ("Other sources": RSS, Remotive and Remote OK, attribution and the terms note), `docs/design-system.md`, `.env.example` (no new variable; check)
- Test: the files above

- [ ] **Step 1: Write the integration test of the done-when**

```ts
// feed-done-when-m19.test.ts
// it("a posting from a tracked company and from an RSS feed shows once on /feed with 'Also on 1 source'") the Greenhouse fixture role and the RSS item share company, title and (absent) location so their dedupe hashes match;
//   loadFeed returns one row for it with alsoOnCount 1
// it("a Remotive item shows 'via Remotive' and links to its site") row attribution 'Remotive', original URL host remotive.com
// it("a Remote OK item shows 'via Remote OK'")
```

- [ ] **Step 2: Write the Playwright spec** (fixture fetch)

```ts
// feed-sources.spec.ts
// test("a role from a tracked company and an RSS feed shows once with 'Also on 1 source'") track Northwind Traders by board link, add the RSS source in the dialog, runFeedScan, /feed shows one row with the chip
// test("a Remotive item shows via Remotive and links to its site") add Remotive with a category, scan, the row chip 'via Remotive', the sheet's 'Open original' href starts with the preset site
// test("a link that is not a feed is refused with 'That link is not a feed.'")
// test("pause, resume, change the interval and delete a source on /feed/sources")
// test("the 12-hour minimum for presets is enforced in the select")
// axe (light and dark) on /feed/sources and the Add source dialog and /feed with duplicates; keyboard-only Add source
// phone project: /feed/sources and the dialog at 390 px, no horizontal scroll
```

- [ ] **Step 3: Run the new tests and watch the e2e fail first**

Run: `pnpm vitest run tests/integration/feed-done-when-m19.test.ts && pnpm test:e2e --project=feed-chromium -g "Also on 1 source"`
Expected: the integration test passes if Tasks 40 to 46 are right; the e2e FAILS until the manifest and fixtures exist.

- [ ] **Step 4: Add the fixtures and docs**

Fixtures use the fictional company Northwind Traders, no pay figures and no key-like literals. The shared role has no location in both the board fixture and the feed so the hashes match; note that in the fixture file's comment. README documents each source kind, the attribution rule and that a preset is dropped when its terms forbid the use.

- [ ] **Step 5: Run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`
Expected: PASS in Chromium, WebKit and the phone project.

- [ ] **Step 6: Check scanning and alerts still behave**

Run: `pnpm vitest run tests/integration/feed-schedule.test.ts tests/integration/notify-send.test.ts tests/integration/feed-score.test.ts`
Expected: PASS (duplicates are never scored or alerted).

- [ ] **Step 7: Commit and open the pull request**

```bash
git add -A
git commit -m "feat(feed): milestone 19 other sources, cross-source dedupe, end to end"
git push -u origin feat/m19-sources
```

Open a PR to `main`, deploy a Vercel preview, give the link, and check Chrome and Safari by hand (Feed, `/feed/sources`, the dialog). After merge, the cycle's success criteria (spec 1) are the owner's seven days on the deployment with the `[feed]` log.

**Acceptance:** (1) the done-when passes in CI as `tests/integration/feed-done-when-m19.test.ts` and in the e2e (spec 9, row 19). (2) axe is clean in light and dark on the new page and dialog (spec 8, Accessibility). (3) the README names each preset's attribution and the terms rule (spec 5.9, 10).
