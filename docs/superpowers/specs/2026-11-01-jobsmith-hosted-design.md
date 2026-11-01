# Jobsmith Hosted beta: design spec

- Date: 2026-11-01
- Status: draft for owner review
- Scope: cycle 3 of 8 (Hosted beta). Builds on the Core spec, `docs/superpowers/specs/2026-09-18-jobsmith-core-design.md`, and the Prep spec, `docs/superpowers/specs/2026-11-01-jobsmith-prep-design.md`, whose rules stay in force unless a section here says otherwise.
- Visual plan: a "Hosted beta" page in the "JS - Design" Figma file, drafted before each milestone plan.

## TL;DR

- Hosted beta turns the AGPL app into the paid service with one switch, `HOSTED=true`. With it unset, a self-hosted copy behaves exactly as Core and Prep describe: `/setup` behind `SETUP_TOKEN`, sign-up closed unless `ALLOW_SIGNUP=true`, AI unmetered on the operator's own key.
- Hosted mode adds public sign-up with email verification and password reset (email behind `lib/email`: `fake`, `smtp`, `resend`), Stripe billing behind `lib/billing`, credits, legal pages served from markdown in the repo, a two-step account delete with a verifier, and a minimal owner-only admin page.
- Onboarding: a new user uploads a PDF, DOCX or markdown resume (5 MB) or pastes it. Code extracts the text, a small model proposes the resume markdown, a headline and preferences, and nothing saves until the user reviews it. The file is read in memory and dropped.
- In-app generation writes four documents for people without a terminal: a fit brief, a tailored CV, a cover letter, and a question bank per interview stage. They are `generated` artifacts on the same keys the owner's skills push, run after the response with status and retry, and research that needs web browsing stays outside the app.
- Credits: one integer unit sized to about one US cent of provider cost, a fixed price per task in one file, reserved before every model or TTS call and refunded on failure, a monthly allowance per plan, daily caps per task and a global daily spend cap. At zero, everything that needs no model keeps working.
- Plans, all placeholders: a 14-day trial with 100 credits and no card, Standard at $19 a month with 600 credits, Plus at $39 with 1,800, and Free after a trial or a paid plan ends.
- Hosted beta ships in five milestones, 11 to 15, and assumes Prep's Milestones 6 to 10 are merged first, as the cycle order says; section 9 says what moves if Prep slips.

## 1. Context and goals

Core (cycle 1) is live as a one-user app: `/setup` creates the first account behind `SETUP_TOKEN`, then sign-up closes unless `ALLOW_SIGNUP=true` (`lib/auth/signup-gate.ts`, the `before` hook in `lib/auth/index.ts`). Prep (cycle 2) is specified as Milestones 6 to 10 and not built yet; this cycle assumes all five are merged before Milestone 11 starts, as the cycle order says (section 9 covers a slip). Every owned table already carries `user_id` with `onDelete: cascade` to the user row (`lib/db/schema/*.ts`) and is reached through the scoped helper, so many users can share one database with no schema change.

The business model decided on 2026-09-18 has two halves. The code is public for anyone to self-host with their own database and keys. The paid hosted version is for people who will not open a terminal; its plans include AI credits with fair-use caps, and the goal is a few thousand dollars a month. The owner keeps generating documents with Claude Code skills on his own subscription and pushing them through the bridge. A hosted user has no terminal, so the app has to write those documents for them, meter what that costs, and charge for it. This cycle builds what a stranger needs before paying for Jobsmith and trusting it with a job search: an account they can create and recover, a profile filled from their resume, documents written for them, a plan with credits, a privacy page that names every processor, and a delete that removes everything. It comes now because Prep makes the product worth paying for, and every later cycle (Feed, Apply and Research, Debrief) adds model calls that need a meter.

### Goals

1. A stranger signs up, verifies the address, uploads a resume and has a reviewed profile with suggested preferences in under five minutes.
2. A hosted user without a terminal gets the four documents the owner's skills make most often around an application and an interview.
3. Every model and TTS call on the hosted service is metered, capped and paid for. A runaway account or a bug spends at most the global daily cap.
4. Card data never touches the app, delete removes every row and every stored object, and the privacy page names every third party that receives user data.
5. A self-hosted copy stays as simple as today: no billing, no credits, no email provider required.

### Non-goals for Hosted beta

Research or people notes written in the app, call cards written in the app, filling one unfilled answer, team or coach accounts, social or passkey sign-in, two-factor authentication, credit top-ups, annual plans and coupons, currencies other than USD, a marketing site beyond `/pricing`, changing an account's email address, inactivity deletion, product analytics. Section 12 maps each.

### Success criteria

The five done-when tests in section 9, verified in Chrome and Safari on desktop and at a phone viewport, plus the Core and Prep end-to-end suites passing unchanged in a CI job with `HOSTED` unset.

## 2. Principles

Core's seven principles and Prep's four carry over. Hosted beta adds five.

12. **One codebase, one switch.** `HOSTED=true` adds sign-up, verification, credits, billing, legal pages and admin. With it unset, every hosted-only route returns 404 and every rule in Core and Prep applies as written. A self-hoster never configures Stripe or an email provider to run Jobsmith.
13. **The meter sits only in front of a model or a voice.** Credits gate model calls and TTS. The board, the job page, the bridge, paste, manual intake, the player with browser voices, export and delete work at zero credits on every plan.
14. **Reserve, call, settle.** Credits are taken in the transaction that records the request, before any provider is called, and returned when the call fails. A user never pays for a failed run, and two parallel requests cannot overspend one balance.
15. **Keep the least data.** An uploaded file is read in memory and dropped. Provider payloads (billing events, raw model responses) are never stored; only the artifact a call produces is. After a delete, the app keeps only a 30-day deletion receipt holding a hash of the account id, and the billing provider keeps what the law requires.
16. **Generated text is a draft made from the user's own material.** Prompts forbid invented employers, titles, dates and metrics, code checks what it can, and every generated document is an ordinary artifact the user edits, marks as sent, or replaces with a push.

## 3. Architecture

### Stack additions

| Concern | Choice | Self-host note |
|---|---|---|
| Hosted mode | `lib/hosted`: `HOSTED=true` turns the hosted features on; a production build with it on refuses to boot without every variable those features need (section 5.1) | unset: only the optional email driver and tick secret are read |
| Email | `lib/email`: one `EmailDriver`, drivers `fake`, `smtp` (nodemailer, `SMTP_URL`), `resend` (`RESEND_API_KEY`), picked by `EMAIL_PROVIDER`, off when unset; `EMAIL_FROM` required when on | `smtp` works with any mail server; with no driver, password reset is hidden |
| Billing | `lib/billing`: one `BillingDriver`, drivers `stripe` and `fake`, picked by `BILLING_PROVIDER`, off when unset. Checkout and the Customer Portal are Stripe's own pages. Milestone 15 confirms every API shape against Stripe's current docs, as Core Milestone 1 did with Better Auth | never configured; billing routes return 404 |
| Credits | `lib/credits`: task costs and caps in `lib/credits/costs.ts`, plans in `lib/billing/plans.ts`, a `Meter` injected the way `FitDeps` injects the driver (`lib/fit/deps.ts`): `dbMeter` when hosted, `freeMeter` (allows everything, writes nothing) otherwise | unmetered |
| Writing model | `AI_MODEL_WRITE` beside `AI_MODEL`: the four documents use it, default `anthropic/claude-sonnet-5` through the gateway and `claude-sonnet-5` direct; extraction and scoring stay on `AI_MODEL` (default Haiku 4.5, `lib/ai/config.ts`). `AiRequest` (`lib/ai/driver.ts`) gains an optional `model` field: the driver uses it when present and its configured model otherwise, and `lib/generate` passes `AI_MODEL_WRITE` through it, so one driver instance serves both models and no second singleton exists. Milestone 13 confirms the gateway id and its zero data retention support | any model the operator's key allows |
| Resume text | `unpdf` for PDF text (a pdf.js build with no native code, run with `isEvalSupported: false`), `mammoth` for DOCX to markdown, a UTF-8 read for `.md` and `.txt` | none |
| Scheduled work | `POST /api/jobs/tick` with `Authorization: Bearer <CRON_SECRET>`, every 15 minutes from a Vercel Cron entry in `vercel.ts` on the owner's deployment, from any scheduler or `pnpm jobs:tick` elsewhere. Every step also runs lazily on read, so the tick is a backstop | optional |
| Disposable addresses | a vendored copy of the CC0 `disposable-email-domains` list at `lib/auth/disposable-domains.txt`, refreshed by `pnpm refresh:disposable` | hosted sign-up only |
| UI | Super AI Components `auth-shell` for sign-up, verify and reset; the installed `account-menu` gains a balance line; `credits` for balance and period, `quota` for daily caps and storage, `paywall` for the zero-credit and plan-required states | none |

