# Milestone 18: Alerts

**Done when (spec section 9):** "With `NOTIFY_CHANNELS` unset, a scan with new roles above the threshold adds one bell entry; on the owner's phone, a linked chat receives one digest at the next digest hour, and a role found during quiet hours arrives in the morning digest."

**Branch:** `feat/m18-alerts`, cut from `main` after Milestone 17 is merged.

**Blocked on (live part only):** the owner's own Telegram bot and phone (Task 34 Step 8, Task 35 Step 8, Task 39 Step 8). The fake channel and an injected `fetch` cover every CI test.

## Before starting

```bash
bash -c 'test -f lib/feed/steps.ts && test -f lib/feed/score.ts && test -f lib/feed/settings.ts && test -f lib/db/system.ts && test -f app/\(app\)/feed/page.tsx && echo m17-present'
bash -c 'test -f lib/email/driver.ts && ls lib/email lib/email/templates && grep -n "api/jobs/tick" proxy.ts || echo hosted-m11-missing'
bash -c 'test -f components/ui/popover.tsx && echo popover-present || echo popover-missing'
```

If Milestone 17 is missing, stop. If `lib/email/driver.ts` is missing (Hosted milestone 11 not merged), skip Task 36 and the email parts of Tasks 37, 38 and 39, and say so in each report; in-app and Telegram still ship. Read the Hosted plan's email task and the live `lib/email` files first: Task 36 adds one optional field to `EmailDriver.send`. `components/ui/popover.tsx` is not installed today: Task 31 adds it from `base-nova` with the shadcn CLI, the way earlier primitives were vendored. Read `node_modules/next/dist/docs/` for route handlers and `proxy` matcher syntax before Task 35.

---

### Task 28: Migration: notification tables

**Files:**
- Create: `lib/db/schema/notify.ts` (`notification`, `notificationDelivery`, `telegramLink`, `notifyChannel`), `lib/db/migrations/0005_*.sql` (next free number), `lib/db/scoped/notification.ts`, `notification-delivery.ts`, `telegram-link.ts`, `notify-channel.ts`
- Modify: `lib/db/schema/index.ts`, `lib/db/scoped/index.ts` (`Scoped` gains `notification`, `notificationDelivery`, `telegramLink`, `notifyChannel`), `tests/helpers/feed.ts` (`seedNotification`)
- Test: `tests/integration/notify-schema.test.ts`, `tests/integration/scoped-isolation.test.ts`, `tests/integration/migrations.test.ts`

**Interfaces:**
- Consumes: Task 1's patterns.
- Produces: row types; `notificationQueries`: `insert`, `getById`, `listRecent(limit)`, `unreadCount()`, `markRead(id, now)`, `markAllRead(now)`, `listCreatedAfter(after: Date | null, kind: string)`, `newestCreatedAt()`; `notificationDeliveryQueries`: `insert`, `listRecent(channel, limit)`, `countFailedForIds(channel, idsKey)`, `deleteOlderThan(cutoff)`; `telegramLinkQueries`: `get()`, `upsert(values)`, `clearChat()`; `notifyChannelQueries`: `get(channel)`, `list()`, `upsert(channel, values)`, `delete(channel)`.

- [ ] **Step 1: Write the failing test**

```ts
// it("notification.kind is open text of at most 40 characters and Feed writes feed_items") (decision D29: the spec calls the set open, so no check lists its values) ; it("title over 120 characters is rejected") (check constraint) ; it("body over 1,000 is rejected")
// it("href must start with a slash and be at most 300 characters") ; it("a notification never changes except read_at") (the scoped helper has no update besides markRead and markAllRead)
// it("notification_delivery accepts channel telegram, email, fake and kind digest, link_confirm only") ; it("status accepts sent, failed, skipped only")
// it("telegram_link is one row per user, keyed on user_id") ; it("chat_id is unique where set, and two nulls are fine") ; it("status accepts pending, linked, blocked, unlinked only")
// it("notify_channel is unique per user and channel") ; it("channel accepts telegram, email, fake only")
// it("deleting a user deletes all four tables' rows")
// isolation rows: notification.listRecent/unreadCount/markRead hide A's rows from B ; notificationDelivery.listRecent ; telegramLink.get/upsert ; notifyChannel.get/list/upsert/delete ;
//   notificationQueries.insert ignores a smuggled userId
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/notify-schema.test.ts tests/integration/scoped-isolation.test.ts`
Expected: FAIL, tables and helpers missing.

- [ ] **Step 3: Implement the schema, migration and helpers**

