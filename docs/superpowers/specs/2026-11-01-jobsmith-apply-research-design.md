# Jobsmith Apply and Research: design spec

- Date: 2026-11-01
- Status: draft for owner review
- Scope: cycle 5 of 8 (Apply and Research). Builds on the Core spec, `docs/superpowers/specs/2026-09-18-jobsmith-core-design.md`, the Prep spec, `docs/superpowers/specs/2026-11-01-jobsmith-prep-design.md`, the Hosted beta spec, `docs/superpowers/specs/2026-11-01-jobsmith-hosted-design.md`, and the Feed spec, `docs/superpowers/specs/2026-11-01-jobsmith-feed-design.md`, whose rules stay in force unless a section here says otherwise.
- Visual plan: an "Apply and Research" page in the "JS - Design" Figma file, drafted before each milestone plan.

## TL;DR

- Cycle 5 covers the two moments around an application: sending the right CV as a real file, and bringing research up to date once an interview is booked. It adds PDF and DOCX export, version compare with a merge helper, research refresh with a computed "what's new", company pages, and a "Mark applied" step.
- Export renders one artifact version through one intermediate document model into PDF (`@react-pdf/renderer`) and DOCX (`docx`), on the server, in pure JavaScript, with two templates set in open-licensed fonts (Source Sans 3 and Source Serif 4). The file that was sent is kept byte for byte as the record of what went out.
- Compare shows any two versions of one document word by word: side by side on desktop, inline on a phone. Its headline case is "pushed (or generated) after you edited version N": a three-way merge carries the hand edits onto the new version, applies every edit that does not overlap a generator change, and asks about each one that does. From Milestone 20 on, the first hand edit of a version keeps the generator's text as the merge base.
- Refresh is a request. The user asks for a new version of a research document, the bridge context lists the request, and a Claude Code skill or any chat window (through a copied prompt) writes the full new version under the same key; a fit brief can also be rewritten in the app by the Hosted cycle's `fit_brief` task. The app shows the diff plus a "what's new" list computed in code with no model.
- `/companies/[id]` gathers a company's record, shared research, people, every job there over time, and the Feed's open roles and role history. A rename that collides with another company offers a merge, which moves jobs, people, documents and feed items in one transaction, keeps the old name as an alias for intake, and writes an event on every moved job's timeline.
- "Mark applied" moves the job through `lib/pipeline`, marks the chosen CV and cover letter versions sent with the format used, offers their exports and sets the follow-up. Application form answers render as copyable fields with character counts.
- Five milestones, 20 to 24. The data model grows by two tables, three artifact columns, one profile column, one asset kind and one event kind.

## 1. Context and goals

Core (cycle 1) is live. Every CV, cover letter and message is a versioned markdown artifact with a sent lock (Core 5.3). A push never buries a hand edit under an older generated text (rule 3), and the newer version does not carry the edit either: the version list only says "Pushed after you edited version N" (`versionNotice`, `lib/artifacts/plan.ts`). The Companies page (`app/(app)/companies/page.tsx`) lists companies with their jobs and shared research, and links each research document through one of the company's jobs because no company page exists (`lib/companies/overview.ts`). Company fields are edited from the job page (`updateCompanyDetails`, `lib/pipeline/details.ts`). Prep (cycle 2) adds private files behind `lib/storage` and the `asset` table. Hosted (cycle 3) writes fit briefs, CVs, cover letters and question banks in the app as `generated` versions on the same keys the skills push, with a matching "generated after you edited version N" notice, keeps research and people notes with the skills because they need web browsing (Hosted 5.6), and puts every stored object under a per-user prefix (Hosted 5.10). Feed (cycle 4) tracks companies through `lib/feed/sources.ts`, which owns `company.tracked`, adds `company.ats_region` and `matchAtsBoardUrl`, and leaves open-role history per company to this cycle (Feed section 12).

Prerequisite: the roadmap ships cycles in order, so Prep (Milestones 6 to 10), Hosted (11 to 15) and Feed (16 to 19) are merged before Milestone 20 starts. Prep's `asset` table and `lib/storage`, Hosted's generation tasks and Feed's tracking rows exist by then, and this spec only extends them.

The owner's process (Core TL;DR) is find, qualify and research, apply, then research deeper and prepare once an interview is booked. Three gaps sit in it today: the file that goes to the employer is made outside the app, so nothing records which version went out or in which format; a hand-edited CV loses its edits the moment a skill pushes or Hosted regenerates a fresh version, unless the user retypes them; and research written to qualify a job is weeks old by the hiring manager call, while refreshing it means writing a separate document and reading both.

### Goals

1. Download any CV, cover letter or message version as a PDF or DOCX that reads well to a person and parses cleanly for an applicant tracking system, with no service or binary beyond Node.
2. See what changed between any two versions, and carry hand edits onto a newly pushed or generated version without retyping them.
3. Refresh a research document before an interview and see what is new in under a minute.
4. One page per company with everything known about it, and a safe way to fold a duplicate company into the real one.
5. Record what was sent, and in what format, in the same step that moves the job to Applied.

### Non-goals for Apply and Research

Writing research or people notes inside the app (Hosted keeps them with the skills), user-designed templates or custom styles, images or photos in exports, tagged accessible PDF, exporting research or prep documents, sending applications or email from the app, form autofill or a browser extension, a diff of rendered output, undoing a company merge, changes to scanning or tracking (Feed owns them), the skill request queue (cycle 7).

### Success criteria

The five done-when tests in section 9, verified in Chrome and Safari on desktop and at a phone viewport, plus the two export fixtures opened once in Word, Pages, Google Docs, LibreOffice, Acrobat Reader and macOS Preview, with the result recorded in the Milestone 20 pull request.

## 2. Principles

Core's seven, Prep's four, Hosted's five and Feed's five carry over. Hosted numbers its five 12 to 16 and Feed's five are 17 to 21, so this cycle continues at 22 and adds four.

22. **An export is a view of one version.** A PDF or DOCX is rendered from one artifact version and is never a source; the markdown stays the contract. A file marked as sent is kept unchanged, because it is the record of what the employer received.
23. **A merge never decides for the user.** Only changes that do not overlap apply on their own. Every overlap is shown with both texts and waits for a choice, and nothing is written before the user saves.
24. **Summaries of change come from code.** "What's new" is derived from the diff, so it costs nothing, works with no AI key, and can only report changes that exist.
25. **Company identity changes are explicit.** Jobsmith never merges two companies on its own. A merge shows what it will move, runs in one transaction, and leaves an alias and an event on every moved job.

## 3. Architecture

### Stack additions

