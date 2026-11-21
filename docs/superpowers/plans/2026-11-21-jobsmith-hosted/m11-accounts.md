# Milestone 11: Accounts

> "On the preview, a stranger signs up, verifies from the email, signs in, resets the password and deletes the account, and the deletion job reads verified; the Core suite passes with `HOSTED` unset."

Branch: `feat/m11-accounts`, cut from `main`. Read `README.md` first: the Contract there is binding.

**Before starting** (run from the repo root):

```bash
test -f lib/auth/index.ts && test -f lib/demo/create.ts && test -f proxy.ts && echo core-ok
test -f lib/storage/driver.ts && echo prep-storage-ok || echo "prep milestone 07 absent: skip Task 11, use storage: null in Task 12"
git log --oneline -1 main
```

Core must be on `main`. `lib/storage` comes from Prep milestone 07 (`2026-11-21-jobsmith-prep`). Without it Task 11 is skipped, `STORAGE_REQUIRED_WHEN_HOSTED` in Task 1 is set to `false`, and the account deletes without the storage steps. No other task needs Prep.

---

### Task 1: Hosted config, boot validation and `features()`

**Files:**
- Create: `lib/hosted/config.ts`, `lib/hosted/features.ts`
- Modify: `lib/env.ts` (`rawEnvSchema` stays; `Env` gains `HOSTED: HostedConfig | null` and `CRON_SECRET: string | undefined`; `parseEnv` joins the hosted `invalid` names into the `EnvError` list), `.env.example` (every variable from the README Contract with a comment)
- Test: `tests/unit/hosted-config.test.ts`, `tests/unit/features.test.ts`, `tests/unit/env.test.ts` (extend)

**Interfaces:**
- Consumes: `parseAiConfig` shape in `lib/ai/config.ts` (`{ ok: true; config } | { ok: false; invalid }`), `EnvError`, `Env`.
- Produces: `HostedConfig`, `parseHostedConfig`, `missingForHostedBoot`, `fakeDriversAllowed(source): boolean`, `STORAGE_REQUIRED_WHEN_HOSTED: boolean`, `Features`, `features()` exactly as in the README Contract. `fakeDriversAllowed` is `source.VERCEL_ENV !== "production" && (source.NODE_ENV !== "production" || source.JOBSMITH_ALLOW_FAKE_DRIVERS === "true")`; `strict` is its negation.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/hosted-config.test.ts, a table of cases
// HOSTED unset, "" and "  " -> { ok: true, config: null }
// HOSTED "true" -> config with adminEmails [], globalDailyCap 20000
// HOSTED "yes" and "TRUE" -> { ok: false, invalid: ["HOSTED"] }
// ADMIN_EMAILS " Owner@Northwind.example , second@northwind.example " -> ["owner@northwind.example", "second@northwind.example"]
// CREDITS_GLOBAL_DAILY_CAP "5000" -> 5000; "0", "abc", "-4" -> invalid ["CREDITS_GLOBAL_DAILY_CAP"]
// HOSTED "true" with DEMO_MODE "true" -> invalid ["DEMO_MODE"]
// missingForHostedBoot, strict (NODE_ENV production, no allow flag): empty source returns every name in the README list in order;
//   a full set returns []; CRON_SECRET of 31 characters is reported, 32 is not; EMAIL_PROVIDER "fake" is reported; BILLING_PROVIDER "fake" is reported;
//   AI_PROVIDER "fake" is reported; STORAGE_PROVIDER "local" is reported
// missingForHostedBoot, NODE_ENV "test" or "development": always []
// VERCEL_ENV "production" with JOBSMITH_ALLOW_FAKE_DRIVERS "true": fakeDriversAllowed false
// features(): HOSTED off -> every flag false except passwordReset (true only when EMAIL_PROVIDER is set); HOSTED on -> hosted, publicSignup,
//   emailVerification, credits, legal, admin, storageQuota true; billing true only with BILLING_PROVIDER set
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/hosted-config.test.ts tests/unit/features.test.ts`
Expected: FAIL, modules `@/lib/hosted/config` and `@/lib/hosted/features` do not exist.

- [ ] **Step 3: Implement `parseHostedConfig` and `features` in `lib/hosted/config.ts` and `lib/hosted/features.ts`**

Follow `parseAiConfig`: blank means off and every other hosted variable is ignored then. Collect all invalid names, then return them together. `missingForHostedBoot` returns names only (never values). Wire both into `parseEnv` after the AI parse, so a hosted boot failure names every missing variable in one `EnvError`. The AI provider check inside `missingForHostedBoot` reads `source.AI_PROVIDER` directly. `features()` takes an optional `Env`, default `env()`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/hosted-config.test.ts tests/unit/features.test.ts tests/unit/env.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/hosted lib/env.ts .env.example tests/unit
git commit -m "feat(hosted): hosted config, boot validation and features()"
```

**Acceptance:** (1) Spec 5.1: unset `HOSTED` changes nothing in `parseEnv` output for existing variables (the old `env.test.ts` cases still pass). (2) A strict boot names every missing variable in one error. (3) `.env.example` lists all variables from the Contract, each with a comment, and `JOBSMITH_ALLOW_FAKE_DRIVERS` is marked test only. (4) `HOSTED=true` with `DEMO_MODE=true` fails boot.

---

### Task 2: Migration for the profile columns and `deletion_job`

**Files:**
- Create: `lib/db/schema/hosted.ts` (`deletionJob`), `lib/db/migrations/NNNN_*.sql` (generated; record the real name)
- Modify: `lib/db/schema/app.ts` (`profile` gains `emailKey`, `termsVersion`, `termsAcceptedAt`, `lastSeenOn`), `lib/db/schema/index.ts` (export `./hosted`), `lib/db/scoped/profile.ts` (add methods below)
- Test: `tests/integration/migrations.test.ts` (extend), `tests/integration/profile.test.ts` (extend), `tests/integration/scoped-isolation.test.ts` (add a row)

**Interfaces:**
- Consumes: `profileQueries(db, userId)` (`get`, `upsert`), `stripScopedKeys`.
- Produces: `profileQueries(...).acceptTerms(version: string, now: Date): Promise<ProfileRow | null>`, `.touchLastSeen(day: string): Promise<boolean>` (writes only when `last_seen_on` differs, returns whether it wrote), `ProfileFields` automatically gains the four columns; `schema.deletionJob` with the Contract's columns, `status` check constraint, index on `status`.

- [ ] **Step 1: Write the failing test**