Columns exactly as spec section 4 (`notification`, `notification_delivery`, `telegram_link`, `notify_channel`). Check constraints list every value from this first migration, except `notification.kind`, which only has a length check (decision D29). Index `notification_user_read_created_idx` on (`user_id`, `read_at`, `created_at`). Unique `notify_channel_user_channel_unique`. `telegram_link.chat_id` unique where not null.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(notify): notification, delivery, telegram link and channel tables"
```

**Acceptance:** (1) all four tables and their constraints exist (spec 4). (2) the isolation test has a row for each (spec 7). (3) a notification changes only through `read_at` (spec 4, `notification`).

---

### Task 29: Notify config, channel interface, fake driver, writer

**Files:**
- Create: `lib/notify/values.ts`, `lib/notify/config.ts`, `lib/notify/messages.ts`, `lib/notify/channels/driver.ts`, `lib/notify/channels/fake.ts`, `lib/notify/write.ts`
- Modify: `lib/env.ts` (`Env.NOTIFY: NotifyConfig`, bad values join `EnvError`), `.env.example`
- Test: `tests/unit/notify-config.test.ts`, `tests/unit/notify-fake.test.ts`, `tests/integration/notify-write.test.ts`, `tests/unit/env.test.ts`

**Interfaces:**
- Consumes: `Scoped`, `parseAiConfig` as the pattern.
- Produces: `NOTIFICATION_KINDS = ["feed_items"] as const` and `NotificationKind` in `lib/notify/values.ts` (later cycles add a member: Debrief adds `debrief_ready`); the Contract's `NotifyChannelName`, `NotifyErrorCode`, `ChannelTarget`, `ChannelMessage`, `ChannelSendResult`, `ChannelDriver`, `NotifyConfig`, `parseNotifyConfig`, `NotifyInput`; `NotifyDeps = { config: NotifyConfig; drivers: Partial<Record<NotifyChannelName, ChannelDriver>>; now: () => Date; appUrl: string }`; `notify(s, input, deps): Promise<Result<{ notificationId: string }, "invalid">>`; `recordDelivery(s, row): Promise<string>` (the only writer of `notification_delivery`); `createFakeChannel(): ChannelDriver & { sent: { target: ChannelTarget; message: ChannelMessage }[] }`.

- [ ] **Step 1: Write the failing tests**

```ts
// config: it("unset NOTIFY_CHANNELS means in-app only") channels []
//   it("reads a comma list, trims it and drops duplicates") " fake , fake" -> ["fake"] ; it("an unknown name is invalid [NOTIFY_CHANNELS]")
//   it("telegram without TELEGRAM_BOT_TOKEN is invalid [TELEGRAM_BOT_TOKEN]") ; it("email without EMAIL_PROVIDER is invalid [EMAIL_PROVIDER]")
//   it("TELEGRAM_UPDATES defaults to poll") ; it("webhook needs TELEGRAM_WEBHOOK_SECRET of 32 or more characters") invalid [TELEGRAM_WEBHOOK_SECRET]
//   it("a TELEGRAM_UPDATES value other than poll or webhook is invalid") ; it("fake needs nothing")
// env: it("boot fails with the variable's name") parseEnv throws EnvError naming TELEGRAM_BOT_TOKEN
// fake channel: it("sends nothing and returns ok with a provider id carrying the plain text of the message") (decision D20: the delivery row is the e2e's only record, so the fake's providerId is the message's plain text)
// writer: it("notify inserts an unread notification with kind, title, body, href and item ids")
//   it("clips title to 120 and body to 1,000 characters and item ids to 50") ; it("rejects an href that does not start with a slash") -> fail "invalid"
//   it("recordDelivery is the only insert into notification_delivery and stores channel, kind, ids, status, attempts, error code, provider id and sent_at")
//   it("notify writes for the caller only")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/notify-config.test.ts tests/unit/notify-fake.test.ts tests/integration/notify-write.test.ts tests/unit/env.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

`parseNotifyConfig` follows `parseAiConfig` (blank means unset, returns `{ ok: false, invalid }`). Decision D20 (add to the report): the spec says the fake "records each message as a `notification_delivery` row" and the end-to-end suite reads "the digest text from the delivery row", yet the table has no text column, so the fake driver's `providerId` is the message's plain text; real drivers store the vendor's message id there.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration/notify-write.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests .env.example
git commit -m "feat(notify): config, channel interface, fake channel and the notification writer"
```

**Acceptance:** (1) unset means in-app only; a misconfigured channel fails boot by name (spec 5.11, 6). (2) `lib/notify/write.ts` is the only writer of notifications and deliveries (spec 3). (3) the fake channel sends nothing (spec 5.11).

---

### Task 30: Eligibility and in-app batches

**Files:**
- Create: `lib/notify/rules.ts` (`eligibleForAlert`, `AlertFacts`, `AlertContext`), `lib/notify/batch.ts` (`createInAppBatch`, `batchTitle`)
- Modify: `lib/feed/steps.ts` (append `notifyStep` to `userSteps`, after scoring and retention), `lib/db/scoped/feed-item.ts` (`listAlertCandidates(since)`, `markNotified(ids, now)`)
- Test: `tests/unit/notify-eligibility.test.ts`, `tests/integration/notify-batch.test.ts`

**Interfaces:**
- Consumes: `FeedSettings.alerts`, `itemFilter` stored columns, `Preferences.scoreThreshold`, `notify`.
- Produces: `eligibleForAlert(item: AlertFacts, ctx: AlertContext): boolean` with `AlertFacts = { state; duplicateOfId; filterPass; sourceSnoozedUntil; sourceKind; notifiedAt; firstSeenAt; fitScore }` and `AlertContext = { now: Date; threshold: number; trackedWithoutScore: boolean }`; `batchTitle(count: number, companies: number): string` (`5 new roles at 3 companies`, `1 new role at 1 company`); `createInAppBatch(s, now, deps): Promise<{ notificationId: string; count: number } | null>`; `notifyStep: UserStep`.

- [ ] **Step 1: Write the failing tests**

```ts
// eligibility: it("alerts for a new primary item that passes the filters, from an unsnoozed source, not yet notified, first seen within 48 hours, with a score at or above the threshold")
//   it("does not alert below the threshold") ; it("threshold is alerts.threshold, else preferences.scoreThreshold")
//   it("a tracked company item with no score alerts when trackedWithoutScore is on and not when it is off")
//   it("an unscored item from an RSS or preset source never alerts") ; it("does not alert at 49 hours") ; it("alerts at 47 hours")
//   it("does not alert for seen, saved, dismissed or expired items, duplicates, filter misses, snoozed sources or notified items")
// batch: it("one pass makes one feed_items notification titled '5 new roles at 3 companies' with href /feed") 
//   it("sets notified_at on every item in the batch so none alerts twice")
//   it("at most one new batch an hour: items found sooner wait for the next pass") second pass at +30 minutes makes none, at +61 makes one
//   it("puts at most 50 item ids in a batch and leaves the rest for the next batch")
//   it("AI off: tracked company items still alert") ; it("makes no batch when nothing is eligible")
//   it("body lists up to 5 'Role · Company' lines") ; it("the step runs for cron, command and manual passes, and not for home")
//   it("a user with nothing touched in the pass gets no batch")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/notify-eligibility.test.ts tests/integration/notify-batch.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

