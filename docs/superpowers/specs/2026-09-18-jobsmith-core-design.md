# Jobsmith Core: design spec

- Date: 2026-09-18
- Status: draft for owner review
- Scope: cycle 1 of 8 (Core). Every later cycle gets its own spec.
- Visual plan: FigJam board "Jobsmith plan" (sitemap, flows, wireframes, data model, architecture, build order)

## TL;DR

- Jobsmith is one app for a whole job search: find, qualify, apply, research, prepare for each interview stage, debrief.
- It is open source (AGPL-3.0) and self-hostable. A paid hosted version arrives in cycle 3. Core serves one signed-in user, and every table is tenant-safe from the first migration.
- Core delivers: login, a Kanban board of opportunities with stages that can be edited per job, a job page with tabs, a token-protected bridge (API plus CLI) that accepts markdown from outside generators, job intake from a URL or pasted text, a fit score, a preferences page, and a Home list of what needs attention today.
- AI is an enrichment and never a gate. The app works with no AI key configured.
- Markdown is the content contract. Every document is stored as an `artifact` with versions. Structured data is derived from it in later cycles.
- Core ships in five milestones. Each has a done-when test. Implementation plans are written one milestone at a time.

## 1. Context and goals

The owner runs a job search today with several separate prototypes and a set of Claude Code skills that generate research, tailored documents and interview prep as markdown files. Core replaces the prototypes with one app and gives the generated markdown a home.

Business model, decided 2026-09-18: the code is public under AGPL-3.0 so anyone can self-host with their own database and API keys. People who do not want a terminal pay for a hosted version that includes AI credits with fair-use caps. The first audience is product designers. Core does not build the hosted features, but it must not block them.

### Goals

1. Track every opportunity from Saved to Offer or Closed on one board, with stages that match how each company actually interviews.
2. Show everything about one opportunity on one page: posting snapshot, fit, research, people, documents, timeline, prep material.
3. Accept markdown produced outside the app (CLI push or paste) without losing hand edits or sent versions.
4. Turn a job link or pasted posting into a card in seconds.
5. Tell the user what to do today.

### Non-goals for Core

Job feed and portal scanner, structured prep rows, audio, the library, PDF and DOCX export, research refresh with diff, debrief suggestions, public sign-up, billing, in-app generation, MCP server, Telegram. Section 12 maps each to its cycle.

### Success criteria

The five done-when tests in section 9, verified in Chrome and Safari on desktop and at a phone viewport.

## 2. Principles

1. **One user now, tenant-safe always.** Every user-owned table has `user_id`. All queries go through a scoped helper. An integration test proves one user cannot read or change another user's rows.
2. **Self-hostable by a stranger.** Any Postgres works. AI provider and login sit behind small interfaces. No feature requires a Vercel-only service. The repo ships `.env.example`, install notes and a synthetic seed.
3. **AI is an enrichment, never a gate.** Intake always works from pasted text plus two typed fields. Extraction and scoring can fail, be retried, or be absent.
4. **Markdown is the content contract.** Artifacts keep their source markdown. Anything structured is derived and can be rebuilt.
5. **One write path per concept.** Stage changes go through `lib/pipeline`. Artifact writes go through `lib/artifacts`. The board drag, the stepper, the phone move sheet, the bridge and the paste dialog call the same functions.
6. **Public repo hygiene.** Fixtures, seeds, screenshots and docs use fictional companies and no compensation figures. No personal data enters the repo.
7. **Port working code, then add tests.** Earlier prototypes already solved the Kanban drag, ATS link intake and preferences form. Core ports them and adds the tests they lack.

## 3. Architecture

### Stack

