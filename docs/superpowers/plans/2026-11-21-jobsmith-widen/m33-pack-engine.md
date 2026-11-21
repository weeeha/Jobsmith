# Milestone 33: Pack engine

**Done when (spec section 9):** "Every product design snapshot matches its pre-refactor value, and on the preview an account switched to a fixture pack sees renamed columns while its jobs keep their stages and gain chips; a fixture file in `PACKS_DIR` appears in Settings after a restart and a broken one stops boot naming the file."

**Branch:** `feat/m33-pack-engine`, cut from `main`. Tasks 1 to 16. Contract: `README.md` in this folder.

**Before starting:** this milestone needs nothing from another plan. Run these and expect every `test` to succeed and no output from the last two:

```bash
test -f lib/pipeline/kinds.ts && test -f lib/db/scoped/profile.ts && test -f lib/ai/score-fit.ts && test -f scripts/seed.ts
test -f "app/(auth)/setup/actions.ts" && test -f components/chip-field.tsx
test ! -e lib/packs && test ! -e packs && test ! -e instrumentation.ts
```

Read `node_modules/next/dist/docs/01-app/02-guides/instrumentation.md` (from the parent checkout, the worktree has no `node_modules`) before Task 6. Two items are left out of this milestone and named in its pull request: Hosted's `ROLE_PACK` lines (Task 4 ships `prompts.generate` empty; Task 23 fills it) and `work_request.pack_id` (Task 24). Feed's scoring (feed milestone 17) must call `scoreFit` with the active pack's addendum through the same two lines Task 12 adds to `lib/fit/score-opportunity.ts`; note that in the pull request.

Where the audit of spec 5.1 finds a role-specific string today, the owning task is named: `kinds.ts`, `rules.ts`, `create.ts` (Task 7); `lib/board/keys.ts`, `lib/board/optimistic.ts`, `lib/attention/load.ts` (Task 8); every board component (Task 9); `edit-stages-dialog.tsx`, `stage-detail-sheet.tsx` (Task 10); `SENIORITY_LEVELS` in `schema.ts`, `summary.ts`, the Preferences form (Task 11); `extract-posting.ts`, `score-fit.ts` (Task 12); `scripts/seed.ts` and `lib/demo/seed-jobs.ts` (Task 17); the setup page (Task 13).

---

### Task 1: Pre-refactor snapshots

**Files:**
- Create: `tests/unit/product-design-baseline.test.ts`, `tests/integration/product-design-seed-baseline.test.ts`, `tests/fixtures/pack-baseline/score-input.ts`
- Created by the first run: `tests/unit/__snapshots__/product-design-baseline.test.ts.snap`, `tests/integration/__snapshots__/product-design-seed-baseline.test.ts.snap`
- Modify: nothing. This is the first commit of the milestone, taken before any refactor.

**Interfaces:**
- Consumes (real today): `STAGE_KINDS` from `lib/pipeline/kinds.ts`; `SENIORITY_LEVELS` from `lib/preferences/schema.ts`; `defaultStages()` from `lib/pipeline/rules.ts`; `columnTitle(kind)` from `lib/pipeline/labels.ts`; `extractPosting(driver, text, format, { userId })`; `scoreFit(driver, input, { userId })`; `scorePrompt(input: ScoreFitInput): string`; `createFakeDriver(handlers?)` (records `calls: AiRequest[]` with `instructions` and `prompt`); `seedJobs(s)` from `lib/demo/seed-jobs.ts`; `makeTestDb`, `createTestUser` from `tests/helpers/db.ts`.
- Produces: the frozen snapshot files. Later tasks rewrite the imports in these two tests to the new modules but never change a `.snap` file.

- [ ] **Step 1: Write the tests (they pass at once, because they record today)**

```ts
// tests/unit/product-design-baseline.test.ts  (names; each asserts with toMatchSnapshot)
it("stage kinds, labels and column titles")      // STAGE_KINDS.map(k => [k.kind, k.defaultLabel, k.columnTitle]) and columnTitle(kind) for each
it("default stages")                              // defaultStages()
it("seniority list")                              // SENIORITY_LEVELS
it("EXTRACT_INSTRUCTIONS and the extraction prompt") // extractPosting(createFakeDriver(), "Company: Northwind Traders\nRole: Product Designer", "plain", {userId:"u"}); snapshot driver.calls[0].instructions and .prompt
it("SCORE_INSTRUCTIONS and scorePrompt on the fixture") // scoreFit(createFakeDriver({ score_fit: () => ({ score: 72, summary: "Fits.", pros: ["a"], cons: ["b"] }) }), scoreInput, {userId:"u"}); snapshot calls[0].instructions; separately snapshot scorePrompt(scoreInput)
```

`tests/fixtures/pack-baseline/score-input.ts` exports `scoreInput: ScoreFitInput`: role `Senior Product Designer`, company `Northwind Traders`, location `Rotterdam, Netherlands`, work mode `hybrid`, all three pay fields `null`, a 3-line `bodyMd`, headline `Product designer`, a 2-line `resumeMd`, preferences `{ ...DEFAULT_PREFERENCES, titles: ["Product Designer"], seniority: ["senior", "manager"], locations: ["Rotterdam"], workModes: ["hybrid"], mustHaves: ["Design systems"] }`.

```ts
// tests/integration/product-design-seed-baseline.test.ts
it("seeds six jobs in the shapes today's seed produces")
// makeTestDb, a user, seedJobs(scoped(db, id)); read s.opportunity.listBoard() and s.opportunity.listClosed();
// snapshot [company, roleTitle, location, workMode, stage.kind, stage.label, closed?] sorted by company then role.
// Comp fields stay out of the snapshot so Task 17 can remove them on purpose.
it("two seeded jobs carry pay today")  // expect(rows.filter(r => r.compMin !== null).length).toBe(2)   // Task 17 flips this to 0
```

- [ ] **Step 2: Run them, review the written snapshots**

Run: `pnpm vitest run tests/unit/product-design-baseline.test.ts tests/integration/product-design-seed-baseline.test.ts`
Expected: PASS, two `.snap` files written. Read both files: labels `Portfolio review` and `Panel`, columns `Portfolio / case` and `Panel / final`, five seniority entries, the instruction texts, six seed rows.

- [ ] **Step 3: Nothing to implement**

The tests record behavior; no product code changes in this task.

- [ ] **Step 4: Run again and watch it pass without rewriting**

