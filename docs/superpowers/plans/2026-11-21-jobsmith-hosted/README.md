# Jobsmith Hosted: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A stranger signs up, verifies the address, uploads a resume, gets four generated documents, spends metered credits, pays through Stripe and can delete everything, while a self-hosted copy with `HOSTED` unset behaves exactly as Core and Prep describe.

**Architecture:** One switch, `HOSTED=true`, read by `lib/hosted` (`features()`), turns on public sign-up, email verification, credits, billing, legal pages and admin. Email, billing and credits sit behind small interfaces with `fake` drivers, so every task runs in CI with no outside account: `lib/email` (`fake`, `smtp`, `resend`), `lib/billing` (`stripe`, `fake`), `lib/credits` (`dbMeter`, `freeMeter`). Generation runs after the response in `after()` on `generated` artifacts, onboarding extracts resume text in memory and keeps no file, and a Postgres transaction that locks the user's `credit_account` row is the only place credits move.

**Tech stack additions:** `unpdf`, `mammoth`, `nodemailer`, `resend`, `stripe` (all runtime), the vendored CC0 list `disposable-email-domains` as a text file, and `@types/nodemailer` (dev). Pin each at install time and record the version in the task report; the spec names no version. The `ai` SDK packages already installed stay as they are.

**Spec:** `docs/superpowers/specs/2026-11-01-jobsmith-hosted-design.md`, all sections (1 to 12). Core spec sections 2, 3, 4 and 8 and the Prep spec sections 4, 5.1 and 5.5 carry over.

The plan folder holds this README (the contract) and one file per milestone: `m11-accounts.md`, `m12-onboarding.md`, `m13-generation.md`, `m14-credits.md`, `m15-billing.md`. A name, signature or copy string in this README is binding character for character; a task that departs from it is a defect unless it says so.

## Status on 2026-11-21

**Already built (real paths):**
- Core milestones 1 to 5 and a demo sign-in. Auth: `lib/auth/index.ts` (Better Auth with a `before` hook on `/sign-up/email`), `lib/auth/signup-gate.ts` (`signUpAllowed(userCount, allowSignup)`), `lib/auth/policy.ts` (`MIN_PASSWORD_LENGTH`, `signInRateLimitRule`), `lib/auth/session.ts` (`getUser`, `requireUser`), `lib/auth/setup-token.ts`, `lib/auth/users.ts` (`countUsers`), `proxy.ts` (`PUBLIC_PATHS = ["/login", "/setup"]`, matcher excludes `api/bridge/`).
- Demo sign-in: `lib/demo/create.ts` (`createDemoAccount`), `lib/demo/policy.ts` (`DEMO_EMAIL_DOMAIN = "demo.invalid"`), `lib/demo/signup-key.ts` (`DEMO_SIGNUP_HEADER`), `app/(auth)/login/demo-button.tsx`, `demo-action.ts`.
- AI: `lib/ai/driver.ts` (`AiDriver.generate`, `AI_TASKS = ["extract_posting", "score_fit"]`), `lib/ai/config.ts` (`parseAiConfig`), `lib/ai/index.ts` (`driverFromConfig`, `getAiDriver`, `GATEWAY_PROVIDER_OPTIONS` with zero data retention), `lib/ai/sdk-driver.ts` (`createSdkDriver`), `lib/ai/fake.ts` (`createFakeDriver`, `FAKE_DEFAULTS`), `lib/ai/extract-posting.ts`, `lib/ai/score-fit.ts`.
- Fit and intake: `lib/fit/deps.ts` (`FitDeps = { ai, now }`, `fitDeps()`), `lib/fit/score-opportunity.ts` (`queueFitScoring`, `scoreOpportunity`, `scoreSafely`), `lib/fit/card.ts` (`FIT_POLL_MS`, `FIT_POLL_MAX`), `lib/intake/add-job.ts` (`addJob`), `lib/intake/deps.ts`.
- Data: `lib/db/schema/{auth,app,pipeline,artifact,api-token}.ts`, `lib/db/scoped/*` with `Scoped` and `scopedFor`, migrations `0000` to `0003` in `lib/db/migrations`, `lib/artifacts/upsert.ts` (`applyUpserts`, `upsertArtifacts`, origin `generated` already allowed), `lib/artifacts/plan.ts` (`versionNotice`), `lib/artifacts/kinds.ts` (`ORIGIN_WORDS`), `lib/export/collect.ts` (`collectExport`, `EXPORT_VERSION = 1`), `lib/attention/{items,load}.ts`, `lib/profile/index.ts` (`HEADLINE_MAX`, `saveProfile`), `lib/preferences/schema.ts` (`SENIORITY_LEVELS`, `WORK_MODES` via `lib/pipeline/values.ts`).
- Tests and CI: `tests/helpers/db.ts` (`makeTestDb`, `createTestUser`), `tests/integration/scoped-isolation.test.ts`, `tests/integration/migrations.test.ts`, `tests/e2e/*`, `playwright.config.ts` (one server, `AI_PROVIDER=fake`), `.github/workflows/ci.yml` (jobs `build`, `e2e`, `gitleaks`).
- Nothing from this spec. No `lib/hosted`, `lib/email`, `lib/credits`, `lib/billing`, `lib/generate`, `lib/onboarding`, `lib/account`, `lib/admin`, `lib/legal`, no `generation`, `subscription`, `credit_*`, `usage_day`, `billing_event`, `deletion_job` or `admin_action` table.

**Depends on:**
- Milestone 11: needs Prep milestone 7 (`2026-11-21-jobsmith-prep` milestone 07) for `lib/storage` (Task 11 adds `list` and `deletePrefix`). If Prep has not shipped, skip Task 11, wire `storage: null` in Task 12, and the verifier skips the storage check; the account still deletes. Everything else in Milestone 11 needs only Core.
- Milestone 12: needs Milestone 11 (sign-in redirect to `/welcome`, hosted gate). No Prep dependency.
- Milestone 13: needs Milestone 12 (the `generation` table, see decision D2). The `question_bank` task needs Prep milestone 6 (`lib/prep/parse.ts`, the rebuild hook in the artifact write path). If Prep milestone 6 has not shipped, Task 29 ships only `tailored_cv` and `lib/generate/tasks/question-bank.ts` is left out; the registry in `lib/generate/tasks/index.ts` lists three tasks and the Prep hub button is not rendered.
- Milestone 14: needs Milestone 13. Task 44 (TTS batches) and the playback test in Task 50 need Prep milestone 7; Task 45 sums `asset.bytes` only when the `asset` table exists (Prep milestone 7), otherwise artifact bodies only. If Prep has not shipped, Tasks 44 and the playback step of Task 50 move to the first milestone after Prep lands.
- Milestone 15: needs Milestone 14 (credit ledger, `lib/billing/state.ts`, plans). Task 57 needs Milestone 11's `lib/account/delete.ts`.