`notifyStep` order inside `userSteps` is scoring, retention, notify (spec 5.10 step 3). It reads `parseFeedSettings(profile.feed)` and the preferences once. Default `alerts` come from Task 19's settings.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/notify-eligibility.test.ts tests/integration/notify-batch.test.ts tests/integration/feed-schedule.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(notify): alert eligibility and in-app batches"
```

**Acceptance:** (1) eligibility is exactly spec 5.11's rule (48 hours, threshold, tracked without a score). (2) one batch an hour and no item alerts twice (spec 5.11 In-app). (3) with `NOTIFY_CHANNELS` unset a scan above the threshold adds one bell entry (done-when, first clause; Task 39 repeats it end to end).

---

### Task 31: The bell

**Files:**
- Create: `components/ui/popover.tsx` (vendored from `base-nova` with `pnpm dlx shadcn@latest add popover`; record in `docs/design-system.md`), `components/notify/bell.tsx`, `components/notify/notification-list.tsx`, `lib/notify/bell.ts` (`unreadText`, `unreadLabel`), `app/(app)/notify-actions.ts` (`bellStateAction`, `markReadAction`, `markAllReadAction`)
- Modify: `components/app-shell.tsx` (`AppTopbar`'s `actions` slot carries the bell on every page and size)
- Test: `tests/unit/notify-bell-model.test.ts`, `tests/unit/notify-bell.test.tsx`, `tests/integration/notify-actions.test.ts`

**Interfaces:**
- Consumes: `notification` scoped helpers, `Popover`, `LocalTime`, `useAnnounce`.
- Produces: `unreadText(n: number): string` (`""` at 0, the number up to 9, `9+` above); `unreadLabel(n: number): string` (`Notifications` at 0, `Notifications, 3 unread`); actions returning `{ unread: number; items: { id; title; body; href; read: boolean; createdAt: string }[] }` (the last 20).

- [ ] **Step 1: Write the failing tests**

```ts
// model: unreadText(0) "" ; (3) "3" ; (9) "9" ; (10) "9+" ; unreadLabel(0) "Notifications" ; unreadLabel(3) "Notifications, 3 unread" ; unreadLabel(1) "Notifications, 1 unread"
// component: it("shows the unread count with the label 'Notifications, 3 unread'") ; it("opens a popover with the last 20 entries")
//   it("clicking an entry marks it read and goes to its href") ; it("'Mark all read' marks every entry read and clears the count")
//   it("refreshes its count on mount, on window focus and every 60 seconds while the tab is visible, and not while hidden") fake timers and visibilityState
//   it("announces 'All notifications marked read.'") ; it("focus returns to the bell button when the popover closes")
// actions: it("bellStateAction returns the caller's last 20 and unread count") ; it("markReadAction ignores another user's id") ; it("every action calls requireUser")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/notify-bell-model.test.ts tests/unit/notify-bell.test.tsx tests/integration/notify-actions.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

Add the popover primitive first (`test -f components/ui/popover.tsx` afterwards). The bell is a client component rendered in the `AppTopbar` `actions` prop in `components/app-shell.tsx`; its state comes from the server actions (no new route). Entry times through `LocalTime`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration/notify-actions.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components app lib docs tests
git commit -m "feat(notify): the notification bell"
```

**Acceptance:** (1) label, count text, last 20 and refresh rhythm as spec 5.11 In-app. (2) the bell sits in the topbar on every page and size (spec 5.7).

---

### Task 32: Digest timing rules

**Files:**
- Modify: `lib/notify/rules.ts` (`nextDigestAt`, `inQuietHours`, `quietEnd`, `asFoundAllowance`)
- Create: `lib/notify/channel-state.ts` (`syncNotifyChannels`, `recomputeNextDigest`)
- Test: `tests/unit/notify-timing.test.ts`, `tests/integration/notify-channel-state.test.ts`

**Interfaces:**
- Consumes: `zonedAt`, `zonedDate`, `FeedSettings`, `notifyChannel` helpers.
- Produces: `nextDigestAt(input)` (Contract; `null` when there are no hours); `inQuietHours(hour: number, quiet: { start: number; end: number } | null): boolean` (start inclusive, end exclusive, spanning midnight as written); `asFoundAllowance(row: { sentDay: string | null; sentToday: number }, now: Date, timeZone: string, ceiling: number): { allowed: boolean; sentToday: number }`; `syncNotifyChannels(s, input: { settings: FeedSettings; telegramLinked: boolean; configured: NotifyChannelName[]; timeZone: string; now: Date }): Promise<void>`: creates or removes the `telegram` (or `fake`) and `email` rows and recomputes `next_digest_at` after every send and every settings change.

- [ ] **Step 1: Write the failing tests**

```ts
// nextDigestAt (digestHours [9,17]):
//   UTC, now 2026-11-21T10:00Z -> 2026-11-21T17:00Z ; now 18:00Z -> 2026-11-22T09:00Z ; now exactly 09:00Z -> 17:00Z (strictly after)
//   America/Toronto spring forward: hours [9], now 2026-03-08T04:00Z (23:00 on the 7th, EST) -> 2026-03-08T13:00Z (09:00 EDT)
//   America/Toronto fall back: hours [9], now 2026-11-01T04:00Z -> 2026-11-01T14:00Z (09:00 EST)
//   a digest hour that does not exist on a spring-forward day (hour 2) never returns an instant at or before now and lands within 26 hours
// quiet hours { start: 21, end: 8 } (spans midnight): inQuietHours(22) true, (3) true, (21) true, (8) false, (20) false
//   non-spanning { start: 8, end: 21 }: (9) true, (21) false ; null quiet never quiet ; start equal to end is treated as no quiet hours
//   it("a slot inside quiet hours moves to the quiet end") hours [9,21], quiet 21-8, now 2026-11-21T10:00Z, UTC -> 2026-11-22T08:00Z
//   it("a slot at 22:00 with quiet 21-8 waits for 08:00") 
// as-found: it("allows 6 per local day and refuses the 7th until the next local day") ; it("sent_today resets when the local date changes in the profile zone")
// state: it("telegram mode digest creates the row with next_digest_at") ; it("mode off removes the row") ; it("unlinked removes the telegram row")
//   it("email digest on creates the email row only when email is configured") ; it("as_found keeps next_digest_at null until a send is held")
//   it("a settings change recomputes next_digest_at") ; it("fake stands in for telegram when only fake is configured")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/notify-timing.test.ts tests/integration/notify-channel-state.test.ts`
Expected: FAIL, functions missing.

- [ ] **Step 3: Implement**

