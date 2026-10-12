# Jobsmith

Jobsmith is one app for a whole job search: find, qualify, apply, research,
prepare for each interview stage, debrief. It is open source under
AGPL-3.0 and self-hostable with your own database and, later, your own AI
provider key.

## Stack

Next.js 16 and React 19 with Tailwind CSS 4, Postgres through Drizzle ORM, Better Auth for sign-in, and
the Vercel AI SDK for the optional AI features (`package.json`).

Pages: `/` (Home), `/board` (jobs by stage), `/companies`, `/jobs/<slug>` (one job), `/preferences`
and `/settings`. `/library` is a placeholder for a later milestone. Without a session, every page
redirects to `/login`, except `/setup` and `/login` themselves.

## Requirements

- Node.js 24 (see `.nvmrc`)
- pnpm
- Docker, for the local Postgres in `docker-compose.yml`

## First run

```bash
cp .env.example .env
```

Fill in `.env`:

- `DATABASE_URL`: leave the default if you use `docker-compose.yml`.
- `BETTER_AUTH_SECRET`: generate one with `openssl rand -base64 32`.
- `APP_URL`: required for local development and self-hosting. Use
  `http://localhost:3000` here. On Vercel it can be left unset for
  Preview, and for Production unless a custom domain is used, because the
  app derives it from Vercel's system environment variables.
- `SETUP_TOKEN`: generate one with `openssl rand -base64 24` (at least 16
  characters). Until the first account exists, the setup page asks for
  this token, so only someone who can read the deployment's environment
  can create that account. A production build with no `SETUP_TOKEN` keeps
  first-run setup locked. Local development (`pnpm dev`) works without it.

**Set `SETUP_TOKEN` before you deploy an instance that the internet can
reach.**

The database scripts (`db:migrate`, `seed`, `reset-db`) load `.env`
themselves when the file exists, the same way `next dev` does. Then:

```bash
docker compose up -d
pnpm install
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000`. The first visit redirects to `/setup`, which
creates the only account this instance will accept until you set
`ALLOW_SIGNUP=true`.

## Adding a job

Click "Add job" on the board. Paste a link to the posting, paste the posting text, or both, next to
the company and role fields it already had. Company and role are optional when a link or text is
given; Jobsmith fills them in when it can read the posting.

A Greenhouse, Ashby or Lever link is read straight from that vendor's own public API. Any other link
is fetched and read as a web page. LinkedIn is not read: paste the posting text instead, since
LinkedIn requires a login Jobsmith does not have. A link that cannot be read for another reason
(blocked, timed out, too large, not found, too short, or simply unreadable) asks for the pasted text
too, unless company and role are already typed, in which case the job saves with the link alone.

When an AI provider is configured (below), pasted or fetched text is sent to it to read the company,
role, location, work mode and pay. Only the posting text is sent, inside a fixed wrapper that tells
the model to treat it as data, never instructions; nothing about your account goes with it. The
stored posting itself is never rewritten by the model: it stays the pasted text or the fetched page,
turned into plain markdown. When the model is off, fails, or cannot find the company and role, the
dialog asks for them directly and the job is saved with a "Check this job's details" notice on its
page, cleared by editing the details or by "Mark as checked."

Adding the same company, role and location again while the first one is still active shows "You
already have this job." with a link to open it, and "Add anyway" to add a second copy.

"Where is it now" defaults to Saved. The job is always created with all seven stages. Choosing
Applied moves it there once. Choosing a column after Applied moves it to Applied first and then to
the chosen column, so its history shows two moves, unlike the single drag you would get from adding
it plain and moving the card afterward.

### AI (optional)

Jobsmith works with no AI configured; intake then asks for the company and role by hand, and jobs
get no fit score (hard filters still work). Four environment variables turn it on, read in
`.env.example`, and the same four serve intake and fit scoring:

- `AI_PROVIDER`: `gateway` (Vercel AI Gateway), `anthropic` (the Anthropic API directly), or `fake`
  (the test suite's own stand-in, which never sends text anywhere). Unset means AI stays off.
- `AI_GATEWAY_API_KEY`: needed for `gateway`, except on Vercel, where the project's own OIDC token is
  used instead.
- `ANTHROPIC_API_KEY`: needed for `anthropic`.
- `AI_MODEL`: optional, overrides the provider's default model.

`AI_PROVIDER` has to be set on purpose: a developer's own shell `ANTHROPIC_API_KEY`, left over from
another project, must never send a posting anywhere by accident. Every call to the Vercel AI Gateway
asks for zero data retention.

## Keyboard shortcuts on the board

Focus a card (its title is a link, reached by Tab in the normal reading
order) and press a digit 1 to 7 to move it straight to that column, or
`c` to close it and choose a reason. Every card also has a "Move to" menu
listing the same seven columns and a Close item, for a mouse or a screen
reader user who would rather not remember the numbers. A move that
succeeds is confirmed out loud through a screen reader (a visually hidden
live region); a move the server refuses shows why in a toast and leaves
the card where it was.

Below 768px wide the board is a list grouped by stage instead of columns;
each row's "Move to" button opens the same seven choices in a sheet.

After every successful move (a drag, a digit key, the "Move to" menu, the phone sheet, or the stage
sheet on a job page) a toast asks "What is next for ..." with a "Set next action" button that stays for
ten seconds. The button opens a small dialog for the next action and its time. Nothing opens by
itself, so keyboard use is never interrupted. On a focused card, `n` opens the same dialog directly.

## Fit scoring

A job added with a posting is scored after the page responds, so adding never waits for the model.
Scoring needs three things: AI turned on (above), the posting text, and a resume saved in Settings.
Without a resume the job stays unscored and its fit card links to Settings. On a job page, "Score this
job", "Try again" and "Score again" run it by hand. Nothing else triggers a score: importing, editing
a job's details and saving preferences or the resume leave existing scores alone, and the card says
"Your profile changed after this score." when the profile is newer than the score.

What is sent to the model: the job's role, company, location, work mode and pay, the posting text
(first 12,000 characters), the resume with its headline (first 12,000 characters), and a short
summary of your preferences, each inside a fixed wrapper that tells the model to treat it as data.
Nothing about your account goes with it. The result is a score from 0 to 100, one sentence on why, up
to three pros and up to three cons, stored with the model id and the time. Logs carry ids, codes,
durations and token counts, never posting, resume, preference or summary text.

The chip on the board and the job page uses three bands, kept in `lib/fit/bands.ts`: strong from 70,
partial from 40 to 69, weak below 40, shown as a mark (a check, a dot or a minus) beside the number.
"Good fit from" in Preferences is separate: it sets the line the fit card says the score is above or
below.

Hard filters run in code, with or without AI, every time a job page renders: job titles, work modes,
locations and a pay floor. A job that misses one is flagged on its fit card and never hidden or moved.
A filter whose fact the posting does not state is listed as "Not checked" instead of failing.

If a run fails, the job is saved as it is and the card offers "Try again". A job still marked as
scoring after two minutes shows "Scoring did not finish." with the same button. With AI off the card
says so and still shows the hard filters.

## Home

`/` lists what to do today, in this order: interviews in the next 72 hours (with "Open prep"), next
actions that are due today or overdue (with "Done"), applied jobs with no news for "Follow up after"
days and no next action, saved jobs older than "Apply or drop after" days with no next action, and
past interviews to close out. Every item has one main action. Due next actions, follow-ups and
apply-or-drop items also have "Snooze", which sets the next action to 09:00 tomorrow, in three days or
in a week, in your time zone, and keeps the existing next action text. Interviews cannot be snoozed.
Beside the list sit a count of jobs per column and the last five documents pushed from the command
line. Days are counted in your profile's time zone, so a next action due "today" is the same whether
you look in the morning or late at night.

## Preferences

`/preferences` stores one versioned document in your profile. Four fields are hard filters: job
titles, work modes, locations and the pay floor (with its currency). Seniority, pay target,
must-haves, dealbreakers, industries to avoid and company size only feed the model's prompt, and a
dealbreaker never flags a job in code. "Good fit from" sets the fit card's line, and the two Home
reminder fields set the days for follow-ups and for saved jobs. A stored value that no longer parses
falls back to its default for that field alone, so a bad value never breaks a page.

"Test against a posting" scores a link or pasted text against your saved preferences and resume
without saving a job. It reads the posting the way Add job does, so a LinkedIn link asks for the
text. Save your changes first: the box ignores edits you have not saved.

## Settings, time zone and export

`/settings` has three sections. Profile holds a headline (up to 200 characters), the resume as markdown
(up to 50,000 characters) and your time zone. The resume is used only for fit scoring: it never
appears in the command line context, and it is included in your export. API tokens are unchanged.

Every date and time in the app is shown in the profile time zone, and times you type are read in it.
It starts as UTC; nothing is detected for you. "Use this device's time zone" appears when your
browser's zone differs from the saved one. A time that does not exist on a clock-change day (the hour
that is skipped in spring) moves later by the length of the gap; a time that happens twice (autumn)
means the first one.

"Export my data" downloads `jobsmith-export-<date>.json` from `/settings/export`: your profile
(including the resume), companies, jobs, stages, people, events, every version of every document and
your API token records. It leaves out sign-in sessions, password hashes, token secrets and the
derived values the app recomputes (such as duplicate-check hashes).

## Documents and the command line

Every document on a job's Research, Documents and Prep tabs is markdown, and the `jobsmith` command
line is the way to get a whole folder of it in, and a fresh copy of a job's own context out, without
opening the app.