| Concern | Choice | Self-host note |
|---|---|---|
| PDF | `@react-pdf/renderer` renders the document model to a buffer in a Node route handler; layout runs in Yoga compiled to WebAssembly; fonts are read from files in `lib/doc-export/fonts/` and subset when embedded. The owner's prototype ran it in a Next.js server function (section 10). | no native module, no browser, no fetch at render time |
| DOCX | `docx` builds the same model into a .docx with named paragraph styles, list numbering, real tables and hyperlinks | none |
| Markdown to model | `unified`, `remark-parse` and `remark-gfm` produce mdast; `lib/doc-export/model.ts` maps it to a small `DocModel` that both renderers read. The in-app renderer stays react-markdown (`components/markdown.tsx`). | none |
| Document fonts | Source Sans 3 and Source Serif 4 (Adobe, SIL Open Font License 1.1), static TTF in regular, italic, bold and bold italic; Courier from the PDF standard fonts for code blocks. Geist stays the app's font. | committed with `OFL.txt`; `outputFileTracingIncludes` adds them to the export function |
| Glyph check | `fontkit` checks each character against the template's fonts before rendering | none |
| Diff | `diff` (jsdiff): `diffArrays` over units and `diffWordsWithSpace` inside changed pairs, with its `maxEditLength` and `timeout` options | none |
| Merge | `node-diff3`: `diff3Merge` over the same units | none |
| Export cache | Prep's `lib/storage` and `asset` as shipped (one new kind, `export`) under Hosted's per-user prefix, plus `document_export` rows | follows `STORAGE_PROVIDER`; nothing new to set |
| In-app refresh | Hosted's `lib/generate` with its existing `fit_brief` task, for fit briefs only (section 5.5) | unmetered on the operator's key; absent with AI off |

No new environment variables. The Milestone 20 plan confirms in `node_modules/next/dist/docs/` how a route handler bundles the font files and whether `@react-pdf/renderer` belongs in `serverExternalPackages`.

### Module map additions

```
app/(app)/jobs/[slug]/compare/     compare two versions of a job's document, carry edits forward
app/(app)/companies/[id]/          company page; compare/ under it for company documents
app/api/exports/[artifactId]/      PDF and DOCX download, session only
app/api/bridge/opportunities/[slug]/artifacts/[key]/   GET one document; a GET on artifacts/ lists them
components/compare/                split and inline views, change navigator, carry-forward panel
components/doc-export/             export dialog, "sent as" field
components/apply/                  Mark applied dialog, record-sent notice, form answers view
components/company/                header, facts, jobs, people, edit and merge dialogs, open roles
lib/doc-export/                    model, pdf, docx, theme, fonts/, filename, glyphs, store, version, settings
lib/compare/                       units, diff, merge (three-way and two-way), whats-new, limits
lib/apply/                         mark-applied, form-answers
lib/research/                      refresh (request, cancel, stale, REFRESH_TASKS), refresh-prompt
lib/companies/                     edit (rename, aliases), merge, match, open-roles, page loader
lib/artifacts/                     + base capture, carry.ts, company-only edit and paste
lib/people/                        + add, edit and remove at company level
cli/                               jobsmith pull --doc, --requested; research-refresh suffix
```

The document export lives in `lib/doc-export/` because `lib/export/` already holds the Settings data export (`lib/export/collect.ts`). Core's rules hold: every `lib/*` function takes a database handle and a user id, `requireUser()` runs in every page, action and handler, and `app/` and `components/` never import the database client. Write owners: `lib/artifacts` keeps every artifact write, including carry forward and the refresh columns; `lib/pipeline` keeps stage moves; `lib/doc-export/store.ts` is the only writer of `document_export` and its assets; `lib/companies` becomes the writer of company rows, aliases and merges (`updateCompanyDetails` moves there from `lib/pipeline/details.ts`), while `tracked` and the link fields set by tracking stay with Feed's `lib/feed/sources.ts`, and feed item writes stay with `lib/feed/items.ts`. `lib/apply/mark-applied.ts` writes nothing itself and calls those owners inside one transaction.

## 4. Data model

Two new owned tables, following Core's conventions: uuid primary key, `user_id` text with an index, `created_at` and `updated_at` as `timestamptz`, reached only through the scoped helper, one file per table under `lib/db/scoped/`, a row in the isolation test.