`nextDigestAt` builds candidate instants for today and the next two local days with `zonedAt`, moves each candidate that falls in quiet hours to the quiet end of that period, and returns the earliest strictly after `now`. All local dates come from `zonedDate`. No `Date` arithmetic on 24-hour multiples.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/notify-timing.test.ts tests/integration/notify-channel-state.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(notify): digest times, quiet hours and channel rows"
```

**Acceptance:** (1) due times across a daylight saving change and quiet hours over midnight (spec 8, Unit). (2) the as-found ceiling is 6 a day (spec 5.11 Timing). (3) channel rows exist only while the user can receive (spec 4, `notify_channel`).

---

### Task 33: Digest text, sending and as-found

**Files:**
- Create: `lib/notify/digest.ts` (`buildDigest`, `digestItemsFor`, `sendDigests`, `deliverAsFound`)
- Modify: `lib/db/system.ts` (`dueDigests`), `lib/feed/steps.ts` (`notifyStep` gains as-found delivery; `postSteps` gains `digestStep`), `lib/feed/retention.ts` (also deletes `notification_delivery` rows over 30 days), `lib/db/scoped/feed-item.ts` (`getManyByIds`)
- Test: `tests/unit/notify-digest.test.ts`, `tests/integration/notify-send.test.ts`, `tests/integration/feed-system.test.ts`

**Interfaces:**
- Consumes: `ChannelDriver`, `recordDelivery`, `nextDigestAt`, `asFoundAllowance`, `syncNotifyChannels`, `notification` and `notifyChannel` helpers.
- Produces: `buildDigest(items: DigestItem[], appUrl: string)` (Contract) with `DigestItem = { id: string; roleTitle: string; companyName: string; location: string | null; fitScore: number | null }`; `sendDigests(db: Db, now: Date, deps: NotifyDeps & { userDeps(userId): Scoped }): Promise<{ sent: number; skipped: number; failed: number }>`; `deliverAsFound(s, now, deps): Promise<void>`; `dueDigests(db, now): Promise<{ userId: string; channel: NotifyChannelName }[]>`.

- [ ] **Step 1: Write the failing tests**

```ts
// buildDigest: it("first line is 'Jobsmith: 4 new roles' and the subject is '4 new roles on Jobsmith'") ; singular "Jobsmith: 1 new role" and "1 new role on Jobsmith"
//   it("lines read '<b>Role</b> · Company · Location · 82' with the score only when scored and the location only when present")
//   it("each line links to <APP_URL>/feed?item=<id>") ; it("cuts the role at 80 characters")
//   it("escapes &, < and > in every value and quotes in attributes") role title '<script>x</script> & Co'
//   it("shows at most 10 lines and 'and 3 more' for 13 items") ; it("stays within 4,096 characters with 200-character names, dropping lines from the end and counting them in 'and N more'")
//   it("carries no posting text, fit summary or resume text") ; it("plain text lines match the Telegram lines without tags")
// send: it("sends one message that covers every batch created after sent_through and moves sent_through to the newest batch")
//   it("a second pass sends nothing") ; it("a batch created after sent_through goes in the next send")
//   it("leaves out items that are no longer new or seen, and a digest with no items is recorded skipped and still moves sent_through")
//   it("a Telegram channel in as-found mode and an email channel in digest mode each send every batch exactly once") three batches, different timings, union equals all, no repeats
//   it("as-found sends at the end of the pass that made a batch, at most 6 a local day, later batches wait for the next day in one message")
//   it("a batch made during quiet hours is held and the morning digest carries it") quiet 21-8, found 22:00, sent at 08:00
//   it("a 429 leaves sent_through where it was and moves next_digest_at past retry_after")
//   it("a blocked answer sets telegram_link blocked, removes the channel row and stops sends")
//   it("an error is retried at the next pass; the fifth failed attempt records failed and moves next_digest_at to the next slot")
//   it("writes one notification_delivery row per attempt with status, attempts and error code") ; it("digests for user A never contain user B's items")
//   it("deliveries over 30 days old are deleted by retention")
// system: it("dueDigests returns (userId, channel) pairs whose next_digest_at has passed, ids only")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/notify-digest.test.ts tests/integration/notify-send.test.ts tests/integration/feed-system.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

