# Milestone 16: Scanner

**Done when (spec section 9):** "In CI, a fictional company tracked by its board link shows its open and matching roles on Companies, a changed fixture reports one changed role, and a role absent from two scans is expired; on the owner's deployment, three companies of the owner's choice, one per ATS vendor, are scanned by the tick for a day with no manual step."

**Branch:** `feat/m16-scanner`, cut from `main`.

**Blocked on (live part only):** the owner's deployment and three companies of the owner's choice (Task 17 Step 8). Everything else runs in CI on fixtures.

## Before starting

```bash
bash -c 'git rev-parse --abbrev-ref HEAD && test -f lib/intake/fetch-guard.ts && test -f lib/intake/ats/match.ts && test -f lib/pipeline/create.ts && test -f lib/fit/hard-filters.ts && test -f lib/preferences/schema.ts && test -f lib/attention/load.ts && echo core-ok'
bash -c 'test -f lib/jobs/tick.ts && test -f lib/email/driver.ts && echo hosted-m11-present || echo hosted-m11-missing'
bash -c 'ls lib/db/migrations | tail -3; grep -n "event_kind_check" -r lib/db/schema'
```

Read `node_modules/next/dist/docs/` pages for `after`, route segment `maxDuration` and server actions before Tasks 15 and 16. If `lib/jobs/tick.ts` is missing (Hosted milestone 11 not merged), Task 16 skips the tick registration (see its Step 3) and the rest is unchanged. Run `pnpm install` and `pnpm test` first and note the green baseline.

---

### Task 1: Migration, schema and scoped helpers

**Files:**
- Create: `lib/db/schema/feed.ts` (`feedSource`, `feedItem`, `scanRun`)
- Modify: `lib/db/schema/index.ts` (add `export * from "./feed"`), `lib/db/schema/app.ts` (profile: `feed`, `feedScoreDay`, `feedScoreCount`), `lib/db/schema/pipeline.ts` (company `atsRegion` and `company_ats_region_check`; the `event_kind_check` list), `lib/pipeline/values.ts` (`EVENT_KINDS` gains `posting_gone`; new `ATS_REGIONS`, `AtsRegion`)
- Create: `lib/db/migrations/0004_*.sql` and its meta (next free number; `pnpm db:generate`)
- Create: `lib/db/scoped/feed-source.ts`, `feed-item.ts`, `scan-run.ts`
- Modify: `lib/db/scoped/index.ts` (`Scoped` gains `feedSource`, `feedItem`, `scanRun`; `scoped()` wires them)
- Create: `tests/helpers/feed.ts` (`seedFeedSource`, `seedFeedItem`)
- Test: `tests/integration/feed-schema.test.ts`, `tests/integration/scoped-isolation.test.ts` (new rows), `tests/integration/migrations.test.ts`

**Interfaces:**
- Consumes: `Db`, `stripScopedKeys`, `company`, `user` tables; the live `EVENT_KINDS` list.
- Produces: `FeedSourceRow`, `FeedItemRow`, `ScanRunRow` types (`$inferSelect`); `feedSourceQueries(db, userId)` with `getById(id)`, `getByCompanyId(companyId)`, `list()`, `insert(values)`, `update(id, values)`, `delete(id)`, `takeLease(id, now: Date, until: Date): Promise<boolean>`, `clearLease(id)`; `feedItemQueries` with `getById`, `getBySourceExternal(sourceId, externalId)`, `listBySource(sourceId)`, `insert`, `update`, `deleteBySourceStates(sourceId, states): Promise<number>`; `scanRunQueries` with `insert`, `listForSource(sourceId, limit)`, `latestStartedAt(sourceId, triggers): Promise<Date | null>`. Later tasks add methods to these three files.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/feed-schema.test.ts (PGlite, real migrations)
// it("feed_source requires company_id exactly when kind is company")
//   insert kind 'rss' with a company_id -> rejects, constraint feed_source_company_check
//   insert kind 'company' with company_id null -> rejects, same constraint
// it("allows one source per company per user") second insert for the same company -> feed_source_user_company_unique
// it("rejects an interval of 5 hours") -> feed_source_interval_check
// it("feed_item is unique on source and external id") -> feed_item_source_external_unique
// it("deleting a source deletes its items and scan runs")
// it("deleting a company sets feed_item.company_id to null and keeps the item")
// it("profile.feed defaults to {} and feed_score_count to 0")
// it("company.ats_region defaults to us and rejects 'asia'") -> company_ats_region_check
// it("event accepts posting_gone and every earlier kind") insert one event per kind in EVENT_KINDS
// it("takeLease is won once: two calls with the same now, one true and one false")
// it("takeLease succeeds again once lease_until has passed")
// scoped-isolation cases (add to the cases array): feedSource.getById/list/update/takeLease hide A's row from B;
//   feedItem.getById/listBySource/update hide A's row from B; scanRun.listForSource hides A's rows;
//   feedSource.insert ignores a smuggled userId.
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/feed-schema.test.ts tests/integration/scoped-isolation.test.ts`
Expected: FAIL, the tables, columns and scoped helpers do not exist.

- [ ] **Step 3: Implement the schema, migration and helpers**

Columns, constraints and index names are in the README Contract ("Tables"). Follow `lib/db/schema/pipeline.ts`: `timestamps` spread, composite `unique(user_id, id)`, composite foreign keys, set-null links as single-column FKs. `takeLease` is one statement: `UPDATE feed_source SET lease_until = $until WHERE id = $id AND user_id = $user AND (lease_until IS NULL OR lease_until < $now) RETURNING id`, true when a row came back. Rewrite `event_kind_check` from the live `EVENT_KINDS` (read it, do not copy the nine Core kinds: Prep and Hosted add `prep_drilled`, `artifact_generated`, `research_acknowledged`) so the migration drops and re-adds the check. Never hand-edit the generated SQL except to confirm the constraint rewrite is in it.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration && pnpm typecheck`
Expected: PASS (the whole integration folder, since the check rewrite touches events).

- [ ] **Step 5: Commit**

```bash
git add lib/db tests/helpers/feed.ts tests/integration lib/pipeline/values.ts
git commit -m "feat(feed): schema, migration and scoped helpers for sources, items and scan runs"
```

**Acceptance:** (1) the migration applies on PGlite and `pnpm db:generate` reports no further change (spec 4). (2) every constraint named in the Contract rejects its bad row (spec 4). (3) the isolation test has rows for the three tables (spec 7). (4) the lease is won by exactly one caller (spec 5.10).

---

### Task 2: `ats_region` through intake

**Files:**
- Modify: `lib/intake/resolve.ts` (`ResolvedPosting.ats` gains `region`; the ATS branch writes `region: ref.region`), `lib/intake/form.ts` (`intakeDraftSchema.ats` gains `region: z.enum(ATS_REGIONS).default("us")`; `decodeDraft` carries it), `lib/intake/add-job.ts` (passes `resolved.ats` unchanged), `lib/pipeline/create.ts` (`CreateOpportunityInput.ats` gains `region`; insert and the update branch write `atsRegion`), `lib/pipeline/create-schema.ts` only if the schema validates `ats` (it does not today), `lib/db/scoped/company.ts` (no change expected: `CompanyFields` follows the schema)
- Test: `tests/unit/intake-resolve.test.ts`, `tests/unit/intake-form.test.ts`, `tests/integration/pipeline-create.test.ts`, `tests/integration/intake-add-job.test.ts`

**Interfaces:**
- Consumes: `AtsRef.region` (`lib/intake/ats/match.ts`, exists), `ATS_REGIONS` (Task 1).
- Produces: `ResolvedPosting.ats: { kind: AtsVendor; org: string; region: "us" | "eu" } | null`; `CreateOpportunityInput.ats?: { kind: AtsVendor; org: string; region: "us" | "eu" }`.

- [ ] **Step 1: Write the failing tests**

```ts
// intake-resolve: it("keeps the EU region of a Greenhouse link") -> posting.ats toEqual { kind: "greenhouse", org: "northwind", region: "eu" } for job-boards.eu.greenhouse.io; a US link gives region "us"
// intake-form: it("reads a draft with no ats.region as us") ; it("round-trips region eu through encodeDraft and decodeDraft")
// pipeline-create: it("writes ats_region on a new company") region "eu" -> company.atsRegion "eu"
//   it("fills ats_region when an existing company has no ats_kind yet")
//   it("never overwrites an existing ats_kind, org or region") company with atsKind lever stays lever/us after a Greenhouse EU create
// intake-add-job: it("a Greenhouse EU link adds a job and tags the company eu")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/intake-resolve.test.ts tests/unit/intake-form.test.ts tests/integration/pipeline-create.test.ts tests/integration/intake-add-job.test.ts`
Expected: FAIL, `region` is dropped before it reaches the company row.

