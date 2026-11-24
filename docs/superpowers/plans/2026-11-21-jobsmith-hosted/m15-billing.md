# Milestone 15: Billing

> "In Stripe test mode, a trial user buys Standard and gets 600 credits, an upgrade grants 1,200 at once, a failed renewal shows grace and then drops to Free, replaying every webhook changes nothing, and deleting a paid account cancels its subscription."

Branch: `feat/m15-billing`, cut from `main` after Milestone 14 merged. Read `README.md` first.

**Before starting:**

```bash
test -f lib/billing/state.ts && test -f lib/billing/plans.ts && test -f lib/credits/meter.ts && echo m14-ok
test -f lib/account/delete.ts && echo m11-delete-ok
grep -n "api/jobs/tick" proxy.ts | head -2
```

Milestones 11 and 14 must be merged. Every task runs in CI on the `fake` billing driver and on recorded Stripe payloads. The Stripe account, products, prices, webhook secret and Customer Portal setup are the owner's; the README Needs list says which tasks wait on them and only for the live check.

---

### Task 51: `BillingDriver`, events and the fake driver

**Files:**
- Create: `lib/billing/driver.ts`, `lib/billing/config.ts`, `lib/billing/fake.ts`, `lib/billing/fake-store.ts`, `lib/billing/index.ts`, `tests/helpers/billing.ts`
- Modify: `lib/env.ts` (`Env.BILLING: BillingConfig | null`; invalid names join the error list), `.env.example`
- Test: `tests/unit/billing-config.test.ts`, `tests/unit/billing-fake.test.ts`

**Interfaces:**
- Consumes: `Result`, `fakeDriversAllowed` (Task 1), `appLink` (Task 3).
- Produces: `BillingEvent`, `ProviderSubscription`, `BillingDriver`, `WEBHOOK_TOLERANCE_SECONDS`, `WEBHOOK_MAX_BYTES`, `GRACE_DAYS`, `BILLING_EVENT_RETENTION_DAYS` exactly as in the README Contract; `BillingConfig = { provider: "stripe"; secretKey: string; webhookSecret: string; priceStandard: string; pricePlus: string } | { provider: "fake"; webhookSecret: string; dir: string }`; `parseBillingConfig(source, options: { strict: boolean }): { ok: true; config: BillingConfig | null } | { ok: false; invalid: string[] }` (unset or blank `BILLING_PROVIDER` is off; `stripe` needs the four variables of the Contract; `fake` is refused when strict; fake directory from `BILLING_FAKE_DIR`, default `.jobsmith/billing`, secret from `STRIPE_WEBHOOK_SECRET` or the constant `FAKE_WEBHOOK_SECRET = "fake-billing-webhook-secret"`); `createFakeBillingDriver(options: { store: FakeBillingStore; config: { webhookSecret: string }; now?: () => Date }): BillingDriver` with a file-backed store in `fake-store.ts` (state must survive separate route bundles) and an in-memory store for unit tests; `signFakeEvent(event: BillingEvent, secret: string, now: Date): { body: string; headers: Headers }` (header `x-fake-signature: t=<unix seconds>,v1=<hex hmac-sha256 over "<t>.<body>">`, the scheme Stripe uses); `getBillingDriver(): BillingDriver | null` (null when billing is off; `lib/billing` is never imported when it is off, so callers load it through `await import()` behind `features().billing`).

- [ ] **Step 1: Write the failing test**

```ts
// config: unset -> null; "stripe" without STRIPE_SECRET_KEY -> invalid names include it, and likewise STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_STANDARD, STRIPE_PRICE_PLUS; "other" -> ["BILLING_PROVIDER"];
//   "fake" when strict -> ["BILLING_PROVIDER"]; "fake" when allowed -> config with the default secret and directory
// fake driver (memory store): createCheckout returns a url under APP_URL "/dev/billing/checkout?session=<id>" and a customerId "cus_fake_<hex>", and reuses the given customerId;
//   verifyWebhook accepts a body signed by signFakeEvent, returns the same BillingEvent; a changed body -> fail "bad_signature"; a signature 301 seconds old -> "bad_signature"; 299 seconds old passes;
//   a missing header -> "bad_signature"; a body of an unknown type -> fail "unsupported"
//   getSubscription returns null for an unknown id and the stored subscription after the store holds one; cancelNow marks it canceled; deleteCustomer makes customerExists false; customerExists true for a created customer
// the file store: two driver instances over the same directory see each other's writes
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/billing-config.test.ts tests/unit/billing-fake.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement the interface, the config and the fake driver**

The fake driver exists for development, tests and the hosted end-to-end suite; it refuses to load when `fakeDriversAllowed` is false. The `BillingEvent` union is the app's own: nothing outside `lib/billing/stripe.ts` ever sees a Stripe type. The test helpers in `tests/helpers/billing.ts` build a memory store, a driver and a signed event in one call.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests .env.example
git commit -m "feat(billing): driver interface, events and the fake driver"
```