Run: `pnpm vitest run tests/unit/product-design-baseline.test.ts tests/integration/product-design-seed-baseline.test.ts --ci`
Expected: PASS, no snapshot written or updated.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/product-design-baseline.test.ts tests/integration/product-design-seed-baseline.test.ts tests/fixtures/pack-baseline tests/unit/__snapshots__ tests/integration/__snapshots__
git commit -m "test(packs): snapshot product design behavior before the pack refactor"
```

**Acceptance:**
1. Spec 8 Unit: the snapshots hold labels, column titles, the seniority list, both instruction texts and `scorePrompt` on a fixture, taken before any refactor.
2. The commit touches no file outside `tests/`.
3. Both `.snap` files are listed in Task 16's `git diff --exit-code` check.

---

### Task 2: Profile pack columns and `setPack`

**Files:**
- Modify: `lib/db/schema/app.ts` (`profile`: two columns, table-extras callback with two checks)
- Create: the migration file `pnpm db:generate` writes under `lib/db/migrations/` (next free number; keep drizzle's name)
- Modify: `lib/db/scoped/profile.ts` (`ProfileFields` drops `packId` and `packVersion`; `upsert` strips both keys; new `setPack`)
- Test: `tests/integration/migrations.test.ts` (new cases), `tests/integration/profile.test.ts`, `tests/integration/scoped-isolation.test.ts` (one new `Case`)

**Interfaces:**
- Consumes: `profileQueries(db, userId)` returns `{ get(), upsert(values) }`; `stripScopedKeys`.
- Produces: `ProfileRow` gains `packId: string`, `packVersion: number`; `profile.setPack(packId: string, packVersion: number): Promise<ProfileRow>`, one `INSERT ... ON CONFLICT (user_id) DO UPDATE SET pack_id, pack_version, updated_at` statement returning the row.

- [ ] **Step 1: Write the failing tests**

```ts
// migrations.test.ts
it("gives a new profile row pack_id 'product-design' and pack_version 1")
it("rejects pack ids 'Bad_Id', 'ab', 'a--b', '-ab' and a 41-character id (profile_pack_id_format)")
it("accepts 'sales', 'data' and a 40-character id")
it("rejects pack_version 0 (profile_pack_version_min)")
// profile.test.ts
it("upsert ignores packId and packVersion")       // s.profile.upsert({ headline: "x", packId: "sales" } as never) leaves packId 'product-design'
it("setPack creates the row when the user has none and updates both columns in one call")
// scoped-isolation.test.ts
// "profile.setPack by B leaves A's pack alone": a.setPack("sales", 2); b.setPack("data", 3); a.get() is sales 2; b.get() is data 3.
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/migrations.test.ts tests/integration/profile.test.ts tests/integration/scoped-isolation.test.ts`
Expected: FAIL, `pack_id` column does not exist.

- [ ] **Step 3: Implement the columns and `setPack`**

```ts
// lib/db/schema/app.ts (add integer, check from drizzle-orm/pg-core; sql from drizzle-orm)
packId: text("pack_id").notNull().default("product-design"),
packVersion: integer("pack_version").notNull().default(1),
// third argument of pgTable:
(t) => [
  check("profile_pack_id_format", sql`${t.packId} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(${t.packId}) between 3 and 40`),
  check("profile_pack_version_min", sql`${t.packVersion} >= 1`),
],
```

Run `pnpm db:generate`, read the SQL: both `ADD COLUMN ... DEFAULT` statements backfill every existing row, so the owner and today's self-hosters stay on product design with no step. Do not edit the generated SQL.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration && pnpm typecheck`
Expected: PASS. The new `upsert` type means `lib/profile/index.ts` still compiles (it passes only headline, timezone, resumeMd).

- [ ] **Step 5: Commit**

```bash
git add lib/db tests/integration
git commit -m "feat(packs): profile.pack_id and pack_version with a single-writer scoped helper"
```

**Acceptance:**
1. Spec 4: both columns, defaults, the check on format and length 3 to 40, no foreign key, version at least 1.
2. Spec 3 and Global Constraints: `upsert` cannot write the pack columns; only `setPack` can.
3. Isolation row present for `profile.setPack`.

---

### Task 3: Pack schema, limits and fixture packs

**Files:**
- Create: `lib/packs/schema.ts`, `scripts/packs-schema-json.ts`, `packs/schema.json` (generated), `tests/fixtures/packs/valid-minimal.json`, `tests/fixtures/packs/hidden-kind.json`
- Modify: `package.json` (script `"packs:schema": "tsx scripts/packs-schema-json.ts"`)
- Test: `tests/unit/pack-schema.test.ts`

**Interfaces:**
- Consumes: `STAGE_KIND_LIST`, `MIDDLE_KINDS` (this task adds them to `lib/pipeline/kinds.ts` beside the existing `STAGE_KINDS`; Task 7 removes `STAGE_KINDS`), `SENIORITY_VALUES` (this task adds it to `lib/preferences/schema.ts` next to the existing list; Task 11 finishes that file), `WORK_MODES`, `STAGE_FORMATS`, `PERSON_ROLES`, `CLOSED_REASONS` from `lib/pipeline/values.ts`, `HEADLINE_MAX` from `lib/profile/index.ts`.
- Produces: everything in the Contract's "Pack schema" block: `PACK_SCHEMA_ID`, `PACK_MAX_BYTES`, `PACK_ID_PATTERN`, `PACK_LIMITS`, `Pack`, `PackIssue`, `parsePack`, `packRef`, `packSchema`.

- [ ] **Step 1: Write the failing tests (a table of cases)**

`tests/unit/pack-schema.test.ts` builds a valid base from `valid-minimal.json` and applies one mutation per case; each case asserts `parsePack` returns `ok: false` with an issue whose `path` and `message` equal the pair below.

| Mutation | path | message |
|---|---|---|
| remove `stages.offer` | `stages.offer` | `required` |
| add key `stages.extra` | `stages` | `unknown key: extra` |
| `schema: "jobsmith-pack/v2"` | `schema` | `must be "jobsmith-pack/v1"` |
| `id: "Ab"` | `id` | `lowercase words joined by hyphens, 3 to 40 characters` |
| `id` 41 characters | `id` | same |
| `version: 0`, `10000`, `1.5` | `version` | `a whole number from 1 to 9999` |
| `name` 41 characters | `name` | `at most 40 characters` |
| `description` 161 characters | `description` | `at most 160 characters` |
| `stages.panel_final.column` 25 characters | `stages.panel_final.column` | `at most 24 characters` |
| `stages.panel_final.label` empty | `stages.panel_final.label` | `1 to 40 characters` |
| `stages.saved.label: "Inbox"` | `stages.saved.label` | `must be Saved` |
| `stages.applied.column: "Sent"` | `stages.applied.column` | `must be Applied` |
| `stages.offer.hidden: true` | `stages.offer.hidden` | `cannot be hidden` |
| two middle labels `Tech` and `tech` | `stages.panel_final.label` | `duplicates another stage label` |
| all four middle kinds hidden | `stages` | `at least one of the four middle stages must stay visible` |
| `seniority` with 1 entry | `seniority` | `2 to 9 levels` |
| `seniority` with duplicate `senior` | `seniority.1.value` | `duplicate level` |
| `seniority[0].value: "intern"` | `seniority.0.value` | `not a known level` |
| 13 `titleSuggestions` | `titleSuggestions` | `at most 12 entries` |
| `prompts.scoreFit` 1,001 characters | `prompts.scoreFit` | `at most 1000 characters` |
| `prompts.generate.coverLetter` 1,501 | `prompts.generate.coverLetter` | `at most 1500 characters` |
| `prompts.callCard` 1,501 | `prompts.callCard` | `at most 1500 characters` |
| `prep.questionCounts.recruiter_screen: 3`, `21` | `prep.questionCounts.recruiter_screen` | `4 to 20` |
| 9 section names for one kind | `prep.sections.hiring_manager` | `at most 8 sections` |
| a 61-character section name | `prep.sections.hiring_manager.0` | `at most 60 characters` |
| 9 seed jobs | `seed.jobs` | `at most 8 jobs` |
| seed job with key `compMin` | `seed.jobs.0` | `unknown key: compMin` |
| `seed.jobs[0].schedule.inDays: 15` | `seed.jobs.0.schedule.inDays` | `1 to 14` |
| 4 seed people | `seed.jobs.0.people` | `at most 3 people` |
| 3 seed notes, or a 301-character note | `seed.jobs.0.notes` | `at most 2 notes of 300 characters` |