| Concern | Choice | Self-host note |
|---|---|---|
| Framework | Next.js App Router, React 19, TypeScript strict | `pnpm build && pnpm start` on Node |
| Database | Postgres with Drizzle ORM and SQL migrations | Neon when hosted, any Postgres otherwise |
| UI | Tailwind v4 with the owner's two design systems, copied into the repo: tokens from the Minimal Design System, primitives from shadcn `base-nova` (Base UI), application components from the Super AI Components registry. See section 10. | installs need no private access, because the code is committed |
| Drag and drop | chosen in milestone 2: the registry's kanban view if it supports dragging, otherwise dnd-kit | none |
| Validation | Zod at every boundary (forms, API, AI output, preferences) | none |
| Login | Self-contained, database-backed auth library with email and password. Candidate: Better Auth. Milestone 1 confirms the choice against its current Next.js guide. | no outside service needed |
| AI | AI SDK with `provider/model` strings through AI Gateway when hosted. Model ids come from env. | any provider key, or none |
| Tests | Vitest, PGlite for integration, Playwright on Chromium and WebKit | none |
| Package manager | pnpm | none |

The Next.js major version is the current one at build time. It has breaking changes compared with older releases, so milestone 1 reads the bundled framework docs before scaffolding.

### Module map

```
app/                 routes: setup, login, home, board, jobs/[slug], preferences, settings, api/bridge/*
components/          board, job page, dialogs, forms, ui primitives
lib/db/              schema, migrations, scoped query helper (one file per table under lib/db/scoped/ once milestone 2 adds tables)
lib/pipeline/        create, move, close, reopen, edit stages, next action (the only stage write path)
lib/artifacts/       upsert, versions, sent lock, kind registry (the only artifact write path)
lib/intake/          resolvePosting, ATS adapters, fetch guard, dedupe
lib/ai/              extractPosting, scoreFit, provider config, fake driver
lib/attention/       Home rules as one pure function
lib/auth/            auth setup, session helper, API tokens
lib/bridge/          context document builder, push handler
cli/                 jobsmith CLI: login, list, pull, push
tests/               unit, integration, e2e
```

Each `lib/*` module exposes plain functions that take a database handle and a user id. Routes and server actions stay thin. This keeps the modules testable without a browser and reusable by the bridge.

## 4. Data model

Core creates these tables. `prep_question`, `library_item` and `asset` appear on the board's data model but ship with the Prep cycle.

Tables that Core defines have a uuid primary key. One-per-user tables such as `profile` use `user_id` as the primary key instead. `user_id` is text everywhere, because the login library generates text ids for its own tables (user, session, account, verification, rate limit). All tables have `created_at` and `updated_at`, stored as `timestamptz`. "Owned" means the table has `user_id` with an index and is only reachable through the scoped helper.

**profile** (owned, one per user): `headline`, `resume_md`, `preferences` jsonb (section 5.7), `timezone` (default `UTC`).

**company** (owned): `name`, `name_key` (normalized, unique per user), `domain`, `careers_url`, `ats_kind` (`greenhouse`, `ashby`, `lever`, `other`), `ats_org`, `size`, `industry`, `hq`, `notes_md`, `tracked` (used by the Feed cycle).

**opportunity** (owned): `company_id`, `slug` (unique per user, used in URLs and by the CLI), `role_title`, `location`, `work_mode` (`remote`, `hybrid`, `onsite`), `source` (`url`, `text`, `manual`, `feed`), `source_url`, `posting_md`, `posting_captured_at`, `comp_min`, `comp_max`, `comp_currency`, `comp_note`, `my_ask`, `fit_score` (0 to 100), `fit` jsonb, `fit_status` (`none`, `pending`, `done`, `failed`), `needs_review`, `current_stage_id`, `status` (`active`, `closed`), `closed_reason` (`rejected`, `withdrawn`, `ghosted`, `declined`, `accepted`), `closed_at`, `closed_stage_id`, `next_action`, `next_action_at`, `dedupe_hash`.

**stage** (owned): `opportunity_id` (cascade), `kind`, `label`, `position` (unique per opportunity), `status` (`upcoming`, `scheduled`, `done`, `skipped`), `scheduled_at`, `format` (`phone`, `video`, `onsite`, `async`), `entered_at`, `completed_at`, `outcome_md`.

