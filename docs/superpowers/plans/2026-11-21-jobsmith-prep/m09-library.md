# Milestone 9: Library

> Done when: "An answer saved from one job drills from the Library, and `jobsmith pull` lists each question's mark" (spec section 9).

Branch: `feat/m09-library`, cut from `main` after Milestone 8 has merged. Tasks 38 to 46.

**Before starting.** Milestones 6 to 8 must be merged:

```bash
test -f lib/db/scoped/library-item.ts && test -f lib/prep/marks.ts && test -f lib/prep/drill.ts \
  && test -f components/player/drill-player.tsx && test -f components/player/quick-fire-card.tsx \
  && test -f lib/prep/player-data.ts && grep -q "Library" "app/(app)/library/page.tsx" && echo m6-8-ok
```

Without Milestone 7 (not recommended, the order is fixed) the Library drill would speak through browser voices only: leave out the on-demand audio step of Task 44. The placeholder `app/(app)/library/page.tsx` is replaced in Task 41. Read `node_modules/next/dist/docs/` for dynamic routes and `searchParams` before Task 41.

---

### Task 38: Library items

**Files:**
- Create: `lib/library/items.ts`, `lib/library/copy.ts`
- Test: `tests/unit/library-items.test.ts`, `tests/integration/library-items.test.ts`

**Interfaces:**
- Consumes: `s.libraryItem` (Task 2), `normalizeList`, `LIST_MAX_ENTRIES` (20), `LIST_ENTRY_MAX` (80) from `lib/preferences/schema.ts`, `LIBRARY_KINDS` (Task 1), `Result`.
- Produces:

```ts
export const LIBRARY_TITLE_MAX = 200;
export const LIBRARY_BODY_MAX = 50_000;                        // plan constant, the spec gives no limit
export type LibraryKind = "answer" | "story" | "intro" | "fact";
export const libraryItemInputSchema: z.ZodType<{ kind: LibraryKind; title: string; bodyMd: string; tags: string[] }>;   // explicit messages
export type LibraryItemView = { id: string; kind: LibraryKind; title: string; bodyMd: string; tags: string[]; questionKey: string | null; sourceOpportunityId: string | null; sourceArtifactId: string | null; archivedAt: Date | null; updatedAt: Date };
export async function createLibraryItem(s: Scoped, input: LibraryItemInput): Promise<Result<LibraryItemView, "invalid">>;
export async function updateLibraryItem(s: Scoped, id: string, input: LibraryItemInput): Promise<Result<LibraryItemView, "not_found" | "invalid">>;
export async function archiveLibraryItem(s: Scoped, id: string, archived: boolean, now?: Date): Promise<Result<LibraryItemView, "not_found">>;
export async function getLibraryItem(s: Scoped, id: string): Promise<LibraryItemView | null>;
export type LibraryQuery = { q?: string; kind?: LibraryKind; tag?: string; includeArchived?: boolean };
export type LibraryListRow = LibraryItemView & { firstLine: string };
export async function listLibrary(s: Scoped, query: LibraryQuery): Promise<LibraryListRow[]>;     // newest updated first
export function firstLine(bodyMd: string): string;           // first non-empty line without markdown markers, at most 140 characters
```

- [ ] **Step 1: Write the failing tests**

```ts
// unit
it("the schema trims the title and rejects an empty one with 'Give the item a title.'");
it("tags follow the list rules: trimmed, deduplicated without regard to case, at most 20, each at most 80 characters, with explicit messages");
it("a body over the limit is rejected with an explicit message");
it("kind must be one of answer, story, intro, fact");
it("firstLine strips markers and cuts at 140 characters");
// integration
it("createLibraryItem stores a story with tags and no question key");
it("updateLibraryItem changes title, body and tags and keeps the source fields");
it("archive sets archived_at and unarchive clears it");
it("listLibrary hides archived items unless asked, searches title, body and tags case-insensitively, and filters by kind and by tag");
it("listLibrary returns newest updated first");
it("another user's item is not_found for update and archive and absent from the list");
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/library-items.test.ts tests/integration/library-items.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `lib/library/items.ts` and `copy.ts`**

Search and filters run in memory over `s.libraryItem.list({ includeArchived })`, which is fine at personal scale. `lib/library/copy.ts` holds proposed copy (`empty` "Your library is empty. Save an answer from a question, or add a story, an intro or a fact.", "Used in N jobs" with the singular "Used in 1 job", "Saved to library.", "Already in your library.", archive and edit labels) and nothing with an exclamation mark.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/library-items.test.ts tests/integration/library-items.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/library tests
git commit -m "feat(library): items with tags, search, filters and archive"
```