Success cases: defaults (`hidden` false, every `prompts` string `""`) fill in; `hidden-kind.json` (portfolio case hidden) is accepted; a seedless pack is accepted by `parsePack` (the repo-only rule is Task 18); `packRef` returns `"valid-minimal@1"` for the fixture. A test also reads `packs/schema.json` and asserts it equals `JSON.stringify(z.toJSONSchema(packSchema, { io: "input" }), null, 2) + "\n"`.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/pack-schema.test.ts`
Expected: FAIL, `@/lib/packs/schema` not found.

- [ ] **Step 3: Implement `parsePack` and the schema in `lib/packs/schema.ts`**

Build with `z.strictObject` throughout; map Zod issues to `PackIssue` with `path` joined by `.` and the messages in the table (custom `error` strings on every check, plus a `superRefine` for the fixed kinds, unique labels and the middle-kind rule). `unknown key: <name>` comes from a `unrecognized_keys` issue mapped to the parent path. `stages` is `z.strictObject` over `STAGE_KIND_LIST`. `scripts/packs-schema-json.ts` writes `packs/schema.json`; run `pnpm packs:schema`. The two fixtures are copies of the product design values with ids `valid-minimal` (everything visible, a seed of one job with no schedule) and `hidden-kind`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/pack-schema.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/packs/schema.ts scripts/packs-schema-json.ts packs/schema.json tests/fixtures/packs tests/unit/pack-schema.test.ts package.json lib/pipeline/kinds.ts lib/preferences/schema.ts
git commit -m "feat(packs): jobsmith-pack/v1 schema, limits and JSON Schema file"
```

**Acceptance:**
1. Spec 5.2: every limit and rule in the table has a failing and a passing case.
2. Spec 3 stack: `packs/schema.json` is generated with `z.toJSONSchema` and a test fails when it drifts.
3. Spec 5.2: a seed cannot carry a pay field.

---

### Task 4: The product design pack and its guards

**Files:**
- Create: `packs/product-design.json`, `packs/pack-hashes.json`, `scripts/packs-hash.ts`, `lib/packs/builtin.ts`
- Modify: `package.json` (script `"packs:hash": "tsx scripts/packs-hash.ts"`)
- Test: `tests/unit/pack-builtin.test.ts`, `tests/unit/pack-hash-guard.test.ts`

**Interfaces:**
- Consumes: `parsePack`, `Pack`; the snapshot values of Task 1.
- Produces: `export function builtinPacks(): Pack[]` (parses each imported JSON module, throws `Error("builtin pack <file>: <path>: <message>")` on the first issue); `export const BUILTIN_PACK_FILES: Record<string, unknown>` (file name to imported module).

- [ ] **Step 1: Write the failing tests**

```ts
// pack-builtin.test.ts
it("every built-in file passes the schema")            // builtinPacks() does not throw; ids unique
it("product design keeps today's labels and columns")  // stages equal Task 1's recorded table: Saved/Saved, Applied/Applied, Recruiter screen/Recruiter, Hiring manager/Hiring manager, Portfolio review/Portfolio / case, Panel/Panel / final, Offer/Offer
it("product design keeps today's seniority list")      // mid Mid, senior Senior, staff Staff, principal Principal, manager Manager
it("product design has empty extraction and scoring addenda")
it("product design question counts are 10, 12, 8 and 12") // recruiter_screen 10, hiring_manager 12, portfolio_case 8, panel_final 12
it("product design name is 'Product design' at version 1")
it("product design seed matches the six rows of Task 1's seed baseline and carries no pay") // explicit company, role, location, workMode and stage per row; 'closed' only on the Principal job
// pack-hash-guard.test.ts
it("records every built-in as id@version with its sha256")  // packs/pack-hashes.json has "product-design@1" equal to sha256 of the file with LF endings
it("fails with 'bump the version, then run pnpm packs:hash' when content changes at the same version") // test the check function with a mutated copy
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/pack-builtin.test.ts tests/unit/pack-hash-guard.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write the pack file and the guard**

`packs/product-design.json`: `schema`, `id` `product-design`, `version` 1, `name` `Product design`, `description` (plan copy: `Designers: portfolio reviews, case studies and design panels.`, 62 characters), `stages` and `seniority` from the Task 1 snapshot, `titleSuggestions` and `titleExcludeSuggestions` `[]` (blocked on the owner's keyword lists, README item 2), `prompts` all `""` with `generate` fields empty (README item 3), `prep.questionCounts` 10, 12, 8, 12 and `prep.sections` four empty arrays (the owner's answer, README item 2). `seed`: `headline` `Product designer exploring new roles` and six jobs ported from `lib/demo/seed-jobs.ts` with the two pay ranges dropped (the schema has no pay fields): Acme Robotics `Senior Product Designer` (Remote, remote, `saved`) and `Staff Product Designer` (Remote, remote, `applied`); Northwind Labs `Product Designer` (Berlin, Germany, hybrid, `recruiter_screen`) and `Design Lead` (Berlin, Germany, hybrid, `hiring_manager`, schedule `inDays` 3 `video`, person Tomas Okafor `hiring_manager` `Head of Design`, note `Hiring manager call moved earlier in the week, still video.`); Lumen Health `Product Design Manager` (Remote, remote, `portfolio_case`) and `Principal Product Designer` (Remote, remote, `panel_final`, person Priya Raman `recruiter`, note `Panel went well, but the team hired internally.`, closed `rejected`). Nothing reads the seed until Task 17, so the file is complete at version 1 and the hash guard needs no later bump for it. `scripts/packs-hash.ts` appends `"<id>@<version>": "<sha256>"` for every built-in missing from the file and never rewrites an existing entry; `--check` exits 1 on a mismatch.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm packs:hash && pnpm vitest run tests/unit/pack-builtin.test.ts tests/unit/pack-hash-guard.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packs lib/packs/builtin.ts scripts/packs-hash.ts tests/unit package.json
git commit -m "feat(packs): the product design pack as data, with a content-hash guard"
```

**Acceptance:**
1. Spec 5.3: product design is today's labels, columns, levels and counts moved into data, with empty extraction and scoring addenda.
2. Spec 8: a pack file's content hash changing without a version bump fails a unit test.
3. Suggestion lists, `prep.sections` and Hosted audience lines are empty and listed in the README as the owner's answers.

---

### Task 5: Pack files loader and registry

**Files:**
- Create: `lib/packs/files.ts`, `lib/packs/registry.ts`
- Test: `tests/unit/pack-registry.test.ts` (uses `fs.mkdtemp` directories, no repo fixtures)

**Interfaces:**
- Consumes: `parsePack`, `Pack`, `PACK_MAX_BYTES`, `builtinPacks()`.
- Produces: `PackError`, `LoadedPack`, `PackRegistry`, `loadRegistry`, `getRegistry`, `setRegistry(registry: PackRegistry | null): void` (tests only; clears the memo when `null`), `export const ENV_NAMES = ["PACKS_DIR"] as const` in `files.ts`, `export function readPackFiles(dir: string): { file: string; raw: unknown }[]`.

