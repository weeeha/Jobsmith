# Jobsmith Feed: design spec

- Date: 2026-11-01
- Status: draft for owner review
- Scope: cycle 4 of 8 (Feed). Builds on the Core spec, `docs/superpowers/specs/2026-09-18-jobsmith-core-design.md`, and the Prep spec, `docs/superpowers/specs/2026-11-01-jobsmith-prep-design.md`, whose rules stay in force unless a section here says otherwise. It also builds on the Hosted beta spec, `docs/superpowers/specs/2026-11-01-jobsmith-hosted-design.md` (cycle 3), whose milestones 11 to 15 are merged before Feed starts.
- Replaces: the portal scanner in the owner's Design Career Ops Web prototype (`lib/scanner/`) and the fetcher, matcher and Telegram bot in the Job Search Bot prototype (`lib/sources/`, `lib/matcher/`, `lib/telegram/`).
- Visual plan: a "Feed" page in the "JS - Design" Figma file, drafted before each milestone plan.

## TL;DR

- Feed watches the companies the user tracks and the few sources the user adds, and shows their new roles on Home and on a Feed page. It keeps no job index of its own and scans nothing a user did not add. Home keeps the attention list first and puts the feed block under it: sell the prep, and treat the feed as a convenience.
- A tracked company is read through its ATS's public listing API (Greenhouse, Ashby, Lever), with Core's intake adapters mapping each posting, or through its careers page via the fetch guard, an ATS-embed check and a job-link heuristic. A page Jobsmith cannot read is shown as unsupported, with the reason.
- Each role is a `feed_item` with a lifecycle (`new`, `seen`, `saved`, `dismissed`, `expired`), change detection against the previous listing, and dedupe against the board and other sources by Core's `dedupe_hash`.
- Hard filters run in code on every item, free. Only items that pass, or that the user opens and asks to score, reach `scoreFit`, through a per-user daily reservation (default 30 scores, about a cent each on the default model).
- One function, `runDueScans`, runs as a step of the Hosted spec's 15-minute maintenance tick (Vercel Cron on the owner's deployment, `pnpm jobs:tick` elsewhere), from `pnpm feed:scan`, and as a bounded fallback when a signed-in user opens Home. A lease on each source row makes overlapping clocks safe.
- Alerts go through `lib/notify`: an in-app bell always; Telegram when the instance has a bot and the user links a chat with a one-time code; email digests through the Hosted spec's `lib/email` when a provider is set. Digests go out at chosen hours and wait through quiet hours in the profile time zone.
- RSS and Atom feeds and two public JSON presets (Remotive, Remote OK) arrive in the last milestone and are the first cut.
- Feed ships in four milestones, 16 to 19. Each has a done-when test. Plans are written one milestone at a time.

## 1. Context and goals

Core (cycle 1) is live. `company` already carries `tracked`, `careers_url`, `ats_kind` and `ats_org` (Core section 4), unused so far. Intake reads one posting from the Greenhouse, Ashby or Lever API or from a web page (`lib/intake/`), fit scores a job once it is on the board (`lib/fit/`), and Home lists what to do today (`lib/attention/items.ts`). Prep (cycle 2) is specified as milestones 6 to 10 and is not built. Core 5.8 leaves the feed block on the Home wireframe to this cycle. Prerequisite: cycles ship in order, so Feed assumes Hosted milestones 11 to 15 are merged, including `lib/email`, the credit `Meter` and the maintenance tick that runs scheduled steps every 15 minutes. Feed builds none of the three and only calls them; with `HOSTED` off, the Meter is Hosted's own no-op implementation.

The owner's two prototypes each built half of a feed. Design Career Ops Web scanned a hardcoded list of ATS boards once a day with a title keyword filter and inserted every match straight into the pipeline. Job Search Bot pulled five aggregator APIs, prefiltered in code, scored with a model and pushed the top five matches a day to Telegram. Feed keeps what worked and fixes five problems: the tracked companies were a list in source code; matches went straight into the pipeline, so the board filled with roles nobody chose; every job that passed a keyword check was scored, with no ceiling on spend; the Telegram bot depended on a webhook, which a self-hosted copy behind a home router cannot receive; and neither noticed when a role was taken down.

### Goals

1. Hear within hours when a tracked company opens a role that passes the user's filters, without visiting its careers page.
2. Move that role to the board in one tap, with its posting snapshot and fit score.
3. Spend a known, capped amount on scoring per user per day.
4. Run on any clock: Vercel cron, a self-hoster's cron or systemd timer, or only the user's own visits to Home.
5. Alert in the app always, and by Telegram or email at hours the user chose.

### Non-goals for Feed