**Needs an account, a paid service, hosting or the owner's answer:**
- Resend account, a verified sending domain and `EMAIL_FROM`: live check of Task 4, preview done-when of Task 15. Tasks 3, 4 (unit part), 6 to 14 run on the `fake` driver.
- SMTP server: only for the opt-in live check of Task 4; nothing in CI.
- Vercel project environment for the preview: `HOSTED`, `ADMIN_EMAILS`, `CRON_SECRET` (at least 32 characters), `LEGAL_OPERATOR`, `LEGAL_CONTACT_EMAIL`, `LEGAL_HOSTING`, `SIGNUP_INVITE_CODE`, a private Blob store: Task 15 preview check, Task 23, Task 35, Task 50, Task 59.
- Owner's answers that are placeholders in code and read from one named constant: plan names, prices, credits and caps (`lib/billing/plans.ts`, `lib/credits/costs.ts`, Task 37); `TERMS_VERSION` effective date (`lib/legal/version.ts`, Task 9); the one shared `SIGNUP_INVITE_CODE` value (Task 6); the operator name, contact address and hosting names (`LEGAL_*`, Task 9); `ADMIN_EMAILS` (Task 1, Task 48); the cover letter banned-phrase list, ported from the owner's prototype `lib/ai/prompts/cover-letter.ts` (Task 28: the executor needs read access to that file, otherwise the list stays empty and the owner supplies it).
- The upstream CC0 `disposable-email-domains` list: Task 5 fetches it once with network access (tests use a small test list); no fabricated list is committed.
- AI Gateway key and zero data retention support for `anthropic/claude-sonnet-5`: live check of Task 25, real-model runs in Tasks 35 and 50. The fake driver covers CI.
- TTS provider key (the `gemini` driver assumed by the price) for the live check of Task 44.
- Stripe account in test mode, two Products with monthly Prices (`STRIPE_PRICE_STANDARD`, `STRIPE_PRICE_PLUS`), a webhook endpoint secret (`STRIPE_WEBHOOK_SECRET`), the Customer Portal configured (payment method, invoices, plan change with downgrade at period end, cancel), and the tax decision (Stripe Tax, or a merchant of record): Tasks 51 to 59. Tasks 51 (fake), 53 to 56 run on the `fake` driver and recorded Stripe payloads; Task 52's live check, Task 55's real Checkout and Task 59's `stripe trigger` run need the account.
- Legal text review (privacy page and terms) by the owner or a lawyer, zero data retention confirmed for both models, live Stripe keys, the global cap set, the cron plan check (15-minute tick on the owner's Vercel plan): launch checklist, Task 58. None of these block a task from merging.
- The spec asks for Figma drafts before each milestone plan. None were made for this plan.

## Decisions made in this plan

Where the spec leaves a choice or two sections disagree, this plan picks one. Each line: the choice, the reason, the cost if wrong. The first owner question is raised in the final report.

- **D1. `subscription` is created in Milestone 14, not 15.** The trial grant, plan daily caps and the storage quota need the plan at read time. `lib/billing/state.ts` starts in Milestone 14 with `startTrial`; Milestone 15 adds the transitions. Cost: Milestone 15 has no migration for it, only for `billing_event`.
- **D2. The `generation` table is created in Milestone 12.** Onboarding's draft is the `output` of an `extract_resume` generation row (spec 5.4), so the table cannot wait for Milestone 13, which the spec's scope row names. Milestone 13 owns `lib/generate`.
- **D3. Fake drivers are gated by `JOBSMITH_ALLOW_FAKE_DRIVERS=true`.** The hosted end-to-end server runs `pnpm start`, a production build, yet needs the `fake` email and billing drivers, while the spec says `fake` refuses to load in production. With `VERCEL_ENV=production` the flag is ignored and boot fails. Cost: one more variable, listed in `.env.example` as test-only.
- **D4. `Meter` methods take a database handle and `Scoped` gains `readonly db: Db`.** Reservation must run in the same transaction as the `generation` insert (spec 5.5 step 3), and a transaction handle is a `Db`. Cost: code under `lib/` can reach the handle through `s.db`; `app/` and `components/` still never import the client.
- **D5. A refunded reservation does not count toward `cap_task_day` or `cap_day`.** A provider outage should not lock a user out for the day. Cost: a loop of failing calls is bounded only by the 2 concurrent runs rule and the global cap.
- **D6. The first account (made through `/setup`) is marked verified at creation.** It has no inbox to prove and the setup token is its proof; `requireAdmin()` needs a verified address. It still receives the trial grant. Cost: none.
- **D7. `HOSTED=true` with `DEMO_MODE=true` fails boot.** Demo accounts use `@demo.invalid` and skip verification, so they would reach metered calls on the owner's key. Cost: the public demo stays on a separate unhosted deployment. This is an owner question.
- **D8. The hosted end-to-end suite has its own config and database.** `playwright.hosted.config.ts` starts a server on port 3100 with `HOSTED=true` against database `jobsmith_hosted`; `playwright.config.ts` and the Core and Prep suites are unchanged and run with `HOSTED` unset in a separate CI job.
- **D9. The deletion verifier skips `deletion_job.user_id`.** That column holds the id until verification clears it, so counting it would fail every run. The verifier lists `information_schema.columns` for the name `user_id` in schema `public`, minus table `deletion_job`, plus `user.id`.
- **D10. The Prep storage prefix needs no change.** Prep 5.5 already builds `u/<first 16 hex of sha256(user_id)>/`; spec 5.10 calls it a Prep change. Only `Storage.list(prefix)` and `Storage.deletePrefix(prefix)` are new. `user_hash` equals that prefix's hash part.
- **D11. A generation whose body equals the newest generated or pushed source is `unchanged`.** The row ends `done`, points at the existing version, writes no event and no credits are kept back (the run is paid). Cost: a rare charge for no new version, shown as "Nothing new to add. This matches version N."
- **D12. `googlemail.com` is not rewritten to `gmail.com` in `email_key`.** The spec removes dots for both domains and nothing more. Cost: one person can hold a gmail and a googlemail account.
- **D13. The Better Auth options named in the spec are confirmed by reading the installed package in Task 6, not assumed.** No `node_modules` existed when this plan was written. If an option is missing the task falls back to its own server action, as the task says.
- **D14. The forced redirect to `/welcome` runs only when hosted.** The Core and Prep end-to-end suites sign in with accounts whose `onboarded_at` is null and must pass unchanged with `HOSTED` unset. A self-hosted user reaches the page from a link in Settings, Profile. Cost: a fresh self-hosted install is not walked through onboarding.
- **D15. A plan whose `dailyCap` is 0 (Free) does not apply `cap_day`.** The balance check then decides, so a Free user holding carried `bonus` credits can spend them and one with none gets `no_credits` and the paywall. Cost: Free has no daily limit beyond its `bonus` balance.
- **D16. The `tts` per-task daily cap is measured in characters from net credits spent today** (`net credits * 1000 / 3`), so a partial refund frees cap. Cost: none.
- **D17. A debit's ledger rows carry `units` on the first row only,** so a reservation touching two buckets is not double counted.
- **D18. An account with no `credit_account` row gets a Free account with 0 credits at its first reservation** (the owner's account made before this cycle, or any account the trial hook missed). It meets the paywall until the owner comps credits in admin.
- **D19. `lib/credits/costs.ts` and the `Meter` seam are built in Milestone 13,** because generation reserves through the seam before the database meter exists (`freeMeter` until Milestone 14 switches `getMeter()`).

## Global Constraints

- Never commit to or push `main`. One branch per milestone, named `feat/mNN-<slug>` and cut from `main`: `feat/m11-accounts`, `feat/m12-onboarding`, `feat/m13-generation`, `feat/m14-credits`, `feat/m15-billing`. Each merges before the next is cut.
- Next.js 16 has breaking changes: read the relevant guide under `node_modules/next/dist/docs/` before writing any Next API code (`AGENTS.md`).
- `requireUser()` in every page, action and handler. Exceptions the spec names: public hosted pages (`/signup`, `/verify-email`, `/reset-password`, `/pricing`, `/privacy`, `/terms`), `POST /api/billing/webhook` (signature), `POST /api/jobs/tick` (bearer secret), `/dev/billing/checkout` (fake, non-production). Admin pages call `requireAdmin()`, which calls `requireUser()` first.
- `app/` and `components/` never import `@/lib/db/client`.
- Every `lib/*` function takes a database handle and a user id (a `Scoped`, or a `Db` and a `userId`). Global tables have no scoped helper and are reached only from `lib/billing`, `lib/credits`, `lib/account` and `lib/admin`.
- Single writers: `lib/credits/ledger.ts` for `credit_account` and `credit_ledger`; `lib/billing/state.ts` for `subscription`; `lib/generate/run.ts` for `generation` status changes after the insert; `lib/account/delete.ts` is the only code that deletes a user; plus Core's `lib/pipeline`, `lib/artifacts`, and Prep's `lib/prep/marks.ts` and `lib/audio/segments.ts`.
- Typed `Result` (`lib/result.ts`) for expected failures. Tests first for everything under `lib/`.
- No test touches the network. Outbound calls go through injected drivers (`fake` email, billing, AI, storage, TTS) or `MockLanguageModelV4` from `ai/test`. The Stripe SDK is imported only inside `lib/billing/stripe.ts`; `lib/ai` is the only app code importing `ai` or `@ai-sdk/*`.
- Fixtures are fictional (company Northwind Traders, fictional people) and carry no pay figures. No key-like literals: build keys at runtime, for example `"k".repeat(24)`; webhook secrets in tests are built the same way.
- No exclamation marks in UI copy or prose. Semantic token utilities only and `pnpm check:tokens` stays green. Registry component first, then `base-nova`, then new code, recorded in `docs/design-system.md`.
- Accessibility: axe zero violations in light and dark on every new route (`tests/e2e/axe.ts`, `scanForViolations`); keyboard-only passes for sign-up, onboarding and the generate dialog; live-region announcements via `useAnnounce`.
- Every new owned table gets a file under `lib/db/scoped/` and a row in `tests/integration/scoped-isolation.test.ts`. Global tables get no scoped file and are not in the isolation test; their tests call their own module.
- Logs: `[gen]`, `[credits]`, `[billing]`, `[email]` and `[delete]` lines carry ids, codes, counts, model ids, tokens and milliseconds. Resume, posting and document text, addresses and provider payloads stay out. Drizzle errors log the constructor name plus Postgres `code` and `constraint` only.
- Provider payloads (billing events, raw model responses) are never stored. An uploaded resume file is never written anywhere.
- Hosted-only routes call `notFound()` when `features()` says the feature is off, and the `lib/` entry points check again.
- Forms go through `lib/forms/submit.ts`; times through `LocalTime`; `React.useId()` ids; `break-words` on long strings; Select `items`; explicit Zod messages; comments state reasons and never cite decision ids; commit trailer from the session; git config untouched.
- Tests that pass for the wrong reason are the known risk: a test marked "mutation check" is proven by making the named change, watching it fail and reverting, and the task report says so.

## Review Focus

1. **Two parallel reservations against a balance that covers one.** Exactly one must succeed; the loser leaves no ledger row and no `usage_day` change. Pinned by Task 39 (PGlite parallel test, mutation check removing `FOR UPDATE`) and the global-cap variant in Task 39.
2. **A refund after a period roll or a comp.** The allowance part must return to `bonus` once the account's `period_id` has moved on, never inflate the new allowance, and never refund twice. Pinned by Task 40 (refund table with a roll, a second refund call, a TTS partial refund) and the ledger-sum invariant in Task 36.
3. **Webhooks replayed, out of order, or arriving with no cookie.** Same event twice changes nothing; an older event never overwrites newer Stripe state; the route answers its own 401, not a redirect to `/login`. Pinned by Tasks 53 and 54.
4. **A hostile resume file.** A renamed PDF, an encrypted PDF, a DOCM, a zip bomb and text with a NUL byte are refused by content before any parser inflates or runs; nothing is stored. Pinned by Tasks 17, 18 and 20.
5. **Account deletion that leaves rows or objects behind.** The verifier lists every table with a `user_id` column at run time, so a table from a later cycle cannot be missed, and a leftover sets the job `failed`. Pinned by Task 12 (adds a throwaway table in the test) and Task 57 (paid account).

## Module map

### Milestone 11: Accounts

| File | New/changed | One responsibility |
|---|---|---|
| `lib/hosted/config.ts` | new | `parseHostedConfig`, `validateHostedBoot`, fake-driver gate |
| `lib/hosted/features.ts` | new | `features()` read by pages, actions and `lib/` entry points |
| `lib/env.ts` | changed | `Env.HOSTED`, `Env.EMAIL`, `Env.BILLING`, `Env.CRON_SECRET` through `parseEnv` |
| `lib/db/schema/hosted.ts` | new | `deletionJob` (and later global tables) |
| `lib/db/schema/app.ts` | changed | `profile` gains `emailKey`, `termsVersion`, `termsAcceptedAt`, `lastSeenOn` |
| `lib/db/scoped/profile.ts` | changed | `setEmailKey`, `acceptTerms`, `touchLastSeen`, `getByEmailKey` helpers |
| `lib/email/{driver,config,fake,smtp,resend,links,log,index}.ts` | new | `EmailDriver`, three drivers, links from `APP_URL`, `[email]` log line |
| `lib/email/templates/*.ts` | new | eight templates returning subject, text, html |
| `lib/auth/address.ts` | new | `normalizeAddress`, `isDisposableDomain`, vendored list loader |
| `lib/auth/disposable-domains.txt` | new | vendored CC0 list |
| `scripts/refresh-disposable.ts` | new | `pnpm refresh:disposable` |
| `lib/auth/hosted-signup.ts` | new | invite code, disposable, one live account per address |
| `lib/auth/signup-gate.ts`, `policy.ts` | changed | hosted argument, `signUpRateLimitRule` |
| `lib/auth/after-verify.ts` | new | `afterVerified` hook (Milestone 14 adds the trial grant) |
| `lib/auth/index.ts` | changed | verification, reset, hosted hooks, rate rule, delete options if used |
| `app/(auth)/signup/*`, `verify-email/*`, `reset-password/*` | new | public hosted pages and actions |
| `proxy.ts` | changed | public paths, matcher excludes `api/jobs/tick` |
| `content/legal/{privacy,terms}.md` | new | templates |
| `lib/legal/{render,processors,version,cookies}.ts` | new | placeholder fill, processor table, `TERMS_VERSION`, cookie allowlist |
| `app/(public)/{privacy,terms}/page.tsx` | new | public legal pages |
| `components/legal/terms-gate.tsx`, `app/(app)/layout.tsx` | new/changed | blocking terms dialog |
| `lib/storage/*` | changed (from `2026-11-21-jobsmith-prep` milestone 07) | `list(prefix)`, `deletePrefix(prefix)` on four drivers |
| `lib/account/{delete,verify-deletion,ports,user-hash}.ts` | new | deletion steps 1 to 3 |
| `app/(app)/settings/*`, `components/settings/account-section.tsx` | changed/new | Account section, delete dialog |
| `app/api/jobs/tick/route.ts`, `lib/jobs/{tick,steps}.ts`, `scripts/tick.ts` | new | maintenance tick |
| `vercel.ts`, `.github/workflows/ci.yml`, `playwright.hosted.config.ts` | changed/new | cron entry, jobs, hosted e2e |

### Milestone 12: Onboarding

| File | New/changed | One responsibility |
|---|---|---|
| `lib/db/schema/app.ts`, `schema/generation.ts` | changed/new | `profile.onboardedAt`, `generation` table |
| `lib/db/scoped/generation.ts`, `scoped/index.ts` | new/changed | `s.generation` (insert, getById, update, clearOutput) |
| `lib/onboarding/sniff.ts` | new | type by first bytes, extension agreement, DOCX central directory limits |
| `lib/onboarding/extract.ts` | new | PDF (unpdf), DOCX (mammoth), text to extracted text with limits |
| `lib/onboarding/coverage.ts` | new | the 85 and 10 percent word check |
| `lib/onboarding/extract-resume.ts` | new | `extractResume` model call with schema |
| `lib/onboarding/draft.ts` | new | the draft as `generation.output`, read, discard, 24-hour expiry |
| `lib/onboarding/save.ts` | new | `saveOnboarding` |
| `app/api/upload/resume/route.ts` | new | upload and paste handler |
| `app/(app)/welcome/*`, `components/onboarding/*` | new | the three steps |
| `tests/helpers/{pdf,zip,resume-fixtures}.ts` | new | synthetic PDF, zip and DOCX builders |

### Milestone 13: Generation

| File | New/changed | One responsibility |
|---|---|---|
| `lib/credits/meter.ts`, `lib/credits/costs.ts` | new | `Meter` interface, `freeMeter`, `getMeter()`; task prices, caps, `costOf` |
| `lib/db/scoped/index.ts` | changed | `Scoped.db` |
| `lib/ai/{driver,config,sdk-driver,fake,index}.ts` | changed | `writeMarkdown`, `AiRequest.model`, `AI_MODEL_WRITE`, `ai_truncated`, task names |
| `lib/generate/{values,hash,normalize,limits}.ts` | new | constants, `inputHash`, punctuation normalization, input clipping |
| `lib/generate/tasks/{fit-brief,cover-letter,tailored-cv,question-bank,index}.ts` | new | prompt modules and validators |
| `lib/generate/start.ts`, `run.ts`, `status.ts` | new | lifecycle |
| `lib/artifacts/upsert.ts`, `plan.ts` | changed | no `artifact_pushed` event for `generated`, notice words |
| `lib/pipeline/values.ts`, `schema/pipeline.ts` | changed | event kinds `artifact_generated`, `research_acknowledged` |
| `lib/pipeline/research.ts` | new | `markResearched` |
| `lib/attention/load.ts` | changed | `research_acknowledged` counts as research |
| `components/generate/*`, tab components | new/changed | Write dialog, pending row, failed row, live region |

### Milestone 14: Credits

| File | New/changed | One responsibility |
|---|---|---|
| `lib/db/schema/{credits,subscription,hosted}.ts` | new/changed | `subscription`, `credit_account`, `credit_ledger`, `usage_day` |
| `lib/db/scoped/{subscription,credit-account,credit-ledger}.ts` | new | scoped helpers |
| `lib/billing/plans.ts` | new | plans, prices, caps per plan |
| `lib/credits/{period,ledger,global-day}.ts`, `meter.ts` (changed) | new/changed | period math, single writer, global guard, `dbMeter` behind the Milestone 13 seam |
| `lib/billing/state.ts` | new | `startTrial`, `planFor` |
| `lib/quota/storage.ts` | new | `storageUsed`, `checkStorageQuota` |
| `lib/admin/{require-admin,queries,actions}.ts`, `app/(app)/admin/*` | new | admin pages |
| `components/credits/*`, `components/super-ai/{auth-shell,credits,quota,paywall}.tsx` | new | registry pieces and wrappers |
| `lib/export/collect.ts` | changed | `subscription`, `creditLedger`, `generations`, version 2 |

### Milestone 15: Billing

| File | New/changed | One responsibility |
|---|---|---|
| `lib/billing/{driver,fake,stripe,index,events}.ts` | new | `BillingDriver`, `BillingEvent`, two drivers |
| `lib/db/schema/hosted.ts` | changed | `billingEvent` |
| `lib/billing/webhook.ts`, `app/api/billing/webhook/route.ts` | new | idempotent handler and route |
| `lib/billing/state.ts` | changed | transitions |
| `lib/billing/checkout.ts`, `app/(public)/pricing/*`, `app/(app)/settings/plan/*`, `app/dev/billing/checkout/*` | new | Checkout, portal, return page, fake checkout |
| `lib/jobs/steps.ts` | changed | trial and grace ends, `trial_ending`, event purge |
| `lib/account/delete.ts` | changed | billing cancel and customer delete |
| `docs/launch-checklist.md`, `README.md`, `.env.example` | new/changed | launch checklist and hosted docs |

## Contract

### Hosted switch and environment (Milestone 11, Task 1)

```ts
// lib/hosted/config.ts
export type HostedConfig = {
  adminEmails: string[];          // lower-cased, from ADMIN_EMAILS (comma separated)
  cronSecret: string | null;
  inviteCode: string | null;      // SIGNUP_INVITE_CODE
  operator: string | null;        // LEGAL_OPERATOR
  contactEmail: string | null;    // LEGAL_CONTACT_EMAIL
  hosting: string | null;         // LEGAL_HOSTING
  globalDailyCap: number;         // CREDITS_GLOBAL_DAILY_CAP, default 20000
  allowFakeDrivers: boolean;      // fakeDriversAllowed(source): VERCEL_ENV is not "production" and (NODE_ENV is not "production" or JOBSMITH_ALLOW_FAKE_DRIVERS is "true")
  strict: boolean;                // the negation of allowFakeDrivers
};
export function parseHostedConfig(source: Record<string, string | undefined>):
  { ok: true; config: HostedConfig | null } | { ok: false; invalid: string[] };   // unset or blank HOSTED: config null; "true": on; any other value: invalid ["HOSTED"]
export function missingForHostedBoot(source: Record<string, string | undefined>, config: HostedConfig): string[];  // names, [] when strict is false
// lib/hosted/features.ts
export type Features = { hosted: boolean; publicSignup: boolean; emailVerification: boolean; passwordReset: boolean; credits: boolean; billing: boolean; legal: boolean; admin: boolean; storageQuota: boolean; };
export function features(source?: Env): Features;   // billing = hosted and BILLING_PROVIDER set; passwordReset = hosted or EMAIL_PROVIDER set
```

Environment variables, all listed in `.env.example` with a comment: `HOSTED`, `EMAIL_PROVIDER` (`fake`, `smtp`, `resend`), `EMAIL_FROM`, `SMTP_URL`, `RESEND_API_KEY`, `EMAIL_FAKE_DIR` (default `.jobsmith/outbox`), `BILLING_PROVIDER` (`stripe`, `fake`), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STANDARD`, `STRIPE_PRICE_PLUS`, `STORAGE_PROVIDER`, `ADMIN_EMAILS`, `CRON_SECRET`, `LEGAL_OPERATOR`, `LEGAL_CONTACT_EMAIL`, `LEGAL_HOSTING`, `SIGNUP_INVITE_CODE`, `CREDITS_GLOBAL_DAILY_CAP`, `AI_MODEL_WRITE`, `JOBSMITH_ALLOW_FAKE_DRIVERS` (test only). A strict hosted boot requires: `EMAIL_PROVIDER` of `smtp` or `resend` with `EMAIL_FROM`; `BILLING_PROVIDER=stripe` with `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STANDARD`, `STRIPE_PRICE_PLUS`; `AI_PROVIDER` of `gateway` or `anthropic`; `STORAGE_PROVIDER` of `s3` or `vercel_blob` (checked only when `lib/storage` exists); `ADMIN_EMAILS` with one address; `CRON_SECRET` of at least 32 characters; `LEGAL_OPERATOR`, `LEGAL_CONTACT_EMAIL`, `LEGAL_HOSTING`. A missing one joins `EnvError`'s name list. `HOSTED=true` with `DEMO_MODE=true` is invalid (D7).

### Email (Task 3)

```ts
export const EMAIL_PROVIDERS = ["fake", "smtp", "resend"] as const;
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number];
export type EmailTemplateName = "verify_email" | "reset_password" | "signup_existing" | "delete_confirm" | "account_deleted" | "trial_ending" | "payment_failed" | "global_cap_alert";
export type EmailData = {
  verify_email: { name: string; url: string };
  reset_password: { url: string };
  signup_existing: { signInUrl: string; resetUrl: string };
  delete_confirm: { url: string };
  account_deleted: Record<string, never>;
  trial_ending: { endsOn: string; pricingUrl: string };
  payment_failed: { portalUrl: string; graceEndsOn: string };
  global_cap_alert: { used: number; cap: number };
};
export type EmailMessage = { [T in EmailTemplateName]: { to: string; template: T; data: EmailData[T] } }[EmailTemplateName];
export type EmailErrorCode = "email_rejected" | "email_rate_limited" | "email_error";
export interface EmailDriver { readonly name: EmailProvider; send(message: EmailMessage): Promise<Result<{ messageId: string }, EmailErrorCode>>; }
export function renderEmail<T extends EmailTemplateName>(template: T, data: EmailData[T]): { subject: string; text: string; html: string };
export function appLink(path: string, query?: Record<string, string>): string;   // built from env().APP_URL, never a Host header
export function getEmailDriver(): EmailDriver | null;                            // null when EMAIL_PROVIDER unset
```

Link lifetimes: verification 24 hours, reset 60 minutes, delete confirmation 60 minutes. `fake` writes `<ISO time>-<template>-<8 hex>.json` into `EMAIL_FAKE_DIR` holding `{ to, template, subject, text, links }`, and refuses to load when `strict` is true. The `smtp` timeout is 10 seconds. `resend` sends with open and click tracking off.

### Auth rules (Tasks 5 to 6)

```ts
// lib/auth/address.ts
export function normalizeAddress(email: string): string;   // lower-case, "+tag" removed for every domain, dots removed from the local part for gmail.com and googlemail.com
export function isDisposableDomain(email: string, list?: ReadonlySet<string>): boolean;   // the domain and each parent domain
// lib/auth/signup-gate.ts
export function signUpAllowed(userCount: number, allowSignup: boolean, hosted?: boolean): boolean;   // userCount === 0 || hosted === true || allowSignup
// lib/auth/policy.ts
export function signUpRateLimitRule(hasClientAddress: boolean): { window: number; max: number };   // window 3600; max 3 with an address, 20 without
// lib/auth/hosted-signup.ts
export type HostedSignUpError = "invite_required" | "invite_wrong" | "disposable_domain" | "address_taken";
export async function checkHostedSignUp(db: Db, input: { email: string; inviteProvided: string | undefined; inviteConfigured: string | null; list?: ReadonlySet<string> }): Promise<Result<{ emailKey: string }, HostedSignUpError>>;
export const INVITE_HEADER = "x-invite-code";
// lib/auth/after-verify.ts
export async function afterVerified(db: Db, userId: string, now: Date): Promise<void>;   // Milestone 14 adds startTrial
```

Terms: `TERMS_VERSION` in `lib/legal/version.ts`. Profile columns: `email_key` (text, nullable, unique), `terms_version` (text, nullable), `terms_accepted_at` (timestamptz, nullable), `last_seen_on` (date, nullable), `onboarded_at` (timestamptz, nullable, backfilled to the migration time).

### Tables (spec section 4 is binding; Drizzle export names)

`schema.subscription` (owned, primary key `user_id`): `provider` (`stripe`, `fake`), `customer_id` (nullable, unique), `subscription_id` (nullable, unique), `plan` (`trial`, `free`, `standard`, `plus`), `status` (`trialing`, `active`, `past_due`, `canceled`, `none`), `trial_ends_at`, `current_period_start`, `current_period_end`, `cancel_at_period_end` (boolean), `grace_ends_at` (nullable), `synced_at`.
`schema.creditAccount` (owned, primary key `user_id`): `allowance` (integer, check at least 0), `bonus` (integer, check at least 0), `period_allowance`, `period_id` (uuid), `period_start`, `period_end`, `suspended_at` (nullable), `suspended_reason` (`abuse`, `payment_dispute`, `other`, nullable).
`schema.creditLedger` (owned, append-only, uuid key): `kind` (`grant`, `debit`, `refund`, `expire`, `comp`, `carry`), `bucket` (`allowance`, `bonus`), `delta` (nonzero), `task` (nullable), `units` (nullable), `generation_id` (nullable, set null), `reservation_id` (uuid, nullable), `period_id` (uuid), `ref` (nullable, unique per (`user_id`, `ref`)), `balance_after`, `actor` (`system`, `billing`, `admin`). Index (`user_id`, `created_at`).
`schema.generation` (owned, uuid key): `task` (`extract_resume`, `fit_brief`, `tailored_cv`, `cover_letter`, `question_bank`), `runner` (`app`), `opportunity_id` (nullable, cascade), `stage_id` (nullable, set null), `status` (`running`, `done`, `failed`), `input_hash`, `inputs` jsonb, `credits`, `artifact_id` (nullable, set null), `artifact_key`, `model_id`, `input_tokens`, `output_tokens`, `ms`, `error_code`, `warnings` jsonb, `output` jsonb (nullable), `retry_of` (nullable, set null), `started_at`, `finished_at`. Indexes (`user_id`, `status`), (`user_id`, `task`, `created_at`), (`opportunity_id`).
Global, no scoped helper: `schema.billingEvent` (`provider`, `event_id`, unique together; `type`, `user_id` nullable cascade, `provider_created_at`, `outcome` of `applied`, `ignored`, `unknown_customer`, `processed_at`), `schema.usageDay` (`day` date primary key, `credits`, `alerted_at`), `schema.deletionJob` (`user_id` nullable, `user_hash`, `customer_id` nullable, `status` of `pending`, `deleting`, `verifying`, `verified`, `failed`, `attempts`, `found` jsonb, `error_code`, `requested_at`, `verified_at`), `schema.adminAction` (`admin_user_id` set null, `target_user_id` cascade, `action` of `comp`, `suspend`, `unsuspend`, `amount`, `reason` of `support`, `beta`, `refund`, `abuse`, `payment_dispute`, `other`, `note` at most 200 characters).
Event kinds: `EVENT_KINDS` and the `event_kind_check` constraint gain `artifact_generated` and `research_acknowledged`.

### AI additions (Milestone 13, Task 25)

```ts
// Task 19 adds extract_resume first; Task 25 adds the other four. The final list:
export const AI_TASKS = ["extract_posting", "score_fit", "extract_resume", "fit_brief", "tailored_cv", "cover_letter", "question_bank"] as const;
export type AiErrorCode = "ai_timeout" | "ai_bad_output" | "ai_error" | "ai_truncated";
export type AiRequest<T> = { /* existing fields */ model?: string };        // driver uses it when present
export type WriteRequest = { task: AiTask; instructions: string; prompt: string; maxOutputTokens: number; timeoutMs: number; userId: string; model?: string };
export interface AiDriver { /* existing */ writeMarkdown(request: WriteRequest): Promise<Result<{ text: string; modelId: string; usage: AiUsage }, AiErrorCode>>; }
// lib/ai/config.ts: AiConfig gains modelWrite: string; defaults gateway "anthropic/claude-sonnet-5", anthropic "claude-sonnet-5", fake "fake-writer"
```

### Generation (Milestone 13)

```ts
// lib/generate/values.ts
export const GENERATION_TASKS = ["extract_resume", "fit_brief", "tailored_cv", "cover_letter", "question_bank"] as const;
export type GenerationTask = (typeof GENERATION_TASKS)[number];
export type WriteTask = Exclude<GenerationTask, "extract_resume">;
export type StartError = "ai_off" | "no_resume" | "no_posting" | "busy" | "suspended" | "terms_required" | "no_credits" | "cap_task_day" | "cap_day" | "cap_global" | "quota_storage" | "not_found" | "invalid";
export type RunErrorCode = "ai_timeout" | "ai_bad_output" | "ai_truncated" | "ai_error" | "gen_no_questions" | "gen_stalled";
export type GenWarning = { code: "cv_company_not_in_resume" | "letter_too_long" | "letter_banned_phrase"; detail: string };
export const MAX_RUNNING_PER_USER = 2;
export const STALE_RUN_MS = 6 * 60_000;
export const GENERATION_POLL_MS = 3_000;      // equals FIT_POLL_MS
export const GENERATION_POLL_MAX = 110;
export const NOTE_MAX = 500;
export const ARTIFACT_KEYS = { fit_brief: "fit-brief", tailored_cv: "cv", cover_letter: "cover-letter" } as const;   // question_bank: `questions-${stageLabelSlug(label)}`
// lib/generate/start.ts
export type GenerateDeps = { ai: AiDriver | null; meter: Meter; now: () => Date; modelWrite: string | undefined; gate: (s: Scoped) => Promise<{ ok: true } | { ok: false; code: "terms_required" | "suspended" }> };
export type StartInput = { task: WriteTask; opportunityId: string; stageId?: string; note?: string; retryOf?: string };
export async function startGeneration(s: Scoped, input: StartInput, deps: GenerateDeps): Promise<Result<{ generationId: string; reused: boolean; credits: number }, StartError>>;
export async function runGeneration(s: Scoped, generationId: string, deps: GenerateDeps): Promise<void>;   // never throws, never leaves running
export async function settleStalled(s: Scoped, deps: GenerateDeps, limit?: number): Promise<number>;       // running older than STALE_RUN_MS becomes failed gen_stalled and is refunded
// lib/generate/hash.ts
export function inputHash(parts: { task: GenerationTask; opportunityId: string | null; stageId: string | null; inputs: unknown }): string;   // sha256 hex
```

### Credits (Milestone 14)

```ts
// lib/credits/costs.ts
export const METERED_TASKS = ["extract_posting", "score_fit", "extract_resume", "fit_brief", "cover_letter", "tailored_cv", "question_bank", "tts"] as const;
export type MeteredTask = (typeof METERED_TASKS)[number];
export const TASK_COSTS: Record<Exclude<MeteredTask, "tts">, number> = { extract_posting: 1, score_fit: 1, extract_resume: 3, fit_brief: 4, cover_letter: 3, tailored_cv: 6, question_bank: 12 };
export const TTS_CREDITS_PER_1000_CHARS = 3;
export const TASK_DAILY_CAPS: Record<MeteredTask, number> = { extract_posting: 60, score_fit: 60, extract_resume: 5, fit_brief: 20, cover_letter: 15, tailored_cv: 15, question_bank: 8, tts: 120_000 };   // tts in characters
export const DEFAULT_GLOBAL_DAILY_CAP = 20_000;
export const GLOBAL_ALERT_FRACTION = 0.8;
export function costOf(task: MeteredTask, units?: number): number;   // tts: Math.ceil(units * 3 / 1000)
// lib/billing/plans.ts
export const PLANS = { trial: { price: 0, credits: 100, dailyCap: 40, storageBytes: 250 * MB }, free: { price: 0, credits: 0, dailyCap: 0, storageBytes: 100 * MB }, standard: { price: 19, credits: 600, dailyCap: 150, storageBytes: 2 * GB }, plus: { price: 39, credits: 1800, dailyCap: 400, storageBytes: 5 * GB } } as const;
export const TRIAL_DAYS = 14;
// lib/credits/meter.ts
export type MeterError = "suspended" | "cap_task_day" | "cap_day" | "cap_global" | "no_credits";
export type Reservation = { reservationId: string; credits: number };
export type ReserveInput = { userId: string; task: MeteredTask; units?: number; generationId?: string | null; now: Date };
export type RefundInput = { userId: string; ref: { reservationId: string } | { generationId: string }; keepCredits?: number; now: Date };
export interface Meter {
  reserve(db: Db, input: ReserveInput): Promise<Result<Reservation, MeterError>>;
  refund(db: Db, input: RefundInput): Promise<Result<{ refunded: number }, "not_found">>;
}
export const freeMeter: Meter;                 // allows everything, writes nothing, credits 0
export function dbMeter(): Meter;
export function getMeter(): Meter;             // features().credits ? dbMeter() : freeMeter
```

`keepCredits` is the credits actually used by a TTS batch (`ceil(doneChars * 3 / 1000)`); the refund is the reservation minus it, bonus part first.

### Billing (Milestone 15)

```ts
export type BillingEvent =
  | { type: "checkout_completed"; eventId: string; createdAt: Date; userId: string | null; customerId: string; subscriptionId: string | null }
  | { type: "subscription_changed"; eventId: string; createdAt: Date; customerId: string; subscriptionId: string }
  | { type: "invoice_paid"; eventId: string; createdAt: Date; customerId: string; subscriptionId: string | null; invoiceId: string }
  | { type: "invoice_failed"; eventId: string; createdAt: Date; customerId: string; subscriptionId: string | null }
  | { type: "subscription_ended"; eventId: string; createdAt: Date; customerId: string; subscriptionId: string };
export type ProviderSubscription = { id: string; customerId: string; plan: "standard" | "plus"; status: "trialing" | "active" | "past_due" | "canceled"; currentPeriodStart: Date; currentPeriodEnd: Date; cancelAtPeriodEnd: boolean };
export interface BillingDriver {
  readonly name: "stripe" | "fake";
  createCheckout(input: { userId: string; email: string; plan: "standard" | "plus"; customerId: string | null; successUrl: string; cancelUrl: string }): Promise<Result<{ url: string; customerId: string }, "billing_error">>;
  createPortal(input: { customerId: string; returnUrl: string }): Promise<Result<{ url: string }, "billing_error">>;
  verifyWebhook(rawBody: string, headers: Headers): Result<BillingEvent, "bad_signature" | "unsupported">;
  getSubscription(subscriptionId: string): Promise<Result<ProviderSubscription | null, "billing_error">>;
  cancelNow(subscriptionId: string): Promise<Result<null, "billing_error">>;
  deleteCustomer(customerId: string): Promise<Result<null, "billing_error">>;
  customerExists(customerId: string): Promise<Result<boolean, "billing_error">>;
}
export const WEBHOOK_TOLERANCE_SECONDS = 300;
export const WEBHOOK_MAX_BYTES = 1_000_000;
export const GRACE_DAYS = 7;
export const BILLING_EVENT_RETENTION_DAYS = 90;
```

### Account deletion (Milestone 11)

```ts
export type StoragePort = { list(prefix: string): Promise<string[]>; deletePrefix(prefix: string): Promise<void>; delete(key: string): Promise<void> };
export type BillingDeletionPort = Pick<BillingDriver, "cancelNow" | "deleteCustomer" | "customerExists">;
export type DeletionDeps = { storage: StoragePort | null; billing: BillingDeletionPort | null; email: EmailDriver | null; now: () => Date };
export function userHash(userId: string): string;   // first 16 hex of sha256(userId); the storage prefix is `u/${userHash}/`
export async function requestDeletion(db: Db, userId: string, deps: DeletionDeps): Promise<Result<{ jobId: string }, "not_found" | "last_account">>;
export async function runDeletion(db: Db, jobId: string, deps: DeletionDeps, memory?: { address: string }): Promise<void>;   // never throws
export type Found = { tables: Record<string, number>; objects: number; customer: boolean };
export async function verifyDeletion(db: Db, jobId: string, deps: DeletionDeps): Promise<{ status: "verified" | "failed"; found: Found }>;
export const DELETION_MAX_ATTEMPTS = 5;
```

### Routes, error codes and exact UI copy

Routes: `/signup`, `/verify-email`, `/reset-password`, `/welcome`, `/settings` (Account, Plan and credits, Usage), `/settings/plan?checkout=done`, `/admin`, `/admin/users`, `/admin/users/[id]`, `/pricing`, `/privacy`, `/terms`, `POST /api/upload/resume`, `POST /api/billing/webhook`, `POST /api/jobs/tick`, `/dev/billing/checkout`.
Upload codes: `upload_too_large`, `upload_type`, `upload_encrypted`, `upload_too_many_pages`, `upload_no_text`, `upload_timeout`. Limits: 5 MB body, 60,000 characters of text, PDF 10 pages, DOCX 500 entries and 20 MB uncompressed, parser timeout 10 seconds, `maxDuration` 60 on the upload route and 300 on the job page. `extract_resume`: `AI_MODEL`, 30-second timeout, 4,000 output tokens.
Copy, exact: "Check your email." / "If an account exists, a link is on its way" / "We could not send the email. Try again in a minute." / "This PDF has no text we can read. Paste your resume instead." / "Use the cleaned-up version" / "Skip for now" / "Save profile" / "Mark as researched" / "Write a fit brief first (4 credits)" / "This adds version 4. Your edits to version 3 stay in the list." / "Writing your CV" / "Try again" / "Your CV is ready" / "Generated from fit brief version 2" / "Generated after you edited version N." / "Check: Northwind Labs is not in your resume." / "6 credits, 412 left" / "412 of 600 left" / "Out of credits" / "Credits renew on 14 Nov" / "Upgrade" / "Manage billing" / "Update card" / "Confirming with Stripe" / "Writing is paused for everyone until 00:00 UTC" / "Download my data first" / "Delete account" / "delete my account" / "Your subscription ends now, with no refund for the rest of the period." / "Accept" / "Resend" / "Tailored CV, Product Designer at Northwind Traders, 6 credits".

## Task list

| Task | Milestone | Title | Files touched (short) | Depends on tasks |
|---|---|---|---|---|
| 1 | 11 | Hosted config, boot validation, `features()` | `lib/hosted/*`, `lib/env.ts`, `.env.example` | none |
| 2 | 11 | Migration: profile columns and `deletion_job` | schema, scoped profile, migration | 1 |
| 3 | 11 | Email driver, fake driver, links, templates | `lib/email/*` | 1 |
| 4 | 11 | SMTP and Resend drivers | `lib/email/smtp.ts`, `resend.ts` | 3 |
| 5 | 11 | Address normalization, disposable list, sign-up limits | `lib/auth/address.ts`, policy, script | 1 |
| 6 | 11 | Better Auth hosted wiring | `lib/auth/*` | 2, 3, 5 |
| 7 | 11 | Sign-up and verify-email pages | `app/(auth)/signup`, `verify-email`, proxy | 6 |
| 8 | 11 | Password reset pages, login link, demo coexistence | `app/(auth)/reset-password`, login | 6 |
| 9 | 11 | Legal pages, processors table, cookie allowlist | `content/legal`, `lib/legal/*`, `app/(public)` | 1, 3 |
| 10 | 11 | Terms gate in the app layout | `components/legal`, layout | 9, 2 |
| 11 | 11 | `Storage.list` and `deletePrefix` | `lib/storage/*` (Prep) | none |
| 12 | 11 | Deletion steps and the verifier | `lib/account/*` | 2, 3, 11 |
| 13 | 11 | Settings Account section and delete flow | settings, actions | 6, 12 |
| 14 | 11 | Maintenance tick and proxy exclusion | `lib/jobs/*`, route, `proxy.ts`, `vercel.ts` | 12 |
| 15 | 11 | End to end, CI jobs, docs and ship | hosted e2e, CI, README | 1 to 14 |
| 16 | 12 | Migration: `onboarded_at` and `generation` | schema, scoped, migration | 15 |
| 17 | 12 | Upload sniffing and limits | `lib/onboarding/sniff.ts`, helpers | 16 |
| 18 | 12 | PDF, DOCX and text extraction | `lib/onboarding/extract.ts` | 17 |
| 19 | 12 | Coverage check and `extractResume` | `lib/onboarding/coverage.ts`, `extract-resume.ts`, AI fake | 16 |
| 20 | 12 | Draft lifecycle and the upload route | `lib/onboarding/draft.ts`, route | 18, 19 |
| 21 | 12 | Save onboarding | `lib/onboarding/save.ts` | 20 |
| 22 | 12 | The `/welcome` page | `app/(app)/welcome`, components | 20, 21 |
| 23 | 12 | End to end, docs and ship | hosted e2e, README | 16 to 22 |
| 24 | 13 | Meter seam, task costs and `Scoped.db` | `lib/credits/meter.ts`, `costs.ts`, scoped | 23 |
| 25 | 13 | `writeMarkdown`, `AI_MODEL_WRITE`, new task names | `lib/ai/*` | 24 |
| 26 | 13 | Generation scoped helper additions and shared pieces | `lib/generate/{values,hash,normalize,limits}.ts` | 24 |
| 27 | 13 | Event kinds, artifact write path and version notices | pipeline values, upsert, plan | 26 |
| 28 | 13 | Fit brief and cover letter tasks | `lib/generate/tasks/*` | 26 |
| 29 | 13 | Tailored CV and question bank tasks | `lib/generate/tasks/*` | 26 |
| 30 | 13 | `startGeneration` | `lib/generate/start.ts` | 25, 28, 29 |
| 31 | 13 | `runGeneration` and stalled settlement | `lib/generate/run.ts` | 27, 30 |
| 32 | 13 | Actions, status read and long `maxDuration` | actions, pages | 31 |
| 33 | 13 | Write dialogs, pending and failed rows | `components/generate/*`, tabs | 32 |
| 34 | 13 | Mark as researched | `lib/pipeline/research.ts`, attention | 27 |
| 35 | 13 | End to end, docs and ship | hosted e2e, README | 24 to 34 |
| 36 | 14 | Migration: credits, subscription, usage day | schema, scoped, tests | 35 |
| 37 | 14 | Plans, period math, trial state | `lib/billing/plans.ts`, `lib/credits/period.ts`, `lib/billing/state.ts` | 36 |
| 38 | 14 | Ledger writer and global day guard | `lib/credits/{ledger,global-day}.ts` | 36, 37 |
| 39 | 14 | `dbMeter.reserve` | `lib/credits/meter.ts` | 38 |
| 40 | 14 | `dbMeter.refund`, TTS settle, period roll | `lib/credits/meter.ts` | 39 |
| 41 | 14 | Trial grant at verification and `getMeter()` | `after-verify.ts`, meter | 40 |
| 42 | 14 | Meter in intake and fit scoring | `lib/intake`, `lib/fit` | 41 |
| 43 | 14 | Meter in generation and onboarding | `lib/generate`, `lib/onboarding` | 41 |
| 44 | 14 | Meter in TTS batches | Prep audio batch action | 41 |
| 45 | 14 | Storage quota | `lib/quota/storage.ts`, write paths | 37 |
| 46 | 14 | Registry pieces, account menu balance, Settings Plan and Usage | components, settings | 41 |
| 47 | 14 | Zero-credit and refusal states | dialogs, cards | 42, 43, 46 |
| 48 | 14 | Admin | `lib/admin/*`, `app/(app)/admin` | 38, 46 |
| 49 | 14 | Export additions and credit tick steps | export, `lib/jobs/steps.ts` | 40 |
| 50 | 14 | End to end, docs and ship | hosted e2e, README | 36 to 49 |
| 51 | 15 | `BillingDriver`, events and the fake driver | `lib/billing/*` | 50 |
| 52 | 15 | Stripe driver | `lib/billing/stripe.ts` | 51 |
| 53 | 15 | `billing_event`, webhook handler and route | schema, `webhook.ts`, route, proxy | 51 |
| 54 | 15 | Subscription transitions | `lib/billing/state.ts` | 53 |
| 55 | 15 | Checkout, portal, pricing and return page | `lib/billing/checkout.ts`, pages | 54 |
| 56 | 15 | Billing tick steps, emails and banner | `lib/jobs/steps.ts`, components | 54 |
| 57 | 15 | Billing in account deletion | `lib/account/delete.ts` | 51 |
| 58 | 15 | Launch checklist and hosted docs | docs, `.env.example` | 55 to 57 |
| 59 | 15 | End to end, Stripe test mode and ship | hosted e2e, README | 51 to 58 |

## Parallel work

- Milestone 11: after Task 1, Tasks 2, 3, 5 and 11 touch separate files and can run together. Tasks 4 (after 3), 7 and 8 (after 6, they share `proxy.ts` only in Task 7, so run 7 before 8), 9 and 12 can overlap. Tasks 6, 10 and 13 each edit `lib/auth/index.ts` or `app/(app)/layout.tsx` or settings, so run those one at a time.
- Milestone 12: Tasks 17 and 19 are independent after Task 16; 18 follows 17. Tasks 20 to 22 are sequential.
- Milestone 13: Tasks 25, 26 and 27 can run together after Task 24 (separate files). Tasks 28 and 29 can run together. Tasks 31 and 34 are independent once 27 is done. Tasks 32 and 33 are sequential.
- Milestone 14: Tasks 37, 45 and 49 are independent of each other after their dependencies. Tasks 39 and 40 share `meter.ts` and run in order. Tasks 42, 43 and 44 touch different modules and can run together after Task 41. Tasks 46 and 48 touch different directories and can run together.
- Milestone 15: Tasks 52, 53 and 57 can run together after Task 51. Tasks 55 and 56 can run together after Task 54.