- [ ] **Step 1: Write the failing tests**

```ts
it("loads the built-ins with source 'builtin' when no dir is given")
it("loads every *.json directly inside the dir with source { file }")
it("ignores subfolders and non-json files")
it("accepts a PACKS_DIR file that has no seed")                     // an operator pack may drop it (spec 5.2)
it("fails with 'PACKS_DIR: cannot read the directory' for a missing or unreadable dir")
it("fails with 'PACKS_DIR: at most 20 pack files' for 21 files")
it("fails with 'big.json: file: at most 65536 bytes' for a file over 64 KB")
it("fails with 'bad.json: file: not valid JSON'")
it("names the file and its first issue: 'sales.json: stages.panel_final.column: at most 24 characters'") // error.name === "PackError"; error.message equals that string
it("lists at most five issues, joined by '; ', after one file name")
it("rejects an id used by a built-in: 'sales.json: id: already used by product-design'")
it("rejects an id used by another file, naming the second file in sorted order")
it("emits one [packs] line with ids, versions and sources and no prompt text") // spy console.info; JSON.parse the second argument; assert it contains no addendum text planted in a fixture pack
it("getRegistry memoizes and reads PACKS_DIR once") // setRegistry(null); set env; call twice; readdir spy called once
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/pack-registry.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the loader and `loadRegistry`**

Files are read in sorted order; the first failing file throws. Size is checked with `stat` before `readFile`. Message format: the file name, then `": "`, then each `<path>: <message>` joined by `"; "`, at most five. `getRegistry()` calls `loadRegistry({ dir: process.env.PACKS_DIR || undefined, builtins: builtinPacks() })` once and logs `console.info("[packs]", JSON.stringify({ packs: [{ id, version, source }] }))` where source is `"builtin"` or the file name.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/pack-registry.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/packs/files.ts lib/packs/registry.ts tests/unit/pack-registry.test.ts
git commit -m "feat(packs): PACKS_DIR loader and registry that stops on a bad file"
```

**Acceptance:**
1. Spec 5.5: at most 20 files, no subfolders, schema, unique ids, any failure stops with the file name and up to five issues.
2. Spec 6: a duplicate id and an unreadable directory stop boot with names.
3. Spec 6 logs: one `[packs]` line, never prompt text.

---

### Task 6: Active pack, fallback, notices and boot checks

**Files:**
- Create: `lib/packs/active.ts`, `instrumentation.ts`, `tests/helpers/packs.ts`
- Test: `tests/integration/pack-active.test.ts`, `tests/unit/pack-notices.test.ts`, `tests/unit/instrumentation.test.ts`

**Interfaces:**
- Consumes: `Scoped` (`s.profile.get()`), `getRegistry`, `setRegistry`, `DEFAULT_PACK_ID`.
- Produces: `ActivePack`, `getActivePack(s)`, `PackNotice`, `packNotices(active)`; `register(): Promise<void>` default-less named export of `instrumentation.ts`; `tests/helpers/packs.ts`: `withRegistry(packs: Pack[]): void` (calls `setRegistry(loadRegistry({ builtins: [...builtinPacks(), ...packs] }))`) and `resetRegistry(): void`.

- [ ] **Step 1: Write the failing tests**

```ts
// pack-active.test.ts (PGlite)
it("reads a user with no profile row as product-design version 1")
it("returns the stored pack when it is installed")      // withRegistry([valid-minimal]); s.profile.setPack("valid-minimal", 1)
it("falls back to product design when the stored id is not installed and writes nothing") // fallback true, storedId kept, profile row unchanged after the call
// pack-notices.test.ts
it("says \"The role pack 'sales' is not installed here. Using Product design until it is.\"")
it("says 'The Software engineering pack was updated to version 2.' when the loaded version is above the stored one")
it("returns no notice when versions match or the loaded version is lower")
// instrumentation.test.ts
it("register() runs env() and the registry once under the node runtime")   // vi.mock both; NEXT_RUNTIME "nodejs"; called once each
it("register() does nothing under the edge runtime")
it("a bad PACKS_DIR makes register() reject with the PackError message")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/pack-active.test.ts tests/unit/pack-notices.test.ts tests/unit/instrumentation.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `getActivePack`, `packNotices` and `register`**

`getActivePack`: `row = await s.profile.get()`; `storedId = row?.packId ?? "product-design"`, `storedVersion = row?.packVersion ?? 1`; registry `get(storedId)` else `get(DEFAULT_PACK_ID)` with `fallback: true`. `packNotices` returns the `missing` notice when `fallback`, and the `updated` notice when not fallback and `pack.version > storedVersion`, with the exact messages above. `instrumentation.ts`: `export async function register() { if (process.env.NEXT_RUNTIME === "nodejs") { const { env } = await import("@/lib/env"); const { getRegistry } = await import("@/lib/packs/registry"); env(); getRegistry(); } }`. Next does not call `register()` during `next build`; the image build still uses placeholders (Task 33) because route modules import `env()`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/pack-active.test.ts tests/unit/pack-notices.test.ts tests/unit/instrumentation.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/packs/active.ts instrumentation.ts tests
git commit -m "feat(packs): active pack with fallback, notices and a boot check"
```

**Acceptance:**
1. Spec 3 stack and 5.5: `env()` and the pack load run once at start so a bad variable or file fails at boot, also on Vercel.
2. Spec 5.4: a profile whose pack is not installed reads as product design, keeps its stored id and the notice text matches.
3. Spec 6: the fallback writes nothing.

---

### Task 7: Stage vocabulary through `lib/pipeline`

**Files:**
- Create: `lib/packs/vocabulary.ts`
- Modify: `lib/pipeline/kinds.ts` (drop `STAGE_KINDS`; add `STAGE_KIND_LIST`, `FIXED_KINDS`, `MIDDLE_KINDS`, `MiddleKind`), `lib/pipeline/rules.ts` (`defaultStages(vocab)`, `planMove(state, target, now, vocab)`, `kindRank`, `FIXED_KINDS`), `lib/pipeline/create.ts` (load vocabulary inside the transaction), `lib/pipeline/move.ts` (load vocabulary inside the transaction), `lib/pipeline/labels.ts` (remove `columnTitle`), `lib/pipeline/values.ts` (`STAGE_KIND_VALUES`), `lib/pipeline/stage-forms.ts` (`ADDABLE_STAGE_KINDS = MIDDLE_KINDS`)
- Modify tests: `tests/unit/kinds.test.ts`, `tests/unit/pipeline-labels.test.ts`, `tests/unit/pipeline-rules.test.ts`, `tests/helpers/pipeline-state.ts`, `tests/integration/pipeline-move.test.ts`, `tests/integration/pipeline-create.test.ts`, `tests/integration/bridge-handlers.test.ts`, `tests/integration/cli-bridge.test.ts` (replace `STAGE_KINDS` and `columnTitle` imports), and the two Task 1 baseline tests (imports only)
- Test: `tests/unit/pack-vocabulary.test.ts`, `tests/integration/pipeline-create.test.ts`, `tests/integration/pipeline-move.test.ts`

**Interfaces:**
- Consumes: `Pack`, `getActivePack`, `withRegistry`.
- Produces: the Contract's "Kinds" and "Vocabulary" blocks, `defaultStages(vocab: StageVocabulary): StageDraft[]` (visible kinds in kind order, labeled from the vocabulary), `planMove(state, target, now, vocab): Result<MovePlan, MoveError>` (rule 2 label is `labelFor(vocab, target.kind)`).

