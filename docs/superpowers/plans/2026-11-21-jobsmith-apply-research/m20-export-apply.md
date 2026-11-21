# Milestone 20: Export and apply

> Done when: "A fictional CV with headings, bullets, a table and links downloads as PDF and DOCX at Letter and A4 from a Saved job's Mark applied dialog, the job lands in Applied with "Sent CV version 1 as PDF" on its timeline, and after the CV gets a new version the sent file still downloads byte for byte the same" (spec section 9).

**Branch:** `feat/m20-export-apply`, cut from `main`.

**Before starting** (run from the repo root; each line must succeed unless the note says what to leave out):

```bash
test -f lib/storage/driver.ts            # Prep milestone 7: the Storage interface (put, get, delete)
grep -rl 'pgTable("asset"' lib/db/schema # Prep milestone 6: the asset table
test -f lib/db/scoped/asset.ts           # Prep milestone 6: scoped helper for asset
grep -n "u/" lib/storage/keys.ts         # Prep milestone 7: the per-user key prefix
test -d node_modules/next/dist/docs      # Next 16 docs for Task 8 (route handlers, bundling)
```

If the first three fail, Prep has not shipped. Build only Tasks 1, 3, 4, 5, 6, 7 and the parser half of Task 14 (none of them touches storage); stop before Task 2. The spec states no other leave-out; section 1 makes Prep a prerequisite. Hosted's storage quota (Hosted milestone 14) and prefix rule (Hosted milestone 11) are optional here: Task 8 reads the quota through one injectable function that is absent until Hosted ships.

The spec asks the Milestone 20 plan to confirm two framework facts in `node_modules/next/dist/docs/`: how a route handler bundles font files (`outputFileTracingIncludes`), and whether `@react-pdf/renderer` belongs in `serverExternalPackages`. Task 8, Step 0 settles both and records the answer in the task report.

---

### Task 1: Migration A: `artifact.source_body_md`, `profile.documents`, and base capture

**Files:**
- Modify: `lib/db/schema/artifact.ts` (add `sourceBodyMd: text("source_body_md")`, nullable)
- Modify: `lib/db/schema/app.ts` (`profile`: add `documents: jsonb("documents").notNull().default({})`)
- Create: `lib/db/migrations/<n>_source_body_md.sql` through `pnpm db:generate --name source_body_md` (never hand-numbered)
- Modify: `lib/db/scoped/artifact.ts` (`ArtifactMeta` and `metaColumns` also drop `sourceBodyMd`)
- Modify: `lib/artifacts/edit.ts` (`saveArtifactEdit`: base capture)
- Test: `tests/integration/artifact-edit.test.ts`, `tests/integration/migrations.test.ts`