**Acceptance:** (1) Kinds are `answer`, `story`, `intro`, `fact` and tags follow the preferences list rules (spec 4). (2) Search by text and filter by kind and tag (spec 5.8). (3) Archive is a flag, not a delete (spec 4, 5.8).

---

### Task 39: Save to library

**Files:**
- Create: `lib/library/promote.ts`
- Test: `tests/integration/library-promote.test.ts`

**Interfaces:**
- Consumes: `createLibraryItem` (Task 38), `s.prepQuestion.listForJob`, `s.libraryItem.findBySource`.
- Produces:

```ts
export async function saveQuestionToLibrary(s: Scoped, input: { opportunityId: string; questionKey: string }): Promise<Result<{ id: string; created: boolean }, "not_found" | "invalid">>;
```

Rules (spec 5.8): the item is kind `answer`, title the question, `question_key` the row's key, `source_opportunity_id` the job and `source_artifact_id` the row's artifact, tags empty. The body is the question's `Say` text, then, when the question has a `Long version` block, a blank line and `**Long version:** <text>`. A question with neither block is `invalid` with "This question has no answer to save." Saving the same question from the same job twice returns the existing item with `created: false` (plan decision, README owner answer for Milestone 9); the same question from a second job creates a second item.

- [ ] **Step 1: Write the failing tests**

```ts
it("creates an answer item from Say and Long version with the question as title and the job as source");
it("a question with only a Say block makes a body of just that text");
it("a question with neither block is invalid");
it("saving the same question from the same job returns the existing item and created false");
it("the same question key from a second job creates a second item");
it("another user's job or an unknown question key is not_found");
it("the saved item's question_key equals the row's and the source artifact id is the artifact that holds it");
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/library-promote.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `saveQuestionToLibrary`**

Take the first row with that key by position. Read the blocks `Say` and `Long version` by label (case-insensitive) from `blocks`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/library-promote.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/library/promote.ts tests/integration/library-promote.test.ts
git commit -m "feat(library): save a question's answer to the library"
```

**Acceptance:** (1) "Save to library" creates an `answer` item from Say and Long version, the question as title, the job as source (spec 5.8). (2) No duplicate from one job (README owner answer).

---

### Task 40: Usage and mark history

**Files:**
- Create: `lib/library/usage.ts`
- Modify: `lib/db/scoped/prep-question.ts` (`countJobsByQuestionKey(keys: string[]): Promise<Map<string, number>>`, distinct `opportunity_id` per key)
- Test: `tests/integration/library-usage.test.ts`

**Interfaces:**
- Consumes: `s.prepQuestion.countJobsByQuestionKey`, `s.prepMark.listForQuestionKey`, `s.opportunity.getById`, `s.company.getById`.
- Produces:

```ts
export async function usedInJobs(s: Scoped, questionKeys: string[]): Promise<Map<string, number>>;     // "Used in N jobs": distinct jobs with a question row of that key
export type MarkHistory = { jobs: { opportunityId: string; slug: string; roleTitle: string; companyName: string; level: MarkLevel; markedAt: Date; drillCount: number; lastDrilledAt: Date | null }[]; library: { level: MarkLevel; markedAt: Date; drillCount: number; lastDrilledAt: Date | null } | null };
export async function markHistory(s: Scoped, questionKey: string): Promise<MarkHistory>;
export function usedInText(n: number): string;      // "Used in 1 job", "Used in 3 jobs", "Used in 0 jobs"
```

- [ ] **Step 1: Write the failing tests**

```ts
it("usedInJobs counts distinct jobs per question key, not rows");
it("a key that no row holds counts 0");
it("a closed job still counts");
it("usedInJobs never counts another user's rows");
it("markHistory lists every job's mark for the key with dates and the library mark when there is one");
it("markHistory skips jobs that no longer exist and never shows another user's marks");
it("usedInText is singular for one");
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/library-usage.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the scoped query and the two functions**

One grouped query for `countJobsByQuestionKey`; `markHistory` joins in application code, sorted newest `markedAt` first.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/library-usage.test.ts tests/integration/scoped-isolation.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/library/usage.ts lib/db/scoped/prep-question.ts tests/integration/library-usage.test.ts
git commit -m "feat(library): used-in counts and per-job mark history"
```