- [ ] **Step 1: Write the failing tests**

```ts
// pack-vocabulary.test.ts
it("vocabularyOf lists all seven kinds in kind order with label, column and hidden")
it("visibleKinds drops a hidden kind and keeps kind order")                 // hidden-kind fixture: 6 kinds, no portfolio_case
it("boardColumns adds a hidden kind while a card sits in it")                // boardColumns(v, ["portfolio_case"]) has 7
it("digitKind numbers visible columns in order")                             // hidden-kind fixture: digit 5 is panel_final, digit 6 is offer, digit 7 is null; product design: digit 5 is portfolio_case, 8 and 0 are null
// pipeline-create.test.ts (PGlite, withRegistry([valid-minimal with portfolio_case renamed "Craft review"/"Craft"]))
it("a new job gets one stage per visible kind labeled from the active pack")
it("a hidden kind gets no stage in the default template")                   // hidden-kind fixture: six stages
it("after setPack to the fixture, new jobs use the new label and older stages keep theirs")
// pipeline-move.test.ts
it("a move to a kind the job lacks creates a stage with the active pack's label") // job created under product design, pack switched, move to portfolio_case: new stage label is the fixture's
it("a hidden kind is still accepted as a move target")                         // imports and older jobs keep working
// pipeline-rules.test.ts: defaultStages(productDesignVocab) deep-equals Task 1's snapshot value
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/pack-vocabulary.test.ts tests/integration/pipeline-create.test.ts tests/integration/pipeline-move.test.ts`
Expected: FAIL, `@/lib/packs/vocabulary` missing and `defaultStages` signature mismatch.

- [ ] **Step 3: Implement**

Remove `STAGE_KINDS` so `pnpm typecheck` lists every remaining consumer; this task fixes everything under `lib/pipeline` and the listed tests, Tasks 8 to 10 fix the rest (the milestone branch builds only after Task 10, so run `pnpm vitest run` on the named files until then). `createOpportunity`: inside `s.transaction`, `const active = await getActivePack(tx); const vocab = vocabularyOf(active.pack);` then `defaultStages(vocab)`; the `saved` stage must exist (the schema forbids hiding it). `moveOpportunity` loads the vocabulary the same way and passes it to `planMove`. `lib/packs/vocabulary.ts` imports only types from `schema.ts` and `kinds.ts` so client components can use it.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration/pipeline-create.test.ts tests/integration/pipeline-move.test.ts tests/integration/product-design-seed-baseline.test.ts --ci`
Expected: PASS, no snapshot written (Task 1's files unchanged).

- [ ] **Step 5: Commit**

```bash
git add lib/packs/vocabulary.ts lib/pipeline tests
git commit -m "feat(packs): stage labels and titles come from the active pack's vocabulary"
```

**Acceptance:**
1. Spec 5.1: kinds and order stay in code; labels and titles come from the pack, loaded inside `createOpportunity`'s transaction.
2. Spec 5.2 rules: one stage per visible kind in kind order; `lib/pipeline` still accepts a hidden kind as a target.
3. Spec 5.4: a move to a missing kind uses the active pack's label; older stages keep theirs.
4. Task 1's snapshots still match.

---

### Task 8: Vocabulary through board data and Home

**Files:**
- Modify: `lib/board/keys.ts` (`keyToAction(key, vocab)`), `lib/board/optimistic.ts` (`applyMove(cards, move, vocab)`), `lib/attention/load.ts` (`loadHome` columns from `boardColumns`), `app/(app)/board/page.tsx` (load vocabulary, pass `vocabulary`, key hint text)
- Modify tests: `tests/unit/board-keys.test.ts`, `tests/unit/board-optimistic.test.ts`, `tests/integration/attention.test.ts`
- Test: same files

**Interfaces:**
- Consumes: `StageVocabulary`, `digitKind`, `labelFor`, `columnFor`, `boardColumns`, `getActivePack`, `vocabularyOf`.
- Produces: `keyToAction(key: string, vocab: StageVocabulary): BoardKeyAction | null`; `applyMove(cards: BoardCard[], move: { id: string; toKind: StageKind }, vocab: StageVocabulary): BoardCard[]`; `ColumnCount` unchanged in shape, `title` from `columnFor`.

- [ ] **Step 1: Write the failing tests**

```ts
it("digit 5 moves to portfolio_case under product design and to panel_final when it is hidden")
it("digits beyond the visible count return null")                 // product design: 8, 9, 0 null; hidden-kind fixture: 7 null
it("c and C still close")
it("applyMove sets the label from the vocabulary, not a constant")  // fixture pack's "Craft review"
it("loadHome returns the visible columns with the pack's titles and counts, plus a hidden kind that holds a card") // zeros included for visible
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/board-keys.test.ts tests/unit/board-optimistic.test.ts tests/integration/attention.test.ts`
Expected: FAIL, signatures differ.

- [ ] **Step 3: Implement**

`loadHome` calls `getActivePack(s)` itself and builds `columns` from `boardColumns(vocab, board.map(c => c.stage.kind))`. The board page loads the vocabulary once, passes `vocabulary` to `Board` and `PhoneBoard` (props added in Task 9), and the hint reads `Keys 1 to ${visibleKinds(vocabulary).length} move the focused job. C closes it.` (plan copy; product design still reads `Keys 1 to 7`).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/board-keys.test.ts tests/unit/board-optimistic.test.ts tests/integration/attention.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/board lib/attention "app/(app)/board/page.tsx" tests
git commit -m "feat(packs): board keys, optimistic moves and Home columns use the vocabulary"
```

**Acceptance:**
1. Spec 5.1: `lib/board/optimistic.ts`, `keys.ts` receive a `StageVocabulary`.
2. Spec 5.2: board digits number the visible columns in order; a hidden column shows only while a card sits in it.
3. Product design behavior is unchanged: Home still lists seven columns.

---

### Task 9: Board, card, menus, sheet and Add job

**Files:**
- Modify: `components/board/board.tsx`, `components/board/phone-board.tsx`, `components/board/board-column.tsx` (a `title` prop replaces `columnTitle(kind)`), `components/board/job-card.tsx` (chip compares with `labelFor(vocabulary, kind)`), `components/board/move-menu.tsx`, `components/board/move-sheet.tsx`, `components/board/add-job-dialog.tsx` (start column options and the item map from the vocabulary prop), `app/(app)/board/actions.ts` (`STAGE_KIND_LIST` for the kind check on line 87)
- Modify tests: `tests/unit/add-job-dialog.test.tsx` and any board component test that renders these with `STAGE_KINDS` (`pnpm typecheck` lists them)
- Test: `tests/unit/board-vocabulary.test.tsx` (new)

**Interfaces:**
- Consumes: `StageVocabulary`, `labelFor`, `columnFor`, `visibleKinds`, `boardColumns`, `digitKind`, `keyToAction(key, vocab)`, `applyMove(cards, move, vocab)`.
- Produces: `vocabulary: StageVocabulary` as a required prop of `Board`, `PhoneBoard`, `MoveMenu`, `MoveSheet`, `AddJobDialog`; `BoardColumn` takes `title: string`.

