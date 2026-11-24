# Jobsmith Apply and Research: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send the right CV as a real PDF or DOCX file and record what went out, see and carry hand edits across versions, bring research up to date before an interview with a computed "what's new", and give every company a page with a safe merge for duplicates.

**Architecture:** One artifact version is mapped to a small document model and rendered on the server by two pure JavaScript renderers (`@react-pdf/renderer`, `docx`); the sent file is kept byte for byte through Prep's storage and `asset` table. Compare, carry forward and "what's new" are pure code over line and sentence units (`diff`, `node-diff3`), with one transaction that writes the merged text through the existing edit path. A refresh is a request stored in two `artifact` columns behind one module, read by the context document and two new bridge read routes. Company pages sit on `lib/companies`, which becomes the writer of company rows, aliases and merges, with Feed's tables reached through a port.

**Tech stack additions:** `@react-pdf/renderer`, `docx`, `unified`, `remark-parse` (`remark-gfm` is already installed), `fontkit`, `diff`, `node-diff3` at runtime; `jszip` and `@types/mdast` for tests and types; `unpdf` (already present from Hosted; if it is not yet installed it is added here as a runtime dependency because Task 6 counts pages with it). Pin every version exactly at install time and record the version in the task report; no version is chosen in this plan. Fonts: Source Sans 3 and Source Serif 4 (SIL Open Font License 1.1), static TTF, committed with `OFL.txt` under `lib/doc-export/fonts/`.

**Spec:** `docs/superpowers/specs/2026-11-01-jobsmith-apply-research-design.md`, all sections; Core sections 2, 3, 4 and 8 of `docs/superpowers/specs/2026-09-18-jobsmith-core-design.md`; Prep sections 4 and 5.5 (the `asset` table, `lib/storage`, the key prefix); Hosted sections 4, 5.5, 5.6 and 5.10 (`fit_brief`, `startGeneration`, the prefix rule); Feed sections 3, 4 and 5.1 to 5.8 (`feed_source`, `feed_item`, tracking line, `saveFeedItem`); Bridge part two section 4 (the move of the refresh columns).

## Status on 2026-11-21

**Already built** (Core milestones 1 to 5 and the demo sign-in, on `main`):
- Artifacts: `lib/artifacts/edit.ts` (`saveArtifactEdit`), `plan.ts` (`planUpsert`, `versionNotice`), `upsert.ts` (`applyUpserts`, `upsertArtifacts`), `paste.ts` (`pasteArtifact`), `sent.ts` (`markArtifactSent`), `read.ts` (`getDocument`), `tabs.ts` (`DocRef`, `formatDocRef`), `kinds.ts`, `normalize.ts`.
- Pipeline and companies: `lib/pipeline/move.ts` (`moveOpportunity`), `next-action.ts` (`setNextAction`), `create.ts` (`createOpportunity`), `details.ts` (`updateCompanyDetails`, which moves), `duplicates.ts`, `event-text.ts`; `lib/companies/name-key.ts`, `overview.ts`, `load.ts`; `lib/people/index.ts`.
- Bridge and CLI: `lib/bridge/context.ts`, `handlers.ts`, `wire.ts`, `errors.ts`; `app/api/bridge/opportunities/[slug]/{artifacts,context}/route.ts`; `cli/src/{args,collect,frontmatter,suffixes}.ts`, `cli/src/commands/pull.ts`.
- UI: the Documents, Research and Prep tabs under `components/job/`, `components/markdown.tsx`, the registry components under `components/super-ai/`, the Settings page and data export (`lib/export/collect.ts`), Home's attention list (`lib/attention/*`).
- Tests: `tests/helpers/*`, `tests/integration/scoped-isolation.test.ts`, `tests/integration/migrations.test.ts`, the e2e helpers (`session.ts`, `axe.ts`, `scan-open.ts`, `scan-in-place.ts`, `cli.ts`).
- Nothing from this spec: no export, compare, merge helper, refresh request, company page or alias exists in code.