### Module map additions

```
app/(auth)/ signup/ verify-email/ reset-password/   hosted sign-up, verification, reset
app/(app)/welcome/                 onboarding: upload or paste, review, save
app/(app)/settings/                Account, Plan and credits, Usage; settings/plan (checkout return)
app/(app)/admin/                   owner-only overview, users, user detail
app/(public)/ pricing/ privacy/ terms/   public pages, hosted mode only
app/api/upload/resume/            resume upload and paste (Route Handler, 5 MB cap; server actions stay at 2 MB)
app/api/billing/webhook/  app/api/jobs/tick/  app/dev/billing/checkout/ (fake, non-production)
content/legal/                     privacy.md and terms.md templates
lib/hosted/  lib/legal/            config, boot validation, features(); render, processors, version, cookies
lib/email/                         driver, config, fake, smtp, resend, templates/
lib/onboarding/                    sniff, extract (pdf, docx, text), extract-resume, coverage, draft, save
lib/generate/                      start, run, status, tasks/ (fit-brief, tailored-cv, cover-letter, question-bank)
lib/credits/  lib/billing/         costs, meter, ledger, period, global-day; driver, stripe, fake, plans, webhook, state
lib/account/  lib/admin/  lib/jobs/   delete, verify-deletion; require-admin, queries, actions; tick steps
lib/auth/  lib/ai/                 + disposable domains, address normalization, hosted rules; + writeMarkdown, AI_MODEL_WRITE
```

Core's rules hold: thin routes and actions, `requireUser()` everywhere, every `lib/*` function takes a database handle and a user id. New single writers: `lib/credits/ledger.ts` for `credit_account` and `credit_ledger`, `lib/billing/state.ts` for `subscription`, `lib/generate/run.ts` for `generation`, and `lib/account/delete.ts` is the only code that deletes a user.

## 4. Data model

Hosted beta adds four owned tables, four global tables, and changes three existing ones. Owned tables follow Core's conventions (uuid keys except one-per-user tables, `user_id` text with an index and cascade, `timestamptz` times, one file under `lib/db/scoped/`, a row in the isolation test). Global tables have no scoped helper, are reached only from `lib/billing`, `lib/credits`, `lib/account` and `lib/admin`, and hold no user content.

**subscription** (owned, one per user, `user_id` primary key): `provider` (`stripe`, `fake`), `customer_id` (nullable, unique), `subscription_id` (nullable, unique), `plan` (`trial`, `free`, `standard`, `plus`), `status` (`trialing`, `active`, `past_due`, `canceled`, `none`), `trial_ends_at`, `current_period_start`, `current_period_end`, `cancel_at_period_end` (boolean), `grace_ends_at` (nullable), `synced_at` (last mirror from the provider).

**credit_account** (owned, one per user): `allowance` (integer, at least 0, left in this period), `bonus` (integer, at least 0; comps and carried trial credits, which do not expire), `period_allowance` (what this period granted, for "412 of 600 left"), `period_id` (uuid, new at every period roll), `period_start`, `period_end`, `suspended_at` (nullable), `suspended_reason` (`abuse`, `payment_dispute`, `other`, nullable).

**credit_ledger** (owned, append-only): `kind` (`grant`, `debit`, `refund`, `expire`, `comp`, `carry`), `bucket` (`allowance`, `bonus`), `delta` (signed integer, nonzero), `task` (nullable; a task name from section 5.7), `units` (nullable; characters for `tts`), `generation_id` (nullable, set null), `reservation_id` (uuid, nullable; shared by a debit's rows and their refund rows), `period_id` (the account's period when the row was written), `ref` (nullable; unique per (`user_id`, `ref`): `trial:<user id>`, `invoice:<id>`, `change:<event id>`, `admin:<action id>`), `balance_after` (allowance plus bonus after this row), `actor` (`system`, `billing`, `admin`). Index on (`user_id`, `created_at`).