**person** (owned): `company_id`, `name`, `title`, `linkedin_url`, `email`, `notes_md`.

**opportunity_person** (owned): `opportunity_id`, `person_id`, `role` (`recruiter`, `hiring_manager`, `interviewer`, `referrer`, `other`), `stage_id` (nullable).

**artifact** (owned): exactly one of `opportunity_id` or `company_id` (check constraint), `stage_id` (nullable, set null on stage delete), `key`, `version`, `kind`, `title`, `body_md`, `content_hash`, `source_hash`, `origin` (`pushed`, `pasted`, `manual`, `generated`), `edited_at`, `sent_at`. Unique on (`opportunity_id`, `key`, `version`) and on (`company_id`, `key`, `version`) through two partial indexes.

**event** (owned): `opportunity_id` (cascade), `stage_id` (nullable), `kind` (`created`, `stage_moved`, `closed`, `reopened`, `note`, `interview_scheduled`, `document_sent`, `artifact_pushed`, `next_action_done`), `body`, `meta` jsonb, `occurred_at`.

**api_token** (owned): `name`, `token_hash` (sha256), `prefix` (first 8 characters, for display), `last_used_at`, `revoked_at`.

The auth library adds its own user and session tables. `user_id` columns reference its user table.

## 5. Behavior

### 5.1 Stages and the board

Stage kinds, in column order: `saved`, `applied`, `recruiter_screen`, `hiring_manager`, `portfolio_case`, `panel_final`, `offer`. The board has one column per kind. A card sits in the column of its current stage's kind.

A new opportunity gets seven stages from the default template, one per kind, labelled Saved, Applied, Recruiter screen, Hiring manager, Portfolio review, Panel, Offer. The kind decides the column and, from the Prep cycle on, the prep template. The label is the company's own wording and shows on the card as a chip whenever it differs from the default.

Editing stages on one job:

- Rename any stage.
- Add a stage by choosing a kind and a label, for example kind `portfolio_case` with label "Take-home". It is inserted after the last stage of the same kind.
- Reorder stages between Applied and Offer freely. Some companies review a portfolio before the hiring manager call. The card then moves left on the board, which is acceptable.
- Skip a stage. Skipped stages stay visible in the stepper and are passed over when advancing.
- Remove a stage only when it is not current, not done and has no artifacts. Otherwise skip it.
- Saved, Applied and Offer exist exactly once, keep their order and cannot be removed.

`moveOpportunity(opportunityId, target)` takes a stage id (stepper) or a kind (board column, phone move sheet):

1. A closed opportunity cannot move. Reopen it first.
2. A kind target resolves to the first stage of that kind that is not skipped. If the job has no stage of that kind, one is created with the default label, placed after the last stage whose kind comes earlier in column order and before Offer. Dropping a card on its own column does nothing. Moving between two stages of the same kind, for example from Portfolio review to Take-home, happens in the stepper, because both sit in one column.
3. Moving forward: the current stage becomes `done` with `completed_at`. Stages jumped over that were `upcoming` become `skipped`. The user can correct them in the stepper.
4. Moving backward: stages after the target, up to and including the old current stage, return to `upcoming`, or to `scheduled` when they have a future date. Their notes are kept.
5. The target becomes current. `entered_at` is set the first time only.
6. One `stage_moved` event is written with from and to. The UI then offers to set the next action.

`closeOpportunity(id, reason)` sets status, reason, `closed_at` and `closed_stage_id`, and writes one event. Accepting an offer is a close with reason `accepted`. `reopenOpportunity(id)` clears them and writes one event. Closed jobs leave the board and appear under the Closed filter.

Board interaction:

- Drag a card to a column. The update is optimistic and rolls back with a message when the server rejects it.
- While dragging, a Closed drop zone appears. Dropping there opens the reason dialog.
- Keyboard: with a card focused, keys 1 to 7 move it and `c` closes it. Moves are announced through an aria-live region.
- Columns with no cards collapse to narrow rails.
- Cards are sorted by next action date, then by last update. There is no manual ordering inside a column.
- Below 768px wide the board renders as a list grouped by stage, with a "Move to" sheet that calls the same function.
- Every card also has a "Move to" menu (Milestone 2, decision D8) listing the seven columns plus Close. It calls the same function a drag, a keyboard digit or the phone sheet does, so every input method reaches every stage.

A card shows company, role, fit score, a chip for a custom stage label, days in the current stage (from `entered_at`) and the next action.

**Milestone 2 notes.** Decision D8 (the "Move to" menu, above) is already noted inline. Rule 6's offer to set the next action after a move is not built in Milestone 2; it arrives with Home in Milestone 5, which owns next-action prompting.

### 5.2 Job page

Route `/jobs/[slug]`. The header has the role, company, location, fit chip, a link to the original posting and a menu with Close and Reopen. Below it sit the stage stepper with "Edit stages" and the next action bar with Done and Edit.

| Tab | Content in Core |
|---|---|
| Overview | posting snapshot with capture date, fit card (score, summary, pros, cons, hard-filter result, retry), comp card, company card |
| Research | artifacts of kind `research`, `fit_brief`, `people_notes`, including company-level artifacts shared by every job at that company |
| People | people linked to the job, with role and optional stage. Add, edit, unlink. |
| Documents | artifacts of kind `cv`, `cover_letter`, `message_draft`, with version list, editor and "Mark as sent" |
| Timeline | events, newest first, plus "Add note" |
| Prep | artifacts of kind `question_bank`, `call_card`, `pitch`, `glossary`, `debrief`, `other`, grouped by stage, with a General group for unstaged ones. Rendered read-only. A panel shows the pull and push commands for this job and a "Paste markdown" button. |

**Milestone 2 notes.** Decision D13: this milestone ships only the Overview, People and Timeline rows above; Research, Documents and Prep arrive in Milestone 3, and Overview's fit card stays hidden while `fit_score` is null (Milestone 5). Decision D10: Overview's posting snapshot renders as plain text with line breaks kept, not through the sanitized markdown renderer in section 5.3, which arrives with artifacts in Milestone 3.

### 5.3 Artifacts

An artifact is identified inside its scope (one opportunity, or one company) by `key`, for example `cv`, `call-card`, `answers-full`. Versions count up from 1. The kind registry in `lib/artifacts/kinds.ts` is the single list of kinds, their tab and whether they can be marked as sent. An unknown kind arriving through the bridge is stored as `other` and reported as a warning.

`upsertArtifact({ scope, key, kind, title, stageRef, bodyMd, origin })`:

1. Normalize the body (LF line endings, trailing whitespace trimmed) and hash it.
2. No version exists: insert version 1. For `pushed`, `pasted` and `generated`, `source_hash` equals the hash.
3. Origin `pushed` or `generated`: compare the incoming hash with the `source_hash` of the newest version that came from a push or generator. Equal means the generator's content has not changed, so the result is `unchanged`, even when the user has hand-edited since. Different means insert a new version.
4. Origin `pasted`: compare with the latest `content_hash`. Equal is `unchanged`. Different inserts a new version.
5. Origin `manual` (the in-app editor): when the latest version is not sent, update it in place, set `edited_at` and the new `content_hash`, and leave `source_hash` alone. When the latest version is sent, insert a new version that starts from it.
6. Title, kind and stage changes with an unchanged body update the latest version's metadata and create no version.

Rule 3 is what keeps a repeated push from burying a hand edit under an older generated text.

"Mark as sent" sets `sent_at`, writes a `document_sent` event and makes that version read-only for good. The version list shows origin, edited state and sent date, and any older version can be opened read-only. When a pushed version lands on top of an edited one, the newer version carries the notice "pushed after you edited version N". Side-by-side compare belongs to cycle 5.

