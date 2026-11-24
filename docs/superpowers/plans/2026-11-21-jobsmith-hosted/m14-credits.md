# Milestone 14: Credits

> "A trial account holding 10 credits writes a CV, is refused a second one by the paywall, still adds a job by hand and plays a bank with browser voices; a failed run refunds; the ledger sum equals the balance for every account in the integration suite."

Branch: `feat/m14-credits`, cut from `main` after Milestone 13 merged. Read `README.md` first.

**Before starting:**

```bash
test -f lib/credits/meter.ts && test -f lib/generate/start.ts && echo m13-ok
test -f lib/db/scoped/asset.ts && echo prep-assets-ok || echo "prep milestone 07 absent: skip Task 44, sum artifact bodies only in Task 45"
grep -n "freeMeter" lib/credits/meter.ts | head -2
```

Milestone 13 must be merged: it created `lib/credits/costs.ts`, the `Meter` seam and `freeMeter`, so this milestone adds the database meter behind the same interface. Decisions made here, to be added to the README list when merged: **D15.** A plan whose `dailyCap` is 0 (Free) does not apply `cap_day`; the balance check decides, so a Free user holding carried `bonus` credits can spend them and one with none gets `no_credits` and the paywall. **D16.** The per-task daily cap for `tts` is measured in characters from net credits spent today (`net credits * 1000 / 3`), so a partial refund frees cap. **D17.** The ledger rows of one debit carry `units` on the first row only. **D18.** An account with no `credit_account` row (the owner's account made before this cycle, or any account the trial hook missed) gets a Free account with 0 credits at its first reservation, so it meets the paywall until the owner comps credits.

---

### Task 36: Migration for credits, subscription and usage day

**Files:**
- Create: `lib/db/schema/credits.ts` (`creditAccount`, `creditLedger`), `lib/db/schema/subscription.ts`, `lib/db/scoped/subscription.ts`, `lib/db/scoped/credit-account.ts`, `lib/db/scoped/credit-ledger.ts`, `lib/db/migrations/NNNN_*.sql` (generated), `tests/helpers/ledger.ts`
- Modify: `lib/db/schema/hosted.ts` (`usageDay`), `lib/db/schema/index.ts`, `lib/db/scoped/index.ts` (`subscription`, `creditAccount`, `creditLedger` on `Scoped`)
- Test: `tests/integration/migrations.test.ts` (extend), `tests/integration/credits-scoped.test.ts`, `tests/integration/scoped-isolation.test.ts` (rows)

**Interfaces:**
- Consumes: `stripScopedKeys`, `schema.generation`, `Db`.
- Produces: `schema.subscription`, `schema.creditAccount`, `schema.creditLedger`, `schema.usageDay` exactly as the README Contract states, with check constraints (`allowance >= 0`, `bonus >= 0`, `delta <> 0`, the enum checks) and a partial unique index on (`user_id`, `ref`) where `ref` is not null. Scoped helpers: `subscriptionQueries`: `get()`, `insert(values)`, `update(values)`; `creditAccountQueries`: `get()`, `lockForUpdate()` (`SELECT ... FOR UPDATE` on the caller's row, null when none), `insert(values)`, `update(values)`; `creditLedgerQueries`: `insertMany(rows)`, `listRecent(limit)`, `listAll()`, `listByReservation(reservationId)`, `listByGeneration(generationId)`, `sumDeltas(): Promise<{ allowance: number; bonus: number }>`, `netToday(task: MeteredTask | null, dayStartUtc: Date): Promise<{ reservations: number; credits: number }>` (debit and refund rows since `dayStartUtc`, grouped by `reservation_id`, counting reservations whose net delta is below zero; decision D5), `listUsage(since: Date)`. Test helper `assertLedgerMatchesBalance(db: Db): Promise<void>`: for every `credit_account`, the sum of `delta` per bucket over its ledger rows equals `allowance` and `bonus`, and the newest row's `balance_after` equals their sum.

- [ ] **Step 1: Write the failing test**

```ts
// migrations: the four tables exist; creditAccount.allowance of -1 fails; creditLedger delta 0 fails; two ledger rows with the same (user_id, ref) fail, two with null ref pass;
//   subscription.plan "gold" fails; subscription.customer_id unique; usage_day.day is the primary key
// credits-scoped: lockForUpdate returns the caller's row only; insert ignores a smuggled userId; netToday counts a reservation of two debit rows once, ignores a fully refunded one (debit -6, refund +6 with the same reservation_id),
//   counts a half-refunded one, ignores rows before dayStartUtc, and filters by task when given; sumDeltas matches a hand-built set of rows
// isolation: B cannot read, lock, update or list A's subscription, credit account or ledger rows through any helper (rows in the isolation test)
// helper: assertLedgerMatchesBalance passes for a consistent set and throws, naming the user id, when one ledger row is removed (mutation check)
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/migrations.test.ts tests/integration/credits-scoped.test.ts tests/integration/scoped-isolation.test.ts`
Expected: FAIL, tables and helpers missing.

- [ ] **Step 3: Add the schema, the helpers and generate the migration**

`pnpm db:generate`, read the SQL, confirm it touches only the new tables. `balance_after`, `allowance`, `bonus`, `period_allowance` are integers. `generation_id` references `generation (id)` with set null. `usage_day` has no `user_id` and no scoped helper.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(db): credit account, ledger, subscription and usage day"
```

**Acceptance:** (1) Spec 4: columns, checks and unique ref per user. (2) Every owned table has a scoped file and an isolation row; `usage_day` has neither. (3) The invariant helper exists for every later test.

---

### Task 37: Plans, period math and trial state

**Files:**
- Create: `lib/billing/plans.ts`, `lib/credits/period.ts`, `lib/billing/state.ts`
- Test: `tests/unit/plans.test.ts`, `tests/unit/period.test.ts`, `tests/integration/billing-state.test.ts`

**Interfaces:**
- Consumes: `PLANS` shape in the README Contract, `Scoped`, `subscriptionQueries`, `creditAccountQueries`, `creditLedgerQueries`.
- Produces: `PLANS`, `PlanName = "trial" | "free" | "standard" | "plus"`, `TRIAL_DAYS = 14`, `MB`, `GB`; `trialPeriod(startedAt: Date): { start: Date; end: Date }`; `freePeriod(from: Date): { start: Date; end: Date }` (30 days); `utcDay(now: Date): string` (`YYYY-MM-DD`); `utcDayStart(now: Date): Date`; `effectivePlan(sub: SubscriptionRow | null, now: Date): PlanName` (no row: `free`; `trial` past `trial_ends_at`: `free`; `canceled` past `current_period_end`: `free`; `past_due` past `grace_ends_at`: `free`); `startTrial(db: Db, userId: string, now: Date): Promise<boolean>` in `lib/billing/state.ts` (one transaction: `subscription` plan `trial` status `trialing` `trial_ends_at` now plus 14 days; `credit_account` with allowance 100, `period_allowance` 100, new `period_id`, period `trialPeriod(now)`; one `grant` row, bucket `allowance`, delta 100, ref `trial:<userId>`, actor `system`, `balance_after` 100; returns false and writes nothing when the user already has a subscription).

- [ ] **Step 1: Write the failing test**

```ts
// plans: PLANS equals the README table: trial 0/100/40/250 MB, free 0/0/0/100 MB, standard 19/600/150/2 GB, plus 39/1800/400/5 GB (price, credits, dailyCap, storageBytes)
// period: trialPeriod(2026-11-01T10:00Z).end is 2026-11-15T10:00Z; freePeriod is 30 days; utcDay(2026-11-01T23:59:59Z) is "2026-11-01" and 00:00:00Z of the next day is "2026-11-02"
// effectivePlan: null -> free; trial before the end -> trial; trial one millisecond after -> free; canceled before period end -> its plan (standard) and after -> free; past_due with grace not over -> standard, over -> free
// startTrial: creates the three rows with the exact values; ledger sum equals balance (assertLedgerMatchesBalance); a second call returns false and the row counts stay 1/1/1; the ref "trial:<id>" is unique
// provider for a trial row with no payment provider: the column is NOT NULL, so startTrial writes the active billing provider's name when billing is on and "fake" otherwise (documented)
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/plans.test.ts tests/unit/period.test.ts tests/integration/billing-state.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement the constants and `startTrial`**

Every number sits in `plans.ts` and nowhere else (the owner changes placeholders in one file). `startTrial` goes through `lib/billing/state.ts`, the single writer of `subscription`, and writes ledger rows through `lib/credits/ledger.ts` (Task 38 creates it; build Task 38's `grant` first if you run the tasks in order, or implement `startTrial` with a call to `grantRows` that Task 38 exports). To keep the dependency one-way, this task adds the minimal `grant` function to `lib/credits/ledger.ts` with its test and Task 38 extends the file.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration/billing-state.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(billing): plans, period math, effective plan and trial start"
```

**Acceptance:** (1) Spec 5.8 table values in one file. (2) Spec 5.3 verifying transaction shape: subscription, credit account and one grant row with ref `trial:<user id>`. (3) The ledger invariant holds after `startTrial`.

---

### Task 38: Ledger writer and the global day guard

**Files:**
- Create or extend: `lib/credits/ledger.ts`, `lib/credits/global-day.ts`
- Test: `tests/integration/ledger.test.ts`, `tests/integration/global-day.test.ts`

**Interfaces:**
- Consumes: scoped helpers of Task 36, `utcDay`, `usageDay`.
- Produces in `ledger.ts` (the only writer of `credit_account` and `credit_ledger`): `ensureFreeAccount(s: Scoped, now: Date): Promise<CreditAccountRow>` (decision D18: free subscription row, account with 0 credits, `freePeriod(now)`); `grantCredits(s: Scoped, input: { bucket: "allowance" | "bonus"; amount: number; kind: "grant" | "comp" | "carry"; ref: string | null; actor: "system" | "billing" | "admin"; now: Date }): Promise<boolean>` (false when `ref` already exists for the user, nothing written); `debitCredits(s: Scoped, input: { task: MeteredTask; units?: number; generationId: string | null; reservationId: string; amount: number; now: Date }): Promise<{ rows: number }>` (allowance first, then bonus, one ledger row per bucket, `units` on the first row, account `period_id` on each row); `expireAllowance(s: Scoped, input: { ref: string | null; now: Date }): Promise<number>` (writes one `expire` row for the remaining allowance, returns the amount); `setPeriod(s, input: { start: Date; end: Date; allowance: number })` used by renewals and rolls. In `global-day.ts`: `takeFromGlobalDay(db: Db, input: { day: string; amount: number; cap: number }): Promise<boolean>` (one `INSERT ... ON CONFLICT (day) DO UPDATE SET credits = usage_day.credits + $amount WHERE usage_day.credits + $amount <= $cap RETURNING credits`; false at once when `amount > cap`), `returnToGlobalDay(db: Db, input: { day: string; amount: number }): Promise<void>` (never below 0), `claimCapAlert(db: Db, day: string): Promise<boolean>` (sets `alerted_at` once per day, true only for the first caller), `globalUsage(db: Db, day: string): Promise<number>`.

- [ ] **Step 1: Write the failing test**

```ts
// ledger: debit 10 from allowance 8 and bonus 5 -> two rows (allowance -8, bonus -2), allowance 0, bonus 3, balance_after 3 on the newest row, same reservation_id and period_id on both, units only on the first row
//   debit 3 from allowance 8 -> one row; a grant with ref "invoice:in_0001" twice returns true then false and the balance moves once; comp of 25 into bonus writes kind "comp"
//   expireAllowance with 40 left writes one "expire" row of -40 and leaves bonus alone; with 0 left writes nothing and returns 0
//   every case ends with assertLedgerMatchesBalance
//   ensureFreeAccount twice creates one subscription, one account, no ledger rows
// global-day: take 100 against cap 150 true, then 60 false (160 over cap) with the stored value still 100, then 50 true (150); amount above cap false on a fresh day and no row is created
//   returnToGlobalDay never goes below zero; four parallel takeFromGlobalDay of 40 against cap 100 give exactly two true; claimCapAlert returns true once per day and false after, true again on the next day
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/ledger.test.ts tests/integration/global-day.test.ts`
Expected: FAIL, functions missing.

- [ ] **Step 3: Implement the writer and the guard**

Each ledger function runs inside the caller's transaction and never opens one itself; the meter owns the transaction. `balance_after` is the account's allowance plus bonus after the row. `debitCredits` throws when the account balance cannot cover `amount` (the meter checks first; this is the last guard and a test proves it).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(credits): ledger writer and the global day guard"
```

**Acceptance:** (1) Spec 5.7: allowance first then bonus, one row per bucket touched, one `reservation_id`, `period_id` on each row, a `ref` unique per user. (2) The global guard is one statement (Core D4's pattern). (3) The ledger invariant holds in every case.

---

### Task 39: `dbMeter.reserve`

**Files:**
- Modify: `lib/credits/meter.ts` (`dbMeter()` with `reserve`; `refund` returns a not-yet-implemented failure until Task 40)
- Create: `tests/integration/credits-concurrency.pg.test.ts` (runs only when `JOBSMITH_PG_TEST_URL` is set)
- Test: `tests/integration/meter-reserve.test.ts`

**Interfaces:**
- Consumes: `scoped`, `ensureFreeAccount`, `debitCredits`, `takeFromGlobalDay`, `effectivePlan`, `PLANS`, `costOf`, `TASK_DAILY_CAPS`, `env().HOSTED.globalDailyCap`, `utcDay`, `utcDayStart`, `creditLedgerQueries.netToday`.
- Produces: `dbMeter().reserve(db, input)` implementing spec 5.7 in one transaction: lock the account row (`lockForUpdate`; D18 when absent), refuse `suspended` when `suspended_at` is set, refuse `cap_task_day` (for `tts` compare `netCredits * 1000 / 3 + units` to 120,000; for other tasks compare reservations today to the task cap, net of refunds), refuse `cap_day` when the plan's `dailyCap` is above 0 and net credits today plus the cost exceed it (D15), take the cost from the global day (`cap_global`), check the balance (`no_credits`), debit. Any refusal after the global take aborts the transaction so the global take is undone. A cost of 0 returns `ok({ reservationId, credits: 0 })` and writes nothing. The reservation id is `crypto.randomUUID()`.

- [ ] **Step 1: Write the failing test**

```ts
// meter-reserve (PGlite): account with allowance 10: reserve fit_brief (4) ok, balance 6; reserve tailored_cv (6) ok, balance 0; reserve score_fit (1) -> "no_credits" and the ledger and usage_day are unchanged
// order of refusals: a suspended account with a full balance -> "suspended" first; cap_task_day before cap_day before cap_global before no_credits (one case per pair)
// cap_task_day: question_bank cap 8: eight reservations then the ninth -> "cap_task_day"; a refunded reservation (debit then refund rows) does not count (D5)
// tts: units 1,000 costs 3; 119,000 characters already spent today (net credits 357) plus 2,000 -> "cap_task_day"; plus 1,000 -> ok
// cap_day: trial plan dailyCap 40: 40 credits spent today, one more credit -> "cap_day"; a free plan (dailyCap 0) is not capped by cap_day and with 0 balance gets "no_credits" (D15)
// cap_global: with the global cap 10 and 8 used, a reservation of 4 -> "cap_global" and nothing is written; with cap 10 and 6 used, 4 succeeds; a refusal for no_credits after the global take leaves usage_day unchanged (rollback)
// account missing -> a free account is created (D18) and the reservation fails "no_credits"; the new rows are subscription and credit_account only
// generationId is stored on every debit row; a reservation of cost 0 (tts with 0 units) writes nothing and returns credits 0
// two parallel reservations against a balance covering one: exactly one ok, the other "no_credits", ledger and balance consistent (assertLedgerMatchesBalance)
// pg concurrency test (real Postgres through pg, skipped without JOBSMITH_PG_TEST_URL): twenty parallel reserve calls of 6 credits against a balance of 60 -> exactly ten succeed and balance is 0;
//   fifty parallel calls of 1 against global cap 30 -> exactly 30 succeed; mutation check: remove FOR UPDATE and watch the first assertion fail (PGlite serializes transactions, so only this test can prove the lock)
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/meter-reserve.test.ts`
Expected: FAIL, `dbMeter` missing.

- [ ] **Step 3: Implement `reserve`**

Wrap the body in `db.transaction`; build `const s = scoped(tx, userId)`. Refusals before the global take simply return `fail`; refusals after it throw a private `Refusal` caught outside the transaction, which rolls everything back. Read the cap from `env().HOSTED?.globalDailyCap ?? DEFAULT_GLOBAL_DAILY_CAP` through an injectable `options` argument of `dbMeter(options?: { globalCap?: () => number; clock?: () => Date })` so tests control it.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/meter-reserve.test.ts && JOBSMITH_PG_TEST_URL=postgres://postgres:postgres@localhost:5432/jobsmith pnpm vitest run tests/integration/credits-concurrency.pg.test.ts && pnpm typecheck`
Expected: PASS (the pg test needs `docker compose up -d`; report whether it ran).

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(credits): reserve with account lock, caps and global guard"
```

**Acceptance:** (1) Spec 5.7 reservation order and error codes. (2) Two parallel reservations against a balance covering one: exactly one wins, on real Postgres too. (3) The global cap holds under parallel calls. (4) Review Focus 1.

---

### Task 40: `dbMeter.refund`, TTS settlement and the period roll

**Files:**
- Modify: `lib/credits/meter.ts` (`refund`), `lib/credits/ledger.ts` (`refundRows`, `rollPeriod`), `lib/billing/state.ts` (`endTrialIfDue`), `lib/credits/meter.ts` (`reserve` calls the roll first)
- Test: `tests/integration/meter-refund.test.ts`, `tests/integration/meter-roll.test.ts`

**Interfaces:**
- Consumes: Task 36 to 39 modules, `freePeriod`, `trialPeriod`, `effectivePlan`.
- Produces: `dbMeter().refund(db, input)`: finds the debit rows by `reservationId` (or by `generationId` through `listByGeneration`), subtracts rows already refunded, applies `keepCredits` (the credits actually used by a TTS batch), returns the bonus part first (the reverse of the debit order) and writes mirror rows (`kind: "refund"`, positive `delta`, same `reservation_id`, same bucket and the debit's `period_id`); when the account's `period_id` has moved on since the debit, the allowance part is written to `bonus` instead (never inflating a new allowance); takes the amount back off the global day of the debit; a second call returns `ok({ refunded: 0 })`; an unknown reservation returns `not_found`. `rollPeriodIfDue(s: Scoped, now: Date): Promise<void>` in `lib/credits/ledger.ts` and `endTrialIfDue(s: Scoped, now: Date): Promise<boolean>` in `lib/billing/state.ts`: when `period_end` has passed on a `trial` or `free` plan, a trial past `trial_ends_at` becomes plan `free`, status `none`, the remaining allowance is expired (`expire` row, ref `expire:<period_id>`), and a new free period starts with allowance 0 and a new `period_id`.

- [ ] **Step 1: Write the failing test**

```ts
// refund: debit 10 (allowance 8, bonus 2) then refund -> allowance +8 and bonus +2, mirror rows with the same reservation_id, bucket and period_id, balance back to the start; assertLedgerMatchesBalance passes
//   a second refund returns ok({ refunded: 0 }) and writes nothing; unknown reservation -> not_found; refund by generationId finds the same rows
//   usage_day: the debit's day loses the refunded credits; a refund after midnight takes them off the debit's day, not today's
// across a roll: debit 6 from allowance in period A, the period rolls (expire row, new period_id), refund -> the 6 go to bonus, allowance of the new period unchanged (Review Focus 2); the mirror row's bucket is "bonus"
// across a comp: debit 6, a comp of 20 lands in bonus, refund -> the allowance part still returns to allowance (period unchanged), the split comes from the rows, not a recomputation
// tts settle: reserve 5,000 characters (15 credits: allowance 10, bonus 5), 8 clips done (4,000 characters, keepCredits 12) -> refund 3, taken from bonus first (bonus +3), allowance untouched; keepCredits 0 refunds all 15; keepCredits 15 refunds 0
// roll: a trial account past period_end becomes free, allowance expired (expire row of the remaining 37), bonus kept, new period_id, freePeriod dates; a free account past period_end gets a new period and no rows besides the period change; a trial not yet due is untouched
//   reserve calls the roll first: a lapsed trial with allowance 37 and bonus 0 is refused "no_credits" after the roll
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/meter-refund.test.ts tests/integration/meter-roll.test.ts`
Expected: FAIL, refund and roll missing.

- [ ] **Step 3: Implement refund, the TTS rule and the roll**

The refund takes the reservation's debit rows grouped by bucket, subtracts the mirror rows already written, and spreads `(debited - keepCredits - alreadyRefunded)` over buckets bonus first. Cost if wrong, stated in the spec: a failed run across a period boundary leaves a few credits in `bonus` that never expire. Comments say why the split comes from the rows.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(credits): mirrored refunds, TTS settlement and the period roll"
```

**Acceptance:** (1) Spec 5.7 refund rules: mirror rows by reservation, bucket and period, allowance part to `bonus` after a roll, bonus first for TTS. (2) A double refund changes nothing. (3) Review Focus 2.

---

### Task 41: Trial grant at verification and `getMeter()`

**Files:**
- Modify: `lib/auth/after-verify.ts` (`afterVerified` calls `startTrial` when `features().credits`), `lib/credits/meter.ts` (`getMeter()` returns `dbMeter()` when `features().credits`, else `freeMeter`), `lib/hosted/features.ts` (no change expected)
- Test: `tests/integration/after-verify.test.ts`, `tests/unit/get-meter.test.ts`

**Interfaces:**
- Consumes: `startTrial`, `features()`, `afterVerified` from Task 6.
- Produces: `afterVerified(db, userId, now)` that, with credits on, creates the trial rows in the same call that marks the user verified; `getMeter()` as the Contract says, memoized.

- [ ] **Step 1: Write the failing test**

```ts
// afterVerified with credits on: subscription trial/trialing, credit account allowance 100, one grant row ref "trial:<id>"; run twice: still one of each
// afterVerified with credits off (HOSTED unset): writes nothing in any credit table
// the first account created through /setup (decision D6) also gets the trial through the same hook
// verifying through the real auth flow (outbox link, from Task 6's test setup) leaves the three rows
// getMeter: with HOSTED on returns an object that is not freeMeter and reserves against the database; with HOSTED unset returns freeMeter
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/after-verify.test.ts tests/unit/get-meter.test.ts`
Expected: FAIL, hook and switch missing.

- [ ] **Step 3: Wire the hook and the switch**

Keep `afterVerified` free of Better Auth imports so it stays unit-testable. The self-host path never imports the database meter at runtime: load `dbMeter` through a dynamic import inside the `credits` branch.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(credits): trial grant at verification, database meter when hosted"
```

**Acceptance:** (1) Spec 5.3: trial credits arrive only at verification (and for the setup account). (2) Spec 5.7: self-host uses `freeMeter`, no `credit_account` rows. (3) Generation from Milestone 13 now reserves through the database meter with no code change in `lib/generate`.

---

### Task 42: The meter in intake and fit scoring

**Files:**
- Modify: `lib/fit/deps.ts` (`FitDeps` gains `meter?: Meter`, `fitDeps()` passes `getMeter()`), `lib/fit/score-opportunity.ts` (`scoreOpportunity`), `lib/fit/readiness.ts` (`FitReadiness` gains `"out_of_credits"`, input gains `outOfCredits?: boolean`), `lib/fit/card.ts` (`FitCardView` gains `"out_of_credits"`), `lib/intake/add-job.ts` and `lib/intake/deps.ts` (`AddJobDeps` gains `meter?: Meter`; the call site of `extractPosting`), `lib/fit/test-posting.ts` (the preferences test box)
- Test: `tests/integration/fit-score-opportunity.test.ts` (extend), `tests/integration/intake-add-job.test.ts` (extend), `tests/integration/test-posting-action.test.ts` (extend), `tests/unit/fit-readiness.test.ts` (extend), `tests/unit/fit-card-model.test.ts` (extend)

**Interfaces:**
- Consumes: `Meter`, `freeMeter`, `s.db`, `MeterError`. Open `lib/intake/add-job.ts` and quote the real extraction call site in the report before editing.
- Produces: `scoreOpportunity` reserves `score_fit` before `scoreFit` and refunds when the outcome is `ai_failed`; a refused reservation settles `fit_status` `none` exactly like AI off (logged with the code), keeping any earlier score; `addJob` reserves `extract_posting` before `extractPosting` when a driver exists: a refusal behaves as the driver being null (extraction `ai_off`, company and role asked for, `needs_review` rules unchanged) and the result carries `aiRefusal: MeterError | null`; the call is refunded when the outcome status is `ai_failed` (not for `ai_incomplete`, the model answered); the test box reserves `score_fit` and refunds on failure. `fitReadiness` returns `out_of_credits` after the three existing checks when `outOfCredits` is true.

- [ ] **Step 1: Write the failing test**

```ts
// fit: with dbMeter and a balance of 1, scoring a job spends 1 credit and writes the score; with balance 0 the job ends fit_status "none", the fake driver is never called, no ledger row is written;
//   a failing driver ("Fit score: fail") refunds the credit and settles failed; an earlier good score survives a refused retry
//   with freeMeter (HOSTED unset) behavior is identical to today (the existing tests pass unchanged)
// intake: with balance 0 a pasted posting plus typed company and role still adds the job (driver never called, extraction "ai_off"), result.aiRefusal "no_credits";
//   with balance 1 extraction spends 1; ai_failed refunds; ai_incomplete keeps the charge
// test box: reserves score_fit and refunds on a failing driver; refused at zero shows the fit result as unavailable with the reason
// readiness: ("ai on, posting, resume, outOfCredits true") -> "out_of_credits"; the first three reasons still win in their order
// card model: view "out_of_credits" carries no score and renders the copy "Out of credits"
// every case ends with assertLedgerMatchesBalance
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/fit-score-opportunity.test.ts tests/integration/intake-add-job.test.ts tests/integration/test-posting-action.test.ts tests/unit/fit-readiness.test.ts tests/unit/fit-card-model.test.ts`
Expected: FAIL, meter not used.

- [ ] **Step 3: Wire the meter around the three call sites**

Reserve with `meter.reserve(s.db, { userId: s.userId, task, now })`, hold the reservation id in memory, refund with `meter.refund(s.db, { userId, ref: { reservationId }, now })` on failure. A missing `deps.meter` means `freeMeter`. Do not change any existing message. Out-of-credits detection for the card (`outOfCredits`) is computed by the page from the balance in Task 46; this task only adds the type and the pure rule.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(credits): meter around intake extraction, fit scoring and the test box"
```

**Acceptance:** (1) Spec 5.7: intake and fit reserve and settle around their existing calls; a refusal behaves as AI off (company and role by hand, `fit_status` `none`) with the reason. (2) A failed call is refunded. (3) With `freeMeter` nothing changes.

---

### Task 43: The meter in generation and onboarding

**Files:**
- Modify: `app/api/upload/resume/route.ts` and `lib/onboarding/draft.ts` (reserve `extract_resume` before the model call), `lib/generate/start.ts` (nothing in code unless a test shows a gap), `lib/generate/messages.ts` (final copy for the five meter errors, see Task 47)
- Test: `tests/integration/generate-metered.test.ts`, `tests/integration/upload-route-metered.test.ts`

**Interfaces:**
- Consumes: `getMeter`, `dbMeter`, `startGeneration`, `runGeneration`, `extractResume`.
- Produces: generation reserves `TASK_COSTS[task]` credits inside the `generation` insert transaction (already so through the seam), `generation.credits` holds the amount, a failed run refunds, a refusal writes no row; the upload route reserves `extract_resume` (3) before the call; a refusal or AI off creates the draft from code-extracted text with `reason: "no_credits"`; a failed call refunds.

- [ ] **Step 1: Write the failing test**

```ts
// generation (dbMeter, account with 10 credits): tailored_cv start spends 6, generation.credits is 6, ledger rows carry generation_id; the run succeeds and the balance stays 4;
//   a second tailored_cv start -> fail "no_credits", no generation row, balance 4 (the Done-when refusal); a fit_brief (4) still starts, balance 0
//   a failed run ("Fake fail: ai_timeout") refunds: balance back to 4 after the first CV; a stalled run settled by settleStalled refunds once
//   cap_task_day: the fifteenth cover letter in a day is fine, the sixteenth -> "cap_task_day" and no row
//   suspended account -> "suspended" and no row; global cap reached -> "cap_global"
//   parallel double click: the same request twice charges once (reused true)
//   assertLedgerMatchesBalance after every case
// upload: balance 3 -> the model call spends 3; balance 2 -> a draft with extractedText and reason "no_credits", the fake driver not called, ledger unchanged;
//   a failing driver refunds the 3
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/generate-metered.test.ts tests/integration/upload-route-metered.test.ts`
Expected: FAIL for the upload cases and any generation gap.

- [ ] **Step 3: Wire the upload route and fix any gap the generation tests show**

The upload route is request-bound: reserve before `extractResume`, refund on `ai_failed`. Keep the route's logging free of amounts that identify content.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app lib tests
git commit -m "feat(credits): meter generation and resume extraction end to end"
```

**Acceptance:** (1) The Done-when path: 10 credits write a CV, a second is refused, a fit brief still fits in the rest. (2) Spec 5.5: failures refund, refusals write no row. (3) The ledger invariant holds after every case.

---

### Task 44: The meter in TTS batches

**Files:**
- Modify: the in-app "Prepare audio" batch action and its planner call (from `2026-11-21-jobsmith-prep` milestone 07; open `lib/audio/segments.ts` and the hub's server action and name them in the report), `lib/audio/segments.ts` if the settle belongs there
- Test: `tests/integration/tts-metered.test.ts`

**Blocked on:** a TTS provider key (the `gemini` driver the price assumes) for the live check only. The test uses Prep's `fake` TTS driver.

**Interfaces:**
- Consumes: `Meter`, `costOf("tts", chars)`, Prep's `planSegments` output (missing hashes with text) and `TtsDriver`.
- Produces: the batch action reserves `costOf("tts", plannedChars)` through `meter.reserve(db, { userId, task: "tts", units: plannedChars, now })` before synthesizing, and afterwards calls `meter.refund(db, { userId, ref: { reservationId }, keepCredits: costOf("tts", doneChars), now })`; a refusal returns the batch result `{ refused: MeterError }` and the hub falls back to browser voices (Task 47 renders it). The CLI path (`jobsmith audio` through the bridge) is unmetered; its bytes count toward storage in Task 45. Skip this task without Prep.

- [ ] **Step 1: Write the failing test**

```ts
// 10 planned segments of 500 characters (5,000 characters, 15 credits) with 8 done by the fake driver and 2 failed: reserve 15, refund 3 (4,000 characters done = 12 credits kept); ledger invariant holds
// a refusal at zero credits: no segment is synthesized, the result says refused "no_credits"; the browser-voice fallback is untouched
// the daily tts cap: 120,001 characters of net spend today -> "cap_task_day"
// the CLI upload endpoint spends no credits (balance unchanged after an upload through the bridge handler)
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/tts-metered.test.ts`
Expected: FAIL, batch not metered.

- [ ] **Step 3: Meter the batch**

Settle in a `finally` so a thrown synthesis error still refunds the unused part. Never log the spoken text.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib app tests
git commit -m "feat(credits): meter the in-app audio batches"
```

**Acceptance:** (1) Spec 5.7: reserve for planned characters, refund the reserve minus `ceil(doneChars * 3 / 1000)`, bonus first. (2) `jobsmith audio` costs no credits. (3) Browser voices stay free at zero.

---

### Task 45: Storage quota

**Files:**
- Create: `lib/quota/storage.ts`, `lib/quota/messages.ts`
- Modify: `lib/db/scoped/artifact.ts` (`sumBodyBytes(): Promise<number>` using `sum(octet_length(body_md))`), `lib/db/scoped/asset.ts` (from Prep milestone 07: `sumBytes()`; skip without Prep), `lib/bridge/handlers.ts` (push), `lib/artifacts/paste.ts` (paste), `lib/generate/start.ts` (generation start), the Prep audio upload handler and in-app segment write (skip without Prep)
- Test: `tests/unit/storage-quota.test.ts`, `tests/integration/storage-quota.test.ts`

**Interfaces:**
- Consumes: `effectivePlan`, `PLANS`, `features().storageQuota`, `s.subscription`, `bridgeError` shape from `lib/bridge/http.ts`.
- Produces: `storageUsed(s: Scoped): Promise<number>` (artifact body bytes plus asset bytes when the table exists); `checkStorageQuota(s: Scoped, input: { addBytes: number | null; now: Date }): Promise<Result<{ used: number; limit: number }, "quota_storage">>` (always ok when `features().storageQuota` is false; `addBytes` null means size unknown, so the write is refused only when `used >= limit`; known sizes are refused when `used + addBytes > limit`). Writes that add bytes (push, paste, audio, generation) return `quota_storage`; reading, deleting and export are never checked. `QUOTA_MESSAGE`: "You have used all of your storage. Delete documents or audio, or upgrade your plan." Bridge push answers its error envelope with code `quota_storage` and status 403 (extend the envelope's code union after reading `lib/bridge/http.ts`).

- [ ] **Step 1: Write the failing test**

```ts
// used: three artifacts of 1,000, 2,000 and 3,000 bytes (multi-byte text counts octets) -> 6,000; with an asset of 4,000 bytes (Prep) -> 10,000
// limits: trial 250 MB, free 100 MB, standard 2 GB, plus 5 GB through effectivePlan; a lapsed trial uses the free limit
// check: used 99.9 MB of 100 MB on free with addBytes 200 KB -> quota_storage; with 50 KB -> ok; addBytes null with used below the limit -> ok, at or above -> quota_storage
// HOSTED unset: always ok and the database is never queried (assert no query)
// integration: a push over quota answers 403 with code quota_storage and writes nothing; a paste likewise; generation start -> fail "quota_storage" with no row and no reservation;
//   export, reading a document and deleting one still work at 100 percent usage
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/storage-quota.test.ts tests/integration/storage-quota.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement and wire the checks**

Add the check as the first step of each write path, before any lock. Manual in-place edits are not checked (spec 5.8 lists push, paste, audio and generation). Name the real asset write sites in the report.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(quota): per-plan storage quota on writes that add bytes"
```

**Acceptance:** (1) Spec 5.8: byte count definition, per-plan limits, only writes that add bytes refuse. (2) With `HOSTED` unset there is no quota and no extra query. (3) Reading, deleting and export are unchecked.

---

### Task 46: Registry pieces, account menu balance, Settings Plan and Usage

**Files:**
- Create: `components/super-ai/credits.tsx`, `components/super-ai/quota.tsx`, `components/super-ai/paywall.tsx` (registry items `credits`, `quota`, `paywall`, installed with `shadcn add`), `lib/credits/balance.ts`, `lib/credits/usage.ts`, `components/settings/plan-section.tsx`, `components/settings/usage-section.tsx`
- Modify: `components/super-ai/account-menu.tsx` (optional `balance` prop, recorded under "Local changes" in `docs/design-system.md`), `components/app-shell.tsx` (passes the balance), `app/(app)/layout.tsx` (loads the balance when `features().credits`), `app/(app)/settings/page.tsx` (Plan and credits, Usage), `docs/design-system.md`
- Test: `tests/unit/credits-balance.test.ts`, `tests/unit/usage-lines.test.ts`, `tests/unit/plan-section.test.tsx`, `tests/integration/credits-usage.test.ts`

**Interfaces:**
- Consumes: `effectivePlan`, `PLANS`, `s.creditAccount`, `s.creditLedger.listUsage`, `storageUsed`, `netToday`, `LocalTime`, `features()`.
- Produces: `getBalance(s: Scoped, now: Date): Promise<Balance | null>` with `Balance = { allowance: number; bonus: number; periodAllowance: number; periodEnd: Date | null; plan: PlanName; suspended: boolean }` (null when credits are off); `balanceTone(b: Balance): "normal" | "warning"` (warning below 20 percent of `periodAllowance`); `usageLines(s: Scoped, now: Date): Promise<{ at: Date; text: string; credits: number }[]>` (last 30 days of ledger rows in words, for example "Tailored CV, Product Designer at Northwind Traders, 6 credits"; refunds shown as "Refund: Tailored CV, Product Designer at Northwind Traders, 6 credits"; grants and comps as "Trial credits, 100 credits", "Added by support, 25 credits"); Settings sections: Plan and credits (plan name, status, period, the `credits` piece "412 of 600 left" with the bonus line, `quota` pieces for today's per-task caps and for storage, "Upgrade" or "Manage billing" only when `features().billing`), Usage.

- [ ] **Step 1: Write the failing test**

```ts
// balance: allowance 412, periodAllowance 600 -> remaining 412 (allowance) and bonus shown separately; tone "normal"; allowance 100 of 600 -> "warning" (below 20 percent); credits off -> null
// usageLines: a debit row for a tailored_cv generation on the Product Designer job at Northwind Traders reads "Tailored CV, Product Designer at Northwind Traders, 6 credits";
//   a refund row reads "Refund: ..." with the same words; a trial grant reads "Trial credits, 100 credits"; a comp reads "Added by support, 25 credits"; rows older than 30 days are omitted; newest first
//   a row whose generation or job was deleted reads the task name and "a removed job"
// plan section: renders "412 of 600 left", the bonus line, one quota piece per task with its cap, a storage quota piece, and no Upgrade or Manage billing button while billing is off
// account menu: shows a balance line "412 credits" and switches to the warning tone; with no balance prop it renders exactly as before (existing snapshot test passes)
// axe: covered in Task 50
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/credits-balance.test.ts tests/unit/usage-lines.test.ts tests/unit/plan-section.test.tsx tests/integration/credits-usage.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Install the pieces and build the sections**

`pnpm dlx shadcn add https://super-ai-components.vercel.app/r/credits.json` and the same for `quota` and `paywall`; list them in the installed items of `docs/design-system.md`. If a registry item has a different API than the one described here, adapt the wrapper, never the vendored file, and note it. The account menu change is a small local edit: add it under "Local changes" with the reason.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run && pnpm typecheck && pnpm check:tokens`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components lib app docs tests
git commit -m "feat(credits): balance in the account menu, plan and usage sections"
```

**Acceptance:** (1) Spec 5.14: Plan and credits and Usage sections with the words for ledger rows. (2) Spec 5.7: the menu switches to its warning tone below 20 percent of the period's allowance. (3) `docs/design-system.md` lists `credits`, `quota`, `paywall` and the menu change.

---

### Task 47: Zero-credit and refusal states

**Files:**
- Create: `components/credits/cost-line.tsx`, `components/credits/refusal-notice.tsx`
- Modify: `lib/generate/messages.ts` (final copy for `no_credits`, `cap_task_day`, `cap_day`, `cap_global`, `suspended`, `quota_storage`), `components/generate/write-dialog.tsx` (fills the `costLine` slot, swaps the primary button for the `paywall` piece at zero), `components/board/add-job-dialog.tsx` (shows the credit reason when `aiRefusal` is set), `components/fit/fit-card.tsx` and `components/fit/fit-result.tsx` ("Out of credits"), `app/(app)/jobs/[slug]/page.tsx` (computes `outOfCredits` for the fit card), the Prep hub's "Prepare audio" control (browser voices when refused; from Prep milestone 07, skip without Prep), `components/onboarding/review-step.tsx` (one line when `reason` is `no_credits`)
- Test: `tests/unit/cost-line.test.tsx`, `tests/unit/refusal-copy.test.ts`, `tests/unit/write-dialog.test.tsx` (extend), `tests/unit/fit-card.test.tsx` (extend), `tests/unit/add-job-dialog.test.tsx` (extend)

**Interfaces:**
- Consumes: `getBalance`, `PLANS`, `effectivePlan`, `paywall` piece, `costOf`, `START_MESSAGES`.
- Produces: `costLineText(input: { credits: number; remaining: number }): string` returning exactly "6 credits, 412 left" (singular "1 credit, 4 left"); paywall copy: "Upgrade" on `trial` and `free`; "Credits renew on 14 Nov" on a paid plan (date through `LocalTime`) with Plus offered on Standard; `cap_global`: "Writing is paused for everyone until 00:00 UTC"; `refusalMessage(code: MeterError | "quota_storage"): string` for the rest (own plain sentences: `suspended` points to the contact address from `LEGAL_CONTACT_EMAIL` through a prop, `cap_task_day` names "today", `cap_day` names the plan's daily limit, `quota_storage` is `QUOTA_MESSAGE`).

- [ ] **Step 1: Write the failing test**

```ts
// costLineText({ credits: 6, remaining: 412 }) -> "6 credits, 412 left"; ({ credits: 1, remaining: 4 }) -> "1 credit, 4 left"
// write dialog: with balance 4 and cost 6 the primary button is replaced by the paywall piece; on trial it reads "Upgrade", on standard "Credits renew on 14 Nov"; announces the refusal through the live region
// fit card with outOfCredits true shows "Out of credits" and no retry button; fit card with credits ok is unchanged
// add job dialog: aiRefusal "no_credits" shows the line that company and role are typed by hand because credits ran out; the job can still be added (the board and job page work at zero, spec principle 13)
// cap_global copy equals "Writing is paused for everyone until 00:00 UTC" character for character; no refusal copy contains an exclamation mark
// the board, job page, paste, manual add, export and delete render and work with balance 0 (component-level assertions that none of them reads the meter)
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/cost-line.test.tsx tests/unit/refusal-copy.test.ts tests/unit/write-dialog.test.tsx tests/unit/fit-card.test.tsx tests/unit/add-job-dialog.test.tsx`
Expected: FAIL, components and copy missing.

- [ ] **Step 3: Build the states**

The server components compute `remaining` and `outOfCredits` once per page from `getBalance` and pass them down. Never hide the board's own buttons: only buttons that need a model or a voice change. Keep every string in `lib/generate/messages.ts` or `components/credits/*` so Task 50 can test them as a set.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run && pnpm typecheck && pnpm check:tokens`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components lib app tests
git commit -m "feat(credits): cost lines, paywall and refusal states"
```

**Acceptance:** (1) Spec 5.7 zero-credit states: paywall in the dialog, intake asks for company and role, fit cards say "Out of credits", the hub plays browser voices. (2) Spec principle 13: everything without a model works at zero. (3) The exact strings match the Contract.

---

### Task 48: Admin

**Files:**
- Create: `lib/admin/require-admin.ts`, `lib/admin/queries.ts`, `lib/admin/actions.ts`, `lib/credits/suspension.ts`, `app/(app)/admin/page.tsx`, `app/(app)/admin/users/page.tsx`, `app/(app)/admin/users/[id]/page.tsx`, `app/(app)/admin/actions.ts`, `components/admin/*`
- Modify: `lib/bridge/handlers.ts` (push refuses a suspended account), `app/api/upload/resume/route.ts` (upload refuses a suspended account), `lib/artifacts/paste.ts` (paste), `components/app-shell.tsx` (an "Admin" nav entry for admins only)
- Test: `tests/unit/admin-no-content.test.ts`, `tests/integration/admin-queries.test.ts`, `tests/integration/admin-actions.test.ts`, `tests/integration/suspension.test.ts`

**Interfaces:**
- Consumes: `requireUser`, `features().admin`, `env().HOSTED.adminEmails`, `grantCredits`, `schema.adminAction`, `schema.user`, `schema.profile`, `schema.deletionJob`, `schema.generation`, `schema.creditLedger`, `usageDay`, `globalUsage`.
- Produces: `requireAdmin(): Promise<User>` (`requireUser()`, then a verified address, then the lower-cased address in `adminEmails`; otherwise `notFound()`); queries `overview(db, now)` (sign-ups per day for 30 days with the verified share, active trials, paid subscribers per plan, credits spent today against the global cap and this month per task, failed generations today per error code, pending and failed deletion jobs), `searchUsers(db, term: string, limit: number)`, `userDetail(db, userId)` (the last 50 ledger rows and the last 50 generations' metadata: task, status, credits, model, tokens, duration); actions `compCreditsAction({ userId, amount, reason, note })` (1 to 1,000 into `bonus`, reason in the enum, note at most 200 characters; writes `admin_action` and a `comp` ledger row with ref `admin:<action id>` and actor `admin`), `suspendAction({ userId, reason })`, `unsuspendAction({ userId })` (each writes `admin_action`); `assertNotSuspended(s: Scoped): Promise<Result<null, "suspended">>` in `lib/credits/suspension.ts`. A suspended account keeps sign-in, reading, export and delete and loses metered calls (the meter already refuses), uploads and bridge writes.

- [ ] **Step 1: Write the failing test**

```ts
// requireAdmin: a non-admin, an unverified admin address and a signed-out visitor all get notFound (404); an admin address in different case passes; with HOSTED unset the pages 404 and the nav entry is absent
// no-content test (unit): read every file under lib/admin and fail when any of these appear: body_md, resume_md, posting_md, notes_md, outcome_md, bodyMd, resumeMd, postingMd, notesMd, outcomeMd, or the property access generation.output / generation.output column;
//   mutation check: add `bodyMd: schema.artifact.bodyMd` to a query and watch it fail
// queries (PGlite, seeded users): sign-ups per day returns 30 entries with the verified share; credits today equal the sum of today's net debits; per-task month totals; failed generations grouped by code; deletion jobs pending and failed counted
//   userDetail returns at most 50 ledger rows and 50 generation rows, neither with text fields (assert the key sets)
// actions: comp 25 writes an admin_action, a comp ledger row ref "admin:<id>", bonus +25, balance and ledger consistent; amount 0, 1001, a note of 201 characters and a bad reason are refused;
//   suspend sets suspended_at and the reason, writes admin_action; reserve then fails "suspended"; unsuspend clears it; every action needs requireAdmin (a non-admin call is refused and writes nothing)
// suspension: a suspended account's bridge push and resume upload and paste are refused with code "suspended"; sign-in, reading a document, export and delete still work
// deleting an admin sets admin_action.admin_user_id to null; deleting the target removes their admin_action rows (the cascade the spec states)
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/admin-no-content.test.ts tests/integration/admin-queries.test.ts tests/integration/admin-actions.test.ts tests/integration/suspension.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement the admin module and the pages**

The admin queries read across users, so they take a `Db` and select only aggregates and metadata columns by name (never `select()` of a whole row). Admin pages are plain tables on the shared layout with the `section-header` and `table-view` pieces already installed. Each page and action calls `requireAdmin()` and `features().admin`; `lib/admin` functions re-check admin status through a `requireAdminId` argument so a route is never the only check (spec 7).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run && pnpm typecheck && pnpm check:tokens`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib app components tests
git commit -m "feat(admin): owner-only overview, users, comp and suspend"
```

**Acceptance:** (1) Spec 5.11: env allowlist, verified address, comp 1 to 1,000 into `bonus` with a reason and note, suspend and unsuspend with a reason, every action logged. (2) Admin shows no user content, proven by the unit test and its mutation check. (3) Suspension blocks metered calls, uploads and bridge writes and nothing else.

---

### Task 49: Export additions and the credit tick steps

**Files:**
- Modify: `lib/export/collect.ts` (adds `subscription`, `creditLedger`, `generations`; `EXPORT_VERSION` goes up by one from its value on `main`), `lib/db/scoped/generation.ts` (`listAll()`), `lib/jobs/steps.ts` (new steps), `lib/jobs/tick.ts` (runs them), `lib/jobs/cross-user.ts` (new: the only cross-user reads of owned tables for the tick, with a comment saying why)
- Test: `tests/integration/export.test.ts` (extend), `tests/integration/tick-credits.test.ts`

**Interfaces:**
- Consumes: `collectExport`, `settleStalled`, `clearExpiredDrafts`, `claimCapAlert`, `globalUsage`, `getEmailDriver`, `renderEmail`, `env().HOSTED`.
- Produces: export keys `subscription` (plan, status, period and trial dates, `cancelAtPeriodEnd`; no provider ids), `creditLedger` (every column except `userId`), `generations` (metadata: task, status, credits, model id, tokens, ms, error code, warnings, times, `artifactKey`, `retryOf`; never `output` and never `inputs` text) and the version bump; tick steps `settleStalledGenerations` (rows running over 6 minutes, across users, through `settleStalled` per user), `clearOldDrafts` (extract_resume output older than 24 hours), `compareLedgers` (50 accounts per run, newest `credit_account.updated_at` first; logs `[credits] credits_mismatch` with the user id and both numbers on a difference and returns the count), `sendGlobalCapAlert` (usage at or above 80 percent of the cap and `claimCapAlert` true: `global_cap_alert` to each admin address).

- [ ] **Step 1: Write the failing test**

```ts
// export: version is one higher than before; subscription has no customer_id or subscription_id; creditLedger rows have no userId; generations have no output and no inputs;
//   an account with none of the three still exports empty values (null subscription, empty lists); self-host export (HOSTED unset) has the same keys with empty values
// tick: a running generation of another user older than 6 minutes is failed and refunded; a draft older than 24 hours is cleared; at most 50 per step;
//   compareLedgers logs credits_mismatch for an account whose balance was edited by hand and returns 1, returns 0 for consistent accounts;
//   the cap alert sends one email per admin once per day: usage at 79 percent sends none, at 80 percent sends, a second tick the same day sends none, the next day sends again
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/export.test.ts tests/integration/tick-credits.test.ts`
Expected: FAIL, keys and steps missing.

- [ ] **Step 3: Extend the export and the tick**

The new tick steps are listed in `runTick`'s result by name so the tick response shows counts. `lib/jobs/cross-user.ts` exports `listStalledRunning(db, cutoff, limit)` and `listExpiredDrafts(db, cutoff, limit)` returning ids and user ids only.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(export): subscription, ledger and generation metadata; credit tick steps"
```

**Acceptance:** (1) Spec 5.14: export additions with the version up by one and no provider ids or drafts. (2) Spec 5.13: stalled settle, draft clearing, ledger comparison and the cap alert, each bounded to 50. (3) The cross-user reads sit in one named file.

---

### Task 50: End to end, docs and ship

**Files:**
- Create: `tests/e2e-hosted/credits.spec.ts`, `tests/e2e-hosted/admin.spec.ts`, `tests/e2e-hosted/credits-phone.spec.ts`, `tests/e2e-hosted/db.ts` (a `pg` helper: `spendDownTo(email, credits)` writes a consistent debit row and updates the account; `suspendedFor(email)` is not needed, the admin spec uses the UI)
- Modify: `.github/workflows/ci.yml` (the `e2e` job sets `JOBSMITH_PG_TEST_URL` and runs `pnpm vitest run tests/integration/credits-concurrency.pg.test.ts`), `playwright.hosted.config.ts`, `README.md` ("Credits and plans" section: placeholders, fair use, what keeps working at zero), `docs/design-system.md`, `.env.example` (`CREDITS_GLOBAL_DAILY_CAP`)
- Test: the specs

**Blocked on:** the Vercel preview and an AI key for the real-model check, and a TTS key for the live audio check. The specs run on the `fake` drivers.

**Interfaces:**
- Consumes: Tasks 36 to 49. `spendDownTo` inserts a `debit` row with task `score_fit` for the difference, adjusts `allowance`, and keeps `balance_after` right, so `assertLedgerMatchesBalance` still holds.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

```ts
// credits.spec.ts (hosted projects): sign up and verify a user, run spendDownTo(email, 10): the account menu shows 10 credits and the Plan and credits section shows "10 of 100 left"
//   Documents tab: "Write CV" dialog shows "6 credits, 10 left"; write it; balance 4; "Write CV" again: the dialog shows the paywall piece with "Upgrade" and the primary button is gone; live region announces the refusal
//   with 4 credits a fit brief (4) still writes; then balance 0: Add job by hand still works; Prep hub plays a bank with browser voices (needs Prep; the speechSynthesis call is observed through a stub)
//   a failed run (posting with "Fake fail: ai_timeout") refunds: the balance before and after are equal and the Usage section lists the refund row in words
//   Usage section lines read like "Tailored CV, Product Designer at Northwind Traders, 6 credits"
//   pay path is Milestone 15; this spec ends at the paywall
// admin.spec.ts (the owner account from first-run is in ADMIN_EMAILS): /admin shows sign-ups and today's credits; /admin/users finds the stranger by email; detail shows ledger rows and generation metadata and no resume text (assert the page text contains no line of the resume fixture);
//   Comp credits 25 with reason "beta" -> balance +25; Suspend with reason "abuse" -> the stranger's Write dialog shows the suspended message, push is refused, reading and export still work; Unsuspend restores;
//   a non-admin visiting /admin gets the 404 page
// axe zero violations in light and dark on /settings (Plan and credits, Usage), the paywall state of the Write dialog, /admin, /admin/users and the user detail page; keyboard-only: reach the paywall button and the comp form
// phone (390px): account menu balance, Plan and credits and the paywall state fit with no horizontal scroll
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test:e2e:hosted --project=hosted-chromium --grep "credits|admin"`
Expected: FAIL until the milestone is complete.

- [ ] **Step 3: Write the specs, the CI step and the docs**

The README section says in plain words: plans and prices are placeholders the operator edits in `lib/billing/plans.ts` and `lib/credits/costs.ts`, one credit is about one US cent of provider cost, and a self-hosted instance never meters.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm test:e2e:hosted && JOBSMITH_PG_TEST_URL=postgres://postgres:postgres@localhost:5432/jobsmith pnpm vitest run tests/integration/credits-concurrency.pg.test.ts`
Expected: PASS. Preview check: on the preview, run the Done-when path by hand with a real key (spend down through the admin page by writing documents until 10 credits remain), then comp and suspend through `/admin`. Check Chrome and Safari desktop and phone width. Report the preview link and what was not run.

- [ ] **Step 5: Commit**

```bash
git add tests .github playwright.hosted.config.ts README.md docs .env.example
git commit -m "test(hosted): milestone 14 end to end, CI and docs"
```

**Acceptance:** (1) The Done-when sentence holds in `credits.spec.ts` on Chromium and WebKit, including the refusal by the paywall and the refund. (2) The ledger sum equals the balance for every account in the integration suite (the helper runs in every credits test). (3) Axe zero in light and dark on every new route. (4) The Core and Prep suites still pass with `HOSTED` unset.
