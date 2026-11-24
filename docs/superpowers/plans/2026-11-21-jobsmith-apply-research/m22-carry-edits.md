# Milestone 22: Carry edits forward

> Done when: "After push, edit, push of a fictional CV, carrying the edits produces a version with both changes and no question, and when both sides changed one bullet, one conflict appears and "Keep my edit" saves it" (spec section 9).

**Branch:** `feat/m22-carry-edits`, cut from `main` after Milestone 21 has merged (it extends the compare page and `loadComparison`).

**Before starting:**

```bash
test -f lib/compare/diff.ts && test -f lib/compare/load.ts       # Milestone 21
grep -n "sourceBodyMd" lib/db/schema/artifact.ts                 # Milestone 20 Task 1: the merge base column
grep -n "loaded.sourceBodyMd" lib/artifacts/edit.ts              # Milestone 20 Task 1: base capture
```

This milestone touches only Core's artifact code and the compare code. It needs nothing from Prep, Hosted or Feed, only Milestone 20 Task 1 (the migration and the capture rule, which themselves need nothing from those cycles) and Milestone 21. If Milestone 20's later tasks have not merged, the migration and Task 1 still can: cherry-pick Task 1 alone. Carrying edits onto a Hosted `generated` version is tested with `applyUpserts` and `origin: "generated"`, which already exists; Hosted itself is not needed.

New dependency: `node-diff3` (MIT). Pin at install time and record the version in the task report.

---

### Task 25: Three-way merge

**Files:**
- Create: `lib/compare/merge.ts`
- Modify: `package.json` (`node-diff3`)
- Test: `tests/unit/compare-merge.test.ts`

**Interfaces:**
- Consumes: `unitsForDiff` and `bodyFromUnits` (Milestone 21 Task 16).
- Produces:

```ts
// merge.ts
export type MergeChunk =
  | { type: "ok"; units: string[] }
  | { type: "conflict"; id: number; base: string[]; mine: string[]; theirs: string[] };
export type ThreeWayResult = { chunks: MergeChunk[]; cleanEdits: number; conflicts: number };
export function threeWayMerge(base: string[], mine: string[], theirs: string[]): ThreeWayResult; // diff3Merge(mine, base, theirs, { excludeFalseConflicts: true }); ids count up from 1
```

- [ ] **Step 1: Write the failing tests**

```ts
it("clean: base has bullets 1 to 3, mine edits bullet 1, theirs edits bullet 3: one ok chunk set containing both edits, conflicts 0, cleanEdits 1", ...);
it("conflict: both change bullet 2 differently: one conflict chunk with base, mine and theirs units, conflicts 1", ...);
it("false conflict: both change bullet 2 to the same text: no conflict, the shared text is kept", ...);
it("both sides delete the same line: no conflict, the line is gone", ...);
it("one side deletes a line the other edited: a conflict", ...);
it("adjacent edits (mine edits line 2, theirs edits line 3): no conflict", ...);
it("an edit beside a generator insert (theirs inserts a new bullet after line 2, mine edits line 2): applies both, no conflict", ...);
it("the cleanEdits count for 5 of mine's changed regions with one in conflict is 4, and conflicts is 1", ...);
it("no spurious conflict from a missing final newline: theirs appends a line after mine's last line (bodies have no trailing newline) merges clean when units come from unitsForDiff", ...);
it("identical mine and base returns theirs untouched with cleanEdits 0", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/compare-merge.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`diff3Merge(mine, base, theirs, { excludeFalseConflicts: true })` returns `{ ok: string[] }` and `{ conflict: { a, aIndex, o, oIndex, b, bIndex } }` entries (`a` is mine, `o` base, `b` theirs). `cleanEdits`: run `diffIndices(base, mine)` from the same library to list mine's changed regions, and count the regions whose base range does not intersect (boundaries included) any conflict's `[oIndex, oIndex + o.length]`. The wire type of the library changes between majors, so wrap its output in `MergeChunk` in this file only.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/compare-merge.test.ts tests/unit/compare-units.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/compare package.json pnpm-lock.yaml tests
git commit -m "feat(compare): three-way merge over diff units"
```

