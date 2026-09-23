# Jobsmith Core Milestone 3: Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A complete interview packet pushed from a folder of markdown is readable inside the app, and a second push changes nothing. Artifacts are stored with versions through one write path (`lib/artifacts`), the job page gains Research, Documents and Prep, documents can be pasted, edited and marked as sent, API tokens are created in Settings, and a token-protected bridge API plus a small CLI move markdown in and context out.

**Architecture:** Two new owned tables in one additive migration. `lib/artifacts` is a pure planner (spec 5.3 rules 1 to 6 as a table of cases, like `lib/pipeline/rules.ts`) plus thin persistence that runs every write in one transaction holding the opportunity row lock. The bridge is three route handlers that are two-line wrappers around plain functions `(deps, request, slug) => Response` in `lib/bridge`, tested against PGlite with no server. A bearer token authenticates, touches `last_used_at` and counts the rate limit in one `UPDATE ... RETURNING` on its own row. The proxy never runs on `/api/bridge/*`. The CLI is TypeScript in `cli/src`, bundled by esbuild into one Node 20 ESM file with no runtime dependencies, and its core is `run(argv, io)` so tests drive it against the real handlers. Markdown renders through react-markdown with GFM, sanitized, no raw HTML, in a component shared by server views and the editor preview.

**Tech stack additions:** dependencies `react-markdown` 10.1.0, `remark-gfm` 4.0.1, `rehype-sanitize` 6.0.0; devDependency `esbuild` 0.28.2 (already in the lockfile through `tsx`, so no new download). No new registry items or primitives. Everything else is installed (Next.js 16.3.5, React 19.2.8, Drizzle 0.45.2, drizzle-kit 0.31.10, PGlite 0.5.8, Zod 4.6, Vitest 5.0.1, Playwright 1.63, pnpm 11.1.0).

**Spec:** `docs/superpowers/specs/2026-09-18-jobsmith-core-design.md`. Sections 2, 3, 4, 5.2, 5.3, 5.4, 5.9, 6, 7, 8 and the Milestone 3 row of section 9 govern this plan.

## How this plan is organized

The plan is a folder, because one file would be too large to read comfortably on GitHub.

| File | Content |
|---|---|
| `README.md` (this file) | Goal, global constraints, and the Contract: decisions, schema, every signature, the artifact rules, the bridge and CLI contracts, the fixed UI copy, the task list |
| [tasks-01-04.md](tasks-01-04.md) | Schema and migration, scoped helpers, the pure artifact core, artifact persistence and read models |
| [tasks-05-09.md](tasks-05-09.md) | API tokens, the bridge core, handlers and routes, the CLI core, the CLI commands and the fixture packet |
| [tasks-10-15.md](tasks-10-15.md) | UI foundations, Settings, paste with Research and Prep, Documents, end to end, docs |

How to read the task text:

- The task text calls the Contract section below "the frame". A name, a signature or a copy string in the frame is binding, character for character. A task text that departs from it is a defect unless "Adjustments made while the tasks were written" lists the change.
- The format is Milestone 2's hybrid: full code for tests, schema, Zod schemas, server actions, route files, scripts, end-to-end specs and the wiring that is easy to get wrong; numbered steps that point at the frame's rules for other bodies.
- Notes such as "verified in a planning scratch file" refer to small checks made against the installed package versions while this plan was written. Those files are not part of the repo. Anything marked "unverified" could not be checked at planning time and is the builder's to confirm.
- Each task is one review gate with its own tests and ends with a commit. A builder sees only one task, so every task restates what it consumes and produces.

## Global Constraints

Carried from Milestone 2 verbatim:

- Never change git config. The repo-local identity is already the owner's GitHub noreply address.
- Public repo hygiene: fictional companies and people only, no compensation figures taken from real life, no personal data, no local absolute paths in committed files.
- This is Next.js 16. Before using any Next.js API, read the matching guide under `node_modules/next/dist/docs/` (the repo's `AGENTS.md` requires it). The request-interception file is `proxy.ts`, `headers()` and `cookies()` are async, and `next typegen` runs before `tsc`.
- Files under `app/` and `components/` never import `@/lib/db/client`. They reach the database through `scopedFor(userId)` from `@/lib/db/scoped` and through `lib/` functions that take a `Scoped`.
- `lib/pipeline` is the only code that writes `opportunity.status`, `opportunity.current_stage_id`, the `closed_*` columns, `stage` rows and pipeline events.
- Server functions return the typed `Result` from `@/lib/result`. Expected failures (validation, not found, closed opportunity, duplicate, a broken stage rule) are returned, never thrown.
- Test first for everything under `lib/`: write the failing test, watch it fail, then write the code.
- App code under `app/` and `components/`, excluding `components/ui/` and `components/super-ai/`, uses semantic utilities and stock shadcn variable names only: no raw colors, no Tailwind palette classes, no arbitrary values. Motion uses `duration-fast`, `duration-base`, `duration-slow` and `ease-standard`, `ease-enter`, `ease-exit`. `pnpm check:tokens` must pass.
- Order of preference for any UI need: a Super AI Components registry item, then a `base-nova` primitive, then new code. Registry items are installed with `pnpm dlx shadcn@latest add https://super-ai-components.vercel.app/r/<name>.json`, are copied verbatim into `components/super-ai/`, and every item and every local change is recorded in `docs/design-system.md`.
- Accessibility is built in: labels, landmarks, keyboard access, visible focus, an aria-live announcement for every move, and a non-drag way to do everything a drag does (WCAG 2.2, 2.5.7). The axe scan has zero violations in light and in dark on every new route and every dialog.
- UI copy has no exclamation marks and uses plain words.
- Commit messages end with the co-author trailer supplied by the executing session.

Milestone 3 additions:

- Never commit to or push `main`. All work happens on branch `feat/m3-bridge`, cut from the final Milestone 2 head (from `main` once Milestones 1 and 2 are merged).
- Every page and server action checks the session itself with `requireUser()`. Every bridge route handler authenticates the bearer token itself (D6) and never reads the session. `proxy.ts` is an extra layer for pages and never the only check.
- `lib/artifacts` is the only code that writes `artifact` rows and the `artifact_pushed` and `document_sent` events. `lib/auth/api-token.ts` is the only code that writes `api_token` rows.
- Times are stored as `timestamptz`. The UI shows and takes times only through `components/local-time.tsx` and `components/local-datetime-input.tsx` (M2 decision D7, still in force). Machine output (bridge JSON, the context document) uses ISO 8601 UTC.
- Every form submits through `submitViaTransition` from `lib/forms/submit.ts`, never a native `<form action>`. Every awaited server action inside a transition sits in `try/catch` with a toast for the rejected path, as in `components/board/board.tsx`. After an action removes or disables the focused control, focus moves to a named fallback (per task) through `focusWasLost`/`correctFocusOnceLost` from `lib/dom/focus.ts`, never left on `<body>`.
- Base UI `Select` roots always get an `items` prop (label map). DOM ids come only from `React.useId()` (or `FieldRow`). Optional fields can be cleared (blank becomes `null`). Long unbroken strings (slugs, keys, URLs, token prefixes, code) get `break-words` or `break-all`. No page-level horizontal overflow at 390px.
- Every Zod message is an explicit plain sentence from this frame, never a Zod default. Every field-level message a user can see is listed under "Validation messages".
- Code comments state reasons. They never cite decision ids, task numbers or review rounds (decision ids are fine in docs).
- Tests never contain a literal API token. They build one at runtime (`"jsm_" + "A".repeat(43)` or `generateToken()`), so the secret-scan rule (D41) never matches a committed file.
- End-to-end specs share one account and one database across the `chromium`, `webkit` and `phone` projects: every fixture name carries the project name plus a random suffix, every assertion is satisfiable only by the test's own data, positions are measured at the moment of use, after an optimistic or revalidating action the test waits for the server-confirmed announcement or re-rendered text before navigating, and an open overlay is scanned with axe scoped to `role="dialog"` (`tests/e2e/scan-open.ts`).

## Contract

### Decisions

Each line: decision, reason, cost if wrong. "Owner's call" marks a product decision the owner can change.

- **D1. One additive migration `0003` creates `artifact` and `api_token`; no existing table changes.** Reason: the spec's data model is additive. Verified in a planning scratch file: drizzle-kit generated only `CREATE TABLE`, `ADD CONSTRAINT` on the two new tables and `CREATE INDEX`, and PGlite applied 0000 to 0003. Cost: none known.
- **D2. `artifact` tenant safety.** Composite FKs `(user_id, opportunity_id)` and `(user_id, company_id)`, both CASCADE; a null scope column skips its FK (Postgres MATCH SIMPLE). `artifact_scope_check` enforces exactly one scope in SQL. `stage_id` is a single-column FK with SET NULL (like `event.stage_id`) and `lib/artifacts` only ever sets a stage of the same job. `artifact_company_stage_check` forbids a stage on a company row. `unique(user_id, id)` is added now because the Prep cycle's `prep_question` will reference a question-bank artifact. Verified in a planning scratch file (cross-user rows rejected, both checks, both partial uniques, stage delete nulls every version). Cost if the unique is never used: one index.
- **D3. `api_token` gets a single-column `user_id` FK with an index and no `unique(user_id, id)`**, because nothing references a token. `token_hash` is unique. Cost: an ALTER in the unlikely cycle that references tokens.
- **D4. Bridge rate-limit counters live on the token row** (`rate_window_start`, `rate_count`). One `UPDATE api_token SET last_used_at, rate_window_start, rate_count = case ... WHERE token_hash = $1 AND revoked_at IS NULL RETURNING` authenticates, touches and counts in one atomic statement, so the limit holds across serverless instances with no extra service or table. Limit: 120 requests per token per fixed 60-second window. Requests without a valid token are not counted: a 256-bit token cannot be guessed, and a counter write per anonymous request would add database load rather than shed it. Verified in a planning scratch file (same window increments, next window resets, revoked and unknown hashes return no row). Cost: an address-keyed limiter for anonymous traffic would be a later additive table.
- **D5. Token format `jsm_` plus 43 base64url characters** (32 random bytes). Stored as the sha256 hex of the whole token; `prefix` is the first 8 characters (`jsm_` plus 4) for display; the plain token is returned once by the create action and never stored or logged. The marker lets the CLI reject a pasted wrong value and lets a secret scanner find leaks. Cost: none.
- **D6. The bridge authenticates only with `Authorization: Bearer <token>`.** Route handlers never call `getSession`, `requireUser` or `cookies()`; a request with a session cookie and no valid bearer gets 401. Pages never accept tokens: Better Auth's `bearer` plugin stays uninstalled and no task may add it. Cost: none.
- **D7. `proxy.ts` excludes `/api/bridge/` in its matcher** (`"/((?!_next/static|_next/image|favicon.ico|api/bridge/).*)"`), not with an early return inside the function. Reason: when the proxy runs, Next buffers the request body (10 MB default, silently truncated beyond it, `proxyClientMaxBodySize`) and a cookie-less request is redirected to `/login`. Verified in a planning scratch file with `unstable_doesMiddlewareMatch`: bridge paths excluded, `/api/bridgework`, `/api/auth/*` and pages still matched; today's matcher does match the bridge. Cost: none.
- **D8. Bridge handlers are plain functions** `(deps: BridgeDeps, request: Request, slug?) => Promise<Response>` in `lib/bridge/handlers.ts`; the three `route.ts` files pass `productionDeps()`. `revalidatePath` throws outside a Next request (verified: "static generation store missing"), so it is injected and tests pass a spy. Cost: none.
- **D9. Size limits** (in `lib/bridge/wire.ts`): at most 50 artifacts per request, each `body_md` at most 1,048,576 UTF-8 bytes, the whole request body at most 4,194,304 bytes so a push fits Vercel's 4.5 MB function body limit. The body is read through a streaming byte cap that does not trust `Content-Length` (verified in a planning scratch file: header, stream with no length and lying header all stop at the cap). Every size or count limit answers 413; malformed JSON, a bad shape or a repeated key answers 400. The CLI splits a larger packet into requests that fit. Cost: a push over 4 MB becomes several requests, each with its own `artifact_pushed` event.
- **D10. Bridge responses.** JSON errors are `{ "error": { "code", "message" }, "requestId" }`. Every response carries `x-request-id` and `cache-control: no-store`; no CORS headers, so cross-origin browsers are refused by the preflight. Status codes: 400, 401, 404, 413, 429 (with `Retry-After` in seconds), 500 (logged with the request id, never the body or token). Cost: none.
- **D11. A push is validated as a whole, then applied in one transaction.** A key appears once per push (400 `duplicate_key`). Per-artifact problems are warnings and the rest still saves. `?dry_run=true` runs the same planner without writing. One `artifact_pushed` event is written per request only when at least one artifact was created, versioned or updated, so a repeated push writes nothing except the token's `last_used_at` and counter. Cost: none.
- **D12. Upsert statuses** are `created`, `versioned`, `updated` (rule 6, metadata only) and `unchanged` on the wire, plus `edited` for an in-place edit from the app. `updated` is a spec addition. Cost: a CLI older than this contract prints an unknown word.
- **D13. Pure planner, thin persistence, one lock order.** `lib/artifacts/plan.ts` imports nothing from `lib/db`. Every artifact write runs inside `s.transaction`, locks the opportunity row first (`s.opportunity.lockById`, the lock stage edits already take), then the company row (`s.company.lockById`) when a company-scoped artifact is written; the next version is `max + 1` under the lock and the partial unique indexes are the backstop. The fixed order opportunity then company cannot deadlock. PGlite has one connection, so true concurrency is unverified in tests (same as Milestone 2's move lock). Cost: a retry on a unique violation if a path skips the lock.
- **D14. Rule clarifications** (spec 5.3 is silent on these): (a) rule 3 treats the body as unchanged when the incoming hash equals the `source_hash` of the newest pushed or generated version or equals the latest `content_hash`, which avoids a duplicate version when no pushed version exists yet; (b) `source_hash` is the hash for pushed, pasted and generated inserts and null for manual inserts, and an in-place edit never touches it; (c) rule 6 never modifies a sent version: the result is `unchanged` with warning `sent_locked`; (d) a push or paste fully describes its metadata: no title means the derived title, no stage means unstaged; (e) the in-app editor changes the body only and keeps the latest version's kind, title and stage; (f) "Pushed after you edited version N" is computed when reading (the previous version has `edited_at`), with no column. Cost: small rule changes in one pure file.
- **D15. Body normalization:** strip a leading BOM, CRLF and lone CR become LF, trailing spaces and tabs are trimmed on every line, trailing blank lines and the final newline are dropped. The stored body is the normalized one and `content_hash` is its sha256 hex. Cost: a hard line break written as two trailing spaces becomes a soft break (a backslash break still works).
- **D16. Title:** the given title trimmed, else the text of the first ATX level-1 heading, else the key, clipped to 200 characters. The owner's real files have no frontmatter and an H1 on line 1, so the H1 is the usual title. Cost: none.
- **D17. Keys** match `KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,99}$/`. The CLI lowercases file-derived keys. A pasted new document gets `keyFromTitle(title)` (ASCII kebab case, at most 60 characters, fallback `document`) made unique in its scope with `uniqueSlug` from `lib/pipeline/slug.ts`, inside the write transaction. Cost: none.
- **D18. Kind registry** `lib/artifacts/kinds.ts` (table below): 12 kinds with tab, sendable, label and `companyWide`. Only Research kinds may be company-scoped; any other kind asked for company scope is stored for the job with warning `company_scope_not_allowed`. A stage given for a company-scoped artifact is ignored with warning `stage_ignored` (and the database check backs it). Unknown kinds are stored as `other` with warning `unknown_kind`. Cost: none.
- **D19. `stageRef` matching:** labels first (trimmed, inner whitespace collapsed, case-insensitive, first by position), then kinds (lowercased, spaces and dashes become underscores, first by position); no match stores the artifact unstaged with warning `stage_not_found`. The paste dialog sends a stage id instead, checked against the job's stages. Cost: none.
- **D20. `hasArtifacts` reaches the rules through one mapper**: `toStageStates(rows, stagesWithArtifacts)` in the new pure file `lib/pipeline/stage-state.ts` replaces both stubs (`snapshot.ts` `loadState` and `stage-controls.ts` `toOpportunityState`). A stage "has artifacts" when the latest version of some job-scoped key carries its id (older versions do not count). Verified in a planning scratch file: `selectDistinctOn([artifact.key])` ordered by key and version descending returns the newest version per key. Cost: none.
- **D21. Markdown renderer** `components/markdown.tsx` (no directive, usable from server views and the client editor preview): react-markdown's `Markdown` with `remarkPlugins: [remarkGfm]`, `rehypePlugins: [rehypeSanitize, [rankHeadings, { base }]]`, `skipHtml: true`, default `urlTransform`, and a components map that adds semantic classes; tables and `pre` sit in `tabIndex={0}` overflow containers; images never load (rendered as the text `Image: <alt>`); only `http:`, `https:` and `mailto:` links become anchors, other links render as their text; task-list checkboxes get `aria-label` `Done` or `Not done`; headings are re-leveled by rank from `base`. Verified in a planning scratch file: GFM table, strikethrough, task list and autolinks render; raw `<script>`, `<img onerror>`, `<iframe>`, inline tags and HTML comments are dropped; `javascript:` and `data:` hrefs are removed; the rank plugin typechecks against react-markdown's `Options` and maps levels {1,3,5} to h3, h4, h5. Cost: a document's own inline HTML never shows.
- **D22. Overview's posting snapshot stays plain text** (Milestone 2 D10 stands). Pasted postings are plain text and markdown rendering would merge their line breaks; Milestone 4's `extractPosting` produces markdown and switches it. Cost: one component change in Milestone 4.
- **D23. Research, Documents and Prep are list-and-document views.** A navigation list of document links and one selected document rendered as an `<article>`, chosen by the `doc` search param (`job:<key>` or `company:<key>`, default: first in the list) and, on Documents only, `v` for an older version. Research groups "This job" then "Shared with every job at <company>"; Prep groups "General" (unstaged) first, then stages by position; Documents lists sendable kinds with versions, editor and Mark as sent. Reason: one rendered body per request, linkable documents, a clean heading order. Cost: none.
- **D24. Tab order** Overview, Research, People, Documents, Timeline, Prep (spec 5.2 table). `JobTabs` passes `className="flex-wrap"` to `DetailTabs`, which has no overflow handling, so five or six tabs wrap at 390px instead of widening the page. No count badges (Milestone 2's choice). Cost: a second tab row on phones.
- **D25. Paste.** A `Paste markdown` button on Research, Documents and Prep (Prep's sits in the bridge panel) opens the dialog for a new document with the tab's default kind; `Paste a new version` on every document view opens it for that key. Origin `pasted`, job scope for new documents. Pastes write no timeline event (the spec names events only for pushes and sends). Cost: pasted documents are absent from the timeline.
- **D26. Mark as sent** applies to any unsent version of a sendable kind, after a confirm dialog. It sets `sent_at`, writes one `document_sent` event (`stageId` = the version's stage, `meta: { key, version, title }`), and that version is never updated again. Editing a sent latest version creates a new version (rule 5). Cost: none.
- **D27. Settings before Milestone 5**: route `/settings` with one section, API tokens (create, reveal once, revoke). Milestone 5 adds Profile and Export sections to the same page. **Owner's call:** Settings appears in the sidebar and the phone bottom bar now. Cost: one nav entry to remove.
- **D28. Server action body limit 2 MB** (`experimental.serverActions.bodySizeLimit: "2mb"` in `next.config.ts`), because the default 1 MB would reject a 1 MiB document plus multipart overhead before the action runs. Cost: none.
- **D29. Context document** (format below): frontmatter `jobsmith: context/v1`, slug, company, role, status, current stage, generated time; sections Posting, Stages, People, Preferences, Artifacts. Preferences prints `No preferences saved yet.` until Milestone 5, so the section list is stable for generators from v1 on. It never includes resume text or people's email addresses. Cost: none.
- **D30. CLI packaging.** TypeScript in `cli/src`, typechecked by the root `tsconfig.json`, bundled by `scripts/build-cli.mjs` (esbuild API, `platform: "node"`, `target: "node20"`, `format: "esm"`, shebang banner) into `cli/dist/jobsmith.mjs` (git-ignored). `cli/package.json` carries `bin` for `npm install -g ./cli`; it is not a pnpm workspace member (verified: pnpm 11 ignores a nested package.json while `pnpm-workspace.yaml` has no `packages` key, so the lockfile keeps one importer). Root scripts `cli:build` and `jobsmith`. `cli/src` may import only `node:` builtins, its own files and `@/lib/bridge/wire` (a leaf module with no imports); a unit test enforces it. Verified in a planning scratch file: the bundle inlines the `@/` alias, imports only `node:` modules and runs with plain Node. **Owner's call:** install story is "build from the repo, then `npm install -g ./cli`"; no npm publish in Milestone 3. Cost: a publish step later.
- **D31. CLI credentials** live in `$XDG_CONFIG_HOME/jobsmith/config.json` (default `~/.config/jobsmith/config.json`), directory mode 0700, file mode 0600 (verified in the scratch file). `JOBSMITH_URL` and `JOBSMITH_TOKEN` override the file. The token is never a command-line argument: `login` reads it from standard input, hidden on a terminal. Cost: none.
- **D32. `jobsmith.config.json` is read only from the content folder** (`--dir`, default the current directory), no parent walk. Its per-suffix entries merge field by field over the built-in map. The two files are distinct on purpose: credentials per machine, mapping per content folder. Cost: none.
- **D33. Suffix map.** The key is matched exactly, else against the longest map entry `E` for which the key starts with `E-` (so `debrief-round2` and `cover-letter-long` resolve). Built-in map below, generic words only. **Owner's call:** `fit-brief.md` and `fit-by-requirement.md` both map to kind `fit_brief` as two keys, no new kind. **Owner's call:** the assignments beyond the observed file names (`answers-full` and `curveballs` to `question_bank`; `intros`, `intros-audio`, `why-reasons` to `pitch`; `recruiter-call-script` and `hr-screen-prep` to `call_card`; `form-answers` to `message_draft`; `recon` and `design-recon` shared company-wide; `hr-bank`, `hr-screen-prep`, `recruiter-call-script` staged at `recruiter_screen`). Cost: a mapping line changes.
- **D34. File selection.** `push` reads `<prefix>-*.md` in `--dir`, not recursive, sorted by name; the prefix defaults to the slug. A file whose frontmatter has `jobsmith: context/v1` (a pulled context document) is skipped. Frontmatter is flat `key: value` lines; `kind`, `stage`, `title`, `scope` from frontmatter win field by field over the map, and frontmatter is stripped before upload. A file over 1 MiB, an unreadable config or an invalid `scope` stops before anything is sent. Cost: none.
- **D35. `push --dry-run` asks the server** (`?dry_run=true`) and prints the statuses the server would produce. Cost: needs a reachable server.
- **D36. CLI core is `run(argv, io)`** with injectable `fetch`, environment, working directory, home directory, output and secret reading, so `tests/integration/cli-bridge.test.ts` drives the real handlers on PGlite with no server. Cost: none.
- **D37. Acceptance path.** `tests/e2e/bridge.spec.ts` creates a token in Settings, runs the built CLI (`login`, `push`, a second `push`, `pull`) against the Playwright server on the fictional packet `tests/fixtures/packet/`, reads the documents in Research, Documents and Prep, and checks the second push reported every document unchanged with exactly one "Documents updated." on the timeline. Cost: none.
- **D38. Revalidation.** After a change, revalidate `/jobs/<slug>` of the target job and, when a company-scoped artifact changed, `/jobs/<slug>` of every job at that company (`s.opportunity.listSlugsForCompany`). Nothing on `/board` shows artifacts. Token actions revalidate `/settings`. Cost: none.
- **D39. `messageFor` is extended in place** (`lib/pipeline/messages.ts`, one flat map for the app) with the codes under "Messages". Cost: none.
- **D40. `FormStateWith<T>`** is added to `lib/forms/state.ts` for form actions that return data on success (token reveal, paste result, edit result). Cost: none.
- **D41. Secret scan.** A `.gitleaks.toml` with `[extend] useDefault = true` and one rule for `jsm_[A-Za-z0-9_-]{43}`. Unverified at planning time: gitleaks is not installed locally; CI's gitleaks job checks it. Cost: a false positive would need an allowlist entry.
- **D42. CLI exit codes:** 0 success (warnings allowed), 1 failure (network, refused token, server error, bad files), 2 usage error. Cost: none.

### Schema (Task 1). Files `lib/db/schema/artifact.ts`, `lib/db/schema/api-token.ts`, one line each in `lib/db/schema/index.ts`

Values live in `lib/artifacts/values.ts` and `lib/artifacts/kinds.ts` (no database imports), as Milestone 2 keeps `lib/pipeline/values.ts`:

```ts
// lib/artifacts/values.ts
export const ARTIFACT_ORIGINS = ["pushed", "pasted", "manual", "generated"] as const;
export const ARTIFACT_SCOPES = ["opportunity", "company"] as const;
export const UPSERT_STATUSES = ["created", "versioned", "updated", "unchanged", "edited"] as const;
export const ARTIFACT_WARNING_CODES = ["unknown_kind", "stage_not_found", "stage_ignored", "company_scope_not_allowed", "sent_locked"] as const;
export type ArtifactOrigin = (typeof ARTIFACT_ORIGINS)[number];  // and ArtifactScope, UpsertStatus, ArtifactWarningCode likewise
export type ArtifactWarning = { key: string; code: ArtifactWarningCode; message: string };
```

**artifact** (owned): `id` uuid pk defaultRandom; `userId` text notNull references `user.id` cascade; `opportunityId` uuid nullable; `companyId` uuid nullable; `stageId` uuid nullable `.references(() => stage.id, { onDelete: "set null" })`; `key` text notNull; `version` integer notNull; `kind` text enum `ARTIFACT_KIND_VALUES` notNull; `title` text notNull; `bodyMd` text notNull; `contentHash` text notNull; `sourceHash` text; `origin` text enum `ARTIFACT_ORIGINS` notNull; `editedAt`, `sentAt` timestamptz; `createdAt`, `updatedAt` timestamptz defaultNow notNull. Constraints, names exact: `artifact_user_id_id_unique` unique(user_id, id); `uniqueIndex("artifact_opportunity_key_version_unique").on(opportunityId, key, version).where(sql\`${t.opportunityId} is not null\`)`; the same for `artifact_company_key_version_unique` on `companyId`; `artifact_opportunity_fk` (user_id, opportunity_id) to opportunity (user_id, id) cascade; `artifact_company_fk` (user_id, company_id) to company (user_id, id) cascade; checks `artifact_scope_check` `(opportunity_id is null) <> (company_id is null)`, `artifact_company_stage_check` `company_id is null or stage_id is null`, `artifact_version_check` `version >= 1`, `artifact_kind_check` (the 12 kinds inline), `artifact_origin_check`. A planning scratch file checked this table exactly.

**api_token** (owned): `id` uuid pk; `userId` text notNull references `user.id` cascade; `name` text notNull; `tokenHash` text notNull; `prefix` text notNull; `lastUsedAt`, `revokedAt`, `rateWindowStart` timestamptz; `rateCount` integer notNull default 0; `createdAt`, `updatedAt`. `api_token_token_hash_unique` unique(token_hash); `index("api_token_user_idx").on(userId)`.

Migration: `pnpm db:generate` writes `lib/db/migrations/0003_<generated name>.sql`; it must contain no `DROP` and no `ALTER` of an existing table. Task 1 tests (integration, PGlite, `tests/integration/bridge-schema.test.ts`): both tables exist; each check rejects its bad row; each partial unique rejects a duplicate while the same key and version in the other scope or another job is allowed; a cross-user artifact is rejected through both FKs; deleting a stage nulls `stage_id` on every version; deleting a user removes that user's artifacts and tokens; the existing "every timestamp column has a time zone" test still passes. Unit (`tests/unit/artifact-kinds.test.ts`): the registry has the 12 kinds in order, sendable is exactly cv, cover_letter, message_draft, companyWide is exactly the Research kinds, every kind has a label, `parseKind` maps unknown input to `null`.

### Kind registry (Task 1). `lib/artifacts/kinds.ts`

```ts
export const ARTIFACT_KINDS = [
  { kind: "research", tab: "research", label: "Research", sendable: false, companyWide: true },
  { kind: "fit_brief", tab: "research", label: "Fit brief", sendable: false, companyWide: true },
  { kind: "people_notes", tab: "research", label: "People notes", sendable: false, companyWide: true },
  { kind: "cv", tab: "documents", label: "CV", sendable: true, companyWide: false },
  { kind: "cover_letter", tab: "documents", label: "Cover letter", sendable: true, companyWide: false },
  { kind: "message_draft", tab: "documents", label: "Message", sendable: true, companyWide: false },
  { kind: "question_bank", tab: "prep", label: "Question bank", sendable: false, companyWide: false },
  { kind: "call_card", tab: "prep", label: "Call card", sendable: false, companyWide: false },
  { kind: "pitch", tab: "prep", label: "Pitch", sendable: false, companyWide: false },
  { kind: "glossary", tab: "prep", label: "Glossary", sendable: false, companyWide: false },
  { kind: "debrief", tab: "prep", label: "Debrief", sendable: false, companyWide: false },
  { kind: "other", tab: "prep", label: "Other", sendable: false, companyWide: false },
] as const satisfies readonly { kind: string; tab: "research" | "documents" | "prep"; label: string; sendable: boolean; companyWide: boolean }[];
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number]["kind"];
export type ArtifactTab = "research" | "documents" | "prep";
export const ARTIFACT_KIND_VALUES = ARTIFACT_KINDS.map((k) => k.kind) as [ArtifactKind, ...ArtifactKind[]];
export function kindInfo(kind: ArtifactKind): (typeof ARTIFACT_KINDS)[number];
export function parseKind(value: string): ArtifactKind | null;   // exact match after trim + lowercase
export function kindsForTab(tab: ArtifactTab): ArtifactKind[];  // registry order
export const DEFAULT_KIND_FOR_TAB: Record<ArtifactTab, ArtifactKind> = { research: "research", documents: "cv", prep: "question_bank" };
export const ORIGIN_WORDS: Record<ArtifactOrigin, string> = { pushed: "Pushed", pasted: "Pasted", manual: "Written in the app", generated: "Generated" };
```

### Scoped helpers (Task 2). New files `lib/db/scoped/artifact.ts`, `lib/db/scoped/api-token.ts`

Same rules as Milestone 2 (reads filter `user_id`, writes strip then set `userId` last, `update` sets `updatedAt`, returns row or `null`). `lib/db/scoped/index.ts` gains the two tables in all three spots (type, object literal, `export *`); `Scoped` stays hand-written.

```ts
// lib/db/scoped/artifact.ts
export type ArtifactRow = typeof schema.artifact.$inferSelect;
export type ArtifactFields = Omit<typeof schema.artifact.$inferInsert, "id" | "userId" | "createdAt" | "updatedAt">;
export type ArtifactMeta = Omit<ArtifactRow, "bodyMd" | "userId">;          // select getTableColumns minus bodyMd and userId
export type ArtifactScopeRef = { opportunityId: string } | { companyId: string };
artifact: {
  listLatestForOpportunity(opportunityId: string): Promise<ArtifactMeta[]>;  // selectDistinctOn([key]) order by key, version desc
  listLatestForCompany(companyId: string): Promise<ArtifactMeta[]>;
  listVersions(ref: ArtifactScopeRef, key: string): Promise<ArtifactMeta[]>; // ascending version
  getVersion(ref: ArtifactScopeRef, key: string, version: number): Promise<ArtifactRow | null>;
  getLatest(ref: ArtifactScopeRef, key: string): Promise<ArtifactRow | null>;
  listKeys(ref: ArtifactScopeRef): Promise<string[]>;                          // distinct keys
  insert(values: ArtifactFields): Promise<ArtifactRow>;
  update(id: string, values: Partial<ArtifactFields>): Promise<ArtifactRow | null>;
};
// lib/db/scoped/api-token.ts
export type ApiTokenRow = typeof schema.apiToken.$inferSelect;
export type ApiTokenListItem = Pick<ApiTokenRow, "id" | "name" | "prefix" | "createdAt" | "lastUsedAt" | "revokedAt">;
apiToken: {
  list(): Promise<ApiTokenListItem[]>;                                        // newest createdAt first; never selects token_hash
  insert(values: { name: string; tokenHash: string; prefix: string }): Promise<ApiTokenListItem>;
  revoke(id: string, now: Date): Promise<ApiTokenListItem | null>;            // revoked_at = coalesce(revoked_at, now)
};
// additions to existing helpers
opportunity.listSlugsForCompany(companyId: string): Promise<string[]>;
opportunity.listSummaries(status: "active" | "closed" | "all"): Promise<OpportunitySummary[]>;  // joined with company and current stage, ordered by company name then role title
export type OpportunitySummary = { slug: string; roleTitle: string; companyName: string; status: OpportunityStatus; stage: { kind: StageKind; label: string } };
company.lockById(id: string): Promise<CompanyRow | null>;                    // SELECT ... FOR UPDATE, inside transaction()
```

Task 2 tests: extend `SeededIds` with `artifactId` and `apiTokenId` and `seedOneOfEach` with one job-scoped artifact (v1, origin pushed) and one token; add isolation `Case` entries for every new method (B gets empty or `null`, B cannot update or revoke A's rows, a smuggled `userId` is ignored, B's insert pointing at A's opportunity is rejected by the FK); `listLatestForOpportunity` returns the newest version per key; `listSummaries` for each status.

### lib/artifacts pure core (Task 3)

```ts
// lib/artifacts/normalize.ts   (node:crypto; limits from @/lib/bridge/wire)
export function normalizeBody(raw: string): string;        // D15
export function hashBody(normalized: string): string;      // sha256 hex
export function utf8Bytes(value: string): number;
export function deriveTitle(input: { title?: string | null; bodyMd: string; key: string }): string;   // D16, TITLE_MAX = 200
export function keyFromTitle(title: string): string;       // D17
// lib/artifacts/stage-ref.ts
export function matchStageRef(stages: { id: string; kind: StageKind; label: string; position: number }[], ref: string): string | null;  // D19
// lib/artifacts/plan.ts   (pure)
export type VersionState = { id: string; version: number; kind: ArtifactKind; title: string; stageId: string | null; contentHash: string; sourceHash: string | null; origin: ArtifactOrigin; editedAt: Date | null; sentAt: Date | null };
export type UpsertIntent = { origin: ArtifactOrigin; kind: ArtifactKind; title: string; stageId: string | null; bodyMd: string; hash: string };
export type NewVersion = { version: number; kind: ArtifactKind; title: string; stageId: string | null; bodyMd: string; contentHash: string; sourceHash: string | null; origin: ArtifactOrigin; editedAt: Date | null };
export type MetaPatch = { kind?: ArtifactKind; title?: string; stageId?: string | null };
export type UpsertPlan =
  | { status: "created" | "versioned"; insert: NewVersion }
  | { status: "edited"; id: string; patch: { bodyMd: string; contentHash: string; editedAt: Date } }
  | { status: "updated"; id: string; patch: MetaPatch }
  | { status: "unchanged"; warning: "sent_locked" | null };
export function planUpsert(versions: VersionState[], intent: UpsertIntent, now: Date): UpsertPlan;   // versions ascending
export function versionNotice(versions: Pick<VersionState, "version" | "origin" | "editedAt">[], version: number): string | null;
// lib/artifacts/tabs.ts   (pure)
export type DocRef = { scope: ArtifactScope; key: string };
export function parseDocRef(value: string | string[] | undefined): DocRef | null;   // "job:<key>" | "company:<key>", key must match KEY_PATTERN
export function formatDocRef(ref: DocRef): string;
export function scopeOf(row: { companyId: string | null }): ArtifactScope;
export type DocGroup = { id: string; heading: string; docs: ArtifactMeta[] };
export function docsForTab(docs: ArtifactMeta[], tab: ArtifactTab): ArtifactMeta[];  // kind registry order, then title, then key
export function researchGroups(jobDocs: ArtifactMeta[], companyDocs: ArtifactMeta[], companyName: string): DocGroup[];  // ids "job", "company"; empty groups dropped
export function prepGroups(docs: ArtifactMeta[], stages: { id: string; label: string; position: number }[]): DocGroup[];  // "general" first, then stage ids by position; an unknown stageId counts as General
export function selectDoc(groups: DocGroup[], ref: DocRef | null): ArtifactMeta | null;  // the ref when present, else the first doc
export function stagesWithArtifacts(jobDocs: ArtifactMeta[]): Set<string>;
```

`planUpsert` rules, in order (tests are one table, `tests/unit/artifact-plan.test.ts`):

1. No versions: `created`, version 1, `sourceHash` = hash (null when origin is `manual`), `editedAt` = `now` only when origin is `manual`.
2. Let `latest` be the last version. Origin `pushed` or `generated`: let `reference` be the newest version with origin `pushed` or `generated`. The body is unchanged when `hash === reference?.sourceHash` or `hash === latest.contentHash`; go to rule 6. Otherwise `versioned`: version `latest.version + 1`, `sourceHash` = hash, `editedAt` null.
3. Origin `pasted`: unchanged body when `hash === latest.contentHash` (rule 6); otherwise `versioned` with `sourceHash` = hash.
4. Origin `manual`: `hash === latest.contentHash` is `unchanged` (warning null). Else, when `latest.sentAt` is set, `versioned` with `sourceHash` null, `editedAt` = now and the latest version's kind, title and stage. Else `edited` in place (`bodyMd`, `contentHash`, `editedAt` = now; `sourceHash` untouched).
5. A new version never copies `sentAt`.
6. Unchanged body: the patch holds the fields among kind, title, stageId that differ from `latest`. Empty patch: `unchanged`, warning null. Non-empty and `latest.sentAt` set: `unchanged`, warning `sent_locked`. Otherwise `updated` with that patch.

`versionNotice`: for a version with origin `pushed` or `generated` whose previous version exists and has `editedAt`, returns `Pushed after you edited version <n>.`; otherwise `null`.

Table cases at least: each origin with no versions; the spec's rule 3 case (pushed v1, edited in place, same push is `unchanged` and keeps the edit); pushed after an edit is `versioned` and `versionNotice` names the edited version; pushed with only a pasted v1 and equal content is `unchanged`; pushed B over pushed A then pasted B is `unchanged`; pasted equal to an older version but not the latest is `versioned`; a push over a sent latest is `versioned`; manual edit in place; manual on a sent latest is `versioned` with metadata copied; manual equal is `unchanged`; title-only change is `updated`; stage-only change through a paste is `updated`; metadata change on a sent latest is `unchanged` with `sent_locked`; version numbering after gaps is `max + 1`. Unit tests also cover `normalizeBody` (CRLF, CR, BOM, trailing spaces on lines, trailing blank lines, tabs), `deriveTitle` (given, H1 with closing hashes, no H1, 200-character clip), `keyFromTitle` (accents, symbols, empty, 60 characters), `matchStageRef` (label case and whitespace, duplicate labels take the first by position, kind with dashes or spaces, no match, blank), `parseDocRef` and every grouping helper.

### lib/artifacts persistence and read models (Task 4)

```ts
// lib/artifacts/upsert.ts
export type StageInput = { ref: string } | { id: string } | null;
export type IncomingArtifact = { key: string; kind: string; title: string | null; scope: ArtifactScope; stage: StageInput; bodyMd: string };
export type UpsertResult = { key: string; scope: ArtifactScope; status: UpsertStatus; version: number };
export type UpsertOutcome = { results: UpsertResult[]; warnings: ArtifactWarning[] };
export function applyUpserts(tx: Scoped, context: { opportunity: OpportunityRow; stages: StageRow[] }, inputs: IncomingArtifact[], options: { origin: "pushed" | "pasted" | "generated"; dryRun: boolean; now: Date }): Promise<UpsertOutcome>;   // caller holds the opportunity lock
export function upsertArtifacts(s: Scoped, opportunityId: string, inputs: IncomingArtifact[], options: { origin: "pushed" | "pasted" | "generated"; dryRun?: boolean; now?: Date }): Promise<Result<UpsertOutcome, "not_found" | "invalid">>;
// lib/artifacts/paste.ts
export type PasteTarget = { mode: "new" } | { mode: "version"; scope: ArtifactScope; key: string };
export type PasteInput = { target: PasteTarget; title: string; kind: ArtifactKind; stageId: string | null; bodyMd: string };
export function pasteArtifact(s: Scoped, opportunityId: string, input: PasteInput, now?: Date): Promise<Result<UpsertResult & { title: string; tab: ArtifactTab }, "not_found" | "artifact_not_found" | "invalid">>;
// lib/artifacts/edit.ts
export function saveArtifactEdit(s: Scoped, opportunityId: string, ref: DocRef, bodyMd: string, now?: Date): Promise<Result<{ status: "edited" | "versioned" | "unchanged"; version: number; title: string }, "not_found" | "artifact_not_found" | "invalid">>;
// lib/artifacts/sent.ts
export function markArtifactSent(s: Scoped, opportunityId: string, key: string, version: number, now?: Date): Promise<Result<{ title: string }, "not_found" | "artifact_not_found" | "not_sendable" | "already_sent">>;
// lib/artifacts/read.ts
export type DocumentView = { current: ArtifactRow; versions: ArtifactMeta[]; latestVersion: number };
export function getDocument(s: Scoped, context: { opportunityId: string; companyId: string }, ref: DocRef, version?: number): Promise<DocumentView | null>;  // unknown version falls back to the latest
// lib/pipeline/stage-state.ts (pure, replaces both hasArtifacts stubs)
export function toStageStates(rows: StageRow[], stagesWithArtifacts: ReadonlySet<string>): StageState[];  // sorted by position
// lib/artifacts/values.ts (added here)
export function warningMessage(code: ArtifactWarningCode, key: string, detail: { kind?: string; stage?: string; version?: number }): string;  // sentences under "Artifact warnings"
// lib/forms/state.ts (added here, used by Tasks 5, 11, 12, 13)
export type FormStateWith<T> = { ok: true; data: T } | { ok: false; code: string; message: string; fieldErrors?: Record<string, string>; href?: string } | undefined;
// lib/artifacts/forms.ts (Zod messages under "Validation messages")
export const pasteTargetSchema: z.ZodType<PasteTarget>;   // key must match KEY_PATTERN
export const pasteFormSchema: z.ZodType<{ title: string; kind: ArtifactKind; stageId: string | null; bodyMd: string }>;  // stageId "" becomes null
export const editFormSchema: z.ZodType<{ bodyMd: string }>;
export type PasteFormState = FormStateWith<UpsertResult & { title: string; tab: ArtifactTab }>;
export type EditFormState = FormStateWith<{ status: "edited" | "versioned" | "unchanged"; version: number; title: string }>;
```

Task 4 also adds the four codes under "Messages" to `lib/pipeline/messages.ts` (and its table test), because Tasks 4 and 5 return them. Client components import these types with `import type` only.

`applyUpserts` steps per input, in the given order: `parseKind` (unknown: `other` plus `unknown_kind`); scope (company scope for a kind that is not `companyWide`: job scope plus `company_scope_not_allowed`); stage (company scope with a stage: `stage_ignored`; `{ ref }` through `matchStageRef`; `{ id }` must be one of `context.stages`; no match: null plus `stage_not_found`); `deriveTitle`; `normalizeBody` and `hashBody`; `listVersions` for the scope and key; `planUpsert` (a plan warning `sent_locked` becomes an `ArtifactWarning` carrying the latest version number); unless `dryRun`, insert or update exactly what the plan says (`version` of a dry-run `created` or `versioned` is the number it would get). It takes `tx.company.lockById(opportunity.companyId)` once, before the first company-scoped write. After the loop, when `options.origin` is `pushed` or `generated`, not `dryRun`, and some status is `created`, `versioned` or `updated`, it inserts one `artifact_pushed` event: `occurredAt` now, `meta: { items: [{ key, scope, status, version }] }` for the changed items only. `upsertArtifacts` opens the transaction, `lockById`s the opportunity (`not_found` when missing), lists its stages, checks every input (key matches `KEY_PATTERN`, normalized body not empty, `utf8Bytes(bodyMd) <= MAX_ARTIFACT_BYTES`, keys unique; otherwise `invalid`) and calls `applyUpserts`. `pasteArtifact` does the same with one input: new mode derives the key with `keyFromTitle` and `uniqueSlug` against `listKeys` of job scope inside the transaction; version mode needs `getLatest` (`artifact_not_found` when missing). `saveArtifactEdit` locks, loads the versions (`artifact_not_found` when none), builds the intent from the latest version's metadata with origin `manual` and applies the plan. `markArtifactSent` locks the opportunity, loads the job-scoped version, refuses `not_sendable` and `already_sent`, sets `sentAt`, writes `document_sent` with `stageId` and `meta: { key, version, title }`.

`getJobView` (`lib/pipeline/read.ts`) gains `documents: ArtifactMeta[]` (`listLatestForOpportunity`). `loadState` and `toOpportunityState(view: Pick<JobView, "opportunity" | "stages" | "documents">)` both call `toStageStates(rows, stagesWithArtifacts(...))`; `loadState` reads the latest versions inside the caller's transaction.

Task 4 tests (integration): first push creates every artifact and one event, a repeat creates nothing (row count, every `updatedAt` and the event count unchanged); the rule 3 case end to end; a changed push after an edit versions and the version list notice reads correctly; two pastes titled "CV" get keys `cv` and `cv-2`; two jobs at one company both list the shared `recon`; `company_scope_not_allowed`, `stage_ignored`, `stage_not_found`, `unknown_kind` each produce their warning and the rest saves; dry run returns the real run's statuses and writes nothing; `markArtifactSent` writes one event, a second call is `already_sent`, a call card is `not_sendable`; editing a sent latest versions; metadata change on a sent latest is `sent_locked`; `removeStage` refuses `stage_has_artifacts` while a latest version holds the stage and allows it after a push restages the document; user B gets `not_found` for every function on A's job.

### API tokens (Task 5). `lib/auth/api-token.ts` (never imports `lib/auth/index.ts`)

```ts
// TOKEN_PATTERN is imported from @/lib/bridge/wire (the CLI checks it too)
export function generateToken(): { token: string; hash: string; prefix: string };    // randomBytes(32).toString("base64url")
export type TokenFormState = FormStateWith<{ token: string; name: string }>;
export function hashToken(token: string): string;                                  // sha256 hex
export const tokenNameSchema: z.ZodType<string>;                                    // trim, messages under "Validation messages"
export function createApiToken(s: Scoped, name: string): Promise<Result<{ token: string; item: ApiTokenListItem }, "invalid">>;
export function listApiTokens(s: Scoped): Promise<ApiTokenListItem[]>;
export function revokeApiToken(s: Scoped, id: string, now?: Date): Promise<Result<null, "token_not_found">>;   // idempotent
export type BearerAuth = { tokenId: string; userId: string; count: number; windowStart: Date };
export function authenticateBearer(db: Db, token: string, now: Date): Promise<BearerAuth | null>;
```

`authenticateBearer` returns `null` without a query when the token fails `TOKEN_PATTERN`; otherwise it runs the single statement of D4 with `windowStart = floor(now / 60 s)`, casting the bound value explicitly (`${windowStart.toISOString()}::timestamptz`, as in the scratch file, because PGlite cannot infer a parameter type inside a CASE). Tests: unit (format, 1,000 generated tokens are distinct, hash is 64 hex, `tokenNameSchema` messages); integration (create returns the plain token once and stores only the hash; list never exposes the hash; revoke is idempotent and `token_not_found` for another user's id; authenticate counts within a window, resets in the next, writes `last_used_at`, returns `null` for revoked, unknown and malformed tokens).

### Bridge contract (Tasks 6 and 7)

```ts
// lib/bridge/wire.ts: a leaf: no imports at all, because the CLI bundle includes it
export const MAX_ARTIFACTS_PER_PUSH = 50;
export const MAX_ARTIFACT_BYTES = 1_048_576;
export const MAX_PUSH_BYTES = 4_194_304;
export const RATE_LIMIT_PER_MINUTE = 120;
export const KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,99}$/;
export const TOKEN_PATTERN = /^jsm_[A-Za-z0-9_-]{43}$/;
export type WireScope = "opportunity" | "company";
export type WireArtifact = { key: string; kind: string; title?: string | null; scope?: WireScope; stage?: string | null; body_md: string };
export type WireStatus = "created" | "versioned" | "updated" | "unchanged";
export type WirePushResponse = { dryRun: boolean; results: { key: string; scope: WireScope; status: WireStatus; version: number }[]; warnings: { key: string; code: string; message: string }[]; requestId: string };
export type WireOpportunity = { slug: string; company: string; role: string; status: "active" | "closed"; stage: { kind: string; label: string } };
export type WireListResponse = { opportunities: WireOpportunity[]; requestId: string };
export type WireError = { error: { code: string; message: string }; requestId: string };
// lib/bridge/http.ts
export function parseBearer(header: string | null): string | null;   // scheme case-insensitive, token must match TOKEN_PATTERN
export function readJsonCapped(request: Request, maxBytes: number): Promise<Result<unknown, "payload_too_large" | "invalid_json">>;  // as a planning scratch file
export function bridgeJson(body: object, init: { status?: number; requestId: string; headers?: Record<string, string> }): Response;
export function bridgeError(code: BridgeErrorCode, requestId: string, detail?: BridgeErrorDetail, headers?: Record<string, string>): Response;  // status and message from BRIDGE_ERRORS
// lib/bridge/errors.ts
export type BridgeErrorCode = "unauthorized" | "rate_limited" | "not_found" | "invalid_query" | "invalid_json" | "invalid_payload" | "duplicate_key" | "payload_too_large" | "too_many_artifacts" | "artifact_too_large" | "server_error";
export type BridgeErrorDetail = { slug?: string; key?: string; seconds?: number; text?: string };   // text: invalid_query and invalid_payload messages
export const BRIDGE_ERRORS: Record<BridgeErrorCode, { status: 400 | 401 | 404 | 413 | 429 | 500; message(detail: BridgeErrorDetail & { requestId: string }): string }>;
// lib/bridge/push-schema.ts
export const pushBodySchema: z.ZodType<{ artifacts: WireArtifact[] }>;   // unknown fields ignored
export function firstIssue(error: z.ZodError): string;                  // "<path>: <message>", path joined with "."
export function toIncoming(artifact: WireArtifact): IncomingArtifact;     // scope default "opportunity"; stage string to { ref }, absent to null
// lib/bridge/context.ts
export type ContextInput = { view: JobView; companyDocuments: ArtifactMeta[]; generatedAt: Date };
export function buildContextDocument(input: ContextInput): string;
// lib/bridge/handlers.ts
export type BridgeDeps = { db: Db; now(): Date; revalidate(path: string): void; requestId(): string };
export function handleListOpportunities(deps: BridgeDeps, request: Request): Promise<Response>;
export function handleGetContext(deps: BridgeDeps, request: Request, slug: string): Promise<Response>;
export function handlePushArtifacts(deps: BridgeDeps, request: Request, slug: string): Promise<Response>;
// lib/bridge/deps.ts: the only bridge file that imports @/lib/db/client and next/cache
export function productionDeps(): BridgeDeps;   // getDb(), () => new Date(), revalidatePath, crypto.randomUUID
```

Route files (Task 7): `app/api/bridge/opportunities/route.ts` (`GET`, `return handleListOpportunities(productionDeps(), request)`), `app/api/bridge/opportunities/[slug]/context/route.ts` (`GET`) and `app/api/bridge/opportunities/[slug]/artifacts/route.ts` (`PUT`), the last two `return handleX(productionDeps(), request, (await ctx.params).slug)` with `ctx: RouteContext<"<their route literal>">`.

Every handler: take `requestId`; wrap everything in `try/catch` (500 `server_error`, `console.error("[bridge]", requestId, error)`); `parseBearer`, then `authenticateBearer(deps.db, token, deps.now())`; `null` is 401 `unauthorized`; `count > RATE_LIMIT_PER_MINUTE` is 429 `rate_limited` with `Retry-After` = seconds to the window end (at least 1); then `scoped(deps.db, userId)`. A slug that fails `/^[a-z0-9-]{1,100}$/` or is not found is 404 `not_found`.

- **List:** `?status=` `active` (default), `closed` or `all`, else 400 `invalid_query`; `listSummaries` mapped to `WireOpportunity`.
- **Context:** `getJobView`, company documents, `buildContextDocument`; `200` with `content-type: text/markdown; charset=utf-8` plus the same `x-request-id` and `cache-control: no-store` headers.
- **Push:** `?dry_run=` absent, `false` or `0` is a real run, `true` or `1` a dry run, anything else 400 `invalid_query`; slug lookup (404) before the body is read; `readJsonCapped(request, MAX_PUSH_BYTES)` (413 `payload_too_large`, 400 `invalid_json`); an `artifacts` array longer than 50 is 413 `too_many_artifacts` (checked before the schema); `pushBodySchema` (400 `invalid_payload`, message is `firstIssue`); any `body_md` over `MAX_ARTIFACT_BYTES` is 413 `artifact_too_large`; a repeated key is 400 `duplicate_key`; then `upsertArtifacts(s, id, inputs, { origin: "pushed", dryRun, now })`; on a real run with changes, revalidate per D38; respond `WirePushResponse` (drop the `edited` status, which a push never produces).

`buildContextDocument` output, exactly this shape (strings in frontmatter are `JSON.stringify`d, which is valid YAML; times are `toISOString()`; table cells escape `|` as `\|` and turn newlines into spaces):

```
---
jobsmith: context/v1
slug: "<slug>"
company: "<company name>"
role: "<role title>"
status: <active|closed>
current_stage: "<label>"
current_stage_kind: <kind>
generated: <ISO>
---

# <role> at <company>

## Posting

Captured <ISO>.            (only when posting_captured_at is set)

<fence>markdown             (fence = backticks, one longer than the longest backtick run in the posting, at least 3)
<posting_md>
<fence>                    (or the line "No posting text saved.")

## Stages

| # | Kind | Label | Status | Date | People |
|---|---|---|---|---|---|
| <position + 1> | <kind> | <label> | <"current" for the current stage, else the stored status> | <scheduledAt, else completedAt, else empty> | <names linked to this stage, comma separated> |

## People

- <name>[, <title>]. Role: <role label>.[ Stage: <label>.][ LinkedIn: <url>.]
  Notes:                   (notes lines indented by two spaces, only when notes exist)
(or "No people linked to this job.")

## Preferences

No preferences saved yet.

## Artifacts

| Key | Kind | Scope | Stage | Version | Updated |
|---|---|---|---|---|---|
| <key> | <kind> | <job|company> | <stage label or empty> | <version> | <updatedAt ISO> |
(job documents by key, then company documents by key; or "No artifacts yet.")
```

Task 6 tests (unit): `readJsonCapped` (five cases), `parseBearer`, `pushBodySchema` messages, `firstIssue`, `toIncoming`, `buildContextDocument` against a fixed view (frontmatter, fence longer than a backtick run inside the posting, pipes escaped, a planted resume string and a person's email never appear). Task 7 tests (integration, `tests/integration/bridge-handlers.test.ts`, handlers on PGlite with a revalidate spy): 401 for no header, `Basic` scheme, malformed, unknown and revoked tokens, and for a request carrying only a session-looking cookie; 429 on request 121 in one window with `Retry-After`; list by status; context content type and sections; every push error code; a first push, a repeat that changes nothing and writes no event, a dry run that writes nothing; revalidation of every job at the company for a company-scoped change and of the one job otherwise; user B's token gets 404 for A's slug. Unit `tests/unit/proxy-matcher.test.ts`: installs `globalThis.AsyncLocalStorage` from `node:async_hooks`, then dynamically imports `next/experimental/testing/server` and `@/proxy` (verified in a planning scratch file under Vitest); asserts the D7 cases.

### CLI contract (Tasks 8 and 9)

```ts
// cli/src/io.ts
export type CliIo = { fetch: typeof fetch; env: Record<string, string | undefined>; cwd: string; homedir: string; stdout(text: string): void; stderr(text: string): void; readSecret(prompt: string): Promise<string> };
// cli/src/main.ts
export function run(argv: string[], io: CliIo): Promise<number>;     // D42 exit codes
// cli/src/index.ts: entry: real io (globalThis.fetch, process.env, process.cwd(), os.homedir(), stdout/stderr writes, readSecret), then process.exitCode = await run(process.argv.slice(2), io)
// cli/src/args.ts
export type Command = { name: "login"; url: string } | { name: "list" } | { name: "pull"; slug: string; out: string | null } | { name: "push"; slug: string; dir: string | null; prefix: string | null; dryRun: boolean } | { name: "help" } | { name: "version" };
export function parseCommand(argv: string[]): { ok: true; command: Command } | { ok: false; message: string };   // node:util parseArgs, strict
// cli/src/config.ts
export function configPath(env: CliIo["env"], homedir: string): string;
export function readCredentials(io: CliIo): Promise<{ url: string; token: string } | null>;   // env overrides file
export function writeCredentials(io: CliIo, creds: { url: string; token: string }): Promise<string>;   // mkdir 0o700, write 0o600, chmod 0o600 again; returns the path
// cli/src/frontmatter.ts
export function splitFrontmatter(text: string): { data: Record<string, string>; body: string };
// cli/src/suffixes.ts
export type SuffixEntry = { kind?: string; stage?: string; title?: string; scope?: string };
export const BUILT_IN_SUFFIXES: Record<string, SuffixEntry>;
export function mergeSuffixes(base: Record<string, SuffixEntry>, extra: Record<string, SuffixEntry>): Record<string, SuffixEntry>;
export function lookupSuffix(key: string, map: Record<string, SuffixEntry>): SuffixEntry | undefined;   // D33
// cli/src/collect.ts
export type Collected = { items: WireArtifact[]; notes: string[] };
export function collectPacket(options: { dir: string; prefix: string }): Promise<{ ok: true; value: Collected } | { ok: false; message: string }>;
// cli/src/batch.ts
export function batchArtifacts(items: WireArtifact[], limits?: { maxCount: number; maxBytes: number }): WireArtifact[][];   // greedy, serialized JSON size
// cli/src/http.ts
export function bridgeRequest(io: CliIo, creds: { url: string; token: string }, method: "GET" | "PUT", path: string, body?: unknown): Promise<{ ok: true; status: number; text: string } | { ok: false; message: string; refused: boolean }>;
// cli/src/output.ts
export function formatList(items: WireOpportunity[]): string;
export function formatPushReport(responses: WirePushResponse[], dryRun: boolean): string;
// cli/src/version.ts
export const CLI_VERSION = "0.1.0";
```

Behavior: `login --url <base-url>` (required; must start with `http://` or `https://`; trailing slash removed) reads the token with `readSecret("Token: ")` (on a terminal: raw mode, no echo, Enter ends, Backspace deletes, Ctrl+C exits 130; otherwise the first line of standard input), checks it against `TOKEN_PATTERN`'s shape, calls `GET /api/bridge/opportunities`, and saves only on 200. `list` calls the list endpoint. `pull <slug> [--out <dir>]` writes `<out or cwd>/<slug>-context.md`, creating the folder. `--dir` and `--out` resolve against `io.cwd`. `push` collects, stops on any collection error, batches, sends each batch with `PUT /api/bridge/opportunities/<slug>/artifacts` (plus `?dry_run=true`), prints the report. Every request sends `authorization: Bearer <token>`, `user-agent: jobsmith-cli/0.1.0`, `accept: application/json`, and uses `AbortSignal.timeout(30_000)`. A 401 anywhere prints the refused-token line and exits 1. Other non-2xx responses print `Error: <server message>`.

`collectPacket`: list `dir`, keep `<prefix>-*.md` sorted; for each file `splitFrontmatter` (BOM and CRLF tolerated; a file that starts with `---` and has no closing `---` line is treated as having no frontmatter); skip context documents; key = name without `<prefix>-` and `.md`, lowercased, must match `KEY_PATTERN` or the file is skipped with a note; `entry = lookupSuffix(key, merged)`; `kind = data.kind ?? entry?.kind ?? "other"` (a note when neither gave one); `stage = data.stage ?? entry?.stage` (omitted when neither); `title = data.title ?? entry?.title` (omitted, so the server derives it); `scope = data.scope ?? entry?.scope ?? "opportunity"` and anything else stops the push; body = the frontmatter-stripped text; a body over `MAX_ARTIFACT_BYTES` stops the push; an empty body is skipped with a note. `jobsmith.config.json` is `{ "suffixes": { "<suffix>": SuffixEntry } }`; unknown top-level keys are ignored; unreadable JSON stops the push.

Built-in suffix map (kind, stage, scope; empty cells omitted):

| Suffix | Kind | Stage | Scope |
|---|---|---|---|
| `recon`, `design-recon` | research | | company |
| `jd`, `jd-evidence-map` | research | | |
| `fit-brief`, `fit-by-requirement` | fit_brief | | |
| `people` | people_notes | | |
| `cv` | cv | | |
| `cover-letter` | cover_letter | | |
| `recruiter-reply`, `outreach`, `followup-note`, `form-answers` | message_draft | | |
| `hr-bank` | question_bank | recruiter_screen | |
| `question-bank`, `interview-questions`, `answers-full`, `curveballs` | question_bank | | |
| `call-card` | call_card | | |
| `recruiter-call-script`, `hr-screen-prep` | call_card | recruiter_screen | |
| `pitch-and-story`, `intros`, `intros-audio`, `why-reasons` | pitch | | |
| `glossary` | glossary | | |
| `debrief` | debrief | | |

Build (Task 9): add `esbuild` 0.28.2 as a devDependency; `scripts/build-cli.mjs` calls `esbuild.build({ entryPoints: ["cli/src/index.ts"], bundle: true, platform: "node", target: "node20", format: "esm", outfile: "cli/dist/jobsmith.mjs", banner: { js: "#!/usr/bin/env node" }, tsconfig: "tsconfig.json" })` and sets mode 0o755 on the output; `package.json` scripts `"cli:build": "node scripts/build-cli.mjs"` and `"jobsmith": "node cli/dist/jobsmith.mjs"`; `.gitignore` adds `/cli/dist/`; `cli/package.json` is `{ "name": "jobsmith-cli", "version": "0.1.0", "private": true, "license": "AGPL-3.0-only", "type": "module", "bin": { "jobsmith": "dist/jobsmith.mjs" }, "engines": { "node": ">=20" }, "files": ["dist"] }`. Runtime APIs are limited to Node 20's: `fetch`, `AbortSignal.timeout`, `node:util` `parseArgs`, `node:fs/promises`, `node:path`, `node:os`, `node:readline`, `process.stdin.setRawMode`. Unverified at planning time: running the bundle on Node 20 (only Node 26 is installed here) and `npm install -g ./cli`.

Task 8 tests (unit, `tests/unit/cli-*.test.ts`): `parseCommand` (every command, missing slug, unknown flag, `--help`, `--version`); `splitFrontmatter`; `lookupSuffix` and `mergeSuffixes`; every built-in kind is in `ARTIFACT_KIND_VALUES`, every built-in stage matches a stage kind, every built-in scope is valid; `batchArtifacts` by count and by bytes; `formatList`, `formatPushReport` (fixed lines below); `configPath` with and without `XDG_CONFIG_HOME`; an import-rule test that reads every file under `cli/src` and allows only `node:` specifiers, relative specifiers and `@/lib/bridge/wire`. Task 9 tests: `tests/helpers/bridge-fetch.ts` exports `bridgeFetch(deps: BridgeDeps): typeof fetch`, which turns `(url, init)` into `new Request(url, init)` and routes `GET /api/bridge/opportunities`, `GET /api/bridge/opportunities/<slug>/context` and `PUT /api/bridge/opportunities/<slug>/artifacts` to the handlers (anything else answers 404). `tests/integration/cli-bridge.test.ts` runs `run()` with `io.fetch = bridgeFetch(testDeps)` on PGlite and a temp `XDG_CONFIG_HOME`: `login` writes a 0600 file; `list`; `pull` writes the file; `push` of `tests/fixtures/packet` reports 11 created and one warning, a second push reports 11 unchanged and the job has exactly one `artifact_pushed` event; `--dry-run` writes nothing; a revoked token exits 1 with the refused line. `tests/integration/cli-bundle.test.ts` bundles to a temp outfile with the same options and runs `node <outfile> --version`, expecting `0.1.0`.

Fixture packet `tests/fixtures/packet/` (fictional company Northwind Labs, fictional people): `nwl-call-card.md` (H1, a GFM table, the sentence `Open with the onboarding redesign story.`), `nwl-answers-full.md`, `nwl-hr-bank.md`, `nwl-recon.md` (`Northwind Labs sells scheduling software to clinics.`), `nwl-fit-brief.md`, `nwl-people.md`, `nwl-cv.md` (`Led a design system used by four product teams.`), `nwl-cover-letter.md`, `nwl-glossary.md`, `nwl-pitch.md` (frontmatter `kind: pitch`, `stage: Portfolio review`, `title: Portfolio walkthrough pitch`), `nwl-debrief-round2.md` (frontmatter `stage: Final loop`, which matches no default stage), `nwl-context.md` (frontmatter `jobsmith: context/v1`, skipped), `unrelated-notes.md` (no prefix, ignored), `jobsmith.config.json` `{ "suffixes": { "call-card": { "stage": "Hiring manager" } } }`. Each file starts with an H1 and has its headings in order (H1, H2, H3). H1 titles, which the end-to-end specs click by name: `Northwind Labs: hiring manager call card`, `Northwind Labs: full answers`, `Northwind Labs: recruiter screen questions`, `Northwind Labs: company recon`, `Northwind Labs: fit brief`, `Northwind Labs: people in the loop`, `CV for Northwind Labs`, `Cover letter for Northwind Labs`, `Northwind Labs: glossary`, `Portfolio walkthrough` (its frontmatter title `Portfolio walkthrough pitch` wins), `Northwind Labs: round two debrief`. Pushed into a job with default stages the result is: Research job: Fit brief, People notes; shared: Recon; Documents: CV, Cover letter; Prep General: answers-full, glossary, debrief-round2; Recruiter screen: hr-bank; Hiring manager: call card; Portfolio review: pitch.

### User interface (Tasks 10 to 13)

**Task 10. UI foundations.** Install the three markdown packages. `components/markdown.tsx`: `export function Markdown(props: { source: string; headingBase: 2 | 3 | 4 }): React.ReactElement` per D21 (`rankHeadings` in `lib/markdown/rank-headings.ts`, structural hast types, checked in a planning scratch file); container `div` with `break-words text-sm text-foreground`; table wrapper `div tabIndex={0} className="overflow-x-auto rounded-md border border-border"`; `pre` with `tabIndex={0}` and `overflow-x-auto`. `components/copy-button.tsx` ("use client"): `CopyButton(props: { value: string; label: string })`, visible text `Copy`, `aria-label={label}`, `navigator.clipboard.writeText`, then `announce("Copied.")`, failure toast. `next.config.ts` gains D28. Tests: `tests/unit/markdown.test.tsx` renders with `renderToStaticMarkup` and asserts every D21 behavior plus `headingBase`; `rank-headings` unit; copy button (Testing Library, clipboard mocked).

**Task 11. Settings and tokens.** `components/app-shell.tsx` `NAV_ITEMS` gains `{ id: "settings", label: "Settings", href: "/settings" }` after Board. `app/(app)/settings/page.tsx` (server): `requireUser`, `listApiTokens`, `<div className="flex flex-col gap-6 p-6">`, `<h1>`, then `<ApiTokensSection tokens={...} />`. `app/(app)/settings/actions.ts`: `createTokenAction(_prev: TokenFormState, formData: FormData): Promise<TokenFormState>` (`TokenFormState` from `lib/auth/api-token.ts`), and `revokeTokenAction(tokenId: string): Promise<Result<null, string>>` (id through `z.uuid()`, else `token_not_found`); both `revalidatePath("/settings")`; the token is never logged. `components/settings/api-tokens-section.tsx` ("use client"): section with `h2`, intro text, `Create token` button (`data-token-create`), the list, empty state; `CreateTokenDialog` (form state, then reveal state in the same dialog: read-only `Input` whose value is the token, `CopyButton`, `Done`); `RevokeTokenDialog` (confirm). After a revoke the row's button is gone: `correctFocusOnceLost` moves focus to `[data-token-create]`. Dates through `LocalTime`.

**Task 12. Paste dialog, Research and Prep.** `app/(app)/jobs/[slug]/document-actions.ts`: `pasteDocumentAction(opportunityId: string, target: PasteTarget, _prev: PasteFormState, formData: FormData): Promise<PasteFormState>` (`PasteFormState` from `lib/artifacts/forms.ts`); validates `opportunityId` (`z.uuid()`), `target` (`pasteTargetSchema`), fields (`pasteFormSchema` in `lib/artifacts/forms.ts`, `stageId` read as `formData.get("stageId") ?? ""`); calls `pasteArtifact`; revalidates per D38. `components/job/paste-dialog.tsx` ("use client"): `PasteDialogTrigger(props: { opportunityId: string; target: PasteTarget; defaultKind: ArtifactKind; stages: { id: string; label: string }[]; initial?: { title: string; kind: ArtifactKind; stageId: string | null }; label: string; ariaLabel?: string })`; fields Title, Kind (Select, `items` = kind labels; only `companyWide` kinds when `target.scope` is `company`), Stage (Select, `items` with `"": "No stage"`; absent for company scope), Markdown (Textarea, 12 rows, `font-mono`); on success close, announce, `router.push` to `?tab=<tab>&doc=<ref>` with `scroll: false`. `components/job/document-list.tsx` (server): `DocumentList(props: { label: string; groups: DocGroup[]; selected: DocRef | null; basePath: string; tab: ArtifactTab })` renders `<nav aria-label>`, an `h2` per group whose `heading` is not empty (Documents passes one group with `heading: ""`), `<ul>` of `Link`s (`aria-current="true"` on the selected one) with a small line `<kind label> · v<n>` plus ` · Sent` when the latest is sent. `components/job/document-view.tsx` (server): `DocumentView(props: { doc: ArtifactRow; companyName: string | null; stageLabel: string | null; actions: React.ReactNode; children?: React.ReactNode })` renders `<article aria-labelledby>` with `h2` (`tabIndex={-1}`, `data-document-title`), the meta line, the actions row, then `<Markdown headingBase={3}>`; `children`, when given, replaces that body (Documents passes its editor island, which receives the server-rendered `<Markdown>` as a prop and shows it until `Edit` is pressed). `components/job/tab-research.tsx`, `components/job/tab-prep.tsx` (server) and `components/job/bridge-panel.tsx` (server, with `CopyButton`s and the Prep `PasteDialogTrigger`). `JobTabs` inserts Research after Overview and Prep last, `className="flex-wrap"`; `page.tsx` `TAB_IDS`, `resolveTab`, branches, `parseDocRef(searchParams.doc)`, company documents only on Research.

**Task 13. Documents.** `components/job/tab-documents.tsx` (server): list, the selected `DocumentView` with `getDocument(..., v)`, a versions section, and client islands. Actions in `document-actions.ts`: `saveDocumentEditAction(opportunityId: string, key: string, _prev: EditFormState, formData: FormData): Promise<EditFormState>` (`EditFormState` and `editFormSchema` from `lib/artifacts/forms.ts`; `key` through `KEY_PATTERN`, else `artifact_not_found`), and `markDocumentSentAction(opportunityId: string, key: string, version: number): Promise<Result<null, string>>`. `components/job/document-editor.tsx` ("use client"): `Edit` button (`data-document-edit`) toggles an editor in place of the rendered body: `ModeTabs` (`Write`, `Preview`), `Textarea` prefilled with the latest body, `Markdown headingBase={3}` for the preview, `Save` and `Cancel`, the sent notice when the latest is sent; after save or cancel focus returns to `Edit`. `components/job/mark-sent-dialog.tsx` ("use client"): confirm dialog; after success the trigger disappears, so `correctFocusOnceLost` focuses `[data-document-edit]`, else `[data-document-title]`. `components/job/version-list.tsx` (server): `h3` Versions, `<ol aria-label>`, one item per version newest first with a `Link` to `?tab=documents&doc=job:<key>&v=<n>`, words from `ORIGIN_WORDS`, edited and sent dates through `LocalTime`, and `versionNotice`. Viewing an older version shows the older-version notice and hides `Edit`. `JobTabs` inserts Documents after People.

### UI copy and accessible names (fixed)

`<title>`, `<company>`, `<name>`, `<slug>`, `<n>`, `<m>`, `<date>` are runtime values; `<date>` renders through `LocalTime`. No exclamation marks.

**Navigation:** sidebar and phone bar item `Settings`.

**Job page tabs:** tablist `Job sections`; tabs `Overview`, `Research`, `People`, `Documents`, `Timeline`, `Prep`.

**Shared document pieces:** list item link name = the document title; list meta `<kind label> · v<n>` and ` · Sent`. Article accessible name = the title (`h2`). Meta line parts joined with ` · `: `<kind label>`, `Version <n>`, `<origin word> <date>`, `Edited <date>` (when edited), `Sent <date>` (when sent), `<stage label>` (when staged), `Shared with every job at <company>` (company scope). Button `Paste a new version` (aria-label `Paste a new version of <title>`).

**Research:** section aria-label `Research`; button `Paste markdown`; nav `Research documents`; group headings `This job` and `Shared with every job at <company>`. Empty: title `No research yet.` text `Push research from the command line or paste markdown.`

**Documents:** section aria-label `Documents`; button `Paste markdown`; nav `Documents list`. Buttons `Edit` (aria-label `Edit <title>`), `Mark as sent` (aria-label `Mark version <n> of <title> as sent`, shown for an unsent version of a sendable kind). Versions heading `Versions`, list aria-label `Versions of <title>`, links `Version <n>`, notice `Pushed after you edited version <n>.` Older version: `You are viewing version <n>. The latest is version <m>.` with link `Open the latest version`. Sent version: `This version was sent and stays read-only.` Editor: view switch aria-label `Editor view`, options `Write` and `Preview`; field `Markdown`; buttons `Save` and `Cancel`; sent notice `Version <n> was sent. Saving creates version <m>.` Mark as sent dialog: title `Mark as sent`, text `Version <n> of <title> becomes read-only. Later edits start a new version.`, buttons `Mark as sent` and `Cancel`. Empty: title `No documents yet.` text `Push a CV, cover letter or message from the command line, or paste markdown.`

**Prep:** section aria-label `Prep`; nav `Prep documents`; group headings `General` and each stage label. Bridge panel: heading `Bring documents in`; text `Pull this job's context, write documents next to it, then push the folder.`; row labels `Pull` and `Push` with code `jobsmith pull <slug>` and `jobsmith push <slug>`; copy buttons aria-labels `Copy the pull command` and `Copy the push command`; text `Push reads the <slug>-*.md files in the current folder. Add --prefix when your files start with something else.`; link `Create a token in Settings`; button `Paste markdown`. Empty: title `No prep documents yet.` text `Push a prep packet from the command line or paste markdown.`

**Paste dialog:** titles `Paste markdown` (new) and `Paste a new version` (version); fields `Title`, `Kind` (the 12 labels), `Stage` (first option `No stage`, then stage labels), `Markdown`; buttons `Save` and `Cancel`.

**Announcements:** `Saved <title>.` (created or edited), `Saved <title> as version <n>.` (versioned), `Updated the details of <title>.` (updated), `Nothing changed. This text is already the latest version.` (unchanged paste), `No changes to save.` (unchanged edit), `Marked <title> as sent.`, `Created token <name>.`, `Revoked <name>.`, `Copied.`

**Toasts:** `Could not save <title>. <message>`, `Could not save the document. <message>`, `Could not mark <title> as sent. <message>`, `Could not revoke <name>. <message>`, `Could not copy. Select the text and copy it by hand.` (`<message>` from `messageFor`.)

**Settings (`/settings`):** h1 `Settings`; h2 `API tokens`; text `Tokens let the jobsmith command line read your jobs and push documents to them.`; button `Create token`; list aria-label `API tokens`, each row: the name, `<prefix>…` in code, `Created <date>`, `Last used <date>` or `Never used`, then `Revoked <date>` or button `Revoke` (aria-label `Revoke <name>`). Empty: `No tokens yet.` Create dialog: title `Create a token`, field `Name`, hint `A name that tells you where the token is used, like Laptop.`, buttons `Create token` and `Cancel`. Reveal state: title `Copy your new token`, text `This is the only time the token is shown. Save it with jobsmith login.`, read-only field `Your new token`, `Copy` (aria-label `Copy the token`), button `Done`. Revoke dialog: title `Revoke this token`, text `<name> stops working right away. This cannot be undone.`, buttons `Revoke token` and `Cancel`.

### Messages and validation (fixed)

**`messageFor` additions:** `artifact_not_found`: `This document no longer exists.` `not_sendable`: `Only CVs, cover letters and messages can be marked as sent.` `already_sent`: `This version is already marked as sent.` `token_not_found`: `This token no longer exists.` (Existing `invalid`, `not_found` and the fallback stay.)

**Validation messages:** token name: blank `Give the token a name.`, over 60 characters `Keep the name to 60 characters or fewer.` Paste: title blank `Give the document a title.`, over 200 `Keep the title to 200 characters or fewer.`; kind `Choose a kind.`; stage `Choose a stage from the list.`; markdown blank `Paste some markdown.`; over 1 MB `Keep the markdown under 1 MB.` Editor: blank `The document cannot be empty.`; over 1 MB `Keep the markdown under 1 MB.` Push schema (Zod messages, reported as `<path>: <message>`): body `The body must be a JSON object.`; `artifacts` `artifacts must be a list.` and `artifacts must hold at least one document.`; `key` `key must be a string.` and `key must be 1 to 100 lowercase letters, digits, dots, dashes or underscores, starting with a letter or digit.`; `kind` `kind must be a string.` and `kind must not be empty.`; `title` `title must be a string.`; `scope` `scope must be opportunity or company.`; `stage` `stage must be a string.`; `body_md` `body_md must be a string.` and `body_md must not be empty.`

**Artifact warnings** (`lib/artifacts/values.ts` `warningMessage`): `unknown_kind` `<key>: unknown kind "<kind>", stored as other.` `stage_not_found` `<key>: no stage matches "<stage>", stored without a stage.` `stage_ignored` `<key>: documents shared with the whole company have no stage, so "<stage>" was ignored.` `company_scope_not_allowed` `<key>: only research, fit briefs and people notes can be shared with the whole company, so it was stored for this job.` `sent_locked` `<key>: version <n> was sent, so its title, kind and stage stay as they were.`

**Bridge errors** (`lib/bridge/errors.ts` `BRIDGE_ERRORS`): `unauthorized` (401) `Missing, unknown or revoked token.` `rate_limited` (429) `Too many requests. Try again in <seconds> seconds.` `not_found` (404) `No job with the slug <slug>.` `invalid_query` (400) `status must be active, closed or all.` for list and `dry_run must be true or false.` for push. `invalid_json` (400) `The request body is not valid JSON.` `invalid_payload` (400) the `firstIssue` text. `duplicate_key` (400) `The key <key> appears more than once in this push.` `payload_too_large` (413) `The request is larger than 4 MB. Push fewer files at a time.` `too_many_artifacts` (413) `A push holds at most 50 documents.` `artifact_too_large` (413) `<key> is larger than 1 MB.` `server_error` (500) `Something went wrong on the server. Request id <requestId>.`

**CLI lines** (stdout unless marked stderr): `Logged in to <url>. Saved to <path>.` · stderr `The server refused this token.` (login) · stderr `The server refused the token. Create a new one in Settings and run jobsmith login.` (other commands) · stderr `Not logged in. Run jobsmith login first.` · stderr `Could not reach <url>: <reason>.` · stderr `Error: <server message>` · list rows `<slug>  <role> at <company>  <stage label>` (columns padded to the widest value), empty `No active jobs.` · `Wrote <path>.` · push rows `  <status padded to 9>  <key>` plus ` (version <n>)` for created and versioned · `Warning: <message>` · `Note: skipped <file>: <reason>.` and `Note: <file> has no kind in the suffix map, pushing it as other.` · summary `<a> created, <b> versioned, <c> updated, <d> unchanged.` · dry run first line `Dry run: nothing was saved.` · stderr `No <prefix>-*.md files in <dir>.` · stderr `<file> is larger than 1 MB. Split it or leave it out.` · stderr `<file>: scope must be opportunity or company.` · stderr `Could not read jobsmith.config.json: <reason>.` · stderr `That does not look like a Jobsmith token.` (login, shape check) · stderr `Enter a URL that starts with http:// or https://.` (login, exit 2) · `--version` prints `0.1.0` · usage (stdout for `--help`, stderr and exit 2 otherwise):

```
Usage: jobsmith <command> [options]

  login --url <base-url>          Save the Jobsmith URL and a token (read from standard input)
  list                            List active jobs and their slugs
  pull <slug> [--out <dir>]       Write <slug>-context.md
  push <slug> [--dir <dir>] [--prefix <file-prefix>] [--dry-run]
                                  Push <prefix>-*.md files as documents
```

### End to end, docs (Tasks 14 and 15)

**Task 14.** `tests/e2e/global-setup.ts` also runs `pnpm cli:build` once. `playwright.config.ts` `testMatch`: chromium and webkit `/(shell|pipeline|job-page|documents|bridge)\.spec\.ts$/`, phone `/(shell|pipeline-phone|documents-phone)\.spec\.ts$/`. New helpers: `tests/e2e/session.ts` (`login(page)`, `uniqueName(testInfo, base)`, `addJobAndOpen(page, company, role): Promise<string>` returning the slug from the URL), `tests/e2e/cli.ts` (`runCli(args: string[], options: { configHome: string; input?: string }): Promise<{ code: number; stdout: string; stderr: string }>`, spawns `process.execPath` with `cli/dist/jobsmith.mjs`, env `XDG_CONFIG_HOME` set and `JOBSMITH_URL`, `JOBSMITH_TOKEN` removed), `tests/e2e/scan-in-place.ts` (the scheme switching of `scan-open.ts`, whole page, no reload, for the in-page editor). Specs: `bridge.spec.ts` (D37, plus revoke then `list` exits 1; axe on `/settings`, the create token dialog in its reveal state, the revoke dialog, and Research, Documents and Prep with documents); `documents.spec.ts` (paste a CV, see it on Documents, edit with Write and Preview, save, mark as sent through the dialog, see `Sent` and the read-only notice, edit again and get version 2; axe on the paste dialog, the mark as sent dialog and the editor); `documents-phone.spec.ts` (paste on a phone, open Prep and Documents, the tab strip wraps, `document.documentElement.scrollWidth <= window.innerWidth` on both, axe). Token names `CLI <project> <suffix>`.

**Task 15.** README: a "Documents and the command line" section (install with `pnpm cli:build` then `npm install -g ./cli`, `login`, `list`, `pull`, `push`, frontmatter keys, the suffix map, `jobsmith.config.json`, limits, dry run) and an "API" section (the three endpoints, headers, bodies, responses, error codes, rate limit). `docs/design-system.md`: new components `markdown.tsx` and `copy-button.tsx` recorded as new code (no registry match) and the `DetailTabs` `flex-wrap` class passed as a prop (no vendored change). Spec notes under sections 4, 5.2, 5.3, 5.4, 5.9 and 7 for D4, D9, D11, D12, D14, D18, D21, D23 to D27, D30 to D35. `.gitleaks.toml` (D41). Preview check in Chrome and Safari on desktop and at 390px. Owner-gated last step: a `--dry-run` push of one real packet on the owner's instance, then the real push; nothing from it is committed.

### Adjustments made while the tasks were written

Where a task's text and this Contract differ on one of these points, the task's text wins.

- Task 3 also consumes Task 2's `ArtifactMeta` type (`import type` only; `lib/artifacts/tabs.ts` stays free of runtime `lib/db` imports). The task table's "Consumes" for Task 3 is 1 and 2.
- D16's 200-character clip applies to whichever title source wins (given, first H1 or key).
- `saveArtifactEdit` validates the normalized body first (empty or over `MAX_ARTIFACT_BYTES` is `invalid`, with `editFormSchema`'s two messages), so its `invalid` code is reachable.
- `prepGroups` drops every empty group, General included, the same way `researchGroups` does.
- `pasteTargetSchema`'s failure message is `That is not a valid document target.` (never shown for input a person types; the app builds every target itself).
- `markArtifactSent` takes no company lock: every sendable kind is job-scoped only (D18).

### Task list

Each task is one reviewer gate with its own tests and ends with a commit. Later tasks rely only on what an earlier task's "Produces" names.

| # | Task | Files (main) | Consumes | Produces |
|---|---|---|---|---|
| 1 | Schema, migration 0003, kinds and values | `lib/db/schema/artifact.ts`, `api-token.ts`, `index.ts`; `lib/artifacts/kinds.ts`, `values.ts`; `lib/db/migrations/0003_*`; tests | M2 schema | tables, `ARTIFACT_KINDS`, value lists and types |
| 2 | Scoped helpers and isolation matrix | `lib/db/scoped/artifact.ts`, `api-token.ts`, `index.ts`, `opportunity.ts`, `company.ts`; `tests/helpers/db.ts`; isolation test | 1 | `s.artifact`, `s.apiToken`, `listSlugsForCompany`, `listSummaries`, `company.lockById` |
| 3 | Pure artifact core | `lib/artifacts/normalize.ts`, `stage-ref.ts`, `plan.ts`, `tabs.ts`; `lib/bridge/wire.ts` (the whole leaf module); unit tests | 1 | normalization, planner, notices, grouping, `DocRef`, wire limits |
| 4 | Artifact persistence, read models, hasArtifacts | `lib/artifacts/upsert.ts`, `paste.ts`, `edit.ts`, `sent.ts`, `read.ts`, `forms.ts`, `values.ts`; `lib/pipeline/stage-state.ts`, `snapshot.ts`, `stage-controls.ts`, `read.ts`, `messages.ts`; `lib/forms/state.ts`; tests | 2, 3 | every artifact write path, `JobView.documents`, `getDocument`, real `hasArtifacts`, `FormStateWith`, form schemas, M3 message codes |
| 5 | API tokens | `lib/auth/api-token.ts`; tests | 2 | token create, list, revoke, `authenticateBearer` |
| 6 | Bridge core | `lib/bridge/http.ts`, `errors.ts`, `push-schema.ts`, `context.ts`; unit tests | 3, 4, 5 | parsing, capped reader, errors, schema, context builder |
| 7 | Bridge handlers and routes | `lib/bridge/handlers.ts`, `deps.ts`; `app/api/bridge/**/route.ts`; `proxy.ts`; tests | 4, 5, 6 | the three endpoints, proxy exclusion |
| 8 | CLI core | `cli/src/args.ts`, `config.ts`, `frontmatter.ts`, `suffixes.ts`, `collect.ts`, `batch.ts`, `output.ts`, `io.ts`, `version.ts`; unit tests | 3 (`wire.ts`) | pure CLI pieces |
| 9 | CLI commands, bundle, packet | `cli/src/main.ts`, `index.ts`, `http.ts`, `commands/*.ts`; `cli/package.json`; `scripts/build-cli.mjs`; `package.json`; `.gitignore`; `tests/fixtures/packet/`; `tests/helpers/bridge-fetch.ts`; integration tests | 7, 8 | `jobsmith` CLI, `cli:build`, the packet |
| 10 | UI foundations | `components/markdown.tsx`, `copy-button.tsx`; `lib/markdown/rank-headings.ts`; `next.config.ts`; `package.json`; tests | none | `Markdown`, `CopyButton`, the 2 MB action limit |
| 11 | Settings and tokens UI | `components/app-shell.tsx`; `app/(app)/settings/page.tsx`, `actions.ts`; `components/settings/api-tokens-section.tsx` | 4, 5, 10 | `/settings` |
| 12 | Paste dialog, Research, Prep | `app/(app)/jobs/[slug]/document-actions.ts`, `page.tsx`; `components/job/paste-dialog.tsx`, `document-list.tsx`, `document-view.tsx`, `tab-research.tsx`, `tab-prep.tsx`, `bridge-panel.tsx`, `job-tabs.tsx` | 4, 10 | two tabs, paste |
| 13 | Documents | `components/job/tab-documents.tsx`, `document-editor.tsx`, `mark-sent-dialog.tsx`, `version-list.tsx`; `document-actions.ts`; `job-tabs.tsx`; `page.tsx` | 4, 10, 12 | Documents tab, editor, sent lock |
| 14 | End to end and accessibility | `tests/e2e/*` (above), `playwright.config.ts`, `global-setup.ts` | 9, 11, 12, 13 | acceptance proof |
| 15 | Docs and ship | `README.md`, `docs/design-system.md`, spec notes, `.gitleaks.toml` | all | shipped milestone |

Tasks 1 to 4 are in `tasks-01-04.md`, Tasks 5 to 9 in `tasks-05-09.md`, Tasks 10 to 15 in `tasks-10-15.md`.

### Checked while planning

- Verified in planning scratch files: migration 0003 is additive and applies on PGlite with every constraint in D2 and D3; `selectDistinctOn` returns the latest version per key; the D4 statement authenticates, touches and counts in one step; the D21 markdown setup with react-markdown 10.1.0, remark-gfm 4.0.1 and rehype-sanitize 6.0.0 (borrowed read-only, nothing installed); the rank-headings plugin types against react-markdown's `Options`; a bridge handler runs on PGlite with no server, the capped body reader holds, `revalidatePath` throws outside Next, and the D7 matcher excludes only the bridge; the CLI source and the real `proxy.ts` config import under Vitest; the esbuild CLI bundle and the D30 and D31 file modes; pnpm 11 ignores a nested `cli/package.json`.
- Unverified: the markdown packages inside a real Next 16 build (no install allowed; react-markdown 10 has no hooks in `Markdown` and no client directive, so a Server Component can render it); the CLI bundle on Node 20; `npm install -g ./cli`; the gitleaks rule; true row-lock concurrency (PGlite has one connection).