**generation** (owned): `task` (`extract_resume`, `fit_brief`, `tailored_cv`, `cover_letter`, `question_bank`), `runner` (`app`, its only value; runner-based work lives in cycle 7's `work_request` table), `opportunity_id` (nullable, cascade), `stage_id` (nullable, set null), `status` (`running`, `done`, `failed`), `input_hash` (sha256 over task, scope and the ids and versions of every input), `inputs` jsonb (references only: posting capture time, a resume hash, artifact ids and versions; no input text), `credits` (reserved; 0 when unmetered), `artifact_id` (nullable, set null; the version written), `artifact_key`, `model_id`, `input_tokens`, `output_tokens`, `ms`, `error_code`, `warnings` jsonb (validator codes with short details), `output` jsonb (nullable; only the `extract_resume` draft, cleared on save, discard, or after 24 hours), `retry_of` (nullable, set null), `started_at`, `finished_at`. Indexes on (`user_id`, `status`), (`user_id`, `task`, `created_at`) and (`opportunity_id`).

**billing_event** (global): `provider`, `event_id` (unique with `provider`), `type`, `user_id` (nullable, cascade), `provider_created_at`, `outcome` (`applied`, `ignored`, `unknown_customer`), `processed_at`. The payload is never stored. Rows older than 90 days are deleted by the tick.

**usage_day** (global): `day` (date, primary key, UTC), `credits` (integer), `alerted_at` (nullable).

**deletion_job** (global): `user_id` (text, nullable, cleared once verified), `user_hash` (first 16 hex characters of sha256 over the user id; the storage prefix), `customer_id` (nullable, cleared once verified), `status` (`pending`, `deleting`, `verifying`, `verified`, `failed`), `attempts`, `found` jsonb (table names with row counts and an object count, when verification finds leftovers), `error_code`, `requested_at`, `verified_at`. Deleted 30 days after `verified_at`.

**admin_action** (global): `admin_user_id` (text, set null when that admin is deleted), `target_user_id` (text, cascade, so a deleted user's admin notes go too), `action` (`comp`, `suspend`, `unsuspend`), `amount` (nullable), `reason` (`support`, `beta`, `refund`, `abuse`, `payment_dispute`, `other`), `note` (nullable, at most 200 characters).

Changes: `profile` gains `onboarded_at` (backfilled to the migration time for every existing row), `terms_version` and `terms_accepted_at` (nullable), `email_key` (nullable, unique; the normalized address, hosted only) and `last_seen_on` (date, nullable). `event.kind` gains `artifact_generated` and `research_acknowledged` (section 5.6). Prep's `asset.storage_key` gains the per-user prefix in section 5.10. Better Auth's tables are unchanged; `user.email_verified` already exists.

## 5. Behavior

### 5.1 Hosted mode

`lib/hosted/config.ts` parses `HOSTED` the way `parseAiConfig` parses `AI_PROVIDER`: unset or blank is off, `true` is on, any other value fails boot. A production build with hosted mode on also requires: `EMAIL_PROVIDER` of `smtp` or `resend`, with `EMAIL_FROM`; `BILLING_PROVIDER=stripe` with `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STANDARD` and `STRIPE_PRICE_PLUS`; `AI_PROVIDER` of `gateway` or `anthropic`; `STORAGE_PROVIDER` of `s3` or `vercel_blob` (once Prep Milestone 7 adds `lib/storage`); `ADMIN_EMAILS` with at least one address; `CRON_SECRET` of at least 32 characters; `LEGAL_OPERATOR`, `LEGAL_CONTACT_EMAIL` and `LEGAL_HOSTING`. A missing one fails boot with the variable names through the existing `EnvError` (`lib/env.ts`). Development and test builds accept the `fake` email and billing drivers. `.env.example` lists every new variable with a comment.

| Behavior | `HOSTED=true` | `HOSTED` unset |
|---|---|---|
| First account | `/setup` behind `SETUP_TOKEN` (Core 5.10); it becomes the owner's account | unchanged |
| Later accounts | public `/signup`, behind `SIGNUP_INVITE_CODE` when set; `ALLOW_SIGNUP` is ignored | closed unless `ALLOW_SIGNUP=true` |
| Email verification | required before the first sign-in | off |
| Password reset | on | on when `EMAIL_PROVIDER` is set |
| Onboarding, in-app generation | on, metered | on, unmetered on the operator's key, or the no-AI path |
| Credits, plans, billing, `/pricing`, `/privacy`, `/terms`, terms acceptance, `/admin` (for `ADMIN_EMAILS`) | on | absent: 404 and no menu entries |
| Account deletion | on | on, except for the last account on the instance |
| Storage quota | per plan | none |

Decision: on a self-hosted instance the last account cannot be deleted from the app. Reason: an empty user table reopens `/setup`, and a self-hoster who wants everything gone drops the database, which the README will say. Cost if wrong: one disabled button and one README sentence to change. Pages and actions read `features()` from `lib/hosted`; a hosted-only route calls `notFound()` when its feature is off. Billing and admin entry points in `lib/` check again, since a route is never the only check (Core 5.10).

### 5.2 Email

`EmailDriver.send({ to, template, data }) → Result<{ messageId }, "email_rejected" | "email_rate_limited" | "email_error">`. Templates in `lib/email/templates/` return a subject, plain text, and a minimal HTML version of the same text: `verify_email`, `reset_password`, `signup_existing`, `delete_confirm`, `account_deleted`, `trial_ending`, `payment_failed`, `global_cap_alert` (admins only). Links are built from `APP_URL`; the request's Host header is never read for them. No tracking pixels and no link rewriting: the `resend` driver turns open and click tracking off on every message. `fake` writes each message as a JSON file to `EMAIL_FAKE_DIR` (default `.jobsmith/outbox`), where the end-to-end suite reads verification links, and refuses to load in a production build. `smtp` uses nodemailer with a 10-second timeout. The hosted provider is Resend, confirmed in Milestone 11. One `[email]` log line per send carries user id, template, provider message id and outcome; the address and the text stay out of logs.

### 5.3 Sign-up, verification and password reset

`/signup` (hosted only), on the `auth-shell`: name, email, password (at least 12 characters, `MIN_PASSWORD_LENGTH` in `lib/auth/policy.ts`), the invite code when `SIGNUP_INVITE_CODE` is set, and a required checkbox accepting the terms and the privacy policy. The Better Auth `before` hook gains the hosted rules, in order: the gate (`signUpAllowed(userCount, allowSignup, hosted)`), the invite code (constant-time compare, header `x-invite-code`, the setup token's pattern), disposable domains (the domain and each parent domain against the vendored list), and one live account per address (`profile.email_key`: lower-cased, `+tag` removed for every domain, dots removed for Gmail and Googlemail). Better Auth then creates the user unverified, an after hook writes the `profile` row with `email_key`, `terms_version` and `terms_accepted_at`, and `verify_email` goes out. An account still unverified after 7 days is deleted by the tick, which frees its address. The answer is the same for a new address and a known one: "Check your email." A known address receives `signup_existing`, with links to sign in and to reset the password, so sign-up never reveals who has an account. Milestone 11 confirms how the current Better Auth release supports this through its `requireEmailVerification`, `sendVerificationEmail`, `sendResetPassword` and `revokeSessionsOnPasswordReset` options, as Core Milestone 1 confirmed the library itself.

Verification links last 24 hours. `/verify-email` shows the pending state and "Resend" (once per 60 seconds, 5 per day per account). Sign-in is refused until the address is verified, so an unverified account has no session and can do nothing. Verifying runs one transaction: `subscription` on plan `trial`, status `trialing`, `trial_ends_at` 14 days out; `credit_account` with the trial allowance; one `grant` ledger row with ref `trial:<user id>`. The user lands on `/welcome`.

Password reset: `/reset-password` takes an address and always answers "If an account exists, a link is on its way" (3 requests per hour per address and per client address). The link lasts 60 minutes, sets a new password and revokes every session. On a self-hosted instance with an email driver, `/login` shows the same link. Terms changes: `TERMS_VERSION` in `lib/legal/version.ts` is the effective date. When a signed-in user's `profile.terms_version` differs, the app layout shows a blocking dialog linking both pages with "Accept". Until accepted, only sign-out, export and delete are reachable.

### 5.4 Onboarding from a resume

Route `/welcome`, shown after the first verified sign-in and to any account whose `profile.onboarded_at` is null; "Skip for now" sets it. The migration backfills `onboarded_at`, so the owner and today's self-hosters never see the page unasked. The page works the same on a self-hosted instance, unmetered.

Step 1, the resume. One file, or pasted text of at most 60,000 characters, both sent to a Route Handler, `POST /api/upload/resume`, because `next.config.ts` caps server action bodies at 2 MB on purpose, for the bridge's documents. The handler calls `requireUser()`, refuses a request whose `Origin` is not in `TRUSTED_ORIGINS` (the origin check the framework gives server actions), and reads the body into memory through its own streaming cap of 5 MB (the bridge's pattern, Core D9). The type comes from the first bytes, and the extension must agree: `%PDF-` for PDF; for DOCX a ZIP header, a `word/document.xml` entry and a `[Content_Types].xml` naming the WordprocessingML main part (a `.docm` or any macro part is refused); for `.md` and `.txt`, valid UTF-8 with no NUL bytes. Limits while reading: PDF at most 10 pages and never encrypted; DOCX at most 500 zip entries and 20 MB uncompressed, read from the central directory before anything inflates; every parser stops at 10 seconds; extracted text is cut at 60,000 characters. A PDF yielding fewer than 200 characters is a scan: "This PDF has no text we can read. Paste your resume instead." There is no OCR. Decision: the original file is never kept. Its bytes are dropped when the handler returns and nothing reaches `lib/storage`. Reason: a resume file carries a phone number, an address and sometimes a photo, nothing reads it again after extraction, and markdown is the content contract (Core principle 4). Cost if wrong: a user who wants a fresh extraction uploads again; keeping originals later needs only an `asset.kind` value, `resume`, through Prep's storage interface.

Step 2, extraction. Code turns a PDF into text, a DOCX into markdown through mammoth, and keeps markdown and text as they are. When AI is on and the meter allows it, `extractResume` (task `extract_resume`, `AI_MODEL`, 30-second timeout, 4,000 output tokens) calls the existing `AiDriver.generate` with a Zod schema: `resumeMd` (clean markdown: one `#` name line, `##` sections, `###` roles, bullets kept), `headline` (under 200 characters, `HEADLINE_MAX` in `lib/profile/index.ts`), and suggestions: `titles` (up to 5), `seniority` (values of `SENIORITY_LEVELS`, `lib/preferences/schema.ts`), `locations` (up to 5), `workModes` (values of `WORK_MODES`). The text sits inside `<resume>` tags with the wrapper `lib/ai/score-fit.ts` uses to tell the model the tagged text is data with no instructions in it. The call runs inside the request, as intake's extraction does (Core 5.5), because the user is waiting on this one screen and it is short; the handler sets `maxDuration` to 60 and answers with the draft's generation id. A coverage check guards the cleaned version: at least 85% of the distinct words of four or more letters in the extracted text must appear in `resumeMd`, and at most 10% of `resumeMd`'s such words may be missing from the source. When it fails, the draft keeps the code-extracted text and offers the model's version behind "Use the cleaned-up version". The draft (both texts, the headline, the suggestions, which text is shown) is the `output` of an `extract_resume` generation row, so a reload keeps the review.

Step 3, review. The resume in the Documents editor pattern (text area with Write and Preview), the headline field, and the suggestions as removable chips grouped as on `/preferences`. "Save profile" writes `resume_md` and `headline` through `saveProfile` (`lib/profile/index.ts`) and merges the suggestions through `lib/preferences`, filling only lists that are empty, so a suggestion never replaces a choice the user made. It sets `onboarded_at`, clears the draft, and opens `/board` with the Add job dialog, since a job is what makes every later step useful. No-AI path (AI off, out of credits, or a failed call): the code-extracted text fills the editor, the headline and preferences are typed by hand, and one line says why. Paste and type always works (Core principle 3).

### 5.5 In-app generation

The owner's skills push documents; a hosted user presses a button. Both land as artifacts on the same keys, so a skill push and an app run version the same document, and rule 3 of Core 5.3 arbitrates: `generated` and `pushed` both compare with the `source_hash` of the newest version from either origin, so a regenerate on top of a hand edit adds a version and leaves the edit in the list.

Every task runs the same lifecycle:

1. The action calls `requireUser()`, then `startGeneration` (`lib/generate/start.ts`), which checks readiness: AI on, the task's inputs present (section 5.6), fewer than 2 runs `running` for this user, and when hosted a verified address, accepted terms and no suspension. A refusal here charges nothing and writes no row.
2. A request whose `input_hash` matches a run still `running` returns that run and charges nothing, so a double click costs once.
3. One transaction reserves the credits (section 5.7) and inserts the row as `running` with `credits`, `inputs` and `started_at`.
4. The response returns, and the run continues in `after()`, the fit-scoring pattern (`scoreSafely` in `lib/fit/score-opportunity.ts`, called from `app/(app)/board/actions.ts`): build the prompt from current rows, call `AiDriver.writeMarkdown` with `model` set to `AI_MODEL_WRITE`, normalize (LF endings, trailing spaces, curly quotes and long dashes to ASCII), validate (section 5.6), then in one transaction call `upsertArtifact` with origin `generated`, write an `artifact_generated` event ("Generated CV, version 3"), and set the row `done` with `artifact_id`, `model_id`, tokens and milliseconds. For a question bank, Prep's parser runs inside that transaction (Prep 5.1 covers `generated`).
5. Any failure sets `failed` with an `error_code`, writes the refund, and writes no artifact. Like `scoreSafely`, a run never throws and never leaves a row `running`.

`AiDriver` gains `writeMarkdown({ task, instructions, prompt, maxOutputTokens, timeoutMs, userId, model }) → Result<{ text, modelId, usage }, AiErrorCode>`, built in `lib/ai/sdk-driver.ts` on `generateText` with no output schema (the SDK driver keeps its provider factory, so it can build the model a request names), because a long markdown document inside a JSON string costs extra tokens and breaks on escaping. A reply that stopped at the token limit returns a new code, `ai_truncated`. The fake driver returns one fixed valid document per task and honors a `Fake wait: <ms>` line, as `lib/ai/fake.ts` honors `Fit wait:`. `AI_TASKS` gains the five task names. Long runs: the job page's `maxDuration` rises from 60 to 300 seconds, since `after()` runs within the route's configured maximum (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`). A row still `running` 6 minutes after `started_at` becomes `failed` with `gen_stalled` and is refunded, lazily whenever a page reads it and by the tick, so a dead instance cannot strand a charge.

UI: each tab's document list gets its "Write" actions (section 5.6). The dialog names the inputs it will use ("Your resume, the posting captured 3 Oct, Fit brief version 2"), offers a note of up to 500 characters for the CV and the cover letter, states the cost and balance ("6 credits, 412 left"), and when a version exists says "This adds version 4. Your edits to version 3 stay in the list." While running, the list shows a pending row ("Writing your CV" with elapsed time), polled every 3 seconds up to 110 times: the fit card's rhythm (`FIT_POLL_MS`, `lib/fit/card.ts`) with a ceiling sized for 5 minutes. A failed row shows its reason and "Try again", a new run with `retry_of` set. The version list shows the origin word "Generated" (`ORIGIN_WORDS`, `lib/artifacts/kinds.ts`) and "Generated from fit brief version 2"; a generated version on top of an edited one carries "generated after you edited version N", computed at read time like the pushed notice (Core D14). A screen reader hears "Your CV is ready" through a live region.

### 5.6 The four tasks

These four are what the owner's skills produce around an application and before an interview, and each needs only what the app already holds: the posting, the resume, preferences, the fit result, and any research the user pasted or pushed. Company research and people notes need web browsing and source checking, and a browsing model would fetch addresses chosen at run time, which Core allows only through the fetch guard (Core 7, D19). They stay with the skills, the paste dialog and the cycle 7 request queue. Call cards are built on research about the people on the call, so they wait with it. Decision, an amendment to Core 5.8 (rule 1) and Prep 5.7: a hosted user who cannot run the research skills would see "No research yet" on every interview for good, so that state gains a second action, "Mark as researched". It writes an event of kind `research_acknowledged` on the opportunity through `lib/pipeline`, and `lib/attention` treats that event like a `research` or `people_notes` document, so the item moves on to the confidence line. It is offered to every user, hosted or not, and a fit brief alone still does not count. Reason: the rule exists to send people to research before prep, and research done in a browser tab leaves no document. Cost if wrong: a user can silence the nudge without researching, and the timeline shows when they did.

| Task | Artifact | Inputs, each cut to a limit in characters | Output contract | Checked in code | Credits |
|---|---|---|---|---|---|
| `fit_brief` | kind `fit_brief`, key `fit-brief`, job scope, Research tab | posting 12,000; resume 16,000; headline; preferences summary (`preferencesSummaryLines`); fit result and failed hard filters when present; company notes 2,000; the job's and company's research and people notes 12,000 together | `## What they need`, `## Where you match`, `## Gaps and how to address them`, `## Angle for the application`, `## Questions to ask them`; 400 to 900 words; unknowns stated as unknown | all five headings present, else `ai_bad_output` | 4 |
| `tailored_cv` | kind `cv`, key `cv`, Documents | resume 16,000; posting 12,000; newest fit brief 8,000; note 500 | `# <name from the resume>`, a headline line, `## Summary` (3 to 4 sentences), `## Experience` with `### <Title>, <Company>`, a dates line and 2 to 6 bullets per role in the resume's order, `## Skills`, then only sections the resume has; rewrite and reorder only | each company in an `###` heading appears in the resume; a miss is a warning above the document: "Check: Northwind Labs is not in your resume." | 6 |
| `cover_letter` | kind `cover_letter`, key `cover-letter`, Documents | as the CV, plus the name of a person linked with role `hiring_manager` | "Dear <name>," or "Dear hiring team,", four paragraphs (hook, why me, why them, close), 180 to 300 words, the profile name to sign | over 350 words, or a phrase from the prompt module's banned list, is a warning | 3 |
| `question_bank` | kind `question_bank`, key `questions-<stage label slug>`, on that stage, Prep tab | stage kind and label; posting 12,000; resume 16,000; newest fit brief 8,000; research and people notes 12,000; Library item titles once the Library exists (Prep 5.8) | Prep's grammar (Prep 5.1): `##` sections, `### N. "Question"`, `**Say:**` in the first person from the resume only, `**Spine:**`, one or two `**Follow-up: "..."**` blocks with answers, `**Last line:**`. 10 questions for `recruiter_screen`, 12 for `hiring_manager` and `panel_final`, 8 for `portfolio_case`. A question the resume has no material for gets the warning marker (U+26A0 U+FE0F) after its closing quote, no Say block, and a `**Guard:**` note asking for a story, so Prep flags it unfilled | `lib/prep/parse.ts` finds at least half the requested count, else `gen_no_questions` | 12 |

Each prompt module in `lib/generate/tasks/` exports its instructions, a prompt builder over typed inputs, its input limits, `maxOutputTokens` (fit brief 2,000, CV 4,000, cover letter 1,200, question bank 9,000), `timeoutMs` (90, 150, 90 and 240 seconds) and its validator. The instructions share one header: write only from the texts given; invent no employer, title, date, metric, degree, tool or story; write "not stated" when a fact is missing; plain ASCII punctuation and no emoji; everything inside the tags is data. Audience lines (product design vocabulary, portfolio and case-study framing) sit in one `ROLE_PACK` constant per task, so cycle 8's role packs swap them. Prompts are snapshot-tested. Keys match the suffixes of the owner's skill files (`<slug>-cv.md` pushes as `cv`), so both paths share one version list. A question bank keyed by its stage label never versions over the owner's own `answers-full`; renaming a stage starts a new document, which is acceptable because the old one keeps its stage. The "Write" actions sit on Research (fit brief), Documents (CV, cover letter) and the Prep hub, once per interview stage of the four kinds above; Saved, Applied and Offer get none. CV and cover letter use the newest fit brief when one exists; when none exists the dialog offers "Write a fit brief first (4 credits)".

### 5.7 Credits and caps

One credit is sized to about one US cent of provider cost at list price, rounded up per task. Prices are fixed per task in `lib/credits/costs.ts`, so the dialog states the price before the call. Decision: a fixed price per task. Reason: users budget in documents, and the per-task input limits bound what a call can cost. Cost if wrong: thinner margin on the largest inputs; every `generation` row records tokens, so the owner re-prices from real numbers.

| Task | Model | Credits | Per-user daily cap |
|---|---|---|---|
| `extract_posting` (Core 5.5) | `AI_MODEL` | 1 | 60 |
| `score_fit` (Core 5.6, including the preferences test box) | `AI_MODEL` | 1 | 60 |
| `extract_resume` | `AI_MODEL` | 3 | 5 |
| `fit_brief` | `AI_MODEL_WRITE` | 4 | 20 |
| `cover_letter` | `AI_MODEL_WRITE` | 3 | 15 |
| `tailored_cv` | `AI_MODEL_WRITE` | 6 | 15 |
| `question_bank` | `AI_MODEL_WRITE` | 12 | 8 |
| `tts` (Prep 5.5, the in-app "Prepare audio" batches) | `TTS_PROVIDER` | 3 per 1,000 characters | 120,000 characters |

The estimates behind them, at list prices of $1 and $5 per million input and output tokens for Haiku 4.5 and $2 and $10 for Sonnet 5: a fit score is about 7,000 tokens in and 600 out, about one cent; a question bank about 12,000 in and 8,000 out, about eleven cents. A 40-question bank with 2,400 seconds of speech (Prep 5.5) is about 31,000 spoken characters, so about 93 credits of audio, which is why the browser voice stays free. The CLI audio path (`jobsmith audio`) synthesizes on the user's machine and costs no credits; its uploads count toward storage.

Buckets: `allowance` resets every period; `bonus` holds comps and trial credits carried into a paid plan, and never expires. A debit takes from `allowance` first, then `bonus`, one ledger row per bucket touched. Reservation (`lib/credits/meter.ts`), one transaction: lock the user's `credit_account` row (`SELECT ... FOR UPDATE`); roll the period when `period_end` has passed on a trial or Free plan; refuse a suspended account (`suspended`); count today's (UTC) debits for this task against its cap (`cap_task_day`) and all of today's debits against the plan's daily credit cap (`cap_day`); add to the global day with one `INSERT ... ON CONFLICT (day) DO UPDATE ... WHERE usage_day.credits + n <= cap RETURNING`, the single-statement guard Core D4 uses for the bridge limit (`cap_global`); check the balance (`no_credits`); debit and write the ledger rows. Every reservation writes its debit rows with one `reservation_id`, the bucket and the `period_id`. A refund writes mirror rows for the same reservation id, bucket and period id with the opposite delta, so the per-bucket split comes from the rows themselves, and takes the amount back off `usage_day`. When the account's `period_id` has moved on since the debit, the allowance part of the refund goes to `bonus` instead, so a refund never inflates a new period's allowance and is never lost. A TTS batch reserves for its planned characters and afterwards refunds the reserve minus `ceil(doneChars × 3 / 1000)`, returning the bonus part first, the reverse of the debit order. Cost if wrong: a run that fails across a period boundary leaves a few credits in `bonus` that never expire; recomputing the split instead would credit the wrong bucket whenever a comp or a grant landed between the debit and the refund. Intake extraction and fit scoring reserve and settle around their existing calls; a refused reservation behaves exactly as AI off does today (company and role typed by hand; `fit_status` `none`), with the reason shown.

`CREDITS_GLOBAL_DAILY_CAP` (default 20,000, about $200) is the circuit breaker across all users. Crossing 80% sends `global_cap_alert` to the admins once per day. At the cap, every metered call answers `cap_global` ("Writing is paused for everyone until 00:00 UTC") and the rest of the app keeps working. At zero: the `paywall` piece replaces the dialog's button with the way forward ("Upgrade" on Trial and Free; "Credits renew on 14 Nov" on a paid plan, with Plus offered), intake asks for company and role, fit cards say "Out of credits", and Prep's hub plays with browser voices. The account menu shows the balance through the `credits` piece and switches to its warning tone below 20% of the period's allowance. Self-host: `freeMeter` allows every call and writes nothing; there are no `credit_account` rows and no caps. `generation` rows are still written, with `credits` 0, for status and retry.

### 5.8 Plans and billing

| Plan | Price | Credits per period | Daily credit cap | Storage | How |
|---|---|---|---|---|---|
| `trial` | free, no card | 100 over 14 days | 40 | 250 MB | verifying a new account |
| `free` | free | none | 0 | 100 MB | a trial or a paid plan ends |
| `standard` | $19 a month | 600 | 150 | 2 GB | Checkout |
| `plus` | $39 a month | 1,800 | 400 | 5 GB | Checkout |

Storage counts artifact bodies and Prep assets (`sum(octet_length(body_md))` plus `sum(asset.bytes)`, computed at write). Over quota, writes that add bytes (push, paste, audio, generation) return `quota_storage`; reading, deleting and export keep working. A full Standard allowance costs at most about $6 in model and voice calls, a third of the price before Stripe's fee, and about 150 Standard subscribers meet the few-thousand-a-month goal.

`BillingDriver`: `createCheckout({ userId, email, plan, successUrl, cancelUrl }) → Result<{ url }>`, `createPortal({ customerId, returnUrl }) → Result<{ url }>`, `verifyWebhook(rawBody, headers) → Result<BillingEvent, "bad_signature" | "unsupported">`, `getSubscription(id)`, `cancelNow(subscriptionId)`, `deleteCustomer(customerId)`, `customerExists(customerId)`. `BillingEvent` is the app's own union (`checkout_completed`, `subscription_changed`, `invoice_paid`, `invoice_failed`, `subscription_ended`); the Stripe driver maps `checkout.session.completed`, `customer.subscription.created`, `.updated` and `.deleted`, `invoice.paid` and `invoice.payment_failed` onto it, and the Stripe SDK is imported only inside that driver. Better Auth's Stripe plugin keeps its own subscription table and grant logic, and grants here belong to the ledger, so Jobsmith writes a small driver of its own; Milestone 15 compares the two against current docs and records the choice. Checkout: `/pricing` and Settings call `startCheckout(plan)`, which creates the Stripe customer on first use (email, `metadata.userId`) and a Checkout Session in subscription mode with `client_reference_id` set to the user id, success URL `/settings/plan?checkout=done`, cancel URL `/pricing`. The return page grants nothing: it polls the `subscription` row every 3 seconds for 60 seconds and shows "Confirming with Stripe" until a webhook has applied the change. Card entry, tax and receipts happen on Stripe's pages, and no Stripe script loads on any Jobsmith page, so the content security policy gains no third-party source. "Manage billing" opens the Customer Portal (payment method, invoices, plan change, cancel).

Webhooks: `proxy.ts` runs its session-cookie redirect on every path except `_next`, `favicon.ico` and `api/bridge/`, so Milestone 15 adds `api/billing/webhook` to the matcher's exclusion list, which also keeps the proxy from buffering the raw body the signature covers; signature verification is then the route's only guard, and an integration test calls it with no cookie and expects its own 401 and no redirect. `POST /api/billing/webhook` reads the raw body (1 MB cap), verifies the signature with a 300-second tolerance (a missing or bad signature answers 401), and in one transaction inserts `billing_event (provider, event_id)` with `ON CONFLICT DO NOTHING`; an existing row means the event was applied, answered 200. On any subscription event the handler fetches the subscription from Stripe and mirrors it, so events that arrive out of order converge on Stripe's current state. Grants carry a ledger `ref`, unique per user, as a second guard. A processing error rolls back and answers 500, so Stripe retries. An event for an unknown customer is recorded as `unknown_customer` and answered 200.

Transitions. Checkout completed on Trial or Free: the plan is set, unused trial allowance moves to `bonus` (a `carry` row), and the first paid invoice grants the plan's allowance. A paid renewal invoice expires the remaining allowance and grants the new one. An upgrade from Standard to Plus applies at once, Stripe prorates the charge, and the 1,200-credit difference is granted at once. A downgrade from Plus to Standard is scheduled for the period end through the portal settings, so the next renewal grants 600. A failed payment sets `past_due` and `grace_ends_at` 7 days out and shows a banner with "Update card"; the current allowance stays usable and is not renewed until an invoice is paid. When grace ends unpaid, or a canceled plan reaches its period end, the plan becomes `free`, the allowance expires, and `bonus` and data stay. A trial with no plan after 14 days becomes `free`, with `trial_ending` sent 3 days before. No refund is automatic; the owner refunds in the Stripe dashboard and comps credits in admin. The self-host build excludes all of it: with billing off, `/pricing`, `/settings/plan`, the webhook and the fake checkout return 404, and `lib/billing` is never imported at runtime. The `fake` driver serves `/dev/billing/checkout` in development and test builds only, with "Pay" and "Fail payment" buttons that post events signed with a test secret to the same webhook route and verification.

### 5.9 Legal pages, cookies and the data map

`content/legal/privacy.md` and `content/legal/terms.md` are templates rendered at `/privacy` and `/terms` (public, hosted only) through Core's renderer (Core D21). Placeholders are filled at render time: `{{operator}}` and `{{contact}}` from `LEGAL_OPERATOR` and `LEGAL_CONTACT_EMAIL`, `{{effective}}` from `TERMS_VERSION`, and `{{processors}}`, a table built from the configured drivers plus `LEGAL_HOSTING` (the host and database provider), so any hosted copy lists its own processors. The repo carries no operator's name. Cookies, stated on the privacy page and enforced in code: Jobsmith sets only the sign-in cookies Better Auth needs, which are strictly necessary, and runs no analytics, advertising or third-party script on any page, public or signed in, so there is no consent banner. Stripe's pages run on Stripe's domain under Stripe's policy. An end-to-end test compares the cookie names after sign-up, sign-in and checkout with the allowlist in `lib/legal/cookies.ts`; a new cookie fails CI until the list and the page change together.

| Data | Stored in | Third parties that receive it | Kept until |
|---|---|---|---|
| Account: email, name, password hash, sessions | Postgres (Neon on the owner's deployment) | the email provider: the address and message text of verification, reset and notices | deletion |
| Profile, resume, preferences, jobs, stages, people, events, artifacts, Prep questions, marks and library | Postgres | AI Gateway with zero data retention, routing to Anthropic: only the inputs sections 5.4 and 5.6 list, per call | deletion |
| Audio clips and recordings (Prep) | Vercel Blob, private, under the user's prefix | the TTS provider: spoken text only | deletion |
| An uploaded resume file | memory, for one request | none | the end of the request |
| The onboarding draft | `generation.output` | AI Gateway, as above | save, discard or 24 hours |
| Plan, status, period dates, Stripe customer and subscription ids | Postgres | Stripe: email, payment method, billing address, invoices | deletion in the app; Stripe keeps invoices and payments as the law requires |
| Credit ledger, generation metadata (tokens, model, times) | Postgres | none | deletion |
| Request logs: ids, codes, IP address, user agent | the host (Vercel) | none | the host's log retention |

### 5.10 Account deletion

Settings, Account, "Delete account". Step 1 is a dialog: what goes (counts of jobs, documents and audio clips), "Download my data first" (the Core export, `lib/export/collect.ts`), the current password, and on a paid plan "Your subscription ends now, with no refund for the rest of the period." Step 2: with an email driver, a `delete_confirm` link valid for 60 minutes (3 requests per day); with none (self-host), typing "delete my account" in the same dialog. Milestone 11 decides whether Better Auth's `deleteUser` with `sendDeleteAccountVerification` drives these two steps, as long as confirmation hands over to `lib/account/delete.ts`.

Confirmation runs `lib/account/delete.ts`:

1. One transaction inserts the `deletion_job` (`user_id`, `user_hash`, `customer_id`) and deletes every session, so every device is signed out at once.
2. In `after()`: cancel the subscription at once and delete the Stripe customer; delete every object under `u/<user_hash>/`, then any key an `asset` row still names; delete `verification` rows whose identifier is the address; delete the `user` row, which cascades to every owned table; send `account_deleted` to the address, held in memory only.
3. Verify: count rows for the user id in every table with a `user_id` column, listed from `information_schema.columns` at run time so a table added in a later cycle cannot be missed, plus `user.id`; list the storage prefix; ask the billing driver whether the customer exists. All empty sets `verified` and clears `user_id` and `customer_id`. Anything found sets `failed` with `found`; the tick retries up to 5 times, an hour apart, and admin lists the job.

Decision: deletion is final at confirmation, with no undo window. Reason: an undo window keeps data the user asked to remove, and step 1 offers the export. Cost if wrong: an accidental delete cannot be undone; the emailed confirmation is the guard. Decision: nothing about a deleted account is kept to block a second trial. Reason: a hash of an address is still personal data, and a repeat trial costs at most 100 credits, about $1, behind a verified inbox. Cost if wrong: trial abuse by delete and re-sign-up, visible in admin's sign-ups per day. Storage prefix, a change to the Prep spec: object keys become `u/<user_hash>/tts/<random 32 hex>.mp3` (recordings take the same prefix), and Prep's `Storage` interface gains `list(prefix)` and `deletePrefix(prefix)` across its four drivers. Reason: the verifier can prove an empty prefix, which also catches objects whose `asset` row was lost. Prep is not built, so its Milestone 7 builds keys this way; if it ships first, a one-time script re-keys the objects.

### 5.11 Admin

`/admin`, `/admin/users` and `/admin/users/[id]`, behind `requireAdmin()` in `lib/admin`: `requireUser()`, a verified address, and the address in `ADMIN_EMAILS`, checked in every page and action. Decision: an env allowlist. Reason: one owner, no migration, and no app bug can grant the role by writing a row. Cost if wrong: adding an admin needs a redeploy. Better Auth's admin plugin is left out, since it brings impersonation and user-row roles.

Overview: sign-ups per day for 30 days with the verified share, active trials, paid subscribers per plan, credits spent today against the global cap and this month per task, failed generations today per error code, pending and failed deletion jobs. Users: search by email; each row shows created, verified, plan and status, balance, spent this period, last seen (`profile.last_seen_on`, written at most once a day by the app layout) and suspension. User detail: the last 50 ledger rows and the last 50 generations' metadata (task, status, credits, model, tokens, duration), plus two actions: "Comp credits" (1 to 1,000 into `bonus`, with a reason and a note) and "Suspend" or "Unsuspend" (with a reason). Suspension is the abuse flag: a suspended account keeps sign-in, reading, export and delete, and loses metered calls, uploads and bridge writes. Every action writes `admin_action`; a comp also writes a `comp` ledger row with ref `admin:<action id>`. Admin shows no user content. `lib/admin` runs aggregate and metadata queries only, and a unit test fails when any of them selects `body_md`, `resume_md`, `posting_md`, `notes_md`, `outcome_md` or `generation.output`. Left for later: charts and cohorts, refunds and plan changes from the app (the Stripe dashboard does both), messages to users, more roles.

### 5.12 Abuse and limits

- Sign-up: 3 per hour per client address and 20 per hour in the shared bucket for requests with no trusted address, the split Core uses for sign-in (`signInRateLimitRule`, `lib/auth/policy.ts`), through Better Auth's database-backed limiter. The invite code holds the beta to people the owner invites. Disposable domains are refused; one live account per normalized address. Before verification there is no session, so no upload, token, push or model call, and trial credits arrive only at verification.
- Generation: per-task and per-plan daily caps, 2 concurrent runs per user, the global cap, suspension.
- Uploads: type by content, size, page and entry limits, parser timeouts (section 5.4). Bytes are never stored or served back, so a hostile file can reach only a parser running with eval off and fixed limits, and no virus scan is needed while that holds.
- Bridge: token creation needs a verified address, pushes count toward storage, and the 120-per-minute limit stands (Core D4).
- Outbound requests: the fetch guard in `lib/intake` stays the only code path that fetches a user-supplied address. The new outbound calls go to fixed hosts from operator config (Stripe, the email provider, the AI Gateway, the TTS provider) and take no URL from user input; email links and Stripe return URLs come from `APP_URL`.

### 5.13 Maintenance tick

`POST /api/jobs/tick` (constant-time bearer check against `CRON_SECRET`, 401 for a missing or wrong bearer, 404 when the secret is unset) is added to the `proxy.ts` matcher's exclusion list in Milestone 11, so the bearer check is its only guard; an integration test calls it with no cookie and expects its own 401 and no redirect to `/login`. It runs these steps, each bounded to 50 items so a run stays under 60 seconds: settle `running` generations older than 6 minutes; clear `extract_resume` drafts older than 24 hours; delete accounts left unverified for 7 days; end expired trials and grace periods; send `trial_ending` 3 days before a trial ends; run pending deletion jobs and retry failed ones; delete verified deletion jobs after 30 days and `billing_event` rows after 90; send the global cap alert; compare the ledger sum with the balance for 50 accounts and log `credits_mismatch` on a difference. Pages and reservations settle the same states lazily when they read them, so a self-hosted instance with no scheduler loses nothing.

### 5.14 Settings and export

Settings gains Account (email, change password, delete), Plan and credits (hosted: plan, status and period, the `credits` piece with "412 of 600 left" plus bonus, `quota` pieces for today's caps and storage, Upgrade or Manage billing) and Usage (the last 30 days of ledger rows in words: "Tailored CV, Product Designer at Acme, 6 credits"). Export (`lib/export/collect.ts`) adds `subscription` (plan, status, period and trial dates; no provider ids), `creditLedger` and `generations` (metadata, no drafts), and its version goes up by one.

## 6. Error handling

- Generation failures carry a code (`ai_timeout`, `ai_bad_output`, `ai_truncated`, `ai_error`, `gen_no_questions`, `gen_stalled`), refund their credits, write no artifact, and show the reason with "Try again". Refusals before the reservation (`ai_off`, `no_resume`, `no_posting`, `busy`, `suspended`, `terms_required`, `no_credits`, `cap_task_day`, `cap_day`, `cap_global`, `quota_storage`) charge nothing and write no row. Validator warnings are stored on the row and shown above the document; they never block the write.
- Onboarding: `upload_too_large`, `upload_type`, `upload_encrypted`, `upload_too_many_pages`, `upload_no_text` and `upload_timeout` keep the page open with the paste box focused, and a refused or failed extraction falls back to the code-extracted text. Email: a failed send on sign-up or reset says "We could not send the email. Try again in a minute." and the account stays unverified and can resend.
- Billing: a missing or bad signature answers 401; a processing error answers 500 for the provider's retry; a Checkout return with no webhook after 60 seconds says the page updates once Stripe confirms. A Stripe outage leaves the app usable except Checkout and the portal, which say so.
- Credits and deletion: balance and ledger change in one transaction, and the tick's comparison catches drift and logs it for the owner. Once a deletion is confirmed, the sessions are gone even if a later step fails; failures retry and show in admin.
- Logs: `[gen]`, `[credits]`, `[billing]`, `[email]` and `[delete]` lines carry ids, codes, counts, model ids, tokens and milliseconds. Resume, posting and document text, addresses and provider payloads stay out of them.

## 7. Security and privacy

- The four owned tables go through the scoped helper and join the isolation test; global tables are reached only from their modules and hold no user content. Hosted-only routes return 404 when off, and billing and admin entry points in `lib/` check again.
- The webhook verifies a signature over the raw body with a tolerance and stores event ids for idempotency; the tick checks a bearer secret; neither reads a session cookie. Sign-up and reset never reveal whether an address has an account, and a reset revokes every session.
- Every user text in a prompt sits inside tags with the data wrapper, generated markdown renders through the sanitized renderer and is never executed or fetched, and upload parsers run with eval off, size limits and timeouts on bytes that are never stored. The upload handler takes the session cookie, so it checks `Origin` itself.
- Every gateway call asks for zero data retention, for both models. Milestone 13 confirms the writing model accepts it; when the gateway refuses, the run fails with `ai_error` and nothing goes out.
- Stripe, email and tick secrets live only in env and are listed in `.env.example`, where the CI secret scan covers them. The data map in section 5.9 is the source for the privacy page's processor table, and admin cannot read content (section 5.11).

## 8. Testing

Test-driven for everything under `lib/`, as in Core and Prep.

- **Unit:** hosted config parsing and boot validation as a table; `features()`; email templates and link building from `APP_URL`; address normalization; disposable domains with parent domains; file sniffing on synthetic fixtures (a real PDF, a renamed one, an encrypted one, a scanned one, a DOCX, a DOCM, a zip bomb, text with a NUL byte); the coverage check; each task's prompt snapshot, input limits and validator; punctuation normalization; costs and caps; reservation across buckets; refunds mirrored by reservation id, including one across a period roll; period roll with a fixed clock; TTS refund math; billing transitions as a table of cases; Stripe event mapping; the terms version gate; the cookie allowlist; the admin column test.
- **Integration (PGlite with the real migrations):** isolation across the four owned tables; two parallel reservations against a balance that covers one, exactly one succeeds; the global cap under parallel calls; refunds; the same webhook twice and webhooks out of order; deletion across every table found through `information_schema` with the `memory` storage driver, leaving zero rows and zero objects; the trial grant at verification; the webhook and the tick called with no cookie answer their own 401 and no redirect; export additions; `freeMeter` writes nothing.
- **End to end (Playwright, Chromium and WebKit, desktop and phone):** a `hosted-*` project chain with `HOSTED=true` and the fake email, billing, AI and storage drivers: sign up, read the link from the outbox, verify, onboard from the PDF fixture, write a CV and see version 1 marked Generated, edit it, regenerate and see version 2 with the notice, spend to zero and meet the paywall, pay through the fake checkout and see 600 credits, delete the account and fail to sign in. The Core and Prep suites run unchanged in a separate job with `HOSTED` unset.
- **Live, opt-in:** Stripe test mode through `stripe trigger` when a test key is present, Resend with a test address, and one real run per task when an AI key is present, as Core's live smoke test.
- **Accessibility:** axe on every new route in light and dark; keyboard-only sign-up, onboarding and the generate dialog; live-region announcements for finished runs and credit refusals.

## 9. Milestones

Numbering continues from Prep. One implementation plan per milestone, each preceded by its Figma drafts. Prerequisite: Prep Milestones 6 to 10 are merged before Milestone 11 starts, as the cycle order says. Milestone 13's question bank needs Prep's parser (Milestone 6). Milestone 14's playback test depends on Prep Milestone 7 (Voice), and its storage quota sums Prep's `asset.bytes`. If Prep slips, Milestone 13 ships the other three tasks and the bank follows, and Milestone 14 ships the credit ledger and the quota (over artifact bodies until `asset` exists) without the playback test, which moves to the first milestone after Prep lands.

| # | Name | Scope | Done when |
|---|---|---|---|
| 11 | Accounts | `lib/hosted` and boot validation, `lib/email` with three drivers, `/signup`, verification, reset, invite code, disposable list, normalized addresses, sign-up limits, the `profile` columns, terms acceptance, legal pages and the cookie allowlist, deletion with the verifier, the storage prefix rule, the tick with its `proxy.ts` matcher exclusion, the self-host CI job | On the preview, a stranger signs up, verifies from the email, signs in, resets the password and deletes the account, and the deletion job reads verified; the Core suite passes with `HOSTED` unset |
| 12 | Onboarding | `/welcome`, sniffing and limits, PDF, DOCX and text extraction, `extract_resume` with the coverage check, the draft, review and save, the no-AI path, the `onboarded_at` backfill | Fictional resumes as PDF, DOCX and markdown each become a saved profile with a headline and suggested titles, a scanned PDF asks for pasted text, and with AI off the paste path saves |
| 13 | Generation | `writeMarkdown` and `AI_MODEL_WRITE`, the `generation` table, `lib/generate` with the four tasks, prompts and validators, `after()` runs, polling, retry, stalled runs, `artifact_generated`, the generated-after-edit notice, `maxDuration` 300, "Mark as researched"; unmetered | On a job with a posting and a resume, all four documents are written by the fake driver in CI and by the real model on the preview, the question bank shows as Prep rows, and a regenerate after a hand edit adds a version and keeps the edit |
| 14 | Credits | `credit_account`, `credit_ledger`, `usage_day`, costs and caps, the meter in intake, fit, generation and TTS batches, the trial grant, the zero-credit states with the `credits`, `quota` and `paywall` pieces, storage quota, admin with comp and suspend | A trial account holding 10 credits writes a CV, is refused a second one by the paywall, still adds a job by hand and plays a bank with browser voices; a failed run refunds; the ledger sum equals the balance for every account in the integration suite |
| 15 | Billing | `lib/billing` with `stripe` and `fake`, plans, `/pricing`, Checkout, the portal, idempotent webhooks with the route's `proxy.ts` matcher exclusion, transitions and grace, cancellation in deletion, the launch checklist (zero data retention confirmed for both models, legal text reviewed, live keys, the global cap set) | In Stripe test mode, a trial user buys Standard and gets 600 credits, an upgrade grants 1,200 at once, a failed renewal shows grace and then drops to Free, replaying every webhook changes nothing, and deleting a paid account cancels its subscription |

Each milestone ends with a preview link, a pass in Chrome and Safari and the test suites green.

## 10. Port sources and licensing

| Source | What Hosted beta takes | Where |
|---|---|---|
| career-ops-web `lib/ai/gateway.ts`, `lib/ai/modes/*.ts` | the two-tier model idea (a primary model for writing, a fast one for scoring; the client itself was ported in Core Milestone 4), and recording tokens and cost per call | `AI_MODEL_WRITE` in `lib/ai/config.ts`, the `generation` token columns, the admin view |
| career-ops-web `lib/ai/prompts/resume-tailor.ts`, `lib/ai/schemas/resume.ts` | the CV rules (never invent, reorder for the posting, lead each role with its strongest match, plain ASCII punctuation, a keyword only where a proof point supports it) and the section shape | `lib/generate/tasks/tailored-cv.ts` |
| career-ops-web `lib/ai/prompts/cover-letter.ts` | four paragraphs under 300 words, one concrete design artifact named, the banned-phrase list, here also checked in code | `lib/generate/tasks/cover-letter.ts` |

Nothing comes from `lib/ai/prompts/oferta.ts`, whose name and shape follow the upstream career-ops evaluation mode that the no-upstream rule keeps out, and the prototype has no resume parsing, so onboarding extraction is new code. The prototype is the owner's and unlicensed, so what it gives is relicensed under AGPL-3.0. New dependencies: `unpdf` (MIT), `mammoth` (BSD-2-Clause), `nodemailer` (MIT-0), `resend` (MIT), `stripe` (MIT), and the `disposable-email-domains` list (CC0-1.0), all compatible with AGPL-3.0. Design system: `auth-shell`, `credits`, `quota` and `paywall` from the registry join the installed list in `docs/design-system.md`; the upload drop zone and the pending generation row are new code recorded under "New application code" when the registry has no match.

## 11. Assumed until the owner says otherwise

1. Plans: a 14-day trial with 100 credits and no card, Standard at $19 a month with 600 credits, Plus at $39 with 1,800, then Free; USD and monthly only. Storage: 250 MB on Trial, 2 GB on Standard, 5 GB on Plus, 100 MB on Free.
2. One credit is about one US cent of provider list cost. Task prices and per-task daily caps are the section 5.7 table, TTS costs 3 credits per 1,000 characters, plan daily caps are 40, 150 and 400, and the global daily cap is 20,000 credits with an alert at 80%.
3. Stripe is the billing provider, with Stripe Tax handling sales tax and VAT. A merchant of record (Paddle or Lemon Squeezy) is the alternative if the owner would rather not register for tax himself; `BillingDriver` allows either.
4. Resend is the hosted email provider, and the hosted TTS provider is Prep's `gemini` driver, which the TTS price assumes; a costlier provider means a higher per-character price.
5. The writing model is Sonnet 5 through the gateway with zero data retention; extraction and scoring stay on Haiku 4.5.
6. The four tasks, their keys, and the question counts per stage kind are as in section 5.6; research, people notes and call cards stay outside the app.
7. The original resume file is never kept; upload limits are 5 MB, 10 pages and 60,000 characters, and the coverage check needs 85%.
8. Deletion is final at the emailed confirmation, cancels the subscription with no refund, and keeps nothing to block a repeat trial.
9. Admins come from `ADMIN_EMAILS`, are metered like everyone, and comp themselves.
10. The beta opens behind one shared `SIGNUP_INVITE_CODE`.
11. Grace lasts 7 days; an upgrade applies at once with the difference granted; a downgrade waits for the period end; unused trial credits carry into `bonus`; no refund is automatic.
12. A tick every 15 minutes and a 300-second `maxDuration` fit the owner's Vercel plan; on a plan with daily cron only, the lazy paths carry the load.
13. The legal pages are templates the owner has reviewed before launch; the operator's name and contact come from env.
14. Link lifetimes: verification 24 hours, reset 60 minutes, delete confirmation 60 minutes; an unverified account is deleted after 7 days. Sign-up allows 3 per hour per client address.
15. Self-hosted instances get onboarding and in-app generation unmetered, and cannot delete their last account from the app.

## 12. After Hosted beta

The cycle table in Core section 12 stands. Hosted beta moves these out:

| Item | Where it goes |
|---|---|
| Company research and people notes written in the app with a provider's web search tool, and call cards built on them | a decision after the beta; until then the skills, the paste dialog, and cycle 7 |
| Choosing where each document is written: a runner, later from Claude Code, or in the app with credits | cycle 7, which owns that choice and its `work_request` table. The user picks the path for every document and nothing falls back on its own; both paths write artifacts through the same upsert rules and show in the same place on the job page. `generation` stays the record of in-app runs only |
| Filling one unfilled answer, or editing a bank question by question (handed here by Prep) | cycle 6, with debrief suggestions, which need the same per-question write path |
| Bulk scoring of feed postings | cycle 4, through the same meter with its own daily cap |
| PDF and DOCX export of generated CVs and letters | cycle 5 |
| Prompts for roles beyond product design | cycle 8 swaps each task's `ROLE_PACK` |
| Credit top-ups, annual plans, coupons, more currencies, email change, passkeys, two-factor, social sign-in | after the beta, ordered and priced from real usage |
| Inactivity deletion of Free accounts | an owner decision after the beta, written into the privacy page before it applies |
| Team and coach accounts, product analytics | not planned; the privacy page promises no analytics |
| A marketing site | its own project; `/pricing` is the only public product page here |