Rendering uses a markdown renderer with GFM tables and no raw HTML. Output is sanitized because content arrives from outside the app. The editor in Core is a plain text area with a preview toggle.

`stageRef` from the bridge or the paste dialog is matched against stage labels first (case-insensitive), then kinds. No match stores the artifact unstaged and returns a warning.

### 5.4 Bridge API and CLI

Authentication: `Authorization: Bearer <token>`. Tokens are created in Settings, shown once, and stored as a sha256 hash with a display prefix. They can be revoked. Every request updates `last_used_at`. The bridge never accepts session cookies, and pages never accept tokens.

| Endpoint | Purpose |
|---|---|
| `GET /api/bridge/opportunities?status=active` | list slug, company, role and current stage for the CLI |
| `GET /api/bridge/opportunities/:slug/context` | the context document as markdown |
| `PUT /api/bridge/opportunities/:slug/artifacts` | upsert up to 50 artifacts, each up to 1 MB |

The push body is `{ artifacts: [{ key, kind, title, scope, stage, body_md }] }`, where `scope` is `opportunity` (default) or `company`. The response lists each key with `created`, `versioned` or `unchanged`, plus warnings. One `artifact_pushed` event summarizes the push. Repeating a push is safe: unchanged content changes nothing.

The context document has frontmatter (`jobsmith: context/v1`, slug, company, role, current stage, generated time) and these sections: posting snapshot, stages (position, kind, label, status, date, people), people, a summary of preferences, and an index of existing artifacts (key, kind, stage, version, updated). It excludes the resume text.

CLI, in `cli/`, Node 20 or newer, few dependencies:

- `jobsmith login` stores the base URL and token in `~/.config/jobsmith/config.json` with owner-only permissions.
- `jobsmith list` prints active jobs with their slugs.
- `jobsmith pull <slug> [--out <dir>]` writes `<slug>-context.md`.
- `jobsmith push <slug> [--dir <dir>] [--prefix <file-prefix>] [--dry-run]` reads `<prefix>-*.md`. The key is the file name without the prefix. Kind, stage, title and scope come from the file's frontmatter, or else from the suffix map in `jobsmith.config.json` in the content folder. Frontmatter is stripped before upload. `--dry-run` prints what would change.

The paste dialog in the app (choose kind and stage, paste markdown) calls `upsertArtifact` with origin `pasted`. It is the way in for anything written in a chat window.

### 5.5 Intake

The "Add job" dialog takes a URL, pasted posting text, or both, and has a manual form with company and role.

`resolvePosting({ url, text })`:

1. A URL that matches a known ATS pattern (Greenhouse, Ashby, Lever) is fetched from that vendor's public JSON API and mapped to fields. No LLM is involved.
2. Any other URL is fetched through the fetch guard and reduced to readable text. A block, a timeout, or fewer than 600 characters of text returns `needs_text`, and the dialog asks for the pasted posting. LinkedIn always ends here.
3. Pasted or fetched text goes to `extractPosting`, which returns company, role title, location, work mode, comp range and currency, and a cleaned markdown body, validated with Zod.
4. When AI is not configured or fails, the dialog asks for company and role, stores the raw text as the posting and sets `needs_review`.

Fetch guard: http and https only, DNS resolved and private, loopback and link-local ranges refused, at most 3 redirects with each hop checked again, 8 second timeout, 2 MB cap, HTML or JSON content types only.

Duplicates: `dedupe_hash` is sha256 of normalized company, role title and location. A match shows "You already have this job" with "Open it" and "Add anyway". Re-applying a year later is legitimate, so the hash is not unique in the database.

`createOpportunity` matches or creates the company by `name_key`, builds a unique slug from company and role, stores the posting snapshot with its capture time, creates the default stages with Saved as current, writes a `created` event and queues fit scoring.

### 5.6 Fit scoring

Two parts, kept separate so the cheap part always works:

- `hardFilters(posting, preferences)` runs in code: title keywords, location and work mode, comp floor when the posting states a range. It returns pass or the list of failed filters.
- `scoreFit(posting, profile, preferences)` asks a small model for a structured result: score 0 to 100, a one-sentence summary, up to 3 pros and up to 3 cons. It is stored in `fit` with the model id and time.

Scoring runs after the response is sent. `fit_status` moves from `pending` to `done` or `failed`, and the job page offers a retry. With an empty resume text the status stays `none` and the fit card links to Settings. Posting and resume text are truncated to fixed limits before the call and are never logged. Score bands for the chip color are constants in one file.

### 5.7 Preferences

Route `/preferences`. Stored in `profile.preferences` as one document validated by a versioned Zod schema, so fields can change without migrations:

`titles[]`, `seniority[]`, `locations[]`, `workModes[]`, `compFloor`, `compTarget`, `currency`, `mustHaves[]`, `dealbreakers[]`, `industriesAvoid[]`, `companySize { min, max }`, `scoreThreshold` (default 70), `attention { followUpDays: 7, savedDays: 3 }`.

The page explains which fields are hard filters and which feed the scoring prompt. A "Test against a posting" box that scores a pasted URL is the last task of milestone 5 and is the first thing cut if the milestone runs long.

### 5.8 Home

Route `/`. `lib/attention` is one pure function over opportunities, stages and the current time. It returns items in this order:

1. Interviews in the next 72 hours, with a link to that stage's prep.
2. Next actions that are overdue or due today.
3. Applied, no event for `followUpDays`, no next action set: "Follow up?"
4. Saved for `savedDays` or more: "Apply or drop."
5. A scheduled stage whose time has passed and is not done: "Mark it done and add notes."

Each item has one primary action and a snooze that sets the next action date. Beside the list: counts per column and the last five artifact pushes. The feed block on the wireframe belongs to the Feed cycle.

### 5.9 Settings

Profile (headline, resume text as markdown, timezone), API tokens (create, reveal once, revoke), and "Export my data", which downloads every row the user owns as JSON with no secrets. Export exists in Core because it is cheap now and the hosted version needs it.

### 5.10 Login and first run

`/setup` works only while the user table is empty and creates the first account. First-run setup is protected by a setup token: when `SETUP_TOKEN` is set, the form asks for it and the sign-up endpoint rejects a first account without it. A production build requires the token. While the variable is unset, `/setup` shows a locked notice and no account can be created, so a stranger cannot claim a fresh public deployment. Local development works without a token. After the first account exists, `/setup` returns 404, and sign-up stays closed unless `ALLOW_SIGNUP=true`. `/login` takes email and password. Sessions are database-backed cookies. Every page, server action and API route checks the session or token itself. Route-level protection is an extra layer and never the only check.

### 5.11 One-time import

`pnpm import:applications <file>` reads a JSON array of `{ company, roleTitle, stageKind, appliedAt, sourceUrl, notes, nextAction }` and replays each entry through `createOpportunity` and `moveOpportunity`, so events and stage states stay consistent. A small mapping script for the owner's current tracker is written in milestone 2, once its format is known, and stays out of the repo when it contains personal data.

## 6. Error handling

- Server functions return a typed result (`ok` with data, or a code and message). Expected failures such as validation, not found, closed opportunity or duplicate are never thrown.
- Intake: a fetch failure keeps the dialog open and asks for text. An extraction failure still creates the job with `needs_review`. A scoring failure leaves the job usable with a retry.
- Board: a rejected move rolls back and explains why. The board revalidates when the window regains focus, so a phone and a desktop stay in step. The last write wins.
- Bridge: the payload is validated as a whole (size, count, shape) and rejected with 400 when malformed. Inside a valid push, problems per artifact are warnings and the rest still saves. 401 for a missing or revoked token, 404 for an unknown slug, 413 for oversize.
- Each route segment has an error boundary with a retry. Logs carry a request id and no posting text, resume text or tokens.
- Times are stored as `timestamptz` (UTC instants) and shown in the profile timezone.
- Milestone 2 note (decision D7): there is no Settings page and no stored profile time zone until Milestone 5. Until then, every timestamp shown in the UI is rendered and entered in the browser's own time zone, through `components/local-time.tsx` and `components/local-datetime-input.tsx` only, so adding the real profile time zone later touches just those two files.

