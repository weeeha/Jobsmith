# Milestone 21: Compare

> Done when: "Two versions of a fictional cover letter show word-level changes side by side on desktop and inline on a phone, the keyboard reaches every change, and axe passes in light and dark" (spec section 9).

**Branch:** `feat/m21-compare`, cut from `main`.

**Before starting:** this milestone touches only Core's artifact code and reads only columns that exist on `main` today. It needs nothing from Prep, Hosted or Feed. Run:

```bash
test -f lib/artifacts/plan.ts && grep -n "export function versionNotice" lib/artifacts/plan.ts
test -f components/job/version-list.tsx && test -f components/job/tab-documents.tsx
test -f components/ui/sheet.tsx && grep -n "pb-safe" app/globals.css
```

If Milestone 20 has merged, `ArtifactRow.sourceBodyMd` exists and the compare loader ignores it. If it has not, nothing here changes. Compare for company documents (`/companies/[id]/compare`) ships its route in Task 22 and links back through a helper that points at today's job route; Milestone 24 flips that one helper to the company page.

New dependency: `diff` (jsdiff, BSD-3-Clause), `@types/diff` only if the installed version ships no types. Pin at install time and record the version in the task report.

---

### Task 16: Units and compare limits

**Files:**
- Create: `lib/compare/limits.ts`, `lib/compare/units.ts`
- Test: `tests/unit/compare-units.test.ts`; fixtures reuse `tests/fixtures/packet/*.md` and `tests/fixtures/export/*.md` (when Milestone 20 has merged) as join-property inputs

**Interfaces:**
- Consumes: nothing.
- Produces:

```ts
// limits.ts
export const LONG_LINE_CHARS = 160;
export const WORD_MARK_MAX_CHARS = 20_000;
export const WORD_MARK_TIMEOUT_MS = 500;
export const UNIT_DIFF_MAX_EDIT_LENGTH = 5_000;
export const COLLAPSE_MIN_RUN = 6;
export const COLLAPSE_CONTEXT = 3;
export const SPLIT_MIN_WIDTH_PX = 1_024;
// units.ts
export function splitUnits(body: string): string[]; // every unit keeps its trailing separator; units.join("") === body
export function unitsForDiff(body: string): string[];   // splitUnits(body + "\n"): stored bodies end without a newline, so without this a last line that gains lines after it would show as changed
export function bodyFromUnits(units: string[]): string; // units.join("") with exactly one trailing "\n" removed
```

- [ ] **Step 1: Write the failing tests**

```ts
it("join property: splitUnits(body).join('') === body for every fixture and for CRLF-free random text", ...);
it("a CV bullet line is one unit; a heading is one unit; a table row is one unit; each keeps its trailing newline", ...);
it("a paragraph line over 160 characters splits after each sentence end: . ? or ! followed by whitespace and an uppercase letter, digit, quote or bracket", ...);
it("a 159 character line is never split; a 161 character line with one sentence end is split in two", ...);
it("a lowercase letter after a period does not split ('e.g. this' stays whole)", ...);
it("lines inside a fenced code block, headings, list items and table rows are never sentence split even when over 160", ...);
it("an empty string returns []; a body with no trailing newline keeps its last unit unterminated", ...);
it("bodyFromUnits(unitsForDiff(x)) === x for every fixture, and appending a line to x leaves every earlier unit of unitsForDiff unchanged", ...);
it("a cover letter paragraph of 3 sentences over 160 characters yields 3 units", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/compare-units.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `splitUnits`**

Split on `\n` keeping the separator, track fence state (a line starting with three backticks or tildes toggles it). A line is sentence-split only when it is outside fences, not a heading (`^#{1,6}\s`), not a list item (`^\s*([-*+]|\d+[.)])\s`), not a table row (`^\s*\|`), and longer than `LONG_LINE_CHARS`. Sentence end regex: `/(?<=[.?!])(?=\s+["'(\[\p{Lu}\d])/u`, with the whitespace staying on the left unit.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/compare-units.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/compare tests
git commit -m "feat(compare): split a document into diff units"
```

**Acceptance:**
- Spec 5.3 Units: join property over every fixture, fences, the sentence threshold.
- Spec 11 item 9: `LONG_LINE_CHARS` is the one constant for the threshold.

---

### Task 17: Unit diff, word marking and the limit fallbacks

**Files:**
- Create: `lib/compare/diff.ts`
- Modify: `package.json` (`diff`)
- Test: `tests/unit/compare-diff.test.ts`

**Interfaces:**
- Consumes: `splitUnits`, the limits (Task 16).
- Produces:

```ts
export type WordPart = { text: string; kind: "same" | "removed" | "added" };
export type DiffRow =
  | { type: "same"; units: string[] }
  | { type: "change"; id: number; removed: string[]; added: string[]; words: { left: WordPart[]; right: WordPart[] } | null; wordsSkipped: boolean };