- [ ] **Step 3: Implement the carry-through**

Change the three signatures named above; keep `matchAtsUrl` as it is. In `createOpportunity` the new-company insert and the `else if (input.ats && !company.atsKind)` update both set `atsRegion: input.ats.region`.

- [ ] **Step 4: Run Core Milestone 4's intake tests and the new ones**

Run: `pnpm vitest run tests/unit/ats-match.test.ts tests/unit/ats-adapters.test.ts tests/unit/intake-resolve.test.ts tests/unit/intake-form.test.ts tests/unit/fetch-guard.test.ts tests/integration/intake-add-job.test.ts tests/integration/pipeline-create.test.ts && pnpm typecheck`
Expected: PASS, with no change in meaning to any older assertion.

- [ ] **Step 5: Commit**

```bash
git add lib/intake lib/pipeline tests
git commit -m "feat(intake): carry the ATS region from the link to the company"
```

**Acceptance:** (1) a form opened before the deploy still submits: a draft without `region` reads as `us` (spec 4, `company`). (2) an EU board link tags the company `eu` (spec 4). (3) Core Milestone 4's intake tests pass (spec 4, last line of the `company` paragraph).

---

### Task 3: Fetch guard additions

**Files:**
- Modify: `lib/intake/fetch-guard.ts` (`GuardOptions.accept` and `conditional`; `GuardedResponse`; `GuardFailure`, `GuardResult`; `FETCH_FAILURES`; `kindOf`; `oneHop`; `guardedFetch`), `lib/intake/resolve.ts` (only `needsTextReasonFor`'s test, no code if the default branch already maps it), `tests/helpers/intake.ts` (`FakeRoute.contentType` and the response gain the new fields)
- Test: `tests/unit/fetch-guard.test.ts`, `tests/unit/intake-resolve.test.ts`

**Interfaces:**
- Consumes: the guard as it is today.
- Produces: the README Contract's `GuardOptions`, `GuardedResponse`, `GuardFailure`, `GuardResult`, `GuardedFetch`. `FETCH_FAILURES` gains `rate_limited`. `accept: "xml"` accepts `application/rss+xml`, `application/atom+xml`, `application/xml`, `text/xml`; `accept: "text"` accepts `text/plain`. A `conditional` option sends `If-None-Match` and `If-Modified-Since` and resolves a 304 as success with body `""`, `status` 304. A 429 or 503 resolves `fail("rate_limited", ...)` with `retryAfterSeconds` (an integer header or an HTTP date, in seconds, never negative; absent header leaves it undefined). `http_error` failures carry `status`.

- [ ] **Step 1: Write the failing tests** (use the file's own local-server helper on `127.0.0.1` with its test `AddressPolicy`)

```ts
// it("accepts application/rss+xml for accept 'xml'") ; it("accepts text/xml and application/atom+xml")
// it("refuses text/html when accept is 'xml'") -> unsupported_type
// it("accepts text/plain for accept 'text'")
// it("sends If-None-Match and If-Modified-Since when conditional is set") server records headers
// it("resolves a 304 to an empty body as a success") ok, data.status 304, data.body ""
// it("returns etag and lastModified from a 200")
// it("a 429 with Retry-After: 120 fails rate_limited with retryAfterSeconds 120")
// it("a 503 with an HTTP-date Retry-After gives seconds until that date, floored at 0")
// it("a 503 with no header fails rate_limited with no retryAfterSeconds")
// it("a 500 stays http_error and carries status 500"); it("a 403 is http_error with status 403")
// intake-resolve: it("maps rate_limited to fetch_failed") needsTextReasonFor("rate_limited") === "fetch_failed"
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/fetch-guard.test.ts tests/unit/intake-resolve.test.ts`
Expected: FAIL, the new options and codes do not exist.

- [ ] **Step 3: Implement the additions in `fetch-guard.ts`**

Extend `kindOf` to return `"xml"` and `"text"`; capture `etag`, `last-modified` and `retry-after` response headers in `Hop`; in `oneHop` treat `status === 304 && options.conditional` as a body-less success before the existing destroy branch; map status 429 and 503 to `rate_limited` in `guardedFetch` after the redirect handling. Existing behavior for html and json is unchanged.

- [ ] **Step 4: Run the guard tests, the intake tests and typecheck**

Run: `pnpm vitest run tests/unit/fetch-guard.test.ts tests/unit tests/integration/intake-add-job.test.ts && pnpm typecheck`
Expected: PASS. Typecheck lists every exhaustive switch over `FetchFailure` or `contentType`; fix each by adding the new member.

- [ ] **Step 5: Commit**

```bash
git add lib/intake tests
git commit -m "feat(intake): fetch guard accepts xml and text, conditional requests and rate limits"
```

**Acceptance:** (1) all additions are additive: every existing guard test passes untouched (spec 5.2, last paragraph). (2) a 304 is a success with an empty body (spec 5.2 politeness). (3) `rate_limited` carries `Retry-After` and intake maps it to `fetch_failed` (spec 5.2).

---

### Task 4: Feed values, config and `matchAtsBoardUrl`

**Files:**
- Create: `lib/feed/values.ts` (the Contract's constants and enums; `NAV_WORDS`; `feedUserAgent`, `FEED_USER_AGENT` from `package.json`)
- Create: `lib/feed/config.ts` (`parseFeedConfig`)
- Modify: `lib/intake/ats/match.ts` (new `matchAtsBoardUrl`, `AtsBoardRef`), `lib/env.ts` (`Env.FEED`, bad values join `EnvError`'s list)
- Test: `tests/unit/feed-values.test.ts`, `tests/unit/ats-board-match.test.ts`, `tests/unit/feed-config.test.ts`, `tests/unit/env.test.ts`

**Interfaces:**
- Consumes: `matchAtsUrl`, `AtsVendor`.
- Produces: `matchAtsBoardUrl(raw: string): AtsBoardRef | null`; `FeedConfig = { scanOff: boolean; fetchMode: "network" | "fixtures"; fixturesPath: string | null; maxCompanies: number; scoresPerDayMax: number }`; `parseFeedConfig(source): { ok: true; config: FeedConfig } | { ok: false; invalid: string[] }`.

- [ ] **Step 1: Write the failing tests**

```ts
// ats-board-match (host matched exactly on the parsed URL, never by substring):
// "https://boards.greenhouse.io/northwind" -> { kind: "greenhouse", org: "northwind", region: "us" }
// "https://job-boards.greenhouse.io/northwind" -> us ; "https://boards.eu.greenhouse.io/northwind" and "https://job-boards.eu.greenhouse.io/northwind" -> eu
// "https://boards.greenhouse.io/embed/job_board?for=northwind" and ".../embed/job_board/js?for=northwind" -> greenhouse northwind us
// "https://jobs.lever.co/northwind" -> lever us ; "https://jobs.eu.lever.co/northwind" -> eu
// "https://jobs.ashbyhq.com/northwind" -> ashby us
// a job link: "https://boards.greenhouse.io/northwind/jobs/4000000001" -> board ref org northwind (same as matchAtsUrl's org)
// rejects: "https://evil.example/boards.greenhouse.io/northwind", "https://boards.greenhouse.io.evil.example/northwind",
//   "https://example.com", "ftp://boards.greenhouse.io/northwind", "https://boards.greenhouse.io/", "https://boards.greenhouse.io/embed", "not a url"
// feed-config: {} -> scanOff false, fetchMode network, maxCompanies 100, scoresPerDayMax 100
// FEED_SCAN=off -> scanOff true ; FEED_FETCH=fixtures without FEED_FIXTURES -> invalid ["FEED_FIXTURES"]
// FEED_MAX_COMPANIES=abc -> invalid ["FEED_MAX_COMPANIES"] ; FEED_SCORES_PER_DAY_MAX=0 -> scoresPerDayMax 0 ; "-1" invalid
// feed-values: feedUserAgent("0.1.0") === "Jobsmith/0.1.0 (job feed; +https://github.com/weeeha/Jobsmith)"
// env: a bad FEED_MAX_COMPANIES makes parseEnv throw EnvError naming it
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/feed-values.test.ts tests/unit/ats-board-match.test.ts tests/unit/feed-config.test.ts tests/unit/env.test.ts`
Expected: FAIL, modules and function missing.

- [ ] **Step 3: Implement**

`matchAtsBoardUrl` first tries `matchAtsUrl` (a job link yields its org and region), then the board forms: Greenhouse hosts `(job-boards|boards)(.eu)?.greenhouse.io` with path `/<org>` or `/embed/job_board[/js]?for=<org>`; Lever `jobs(.eu)?.lever.co/<org>`; Ashby `jobs.ashbyhq.com/<org>`. Reuse the file's `SLUG` pattern. `NAV_WORDS` covers "careers", "all jobs", "jobs", "apply", "apply now", "back", "view all", "open positions", "see all jobs", "join us", "learn more". Package version comes from `import pkg from "../../package.json"`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/feed lib/intake/ats/match.ts lib/env.ts tests
git commit -m "feat(feed): values, config and board link matching"
```

**Acceptance:** (1) every board link form in spec 5.1 matches, US and EU (spec 5.1). (2) look-alike hosts do not (spec 7). (3) bad Feed variables fail boot by name (spec 6, Channels paragraph pattern; section 3 env table).

---

### Task 5: Listing types and the three ATS readers

**Files:**
- Create: `lib/feed/listing/types.ts`, `greenhouse.ts`, `ashby.ts`, `lever.ts`
- Create: `tests/fixtures/feed/greenhouse-board.json`, `greenhouse-board-changed.json`, `ashby-board.json`, `lever-page-short.json`; `tests/helpers/feed.ts` (add `leverPage(count, offset)`)
- Modify: `tests/helpers/intake.ts` only if Task 3 left `fakeGuardedFetch` without `etag` support (it should return `etag: null`, `lastModified: null`, `retryAfterSeconds: null` by default and accept per-route overrides)
- Test: `tests/unit/feed-readers.test.ts`

**Interfaces:**
- Consumes: `GuardedFetch`, `matchAtsBoardUrl`, `mapLever`, `AtsRef`, `fetchAtsPosting`, `normalizeForDedupe`, `FEED_LIMITS`, `FEED_USER_AGENT`.
- Produces: the README Contract's `ListingEntry`, `Listing`, `ReaderSource`, `ReaderDeps`, `ReaderResult`, `ListingReader`, `listingHash`, `urlExternalId`, `emptyListing`; `readGreenhouse`, `readAshby`, `readLever: ListingReader`; `readerFor(source: ReaderSource): ListingReader | null` is added in Task 12, not here.

- [ ] **Step 1: Write the failing tests** (fictional org `northwind`; fixtures hold five fictional roles, ids `4000000001` to `4000000005`)

```ts
// greenhouse: it("lists boards-api.greenhouse.io/v1/boards/northwind/jobs with no content parameter")
//   it("maps id, title, location, absolute_url and first_published into entries") externalId "4000000001"
//   it("uses boards-api.eu.greenhouse.io for the eu region")
//   it("sends If-None-Match from the source etag and returns notModified on a 304") entries [], complete true
//   it("returns the response etag and last-modified")
//   it("counts an entry with no title as skipped and keeps the rest") skipped 1
//   it("cuts at 500 entries, newest first by postedAt, and sets complete false") with 501 generated entries
//   it("passes a rate_limited failure through with retryAfterSeconds")
// ashby: it("POSTs the ApiJobBoardWithTeams query for the org") body.operationName and variables.organizationHostedJobsPageName === "northwind"
//   it("maps id, title, locationName, publishedDate and jobPostingUrl")
//   it("builds https://jobs.ashbyhq.com/northwind/<id> when jobPostingUrl is missing")
// lever: it("reads api.lever.co/v0/postings/northwind?mode=json&limit=50&skip=0 and stops after a short last page") 50 then 3 -> 2 requests, 53 entries, complete true
//   it("stops at 10 pages and sets complete false") ten full pages -> 10 requests, 500 entries, complete false
//   it("a failure on page 2 after page 1 returns ok with complete false and partialError network_error")
//   it("a failure on page 1 fails the read")
//   it("carries the body of each posting through mapLever") entry.bodyMd non-empty
//   it("uses api.eu.lever.co for the eu region") ; it("maps createdAt (ms) to postedAt")
// helpers: it("listingHash is 16 hex and changes with the title, the location and the work mode, not with case")
//   it("urlExternalId is 32 hex and stable")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/feed-readers.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement the readers**

Every request goes through `deps.fetch` with `headers: { "user-agent": FEED_USER_AGENT }` and `deps.signal`. Greenhouse and Lever take the company name from `source.companyName`. Work mode comes from `workModeFromText(location)` (Lever also from `workplaceType`, as `mapLever` does). Zod-parse each vendor element on its own; an element that fails counts in `skipped`. Ashby uses decision D11's query verbatim. Detail calls are not made here (Task 12).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/feed-readers.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/feed tests
git commit -m "feat(feed): listing shape and the Greenhouse, Ashby and Lever readers"
```

**Acceptance:** (1) calls match the table in spec 5.2 (no `content`, conditional, 10 Lever pages). (2) a cut or a failed later page sets `complete = false` (spec 5.2, 6). (3) one bad entry never sinks the listing (spec 6, Isolation).

---

### Task 6: Robots and the careers page reader

**Files:**
- Create: `lib/feed/robots.ts`, `lib/feed/listing/careers-page.ts`
- Create: `tests/fixtures/feed/careers-embed.html`, `careers-links.html`, `careers-script.html`, `robots-allow.txt`, `robots-disallow.txt`
- Modify: `package.json` (add `robots-parser`, pinned at install time; record the version in the task report)
- Test: `tests/unit/feed-robots.test.ts`, `tests/unit/feed-careers-page.test.ts`

**Interfaces:**
- Consumes: `GuardedFetch` (`accept: "text"`, `maxBytes: 500 * 1024`), `readablePage`, `matchAtsBoardUrl`, `readGreenhouse`, `readLever`, `readAshby`, `SCRIPT_RENDERED_HOSTS`, `JOB_PATH_SEGMENTS`, `NAV_WORDS`, `urlExternalId`, `parseHTML` from linkedom.
- Produces: `checkRobots(url: string, deps: { fetch: GuardedFetch; now: Date; previous: { checkedAt: Date | null; allowed: boolean | null }; signal?: AbortSignal }): Promise<{ kind: "allowed" | "disallowed"; checkedAt: Date; requests: number } | { kind: "retry"; requests: number }>`; `readCareersPage: ListingReader`; `readCareersDetail(url: string, deps: ReaderDeps): Promise<Result<{ bodyMd: string; location: string | null; workMode: WorkMode | null }, ScanErrorCode>>`; `registrableBase(hostname: string): string`.

- [ ] **Step 1: Write the failing tests**

```ts
// robots (RFC 9309, token "Jobsmith"):
// it("allows a path when robots.txt has no matching rule") ; it("disallows /careers when 'User-agent: Jobsmith' has 'Disallow: /careers'")
// it("falls back to the * group when no Jobsmith group exists") ; it("a Jobsmith group wins over the * group")
// it("treats 404 and 403 as allow everything") (http_error with status 403, not_found)
// it("returns retry for a 500, a 503 and a timeout") -> { kind: "retry" }
// it("does not fetch again within 24 hours of previous.checkedAt and returns previous.allowed") 0 requests
// it("fetches again after 25 hours") ; it("requests /robots.txt on the page's own origin with accept text and a 500 KB cap")
// careers page reader, in spec order:
// it("fails script_rendered for a myworkdayjobs.com host with zero requests") (also icims.com, taleo.net, successfactors.com, and a subdomain)
// it("fails robots_disallowed when the rules disallow the path, after one request") ; it("fails robots_unreachable on a robots 5xx")
// it("finds a Greenhouse embed in a script src and continues with the Greenhouse reader") foundAts { greenhouse, northwind, us }, entries come from the board fixture
// it("finds a Lever link and an Ashby link the same way")
// it("job links: keeps /jobs/senior-product-designer on the page's domain, titled by its anchor text, company from source.companyName")
// it("drops navigation anchors, short and over-long texts, links with no segment after 'jobs', and other domains")
// it("keeps a link on a known job host") ; it("dedupes the same URL listed twice") ; it("externalId is urlExternalId(url)")
// it("fewer than 2 links: script_rendered when readable text is under 200 characters, otherwise no_job_links")
// it("more than 300 links keeps the first 300 and sets complete false")
// it("registrableBase('careers.northwind.example') is 'northwind.example' and 'a.b.co.uk' is 'b.co.uk'")
// it("readCareersDetail takes JSON-LD first and falls back to readable text")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm install && pnpm vitest run tests/unit/feed-robots.test.ts tests/unit/feed-careers-page.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

Robots decision per RFC 9309: any 4xx allows everything; 5xx or a timeout returns `retry`; otherwise evaluate with `robots-parser` for the token `Jobsmith` and the careers URL. `registrableBase` is an approximation (last two labels, last three when the last label has two letters and the one before is `co`, `com`, `org`, `net`, `gov` or `ac`); say so in a comment. The reader runs the four steps of spec 5.2 in order; `foundAts` is set when step 3 finds a board and the Listing is that vendor's reader output with `foundAts` and `robots` added. Anchors are read from `parseHTML(html).document`, never by regex. Known job hosts: `boards.greenhouse.io`, `job-boards.greenhouse.io`, `jobs.lever.co`, `jobs.ashbyhq.com`, `apply.workable.com`, `jobs.smartrecruiters.com`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/feed-robots.test.ts tests/unit/feed-careers-page.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/feed package.json pnpm-lock.yaml tests
git commit -m "feat(feed): robots rules and the careers page reader"
```

**Acceptance:** (1) the four steps run in spec order and stop at the first refusal (spec 5.2). (2) robots outcomes follow RFC 9309 (spec 5.2 step 2). (3) the heuristic keeps the fixture's roles and drops its navigation (spec 5.2 step 4).

---

### Task 7: `titlesExclude` and the item filter

**Files:**
- Modify: `lib/preferences/schema.ts` (`Preferences.titlesExclude`, `DEFAULT_PREFERENCES`, stored and input schemas, `toPreferencesDocument`), `lib/preferences/form.ts` (`titlesExclude`), `lib/preferences/summary.ts` (one line), `lib/fit/hard-filters.ts` (`reason` gains `"excluded"`; `phraseCheck` for titles; `hasHardFilters`), `lib/fit/messages.ts` (`titleDetail`), `components/preferences/preferences-form.tsx` (one `ChipField`)
- Create: `lib/feed/filter.ts`
- Test: `tests/unit/preferences-schema.test.ts`, `tests/unit/preferences-form.test.tsx`, `tests/unit/preferences-summary.test.ts`, `tests/unit/hard-filters.test.ts`, `tests/unit/fit-messages.test.ts`, `tests/unit/feed-filter.test.ts`

**Interfaces:**
- Consumes: `normalizeList`, `containsPhrase` (module-private in `hard-filters.ts`; keep it private and add the new check beside it).
- Produces: `Preferences.titlesExclude: string[]`; `HardFilterCheck.reason: "missing" | "remote" | "other_currency" | "excluded" | null` (for an excluded title, `value` is the matched phrase); `itemFilter(facts: ItemFacts, preferences: Preferences): { pass: boolean; failed: HardFilter[] }`.

- [ ] **Step 1: Write the failing tests**

```ts
// schema: it("titlesExclude follows the list rules of titles") trims, drops blanks, case-insensitive dedupe, max 20 entries, 80 characters
//   it("an absent titlesExclude reads as []") ; it("the document version stays 1") ; it("DEFAULT_PREFERENCES has titlesExclude []")
// hard-filters: it("fails a title that contains an excluded phrase, reason excluded, value the phrase")
//   titles ["product designer"], titlesExclude ["junior"], "Junior Product Designer" -> fails, check.reason "excluded", check.value "junior"
//   it("matches whole words on normalized text") exclude ["intern"] does not match "Internal Tools Designer" but matches "Product Designer Intern"
//   it("an exclusion fails even when a wanted phrase matches")
//   it("an exclusion applies when titles is empty") ; it("hasHardFilters is true when only titlesExclude is set")
//   it("a missing title is not_checked, as before")
// messages: it("explains an excluded title") -> `The title contains "junior", which you excluded.`
// summary: it("lists skipped titles") -> "Titles to skip: junior, intern"
// form: it("reads repeated titlesExclude fields") ; it("renders the field 'Title keywords to skip'")
// feed-filter: it("itemFilter passes with no preferences set") ; it("returns the failed filter names for storage") ["title","location"]
//   it("treats a missing location as not checked and passes")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/preferences-schema.test.ts tests/unit/preferences-form.test.tsx tests/unit/preferences-summary.test.ts tests/unit/hard-filters.test.ts tests/unit/fit-messages.test.ts tests/unit/feed-filter.test.ts`
Expected: FAIL. Existing assertions that compare a whole `DEFAULT_PREFERENCES` object also fail until updated; update those expectations in this step.

- [ ] **Step 3: Implement**

In `hard-filters.ts` the title check first tests exclusions (any hit gives `fails` with `reason: "excluded"`), then the wanted phrases as today. Field label `Title keywords to skip`, hint `A title that contains one of these fails the title check.` `itemFilter` calls `hardFilters` with the item's fields and returns `{ pass, failed }`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration/preferences.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib components tests
git commit -m "feat(preferences): titles to skip join the title filter"
```

**Acceptance:** (1) "Junior Product Designer" fails when "junior" is excluded (spec 5.5). (2) the fit card and the test box show the new reason and change nothing else (spec 5.5, last sentence). (3) the document version stays 1 and an old document still parses (spec 4, `preferences`).

---

### Task 8: Item writer: upsert, change, missing, expire, board dedupe

**Files:**
- Create: `lib/feed/items.ts`, `lib/feed/dedupe.ts`
- Modify: `lib/db/scoped/feed-item.ts` (add `listBySourceForApply(sourceId)`, `countKept()` excluding `saved`, `touchSeen(sourceId, now)` for the 304 case), `lib/db/scoped/opportunity.ts` (add `findActiveBySourceUrl(url)`), `lib/db/scoped/event.ts` (no change expected)
- Test: `tests/integration/feed-items.test.ts`; extend `tests/helpers/feed.ts` (`entry(overrides)`, `listing(entries, opts)`, `seedItems(s, sourceId, n)`)

**Interfaces:**
- Consumes: `Listing`, `ListingEntry`, `itemFilter`, `dedupeHash`, `findActiveDuplicate`, `FeedSourceRow`, `FeedItemRow`, `Preferences`, `listingHash`.
- Produces: `applyListing`, `applyDetail`, `ApplyCounts` (Contract); `boardMatch(s, parts)` (active opportunity with the same `dedupeHash` via `findActiveDuplicate`, or whose `source_url` equals the item URL).

- [ ] **Step 1: Write the failing tests** (one test per row of the change table; user A only unless stated)

```ts
// it("inserts a new entry as 'new' with first_seen_at, filter_pass, filter_failed and dedupe_hash")
// it("seen again sets last_seen_at, resets missing_scans to 0 and clears gone_at, state unchanged, changed_at null")
// it("a different listing_hash sets changed_at, keeps state and fit_score, and reruns the filters") title now excluded -> filter_pass false
// it("missing once on a complete listing sets gone_at and missing_scans 1, state unchanged")
// it("missing twice makes a new or seen item expired and sets state_changed_at")
// it("an expired item that comes back returns to new with gone_at null and missing_scans 0")
// it("a dismissed item listed again stays dismissed") ; it("a dismissed item missing twice stays dismissed with gone_at set")
// it("nothing is counted missing when complete is false")
// it("a 304 listing moves last_seen_at on non-expired items and counts nobody missing") (notModified true)
// it("a saved item missing twice keeps saved and writes exactly one posting_gone event on its active job")
//   it("a third miss writes no second event") ; it("a closed job gets no event")
// it("an entry matching an active job's dedupe hash is born saved with opportunity_id and counts in no 'new' total")
// it("an entry whose URL equals an active job's source_url is born saved")
// it("a closed match leaves the item new")
// it("at 3,000 kept items no row is inserted and overLimit is true") saved items are not counted
// it("filteredOut counts new entries that fail the filters")
// it("processes an externalId listed twice once")
// it("stores posting_md only for entries that pass the filters") entry.bodyMd given, failing one stores null
// it("sets company_id from a company source")
// applyDetail: it("sets posting_md, body_hash, detail_fetched_at, refines location and work mode and reruns the filters")
//   it("a second detail with a different body_hash sets changed_at; the first does not")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/feed-items.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement `applyListing` and `applyDetail`**

Load the source's items once (`listBySourceForApply`) into a map keyed by `external_id`, then act per entry in the order of spec 5.3. All writes for one call run inside `s.transaction`. Missing items are counted only when `listing.complete` and `!listing.notModified`; `posting_gone` is written when an item has `state = "saved"`, an `opportunity_id` whose job is `active`, and `missing_scans` reaches exactly 2 (`s.event.insert({ opportunityId, kind: "posting_gone", occurredAt: now, meta: { itemId } })`). The 3,000 cap compares `countKept()` with `FEED_LIMITS.itemsPerUser`. `lib/feed/items.ts` is the only writer of item state: no other module updates `feed_item.state`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/feed-items.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/feed lib/db/scoped tests
git commit -m "feat(feed): item writer with change detection, missing counts and board dedupe"
```

**Acceptance:** (1) every row of the spec 5.3 table has a passing test, including partial and 304 listings (spec 5.3, 5.2). (2) an item on the board is born `saved` and never alerts or scores (spec 5.4). (3) the cap and `over_limit` follow spec 5.3, last paragraph. (4) `posting_gone` is written once (spec 5.3).

---

### Task 9: Retention

**Files:**
- Create: `lib/feed/retention.ts`
- Modify: `lib/db/scoped/feed-item.ts` (`listRetentionCandidates`, `deleteByIds`, `clearPostingMd(ids)`), `lib/db/scoped/scan-run.ts` (`deleteOlderThan(cutoff)`)
- Test: `tests/integration/feed-retention.test.ts`

**Interfaces:**
- Consumes: `FEED_LIMITS`.
- Produces: `runRetention(s: Scoped, now: Date): Promise<{ deletedItems: number; clearedBodies: number; deletedScanRuns: number }>`.

- [ ] **Step 1: Write the failing tests**

```ts
// it("deletes expired and dismissed items whose last_seen_at is over 90 days old") ; keeps new, seen and saved at any age
// it("keeps an expired item last seen 89 days ago")
// it("handles at most 500 rows per run") 600 candidates -> 500 deleted, a second run deletes 100
// it("clears posting_md on saved, expired and filtered-out items and leaves it on passing new and seen items")
// it("deletes scan_run rows over 30 days old and keeps newer ones")
// it("touches only the caller's rows") user B's old rows survive a run for A
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/feed-retention.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement `runRetention`**

Each query is limited to `FEED_LIMITS.retentionRowsPerRun` rows. Deliveries (Milestone 18) join this function in Task 33.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/feed-retention.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/feed lib/db/scoped tests
git commit -m "feat(feed): retention pass"
```

**Acceptance:** (1) 90-day and 30-day limits as spec 5.3 (the last paragraph). (2) 500 rows per run. (3) bodies cleared exactly where spec 5.3 says.

---

### Task 10: Health, backoff, logs and copy

**Files:**
- Create: `lib/feed/health.ts`, `lib/feed/log.ts`, `lib/feed/messages.ts`
- Test: `tests/unit/feed-health.test.ts`, `tests/unit/feed-log.test.ts`, `tests/unit/feed-messages.test.ts`

**Interfaces:**
- Consumes: `FEED_HEALTH`, `TIMING`, `ScanErrorCode`, `ScanReport` (type from Task 12, declared in `lib/feed/log.ts` as a structural type so no import cycle).
- Produces: `nextHealth`, `nextScanAt` (Contract); `formatScanLine(report: ScanLogFields, trigger: ScanTrigger): string`; `formatPassLine(report: PassLogFields): string`; `logScan`, `logPass`, `logFeedError(sourceId: string | null, error: unknown)`; `HEALTH_REASONS: Record<ScanErrorCode, string>`; `UNSUPPORTED_MESSAGES: Record<UnsupportedCode, string>`; `warningLine(nextAt: Date, timeZone: string): string`; `trackResultLine(listed: number, matching: number): string`; `readerLabel(input: { atsKind: string | null; embedFound: boolean }): string`.

- [ ] **Step 1: Write the failing tests**

```ts
// nextHealth: ok + failure -> { warning, 1 } ; warning(1) + failure -> { warning, 2 } ; (2) + failure -> { failing, 3 } ; failing + success -> { ok, 0 }
//   unsupported keeps the count and sets unsupported ; skipped changes nothing
// nextScanAt (interval 6): rand () => 0 -> exactly now + 6h ; rand () => 1 -> now + 6.6h
//   failures 1 and 2 -> one interval ; 3 -> 12h ; 4 -> 24h ; 5 -> 48h ; 6 -> 48h (capped)
//   retryAfterSeconds 7200 with a 3h interval -> now + 3h (the later of the two) ; retryAfterSeconds 86400 -> now + 24h
// log: it("formatScanLine starts with [feed] and carries source id, kind, host, trigger, outcome, error code, counts, requests and ms")
//   it("never contains a role title, a path or a query string") report built with title text elsewhere; assert the line has none of them
//   it("pass line carries started, skipped, leftDue, scoresReserved and scoresRefused")
//   it("logFeedError writes constructor name plus Postgres code and constraint only")
// messages: HEALTH_REASONS maps not_found "not found", timeout "timed out", rate_limited "the site asked Jobsmith to slow down",
//   blocked_address/blocked_port/blocked_scheme "blocked address", every other code "unreadable answer"
//   warningLine(2026-11-21T19:00Z, "UTC") -> "Last check failed. Trying again at 19:00."
//   trackResultLine(42, 3) -> "Found 42 open roles. 3 match your filters." ; (1,1) -> "Found 1 open role. 1 matches your filters." ; (5,0) -> "Found 5 open roles. 0 match your filters."
//   readerLabel greenhouse -> "Greenhouse board", other -> "Careers page", other with embedFound greenhouse -> "Careers page, Greenhouse board found"
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/feed-health.test.ts tests/unit/feed-log.test.ts tests/unit/feed-messages.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

`nextScanAt` returns `max(now + interval * multiplier * (1 + rand() * jitterMax), now + retryAfterSeconds)` with `multiplier = failures >= 3 ? 2 ** (failures - 2) : 1`, then caps the interval part at 48 hours. The unsupported messages are fixed here: `robots_disallowed` "The site's robots.txt does not allow Jobsmith to read this page.", `script_rendered` "This page builds its job list in the browser, which Jobsmith cannot read.", `no_job_links` "Jobsmith found no job links on this page.", `login_required` "This link needs a sign-in.", `no_link` "Add a link to this company's jobs." Logs follow spec section 6.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/feed-health.test.ts tests/unit/feed-log.test.ts tests/unit/feed-messages.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/feed tests
git commit -m "feat(feed): source health, backoff, log lines and copy"
```

**Acceptance:** (1) three failures in a row make a source `failing` and back off to `interval x 2^(failures - 2)`, at most 48 hours (spec 6). (2) logs carry no title, path or text (spec 6, Logs). (3) the five health words match spec 6.

---

### Task 11: Sources writer: track, stop, edit link

**Files:**
- Create: `lib/feed/sources.ts`
- Modify: `lib/db/scoped/feed-source.ts` (`countCompanySources()`), `lib/db/scoped/company.ts` (no change expected)
- Test: `tests/integration/feed-sources.test.ts`

**Interfaces:**
- Consumes: `matchAtsBoardUrl`, `isLoginWalled`, `companyNameKey`, `Scoped`, `FEED_LIMITS`, `DEFAULT_INTERVAL_HOURS`.
- Produces: `trackCompany`, `stopTracking`, `updateCompanyLink`, `canCheckNow`, `TrackInput`, `TrackError` (Contract); `recordAtsFound(s: Scoped, companyId: string, ref: AtsBoardRef): Promise<void>` (writes `ats_kind`, `ats_org`, `ats_region` only when the company has none or `other`).

- [ ] **Step 1: Write the failing tests**

```ts
// it("tracks a company by Greenhouse board link: ats_kind, ats_org, ats_region, tracked true, source enabled, next_scan_at now") one transaction
// it("tracks an unknown name by creating the company with its name_key")
// it("an EU board link sets ats_region eu") ; it("any other http link becomes careers_url with ats_kind other")
// it("refuses a LinkedIn link with login_walled and writes nothing")
// it("refuses an ftp link with invalid") ; it("a new company with no link and no ATS is no_link")
// it("tracks a company that already has a Greenhouse ats_kind with no link typed")
// it("returns limit at maxCompanies tracked company sources") ; it("re-tracking an existing company does not count against the limit")
// it("rolls back the company change when the source insert fails")
// it("stopTracking disables the source, sets tracked false, deletes new, seen and expired items and keeps saved and dismissed")
// it("tracking again enables the same source, sets health ok, resets failures and snoozed_until")
// it("updateCompanyLink resets etag, last_modified, robots_checked_at, robots_allowed, health and failures, and sets next_scan_at to now")
// it("canCheckNow is false within 10 minutes of the newest manual or first scan run and true after; scheduled runs do not count")
// it("recordAtsFound fills a company with no ats_kind or other and leaves greenhouse, ashby and lever alone")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/feed-sources.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement**

`trackCompany` resolves the company (by `companyId`, else by `companyNameKey(name)`, else creates it with `tracked: false` then flips it), picks the reader from the link as spec 5.1 says, and creates or re-enables the `feed_source` inside `s.transaction`. `lib/feed/sources.ts` is the only code that writes `company.tracked` or `feed_source` rows (other writers in later tasks add functions to this same file).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/feed-sources.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/feed lib/db/scoped tests
git commit -m "feat(feed): track, stop tracking and edit a company's link"
```

**Acceptance:** (1) link rules match spec 5.1 (ATS board, other link, LinkedIn refused, existing ATS needs no link). (2) stopping keeps `saved` and `dismissed` items (spec 5.1). (3) 100 tracked companies is the ceiling (spec 5.12).

---

### Task 12: `scanSource`

**Files:**
- Create: `lib/feed/scan.ts`
- Modify: `lib/db/scoped/scan-run.ts` (nothing new expected), `lib/db/scoped/feed-source.ts` (`recordScan(id, fields)` writing the scan result columns in one update)
- Test: `tests/integration/feed-scan.test.ts`; extend `tests/helpers/feed.ts` with `fixtureFetch(map)` over `fakeGuardedFetch`

**Interfaces:**
- Consumes: `readGreenhouse`, `readAshby`, `readLever`, `readCareersPage`, `readCareersDetail`, `fetchAtsPosting`, `applyListing`, `applyDetail`, `nextHealth`, `nextScanAt`, `recordAtsFound`, `logScan`, `loadFitProfile`, `ScanDeps`.
- Produces: `scanSource`, `ScanInput`, `ScanDeps`, `ScanReport` (Contract); `readerFor(source: ReaderSource): ListingReader | null` (company sources only here; Task 44 adds the other kinds).

- [ ] **Step 1: Write the failing tests** (fictional org `northwind`, fixture fetch, `rand: () => 0`)

```ts
// it("scans a Greenhouse board: items inserted, scan_run row with counts, listed_count, etag stored, health ok, last_success_at, next_scan_at now+6h")
// it("makes detail calls for new passing items, newest first, at most maxDetailCalls") 12 passing roles, maxDetailCalls 10 -> 10 ; first trigger with 3 -> 3
// it("a failed detail call increments detail_attempts and an item stops trying after 3")
// it("a detail result sets the body and reruns the filters")
// it("reports one changed role when one title changes between two scans") changedItems 1
// it("a role absent from two complete scans is expired") scan 2: gone_at set, scan 3: expired
// it("a 304 ends as not_modified, counts nobody missing and keeps listed_count") 
// it("a network failure is outcome failed, health warning, failures 1, next scan one interval out")
// it("three failures make the source failing and the fourth scan backs off twice as long as the third")
// it("a success after failures returns health to ok and failures to 0")
// it("rate_limited with Retry-After 7200 moves next_scan_at past two hours and sets retryAfterSeconds on the report")
// it("a Lever listing that fails on page 2 is outcome partial and expires nothing")
// it("LinkedIn careers_url is unsupported login_required with zero requests")
// it("a company with no ats and no careers_url is unsupported no_link")
// it("a script-rendered careers host is unsupported script_rendered and health unsupported")
// it("robots_unreachable ends as skipped and leaves health unchanged")
// it("an embed found on a careers page writes ats_kind to the company and scans with that vendor")
// it("over_limit makes the outcome partial with error_code over_limit")
// it("returns not_found for another user's source id")
// it("records ms from the injected clock and counts requests including detail calls and robots")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/feed-scan.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement `scanSource`**

Order: load source and company (`s.feedSource.getById`, `s.company.getById`); build `ReaderSource` (company ATS from `ats_kind` in greenhouse, ashby, lever with `ats_org` and `ats_region`; `careersUrl`); precheck unsupported without a request (`no_link`, `login_required`); pick the reader (`readerFor`); read; on failure write the `scan_run`, update health, return; on success `applyListing`, then detail calls (newest first, new primary items passing the filters with a null `body_hash`, `detail_attempts < 3`, at most `maxDetailCalls` and 10), then `recordScan` (etag, last_modified, listed_count, last_scan_at, last_success_at, health, error_code, consecutive_failures, robots_*, next_scan_at, `lease_until` untouched) and the `scan_run` row and `logScan`. Detail source: Greenhouse and Ashby through `fetchAtsPosting`, careers pages through `readCareersDetail`, Lever carries its body already. One failing item or detail never fails the scan (D4, spec 6 Isolation).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/feed-scan.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/feed lib/db/scoped tests
git commit -m "feat(feed): scan one source end to end"
```

**Acceptance:** (1) a changed fixture reports one changed role and a role absent from two scans is expired (done-when, spec 5.3). (2) health and backoff follow spec 6. (3) detail calls obey the caps of spec 5.2 and 5.12. (4) a 304 and a partial listing never expire anything (spec 5.2, 6).

---

### Task 13: Host limiter, fixture fetch, production deps

**Files:**
- Create: `lib/feed/limiter.ts`, `lib/feed/fixture-fetch.ts`, `lib/feed/deps.ts`
- Create: `tests/fixtures/feed/manifest.json` (Northwind Traders board, one failing org, one script-rendered careers URL; entries per decision D12)
- Test: `tests/unit/feed-limiter.test.ts`, `tests/unit/feed-fixture-fetch.test.ts`, `tests/unit/feed-deps.test.ts`

**Interfaces:**
- Consumes: `GuardedFetch`, `guardedFetch`, `TIMING`, `env().FEED`.
- Produces: `createHostLimiter(opts?: { clock?: { now(): number; sleep(ms: number): Promise<void> } }): { wrap(fetch: GuardedFetch): GuardedFetch; skipHost(host: string): void }`; `createFixtureFetch(manifestPath: string): GuardedFetch`; `feedFetch(): GuardedFetch` (fixture fetch when `FEED_FETCH=fixtures`, else `guardedFetch`); `feedDeps(): ScanDeps` (`{ fetch: feedFetch(), now: () => new Date(), rand: Math.random }`).

- [ ] **Step 1: Write the failing tests**

```ts
// limiter (fake clock): it("spaces requests to an ATS API host by 500 ms") three calls to boards-api.greenhouse.io -> starts at 0, 500, 1000
//   it("spaces requests to any other host by 2 seconds") ; it("runs at most 1 request per host at a time")
//   it("runs at most 4 requests at a time across hosts") 6 hosts, deferred responses
//   it("a rate_limited answer skips that host for the rest of the pass") next call returns rate_limited without calling the inner fetch
//   it("skipHost is explicit too") ; it("API hosts are the Greenhouse, Lever and Ashby API hosts, US and EU")
// fixture fetch: it("answers an exact URL from its file") ; it("fails every other URL with network_error and opens no socket") spy on node:net connect
//   it("honors status 404 as not_found") ; it("returns 304 when the request's etag equals the manifest etag")
//   it("returns rate_limited with retryAfterSeconds from the manifest") ; it("looks an Ashby POST up under '<url>#<org>'")
//   it("answers accept xml and text entries") ; it("throws a clear error for a manifest entry whose file is missing")
// deps: it("feedFetch is the guard by default and the fixture fetch when FEED_FETCH=fixtures")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/feed-limiter.test.ts tests/unit/feed-fixture-fetch.test.ts tests/unit/feed-deps.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

The limiter is a queue per host plus a global semaphore of `TIMING.inFlightMax`, with the gap measured from the previous request's start; it never reads real time except through its clock. The fixture fetch is a plain `GuardedFetch` that reads the manifest once and files lazily; the manifest path resolves relative to `process.cwd()`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/feed-limiter.test.ts tests/unit/feed-fixture-fetch.test.ts tests/unit/feed-deps.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/feed tests
git commit -m "feat(feed): host limiter, fixture fetch and deps"
```

**Acceptance:** (1) 4 in flight, 1 per host, 500 ms and 2 s gaps, host skip on a 429 (spec 5.2 politeness). (2) the fixture fetch never opens a socket (spec 3, Test fetch row).

---

### Task 14: `runDueScans`, lease, system reads, steps

**Files:**
- Create: `lib/feed/schedule.ts`, `lib/feed/steps.ts`, `lib/db/system.ts` (`dueSources`; if another plan's milestone already created `lib/db/system.ts`, add `dueSources` to it instead)
- Test: `tests/integration/feed-schedule.test.ts`, `tests/integration/feed-system.test.ts`

**Interfaces:**
- Consumes: `scanSource`, `runRetention`, `createHostLimiter`, `FULL_LIMITS`, `scopedFor` equivalent `scoped(db, userId)`, `TIMING`, `feedDeps`.
- Produces: `runDueScans`, `PassLimits`, `FULL_LIMITS`, `HOME_LIMITS`, `RunDueScansInput`, `PassReport`, `ScheduleDeps` (Contract); `defaultSteps()` returning `{ preSteps: [], userSteps: [retentionStep], postSteps: [] }`; `dueSources(db, now, limit, opts?)` (Contract; `opts.sourceId` is not part of it, `pnpm feed:scan --source` scans through `scanSource` directly).

- [ ] **Step 1: Write the failing tests**

```ts
// dueSources: it("returns (userId, sourceId) pairs only") type and value check
//   it("skips disabled, snoozed, unsupported and currently leased sources") ; it("orders oldest next_scan_at first")
//   it("returns at most 20 per user and interleaves users") user A 25 due, user B 3 -> B's three appear before A's 4th
//   it("honors the total limit") ; it("filters to one user when userId is given")
// runDueScans: it("returns { status: 'off' } at once when FEED_SCAN is off") no reads
//   it("scans due sources and clears the lease") ; it("two concurrent passes over one source: exactly one scans it") gated fetch
//   it("an expired lease is taken again") ; it("leaves the lease cleared after a scan that throws")
//   it("starts no new source with under 30 seconds of budget left and counts it leftDue") fake clock
//   it("stops a user's remaining sources at 300 requests") ; it("one failing source never stops the pass")
//   it("skips the rest of a pass's sources on a host that answered rate_limited")
//   it("a pass for user A writes nothing for user B") B's due source, run with userId A: B's source, items and scan_runs unchanged
//   it("without userId every user is scanned and each item belongs to its own user")
//   it("runs the user steps only for users touched, once each") ; it("runs retention as a user step")
//   it("applies a 60-second ceiling per source") signal aborts the reader at the ceiling
//   it("HOME_LIMITS scan at most 5 sources with 3 detail calls and no scoring")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/feed-schedule.test.ts tests/integration/feed-system.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

`dueSources` is one SQL query with `row_number() over (partition by user_id order by next_scan_at)` ordered by that number then by `next_scan_at`, filtered to `enabled`, `snoozed_until is null or < now`, `health <> 'unsupported'`, `next_scan_at <= now`, `lease_until is null or < now`, `rn <= perUser`, limited to `limit`. `runDueScans` follows spec 5.10: preSteps, `dueSources`, per pair `takeLease` (5 minutes), `scanSource` under a 60-second `AbortSignal.timeout`, `clearLease` in `finally`, then per touched user the `userSteps`, then postSteps. One limiter per pass wraps `deps.fetch`. It never throws: a failing source or step is logged through `logFeedError` and the pass goes on. The pass writes one `logPass` line.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/feed-schedule.test.ts tests/integration/feed-system.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/feed lib/db/system.ts tests
git commit -m "feat(feed): runDueScans with leases, budgets and pass steps"
```

**Acceptance:** (1) overlapping clocks cannot double-scan (spec 5.10 step 2). (2) a pass for A writes nothing for B (spec 7). (3) no source starts under 30 seconds of budget (spec 5.10). (4) the budgets and limits of the callers table are constants in one place (spec 5.10).

---

### Task 15: Companies: track dialog, tracking line, health states

**Files:**
- Create: `lib/feed/tracking.ts` (`trackingView`), `app/(app)/companies/actions.ts` (`trackCompanyAction`, `stopTrackingAction`, `editLinkAction`, `checkNowAction`), `components/feed/track-company-dialog.tsx`, `components/feed/tracking-line.tsx`
- Modify: `lib/companies/overview.ts` (`CompanyOverview.tracking: TrackingView | null`), `lib/companies/load.ts` (reads sources and counts), `app/(app)/companies/page.tsx` (`maxDuration = 60`, the dialog, the line, "Track" on untracked cards), `docs/design-system.md` (record the new components)
- Test: `tests/unit/feed-tracking.test.ts`, `tests/unit/tracking-line.test.tsx`, `tests/integration/companies-load.test.ts`, `tests/integration/feed-track-action.test.ts`

**Interfaces:**
- Consumes: `trackCompany`, `stopTracking`, `updateCompanyLink`, `canCheckNow`, `scanSource`, `trackResultLine`, `readerLabel`, `HEALTH_REASONS`, `UNSUPPORTED_MESSAGES`, `warningLine`, `feedDeps`, `requireUser`, `scopedFor`, the Add job dialog's patterns (`components/board/add-job-dialog.tsx`, `lib/forms/submit.ts`).
- Produces: `TrackingView = { sourceId: string; reader: string; lastCheck: Date | null; openRoles: number; matchingRoles: number; health: FeedHealth; healthLine: string | null; nextScanAt: Date | null; canCheckNow: boolean; openCareersUrl: string | null }`; `trackingView(input): TrackingView`; actions returning `FormState`-style typed results with the sentence from `trackResultLine`.

- [ ] **Step 1: Write the failing tests**

```ts
// feed-tracking: it("matching roles count gone_at null, state new, seen or saved, and filter_pass true") (D6) ; it("open roles is listed_count")
//   it("reader label follows ats_kind and an embed found") ; it("a failing source shows the reason in words") "Last check failed" is for warning only
// tracking-line component (each state renders its own text, none by colour alone):
//   ok: "Greenhouse board", "Checked <time>", "42 open", "3 match", buttons "Check now", "Edit link", "Stop tracking"
//   warning: "Last check failed. Trying again at 14:00." ; failing: the reason in words ("not found") and the backoff time
//   unsupported: the UNSUPPORTED_MESSAGES text, buttons "Open careers page" and "Edit link", no "Check now"
//   "Check now" is disabled with the words "Checked a moment ago" when canCheckNow is false
// companies-load: it("an untracked company has tracking null") ; it("a tracked company carries its counts")
// feed-track-action (fixture fetch): it("tracks by board link, runs the first scan and returns 'Found 4 open roles. 2 match your filters.'")
//   it("a first scan that fails still tracks and says the first check failed with the reason and the retry time")
//   it("refuses a LinkedIn link in the dialog with its own message") ; it("checkNowAction answers too soon within 10 minutes")
//   it("stopTrackingAction removes new items and keeps saved ones")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/feed-tracking.test.ts tests/unit/tracking-line.test.tsx tests/integration/companies-load.test.ts tests/integration/feed-track-action.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

Dialog fields: `Company` (prefilled and read-only when opened from a card) and `Link to the company's jobs` (hint: `A Greenhouse, Ashby or Lever board, or the careers page.`). The action runs `trackCompany`, then `scanSource` with `{ trigger: "first", budgetMs: TIMING.firstBudgetMs, maxDetailCalls: TIMING.firstDetailCalls }`, then `revalidatePath("/companies")`. Refusal copy: login_walled `Jobsmith cannot read LinkedIn. Use the company's own careers page.`; invalid `Enter a link that starts with http or https.`; no_link `Add a link to this company's jobs.`; limit `You track 100 companies. Stop tracking one to add another.` (number from `FEED_LIMITS`). A failed first scan: `Tracking started. The first check failed: <reason>. Jobsmith will try again at <time>.` Live announcements through `useAnnounce`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration/companies-load.test.ts tests/integration/feed-track-action.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib app components docs tests
git commit -m "feat(companies): track a company, its tracking line and health states"
```

**Acceptance:** (1) the dialog closes on the sentence of spec 5.1 with the first scan inside the action. (2) each health state of spec 6 is visible in words on the Companies card. (3) `maxDuration = 60` is set (spec 5.1). (4) "Check now" is limited to once per 10 minutes (spec 5.1).

---

### Task 16: Callers: tick step, command, Home fallback

**Files:**
- Create: `lib/jobs/feed.ts` (`runFeedStep`), `lib/feed/home-fallback.ts` (`shouldScanOnHome`), `scripts/feed-scan.ts`, `lib/feed/cli.ts` (`parseFeedScanArgs`, `formatReportLine`)
- Modify: `lib/jobs/tick.ts (from 2026-11-21-jobsmith-hosted milestone 11)` (append the feed step after the Hosted steps in `runTick`'s list), `lib/jobs/steps.ts (from 2026-11-21-jobsmith-hosted milestone 11)` only if the list lives there (read both; Hosted's steps have the shape `(db, deps, now, limit = 50) => Promise<number>`), `app/(app)/page.tsx` (`maxDuration = 60`, `after()` call), `package.json` (`"feed:scan": "tsx --env-file-if-exists=.env scripts/feed-scan.ts"`), `lib/db/scoped/feed-source.ts` (`overdueFor(now, minutes)`)
- Test: `tests/integration/feed-tick-step.test.ts`, `tests/unit/feed-cli.test.ts`, `tests/integration/feed-home-fallback.test.ts`

**Interfaces:**
- Consumes: `runDueScans`, `FULL_LIMITS`, `HOME_LIMITS`, `feedDeps`, `getDb`, the Hosted tick's step contract.
- Produces: `runFeedStep(input: { now: Date; budgetMs: number }): Promise<PassReport>` (trigger `cron`, budget `min(input.budgetMs - 10_000, 120_000)`, never throws); `feedTickStep(db: Db, deps: unknown, now: Date, limit?: number): Promise<number>` (Hosted's step shape; returns the number of sources scanned; budget `min(120_000, 60_000 - (Date.now() - now.getTime()) - 10_000)` per decision D28, floored at 0); `parseFeedScanArgs(argv: string[]): { budgetMs: number; userEmail: string | null; sourceId: string | null }` (default 600 seconds, clamped to 3,600; a non-number is an error); `shouldScanOnHome(s: Scoped, now: Date): Promise<boolean>`.

**Blocked on:** Hosted milestone 11 (Hosted Task 14) for the registration line only. Without `lib/jobs/tick.ts`, skip that file and record in the task report that the feed step is not registered; `runFeedStep`, `feedTickStep` and their tests still land.

- [ ] **Step 1: Write the failing tests**

```ts
// tick step: it("runFeedStep runs runDueScans with trigger cron and the budget given less 10 seconds, at most 120") budgetMs 200_000 -> 120_000 ; 50_000 -> 40_000
//   it("feedTickStep passes about 50 seconds when called at the tick's start and less as time passes") fake clock ; it("returns the number of sources scanned")
//   it("returns off when FEED_SCAN is off") ; it("does not throw when a pass throws") 
//   it("runs after the Hosted steps") (when the tick exists) the feed step is last in the tick's list
// cli: it("defaults to 600 seconds and clamps 5000 to 3600") ; it("reads --user <email> and --source <id>") ; it("rejects --budget-seconds abc")
//   it("formatReportLine prints one line per source with outcome, counts and ms and no role title")
// home fallback: it("is true when a source is over 90 minutes overdue and the user had no home run in 15 minutes")
//   it("is false at 89 minutes overdue") ; it("is false when a home scan_run started 10 minutes ago") ; it("is true when the last home run was 16 minutes ago")
//   it("ignores disabled, snoozed and unsupported sources") ; it("is false with no sources")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/feed-tick-step.test.ts tests/unit/feed-cli.test.ts tests/integration/feed-home-fallback.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

`scripts/feed-scan.ts`: parse args; with `--user` look up the user id by email with the script's own `getDb()` query (a script, not app code); with `--source` call `scanSource` for that one source (owner id read from `feed_source` by the script) with trigger `command`; otherwise `runDueScans(getDb(), { trigger: "command", budgetMs, userId, limits: FULL_LIMITS }, feedDeps())`; print `formatReportLine` per source; exit 0 when the pass ran. Home: after `requireUser()`, if `await shouldScanOnHome(...)`, call `after(() => runDueScans(getDb(), { now, budgetMs: TIMING.homeBudgetMs, trigger: "home", userId, limits: HOME_LIMITS }, feedDeps()))` and never await it, so the attention list renders first. Read the `after` doc in `node_modules/next/dist/docs/` for the exact import and the rule on errors inside it (catch and log through `logFeedError`).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/feed-tick-step.test.ts tests/unit/feed-cli.test.ts tests/integration/feed-home-fallback.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib scripts app package.json tests
git commit -m "feat(feed): tick step, pnpm feed:scan and the Home fallback"
```

**Acceptance:** (1) the three callers share `runDueScans` (spec 5.10, principle 20). (2) the cron budget is what the tick has left less 10 seconds, at most 120, which on Hosted's 60-second route is about 50 (spec 5.10 table, decision D28). (3) the Home fallback fires only past 90 minutes overdue and never scores (spec 5.10). (4) the tick route and its `maxDuration` are unchanged (spec 5.10, last paragraph).

---

### Task 17: End to end, docs and ship

**Files:**
- Create: `tests/e2e/feed-scanner.spec.ts`, `tests/e2e/feed.ts` (helper: `runFeedScan(args)`, `setSourceHealth(companyName, health)` over a `pg` client on `DATABASE_URL`), `tests/integration/feed-done-when.test.ts`, `tests/integration/feed-live.test.ts` (opt-in smoke test), `tests/fixtures/feed/` additions for the e2e manifest
- Modify: `playwright.config.ts` (webServer env `FEED_FETCH=fixtures FEED_FIXTURES=tests/fixtures/feed/manifest.json`; projects `feed-chromium`, `feed-webkit`, `feed-phone` with `testMatch: /feed-.*\.spec\.ts$/`, each depending on the last project of the existing chain, one engine at a time), `.env.example` (the Feed variables with the comments of the Contract table), `README.md` (a "Feed" section: tracking, the cron example `*/15 * * * * cd /path/to/jobsmith && pnpm feed:scan`, `FEED_SCAN=off`, "Scans run when you open Home"), `docs/design-system.md`
- Test: the files above

**Interfaces:**
- Consumes: everything above; Hosted's `.env.example` shape.
- Produces: the milestone's proof.

**Blocked on:** Step 8 needs the owner's deployment and three companies of the owner's choice. Steps 1 to 7 run in CI.

- [ ] **Step 1: Write the integration test of the CI half of the done-when**

```ts
// tests/integration/feed-done-when.test.ts
// it("a fictional company tracked by its board link shows its open and matching roles on Companies") trackCompany + scanSource + loadCompanyOverviews -> tracking.openRoles 5, matchingRoles per the fixture's preferences
// it("a changed fixture reports one changed role") second scan with greenhouse-board-changed.json -> changedItems 1
// it("a role absent from two scans is expired") third scan without it
// live smoke (tests/integration/feed-live.test.ts): describe.skipIf(!process.env.FEED_LIVE_GREENHOUSE_ORG) one real listing call per vendor via guardedFetch,
//   asserting shape only (entries array, each with externalId, url and roleTitle strings); Lever and Ashby run when their variables are set
```

- [ ] **Step 2: Write the Playwright spec**

```ts
// feed-scanner.spec.ts (fixture fetch, fake AI driver; uses tests/e2e/account.ts and session helpers)
// test("track a company by board link and see the dialog's count") "Found 5 open roles." text appears, dialog closes, tracking line shows "Greenhouse board"
// test("a missing board is tracked with a warning line") "Last check failed. Trying again at"
// test("a script-rendered careers page shows the unsupported message and no Check now")
// test("Check now twice within 10 minutes: the second is disabled")
// test("pnpm feed:scan runs for the account") runFeedScan(["--user", EMAIL]) exits 0 and the line prints
// test("stop tracking removes the line and keeps the company")
// axe (light and dark) on Companies with ok, warning, failing (setSourceHealth) and unsupported lines; keyboard-only Track dialog
// phone project: the Track dialog and the tracking line fit at 390 px (no horizontal scroll)
```

- [ ] **Step 3: Run the new tests and watch the e2e fail first**

Run: `pnpm vitest run tests/integration/feed-done-when.test.ts && pnpm test:e2e --project=feed-chromium`
Expected: the integration test passes if Tasks 1 to 16 are right; the e2e FAILS until the config and helper exist.

- [ ] **Step 4: Wire the Playwright config, the helper and the docs**

Find the last project of the existing chain (`grep -n "name:" playwright.config.ts`: `prep-phone` when Prep is merged, otherwise `fit-phone`) and depend on it. Record the new components under "New application code" in `docs/design-system.md`: the tracking line (no registry match), the track dialog. Add the Feed variables to `.env.example`.

- [ ] **Step 5: Run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`
Expected: PASS in Chromium, WebKit and the phone project.

- [ ] **Step 6: Check the unrelated suites are untouched**

Run: `git diff --stat main -- lib/artifacts lib/bridge cli tests/e2e/bridge.spec.ts`
Expected: empty (a scoped change leaves them alone, apart from the shared migration).

- [ ] **Step 7: Commit and open the pull request**

```bash
git add -A
git commit -m "feat(feed): milestone 16 scanner, end to end, docs"
git push -u origin feat/m16-scanner
```

Open a PR from `feat/m16-scanner` to `main` and deploy a Vercel preview through the repository's own deploy step; give the preview link. Check Chrome and Safari by hand on desktop and at a phone viewport: Companies, the track dialog with a real Greenhouse link, the tracking line.

- [ ] **Step 8: Owner live check (blocked on the owner)**

On the owner's deployment: the owner names one company per vendor (Greenhouse, Ashby, Lever) and tracks each. Leave the deployment for a day. Read `[feed]` log lines: every source scanned at its interval by the tick with no manual step, no error codes other than expected ones. Record the result in the PR.

**Acceptance:** (1) the three CI sentences of the done-when pass as `tests/integration/feed-done-when.test.ts` (spec 9, row 16). (2) the e2e covers dialog, tracking line, each health state, `pnpm feed:scan` (spec 8). (3) axe is clean in light and dark (spec 8, Accessibility). (4) the live part is recorded or marked blocked (spec 9, row 16).