## 7. Security and privacy

- Tenancy through the scoped query helper, plus the isolation test in section 8.
- Bridge tokens are hashed, shown once and revocable. Login and bridge endpoints are rate limited. Counters live in the database, so a limit holds across serverless instances and needs no extra service. Login uses the login library's limiter with database storage, keyed by client address. The address comes from `X-Forwarded-For` and is trusted only when the header holds one valid address, so a reverse proxy must set it (install notes). Requests with no trusted address share one counter with a higher ceiling, so a few failed sign-ins cannot lock every visitor out.
- Server actions rely on the framework's origin checks. The bridge is bearer-only, so it has no CSRF surface.
- The fetch guard from section 5.5 prevents server-side request forgery.
- Markdown is sanitized and raw HTML is disabled.
- Secrets live only in env. `.env.example` lists every variable with a comment. CI runs a secret scan.
- Job-search data is sensitive because people hide searches from employers. There are no analytics on content and no third-party scripts on signed-in pages. When AI Gateway is used, zero data retention is enabled.
- Outside pull requests are not merged until a contribution policy exists, so the hosted version's licensing stays simple.

## 8. Testing

Test-driven for everything under `lib/`.

- **Unit:** the pipeline rules as a table of cases (forward, backward, jump, kind target with a missing stage, closed, reopen, edit-stage limits). Attention rules with a fixed clock. Slug and dedupe. ATS adapters against synthetic fixtures. The fetch guard against address ranges and redirect chains. The artifact upsert matrix, including the rule 3 case. The kind registry. The preferences schema. Hard filters.
- **Integration (PGlite with the real migrations):** tenant isolation with two users across every module. Bridge endpoints (auth, limits, idempotent push, warnings). First-run setup closing after the first user. The import script.
- **End to end (Playwright, Chromium and WebKit, desktop and a 390px viewport):** setup, login, add a job from pasted text with the fake AI driver, card appears in Saved, drag to Applied, timeline shows the move, open the job, paste an artifact, mark a CV as sent and see it locked. On the phone viewport: move a job with the sheet.
- **AI:** the fake driver is the default in tests. One opt-in live smoke test runs only when a key is present.
- **CI:** typecheck, lint, unit and integration on every push. End to end on pull requests.
- **Accessibility:** keyboard-only pass of the board and dialogs in the end-to-end suite, and an axe check on each route in light and in dark.

## 9. Milestones

One implementation plan per milestone, written when the previous one is done.

| # | Name | Scope | Done when |
|---|---|---|---|
| 1 | Skeleton | Scaffold, AGPL-3.0 license file, login and first-run setup, database and migrations, scoped helper with the isolation test, app shell with an empty board, CI, deploy, `.env.example`, install notes, synthetic seed | The preview opens behind login on desktop and phone, and a fresh clone runs from the README |
| 2 | Pipeline | Companies, opportunities, stage template and editing, `lib/pipeline`, board with drag, keyboard moves and the phone list, job page with Overview, People and Timeline, manual add, next action, close and reopen, one-time import | Every active application is on the board |
| 3 | Bridge | `lib/artifacts`, kind registry, Research, Documents and Prep tabs, editor and sent lock, paste dialog, API tokens, bridge endpoints, CLI | A complete interview packet pushed from a folder of markdown is readable inside the app, and a second push changes nothing |
| 4 | Intake | ATS adapters, fetch guard, readable-text extraction, `extractPosting`, `needs_review`, duplicate check, the add dialog and its three states | A Greenhouse link becomes a card in seconds, a LinkedIn posting works through pasted text, and both work with no AI key |
| 5 | Fit and Home | Preferences page, hard filters, `scoreFit` with retry, Settings (profile, export), Home attention list, optional test box | Home tells the user what to do today |