Build it once from the repo, then install it globally:

```bash
pnpm cli:build
npm install -g ./cli
```

`pnpm cli:build` bundles `cli/src` into one dependency-free file, `cli/dist/jobsmith.mjs` (Node 20 or
newer); `npm install -g ./cli` links the `jobsmith` command from `cli/package.json`'s own `bin` entry.
There is no published package yet - reinstall the same way after pulling a newer commit.

`jobsmith login --url <base-url>` asks for a token (paste it; it is read from standard input and
never echoed on a real terminal) and saves both to `~/.config/jobsmith/config.json` (or
`$XDG_CONFIG_HOME/jobsmith/config.json`, owner-only permissions). Create a token first, in Settings.
Setting `JOBSMITH_URL` and `JOBSMITH_TOKEN` in the environment overrides the saved login, for
either variable on its own or both together.

`jobsmith list` prints your active jobs and their slugs.

`jobsmith pull <slug> [--out <dir>]` writes `<slug>-context.md`: the posting, stages, people, a
preferences summary and an index of existing documents, as one markdown file with frontmatter.

`jobsmith push <slug> [--dir <dir>] [--prefix <file-prefix>] [--dry-run]` reads every
`<prefix>-*.md` file in `--dir` (default the current directory; the prefix defaults to the slug),
skips anything that looks like a document already pulled from this app, and uploads the rest. For
each file:

- The **key** is the file name with the prefix and `.md` removed, lowercased.
- **Kind**, **stage**, **title** and **scope** come from the file's own frontmatter first
  (`kind: cv`, `stage: Hiring manager`, `title: ...`, `scope: company`), then from a suffix map -
  built in for the common names, or overridden per content folder by a `jobsmith.config.json` next
  to the files:

  ```json
  { "suffixes": { "call-card": { "stage": "Hiring manager" } } }
  ```

  A suffix with no match anywhere is still pushed, as kind `other`, with a note. Frontmatter is
  stripped before upload either way.
- A file over 1 MiB stops the push before anything is sent; a push holds at most 50 documents and 4
  MB in total, and the CLI splits a larger folder into more than one request on its own.

`--dry-run` asks the server what would happen and prints it without saving anything. Pushing the
same folder twice is always safe: unchanged content reports `unchanged` and changes nothing.

Credentials live in a different file from the suffix map on purpose: one is per machine
(`~/.config/jobsmith/config.json`), the other is per content folder (`jobsmith.config.json`, next to
the markdown files themselves, so a folder synced between machines carries its own mapping with it).

## API