**Acceptance:** (1) Spec 3 and 5.8: one `BillingDriver` with `stripe` and `fake`, picked by `BILLING_PROVIDER`, off when unset. (2) The fake signs and verifies with the same 300-second tolerance as the real one. (3) With billing off nothing under `lib/billing` loads.

---

### Task 52: Stripe driver

**Files:**
- Create: `lib/billing/stripe.ts`, `docs/billing-notes.md`, `tests/fixtures/stripe/*.json` (recorded-shape payloads written from the docs, fictional ids), `tests/live/stripe-test-mode.test.ts`
- Modify: `lib/billing/index.ts` (builds the Stripe driver), `package.json` (`stripe`)
- Test: `tests/unit/billing-stripe.test.ts`

**Blocked on:** a Stripe account in test mode, its two Prices and a webhook secret, for `tests/live/stripe-test-mode.test.ts` only (runs with `JOBSMITH_LIVE_STRIPE=1`). Everything else uses an injected client object and the fixtures.

**Interfaces:**
- Consumes: `BillingDriver`, `BillingConfig`, `WEBHOOK_TOLERANCE_SECONDS`.
- Produces: `createStripeDriver(options: { client: StripeLike; config: Extract<BillingConfig, { provider: "stripe" }> }): BillingDriver` where `StripeLike` is the small subset of the SDK the driver calls (customers create and retrieve and delete, checkout sessions create, billing portal sessions create, subscriptions retrieve and cancel, webhooks `constructEvent`), so tests pass an object literal; the Stripe SDK is imported only in `lib/billing/stripe.ts`. Event mapping: `checkout.session.completed` to `checkout_completed` (user id from `client_reference_id`, else `metadata.userId`, else null), `customer.subscription.created` and `.updated` to `subscription_changed`, `customer.subscription.deleted` to `subscription_ended`, `invoice.paid` to `invoice_paid` (with the invoice id), `invoice.payment_failed` to `invoice_failed`; any other type returns `unsupported`. `getSubscription` maps the price id to `standard` or `plus` through the config and returns null for an unknown id.

- [ ] **Step 1: Write the failing test**

```ts
// mapping: each of the six fixture payloads maps to the event named above with the ids and the created time in seconds converted to a Date; an unlisted type (charge.succeeded) -> fail "unsupported"
// verifyWebhook: calls client.webhooks.constructEvent with the raw body, the signature header, the secret and the 300-second tolerance (assert the call); a thrown signature error -> fail "bad_signature"
// createCheckout: with customerId null it creates a customer with the email and metadata.userId, then a session with mode "subscription", client_reference_id = the user id, the plan's price id,
//   success_url and cancel_url exactly as given, and returns { url, customerId }; with a customerId it creates no customer; a client error -> fail "billing_error"
// createPortal passes customer and return_url; cancelNow cancels immediately; deleteCustomer deletes; customerExists is false for a deleted customer and for a "resource_missing" error, true otherwise
// getSubscription: price id equal to priceStandard -> plan "standard", pricePlus -> "plus"; status values map (trialing, active, past_due, canceled; incomplete and unpaid map to past_due); period dates are Dates; cancel_at_period_end carried; unknown price -> null
// no live card data or key-like literal appears in any fixture (the secret is built as "k".repeat(24) in tests)
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/billing-stripe.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Confirm the API against current docs, then implement**

Before code: read Stripe's current documentation and the installed SDK types and write `docs/billing-notes.md`: the exact API version the SDK pins, where the subscription period dates live in that version (they moved from the subscription to its items in a recent API version), the Checkout Session parameters used, the Customer Portal configuration the owner must set (payment method, invoices, plan change with the downgrade at period end, cancel), the tax setting (a constant `USE_STRIPE_TAX` at the top of `stripe.ts`, owner decision, assumption 3 of the spec), and the comparison with Better Auth's Stripe plugin (it keeps its own subscription table and grant logic, and grants here belong to the ledger, so Jobsmith keeps its own small driver), recording the choice. `pnpm add stripe`; record the version. `createCheckout` sets `billing_address_collection` and tax collection only as the notes say. No Stripe script loads on any Jobsmith page; Checkout is Stripe's own hosted page.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit && pnpm typecheck`
Expected: PASS (the live test is skipped without `JOBSMITH_LIVE_STRIPE=1`).

- [ ] **Step 5: Commit**

```bash
git add lib docs tests package.json pnpm-lock.yaml
git commit -m "feat(billing): Stripe driver behind the BillingDriver interface"
```