```ts
// migrations.test.ts: information_schema shows profile.email_key (text, nullable), terms_version, terms_accepted_at (timestamptz), last_seen_on (date);
//   a unique index on profile.email_key; table deletion_job exists with a status check rejecting "bogus"
// profile.test.ts: "acceptTerms stores the version and a time" (insert a profile, accept "2026-12-01", read back);
//   "touchLastSeen writes once per day": first call with "2026-12-01" returns true, second returns false, "2026-12-02" returns true
//   "two profiles cannot share an email_key": inserting the same emailKey for a second user throws a unique violation
// scoped-isolation.test.ts: "profile.acceptTerms and touchLastSeen change only the caller's row"
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/migrations.test.ts tests/integration/profile.test.ts tests/integration/scoped-isolation.test.ts`
Expected: FAIL, columns and methods missing.

- [ ] **Step 3: Add the columns, the table and `pnpm db:generate`**

`last_seen_on` is a Drizzle `date` column with `mode: "string"`. `email_key` carries `unique("profile_email_key_unique")`. Check constraint on `deletion_job.status` lists the five values. Review the generated SQL by hand; it must not touch other tables. `onboarded_at` is not added here (Milestone 12).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/db tests/integration
git commit -m "feat(db): profile terms and email key columns, deletion_job table"
```

**Acceptance:** (1) Spec 4: the four profile columns and `deletion_job` match the names in the Contract. (2) The existing "timestamptz everywhere" migration test still passes. (3) `acceptTerms` and `touchLastSeen` are scoped by `user_id` and listed in the isolation test.

---

### Task 3: Email driver, fake driver, links and templates

**Files:**
- Create: `lib/email/driver.ts`, `lib/email/config.ts`, `lib/email/fake.ts`, `lib/email/links.ts`, `lib/email/log.ts`, `lib/email/index.ts`, `lib/email/templates/index.ts`, `lib/email/templates/{verify-email,reset-password,signup-existing,delete-confirm,account-deleted,trial-ending,payment-failed,global-cap-alert}.ts`, `tests/helpers/outbox.ts`
- Modify: `lib/env.ts` (`Env.EMAIL: EmailConfig | null`, invalid names join the error list)
- Test: `tests/unit/email-config.test.ts`, `tests/unit/email-templates.test.ts`, `tests/unit/email-links.test.ts`, `tests/unit/email-fake.test.ts`

**Interfaces:**
- Consumes: `Result`, `env().APP_URL`, `fakeDriversAllowed` (Task 1).
- Produces: every type in the README "Email" Contract; `parseEmailConfig(source): { ok: true; config: EmailConfig | null } | { ok: false; invalid: string[] }` with `EmailConfig = { provider: "fake"; from: string; dir: string } | { provider: "smtp"; from: string; url: string } | { provider: "resend"; from: string; apiKey: string }`; `createFakeEmailDriver(options: { dir: string }): EmailDriver`; `logEmail(line: { userId: string | null; template: EmailTemplateName; messageId: string | null; outcome: "sent" | EmailErrorCode }): void`; test helpers `readOutbox(dir): OutboxMessage[]` and `latestLink(dir, to, template): string`.

- [ ] **Step 1: Write the failing test**

```ts
// email-config: EMAIL_PROVIDER unset or blank -> config null; "fake" without EMAIL_FROM -> invalid ["EMAIL_FROM"]; "smtp" without SMTP_URL -> ["SMTP_URL"];
//   "resend" without RESEND_API_KEY (use "k".repeat(24) elsewhere) -> ["RESEND_API_KEY"]; "other" -> ["EMAIL_PROVIDER"];
//   "fake" when strict (fakeDriversAllowed false) -> ["EMAIL_PROVIDER"]; EMAIL_FAKE_DIR default ".jobsmith/outbox"
// email-links: appLink("/verify-email", { token: "t1" }) starts with env().APP_URL; a Host header is not an input anywhere in the function signature
// email-templates: for each of the eight templates renderEmail returns a non-empty subject, text that contains every URL passed in, html that contains the same URLs;
//   no template output contains "<img", "pixel" or a link host other than APP_URL's; no output contains an exclamation mark;
//   global_cap_alert text names "used" and "cap" figures
// email-fake: send writes one JSON file named <time>-<template>-<8 hex>.json holding { to, template, subject, text, links };
//   readOutbox returns it; latestLink returns the verify URL; send returns ok({ messageId }) with the file name stem
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/email-config.test.ts tests/unit/email-templates.test.ts tests/unit/email-links.test.ts tests/unit/email-fake.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement the driver interface, config, fake driver, links and templates**

Templates are plain functions returning `{ subject, text, html }` where `html` is the same text wrapped in minimal markup with escaped values. Subjects are fixed strings per template. `getEmailDriver()` in `lib/email/index.ts` memoizes like `getAiDriver`, returns `null` when `env().EMAIL` is null, builds `fake` here and leaves `smtp` and `resend` to Task 4 (`driverFromEmailConfig` throws `EnvError("EMAIL_PROVIDER")` for them until then). Log lines go through `logEmail`; no address and no text.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/email-config.test.ts tests/unit/email-templates.test.ts tests/unit/email-links.test.ts tests/unit/email-fake.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/email lib/env.ts tests
git commit -m "feat(email): driver interface, fake driver, templates and links"
```

**Acceptance:** (1) Spec 5.2: eight templates, links only from `APP_URL`, no tracking markup. (2) `fake` is refused in a strict build. (3) The outbox helper lets a test read a verification link with no network. (4) No log line holds an address or message text (read `lib/email/log.ts`).

---

### Task 4: SMTP and Resend drivers

**Files:**
- Create: `lib/email/smtp.ts`, `lib/email/resend.ts`, `tests/unit/email-smtp.test.ts`, `tests/unit/email-resend.test.ts`, `tests/integration/email-live.test.ts`
- Modify: `lib/email/index.ts` (`driverFromEmailConfig` handles all three), `package.json` (`nodemailer`, `resend`, `@types/nodemailer`)

**Blocked on:** a Resend account and verified domain, and an SMTP server, for the live test only. The unit tests inject a fake transport and a fake client and run in CI.

**Interfaces:**
- Consumes: `EmailConfig`, `renderEmail`, `EmailDriver` (Task 3).
- Produces: `createSmtpEmailDriver(options: { url: string; from: string; transport?: { sendMail(message: unknown): Promise<{ messageId: string }> } }): EmailDriver`, `createResendEmailDriver(options: { apiKey: string; from: string; client?: { emails: { send(payload: unknown): Promise<{ data: { id: string } | null; error: { name: string; message: string } | null }> } } }): EmailDriver`.

- [ ] **Step 1: Write the failing test**

```ts
// smtp: sendMail receives { from, to, subject, text, html }; a 10-second connection timeout is configured (assert the createTransport options in the default path with a spy);
//   error with responseCode 550 -> email_rejected; 421 and 452 -> email_rate_limited; no code -> email_error; messageId is returned on success
// resend: client.emails.send receives from, to, subject, text, html; error name "rate_limit_exceeded" -> email_rate_limited; "validation_error" -> email_rejected;
//   any other error or a thrown exception -> email_error; success returns the id as messageId; no address appears in the string the driver logs
// live (skipped unless JOBSMITH_LIVE_EMAIL=1 and the provider's variables are set): sends verify_email to EMAIL_LIVE_TO and expects ok
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/email-smtp.test.ts tests/unit/email-resend.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Install the packages and implement both drivers**