**Acceptance:**
- Spec 5.4 With a base paragraph (three-way over the same units, false conflicts excluded), 8 (the six three-way cases: clean, conflict, false conflict, both sides deleting one line, adjacent edits, an edit beside a generator insert).
- Spec 11 item 8: units are lines with long paragraph lines split into sentences, the same `splitUnits` as Compare.

---

### Task 26: Two-way fallback, choices, and the carry model

**Files:**
- Create: `lib/compare/two-way.ts`, `lib/compare/choices.ts`, `lib/compare/carry-model.ts`
- Modify: `lib/compare/load.ts` (`CompareVersion` gains `sourceBodyMd: string | null`; `loadComparison` fills it from `getVersion`)
- Test: `tests/unit/compare-two-way.test.ts`, `tests/unit/compare-choices.test.ts`, `tests/unit/compare-carry-model.test.ts`

**Interfaces:**
- Consumes: `threeWayMerge`, `diffUnits`, `unitsForDiff`, `bodyFromUnits`.
- Produces:

```ts
// two-way.ts
export type TwoWayChunk = { type: "same"; units: string[] } | { type: "choice"; id: number; mine: string[]; theirs: string[] };
export function twoWayMerge(mine: string[], theirs: string[]): { chunks: TwoWayChunk[]; choices: number }; // every changed pair is a choice; ids from 1
// choices.ts
export type Resolution = "mine" | "theirs" | { write: string };
export type Choices = Record<number, Resolution>;
export function applyChoices(chunks: (MergeChunk | TwoWayChunk)[], choices: Choices): Result<{ body: string }, "unresolved">; // three-way conflicts need a choice; two-way choices default to "theirs"
export function firstUnresolved(chunks: (MergeChunk | TwoWayChunk)[], choices: Choices): number | null;
// carry-model.ts
export type CarryModel = { mode: "three_way" | "two_way"; chunks: (MergeChunk | TwoWayChunk)[]; cleanEdits: number; open: number; summary: string };
export function buildCarryModel(a: { bodyMd: string; sourceBodyMd: string | null }, b: { bodyMd: string }): CarryModel;
export function canCarry(versions: Pick<ArtifactMeta, "version" | "origin" | "editedAt">[], a: number, b: number): boolean; // a has editedAt, b is newer, b's origin is pushed, pasted or generated, b is the latest
```

- [ ] **Step 1: Write the failing tests**

```ts
it("twoWayMerge: every changed pair is a choice; unchanged runs are same chunks; ids count from 1", ...);
it("applyChoices three-way: 'mine' keeps the mine units, 'theirs' keeps theirs, { write } uses the text, ok chunks stay", ...);
it("a { write } text without a trailing newline gets one when another chunk follows, and not at the very end", ...);
it("applyChoices returns 'unresolved' while a three-way conflict has no choice; two-way choices with no entry default to theirs", ...);
it("firstUnresolved returns the lowest open conflict id, null when none", ...);
it.each([
  [4, 1, "4 of your edits apply cleanly. 1 needs a choice."],
  [1, 0, "1 of your edits applies cleanly. Nothing needs a choice."],
  [2, 0, "2 of your edits apply cleanly. Nothing needs a choice."],
  [3, 2, "3 of your edits apply cleanly. 2 need a choice."],
  [0, 1, "0 of your edits apply cleanly. 1 needs a choice."],
])("summary for %i clean and %i open", ...);
it("buildCarryModel uses three_way when sourceBodyMd is not null and two_way when it is null", ...);
it("two-way summary: 'Version 3 has no saved original, so the app cannot tell which side changed what. 3 changes are yours to pick, and each starts on the new text.'", ...);
it("canCarry: false when a has no editedAt, false when b is not the latest, false for b origin manual, true for pushed, pasted and generated", ...);
it("the merged body of an all-'theirs' resolution equals b's body exactly", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/compare-two-way.test.ts tests/unit/compare-choices.test.ts tests/unit/compare-carry-model.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Summary wording is fixed here as the plan's own copy where the spec gives only the first form: "N of your edits apply cleanly." (N = 1 reads "1 of your edits applies cleanly.") then "M needs a choice." for M = 1, "M need a choice." for M above 1, or "Nothing needs a choice." for 0. Two-way wording: the spec fixes the idea ("one line explains that the app cannot tell which side changed what"); the sentence above is this plan's wording and goes to the owner for review (README, "Needs the owner's answer").

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/compare tests
git commit -m "feat(compare): two-way fallback, choices and the carry model"
```