- [ ] **Step 1: Write the failing tests (`@testing-library/react`)**

```ts
it("renders column titles from the vocabulary, in kind order")             // fixture pack: "Craft"
it("shows a hidden column only while a card sits in it")
it("a card whose stage label differs from the pack's label for that kind shows the label as a chip") // label "Portfolio review" under the fixture pack whose label is "Craft review": chip text "Portfolio review"
it("a card whose label equals the pack's label shows no chip")
it("the Move to menu and the phone sheet list visible kinds only, with column titles")
it("Add job's start column lists visible kinds and defaults to Saved")
it("move announcements name the pack's column title")                       // "Moved Role at Company to Craft."
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/board-vocabulary.test.tsx`
Expected: FAIL, props missing.

- [ ] **Step 3: Implement**

Delete the three duplicated `defaultLabelFor` helpers (`job-card.tsx`, `phone-board.tsx`; `board.tsx` imports it through `job-card`). `add-job-dialog.tsx` currently builds `STAGE_KIND_ITEMS` at module level from `STAGE_KINDS`; build it in the component with `React.useMemo` from the prop, keeping the first-open comment's reason (items must exist before the popup opens). No new component, so no `docs/design-system.md` entry. All text through tokens as before.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit && pnpm typecheck`
Expected: PASS (typecheck still fails only on files Task 10 owns; if so run `pnpm vitest run tests/unit` and defer typecheck to Task 10).

- [ ] **Step 5: Commit**

```bash
git add components/board "app/(app)/board/actions.ts" tests
git commit -m "feat(packs): board, cards, menus and Add job take the stage vocabulary"
```

**Acceptance:**
1. Spec 5.1: board, card, move menu, phone sheet and add job receive a `StageVocabulary` prop from the server page.
2. Spec 5.4: a card shows its stage label as a chip whenever it differs from the pack's label for that kind.
3. Spec 5.2: a hidden kind is left out of Add job's start column, the Move to menu and the phone sheet.

---

### Task 10: Job page dialogs and announcements

**Files:**
- Modify: `components/job/edit-stages-dialog.tsx` (`ADDABLE_STAGE_KINDS` filtered by `visibleKinds`, option text `columnFor`), `components/job/stage-detail-sheet.tsx` (move announcement), `components/job/job-tabs.tsx` and the tab components that forward props (only where they pass to those two), `app/(app)/jobs/[slug]/page.tsx` (load `getActivePack`, build `vocabularyOf`, pass down)
- Test: `tests/unit/job-vocabulary.test.tsx`

**Interfaces:**
- Consumes: `StageVocabulary`, `columnFor`, `visibleKinds`, `MIDDLE_KINDS`.
- Produces: `vocabulary: StageVocabulary` prop on `EditStagesDialog` and `StageDetailSheet`.

- [ ] **Step 1: Write the failing tests**

```ts
it("Edit stages offers only visible middle kinds, titled by the pack")        // hidden-kind fixture: three options
it("Add a stage keeps Saved, Applied and Offer out of the list")
it("moving from the stage sheet announces the pack's column title")
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/job-vocabulary.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`edit-stages-dialog.tsx` builds its option list and item map inside the component from the prop. `ADDABLE_STAGE_KINDS` in `stage-forms.ts` stays the Zod enum for the server (all four kinds), so a hidden kind is still accepted by the action, as the spec requires of `lib/pipeline`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit && pnpm typecheck && pnpm lint`
Expected: PASS. `rg "STAGE_KINDS|columnTitle\(" app components lib` returns nothing.

- [ ] **Step 5: Commit**

```bash
git add components/job "app/(app)/jobs" tests
git commit -m "feat(packs): job page stage dialogs and announcements use the vocabulary"
```

**Acceptance:**
1. Spec 5.1: edit stages and move announcements use the pack.
2. `rg "STAGE_KINDS" app components lib` is empty, so no role-specific constant remains.
3. Spec 5.4: Edit stages after a switch uses the new pack at once.

---

### Task 11: Seniority superset and Preferences

**Files:**
- Modify: `lib/preferences/schema.ts` (`SENIORITY_VALUES` nine values; `GENERIC_SENIORITY_LABELS`; remove `SENIORITY_LEVELS`; `storedDocumentSchema` and `preferencesInputSchema` use the superset), `lib/preferences/summary.ts` (generic labels), `components/preferences/preferences-form.tsx` (`levels` and stored-outside values), `app/(app)/preferences/page.tsx` (load the active pack)
- Test: `tests/unit/preferences-schema.test.ts` (existing file name; add cases), `tests/unit/preferences-seniority.test.tsx`, `tests/integration/preferences.test.ts`

**Interfaces:**
- Consumes: `getActivePack`, `Pack["seniority"]`.
- Produces: the Contract's "Seniority" block; `PreferencesForm` gains `levels: { value: Seniority; label: string }[]` (the pack's list, in its order); the form renders those plus every stored value outside them, labeled by `GENERIC_SENIORITY_LABELS`, checked, until the user unchecks it.

- [ ] **Step 1: Write the failing tests**

```ts
it("the preferences document still reads version 1 and accepts all nine values")
it("parsePreferences keeps 'lead' and 'junior' and drops 'intern'")
it("preferencesInputSchema accepts the nine values and rejects 'intern' with 'Pick from the listed levels.'")
it("the scoring summary uses generic labels: 'Seniority: Senior, Manager' for ['senior','manager']") // equals the Task 1 scorePrompt text
it("a stored value outside the pack's list still shows, checked")    // pack levels [junior, mid]; stored ['mid','lead']: 3 toggles, 'Lead' pressed
it("unchecking an outside value removes it on save")
it("preferences read across packs: values stored under one pack stay intact after the pack changes") // integration
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/preferences-seniority.test.tsx tests/unit/preferences-schema.test.ts tests/integration/preferences.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`GENERIC_SENIORITY_LABELS`: junior `Junior`, mid `Mid`, senior `Senior`, staff `Staff`, principal `Principal`, lead `Lead`, manager `Manager`, director `Director`, executive `Executive`. The document version stays `PREFERENCES_VERSION = 1`. The form's toggle group `value` state starts from the stored list, which already includes outside values.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration/preferences.test.ts tests/unit/product-design-baseline.test.ts --ci && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/preferences components/preferences "app/(app)/preferences" tests
git commit -m "feat(packs): nine-value seniority superset with per-pack level lists"
```

**Acceptance:**
1. Spec 4: `SENIORITY_VALUES` with the document version still 1.
2. Spec 5.4: Preferences shows the new list plus any stored value outside it, still checked, until removed.
3. Task 1's `scorePrompt` snapshot still matches (README decision on generic labels).

---

### Task 12: Addenda, `fit.pack` and event meta

**Files:**
- Create: `lib/packs/prompts.ts`
- Modify: `lib/ai/extract-posting.ts` (`context.addendum`), `lib/ai/score-fit.ts` (`context.addendum`), `lib/intake/resolve.ts` (input `addendum`), `lib/intake/add-job.ts` (load the pack, pass the addendum), `lib/fit/score-opportunity.ts` (pass the addendum, store `pack`), `lib/fit/test-posting.ts` (pass the addendum, store nothing), `lib/fit/stored.ts` (`pack` optional field, `toStoredFit(result, modelId, scoredAt, pack?)`), `lib/pipeline/create.ts` (`created` event `meta: { pack }`)
- Test: `tests/unit/pack-prompts.test.ts`, `tests/unit/extract-posting.test.ts` and `tests/unit/score-fit.test.ts` (new cases), `tests/integration/fit-score-opportunity.test.ts`, `tests/integration/intake-add-job.test.ts`, `tests/integration/pipeline-create.test.ts`