**Acceptance:** (1) Spec 5.8: the Stripe SDK is imported only inside this driver; the six event types map as stated. (2) `docs/billing-notes.md` records the API facts, the portal settings and the plugin comparison. (3) The package version is in the report.

---

### Task 53: `billing_event`, the webhook handler and the route

**Files:**
- Create: `lib/billing/webhook.ts`, `app/api/billing/webhook/route.ts`, `lib/db/migrations/NNNN_*.sql` (generated)
- Modify: `lib/db/schema/hosted.ts` (`billingEvent`), `proxy.ts` (matcher excludes `api/billing/webhook`)
- Test: `tests/integration/billing-webhook.test.ts`, `tests/unit/proxy-matcher.test.ts` (extend), `tests/integration/migrations.test.ts` (extend)

**Interfaces:**
- Consumes: `BillingDriver`, `signFakeEvent`, `applyBillingEvent` (Task 54 provides the body; this task calls it through the interface below and ships with a stub that records), `schema.billingEvent`, `getBillingDriver`.
- Produces: `schema.billingEvent` per the Contract (unique on `provider` and `event_id`); `handleWebhook(db: Db, driver: BillingDriver, input: { rawBody: string; headers: Headers }, deps: { now: () => Date; apply: ApplyEvent }): Promise<{ status: 200 | 401 | 413 | 500 }>` where `ApplyEvent = (tx: Db, event: BillingEvent, provider: ProviderSubscription | null, now: Date) => Promise<{ outcome: "applied" | "ignored" | "unknown_customer"; userId: string | null }>`; `POST /api/billing/webhook` reads the raw body (1 MB cap answered 413), 404 when billing is off, 401 for a missing or bad signature, 200 for an event already stored, an unsupported type or an unknown customer, 500 on a processing error (the transaction rolled back, so the provider retries). The route reads no session cookie.

- [ ] **Step 1: Write the failing test**

```ts
// 401: no signature header, a bad one, and a stale one each answer 401 and write no row
// the same signed event twice: first applies once, second answers 200 and the apply function is not called again (one billing_event row)
// out of order: deliver subscription_ended then subscription_changed for one subscription whose provider state is "active": the final mirrored state is the provider's (active), proving the handler mirrors Stripe's current state instead of the event order
// unknown customer: a subscription event whose customer has no subscription row -> outcome "unknown_customer" stored, answer 200, nothing else written
// processing error: an apply that throws -> 500 and no billing_event row (rolled back), a later retry of the same event succeeds
// unsupported type -> 200 and no row
// body over 1,000,000 bytes -> 413 before verification
// no cookie: calling the route handler with a signed event and no Cookie header gets the handler's own 401 or 200, and the exported config.matcher does not match "/api/billing/webhook" (no redirect to /login); mutation check: remove the matcher exclusion and watch the matcher test fail
// billing off (no driver): the route answers 404
// migration: billing_event exists, unique (provider, event_id), outcome check rejects "bogus"
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/billing-webhook.test.ts tests/unit/proxy-matcher.test.ts tests/integration/migrations.test.ts`
Expected: FAIL, module and table missing.

- [ ] **Step 3: Implement the handler, the route and the matcher change**