**Acceptance:** (1) "Used in N jobs" comes from `question_key` matches across question rows (spec 5.8). (2) The item page can show every job's mark with dates (spec 5.8). (3) Isolation holds.

---

### Task 41: Library list, item page, edit and archive

**Files:**
- Modify: `app/(app)/library/page.tsx` (replaces the placeholder), `tests/e2e/nav.spec.ts` (the Library test at line 35 asserted the placeholder text; assert the new empty state instead)
- Create: `app/(app)/library/[id]/page.tsx`, `app/(app)/library/actions.ts`, `components/library/library-list.tsx`, `components/library/library-filters.tsx`, `components/library/item-view.tsx`, `components/library/item-editor.tsx`, `components/library/mark-history.tsx`
- Modify: `docs/design-system.md`
- Test: `tests/integration/library-actions.test.ts`, `tests/unit/library-list.test.tsx`, `tests/unit/item-editor.test.tsx`

**Interfaces:**
- Consumes: `listLibrary`, `getLibraryItem`, `updateLibraryItem`, `archiveLibraryItem` (Task 38), `usedInJobs`, `usedInText`, `markHistory` (Task 40), `components/markdown.tsx`, `ChipField`, `Badge`, `EmptyState`, the Write and Preview toggle pattern of `components/job/document-editor.tsx`.
- Produces: route `/library?q=&kind=&tag=` (a GET form, server-filtered); route `/library/[id]`; actions `updateLibraryItemAction(id, prev, formData)`, `archiveLibraryItemAction(id, archived)`; the list rows show a kind chip, tags, the title, the first line of the body and "Used in N jobs"; the item page shows the rendered body, tags, a link to the source job, `<MarkHistory>` (one row per job with the level word and date), Edit (plain text area with preview, as Documents) and Archive.

- [ ] **Step 1: Write the failing tests**

```ts
// library-actions.test.ts (actions harness)
it("updateLibraryItemAction saves title, body and tags and returns field errors for an empty title");
it("archiveLibraryItemAction archives and unarchives and returns not_found for another user's item");
// library-list.test.tsx
it("shows kind chip, tags, title, first line and 'Used in 3 jobs' per row");
it("the empty state shows the library copy");
it("filters submit as query parameters q, kind and tag");
it("archived items are hidden by default");
// item-editor.test.tsx
it("the Write and Preview toggle renders the markdown preview and saving calls the action");
it("tags use the chip field with the 20 and 80 limits");
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/library-actions.test.ts tests/unit/library-list.test.tsx tests/unit/item-editor.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the pages, actions and components**

Both pages call `requireUser()`. The item page returns `notFound()` for an unknown or foreign id. Mark words reuse `MarkChip`. Update `tests/e2e/nav.spec.ts` line 35 to the new empty state text. Run the unslop render tier at 375 and 1280 pixels, light and dark.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/library-actions.test.ts tests/unit/library-list.test.tsx tests/unit/item-editor.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/library" components/library tests docs/design-system.md
git commit -m "feat(library): list with search and filters, item page, edit and archive"
```

**Acceptance:** (1) The list shows kind chips, tags, title, first line and "Used in N jobs"; search by text, filter by kind and tag (spec 5.8). (2) The item page shows the body rendered, tags, source job, every job's mark and Edit and Archive (spec 5.8). (3) The placeholder is gone and the nav test still passes.

---

### Task 42: Save to library buttons and creation by hand