**Acceptance:**
- Spec 5.4: panel summary line, three choices as data (`mine`, `theirs`, `write`), the two-way fallback with every changed pair a choice defaulting to the new text, the offer rule, and the preview body.
- Spec 8: "the two-way fallback" unit tests.

---

### Task 27: `saveEditInScope`, the shared core of an edit

**Files:**
- Modify: `lib/artifacts/edit.ts` (extract; `saveArtifactEdit` becomes a wrapper)
- Test: `tests/integration/artifact-edit.test.ts` (all existing cases stay green, plus two new)

**Interfaces:**
- Consumes: Milestone 20 Task 1's base capture inside `saveArtifactEdit`.
- Produces:

```ts
export type EditOutcome = { status: "edited" | "versioned" | "unchanged"; version: number; title: string };
export type EditError = "artifact_not_found" | "invalid";
// The caller already holds every lock it needs (a job edit: the opportunity row, and the company row for a company document; a company-only edit: the company row) and passes its transaction handle.
export async function saveEditInScope(tx: Scoped, scopeRef: ArtifactScopeRef, key: string, bodyMd: string, baseVersion: number, now: Date): Promise<Result<EditOutcome, EditError>>;
// saveArtifactEdit keeps its exact signature and behavior: lock, then saveEditInScope.
```

- [ ] **Step 1: Write the failing tests**

```ts
it("saveEditInScope called inside a caller's transaction edits in place and sets the base, same as saveArtifactEdit", ...);
it("saveEditInScope with a { companyId } scope edits a company document without any opportunity", ...);
// every existing saveArtifactEdit test passes unchanged
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/artifact-edit.test.ts`
Expected: FAIL, `saveEditInScope` is not exported.

- [ ] **Step 3: Extract**

