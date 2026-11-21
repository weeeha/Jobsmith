# Jobsmith Feed: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Watch the companies a user tracks and the few sources a user adds, show their new roles on Home and on a Feed page, move a role to the board in one tap, cap what scoring costs, and alert in the app, by Telegram and by email digest.

**Architecture:** Feed keeps its own tables (`feed_source`, `feed_item`, `scan_run`, then four notification tables) and reaches the board only through `createOpportunity`. One function, `runDueScans`, is the single entry for four callers (the Hosted maintenance tick, `pnpm feed:scan`, Home's bounded fallback, "Check now"), and a lease on each source row makes overlapping clocks safe. Listing readers sit on Core's fetch guard and ATS adapters and all return one `Listing` shape; `lib/feed/items.ts` is the only writer of item state, `lib/feed/sources.ts` the only writer of `company.tracked` and `feed_source`, and `lib/notify/write.ts` the only writer of notifications and deliveries. Hard filters run in code on every item; only items that pass, or that the user opens and asks to score, reach `scoreFit`, through a per-user daily reservation taken in one transaction with Hosted's credit `Meter`.

**Tech stack additions:** `robots-parser` (MIT; pin at install time, record the version in the task report). XML uses `linkedom` (already installed 0.18.13). Telegram uses the Bot API over `fetch`, no SDK. No other package.

**Spec:** `docs/superpowers/specs/2026-11-01-jobsmith-feed-design.md`, sections 1 to 12 (milestone table in section 9). Core spec sections 2, 3, 4 and 8 stay in force. Hosted spec sections 5.2 (email), 5.7 (credits and the `Meter`) and 5.13 (the tick) define the modules Feed calls.

The plan folder: `README.md` (this contract), `m16-scanner.md` (Tasks 1 to 17), `m17-feed.md` (Tasks 18 to 27), `m18-alerts.md` (Tasks 28 to 39), `m19-sources.md` (Tasks 40 to 47). A name, signature or copy string in this README is binding character for character; a task that departs from it is a defect.

## Status on 2026-11-21

**Already built (real paths this plan builds on):**
- Core milestones 1 to 5 plus the demo sign-in. The intake code Feed reuses: `lib/intake/fetch-guard.ts` (`guardedFetch`, `GuardedFetch`, `GuardOptions`, `FETCH_FAILURES`), `lib/intake/ats/match.ts` (`matchAtsUrl`, `AtsRef`, `atsApiRequest`), `lib/intake/ats/index.ts` (`fetchAtsPosting`), `lib/intake/ats/greenhouse.ts`, `lever.ts`, `ashby.ts` (`mapGreenhouse`, `mapLever`, `mapAshby`), `lib/intake/dedupe.ts` (`dedupeHash`, `normalizeForDedupe`), `lib/intake/resolve.ts` (`ResolvedPosting`), `lib/intake/readable.ts` (`readablePage`), `lib/intake/html.ts` (`htmlToMarkdown`), `lib/intake/values.ts` (`isLoginWalled`).
- `lib/pipeline/create.ts` (`createOpportunity`), `lib/pipeline/duplicates.ts` (`findActiveDuplicate`), `lib/fit/*` (`hardFilters`, `fitReadiness`, `loadFitProfile`, `toStoredFit`, `parseStoredFit`, `fitBand`, `FitDeps`), `lib/ai/score-fit.ts` (`scoreFit`), `lib/preferences/schema.ts`, `lib/db/scoped/*`, `lib/db/schema/*`, `lib/attention/load.ts` (`loadHome`), `lib/export/collect.ts`, `lib/time/zone.ts` (`zonedAt`, `zonedDayStart`), `components/app-shell.tsx`, `components/super-ai/feed-view.tsx`, `mode-tabs.tsx`, `empty-state.tsx`, `app-topbar.tsx` (has an `actions` slot), `proxy.ts`, `vercel.ts`.
- The `company` table already carries `tracked`, `careers_url`, `ats_kind`, `ats_org`. `opportunity.source` already allows `feed`.
- Nothing from this spec: no `feed_*` table, no `lib/feed`, `lib/notify`, `lib/jobs/feed.ts`, `lib/db/system.ts`, no bell, no Feed page.

**Depends on (merge these first; this plan folder name, then milestone):**
- Milestone 16 needs `2026-11-21-jobsmith-hosted` milestone 11 (Hosted Task 14: the maintenance tick `POST /api/jobs/tick`, `runTick` in `lib/jobs/tick.ts`, steps in `lib/jobs/steps.ts`) for Task 16 only. Without it, Task 16 registers nothing with the tick, ships `pnpm feed:scan` and the Home fallback, and the owner's done-when part about the tick waits.
- Milestone 17 needs `2026-11-21-jobsmith-hosted` milestone 14 (Hosted Tasks 39 to 42: `dbMeter`, `getMeter()`, `FitDeps.meter?: Meter`; the `Meter` interface and `freeMeter` exist from milestone 13) for Task 19. Without it, Task 19 reserves only the feed counter and leaves the Meter call as one clearly named no-op function, `meterScore`, in `lib/feed/score.ts`. The Prep and earlier Core modules need nothing else.
- Milestone 18 needs `2026-11-21-jobsmith-hosted` milestone 11 (Hosted Task 3 and the email tasks: `lib/email`, `EmailDriver`, `EmailMessage`, `renderEmail`, `appLink`, `EMAIL_PROVIDER`, `EMAIL_FAKE_DIR`; Hosted Task 14 for the `proxy.ts` matcher exclusion for `api/jobs/tick`) for Tasks 36 and 39. Without `lib/email`, Tasks 36 and the email part of 37 and 39 are left out; in-app and Telegram still ship.
- Milestone 19 needs only Milestones 16 to 18 of this plan.
- Hosted and Prep also rewrite `event_kind_check` and the Playwright project chain. Task 1 and Task 17 read the live list and the live last project at start (see "Needs"), so the order of merges does not matter.

**Needs an account, a paid service, hosting or the owner's answer:**
- Milestone 16 (live part only): the owner's Vercel deployment running Hosted's 15-minute tick with `CRON_SECRET` set (spec assumption 1: on a plan with daily cron only, scans run once a day and the Home fallback carries the rest); three companies of the owner's choice, one per ATS vendor (Greenhouse, Ashby, Lever), tracked there and left for a day with no manual step. Blocks Task 17 Step 8 only. Also the owner's choice of public boards for the opt-in live smoke test (`FEED_LIVE_GREENHOUSE_ORG`, `FEED_LIVE_LEVER_ORG`, `FEED_LIVE_ASHBY_ORG`), Task 17.
- Milestone 17 (live part only): a model key on the preview (`AI_PROVIDER` set) to see a real score on a card; fake driver covers every CI test. Blocks Task 27 Step 6 only. The values in spec section 11 (30 scores a day, ceiling 100) are read from `lib/feed/values.ts`, so an owner change is one edit.
- Milestone 18 (live part only): the owner's own Telegram bot (token from BotFather) and the owner's phone: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (32 or more characters), `pnpm telegram:webhook` run against the deployment, then one digest read on the phone at the next digest hour and a role found in quiet hours read in the morning digest. Blocks Task 34 Step 8, Task 35 Step 8 and Task 39 Step 8 only; the fake channel and the fake `fetch` cover CI. An email provider for a live email digest (Hosted's choice, `EMAIL_PROVIDER`): optional, not part of the done-when.
- Milestone 19: the current terms of Remotive and Remote OK, read by a person before Task 42 (spec 5.9: a preset whose terms forbid this use is dropped, which is the owner's call); the fixed list of Remotive categories and the fixed list of Remote OK tags for `lib/feed/values.ts`, copied from each site's current public documentation (Task 40 writes them from a table the person fills in; no test touches the network).
- Copy the spec leaves to the milestone plan ("Copy is fixed in each milestone plan"): this plan fixes it in `lib/feed/messages.ts`, `lib/notify/messages.ts` and the Contract below. The owner hand-edits it; each string lives in one place.
- The spec asks for Figma drafts before each milestone plan. None were made for this plan.

## Global Constraints

- Never commit to or push `main`. One branch per milestone, cut from `main`: `feat/m16-scanner`, `feat/m17-feed`, `feat/m18-alerts`, `feat/m19-sources`.
- Next.js 16 has breaking changes: read the relevant guide in `node_modules/next/dist/docs/` (`after`, `maxDuration`, route handlers, `proxy`) before any Next API (AGENTS.md).
- `requireUser()` in every page, action and handler. Exceptions the spec names: `POST /api/telegram/webhook` and `POST /api/notify/unsubscribe` check their own secrets and never take a user id from the request (the unsubscribe token is signed and carries the id); the tick route is Hosted's.
- `app/` and `components/` never import `@/lib/db/client`. Every `lib/*` function takes a database handle (`Scoped`) and a user id; the only exceptions are the cross-user functions in `lib/db/system.ts` and the scheduler that calls them, which take a `Db` handle.
- Cross-user reads return ids only (spec principle 21): `dueSources`, `dueDigests`, `linkByCodeHash`, `linkByChatId` in `lib/db/system.ts`, and nothing else. Everything after them goes through `scopedFor(userId)`.
- Single writers: `lib/feed/items.ts` writes `feed_item` state; `lib/feed/sources.ts` writes `company.tracked` and `feed_source`; `lib/feed/save.ts` reaches the board only through `createOpportunity`; `lib/notify/write.ts` writes notifications and deliveries; `lib/pipeline` keeps stage and status writes.
- `lib/intake/fetch-guard.ts` stays the only code that fetches a user-supplied address. Telegram's fixed API host is called with a plain `fetch` and a 10-second timeout from `lib/notify/channels/telegram.ts` only.
- Typed `Result` for expected failures; test first under `lib/`; no test touches the network (readers run on `fakeGuardedFetch` or the fixture fetch; the bot on an injected `fetch`; the model on the fake driver).
- Fixtures are fictional (company Northwind Traders, fictional people) and carry no pay figures. No key-like literals in tests: build keys and secrets at runtime, for example `"k".repeat(24)` and `"s".repeat(32)`; hashes are computed, never pasted; ids are zero-padded.
- Logs never carry a role title, a path, posting text, the bot token, link codes, chat ids or the Telegram URL. Drizzle errors log constructor name plus Postgres `code` and `constraint` only.
- No exclamation marks in UI copy. Semantic token utilities only and `pnpm check:tokens`. Registry first, then `base-nova`, then new code recorded in `docs/design-system.md` under "New application code". Axe zero violations in light and dark. Times through `LocalTime` except where a time zone rule says otherwise.
- Every new owned table gets a file under `lib/db/scoped/` and a row in `tests/integration/scoped-isolation.test.ts`. Check constraints list every value from the first migration of that table.
- Task 2 touches shipped intake code; Milestone 4's intake tests (`tests/unit/ats-match.test.ts`, `ats-adapters.test.ts`, `intake-resolve.test.ts`, `intake-form.test.ts`, `fetch-guard.test.ts`, `tests/integration/intake-add-job.test.ts`, `pipeline-create.test.ts`) must pass unchanged in meaning after it.
- Commit trailer from the session; forms through `lib/forms/submit.ts`; explicit Zod messages; `React.useId()` ids; `break-words` on long strings; titles render as plain text; bodies through `components/markdown.tsx`; external links `rel="noopener noreferrer nofollow"`.

## Review Focus

1. **A role must not expire because one response dropped it, or because a listing was cut short.** Missing counts only after a `complete` listing; one miss sets `gone_at`, two expire; a Lever page 3 failure never counts anything. Pinned by Task 8 (change table) and Task 12 (partial listing end to end).
2. **The daily cap and the credit meter must move together.** Two concurrent reservations one below the cap: exactly one wins; a refusal from either side rolls back both; a failed call refunds the Meter and keeps the feed count. Pinned by Task 19.
3. **Overlapping clocks must not double-scan, and one user's pass must not touch another's rows.** Lease taken with one `UPDATE ... RETURNING`; the isolation test for a pass. Pinned by Task 14 (and Task 1 for the scoped helpers).
4. **Each channel gets each batch exactly once, at the right hour.** `sent_through`, as-found ceiling of 6 a day, quiet hours across midnight, a daylight saving change, a 429 that leaves `sent_through` where it was. Pinned by Task 32 and Task 33.
5. **Secrets and open routes.** The bot token never reaches a log or a URL the app prints; the webhook and unsubscribe routes answer a cookieless call themselves (401, 404, 200) and never redirect to `/login`; a link code is single use, hashed and 15 minutes old at most. Pinned by Task 34 and Task 35.

## Module map

### Milestone 16: Scanner

| File | New/changed | One responsibility |
|---|---|---|
| `lib/db/schema/feed.ts` | new | `feed_source`, `feed_item`, `scan_run` |
| `lib/db/schema/app.ts`, `pipeline.ts`, `lib/pipeline/values.ts` | changed | profile `feed`, `feed_score_day`, `feed_score_count`; `company.ats_region`; `posting_gone` event kind |
| `lib/db/migrations/0004_*` (next free number) | new | the migration for the above |
| `lib/db/scoped/feed-source.ts`, `feed-item.ts`, `scan-run.ts`, `index.ts` | new, changed | scoped helpers for the three tables |
| `lib/db/system.ts` | new | `dueSources` (ids only) |
| `lib/db/scoped/opportunity.ts` | changed | `findActiveBySourceUrl` |
| `lib/feed/home-fallback.ts`, `lib/feed/cli.ts` | new | `shouldScanOnHome`; `pnpm feed:scan` arguments and output |
| `lib/intake/ats/match.ts`, `resolve.ts`, `form.ts`, `add-job.ts`, `lib/pipeline/create.ts`, `create-schema.ts` | changed | `region` carried through intake |
| `lib/intake/fetch-guard.ts` | changed | `xml` and `text` accept, conditional requests, `etag`, `lastModified`, `retryAfterSeconds`, `rate_limited` |
| `lib/feed/values.ts` | new | every constant, enum and limit of Feed |
| `lib/feed/config.ts` | new | `parseFeedConfig` (Feed env variables) |
| `lib/feed/listing/types.ts`, `greenhouse.ts`, `ashby.ts`, `lever.ts`, `careers-page.ts` | new | readers and the `Listing` shape |
| `lib/feed/robots.ts` | new | robots.txt rules for the token `Jobsmith`, RFC 9309 outcomes |
| `lib/feed/filter.ts` | new | stored filter result for one item |
| `lib/feed/items.ts` | new | upsert, change detection, missing, expire (the item state writer) |
| `lib/feed/dedupe.ts` | new | match an item against the board |
| `lib/feed/retention.ts` | new | the retention pass |
| `lib/feed/health.ts`, `log.ts` | new | health, backoff, next scan time; `[feed]` log lines |
| `lib/feed/sources.ts` | new | track, stop, edit link (the source and tracking writer) |
| `lib/feed/scan.ts` | new | `scanSource`: one source, one scan |
| `lib/feed/limiter.ts`, `fixture-fetch.ts`, `deps.ts` | new | host limiter, `FEED_FETCH=fixtures` fetch, production deps |
| `lib/feed/schedule.ts`, `steps.ts` | new | `runDueScans`, lease, budget, pass steps |
| `lib/feed/tracking.ts`, `messages.ts` | new | the tracking line model, health words, copy |
| `lib/jobs/feed.ts` | new | the feed step of the tick |
| `scripts/feed-scan.ts`, `package.json` | new, changed | `pnpm feed:scan` |
| `lib/preferences/schema.ts`, `form.ts`, `summary.ts`, `lib/fit/hard-filters.ts`, `messages.ts`, `components/preferences/preferences-form.tsx` | changed | `titlesExclude` |
| `app/(app)/companies/page.tsx`, `actions.ts`, `components/feed/*` | changed, new | tracking dialog, tracking line, health states, `maxDuration = 60` |
| `lib/companies/overview.ts`, `load.ts` | changed | tracking data per company |
| `app/(app)/page.tsx` | changed | Home's bounded scan fallback, `maxDuration = 60` |
| `tests/fixtures/feed/*`, `tests/helpers/feed.ts` | new | fictional listings, pages, manifest, builders |

### Milestone 17: Feed

| File | New/changed | One responsibility |
|---|---|---|
| `lib/pipeline/duplicates.ts`, `lib/db/scoped/opportunity.ts` | changed | `findClosedDuplicate`, `listClosedForDedupe` |
| `lib/feed/settings.ts` | new | `FeedSettings`, tolerant `parseFeedSettings`, `effectiveScoreCap` |
| `lib/feed/row-model.ts`, `detail.ts`, `sheet-model.ts` | new | row chips, item detail, fit view for the sheet |
| `lib/fit/adopt.ts` | new | `adoptFit` |
| `lib/time/zone.ts` | changed | `zonedDate` |
| `lib/db/scoped/profile.ts` | changed | `reserveFeedScore` |
| `lib/feed/score.ts` | new | cap reservation, Meter, eligibility, scoring |
| `lib/feed/save.ts` | new | `saveFeedItem` |
| `lib/pipeline/create.ts` | changed | `eventMeta` on the `created` event |
| `lib/feed/items.ts`, `sources.ts` | changed | `markSeen`, `dismissItem`, `restoreItem`, `markGroupSeen`, `snoozeSource`, `unsnoozeSource` |
| `lib/feed/refilter.ts` | new | rerun filters over open items |
| `lib/feed/query.ts`, `list.ts` | new | Feed query parameters and the page loader |
| `app/(app)/feed/page.tsx`, `actions.ts`, `components/feed/*` | new | the Feed page, row, filters, item sheet |
| `components/home/new-roles-card.tsx`, `app/(app)/page.tsx`, `lib/attention/load.ts`, `components/app-shell.tsx` | new, changed | Home card, nav |
| `lib/export/collect.ts` | changed | `feedSources`, `feedItems`, `scanRuns`, `profile.feed` |

### Milestone 18: Alerts

| File | New/changed | One responsibility |
|---|---|---|
| `lib/db/schema/notify.ts`, migration, `lib/db/scoped/notification.ts`, `notification-delivery.ts`, `telegram-link.ts`, `notify-channel.ts` | new | the four tables and helpers |
| `lib/db/system.ts` | changed | `dueDigests`, `linkByCodeHash`, `linkByChatId` |
| `lib/notify/config.ts`, `values.ts`, `messages.ts` | new | `parseNotifyConfig`, constants, copy |
| `lib/notify/channels/driver.ts`, `fake.ts`, `telegram.ts`, `email.ts` | new | channel drivers |
| `lib/notify/write.ts` | new | `notify`, the notification and delivery writer |
| `lib/notify/rules.ts`, `batch.ts`, `channel-state.ts` | new | alert eligibility, quiet hours, due times; in-app batches; channel rows |
| `lib/notify/webhook.ts`, `unsubscribe.ts`, `webhook-request.ts`, `status.ts` | new | webhook checks, signed unsubscribe token, `setWebhook` request, Telegram status words |
| `components/ui/popover.tsx` | new | `base-nova` popover for the bell |
| `lib/notify/digest.ts` | new | digest text and `sendDigests` |
| `lib/notify/telegram/link.ts`, `updates.ts` | new | link codes, update handling |
| `lib/email/templates/feed-digest.ts`, `lib/email/driver.ts` | new, changed | the `feed_digest` template, optional `headers` |
| `app/api/telegram/webhook/route.ts`, `app/api/notify/unsubscribe/route.ts`, `proxy.ts` | new, changed | the two open routes |
| `scripts/telegram-webhook.ts`, `package.json` | new, changed | `pnpm telegram:webhook` |
| `components/notify/bell.tsx`, `notification-list.tsx`, `components/app-shell.tsx` | new, changed | the bell |
| `app/(app)/settings/page.tsx`, `actions.ts`, `components/settings/alerts-section.tsx` | changed, new | Alerts section and Feed line |
| `lib/feed/steps.ts` | changed | notify steps join the pass |

### Milestone 19: Sources

| File | New/changed | One responsibility |
|---|---|---|
| `lib/feed/values.ts` | changed | Remotive categories, Remote OK tags |
| `lib/feed/listing/xml.ts`, `rss.ts`, `remotive.ts`, `remoteok.ts` | new | XML parsing, RSS and Atom, the two presets |
| `lib/feed/dedupe.ts`, `items.ts` | changed | cross-source duplicates, takeover, 30-day expiry, `name_key` company match |
| `lib/feed/sources.ts`, `scan.ts` | changed | add and remove other sources, readers by kind |
| `app/(app)/feed/sources/page.tsx`, `actions.ts`, `components/feed/source-row.tsx`, `add-source-dialog.tsx` | new | `/feed/sources` |
| `components/feed/item-row.tsx`, `item-sheet.tsx` | changed | "Also on N sources", attribution |

## Contract

### Decisions

Each line: decision, reason. These fill gaps the spec leaves; the owner can overrule any of them.

- **D1. Cross-user entry points take a `Db`.** `runDueScans(db, input, deps)` and the four `lib/db/system.ts` functions take the handle first, because they are the cross-user code. Reason: the spec's own signature has no handle and the Global Constraints need one.
- **D2. Pass steps are three lists in `lib/feed/steps.ts`:** `preSteps` (Telegram poll, Milestone 18), `userSteps` (retention now, scoring in Milestone 17, notify in Milestone 18) and `postSteps` (digests, Milestone 18). Later milestones edit that one file and never `schedule.ts`.
- **D3. `scanSource` sets `next_scan_at`** (all callers need it, including the first scan inside the Track action); `schedule.ts` only takes and clears the lease.
- **D4. A partial listing counts as a success for health** (it produced entries): failures reset, outcome `partial`, `error_code` records the part that failed.
- **D5. A dismissed item that goes missing twice stays `dismissed`** (only `new` and `seen` items expire); `gone_at` is set so retention can age it out.
- **D6. "Matching roles"** on a tracking line are the source's items with `gone_at` null, state `new`, `seen` or `saved`, and `filter_pass` true; "open roles" is `listed_count`.
- **D7. "Check now" spacing** is measured from the latest `manual` or `first` scan run of that source, not from scheduled scans.
- **D8. `body_hash` and `listing_hash`** are the first 16 hex characters of sha256. `listing_hash` is over `normalizeForDedupe(title) + "|" + normalizeForDedupe(location) + "|" + (workMode ?? "")`.
- **D9. Greenhouse `postedAt` is `first_published` when the listing carries it, else null.** Lever uses `createdAt`, Ashby `publishedDate`.
- **D10. Careers-page link detection reads `a[href]` and `script[src]` only** (spec 5.2 step 3), so an iframe embed is not detected.
- **D11. The Ashby listing query** is the Design Career Ops Web prototype's, verbatim (`lib/scanner/scan-portals.ts`): `query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) { jobBoard(organizationHostedJobsPageName: $organizationHostedJobsPageName) { jobPostings { id title locationName publishedDate jobPostingUrl } } }`. An entry with no `jobPostingUrl` gets `https://jobs.ashbyhq.com/<org>/<id>`.
- **D12. The fixture fetch** looks a request up by exact URL; an Ashby POST is looked up under `<url>#<organizationHostedJobsPageName>`. A manifest entry is `{ file, contentType, status?, etag?, lastModified?, retryAfter? }`.
- **D13. With `NOTIFY_CHANNELS=fake`, the Telegram link flow is available** and `fake` stands in for the Telegram channel, so the end-to-end suite links a chat through the webhook with no bot. The bot username under `fake` is `jobsmith_fake_bot`.
- **D14. Link code normalization is Crockford's:** uppercase, dashes and spaces removed, `I` and `L` read as `1`, `O` as `0`, then sha256 hex of the 8 characters.
- **D15. The unsubscribe token** is `base64url(JSON {u,c}) + "." + base64url(HMAC-SHA256(payload))` keyed by `BETTER_AUTH_SECRET`; the route verifies it in constant time and takes the user id from the verified payload.
- **D16. The settings change for `profile.feed`** is validated by one strict Zod schema, `feedSettingsInputSchema`, and read tolerantly by `parseFeedSettings`, the way `preferences` is.
- **D17. A `ChannelDriver` failure may carry `retryAfterSeconds`** (Telegram's `retry_after`); the success and the four error codes are the spec's.
- **D18. Live smoke variable names:** `FEED_LIVE_GREENHOUSE_ORG` is the spec's; its siblings follow its pattern, `FEED_LIVE_LEVER_ORG` and `FEED_LIVE_ASHBY_ORG`.
- **D19. Two query parameters beyond the spec's list:** `mode` (work mode filter, repeatable) and `cursor` (an offset into the sorted list, for "Show more"). The spec lists `view`, `group`, `source`, `min`, `misses`, `q`, `item` and also asks for a work mode filter and a cursor.
- **D20. The fake channel's `providerId` is the message's plain text.** The spec has the end-to-end suite read the digest text from the delivery row, which has no text column; real drivers store the vendor's message id there.
- **D21. A digest lists the items of the unsent batches that are still `new` or `seen` and primary at send time.** An empty digest is recorded `skipped` and still moves `sent_through`.
- **D22. When a primary expires, the earliest remaining duplicate becomes primary.** The spec is silent; without it a role would stay hidden under an expired item.
- **D23. "Pause" on a company source in `/feed/sources`** sets `enabled` and `company.tracked` together and keeps the items; "Stop tracking" (and "Delete") removes new, seen and expired items.
- **D24. A failed score carries `fit = { "failedAttempts": n }`** (not a stored fit; `parseStoredFit` reads it as none), so "retried once" has a counter without a new column. A `score_attempts` column is the clean alternative if the owner prefers it.
- **D25. The wrong-code counter for Telegram linking** (10 per chat per hour) is in memory per server instance, since the spec names no storage for it.
- **D26. Telegram controls in Settings show when `NOTIFY_CHANNELS` includes `telegram` or `fake`** (see D13).
- **D27. `feed_item.dedupe_hash` is computed from the listing's fields at insert** and is not recomputed after a detail call refines the location.
- **D28. The tick budget.** Hosted's tick passes no budget to its steps and its route has `maxDuration` 60 (Hosted Task 14), while spec 5.10 allows the feed step up to 120 seconds. The feed step computes `min(120 s, 60 s - time since the tick started - 10 s)`, so on Hosted's route it gets about 50 seconds. A longer budget needs the owner to raise the tick route's `maxDuration`, which spec 5.10 says Feed does not change.
- **D29. `notification.kind` has no list check.** The spec calls the set open (Home and Debrief add kinds); `NOTIFICATION_KINDS` in `lib/notify/values.ts` is the typed list, the column only has a length check, and digests read `feed_items` rows only.

### Environment variables

| Name | Meaning | Parsed in |
|---|---|---|
| `FEED_SCAN` | `off` makes `runDueScans` return at once | `lib/feed/config.ts` |
| `FEED_FETCH` | `fixtures` swaps the guard for the fixture fetch (tests only) | `lib/feed/config.ts` |
| `FEED_FIXTURES` | path of the fixture manifest, required when `FEED_FETCH=fixtures` | `lib/feed/config.ts` |
| `FEED_MAX_COMPANIES` | tracked companies per user, default 100 | `lib/feed/config.ts` |
| `FEED_SCORES_PER_DAY_MAX` | instance ceiling on scores per day, default 100, `0` turns feed scoring off | `lib/feed/config.ts` |
| `NOTIFY_CHANNELS` | comma list of `telegram`, `email`, `fake`; unset means in-app only | `lib/notify/config.ts` |
| `TELEGRAM_BOT_TOKEN` | required for `telegram` | `lib/notify/config.ts` |
| `TELEGRAM_UPDATES` | `poll` (default) or `webhook` | `lib/notify/config.ts` |
| `TELEGRAM_WEBHOOK_SECRET` | 32 or more characters, required in webhook mode | `lib/notify/config.ts` |
| `EMAIL_PROVIDER`, `EMAIL_FAKE_DIR`, `APP_URL`, `CRON_SECRET`, `BETTER_AUTH_SECRET`, `AI_PROVIDER` | Hosted's and Core's, only read | |

A misconfigured value fails boot with the variable's name, through `EnvError`, as `parseAiConfig` does. `FEED_LIVE_*` are read only by the opt-in live test.

### Constants and enums (`lib/feed/values.ts`, Task 4; Milestone 19 adds the preset lists)

```ts
export const FEED_SOURCE_KINDS = ["company", "rss", "remotive", "remoteok"] as const;
export type FeedSourceKind = (typeof FEED_SOURCE_KINDS)[number];
export const FEED_HEALTH = ["ok", "warning", "failing", "unsupported"] as const;
export type FeedHealth = (typeof FEED_HEALTH)[number];
export const FEED_ITEM_STATES = ["new", "seen", "saved", "dismissed", "expired"] as const;
export type FeedItemState = (typeof FEED_ITEM_STATES)[number];
export const FEED_FIT_STATUSES = ["none", "pending", "done", "failed", "capped"] as const;
export type FeedFitStatus = (typeof FEED_FIT_STATUSES)[number];
export const SCAN_TRIGGERS = ["cron", "command", "home", "manual", "first"] as const;
export type ScanTrigger = (typeof SCAN_TRIGGERS)[number];
export const SCAN_OUTCOMES = ["ok", "partial", "not_modified", "failed", "unsupported", "skipped"] as const;
export type ScanOutcome = (typeof SCAN_OUTCOMES)[number];
export const UNSUPPORTED_CODES = ["robots_disallowed", "script_rendered", "no_job_links", "login_required", "no_link"] as const;
export type UnsupportedCode = (typeof UNSUPPORTED_CODES)[number];
export type ScanErrorCode = FetchFailure | "unreadable" | UnsupportedCode | "robots_unreachable" | "over_limit";   // FetchFailure includes "rate_limited"; robots_unreachable ends a scan as skipped; over_limit marks a partial scan
export const ATS_REGIONS = ["us", "eu"] as const;                           // lives in lib/pipeline/values.ts
export const SCAN_INTERVALS = [3, 6, 12, 24] as const;
export const DEFAULT_INTERVAL_HOURS = 6;
export const PRESET_MIN_INTERVAL_HOURS = 12;
export const FEED_LIMITS = {
  companiesPerUser: 100, otherSourcesPerUser: 20, itemsPerUser: 3000, entriesPerListing: 500,
  leverPages: 10, leverPageSize: 50, careerLinks: 300, rssItems: 200, detailCallsPerSource: 10,
  detailAttempts: 3, requestsPerUserPerPass: 300, retentionDays: 90, aggregatorExpiryDays: 30,
  scanRunKeepDays: 30, deliveryKeepDays: 30, retentionRowsPerRun: 500,
} as const;
export const TIMING = {
  sourceCeilingMs: 60_000, leaseMs: 300_000, minBudgetToStartMs: 30_000, checkNowSpacingMs: 600_000,
  homeOverdueMs: 5_400_000, homeRunSpacingMs: 900_000, jitterMax: 0.1, maxBackoffHours: 48,
  hostGapApiMs: 500, hostGapOtherMs: 2_000, inFlightMax: 4, robotsRecheckMs: 86_400_000,
  homeBudgetMs: 20_000, manualBudgetMs: 30_000, firstBudgetMs: 20_000, firstDetailCalls: 3,
  commandBudgetDefaultMs: 600_000, commandBudgetMaxMs: 3_600_000, cronBudgetMaxMs: 120_000, cronBudgetReserveMs: 10_000,
} as const;
export const SCRIPT_RENDERED_HOSTS = ["myworkdayjobs.com", "icims.com", "taleo.net", "successfactors.com"] as const;
export const JOB_PATH_SEGMENTS = ["jobs", "job", "careers", "positions", "openings", "roles"] as const;
export const NAV_WORDS: readonly string[];   // lower-case navigation words, "careers" "all jobs" "apply" "back" and more
export function feedUserAgent(version: string): string;  // `Jobsmith/${version} (job feed; +https://github.com/weeeha/Jobsmith)`
export const FEED_USER_AGENT: string;                    // feedUserAgent(package.json version)
export const SNOOZE_DAYS = [1, 7, 30] as const;
export const SCORE_DEFAULTS = { scoresPerDay: 30, instanceCeiling: 100, capRetryDays: 7, taskDayCap: 60 } as const;
```

### Tables

Columns are exactly those of spec section 4; Drizzle property names are the camel-case of the column names. Constraint and index names below are binding because tests name them.

- `feed_source` (`lib/db/schema/feed.ts`, export `feedSource`): unique `feed_source_user_id_id_unique` on (`user_id`, `id`); unique index `feed_source_user_company_unique` on (`user_id`, `company_id`) where `company_id` is not null; check `feed_source_kind_check`; check `feed_source_company_check` (`(kind = 'company') = (company_id is not null)`); check `feed_source_interval_check` (`interval_hours in (3, 6, 12, 24)`); check `feed_source_health_check`; index `feed_source_due_idx` on (`next_scan_at`) where `enabled`; composite FK `feed_source_company_fk` (`user_id`, `company_id`) to `company` on delete cascade.
- `feed_item` (export `feedItem`): unique `feed_item_user_id_id_unique`; unique `feed_item_source_external_unique` on (`source_id`, `external_id`); composite FK `feed_item_source_fk` (`user_id`, `source_id`) to `feed_source` on delete cascade; single-column FKs, on delete set null, for `company_id`, `opportunity_id` and `duplicate_of_id` (the `artifact.stage_id` pattern); checks `feed_item_state_check`, `feed_item_fit_status_check`, `feed_item_work_mode_check`, `feed_item_fit_score_check` (0 to 100 or null), `feed_item_url_check` (starts with `http://` or `https://`); indexes `feed_item_user_state_seen_idx` on (`user_id`, `state`, `first_seen_at`), `feed_item_user_dedupe_idx` on (`user_id`, `dedupe_hash`), `feed_item_pending_idx` on (`user_id`, `fit_status`) where `fit_status = 'pending'`.
- `scan_run` (export `scanRun`): composite FK `scan_run_source_fk` (`user_id`, `source_id`) to `feed_source` on delete cascade; checks on `trigger` and `outcome`; index on (`source_id`, `started_at`).
- `profile`: `feed` jsonb not null default `{}`, `feed_score_day` date nullable, `feed_score_count` integer not null default 0.
- `company`: `ats_region` text not null default `us`, check `company_ats_region_check` (`in ('us', 'eu')`).
- `event_kind_check` is dropped and re-added with every kind in `EVENT_KINDS` at that time plus `posting_gone` (Task 1 reads the live list).
- Milestone 18 tables (`lib/db/schema/notify.ts`): `notification`, `notification_delivery`, `telegram_link` (primary key `user_id`), `notify_channel` (unique `notify_channel_user_channel_unique` on (`user_id`, `channel`)), columns as spec section 4.

### Types and signatures

```ts
// lib/intake/fetch-guard.ts (Task 3)
export type GuardFailure = { ok: false; code: FetchFailure; message: string; retryAfterSeconds?: number; status?: number };   // status only for http_error and rate_limited
export type GuardResult = { ok: true; data: GuardedResponse } | GuardFailure;
export type GuardedFetch = (url: string, options: GuardOptions) => Promise<GuardResult>;
export type GuardOptions = { accept: "html" | "json" | "xml" | "text"; conditional?: { etag: string | null; lastModified: string | null } } & /* existing fields */;
export type GuardedResponse = { url: string; status: number; contentType: "html" | "json" | "xml" | "text"; body: string; redirects: number; etag: string | null; lastModified: string | null; retryAfterSeconds: number | null };

// lib/intake/ats/match.ts (Task 4)
export type AtsBoardRef = { kind: AtsVendor; org: string; region: "us" | "eu" };
export function matchAtsBoardUrl(raw: string): AtsBoardRef | null;   // board links, embed links, and every link matchAtsUrl accepts

// lib/feed/listing/types.ts (Task 5)
export type ListingEntry = { externalId: string; url: string; companyName: string; roleTitle: string; location: string | null; workMode: WorkMode | null; compMin: number | null; compMax: number | null; compCurrency: string | null; postedAt: Date | null; bodyMd?: string };
export type Listing = { complete: boolean; entries: ListingEntry[]; skipped: number; requests: number; notModified: boolean; etag: string | null; lastModified: string | null; partialError: ScanErrorCode | null; foundAts: AtsBoardRef | null; robots: { checkedAt: Date; allowed: boolean } | null };
export type ReaderSource = { kind: FeedSourceKind; companyName: string | null; ats: AtsBoardRef | null; careersUrl: string | null; url: string | null; params: Record<string, string>; etag: string | null; lastModified: string | null; robotsCheckedAt: Date | null; robotsAllowed: boolean | null };
export type ReaderDeps = { fetch: GuardedFetch; now: () => Date; signal?: AbortSignal };
export type ReaderResult = Result<Listing, ScanErrorCode> & { retryAfterSeconds?: number };
export type ListingReader = (source: ReaderSource, deps: ReaderDeps) => Promise<ReaderResult>;
export function listingHash(parts: { roleTitle: string; location: string | null; workMode: WorkMode | null }): string;
export function urlExternalId(url: string): string;   // first 32 hex of sha256 over the URL
export function emptyListing(partial?: Partial<Listing>): Listing;

// lib/feed/filter.ts (Task 7)
export type ItemFacts = { roleTitle: string; location: string | null; workMode: WorkMode | null; compMin: number | null; compMax: number | null; compCurrency: string | null };
export function itemFilter(facts: ItemFacts, preferences: Preferences): { pass: boolean; failed: HardFilter[] };

// lib/feed/items.ts (Task 8; Milestones 17 and 19 add functions)
export type ApplyCounts = { newItems: number; changedItems: number; missingItems: number; expiredItems: number; filteredOut: number; overLimit: boolean };
export function applyListing(s: Scoped, source: FeedSourceRow, listing: Listing, ctx: { now: Date; preferences: Preferences }): Promise<ApplyCounts>;
export function applyDetail(s: Scoped, itemId: string, detail: { bodyMd: string; location: string | null; workMode: WorkMode | null }, ctx: { now: Date; preferences: Preferences }): Promise<void>;

// lib/feed/dedupe.ts (Task 8)
export function boardMatch(s: Scoped, parts: { companyName: string; roleTitle: string; location: string | null; url: string }): Promise<{ id: string; slug: string } | null>;

// lib/feed/health.ts (Task 10)
export function nextHealth(prev: { health: FeedHealth; consecutiveFailures: number }, outcome: "success" | "failure" | "unsupported" | "skipped"): { health: FeedHealth; consecutiveFailures: number };
export function nextScanAt(input: { now: Date; intervalHours: number; consecutiveFailures: number; rand: () => number; retryAfterSeconds?: number }): Date;

// lib/feed/sources.ts (Task 11; Milestones 17 and 19 add functions)
export type TrackInput = { companyId?: string; name?: string; link?: string };
export type TrackError = "invalid" | "login_walled" | "no_link" | "limit" | "not_found";
export function trackCompany(s: Scoped, input: TrackInput, now: Date, maxCompanies: number): Promise<Result<{ companyId: string; sourceId: string }, TrackError>>;
export function stopTracking(s: Scoped, companyId: string): Promise<Result<{ removedItems: number }, "not_found">>;
export function updateCompanyLink(s: Scoped, companyId: string, link: string, now: Date): Promise<Result<{ sourceId: string }, TrackError>>;
export function canCheckNow(s: Scoped, sourceId: string, now: Date): Promise<boolean>;

// lib/feed/scan.ts (Task 12)
export type ScanInput = { trigger: ScanTrigger; now: Date; budgetMs: number; maxDetailCalls: number };
export type ScanDeps = { fetch: GuardedFetch; now: () => Date; rand: () => number };
export type ScanReport = { sourceId: string; kind: FeedSourceKind; host: string | null; outcome: ScanOutcome; errorCode: ScanErrorCode | null; requests: number; listed: number; newItems: number; changedItems: number; missingItems: number; expiredItems: number; filteredOut: number; details: number; ms: number; retryAfterSeconds: number | null };
export function scanSource(s: Scoped, sourceId: string, input: ScanInput, deps: ScanDeps): Promise<Result<ScanReport, "not_found">>;

// lib/feed/schedule.ts (Task 14)
export type PassLimits = { sourcesPerUser: number; detailCallsPerSource: number; requestsPerUser: number; sourcesTotal: number; score: boolean };
export const FULL_LIMITS: PassLimits;   // { sourcesPerUser: 20, detailCallsPerSource: 10, requestsPerUser: 300, sourcesTotal: 200, score: true }
export const HOME_LIMITS: PassLimits;   // { sourcesPerUser: 5, detailCallsPerSource: 3, requestsPerUser: 300, sourcesTotal: 5, score: false }
export type RunDueScansInput = { now: Date; budgetMs: number; trigger: ScanTrigger; userId?: string; limits: PassLimits };
export type PassReport = { status: "off" | "ran"; started: number; skipped: number; leftDue: number; scoresReserved: number; scoresRefused: number; reports: ScanReport[] };
export type ScheduleDeps = ScanDeps & { sleep?: (ms: number) => Promise<void>; steps?: PassSteps };
export function runDueScans(db: Db, input: RunDueScansInput, deps: ScheduleDeps): Promise<PassReport>;

// lib/feed/steps.ts (Task 14; later milestones edit the three lists)
export type UserStepContext = { now: Date; limits: PassLimits; trigger: ScanTrigger; deps: ScheduleDeps; touchedSourceIds: string[] };
export type UserStep = (s: Scoped, ctx: UserStepContext) => Promise<Partial<Pick<PassReport, "scoresReserved" | "scoresRefused">> | void>;
export type PassStep = (db: Db, input: RunDueScansInput, deps: ScheduleDeps) => Promise<void>;
export type PassSteps = { preSteps: PassStep[]; userSteps: UserStep[]; postSteps: PassStep[] };
export function defaultSteps(): PassSteps;

// lib/db/system.ts (Task 14; Milestone 18 adds three)
export function dueSources(db: Db, now: Date, limit: number, opts?: { userId?: string; perUser?: number }): Promise<{ userId: string; sourceId: string }[]>;
export function dueDigests(db: Db, now: Date): Promise<{ userId: string; channel: "telegram" | "email" | "fake" }[]>;
export function linkByCodeHash(db: Db, codeHash: string, now: Date): Promise<{ userId: string } | null>;
export function linkByChatId(db: Db, chatId: string): Promise<{ userId: string } | null>;

// lib/feed/score.ts (Task 19)
export function reserveScore(tx: Scoped, input: { now: Date; cap: number; timeZone: string }): Promise<boolean>;   // false: no row back, no call
export type ScoreItemResult = { status: "done" | "failed" | "capped" | "not_eligible"; reason: "feed_cap" | "no_credits" | "cap_task_day" | "cap_day" | "cap_global" | "suspended" | "ai_off" | "no_resume" | "no_body" | "misses_filters" | "not_primary" | "wrong_state" | null };
// ctx.db is the root Db handle: the feed reservation and Hosted's Meter (reserve(db: Db, ...)) share one db.transaction, so the transaction's own handle reaches both
export function scoreItem(s: Scoped, itemId: string, deps: FitDeps, ctx: { now: Date; force: boolean; db: Db }): Promise<ScoreItemResult>;
export function scoreEligibleItems(s: Scoped, deps: FitDeps, ctx: { now: Date; limit: number; db: Db; shouldStop?: () => boolean }): Promise<{ reserved: number; refused: number; done: number; failed: number }>;

// lib/feed/save.ts (Task 20)
export type SaveDeps = { fetch: GuardedFetch; fit: FitDeps; now: () => Date };
export type SaveOutcome = { slug: string; kind: "created" | "already_saved" | "already_on_board"; scoreJob: boolean };   // scoreJob: the job was queued, the caller runs scoreSafely in after()
export function saveFeedItem(s: Scoped, itemId: string, deps: SaveDeps): Promise<Result<SaveOutcome, "not_found" | "invalid">>;

// lib/fit/adopt.ts (Task 18)
export function adoptFit(s: Scoped, opportunityId: string, from: { score: number; fit: StoredFit }): Promise<boolean>;

// lib/pipeline/duplicates.ts (Task 18)
export function findClosedDuplicate(s: Scoped, parts: DedupeParts): Promise<{ id: string; slug: string } | null>;   // newest closed match

// lib/pipeline/create.ts (Tasks 2 and 20)
// CreateOpportunityInput.ats becomes { kind: AtsVendor; org: string; region: "us" | "eu" }; gains eventMeta?: Record<string, unknown>

// lib/notify (Milestone 18)
export type NotifyChannelName = "telegram" | "email" | "fake";
export type NotifyErrorCode = "notify_blocked" | "notify_rate_limited" | "notify_timeout" | "notify_error";
export type ChannelTarget = { chatId?: string; email?: string; userId: string };
export type ChannelMessage = { subject: string; text: string; html: string; telegramHtml: string; url: string; headers?: Record<string, string> };
export type ChannelSendResult = { ok: true; data: { providerId: string | null } } | { ok: false; code: NotifyErrorCode; message: string; retryAfterSeconds?: number };
export interface ChannelDriver { readonly channel: NotifyChannelName; send(target: ChannelTarget, message: ChannelMessage): Promise<ChannelSendResult> }
export type NotifyConfig = { channels: NotifyChannelName[]; telegram: { token: string; updates: "poll" | "webhook"; webhookSecret: string | null } | null };
export function parseNotifyConfig(source: Record<string, string | undefined>): { ok: true; config: NotifyConfig } | { ok: false; invalid: string[] };
export type NotifyInput = { kind: NotificationKind; title: string; body: string; href: string; itemIds: string[]; now: Date };
export type NotifyDeps = { config: NotifyConfig; drivers: Partial<Record<NotifyChannelName, ChannelDriver>>; now: () => Date; appUrl: string };
export function notify(s: Scoped, input: NotifyInput, deps: NotifyDeps): Promise<Result<{ notificationId: string }, "invalid">>;
export function eligibleForAlert(item: AlertFacts, ctx: AlertContext): boolean;
export function nextDigestAt(input: { now: Date; digestHours: number[]; quietHours: { start: number; end: number } | null; timeZone: string }): Date | null;
export function buildDigest(items: DigestItem[], appUrl: string): { subject: string; text: string; html: string; telegramHtml: string; count: number };
```

### Binding copy

| Where | Copy |
|---|---|
| Track dialog result | `Found 42 open roles. 3 match your filters.` (numbers vary; one role reads `Found 1 open role. 1 matches your filters.`; none matching reads `0 match your filters.`) |
| Feed empty state | `Track a company to see its new roles here.` with a link `Companies` |
| Item states on a row | chips `New`, `Changed`, `Also on 1 source` (`Also on 2 sources`), `Misses: location` (names joined with commas), attribution `via Remotive`, `via Remote OK` |
| Board dedupe | `On your board`; closed match: `You had this job before` with a link to that job |
| Snooze | `Snoozed until <date>` (date through `LocalTime`) |
| Home card | heading `New roles`; footer `See all 14 new on Feed`; nothing new: one line `Last checked <time>.`; buttons `Add to board`, `Dismiss`, toast action `Undo`; Dismissed view action `Restore` |
| Health (warning) | `Last check failed. Trying again at 14:00.` |
| Health words (failing) | `not found`, `timed out`, `the site asked Jobsmith to slow down`, `blocked address`, `unreadable answer` (the full table is `HEALTH_REASONS` in `lib/feed/messages.ts`, Task 10) |
| Tracking reader | `Greenhouse board`, `Ashby board`, `Lever board`, `Careers page`; an embed found on a careers page: `Careers page, Greenhouse board found` |
| Score not available | `Score this job`; `Scoring resumes tomorrow.` for a capped item |
| Bell | label `Notifications, 3 unread`; count text `9+` above 9; batch title `5 new roles at 3 companies` |
| Settings | `Link Telegram`; `Use my score threshold (70)`; `Tell me about roles at companies I track, even without a score`; `Email me a digest`; `12 of 30 used today`; `Scans run when you open Home` |
| Telegram message | first line `Jobsmith: 4 new roles`; lines `<b>Role</b> · Company · Location · 82`; `and 3 more`; button `Open Feed` |
| Email digest | subject `4 new roles on Jobsmith` |

The Telegram status words, quiet-hours labels and the remaining dialog strings are drafted in each task and live in `lib/feed/messages.ts` and `lib/notify/messages.ts`.

### Other fixed values

- Link codes: 8 characters of Crockford base32 (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`), shown `XXXX-XXXX`, 15 minutes, sha256 hash stored, a newer code replaces the old; 10 wrong codes in an hour from one chat: ignored for the rest of that hour.
- Telegram message: HTML parse mode with every value escaped, at most 10 lines, role cut to 80 characters, 4,096 characters at most, link previews off, one URL button.
- As-found: at most 6 messages per local day. Digest hours: 1 to 3 whole hours, default 9 and 17. Quiet hours default `{ start: 21, end: 8 }`. A user gets at most one new in-app batch an hour.
- Failures: Telegram 403 sets the link to `blocked`; 429 honors `retry_after` and leaves `sent_through`; five failed attempts at one digest record `failed` and move `next_digest_at` to the next slot.

## Task list

| Task | Milestone | Title | Files touched (short) | Depends on tasks |
|---|---|---|---|---|
| 1 | 16 | Migration, schema and scoped helpers | schema, migration, scoped, isolation test | none |
| 2 | 16 | `ats_region` through intake | match, resolve, form, add-job, create | 1 |
| 3 | 16 | Fetch guard additions | fetch-guard, test helper | none |
| 4 | 16 | Feed values, config and `matchAtsBoardUrl` | values, config, match, env | 2 |
| 5 | 16 | Listing types and the three ATS readers | listing/*, fixtures | 3, 4 |
| 6 | 16 | Robots and the careers page reader | robots, careers-page | 3, 4, 5 |
| 7 | 16 | `titlesExclude` and the item filter | preferences, hard-filters, filter | none |
| 8 | 16 | Item writer: upsert, change, missing, expire, board dedupe | items, dedupe | 1, 5, 7 |
| 9 | 16 | Retention | retention | 1, 8 |
| 10 | 16 | Health, backoff, logs and copy | health, log, messages | 1 |
| 11 | 16 | Sources writer: track, stop, edit link | sources | 1, 4, 8 |
| 12 | 16 | `scanSource` | scan | 5, 6, 8, 10, 11 |
| 13 | 16 | Host limiter, fixture fetch, deps | limiter, fixture-fetch, deps | 3, 4 |
| 14 | 16 | `runDueScans`, lease, system reads, steps | schedule, steps, system | 9, 12, 13 |
| 15 | 16 | Companies: track dialog, tracking line, health | companies page, actions, components | 11, 12, 13 |
| 16 | 16 | Callers: tick step, command, Home fallback | jobs/feed, script, Home | 14 |
| 17 | 16 | End to end, docs and ship | e2e, docs, env | 15, 16 |
| 18 | 17 | `findClosedDuplicate`, `adoptFit`, scoped helpers | duplicates, adopt, zone, profile, opportunity | 17 |
| 19 | 17 | Scoring under a cap | score, steps | 14, 18 |
| 20 | 17 | `saveFeedItem` | save, create | 18, 19 |
| 21 | 17 | Item actions, snooze and refilter | items, sources, refilter, preferences action | 8, 11 |
| 22 | 17 | Feed query and loader | query, list | 8, 18 |
| 23 | 17 | The Feed page | feed page, row, filters, actions | 20, 21, 22 |
| 24 | 17 | The item sheet | sheet, score action | 19, 20, 23 |
| 25 | 17 | Home card and navigation | home card, loadHome, app-shell | 22, 23 |
| 26 | 17 | Export additions (feed tables) | collect | 1 |
| 27 | 17 | End to end, docs and ship | e2e, docs | 23 to 26 |
| 28 | 18 | Migration: notification tables | schema, migration, scoped | 27 |
| 29 | 18 | Notify config, channel interface, fake, writer | config, driver, fake, write | 28 |
| 30 | 18 | Eligibility and in-app batches | rules, steps | 29 |
| 31 | 18 | The bell | bell, list, app-shell, actions | 30 |
| 32 | 18 | Digest timing rules | rules, notify-channel | 29 |
| 33 | 18 | Digest text, sending, as-found | digest, system, steps | 30, 32 |
| 34 | 18 | Telegram channel, link codes, poll updates | channels/telegram, link, updates | 29, 33 |
| 35 | 18 | Webhook, unsubscribe, proxy, `telegram:webhook` | routes, proxy, script | 34 |
| 36 | 18 | Email channel and the `feed_digest` template | channels/email, template, driver | 33 |
| 37 | 18 | Settings: Alerts section and Feed line | settings page, actions, section | 34, 36 |
| 38 | 18 | Export additions (notify tables) | collect | 28 |
| 39 | 18 | End to end, docs and ship | e2e, docs | 31 to 38 |
| 40 | 19 | Preset lists, XML helper, RSS title parsing | values, xml, rss mapping | 39 |
| 41 | 19 | RSS and Atom reader | rss | 40 |
| 42 | 19 | Remotive and Remote OK readers | remotive, remoteok | 40 |
| 43 | 19 | Cross-source dedupe, takeover, expiry | dedupe, items | 41, 42 |
| 44 | 19 | Sources writer and scan by kind | sources, scan | 41, 42, 43 |
| 45 | 19 | `/feed/sources` and Add source | sources page, dialog | 44 |
| 46 | 19 | Row and sheet: Also on N, attribution | item-row, item-sheet | 43 |
| 47 | 19 | End to end, docs and ship | e2e, docs | 44 to 46 |

## Parallel work

Inside Milestone 16: Tasks 1, 3 and 7 touch disjoint files and run together; after them Tasks 2 and 4 follow Task 1 and run together; Tasks 5 and 10 run together; Tasks 6 and 8 run together once Task 5 is done; Tasks 9, 11 and 13 run together; Tasks 15 and 16 run together after Task 14.

Inside Milestone 17: after Task 18, Tasks 19, 21 and 22 touch different files and run together; Task 26 can run any time after Task 1 of this plan. Tasks 24 and 25 run together after Task 23.

Inside Milestone 18: after Task 29, Tasks 30 and 32 run together, and so do Tasks 34 and 36 once Task 33 is done; Task 38 runs any time after Task 28. Task 31 runs beside Task 33.

Inside Milestone 19: Tasks 41 and 42 run together after Task 40; Tasks 45 and 46 run together after Task 44.

Tasks that edit `lib/feed/steps.ts` (14, 19, 30, 33), `lib/feed/items.ts` (8, 21, 43), `lib/feed/sources.ts` (11, 21, 44), `components/app-shell.tsx` (25, 31) or `lib/export/collect.ts` (26, 38) never run at the same time as each other.