`pnpm add nodemailer resend && pnpm add -D @types/nodemailer`; record the versions. Open the installed `resend` types and check whether a per-message tracking option exists. If it does, set open and click tracking off on every message. If it does not, tracking is a domain setting in Resend: send plain links only, and add the line "Turn off open and click tracking for the sending domain in Resend" to the checklist in Task 58. Say which case applied in the task report.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/email-smtp.test.ts tests/unit/email-resend.test.ts && pnpm typecheck`
Expected: PASS (live test skipped)

- [ ] **Step 5: Commit**

```bash
git add lib/email package.json pnpm-lock.yaml tests
git commit -m "feat(email): smtp and resend drivers"
```

**Acceptance:** (1) Spec 3 and 5.2: three drivers behind `EMAIL_PROVIDER`, `smtp` with a 10-second timeout. (2) Error codes map as the tests state. (3) The dependency versions and the tracking finding are in the report.

---

### Task 5: Address normalization, disposable list, sign-up limits and per-key tokens

**Files:**
- Create: `lib/auth/address.ts`, `lib/auth/disposable-domains.txt`, `scripts/refresh-disposable.ts`, `lib/auth/rate-key.ts`
- Modify: `lib/auth/policy.ts` (`signUpRateLimitRule`), `package.json` (script `refresh:disposable`)
- Test: `tests/unit/address.test.ts`, `tests/unit/policy-signup.test.ts`, `tests/integration/rate-key.test.ts`

**Blocked on:** network access, once, to fetch the upstream CC0 list into `lib/auth/disposable-domains.txt`. Without it the file stays a header comment and the owner or executor runs `pnpm refresh:disposable`; no list is invented. Tests inject a small set.

**Interfaces:**
- Consumes: `schema.rateLimit` (`key`, `count`, `lastRequest`), `Db`.
- Produces: `normalizeAddress`, `isDisposableDomain`, `loadDisposableDomains(): ReadonlySet<string>` (reads the text file once, skips blank and `#` lines), `signUpRateLimitRule`, `takeToken(db: Db, input: { key: string; max: number; windowMs: number; now: Date }): Promise<boolean>` (true when a token was taken; one `INSERT ... ON CONFLICT (key) DO UPDATE ... RETURNING` statement that resets the window when `last_request` is older than `windowMs`).

- [ ] **Step 1: Write the failing test**

```ts
// address: "A.B+tag@Gmail.com" -> "ab@gmail.com"; "a.b@googlemail.com" -> "ab@googlemail.com" (no domain rewrite); "first.last+x@northwind.example" -> "first.last@northwind.example";
//   "no-at-sign" -> "no-at-sign"; "x+@gmail.com" -> "x@gmail.com"
// disposable (set { "mailinator.com" }): "x@mailinator.com" true; "x@sub.mailinator.com" true; "x@notmailinator.com" false; "x@MAILINATOR.COM" true
// policy: signUpRateLimitRule(true) -> { window: 3600, max: 3 }; (false) -> { window: 3600, max: 20 }
// rate-key (PGlite): max 3 in a window: calls 1 to 3 return true, call 4 false; after windowMs passes (fixed now) the next call returns true;
//   two different keys do not interfere; four parallel calls with max 3 yield exactly three true
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/address.test.ts tests/unit/policy-signup.test.ts tests/integration/rate-key.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement the helpers and the refresh script**

`pnpm refresh:disposable` fetches the upstream blocklist (the `disposable-email-domains` project's `disposable_email_blocklist.conf`; confirm the current raw URL), lower-cases, sorts, deduplicates and writes the text file with a header comment naming the source, license (CC0-1.0) and date. Keep the fetch inside the script only.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/address.test.ts tests/unit/policy-signup.test.ts tests/integration/rate-key.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/auth scripts package.json tests
git commit -m "feat(auth): address normalization, disposable list, per-key limiter"
```

**Acceptance:** (1) Spec 5.3: lower-case, `+tag` removed everywhere, dots removed only for Gmail and Googlemail. (2) Spec 5.12: 3 per hour with a client address, 20 in the shared bucket. (3) The vendored file's header names source, license and date, or the report says the fetch was not possible.

---

### Task 6: Better Auth hosted wiring

**Files:**
- Create: `lib/auth/hosted-signup.ts`, `lib/auth/after-verify.ts`, `lib/auth/invite.ts`, `docs/hosted-auth-notes.md`
- Modify: `lib/auth/index.ts` (options and hooks below), `lib/auth/signup-gate.ts` (third argument)
- Test: `tests/unit/signup-gate.test.ts`, `tests/unit/invite.test.ts`, `tests/integration/hosted-signup.test.ts`, `tests/integration/auth-hosted.test.ts`