Order in `handleWebhook`: size check, `driver.verifyWebhook`, an early lookup of an existing event row (200 if present), fetch the provider subscription for subscription events outside the transaction (a read), then one transaction that inserts `billing_event` with `ON CONFLICT DO NOTHING` (a conflict means a concurrent delivery already won: answer 200) and calls `apply`. The matcher comment in `proxy.ts` explains why the path is excluded, as the bridge's does (the proxy would buffer the raw body the signature covers). Only the outcome and ids are stored, never the payload.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib app proxy.ts tests
git commit -m "feat(billing): idempotent webhook route, event table and proxy exclusion"
```

**Acceptance:** (1) Spec 5.8: 300-second tolerance, 1 MB cap, event ids stored with `ON CONFLICT DO NOTHING`, 401 own, 500 for provider retry, unknown customer 200. (2) The proxy exclusion is proven by test with no cookie. (3) Review Focus 3.

---

### Task 54: Subscription transitions

**Files:**
- Modify: `lib/billing/state.ts` (adds the functions below), `lib/credits/ledger.ts` (`carryToBonus`, `renewAllowance`), `lib/credits/ledger.ts` `rollPeriodIfDue` (also calls `endLapsedIfDue`), `lib/billing/webhook.ts` wiring (`applyBillingEvent` is passed as `apply`)
- Test: `tests/integration/billing-transitions.test.ts`, `tests/integration/billing-state.test.ts` (extend)

**Interfaces:**
- Consumes: `BillingEvent`, `ProviderSubscription`, `PLANS`, `GRACE_DAYS`, ledger functions of Task 38, `startTrial`, `endTrialIfDue`, `effectivePlan`.
- Produces in `lib/billing/state.ts` (the single writer of `subscription`): `applyBillingEvent(tx: Db, event: BillingEvent, provider: ProviderSubscription | null, now: Date): Promise<{ outcome: "applied" | "ignored" | "unknown_customer"; userId: string | null }>` implementing spec 5.8, and `endLapsedIfDue(s: Scoped, now: Date): Promise<boolean>` (grace over while `past_due`, or a `canceled` plan past `current_period_end`: plan `free`, status `none`, allowance expired, `bonus` and data stay, a free period starts). Rules, each a test case:
  1. `checkout_completed` for a user on `trial` or `free`: sets plan, status, customer and subscription ids, period dates and `cancel_at_period_end` from the provider state; unused allowance moves to `bonus` (two `carry` rows, the allowance side with no ref, the bonus side with ref `change:<event id>`); no credits are granted yet.
  2. `invoice_paid`: expires the remaining allowance (an `expire` row), grants the plan's credits (`grant`, bucket `allowance`, ref `invoice:<invoice id>`), starts the period from the provider's dates with a new `period_id` and `period_allowance`; clears `past_due` and `grace_ends_at`. The first paid invoice and a renewal behave the same.
  3. Upgrade (`subscription_changed`, provider plan ranks above the stored plan, status active): sets the plan at once and grants the difference (Standard to Plus: 1,200) into `allowance` with ref `change:<event id>`; `period_allowance` rises by the same amount.
  4. Downgrade or any change with the same rank: mirrors plan and flags, changes no credits; the next renewal invoice grants the new plan's allowance (Plus to Standard: 600).
  5. `invoice_failed`: status `past_due`, `grace_ends_at` is now plus 7 days when not already set, allowance stays usable and is not renewed.
  6. `subscription_ended`: status `canceled`; the plan stays until `current_period_end`, then `endLapsedIfDue` moves it to `free`.
  7. An event or provider price for an unknown plan: outcome `ignored`, logged with the code only.
  8. Events for a user with no subscription row and no `client_reference_id`: `unknown_customer`.

- [ ] **Step 1: Write the failing test**

```ts
// a table of cases, one per rule above, each starting from a seeded account and ending with assertLedgerMatchesBalance:
// 1: trial with 37 allowance left -> bonus +37, allowance 0, plan standard, two carry rows; trial with 0 left -> no carry rows
// 2: first invoice grants 600 and renewal expires the old remainder: allowance 120 left then renewal -> expire -120 then grant +600, balance allowance 600, bonus untouched; same invoice id twice grants once (ref unique)
// 3: standard with allowance 500 upgrades to plus -> plan plus, allowance 1,700, period_allowance 1,800, one ref "change:<event id>" row of +1,200; the same event again changes nothing
// 4: plus to standard mid period -> plan standard, allowance unchanged; the next invoice grants 600
// 5: invoice_failed sets past_due and grace_ends_at = now + 7 days; a second failure keeps the first grace date; the allowance can still be spent (reserve succeeds); an invoice_paid afterwards clears both
// 6: subscription_ended with the period end in the future keeps plan standard; at the period end endLapsedIfDue sets free, expires the allowance, keeps bonus
// grace over: past_due with grace_ends_at in the past -> endLapsedIfDue sets free; before it -> no change
// 7 and 8 as stated; all rules are idempotent per event id
// the meter's lazy roll calls endLapsedIfDue: reserving on a lapsed paid account is refused "no_credits" when only allowance (now expired) remained
// webhook wiring: the handler of Task 53 with the real apply passes its table of cases end to end through signed fake events
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/billing-transitions.test.ts`
Expected: FAIL, functions missing.

- [ ] **Step 3: Implement `applyBillingEvent` and the lapse rule**

Each case locks the user's `credit_account` row first (`lockForUpdate`) so a webhook and a reservation cannot interleave. The user is found through `subscription.customer_id`, or, for `checkout_completed`, through the event's user id. Keep all plan numbers in `plans.ts`. Do not store payloads.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(billing): checkout, renewal, upgrade, grace and lapse transitions"
```

**Acceptance:** (1) Spec 5.8 transitions as a table of cases, including upgrade grants 1,200 at once and a downgrade waits for renewal. (2) Grants carry a unique `ref`, so replays change nothing. (3) The ledger invariant holds after every case.

---

### Task 55: Checkout, portal, pricing and the return page