Decision D21 (add to the report): the digest lists items of the unsent batches that are still `new` or `seen` and primary at send time, per the spec's "computed from items at send time". Attempts are counted from earlier `failed` delivery rows with the same `notification_ids`. As-found runs inside `notifyStep` right after `createInAppBatch`; when the ceiling or quiet hours hold it, set `next_digest_at` to the quiet end or the next local day's first digest slot so `digestStep` sends one message with everything held. `digestStep` is a `PassStep` in `postSteps` calling `dueDigests` then `sendDigests`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/notify-digest.test.ts tests/integration/notify-send.test.ts tests/integration/feed-system.test.ts tests/integration/feed-retention.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(notify): digests, as-found sends and retry rules"
```

**Acceptance:** (1) Telegram and email each get every batch once, whatever their timing (spec 5.11 Message). (2) quiet hours hold a send until their end and one digest carries everything held (spec 5.11 Timing). (3) the message cuts and limits are the spec's (spec 5.11 Message). (4) the failure rules are the spec's (spec 5.11 Failures).

---

### Task 34: Telegram channel, link codes, poll updates

**Files:**
- Create: `lib/notify/channels/telegram.ts` (`createTelegramDriver`, `botUsername`, `getUpdates`, `sendText`), `lib/notify/telegram/link.ts` (`createLinkCode`, `normalizeCode`, `hashCode`, `handleTelegramUpdate`), `lib/notify/telegram/updates.ts` (`pollTelegramUpdates`, `telegramPollStep`)
- Modify: `lib/db/system.ts` (`linkByCodeHash`, `linkByChatId`), `lib/feed/steps.ts` (`preSteps` gains `telegramPollStep` in poll mode), `lib/notify/messages.ts` (bot replies)
- Test: `tests/unit/notify-telegram.test.ts`, `tests/unit/notify-link-code.test.ts`, `tests/integration/notify-link.test.ts`, `tests/integration/notify-poll.test.ts`

**Interfaces:**
- Consumes: `ChannelDriver`, `ChannelSendResult`, `buildDigest` output, `fetch` (injected `fetchImpl`, default global `fetch`), `Db`, `scoped`.
- Produces: `createTelegramDriver(input: { token: string; fetchImpl?: typeof fetch; timeoutMs?: number }): ChannelDriver & { getMe(): Promise<{ username: string }>; getUpdates(input: { offset?: number }): Promise<Result<TelegramUpdate[], "telegram_conflict" | "notify_error">>; reply(chatId: string, text: string): Promise<void> }`; `createLinkCode(s, now, rand: (n: number) => Uint8Array): Promise<{ code: string; display: string; expiresAt: Date }>` (display `XXXX-XXXX`); `normalizeCode(input: string): string` (decision D14); `handleTelegramUpdate(db: Db, update: unknown, deps: LinkDeps): Promise<void>`; `pollTelegramUpdates(db, deps): Promise<{ handled: number; conflict: boolean }>`.

**Blocked on:** Step 8 needs the owner's bot token and phone. Steps 1 to 7 run on an injected `fetch`.

- [ ] **Step 1: Write the failing tests**

```ts
// telegram driver (injected fetch): it("posts sendMessage to api.telegram.org with chat_id, the HTML text, parse_mode HTML, previews off and one URL button 'Open Feed'")
//   it("a 403 is notify_blocked") ; it("a 429 is notify_rate_limited with retryAfterSeconds from parameters.retry_after") ; it("a timeout at 10 seconds is notify_timeout") ; it("other failures are notify_error")
//   it("the token never appears in a returned message, a thrown error or a console line") spy on console.info, warn, error
//   it("getMe is cached for an hour") ; it("sends text of at most 4,096 characters")
// code: it("generates 8 Crockford base32 characters shown as XXXX-XXXX") regex ^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$
//   it("stores only the sha256 hash and a 15-minute expiry") ; it("a newer code replaces the old one") ; it("normalizeCode reads lowercase, no dash, I and L as 1, O as 0")
// link: it("/start <valid code> links the chat, clears the code, sets linked and linked_at, creates the channel row and replies that alerts arrive here and /stop unlinks")
//   it("a wrong code gets one reply naming Settings") ; it("an expired code (15 minutes and 1 second) gets the same reply") ; it("a used code cannot be used twice")
//   it("a chat already linked to another account is refused") ; it("10 wrong codes in an hour from one chat: the 11th gets no reply and nothing is read")
//   it("/stop unlinks, clears chat_id and removes the channel row") ; it("any other text gets one line saying the bot only sends Jobsmith alerts")
//   it("takes no settings commands") ; it("a user id never comes from the update") 
// poll: it("reads updates with timeout 0 and allowed_updates ['message'], handles them, then confirms with offset = last + 1") fetch call order
//   it("stores no offset") ; it("a 409 answer returns conflict true and Settings can show telegram_conflict") ; it("runs only when TELEGRAM_UPDATES is poll and telegram is configured")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/notify-telegram.test.ts tests/unit/notify-link-code.test.ts tests/integration/notify-link.test.ts tests/integration/notify-poll.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

Telegram's host is fixed, so the driver uses plain `fetch` with `AbortSignal.timeout(10_000)`; nothing here goes through the fetch guard. Error handling catches everything and returns a code, never the thrown message (it can embed the URL and so the token). `handleTelegramUpdate` is the second cross-user reader: it calls `linkByCodeHash` or `linkByChatId` (ids only) and then `scoped(db, userId)`. The wrong-code counter is an in-memory map per server instance, since the spec names no storage for it; say so in a comment and in the report. Bot replies live in `lib/notify/messages.ts`: link confirmed `Linked. Jobsmith alerts will arrive in this chat. Send /stop to unlink.`; wrong or expired `That code did not work. Open Settings in Jobsmith and create a new one.`; already linked elsewhere `This chat is linked to another Jobsmith account.`; unlinked `Unlinked. You will get no more alerts here.`; other `This bot only sends Jobsmith alerts.`

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration/notify-link.test.ts tests/integration/notify-poll.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(notify): Telegram channel, link codes and poll updates"
```

- [ ] **Step 6: Run the notify and feed integration folders**

Run: `pnpm vitest run tests/integration/notify-link.test.ts tests/integration/notify-send.test.ts tests/integration/feed-schedule.test.ts`
Expected: PASS

- [ ] **Step 7: Check logs by hand**

Run the poll test with `console` spies enabled and confirm no line carries the token, a code, a chat id or the Telegram URL (spec 6, Logs).

- [ ] **Step 8: Owner live check (blocked on the owner)**

With the owner's bot token in `TELEGRAM_BOT_TOKEN` and `TELEGRAM_UPDATES=poll` on a local run: create a code in Settings (Task 37), send `/start <code>` from the phone, see Settings say linked, send `/stop`. Record in the PR.

**Acceptance:** (1) every Telegram case in spec 8 (valid, expired, wrong, reused, linked elsewhere, `/stop`) has a test. (2) the code is random, hashed, single use and 15 minutes old at most (spec 5.11, 7). (3) the token appears in no log or message (spec 6, 7). (4) poll mode stores no offset and surfaces a 409 (spec 5.11 Updates).

---

### Task 35: Webhook, unsubscribe, proxy, `telegram:webhook`

**Files:**
- Create: `app/api/telegram/webhook/route.ts`, `app/api/notify/unsubscribe/route.ts`, `lib/notify/unsubscribe.ts` (`signUnsubscribeToken`, `verifyUnsubscribeToken`, `unsubscribeUrl`), `lib/notify/webhook.ts` (`verifyWebhookSecret`, `readCappedBody`), `scripts/telegram-webhook.ts`, `lib/notify/webhook-request.ts` (`buildWebhookRequest`)
- Modify: `proxy.ts` (matcher exclusion list gains `api/telegram/webhook` and `api/notify/unsubscribe/`, appended to whatever exclusions exist), `package.json` (`"telegram:webhook": "tsx --env-file-if-exists=.env scripts/telegram-webhook.ts"`), `tests/unit/proxy-matcher.test.ts`
- Test: `tests/integration/notify-routes.test.ts`, `tests/unit/notify-unsubscribe.test.ts`, `tests/unit/telegram-webhook-script.test.ts`, `tests/unit/proxy-matcher.test.ts`

**Interfaces:**
- Consumes: `handleTelegramUpdate`, `getDb`, `scopedFor`, `parseNotifyConfig`, `env().BETTER_AUTH_SECRET`, `feed settings writer`.
- Produces: `POST /api/telegram/webhook` (header `X-Telegram-Bot-Api-Secret-Token` equal to `TELEGRAM_WEBHOOK_SECRET`, constant time; 401 otherwise; 404 when the instance is not in webhook mode or the secret is unset; body capped at 64 KB; always 200 once authenticated); `POST /api/notify/unsubscribe?t=<token>` (404 on a bad or missing token, 200 and email digests off on a good one); `signUnsubscribeToken(userId, channel, secret): string`, `verifyUnsubscribeToken(token, secret): { userId: string; channel: "email" } | null` (decision D15); `buildWebhookRequest(env, remove): { url: string; body: Record<string, unknown> }`.

**Blocked on:** Step 8 needs a public deployment and the owner's bot.

- [ ] **Step 1: Write the failing tests**

```ts
// webhook route (call the handler with a Request, no cookie): it("401 without the header") ; it("401 with a wrong header of the same length and of another length")
//   it("404 when TELEGRAM_UPDATES is poll or the secret is unset") ; it("200 and links the chat for a valid /start update with the right header")
//   it("200 and no processing for a body over 64 KB") ; it("200 for malformed JSON after authentication") ; it("never redirects")
//   it("compares with timingSafeEqual after a length check") (unit on verifyWebhookSecret)
// unsubscribe: it("a missing or bad token is 404") ; it("a token signed with another secret is 404") ; it("a good token turns email digests off, removes the email channel row and answers 200")
//   it("a token cannot turn anything else off") ; it("takes the user id only from the verified token")
//   it("verifyUnsubscribeToken round-trips and rejects a flipped character")
// proxy matcher: it("the matcher excludes /api/telegram/webhook and /api/notify/unsubscribe") ; it("still checks /api/telegram/webhooks-other and /api/notify/other")
//   it("still excludes api/bridge/ and every earlier exclusion")
// script: it("buildWebhookRequest registers <APP_URL>/api/telegram/webhook with secret_token and allowed_updates ['message']") ; it("--remove builds a deleteWebhook request")
//   it("refuses without APP_URL, TELEGRAM_BOT_TOKEN or a 32-character secret") ; it("prints no token") 
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/notify-routes.test.ts tests/unit/notify-unsubscribe.test.ts tests/unit/telegram-webhook-script.test.ts tests/unit/proxy-matcher.test.ts`
Expected: FAIL, routes and helpers missing.

- [ ] **Step 3: Implement**

Route handlers do not call `requireUser()`; each checks its own secret or token first. Read the Next 16 docs on route handlers and the proxy matcher for the exact exclusion syntax; keep the existing `api/bridge/` entry and the entry Hosted added for `api/jobs/tick`. Read the webhook body with a streaming cap at 64 KB.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/notify-routes.test.ts tests/unit && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app lib scripts proxy.ts package.json tests
git commit -m "feat(notify): webhook and unsubscribe routes outside the session check"
```

