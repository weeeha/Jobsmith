# Milestone 23: Research refresh

> Done when: "A refresh requested in the app appears in `jobsmith pull`, a pushed full version clears it, and the Research tab lists a new section, a changed number and a newly named person above the diff" (spec section 9).

**Branch:** `feat/m23-research-refresh`, cut from `main`.

**Before starting:**

```bash
test -f lib/compare/diff.ts && test -f components/compare/compare-page.tsx   # Milestone 21: the compare page the "what's new" list sits on
grep -n "saveEditInScope" lib/artifacts/edit.ts                              # Milestone 22 Task 27 (the refresh columns survive an in-place edit through it)
test -f lib/generate/start.ts                                                # Hosted milestone 13: needed by Task 42 only
```

Tasks 32 to 41 and 43 (without the in-app part) need nothing from Prep, Hosted or Feed. Task 42 (the in-app fit brief) is blocked on Hosted milestones 13 and 14; the spec says that with AI off the option is absent, so leaving Task 42 out leaves a working milestone. If Milestone 22 has not merged, Task 32's survival test uses `saveArtifactEdit`, which exists today.

**Bridge part two.** The Bridge part two spec (`2026-11-01-jobsmith-bridge-two-design.md`, milestones 31 and 32) moves open refresh requests into `work_request` as kind `research_refresh` and drops the two columns one milestone later. So the two `artifact` columns are read and written in exactly one module: `lib/research/refresh.ts` reads them (through `ArtifactMeta`) and `lib/artifacts/refresh-columns.ts` writes them. The context document, the JSON index, the CLI, Home and every component get requests only from `listRefreshRequests` and `refreshRequestOf` in `lib/research/refresh.ts`. Task 32 adds a unit test that fails when any other file mentions either column, so Bridge part two repoints one module and the section shape, the index fields and the CLI flag stay as written here.

---

### Task 32: Migration: the refresh columns, and the module boundary

**Files:**
- Modify: `lib/db/schema/artifact.ts` (add `refreshRequestedAt: timestamp("refresh_requested_at", { withTimezone: true })`, `refreshNote: text("refresh_note")`, check `artifact_refresh_note_check`)
- Create: `lib/db/migrations/<n>_refresh_columns.sql` (generated: `pnpm db:generate --name refresh_columns`), `lib/artifacts/refresh-columns.ts`
- Test: `tests/integration/refresh-columns.test.ts`, `tests/unit/refresh-columns-boundary.test.ts`, `tests/integration/migrations.test.ts`

**Interfaces:**
- Consumes: `tx.artifact.update(id, values)`, `ArtifactMeta` (derived from the table, so it gains both fields without a change to `lib/db/scoped/artifact.ts`).
- Produces:

```ts
export const REFRESH_NOTE_MAX = 500;
export async function setRefreshRequest(tx: Scoped, artifactId: string, at: Date, note: string | null): Promise<void>; // the only code that sets the two columns
export async function clearRefreshRequest(tx: Scoped, artifactId: string): Promise<void>;
```

- [ ] **Step 1: Write the failing tests**

```ts
// migrations.test.ts
it("refresh_requested_at and refresh_note are nullable; a 501 character note violates artifact_refresh_note_check and a 500 character note passes", ...);
// refresh-columns.test.ts
it("a pushed new version of the key has both columns null, so an open request on the old version disappears with no extra write", ...);
it("a paste of a new version clears it the same way", ...);
it("an in-place edit (saveArtifactEdit) keeps the request open on that row", ...);
it("an unchanged push keeps it open", ...);
it("listVersions and listLatestForOpportunity return the two fields (they are metadata), and still no bodyMd", ...);
// refresh-columns-boundary.test.ts
it("only the schema, the migrations, lib/artifacts/refresh-columns.ts and lib/research/refresh.ts mention refreshRequestedAt, refreshNote, refresh_requested_at or refresh_note", ...); // walks lib, app, components, cli and tests; the test file itself and the schema test helper are allowlisted
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/refresh-columns.test.ts tests/integration/migrations.test.ts`
Expected: FAIL, the columns do not exist.

- [ ] **Step 3: Implement the schema change and the writer**