Every route below needs `Authorization: Bearer <token>`, a token created in Settings. The bridge
never accepts a session cookie, and the app's own pages never accept a bearer token - the two
authentication paths stay completely separate. Every response carries `x-request-id` and
`cache-control: no-store`; there are no CORS headers, so a browser calling this from another origin
is refused by its own preflight check before the request reaches the server at all.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/bridge/opportunities?status=active\|closed\|all` | List your jobs (slug, company, role, current stage). `status` defaults to `active`. |
| `GET` | `/api/bridge/opportunities/:slug/context` | The job's context document, as `text/markdown`. |
| `PUT` | `/api/bridge/opportunities/:slug/artifacts` | Upsert up to 50 documents; add `?dry_run=true` to preview with nothing saved. |

The push body:

```json
{
  "artifacts": [
    { "key": "cv", "kind": "cv", "title": "CV", "scope": "opportunity", "stage": "Hiring manager", "body_md": "# CV\n..." }
  ]
}
```

`title`, `scope` and `stage` are all optional (`scope` defaults to `opportunity`; a missing `stage`
leaves the document unstaged). `stage` is matched against the job's own stage labels first, then
against stage kinds, case-insensitively. Each `body_md` is capped at 1 MiB, the whole request body at
4 MB.

The response:

```json
{
  "dryRun": false,
  "results": [{ "key": "cv", "scope": "opportunity", "status": "created", "version": 1 }],
  "warnings": [],
  "requestId": "..."
}
```

`status` is one of `created`, `versioned`, `updated` or `unchanged`. A per-document problem (an
unknown kind, a stage that does not match, company scope requested for a kind that cannot share)
shows up as a warning, and the rest of the push still saves.

Every error response shares one shape, `{ "error": { "code", "message" }, "requestId" }`:

| Status | Code | Meaning |
|---|---|---|
| 400 | `invalid_query` | A bad `status` or `dry_run` value |
| 400 | `invalid_json` | The body is not valid JSON |
| 400 | `invalid_payload` | The body does not match the expected shape |
| 400 | `duplicate_key` | The same key appears twice in one push |
| 401 | `unauthorized` | Missing, unknown or revoked token |
| 404 | `not_found` | No job with that slug for this token's account |
| 413 | `payload_too_large` / `too_many_artifacts` / `artifact_too_large` | Over one of the size limits |
| 429 | `rate_limited` | Over 120 requests per token per minute; `Retry-After` names the wait in seconds |
| 500 | `server_error` | Something went wrong; the message names a request id for support |

## Deploying

On Vercel, the build command is `pnpm db:migrate && pnpm build` (see
`vercel.ts`): every deployment migrates the database before it builds.

Preview and Production must use separate databases. Sharing one means a
Preview deployment's migration can change the schema Production depends
on before Production is ready for it.

Migrations only move forward; there is no down migration. Rolling back a
deployment restores the old code and leaves the schema as the newest
migration made it. A column that a migration removed or renamed stays that
way, even when the rolled-back code expects it.

Use the provider's pooled connection string for `DATABASE_URL` (what the
app itself uses at runtime, many short-lived queries) and keep its direct,
unpooled connection string in `DATABASE_URL_UNPOOLED` for migrations,
which need a session-scoped advisory lock a pooled connection cannot hold
(see `scripts/migrate.ts`).

## Running behind a reverse proxy

The login rate limit counts attempts per client address, read from the
`X-Forwarded-For` header (`advanced.ipAddress` in `lib/auth/index.ts`). The
header is trusted only when it holds exactly one valid address. On Vercel
the platform sets it for you. Behind your own reverse proxy, have the proxy
overwrite the header with the address it sees (nginx:
`proxy_set_header X-Forwarded-For $remote_addr;`). A proxy that appends to a
header sent by the client produces a list, and a list is treated as
unknown.

Behind a chain of proxies (for example a CDN in front of nginx), let each
proxy append to the header and list the proxies' addresses in
`advanced.ipAddress.trustedProxies`.

Requests with no trusted client address share one counter. That is the
case with no reverse proxy at all, and behind a chain of proxies until
`trustedProxies` is set. For those requests the sign-in limit rises to at
least 30 attempts per minute, so a handful of failed sign-ins from anywhere
cannot lock every visitor out. Clients with a trusted address keep the
tighter per-client limit below.

`AUTH_SIGNIN_MAX_PER_MINUTE` is optional and defaults to 5.

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Run the app locally |
| `pnpm build` | Production build |
| `pnpm start` | Run a production build |
| `pnpm typecheck` | Generate route types, then check them |
| `pnpm lint` | ESLint, then the token lint (`check:tokens`) |
| `pnpm check:tokens` | Fails on raw colors, palette classes or arbitrary values outside `components/ui` |
| `pnpm test` | Unit and integration tests (Vitest) |
| `pnpm test:e2e` | End-to-end tests (Playwright), resets the database first |
| `pnpm db:generate` | Generate a SQL migration from the schema |
| `pnpm db:migrate` | Apply migrations |
| `pnpm seed` | Create a fictional demo user and profile (only while no account exists) |
| `pnpm reset-db` | Drop and re-migrate a local database (refuses non-local hosts) |

Two more variables are read only by these scripts, never by the app itself:

- `ALLOW_DB_RESET=true`: required to confirm `pnpm reset-db`.
- `SEED_PASSWORD`: the password `pnpm seed` gives its demo user, instead of generating and printing a random one.

## Tests

`pnpm test` runs the unit and integration suite (Vitest).

`pnpm test:e2e` runs the end-to-end suite (Playwright), using the same
environment as First run. It needs the local Postgres running, resets it,
and starts its own server on port 3000, or on `PORT` when set, with a
matching `APP_URL`.

## Importing applications once

`pnpm import:applications <file> [--email <address>] [--dry-run]` reads a
JSON array of applications and replays each one through the same rules the
app itself uses to add and move a job, so events and stage history stay
consistent with a job added by hand.

Each entry: `company`, `roleTitle`, `stageKind` (one of `saved`, `applied`,
`recruiter_screen`, `hiring_manager`, `portfolio_case`, `panel_final`,
`offer`), and optionally `appliedAt` (a date, landing on the Applied
stage's entered date, honored for every `stageKind` other than `saved`),
`sourceUrl`, `notes` and `nextAction`. See
`tests/fixtures/applications.sample.json` for a complete, fictional
example.

An entry whose company and role already exist for the target account,
active or closed, is skipped, so running the same file twice changes
nothing, even after one of the imported jobs is later closed. `--email`
chooses which account to import into: optional while the instance has
exactly one account, required once it has more than one. Every run
prints a summary: entries created, entries skipped as already tracked,
and any entry that failed, by its position in the file - including a note
or next action that failed to save after its job was already created.
`--dry-run` prints the same summary without writing anything.

## Design system

Tokens, vendored primitives and the re-sync process are documented in
`docs/design-system.md`. `pnpm check:tokens` enforces the token rules
outside `components/ui`.

## License

AGPL-3.0-only. See `LICENSE`.

Outside pull requests are not merged until a contribution policy exists.