**Files:**
- Create: `components/library/save-to-library-button.tsx`, `components/library/new-item-dialog.tsx`
- Modify: `app/(app)/library/actions.ts` (`saveToLibraryAction`, `createLibraryItemAction`), `components/prep/question-list.tsx` (the button in each question's disclosure), `components/player/listen-player.tsx` (the button for the current question), `components/player/drill-summary.tsx` (the button per question in the summary), `app/(app)/library/page.tsx` (the "New item" button)
- Test: `tests/integration/library-save-actions.test.ts`, `tests/unit/save-to-library-button.test.tsx`, `tests/unit/new-item-dialog.test.tsx`

**Interfaces:**
- Consumes: `saveQuestionToLibrary` (Task 39), `createLibraryItem` (Task 38), `LIBRARY_COPY`, `ChipField`, the toast from `components/ui/sonner.tsx`.
- Produces: `saveToLibraryAction(input: { opportunityId: string; questionKey: string }): Promise<Result<{ id: string; created: boolean }, string>>`; `createLibraryItemAction(prev, formData)`; `<SaveToLibraryButton opportunityId questionKey>` showing the toast "Saved to library." with an "Open" link, or "Already in your library." when `created` is false; the New item dialog offers kinds story, intro and fact only (answers come from questions, spec 5.8), a title, a body and tags.

- [ ] **Step 1: Write the failing tests**

```ts
it("saveToLibraryAction creates the item for the signed-in user and returns it");
it("saveToLibraryAction on an already saved question returns created false");
it("createLibraryItemAction creates a story, an intro or a fact and refuses kind answer");
it("the button shows 'Saved to library.' with an Open link and 'Already in your library.' on a repeat");
it("the button appears in the hub's question list, in Listen and in the Drill summary");
it("the New item dialog validates the title and tags and closes on success");
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/library-save-actions.test.ts tests/unit/save-to-library-button.test.tsx tests/unit/new-item-dialog.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the actions, the button and the dialog**

Use the dialog and form helpers the Core dialogs use (`lib/forms/submit.ts`, explicit Zod messages, focus fallbacks). The button is a small client component with a pending state and a try/catch toast on failure.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/library-save-actions.test.ts tests/unit/save-to-library-button.test.tsx tests/unit/new-item-dialog.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components "app/(app)/library" tests
git commit -m "feat(library): Save to library from the hub, Listen and Drill, and new items by hand"
```

**Acceptance:** (1) "Save to library" is on the hub list, Listen and the Drill summary (spec 5.8). (2) Stories, intros and facts are created by hand from the Library page (spec 5.8).

---

### Task 43: Library Quick-fire

**Files:**
- Create: `app/(app)/library/quick-fire/page.tsx`, `lib/library/practice.ts`
- Modify: `components/player/quick-fire-card.tsx` (a `scope: "job" | "library"` prop, default `job`; with `library` each mark calls the action with `scope: "library"` and `opportunityId: null`), `components/library/library-list.tsx` (a "Quick-fire" link), `docs/design-system.md`
- Test: `tests/integration/library-practice.test.ts`, `tests/unit/quick-fire-card.test.tsx` (extend)

**Interfaces:**
- Consumes: `pickQuickFire`, `seedFromId`, `QUICK_FIRE_COUNT` (Task 8), `listLibrary`, the question rows of every active job, `startSessionAction` (with `opportunityId: null`), `firstLine` (Task 38).
- Produces:

```ts
export type PracticeQuestion = { questionKey: string; question: string; spine: string | null; source: "job" | "library" };
export async function loadLibraryQuickFirePool(s: Scoped): Promise<PracticeQuestion[]>;
```

The pool is every active job's question rows that have a Spine, plus every unarchived library item that has a `question_key`. One entry per question key (a row wins over an item, because it has a real Spine); an item with no matching row uses `firstLine(bodyMd)` as its spine (plan decision, README). The round is the same as Task 11 (ten questions, five seconds, Spine, tap for next), the session has no job, marks use scope `library` and no `prep_drilled` event is written (spec 4).

- [ ] **Step 1: Write the failing tests**

```ts
it("the pool holds rows with a Spine from active jobs only, and items with a question key");
it("one entry per question key and a row's Spine wins over an item's first line");
it("an archived item and a closed job's rows are left out");
it("another user's rows and items never appear");
it("a library round writes marks with scope library and no opportunity id");
it("ending a library session writes no prep_drilled event");
it("an empty pool shows the Quick-fire empty copy");
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/library-practice.test.ts tests/unit/quick-fire-card.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the pool, the page and the prop**

`s.opportunity` already lists active jobs through `listBoard`; use its ids to filter rows. The page calls `requireUser()` and renders `<QuickFireCard scope="library">`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/library-practice.test.ts tests/unit/quick-fire-card.test.tsx && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/library/practice.ts "app/(app)/library/quick-fire" components tests
git commit -m "feat(library): Quick-fire over every active job and the library"
```

**Acceptance:** (1) Ten questions from every active job's banks plus library items with a `question_key` (spec 5.6, 5.8). (2) Library marks use scope `library` (spec 4). (3) No job means no `prep_drilled` event (spec 4).

---

### Task 44: Library drill with on-demand audio

**Files:**
- Create: `app/(app)/library/drill/page.tsx`, `lib/library/drill.ts`, `app/(app)/library/audio-actions.ts`
- Modify: `components/player/drill-player.tsx` (a `scope` prop and an optional `ensureAudio(questionKeys)` callback), `lib/prep/drill.ts` (export the pure builders the library loader reuses), `components/library/library-list.tsx` (a "Drill" link)
- Test: `tests/integration/library-drill.test.ts`, `tests/integration/library-audio-actions.test.ts`, `tests/unit/drill-player.test.tsx` (extend)

**Interfaces:**
- Consumes: `orderForDrill` (Task 32), `drillGapSeconds`, `toSpokenText`, `segmentHash`, `lookupSegments`, `planSegments`, `generateMissing`, `audioDeps`, `ttsIdentity`, `resolveVoices`, `DrillQuestion`, `DrillData`.
- Produces:

```ts
export async function loadLibraryDrillData(s: Scoped, input: { count: number | null }): Promise<Result<DrillData, "empty">>;
// candidates: unarchived library items with a question_key; level and last drilled from library-scope marks; ask = the item's title (interviewer), say = the item body's spoken text (candidate), spine from a matching question row else null
export async function ensureLibraryAudioAction(questionKeys: string[]): Promise<Result<{ clips: Record<string, { askAssetId: string | null; sayAssetId: string | null }> }, string>>;
// generates the missing clips for those items on demand (at most 2 items per call), returns asset ids; TTS off returns the empty map
```

The page is `/library/drill?n=<count>`. The Drill loop is the same as Task 35. The client calls `ensureAudio` for the next two questions in the background; until a clip exists the step speaks through the browser voice. Session: `startSessionAction({ opportunityId: null, mode: "drill", ... })`; marks scope `library` with `drilled: true`; no event.

- [ ] **Step 1: Write the failing tests**

```ts
it("loadLibraryDrillData orders by library-scope level and last drilled and skips items with no question key");
it("each question's ask is the item title and say is the item body's spoken text");
it("a library mark made in a drill puts that item first next time when it was marked shaky");
it("a question with a matching row shows that row's Spine; otherwise the reveal shows the body");
it("an empty library is empty");
it("ensureLibraryAudioAction generates the ask and say clips for the given items and returns asset ids");
it("ensureLibraryAudioAction with TTS off returns an empty map and writes nothing");
it("ensureLibraryAudioAction handles at most 2 items and never another user's item");
it("the drill player with scope library marks through the library scope and does not write a prep_drilled event");
it("the player asks ensureAudio for the next two questions and speaks through the browser voice until a clip arrives");
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/library-drill.test.ts tests/integration/library-audio-actions.test.ts tests/unit/drill-player.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the loader, the action and the page**

Item body segments are produced through the same `planSegments` and `generateMissing` as job clips, with the item's spoken text as one candidate step, so hashes and storage are shared. `drill-player` takes `scope` and forwards it to `markQuestionAction` and to `startSessionAction`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/library-drill.test.ts tests/integration/library-audio-actions.test.ts tests/unit/drill-player.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/library "app/(app)/library" components lib/prep tests
git commit -m "feat(library): Library drill with answers spoken on demand"
```

**Acceptance:** (1) `/library/drill` runs the Drill loop over items with a `question_key` (spec 5.8). (2) Answers speak through the browser voice or through segments generated for the item on demand (spec 5.8). (3) Library sessions write no timeline event (spec 4).

---

### Task 45: Context document Prep and Library sections

**Files:**
- Modify: `lib/bridge/context.ts` (`ContextInput` gains `prep: ContextPrep` and `library: ContextLibrary`; two new sections after `## Artifacts`), `lib/bridge/handlers.ts` (`handleGetContext` loads them), `tests/unit/bridge-context.test.ts`, `tests/integration/bridge-handlers.test.ts`, `README.md` (the context document paragraph)
- Create: `lib/bridge/context-prep.ts`
- Test: `tests/unit/bridge-context.test.ts`, `tests/integration/bridge-context-prep.test.ts`, `tests/integration/cli-bridge.test.ts` (extend)

**Interfaces:**
- Consumes: `s.prepQuestion.listForJob`, `s.prepMark.listForJob`, `listLibrary` (Task 38), `ArtifactMeta` for bank titles.
- Produces:

```ts
export type ContextPrep = { banks: { key: string; title: string; questions: { number: number; section: string | null; question: string; level: MarkLevel | null; lastDrilledAt: Date | null }[] }[] };
export type ContextLibrary = { items: { title: string; kind: LibraryKind; tags: string[] }[] };
export async function loadContextPrep(s: Scoped, opportunityId: string): Promise<ContextPrep>;
export async function loadContextLibrary(s: Scoped): Promise<ContextLibrary>;
```

Document format (frontmatter stays `jobsmith: context/v1`; the sections are additive):

```markdown
## Prep

### Full answers (answers-full)

- 1. Tell me about yourself. Section: Motivation. Mark: solid. Last drilled: 2026-11-19.
- 3. Walk me through a project. Section: Craft. Mark: none. Last drilled: never.

## Library

- Tell me about yourself (answer). Tags: opener, story.
- A shop owner who kept orders on paper (story). Tags: none.
```

`No question banks parsed yet.` and `No library items yet.` stand in when empty. Question text and titles have line breaks collapsed and pipes left alone (these are lists, not table cells); archived library items are left out.

- [ ] **Step 1: Write the failing tests**

```ts
// bridge-context.test.ts
it("adds ## Prep after ## Artifacts with one line per question: number, text, section, mark and last drilled date");
it("groups the lines under a heading per bank with its title and key");
it("a question with no mark reads 'Mark: none' and one never drilled reads 'Last drilled: never'");
it("lists ## Library with title, kind and tags, 'Tags: none' for no tags, archived items left out");
it("prints the fallback lines when there are no banks or no items");
it("the frontmatter version stays context/v1 and every earlier section is unchanged");
// integration
it("handleGetContext loads the job's own prep and the user's library only");
it("jobsmith pull writes a context file that lists each question's mark");        // cli-bridge: mark a question, run pull, read the file
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/bridge-context.test.ts tests/integration/bridge-context-prep.test.ts tests/integration/cli-bridge.test.ts`
Expected: FAIL, the sections do not exist.

- [ ] **Step 3: Implement the loaders, the builder change and the handler wiring**

`buildContextDocument` stays pure: the handler loads both inputs. Existing callers and tests pass empty `prep` and `library` values so their output gains only the two fallback sections; update their expectations.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/bridge-context.test.ts tests/integration/bridge-context-prep.test.ts tests/integration/cli-bridge.test.ts tests/integration/bridge-handlers.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/bridge README.md tests
git commit -m "feat(bridge): Prep and Library sections in the context document"
```

**Acceptance:** (1) `jobsmith pull` lists each question's number, section, mark and last drilled date, and the library's titles and tags (spec 5.8). (2) The frontmatter version stays `context/v1` (spec 5.8). (3) Skills can start from the shaky answers.

---

### Task 46: End to end, docs and ship

**Files:**
- Create: `tests/e2e/prep-library.spec.ts`
- Modify: `README.md` (a Library paragraph, the `## Prep` and `## Library` context sections), `docs/design-system.md`
- Test: the spec above

**Interfaces:**
- Consumes: Task 14 and Task 31 helpers, `runCli`, `createToken`.
- Produces: the Milestone 9 end to end proof.

- [ ] **Step 1: Write the failing e2e spec**

```ts
test("an answer saved from one job drills from the Library", ...);
//   push the Northwind fixture, Save to library on question 1 from the hub, open Library: the item shows 'Used in 1 job'
//   Library drill: the item's question is asked, Done, mark Shaky, the summary appears; the item's history on its page shows the library mark
test("jobsmith pull lists each question's mark", ...);
//   mark question 1 Solid and question 2 Shaky, run pull, read <slug>-context.md: '## Prep' lines contain 'Mark: solid' and 'Mark: shaky', '## Library' lists the saved title
test("search, filter by kind and tag, edit, archive and unarchive", ...);
test("a story created by hand shows in the list and can be edited", ...);
test("Library Quick-fire runs a round over jobs and the library", ...);
test("the same question in two jobs shows two marks with dates on its item page", ...);
test("the Library list, an item page, Quick-fire and Drill pass axe in light and dark on every project", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test:e2e --project=prep-chromium`
Expected: FAIL until Tasks 38 to 45 are in, then PASS.

- [ ] **Step 3: Write the docs**

Document the Library, the new routes and the context sections in `README.md`; list `components/library/*` under "New application code" with the reason (no registry match for the item list and the editor).

- [ ] **Step 4: Run the full suite and the preview check**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`
Expected: PASS in Chromium, WebKit and the phone project. Deploy the preview, save an answer, drill it from the Library, run `jobsmith pull` against the preview and read the two new sections, in Chrome and Safari at desktop and 390 px. Report the preview URL.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e README.md docs/design-system.md
git commit -m "test(prep): Milestone 9 end to end, docs and ship"
```

**Acceptance:** (1) The done-when sentence passes on every project (spec 9). (2) Axe has zero violations on every new route in light and dark (spec 8). (3) The old Library placeholder text is gone from `nav.spec.ts`.