**Depends on** (the roadmap ships cycles in order, spec section 1; section 9 states the prerequisite and no other leave-out, so the fallbacks below are this plan's own):

| Milestone | Needs merged first | If it has not shipped |
|---|---|---|
| 20 | Prep milestones 6 and 7 (`asset` table, `lib/storage`); Hosted milestone 11 (storage prefix rule) and 14 (storage quota) are optional, read through one injectable hook | Build Tasks 1, 3, 4, 5, 6, 7 and the parser half of Task 14. Stop before Task 2. |
| 21 | nothing from other cycles (Core only) | Build all of it. |
| 22 | Milestone 20 Task 1 and Milestone 21; nothing from other cycles | Build all of it. |
| 23 | Milestone 21 and 22; Hosted milestones 13 and 14 for Task 42 only | Leave out Task 42; the spec says the in-app option is absent with AI off. |
| 24 | Milestones 20, 21, 23; Feed milestones 16, 17 and 19 for Tasks 49, 52 (open roles half), 55 and 56 (tracked roles step) | Build Tasks 44 to 48, 50, 51, 52 (loader half), 53, 54, 56 (without tracked roles); merge runs with the no-op feed port. |

**Which milestones can be built before Prep, Hosted and Feed ship, and which cannot:**
- **Can:** Milestone 21 (Compare) and Milestone 22 (Carry edits forward). Both touch only Core's artifact code and the Documents, Research and Prep tab components, and they read only columns that exist today plus `artifact.source_body_md`. That column is created by Milestone 20 Task 1, which needs nothing from Prep, Hosted or Feed: Task 1 is the one migration kept separate from the Prep-dependent one on purpose (spec section 9 lists both in one migration; this plan splits them into two migration files inside Milestone 20 so Milestone 22 does not wait for Prep).
- **Can, in part:** Milestone 20 Tasks 1, 3 to 7 (settings, document model, fonts, both renderers) and the form answers parser; Milestone 23 Tasks 32 to 41 and 43 (everything except the in-app fit brief); Milestone 24 Tasks 44 to 48, 50, 51, 52 (loader), 53, 54.
- **Cannot:** Milestone 20 Tasks 2, 8 to 13 and 15 (storage and the `asset` table are Prep's); Milestone 23 Task 42 (Hosted's `startGeneration`); Milestone 24 Tasks 49, 55 and the open roles half of Task 52 (Feed's tables and components).

**Bridge part two.** `2026-11-01-jobsmith-bridge-two-design.md` (milestones 31 and 32) copies open refresh requests into `work_request` as kind `research_refresh` and drops `artifact.refresh_requested_at` and `artifact.refresh_note` one milestone later. So milestone 23 keeps the two columns behind one module: `lib/artifacts/refresh-columns.ts` writes them, `lib/research/refresh.ts` reads them, and no other file mentions either name (a unit test in Task 32 enforces it). The context document's `## Refresh requests` section, the JSON index fields and `pull --requested` are written against `listRefreshRequests` only, so Bridge part two repoints one module and the section shape, the index fields and the CLI flag stay as written here.

**Left out of this plan on purpose:**
- `lib/import/applications.ts` keeps its own `findByNameKey` lookup. The import is a one-time script and the spec names only intake and Feed matching (Task 45).
- Home's "Recent pushes" still reaches a company document through any job at that company; the spec retires that rule only in `lib/companies/overview.ts` (Task 52).
- A text column that names a company document by key (a later cycle's copy of an artifact key) is not a foreign key, so the merge test in Task 48 cannot see it; a later cycle that adds one handles it in its own plan.
- Debrief's `fork` intent in `planUpsert` (Debrief milestone 25) also writes `artifact.source_body_md`; this plan leaves `planUpsert` untouched and writes the base only in `saveArtifactEdit` (Task 1).
- Hosted's wording "generated after you edited version N" changes one sentence in `versionNotice` and in the carry banner (Task 30); the base rule itself lives in `editedBaseOf` (Task 18).
- Staleness at 41 days cannot be produced from a browser, so it has integration tests with a fixed clock and no e2e (Task 43).

**Needs an account, a paid service, hosting or the owner's answer:**
1. Prep milestones 6 and 7 merged (the `asset` table and `lib/storage`): blocks Tasks 2, 8, 9, 10, 11, 12, 13, 15. CI uses Prep's `memory` driver, so no account is needed to run them.
2. The owner's private storage on Vercel (`vercel_blob`, Prep's decision) with `STORAGE_PROVIDER` set on the preview: needed only for the live check in Tasks 8 and 15.
3. The two font families downloaded once from their upstream releases (network, no account), with version and sha256 recorded in `lib/doc-export/fonts/README.md`: blocks Task 5's glyph test and Tasks 6 and 7's golden files.
4. The manual check, once per `renderer_version`: the CV and cover letter fixtures opened in Word, Pages, Google Docs (a Google account), LibreOffice, Acrobat Reader and macOS Preview, result recorded in the Milestone 20 pull request: a merge gate of Task 15.
5. Hosted milestone 11 (prefix rule) and 14 (storage quota): optional, wired in one line of `lib/doc-export/deps.ts` when they exist; no task is blocked.
6. Hosted milestones 13 and 14 (generation and credits): blocks Task 42. CI uses Hosted's fake AI driver. The live check needs an AI key and a credit balance on the preview.
7. Feed milestones 16, 17 and 19 (tables, tracking line and item row, aggregator matching): blocks Tasks 49, 52 (open roles half), 55, the aggregator line of Task 49 and the tracked roles step of Task 56.
8. The spec asks the milestone plans to confirm two framework facts and fix three pieces of wording; each is a task step, none needs an account: how a route handler bundles the font files and whether `@react-pdf/renderer` belongs in `serverExternalPackages` (Task 8, Step 0, reads `node_modules/next/dist/docs/`); the refresh prompt wording (Task 41, fixed in the Contract below); the `company_merged` timeline wording (Task 44, fixed below).
9. Wording the spec leaves open and this plan fixed, for the owner to read before the milestone merges: the export warning texts (Task 9), "Sent CV version 3 as PDF" for the other formats and old events (Task 11), the carry panel's summary and two-way sentences (Task 26), the refresh prompt (Task 41), the merge preview's tracked roles sentence (Task 47), the `company_merged` event text (Task 44).
10. Spec section 11, "Assumed until the owner says otherwise": all fifteen are used as written; the table in the Contract names the one constant each lives in, so an owner change is one edit.

The spec asks for Figma drafts before each milestone plan. None were made for this plan.

## Global Constraints

- Never commit to or push `main`. One branch per milestone named `feat/mNN-<slug>` cut from `main`: `feat/m20-export-apply`, `feat/m21-compare`, `feat/m22-carry-edits`, `feat/m23-research-refresh`, `feat/m24-company-pages`.
- Git config untouched. Commit messages end with the trailer the session supplies.
- Public repo hygiene: fixtures, seeds, screenshots and docs use the fictional company Northwind Traders and fictional people (for example Jordan Lee, Dana Reyes) and carry no pay figures. Tests never hold key-like literals: build them at runtime as `"k".repeat(24)`; ids are zero-padded; hashes are computed, never pasted.
- Next.js 16 has breaking changes: read the relevant guide in `node_modules/next/dist/docs/` (resolved from the repo root, `AGENTS.md`) before writing any code that touches a Next API, and heed deprecation notices.
- `requireUser()` runs in every page, server action and handler, with these exceptions: the export route and the settings export route use `getUser()` and answer 401 (a route handler must not redirect); the bridge routes use bearer auth and never a session. The export route accepts a session only, never a bearer token.
- `app/` and `components/` never import `@/lib/db/client`. Every `lib/*` function takes a database handle and a user id (through `Scoped`).
- Single writers (spec 3): `lib/artifacts` keeps every artifact write, including carry forward and the refresh columns (`lib/artifacts/refresh-columns.ts`); `lib/pipeline` keeps stage moves; `lib/doc-export/store.ts` is the only writer of `document_export` and its assets; `lib/companies` writes company rows, aliases and merges, while `company.tracked` and the link fields set by tracking stay with `lib/feed/sources.ts` and feed item writes stay with `lib/feed/items.ts`; `lib/people` writes people; `lib/apply/mark-applied.ts` writes nothing itself and calls those owners inside one transaction.
- Typed `Result` for expected failures (`lib/result.ts`); a thrown error is a bug.
- Test first under `lib/`. Mutation checks on the tests marked in a task's Acceptance are proven by making the named change, watching the test fail and reverting, and the task report says so.
- No test touches the network. Outbound calls are absent from the export path (fonts come from disk, images are dropped, only `http`, `https` and `mailto` become link annotations).
- Document text is rendered as text nodes only in Compare, the carry panel and "what's new"; nothing from a document becomes HTML (spec 7).
- Logs never carry document text, names, titles or file names: `[export]`, `[merge]` and `[carry]` lines carry ids, counts, formats and codes only.
- No exclamation marks in UI copy. Prose rules apply to docs: no em dashes.
- Semantic token utilities only; `pnpm check:tokens` passes. New components use the registry first, then the installed `base-nova` primitives, then new code recorded in `docs/design-system.md` under "New application code" with its reason.
- Accessibility: axe zero violations in light and dark on every new page, dialog and view; keyboard-only paths for compare navigation, conflict choices and the merge; a live region announces every list or state change.
- Times render through `LocalTime`; forms go through `lib/forms/submit.ts` with try/catch, toast and `correctFocusOnceLost` as the other dialogs do.
- Every new owned table gets its own file under `lib/db/scoped/` and a row in `tests/integration/scoped-isolation.test.ts`: `document_export` (Task 2), `company_alias` (Task 44). `pnpm db:generate` run twice produces no second migration.
- Core's Playwright rules: e2e specs share one account, name fixtures with project plus a suffix (`uniqueName`), scan open overlays with `scanOpenOverlay`. The `apply-chromium`, `apply-webkit` and `apply-phone` projects run after the earlier cycles' chains, one engine at a time, because they change the shared account's profile; Task 15 creates them depending on the last project in `playwright.config.ts` on `main`.
- No new environment variables (spec 3). Every milestone's last task confirms `git diff --exit-code .env.example`.

## Review Focus

1. **A sent file changes after it was sent.** A `renderer_version` bump, a newer version of the document, or pruning after an in-place edit must never touch a pinned export. Pinned by Task 8 (pinned bytes after a version bump, never pruned, 410 when the object is gone) and Task 11 (pin on mark as sent), and again by the e2e byte comparison in Task 15.
2. **Carry forward writes without a decision, or onto text that moved.** Only non-overlapping changes apply by themselves; `stale` and `unresolved` write nothing; a version sent in the meantime forks instead of being overwritten; a version edited before Milestone 20 has no base and must fall to the two-way panel. Pinned by Tasks 25, 26 and 28 (and Task 1 for the base).
3. **A company merge orphans, cascades away or mis-hashes data.** Every foreign key to `company` is handled (a later cycle's table fails the test until handled), one transaction with the specified lock order, a rolled-back failure, `dedupe_hash` recomputed so a posting under the old name is flagged as a duplicate, aliases never colliding with a company name key. Pinned by Tasks 45, 46 and 48.
4. **Mark applied half-applies.** A job must never be in Applied with no sent record, or sent with the stage unmoved; the applied date must land on the stage and the event; a render failure must leave the job in Saved. Pinned by Task 12.
5. **An export that reads badly to a tracking system or to Word.** Links whose text differs from the address, characters the fonts lack, tables of seven or more columns and list depth are the inputs that lose information; each has a mapping rule and a stored warning. Pinned by Tasks 4, 5, 6 and 7, and the manual check in Task 15.

## Module map

**Milestone 20: Export and apply**

| File | New/changed | One responsibility |
|---|---|---|
| `lib/db/schema/artifact.ts`, `app.ts` | changed | `artifact.source_body_md`, `profile.documents` |
| `lib/db/scoped/artifact.ts` | changed | meta columns exclude the merge base |
| `lib/artifacts/edit.ts` | changed | base capture on a version's first in-app edit |
| `lib/db/schema/document-export.ts`, `lib/db/scoped/document-export.ts` | new | `document_export` table and its scoped helper |
| the schema file of `asset` (Prep) | changed | kind `export` |
| `lib/doc-export/values.ts` | new | formats, templates, page sizes, warning and error codes, limits |
| `lib/doc-export/settings.ts` | new | `profile.documents` read tolerantly, page size rule, default template, file name name |
| `lib/doc-export/model.ts` | new | markdown to `DocModel` with warnings |
| `lib/doc-export/theme.ts`, `glyphs.ts`, `filename.ts`, `version.ts`, `fonts/` | new | templates and colors, glyph check, file names and `Content-Disposition`, `RENDERER_VERSION`, font files |
| `lib/doc-export/pdf.tsx`, `docx.ts` | new | the two renderers |
| `lib/doc-export/store.ts`, `handler.ts`, `deps.ts`, `log.ts`, `pin.ts` | new | cache, pin and prune, request handling, injected deps, the `[export]` line |
| `app/api/exports/[artifactId]/route.ts` | new | `GET` download, session only |
| `lib/doc-export/dialog-model.ts`, `warnings.ts`, `components/doc-export/*` | new | export dialog and its model |
| `components/settings/documents-section.tsx`, `lib/export/collect.ts` | new, changed | Settings Documents section; `documentExports` in the data export |
| `lib/artifacts/sent.ts`, `components/job/mark-sent-dialog.tsx`, `lib/pipeline/event-text.ts` | changed | "sent as", meta, timeline wording |
| `lib/apply/mark-applied.ts`, `messages.ts`, `dialog-model.ts`, `form-answers.ts` | new | Mark applied in one transaction, copy, dialog model, form answers parser |
| `components/apply/*`, `app/(app)/jobs/[slug]/apply-actions.ts` | new | Mark applied dialog, record-sent notice, form answers view |
| `components/job/job-header.tsx`, `tab-documents.tsx`, `components/home/attention-item.tsx`, `lib/attention/copy.ts`, `app/(app)/home-actions.ts` | changed | entry points; `?apply=1` link from Home |

**Milestone 21: Compare**

| File | New/changed | One responsibility |
|---|---|---|
| `lib/compare/limits.ts`, `units.ts` | new | constants; units, `unitsForDiff`, `bodyFromUnits` |
| `lib/compare/diff.ts` | new | unit diff, word marks, summary, limit fallbacks |
| `lib/artifacts/plan.ts`, `lib/compare/pair.ts` | changed, new | `editedBaseOf`; default pair and query parsing |
| `lib/compare/load.ts`, `header.ts`, `collapse.ts`, `navigator.ts`, `links.ts` | new | comparison loader, header model, collapsing, navigator rules, hrefs |
| `components/compare/*` | new | marks, split and inline views, navigator, pickers, page |
| `app/(app)/jobs/[slug]/compare/page.tsx`, `app/(app)/companies/[id]/compare/page.tsx` | new | the two routes |
| `components/job/version-list.tsx`, `tab-documents.tsx`, `tab-research.tsx`, `tab-prep.tsx` | changed | ways in |

**Milestone 22: Carry edits forward**

| File | New/changed | One responsibility |
|---|---|---|
| `lib/compare/merge.ts`, `two-way.ts`, `choices.ts`, `carry-model.ts` | new | three-way merge, two-way fallback, choices, carry model and offer rule |
| `lib/artifacts/edit.ts` | changed | `saveEditInScope` extracted |
| `lib/artifacts/carry.ts`, `carry-log.ts` | new | `carryEditsForward`, the `[carry]` line |
| `components/compare/carry-panel.tsx`, `conflict-card.tsx`, `app/(app)/jobs/[slug]/carry-actions.ts`, `app/(app)/companies/[id]/carry-actions.ts` | new | panel and actions |
| `components/job/tab-documents.tsx`, compare pages | changed | banner and offer |

**Milestone 23: Research refresh**

| File | New/changed | One responsibility |
|---|---|---|
| `lib/db/schema/artifact.ts`, `lib/artifacts/refresh-columns.ts` | changed, new | the two columns and their only writer |
| `lib/research/refresh.ts`, `stale.ts`, `panel.ts`, `refresh-prompt.ts` | new | request, cancel, list, `REFRESH_TASKS`; staleness; panel loader; prompt |
| `lib/bridge/context.ts`, `handlers.ts`, `documents.ts`, `wire.ts`, `errors.ts` | changed, new | `## Refresh requests`; index and document routes |
| `app/api/bridge/opportunities/[slug]/artifacts/route.ts`, `[key]/route.ts` | changed, new | `GET` routes |
| `cli/src/args.ts`, `commands/pull.ts`, `suffixes.ts`, `frontmatter.ts` | changed | `--doc`, `--requested`, `research-refresh`, quoted frontmatter values |
| `lib/compare/whats-new.ts` | new | the six "what's new" rules |
| `components/research/*`, `app/(app)/research-actions.ts` | new | panel, refresh dialog and notice, actions, in-app fit brief |
| `components/job/document-list.tsx`, `document-view.tsx`, `tab-research.tsx`, `lib/attention/*`, `components/home/attention-item.tsx` | changed | age text, panel, Home note |

**Milestone 24: Company pages**

| File | New/changed | One responsibility |
|---|---|---|
| `lib/db/schema/company-alias.ts`, `lib/db/scoped/company-alias.ts`, `lib/pipeline/values.ts`, `lib/db/schema/pipeline.ts` | new, changed | alias table; `company_merged`; event check from `EVENT_KINDS` |
| `lib/companies/match.ts` | new | name then alias |
| `lib/companies/edit.ts` | new | edit, rename, aliases (absorbs `updateCompanyDetails`) |
| `lib/companies/merge-plan.ts`, `merge.ts`, `merge-feed.ts`, `merge-log.ts` | new | planner, transaction, feed port, log |
| `lib/artifacts/company.ts`, `upsert.ts` | new, changed | company-only edit and paste; `UpsertContext` |
| `lib/people/index.ts` | changed | company-level add, edit, remove |
| `lib/companies/page.ts`, `open-roles.ts`, `overview.ts`, `load.ts` | new, changed | page loader, Feed's open roles |
| `app/(app)/companies/[id]/page.tsx`, `actions.ts`, `components/company/*` | new | route, actions, sections, dialogs |
| `app/(app)/companies/page.tsx` | changed | links to the company page |

## Contract

Names below are binding character for character. A task text that departs from one is a defect.

### Tables and columns

- **`document_export`** (owned): `id` uuid, `user_id` text with index, `artifact_id` uuid, `opportunity_id` uuid, `format` (`pdf`, `docx`), `template` (`standard`, `classic`), `page_size` (`letter`, `a4`), `content_hash` text, `renderer_version` integer, `render_key` text (32 hex), `file_name` text, `asset_id` uuid, `bytes` integer, `pages` integer nullable, `warnings` jsonb (a list of `{ code, examples? }`), `sent_at` timestamptz nullable, `created_at`, `updated_at`. Foreign keys on `(user_id, artifact_id)` to `artifact (user_id, id)` cascade, `(user_id, opportunity_id)` cascade, `(user_id, asset_id)` to `asset`. Unique `document_export_artifact_render_key_unique` on `(artifact_id, render_key)`. Index on `(user_id, opportunity_id)`.
- **`company_alias`** (owned): `id`, `user_id`, `company_id` (foreign key `(user_id, company_id)` cascade), `name`, `name_key`, `source` (`rename`, `merge`), `merged_company_id` uuid nullable with no foreign key, timestamps. Unique `company_alias_user_name_key_unique` on `(user_id, name_key)`. A name key belongs to one company or one alias of the same user, never both.
- **`artifact`** gains `source_body_md` text nullable, `refresh_requested_at` timestamptz nullable, `refresh_note` text nullable with check `artifact_refresh_note_check` (null or at most 500 characters). `ArtifactMeta` excludes `bodyMd`, `userId` and `sourceBodyMd` and includes the two refresh fields.
- **`profile.documents`** jsonb default `{}`: `{ version: 1, pageSize: "letter" | "a4" | null, templates: { cv, cover_letter, message_draft }, fileName: string | null }`.
- **`asset.kind`** gains `export`. **`event.kind`** gains `company_merged` (the check is built from `EVENT_KINDS`, which keeps every kind earlier cycles added). **`document_sent` event meta** gains `format` (`pdf`, `docx`, `text`, `other`) and `exportId` (string or null).
- Object key for an export: `u/<first 16 hex of sha256(user id)>/exports/<random 32 hex>.pdf` or `.docx`.

### Export values (`lib/doc-export/values.ts`)

```ts
export const EXPORT_FORMATS = ["pdf", "docx"] as const;
export const EXPORT_TEMPLATES = ["standard", "classic"] as const;
export const PAGE_SIZES = ["letter", "a4"] as const;
export const SENT_FORMATS = ["pdf", "docx", "text", "other"] as const;
export const EXPORT_WARNING_CODES = ["link_text_only", "task_box_dropped", "wide_table", "html_dropped", "image_dropped", "missing_glyphs"] as const;
export const EXPORT_ERROR_CODES = ["too_large", "too_long", "render_timeout", "render_failed", "sent_file_missing"] as const; // statuses 413, 413, 504, 500 (with a request id), 410; the code name sent_file_missing is this plan's, the spec fixes only the 410
export const MAX_EXPORT_BODY_BYTES = 262_144;
export const MAX_PDF_PAGES = 30;
export const RENDER_TIMEOUT_MS = 20_000;
export const MAX_EXPORT_FILES_PER_VERSION = 8;
export const MAX_TABLE_COLUMNS = 6;
export const MAX_LIST_DEPTH = 3;
export const TABLE_WIDTH_MIN = 0.12;
export const TABLE_WIDTH_MAX = 0.6;
export type ExportWarning = { code: (typeof EXPORT_WARNING_CODES)[number]; examples?: string[] }; // up to 5 examples, for missing_glyphs
```

`DocModel` (this plan's shape for "a small `DocModel` that both renderers read"):

```ts
export type Inline =
  | { type: "text"; text: string; bold?: boolean; italic?: boolean; strike?: boolean; code?: boolean }
  | { type: "link"; href: string; text: string }
  | { type: "break" };
export type ListItem = { inlines: Inline[]; children: Block[] };
export type Block =
  | { type: "heading"; level: "title" | "section" | "entry"; inlines: Inline[] }
  | { type: "boldPara"; inlines: Inline[] }
  | { type: "para"; inlines: Inline[] }
  | { type: "list"; ordered: boolean; items: ListItem[] }
  | { type: "table"; header: Inline[][]; rows: Inline[][][]; widths: number[] }
  | { type: "labelLines"; lines: { label: string; value: Inline[] }[] }
  | { type: "quote"; blocks: Block[] }
  | { type: "code"; text: string }
  | { type: "rule" }
  | { type: "pageBreak" };
export type DocModel = { title: string; blocks: Block[] };
export function markdownToModel(bodyMd: string, options: { fallbackTitle: string }): { model: DocModel; warnings: ExportWarning[] };
```

Warning texts (`WARNING_TEXT`, `lib/doc-export/dialog-model.ts`; wording is this plan's):
- `link_text_only`: "Some links show text that differs from the address. A tracking system that reads text loses the address."
- `task_box_dropped`: "Task boxes in lists were dropped."
- `wide_table`: "A table with 7 or more columns is written as lines of Header: value."
- `html_dropped`: "Raw HTML was left out."
- `image_dropped`: "Images were left out."
- `missing_glyphs`: "Some characters are missing from the template's fonts and show as nothing in the PDF: {examples}."

### The export route

`GET /api/exports/[artifactId]?format=pdf|docx&template=standard|classic&page=letter|a4&disposition=attachment|inline[&pinned=1]`, `maxDuration` 60, session only. Missing parameters take the defaults from `profile.documents`. `pinned=1` serves the row with `sent_at` set for that artifact and format regardless of template, page size and `renderer_version`. Statuses: 200; 400 `invalid_query` for a bad parameter; 401 with no session; 404 for another user's id or a non-sendable kind; 410 `sent_file_missing` for a pinned row whose object is gone; 413 `too_large` and `too_long`; 504 `render_timeout`; 500 `render_failed`. Headers: content type, `Content-Disposition` (ASCII `filename` and RFC 5987 `filename*`), `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`. `computeRenderKey` joins `[contentHash, format, template, pageSize, String(rendererVersion), nameUsed]` with `"\n"`, sha256, first 32 hex.

### Core functions of this cycle

```ts
// lib/doc-export
export const RENDERER_VERSION = 1;
export function exportFileName(parts: { name: string; company: string; label: string }, ext: "pdf" | "docx"): { ascii: string; unicode: string }; // Jordan-Lee-Northwind-CV.pdf
export function resolvePageSize(settings: DocumentSettings, timeZone: string): PageSize; // America/ prefix or Asia/Manila gives letter, else a4, unless settings.pageSize is set
export async function ensureExport(s, deps, artifact, params, ctx): Promise<Result<{ row; bytes; fileName; cacheHit; warnings; pages }, ExportErrorCode>>;
export async function renderPdf(model, options): Promise<Result<{ bytes: Uint8Array; pages: number }, "too_long" | "render_failed">>;
export async function renderDocx(model, options): Promise<Result<{ bytes: Uint8Array }, "render_failed">>;
// lib/apply
export const APPLIED_MAX_DAYS_BACK = 365;
export async function markApplied(s, deps, opportunityId, input: MarkAppliedInput, now?): Promise<Result<..., MarkAppliedError>>;
export async function recordSentOnly(s, deps, opportunityId, input, now?): Promise<Result<..., MarkAppliedError>>;
export function parseFormAnswers(bodyMd: string): ParsedAnswers; export const MAX_ANSWER_FIELDS = 100;
// lib/artifacts
export async function markArtifactSent(s, opportunityId, key, version, now?, sent?: { format: SentFormat; exportId: string | null }): Promise<Result<{ title: string }, ...>>;
export async function saveEditInScope(tx, scopeRef, key, bodyMd, baseVersion, now): Promise<Result<EditOutcome, "artifact_not_found" | "invalid">>;
export async function carryEditsForward(s, scopeRef, key, input: CarryInput, now?): Promise<Result<CarryOutcome, CarryError>>;
export async function saveCompanyArtifactEdit(s, companyId, key, bodyMd, baseVersion, now?): Promise<Result<EditOutcome, ...>>;
export async function pasteCompanyArtifact(s, companyId, input: CompanyPasteInput, now?): Promise<Result<..., ...>>;
export function editedBaseOf(versions, version): number | null;
// lib/compare
export const LONG_LINE_CHARS = 160; export const WORD_MARK_MAX_CHARS = 20_000; export const WORD_MARK_TIMEOUT_MS = 500;
export const UNIT_DIFF_MAX_EDIT_LENGTH = 5_000; export const COLLAPSE_MIN_RUN = 6; export const COLLAPSE_CONTEXT = 3; export const SPLIT_MIN_WIDTH_PX = 1_024;
export function splitUnits(body: string): string[]; export function unitsForDiff(body: string): string[]; export function bodyFromUnits(units: string[]): string;
export function diffUnits(a: string[], b: string[], limits?): DiffResult;
export function threeWayMerge(base: string[], mine: string[], theirs: string[]): ThreeWayResult;
export function twoWayMerge(mine: string[], theirs: string[]): { chunks: TwoWayChunk[]; choices: number };
export type Resolution = "mine" | "theirs" | { write: string };
export function applyChoices(chunks, choices): Result<{ body: string }, "unresolved">;
export function whatsNew(input: { previousBody: string; nextBody: string; personNames: string[] }): WhatsNewLine[];
export const WHATS_NEW_MAX_LINES = 12; export const WHATS_NEW_MAX_NUMBERS = 4; export const WHATS_NEW_OPEN_DAYS = 7;
// lib/research
export const STALE_DAYS = 30; export const REFRESH_NOTE_MAX = 500;
export const REFRESH_KINDS = ["research", "fit_brief", "people_notes"] as const;
export const REFRESH_TASKS = { fit_brief: "fit_brief" } as const;
export async function requestRefresh(s, scopeRef, key, input: { note: string | null; viewedVersion?: number }, now?): Promise<Result<{ version: number; movedFrom: number | null }, ...>>;
export async function cancelRefresh(s, scopeRef, key): Promise<Result<null, ...>>;
export async function listRefreshRequests(s, scope: { opportunityId: string; companyId: string }): Promise<RefreshRequest[]>;
export type RefreshTarget = { slug: string; scope: "opportunity" | "company" } | { companyId: string };
// lib/companies
export async function resolveCompany(s, name): Promise<{ company: CompanyRow; via: "name" | "alias" } | null>;
export async function updateCompany(s, companyId, input): Promise<UpdateCompanyResult>; // codes: name_taken (with other: { id, name }), not_found, invalid, link_locked
export async function mergeCompanies(s, ids: { sourceId: string; targetId: string }, options?): Promise<Result<{ counts: MergeCounts; renamed; targetId }, "not_found" | "same_company">>;
export async function previewMerge(s, ids, port?): Promise<Result<{ sentence: string; counts: MergeCounts; targetName: string; sourceName: string }, ...>>;
export interface FeedMergePort { inspect(...): Promise<FeedFacts>; apply(...): Promise<{ movedItems: number }>; }
export const NO_FEED: FeedMergePort;
export const MERGE_HANDLED_REFERENCES: readonly string[]; export const FEED_HANDLED_REFERENCES: readonly ["feed_source.company_id", "feed_item.company_id"];
```

### Bridge, CLI and the context document

- `GET /api/bridge/opportunities/:slug/artifacts` returns JSON `WireDocumentIndex = { documents: WireDocumentEntry[]; requestId: string }`, with `WireDocumentEntry = { key; kind; scope: "opportunity" | "company"; version: number; updated_at: string; refresh_request: { requested_at: string; note: string } | null }`, job documents first then company documents, each by key.
- `GET /api/bridge/opportunities/:slug/artifacts/:key?scope=opportunity|company&version=<n>` returns `text/markdown; charset=utf-8` with frontmatter lines `jobsmith: document/v1`, `key`, `kind`, `scope`, `title` (JSON-quoted), `stage` (JSON-quoted, omitted when none), `version`, `updated` (ISO), then a blank line and the body. Without `scope` the job's own document wins and the company's is the fallback. 404 `not_found` for an unknown key or version, 400 `invalid_query` for a bad `scope` or `version`. Bearer auth, the shared rate-limit row, the bridge error shape and `Cache-Control: no-store`.
- Context document section after `## Artifacts`, always present:

```
## Refresh requests

Write a complete new version of each document under the same key and push it.

| Key | Kind | Scope | Version | Requested | Note |
|---|---|---|---|---|---|
| recon | research | company | 2 | 2026-11-02T09:00:00.000Z | Check funding and headcount |
```

  with `No refresh requests.` instead of the instruction and table when none are open. Scope words are `job` and `company`, as in the Artifacts table. The frontmatter stays `jobsmith: context/v1`.
- CLI: `jobsmith pull <slug> [--out <dir>] [--doc <key>]... [--requested]` always writes `<slug>-context.md` and also `<slug>-<key>.md` per document. Suffix map gains `research-refresh: { kind: "research" }`. `cli/src/frontmatter.ts` reads a double-quoted value with `JSON.parse` first.
- Refresh prompt (`lib/research/refresh-prompt.ts`, wording fixed here):

```
You are updating a research document for a job search. Below are the job's context, a note for this refresh, and the document as it stands today.

Write a complete new version of the document. Keep the sections that still apply, add sections for anything new you can find, and remove what is no longer true. Return the whole document as markdown, not a list of changes and not only the parts that changed. Put nothing before or after the document.

State a fact only when you can source it, and give a link for each new claim. Where something is unknown, write "not stated".

Note for this refresh:
{note, or "No note."}

Document: {title} (key {key}, version {version})

<context>
{contextMd}
</context>

<document>
{bodyMd}
</document>
```

### UI copy fixed by the spec or by this plan

Spec: "Pick two different versions"; "Too many changes to mark word by word"; "Show 14 unchanged lines"; "Change 3 of 12"; "Versions 3 and 4"; "Version 3 (edited 2 Oct) and version 4 (pushed 5 Oct) · 48 words added, 21 removed, 3 sections changed"; "4 of your edits apply cleanly. 1 needs a choice."; "Keep my edit", "Take the new text", "Write it myself"; "Save to version 4"; "Version 4 was pushed after you edited version 3. Carry your edits into version 4."; "Version 4 changed since you opened this"; "Refresh requested 2 Nov"; "Request a refresh"; "Copy refresh prompt"; "Paste a new version"; "Write a new version"; "41 days old"; "Research is 41 days old"; "What changed in version 5"; "New section: Funding."; "Now mentions Dana Reyes."; "Headcount: 1,200 to 1,450."; "3 new sources: example.com, example.org, example.net."; "Product: 48 words added, 12 removed."; "How did you send it?" with PDF, DOCX, Text, Other; "Mark applied"; "Remind me to follow up on <date>"; "Record which CV and cover letter you sent"; "Sent CV version 3 as PDF"; "Sent as PDF"; "Download the file you sent"; "412 / 500 characters"; "Over by 37"; "No answer yet"; "Copy all"; "Copied"; "Also known as Northwind Labs"; "Merge into Northwind"; "Merge into another company"; "Closed · Rejected"; "Taken down 12 Oct"; "From Northwind Labs:"; "Moves 3 jobs, 4 people (1 matches someone already at Northwind and is combined) and 2 research documents (1 renamed research-2). Northwind Labs becomes an alias."

Plan wording (for owner review, see "Needs" item 9): the six warning texts above; "Removed section: <heading>."; "No longer mentions <name>."; "Nothing new that the app can list."; the carry summary forms in Task 26; "Sent CV version 3 as DOCX." / "as text." / "another way."; "Merged Northwind Labs into Northwind: 3 jobs, 4 people and 2 documents moved. research became research-2."; "Moves nothing." and " Its 12 tracked roles move too."

### Spec section 11 assumptions and the one place each lives

| # | Assumption | Constant or module |
|---|---|---|
| 1 | a refresh is a complete new version under the same key | `lib/research/refresh.ts` (a new version of the key clears the request by being a new row) |
| 2 | fonts, two templates, 10.5 or 11 pt, 54 pt margins, page numbers from page 2 | `lib/doc-export/theme.ts` |
| 3 | Letter for `America/` and `Asia/Manila`, else A4 | `resolvePageSize` in `lib/doc-export/settings.ts` |
| 4 | `Name-Company-Label.ext`, no version number | `lib/doc-export/filename.ts` |
| 5 | DOCX names fonts without embedding, links print text with a warning | `lib/doc-export/docx.ts`, `model.ts` |
| 6 | 256 KiB, 30 pages, 20 seconds, 6 table columns, 3 list levels | `lib/doc-export/values.ts` |
| 7 | stale after 30 days, panel open 7 days, 12 lines, 4 numbers, note 500 | `lib/research/stale.ts`, `lib/compare/whats-new.ts`, `lib/artifacts/refresh-columns.ts` |
| 8 | units are lines, long paragraph lines split at sentences | `LONG_LINE_CHARS` in `lib/compare/limits.ts` |
| 9 | compare limits and 1024 px split | `lib/compare/limits.ts` |
| 10 | people combine on name with no LinkedIn or email conflict, `<key>-2`, rename keeps an alias | `lib/companies/merge-plan.ts` |
| 11 | both merged companies tracked: the target's source stays | `lib/companies/merge-plan.ts`, `merge-feed.ts` |
| 12 | follow-up on by default at `followUpDays` and 09:00, dates up to 365 days back | `lib/apply/mark-applied.ts` (`APPLIED_MAX_DAYS_BACK`) |
| 13 | form answer fields are levels 2 to 4, limits from the label, 100 fields | `lib/apply/form-answers.ts` |
| 14 | in-app refresh covers fit briefs only | `REFRESH_TASKS` |
| 15 | milestone order | this README |

### Log lines

`[export] <request id> artifact=<id> format template page pages bytes ms hit|miss warnings=<codes>`; `[merge] <request id> source=<id> target=<id> jobs people combined documents feed`; `[carry] <request id> from=<id> onto=<id> mode chunks conflicts status`. No text, names, titles or file names.

## Task list

| Task | Milestone | Title | Files touched (short) | Depends on tasks |
|---|---|---|---|---|
| 1 | 20 | Migration A: `source_body_md`, `profile.documents`, base capture | `lib/db/schema`, `lib/artifacts/edit.ts` | none |
| 2 | 20 | Migration B: `document_export`, `export` asset kind, scoped, isolation | `lib/db/schema`, `lib/db/scoped` | 1 |
| 3 | 20 | Document settings in `profile.documents` | `lib/doc-export/values.ts`, `settings.ts` | 1 |
| 4 | 20 | Markdown to document model | `lib/doc-export/model.ts` | 3 |
| 5 | 20 | Fonts, theme, glyph check, file names, version | `lib/doc-export/*`, `fonts/` | 3 |
| 6 | 20 | PDF renderer | `lib/doc-export/pdf.tsx` | 4, 5 |
| 7 | 20 | DOCX renderer | `lib/doc-export/docx.ts` | 4, 5 |
| 8 | 20 | Export store and download route | `lib/doc-export/store.ts`, `handler.ts`, `app/api/exports` | 2, 3, 4, 5, 6, 7 |
| 9 | 20 | Export dialog and Documents tab action | `components/doc-export`, `tab-documents.tsx` | 3, 8 |
| 10 | 20 | Settings Documents section and data export | `components/settings`, `lib/export` | 2, 3 |
| 11 | 20 | "How did you send it?" in Mark as sent | `lib/artifacts/sent.ts`, dialog, event text | 8 |
| 12 | 20 | `markApplied` | `lib/apply/mark-applied.ts` | 8, 11 |
| 13 | 20 | Mark applied dialog, record-only notice, Home link | `components/apply`, header, Home | 3, 9, 11, 12 |
| 14 | 20 | Application form answers | `lib/apply/form-answers.ts`, `components/apply` | 11 (view); parser none |
| 15 | 20 | End to end, docs and ship | `tests/e2e`, `playwright.config.ts`, docs | 2 to 14 |
| 16 | 21 | Units and compare limits | `lib/compare/limits.ts`, `units.ts` | none |
| 17 | 21 | Unit diff, word marking, limit fallbacks | `lib/compare/diff.ts` | 16 |
| 18 | 21 | Version pairing and the edited-base rule | `lib/artifacts/plan.ts`, `lib/compare/pair.ts` | none |
| 19 | 21 | Comparison loader and header model | `lib/compare/load.ts`, `header.ts` | 16, 17, 18 |
| 20 | 21 | Split and inline views with marks | `components/compare`, `lib/compare/collapse.ts` | 17 |
| 21 | 21 | Change navigator, pickers, phone bar | `components/compare`, `lib/compare/navigator.ts` | 18, 20 |
| 22 | 21 | Compare routes for job and company documents | `app/(app)/jobs/[slug]/compare`, `companies/[id]/compare` | 18, 19, 20, 21 |
| 23 | 21 | Ways in: version list, tab links, notice | `version-list.tsx`, tabs | 18, 22 |
| 24 | 21 | End to end, docs and ship | `tests/e2e`, docs | 16 to 23 |
| 25 | 22 | Three-way merge | `lib/compare/merge.ts` | 16 |
| 26 | 22 | Two-way fallback, choices, carry model | `lib/compare/two-way.ts`, `choices.ts`, `carry-model.ts` | 17, 19, 25 |
| 27 | 22 | `saveEditInScope` extracted | `lib/artifacts/edit.ts` | 1 |
| 28 | 22 | `carryEditsForward` | `lib/artifacts/carry.ts` | 26, 27 |
| 29 | 22 | Carry panel and its actions | `components/compare`, actions | 22, 26, 28 |
| 30 | 22 | The offer on the compare page and Documents tab | compare pages, `tab-documents.tsx` | 22, 26, 29 |
| 31 | 22 | End to end, docs and ship | `tests/e2e`, docs | 25 to 30 |
| 32 | 23 | Migration: refresh columns and module boundary | `lib/db/schema`, `lib/artifacts/refresh-columns.ts` | none |
| 33 | 23 | The refresh module | `lib/research/refresh.ts`, `stale.ts` | 32 |
| 34 | 23 | `## Refresh requests` in the context document | `lib/bridge/context.ts`, `handlers.ts` | 33 |
| 35 | 23 | Bridge read routes for documents | `lib/bridge/documents.ts`, `app/api/bridge` | 33 |
| 36 | 23 | `pull --doc`, `--requested`, suffix, frontmatter fix | `cli/src/*` | 35 |
| 37 | 23 | What's new, rules 1 to 3 | `lib/compare/whats-new.ts` | 16, 17 |
| 38 | 23 | What's new, rules 4 to 6 and assembly | `lib/compare/whats-new.ts` | 37 |
| 39 | 23 | Staleness, panel, compare list | `lib/research/panel.ts`, components | 22, 33, 38 |
| 40 | 23 | Home shows research age | `lib/attention/*`, scoped artifact | 33 |
| 41 | 23 | Refresh dialog: request, cancel, copy prompt | `components/research`, actions | 33, 34, 39 |
| 42 | 23 | In-app fit brief refresh (Hosted) | `lib/research/refresh.ts`, dialog | 33, 41 |
| 43 | 23 | End to end, docs and ship | `tests/e2e`, docs | 32 to 41 |
| 44 | 24 | Migration: `company_alias`, `company_merged`, export | `lib/db`, `lib/pipeline`, `lib/export` | none |
| 45 | 24 | Alias-aware company matching | `lib/companies/match.ts`, `create.ts` | 44 |
| 46 | 24 | `lib/companies/edit.ts`: edit, rename, aliases | `lib/companies/edit.ts`, job page action | 44, 45 |
| 47 | 24 | The merge planner | `lib/companies/merge-plan.ts` | 44 |
| 48 | 24 | `mergeCompanies` and the foreign key test | `lib/companies/merge.ts`, scoped helpers | 46, 47 |
| 49 | 24 | The Feed side of a merge (Feed) | `lib/companies/merge-feed.ts` | 48 |
| 50 | 24 | Company-only document edit and paste | `lib/artifacts/company.ts`, `upsert.ts` | 1, 27 |
| 51 | 24 | People at company level | `lib/people/index.ts` | 48 |
| 52 | 24 | Company page loader and open roles | `lib/companies/page.ts`, `open-roles.ts` | 22, 44, 46 |
| 53 | 24 | The company page, route, list links | `app/(app)/companies/[id]`, `components/company` | 50, 51, 52 |
| 54 | 24 | Edit, rename and merge dialogs and actions | `components/company`, `actions.ts` | 46, 48, 50, 51, 53 |
| 55 | 24 | Open roles, history, tracking line (Feed) | `components/company/open-roles.tsx` | 52, 53, 54 |
| 56 | 24 | End to end, docs and ship | `tests/e2e`, docs | 44 to 55 |

## Parallel work

Tasks inside one milestone can run at the same time when they touch different files. Two tasks that both add a dependency to `package.json` and `pnpm-lock.yaml` conflict there: install all of a milestone's dependencies in its first task of that group, or serialize the installs.

- **Milestone 20:** after Task 1, Tasks 2 and 3 run in parallel (schema and scoped files against `lib/doc-export/values.ts` and `settings.ts`). After Task 3, Tasks 4 and 5 run in parallel (`model.ts` against theme, glyphs, file names and fonts). After both, Tasks 6 and 7 run in parallel (`pdf.tsx` against `docx.ts`; serialize their dependency installs). Task 10 runs in parallel with Tasks 8 and 9 (Settings component and collector against the route and the dialog). The parser half of Task 14 runs in parallel with Tasks 6 to 8. Tasks 11, 12 and 13 are serial, they share `sent.ts`, `mark-applied.ts` and `tab-documents.tsx`.
- **Milestone 21:** Tasks 16 and 18 run in parallel. Task 20 runs in parallel with Task 19 once Task 17 is done. Tasks 21 to 23 are serial on `components/compare` and the tabs.
- **Milestone 22:** Tasks 25 and 27 run in parallel (`merge.ts` against `edit.ts`). Task 26 follows 25; Task 28 needs 26 and 27; Tasks 29 and 30 are serial (shared compare page files).
- **Milestone 23:** Tasks 32 then 33; then Tasks 34, 35 and 40 run in parallel (context, bridge routes, Home), with Task 36 after 35. Tasks 37 and 38 (`whats-new.ts`) run in parallel with the whole refresh chain 32 to 36. Tasks 39 and 41 touch `tab-research.tsx` and run one after the other; Task 42 follows 41.
- **Milestone 24:** after Task 44, Tasks 45 and 47 run in parallel. Task 46 follows 45. Task 48 needs 46 and 47. Task 50 runs in parallel with Tasks 46 to 48 (different files). Task 51 follows Task 48, because it uses the scoped additions made there. Task 52 can start after 46 and runs in parallel with 48 to 51 (different files). Tasks 53 to 55 are serial.