Each milestone ends with a preview link, a pass in Chrome and Safari and the test suites green.

## 10. Port sources and licensing

| Source prototype | Ported into Core | Milestone |
|---|---|---|
| career-ops-web | board behavior (optimistic move, rollback, keyboard shortcuts), ATS link intake (`lib/jobs/extract.ts`), AI gateway client | 2, 4 |
| job-search-bot | preferences form, scoring call shape (`lib/matcher/score.ts`), session handling patterns | 5 |
| interview-prep-workspace | Opportunity type ideas for the Overview tab | 2 |

Ported code gets tests as it lands. The owner's prototypes carry no license, so they can be relicensed under AGPL-3.0. Anything derived from the MIT-licensed upstream career-ops project keeps its copyright notice. Core ports nothing from it, because the fit score in section 5.6 is new and simpler than its rubric.

### Design systems

Decided 2026-09-18: the front end is built from the owner's two design systems. Both are copied into this repo, because one of them is private and a stranger must be able to install Jobsmith.

| Source | What Jobsmith takes | How |
|---|---|---|
| Minimal Design System (`@weeeha/ui`, MIT, same owner, private repo) | the token file: primitive ramps, the semantic layer that decides light and dark, and the alias layer that maps shadcn's variable names onto it | copied to `app/globals.css` from a recorded commit |
| shadcn `base-nova` | primitives in `components/ui` (Base UI based) | `shadcn add` |
| Super AI Components (public shadcn registry, same owner) | application components: app sidebar, top bar, account menu, auth shell, kanban column and view, detail view shell with tabs, filter bar, field row, date section, shortcuts sheet, and later credits, quota and paywall pieces | `shadcn add <registry url>` |

Order of preference for any new UI need: a Super AI Components item, then a `base-nova` primitive, then a component copied from the Minimal Design System, then new code. The Minimal Design System's own components are Radix based and the registry's are Base UI based, so `components/ui` stays `base-nova` and Radix based components are copied only when nothing else fits.

Rules for app code: semantic utilities and shadcn variable names only. No raw colors, no Tailwind palette classes, no arbitrary values. Motion uses the kit's duration and easing tokens. `pnpm check:tokens` enforces this in CI. Light and dark follow the system setting from milestone 1.

`docs/design-system.md` records what was copied, from which commit, how to re-sync, and every local change to a copied file, so fixes can go back upstream. The kit has known contrast failures in a few token pairs. When the accessibility checks find one, the pair is fixed in the semantic layer here and listed in that file.

The Super AI Components repo has no license file yet. The owner holds the rights, so using it here is fine. Adding a license there is a separate task.

Fonts: Geist and Geist Mono, under the SIL Open Font License, loaded through `next/font`.

## 11. Assumed until the owner says otherwise

1. The format of the current applications tracker is unknown. The import script takes a neutral JSON shape, and the mapping is written once the format is known.

## 12. After Core

| Cycle | Adds |
|---|---|
| 2 Prep | question bank parsed into `prep_question` rows, `library_item`, `asset` and private file storage behind an interface, player with Listen and Drill, confidence marks, Quick-fire, installable phone app with offline audio |
| 3 Hosted beta | sign-up, onboarding from a resume, in-app generation with credits and caps, billing, privacy policy and delete |
| 4 Feed | portal scanner for tracked companies, aggregator sources, prefilter, scoring, Home feed, Telegram and in-app alerts |
| 5 Apply and Research | PDF and DOCX export, version compare, research refresh with diff, company pages |
| 6 Debrief | transcript in, suggestions out, accept or reject, funnel view |
| 7 Bridge, part two | MCP server, request queue for running skills from the app |
| 8 Widen | role packs beyond product design, docker compose, contribution policy |