**Files:**
- Create: `lib/billing/checkout.ts`, `app/(public)/pricing/page.tsx`, `app/(public)/pricing/actions.ts`, `app/(app)/settings/plan/page.tsx`, `app/(app)/settings/plan/actions.ts`, `components/billing/plan-cards.tsx`, `components/billing/return-poller.tsx`, `app/dev/billing/checkout/page.tsx`, `app/dev/billing/checkout/actions.ts`, `lib/billing/messages.ts`
- Modify: `proxy.ts` (`/dev/billing/checkout` is behind the session like the app, no change needed unless Task 7 listed it as public; `/pricing` already public), `components/settings/plan-section.tsx` (Upgrade and Manage billing buttons, shown when `features().billing`)
- Test: `tests/integration/billing-checkout.test.ts`, `tests/unit/plan-cards.test.tsx`, `tests/unit/return-poller.test.tsx`, `tests/integration/fake-checkout.test.ts`

**Interfaces:**
- Consumes: `getBillingDriver`, `PLANS`, `effectivePlan`, `appLink`, `signFakeEvent`, `requireUser`, `features()`, `fakeDriversAllowed`.
- Produces: `startCheckout(db: Db, input: { userId: string; email: string; plan: "standard" | "plus" }, deps: { driver: BillingDriver; now: () => Date }): Promise<Result<{ url: string }, "already_subscribed" | "billing_unavailable">>` (creates the customer on first use through the driver, stores `customer_id` on the `subscription` row at once so the webhook can find it, success URL `appLink("/settings/plan", { checkout: "done" })`, cancel URL `appLink("/pricing")`; an active paid subscription is refused with `already_subscribed`, since plan changes go through the portal); `openPortal(db, input: { userId: string }, deps): Promise<Result<{ url: string }, "no_customer" | "billing_unavailable">>` (return URL `appLink("/settings/plan")`); `startCheckoutAction(plan)` and `openPortalAction()` calling `requireUser()` first (a signed-out visitor on `/pricing` has buttons that link to `/signup`). `/pricing` shows the four plans from `PLANS` (names, prices, credits, storage; "Free" and the 14-day trial described, all placeholders). `/settings/plan?checkout=done` polls the `subscription` row every 3 seconds for 60 seconds and shows "Confirming with Stripe" until a webhook has applied the change, then the new plan; after 60 seconds it says "Your plan will update as soon as Stripe confirms." The return page grants nothing. Outage copy: `BILLING_UNAVAILABLE = "Checkout is unavailable right now. Try again in a minute."` The fake checkout page `/dev/billing/checkout?session=<id>` has the buttons "Pay" and "Fail payment"; each posts events signed with the test secret to `/api/billing/webhook` (Pay: `checkout_completed` then `invoice_paid`; Fail payment: `invoice_failed`), and is `notFound()` unless the active driver is `fake` and `fakeDriversAllowed` is true. With billing off `/pricing`, `/settings/plan`, the webhook and the fake checkout answer 404 and `lib/billing` is never imported.

- [ ] **Step 1: Write the failing test**