**Interfaces:**
- Consumes: `getActivePack`, `packRef`, `withAddendum`.
- Produces: `extractPosting(driver, text, format, context: { userId: string; addendum?: string })`; `scoreFit(driver, input, context: { userId: string; addendum?: string })`; `resolvePosting(input: { url?: string; text?: string; userId: string; addendum?: string }, deps)`; `storedFitSchema.pack` as `z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*@[1-9][0-9]{0,3}$/).optional().catch(undefined)`; the `created` event's `meta.pack` is `"<id>@<version>"`.

- [ ] **Step 1: Write the failing tests**

```ts
it("withAddendum appends after exactly one blank line")           // ("A", "B") === "A\n\nB"
it("withAddendum with an empty or blank addendum returns the instructions unchanged")
it("withAddendum trims the addendum")
it("extractPosting under product design sends the baseline instructions")   // equals Task 1 snapshot text
it("extractPosting with an addendum sends instructions + blank line + addendum, and the user text stays inside <posting>")
it("scoreFit likewise; the fake driver records the addendum")              // spec section 9 Milestone 34 done-when reads this
it("scoring after a switch uses the new addendum and stores fit.pack as 'valid-minimal@1'")  // PGlite; pack fixture with scoreFit addendum "Weigh X."
it("a retry after a switch records the new pack in fit.pack")
it("a stored fit without pack still parses; a fit with a malformed pack string parses with pack undefined")
it("addJob extracts with the active pack's extractPosting addendum")
it("the created event meta carries the pack ref")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/pack-prompts.test.ts tests/integration/fit-score-opportunity.test.ts tests/integration/intake-add-job.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`instructions: withAddendum(EXTRACT_INSTRUCTIONS, context.addendum ?? "")` (and the score equivalent). `scoreOpportunity` reads `const active = await getActivePack(s)` once and passes `active.pack.prompts.scoreFit`; it writes `toStoredFit(outcome.fit, modelId, deps.now(), packRef(active.pack))`. `FIT_VERSION` stays 1. `addJob` reads the pack with `getActivePack(s)` before `resolvePosting`. Nothing is rescored by a switch.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run --ci && pnpm typecheck`
Expected: PASS, Task 1 snapshots unchanged.

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(packs): addenda in extraction and scoring, fit.pack and created event meta"
```

**Acceptance:**
1. Spec 5.2: an empty addendum appends nothing, so product design reproduces today's prompts exactly; user text stays inside the tagged data block.
2. Spec 4: `opportunity.fit.pack` optional, `FIT_VERSION` still 1; `created` meta gains `pack`.
3. Spec 5.4: new scores, retries and test-box scores use the new addendum; nothing is rescored.

---

### Task 13: `choosePack` and the setup select

**Files:**
- Create: `lib/packs/choose.ts`
- Modify: `app/(auth)/setup/page.tsx` (list installed packs), `app/(auth)/setup/setup-form.tsx` (select), `app/(auth)/setup/actions.ts` (validate and choose)
- Test: `tests/integration/pack-choose.test.ts`, `tests/unit/setup-action.test.ts`, `tests/unit/setup-form.test.tsx`

**Interfaces:**
- Consumes: `getRegistry`, `s.profile.setPack`, `Result`.
- Produces: `choosePack(s, packId)` per the Contract; plan copy for the unknown id: `That role pack is not installed here.`; the select's form field name `packId`; setup error `Pick one of the listed role packs.`

- [ ] **Step 1: Write the failing tests**

```ts
it("choosePack updates both columns in one statement and returns the pack's version") // pack version 2 fixture: stored pack_version 2
it("choosePack with an unknown id returns unknown_pack and writes nothing")
it("choosePack creates the profile row when none exists")
it("switching back to product design stamps version 1")
it("setupAction with an unknown packId returns the error and creates no account")  // mocked auth.api.signUpEmail not called
it("setupAction with a valid packId creates the account then calls choosePack")
it("setupAction with no packId keeps product design")                              // skipping is the default
it("the setup form shows 'Roles you're looking for' as a select defaulting to Product design, listing every installed pack's name")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/pack-choose.test.ts tests/unit/setup-action.test.ts tests/unit/setup-form.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`choosePack`: registry `get(packId)`; missing gives `fail("unknown_pack", "That role pack is not installed here.")`; else `ok({ packId, packVersion: loaded.pack.version })` after `s.profile.setPack`. The setup page reads `getRegistry().list()` and passes `{ id, name, description }[]`. Use `components/ui/select.tsx` with `items`. Validate the id against the registry before calling `signUpEmail`; after `scopedFor(userId).profile.upsert({})` call `choosePack(scopedFor(userId), packId)`. `/setup` stays reachable without a session; it takes no new token.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/pack-choose.test.ts tests/unit/setup-action.test.ts tests/unit/setup-form.test.tsx && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/packs/choose.ts "app/(auth)/setup" tests
git commit -m "feat(packs): choosePack as the single writer and a role select on /setup"
```

**Acceptance:**
1. Spec 5.4: `/setup` gains "Roles you're looking for", a select of installed packs defaulting to product design; `choosePack` updates both columns in one statement; an unknown id returns `unknown_pack`.
2. Spec 3: `lib/packs/choose.ts` is the sole writer of the pack columns.
3. The existing first-run spec path (no choice made) still creates a product design account.

---

### Task 14: Settings pack section, switch dialog and notices

**Files:**
- Create: `components/settings/pack-section.tsx`, `components/settings/pack-switch-dialog.tsx`
- Modify: `app/(app)/settings/page.tsx` (load `getActivePack`, registry list, outside-seniority map), `app/(app)/settings/actions.ts` (`choosePackAction(packId: string): Promise<Result<{ packId: string; packVersion: number }, "unknown_pack" | "invalid">>`), `components/settings/profile-section.tsx` (place the Role pack list inside the Profile section)
- Test: `tests/unit/pack-switch-dialog.test.tsx`, `tests/unit/settings-pack-actions.test.ts`

**Interfaces:**
- Consumes: `choosePack`, `packNotices`, `vocabularyOf`, `visibleKinds`, `labelFor`, `GENERIC_SENIORITY_LABELS`, base-nova `dialog` and `radio-group`.
- Produces: `choosePackAction`: `requireUser`, `z.string().safeParse(packId)`, `choosePack`, then `revalidatePath("/", "layout")`. Props: `PackSection { packs: { id; name; description; stages: { label: string }[]; outsideSeniority: string[] }[]; activeId: string; notices: PackNotice[] }`.

- [ ] **Step 1: Write the failing tests**

```ts
it("lists each pack's name and description under 'Role pack' and marks the active one")
it("opening another pack shows the new template as a list of its visible stage labels in kind order")
it("shows 'Board columns are renamed now' and 'Jobs you already have keep their stages, scores and documents'")
it("shows a seniority line when stored values fall outside the new list")    // plan copy: "Your saved seniority choices Junior and Lead are not in this pack's list. They stay checked until you remove them."
it("omits the seniority line when none fall outside")
it("Cancel closes without calling the action; Switch calls it once with the pack id")
it("the updated notice shows 'The Software engineering pack was updated to version 2.' with its template, and Dismiss stamps the version") // Dismiss calls choosePackAction with the active id
it("the missing notice shows \"The role pack 'sales' is not installed here. Using Product design until it is.\"")
it("choosePackAction requires the user, rejects an unknown id and revalidates the layout")
it("announces 'Role pack changed to <name>.' through useAnnounce after a switch")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/pack-switch-dialog.test.tsx tests/unit/settings-pack-actions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