Move everything after the locks in `saveArtifactEdit` (versions, normalization, size check, `planUpsert`, base capture, update or insert) into `saveEditInScope(tx, scopeRef, key, bodyMd, baseVersion, now)`, with `scopeRef` taking the place of the `ref.scope` branch. `saveArtifactEdit` keeps locking the opportunity (and the company for a company-scoped ref) and calls it. A refactor with no behavior change: the diff of `edit.ts` must show only moved code.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/artifacts/edit.ts tests
git commit -m "refactor(artifacts): extract saveEditInScope from saveArtifactEdit"
```

**Acceptance:**
- Spec 5.4 Saving paragraph ("writes the merged body through `saveArtifactEdit` with `baseVersion` set to `b`, in the same transaction") and spec 5.6 item 5 (a company-only edit later reuses this core and locks only the company row).
- No change in `document-actions` behavior; `tests/integration/document-actions.test.ts` passes.

---

### Task 28: `carryEditsForward`

**Files:**
- Create: `lib/artifacts/carry.ts`, `lib/artifacts/carry-log.ts`
- Test: `tests/integration/carry-forward.test.ts`

**Interfaces:**
- Consumes: `saveEditInScope` (Task 27), `buildCarryModel`, `applyChoices`, `canCarry`, `tx.opportunity.lockById`, `tx.company.lockById`, `tx.artifact.getVersion`, `listVersions`.
- Produces:

```ts
export type CarryInput = { fromVersion: number; ontoVersion: number; fromHash: string; ontoHash: string; choices: Choices };
export type CarryError = "not_found" | "artifact_not_found" | "not_offered" | "stale" | "unresolved" | "invalid";
export type CarryOutcome = { status: "edited" | "versioned" | "unchanged"; version: number; mode: "three_way" | "two_way" };
export async function carryEditsForward(s: Scoped, scopeRef: ArtifactScopeRef, key: string, input: CarryInput, now?: Date): Promise<Result<CarryOutcome, CarryError>>;
export function logCarry(requestId: string, info: { fromId: string; ontoId: string; mode: CarryOutcome["mode"]; chunks: number; conflicts: number; status: string }): void; // "[carry]" line, no text, names or titles
```

- [ ] **Step 1: Write the failing tests**

```ts
it("after push v1, edit bullet A, push v2 with a changed bullet C: carrying with no choices saves one in-place edit of v2 containing both changes (result edited, version 2)", ...);
it("the merged v2 keeps its pushed text as the base: v2.sourceBodyMd equals the pushed body of v2 (first edit of v2 sets it)", ...);
it("a second push v3 after that carries the same edits forward again, base v2's pushed text", ...);
it("both sides changed one bullet: carrying with no choice returns 'unresolved' and writes nothing; with choices { 1: 'mine' } it saves my text", ...);
it("choice 'theirs' for the only conflict saves a body equal to v2's body: result 'unchanged', no new version", ...);
it("choice { write } saves the written text", ...);
it("returns 'stale' when a's hash moved (a edited again), when v2's hash moved, and when a newer v3 now exists", ...);
it("when v2 was marked sent in the meantime the save forks v3: result 'versioned', version 3, and v3.sourceBodyMd equals v2's body", ...);
it("with no base on a (edited before Milestone 20): two_way mode, every pair defaults to the new text, choices override", ...);
it("works after a Hosted regenerate: v2 inserted through applyUpserts origin 'generated' carries the same way", ...);
it("works for a company-scoped document with a { companyId } scope and no opportunity lock", ...);
it("'not_offered' when canCarry is false (a has no edit, or ontoVersion is not the latest)", ...);
it("a document in another user's scope returns artifact_not_found", ...);
it("the [carry] log line holds ids, mode and counts and none of the document text (spy on console.info)", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/carry-forward.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

One `s.transaction`: lock the company row for a company scope (`tx.company.lockById`) or the opportunity row for a job scope (find it from `scopeRef.opportunityId`); load both versions with bodies; compare hashes with the input (`stale`); check `canCarry` over `listVersions`; `buildCarryModel`; `applyChoices` (`unresolved` for open three-way conflicts); `saveEditInScope(tx, scopeRef, key, body, input.ontoVersion, now)` with `now` shared. The lock order is the one every other writer uses: opportunity, then company.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/artifacts tests
git commit -m "feat(artifacts): carry edits forward onto a newer version"
```

**Acceptance:**
- Spec 5.4 Saving paragraph (signature, `stale`, `unresolved`, base set by the first edit, fork when `b` was sent), 6 (carry forward errors), 8 (carry forward's `stale` and sent paths, after both a push and a Hosted regenerate), 6 Logs (`[carry]` line).
- A `stale` or `unresolved` call writes nothing: a spy on `tx.artifact.update` and `insert` stays at zero calls.

---

### Task 29: Carry panel and its actions

**Files:**
- Create: `components/compare/carry-panel.tsx`, `components/compare/conflict-card.tsx`, `app/(app)/jobs/[slug]/carry-actions.ts`, `app/(app)/companies/[id]/carry-actions.ts`
- Test: `tests/unit/carry-panel.test.tsx`, `tests/integration/carry-actions.test.ts`

**Interfaces:**
- Consumes: `CarryModel` (Task 26), `applyChoices`, `firstUnresolved`, `carryEditsForward` (Task 28), `useAnnounce`, `toast`, `documentHrefForJob`, `documentHrefForCompany` (Milestone 21 Task 22).
- Produces:

```ts
export function CarryPanel(props: { model: CarryModel; fromVersion: number; ontoVersion: number; fromHash: string; ontoHash: string; submit(input: CarryInput): Promise<CarryActionResult> }): React.ReactElement;
export type CarryActionResult = { ok: true; status: CarryOutcome["status"]; version: number; href: string } | { ok: false; code: CarryError; message: string };
export async function carryJobEditsAction(slug: string, docKey: string, scope: "opportunity" | "company", input: CarryInput): Promise<CarryActionResult>;
export async function carryCompanyEditsAction(companyId: string, docKey: string, input: CarryInput): Promise<CarryActionResult>;
```

- [ ] **Step 1: Write the failing tests**

```ts
it("the summary line reads '4 of your edits apply cleanly. 1 needs a choice.' for the fixture", ...);
it("each conflict card shows the original, your edit and the new text as text, with three radios 'Keep my edit', 'Take the new text', 'Write it myself'; choosing the third reveals a text area seeded with my edit", ...);
it("a preview of the merged document follows the choices and updates when a choice changes; open conflicts are marked in the preview", ...);
it("'Save to version 4' with an open conflict does not call submit and moves focus to the first open conflict's first radio", ...);
it("in two-way mode every pair is a choice that starts on 'Take the new text' and the note about no saved original shows once", ...);
it("a 'stale' result shows 'Version 4 changed since you opened this' and reloads the page (router.refresh) with a fresh merge", ...);
it("a 'versioned' success toasts 'Version 4 was sent, so your edits were saved as version 5.' and an 'edited' success toasts 'Saved your edits to version 4.'; both navigate to the returned href", ...);
it("nothing is written until Save: changing choices never calls submit", ...);
it("text nodes only: a document containing HTML renders as text", ...);
// integration: the job action requires a session, rejects another user's slug with not_found, passes scope company through, revalidates the job page and every job at that company for a company-scoped doc
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/carry-panel.test.tsx tests/integration/carry-actions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Radios from the installed `radio-group`; the preview is a read-only `whitespace-pre-wrap` block of `applyChoices` output (treating an open conflict as "mine" for display only, marked "Needs a choice"). The server action looks the job up by slug through `scopedFor(user.id)`, builds `scopeRef`, calls `carryEditsForward`, revalidates like `revalidateDocuments` in `app/(app)/jobs/[slug]/document-actions.ts`, and returns the Documents tab href (`?tab=documents&doc=job:<key>`), or for a company document the href from `documentHrefForCompany`. Forms and focus use `lib/forms/submit.ts` and `correctFocusOnceLost` as the other dialogs do.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/compare app tests
git commit -m "feat(compare): carry panel with conflict choices and a merged preview"
```

**Acceptance:**
- Spec 5.4 (summary line, the three choices, the preview, nothing written until "Save to version 4", the toast), 6 (the three carry messages), 8 (keyboard-only conflict choices).

---

### Task 30: The offer on the compare page and the Documents tab

**Files:**
- Modify: `components/compare/compare-page.tsx` (render `CarryPanel` under the header when `canCarry` holds), `app/(app)/jobs/[slug]/compare/page.tsx`, `app/(app)/companies/[id]/compare/page.tsx` (build the model and pass the hashes), `components/job/tab-documents.tsx` (banner above a latest version that carries either notice), `lib/compare/links.ts` (a `carryHref` helper to the compare page anchored at `#carry`)
- Test: `tests/unit/carry-offer.test.tsx`, `tests/integration/carry-offer-model.test.ts`

**Interfaces:**
- Consumes: `canCarry`, `buildCarryModel`, `editedBaseOf` (Milestone 21 Task 18), `CompareVersion.sourceBodyMd`.
- Produces: `CarryBanner(props: { latestVersion: number; baseVersion: number; origin: "pushed" | "generated"; href: string }): React.ReactElement`; `carryHref(base: string, ref: DocRef, a: number, b: number): string`.

- [ ] **Step 1: Write the failing tests**

```ts
it("the banner reads 'Version 4 was pushed after you edited version 3. Carry your edits into version 4.' with a link to the compare page anchored at #carry", ...);
it("for a generated latest version the first sentence reads 'Version 4 was generated after you edited version 3.'", ...);
it("the banner shows only above the latest version, only when editedBaseOf is not null, and not for a viewed older version", ...);
it("the compare page shows the panel only when a has edited_at, b is newer and the latest, and b's origin is pushed, pasted or generated", ...);
it("a pasted b shows the panel on the compare page and no banner on the Documents tab (the banner is for the two notices)", ...);
it("the panel is absent for company documents whose a has no edit", ...);
it("the hashes passed to the panel are a's and b's contentHash at render time", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/carry-offer.test.tsx tests/integration/carry-offer-model.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

The banner sits in `tab-documents.tsx` between the "Open the latest version" row and `DocumentView`, built from the `Versions` already loaded (`doc.versions`, no bodies). It uses the same shell as `components/job/review-notice.tsx`. The compare pages compute the model on the server from the two loaded versions (`buildCarryModel`) and pass only serializable data to the client panel. Hosted's later wording change touches only the sentence in `CarryBanner`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components app lib tests
git commit -m "feat(compare): offer to carry edits on the Documents tab and compare page"
```

**Acceptance:**
- Spec 5.4 second paragraph (when the offer appears, the exact Documents tab sentence), 5.3 (the notice becomes a link; Milestone 21 already linked it).

---

### Task 31: End to end, docs and ship

The two-way panel has no e2e: once Milestone 20 has merged, no UI path creates an edited version without a saved original, so Tasks 26, 28 and 29 cover it with unit and integration tests.

**Files:**
- Create: `tests/e2e/carry.spec.ts`, `tests/fixtures/compare/cv-v1.md`, `cv-v1-pushed-edit.md`, `cv-v2.md`, `cv-v2-same-bullet.md` (fictional CV, 4 bullets under one role, Northwind Traders)
- Modify: `playwright.config.ts` (add `carry` to the `apply-*` `testMatch` regex), `README.md` (a short "Carry your edits forward" section), `docs/design-system.md` ("New application code": the carry panel and conflict card, reason: the registry has no merge pattern)
- Test: the spec above

**Interfaces:**
- Consumes: `runCli` (push the fixtures), `login`, `uniqueName`, `addJobAndOpen`, the editor on the Documents tab, `scanForViolations`, `scanOpenOverlay`.

- [ ] **Step 1: Write the failing e2e specs**

```ts
test("push, edit a bullet, push a change to another bullet, carry edits forward with no question", ...);   // one version with both changes; toast names the version
test("both sides changed one bullet: one conflict, 'Keep my edit' saves my text", ...);
test("the conflict path by keyboard only: Tab to the conflict radios, choose, Save", ...);
test("axe in light and dark on the panel with a conflict open", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test:e2e --project=apply-chromium -g "carry"`
Expected: FAIL before the panel is wired in a clean checkout of the task.

- [ ] **Step 3: Make the specs pass and update the docs**

Chromium and WebKit desktop and the phone project (the panel stacks in one column at 390 px).

- [ ] **Step 4: Run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`
Expected: PASS

- [ ] **Step 5: Preview check**

Push the branch, open the pull request, deploy the preview and run the done-when sequence in Chrome and Safari.

```bash
git add tests playwright.config.ts README.md docs
git commit -m "test(carry): carry edits forward end to end, docs"
```

**Acceptance:**
- Spec 9 Done-when sentence for Milestone 22, in Chromium and WebKit.
- Spec 8 accessibility: axe on the panel, keyboard-only conflict choices.