```ts
// startCheckout: a trial user gets a url from the fake driver and the subscription row now holds customer_id; a user on an active standard plan -> fail "already_subscribed"; a driver error -> fail "billing_unavailable"
//   the checkout input carries successUrl ending "/settings/plan?checkout=done" and cancelUrl ending "/pricing", built from APP_URL (assert no Host header input exists)
// openPortal: no customer id -> "no_customer"; with one returns the fake portal url
// pricing page: lists trial, free, standard and plus with the numbers from PLANS (no hard-coded numbers in the component: change PLANS in the test and the page changes); signed out the buttons link to /signup; signed in they post startCheckoutAction
// return page (fake timers): shows "Confirming with Stripe" while the plan is unchanged, polls every 3000 ms, stops after 60 seconds with the "will update" sentence, and shows the new plan once the row changes
// fake checkout: Pay posts a signed event to the webhook route handler and the subscription row becomes standard with 600 credits after the webhook applies; Fail payment makes status past_due; both routes 404 when fake drivers are not allowed or billing is off
// no Stripe script tag appears on any rendered page (assert the pricing and plan pages' HTML has no "js.stripe.com")
// a click on "Upgrade" in Settings calls startCheckoutAction once; "Manage billing" calls openPortalAction once; both are absent while billing is off
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/billing-checkout.test.ts tests/unit/plan-cards.test.tsx tests/unit/return-poller.test.tsx tests/integration/fake-checkout.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement checkout, portal and the pages**

Server actions return the URL and the client navigates with `window.location.assign`, so Stripe's page is a plain navigation (no script, no content security policy change). The return poller is a client component that calls a small server action `readPlanAction()` every 3 seconds. The fake checkout page posts with `fetch` from a server action, to the same route and verification as the real webhook.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run && pnpm typecheck && pnpm check:tokens`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib app components tests
git commit -m "feat(billing): checkout, portal, pricing, return page and fake checkout"
```

**Acceptance:** (1) Spec 5.8: checkout from `/pricing` and Settings, `client_reference_id` set through the driver, the return page grants nothing and polls for 60 seconds, no Stripe script on any page. (2) The fake checkout exists only in development and test builds. (3) With billing off the four routes 404.

---

### Task 56: Billing tick steps, emails and the payment banner

**Files:**
- Create: `components/billing/payment-banner.tsx`, `lib/billing/emails.ts`
- Modify: `lib/jobs/steps.ts` (new steps), `lib/jobs/tick.ts`, `lib/jobs/cross-user.ts` (`listTrialsEndingBetween`, `listDueTrials`, `listDueLapses`), `lib/billing/webhook.ts` (sends `payment_failed` after the commit), `app/(app)/layout.tsx` (banner), `app/(app)/settings/plan/actions.ts` (reuse `openPortalAction`)
- Test: `tests/integration/tick-billing.test.ts`, `tests/unit/payment-banner.test.tsx`

**Interfaces:**
- Consumes: `endTrialIfDue`, `endLapsedIfDue`, `takeToken`, `getEmailDriver`, `renderEmail`, `appLink`, `BILLING_EVENT_RETENTION_DAYS`, `GRACE_DAYS`.
- Produces: tick steps `endExpiredTrials` (trials past `trial_ends_at`, plan becomes `free`), `endLapsedPlans` (grace over, or canceled past the period end), `sendTrialEnding` (3 days before `trial_ends_at`, once per user: `takeToken` key `trial-ending:<userId>`, window 14 days, max 1; template `trial_ending` with `endsOn` and `pricingUrl`), `purgeBillingEvents` (rows older than 90 days), each bounded to 50 per run; `sendPaymentFailed(deps, userId, graceEndsOn)` (template `payment_failed` with `portalUrl: appLink("/settings/plan")`, sent after the webhook transaction commits and never inside it); the banner: when `subscription.status` is `past_due` and grace has not ended: "Your last payment did not go through. Update your card by {date} to keep your plan." with the button "Update card" (opens the portal); `{date}` through `LocalTime`.

- [ ] **Step 1: Write the failing test**

```ts
// endExpiredTrials: a trial ended yesterday becomes free with its allowance expired and bonus kept; one ending tomorrow is untouched; at most 50 per run
// endLapsedPlans: past_due with grace over -> free; canceled with period end passed -> free; before those moments nothing
// sendTrialEnding: at 3 days and 1 hour before the end sends one trial_ending email; the same tick again sends none (token); a user on a paid plan gets none; with no email driver nothing happens and nothing throws
// purgeBillingEvents: a 91-day-old event is deleted, an 89-day-old one stays
// sendPaymentFailed: the webhook handler sends it only after its transaction committed (a throwing apply sends nothing); the message holds the grace date and a link to /settings/plan
// banner: renders only for past_due inside grace with the exact text and the "Update card" button; absent for active, trialing, free and after grace
// the tick response lists each of these steps with a count
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/tick-billing.test.ts tests/unit/payment-banner.test.tsx`
Expected: FAIL, steps and banner missing.

- [ ] **Step 3: Add the steps, the email send and the banner**

The cross-user listings return ids only. `sendTrialEnding` looks for trials whose end falls within the next 3 days; the token key makes each user's mail once-only across ticks and lazy runs. Emails and logs carry no address in log lines.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run && pnpm typecheck && pnpm check:tokens`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib components app tests
git commit -m "feat(billing): trial and grace tick steps, payment emails and banner"
```

**Acceptance:** (1) Spec 5.8 and 5.13: trial end, grace end and lapse steps, `trial_ending` 3 days before, `billing_event` rows deleted after 90 days, each bounded to 50. (2) A failed payment shows the banner with "Update card". (3) Emails go out after commit only.

---

### Task 57: Billing in account deletion

**Files:**
- Create: `lib/account/deps.ts` (`deletionDeps(): DeletionDeps` wiring `storage` (from `lib/storage` when it exists, else null), `billing: getBillingDriver()`, `email: getEmailDriver()`, `now`)
- Modify: `lib/account/delete.ts` (no signature change; make sure the billing branch is exercised), `app/(app)/settings/account-actions.ts` and `lib/jobs/tick.ts` (use `deletionDeps()`), `components/settings/delete-account-dialog.tsx` (paid-plan sentence driven by `effectivePlan`)
- Test: `tests/integration/account-delete-billing.test.ts`

**Interfaces:**
- Consumes: `runDeletion`, `verifyDeletion`, `BillingDeletionPort`, the fake driver and its store, `effectivePlan`.
- Produces: `deletionDeps()` as above. Behavior: for an account with a `subscription_id` the deletion cancels the subscription immediately and deletes the Stripe customer before the `user` row goes; the verifier asks `customerExists`; the dialog shows "Your subscription ends now, with no refund for the rest of the period." only when `effectivePlan` is `standard` or `plus`.

- [ ] **Step 1: Write the failing test**

```ts
// paid account (fake store holds customer and subscription): runDeletion cancels the subscription (store shows canceled), deletes the customer, removes every row and object, and the job ends "verified" with customer_id cleared (Done-when: deleting a paid account cancels its subscription)
// billing failure on cancelNow (driver returns billing_error): the job ends "failed" with error_code set, found.customer true, the user row is not deleted before billing succeeded; a retry through the tick with a healthy driver finishes "verified"
// the verifier reports found.customer true when the customer still exists after the steps ran (driver stub that ignores deleteCustomer) and the job is "failed"
// a trial or free account with no customer skips billing calls entirely (spy: zero calls)
// self-host (billing off): billing is null and deletion works as in Milestone 11
// dialog: the paid sentence appears for standard and plus, never for trial or free
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/account-delete-billing.test.ts`
Expected: FAIL, wiring missing.

- [ ] **Step 3: Wire the billing port**

Billing must act before the user row is deleted: order in `runDeletion` is billing, storage, verification rows, user row. Confirm the order in Task 12's code and fix it if needed, with a test.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib app components tests
git commit -m "feat(account): cancel the subscription and delete the customer on account deletion"
```