**document_export** (owned): `artifact_id` (foreign key on (`user_id`, `artifact_id`) to `artifact (user_id, id)`, cascade; one artifact row is one version), `opportunity_id` (foreign key on (`user_id`, `opportunity_id`), cascade; sendable kinds are always job-scoped, `lib/artifacts/sent.ts`), `format` (`pdf`, `docx`), `template` (`standard`, `classic`), `page_size` (`letter`, `a4`), `content_hash` (the version's hash at render time), `renderer_version` (an integer constant in `lib/doc-export/version.ts`, raised whenever a template or the mapping changes), `render_key` (first 32 hex characters of sha256 over content hash, format, template, page size, renderer version and the name used in the file name), `file_name`, `asset_id` (foreign key on (`user_id`, `asset_id`) to `asset`), `bytes`, `pages` (nullable; a DOCX has no fixed page count), `warnings` jsonb (a list of codes from section 5.1), `sent_at` (nullable; set when Mark as sent names this file). Unique on (`artifact_id`, `render_key`). Index on (`user_id`, `opportunity_id`). Deleting a row deletes its asset and object, in `lib/doc-export/store.ts`.

**company_alias** (owned): `company_id` (foreign key on (`user_id`, `company_id`), cascade), `name` (as it was written), `name_key` (`companyNameKey`, `lib/companies/name-key.ts`), `source` (`rename`, `merge`), `merged_company_id` (uuid, nullable, no foreign key: the id of a company that no longer exists, kept for the audit). Unique on (`user_id`, `name_key`). A name key belongs to one company or to one alias of the same user, never both; rename, merge and intake check both tables inside their transaction.

Changes to existing tables:

- `artifact.source_body_md` (text, nullable): the merge base, the body before a version's hand edits. Two paths write it: `saveArtifactEdit` on a version's first in-app edit (section 5.4), and the Debrief cycle's `fork` intent in `planUpsert` (Debrief 5.8), which starts a new manual version from a sent or unsent latest version and records its base at write time. A push, a paste or a generator never sets it.
- `artifact.refresh_requested_at` (timestamptz, nullable) and `artifact.refresh_note` (text, nullable, at most 500 characters by check): an open refresh request on that version (section 5.5).
- `asset` (Prep's table, used with Prep's `lib/storage` as shipped): the kind check gains `export`, and nothing else changes; this cycle adds no storage code of its own. Objects are keyed `u/<user_hash>/exports/<random 32 hex>.pdf` or `.docx`, Hosted's prefix rule.
- `event.kind` gains `company_merged`; the check constraint is rewritten keeping every kind earlier cycles added (`prep_drilled`, `artifact_generated`, `posting_gone`).
- `profile.documents` (new jsonb, default `{}`), read tolerantly like `preferences`: `version: 1`, `pageSize` (`letter`, `a4`, or null for "from my time zone"), `templates { cv, cover_letter, message_draft }` (`standard` or `classic`; defaults `standard`, `classic`, `standard`), `fileName` (the name used in file names; null uses the account name, an empty string leaves the name out).
- `company`: no new columns. `name` (with its `name_key`) becomes editable by the user, and so do the careers link and `ats_kind`, `ats_org` and Feed's `ats_region` while the company is untracked (section 5.7).
- `document_sent` event meta gains `format` (`pdf`, `docx`, `text`, `other`) and `exportId` (nullable). Older events have neither and read as "Sent".

The Settings data export (`lib/export/collect.ts`) adds `documentExports` (metadata, no bytes) and `companyAliases`, and its version goes up by one.

## 5. Behavior

### 5.1 Export

Any version of a `cv`, `cover_letter` or `message_draft` can be exported, sent or not. "Export" sits in the document view's actions on the Documents tab and inside the Mark applied and Mark as sent dialogs. The dialog has Format (PDF, DOCX), Template (default from `profile.documents`), Page size (default below), the file name it will save as, this document's warnings, "Download" and, for PDF, "Preview", which opens the file inline in a new tab.

Route: `GET /api/exports/[artifactId]?format=pdf|docx&template=standard|classic&page=letter|a4&disposition=attachment|inline`, `maxDuration` 60. It checks the session, loads the artifact row through the scoped helper (another user's id or a non-sendable kind is 404), fills missing parameters from the defaults, and computes the render key. A row with that key whose object exists is streamed. Otherwise the route builds the model, renders within 20 seconds, stores the object and its row, deletes this version's unsent exports with a different `content_hash` (an in-place edit made them stale), and streams the file. Headers: the content type, `Content-Disposition` with an ASCII `filename` and an RFC 5987 `filename*`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`. When storage fails, or the account is over Hosted's storage quota (Hosted 5.8, where export keeps working), the rendered bytes stream without being cached, so a download never depends on the cache. One version has at most 8 cached files (two formats, two templates, two page sizes), so the route needs no rate limit, and exports cost no credits.

Markdown to the document model (`lib/doc-export/model.ts`):

| Markdown | In the PDF and DOCX |
|---|---|
| leading `---` block of `key: value` lines | removed (a pasted file can still carry frontmatter) |
| `#`, `##`, `###` | title; section heading with a rule under it; entry heading (a role, a school) |
| `####` to `######` | bold paragraph |
| paragraph, hard line break, bold, italic, strikethrough, inline code | the same, with inline code in the body font |
| link with `http:`, `https:` or `mailto:` | clickable, link text shown; warning `link_text_only` when the text differs from the address, since a tracking system that reads text loses the address |
| any other link | its text only, the rule `components/markdown.tsx` applies |
| bullet and numbered lists, nested to 3 levels | real lists; deeper levels join level 3; a task box is dropped with warning `task_box_dropped` |
| table of up to 6 columns | real table, bold header row, column widths from each column's longest cell, held between 12% and 60% |
| table of 7 or more columns | one block per row of "Header: value" lines, warning `wide_table` |
| blockquote; fenced or indented code; `---` inside the body | indented 12 pt with a 1.5 pt rule; Courier 9 pt block, wrapped; thin rule |
| `<!-- page-break -->` alone on a line | page break (invisible in the app, whose renderer drops raw HTML) |
| other raw HTML; images | dropped, warnings `html_dropped` and `image_dropped` |
| footnotes | `[1]` in the text and a numbered list at the end |
| characters the template's fonts lack | warning `missing_glyphs` with up to 5 examples; the PDF shows nothing for them, the DOCX keeps them for Word to substitute |

Templates (`lib/doc-export/theme.ts`). Colors come from the token file's light layer: text `#09090b` (`--ink-950`), secondary `#52525b` (`--ink-600`), rules `#e4e4e7` (`--ink-200`); a unit test reads `app/globals.css` and fails when they drift. **Standard**: Source Sans 3 throughout, body 10.5 pt at 1.35 line height, 4 pt after paragraphs, title 20 pt bold, section headings 11 pt bold with 0.6 pt letter spacing and a 0.75 pt rule, entry headings 10.5 pt bold, list indent 12 pt with 2 pt between items. **Classic**: Source Serif 4 body at 11 pt and 1.45 line height, 8 pt after paragraphs, headings in Source Sans 3. Both: one column, margins 54 pt (0.75 inch) on every side for Letter and A4, a page number at 8 pt in the bottom right from page 2 on, a heading kept with the block after it (`minPresenceAhead` in the PDF, `keepNext` in the DOCX), and a list item under 4 lines kept on one page. Metadata: the title is the document title, the author is the file-name name, creator and producer are "Jobsmith", and nothing else (no address, no ids).

DOCX: the same model with styles named Title, Heading 1 (for `##`), Heading 2 (for `###`), Normal and two numbering definitions; page size in twips (Letter 12240 by 15840, A4 11906 by 16838), margins 1080. Fonts are named and not embedded, so Word substitutes a close face where Source Sans 3 is missing. The PDF is the exact copy; the DOCX serves portals that ask for Word and people who want to edit.

Page size: `profile.documents.pageSize`, or when it is null, Letter for a profile time zone starting `America/` or equal to `Asia/Manila`, and A4 for every other.

File name: `{Name}-{Company}-{Label}.{ext}`, where Label is `CV`, `Cover-Letter`, or a message's title. Each part loses path characters (`/ \ : * ? " < > |` and control characters), turns whitespace runs into one hyphen and stops at 40 characters; the whole name stops at 120 before the extension. `filename*` keeps Unicode; the ASCII `filename` folds through NFKD as `keyFromTitle` does (`lib/artifacts/normalize.ts`) and keeps case. An empty part is left out. Example: `Jordan-Lee-Northwind-CV.pdf`. The version number stays out of the name, because the recipient sees one file.

Limits: a body over 256 KiB is refused as `too_large` before rendering; a PDF over 30 pages is refused as `too_long` and nothing is stored; 20 seconds of rendering is `render_timeout`.

Mark as sent (`components/job/mark-sent-dialog.tsx`) gains "How did you send it?": PDF, DOCX, Text (pasted into a form or an email), Other. Defaults: PDF for CVs and cover letters, Text for messages. For PDF or DOCX the most recent export of this version in that format is pinned (`sent_at`); when none exists, one is rendered with the defaults before the write transaction opens, so no lock waits on a render. `markArtifactSent` (`lib/artifacts/sent.ts`) takes the format and export id into the `document_sent` meta, and the timeline reads "Sent CV version 3 as PDF". A sent version's view shows "Sent as PDF" with "Download the file you sent", which serves the pinned bytes even after `renderer_version` moves on. When no file could be stored (storage failure or quota), the record keeps the format with `exportId` null and the dialog says so.

### 5.2 Applying

"Mark applied" appears in the job header while the job is active and its current stage kind is `saved`. Home's "Apply or drop" item (Core 5.8 rule 4) links to `/jobs/<slug>?apply=1`, which opens the dialog.

The dialog asks, in order: the applied date (default today in the profile time zone, from 365 days back to today); the CV and the cover letter, one picker each over the job's documents of that kind and their versions, defaulting to the latest version of the most recently updated key, with "None"; any `message_draft` documents, one checkbox each, off by default; "sent as" per chosen document with the 5.1 defaults and a Download button using the profile's template and page size, since the intended order is download, upload to the portal, confirm; and "Remind me to follow up on <date>", on by default, dated the applied day plus `preferences.attention.followUpDays` (7) at 09:00 in the profile time zone. "Mark applied" confirms.

`markApplied(s, opportunityId, input)` renders any missing exports first, then runs one transaction (each owner's own `transaction` call becomes a savepoint inside it): `moveOpportunity` with kind `applied` and the applied date as `now`, so Saved's `completed_at`, Applied's `entered_at` and the `stage_moved` event all carry that date, as the import script does (Core 5.11); `markArtifactSent` per document, skipping versions already sent; pinning exports; `setNextAction` ("Follow up") when the reminder is on. Any failure rolls back every step and returns the first error, so a job is never half-applied.

Record only: a job past Saved that has a `cv` or `cover_letter` document and no sent version (moved by drag, the phone sheet or the import) shows "Record which CV and cover letter you sent" on its Documents tab. It opens the same dialog without the move, with the sent date taken from the Applied stage's `entered_at` (or now when it has none). The notice disappears once any version is sent, so no dismiss state is stored.

Application form answers: a `message_draft` whose key is `form-answers` or starts with `form-answers-` (the built-in suffix and its prefix rule, `cli/src/suffixes.ts`) opens as Fields, with a Fields and Document toggle. `parseFormAnswers` (`lib/apply/form-answers.ts`, pure) starts a field at each heading of the shallowest level from 2 to 4 that appears; a level-1 heading is the title, deeper headings stay inside the answer, and text before the first field shows as notes without a copy button. A label ending in `(500 characters)`, `(max 500 chars)` or `(150 words)` sets a limit: the field shows "412 / 500 characters" and, over the limit, an "Over by 37" chip, the words carrying the meaning and the tone added. Copy produces plain text (emphasis markers removed, a link as "text (address)" when the two differ, list items with "- " or "1. ", one blank line between paragraphs); "Copy all" copies label and answer pairs; a live region announces "Copied". An empty answer shows "No answer yet", and at most 100 fields show, while the Document view always has the whole file. Mark as sent works here too, defaulting to Text. Out of scope: filling portals, a browser extension, storing portal logins, emailing an application, generating answers, editing fields one by one (the markdown is edited where it is written).

### 5.3 Compare

Routes: `/jobs/[slug]/compare?doc=<ref>&a=<n>&b=<n>&view=split|inline`, with `doc` in the tab format (`job:cv`, `company:recon`, `lib/artifacts/tabs.ts`), and `/companies/[id]/compare?doc=<key>&a=<n>&b=<n>&view=...`. Defaults: `b` is the latest version and `a` the one before, except that when `b` carries "pushed after you edited version N" or Hosted's "generated after you edited version N", `a` is N. Equal versions show "Pick two different versions". Ways in: "Compare" beside each entry in the version list, "Compare versions" on every document with two or more versions on the Research, Documents and Prep tabs and the company page, and the notice itself, which becomes a "See what changed" link.

Units (`lib/compare/units.ts`): the stored body splits into lines. A paragraph line longer than 160 characters (outside headings, list items, table rows and fences) splits again after each sentence end: `.`, `?` or `!` followed by whitespace and an uppercase letter, digit, quote or bracket. Every unit keeps its trailing separator, so joining the units gives back the text exactly; a property test checks this over every fixture. A CV bullet is one unit; a cover letter paragraph is one unit per sentence.

Diff (`lib/compare/diff.ts`): `diffArrays` over the two unit lists gives unchanged, removed and added runs; a removed run followed by an added run is a changed pair, and `diffWordsWithSpace` marks words inside it. The result is a row list plus a summary: words added, words removed, and sections changed, counted by the `##` heading above each change.

Limits: word marking runs on a pair only when each side is under 20,000 characters and finishes within jsdiff's 500 ms timeout; otherwise the pair shows as whole removed and added text with "Too many changes to mark word by word". The unit diff runs with `maxEditLength` 5,000; past that, the page says the versions differ too much to compare and shows both in full, one after the other. Each side is already capped at 1 MiB (Core D9).

Views:

- **Split**, from 1024 px wide: two columns in one scroll container with aligned rows, removed words struck through on the left on `status-action-soft`, added words underlined on the right on `status-approved-soft`. **Inline**, the only view below 1024 px and a choice above it: one column in reading order, removed text before added text, with the same marks.
- Unchanged runs longer than 6 units collapse to 3 units of context on each side and "Show 14 unchanged lines".
- A change navigator, "Change 3 of 12" with Previous and Next, also on `[` and `]`. On a phone it is a sticky bar above the bottom navigation (`pb-safe`), and the version pickers open in a sheet from "Versions 3 and 4".
- Markup is `<del>` and `<ins>` with visually hidden "removed" and "added" at the start of each run, since screen readers skip those elements by default. The diff is of the markdown source, shown as text with line breaks kept and rendered as text nodes only.

The header reads "Version 3 (edited 2 Oct) and version 4 (pushed 5 Oct) · 48 words added, 21 removed, 3 sections changed". For research kinds the "what's new" list (5.5) sits under it.

### 5.4 Carry edits forward

Base capture, from Milestone 20, lives in `saveArtifactEdit` (`lib/artifacts/edit.ts`). `planUpsert` (`lib/artifacts/plan.ts`) stays metadata-only, and `tx.artifact.listVersions` keeps excluding bodies. Before applying an edit, `saveArtifactEdit` loads the full latest version through `getVersion` under the lock it already holds; when that row's `source_body_md` is null, it writes the pre-edit body into it in the same transaction as the edit. So a version's first in-app edit sets the base and later edits leave it alone. The only other writer is Debrief's `fork` intent in `planUpsert` (Debrief 5.8), which records the base when it starts a new manual version; a push, a paste or a generator never sets it. When the save forks a new version (the latest was sent, or the editor's base is stale), the new row's `source_body_md` is that loaded pre-edit body. Cost if wrong: a version edited before this milestone has no base, and carry forward falls back to the two-way merge below, where the user picks every change.

The offer appears on the compare page when `a` has `edited_at`, `b` is newer, `b`'s origin is `pushed`, `pasted` or `generated`, and `b` is the latest version. The Documents tab shows it above a latest version that carries either notice: "Version 4 was pushed after you edited version 3. Carry your edits into version 4."

With a base (three-way): base is `a.source_body_md`, mine is `a.body_md`, theirs is `b.body_md`, all split into units; `diff3Merge(mine, base, theirs)` with false conflicts excluded returns clean chunks and conflicts. The panel says "4 of your edits apply cleanly. 1 needs a choice." and shows each conflict with the original, your edit and the new text, and three choices: Keep my edit, Take the new text, Write it myself (a text area seeded with your edit). A preview of the merged document follows the choices.

Without a base (two-way): every changed pair between `a` and `b` is a choice, defaulting to Take the new text, and one line explains that the app cannot tell which side changed what.

Saving: `carryEditsForward(s, scopeRef, key, { fromVersion, ontoVersion, fromHash, ontoHash, choices })` in `lib/artifacts/carry.ts` recomputes the merge from the stored versions, returns `stale` when either hash moved or `b` is no longer the latest, returns `unresolved` while a conflict has no choice, and writes the merged body through `saveArtifactEdit` with `baseVersion` set to `b`, in the same transaction. That edits `b` in place (setting `b`'s own base by the rule above, since this is its first edit), or forks a new manual version when `b` was sent in the meantime. Nothing is written until "Save to version 4". The Documents tab then opens on the result with a toast naming the version. Because the merged `b` keeps its pushed text as its base, the next push or regenerate can carry the same edits forward again.

Decision: units are lines, with long paragraph lines split into sentences. Lines suit CV bullets; a cover letter paragraph is one markdown line, so lines alone would turn two edits in one paragraph into a conflict, and merging word by word would assemble sentences neither side wrote. Cost if wrong: more conflicts than needed (the 160-character threshold is one constant) or an awkward merged sentence, which the preview shows before saving.

### 5.5 Research refresh

Stale: a `research`, `fit_brief` or `people_notes` document whose latest version was created or edited more than 30 days ago shows "41 days old" in the Research tab's list and on its view. Home's interview item (Core 5.8 rule 1) adds "Research is 41 days old" under its stage line when the job counts as researched and its newest `research` or `people_notes` document is stale. "No research yet" keeps priority, and Prep's confidence line stays.

"Refresh" on a research-kind document's latest version (job or company scope) opens a dialog with an optional note of up to 500 characters and the ways to get the new version:

1. **From Claude Code.** "Request a refresh" sets `refresh_requested_at` and `refresh_note` on the latest version (`lib/research/refresh.ts`, writing through `lib/artifacts`). The document shows "Refresh requested 2 Nov" with Cancel. The context document (`lib/bridge/context.ts`) gains a `## Refresh requests` section after Artifacts, always present ("No refresh requests." when empty): a table of key, kind, scope, version, requested time and note, under one instruction, "Write a complete new version of each document under the same key and push it." The frontmatter stays `context/v1`; the section is additive, as Prep's are.
2. **From a chat window.** "Copy refresh prompt" copies a fixed prompt (`lib/research/refresh-prompt.ts`, wording fixed in the Milestone 23 plan) holding the note, the job's context document and the document's current markdown, and asking for the whole document back. The user pastes the answer with "Paste a new version" (origin `pasted`). The app sends nothing anywhere; the clipboard is the user's.
3. **In the app, fit briefs only.** Hosted writes fit briefs in the app and keeps research and people notes with the skills, because they need web browsing (Hosted 5.6). So "Write a new version" appears only on a `fit_brief` document with key `fit-brief`, the key Hosted's `fit_brief` task writes. It calls `startGeneration` (`lib/generate/start.ts`) with that task and shows Hosted's cost and balance line ("4 credits, 412 left"); the run, polling, retry and the `generated` version follow Hosted 5.5 unchanged. The note is not passed, since that task takes none. `REFRESH_TASKS` in `lib/research/refresh.ts` maps kinds to Hosted tasks, so a research task added after the beta (Hosted section 12) needs one entry. With AI off, the option is absent.

Any new version of the key fulfills the request: the new row has empty request columns, so the open request disappears with no extra write. An in-place edit keeps it open. Requesting again replaces the note and time. The two columns are this cycle's own storage for requests. Cycle 7 (Bridge part two 4 and 5.4) moves open refresh requests into its `work_request` table as kind `research_refresh`, repoints the "Refresh requested" line, `pull --requested`, the JSON index and the context document's `## Refresh requests` section at that table, and drops the two columns one milestone later. The section shape, the index fields and the CLI flag stay as defined here, so nothing downstream notices the move.

Getting the current text from the terminal: a GET on the push path, `/api/bridge/opportunities/:slug/artifacts`, returns a JSON index of the job's and company's latest documents with key, kind, scope, version, updated time and any open request; `GET /api/bridge/opportunities/:slug/artifacts/:key?scope=opportunity|company&version=<n>` returns one document as `text/markdown` with frontmatter `jobsmith: document/v1`, key, kind, scope, title, stage label, version and updated time. Without `scope`, the job's own document wins and the company's is the fallback. Both use the bridge's bearer auth, rate-limit row, error shape and `no-store`, with their wire types in `lib/bridge/wire.ts`. The CLI adds `jobsmith pull <slug> --doc <key>` (repeatable) and `--requested` (every document with an open request), each written as `<slug>-<key>.md`. A skill rewrites that file and pushes the folder as usual: push takes kind, scope, title and stage from the frontmatter and ignores the other fields (`cli/src/collect.ts`), and an untouched file reports `unchanged`. The built-in suffix map gains `research-refresh: { kind: "research" }`, so a separate refresh file lands on Research instead of Prep's Other.

What's new (`lib/compare/whats-new.ts`, pure, no model), from the unit diff between the previous and the new version, at most 12 lines in this order:

1. New sections: `##` and `###` headings whose normalized text is new. "New section: Funding."
2. Removed sections.
3. People: names of the company's and the job's `person` rows that the new version mentions and the old one did not, and the reverse, plus bold-led list items (`- **Name**`) under a heading containing people, team, leadership, panel or interviewers. "Now mentions Dana Reyes."
4. Numbers: inside a changed pair, number tokens (digits with `,` or `.`, an optional `%`, `k`, `M`, `B` or currency sign, and years 1900 to 2099), paired in order when both sides hold the same count and labelled by the text before a colon on that line, else by the section heading. "Headcount: 1,200 to 1,450." At most 4.
5. Sources: hosts of new `http` or `https` links. "3 new sources: example.com, example.org, example.net."
6. Changed sections with word counts, largest first, filling the remaining room. "Product: 48 words added, 12 removed."

The list shows on the compare page and in a "What changed in version 5" panel on the document view, open for 7 days after the version was created and collapsed after that.

### 5.6 Company page

Route `/companies/[id]`, with `requireUser()` and a scoped lookup; an unknown id or another user's is 404. The Companies list links each name here, and its research links point here with `?doc=<key>`, which retires the "pick a job to carry the link" rule in `lib/companies/overview.ts`. Sections, in order:

1. Header: name, domain as a link (`https://` plus the domain), careers link, an ATS chip ("Greenhouse · northwind"), aliases ("Also known as Northwind Labs"), Feed's tracking line (reader, last check, open and matching roles, health, Check now, Edit link, Stop tracking; Feed 5.1) or its Track action, and a menu with Edit company and Merge into another company.
2. Facts: size, industry and HQ as field rows (`components/super-ai/field-row.tsx`).
3. Notes: `notes_md` rendered with the sanitized renderer and edited in place with the Write and Preview text area the Documents editor uses.
4. Jobs: every opportunity at the company, active ones first by last activity, then closed ones newest first, each with role, stage label or "Closed · Rejected", added date, applied date (the Applied stage's `entered_at`) and last activity (the newest event). Each links to its job. This list is the permanent record of the roles the user pursued.
5. Research: the company-scoped documents with the Research tab's list and view, version picker, Compare, Refresh, edit and "Paste markdown". `lib/artifacts` gains company-only entry points for edit and paste that reuse `planUpsert` (and, for edits, `saveArtifactEdit`'s base capture), lock only the company row, and offer only the three company-wide kinds.
6. People: everyone at the company with title, LinkedIn and a chip per linked job showing the role. Add person (company only, no job), Edit, and Remove for a person linked to no job; a linked person is unlinked from the job's People tab first. Writes go through `lib/people`.
7. Open roles (`lib/companies/open-roles.ts`, reading Feed's tables through the scoped helper): the company's `feed_item` rows in `new` or `seen` with no `gone_at`, using Feed's item row with Add to board and Dismiss (`lib/feed/save.ts`, `lib/feed/items.ts`); then Role history, every retained item for the company newest first by `first_seen_at`, with role, first seen, "Taken down 12 Oct" from `gone_at`, and its state (Saved links to the job; Dismissed; Expired). One line says history covers Feed's 90-day retention. An untracked company with no items shows Track and one sentence on what tracking does.

At phone width the sections stack in the same order, jobs and roles become two-line rows, and the menu opens as a sheet.

### 5.7 Editing, renaming and merging companies

Edit company (`lib/companies/edit.ts`; the job page's Edit company calls the same function) covers name, domain, size, industry, HQ and notes, and on an untracked company the careers link and ATS kind, org and region, filled from a board link by Feed's `matchAtsBoardUrl` (`lib/intake/ats/match.ts`). On a tracked company those link fields are read-only here and change through the tracking line's Edit link, so the feed source stays consistent; `tracked` itself changes only through Feed's Track and Stop tracking (`lib/feed/sources.ts`).

Rename recomputes `name_key` in one transaction. When the key belongs to another company or to another company's alias, the save returns `name_taken` with that company, and the dialog offers "Merge into Northwind" or a different name. Otherwise the name and key change, the old name becomes an alias with source `rename` (skipped when its key equals the new one, as for a capitalization fix; an existing alias equal to the new key is removed), and every job at the company gets a fresh `dedupe_hash` (`lib/intake/dedupe.ts`), which includes the company name. Slugs never change, so links and CLI commands keep working. Aliases show on the page with Remove.

Matching: `createOpportunity` and Feed's aggregator matching by `name_key` (Feed 4) resolve a company by `name_key`, then by alias, through `lib/companies/match.ts`; intake then creates one when neither matches. A posting from "Northwind Labs" after the merge lands on Northwind.

Merge: `mergeCompanies(s, { sourceId, targetId })` in `lib/companies/merge.ts`. The dialog picks the company that stays (a combobox of the others) and shows a preview from the same planner the write uses: "Moves 3 jobs, 4 people (1 matches someone already at Northwind and is combined) and 2 research documents (1 renamed research-2). Northwind Labs becomes an alias." "Merge" runs one transaction that locks in the order every other writer uses (the source's opportunities by id, then both company rows by id), so a concurrent push waits its turn:

- Jobs: `company_id` moves to the target, `dedupe_hash` is recomputed, and each moved job gets one `company_merged` event with meta `{ fromCompanyId, fromName, toCompanyId, toName, counts, renamedKeys }`, shown on its timeline (wording in `lib/pipeline/event-text.ts`, fixed in the Milestone 24 plan).
- People: a source person whose name matches a target person's after case folding and whitespace collapse, and whose LinkedIn and email do not conflict (equal, or one empty), is combined into the target person: empty fields filled, notes appended after a blank line, job links repointed, and where both were linked to one job the target's link and role stay. Everyone else moves as is.
- Company documents: a key the target lacks moves with every version; a key the target already has moves as `<key>-2` (the first free number, with the base cut so the key stays within 100 characters), titles unchanged, renames listed in the event meta and the toast.
- Feed: `feed_item.company_id` moves to the target. When only the source company has a `feed_source`, it moves to the target, which becomes tracked. When both do, the target's source stays; the source company's `saved` and `dismissed` items move to it unless an item with the same external id is already there, and the source company's source is removed with its other items and scan runs. These writes go through `lib/feed/sources.ts` and `lib/feed/items.ts`.
- Fields: the target's non-empty values stay, empty ones take the source's, notes are appended under "From Northwind Labs:", ATS kind, org and region come from the target when set.
- Aliases: the source's name and its aliases become the target's, with source `merge` and `merged_company_id` set to the source id. The source row is deleted last.

An integration test reads every foreign key that references `company` from `information_schema` and fails when `merge.ts` does not handle one, so a table a later cycle adds is never orphaned or cascaded away by a merge. A merge has no undo; the aliases and events are its record.

Settings gains a Documents section: default page size (From my time zone, Letter, A4), default template for CVs, cover letters and messages, and the name used in file names (default the account name), stored in `profile.documents`.

## 6. Error handling

- Export: `too_large` (413), `too_long` (413), `render_timeout` (504) and `render_failed` (500 with a request id) show in the dialog with a next step ("Try DOCX", "Shorten the document"). A cached row whose object is gone is rendered again and replaced, except a sent file, which returns 410; the dialog then offers a fresh render and says the sent copy is missing from storage. Warnings never block a download; they show before it and are stored on the row.
- Compare: an unknown document or version is a 404 page linking to the document; the size limits show the notices in 5.3.
- Carry forward: `stale` says "Version 4 changed since you opened this" and reloads with a fresh merge; `unresolved` moves focus to the first open conflict; a `b` sent in the meantime saves as a new version and the toast says so.
- Mark applied: a closed job (`closed` from `lib/pipeline`) or a document deleted in the meantime rolls back every step and names the cause; a version already sent is reported as already recorded.
- Refresh: a request on an older version applies to the latest and says so; an in-app fit brief run fails, refunds and retries exactly as Hosted 6 describes; the bridge document route returns 404 `not_found` for an unknown key and 400 `invalid_query` for a bad scope or version.
- Companies: `name_taken` offers the merge; a merge whose source or target vanished returns `not_found` and changes nothing.
- Logs: one `[export]` line per request with artifact id, format, template, page size, pages, bytes, milliseconds, cache hit or miss and warning codes; one `[merge]` line with company ids and counts; one `[carry]` line with artifact ids and chunk and conflict counts. Logs never carry document text, names or file names.

## 7. Security and privacy

- Both new tables are owned and reached through the scoped helper; the isolation test gains them and the export route. The export route accepts a session only, never a bearer token (Core 5.4), and another user's artifact id is 404.
- Exports are private: random object keys under the user's prefix in private storage, `private, no-store` responses, no public URL ever. The prototype's public Blob upload is the one part not ported.
- The export path makes no outbound request: images are dropped before rendering, fonts are read from disk, and only `http`, `https` and `mailto` links become link annotations.
- File metadata holds the document title and the file-name name only.
- Compare and the carry-forward panel render text nodes only; nothing from a document becomes HTML.
- The refresh prompt is built in the page from data already on it and copied by the user. The bridge document routes return only the token owner's documents, and person emails stay out of every bridge document, as in `lib/bridge/context.ts`. The in-app fit brief sends only what Hosted 5.6 lists.
- A merge is irreversible, so it sits behind a preview and a confirm and runs in one transaction.
- Exports carry the user's name and application history. The data export lists them as metadata, and Hosted's account delete removes them with everything else, since it deletes every object under the user's prefix and verifies every table with a `user_id` column (Hosted 5.10).

## 8. Testing

Test-driven for everything under `lib/`, as in Core.

- **Unit:** the markdown-to-model mapping as a table of cases covering every row of the 5.1 table; file names (Unicode, ASCII fallback, path characters, length, empty name); page size from time zone; the render key; the glyph check with Cyrillic, CJK and emoji samples; theme colors against `app/globals.css`; units (the join property over every fixture, fences, the sentence threshold); diff pairing and both limit fallbacks; the three-way merge (clean, conflict, false conflict, both sides deleting one line, adjacent edits, an edit beside a generator insert); the two-way fallback; each of the six "what's new" rules on fictional research fixtures; the form answers parser (levels, limits, plain text, the 100-field cap); the merge planner (person rule, key renames, field fill, the three feed source cases); company match order (name, alias, create); `REFRESH_TASKS`.
- **Integration (PGlite with the real migrations):** the export route's auth, scoping, cache hit, pruning after an edit, a pinned file served after a `renderer_version` bump, and streaming through a failed storage write and over quota; base capture in `saveArtifactEdit` (first edit only, forks set the base, pushes and pastes never set it, `listVersions` still returns no bodies); carry forward's `stale` and sent paths, after both a push and a Hosted regenerate; `markApplied` rolling back when one document fails, with the applied date on the stage and the event; the refresh request lifecycle (set, listed in the context document and the JSON index, cleared by a push, kept by an edit); the bridge document routes; rename recomputing dedupe hashes and writing an alias; merge moving jobs, people, documents and feed rows with an event per job, plus the foreign key test; intake and Feed matching an alias; isolation for both new tables.
- **Files:** PDF text extracted with `unpdf` in reading order, the page count, link annotations only for allowed schemes, embedded fonts subset; DOCX unzipped with `jszip` and checked for styles, numbering, tables, hyperlinks and page size; both at Letter and A4 from a fictional CV and cover letter fixture. A page-count snapshot per fixture catches template drift.
- **End to end (Playwright, Chromium and WebKit, desktop and phone):** export a CV as PDF and DOCX through the download event; Mark applied from a Saved job with sent-as PDF, then the timeline line; push, edit a bullet, push a change to another bullet, carry edits forward with no question; the conflict path; compare at phone width with the navigator; form answers copy (Chromium reads the clipboard, WebKit checks the announcement); a refresh requested in the app shows in the context document fetched through the bridge; a fit brief rewritten in the app with the fake driver shows what's new; company edit, rename to a duplicate, merge, and the moved job's timeline. These run in an `apply-*` project chain after the earlier cycles' chains, one engine at a time, because they change the shared account's profile.
- **Accessibility:** axe on both compare views, the export, Mark applied and merge dialogs, and the company page, in light and dark; keyboard-only compare navigation and conflict choices; the hidden removed and added words read out.
- **Manual, once per `renderer_version`:** the two fixtures opened in Word, Pages, Google Docs, LibreOffice, Acrobat Reader and macOS Preview, with the result recorded in the pull request.

## 9. Milestones

Numbering continues after Feed's last milestone, 19. One implementation plan per milestone, written when the previous one is done, each preceded by its Figma drafts. Prerequisite: Prep, Hosted and Feed are merged before Milestone 20 starts (section 1), so every milestone here builds on Prep's `asset` table and `lib/storage`, Hosted's generation tasks and Feed's tracking rows as shipped.

| # | Name | Scope | Done when |
|---|---|---|---|
| 20 | Export and apply | on Prep's shipped `asset` table and `lib/storage`, with no new storage code: migration for `document_export`, the `export` asset kind, `profile.documents` and `artifact.source_body_md` with its capture rule; `lib/doc-export` with the model, both renderers, both templates and the fonts; the export route and dialog; the Settings Documents section; "sent as" in Mark as sent; Mark applied with the record-only notice; the form answers view | A fictional CV with headings, bullets, a table and links downloads as PDF and DOCX at Letter and A4 from a Saved job's Mark applied dialog, the job lands in Applied with "Sent CV version 1 as PDF" on its timeline, and after the CV gets a new version the sent file still downloads byte for byte the same |
| 21 | Compare | `lib/compare` units and diff with their limits; compare routes for job and company documents; split, inline and phone views; the change navigator; links from the version list, both notices and every tab | Two versions of a fictional cover letter show word-level changes side by side on desktop and inline on a phone, the keyboard reaches every change, and axe passes in light and dark |
| 22 | Carry edits forward | the three-way merge, conflict choices, the two-way fallback, `lib/artifacts/carry.ts`, the offer on the Documents tab | After push, edit, push of a fictional CV, carrying the edits produces a version with both changes and no question, and when both sides changed one bullet, one conflict appears and "Keep my edit" saves it |
| 23 | Research refresh | the refresh columns, request and cancel, the context section, the two bridge read routes, `pull --doc` and `--requested`, the `research-refresh` suffix, the copied prompt, the in-app fit brief through Hosted's task, staleness on the Research tab and Home, "what's new" | A refresh requested in the app appears in `jobsmith pull`, a pushed full version clears it, and the Research tab lists a new section, a changed number and a newly named person above the diff |
| 24 | Company pages | `/companies/[id]` with every section; company-only document edit and paste; Edit company with rename and aliases; open roles and role history from Feed; merge with its preview, feed rows and events; alias matching in intake and Feed; links from the Companies list | Renaming a fictional company to a duplicate's name offers a merge, after which one page shows both companies' jobs, people, research and tracked roles, each moved job's timeline records it, and a new posting under the old name lands on the merged company |

Each milestone ends with a preview link, a pass in Chrome and Safari and the test suites green.

## 10. Port sources and licensing

| Source | What this cycle takes | Where |
|---|---|---|
| Design Career Ops Web `lib/pdf/render-resume.ts`, `lib/pdf/templates/resume.tsx` | react-pdf with `renderToBuffer` inside a Next.js server function; a single-column layout meant for tracking systems; bold, letter-spaced section titles; entries kept whole across pages (`wrap={false}`) | `lib/doc-export/pdf.tsx`. Changed: markdown arrives through the document model in place of a structured resume object, open fonts are embedded in place of Helvetica, margins are 54 pt, A4 exists, and files go to private storage where the prototype uploaded them to a public Blob URL |
| Design Career Ops Web `components/job-detail/tab-resume.tsx` | the Download PDF action beside the document | `components/doc-export/export-dialog.tsx` |

The prototype is the owner's and unlicensed, so its code is relicensed under AGPL-3.0. Nothing comes from the MIT-licensed upstream career-ops project.

New dependencies, all pure JavaScript or WebAssembly and compatible with AGPL-3.0: `@react-pdf/renderer` (MIT), `docx` (MIT), `diff` (BSD-3-Clause), `node-diff3` (MIT), `unified` and `remark-parse` (MIT; `remark-gfm` is already a dependency), `fontkit` (MIT), and for tests `jszip` (dual MIT or GPL-3.0, used under MIT); `unpdf` (MIT) is already present from Hosted. Fonts: Source Sans 3 and Source Serif 4 (SIL Open Font License 1.1), committed with the license text under `lib/doc-export/fonts/`. Versions are pinned exactly, as Core pins its dependencies.

Design system: Core's order of preference holds. The company page uses the registry's `detail-view-shell`, `detail-tabs`, `field-row`, `section-header`, `table-view` and `empty-state`, and Feed's tracking line and item row as they are; dialogs, pickers and toggles use the installed `base-nova` `dialog`, `select`, `combobox`, `toggle-group`, `sheet` and `radio-group`. The compare rows, the change navigator, the conflict card and the form answer field are new code, each recorded in `docs/design-system.md` under "New application code" with its reason.

## 11. Assumed until the owner says otherwise

1. A refresh is a complete new version under the same key, which is what makes the diff meaningful. Separate `*-research-refresh.md` files keep working as their own research documents.
2. Document fonts are Source Sans 3 and Source Serif 4, in two templates: Standard (default for CVs and messages) and Classic (default for cover letters). Body text is 10.5 pt or 11 pt, margins are 54 pt on Letter and A4, and page numbers start on page 2.
3. Page size defaults to Letter for `America/` time zones and `Asia/Manila`, and A4 elsewhere.
4. File names follow `Name-Company-Label.ext`, with no version number.
5. The DOCX names its fonts without embedding them, and a link prints its text without its address, with a warning.
6. Exports cover CVs, cover letters and messages only, capped at 256 KiB of markdown, 30 pages and 20 seconds of rendering; tables keep up to 6 columns and lists nest to 3 levels.
7. Research goes stale after 30 days; the "what's new" panel stays open for 7 days, with at most 12 lines and 4 numbers; refresh notes are at most 500 characters.
8. Merge units are lines, with paragraph lines over 160 characters split into sentences.
9. Compare limits: word marking under 20,000 characters per side and 500 ms, the unit diff up to 5,000 edits, split view from 1024 px, unchanged runs over 6 units collapsed to 3 lines of context.
10. A company merge combines two people with the same normalized name when their LinkedIn and email do not conflict; a colliding company document key moves as `<key>-2`; a rename keeps the old name as an alias.
11. When both merged companies are tracked, the target's feed source stays and the other one's saved and dismissed roles move to it.
12. Mark applied turns the follow-up reminder on by default, `followUpDays` after the applied date at 09:00, and accepts applied dates up to 365 days back.
13. Form answer fields are headings of levels 2 to 4, limits are read from the label, and at most 100 fields show.
14. In-app refresh covers fit briefs only, through Hosted's `fit_brief` task on the `fit-brief` key; research and people notes refresh through the bridge or a chat window.
15. Milestone order puts export and apply first, since a real file to send is the piece used most often, and compare before carry forward and refresh, which reuse it.

## 12. After Apply and Research

The cycle table in Core section 12 stands. This cycle moves these out:

| Item | Where it goes |
|---|---|
| In-app refresh of research and people notes | after Hosted's post-beta decision on web search (Hosted section 12); one `REFRESH_TASKS` entry then |
| Skill requests beyond refresh (rewrite a CV, build a bank) and a queue with status | cycle 7's `work_request` table, which takes open refresh requests as kind `research_refresh` and drops the two `artifact` refresh columns one milestone later |
| A company with more than one board or careers source | a later Feed revision; a source is unique per company today |
| Exporting call cards, research or a whole prep packet to PDF | after 1.0, since the Widen spec declines it |
| Applications per week, and the response rate split by whether a CV was recorded as sent (CV versions share no identity across jobs, so no split by version) | cycle 6 funnel view (Debrief 5.10), reading `document_sent` events |
| Tagged accessible PDF | when react-pdf supports tagging |
| User templates, logos and photos | not planned |
| Undoing a company merge | not planned; aliases and events record it |
| Form autofill and a browser extension | not planned |