**Interfaces:**
- Consumes: `saveArtifactEdit(s, opportunityId, ref: DocRef, bodyMd, baseVersion, now?)` and `tx.artifact.getVersion(ref, key, version): Promise<ArtifactRow | null>` (both exist); `planUpsert` stays untouched.
- Produces: `ArtifactRow.sourceBodyMd: string | null`; `ArtifactMeta` without `bodyMd`, `userId` and `sourceBodyMd`; `ArtifactFields` accepts `sourceBodyMd`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/integration/artifact-edit.test.ts (new describe "base capture")
it("the first in-app edit stores the pre-edit body as source_body_md", async () => {
  // seed job, push cv v1 "A\n- one"; saveArtifactEdit(... "A\n- one edited", 1)
  // expect getVersion(v1).sourceBodyMd === "A\n- one"; bodyMd === "A\n- one edited"
});
it("a second in-place edit leaves the base alone", async () => {
  // edit twice; sourceBodyMd still "A\n- one"
});
it("a fork from a sent version sets the base on the new row to the sent body", async () => {
  // push v1, markArtifactSent v1, edit with baseVersion 1 -> status "versioned", v2.sourceBodyMd === v1.bodyMd
});
it("a fork from a stale base sets the base to the latest body", async () => {
  // push v1, push v2 (changed), edit with baseVersion 1 -> versioned v3.sourceBodyMd === v2.bodyMd
});
it("push, paste and generated versions never set source_body_md", async () => {
  // upsertArtifacts origin pushed, pasted, generated -> every row sourceBodyMd null
});
it("listVersions returns no body and no base", async () => {
  // Object.keys(row) contains neither "bodyMd" nor "sourceBodyMd"
});
it("an edit to a manually created v1 also records its base", async () => {
  // pasteArtifact new then edit: sourceBodyMd === pasted body
});
```

```ts
// tests/integration/migrations.test.ts
it("artifact.source_body_md is nullable text and profile.documents defaults to {}", async () => {
  // information_schema.columns: is_nullable YES for source_body_md; insert a profile row, documents equals {}
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/artifact-edit.test.ts tests/integration/migrations.test.ts`
Expected: FAIL, `sourceBodyMd` is undefined and the column does not exist.

- [ ] **Step 3: Implement the schema change and `saveArtifactEdit` base capture**

Run `pnpm db:generate --name source_body_md` and check the SQL holds only the two `ADD COLUMN` lines. In `saveArtifactEdit`, after `latest` is chosen and still inside the transaction, `const loaded = (await tx.artifact.getVersion(scopeRef, ref.key, latest.version))!`. For `plan.status === "edited"`, update with `{ ...plan.patch, ...(loaded.sourceBodyMd === null ? { sourceBodyMd: loaded.bodyMd } : {}) }`. For `"versioned"`, insert with `sourceBodyMd: loaded.bodyMd`. In `lib/db/scoped/artifact.ts` add `sourceBodyMd: _sourceBodyMd` to the destructure that builds `metaColumns` and to the `Omit` of `ArtifactMeta`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration && pnpm typecheck`
Expected: PASS (the whole integration folder, because `ArtifactMeta` is imported widely).

- [ ] **Step 5: Commit**

```bash
git add lib/db lib/artifacts/edit.ts tests/integration
git commit -m "feat(artifacts): capture the merge base on a version's first in-app edit"
```

**Acceptance:**
- Spec 4: `artifact.source_body_md` nullable text, `profile.documents` jsonb default `{}`.
- Spec 5.4: first edit sets the base, later edits do not, forks set it from the loaded pre-edit body, push, paste and generator never set it.
- `tx.artifact.listVersions` still returns no bodies.

---

### Task 2: Migration B: `document_export`, the `export` asset kind, scoped helper, isolation

**Blocked on:** Prep milestones 6 and 7 merged (the `asset` table). Without it this task cannot run.

**Files:**
- Create: `lib/db/schema/document-export.ts`; Modify: `lib/db/schema/index.ts` (export it)
- Modify: the schema file that defines `asset` (found by `grep -rl 'pgTable("asset"' lib/db/schema`): add `export` to the kind constant and its check, keeping every kind already there
- Create: `lib/db/migrations/<n>_document_export.sql` (generated, name `document_export`)
- Create: `lib/db/scoped/document-export.ts`; Modify: `lib/db/scoped/index.ts` (`Scoped.documentExport`, export, `scoped()`)
- Test: `tests/integration/scoped-isolation.test.ts`, `tests/integration/migrations.test.ts`, `tests/integration/document-export-scoped.test.ts`

**Interfaces:**
- Consumes: `artifact_user_id_id_unique` (exists), `opportunity_user_id_id_unique` (exists), the unique `(user_id, id)` pair on `asset` (Prep spec 4, `tts_segment` relies on it).
- Produces: table `document_export` exactly as the Contract; `documentExportQueries(db, userId)`:

```ts
export type DocumentExportRow = typeof schema.documentExport.$inferSelect;
export type DocumentExportFields = Omit<typeof schema.documentExport.$inferInsert, "id" | "userId" | "createdAt" | "updatedAt">;
listForArtifact(artifactId: string): Promise<DocumentExportRow[]>;
listForOpportunity(opportunityId: string): Promise<DocumentExportRow[]>;
getById(id: string): Promise<DocumentExportRow | null>;
findByRenderKey(artifactId: string, renderKey: string): Promise<DocumentExportRow | null>;
latestForFormat(artifactId: string, format: "pdf" | "docx"): Promise<DocumentExportRow | null>;
insert(values: DocumentExportFields): Promise<DocumentExportRow>;
pinSent(id: string, at: Date): Promise<DocumentExportRow | null>;
deleteStaleUnsent(artifactId: string, contentHash: string): Promise<DocumentExportRow[]>; // returns the deleted rows
deleteById(id: string): Promise<DocumentExportRow | null>;
listAll(): Promise<DocumentExportRow[]>;
```

- [ ] **Step 1: Write the failing tests**

```ts
// document-export-scoped.test.ts
it("unique on (artifact_id, render_key): a second insert with the same key throws constraint document_export_artifact_render_key_unique", ...);
it("deleting the opportunity cascades its document_export rows", ...);
it("deleteStaleUnsent removes unsent rows with another content_hash and keeps sent ones and current ones", ...);
it("latestForFormat returns the newest row of that format by created_at", ...);
// scoped-isolation.test.ts: one case per method: B gets null or [] for A's row; insert ignores a smuggled userId.
// migrations.test.ts: asset accepts kind "export"; kind "bogus" is rejected by the check; every earlier kind still accepted.
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/document-export-scoped.test.ts`
Expected: FAIL, `schema.documentExport` is undefined.

- [ ] **Step 3: Implement the table, the scoped file and the asset check**

Table per the Contract: uuid `id`, `user_id` text with index, timestamps, composite foreign keys named `document_export_artifact_fk`, `document_export_opportunity_fk`, `document_export_asset_fk` (all on `(user_id, x)`; artifact and opportunity cascade; asset has no cascade, `store.ts` deletes the asset after the row), checks on `format`, `template`, `page_size`, unique `document_export_artifact_render_key_unique` on `(artifact_id, render_key)`, index on `(user_id, opportunity_id)`. Scoped file follows `lib/db/scoped/person.ts` (`stripScopedKeys`, `userId` appended last).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/db tests/integration
git commit -m "feat(db): document_export table and the export asset kind"
```

**Acceptance:**
- Spec 4: columns, foreign keys, unique and index as written; asset kind check gains `export` and nothing else.
- Spec 7 and 8: a row for the new table in the isolation test.
- `pnpm db:generate` run twice in a row produces no second migration.

---

### Task 3: Document settings in `profile.documents`

**Files:**
- Create: `lib/doc-export/values.ts`, `lib/doc-export/settings.ts`
- Test: `tests/unit/doc-export-settings.test.ts`, `tests/integration/doc-export-settings.test.ts`

**Interfaces:**
- Consumes: `Scoped.profile.get()` and `upsert(values)` (exist), `isTimeZone` (`lib/time/zone.ts`), `getProfile` (`lib/profile/index.ts`).
- Produces (also in the README Contract):

```ts
export const DOCUMENT_SETTINGS_VERSION = 1;
export type DocumentSettings = { version: 1; pageSize: PageSize | null; templates: Record<"cv" | "cover_letter" | "message_draft", ExportTemplate>; fileName: string | null };
export const DEFAULT_DOCUMENT_SETTINGS: DocumentSettings; // pageSize null, templates standard/classic/standard, fileName null
export function parseDocumentSettings(raw: unknown): DocumentSettings; // never throws, field by field fallback
export const documentSettingsInputSchema: z.ZodType<DocumentSettings>;
export function resolvePageSize(settings: DocumentSettings, timeZone: string): PageSize;
export function defaultTemplateFor(settings: DocumentSettings, kind: "cv" | "cover_letter" | "message_draft"): ExportTemplate;
export function nameForFiles(settings: DocumentSettings, accountName: string): string; // "" leaves the name out
export async function getDocumentSettings(s: Scoped): Promise<DocumentSettings>;
export async function saveDocumentSettings(s: Scoped, input: DocumentSettings): Promise<Result<DocumentSettings, never>>;
```

- [ ] **Step 1: Write the failing tests**

```ts
it("pageSize: America/Toronto is letter, Asia/Manila is letter, Europe/Amsterdam is a4, UTC is a4", ...);
it("an explicit pageSize wins over the time zone", ...);
it("defaults are standard for cv, classic for cover_letter, standard for message_draft", ...);
it("parse falls back per field: a bad template keeps the other two, a bad version reads as defaults", ...);
it("nameForFiles: null uses the account name, '' returns '', 'Jordan Lee' returns it", ...);
it("fileName is trimmed and cut at 80 characters on save", ...);
// integration: save then get round trips; a profile row with documents {} reads as defaults; saving leaves headline, resume and preferences untouched.
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/doc-export-settings.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `values.ts` and `settings.ts`**

`values.ts` holds every constant in the Contract's "Export values" block. `parseDocumentSettings` mirrors `parsePreferences` in `lib/preferences/schema.ts` (per-field `.catch`). Time zone rule from spec 5.1: `America/` prefix or exactly `Asia/Manila` gives Letter.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/doc-export-settings.test.ts tests/integration/doc-export-settings.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/doc-export tests
git commit -m "feat(doc-export): document settings and page size rule"
```

**Acceptance:**
- Spec 4 (`profile.documents` shape and defaults) and 5.1 (page size rule).
- Reading `{}` never throws.

---

### Task 4: Markdown to document model

**Files:**
- Create: `lib/doc-export/model.ts`
- Test: `tests/unit/doc-export-model.test.ts`; fixtures `tests/fixtures/export/cv.md`, `tests/fixtures/export/cover-letter.md` (fictional: Jordan Lee, Northwind Traders, one table of 3 columns, one of 7, links, a nested list, a task box, an image, raw HTML, a footnote)
- Modify: `package.json` (`unified`, `remark-parse`, `@types/mdast` dev; `remark-gfm` already present). Pin at install time, record the versions in the task report.

**Interfaces:**
- Consumes: `normalizeBody` (`lib/artifacts/normalize.ts`).
- Produces: `markdownToModel(bodyMd: string, options: { fallbackTitle: string }): { model: DocModel; warnings: ExportWarning[] }` with the `DocModel`, `Block`, `Inline` and `ExportWarning` types of the Contract.

- [ ] **Step 1: Write the failing tests** (one table of cases covering every row of the spec 5.1 table)

```ts
it.each([
  ["leading frontmatter block is removed", "---\nkind: cv\n---\n# A", /* no block contains 'kind' */],
  ["# is the title, ## a section heading, ### an entry heading", ...],
  ["#### to ###### become boldPara", ...],
  ["hard break, bold, italic, strikethrough, inline code keep their flags", ...],
  ["https, http and mailto links are links", ...],
  ["a link whose text differs from the address adds link_text_only once", ...],
  ["any other scheme (javascript:, ftp:, relative) keeps its text only, no link", ...],
  ["bullet and numbered lists nest to 3 levels; level 4 joins level 3", ...],
  ["a task box is dropped with task_box_dropped", ...],
  ["a 6 column table is a table; widths are the longest cell shares clamped to 0.12..0.60 and sum to 1", ...],
  ["a 7 column table becomes labelLines per row and adds wide_table", ...],
  ["blockquote, fenced code, indented code and a body '---' map to quote, code, code, rule", ...],
  ["'<!-- page-break -->' alone on a line is a pageBreak; inside a sentence it is dropped as html", ...],
  ["other raw html adds html_dropped; an image adds image_dropped and keeps no alt text block", ...],
  ["a footnote reference becomes '[1]' and a numbered list is appended", ...],
])("%s", ...);
it("the title is the first # heading, else fallbackTitle", ...);
it("an empty body returns a model with no blocks and no throw", ...);
it("a 300 KB body is not mapped here (the size limit is enforced by the route, Task 8)", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/doc-export-model.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `markdownToModel`**

`unified().use(remarkParse).use(remarkGfm)`; raw HTML needs `remark-parse`'s default `html` nodes (so they can be counted); frontmatter is cut by a regex on the normalized text before parsing, `^---\n(?:[^\n]*\n)*?---\n`, only at position 0. Table widths: fractions from each column's longest plain-text cell length, clamped to 0.12 and 0.60, then rescaled to sum 1 (re-clamp once; document the loop bound). Walk mdast with one recursive function per block type; inline walk carries the style flags.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/doc-export-model.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/doc-export/model.ts tests package.json pnpm-lock.yaml
git commit -m "feat(doc-export): markdown to a small document model"
```

**Acceptance:**
- Spec 5.1 table: every row has a named test.
- Spec 7: only `http`, `https` and `mailto` become links; nothing makes a request.
- No new file under `app/` or `components/` imports the database client.

---

### Task 5: Fonts, theme, glyph check, file names, version

**Blocked on:** the font files. Source Sans 3 and Source Serif 4 static TTFs (regular, italic, bold, bold italic each) are downloaded once from the upstream releases (network, no account), committed with `OFL.txt` under `lib/doc-export/fonts/`, and their release version and sha256 recorded in `lib/doc-export/fonts/README.md`. Everything else in this task runs without them except the glyph test, which reads the committed files.

**Files:**
- Create: `lib/doc-export/fonts/*.ttf`, `lib/doc-export/fonts/OFL.txt`, `lib/doc-export/fonts/README.md`
- Create: `lib/doc-export/theme.ts`, `lib/doc-export/glyphs.ts`, `lib/doc-export/filename.ts`, `lib/doc-export/version.ts`
- Modify: `package.json` (`fontkit`; pin at install time)
- Test: `tests/unit/doc-export-theme.test.ts`, `tests/unit/doc-export-glyphs.test.ts`, `tests/unit/doc-export-filename.test.ts`

**Interfaces:**
- Consumes: `keyFromTitle` folding rules (`lib/artifacts/normalize.ts`), `ExportTemplate`, `PageSize` (Task 3).
- Produces:

```ts
// version.ts
export const RENDERER_VERSION = 1;
// theme.ts
export const THEME_COLORS = { text: "#09090b", secondary: "#52525b", rule: "#e4e4e7" } as const;
export type Theme = { template: ExportTemplate; bodyPt: number; lineHeight: number; paraAfterPt: number; titlePt: number; sectionPt: number; sectionLetterSpacingPt: number; sectionRulePt: number; entryPt: number; listIndentPt: number; listGapPt: number; marginPt: 54; bodyFont: "Source Sans 3" | "Source Serif 4"; headingFont: "Source Sans 3"; fontFiles: Record<string, string> };
export function themeFor(template: ExportTemplate): Theme;
export function pageDimensions(size: PageSize): { widthPt: number; heightPt: number; widthTwips: number; heightTwips: number }; // letter 12240x15840, a4 11906x16838 twips
// glyphs.ts
export function missingGlyphs(text: string, template: ExportTemplate): Promise<string[]>; // distinct characters the template's fonts lack, in first-seen order
// filename.ts
export function exportFileName(parts: { name: string; company: string; label: string }, ext: "pdf" | "docx"): { ascii: string; unicode: string };
export function contentDisposition(disposition: "attachment" | "inline", name: { ascii: string; unicode: string }): string;
export function labelFor(kind: ArtifactKind, title: string): string; // cv "CV", cover_letter "Cover-Letter", message_draft: the title
```

- [ ] **Step 1: Write the failing tests**

```ts
it("theme colors equal the light layer of app/globals.css (--ink-950, --ink-600, --ink-200)", ...); // reads the css file, fails on drift
it("standard: Source Sans 3 body 10.5pt at 1.35, 4pt after paragraphs, title 20pt, section 11pt letter spacing 0.6 rule 0.75, entry 10.5, list indent 12 gap 2", ...);
it("classic: Source Serif 4 body 11pt at 1.45, 8pt after paragraphs, headings in Source Sans 3", ...);
it("both templates: margin 54pt; letter is 12240x15840 twips and a4 is 11906x16838", ...);
it("missingGlyphs: Latin accents none, Cyrillic and CJK and emoji reported, first-seen order, duplicates collapsed", ...);
it("file name: 'Jordan Lee' + 'Northwind Traders' + CV -> Jordan-Lee-Northwind-Traders-CV.pdf", ...);
it("path characters / \\ : * ? \" < > | and control characters are removed from every part", ...);
it("whitespace runs become one hyphen and each part stops at 40 characters; the whole stops at 120 before the extension", ...);
it("an empty part is left out: name '' gives Northwind-CV.pdf with no leading hyphen", ...);
it("ASCII filename folds through NFKD and keeps case; filename* keeps Unicode and percent-encodes per RFC 5987", ...);
it("contentDisposition: attachment; filename=\"...\"; filename*=UTF-8''...", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/doc-export-theme.test.ts tests/unit/doc-export-glyphs.test.ts tests/unit/doc-export-filename.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the four modules**

Glyphs: `fontkit.openSync(file).hasGlyphForCodePoint(cp)` per code point; cache opened fonts per template; skip whitespace and control characters. The renderer version constant is an integer with a comment saying to raise it whenever a template or the mapping changes (reason, not decision ids).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/doc-export-* && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/doc-export package.json pnpm-lock.yaml tests
git commit -m "feat(doc-export): fonts, templates, glyph check and file names"
```

**Acceptance:**
- Spec 5.1 Templates, Page size, File name, and `renderer_version` (spec 4).
- `OFL.txt` sits beside the fonts; `lib/doc-export/fonts/README.md` records version and sha256.
- Theme colors drift fails a test.

---

### Task 6: PDF renderer

**Files:**
- Create: `lib/doc-export/pdf.tsx`
- Modify: `package.json` (`@react-pdf/renderer`; `unpdf` if it is not yet a dependency; pin at install time)
- Test: `tests/unit/doc-export-pdf.test.ts` (uses `unpdf` to read text and page count)

**Interfaces:**
- Consumes: `DocModel` (Task 4), `themeFor`, `pageDimensions`, `missingGlyphs` (Task 5), limits (Task 3 `values.ts`).
- Produces:

```ts
export type RenderMeta = { title: string; author: string };
export async function renderPdf(model: DocModel, options: { template: ExportTemplate; pageSize: PageSize; meta: RenderMeta }): Promise<Result<{ bytes: Uint8Array; pages: number }, "too_long" | "render_failed">>;
```

- [ ] **Step 1: Write the failing tests**

```ts
it("renders the CV fixture at Letter and A4 and the text extracts in reading order", ...);
it("the page count of the CV fixture equals the stored snapshot (letter and a4, both templates)", ...);
it("link annotations exist only for http, https and mailto", ...);
it("fonts are embedded as subsets: the file names a subset tag and is under 400 KB for the fixture", ...);
it("page numbers appear from page 2 on, not on page 1", ...);
it("metadata: title is the document title, author is the name option, creator and producer are Jobsmith, nothing else", ...);
it("a 7 column table renders as label lines, not a table", ...);
it("a document that lays out to 31 pages returns too_long and no bytes", ...); // generated filler
it("characters the fonts lack render as nothing and do not throw", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/doc-export-pdf.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `renderPdf`**

Port the shape of the owner's `lib/pdf/render-resume.ts` and `templates/resume.tsx` (spec 10): `renderToBuffer` over a `<Document>` with fonts registered from the files (`Font.register` with local paths, no URLs), entries kept whole with `wrap={false}` for a list item under 4 lines, headings with `minPresenceAhead`, one column, margins 54 pt. Page count: read it with `unpdf`'s `getDocumentProxy(bytes).numPages` unless react-pdf exposes it through its render callback, in which case use that and drop the `unpdf` call (record the choice). Reject above `MAX_PDF_PAGES` (30) with `too_long`. Keep Courier from the standard fonts for code. Do not set `Font.registerHyphenationCallback` to anything that fetches.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/doc-export-pdf.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/doc-export/pdf.tsx package.json pnpm-lock.yaml tests
git commit -m "feat(doc-export): PDF renderer on react-pdf"
```

**Acceptance:**
- Spec 5.1 (templates, metadata, page numbers, kept-together blocks), 7 (no outbound request, link schemes), 8 (Files tests).
- No test or code path performs a network call.

---

### Task 7: DOCX renderer

**Files:**
- Create: `lib/doc-export/docx.ts`
- Modify: `package.json` (`docx`; `jszip` dev; pin at install time)
- Test: `tests/unit/doc-export-docx.test.ts`

**Interfaces:**
- Consumes: `DocModel`, `themeFor`, `pageDimensions`.
- Produces: `renderDocx(model: DocModel, options: { template: ExportTemplate; pageSize: PageSize; meta: RenderMeta }): Promise<Result<{ bytes: Uint8Array }, "render_failed">>`

- [ ] **Step 1: Write the failing tests** (unzip with `jszip`, read `word/document.xml`, `word/styles.xml`, `word/numbering.xml`)

```ts
it("styles Title, Heading1 (##), Heading2 (###) and Normal exist and are used by the right blocks", ...);
it("two numbering definitions exist: one bullet, one decimal; nested lists use levels 0 to 2", ...);
it("a 3 column table is a real w:tbl with a bold header row", ...);
it("an https link is a w:hyperlink with a relationship; a javascript: link is plain text", ...);
it("page size in twips: letter 12240x15840, a4 11906x16838; margins 1080 on all sides", ...);
it("headings carry keepNext", ...);
it("fonts are named (Source Sans 3 or Source Serif 4) and not embedded: no word/fonts folder", ...);
it("core properties: title and creator only", ...);
it("a page break block becomes w:br w:type=page", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/doc-export-docx.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `renderDocx`**

One `Document` with `numbering.config` for the two definitions, `styles.paragraphStyles` for the four names, `Packer.toBuffer`. Footer page number from page 2: a footer on the default section with `titlePage: true` and an empty first-page footer. Sizes use half-points from the theme (`pt * 2`).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/doc-export-docx.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/doc-export/docx.ts package.json pnpm-lock.yaml tests
git commit -m "feat(doc-export): DOCX renderer on docx"
```

**Acceptance:**
- Spec 5.1 DOCX paragraph (style names, numbering, twips, margins 1080, fonts named not embedded), 8 (Files tests).

---

### Task 8: Export store and the download route

**Blocked on:** Prep storage (`lib/storage`, `asset`). The tests use Prep's `memory` driver, so CI needs no account. The live check on the preview needs the owner's private storage store (Prep decided `vercel_blob`, a private Blob store on the owner's Vercel project) and `STORAGE_PROVIDER` set there.

**Files:**
- Create: `lib/doc-export/store.ts`, `lib/doc-export/handler.ts`, `lib/doc-export/deps.ts`, `lib/doc-export/log.ts`
- Create: `app/api/exports/[artifactId]/route.ts`
- Modify: `next.config.ts` (`outputFileTracingIncludes` for the route and, if Step 0 says so, `serverExternalPackages`)
- Test: `tests/unit/doc-export-render-key.test.ts`, `tests/integration/export-route.test.ts`

**Interfaces:**
- Consumes: `Scoped.documentExport` (Task 2), `Scoped.asset` and `Storage` (Prep: `s.asset.insert`, `getById`, `delete`; `storage.put(key, bytes, contentType)`, `get(key): bytes | null`, `delete(key)`; read the exact method names from Prep's plan Contract first and adjust only the call sites if they differ), `markdownToModel`, `renderPdf`, `renderDocx`, `exportFileName`, `contentDisposition`, `missingGlyphs`, `resolvePageSize`, `defaultTemplateFor`, `nameForFiles`, `getDocumentSettings`, `kindInfo(kind).sendable`.
- Produces:

```ts
export type ExportParams = { format: ExportFormat; template: ExportTemplate; pageSize: PageSize };
export function computeRenderKey(input: { contentHash: string; params: ExportParams; rendererVersion: number; nameUsed: string }): string; // first 32 hex of sha256 over the fields joined with "\n"
export type ExportDeps = { db: Db; storage: Storage; now(): Date; requestId(): string; random32hex(): string; quotaAllows?: (s: Scoped, addBytes: number) => Promise<boolean> };
export async function ensureExport(s: Scoped, deps: ExportDeps, artifact: ArtifactRow, params: ExportParams, ctx: { accountName: string; companyName: string }): Promise<Result<{ row: DocumentExportRow | null; bytes: Uint8Array; fileName: { ascii: string; unicode: string }; cacheHit: boolean; warnings: ExportWarning[]; pages: number | null }, ExportErrorCode>>;
export async function handleExportRequest(deps: ExportDeps, userId: string | null, artifactId: string, query: URLSearchParams): Promise<Response>;
export async function deleteExportRow(s: Scoped, deps: ExportDeps, id: string): Promise<void>; // row, then asset, then object
```

- [ ] **Step 0: Confirm the two framework facts** by reading `node_modules/next/dist/docs/` (route handlers, `outputFileTracingIncludes`, `serverExternalPackages`, `maxDuration`). Record: does the font folder need `outputFileTracingIncludes: { "/api/exports/[artifactId]": ["./lib/doc-export/fonts/**"] }`, and does `@react-pdf/renderer` go in `serverExternalPackages`. Do a `pnpm build` and request the route once before closing this step.

- [ ] **Step 1: Write the failing tests**

```ts
// unit: computeRenderKey is 32 hex, changes with each input field, is stable for equal input
// integration (PGlite + memory storage + fake clock):
it("401 with no session, 404 for another user's artifact id, 404 for a research artifact (not sendable)", ...);
it("400 invalid_query for format=zip, template=fancy, page=legal, disposition=download", ...);
it("first request renders, stores one asset and one row, and streams with the content type, Content-Disposition, Cache-Control: private, no-store and X-Content-Type-Options: nosniff", ...);
it("second identical request is a cache hit: same bytes, no second render (renderer spy called once)", ...);
it("an in-place edit makes older unsent exports stale: the next request deletes them (rows, assets, objects) and renders again", ...);
it("a pinned (sent) export is never pruned and still streams byte for byte after RENDERER_VERSION is mocked from 1 to 2 and after a newer version of the key exists", ...);
it("a cached row whose object is gone is rendered again and replaced; a pinned row whose object is gone returns 410 sent_file_missing", ...);
it("storage put failing still streams the rendered bytes and stores no row", ...);
it("quotaAllows returning false still streams and stores nothing", ...);
it("too_large (413) for a body over 262144 bytes, too_long (413) at 31 pages with nothing stored, render_timeout (504) when the renderer exceeds 20 seconds (fake timers), render_failed (500) carries the request id", ...);
it("the 9th distinct parameter set cannot exist: at most 8 cached files per version (two formats, two templates, two sizes)", ...);
it("one [export] log line per request with ids, format, template, page size, pages, bytes, ms, hit or miss and warning codes, and no document text, name or file name", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/doc-export-render-key.test.ts tests/integration/export-route.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `store.ts`, `handler.ts`, `deps.ts` and the route**

`ensureExport` order: size check, `findByRenderKey` and `storage.get`; on miss: model, glyph warnings, render under `Promise.race` with `RENDER_TIMEOUT_MS`, `quotaAllows`, `storage.put`, `asset.insert` (kind `export`, key `u/<first 16 hex of sha256(user id)>/exports/<random32hex>.<ext>`: call Prep's prefix helper if `lib/storage/keys.ts` exports one, else compute it locally and keep the string identical), `documentExport.insert`, then `deleteStaleUnsent` and delete their assets and objects. All of it inside `store.ts`, the only writer of `document_export` and its assets. The route file is `GET` only, `export const maxDuration = 60`, takes `getUser()` (not `requireUser`, same as `app/(app)/settings/export/route.ts`), never reads an `Authorization` header. `deps.ts` builds production deps from Prep's storage accessor. Logs through `log.ts` with the request id.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration/export-route.test.ts && pnpm typecheck && pnpm build`
Expected: PASS, and the build includes the route.

- [ ] **Step 5: Commit**

```bash
git add lib/doc-export app/api/exports next.config.ts tests
git commit -m "feat(doc-export): cached export route with a pinned sent file"
```

**Acceptance:**
- Spec 5.1 Route paragraph, 6 (export errors and statuses), 7 (session only, no bearer, 404 for others), 8 integration list for export.
- `git grep -n "from \"@/lib/db/client\"" app components` finds nothing new.
- Step 0's two answers are in the task report.

---

### Task 9: Export dialog and the Documents tab action

**Blocked on:** Task 8 (and so Prep). The dialog renders without it, the Download button needs the route.

**Files:**
- Create: `components/doc-export/export-dialog.tsx`, `components/doc-export/sent-as.tsx`, `lib/doc-export/dialog-model.ts`, `lib/doc-export/warnings.ts`
- Modify: `components/job/tab-documents.tsx` (add an Export trigger to `DocumentView`'s `actions`), `app/(app)/jobs/[slug]/page.tsx` (load `getDocumentSettings` and the profile time zone, pass defaults to `TabDocuments`)
- Test: `tests/unit/doc-export-dialog-model.test.ts`, `tests/unit/export-dialog.test.tsx`

**Interfaces:**
- Consumes: `getDocumentSettings`, `resolvePageSize`, `defaultTemplateFor`, `nameForFiles`, `exportFileName`, `labelFor`, route URL shape `GET /api/exports/<artifactId>?format=&template=&page=&disposition=`.
- Produces:

```ts
export function exportHref(artifactId: string, p: ExportParams, disposition: "attachment" | "inline"): string;
export function dialogModel(input: { kind: ArtifactKind; title: string; companyName: string; settings: DocumentSettings; timeZone: string; accountName: string }): { defaults: ExportParams; fileNames: { pdf: string; docx: string } };
export async function documentWarnings(bodyMd: string, template: ExportTemplate): Promise<ExportWarning[]>; // markdownToModel warnings plus missingGlyphs; no rendering
export function ExportDialogTrigger(props: { artifactId: string; kind: ArtifactKind; title: string; version: number; warningsByTemplate: Record<ExportTemplate, ExportWarning[]>; defaults: ExportParams; fileNames: { pdf: string; docx: string } }): React.ReactElement;
```

- [ ] **Step 1: Write the failing tests**

```ts
it("exportHref builds the exact query for pdf/standard/letter/attachment", ...);
it("dialog defaults come from profile.documents: cover letter classic, cv standard; page size from the time zone when null", ...);
it("the dialog shows Format (PDF, DOCX), Template, Page size, the file name it will save as, this document's warnings, Download and, for PDF only, Preview", ...);
it("Preview opens the inline URL in a new tab with rel noopener; Download uses the attachment URL", ...);
it("this document's warnings show before the download, switch with the template, and never disable the Download button", ...);
it("the file name preview updates when the format changes (.pdf to .docx)", ...);
it("documentWarnings: a body with an image and a wide table yields image_dropped and wide_table without calling a renderer", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/export-dialog.test.tsx tests/unit/doc-export-dialog-model.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the dialog**

Built from the installed `dialog`, `radio-group`, `select` primitives (spec 10). The Documents tab (a server component) computes the warnings with `documentWarnings` for both templates and passes them down, so they show before the first render. Copy for each warning code lives in `lib/doc-export/dialog-model.ts` as `WARNING_TEXT` (see the Contract).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/doc-export lib/doc-export components/job app tests
git commit -m "feat(doc-export): export dialog on the Documents tab"
```

**Acceptance:**
- Spec 5.1 first paragraph (dialog fields and buttons), 10 (`components/doc-export/export-dialog.tsx` is the port target of the prototype's Download PDF action).
- Semantic token classes only; `pnpm check:tokens` passes.

---

### Task 10: Settings Documents section and the data export

**Files:**
- Create: `components/settings/documents-section.tsx`
- Modify: `app/(app)/settings/page.tsx` (add the section), `app/(app)/settings/actions.ts` (add `saveDocumentSettingsAction`), `lib/export/collect.ts` (add `documentExports`, raise `EXPORT_VERSION` by one from its value on `main`)
- Test: `tests/unit/documents-section.test.tsx`, `tests/integration/export.test.ts`

**Interfaces:**
- Consumes: `getDocumentSettings`, `saveDocumentSettings`, `documentSettingsInputSchema`, `Scoped.documentExport.listAll()`.
- Produces: `DocumentsSection(props: { settings: DocumentSettings; accountName: string })`; `collectExport` result gains `documentExports` (rows without `userId`; no bytes, no asset keys: `assetId` stays, `storage_key` never appears).

- [ ] **Step 1: Write the failing tests**

```ts
it("section shows Default page size (From my time zone, Letter, A4), Default template for CVs, cover letters and messages, and the name used in file names with the account name as placeholder", ...);
it("saving writes profile.documents and shows 'Document settings saved.'", ...);
it("an empty name field saves '' and leaves the name out of file names", ...);
// integration export.test.ts: documentExports holds metadata only; a second user's rows never appear; version equals previous + 1; no key containing 'storage' appears anywhere in the JSON
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/documents-section.test.tsx tests/integration/export.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the section, the action and the collector change**

The section follows `components/settings/profile-section.tsx` and `settings-section.tsx`. The action calls `requireUser()`, parses with `documentSettingsInputSchema`, returns a typed state through `lib/forms/state.ts`. `documentExports` is added to the `Promise.all` in `collectExport`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration/export.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/settings app lib/export tests
git commit -m "feat(settings): Documents section and export of export metadata"
```

**Acceptance:**
- Spec 4 (Settings data export adds `documentExports`, version up by one), 5.7 last paragraph (Settings Documents section), 7 (metadata only).

---

### Task 11: "How did you send it?" in Mark as sent

**Blocked on:** Tasks 2 and 8 for the PDF and DOCX choices. The Text and Other choices need neither; the pin step is skipped for them.

**Files:**
- Modify: `lib/artifacts/sent.ts` (`markArtifactSent` input gains format and export id), `components/job/mark-sent-dialog.tsx`, `app/(app)/jobs/[slug]/document-actions.ts` (`markDocumentSentAction`), `lib/pipeline/event-text.ts` (`document_sent` wording), `components/job/tab-documents.tsx` ("Sent as PDF" and "Download the file you sent")
- Create: `lib/doc-export/pin.ts`
- Test: `tests/integration/artifact-sent.test.ts`, `tests/unit/event-text.test.ts`, `tests/integration/doc-export-pin.test.ts`, `tests/unit/mark-sent-dialog.test.tsx`

**Interfaces:**
- Consumes: `markArtifactSent(s, opportunityId, key, version, now?)` (exists), `ensureExport`, `Scoped.documentExport.latestForFormat`, `pinSent`.
- Produces:

```ts
export type SentFormat = "pdf" | "docx" | "text" | "other";
export async function markArtifactSent(s: Scoped, opportunityId: string, key: string, version: number, now?: Date, sent?: { format: SentFormat; exportId: string | null }): Promise<Result<{ title: string }, "not_found" | "artifact_not_found" | "not_sendable" | "already_sent">>;
export async function ensureSentExport(s: Scoped, deps: ExportDeps, opportunityId: string, key: string, version: number, format: "pdf" | "docx", defaults: ExportParams): Promise<Result<{ exportId: string | null; stored: boolean }, ExportErrorCode>>; // renders BEFORE any write transaction opens
```

- [ ] **Step 1: Write the failing tests**

```ts
it("document_sent meta gains format and exportId; a call without them still works and writes neither", ...);
it("with format pdf the most recent pdf export of this version is pinned: sent_at set on the row", ...);
it("with no export yet, one is rendered with the defaults before the transaction opens (spy order: render, then lock)", ...);
it("when storage fails the record keeps format pdf with exportId null and the action result says no file was stored", ...);
it("event text: 'Sent CV version 3 as PDF.' for pdf, 'as DOCX', 'as text', 'another way'; an old event with no format reads 'Sent CV version 3.'", ...);
it("defaults in the dialog: PDF for cv and cover_letter, Text for message_draft", ...);
it("a sent version's view shows 'Sent as PDF' and 'Download the file you sent', which links the pinned export", ...);
it("the dialog says when no file could be stored", ...);
it("the dialog also holds a Download button for the chosen PDF or DOCX format, using the profile's template and page size (spec 5.1: Export sits inside the Mark as sent dialog)", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/artifact-sent.test.ts tests/unit/event-text.test.ts tests/integration/doc-export-pin.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`markArtifactSent` keeps its own transaction, adds `meta: { key, version, title, format, exportId }` only when `sent` is given, and calls `tx.documentExport.pinSent(exportId, now)` in the same transaction. `ensureSentExport` renders through `ensureExport` first. The pinned bytes are served by a branch in `handleExportRequest`: when the artifact is sent and a pinned row of that format exists, serve it regardless of `renderer_version` and of the query's template and page size (the "Download the file you sent" link passes `?format=<f>&pinned=1`; the route treats `pinned=1` as: find the row with `sent_at` not null for this artifact and format). Add `pinned` to the Contract's route query. Download link uses `disposition=attachment`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib components app tests
git commit -m "feat(apply): record how a document was sent and pin the file"
```

**Acceptance:**
- Spec 5.1 last paragraph (formats, defaults, pin, render before the transaction, "Sent CV version 3 as PDF", "Sent as PDF", "Download the file you sent", storage-failure line), 4 (`document_sent` meta).
- Done-when: after the CV gets a new version, the pinned download is byte for byte the same (asserted in Task 8's route test and again in Task 15).

---

### Task 12: `markApplied`

**Files:**
- Create: `lib/apply/mark-applied.ts`, `lib/apply/messages.ts`
- Test: `tests/integration/mark-applied.test.ts`

**Interfaces:**
- Consumes: `moveOpportunity(s, id, { kind: "applied" }, now)`, `markArtifactSent` (Task 11), `ensureSentExport` (Task 11), `setNextAction(s, id, { text, at })`, `addZonedDays(instant, days, tz, hour)`, `getProfile`, `parsePreferences(...).attention.followUpDays`, `Scoped.transaction`.
- Produces:

```ts
export type MarkAppliedDoc = { key: string; version: number; sentAs: SentFormat };
export type MarkAppliedInput = { appliedAt: Date; documents: MarkAppliedDoc[]; followUp: { on: boolean } };
export const APPLIED_MAX_DAYS_BACK = 365;
export type MarkAppliedError = "not_found" | "closed" | "artifact_not_found" | "not_sendable" | "invalid" | "date_out_of_range";
export async function markApplied(s: Scoped, deps: ExportDeps, opportunityId: string, input: MarkAppliedInput, now?: Date): Promise<Result<{ moved: boolean; recorded: { key: string; version: number; exportId: string | null }[]; alreadyRecorded: { key: string; version: number }[]; followUpAt: Date | null }, MarkAppliedError>>;
export async function recordSentOnly(s: Scoped, deps: ExportDeps, opportunityId: string, input: Omit<MarkAppliedInput, "followUp">, now?: Date): Promise<Result<...same data with moved false, MarkAppliedError>>;
```

- [ ] **Step 1: Write the failing tests**

```ts
it("moves a Saved job to Applied with the applied date as 'now': Saved completed_at, Applied entered_at and the stage_moved event all carry that date", ...);
it("records the chosen CV and cover letter versions as sent with their formats, pins their exports, writes one document_sent event each", ...);
it("skips a version already sent and reports it in alreadyRecorded, not an error", ...);
it("follow-up: with the reminder on, next action 'Follow up' is set at the applied day plus followUpDays at 09:00 in the profile time zone; off sets nothing", ...);
it("a document deleted in the meantime rolls back every step: stage unchanged, nothing sent, no event, error artifact_not_found", ...);
it("a closed job returns closed and changes nothing", ...);
it("exports are rendered before the transaction: a render failure returns the error and leaves the job in Saved", ...);
it("applied date more than 365 days back or in the future returns date_out_of_range", ...);
it("recordSentOnly writes sent records with the Applied stage's entered_at as the sent date and does not move the job", ...);
it("a job whose current stage is not Saved can still markApplied only through recordSentOnly (markApplied on Offer returns invalid)", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/mark-applied.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Order: validate the date against `now` and `APPLIED_MAX_DAYS_BACK`; resolve every needed export first (`ensureSentExport` for pdf and docx choices); then `s.transaction`: lock opportunity, `moveOpportunity`, each `markArtifactSent` (nested transactions become savepoints), `setNextAction`. Any `fail` result throws a private sentinel inside the callback to roll back, caught outside and returned as the first error. `recordSentOnly` uses the same helper without the move and the reminder. `messages.ts` holds the copy for each error code (Contract).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/mark-applied.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/apply tests
git commit -m "feat(apply): mark applied in one transaction"
```

**Acceptance:**
- Spec 5.2 (`markApplied` paragraph and Record only paragraph), 6 (Mark applied errors), 8 (rolls back when one document fails, applied date on the stage and the event).
- `lib/apply/mark-applied.ts` writes nothing itself: it calls `moveOpportunity`, `markArtifactSent`, `setNextAction` and the export store.

---

### Task 13: Mark applied dialog, the record-only notice, the Home link

**Blocked on:** Tasks 8 and 11 for the Download buttons and PDF choices.

**Files:**
- Create: `components/apply/mark-applied-dialog.tsx`, `components/apply/record-sent-notice.tsx`, `lib/apply/dialog-model.ts`, `app/(app)/jobs/[slug]/apply-actions.ts`
- Modify: `components/job/job-header.tsx` (Mark applied button when active and current stage kind is `saved`), `app/(app)/jobs/[slug]/page.tsx` (`?apply=1` opens the dialog; pass documents and settings), `components/job/tab-documents.tsx` (record-sent notice), `components/home/attention-item.tsx` and `lib/attention/copy.ts` (line 111, the `mark_applied` action: it becomes a link to `/jobs/<slug>?apply=1` instead of calling `markAppliedFromHomeAction`), `app/(app)/home-actions.ts` (delete `markAppliedFromHomeAction` once no caller is left)
- Test: `tests/unit/apply-dialog-model.test.ts`, `tests/unit/mark-applied-dialog.test.tsx`, `tests/integration/apply-actions.test.ts`, `tests/unit/home-attention.test.tsx`

**Interfaces:**
- Consumes: `markApplied`, `recordSentOnly` (Task 12), `exportHref`, `dialogModel` (Task 9), `getJobView().documents`.
- Produces:

```ts
export function applyDialogModel(input: { documents: ArtifactMeta[]; versionsByKey: Record<string, ArtifactMeta[]>; settings: DocumentSettings; timeZone: string; followUpDays: number; now: Date; stageEnteredAt: Date | null; mode: "apply" | "record" }): ApplyDialogModel;
export function needsRecordNotice(input: { currentStageKind: StageKind; documents: ArtifactMeta[]; stageEnteredApplied: Date | null }): boolean; // past Saved, has cv or cover_letter, no sent version
export async function markAppliedAction(opportunityId: string, input: MarkAppliedInput): Promise<FormState>;
export async function recordSentAction(opportunityId: string, input: Omit<MarkAppliedInput, "followUp">): Promise<FormState>;
```

- [ ] **Step 1: Write the failing tests**

```ts
it("pickers default to the latest version of the most recently updated key per kind, with a None choice", ...);
it("message drafts are checkboxes, off by default", ...);
it("'sent as' defaults per document: PDF for cv and cover_letter, Text for messages; Download uses the profile template and page size", ...);
it("applied date defaults to today in the profile time zone, min 365 days back, max today", ...);
it("'Remind me to follow up on <date>' is on by default and the date is applied day plus followUpDays at 09:00", ...);
it("Mark applied button shows only while the job is active and its stage kind is saved", ...);
it("?apply=1 opens the dialog on load", ...);
it("record-only: past Saved with a cv or cover letter and no sent version shows 'Record which CV and cover letter you sent'; it disappears once any version is sent; the sent date defaults to the Applied stage's entered_at, else now", ...);
it("Home's saved item action links to /jobs/<slug>?apply=1", ...);
it("an error from the action names the cause and the dialog stays open with focus on the confirm button", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/apply-dialog-model.test.ts tests/unit/mark-applied-dialog.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Dialog fields in the spec's order (applied date, CV picker, cover letter picker, message checkboxes, "sent as" with Download per chosen document, follow-up reminder, "Mark applied"). Actions call `requireUser()`, `markApplied`, revalidate `/jobs/<slug>` and `/board`, announce "Marked applied." through `useAnnounce`. Home's `saved` item currently calls `markAppliedFromHomeAction` (`app/(app)/home-actions.ts`), which only moves the stage; replace the button with a link to `/jobs/<slug>?apply=1`, update `tests/unit/home-attention.test.tsx`, and delete the action after a grep shows no other caller.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration/apply-actions.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components lib app tests
git commit -m "feat(apply): Mark applied dialog, record-only notice and Home link"
```

**Acceptance:**
- Spec 5.2 first three paragraphs (every field of the dialog, the record-only notice, the Home link).
- Focus returns to a live control after the dialog closes (`correctFocusOnceLost`, as `mark-sent-dialog.tsx` does).

---

### Task 14: Application form answers

**Files:**
- Create: `lib/apply/form-answers.ts`, `components/apply/form-answers-view.tsx`, `components/apply/answer-field.tsx`
- Modify: `components/job/tab-documents.tsx` (Fields and Document toggle for a `form-answers` key)
- Test: `tests/unit/form-answers.test.ts`, `tests/unit/form-answers-view.test.tsx`

**Interfaces:**
- Consumes: `Markdown` (`components/markdown.tsx`), `useAnnounce`, `CopyButton` (`components/copy-button.tsx`).
- Produces:

```ts
export type AnswerField = { label: string; bodyMd: string; limit: { kind: "characters" | "words"; max: number } | null };
export type ParsedAnswers = { title: string | null; notes: string; fields: AnswerField[]; truncated: boolean };
export function parseFormAnswers(bodyMd: string): ParsedAnswers; // pure
export function isFormAnswersKey(key: string): boolean; // "form-answers" or starts with "form-answers-"
export function toPlainText(bodyMd: string): string;
export function countFor(field: AnswerField): { used: number; max: number; over: number } | null;
export const MAX_ANSWER_FIELDS = 100;
```

- [ ] **Step 1: Write the failing tests**

```ts
it("a field starts at each heading of the shallowest level from 2 to 4 that appears; level 1 is the title; deeper headings stay inside the answer", ...);
it("text before the first field is notes with no copy button", ...);
it("limit labels: '(500 characters)', '(max 500 chars)' and '(150 words)' set the limit, and the label keeps its text including the limit words", ...);
it("countFor: 412 of 500 characters reads '412 / 500 characters'; over by 37 gives over 37", ...);
it("toPlainText removes emphasis markers, writes a link as 'text (address)' when they differ, keeps list items as '- ' or '1. ', one blank line between paragraphs", ...);
it("at most 100 fields are returned and truncated is true past that", ...);
it("an empty answer shows 'No answer yet'", ...);
it("Copy puts plain text on the clipboard and announces 'Copied'; 'Copy all' copies label and answer pairs", ...);
it("over the limit shows the 'Over by 37' chip with the words, not color alone", ...);
it("isFormAnswersKey: form-answers and form-answers-acme yes, form-answersheet no", ...);
it("the Document view always shows the whole file, including fields past 100", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/form-answers.test.ts tests/unit/form-answers-view.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the parser and the view**

Parser scans with the mdast from Task 4 or a line scanner that respects fenced code (choose the line scanner; add a case for a `##` inside a fence). Limit regex: `/\((?:max\s+)?(\d{1,6})\s+(characters|chars|words)\)\s*$/i`. Counts are code points for characters and whitespace-split tokens for words. The view is a client component with a Fields and Document `toggle-group`; Mark as sent here reuses Task 11's dialog with Text preselected (key `form-answers` is a `message_draft` through `BUILT_IN_SUFFIXES`).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/apply components/apply components/job tests
git commit -m "feat(apply): form answers as copyable fields with counts"
```

**Acceptance:**
- Spec 5.2 last paragraph (levels, limits, plain text, "Copy all", live region "Copied", "No answer yet", the 100 cap, Fields and Document toggle), 8 (parser tests).
- Editing fields one by one is absent, as the spec's out-of-scope list says.

---

### Task 15: End to end, docs and ship

**Blocked on:** Tasks 2 to 13 merged on the branch. The manual check needs the owner's machine and apps (below).

**Files:**
- Create: `tests/e2e/export-apply.spec.ts`, `tests/fixtures/export/cv.md` and `cover-letter.md` (from Task 4)
- Modify: `playwright.config.ts` (add `apply-chromium`, `apply-webkit`, `apply-phone`, chained after the last existing project, one engine at a time, `testMatch: /(export-apply)\.spec\.ts$/`; later milestones extend the regex), `.env.example` (no new variable: confirm with `git diff --exit-code .env.example` and say so in the PR), `README.md` (a "Documents and export" section: Settings, formats, the sent record, privacy), `docs/design-system.md` ("New application code": `components/doc-export/export-dialog.tsx`, `components/apply/*` with their reasons)
- Test: the spec above

**Interfaces:**
- Consumes: `login`, `uniqueName`, `addJobAndOpen` (`tests/e2e/session.ts`), `scanForViolations`, `scanOpenOverlay`, `scanInPlace`.

- [ ] **Step 1: Write the failing e2e specs**

```ts
test("export a CV as PDF and DOCX through the download event, at Letter and A4", ...);        // file names Jordan-Lee-Northwind-Traders-CV.pdf; PDF starts with %PDF; DOCX starts with PK
test("Mark applied from a Saved job: sent as PDF, job lands in Applied, timeline says 'Sent CV version 1 as PDF'", ...);
test("after the CV gets a new version the sent file downloads byte for byte the same", ...);   // compare sha256 of both downloads
test("record-only notice on a job moved to Applied by the stepper", ...);
test("form answers: copy, count, 'Over by'; Chromium reads the clipboard, WebKit checks the announcement 'Copied'", ...);
test("Settings Documents: set A4 and Classic, the export dialog defaults follow", ...);
// axe in light and dark on the export dialog, the Mark applied dialog and the form answers view (scanOpenOverlay / scanForViolations)
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test:e2e --project=apply-chromium`
Expected: FAIL, the project or the page does not exist yet on a clean checkout of the task.

- [ ] **Step 3: Wire the projects and make the specs pass**

The webServer command already runs `pnpm build`. Set whatever storage variables Prep's plan added for e2e (read its `playwright.config.ts` diff; no new variable of this cycle). Use `STORAGE_PROVIDER=memory`-equivalent only if Prep's e2e did; otherwise `local` with a temp directory.

- [ ] **Step 4: Run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`
Expected: PASS in Chromium, WebKit and the phone project.

- [ ] **Step 5: Manual check and preview**

Open the two fixtures once each in Word, Pages, Google Docs, LibreOffice, Acrobat Reader and macOS Preview and record the result per app in the pull request (spec 8, "Manual, once per `renderer_version`"). Push the branch, open the pull request, deploy the preview, and open it in Chrome and Safari on desktop and at phone width.

```bash
git add tests playwright.config.ts README.md docs
git commit -m "test(apply): export and apply end to end, docs"
```

**Acceptance:**
- Spec 9 Done-when sentence for Milestone 20, in Chromium and WebKit.
- Spec 8 accessibility: axe zero violations in light and dark on both dialogs and the form answers view.
- The PR lists the six manual results.