**Acceptance:** (1) Spec 5.10 step 2: cancel at once, delete the Stripe customer, verified by `customerExists`. (2) A billing failure leaves the job `failed`, retried by the tick. (3) Review Focus 5 for a paid account.

---

### Task 58: Launch checklist and hosted docs

**Files:**
- Create: `docs/launch-checklist.md`, `tests/unit/launch-docs.test.ts`
- Modify: `README.md` (a full "Hosted mode" section: the switch, every variable, fake drivers for development, the tick, fair use, what the owner configures), `.env.example` (every variable of the Contract once, commented, grouped)
- Test: `tests/unit/launch-docs.test.ts`

**Interfaces:**
- Consumes: the README Contract variable list, Task 4's tracking finding, Task 52's `docs/billing-notes.md`.
- Produces: a checklist with one line per item, each naming who does it and how to check it. Required items (the test asserts each heading text appears): "Zero data retention confirmed for both models" (run one real call per model through the gateway with the retention option and read the provider's confirmation; the writing model is `AI_MODEL_WRITE`, the other `AI_MODEL`), "Legal text reviewed" (privacy and terms read by the owner or a lawyer, `TERMS_VERSION` set to the real effective date, `LEGAL_OPERATOR`, `LEGAL_CONTACT_EMAIL`, `LEGAL_HOSTING` set), "Live Stripe keys" (live secret key, live webhook secret, live Prices, webhook endpoint pointed at `/api/billing/webhook`, Customer Portal configured as `docs/billing-notes.md` says, the tax decision), "Global cap set" (`CREDITS_GLOBAL_DAILY_CAP` chosen, the 80 percent alert reaches the admins), "Email domain" (Resend sending domain verified, `EMAIL_FROM`, open and click tracking off), "Storage" (private Blob store, `STORAGE_PROVIDER`), "Cron" (a 15-minute `CRON_SECRET` tick on the owner's Vercel plan, or lazy-only on a daily plan), "Admin and invite" (`ADMIN_EMAILS`, `SIGNUP_INVITE_CODE`), "No fake drivers in production" (`JOBSMITH_ALLOW_FAKE_DRIVERS` unset; a strict boot passes), "Placeholders reviewed" (plans, prices, credits and caps in `lib/billing/plans.ts` and `lib/credits/costs.ts` confirmed or changed), "Refund process" (refunds are made in the Stripe dashboard, credits comped in admin), "Secret scan" (the CI gitleaks job is green on `main`).

- [ ] **Step 1: Write the failing test**

```ts
// launch-docs: docs/launch-checklist.md contains each required heading above (exact text) and each required variable name from the Contract list
// .env.example contains every variable name from the Contract list exactly once as an assignment or a commented assignment, and JOBSMITH_ALLOW_FAKE_DRIVERS is marked test only
// README has a "Hosted mode" heading and mentions HOSTED, the demo exclusion, and that a self-hosted copy never configures Stripe or an email provider
// no file in docs/ or the README contains a live key shape (the repo's secret scan pattern, run as a regex over these files)
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/launch-docs.test.ts`
Expected: FAIL, checklist missing.

- [ ] **Step 3: Write the checklist and the docs**