A job index or search across companies nobody tracks, LinkedIn in any form (Core 5.5), keyed aggregator APIs (JSearch, Adzuna), careers sites that build their list in the browser (Workday and similar), a page-diff "watch this URL" source, web push, interview reminders (Home's, section 12), acting on items from inside Telegram, and adding roles to the board without a tap.

### Success criteria

The four done-when tests in section 9, verified in Chrome and Safari on desktop and at a phone viewport, plus seven days of the owner's real tracked companies on the deployment with the `[feed]` log showing every source scanned at its interval and no model call past the daily cap.

## 2. Principles

Core's seven and Prep's four carry over. Feed adds five.

17. **The feed is the user's own list.** A source exists because a user added it: a tracked company or a feed link. An item reaches the board only through the user's tap. Home shows the attention list first and the feed block under it.
18. **Code filters first; the model gets a capped share.** Hard filters run on every item. The model sees items that pass or that the user asked to score, and only after a daily reservation succeeds.
19. **Polite by default.** One identifying user agent, conditional requests, per-host spacing, robots rules for HTML pages, `Retry-After` honored, backoff on failure, and every scan request through the fetch guard.
20. **One scan function, any clock.** Cron, a command, the Home page and "Check now" call the same code. A lease on each source row decides who runs it.
21. **Cross-user reads return ids only.** The scheduler and the Telegram update handler are the only code that reads across users, through four functions in `lib/db/system.ts` that return ids. Every read and write after that goes through `scopedFor(userId)` (`lib/db/scoped/index.ts`).

## 3. Architecture

### Stack additions

| Concern | Choice | Self-host note |
|---|---|---|
| Scheduling | `lib/feed/schedule.ts` exports `runDueScans({ now, budgetMs, trigger, userId?, limits })`. Callers: a `feed` step registered with Hosted's maintenance tick (Hosted owns the route, `CRON_SECRET` and the 15-minute Vercel Cron entry), `pnpm feed:scan` (`scripts/feed-scan.ts`), Home's bounded fallback through `after()`, and "Check now" | `pnpm jobs:tick` or `pnpm feed:scan` from cron or a systemd timer every 15 to 60 minutes; with neither, scans run when the user opens Home |
| Listing readers | `lib/feed/listing/`: `greenhouse`, `ashby`, `lever`, `careers-page`, `rss`, `remotive`, `remoteok`, all through the guarded fetch, all returning one `Listing` shape | none |
| Feed parsing | linkedom's XML mode (already a dependency for intake), with any `<!DOCTYPE` stripped before parsing | none |
| Robots rules | `robots-parser` (MIT) | none |
| Notifications | `lib/notify`: the in-app notification row always, plus channel drivers `telegram`, `email` (over the Hosted spec's `EmailDriver`) and `fake`, picked by `NOTIFY_CHANNELS` (comma list, off when unset, like `AI_PROVIDER`) | in-app only needs nothing set |
| Telegram | Bot API over `fetch`, no SDK. `TELEGRAM_BOT_TOKEN`; `TELEGRAM_UPDATES` = `poll` (default) or `webhook`; `TELEGRAM_WEBHOOK_SECRET` (32 or more characters) for webhook mode | poll mode needs no public URL |
| Kill switch | `FEED_SCAN=off` makes `runDueScans` return at once, for an incident or a vendor's complaint | none |
| Test fetch | `FEED_FETCH=fixtures` with `FEED_FIXTURES=<manifest.json>`: a `GuardedFetch` that answers exact URLs from files and fails every other URL with `network_error`; it never opens a socket | tests only |

### Module map additions

```
app/(app)/feed/                   Feed page, item sheet (?item=<id>), /feed/sources
app/(app)/companies/              Track a company dialog, tracking line per company
app/(app)/settings/               Alerts section (Telegram link, rules, quiet hours), feed scoring
app/(app)/page.tsx                feed block under the attention list, bounded scan fallback
app/api/telegram/webhook/         POST, secret header, /start and /stop
app/api/notify/unsubscribe/       POST, signed token, turns email digests off
components/feed/                  item row, item sheet, home block, source health line, add-source dialog
components/notify/                bell, notification list
lib/feed/                         sources, scan (one source), schedule (runDueScans, lease, budget,
                                  host limiter), listing/, items (upsert, change, missing, expire,
                                  retention), dedupe, filter, refilter, score, save, robots, values, log
lib/notify/                       config, write, rules (eligibility, quiet hours, due times), digest,
                                  channels/telegram, channels/email, channels/fake, telegram/link, telegram/updates
lib/jobs/feed.ts                  the feed step of the maintenance tick (Hosted 5.13)
lib/email/templates/feed-digest.ts  the email digest
lib/db/system.ts                  dueSources, dueDigests, linkByCodeHash, linkByChatId (ids only)
scripts/feed-scan.ts              pnpm feed:scan
scripts/telegram-webhook.ts       pnpm telegram:webhook [--remove]
```

Core's rules hold: `requireUser()` in every page, action and handler (the webhook and unsubscribe routes check their own secrets instead and never take a user id from the request; the tick route is Hosted's), `app/` and `components/` never import the database client, typed `Result` returns for expected failures. Feed adds owners: `lib/feed/items.ts` is the only writer of `feed_item` state, `lib/feed/save.ts` reaches the board only through `createOpportunity` (`lib/pipeline/create.ts`), and `lib/notify/write.ts` is the only writer of notifications and deliveries. The fetch guard stays in `lib/intake/fetch-guard.ts` and remains the only code that fetches a user-supplied address; Telegram's fixed API host is called with a plain `fetch` and a 10-second timeout.

## 4. Data model

Feed adds seven owned tables, changes three existing ones (`profile`, `company`, `event`) and adds one field to the preferences document. All follow Core's conventions: uuid primary keys (one-per-user tables key on `user_id`), `user_id` text with an index, `created_at` and `updated_at` as `timestamptz`, composite foreign keys on (`user_id`, `id`), one file per table under `lib/db/scoped/`, and a row in the isolation test. Check constraints list every kind from the first migration, so later milestones add rows and never widen a constraint.

**feed_source** (owned): `kind` (`company`, `rss`, `remotive`, `remoteok`), `company_id` (nullable, cascade; required exactly when `kind` is `company`, check constraint; unique per user where set), `label` (up to 80 characters; null for `company`, which shows the company's name), `url` (the feed link for `rss`; null for `company`, whose company row holds `careers_url`, `ats_kind`, `ats_org`, `ats_region`, and null for presets, whose endpoints live in code), `params` jsonb (default `{}`; `{ category }` for Remotive and `{ tag }` for Remote OK, each from a fixed list in `lib/feed/values.ts`), `enabled` (default true; mirrors `company.tracked` for `company`), `snoozed_until` (nullable), `interval_hours` (3, 6, 12 or 24; default 6, presets at least 12), `next_scan_at` (default now), `lease_until` (nullable), `last_scan_at`, `last_success_at` (nullable), `health` (`ok`, `warning`, `failing`, `unsupported`; default `ok`), `error_code` (nullable), `consecutive_failures` (default 0), `etag` and `last_modified` (nullable, from the last 200 answer to the listing call), `robots_checked_at` and `robots_allowed` (nullable), `listed_count` (roles in the last complete listing). Index on `next_scan_at` where `enabled`, for the scheduler.

**feed_item** (owned): `source_id` (cascade), `company_id` (nullable, set null; set for company sources and for aggregator items whose company name matches one of the user's companies by `name_key`), `external_id` (up to 200: the vendor's job id, the feed's guid, or the first 32 hex characters of sha256 over the URL), `url` (up to 2,048, http or https), `company_name`, `role_title` (up to 200 each), `location` (nullable, up to 200), `work_mode` (nullable, Core's three values), `comp_min`, `comp_max`, `comp_currency` (nullable, only when the source states them), `posted_at` (nullable), `posting_md` (nullable, at most 40,000 characters; stored only for primary items that pass the filters or were opened), `listing_hash` (16 hex over normalized title, location and work mode), `body_hash` (nullable), `dedupe_hash` (Core's `dedupeHash`, `lib/intake/dedupe.ts`), `duplicate_of_id` (nullable, self reference, set null), `opportunity_id` (nullable, set null), `state` (`new`, `seen`, `saved`, `dismissed`, `expired`), `state_changed_at`, `filter_pass` (boolean), `filter_failed` (text array of `HardFilter` names), `fit_status` (`none`, `pending`, `done`, `failed`, `capped`; default `none`), `fit_score` (nullable, 0 to 100), `fit` (nullable jsonb in `storedFitSchema`, `lib/fit/stored.ts`), `detail_fetched_at` (nullable), `detail_attempts` (default 0), `first_seen_at`, `last_seen_at`, `changed_at` and `gone_at` (both nullable), `missing_scans` (default 0), `notified_at` (nullable; set when the item joins an alert batch, so it is never alerted twice), `attribution` (nullable: `Remotive` or `Remote OK`). Unique on (`source_id`, `external_id`). Indexes on (`user_id`, `state`, `first_seen_at`), (`user_id`, `dedupe_hash`), and (`user_id`, `fit_status`) where `pending`.

**scan_run** (owned): `source_id` (cascade), `trigger` (`cron`, `command`, `home`, `manual`, `first`), `started_at`, `ended_at`, `outcome` (`ok`, `partial`, `not_modified`, `failed`, `unsupported`, `skipped`), `error_code` (nullable), counts `requests`, `listed`, `new_items`, `changed_items`, `missing_items`, `expired_items`, `filtered_out`, `details`, and `ms`. Kept 30 days. It backs the Companies tracking line, the Settings "last scheduled scan" line and debugging.

**notification** (owned): `kind` (`feed_items`; the set is open so Home can add reminders later), `title` (up to 120), `body` (plain text, up to 1,000), `href` (an app path starting with `/`, up to 300), `item_ids` jsonb (up to 50 ids), `read_at` (nullable). A row is one alert batch and never changes after insert except `read_at`. Index on (`user_id`, `read_at`, `created_at`).

**notification_delivery** (owned): `channel` (`telegram`, `email`, `fake`), `kind` (`digest`, `link_confirm`), `notification_ids` jsonb, `status` (`sent`, `failed`, `skipped`), `attempts`, `error_code` (nullable), `provider_message_id` (nullable), `sent_at` (nullable). A log written after each attempt, never a queue: what to send is computed from items at send time (section 5.11). Kept 30 days.

**telegram_link** (owned, one per user, `user_id` is the key): `status` (`pending`, `linked`, `blocked`, `unlinked`), `chat_id` (nullable text, unique where set), `code_hash` (nullable, sha256 of the current one-time code), `code_expires_at` (nullable), `linked_at` (nullable), `last_error_code` (nullable).

**notify_channel** (owned, unique on `user_id` and `channel`): `channel` (`telegram`, `email`, `fake`), `next_digest_at` (nullable, computed after every send and every settings change), `sent_through` (nullable; the `created_at` of the newest batch this channel has sent), `sent_day` (date) and `sent_today` (count, for the as-found ceiling), `last_sent_at` (nullable), `last_error_code` (nullable). A row exists while the user can receive on that channel: Telegram while linked, email while email digests are on.

**profile** gains `feed` (jsonb, default `{}`), a versioned document read tolerantly like `preferences` (`lib/preferences/schema.ts`): `version: 1`, `scoresPerDay` (0 to the instance ceiling, default 30), `alerts { threshold (null means use `preferences.scoreThreshold`), trackedWithoutScore (default true), telegramMode (`digest`, `as_found`, `off`; default `digest`), emailMode (`digest`, `off`; default `off`), digestHours (1 to 3 whole hours, default 9 and 17), quietHours ({ start: 21, end: 8 } or null) }`. It also gains `feed_score_day` (date, nullable) and `feed_score_count` (integer, default 0), the reservation row of section 5.5.

**company** gains `ats_region` (`us` or `eu`, default `us`), which the Greenhouse and Lever readers need for EU boards. This reaches shipped Core intake code in three files: `AtsRef.region` in `lib/intake/ats/match.ts` already exists and is dropped; `ResolvedPosting.ats` in `lib/intake/resolve.ts` and `createOpportunity`'s `ats` input in `lib/pipeline/create.ts` carry `{ kind, org }` today and gain `region` (the draft schema in `lib/intake/form.ts` reads a missing region as `us`, so a form opened before the deploy still submits). Milestone 16, which adds the column, re-runs Core Milestone 4's intake tests, and its plan budgets for that.

**preferences** gains `titlesExclude[]` (same list rules as `titles`); the document version stays 1 and an absent field reads as empty. **event.kind** gains `posting_gone`. Core's `created` event gets `meta { via: "feed", sourceKind }` when a feed item creates the job. Export (`lib/export/collect.ts`) adds `feedSources`, `feedItems`, `scanRuns`, `notifications`, `notificationDeliveries`, `notifyChannels`, `telegramLink` (status, `linked_at` and `last_sent_at` only; never the code hash or chat id), and `profile.feed`.

## 5. Behavior

### 5.1 Tracking a company

"Track a company" on the Companies page opens a dialog with the company's name and one link. The link picks the reader. A Greenhouse, Ashby or Lever board or posting link sets `ats_kind`, `ats_org` and `ats_region`, through a new `matchAtsBoardUrl` next to `matchAtsUrl` that also accepts board links with no job id (`boards.greenhouse.io/<org>`, `job-boards.greenhouse.io/<org>` and their `.eu` hosts, `jobs.lever.co/<org>`, `jobs.eu.lever.co/<org>`, `jobs.ashbyhq.com/<org>`). Any other http or https link becomes `careers_url` with `ats_kind = other`. A LinkedIn link is refused in the dialog (`isLoginWalled`, `lib/intake/values.ts`). A company that already has a Greenhouse, Ashby or Lever `ats_kind` from an earlier job link tracks with no link typed. Tracking sets `company.tracked`, creates or enables its `feed_source` in the same transaction (`lib/feed/sources.ts`, the only writer of both), and runs the first scan inside the action (trigger `first`, 20-second budget, at most 3 detail calls), so the dialog closes on a sentence like "Found 42 open roles. 3 match your filters." The Companies page sets no `maxDuration` today and gains `maxDuration = 60`, as the board did for intake. Each tracked company card gains a tracking line: the reader ("Greenhouse board", "Careers page"), the last check, open roles and matching roles, the health state from section 6, and the actions "Check now" (at most once per 10 minutes per source), "Edit link" and "Stop tracking". Untracked companies get "Track". Stopping tracking disables the source and deletes its `new`, `seen` and `expired` items. `saved` and `dismissed` items stay, so tracking again later does not bring back roles the user already dismissed.

### 5.2 Reading a listing

Every request goes through `guardedFetch` with its 8-second timeout and 2 MB cap unchanged, and the user agent `Jobsmith/<version> (job feed; +https://github.com/weeeha/Jobsmith)`. A reader returns `Listing { complete, entries[] }`, each entry `{ externalId, url, companyName, roleTitle, location, workMode, compMin, compMax, compCurrency, postedAt, bodyMd? }`, at most 500 entries per source per scan (newest first when dates exist; a cut sets `complete = false`).

| Reader | Listing call | Body |
|---|---|---|
| Greenhouse | `GET boards-api{.eu}.greenhouse.io/v1/boards/{org}/jobs` without `content`, conditional on the stored `etag` and `last_modified` when the vendor sent them | detail call through `fetchAtsPosting` (`lib/intake/ats/index.ts`) |
| Ashby | `POST jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams` for id, title, location, published date and URL, the endpoint intake's `ApiJobPosting` call already uses | detail call through `fetchAtsPosting` |
| Lever | `GET api{.eu}.lever.co/v0/postings/{org}?mode=json&limit=50&skip=N`, at most 10 pages | carried in the listing, mapped by `mapLever` |
| Careers page | `GET careers_url` as HTML | detail call through `readablePage` (`lib/intake/readable.ts`), JSON-LD first |

Listing calls stay small because a board with a few hundred roles and full descriptions would pass the 2 MB cap. A detail call happens for an item that is new, primary (section 5.4) and passes the hard filters, or that the user opens: at most 10 per source per scan, newest first. The rest wait for later scans, and an item stops trying after 3 failed detail calls. A detail result refines location and work mode and reruns the filters.

The careers page reader runs four steps in order:

1. **Known script-rendered hosts.** A careers URL on `myworkdayjobs.com`, `icims.com`, `taleo.net` or `successfactors.com` (a list in `lib/feed/values.ts`) is `unsupported` with `script_rendered` before any request.
2. **Robots.** `/robots.txt` on the page's host, fetched through the guard as `text/plain` with a 500 KB cap, at most once per 24 hours per source, and evaluated by `robots-parser` for the token `Jobsmith`, following RFC 9309: a 4xx answer allows everything, and a 5xx or a timeout skips this scan and tries again at the next one. A path the rules disallow makes the source `unsupported` with `robots_disallowed`. ATS APIs and RSS feeds are published for programmatic readers and skip this step.
3. **ATS embed.** The page is fetched as HTML. A link or script source on it that matches a Greenhouse, Lever or Ashby board (including `boards.greenhouse.io/embed/job_board?for=<org>`) writes `ats_kind`, `ats_org` and `ats_region` to the company when it has none or `other`, and the scan continues with that vendor's reader. Many careers pages wrap one of the three; the tracking line then says which board was found.
4. **Job links.** An anchor counts when its URL is on the page's registrable domain or a known job host, its path has a segment from `jobs`, `job`, `careers`, `positions`, `openings`, `roles` followed by at least one more segment, and its text is 8 to 120 characters and not a navigation word ("Careers", "All jobs", "Apply", "Back" and the list in code). Each distinct URL is one entry, titled by its anchor text, under the company's name. Fewer than 2 links: `unsupported` with `script_rendered` when the readable text is under 200 characters, otherwise `no_job_links`. More than 300: the first 300, with `complete = false`.

Politeness: within a pass, at most 4 requests in flight, at most 1 per host, 500 ms between requests to an ATS API host and 2 seconds between requests to any other host. A 429 or 503 is a new guard failure, `rate_limited`, carrying `Retry-After`; the source's next scan moves past that time and at least one interval out, and the host is skipped for the rest of the pass. A 304 answer to a conditional request ends the scan as `not_modified`, which counts as a complete listing with nothing changed and moves `last_seen_at` forward on the source's listed items.

Fetch guard changes, all additive: `accept` gains `xml` (`application/rss+xml`, `application/atom+xml`, `application/xml`, `text/xml`) and `text` (`text/plain`); a `conditional { etag, lastModified }` option sends `If-None-Match` and `If-Modified-Since` and resolves a 304 as success with an empty body; `GuardedResponse` gains `etag`, `lastModified` and `retryAfterSeconds`; `FETCH_FAILURES` gains `rate_limited`, which intake's `needsTextReasonFor` maps to `fetch_failed` through its existing default.

### 5.3 Change detection and the item lifecycle

After each listing, `lib/feed/items.ts` handles every entry by (`source_id`, `external_id`):

- **New.** Inserted as `new` with `first_seen_at`, then dedupe (section 5.4) and the hard filters (section 5.5).
- **Seen again.** `last_seen_at` set, `missing_scans` back to 0. A different `listing_hash`, or after a detail call a different `body_hash`, sets `changed_at` and reruns the filters. A changed item keeps its state and score and shows "Changed". An `expired` item that comes back returns to `new`. A `dismissed` item stays dismissed.
- **Missing.** Counted only after a complete listing. The first miss sets `gone_at`; the second makes the item `expired`, because vendors drop a role from one response now and then. A `saved` item that goes missing twice keeps its state and writes one `posting_gone` event on its job's timeline while the job is active.

States: `new` (found and unopened), `seen` (opened in the item sheet, or "Mark all seen"), `saved` (on the board, section 5.8, or born there by dedupe), `dismissed` (from `new` or `seen`; "Undo" in the toast and "Restore" in the Dismissed view return it to `seen`), `expired` (missing twice, or an RSS or preset item 30 days after `first_seen_at`, since those sources roll items off with no signal). Every change sets `state_changed_at`.

Retention runs at the end of each user's work in a pass, at most 500 rows per run: `expired` and `dismissed` items whose `last_seen_at` is over 90 days old are deleted; `posting_md` is cleared on `saved` items (the job keeps its own snapshot), on `expired` items and on items that miss the filters; `scan_run` and `notification_delivery` rows over 30 days old are deleted. A user at the 3,000-item cap gets no new rows until retention frees room, and the run records `over_limit`.

### 5.4 Dedupe

Against the board: an item whose `dedupe_hash` matches an active opportunity, or whose URL equals an active opportunity's `source_url`, is born `saved` with that `opportunity_id`, is never scored or alerted, and shows "On your board". The active match uses `findActiveDuplicate` (`lib/pipeline/duplicates.ts`), which reads active jobs only. Feed adds `findClosedDuplicate` to that file (same hash, status `closed`, newest first): a closed match leaves the item `new`, and its sheet says "You had this job before" with a link to that job, since applying again later is legitimate (Core 5.5).

Across sources: an item whose hash matches a non-expired item from another source becomes that item's duplicate (`duplicate_of_id`). Duplicates are hidden from lists, Home and alerts, never scored, and counted on the primary as "Also on 1 source". The primary is the item from a tracked company when one exists (a direct link and a fuller body), otherwise the earliest. A company item that arrives after an aggregator primary takes over in one transaction: it inherits the primary's state, opportunity link and fit, and the old primary becomes its duplicate. Dismissing or saving a primary applies to its duplicates in the same write.

### 5.5 Filters and scoring under a cap

`hardFilters` (`lib/fit/hard-filters.ts`) runs on every new or changed item with the fields it has. Missing fields are "not checked" and pass, as on the fit card. The result is stored as `filter_pass` and `filter_failed` so the scheduler and alerts can query it; pages recompute it from current preferences when they render, as Core does. Saving Preferences reruns it over the user's open items (`lib/feed/refilter.ts`, called by the preferences action).

Feed adds `titlesExclude[]` to Preferences. A title fails the title filter when it contains an excluded phrase, matched whole-word on normalized text as `containsPhrase` does, with the check's `reason` set to `excluded` and `value` to the phrase. A tracked board lists every role at the company, and a wanted phrase like "product designer" also matches "Junior Product Designer" and "Product Designer Intern"; the Career Ops Web prototype carried 28 negative keywords for this reason. The fit card and the test box show the new reason and change nothing else.

An item is eligible for scoring when AI is on, the resume is present (`fitReadiness`, `lib/fit/readiness.ts`), it is primary, in `new` or `seen`, has a body, and either passes the filters or the user tapped "Score this job" on it. Opening an eligible unscored item scores it at once, with the fit card's polling rhythm. An opened item that misses the filters waits for that tap, so browsing the misses cannot spend the cap. Other eligible items are scored at the end of a cron or command pass, tracked companies first, then newest, through `scoreFit` (`lib/ai/score-fit.ts`) with its existing truncation and 20-second timeout, stored with `toStoredFit`. The Home fallback never scores.

The daily cap is a reservation taken before every call, one `UPDATE profile ... RETURNING` in the style of the bridge's rate row (Core D4): `feed_score_count` increments when `feed_score_day` is today in the profile time zone and the count is under the cap, or resets to 1 on a new day; no row back means no call. The cap is `profile.feed.scoresPerDay` (default 30), bounded by `FEED_SCORES_PER_DAY_MAX` (default 100; 0 turns feed scoring off). An item refused by the cap becomes `capped` and is offered again the next day while under 7 days old, and its sheet says scoring resumes tomorrow. A failed call is `failed` and retried once in the next pass. Every score also reserves through Hosted's `Meter` (`lib/credits/meter.ts`, injected through `FitDeps`) as `score_fit` at 1 credit, under that task's daily cap of 60, which board scoring and the test box share; with `HOSTED` off it is Hosted's own no-op implementation, and Feed calls it the same way. The feed counter and the Meter's reservation are both database writes, so `lib/feed/score.ts` makes them in one transaction before the call, passing its handle to the Meter: a refusal from either (the feed cap, no credits, `cap_task_day`, `cap_day`, `cap_global`) or a crash rolls back both, so nothing is consumed without a call, and a refused item is `capped` with the reason. A call that then fails is refunded by the Meter (Hosted 5.7) and keeps its feed count. Cost is in section 5.12.

### 5.6 The Feed page

Route `/feed`, built on the registry's `feed-view` (grouped sections with sticky headers) and `mode-tabs`. Views: To review (`new` and `seen`, the default), Saved, Dismissed, Expired. Filters: source (several), "Hide jobs that miss my filters" (on by default), minimum score (any, 40, or the threshold), work mode, and a text search over title and company. Grouping: by company (default) or by source. Groups sort by their best item; inside a group, scored items by score, then newest first. The page renders 200 items and "Show more" loads the next 200 by cursor. Query parameters carry every choice (`view`, `group`, `source`, `min`, `misses`, `q`, `item`), so a view can be bookmarked.

A row shows role, company, location, work mode, posted date, and chips for New, Changed, the fit band from `lib/fit/bands.ts` with its words, "Also on N sources", "Misses: location" for failed filters, and the attribution for presets. Actions on a row: "Add to board" (primary) and "Dismiss" (toast with "Undo"). A group's menu has "Snooze source" (1, 7 or 30 days: no scans, its items leave Home and alerts, and the group shows "Snoozed until <date>"), "Mark group seen" and, for a company, "Stop tracking". Tapping a row opens the item sheet (`?item=<id>`, the `base-nova` sheet, full height on phone): the posting body through Core's sanitized markdown renderer, the filter checks as the fit card shows them, the fit card (or "Score this job", or the reason there is no score: AI off, no resume, capped), the source with its attribution, and "Open original" with `rel="noopener noreferrer nofollow"`. Opening it marks the item `seen`. Every list mutation announces itself through a live region.

`/feed/sources` lists every source, tracked companies included (each linking to its Companies card), with health, last check, roles listed, interval, and actions to pause, resume, change the interval, check now and delete. "Add source" arrives with milestone 19 (section 5.9). With no sources, `/feed` shows the empty state "Track a company to see its new roles here." with a link to Companies.

### 5.7 Home and navigation

Home adds a "New roles" card under the attention list in the main column, and on phone after it. It lists up to 5 `new` primary items that pass the filters and come from sources that are not snoozed, ordered by score (unscored after scored), then newest first. Each row has role, company, location, the fit chip when scored, "Add to board" and "Dismiss". The footer says "See all 14 new on Feed". With sources and nothing new, the card shows one line with the last check time. With no sources, the card is absent, so Home stays about prep for anyone who never tracks a company. `loadHome` (`lib/attention/load.ts`) gains the read; the attention items are unchanged. Navigation (`components/app-shell.tsx`): `NAV_ITEMS` becomes Home, Board, Companies, Feed, Library, Preferences, Settings. `PHONE_TAB_ITEMS` stays the first three, so the phone tabs remain Home, Board and Companies, and Feed is the first item of the More sheet; Home's card links to it. The bell sits in `AppTopbar`'s `actions` slot on every page and size.

### 5.8 Add to board

`saveFeedItem(s, itemId, deps)` in `lib/feed/save.ts`:

1. An item already `saved` returns its job's slug.
2. An item with no body gets one detail call first (8 seconds at most); a failure continues with no posting text, as Core's manual add does.
3. `findActiveDuplicate` (`lib/pipeline/duplicates.ts`) finding a job links the item to it, sets `saved`, and the toast says the job is already on the board with "Open it".
4. Otherwise `createOpportunity` with the item's fields, `source: "feed"`, `sourceUrl: item.url`, `postingText: item.posting_md`, the company's `ats` when the source is a tracked ATS company, and `allowDuplicate: true` (step 3 already checked). The job lands in Saved with Core's seven stages.
5. The item becomes `saved` with `opportunity_id`, and its duplicates follow.
6. A `done` fit on the item is copied to the job (`fit_status: done`, same score and stored document) through a new `adoptFit` in `lib/fit/`, since it scored the same posting against the same resume. Otherwise the job goes through `queueFitScoring` and `scoreSafely` as a new job from the add dialog does, outside the feed cap, because Core never capped scoring of board jobs.

### 5.9 Other sources (milestone 19)

"Add source" on `/feed/sources` offers three kinds, at most 20 sources per user besides tracked companies:

- **RSS or Atom feed.** One link, validated by one fetch: it must parse as RSS 2.0 or Atom 1.0 with at least one item, or the dialog says the link is not a feed. Mapping: `guid` or `id` is the external id, `link` (Atom `rel="alternate"`) the URL, `pubDate`, `published` or `updated` the posted date, `description` or `content` the body through `htmlToMarkdown` (`lib/intake/html.ts`). Company and role come from the title in one function with fixtures: "Company: Role" when the part before the colon is up to 60 characters, "Role at Company", otherwise the whole title as role and the item's author or the feed's own title as company. A trailing "(Remote)" sets the work mode. An item link that matches an ATS posting gets its body from that vendor's adapter. At most 200 items are read per fetch; feeds skip robots.
- **Remotive preset.** `GET remotive.com/api/remote-jobs?category=<slug>`, categories from a fixed list, every 12 hours or less often.
- **Remote OK preset.** `GET remoteok.com/api?tag=<tag>`, skipping the first array element (its legal notice), tags from a fixed list, every 12 hours or less often.

Both presets are public JSON APIs the Job Search Bot prototype already used, keyed by nothing. Their published terms ask for attribution and a link back, so every preset item shows "via Remotive" or "via Remote OK" and links to the posting on that site. JSearch and Adzuna are left out: they need keys, and their terms limit storing and displaying results. Each milestone plan re-reads the presets' current terms and drops a preset whose terms forbid this use.

### 5.10 Scheduling

`runDueScans({ now, budgetMs, trigger, userId?, limits })` is the one entry point:

1. In poll mode, read pending Telegram updates once (section 5.11). Then `dueSources(now, 200)` (`lib/db/system.ts`) returns (`user_id`, `source_id`) pairs whose `next_scan_at` has passed, enabled and not snoozed, oldest first, at most 20 per user, interleaved by user so one large account cannot starve others.
2. For each pair, take the lease: `UPDATE feed_source SET lease_until = now + 5 minutes WHERE id = ? AND (lease_until IS NULL OR lease_until < now) RETURNING`. No row means another clock has it; skip. Scan with a 60-second ceiling, write the `scan_run`, set `next_scan_at` to now plus the interval plus up to 10% jitter (or the backoff of section 6), clear the lease. No new source starts with under 30 seconds of budget left; the rest stays due for the next pass.
3. For each user touched: score eligible items (section 5.5), run retention (section 5.3), raise the in-app notification and any as-found Telegram message (section 5.11).
4. `dueDigests(now)` returns users whose `next_digest_at` has passed; send each digest.

Callers:

| Caller | Trigger | Budget | Limits |
|---|---|---|---|
| the `feed` step registered with Hosted's maintenance tick, run after the Hosted steps | `cron` | what the tick has left less 10 s, at most 120 s | full |
| `pnpm feed:scan [--budget-seconds N] [--user <email>] [--source <id>]`, also run by `pnpm jobs:tick` | `command` | default 600 s, at most 3,600 | full; prints one line per source and exits 0 when the pass ran |
| Home, through `after()` when one of the user's sources is over 90 minutes overdue and the user had no `home` run in 15 minutes | `home` | 20 s; Home gains `maxDuration = 60` | that user only, 5 sources, 3 detail calls per source, no scoring |
| "Check now" on Companies or `/feed/sources` | `manual` | 30 s | one source, at most once per 10 minutes |

The tick route, `CRON_SECRET` and the `vercel.ts` cron entry belong to Hosted (Hosted 5.13). Feed registers its scan step with that tick and owns nothing in `lib/jobs/` beyond the step, `lib/jobs/feed.ts`; it changes neither the route nor its `maxDuration`. A 15-minute tick with a 90-minute overdue threshold means the Home fallback fires only when no scheduler runs or it is far behind. Settings shows the user's last `cron` or `command` run, or "Scans run when you open Home" with the one-line cron example from the README when there has been none.

### 5.11 Alerts

`notify` in `lib/notify/write.ts` writes the in-app notification and hands linked channels their part. A channel driver implements `send(target, message) → Result<{ providerId }, "notify_blocked" | "notify_rate_limited" | "notify_timeout" | "notify_error">`. `parseNotifyConfig` reads `NOTIFY_CHANNELS` at boot the way `parseAiConfig` reads `AI_PROVIDER` (`lib/ai/config.ts`): unset means in-app only; `telegram` needs `TELEGRAM_BOT_TOKEN`; `email` needs `EMAIL_PROVIDER` (Hosted 5.2); `fake` records each message as a `notification_delivery` row and sends nothing.

**Eligibility.** An item alerts when it is `new`, primary, passes the filters, its source is not snoozed, `notified_at` is empty, `first_seen_at` is within 48 hours, and either its score is at or above `alerts.threshold` (default `preferences.scoreThreshold`) or it comes from a tracked company with no score (AI off, no resume, capped) and `alerts.trackedWithoutScore` is on. A self-host with no AI therefore still hears about tracked companies.

**In-app.** At the end of a user's work in a pass, eligible items that are in no batch yet become one `feed_items` notification ("5 new roles at 3 companies", linking to `/feed`) and get `notified_at`. A user gets at most one new batch an hour; items found sooner wait for the next pass, so the bell grows by a few entries a day at most. The bell (`components/notify/bell.tsx`) shows the unread count (up to "9+") with the label "Notifications, 3 unread", opens a popover of the last 20, marks one read on click and all read on request. It refreshes its count on mount, on window focus and every 60 seconds while the tab is visible.

**Telegram linking.** Settings shows "Link Telegram" when `telegram` is configured. It creates an 8-character code from Crockford's base32, shown as `XXXX-XXXX`, valid 15 minutes, stored as a sha256 hash, replaced by any newer code; it shows the code and a `t.me/<bot>?start=<code>` link (the bot's username from `getMe`, cached an hour). The user sends `/start <code>`. A matching unexpired hash (`linkByCodeHash`) links that chat, clears the code, sets `linked`, and the bot replies that alerts will arrive here and `/stop` unlinks. A wrong or expired code gets one reply naming Settings; a chat that sends 10 wrong codes within an hour is ignored for the rest of that hour; a chat already linked to another account is refused. `/stop` (`linkByChatId`) sets `unlinked` and clears `chat_id`. Any other text gets one line saying the bot only sends Jobsmith alerts. The bot takes no settings commands; settings have one home, the app.

**Updates.** In `poll` mode, `getUpdates` (timeout 0, `allowed_updates: ["message"]`) runs at the start of each pass and from the Settings section every 3 seconds while a code is pending, and each read confirms what it processed by asking for `offset = last + 1`, so no offset is stored. A 409 from Telegram (a webhook is set or another poller runs) shows `telegram_conflict` in Settings with the fix. In `webhook` mode, `POST /api/telegram/webhook` requires `X-Telegram-Bot-Api-Secret-Token` equal to `TELEGRAM_WEBHOOK_SECRET` (constant time, 401 otherwise), caps the body at 64 KB and always answers 200 once authenticated; `pnpm telegram:webhook` registers `<APP_URL>/api/telegram/webhook` with that secret, and `--remove` deletes it.

**Timing.** `lib/notify/rules.ts` computes each channel's `next_digest_at` from `digestHours`, `quietHours` and `profile.timezone` with `zonedAt` (`lib/time/zone.ts`), after every send and every settings change. Modes: `digest` sends at each chosen hour; `as_found` sends at the end of the pass that made a batch, at most 6 messages per local day, after which batches wait for the next day; `off` sends nothing. A send that falls in quiet hours waits for their end, where one digest carries everything held. Quiet hours that span midnight work as written ("21 to 8").

**Message.** One Telegram message per send, HTML parse mode with every value escaped: a first line "Jobsmith: 4 new roles", then up to 10 lines of `<b>Role</b> · Company · Location · 82` (role cut to 80 characters, the score only when scored, each line linking to `<APP_URL>/feed?item=<id>`), "and 3 more" when longer, and one URL button "Open Feed". At most 4,096 characters, previews off. It carries no posting text, no fit summary and nothing from the resume. A send covers every batch created after the channel's `sent_through`, moves `sent_through` to the newest, and writes the delivery row. Telegram and email therefore each get every batch once, whatever their timing.

**Email.** Settings offers "Email me a digest" (off by default) when `email` is configured. It goes to the account's address at the same digest hours and quiet hours, digest mode only, through `EmailDriver.send` with a new `feed_digest` template: the subject "4 new roles on Jobsmith", the same lines as the Telegram message in plain text and minimal HTML, and a footer linking to Settings. A `List-Unsubscribe` header with `List-Unsubscribe-Post` points at `POST /api/notify/unsubscribe?t=<token>`, an HMAC over user id and channel keyed by `BETTER_AUTH_SECRET`, which turns email digests off with no sign-in. `email_rejected` turns email digests off and Settings says why; `email_rate_limited` and `email_error` retry at the next pass. `proxy.ts` runs the session-cookie check on every path except `_next`, `favicon.ico` and `api/bridge/`, so Milestone 18 adds `api/telegram/webhook` and `api/notify/unsubscribe/` to its matcher's exclusion list; each route is then guarded only by its own check, the Telegram secret header or the signed unsubscribe token.

**Failures.** A 403 from Telegram means the user blocked the bot: the link becomes `blocked`, sends stop, and Settings asks to link again. A 429 honors Telegram's `retry_after` and leaves `sent_through` where it was, so the next pass retries. Five failed attempts at one digest record `failed` and move `next_digest_at` to the next slot.

**Settings.** An Alerts section: in-app is always on; the Telegram status (not set up on this instance, not linked, waiting for your message, linked since a date, blocked) with Link and Unlink; the threshold (default "Use my score threshold (70)"); "Tell me about roles at companies I track, even without a score"; Telegram mode; up to 3 digest hours; quiet hours or none. A Feed line: scores per day with today's use ("12 of 30 used today"), and the last scheduled scan. Copy is fixed in each milestone plan.

### 5.12 Limits and cost

| Concern | Limit | Why |
|---|---|---|
| Tracked companies per user | 100 (`FEED_MAX_COMPANIES`) | the prototype tracked 15; 100 bounds a pass |
| Other sources per user | 20 | feeds and presets are extras |
| Items kept per user | 3,000, excluding `saved` | about 7 MB per user with bodies stored only for passing items |
| Entries read per listing | 500; Lever 10 pages of 50; careers page 300 links; RSS 200 items | keeps one source inside its 60-second ceiling |
| Detail calls | 10 per source per scan | the posting body only where it can matter |
| Requests per user per pass | 300 | about 100 companies at 1 to 3 requests each |
| Scan interval | 3, 6, 12 or 24 hours, default 6 (4 scans a day per source, at most 8); presets at least 12 | 4 scans a day catches a new role the same day |
| Timeouts | guard 8 s and 2 MB per request; 60 s per source; budgets per caller in section 5.10 | Core's guard numbers stay |

Cost of one score on the default model (`anthropic/claude-haiku-4.5`, `lib/ai/config.ts`, at $1 per million input tokens and $5 per million output): posting and resume are each cut to 12,000 characters (`SCORE_POSTING_CHARS`, `SCORE_RESUME_CHARS`), about 6,500 input tokens with the instructions and preferences, and output is capped at 600 tokens, so one call costs at most about $0.0095 and typically $0.008. At the default cap that is at most $0.29 a day, about $8.60 over 30 days, per user who hits the cap every day. On hosted, a feed score is 1 credit (Hosted 5.7), so the default cap spends at most 30 credits a day. Outbound requests for 100 tracked companies at the default interval come to about 500 a day.

## 6. Error handling

- **Source health.** One failed scan makes the source `warning` ("Last check failed. Trying again at 14:00.") and retries after one interval. Three in a row make it `failing`, shown on the Companies card and `/feed/sources` with the reason in words (not found, timed out, the site asked Jobsmith to slow down, blocked address, unreadable answer), and the next scan backs off to `interval × 2^(failures - 2)`, at most 48 hours. One success returns it to `ok`. `unsupported` (`robots_disallowed`, `script_rendered`, `no_job_links`, `login_required`, `no_link`) stops scans until the link changes, and the card offers "Open careers page" and "Edit link".
- **Isolation.** A failing source never stops a pass. One entry that does not parse is skipped and counted; the rest of the listing is kept. A listing that fails part way is `partial` with `complete = false`, so nothing goes missing because of it.
- **Scoring and saving.** A failed score leaves the item usable with "Score this job"; with AI off every item is `none` and the page says why once. A `createOpportunity` failure surfaces through Core's messages, the item keeps its state and "Add to board" can be tapped again.
- **Channels.** Section 5.11. A misconfigured channel (`telegram` without a token, `email` without `EMAIL_PROVIDER`) fails boot with the variable's name, as `parseAiConfig` does.
- **Logs.** One `[feed]` line per source scan: source id, kind, host, trigger, outcome, error code, counts, requests and milliseconds; never a role title, path or posting text. One `[feed]` line per pass with sources started, skipped and left due, scores reserved and refused. One `[notify]` line per send: delivery id, channel, outcome code. Logs never carry the bot token, codes, chat ids or the Telegram URL, which embeds the token.

## 7. Security and privacy

- Every new table is owned, reached through the scoped helper, and gets isolation cases. `lib/db/system.ts` holds the only cross-user reads; each returns ids, and an integration test proves a pass for user A writes nothing for user B.
- Every outbound request to a user-supplied or vendor address goes through the fetch guard: http and https only, ports 80 and 443, private and loopback ranges refused per hop, 3 redirects, 8 seconds, 2 MB. Source links are validated when added, and LinkedIn is refused before any request.
- Fetched content is untrusted: titles render as plain text, bodies through Core's sanitized renderer with raw HTML off, links only for `http:` and `https:`, external links with `noopener noreferrer nofollow`. XML is parsed with any doctype removed first, so no entity expansion happens.
- The cron route and webhook check their secrets in constant time, fail closed when unset, cap their bodies and take no user id from a request. Link codes are random, stored as hashes, single use and short lived. An unsubscribe token can only turn email digests off.
- A list of tracked companies reveals a job search. Requests to vendors carry the instance's address and the Jobsmith user agent, no cookies and nothing about the user. Telegram messages hold role, company, location and score, and the README says bot chats are stored on Telegram's servers without end-to-end encryption. Scoring sends posting and resume to the AI provider only when `AI_PROVIDER` is set, as in Core, under the daily cap.

## 8. Testing

Test-driven for everything under `lib/`, as in Core.

- **Unit:** each reader against synthetic fixtures with fictional companies (a Greenhouse board list, an Ashby board, Lever pages including a short last page, a careers page with a Greenhouse embed, one with job links, one script-rendered, RSS 2.0, Atom, a Remotive answer, a Remote OK answer with its notice element); `matchAtsBoardUrl` with US and EU hosts; the job-link heuristic; the change table (new, changed, missing once, missing twice, back after expiry, dismissed and back, partial listing); primary selection and takeover; `titlesExclude`; alert eligibility; the digest builder (escaping, the 10-line cut, 4,096 characters); due times across a daylight saving change and quiet hours over midnight; backoff; robots outcomes per RFC 9309; the host limiter and budget with a fake clock; Telegram updates (`/start` valid, expired, wrong, reused, already linked elsewhere, `/stop`); `parseNotifyConfig`.
- **Integration (PGlite with the real migrations):** isolation across the seven tables and the system reads; a full `scanSource` with the fixture fetch and the fake AI driver; two concurrent reservations at one below the cap where exactly one wins; two concurrent scans of one source where one runs; Add to board creating a `feed` job, copying the fit and linking duplicates; `findClosedDuplicate` returning the newest closed match and ignoring active ones; `posting_gone`; retention; refilter on a preferences save; a Telegram channel in as-found mode and an email channel in digest mode each sending every batch exactly once; the export with the new tables and without the code hash or chat id; the tick running the feed step after the Hosted steps; the webhook (401 without the secret header); the unsubscribe route (a bad token is 404, a good one turns email off); each of the webhook and unsubscribe routes called with no cookie returns its own answer, never a redirect to `/login`.
- **End to end (Playwright, Chromium and WebKit, desktop and phone):** with `FEED_FETCH=fixtures` and the fake AI driver, track a fictional company by board link and see the dialog's count; run `pnpm feed:scan` from the test helper; see the Home card, open an item, add it to the board and find the card in Saved with its score; dismiss and undo; snooze a source; the bell count after a scan. With `NOTIFY_CHANNELS=fake` and `TELEGRAM_UPDATES=webhook`, post a fake `/start <code>` update to the webhook, see Settings say linked, and after a scan read the digest text from the delivery row; with `email` and `EMAIL_PROVIDER=fake`, read the email digest from `EMAIL_FAKE_DIR`. On phone: Feed from the More sheet and the item sheet. A `feed-*` project chain runs after the `prep-*` chain, one engine at a time, because it changes the shared account's preferences and profile.
- **Accessibility:** axe on `/feed`, `/feed/sources`, Companies with each health state, the Alerts section and the open bell popover, in light and dark; keyboard-only Add to board and Dismiss; live-region announcements for both.
- **Live smoke:** opt-in when `FEED_LIVE_GREENHOUSE_ORG` and its Lever and Ashby siblings are set, one real listing call per vendor, asserting shape only, like Core's live AI test.

## 9. Milestones

Numbering continues from Hosted. Prerequisite: Hosted milestones 11 to 15 are merged, with `lib/email`, the credit `Meter` and the maintenance tick; Feed builds none of them. One implementation plan per milestone, written when the previous one is done, each preceded by its Figma drafts.

| # | Name | Scope | Done when |
|---|---|---|---|
| 16 | Scanner | migration for `feed_source`, `feed_item`, `scan_run`, the profile columns, `company.ats_region` and `posting_gone`; fetch guard additions; `matchAtsBoardUrl`; Greenhouse, Ashby, Lever and careers page readers with robots, embed detection and job links; change detection, dedupe against the board, hard filters with `titlesExclude`; `runDueScans` with leases, budgets and the host limiter; the feed step registered with Hosted's tick, `pnpm feed:scan` and the Home fallback; `ats_region` through intake, with Core Milestone 4's intake tests re-run; the Companies tracking dialog, line and health states; retention | In CI, a fictional company tracked by its board link shows its open and matching roles on Companies, a changed fixture reports one changed role, and a role absent from two scans is expired; on the owner's deployment, three companies of the owner's choice, one per ATS vendor, are scanned by the tick for a day with no manual step |
| 17 | Feed | `/feed` with views, filters, grouping, the item sheet with `findClosedDuplicate`, Add to board with `adoptFit`, Dismiss and Undo, Mark seen, Snooze; the Home card; Feed in the nav; scoring with the daily reservation and "Score this job"; refilter on preferences save; export additions | A role from a tracked company reaches the board from Home in two taps with its score on the card, and with the cap set to 2, a scan of 5 passing roles makes exactly 2 model calls |
| 18 | Alerts | `notification`, `notification_delivery`, `telegram_link`, `notify_channel`; `lib/notify` with in-app, `telegram`, `email` and `fake`, the `feed_digest` template and the unsubscribe route; both routes excluded from the `proxy.ts` matcher, with a test that each answers a cookieless call itself; the bell; the Settings Alerts section; linking by code in poll and webhook modes, `/stop`, `pnpm telegram:webhook`; eligibility, digests, as-found, quiet hours; blocked handling | With `NOTIFY_CHANNELS` unset, a scan with new roles above the threshold adds one bell entry; on the owner's phone, a linked chat receives one digest at the next digest hour, and a role found during quiet hours arrives in the morning digest |
| 19 | Sources | RSS and Atom, the Remotive and Remote OK presets with attribution, cross-source dedupe with takeover, "Also on N sources", `/feed/sources` with Add source | A fictional posting that arrives from a tracked company and from an RSS feed shows once on `/feed` with "Also on 1 source", and a Remotive item shows "via Remotive" and links to its site |

Each milestone ends with a preview link, a pass in Chrome and Safari and the test suites green.

## 10. Port sources and licensing

| Source | What Feed takes | Where |
|---|---|---|
| Design Career Ops Web `lib/scanner/scan-portals.ts` | the three listing calls (Greenhouse board jobs, Ashby `ApiJobBoardWithTeams`, Lever postings), one history row per scan, per-portal error isolation | `lib/feed/listing/`, `scan_run`, section 6 |
| `lib/scanner/portals-config.ts` | the wanted and excluded title keyword idea, as `titlesExclude`; its hardcoded company list is not ported, since tracking is per user | section 5.5 |
| `app/api/cron/scan-portals/route.ts` | nothing ported: Hosted's tick already fails closed on `CRON_SECRET` (Hosted 5.13) | |
| Job Search Bot `lib/sources/remotive.ts`, `remoteok.ts` | endpoints, field mapping, skipping Remote OK's first element | `lib/feed/listing/remotive.ts`, `remoteok.ts` |
| `lib/sources/wwr.ts` (a stub) | the category RSS idea, served by the generic RSS reader | `lib/feed/listing/rss.ts` |
| `lib/fetcher/run.ts`, `lib/matcher/prefilter.ts`, `lib/matcher/run.ts` | per-source isolation, a code prefilter before any model call, recording prefilter failures with no call, keeping an item when scoring fails | `lib/feed/scan.ts`, `lib/feed/score.ts` |
| `lib/telegram/api.ts`, `commands.ts`, `push.ts` | the Bot API call shape, `/start <code>` linking against a hashed one-time token, a per-day message ceiling and a pushed-at marker | `lib/notify/channels/telegram.ts`, `lib/notify/telegram/link.ts`, `notified_at` |
| `lib/sources/jsearch.ts`, `adzuna.ts`, `lib/fetcher/dedupe.ts` | nothing ported: keyed APIs with restrictive terms, and a dedupe with hardcoded city buckets that Core's `dedupeHash` replaces | |

The prototypes carry no license and belong to the owner, so ported code is relicensed under AGPL-3.0 and gets tests as it lands. Nothing comes from the MIT-licensed upstream career-ops project. New dependency: `robots-parser` (MIT). XML uses linkedom, already present (ISC). Telegram needs no SDK.

Design system: the order of preference from Core section 10 holds. The Feed page uses the registry's `feed-view`, `mode-tabs` and `empty-state`, `AppTopbar`'s `actions` slot, and `base-nova`'s sheet, popover and badge. New code (the item row, the Home card, the source health line, the bell) is recorded in `docs/design-system.md` under "New application code" with its reason, and `pnpm check:tokens` covers it.

## 11. Assumed until the owner says otherwise

1. The owner's Vercel plan runs the Hosted spec's 15-minute tick (its assumption 15). On a plan with daily cron only, scans run once a day from the tick and the Home fallback carries the rest.
2. Feed sits after Companies in the sidebar and inside More on phone, and the Home card sits under the attention list and disappears when there are no sources.
3. The daily score cap is 30 per user, with an instance ceiling of 100.
4. Telegram is configured on the owner's deployment in webhook mode with the owner's own bot; poll mode is the self-host default.
5. Digests default to 09:00 and 17:00 with quiet hours from 21:00 to 08:00 in the profile time zone; Telegram's as-found mode stops at 6 messages a day; email is digest only and off until the user turns it on.
6. The alert threshold defaults to the Preferences score threshold, and tracked companies alert without a score when there is none.
7. Telegram messages carry role, company, location, score and a link, and never the fit summary.
8. Limits: the scan interval defaults to 6 hours (3, 12 and 24 are the other choices), 100 tracked companies, 20 other sources, 3,000 kept items, 500 entries per listing, 10 detail calls per source per scan, 300 requests per user per pass, 90-day retention, 30-day expiry for aggregator items.
9. Robots rules apply to careers pages only; ATS APIs and feeds skip them.
10. `titlesExclude` joins the title filter, so the fit card and the test box use it too.
11. Ashby boards are listed through the same unpublished GraphQL endpoint intake already uses; if it changes, intake and Feed break together and are fixed in one adapter.
12. Remotive and Remote OK are the only presets, and JSearch and Adzuna are out; aggregator sources ship last (milestone 19) and are the first cut; the page-diff source waits for a later revision.
13. The bot handles `/start` and `/stop` and answers anything else with one line; the prototype's `/today`, `/threshold` and `/snooze` are dropped.
14. Saving a feed role copies its fit to the job; a job added from the feed with no fit is scored outside the feed cap, like any other new job.

## 12. After Feed

The cycle table in Core section 12 stands. Feed moves these out:

| Item | Where it goes |
|---|---|
| "Drill tonight" and other interview reminders, which Prep section 12 sent to this cycle | Home: `lib/attention` raises them through `notify()` as a new notification kind; Feed builds the interface and owns only `feed_items` |
| A page-diff "watch this URL" source | a later Feed revision, if tracked careers pages keep coming back unsupported |
| One shared listing fetch per vendor board across users on the hosted version | a Hosted follow-up, before many accounts track the same companies |
| Prompt caching for scoring (the resume ahead of the posting in the prompt) | a Hosted follow-up on credit pricing |
| Saving or dismissing from inside Telegram | later; it needs webhook mode only and a signed callback |
| Web push to the installed phone app | after 1.0 |
| Feed items in the context document and a `jobsmith feed` command | cycle 7, Bridge part two |
| Open-role history per company | cycle 5, company pages |