**Interfaces:**
- Consumes: `normalizeAddress`, `isDisposableDomain`, `loadDisposableDomains`, `signUpRateLimitRule` (Task 5), `getEmailDriver`, `renderEmail`, `appLink` (Task 3), `countUsers`, `features()`, `schema.profile`.
- Produces: `signUpAllowed(userCount, allowSignup, hosted?)`, `checkInviteCode({ configured, provided }): "ok" | "not-required" | "missing" | "wrong"` (sha256 digests then `timingSafeEqual`, the setup token's pattern), `INVITE_HEADER = "x-invite-code"`, `checkHostedSignUp`, `afterVerified` (README Contract; body is a no-op until Task 41).

- [ ] **Step 1: Write the failing test**

```ts
// signup-gate: (0, false, false) true; (3, false, false) false; (3, true, false) true; (3, false, true) true; (3, true, true) true
// invite: configured null -> "not-required"; configured "x".repeat(16), provided undefined -> "missing"; wrong -> "wrong"; equal -> "ok"
// hosted-signup (PGlite): invite required when configured and absent -> fail "invite_required"; wrong -> "invite_wrong"; "x@mailinator.com" with the test list -> "disposable_domain";
//   existing profile with emailKey "ab@gmail.com" and a new "a.b+z@gmail.com" -> "address_taken"; a clean address returns ok({ emailKey: "..." });
//   order check: a disposable address with a wrong invite code reports "invite_wrong" first
// auth-hosted (real auth object on PGlite or the repo's test auth setup, HOSTED on, fake email dir in a temp folder):
//   sign-up of a new address creates an unverified user, writes profile.email_key, and writes a verify_email message to the outbox;
//   sign-in before verification is refused; following the outbox link verifies the user and signs in; a reset request writes reset_password to the outbox;
//   resetting with the link sets the new password and revokes every existing session (count sessions before and after);
//   the first account (userCount 0) is created with email_verified true and no verification email (decision D6)
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/signup-gate.test.ts tests/unit/invite.test.ts tests/integration/hosted-signup.test.ts tests/integration/auth-hosted.test.ts`
Expected: FAIL, modules and options missing.

- [ ] **Step 3: Confirm the library, then wire the options**

First read the installed `better-auth` package (types and bundled docs under `node_modules/better-auth`) and write what it supports into `docs/hosted-auth-notes.md`: `requireEmailVerification`, `sendVerificationEmail` (with `sendOnSignUp`, `expiresIn` 86400, `autoSignInAfterVerification`), `sendResetPassword` (token lifetime 3600), `revokeSessionsOnPasswordReset`, `databaseHooks.user.create.after`, and what runs when the address is verified (an `afterEmailVerification` option or a `databaseHooks.user.update.after` on `emailVerified`). Use the real names. If an option is missing, say so in the note and use the nearest hook; the tests above define the behavior either way.
Then in `lib/auth/index.ts`, when `features().emailVerification`: set the options, add `/sign-up/email` to `rateLimit.customRules` with `signUpRateLimitRule(getIP(request, { advanced }) !== null)`, extend the `before` hook in this order (spec 5.3): the gate (`signUpAllowed(userCount, env().ALLOW_SIGNUP, features().hosted)`), the invite code, disposable domains and one live account per address (skip invite, disposable and address checks when `userCount === 0`, which stays behind the setup token). `databaseHooks.user.create.after` upserts the `profile` row with `email_key` (a unique violation deletes the new user and throws a forbidden error, the rare race) and, for the first account, sets `email_verified` true and calls `afterVerified`. Demo sign-ups keep their early return before any hosted rule (`DEMO_SIGNUP_HEADER`).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration/hosted-signup.test.ts tests/integration/auth-hosted.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/auth docs/hosted-auth-notes.md tests
git commit -m "feat(auth): hosted sign-up rules, verification, reset and session revocation"
```

**Acceptance:** (1) Spec 5.3: rule order is gate, invite, disposable, one live account. (2) Unverified accounts have no session. (3) A reset revokes every session. (4) With `HOSTED` unset the existing `first-run` and `login` behavior is unchanged (run `pnpm vitest run` in full). (5) `docs/hosted-auth-notes.md` lists the real option names found.

---

### Task 7: Sign-up and verify-email pages

**Files:**
- Create: `app/(auth)/signup/page.tsx`, `app/(auth)/signup/signup-form.tsx`, `app/(auth)/signup/actions.ts`, `app/(auth)/verify-email/page.tsx`, `app/(auth)/verify-email/actions.ts`, `components/super-ai/auth-shell.tsx` (registry item `auth-shell`, `shadcn add`), `lib/auth/signup-action.ts`
- Modify: `proxy.ts` (`PUBLIC_PATHS` gains `/signup`, `/verify-email`, `/reset-password`, `/privacy`, `/terms`, `/pricing`), `app/(auth)/setup/actions.ts` (hosted: after creating the first account sign in with `auth.api.signInEmail`, since an unverified-session rule would otherwise skip the session), `docs/design-system.md`
- Test: `tests/unit/signup-action.test.ts`, `tests/integration/signup-action.test.ts`, `tests/e2e-hosted/signup.spec.ts` is written in Task 15

**Interfaces:**
- Consumes: `features()`, `auth.api.signUpEmail`, `checkHostedSignUp`, `getEmailDriver`, `takeToken` (Task 5), `INVITE_HEADER`, `TERMS_VERSION` (Task 9, for the checkbox text; the action stores acceptance through `scopedFor(userId).profile.acceptTerms`).
- Produces: `signUpWithEmail(db, input: { name: string; email: string; password: string; invite: string | undefined; acceptTerms: boolean }, deps): Promise<Result<{ answer: "check_email" }, "terms_required" | "invalid" | "email_failed" | "rate_limited">>` in `lib/auth/signup-action.ts`: when the normalized address already has a profile it sends `signup_existing` and still returns `check_email`; on a send failure returns `email_failed` (copy "We could not send the email. Try again in a minute."). `resendVerificationAction()` allows once per 60 seconds and 5 per day per account (`takeToken` keys `verify:<userId>:60s` and `verify:<userId>:day`).

- [ ] **Step 1: Write the failing test**

```ts
// unit: acceptTerms false -> fail "terms_required"; password of 11 characters -> fail "invalid" with the field message; a known address returns ok check_email and the driver got signup_existing, not verify_email;
//   a new address returns ok check_email and the driver got verify_email; the response object is deeply equal in both cases (no enumeration)
// unit: a driver that returns email_error makes the result fail "email_failed" and the user stays unverified
// integration: resend twice within 60 seconds -> second returns rate_limited; sixth call in a day returns rate_limited
// page (component test with jsdom): the form has labels Name, Email, Password, an Invite code field only when the prop says so, a required checkbox naming the terms and privacy pages,
//   and the message "Check your email." replaces the form after a successful submit
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/signup-action.test.ts tests/integration/signup-action.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Install `auth-shell`, build the action and the pages**

`pnpm dlx shadcn add https://super-ai-components.vercel.app/r/auth-shell.json` (the registry in `docs/design-system.md`); record it in the installed list. Both pages call `notFound()` when `features().publicSignup` is false. `/verify-email` shows the pending state, "Resend" and the address the link went to is never shown back; a verified, signed-in user is redirected to `/welcome` when Milestone 12 exists and `/board` before. The sign-up action reads `x-invite-code` from the form field and passes it as the header to `auth.api.signUpEmail`. Hosted `/setup`: the first-account path signs in after sign-up.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration/signup-action.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app lib components proxy.ts docs/design-system.md tests
git commit -m "feat(auth): hosted sign-up and verify-email pages"
```

**Acceptance:** (1) Spec 5.3: the answer for a known and a new address is the same text. (2) `/signup` returns 404 when `HOSTED` is unset. (3) Resend limits are 60 seconds and 5 per day. (4) `docs/design-system.md` lists `auth-shell`.

---

### Task 8: Password reset pages, login link and demo coexistence

**Files:**
- Create: `app/(auth)/reset-password/page.tsx`, `reset-form.tsx`, `actions.ts`
- Modify: `app/(auth)/login/page.tsx` (link "Forgot your password" when `features().passwordReset`; "Create an account" link when `features().publicSignup`), `app/(auth)/login/login-form.tsx` (unverified error copy), `lib/env.ts` (nothing new; D7 check lives in Task 1)
- Test: `tests/unit/reset-action.test.ts`, `tests/integration/reset-action.test.ts`

**Interfaces:**
- Consumes: `auth.api.requestPasswordReset` and `auth.api.resetPassword` (the names Task 6 recorded), `takeToken`, `getEmailDriver`, `features()`.
- Produces: `requestResetAction(state, formData)` always answering "If an account exists, a link is on its way"; limits 3 per hour per address (`takeToken` key `reset:addr:<normalized>`) and 3 per hour per client address (key `reset:ip:<ip>`, or the shared key `reset:ip:none` when no trusted address); `resetPasswordAction` with the token from the query string, at least `MIN_PASSWORD_LENGTH` characters, answering with a link to `/login` after success.

- [ ] **Step 1: Write the failing test**

```ts
// the answer is identical for a known and an unknown address; only the known one writes reset_password to the fake outbox
// the fourth request for one address inside an hour still answers the same text and sends nothing (limit silent to the caller)
// resetting with a valid token changes the password and every session of that user is gone; a token used twice fails with "This link has expired. Ask for a new one."
// login page: with HOSTED unset and EMAIL_PROVIDER unset there is no reset link; with EMAIL_PROVIDER fake there is (self-host, spec 5.1 table)
// login page keeps DemoButton exactly when DEMO_MODE is on, and never alongside a "Create an account" link (D7 makes the two modes exclusive)
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/reset-action.test.ts tests/integration/reset-action.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Build the pages and actions on the `auth-shell`**

`/reset-password` shows the request form when no token is present and the new-password form when `?token=` is present. Both call `notFound()` when `features().passwordReset` is false. How hosted sign-up sits beside the demo button: the login page shows "Try the demo" only when `DEMO_MODE` is on and `HOSTED` is off (the boot rule in Task 1 enforces it), and shows the sign-up link only when `publicSignup` is on.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration/reset-action.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app lib tests
git commit -m "feat(auth): password reset pages and login links"
```

**Acceptance:** (1) Spec 5.3: the answer never reveals who has an account; link lifetime 60 minutes; every session revoked. (2) Self-host with an email driver shows the reset link on `/login`, with no driver it does not. (3) `DemoButton` and the sign-up link never show together.

---

### Task 9: Legal pages, processors table and cookie allowlist

**Files:**
- Create: `content/legal/privacy.md`, `content/legal/terms.md`, `lib/legal/version.ts` (`TERMS_VERSION`), `lib/legal/render.ts`, `lib/legal/processors.ts`, `lib/legal/cookies.ts`, `app/(public)/layout.tsx`, `app/(public)/privacy/page.tsx`, `app/(public)/terms/page.tsx`
- Test: `tests/unit/legal-render.test.ts`, `tests/unit/legal-processors.test.ts`, `tests/unit/legal-cookies.test.ts`

**Interfaces:**
- Consumes: `components/markdown.tsx` (`Markdown`, Core's sanitized renderer), `env().HOSTED`, `env().EMAIL`, `env().AI`, `env().BILLING`, `features()`.
- Produces: `TERMS_VERSION: string` (placeholder `"2026-11-21"`, the owner sets the real effective date), `renderLegal(template: string, values: { operator: string; contact: string; effective: string; processors: string }): string` (replaces `{{operator}}`, `{{contact}}`, `{{effective}}`, `{{processors}}`; a leftover `{{` after filling throws), `processorRows(config): ProcessorRow[]` and `processorsTable(rows): string` (a markdown table), `ALLOWED_COOKIES: readonly string[]`, `isAllowedCookie(name: string): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// render: all four placeholders are replaced; an unknown placeholder "{{nope}}" throws; the repo templates contain no operator name (grep the files for LEGAL_OPERATOR's sample value "Northwind Traders Ltd" is absent)
// processors: with EMAIL resend, AI gateway, TTS provider gemini, BILLING stripe and LEGAL_HOSTING "Vercel and Neon" the table lists Resend, AI Gateway with Anthropic,
//   Google (gemini voice), Stripe and the hosting line; with email off, billing off and AI off the table lists only the hosting line; the rows follow the data map columns (data, stored in, third parties, kept until)
// cookies: the allowlist holds the Better Auth cookie names read from the installed package's defaults in Step 3; isAllowedCookie("_ga") is false
// pages: /privacy and /terms call notFound when features().legal is false (test the page function with HOSTED unset)
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/legal-render.test.ts tests/unit/legal-processors.test.ts tests/unit/legal-cookies.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Write the templates, the renderer and the pages**

The privacy template follows the data map of spec 5.9 row by row (account, profile and documents, audio, uploaded resume file in memory, onboarding draft, plan and billing, credit ledger and generation metadata, request logs), states that only the sign-in cookies Better Auth needs are set and no analytics, advertising or third-party script runs, and that Stripe's pages run on Stripe's domain. The terms template covers the service, credits, plans as placeholders, refunds handled by the owner, deletion and the AGPL. Both are drafts the owner reviews (README, Needs list). Read the cookie names Better Auth sets (session token and any data cookie, with and without the `__Secure-` prefix) from the installed package and write exactly those into `ALLOWED_COOKIES`; invent none. The public layout has no session and no analytics.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit && pnpm typecheck && pnpm check:tokens`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add content lib/legal app/\(public\) tests
git commit -m "feat(legal): privacy and terms templates, processors table, cookie allowlist"
```

**Acceptance:** (1) Spec 5.9: placeholders filled at render time and the processors table is built from the configured drivers. (2) The repo carries no operator name. (3) `ALLOWED_COOKIES` came from the installed library, noted in the report. (4) Both pages 404 with `HOSTED` unset.

---

### Task 10: Terms gate in the app layout

**Files:**
- Create: `components/legal/terms-gate.tsx`, `lib/legal/gate.ts`, `app/(app)/legal-actions.ts`
- Modify: `app/(app)/layout.tsx` (reads `profile.terms_version`; renders the gate; writes `last_seen_on` at most once a day through `touchLastSeen` with the user's UTC date), `proxy.ts` (nothing), `components/app-shell.tsx` (no change unless needed to dim the shell)
- Test: `tests/unit/terms-gate.test.ts`, `tests/unit/terms-gate.test.tsx`, `tests/integration/legal-actions.test.ts`

**Interfaces:**
- Consumes: `TERMS_VERSION`, `scopedFor(...).profile.acceptTerms`, `touchLastSeen`, `features().legal`.
- Produces: `needsTerms(profileTermsVersion: string | null, hosted: boolean): boolean` (hosted and version differs); `acceptTermsAction()` writes `TERMS_VERSION` and `now`; `REACHABLE_WHEN_TERMS_PENDING = ["/settings", "/settings/export"]` plus the sign-out action (only sign-out, export and delete are reachable).

- [ ] **Step 1: Write the failing test**

```ts
// needsTerms: (null, true) true; ("2026-11-21", true) false when TERMS_VERSION equals it; ("old", true) true; (anything, false) false
// component: renders a blocking dialog (role "alertdialog" or a modal dialog without a close control) with links to /terms and /privacy and a button "Accept"; focus starts on the button
// action: acceptTermsAction writes terms_version and terms_accepted_at for the caller only
// layout rule: with a pending terms version only the account areas render; the board link is replaced by the dialog (assert through the exported pure function pathAllowedWhilePending(pathname))
//   pathAllowedWhilePending("/board") false; ("/settings") true; ("/settings/export") true; ("/api/auth/sign-out") true
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/terms-gate.test.ts tests/unit/terms-gate.test.tsx tests/integration/legal-actions.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Build the gate**

Server layout reads the profile once per request (the page already needs it for other reasons later; keep one query). The dialog is the shadcn `dialog` primitive with the overlay and no dismiss. Delete is reachable inside Settings, so `/settings` stays reachable.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration/legal-actions.test.ts && pnpm typecheck && pnpm check:tokens`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components lib app tests
git commit -m "feat(legal): blocking terms acceptance dialog"
```

**Acceptance:** (1) Spec 5.3: a changed `TERMS_VERSION` blocks everything but sign-out, export and delete until "Accept". (2) The gate never renders with `HOSTED` unset. (3) `last_seen_on` is written at most once a day.

---

### Task 11: `Storage.list` and `deletePrefix`

**Files:**
- Modify: `lib/storage/driver.ts` (from `2026-11-21-jobsmith-prep` milestone 07: `Storage` interface), `lib/storage/{local,s3,vercel-blob,memory}.ts` (same source)
- Test: `tests/unit/storage-prefix.test.ts` (runs once per driver with a fake S3 client and a fake Blob client), `tests/integration/storage-local.test.ts`

**Interfaces:**
- Consumes: the Prep `Storage` interface (`put(key, bytes, contentType)`, `get(key) → bytes | null`, `delete(key)`).
- Produces: `Storage.list(prefix: string): Promise<string[]>` (every key starting with `prefix`, paged to completion) and `Storage.deletePrefix(prefix: string): Promise<number>` (count removed), on all four drivers.

If Prep milestone 07 is absent, skip this task and record it.

- [ ] **Step 1: Write the failing test**

```ts
// each driver: put "u/aaaa/tts/1.mp3", "u/aaaa/tts/2.mp3" and "u/bbbb/tts/3.mp3"; list("u/aaaa/") returns the first two; deletePrefix("u/aaaa/") returns 2 and list("u/aaaa/") is []; "u/bbbb/tts/3.mp3" still reads;
// list of an unknown prefix returns []; a prefix without the trailing slash "u/aa" does not delete "u/aaaa/..." (deletePrefix refuses a prefix that does not end in "/" with an Error)
// s3 fake client: list pages across three continuation tokens and the function follows them; delete uses batch deletes of at most 1000 keys
// vercel_blob fake client: list follows the cursor until no more
// local: nested directories are removed when empty; a prefix containing ".." throws
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/storage-prefix.test.ts tests/integration/storage-local.test.ts`
Expected: FAIL, `list` is not a function.

- [ ] **Step 3: Implement both methods on the four drivers**

Open each driver's real client calls before editing and quote them in the report. `local` walks the directory under its root with the key as a relative path, refusing path escapes.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/storage-prefix.test.ts tests/integration/storage-local.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/storage tests
git commit -m "feat(storage): list and deletePrefix on every driver"
```

**Acceptance:** (1) Spec 5.10: both methods exist on `local`, `s3`, `vercel_blob` and `memory`. (2) A prefix without a trailing slash is refused. (3) No driver creates a public object (Prep 7 rule still holds).

---

### Task 12: Deletion steps and the verifier

**Files:**
- Create: `lib/account/user-hash.ts`, `lib/account/ports.ts`, `lib/account/delete.ts`, `lib/account/verify-deletion.ts`, `lib/account/log.ts`
- Test: `tests/unit/user-hash.test.ts`, `tests/integration/account-delete.test.ts`, `tests/integration/account-verify.test.ts`

**Interfaces:**
- Consumes: `schema.deletionJob`, `schema.user`, `schema.session`, `schema.verification`, `StoragePort` and `BillingDeletionPort` (defined here in `ports.ts` from the README Contract), `getEmailDriver`, `countUsers`, `makeTestDb`, the `memory` storage driver.
- Produces: `userHash`, `requestDeletion`, `runDeletion`, `verifyDeletion`, `DELETION_MAX_ATTEMPTS`, `Found`, exactly as the README Contract states. `requestDeletion` refuses with `last_account` when `features().hosted` is false and the user count is 1; its transaction inserts the `deletion_job` (status `pending`) and deletes every session of the user.

- [ ] **Step 1: Write the failing test**

```ts
// user-hash: 16 lowercase hex characters, stable, and equal to the hash part of Prep's key prefix (call Prep's prefix builder from lib/storage/keys.ts, name it in the report; skip the assertion when absent)
// delete (PGlite, seedOneOfEach plus a profile, an api token, two sessions): requestDeletion returns ok({ jobId }), sessions are 0, the job row holds user_id, user_hash, status "pending"
//   runDeletion removes the user row and every owned row (counts 0 for every table with a user_id column), removes objects under u/<hash>/ in a memory storage and any key an asset row names (skip when asset absent),
//   removes verification rows whose identifier is the address, sends account_deleted to the address passed in memory, and ends status "verified" with user_id and customer_id null
// verifier completeness: the test creates a throwaway table "zz_extra" with a user_id column and a row for the user inside the test database; verifyDeletion reports it in found.tables and the job is "failed" (mutation check: hard-code the table list and watch this fail)
// storage leftovers: an object left under the prefix by a failing storage fake makes the job failed with found.objects 1; attempts increments on each runDeletion
// last account: with hosted false and one user, requestDeletion fails "last_account"; with hosted true it succeeds
// the deletion_job.user_id column is skipped by the verifier (decision D9); a job that verified keeps only user_hash, status, found, timestamps
// the function never throws: a storage fake that throws leaves status "failed", error_code set, and the user row already deleted or not as far as it got
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/user-hash.test.ts tests/integration/account-delete.test.ts tests/integration/account-verify.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement the three steps**

`runDeletion` follows spec 5.10: set `deleting`; billing port first (cancel now, delete customer; null port skips); storage prefix then asset keys; verification rows; the `user` row; the farewell email from memory; set `verifying`; call `verifyDeletion`. The verifier lists tables from `information_schema.columns where column_name = 'user_id' and table_schema = 'public'`, minus `deletion_job`, counts rows per table with the job's stored user id, plus `user.id`; lists the storage prefix; asks the billing port `customerExists`. All empty sets `verified` and clears `user_id` and `customer_id`; anything found sets `failed` with `found` and the tick retries (Task 14). Logging via `[delete]` lines with the job id, status and counts only.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/user-hash.test.ts tests/integration/account-delete.test.ts tests/integration/account-verify.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/account tests
git commit -m "feat(account): deletion steps and the verifier"
```

**Acceptance:** (1) Spec 5.10 steps 1 to 3. (2) A table added later is caught with no code change (the throwaway-table test). (3) Spec 5.1: the last account of a self-hosted instance cannot be deleted. (4) No log line holds an address.

---

### Task 13: Settings Account section and the delete flow

**Files:**
- Create: `components/settings/account-section.tsx`, `components/settings/delete-account-dialog.tsx`, `app/(app)/settings/account-actions.ts`, `lib/account/confirm.ts`
- Modify: `app/(app)/settings/page.tsx` (adds the Account section: email, change password, delete), `lib/auth/index.ts` (only if Task 6's notes say Better Auth's `deleteUser` should drive the two steps; otherwise the confirm token lives in `lib/account/confirm.ts` on the `verification` table)
- Test: `tests/unit/delete-dialog.test.tsx`, `tests/integration/account-confirm.test.ts`

**Interfaces:**
- Consumes: `requestDeletion`, `runDeletion` (Task 12), `collectExport` (`lib/export/collect.ts`), `getEmailDriver`, `takeToken`, `auth.api.changePassword`, `auth.api.verifyPassword` or the check Task 6's notes name.
- Produces: `startDeleteAction(password: string)` (verifies the password; with an email driver sends `delete_confirm` with a 60-minute token, 3 per day per user via `takeToken` key `delete:<userId>:day`; with none returns `{ needsTyping: true }`); `confirmDeleteAction({ token } | { typed: string })` (typed text must equal `delete my account`); `issueDeleteToken(db, userId, now)`, `consumeDeleteToken(db, userId, token, now): Promise<boolean>` in `lib/account/confirm.ts`. Confirmation calls `requestDeletion` then `after(() => runDeletion(...))` and signs the browser out.

- [ ] **Step 1: Write the failing test**

```ts
// confirm: a token issued now is valid for 59 minutes and invalid at 61; it works once; a token for another user is refused; four issues in a day: the fourth returns rate_limited
// dialog: step 1 shows counts of jobs, documents and audio clips, a link "Download my data first" to /settings/export, a password field and, on a paid plan, "Your subscription ends now, with no refund for the rest of the period."
//   step 2 with an email driver says a link was sent; without one it shows a field that accepts exactly "delete my account" and keeps the button "Delete account" disabled until then
// wrong password -> the dialog shows "That password is not right." and no email is sent
// on a self-hosted instance with one account the Delete account button is disabled with the line "This is the only account on this instance." (spec 5.1)
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/delete-dialog.test.tsx tests/integration/account-confirm.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Build the section, dialog and actions**

Change password uses the library's change-password call with `revokeOtherSessions: true` if the installed version offers it (note in the report). The dialog uses the shadcn `dialog` and `field-row`. After confirmation the action redirects to `/login?deleted=1`, which shows "Your account is deleted." Counts for step 1 come from `scopedFor(user.id)` list lengths; audio clips are counted only when `asset` exists.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration/account-confirm.test.ts && pnpm typecheck && pnpm check:tokens`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app components lib tests
git commit -m "feat(account): settings account section and two-step delete"
```

**Acceptance:** (1) Spec 5.10: two steps, password required, 60-minute link, 3 per day, typed phrase when no email driver. (2) Export link present before confirming. (3) Wrong password sends nothing.

---

### Task 14: Maintenance tick and `proxy.ts` exclusion

**Files:**
- Create: `app/api/jobs/tick/route.ts`, `lib/jobs/tick.ts`, `lib/jobs/steps.ts`, `lib/jobs/log.ts`, `scripts/tick.ts`
- Modify: `proxy.ts` (matcher gains `api/jobs/tick`), `vercel.ts` (`crons: [{ path: "/api/jobs/tick", schedule: "*/15 * * * *" }]`), `package.json` (script `jobs:tick`), `.env.example` (`CRON_SECRET` already listed in Task 1)
- Test: `tests/unit/tick-auth.test.ts`, `tests/unit/proxy-matcher.test.ts`, `tests/integration/tick-steps.test.ts`

**Interfaces:**
- Consumes: `deleteUnverifiedOlderThan` queries over `schema.user`, `runDeletion`, `verifyDeletion`, `DELETION_MAX_ATTEMPTS`, `schema.deletionJob`.
- Produces: `POST /api/jobs/tick`: 404 when `CRON_SECRET` is unset, 401 for a missing or wrong bearer (constant-time compare through sha256 digests), 200 with `{ steps: Record<string, number> }`. `runTick(db: Db, deps: TickDeps, now: Date): Promise<Record<string, number>>` where `TickDeps = { deletion: DeletionDeps; now?: never }` and each step in `lib/jobs/steps.ts` takes `(db, deps, now, limit = 50)` and returns the number of items handled. Milestone 11 steps: `deleteUnverifiedAccounts` (unverified for 7 days, through `requestDeletion` and `runDeletion` so the address frees), `runPendingDeletions`, `retryFailedDeletions` (attempts below `DELETION_MAX_ATTEMPTS`, at least an hour since the last attempt), `purgeVerifiedDeletions` (30 days after `verified_at`). Later milestones add steps to the same list.

- [ ] **Step 1: Write the failing test**

```ts
// auth: no CRON_SECRET -> 404; no header -> 401; wrong bearer -> 401; right bearer -> 200
// matcher: the exported config.matcher regex does not match "/api/jobs/tick" and still matches "/board" (assert with the same pattern Next uses: new RegExp("^" + pattern + "$"))
// proxy: a request to /api/jobs/tick with no cookie reaches the handler and is not redirected to /login (call the route handler directly and assert status 401, not 307)
// steps (PGlite): a user unverified for 8 days is deleted and their address frees; one unverified for 6 days stays; a pending deletion job is run;
//   a failed job with attempts 5 is not retried; one with attempts 2 and last attempt 61 minutes ago is retried; a verified job older than 30 days is deleted, one at 29 days stays;
//   each step handles at most 50 items per run (seed 60, run once, 50 handled)
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/tick-auth.test.ts tests/unit/proxy-matcher.test.ts tests/integration/tick-steps.test.ts`
Expected: FAIL, route and steps missing.

- [ ] **Step 3: Implement the route, the steps and the cron entry**

The route reads no session cookie. `scripts/tick.ts` posts to `APP_URL/api/jobs/tick` with the bearer for `pnpm jobs:tick`. `maxDuration` of the route is 60. Steps log one `[delete]` or `[jobs]` line per run with counts.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration/tick-steps.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api lib/jobs scripts proxy.ts vercel.ts package.json tests
git commit -m "feat(jobs): maintenance tick with bearer auth and deletion steps"
```

**Acceptance:** (1) Spec 5.13: 404, 401 and 200 as stated, no cookie read, each step bounded to 50. (2) The matcher change is the only guard change, and the test proves no redirect. (3) `vercel.ts` carries the 15-minute entry (assumption 12 in the spec).

---

### Task 15: End to end, CI jobs, docs and ship

**Files:**
- Create: `playwright.hosted.config.ts`, `tests/e2e-hosted/global-setup.ts`, `tests/e2e-hosted/hosted-account.ts`, `tests/e2e-hosted/signup.spec.ts`, `tests/e2e-hosted/legal.spec.ts`, `tests/e2e-hosted/cookies.spec.ts`
- Modify: `package.json` (script `test:e2e:hosted`), `.github/workflows/ci.yml` (job `e2e-hosted`; the existing `build` and `e2e` jobs stay with `HOSTED` unset), `README.md` (a "Hosted mode" section: the switch, the variables, the demo exclusion, last account on self-host), `docs/design-system.md` (new items), `.env.example`
- Test: the specs above

**Blocked on:** a Resend account, a verified domain and the Vercel preview environment for the preview check only. The specs run on the `fake` drivers in CI.

**Interfaces:**
- Consumes: everything in this milestone; `scanForViolations` from `tests/e2e/axe.ts`; `readOutbox`, `latestLink`.
- Produces: `playwright.hosted.config.ts` with projects `hosted-first-run`, `hosted-chromium`, `hosted-webkit`, `hosted-phone` (390px), a `webServer` on port 3100 started with `HOSTED=true`, `JOBSMITH_ALLOW_FAKE_DRIVERS=true`, `EMAIL_PROVIDER=fake`, `EMAIL_FROM=owner@northwind.example`, `EMAIL_FAKE_DIR=.jobsmith/e2e-outbox`, `AI_PROVIDER=fake`, `BILLING_PROVIDER=fake` (from Milestone 15 on), `STORAGE_PROVIDER=memory`, `ADMIN_EMAILS=e2e-owner@example.com`, `CRON_SECRET` built at runtime, `SIGNUP_INVITE_CODE`, `LEGAL_OPERATOR=Northwind Traders Ltd`, `LEGAL_CONTACT_EMAIL=privacy@northwind.example`, `LEGAL_HOSTING=Vercel and Neon`, `SETUP_TOKEN`, `DATABASE_URL` pointing at database `jobsmith_hosted`. `global-setup.ts` creates that database if missing, resets and migrates it.

- [ ] **Step 1: Write the failing test**

```ts
// signup.spec.ts (all projects): first-run creates the owner through /setup (verified at creation); then
//   sign up a stranger "Riley Example" with the invite code and the terms box ticked -> "Check your email."; read the verify link from the outbox; open it; land signed in;
//   sign out; request a reset, read reset_password, set a new password, the old password fails and the new one works;
//   a second sign-up with the same address plus "+x" shows the same text and the outbox holds signup_existing; a disposable domain is refused with a generic message;
//   a wrong invite code is refused; delete the account with the password and the emailed link, then sign-in fails and /admin/... is not reachable (admin arrives in Milestone 14, skip that line here)
// legal.spec.ts: /privacy and /terms render with the operator name from env and the processors table; axe zero violations in light and dark on /signup, /verify-email, /reset-password, /privacy, /terms, and the terms dialog
// cookies.spec.ts: after sign-up, sign-in and sign-out, every cookie name is in ALLOWED_COOKIES
// deletion assertion (integration side, in tests/integration/account-delete.test.ts already): the job reads verified; the e2e asserts the same through a GET to a test-only read of deletion_job via the tick response counts
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test:e2e:hosted --project=hosted-chromium`
Expected: FAIL, config and specs missing (run after writing them against the unfinished app to see real failures).

- [ ] **Step 3: Write the config, the specs, the CI job and the docs**

CI job `e2e-hosted` mirrors `e2e` with `pnpm exec playwright install --with-deps chromium webkit`, creates the extra database through `psql`, then runs `pnpm test:e2e:hosted`. The existing `e2e` job runs `pnpm test:e2e` unchanged; add a step to the `build` job that runs `pnpm vitest run` with `HOSTED` explicitly unset to prove the Core suite stands alone. The README section says in plain words how hosted sign-up sits beside the demo button: they are exclusive.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm test:e2e:hosted`
Expected: PASS. Then the preview check: deploy the branch to a Vercel preview with the hosted variables, sign up with a real mailbox, verify, sign in, reset and delete, and read the deletion job in the database as `verified`. Check Chrome and Safari on desktop and at a phone width. Report the preview link; mark anything not run as unverified.

- [ ] **Step 5: Commit**

```bash
git add playwright.hosted.config.ts tests .github package.json README.md docs
git commit -m "test(hosted): milestone 11 end to end, CI jobs and docs"
```

**Acceptance:** (1) The Done-when sentence holds in `signup.spec.ts` on Chromium and WebKit. (2) The Core suite passes unchanged with `HOSTED` unset (CI job `e2e`). (3) Axe has zero violations on every new route in light and dark. (4) `docs/design-system.md` and `.env.example` are current.