export type DiffSummary = { wordsAdded: number; wordsRemoved: number; sectionsChanged: number };
export type DiffResult = { ok: true; rows: DiffRow[]; summary: DiffSummary; changeCount: number } | { ok: false; reason: "too_different" };
export function diffUnits(a: string[], b: string[], limits?: Partial<{ maxEditLength: number; wordMarkMaxChars: number; wordMarkTimeoutMs: number }>): DiffResult;
export function sectionOf(rows: DiffRow[], index: number): string; // the nearest `## ` heading at or before a row, "" before the first
```

- [ ] **Step 1: Write the failing tests**

```ts
it("identical lists give one same row and zero changes", ...);
it("a removed run followed by an added run is one change row with both runs; ids count up from 1 in reading order", ...);
it("a pure insertion and a pure deletion are change rows with one empty side", ...);
it("word marks: 'Led design for payments.' vs 'Led design for checkout and payments.' marks 'checkout and ' added and nothing removed, whitespace kept", ...);
it("words are counted from the word diff: wordsAdded 2, wordsRemoved 0 in the case above", ...);
it("when a pair has a side over 20000 characters, words is null, wordsSkipped is true, and the whole units count as removed and added", ...);
it("when jsdiff's word diff times out (limits.wordMarkTimeoutMs 0 with a large pair) the pair falls back the same way", ...);
it("past maxEditLength 5000 the result is { ok: false, reason: 'too_different' } (use limits.maxEditLength 3 on a small input to test it)", ...);
it("sectionsChanged counts distinct '## ' headings above changes: two changes under one heading count once, a change before any heading counts once", ...);
it("a removed unit that held the '## ' heading itself counts under that heading", ...);
it("rows concatenated back: for every change, left side units joined equal the old text and right side units equal the new text", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/compare-diff.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `diffUnits`**

`diffArrays(a, b, { maxEditLength })` (undefined means too different). Walk the parts: unchanged part is a `same` row, a removed part directly followed by an added part (or the reverse) is one change. Word marking: `diffWordsWithSpace(left.join(""), right.join(""), { timeout })`, undefined means skipped. Section tracking walks rows in order, updating the current heading from `same` and `added` units and from `removed` units when the change has no added side.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/compare-diff.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/compare/diff.ts package.json pnpm-lock.yaml tests
git commit -m "feat(compare): unit diff with word marks and limits"
```

**Acceptance:**
- Spec 5.3 Diff and Limits paragraphs; fallback strings are produced by Task 20 from `wordsSkipped` and `too_different`.
- Spec 8: "diff pairing and both limit fallbacks".

---

### Task 18: Version pairing and the edited-base rule

**Files:**
- Modify: `lib/artifacts/plan.ts` (add `editedBaseOf`, make `versionNotice` call it; behavior of `versionNotice` unchanged)
- Create: `lib/compare/pair.ts`
- Test: `tests/unit/artifact-plan.test.ts`, `tests/unit/compare-pair.test.ts`

**Interfaces:**
- Consumes: `VersionState` fields `version`, `origin`, `editedAt` (exists in `plan.ts`).
- Produces:

```ts
// plan.ts
export function editedBaseOf(versions: Pick<VersionState, "version" | "origin" | "editedAt">[], version: number): number | null; // N when this version is pushed or generated and version N-1 carries editedAt
// pair.ts
export type CompareView = "split" | "inline";
export type CompareQuery = { doc: DocRef | null; a: number | null; b: number | null; view: CompareView | null };
export function parseCompareQuery(params: Record<string, string | string[] | undefined>): CompareQuery;
export function defaultPair(versions: Pick<VersionState, "version" | "origin" | "editedAt">[], baseOf?: typeof editedBaseOf): { a: number; b: number } | null; // null with fewer than 2 versions; baseOf defaults to editedBaseOf and exists so a test can prove the rule is wired
export function resolvePair(versions: ..., q: { a: number | null; b: number | null }): { a: number; b: number } | null; // unknown version numbers resolve to null
export function formatCompareHref(base: string, p: { doc: DocRef; a?: number; b?: number; view?: CompareView }): string; // base is "/jobs/<slug>/compare" or "/companies/<id>/compare"; company links use the bare key, see Contract
```

- [ ] **Step 1: Write the failing tests**

```ts
it("editedBaseOf: v3 pushed on top of an edited v2 returns 2; v3 pasted returns null; v3 generated on edited v2 returns 2; no edit on v2 returns null", ...);
it("versionNotice still returns 'Pushed after you edited version 2.' for the same input", ...);
it("defaultPair: b is the latest and a the one before", ...);
it("defaultPair: when b carries the notice for N, a is N; today editedBaseOf always returns b minus 1, so the test passes a stub baseOf that returns 1 for version 3 and expects { a: 1, b: 3 }", ...);
it("defaultPair with one version returns null", ...);
it("parseCompareQuery: doc 'job:cv' parses, 'company:recon' parses, 'x:cv' and a key with a slash give doc null; a and b non-integers or below 1 give null; view other than split or inline gives null", ...);
it("resolvePair: a version number that does not exist resolves the whole pair to null", ...);
it("formatCompareHref builds /jobs/acme/compare?doc=job:cv&a=3&b=4&view=inline", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/artifact-plan.test.ts tests/unit/compare-pair.test.ts`
Expected: FAIL, `editedBaseOf` is not exported.

- [ ] **Step 3: Implement**

Move the body of `versionNotice` into `editedBaseOf` (it returns `previous.version` instead of a string) and have `versionNotice` format it. Hosted later changes the wording for `generated`; this keeps one place that decides the base, so Hosted edits only the sentence. `defaultPair` uses `editedBaseOf(versions, latest)`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/artifacts/plan.ts lib/compare/pair.ts tests
git commit -m "feat(compare): default version pair from the edited-base rule"
```

**Acceptance:**
- Spec 5.3 Routes paragraph: defaults for `a` and `b`, the notice rule, equal versions handled in Task 19.
- Existing `versionNotice` tests pass unchanged.

---

### Task 19: Comparison loader and header model

**Files:**
- Create: `lib/compare/load.ts`, `lib/compare/header.ts`
- Test: `tests/unit/compare-header.test.ts`, `tests/integration/compare-load.test.ts`

**Interfaces:**
- Consumes: `Scoped.artifact.listVersions(ref, key)` and `getVersion(ref, key, version)`, `diffUnits`, `unitsForDiff`, `defaultPair`, `resolvePair`.
- Produces:

```ts
export type CompareVersion = { version: number; kind: ArtifactKind; title: string; origin: ArtifactOrigin; createdAt: Date; editedAt: Date | null; sentAt: Date | null; bodyMd: string };
export type Comparison = {
  title: string; versions: ArtifactMeta[]; a: CompareVersion; b: CompareVersion;
  mode: "diff" | "same" | "too_different";
  diff: Extract<DiffResult, { ok: true }> | null;
  notice: { baseVersion: number } | null;      // b carries "pushed after you edited version N"
};
export async function loadComparison(s: Scoped, scope: ArtifactScopeRef, key: string, q: { a: number | null; b: number | null }): Promise<Result<Comparison, "not_found">>;
// header.ts
export type VersionWhen = { word: "edited" | "pushed" | "pasted" | "written" | "generated"; at: Date };
export function versionWhen(v: Pick<CompareVersion, "origin" | "createdAt" | "editedAt">): VersionWhen; // editedAt wins, then the origin verb ("manual" is "written")
export type HeaderParts = { a: { version: number } & VersionWhen; b: { version: number } & VersionWhen; summary: DiffSummary | null };
export function summaryLine(summary: DiffSummary): string; // "48 words added, 21 removed, 3 sections changed"
```

- [ ] **Step 1: Write the failing tests**

```ts
it("unknown key returns not_found; an unknown version number returns not_found; another user's scope returns not_found", ...);
it("a and b both null: the default pair is used; a equal to b returns mode 'same' with diff null and no throw", ...);
it("mode too_different carries both bodies and diff null", ...);
it("notice.baseVersion is set when b is pushed on top of an edited version, null otherwise", ...);
it("versionWhen: edited wins over the origin; manual with no edit reads 'written'", ...);
it("summaryLine: '48 words added, 21 removed, 3 sections changed'; singular 'section' and 'word' at 1: '1 word added, 1 removed, 1 section changed'", ...);
it("loadComparison reads bodies for exactly two versions (two getVersion calls) and listVersions for the pickers", ...);
it("a version whose only difference is lines appended at the end shows no change on the old last line", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/compare-header.test.ts tests/integration/compare-load.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Read-only, no transaction and no lock (like `lib/artifacts/read.ts`). The header's dates are rendered by the component through `LocalTime`; this module never formats a date. Plural rule: `1 word`, `n words`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/compare-header.test.ts tests/integration/compare-load.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/compare tests
git commit -m "feat(compare): load two versions and build the header model"
```

**Acceptance:**
- Spec 5.3: header sentence parts, "Pick two different versions" case (`mode: "same"`), size fallback case (`mode: "too_different"`), spec 6 (unknown document or version is a 404 page).

---

### Task 20: Split and inline views with accessible marks

**Files:**
- Create: `components/compare/marks.tsx`, `components/compare/split-view.tsx`, `components/compare/inline-view.tsx`, `lib/compare/collapse.ts`, `components/compare/compare-copy.ts`
- Test: `tests/unit/compare-collapse.test.ts`, `tests/unit/compare-views.test.tsx`

**Interfaces:**
- Consumes: `DiffRow`, `DiffResult` (Task 17), the limits (Task 16).
- Produces:

```ts
// collapse.ts
export type ViewRow = { type: "same"; units: string[] } | { type: "folded"; hidden: string[]; count: number; key: string } | (Extract<DiffRow, { type: "change" }>);
export function collapseRows(rows: DiffRow[], expanded: ReadonlySet<string>): ViewRow[]; // same runs over 6 units fold to 3 units of context each side
// compare-copy.ts
export const COPY = { pickDifferent: "Pick two different versions", tooManyToMark: "Too many changes to mark word by word", tooDifferent: "These versions differ too much to compare line by line. Both are shown in full below.", showUnchanged: (n: number) => `Show ${n} unchanged lines` } as const;
// marks.tsx
export function Del(props: { children: React.ReactNode }): React.ReactElement; // <del><span class="sr-only">removed </span>…</del>
export function Ins(props: { children: React.ReactNode }): React.ReactElement; // <ins><span class="sr-only">added </span>…</ins>
export function SplitView(props: { rows: ViewRow[]; onExpand(key: string): void }): React.ReactElement;
export function InlineView(props: { rows: ViewRow[]; onExpand(key: string): void }): React.ReactElement;
```

- [ ] **Step 1: Write the failing tests**

```ts
it("collapseRows: a same run of 7 units folds to 3 + folded(1 hidden) + 3; a run of 6 stays whole; the first and last runs keep only their inner side's context", ...);
it("the folded row's button reads 'Show 14 unchanged lines' for 14 hidden units and expanding by key returns them", ...);
it("SplitView: removed words are in <del> on the left on bg-status-action-soft, added words in <ins> on the right on bg-status-approved-soft; rows are aligned in one scroll container", ...);
it("InlineView: for each change, removed text comes before added text, same marks", ...);
it("each removed and added run starts with visually hidden 'removed ' or 'added ' text", ...);
it("text nodes only: a document containing '<script>alert(1)</script>' and '<b>x</b>' renders as visible text and creates no script or b element", ...);
it("line breaks are kept: units render in 'whitespace-pre-wrap' blocks, long unbroken strings carry break-words", ...);
it("a change with wordsSkipped shows whole removed and added text and the line 'Too many changes to mark word by word'", ...);
it("every change container carries data-change and an id 'change-<n>' for the navigator", ...);
it("no raw hex or palette classes: only semantic tokens (pnpm check:tokens covers this file)", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/compare-collapse.test.ts tests/unit/compare-views.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

The diff is of markdown source, shown as text: no `Markdown` component here. `<del>` and `<ins>` carry the hidden words because screen readers skip those elements by default (spec 5.3). Struck-through left side: `line-through` on `<del>`; added side: `underline` on `<ins>`. Both background tokens exist (`status-action-soft`, `status-approved-soft`). Split view: a two column CSS grid inside one `overflow-x-auto` container, one grid row per diff row so heights align. Both views render in the page (Task 22 hides one by width), so IDs are suffixed per view: `change-<n>-split`, `change-<n>-inline`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/compare lib/compare tests
git commit -m "feat(compare): split and inline views with removed and added marks"
```

**Acceptance:**
- Spec 5.3 Views (split columns, inline order, collapse rule, `<del>` and `<ins>` with hidden words, text nodes only), 7 (nothing from a document becomes HTML).
- New code is recorded in `docs/design-system.md` in Task 24.

---

### Task 21: Change navigator, version pickers and the phone bar

**Files:**
- Create: `components/compare/change-navigator.tsx`, `components/compare/version-picker.tsx`, `lib/compare/navigator.ts`
- Test: `tests/unit/compare-navigator.test.ts`, `tests/unit/compare-navigator.test.tsx`

**Interfaces:**
- Consumes: `ViewRow` (Task 20), `Sheet` primitives (`components/ui/sheet.tsx`), `useAnnounce` (`components/live-announcer.tsx`), `formatCompareHref` (Task 18).
- Produces:

```ts
// lib/compare/navigator.ts
export function nextIndex(current: number, total: number, dir: "next" | "previous"): number; // stops at the ends, no wrap; current -1 means none yet
export function changeLabel(index: number, total: number): string; // index is 0 based: "Change 3 of 12"; total 0: "No changes"
export function restingLabel(total: number): string; // "12 changes", "1 change", "No changes"
// components/compare/change-navigator.tsx
export function ChangeNavigator(props: { total: number }): React.ReactElement; // client; Previous, Next, keys [ and ]
// components/compare/version-picker.tsx
export function VersionPicker(props: { versions: { version: number; label: string }[]; a: number; b: number; hrefFor(a: number, b: number): string }): React.ReactElement;
```

- [ ] **Step 1: Write the failing tests**

```ts
it("changeLabel(2, 12) is 'Change 3 of 12'; changeLabel(0, 1) is 'Change 1 of 1'; changeLabel(-1, 0) is 'No changes'", ...);
it("before any press the resting label reads '12 changes' ('1 change' for one)", ...);
it("nextIndex stops at the last change and at the first; with total 0 it returns -1", ...);
it("pressing ']' moves to the next visible change, scrolls it into view, focuses it (tabIndex -1) and announces 'Change 2 of 12'; '[' goes back", ...);
it("the keys are ignored while a text field, textarea or select has focus", ...);
it("hidden duplicates (the view that is display:none) are skipped: the navigator walks only elements with offsetParent not null", ...);
it("Previous is disabled on the first change and Next on the last", ...);
it("the version pickers are two selects labelled 'Older version' and 'Newer version' on desktop and open in a sheet from a button 'Versions 3 and 4' below 1024px", ...);
it("choosing a version navigates to the href from hrefFor, keeping doc and view", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/compare-navigator.test.ts tests/unit/compare-navigator.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

The first press of Next focuses change 1 and reads "Change 1 of 12"; the resting label before any press reads "12 changes" ("1 change"). `changeLabel(index, total)` takes a 0-based index and returns `Change ${index + 1} of ${total}`, or "No changes" when `total` is 0. On a phone the navigator is a bar fixed above the bottom navigation (`md:hidden` bottom nav, height read from `components/app-shell.tsx`), `pb-safe`; on desktop it sits in the page header. Focus and `scrollIntoView({ block: "center" })` honour `prefers-reduced-motion` by using `behavior: "auto"`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/compare lib/compare tests
git commit -m "feat(compare): change navigator, version pickers and the phone bar"
```

**Acceptance:**
- Spec 5.3 Views, third and fourth bullets: "Change 3 of 12", Previous and Next, `[` and `]`, sticky phone bar with `pb-safe`, "Versions 3 and 4" sheet, 8 (keyboard-only compare navigation).

---

### Task 22: Compare routes for job and company documents

**Files:**
- Create: `app/(app)/jobs/[slug]/compare/page.tsx`, `app/(app)/companies/[id]/compare/page.tsx`, `components/compare/compare-page.tsx`, `components/compare/compare-header.tsx`, `lib/compare/links.ts`
- Test: `tests/unit/compare-links.test.ts`, `tests/integration/compare-page-model.test.ts`

**Interfaces:**
- Consumes: `loadComparison`, `parseCompareQuery`, `defaultPair`, `getJobView`, `Scoped.company.getById`, `Scoped.opportunity.listSummaries`, `requireUser`, `notFound()`.
- Produces:

```ts
// links.ts
export function documentHrefForJob(slug: string, ref: DocRef, tab: ArtifactTab): string;       // /jobs/<slug>?tab=<tab>&doc=<ref>
export function documentHrefForCompany(s: Scoped, companyId: string, key: string): Promise<string>; // until Milestone 24: the newest job of that company, /jobs/<slug>?tab=research&doc=company:<key>; Milestone 24 returns /companies/<id>?doc=<key>
export function CompareScreen(props: { comparison: Comparison; view: CompareView; basePath: string; doc: DocRef; backHref: string }): React.ReactElement;
```

- [ ] **Step 1: Write the failing tests**

```ts
it("jobs route: another user's slug is 404; an unknown doc is 404 with a link back to the document list; a company doc ref resolves through the job's company", ...);
it("companies route: another user's company id is 404; doc is the bare key and the scope is company", ...);
it("with no a and b the default pair applies and the URL is not rewritten; with a equal to b the page says 'Pick two different versions' and still shows the pickers", ...);
it("view defaults to split above 1024px and inline below: both views are in the DOM, the other is display:none (lg:hidden and hidden lg:block classes)", ...);
it("the page header reads 'Version 3 (edited 2 Oct) and version 4 (pushed 5 Oct) · 48 words added, 21 removed, 3 sections changed' with dates through LocalTime", ...);
it("a 404 page links back to the document through documentHrefForJob / documentHrefForCompany", ...);
it("too_different shows both versions in full one after the other with the sentence from COPY.tooDifferent", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/compare-links.test.ts tests/integration/compare-page-model.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Both pages are server components: `requireUser()`, `scopedFor(user.id)`, scoped lookups, `notFound()` for unknown. The job page maps `doc=job:<key>` to `{ opportunityId }` and `doc=company:<key>` to `{ companyId: view.company.id }`; the company page accepts `doc=<key>` only. `maxDuration` is not needed (read-only, small). `loadComparison` runs once; `CompareScreen` renders header, navigator, pickers and both views.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration && pnpm typecheck && pnpm build`
Expected: PASS, and both routes appear in the build output.

- [ ] **Step 5: Commit**

```bash
git add app components/compare lib/compare tests
git commit -m "feat(compare): compare routes for job and company documents"
```

**Acceptance:**
- Spec 5.3 Routes paragraph (both URL shapes, defaults), 6 (404 page linking to the document), 7 (`requireUser()` and scoped lookups; compare renders text nodes only).

---

### Task 23: Ways in: version list, tab links and the notice

**Files:**
- Modify: `components/job/version-list.tsx` (a "Compare" link beside each entry, and the notice becomes a "See what changed" link), `components/job/tab-documents.tsx`, `components/job/tab-research.tsx`, `components/job/tab-prep.tsx` (a "Compare versions" link in each document's actions row when it has two or more versions)
- Test: `tests/unit/version-list.test.tsx`, `tests/unit/compare-entry-links.test.tsx`

**Interfaces:**
- Consumes: `formatCompareHref` (Task 18), `getDocument(...).versions`, `editedBaseOf` (Task 18).
- Produces: `VersionList` props gain `docRef: DocRef` and `compareBasePath: string`; `CompareVersionsLink(props: { basePath: string; docRef: DocRef; versions: number; title: string })` in `components/compare/compare-links.tsx`.

- [ ] **Step 1: Write the failing tests**

```ts
it("each version entry has a 'Compare' link to a=<previous version> b=<this version> (the first version has none)", ...);
it("the 'Pushed after you edited version 2.' notice is a link 'See what changed' to a=2 b=<this version>", ...);
it("'Compare versions' appears on a document with two or more versions on the Research, Documents and Prep tabs and not with one", ...);
it("the link for a company-scoped document on a job's Research tab uses doc=company:<key>", ...);
it("link names include the document title for screen readers: 'Compare versions of Northwind CV'", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/version-list.test.tsx tests/unit/compare-entry-links.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`VersionList` is used only on the Documents tab today, so the Research and Prep tabs get the single "Compare versions" link in their `DocumentView` `actions` (they have no version list). Keep the existing `Version n` links and the `?tab=documents&doc=...&v=` shape unchanged.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components tests
git commit -m "feat(compare): links into compare from every document tab"
```

**Acceptance:**
- Spec 5.3 last sentence of the Routes paragraph: "Compare" beside each entry, "Compare versions" on documents with two or more versions on Research, Documents and Prep, and the notice as a "See what changed" link. The company page's own link is added in Milestone 24.

---

### Task 24: End to end, docs and ship

**Files:**
- Create: `tests/e2e/compare.spec.ts`, `tests/fixtures/compare/cover-letter-v1.md`, `cover-letter-v2.md` (fictional, Northwind Traders, three paragraphs each, one sentence rewritten and one added)
- Modify: `playwright.config.ts` (extend the `apply-*` projects' `testMatch` with `compare`; create the projects here if Milestone 20 has not), `README.md` (a short "Compare versions" section), `docs/design-system.md` ("New application code": the compare rows, the change navigator and the version picker, with the reason: the registry has no diff or compare view)
- Test: the spec above

**Interfaces:**
- Consumes: `login`, `uniqueName`, `addJobAndOpen`, `runCli` (`tests/e2e/cli.ts`) or the paste dialog to create two versions, `scanForViolations`, `scanOpenOverlay`.

- [ ] **Step 1: Write the failing e2e specs**

```ts
test("two versions of a cover letter: split view shows word marks on desktop", ...);   // del and ins counts, 'removed ' and 'added ' hidden text exists
test("phone viewport: only the inline view is visible, version pickers open from 'Versions 1 and 2'", ...);
test("keyboard: ']' walks to every change in order and '[' walks back; focus lands on each change", ...);
test("equal versions show 'Pick two different versions'", ...);
test("axe in light and dark on split and inline views", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test:e2e --project=apply-chromium -g "cover letter"`
Expected: FAIL before the routes are linked in a clean checkout of the task.

- [ ] **Step 3: Make the specs pass and update the docs**

No new code beyond selectors. Chromium and WebKit desktop at 1280 px, phone at 390 px.

- [ ] **Step 4: Run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`
Expected: PASS

- [ ] **Step 5: Preview check**

Push the branch, open the pull request, deploy the preview and open a two-version cover letter in Chrome and Safari at desktop and phone width.

```bash
git add tests playwright.config.ts README.md docs
git commit -m "test(compare): compare end to end, docs"
```

**Acceptance:**
- Spec 9 Done-when sentence for Milestone 21.
- Spec 8 accessibility: axe on both compare views, keyboard-only navigation, the hidden removed and added words present.