- [ ] **Step 6: Prove the no-redirect rule against a real server**

Run: `pnpm build && pnpm start &` then `curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/telegram/webhook` and the same for `/api/notify/unsubscribe?t=bad`.
Expected: `404` for the webhook (poll mode, default) or `401` in webhook mode, and `404` for the unsubscribe; never `307`. Stop the server.

- [ ] **Step 7: Run the whole unit and integration suite**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 8: Owner live check (blocked on the owner)**

On the deployment with `TELEGRAM_UPDATES=webhook` and the secret set: run `pnpm telegram:webhook`, send `/start <code>` from the phone and see Settings say linked; run `pnpm telegram:webhook --remove` afterwards if the owner wants poll mode back. Record in the PR.

**Acceptance:** (1) each route answers a cookieless call itself, never a redirect to `/login` (spec 8, Integration). (2) secrets are checked in constant time and fail closed (spec 7). (3) the unsubscribe token can only turn email digests off (spec 7). (4) the matcher keeps every earlier exclusion (spec 5.11 Email).

---

### Task 36: Email channel and the `feed_digest` template

**Files:**
- Create: `lib/notify/channels/email.ts` (`createEmailChannel`), `lib/email/templates/feed-digest.ts` (`feedDigestTemplate`)
- Modify: `lib/email/driver.ts (from 2026-11-21-jobsmith-hosted milestone 11)` (`EmailTemplateName` gains `"feed_digest"`; `EmailData` gains `feed_digest: { items: DigestItem[]; unsubscribeUrl: string; settingsUrl: string }`; every `EmailMessage` variant gains optional `headers?: Record<string, string>`), `lib/email/smtp.ts (from 2026-11-21-jobsmith-hosted milestone 11)`, `lib/email/resend.ts (from 2026-11-21-jobsmith-hosted milestone 11)`, `lib/email/fake.ts (from 2026-11-21-jobsmith-hosted milestone 11)` (each passes `headers` through; the fake writes them into its JSON file), `lib/email/templates/index.ts (from 2026-11-21-jobsmith-hosted milestone 11)` (register `feed_digest` in the registry behind `renderEmail`; follow the file's own shape)
- Test: `tests/unit/email-feed-digest.test.ts`, `tests/unit/email-headers.test.ts`, `tests/unit/notify-email-channel.test.ts`

**Interfaces:**
- Consumes: `EmailDriver.send(message: EmailMessage)` and its `Result<{ messageId }, "email_rejected" | "email_rate_limited" | "email_error">`, `renderEmail`, `appLink(path, query?)` (builds every URL from `APP_URL`), `buildDigest`, `unsubscribeUrl`.
- Produces: template `feed_digest` with data `{ items: DigestItem[]; unsubscribeUrl: string; settingsUrl: string }` (both URLs built with `appLink`) returning `{ subject: "4 new roles on Jobsmith", text, html }`; `createEmailChannel(driver: EmailDriver): ChannelDriver` mapping `email_rejected` to `notify_blocked`, `email_rate_limited` to `notify_rate_limited`, `email_error` to `notify_error`, and sending `List-Unsubscribe: <unsubscribeUrl>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.

- [ ] **Step 1: Write the failing tests**

```ts
// template: it("subject is '4 new roles on Jobsmith' and '1 new role on Jobsmith'") ; it("text carries the same lines as the Telegram message, without tags")
//   it("html is minimal and escapes every value") ; it("the footer links to <APP_URL>/settings") ; it("never reads the Host header: links come from APP_URL")
//   it("has no tracking pixel and no rewritten links")
// headers: it("the fake driver writes headers into its JSON file in EMAIL_FAKE_DIR") ; it("smtp passes headers to nodemailer") ; it("resend passes headers") 
// channel: it("sends to the account's address with the feed_digest template and both unsubscribe headers") ; it("maps each email error code to a notify code")
//   it("email_rejected makes Settings say why: the email delivery row carries error_code email_rejected and email digests turn off")
//   it("email_rate_limited and email_error retry at the next pass")
//   it("the email channel is digest mode only") ; it("a channel with no EMAIL_PROVIDER is not created")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/email-feed-digest.test.ts tests/unit/email-headers.test.ts tests/unit/notify-email-channel.test.ts`
Expected: FAIL, template, option and channel missing.

- [ ] **Step 3: Implement**

The `headers` field is optional, so every existing `send` call stays valid; add a test in the Hosted email tests only if their file already covers `send` input shape. `email_rejected` handling lives in `sendDigests` (Task 33): it sets `emailMode` to `off` through `lib/feed/settings.ts` and removes the channel row.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration/notify-send.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(notify): email digest channel and template"
```

**Acceptance:** (1) the digest goes to the account address through `EmailDriver.send` with a `feed_digest` template (spec 5.11 Email). (2) `List-Unsubscribe` and `List-Unsubscribe-Post` are present (spec 5.11 Email). (3) `email_rejected` turns digests off with a reason Settings can show (spec 5.11 Email).

---

### Task 37: Settings: Alerts section and Feed line

**Files:**
- Create: `components/settings/alerts-section.tsx`, `lib/feed/settings-form.ts` (`feedSettingsFromForm`), `lib/notify/status.ts` (`telegramStatus`, `telegramStatusWords`)
- Modify: `lib/feed/settings.ts` (`feedSettingsInputSchema`, `toFeedSettingsDocument`), `app/(app)/settings/page.tsx` (the section after Profile), `app/(app)/settings/actions.ts` (`saveAlertsAction`, `linkTelegramAction`, `unlinkTelegramAction`, `pollTelegramAction`), `lib/notify/messages.ts`
- Test: `tests/unit/feed-settings-input.test.ts`, `tests/unit/telegram-status.test.ts`, `tests/unit/alerts-section.test.tsx`, `tests/integration/settings-alerts.test.ts`

**Interfaces:**
- Consumes: `parseFeedSettings`, `syncNotifyChannels`, `createLinkCode`, `botUsername`, `pollTelegramUpdates`, `profile.feedScoreUsage`, `scanRun.latestStartedAt`, `env().NOTIFY`, `env().FEED`.
- Produces: `feedSettingsInputSchema` (strict, explicit messages: `Choose 1 to 3 digest hours.`, `Quiet hours need a start and an end from 0 to 23.`, `Enter a whole number from 0 to <ceiling>.`, `Pick from the listed modes.`); `telegramStatus(link, configured): "not_set_up" | "not_linked" | "waiting" | "linked" | "blocked" | "conflict"` with words `Not set up on this instance`, `Not linked`, `Waiting for your message`, `Linked since <date>`, `Blocked. Link again.`, and for `telegram_conflict`: `Telegram says another program is reading this bot's messages. Remove the webhook with pnpm telegram:webhook --remove, or set TELEGRAM_UPDATES to webhook.`

- [ ] **Step 1: Write the failing tests**

```ts
// schema: it("accepts 1 to 3 whole digest hours between 0 and 23") ; it("rejects 0 hours and 4 hours with 'Choose 1 to 3 digest hours.'")
//   it("quiet hours are both set or both empty") ; it("scoresPerDay 0 to the instance ceiling") ; it("threshold empty means null, 0 to 100 otherwise")
//   it("emailMode digest or off, telegramMode digest, as_found or off")
// status: each status word above, including 'Linked since 12 Oct' through LocalTime, and conflict
// section component: it("in-app is always on and shown as such") ; it("shows 'Link Telegram' when telegram or fake is configured, with the code as XXXX-XXXX and the t.me link, and polls every 3 seconds while a code is pending")
//   it("the threshold field defaults to 'Use my score threshold (70)'") ; it("shows 'Tell me about roles at companies I track, even without a score' checked by default")
//   it("shows 'Email me a digest' only when email is configured, off by default") ; it("up to 3 digest hours and quiet hours or none")
//   it("the Feed line reads '12 of 30 used today' and the last scheduled scan, or 'Scans run when you open Home' with the one-line cron example")
//   it("Unlink asks for no extra step and announces 'Telegram unlinked.'") ; it("a blocked link says to link again")
// actions: it("saveAlertsAction validates, writes profile.feed and recomputes next_digest_at") ; it("linkTelegramAction replaces an older code")
//   it("unlinkTelegramAction removes the channel row") ; it("every action calls requireUser") ; it("scoresPerDay above the ceiling is refused")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/feed-settings-input.test.ts tests/unit/telegram-status.test.ts tests/unit/alerts-section.test.tsx tests/integration/settings-alerts.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

The section follows `components/settings/settings-section.tsx` and the form helpers in `lib/forms/submit.ts`. The email control renders only when `NOTIFY_CHANNELS` includes `email`; the Telegram controls render when it includes `telegram` or `fake` (decision D13). Pending-code polling is a client interval calling `pollTelegramAction` every 3 seconds, only while a code is pending and the instance is in poll mode. Add the section to `docs/design-system.md` only if it uses a piece outside `base-nova` and the registry.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration/settings-alerts.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app components lib tests
git commit -m "feat(settings): alerts section, Telegram linking and the feed line"
```

**Acceptance:** (1) every control of spec 5.11 Settings exists with the spec's default copy. (2) saving recomputes digest times (spec 5.11 Timing). (3) conflict, blocked and not-set-up states are shown in words (spec 5.11 Updates, Failures).

---

### Task 38: Export additions (notify tables)

**Files:**
- Modify: `lib/export/collect.ts` (`notifications`, `notificationDeliveries`, `notifyChannels`, `telegramLink`), `lib/db/scoped/notification.ts`, `notification-delivery.ts`, `notify-channel.ts` (add `listAll()` each)
- Test: `tests/integration/export.test.ts`

**Interfaces:**
- Consumes: `withoutUserId`.
- Produces: keys `notifications`, `notificationDeliveries`, `notifyChannels` (rows without `userId`) and `telegramLink: { status: string; linkedAt: Date | null; lastSentAt: Date | null } | null` where `lastSentAt` is the telegram (or fake) `notify_channel.last_sent_at`.

- [ ] **Step 1: Write the failing tests**

```ts
// it("exports notifications, deliveries and channel rows without userId")
// it("telegramLink carries status, linkedAt and lastSentAt only") the exported JSON string contains neither the code hash, the code expiry nor the chat id
// it("exports telegramLink null when there is no link") ; it("exports nothing of another user")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/export.test.ts`
Expected: FAIL, keys missing.

- [ ] **Step 3: Implement**

Extend `collectExport`'s `Promise.all` and result. Build `telegramLink` explicitly field by field, never by spreading the row.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/export.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(export): notifications, deliveries, channels and the telegram link status"
```

**Acceptance:** (1) the four keys exist (spec 4, last paragraph). (2) the code hash and chat id never leave the database (spec 4, 7).

---

### Task 39: End to end, docs and ship

**Files:**
- Create: `tests/e2e/feed-alerts.spec.ts`, `tests/integration/feed-done-when-m18.test.ts`
- Modify: `tests/e2e/feed.ts` (helpers `postTelegramUpdate(text, chatId)`, `forceDigestDue(channel)`, `latestDelivery(channel)`, `readFakeEmail()`), `playwright.config.ts` (webServer env: `NOTIFY_CHANNELS=fake,email`, `EMAIL_PROVIDER=fake`, `EMAIL_FROM=jobsmith@example.test`, `EMAIL_FAKE_DIR=<a temp folder>`, `TELEGRAM_UPDATES=webhook`, `TELEGRAM_WEBHOOK_SECRET="w".repeat(32)` built in the config), `.env.example`, `README.md` ("Alerts" section: the bell, Telegram setup with BotFather, poll and webhook modes, quiet hours, the privacy sentence that bot chats are stored on Telegram's servers without end-to-end encryption, email digests and unsubscribe), `docs/design-system.md`
- Test: the files above

**Blocked on:** Step 8 needs the owner's phone and bot.

- [ ] **Step 1: Write the integration test of the done-when's CI half**

```ts
// feed-done-when-m18.test.ts (NOTIFY_CHANNELS unset: in-app only)
// it("with NOTIFY_CHANNELS unset, a scan with new roles above the threshold adds one bell entry") scan -> bellState unread 1, title '2 new roles at 1 company' style, no delivery rows
// it("a role found during quiet hours arrives in the morning digest") fake channel linked, quiet 21-8, scan at 22:00 local -> no send; pass at 08:00 -> one send containing it
// it("a linked chat receives one digest at the next digest hour") fake clock to the hour -> exactly one delivery row, status sent
```

- [ ] **Step 2: Write the Playwright spec** (fixture fetch, fake AI, channels `fake,email`)

```ts
// feed-alerts.spec.ts
// test("the bell count after a scan") track a company, runFeedScan, the bell reads 'Notifications, 1 unread', the popover lists '... new roles at 1 company', click opens /feed and marks it read
// test("link a chat through the webhook and read the digest") Settings 'Link Telegram' shows a code, postTelegramUpdate('/start CODE') with the secret header, Settings says 'Linked since', set mode as_found, scan, latestDelivery('fake') provider id holds 'Jobsmith: 2 new roles'
// test("email digest from EMAIL_FAKE_DIR") turn on 'Email me a digest', forceDigestDue('email'), scan, readFakeEmail(): subject, text lines, List-Unsubscribe header; POST the unsubscribe link: 200 and Settings shows it off
// test("the webhook and unsubscribe answer a cookieless call themselves") request.post with maxRedirects 0: 401 and 404, never 3xx
// test("unlink Telegram") ; test("quiet hours are saved and shown")
// axe (light and dark): the Alerts section in each Telegram state, the open bell popover; keyboard-only: open the bell, move through entries, Mark all read
// phone project: the bell in the topbar at 390 px, the Alerts section, no horizontal scroll
```

- [ ] **Step 3: Run the new tests and watch the e2e fail first**

Run: `pnpm vitest run tests/integration/feed-done-when-m18.test.ts && pnpm test:e2e --project=feed-chromium -g "bell count"`
Expected: the integration test passes if Tasks 28 to 38 are right; the e2e FAILS until helpers and config exist.

- [ ] **Step 4: Add the helpers, config and docs**

The helpers use a `pg` client on `DATABASE_URL`. Document `pnpm telegram:webhook [--remove]` and the two Telegram modes in the README. Add every Notify variable to `.env.example` with its comment.

- [ ] **Step 5: Run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`
Expected: PASS in Chromium, WebKit and the phone project.

- [ ] **Step 6: Check the Core suites are untouched**

Run: `git diff --stat main -- lib/artifacts lib/bridge cli`
Expected: empty.

- [ ] **Step 7: Commit and open the pull request**

```bash
git add -A
git commit -m "feat(notify): milestone 18 alerts, bell, Telegram and email digests, end to end"
git push -u origin feat/m18-alerts
```

Open a PR to `main`, deploy a Vercel preview, give the link, and check Chrome and Safari by hand (bell, Settings Alerts, Companies unchanged).

- [ ] **Step 8: Owner live check (blocked on the owner)**

On the owner's deployment with the owner's bot: link the chat, wait for the next digest hour and read one digest on the phone; find a role during quiet hours (or temporarily set quiet hours around the current time) and read it in the morning digest. Record both in the PR.

**Acceptance:** (1) the CI half of the done-when passes (spec 9, row 18). (2) the e2e covers the bell, linking through the webhook, the Telegram and email digests, and the cookieless routes (spec 8). (3) axe clean in light and dark on the Alerts section and the open popover (spec 8, Accessibility).