Generate the migration and check it holds two `ADD COLUMN` lines and one `ADD CONSTRAINT ... CHECK (refresh_note is null or char_length(refresh_note) <= 500)`. `setRefreshRequest` calls `tx.artifact.update(artifactId, { refreshRequestedAt: at, refreshNote: note })`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/refresh-columns-boundary.test.ts tests/integration && pnpm typecheck`
Expected: PASS (the boundary test allowlists `lib/research/refresh.ts` by path, so it passes before that file exists)

- [ ] **Step 5: Commit**

```bash
git add lib/db lib/artifacts tests
git commit -m "feat(artifacts): refresh request columns behind one writer"
```

**Acceptance:**
- Spec 4: both columns, `refresh_note` at most 500 characters by check.
- Spec 5.5 "Any new version of the key fulfills the request ... An in-place edit keeps it open".

---

### Task 33: The refresh module

**Files:**
- Create: `lib/research/refresh.ts`, `lib/research/stale.ts`
- Test: `tests/unit/research-stale.test.ts`, `tests/unit/research-refresh-tasks.test.ts`, `tests/integration/research-refresh.test.ts`

**Interfaces:**
- Consumes: `setRefreshRequest`, `clearRefreshRequest` (Task 32), `tx.opportunity.lockById`, `tx.company.lockById`, `tx.artifact.listVersions`, `listLatestForOpportunity`, `listLatestForCompany`, `kindInfo`.
- Produces:

```ts
// stale.ts
export const STALE_DAYS = 30;
export function ageDays(meta: { createdAt: Date; editedAt: Date | null }, now: Date): number; // whole days since the later of createdAt and editedAt
export function isStale(meta: { createdAt: Date; editedAt: Date | null }, now: Date): boolean; // ageDays > 30
export function ageText(days: number): string; // "41 days old", "31 days old"
// refresh.ts
export const REFRESH_KINDS = ["research", "fit_brief", "people_notes"] as const;
export type RefreshKind = (typeof REFRESH_KINDS)[number];
export const REFRESH_TASKS = { fit_brief: "fit_brief" } as const; // kinds that Hosted can write in the app; one entry per task added after the beta
export type RefreshRequest = { key: string; kind: RefreshKind; scope: ArtifactScope; version: number; requestedAt: Date; note: string };
export function refreshRequestOf(meta: ArtifactMeta): { at: Date; note: string } | null;
export async function requestRefresh(s: Scoped, scopeRef: ArtifactScopeRef, key: string, input: { note: string | null; viewedVersion?: number }, now?: Date): Promise<Result<{ version: number; movedFrom: number | null }, "not_found" | "artifact_not_found" | "not_refreshable" | "invalid">>;
export async function cancelRefresh(s: Scoped, scopeRef: ArtifactScopeRef, key: string): Promise<Result<null, "not_found" | "artifact_not_found" | "nothing_to_cancel">>;
export async function listRefreshRequests(s: Scoped, scope: { opportunityId: string; companyId: string }): Promise<RefreshRequest[]>; // latest versions of the job's and the company's documents that carry a request; job first, then company, each by key
```

- [ ] **Step 1: Write the failing tests**

```ts
// stale
it("ageDays uses the later of createdAt and editedAt; 41 days gives 41; isStale is false at 30 and true at 31", ...);
it("ageText(41) is '41 days old'", ...);
// refresh
it("requestRefresh sets time and note on the latest version, list shows it with kind, scope, version", ...);
it("a request made from an older viewed version applies to the latest and returns movedFrom with the older number", ...);
it("requesting again replaces the note and time; a note of 501 characters returns invalid; a blank note stores null", ...);
it("a cv (not a research kind) returns not_refreshable; an unknown key returns artifact_not_found", ...);
it("cancelRefresh clears both columns; with none open it returns nothing_to_cancel", ...);
it("a company-scoped request locks only the company row; a job-scoped request locks the opportunity row", ...);
it("another user's scope returns not_found / artifact_not_found and writes nothing", ...);
it("REFRESH_TASKS maps fit_brief to 'fit_brief' and has no entry for research or people_notes", ...);
it("listRefreshRequests returns job requests before company requests and ignores older versions' requests", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/research-stale.test.ts tests/unit/research-refresh-tasks.test.ts tests/integration/research-refresh.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

One transaction per call. Lock order matches every other writer (opportunity, then company); a company scope locks the company only. The note is trimmed; blank stores null. `requestRefresh` finds the latest version through `listVersions` and writes with `setRefreshRequest`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration && pnpm typecheck`
Expected: PASS, including the boundary test from Task 32 with its allowlist now holding `lib/research/refresh.ts`.

- [ ] **Step 5: Commit**

```bash
git add lib/research tests
git commit -m "feat(research): request and cancel a refresh, staleness"
```

**Acceptance:**
- Spec 5.5: staleness over 30 days, request on the latest version, "a request on an older version applies to the latest and says so", requesting again replaces the note and time, `REFRESH_TASKS` with one entry.
- Spec 8: unit test for `REFRESH_TASKS`.

---

### Task 34: The `## Refresh requests` section of the context document

**Files:**
- Modify: `lib/bridge/context.ts` (`ContextInput` gains `refreshRequests: RefreshRequest[]`; a new section after Artifacts), `lib/bridge/handlers.ts` (`handleGetContext` passes `listRefreshRequests(...)`)
- Test: `tests/unit/bridge-context.test.ts`, `tests/integration/bridge-handlers.test.ts`

**Interfaces:**
- Consumes: `RefreshRequest`, `listRefreshRequests` (Task 33), `escapeCell` (already inside `context.ts`).
- Produces: the section text of the Contract's "Context document additions".

- [ ] **Step 1: Write the failing tests**

```ts
it("the section is always present after Artifacts: '## Refresh requests' then 'No refresh requests.' when empty", ...);
it("with requests: the instruction line 'Write a complete new version of each document under the same key and push it.' then a table '| Key | Kind | Scope | Version | Requested | Note |' with scope 'job' or 'company', the ISO time, and the note with pipes escaped and line breaks collapsed", ...);
it("the frontmatter is still 'jobsmith: context/v1' and every earlier section is unchanged byte for byte for an input with no requests (snapshot of the existing fixture plus the new empty section)", ...);
it("person emails still never appear", ...);
it("handleGetContext includes a request made through requestRefresh", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/bridge-context.test.ts tests/integration/bridge-handlers.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add the section after the Artifacts block in `buildContextDocument`. `ContextInput.refreshRequests` is required so a caller cannot forget it; update the existing unit tests' inputs with `refreshRequests: []`. `tests/fixtures/packet/nwl-context.md` is a pulled sample used by the CLI collect tests; leave it, since `context/v1` files are skipped on push.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/bridge tests
git commit -m "feat(bridge): refresh requests section in the context document"
```

**Acceptance:**
- Spec 5.5 item 1 (section after Artifacts, always present, "No refresh requests.", table columns, the one instruction, frontmatter stays `context/v1`, additive).

---

### Task 35: Bridge read routes for documents

**Files:**
- Create: `lib/bridge/documents.ts` (index and file builders), `app/api/bridge/opportunities/[slug]/artifacts/[key]/route.ts`
- Modify: `app/api/bridge/opportunities/[slug]/artifacts/route.ts` (add `GET`), `lib/bridge/handlers.ts` (`handleListDocuments`, `handleGetDocument`), `lib/bridge/wire.ts` (leaf: wire types), `lib/bridge/errors.ts` (`not_found` message for a key)
- Test: `tests/integration/bridge-documents.test.ts`, `tests/unit/bridge-documents.test.ts`, `tests/unit/bridge-errors.test.ts`

**Interfaces:**
- Consumes: `authenticate`, `isValidSlugShape`, `bridgeJson`, `bridgeError`, `getJobView`, `listRefreshRequests`, `refreshRequestOf`, the scoped reads `getVersion` and `listVersions` (no transaction, no lock), `KEY_PATTERN`.
- Produces:

```ts
// wire.ts (no imports; the CLI bundles this file)
export type WireDocumentEntry = { key: string; kind: string; scope: WireScope; version: number; updated_at: string; refresh_request: { requested_at: string; note: string } | null };
export type WireDocumentIndex = { documents: WireDocumentEntry[]; requestId: string };
// documents.ts
export function buildDocumentIndex(input: { jobDocuments: ArtifactMeta[]; companyDocuments: ArtifactMeta[] }): WireDocumentEntry[];
export function buildDocumentFile(input: { row: ArtifactRow; scope: WireScope; stageLabel: string | null }): string; // frontmatter then body
// handlers.ts
export async function handleListDocuments(deps: BridgeDeps, request: Request, slug: string): Promise<Response>;
export async function handleGetDocument(deps: BridgeDeps, request: Request, slug: string, key: string): Promise<Response>;
```

- [ ] **Step 1: Write the failing tests**

```ts
it("GET .../artifacts needs a bearer token: 401 with none, with a revoked token, and with only a session cookie", ...);
it("the index lists the job's documents then the company's, latest versions, with key, kind, scope, version, updated_at and refresh_request (null or { requested_at, note })", ...);
it("GET .../artifacts/<key> returns text/markdown with frontmatter 'jobsmith: document/v1', key, kind, scope, title, stage, version and updated, then the body", ...);
it("without scope the job's own document wins and the company's is the fallback; scope=company forces the company's", ...);
it("version=2 returns that version; an unknown version or an unknown key is 404 not_found", ...);
it("scope=team or version=0 or version=abc is 400 invalid_query", ...);
it("an invalid slug shape or another user's slug is 404; a key with a slash is 404", ...);
it("Cache-Control no-store, x-request-id header, the shared rate limit counts these calls (121st in a window is 429)", ...);
it("another user's document is never returned: user B's token on user A's slug is 404", ...);
it("the file's title with a double quote is written JSON-quoted so the CLI parser (Task 36) restores it", ...);
it("person emails never appear in either response", ...);
it("the 404 message for an unknown key names the key: 'No document with the key recon on this job.'", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/bridge-documents.test.ts tests/unit/bridge-documents.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Use the existing shape in `handleGetContext`: authenticate, slug check, `getJobView`, then read. `bridgeError("not_found", requestId, { slug, key })` and extend `BRIDGE_ERRORS.not_found.message` so `d.key` set gives the key wording and unset keeps today's slug wording. Frontmatter values are written with `JSON.stringify` for strings, as `context.ts` does; `stage:` is omitted when the document has no stage. `app/api/bridge/` is excluded from the proxy matcher already, so no `proxy.ts` change.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration && pnpm typecheck && pnpm build`
Expected: PASS, and the build lists the new route.

- [ ] **Step 5: Commit**

```bash
git add lib/bridge app/api tests
git commit -m "feat(bridge): read routes for a job's documents"
```

**Acceptance:**
- Spec 5.5 last paragraph first half (index fields, document frontmatter, scope default, bearer auth, rate limit row, error shape, `no-store`, wire types in `lib/bridge/wire.ts`), 6 (404 `not_found` and 400 `invalid_query`), 7 (token owner's documents only, no person emails).

---

### Task 36: `jobsmith pull --doc` and `--requested`, the suffix, the frontmatter fix

**Files:**
- Modify: `cli/src/args.ts` (`pull` gains `docs: string[]` and `requested: boolean`; `parseArgs` option `doc` with `multiple: true`, `requested` boolean; usage text), `cli/src/commands/pull.ts`, `cli/src/suffixes.ts` (`"research-refresh": { kind: "research" }`), `cli/src/frontmatter.ts` (a value starting and ending with `"` is read with `JSON.parse` first, falling back to stripping the quotes)
- Test: `tests/unit/cli-args.test.ts`, `tests/unit/cli-suffixes.test.ts`, `tests/unit/cli-frontmatter.test.ts`, `tests/integration/cli-bridge.test.ts`, `tests/integration/cli-bundle.test.ts`

**Interfaces:**
- Consumes: `bridgeRequest`, `extractServerMessage`, `WireDocumentIndex` (Task 35), `KEY_PATTERN`.
- Produces: `Command` variant `{ name: "pull"; slug: string; out: string | null; docs: string[]; requested: boolean }`; documents are written as `<slug>-<key>.md` under `--out`.

- [ ] **Step 1: Write the failing tests**

```ts
it("args: 'pull acme --doc recon --doc cv' gives docs ['recon','cv']; '--requested' sets requested; a doc that fails KEY_PATTERN is a usage error", ...);
it("without --doc and --requested pull behaves exactly as before (context only)", ...);
it("pull with --doc writes <slug>-context.md and <slug>-recon.md; the document file starts with 'jobsmith: document/v1'", ...);
it("--requested fetches the index, then every document with an open request at its listed scope and version, one file each", ...);
it("--requested with nothing open prints 'No refresh requests.' and writes only the context", ...);
it("an unknown --doc key prints the server message, still writes the others, and exits 1", ...);
it("two requested documents with the same key in both scopes: the job's is written, the company's is skipped with a note naming it", ...);
it("round trip: pull a document, change one line, push the folder: kind, scope, title and stage come from the frontmatter and the key from the file name; an untouched file reports unchanged", ...);
it("a title containing a double quote survives pull then push (JSON-quoted frontmatter is parsed back)", ...);
it("suffix map: 'research-refresh' resolves to kind research, 'research-refresh-2' resolves through the prefix rule", ...);
it("the built CLI bundle (pnpm cli:build) runs 'pull --help' text including --doc and --requested", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/cli-args.test.ts tests/unit/cli-suffixes.test.ts tests/unit/cli-frontmatter.test.ts tests/integration/cli-bridge.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

The context file is always written, as today, so a skill that works from a pull has the posting. Document requests go in a `for` loop over the keys, each through `bridgeRequest(io, creds, "GET", "/api/bridge/opportunities/<slug>/artifacts/<key>?...")` (`--doc` sends no scope or version; `--requested` sends both from the index). The `Accept` header stays `application/json` in `bridgeRequest`; the server ignores it for the markdown route. Rebuild with `pnpm cli:build` before the bundle test.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm cli:build && pnpm vitest run tests/unit tests/integration && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cli tests
git commit -m "feat(cli): pull --doc and --requested, research-refresh suffix"
```

**Acceptance:**
- Spec 5.5 last paragraph second half (`pull --doc <key>` repeatable, `--requested`, `<slug>-<key>.md`, push takes kind, scope, title and stage from the frontmatter, an untouched file reports `unchanged`, the `research-refresh` suffix).
- Done-when part one: a refresh requested through `requestRefresh` appears under `pull --requested`.

---

### Task 37: "What's new", rules 1 to 3 (sections and people)

**Files:**
- Create: `lib/compare/whats-new.ts` (types, normalizers, rules 1 to 3), `tests/fixtures/research/nw-research-v1.md`, `nw-research-v2.md` (fictional Northwind Traders research with Product, Funding, People and Sources sections; v2 adds Funding, drops one section, names Dana Reyes in a people list, changes headcount)
- Test: `tests/unit/whats-new-sections.test.ts`

**Interfaces:**
- Consumes: `unitsForDiff`, `diffUnits` (Milestone 21).
- Produces:

```ts
export type WhatsNewLine = { rule: "new_section" | "removed_section" | "people" | "number" | "sources" | "changed_section"; text: string };
export const WHATS_NEW_MAX_LINES = 12;
export const WHATS_NEW_MAX_NUMBERS = 4;
export const WHATS_NEW_OPEN_DAYS = 7;
export function normalizeHeading(text: string): string; // lowercase, markdown emphasis and punctuation removed, whitespace collapsed
export function sectionLines(previousBody: string, nextBody: string): WhatsNewLine[]; // rules 1 and 2
export function peopleLines(previousBody: string, nextBody: string, personNames: string[]): WhatsNewLine[]; // rule 3
```

- [ ] **Step 1: Write the failing tests**

```ts
it("new section: a ## or ### heading whose normalized text is new gives 'New section: Funding.'; heading text is shown without # and emphasis", ...);
it("a heading that only changes case or punctuation ('Product.' vs 'product') is not new", ...);
it("removed section gives 'Removed section: Pricing.'", ...);
it("headings inside fenced code are ignored; #### and deeper are ignored", ...);
it("people: a person row name mentioned in the new text and not the old gives 'Now mentions Dana Reyes.'; the reverse gives 'No longer mentions Dana Reyes.'", ...);
it("name matching is case-insensitive, whole phrase, and does not match inside a longer word", ...);
it("bold-led list items '- **Name**' under a heading containing people, team, leadership, panel or interviewers count as names even with no person row", ...);
it("a name found by both routes yields one line", ...);
it("order inside the people rule: new names first in order of appearance, then dropped names", ...);
it("identical documents give no lines", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/whats-new-sections.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

A small line scanner (fence aware) for headings; people names from `personNames` matched with a Unicode-aware regex, and bold-led items with `/^\s*[-*]\s+\*\*([^*]+)\*\*/` under the nearest preceding heading whose normalized text contains one of the five words.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/whats-new-sections.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/compare tests
git commit -m "feat(compare): what's new, sections and people"
```

**Acceptance:**
- Spec 5.5 What's new rules 1 to 3 with the spec's example lines "New section: Funding." and "Now mentions Dana Reyes."; code only, no model (spec 2, principle 24).

---

### Task 38: "What's new", rules 4 to 6 and assembly

**Files:**
- Modify: `lib/compare/whats-new.ts` (`numberLines`, `sourceLines`, `changedSectionLines`, `whatsNew`)
- Test: `tests/unit/whats-new-numbers.test.ts`, `tests/unit/whats-new.test.ts`

**Interfaces:**
- Consumes: Task 37's functions, `diffUnits`, `sectionOf` (Milestone 21 Task 17).
- Produces:

```ts
export function numberLines(previousBody: string, nextBody: string): WhatsNewLine[]; // rule 4, at most 4
export function sourceLines(previousBody: string, nextBody: string): WhatsNewLine[]; // rule 5
export function changedSectionLines(previousBody: string, nextBody: string, exclude: Set<string>): WhatsNewLine[]; // rule 6, largest first
export function whatsNew(input: { previousBody: string; nextBody: string; personNames: string[] }): WhatsNewLine[]; // rules in order, at most 12 lines
```

- [ ] **Step 1: Write the failing tests**

```ts
it("numbers: 'Headcount: 1,200' changing to 'Headcount: 1,450' gives 'Headcount: 1,200 to 1,450.'", ...);
it.each([["1,200", true], ["3.5", true], ["3.5M", true], ["12%", true], ["$40k", true], ["2024", true], ["1900", true], ["2099", true], ["47", false], ["1850", false], ["2100", false], ["12abc", false], ["abc12", false], ["12kg", false]])("token %s is %s", ...);
it("tokens are paired in order only when both sides of a changed pair hold the same count; a different count pairs nothing", ...);
it("the label is the text before a colon on that line (markdown stripped), else the section heading", ...);
it("unchanged tokens inside a changed pair are not reported; at most 4 number lines", ...);
it("sources: new http and https hosts give '3 new sources: example.com, example.org, example.net.'; one gives '1 new source: example.com.'; www. is dropped; mailto and other schemes are ignored; hosts already in the old text are not new", ...);
it("changed sections: 'Product: 48 words added, 12 removed.' largest total first, new and removed sections excluded", ...);
it("whatsNew orders rule 1, 2, 3, 4, 5 then 6 and stops at 12 lines in that order", ...);
it("the v1 to v2 research fixtures give: a new section, the headcount line, the people line, a sources line and changed sections, and nothing that is not in the diff", ...);
it("a document with identical text gives []; a change of only whitespace gives []", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/whats-new-numbers.test.ts tests/unit/whats-new.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

A number token is one of four shapes, each not touching a letter or digit on either side: (a) digits with a `,` thousands group, as `1,200` or `1,450.5`; (b) digits with a `.` fraction, as `3.5`; (c) any digits with a trailing `%`, `k`, `M` or `B` or a leading `$`, `€`, `£` or `¥`, as `12%`, `40k`, `3.5M`, `$40`; (d) a plain four digit year from 1900 to 2099. A bare integer such as `47` or `1850` is not a token. Rule 6 word counts come from `diffUnits(...).rows` summed per section with `sectionOf`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/compare tests
git commit -m "feat(compare): what's new, numbers, sources and changed sections"
```

**Acceptance:**
- Spec 5.5 What's new rules 4 to 6 and the 12 line cap, spec 8 ("each of the six rules on fictional research fixtures"), spec 2 principle 24 ("can only report changes that exist": the fixture test compares every line to the diff).

---

### Task 39: Staleness, the "What changed" panel and the compare page list

**Files:**
- Create: `lib/research/panel.ts`, `components/research/whats-new-panel.tsx`
- Modify: `components/job/document-list.tsx` (age text for research kinds), `components/job/document-view.tsx` (age in the meta line), `components/job/tab-research.tsx` (panel under the document header; "Compare versions" already linked), `components/compare/compare-page.tsx` (list under the header), `app/(app)/jobs/[slug]/compare/page.tsx` and `app/(app)/companies/[id]/compare/page.tsx` (load the list)
- Test: `tests/integration/research-panel.test.ts`, `tests/unit/whats-new-panel.test.tsx`, `tests/unit/document-list.test.tsx`

**Interfaces:**
- Consumes: `whatsNew`, `isStale`, `ageDays`, `ageText`, `WHATS_NEW_OPEN_DAYS`, `Scoped.person.listForCompany`, `getVersion`.
- Produces:

```ts
export async function loadWhatsNew(s: Scoped, scopeRef: ArtifactScopeRef, companyId: string, key: string, version: number): Promise<{ lines: WhatsNewLine[]; baseVersion: number } | null>; // null for version 1 or a non-research kind
export function panelOpen(createdAt: Date, now: Date): boolean; // within 7 days
export function WhatsNewPanel(props: { version: number; lines: WhatsNewLine[]; open: boolean; compareHref: string }): React.ReactElement; // <details>, summary "What changed in version 5"
```

- [ ] **Step 1: Write the failing tests**

```ts
it("loadWhatsNew compares version n with n-1, passes the company's person names, and returns null for version 1 and for a cv", ...);
it("the panel summary reads 'What changed in version 5'; it is open for 7 days after the version was created and collapsed after that; 'See what changed' links to compare with a and b set", ...);
it("an empty list shows 'Nothing new that the app can list.' inside the panel", ...);
it("the document list shows '41 days old' beside a research, fit brief or people notes document whose latest version is older than 30 days, and nothing for a cv or a fresh document", ...);
it("the compare page shows the same list under the header for research kinds and not for cover letters", ...);
it("lines render as text nodes", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/research-panel.test.ts tests/unit/whats-new-panel.test.tsx tests/unit/document-list.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`DocumentList` is a server-rendered nav; give it an optional `now: Date` prop (callers pass `new Date()` from the page) and show the age in the muted line after the kind and version. The panel is a native `<details>`. The Research tab reads the document's `createdAt` for `panelOpen`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/research components app tests
git commit -m "feat(research): staleness, the what changed panel and the compare list"
```

**Acceptance:**
- Spec 5.5 Stale paragraph (list and view) and the final paragraph of What's new (compare page and panel, open 7 days, then collapsed), spec 5.3 last paragraph ("what's new" list under the header for research kinds).

---

### Task 40: Home's interview item shows research age

**Files:**
- Modify: `lib/db/scoped/artifact.ts` (`newestResearchAtByOpportunity(kinds)`), `lib/attention/load.ts`, `lib/attention/items.ts` (`AttentionJob.researchAgeDays: number | null`; `AttentionItem` interview variant gains it), `lib/attention/copy.ts` (`ItemCopy.note: string | null`), `components/home/attention-item.tsx` (render `note` as a muted line)
- Test: `tests/integration/attention.test.ts`, `tests/unit/attention.test.ts`, `tests/unit/attention-copy.test.ts`, `tests/unit/home-attention.test.tsx`

**Interfaces:**
- Consumes: `INTERVIEW_RESEARCH_KINDS` (exists in `lib/attention/items.ts`), `STALE_DAYS` (Task 33).
- Produces:

```ts
// scoped artifact
newestResearchAtByOpportunity(kinds: readonly ArtifactKind[]): Promise<Map<string, Date>>; // newest of createdAt and editedAt over the job's and its company's documents of those kinds
// items.ts
export type AttentionJob = { /* existing fields */ researchAgeDays: number | null };
// copy.ts
export type ItemCopy = { reason: string; jobLine: string; meta: MetaLine; note: string | null };
```

- [ ] **Step 1: Write the failing tests**

```ts
it("an interview job that counts as researched with its newest research or people notes 41 days old shows note 'Research is 41 days old'", ...);
it("at 30 days or fewer the note is null", ...);
it("'No research yet' keeps priority: when the job is not researched the meta still reads '... · No research yet' and note is null", ...);
it("a fit brief alone does not count as research here (INTERVIEW_RESEARCH_KINDS)", ...);
it("a company-wide people notes document counts for every job at that company", ...);
it("an in-place edit of the research document resets the age", ...);
it("the note renders under the stage line and the item's other lines (and Prep's confidence line, once Prep has shipped) are unchanged in order", ...);
it("only interview items carry a note; due, follow_up, saved and passed are unchanged", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/attention.test.ts tests/unit/attention-copy.test.ts tests/unit/home-attention.test.tsx tests/integration/attention.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

The scoped query is one grouped `select` over `artifact` joined to `opportunity` on opportunity or company id, `max(greatest(created_at, coalesce(edited_at, created_at)))`, filtered by kind and user. `attentionItems` stays pure: it receives the age in days from `loadHome`. Order of lines in the item: stage line, then the meta line, then `note`, then whatever Prep's confidence line adds (read Prep's `lib/attention` change and keep its line after `note`).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/db lib/attention components/home tests
git commit -m "feat(home): show research age on an interview item"
```

**Acceptance:**
- Spec 5.5 Stale paragraph, second sentence ("Research is 41 days old" under its stage line when researched and stale; "No research yet" keeps priority; Prep's confidence line stays).

---

### Task 41: The Refresh dialog: request, cancel, copy the prompt

**Files:**
- Create: `components/research/refresh-dialog.tsx`, `components/research/refresh-notice.tsx`, `lib/research/refresh-prompt.ts`, `app/(app)/research-actions.ts`
- Modify: `components/job/tab-research.tsx` (a Refresh trigger and the notice in the document actions, only on the latest version of a research kind)
- Test: `tests/unit/refresh-prompt.test.ts`, `tests/unit/refresh-dialog.test.tsx`, `tests/integration/refresh-actions.test.ts`

**Interfaces:**
- Consumes: `requestRefresh`, `cancelRefresh`, `refreshRequestOf` (Task 33), `buildContextDocument` (`lib/bridge/context.ts`), `getJobView`, `PasteDialogTrigger` (target `{ mode: "version" }`), `LocalTime`, `useAnnounce`.
- Produces:

```ts
export function buildRefreshPrompt(input: { note: string | null; contextMd: string; document: { title: string; key: string; version: number; bodyMd: string } }): string; // the fixed wording in the Contract
export type RefreshTarget = { slug: string; scope: "opportunity" | "company" } | { companyId: string }; // a job page (its own or its company's document) or the company page
export function RefreshDialogTrigger(props: { target: RefreshTarget; docKey: string; title: string; version: number; stageOptions: { id: string; label: string }[]; open: { at: Date; note: string } | null; aiFitBrief: boolean }): React.ReactElement; // the Research tab and the company page render this and the notice
export async function requestRefreshAction(target: RefreshTarget, docKey: string, note: string, viewedVersion: number): Promise<FormStateWith<{ movedFrom: number | null }>>;
export async function cancelRefreshAction(target: RefreshTarget, docKey: string): Promise<FormState>;
export async function refreshPromptAction(target: RefreshTarget, docKey: string, note: string): Promise<Result<{ text: string }, "not_found">>; // for a company-only target the context is built from the company's newest job
```

- [ ] **Step 1: Write the failing tests**

```ts
it("buildRefreshPrompt contains the note (or 'No note.'), the context document and the document's markdown, asks for the complete document back, and equals the snapshot in the Contract", ...);
it("the prompt contains no person email (the context document never has one)", ...);
it("the dialog has a note field of at most 500 characters with a live count, 'Request a refresh', 'Copy refresh prompt' and 'Paste a new version'", ...);
it("Request a refresh shows 'Refresh requested 2 Nov' with a Cancel button; Cancel removes it and announces 'Refresh request canceled.'", ...);
it("Copy refresh prompt calls the action, writes the text to the clipboard and announces 'Copied'; the app sends nothing anywhere else", ...);
it("a request made from an older viewed version says 'Applied to the latest version, 4.'", ...);
it("the trigger is absent for a cv and for an older version", ...);
it("actions require a session; another user's slug returns not_found; every write goes through lib/research/refresh.ts", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/refresh-prompt.test.ts tests/unit/refresh-dialog.test.tsx tests/integration/refresh-actions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`refreshPromptAction` builds the prompt on the server (the context builder is server code) and returns text; the client copies it with `navigator.clipboard` through `components/copy-button.tsx`'s pattern. Nothing is stored. The dialog uses the installed `dialog` and `textarea`; focus handling follows `mark-sent-dialog.tsx`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/research components app tests
git commit -m "feat(research): refresh dialog with request, cancel and a copied prompt"
```

**Acceptance:**
- Spec 5.5 items 1 and 2 (request and cancel, "Refresh requested 2 Nov" with Cancel, "Copy refresh prompt", "Paste a new version", the note up to 500 characters), spec 7 (the prompt is built from data already held and copied by the user; nothing is sent).

---

### Task 42: In-app fit brief refresh through Hosted's task

**Blocked on:** Hosted milestones 13 (`lib/generate/start.ts`, the `fit_brief` task) and 14 (credits and the cost line). Everything is testable with Hosted's fake AI driver in CI, so no account is needed there. The live check needs the owner's AI key and a credit balance on the preview.

**Files:**
- Create: `components/research/write-new-version.tsx`
- Modify: `lib/research/refresh.ts` (`startFitBriefRefresh`), `app/(app)/research-actions.ts` (`writeNewVersionAction`), `components/research/refresh-dialog.tsx` (the third way, only when it applies)
- Test: `tests/integration/refresh-fit-brief.test.ts`, `tests/unit/write-new-version.test.tsx`, `tests/e2e/refresh-in-app.spec.ts` (and add `refresh-in-app` to the `apply-*` `testMatch`)

**Interfaces:**
- Consumes: `startGeneration` from `lib/generate/start.ts` (Hosted milestone 13: read its exact parameter, dependency and result types from the Hosted plan's Contract before this task and adapt only the call in `startFitBriefRefresh`), `REFRESH_TASKS` (Task 33), the cost and balance line piece from Hosted milestone 14, `getAiDriver`.
- Produces: `startFitBriefRefresh(s: Scoped, deps: <the dependency type Hosted's startGeneration takes>, opportunityId: string): Promise<Result<{ runId: string }, <Hosted's refusal codes>>>`, and `WriteNewVersion(props: { slug: string; cost: { credits: number; balance: number } | null })`.

- [ ] **Step 1: Write the failing tests**

```ts
it("'Write a new version' appears only on a fit_brief document with key 'fit-brief' on its latest version, with AI on", ...);
it("with AI off (no AI_PROVIDER) the option is absent and the dialog still offers the other two ways", ...);
it("it calls startGeneration with the task REFRESH_TASKS.fit_brief and does not pass the note", ...);
it("the dialog shows Hosted's cost and balance line, '4 credits, 412 left', from the credits piece", ...);
it("with the fake driver the run finishes as a 'generated' version on key fit-brief; its refresh columns are null, so an open request is gone", ...);
it("a failed run refunds and offers Try again exactly as Hosted describes (no new behavior here)", ...);
it("the what's new panel shows for the generated version", ...);
it("a refusal (no_resume, busy, no_credits) shows Hosted's refusal copy and charges nothing", ...);
// e2e: with the fake driver, write a new fit brief and see what's new
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/refresh-fit-brief.test.ts tests/unit/write-new-version.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

A thin call: the run, polling, retry and the `generated` version are Hosted's (Hosted 5.5). This task adds the entry point on the Research tab and the `REFRESH_TASKS` lookup, nothing else. A research task added after the beta needs one `REFRESH_TASKS` entry and a branch in the dialog's condition.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/research components app tests playwright.config.ts
git commit -m "feat(research): rewrite a fit brief in the app from the refresh dialog"
```

**Acceptance:**
- Spec 5.5 item 3 (fit briefs only, key `fit-brief`, `startGeneration`, cost line, note not passed, absent with AI off), spec 8 ("a fit brief rewritten in the app with the fake driver shows what's new").

---

### Task 43: End to end, docs and ship

**Files:**
- Create: `tests/e2e/refresh.spec.ts`, `tests/fixtures/research/nw-research-v1.md`, `nw-research-v2.md` (from Task 37)
- Modify: `playwright.config.ts` (add `refresh` to the `apply-*` `testMatch` regex), `README.md` (a "Refresh research" section and the new `pull` flags), `docs/design-system.md` ("New application code": the refresh dialog, the what's new panel), `.env.example` (no new variable; confirm with `git diff --exit-code .env.example`)
- Test: the spec above

**Interfaces:**
- Consumes: `runCli`, `login`, `addJobAndOpen`, the bridge token helper used by `tests/e2e/bridge.spec.ts`, `scanForViolations`, `scanOpenOverlay`.

- [ ] **Step 1: Write the failing e2e specs**

```ts
test("a refresh requested in the app shows in the context document fetched through the bridge and in 'jobsmith pull --requested'", ...);
test("pushing a complete new version clears the request: 'Refresh requested' is gone and pull --requested finds nothing", ...);
test("an in-place edit of the document keeps the request open", ...);
test("the Research tab panel lists a new section, a changed number and a newly named person for the v1 to v2 fixtures; the compare page lists the same above the diff", ...);
test("Copy refresh prompt: Chromium reads the clipboard and finds the document text; WebKit checks the 'Copied' announcement", ...);
test("axe in light and dark on the refresh dialog and the panel", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test:e2e --project=apply-chromium -g "refresh"`
Expected: FAIL before the dialog is wired in a clean checkout of the task.

- [ ] **Step 3: Make the specs pass and update the docs**

Staleness at 41 days cannot be produced from the browser: it is covered by Task 33, 39 and 40's integration tests with a fixed clock, and the e2e does not assert it.

- [ ] **Step 4: Run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`
Expected: PASS

- [ ] **Step 5: Preview check**

Push the branch, open the pull request, deploy the preview, request a refresh on the preview, pull it with the installed CLI, push a rewrite and check the Research tab in Chrome and Safari.

```bash
git add tests playwright.config.ts README.md docs
git commit -m "test(research): refresh end to end, docs"
```

**Acceptance:**
- Spec 9 Done-when sentence for Milestone 23, in Chromium and WebKit.
- Spec 8 accessibility: axe on the refresh dialog and the what's new panel in light and dark.