The dialog follows the existing confirm dialogs in `components/job/` (focus return, `submitViaTransition` from `lib/forms/submit.ts`). The page computes `outsideSeniority` per pack on the server from `parsePreferences(profile.preferences).seniority` minus that pack's `seniority` values, mapped through `GENERIC_SENIORITY_LABELS`. Picking a pack opens the dialog; the radio list is the keyboard path.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/settings "app/(app)/settings" tests
git commit -m "feat(packs): Role pack section, switch dialog and update and missing notices in Settings"
```

**Acceptance:**
1. Spec 5.4: Settings Profile section lists each pack's name and description; the dialog shows the new template, the two fixed lines, a seniority line when needed, Cancel and Switch.
2. Spec 5.4: the update notice shows once and dismissing or switching stamps the current version; the missing-pack notice text matches.
3. Spec 8 accessibility: axe zero violations and a keyboard-only switch (asserted in Task 16).

---

### Task 15: Export and context frontmatter

**Files:**
- Modify: `lib/export/collect.ts` (`profile.pack { id, version }`, `EXPORT_VERSION` plus one), `lib/bridge/context.ts` (`ContextInput.pack: string`, frontmatter line), `lib/bridge/handlers.ts` (line 107 caller passes `packRef(active.pack)` from `getActivePack(s)`)
- Modify tests: `tests/integration/export.test.ts`, `tests/unit/bridge-context.test.ts`, `tests/integration/bridge-handlers.test.ts`
- Test: same files

**Interfaces:**
- Consumes: `packRef`, `getActivePack`.
- Produces: export `profile.pack: { id: string; version: number }` (null profile stays null); context frontmatter line `pack: <id>@<version>` placed after `current_stage_kind:` and before `generated:`; the document stays `jobsmith: context/v1`.

- [ ] **Step 1: Write the failing tests**

```ts
it("export profile.pack is { id: 'product-design', version: 1 } for a default account")
it("export carries the stored pack id and version, even when the pack is not installed")  // stored, not resolved
it("EXPORT_VERSION is one higher than before this task")                                   // compare to the literal recorded in the test: previous + 1
it("the context frontmatter has 'pack: product-design@1' between current_stage_kind and generated")
it("the context uses the fallback pack's ref when the stored pack is not installed")
it("the context document still starts with 'jobsmith: context/v1'")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/export.test.ts tests/unit/bridge-context.test.ts tests/integration/bridge-handlers.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Read `EXPORT_VERSION` on the branch when the task starts (1 on Core today) and set it to that value plus one; later cycles add their own increments in their own plans, and rebasing resolves the sum. The CLI's context parser (`cli/src/frontmatter.ts`) must ignore the new line; add a case in its test.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/export.test.ts tests/unit/bridge-context.test.ts tests/integration/bridge-handlers.test.ts tests/unit/cli-frontmatter.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/export lib/bridge cli tests
git commit -m "feat(packs): pack in the export and the context frontmatter"
```

**Acceptance:**
1. Spec 4: export adds `profile.pack { id, version }` and its version goes up by one; context gains `pack: <id>@<version>` and stays `context/v1`.
2. Spec 8 integration: the context frontmatter and export additions are tested.
3. The `## Question bank conventions` section is left to Task 25.

---

### Task 16: End to end, docs and ship

**Files:**
- Create: `tests/e2e/packs.spec.ts`, `tests/fixtures/packs/e2e/northwind-fixture.json` (id `fixture-pack`, name `Fixture pack`, `portfolio_case` label `Craft review` column `Craft`, `panel_final` label `Final loop` column `Final`, product design's other values and seniority, fictional, no copy of a real pack)
- Modify: `playwright.config.ts` (add `packs` to the chromium, webkit and phone `testMatch`; add `PACKS_DIR=tests/fixtures/packs/e2e` to the `webServer` command), `tests/e2e/first-run.spec.ts` (assert the setup select defaults to Product design), `.env.example` (`PACKS_DIR` block), `README.md` (Role packs section: choosing, switching, adding a file, `PACKS_DIR`), `docs/design-system.md` (setup select and switch dialog reuse `base-nova` `select`, `radio-group` and `dialog`)
- Test: `tests/e2e/packs.spec.ts`

**Interfaces:**
- Consumes: Tasks 1 to 15, `scanOpenOverlay`, `axe` helper in `tests/e2e/axe.ts`.
- Produces: the milestone's proof.

- [ ] **Step 1: Write the failing specs**

```ts
// packs.spec.ts (Chromium, WebKit and phone; one shared account; fixtures named with project plus suffix)
test("Settings lists Product design and the fixture pack, Product design active")
test("switching shows the dialog copy, then renames board columns, while existing jobs keep their stages and gain chips")
test("a new job after the switch starts in Saved and moving it to the portfolio column shows 'Craft review'")
test("Preferences shows the pack's seniority list")
test("a keyboard-only switch: open, choose, Tab to Switch, Enter; focus returns to the section")
test("axe: setup, Settings pack section and the switch dialog, light and dark")   // setup in first-run spec
test("switching back restores the product design columns and keeps every job")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm test:e2e --grep "packs"`
Expected: FAIL, fixture pack not offered until the `webServer` env is changed.

- [ ] **Step 3: Wire config, docs and fixture**

After the specs pass, run the full verification: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` and `git diff --exit-code main -- tests/unit/__snapshots__/product-design-baseline.test.ts.snap tests/integration/__snapshots__/product-design-seed-baseline.test.ts.snap` (no output).

- [ ] **Step 4: Preview check**

Push the branch and open the Vercel preview. In Chrome and Safari: switch Settings to a pack through a `PACKS_DIR` set on the preview project (the owner sets it; if not set, the preview shows product design only and the check is recorded as partial); confirm renamed columns, chips on older cards, and the boot failure with a deliberately broken file locally (`PACKS_DIR` pointing at a folder holding a 25-character column) printing `PackError: broken.json: ...` and exiting. Record both in the pull request.

- [ ] **Step 5: Commit**

```bash
git add tests playwright.config.ts .env.example README.md docs/design-system.md
git commit -m "test(packs): end to end for the pack engine, docs and design system notes"
```

**Acceptance:**
1. Spec section 9 Milestone 33 done-when: snapshot diff is empty; switching renames columns, keeps stages, adds chips; a `PACKS_DIR` file appears in Settings after restart; a broken file stops boot naming it.
2. Spec 8 End to end and Accessibility: Chromium, WebKit and phone; axe in light and dark; keyboard-only switch.
3. `rg "STAGE_KINDS|SENIORITY_LEVELS" app components lib scripts` returns nothing.
4. Left out and named in the pull request: Hosted `ROLE_PACK` lines, `work_request.pack_id`, Feed's scoring addendum call, the product design title suggestion lists.