Plain words, one action per line. Each item says what proves it done. The README section is the one place the owner reads to run a hosted copy.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/launch-docs.test.ts && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add docs README.md .env.example tests
git commit -m "docs(hosted): launch checklist, hosted README section and env example"
```

**Acceptance:** (1) The milestone 15 scope: the checklist names zero data retention for both models, legal review, live keys and the global cap. (2) `.env.example` lists every variable once. (3) A test fails when an item is dropped.

---

### Task 59: End to end, Stripe test mode and ship

**Files:**
- Create: `tests/e2e-hosted/billing.spec.ts`, `tests/e2e-hosted/billing-phone.spec.ts`, `tests/e2e-hosted/billing.ts` (helpers: `fakeUpgrade(email, plan)`, `fakeFailRenewal(email)`, `fakeRenew(email)`, `expireGrace(email)` through `pg`, `replayAll()`), `tests/live/stripe-trigger.test.ts`
- Modify: `playwright.hosted.config.ts` (adds `BILLING_PROVIDER=fake` to the server and the specs to the projects), `README.md`, `docs/design-system.md`
- Test: the specs

**Blocked on:** a Stripe account in test mode, the Stripe CLI and the webhook secret, for `tests/live/stripe-trigger.test.ts` only (`JOBSMITH_LIVE_STRIPE=1`), and the Vercel preview for the preview check. The specs run on the `fake` driver in CI.

**Interfaces:**
- Consumes: Tasks 51 to 58, `spendDownTo` from Task 50's `tests/e2e-hosted/db.ts`, the tick route with the e2e `CRON_SECRET`.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

```ts
// billing.spec.ts (hosted projects): a verified trial user with spendDownTo(email, 0):
//   /pricing signed in -> "Standard" checkout -> the fake page -> "Pay" -> back on /settings/plan?checkout=done shows "Confirming with Stripe" then the plan "Standard" and the Plan section reads "600 of 600 left"; the account menu shows 600 credits
//   upgrade: fakeUpgrade(email, "plus") -> the balance rises by 1,200 at once ("1,800 of 1,800 left" when none were spent); the plan reads Plus
//   renewal: fakeRenew(email) after spending 100 -> allowance returns to the plan amount and the old remainder is gone
//   failed renewal: fakeFailRenewal(email) -> the banner "Your last payment did not go through. Update your card by ..." with "Update card"; metered calls still work during grace; expireGrace(email) then a tick call -> plan Free, allowance 0, a Write attempt shows the paywall "Upgrade"
//   replay: replayAll() re-posts every webhook body captured during the spec (the helper records them) -> balance, plan and ledger row count unchanged
//   a webhook posted with no signature header gets 401 and no redirect; with a stale signature 401
//   delete a paid account: the account section's dialog shows "Your subscription ends now, with no refund for the rest of the period."; after confirming, sign-in fails, the fake store shows the subscription canceled and the customer gone, and the tick response shows the deletion job verified
//   carry: a trial user with 37 credits left who pays gets 37 in bonus plus 600 in allowance ("637" in the account menu) and the ledger shows the carry
// axe zero violations in light and dark on /pricing (signed out and in), /settings/plan, the return page, the payment banner state and the fake checkout page; keyboard-only: pricing to Pay
// phone (390px): pricing cards and the plan section fit with no horizontal scroll
// live (JOBSMITH_LIVE_STRIPE=1, test keys): `stripe trigger checkout.session.completed`, `customer.subscription.updated`, `invoice.paid`, `invoice.payment_failed` posted to the app through `stripe listen --forward-to`
//   produce billing_event rows with outcome applied or unknown_customer and answer 200 each time; replaying one with `stripe events resend` changes nothing
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test:e2e:hosted --project=hosted-chromium --grep billing`
Expected: FAIL until the milestone is complete.

- [ ] **Step 3: Write the specs and the README additions**

The README adds the Stripe test-mode recipe: create the account, the two Prices, the portal settings from `docs/billing-notes.md`, `stripe listen --forward-to http://localhost:3000/api/billing/webhook`, set the four variables, run the live test. Nothing in the repo holds a key.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm test:e2e:hosted && JOBSMITH_PG_TEST_URL=postgres://postgres:postgres@localhost:5432/jobsmith pnpm vitest run tests/integration/credits-concurrency.pg.test.ts`
Expected: PASS. Live and preview checks: with a Stripe test account, buy Standard on the preview, upgrade through the portal, fail a renewal with a test card that declines, wait for or force the grace end, replay events with the Stripe CLI, delete the paid account and read the deletion job as `verified` and the customer gone in the Stripe dashboard. Check Chrome and Safari. Report the preview link and, plainly, every live step not run.

- [ ] **Step 5: Commit**

```bash
git add tests playwright.hosted.config.ts README.md docs
git commit -m "test(hosted): milestone 15 end to end, Stripe test mode and docs"
```

**Acceptance:** (1) The Done-when sentence holds on the fake driver in CI (buy Standard and get 600, upgrade grants 1,200, failed renewal shows grace then Free, replay changes nothing, deleting a paid account cancels its subscription) and in Stripe test mode when the account exists. (2) Axe zero in light and dark on every new route. (3) The Core and Prep suites pass with `HOSTED` unset. (4) The launch checklist is current.
