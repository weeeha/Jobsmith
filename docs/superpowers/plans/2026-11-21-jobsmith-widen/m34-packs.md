# Milestone 34: Packs

**Done when (spec section 9):** "A new account set up with the software engineering pack gets Technical interview and Onsite loop on a new job, its seniority list and title chips on Preferences, and the fake AI driver records the scoring addendum; `pnpm seed --pack data` makes six data jobs with no pay figures."

**Branch:** `feat/m34-packs`, cut from `main` after milestone 33 has merged. Tasks 17 to 26. Contract: `README.md`.

**Before starting:** run these; every `test` must succeed.

```bash
test -f lib/packs/schema.ts && test -f lib/packs/registry.ts && test -f lib/packs/choose.ts && test -f lib/packs/active.ts
test -f packs/product-design.json && test -f packs/pack-hashes.json && test -f instrumentation.ts
```

If any fails, milestone 33 has not merged: stop. Four tasks have a second dependency. Check each before its task and skip the task, naming it in the pull request, when the check fails:

```bash
test -d "app/(app)/welcome" && test -d "app/(auth)/signup"        # Task 22 (hosted milestones 11 and 12)
test -d lib/generate/tasks                                          # Task 23 (hosted milestone 13)
test -d lib/requests && test -f lib/requests/bundle.ts              # Task 24 (bridge-two milestone 31)
test -d components/prep                                             # Task 25 "Copy a template" (prep milestone 6)
```

Feed's `titlesExclude` field (feed milestone 16) is left out the same way: `titleExcludeSuggestions` stays in the pack files and is read when that field exists.

The three new packs' copy is **not in this plan**. Suggestion lists, addenda and section names are written by the owner with one practitioner per role, reviewed before merge (README item 1); Task 19 holds the review gate and the schema-valid fixture pack, Task 20 puts the reviewed copy into the files.

---

### Task 17: Pack seeds and `seed --pack`

**Files:**
- Create: `lib/packs/seed.ts`
- Modify: `lib/demo/seed-jobs.ts` (becomes a thin wrapper), `lib/demo/create.ts` (headline from the pack seed), `scripts/seed.ts` (`--pack <id>`), `tests/integration/product-design-seed-baseline.test.ts` (flip one assertion only)
- Test: `tests/integration/pack-seed.test.ts`, `tests/unit/seed-args.test.ts`

**Interfaces:**
- Consumes: `Pack["seed"]`, `getRegistry`, `choosePack`, `createOpportunity`, `placeOpportunity`, `scheduleStage`, `addPersonToOpportunity`, `addNote`, `closeOpportunity`, `Result`.
- Produces: `seedPackJobs(s: Scoped, packId: string, now?: Date): Promise<Result<{ jobs: number }, "unknown_pack" | "no_seed">>`; `seedJobs(s: Scoped): Promise<void>` keeps its signature and calls `seedPackJobs(s, "product-design")`, throwing on a failure; `parseSeedArgs(argv: string[]): { pack: string }` in `scripts/seed-args.ts` (default `product-design`; `--pack <id>`; any other argument throws `Error("Unknown argument: <arg>")`).

- [ ] **Step 1: Write the failing tests**

```ts
// pack-seed.test.ts (PGlite; withRegistry for fixture packs)
it("seeds the six product design jobs with no pay values")            // compMin, compMax, compCurrency all null on every row
it("places each job in its seed stage and closes the closed ones with their reason")
it("schedules a call inDays after now with its format")                // now fixed; scheduledAt === now + 3 days for inDays 3
it("adds each seed person with role and title and each note")
it("uses the pack's own stage labels")                                 // fixture pack seeded: the portfolio_case job's stage label is the fixture's
it("switches the profile to the seeded pack before creating jobs")     // getActivePack after the call is that pack
it("returns no_seed with \"The pack 'sales' has no demo data.\" for a pack without a seed")
it("returns unknown_pack for an id that is not installed")
// seed-args.test.ts
it("defaults to product-design"); it("reads --pack data"); it("throws on an unknown argument")
// product-design-seed-baseline.test.ts: the 'two seeded jobs carry pay today' case becomes
// it("no seeded job carries pay") { expect(rows.filter(r => r.compMin !== null || r.compMax !== null).length).toBe(0) }
// the snapshot case stays byte-for-byte as taken in Task 1 (it excludes comp fields on purpose)
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/pack-seed.test.ts tests/unit/seed-args.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

Per seed job: `createOpportunity(s, { companyName, roleTitle, location, workMode })` (no pay keys, spec 5.2 and 11 item 14), `placeOpportunity` unless the stage is `saved`, `scheduleStage` against the stage row of that kind (`s.stage.listForOpportunity`), people, notes, then `closeOpportunity` last. `scripts/seed.ts` resolves the pack through `getRegistry()` (so `PACKS_DIR` files work), sets the profile headline from `pack.seed.headline`, and prints `Seeded <n> fictional jobs for the <name> pack.`; on `no_seed` it prints the message and exits 1; on an unknown pack it prints `Unknown pack '<id>'. Installed: <ids>.` and exits 1. The resume text of today's script is unchanged.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration tests/unit/seed-args.test.ts --ci && pnpm typecheck`
Expected: PASS, the Task 1 snapshot files unchanged.

- [ ] **Step 5: Commit**

```bash
git add lib/packs/seed.ts lib/demo scripts tests
git commit -m "feat(packs): pack seeds, seed --pack, and no pay in demo data"
```

**Acceptance:**
1. Spec 5.2 and 5.4: `pnpm seed --pack <id>` seeds a demo account with that pack; a seedless pack exits 1 with the fixed message.
2. Spec 11 item 14: the product design demo data loses its two pay ranges and nothing else changes (snapshot file untouched).
3. Spec 8 integration: six jobs, no pay values, stages placed.

---

### Task 18: `packs-check`

**Files:**
- Create: `lib/packs/check.ts`, `scripts/packs-check.ts`
- Modify: `package.json` (`"packs:check": "tsx scripts/packs-check.ts"`)
- Test: `tests/unit/pack-check.test.ts`

**Interfaces:**
- Consumes: `parsePack`, `PACK_MAX_BYTES`, `vocabularyOf`, `visibleKinds`, `labelFor`.
- Produces: `checkPackText(fileName: string, text: string, options: { repo: boolean }): { ok: true; lines: string[] } | { ok: false; lines: string[] }`; `export const NON_PACK_FILES = ["schema.json", "pack-hashes.json", "reviews.json"] as const`. CLI: `pnpm packs:check <file>` checks one file; `pnpm packs:check --repo` with no file checks every `packs/*.json` except `NON_PACK_FILES`; exit 1 on any failure.

- [ ] **Step 1: Write the failing tests**

```ts
it("a valid file prints the template, the levels and the counts and returns ok")
// lines: "<id>: <name> (version <n>)", "Template: Saved, Applied, Recruiter screen, ...", "Levels: Junior, Mid, ...", "Questions: recruiter_screen 10, hiring_manager 12, portfolio_case 8, panel_final 12"
it("an invalid file returns every issue as '<file>: <path>: <message>' and not ok")
it("a file over 64 KB fails with 'file: at most 65536 bytes'")
it("invalid JSON fails with 'file: not valid JSON'")
it("repo mode refuses a seedless file with '<file>: seed: required for a pack in packs/'")
it("without repo mode a seedless file passes")                             // operator pack
it("repo mode on valid-full.json passes")                                  // fixture from Task 19; until then valid-minimal
it("the template line lists only visible kinds")                           // hidden-kind fixture
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/pack-check.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`checkPackText` is pure; the script reads files and calls it. Exit codes: 0 all ok, 1 any failure. The same function is bundled for the image command in Task 31.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/pack-check.test.ts && pnpm typecheck && pnpm packs:check --repo`
Expected: PASS; the last command prints the product design summary (its seed is present since Task 4).

- [ ] **Step 5: Commit**

```bash
git add lib/packs/check.ts scripts/packs-check.ts package.json tests
git commit -m "feat(packs): packs-check with a repo mode that requires a seed"
```

**Acceptance:**
1. Spec 5.5: prints the template, levels and counts and exits 1 on failure.
2. Spec 5.2: `packs-check --repo` requires a seed; a `PACKS_DIR` file may leave it out.
3. CI step for `pnpm packs:check --repo` is added to `.github/workflows/ci.yml` in Task 26.

---

### Task 19: Review gate and the full fixture pack

**Files:**
- Create: `packs/reviews.json` (`{}`), `lib/packs/review.ts`, `tests/fixtures/packs/valid-full.json`, `tests/unit/pack-review-gate.test.ts`
- Modify: `scripts/packs-hash.ts` (`--review <id> --role "<text>" --pr <number>` writes an entry), `package.json` (`"packs:review": "tsx scripts/packs-hash.ts --review"`)
- Test: `tests/unit/pack-review-gate.test.ts`

**Interfaces:**
- Consumes: `builtinPacks`, `BUILTIN_PACK_FILES`, the hash function of `scripts/packs-hash.ts`.
- Produces: `type PackReview = { reviewedVersion: number; contentHash: string; reviewerRole: string; recordedIn: string }`; `reviewGateProblems(reviews: Record<string, PackReview>, packs: { pack: Pack; sha256: string }[], exempt: readonly string[]): string[]`. Problem strings: `<id>: no review recorded`, `<id>: reviewed version <n> but the pack is version <m>`, `<id>: content changed since the review`, `<id>: reviewer role is empty`, `<id>: recordedIn must look like #123`. The exempt list is `["product-design"]`, because it is today's behavior.

- [ ] **Step 1: Write the failing tests**

```ts
it("returns no problems for the real repo today")                        // only product-design exists; reviews.json is {}
it("flags a built-in with no entry as '<id>: no review recorded'")        // planted fake pack
it("flags a version mismatch, a changed hash, an empty role and a bad recordedIn")
it("exempts product-design")
it("valid-full.json passes parsePack and packs-check --repo with every optional field present") // headline, 8 jobs? six jobs with schedule, people, notes, closed; all prompts non-empty fixture text such as 'Fixture addendum, tests only.'; 12 suggestions
it("valid-full.json carries no pay field and no company other than Northwind Traders or other fictional names")
```

The fixture pack uses `id` `valid-full`, filler text that says plainly it is test data, fictional companies, no pay.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/pack-review-gate.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`packs/reviews.json` entries are written only by `pnpm packs:review <id> --role "Senior data analyst" --pr 31` after a practitioner has read the file; the command fills `reviewedVersion` and `contentHash` from the file, so a later edit shows as `content changed since the review`. The reviewer's name is not stored, only their role.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/pack-review-gate.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packs/reviews.json lib/packs/review.ts scripts/packs-hash.ts tests package.json
git commit -m "test(packs): review gate for built-in packs and a schema-valid fixture pack"
```

**Acceptance:**
1. Spec 5.3 and 11 item 1: copy is reviewed by one person who works in the role before merge; the gate fails a built-in without a matching review.
2. The fixture pack exercises every optional field for later tasks' tests.
3. Task 20 cannot merge until its three entries exist.

---

### Task 20: The three pack files

**Files:**
- Create: `packs/software-engineering.json`, `packs/product-management.json`, `packs/data.json`
- Modify: `lib/packs/builtin.ts` (add the three imports to `BUILTIN_PACK_FILES`), `packs/pack-hashes.json` (via `pnpm packs:hash`), `packs/reviews.json` (via `pnpm packs:review`, by the owner or a maintainer), `packs/product-design.json` (add `prep.sections` and suggestion lists only if the owner has supplied them, with a version bump to 2 and `pnpm packs:hash`)
- Test: `tests/unit/pack-builtin-table.test.ts`, `tests/integration/pack-seeds.test.ts`

**Blocked on:** the practitioner-reviewed copy (README item 1) for `titleSuggestions`, `titleExcludeSuggestions`, `prompts.*`, `prep.sections` and the six-job `seed`, supplied by the owner as one JSON fragment per pack. Steps 1 and 2 run now. Step 3 waits for the fragments. The plan holds no pack copy.

**Interfaces:**
- Consumes: spec 5.3's table, `parsePack`, `builtinPacks`, `seedPackJobs`.
- Produces: three built-in packs registered by id `software-engineering`, `product-management`, `data`, each `version: 1`.

- [ ] **Step 1: Write the failing tests**

```ts
// pack-builtin-table.test.ts: one row per pack, values from spec 5.3 (structure, not copy)
// id; name; portfolio_case label/column; panel_final label/column; seniority [value:label...]; counts screen/manager/case/panel
// software-engineering | Software engineering | Technical interview / Technical | Onsite loop / Onsite / final | junior:Junior mid:Mid senior:Senior staff:Staff principal:Principal manager:Engineering manager director:Director | 10, 12, 10, 12
// product-management   | Product management   | Product case / Case / exercise  | Final loop / Panel / final   | junior:Associate mid:Mid senior:Senior lead:Group or lead principal:Principal director:Director | 10, 12, 8, 12
// data                 | Data                 | Take-home / Technical / case    | Final loop / Panel / final   | junior:Junior mid:Mid senior:Senior staff:Staff principal:Principal manager:Manager director:Director | 10, 12, 8, 12
it.each(rows)("%s matches the spec table")
it("all four keep Recruiter screen (column Recruiter) and Hiring manager")
it("no shipped pack hides a kind")
it("every shipped pack has a seed of exactly six jobs with no pay, a scheduled call, a person, a note and a closed job")
it("every shipped pack's prompts.extractPosting and prompts.scoreFit stay within 1000 characters, generate fields and callCard and research within 1500")
it("every shipped pack passes packs-check --repo")
it("with software engineering active, scoreOpportunity under the fake driver records instructions ending with that pack's scoreFit addendum") // PGlite; the done-when sentence about the recorded addendum
it("the review gate passes for all three")                       // reviews.json has entries; fails until the owner records them
// pack-seeds.test.ts (PGlite): for each of the four built-ins, seedPackJobs gives six jobs, no pay, stages placed, and the middle-kind job's stage label is that pack's label
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/pack-builtin-table.test.ts tests/integration/pack-seeds.test.ts`
Expected: FAIL, the three files do not exist.

- [ ] **Step 3: Write the files from the supplied fragments**

Take the structure fields (stages, seniority, `prep.questionCounts`, `schema`, `id`, `version`, `name`) from the table in spec 5.3; `description` (up to 160 characters) and every copy field verbatim from the owner's fragment. When a fragment exceeds a limit, return it to the owner with the issue; do not shorten it. The spec's example scoring addendum for software engineering is the reviewer's starting point and is not an instruction to this task. Add the three imports, run `pnpm packs:hash`, run `pnpm packs:check --repo`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration/pack-seeds.test.ts && pnpm typecheck`
Expected: PASS once the owner has recorded the reviews with `pnpm packs:review <id> --role "<role>" --pr <number>`.

- [ ] **Step 5: Commit**

```bash
git add packs lib/packs/builtin.ts tests
git commit -m "feat(packs): software engineering, product management and data packs"
```

**Acceptance:**
1. Spec 5.3: labels, columns, levels and counts equal the table; Saved, Applied and Offer unchanged.
2. Spec 5.2: each pack ships a fictional seed, so `packs-check --repo` is green.
3. Spec 11 item 1 and 5.14: the review gate shows one recorded review per new pack.

---

### Task 21: Suggestion chips on Preferences

**Files:**
- Modify: `components/chip-field.tsx` (`suggestions?: readonly string[]`), `components/preferences/preferences-form.tsx` (pass `suggestions` to the Title keywords field), `app/(app)/preferences/page.tsx` (pass `active.pack.titleSuggestions`)
- Test: `tests/unit/chip-field.test.tsx` (new cases), `tests/unit/preferences-form.test.tsx` (new cases)

**Interfaces:**
- Consumes: `getActivePack`, `Pack["titleSuggestions"]`.
- Produces: `ChipFieldProps.suggestions`. While the field holds no chips and the text input is empty, a row of buttons labeled by each suggestion sits under the field inside a group with `aria-label="Suggestions"`; pressing one adds it as a chip (same `commit` path as typing) and the row disappears. Plan decision: spec 5.1 says chips "under an empty field", so the row shows only while empty.

- [ ] **Step 1: Write the failing tests**

```ts
it("shows suggestion buttons under an empty field")
it("pressing a suggestion adds it as a chip and submits it as a hidden input named by the field")
it("hides the suggestions once the field has a chip or typed text")
it("shows nothing when the suggestions list is empty")                       // product design's lists are empty until the owner supplies them
it("respects the 20-entry rule: a suggestion already present is not added twice")
it("suggestions are keyboard reachable in tab order after the text input")
it("the Preferences form passes the pack's title suggestions to Title keywords only")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/chip-field.test.tsx tests/unit/preferences-form.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Reuse `components/chip-field.tsx` as spec section 10 says; buttons use `Button` `variant="outline"` size small with token classes only. Feed's `titlesExclude` field takes `titleExcludeSuggestions` when it exists (left out, named in the pull request).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit && pnpm typecheck && pnpm check:tokens`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components "app/(app)/preferences" tests
git commit -m "feat(packs): one-tap title suggestion chips under an empty Preferences field"
```

**Acceptance:**
1. Spec 5.1: the pack's suggestions appear as one-tap chips under an empty field on Preferences.
2. Spec 5.3: the chips also appear for product design when its list is non-empty; nothing it already shows changes while empty.
3. Spec 8 accessibility: axe zero (asserted in Task 26).

---

### Task 22: Welcome pack step and `?pack=`

**Files:**
- Modify: `app/(auth)/signup/*` (from 2026-11-21-jobsmith-hosted milestone 11; action reads `pack`), `app/(app)/welcome/*` (from 2026-11-21-jobsmith-hosted milestone 12; first step: one card per pack before the resume), `app/(auth)/signup/page.tsx` (from 2026-11-21-jobsmith-hosted milestone 11; `searchParams.pack` preselects the hidden field)
- Test: `tests/unit/signup-pack.test.ts`, `tests/unit/welcome-pack-step.test.tsx`, `tests/e2e/welcome-pack.spec.ts` (hosted instance only; skipped unless `HOSTED` is set by the spec's own `test.skip`)

**Blocked on:** hosted milestones 11 and 12 merged (`/signup`, `/welcome`). Skip and name in the pull request when absent. **Files** below are the spec's own module-map paths; open the hosted plan's files first and use their real names.

**Interfaces:**
- Consumes: `choosePack`, `getRegistry().list()`, `packNotices`.
- Produces: the signup action calls `choosePack(scopedFor(userId), packId)` for a valid `pack` value and ignores an invalid one (the account is still created, product design stays); the welcome step shows one card per installed pack (name and description), the stored pack preselected, "Skip for now" keeps it; a card press calls `choosePackAction` (Task 14).

- [ ] **Step 1: Write the failing tests**

```ts
it("/signup?pack=data preselects data and the action stores it for the new user")
it("an unknown ?pack value is ignored and the account keeps product design")
it("the welcome page lists one card per installed pack before the resume step")
it("skipping keeps the stored pack")
it("packs are the same on every plan")                                       // no plan check anywhere in the step
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/signup-pack.test.ts tests/unit/welcome-pack-step.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`/welcome` step order becomes pack, resume upload or paste, review, save; the existing steps are not reworked. `pack` stays out of URLs after sign-up (no personal data in query strings).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(auth)/signup" "app/(app)/welcome" tests
git commit -m "feat(packs): pack step on /welcome and ?pack= on /signup"
```

**Acceptance:**
1. Spec 5.4: Hosted `/welcome` gains a first step with one card per pack before the resume; `/signup?pack=<id>` preselects one; skipping keeps product design.
2. Spec 5.4: packs are the same on every plan.
3. A self-hosted instance with `HOSTED` unset is unchanged.

---

### Task 23: Hosted audience lines, counts and sections

**Files:**
- Modify: `lib/generate/tasks/fit-brief.ts`, `lib/generate/tasks/tailored-cv.ts`, `lib/generate/tasks/cover-letter.ts`, `lib/generate/tasks/question-bank.ts` (all from 2026-11-21-jobsmith-hosted milestone 13; each replaces its `ROLE_PACK` constant with a prompt-builder input), `lib/generate/start.ts` (from 2026-11-21-jobsmith-hosted milestone 13; loads the active pack, passes the addenda and counts, writes `pack` into `generation.inputs`), the `extract_resume` module (from 2026-11-21-jobsmith-hosted milestone 12; levels from the pack), `packs/product-design.json` (the former `ROLE_PACK` lines moved verbatim into `prompts.generate`; version 2; `pnpm packs:hash`)
- Test: hosted's prompt snapshot tests (unchanged files), `tests/unit/generate-pack.test.ts`, `tests/integration/generate-pack.test.ts`

**Blocked on:** hosted milestone 13 (`lib/generate/tasks/*`) and milestone 12 (`extract_resume`). Skip and name in the pull request when absent. The file names below are the spec's (`fit-brief`, `tailored-cv`, `cover-letter`, `question-bank`); open them first.

**Interfaces:**
- Consumes: `getActivePack`, `withAddendum`, `Pack["prompts"]["generate"]`, `Pack["prep"]`, `Pack["seniority"]`, `packRef`.
- Produces: `generation.inputs.pack` as `"<id>@<version>"`, so `input_hash` differs per pack; fit brief uses `generate.fitBrief`, CV `tailoredCv`, cover letter `coverLetter`, question bank `questionBank`; bank size is `pack.prep.questionCounts[kind]`; sections from `pack.prep.sections[kind]`; `extract_resume` suggests levels from the pack's `seniority` values.

- [ ] **Step 1: Write the failing tests**

```ts
it("under product design every task's prompt equals Hosted's snapshot")       // hosted snapshot files stay untouched
it("the audience line comes from the pack and follows the shared header")
it("a bank for portfolio_case asks for the pack's count: 8 under product design, 10 under software engineering")
it("a run after a pack switch has a different input_hash and is a new run")
it("extract_resume lists the pack's seniority values")
it("an empty generate field appends nothing")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/generate-pack.test.ts tests/integration/generate-pack.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Move the `ROLE_PACK` text out of each task module into `packs/product-design.json` byte for byte, so Hosted's snapshots stay green. The pack's content hash changes, so the guard needs `version: 2`; existing accounts see the update notice once (Task 14), which is accurate and accepted. Add a CHANGELOG line once Task 47 exists.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run --ci && pnpm typecheck`
Expected: PASS, hosted snapshots unchanged.

- [ ] **Step 5: Commit**

```bash
git add lib/generate packs tests
git commit -m "feat(packs): Hosted prompts take audience lines, counts and sections from the pack"
```

**Acceptance:**
1. Spec 5.1 table row "Hosted 5.4 and 5.6": `prompts.generate`, `prep.questionCounts`, the pack's seniority values.
2. Spec 4: `generation.inputs` gains `pack`, so a run after a switch is a new run.
3. Spec 5.3: product design reproduces today's prompts exactly.

---

### Task 24: Request bundle addenda and `work_request.pack_id`

**Files:**
- Create: the migration for `work_request.pack_id` (`pnpm db:generate`)
- Modify: `lib/db/schema/*` (the file that defines `work_request`, from 2026-11-21-jobsmith-bridge-two milestone 31), `lib/requests/create.ts` (from 2026-11-21-jobsmith-bridge-two milestone 31; `createRequest` writes `pack_id`), `lib/requests/bundle.ts` (from 2026-11-21-jobsmith-bridge-two milestone 31; resolve the pack, add the addendum and counts to `request.md`)
- Test: `tests/integration/requests-pack.test.ts`, `tests/integration/migrations.test.ts` (one case)

**Blocked on:** bridge-two milestone 31 (`work_request`, `lib/requests`). Skip and name in the pull request when absent. Open `lib/requests/create.ts` and `lib/requests/bundle.ts` first (spec 5.4 names `createRequest`; the bundle builder is the file that writes `request.md`).

**Interfaces:**
- Consumes: `createRequest(s, { opportunityId, kind, stageId, params, target, targetRunnerId, via })`, `getActivePack`, `getRegistry`, `withAddendum`.
- Produces: column `work_request.pack_id` text nullable with check `work_request_pack_id_format` (same expression as `profile_pack_id_format`); `packForRequest(s: Scoped, request: { packId: string | null }): Promise<Pack>`: the snapshot pack when installed, product design when the snapshot pack is not installed, the active pack when `packId` is null. Addenda by kind: `fit_brief`, `tailored_cv`, `cover_letter` and `question_bank` use `prompts.generate.fitBrief`, `tailoredCv`, `coverLetter`, `questionBank`; `call_card` uses `prompts.callCard`; `research` uses `prompts.research`; `research_refresh` uses `prompts.research` for research or people notes (a fit brief refresh uses `generate.fitBrief`); `debrief` none. A bank's default count is `prep.questionCounts[kind]`, sections `prep.sections[kind]`.

- [ ] **Step 1: Write the failing tests**

```ts
it("createRequest writes the active pack id to pack_id")
it("a request created under one pack and bundled after a switch carries the first pack's addendum")
it("a request with a null pack_id carries the active pack's addendum")
it("a snapshot pack that is no longer installed falls back to product design")
it("call_card gets prompts.callCard and research gets prompts.research")
it("the question_bank default count comes from the pack and an explicit count param wins")
it("work_request.pack_id rejects 'Bad_Id'")                                 // migrations.test.ts
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/requests-pack.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Snapshot at creation, per spec 5.4. The bundle appends the addendum to the kind's instructions with `withAddendum` and lists counts and sections under a `## Pack` heading in `request.md` (plan copy: `## Pack: <name>` then `Questions: <n>` and `Sections: A, B`); the bundle stays under its 4 MB cap.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db lib/requests tests
git commit -m "feat(packs): request bundles carry the pack snapshot's addenda"
```

**Acceptance:**
1. Spec 4 and 5.4: `work_request.pack_id` nullable, written by `createRequest`; the bundle uses that snapshot.
2. Spec 5.1: per-kind addenda as listed; counts from `prep.questionCounts`.
3. Spec 8 integration: both the snapshot case and the null case.

---

### Task 25: "Copy a template" and the conventions section

**Files:**
- Create: `lib/packs/template.ts`
- Modify: `lib/bridge/context.ts` (`## Question bank conventions` after `## Preferences`), `lib/bridge/handlers.ts` (pass the lines), the Prep hub empty state in `components/prep/` (from 2026-11-21-jobsmith-prep milestone 6; the "No prep yet" state; skip that half when absent), `components/copy-button.tsx` use
- Test: `tests/unit/pack-template.test.ts`, `tests/unit/bridge-context.test.ts`, `tests/unit/prep-hub-template.test.tsx` (when the hub exists)

**Interfaces:**
- Consumes: `Pack`, `MiddleKind`, `MIDDLE_KINDS`, `CopyButton`, `lib/prep/parse.ts` (from prep milestone 6, in the hub test only).
- Produces: `questionBankTemplate(pack: Pack, kind: MiddleKind, stageLabel: string): string`; `questionBankConventions(pack: Pack, stages: { kind: StageKind; label: string }[]): { label: string; count: number; sections: string[] }[]` (one entry per stage whose kind is one of the four middle kinds, in stage order); `ContextInput.conventions` of that type.

Template text: `# <stage label> questions`, then for each pack section for that kind a blank line, `## <section>`, a blank line and the one instruction line from the Contract. A kind with no sections gets the title and one instruction line. A template pasted unchanged parses to zero rows.

- [ ] **Step 1: Write the failing tests**

```ts
it("the template has a # title and the pack's ## sections for the chosen kind")
it("each section has the fixed instruction line under it")                         // Write questions here as `### 1. "Question"` followed by **Say:** and **Spine:**.
it("a kind with no sections gets the title and one instruction line")
it("pasted unchanged, the template parses to zero rows")                           // no '### N. "' line in the output; with the Prep parser when present, expect 0
it("the context has '## Question bank conventions' with each interview stage's label, count and sections") // line: '- Technical interview: 10 questions; sections: A, B'
it("stages of kind saved, applied or offer are left out of the conventions")
it("the context stays context/v1")
it("the hub empty state shows 'Copy a template' beside the paste button and copies the template to the clipboard")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/pack-template.test.ts tests/unit/bridge-context.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Conventions line format (plan copy): `- <label>: <count> questions; sections: <names joined by ", ">`, with `sections: none` when empty. The button uses `components/copy-button.tsx` (registry path preferred over new code).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/packs/template.ts lib/bridge components tests
git commit -m "feat(packs): Copy a template and the question bank conventions section"
```

**Acceptance:**
1. Spec 5.4: the Prep hub's empty state gains "Copy a template" with the fixed instruction line; unchanged paste parses to zero rows.
2. Spec 4: the context gains `## Question bank conventions` and stays `context/v1`.
3. Spec 8 integration: the context frontmatter and conventions section tests.

---

### Task 26: End to end, docs and ship

**Files:**
- Create: `tests/e2e/packs-new.spec.ts`
- Modify: `playwright.config.ts` (add `packs-new` to the three projects' `testMatch`; webServer `PACKS_DIR` stays), `.github/workflows/ci.yml` (step `pnpm packs:check --repo` in `build`), `README.md` (Role packs: the four packs, `seed --pack`, adding a pack by pull request or `PACKS_DIR`), `docs/design-system.md` (chip suggestions row), `.env.example`
- Test: `tests/e2e/packs-new.spec.ts`

**Interfaces:**
- Consumes: Tasks 17 to 25, the built-in packs.
- Produces: the milestone's proof.

- [ ] **Step 1: Write the failing specs**

```ts
// Chromium, WebKit and phone; one shared account; fixture names with project plus suffix
test("Settings switch to Software engineering: a new job's portfolio column reads 'Technical' and its stage reads 'Technical interview'; the last middle stage reads 'Onsite loop'")
test("Preferences shows the Software engineering seniority list: Junior, Mid, Senior, Staff, Principal, Engineering manager, Director")
test("a suggestion chip adds a title to Title keywords")        // test.skip with the reason 'copy pending' until Task 20's suggestion lists exist
test("scoring a job after the switch still completes under AI_PROVIDER=fake")
test("axe: Preferences with suggestions, light and dark")
```

`/setup` closes after the first account, so the "new account" half of the done-when is proven by `tests/integration/pack-choose.test.ts` (Task 13: `setupAction` with `packId` `software-engineering` stores it) and by Task 20's integration test that records the scoring addendum through the fake driver; say so in the pull request.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm test:e2e --grep "packs-new"`
Expected: FAIL until the pack files exist.

- [ ] **Step 3: Wire config and docs; full verification**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm packs:check --repo && pnpm test:e2e` and, on a scratch database, `pnpm seed --pack data` (expect "Seeded 6 fictional jobs for the Data pack." and no pay on any row: `select count(*) from opportunity where comp_min is not null or comp_max is not null` is 0 for that user).

- [ ] **Step 4: Preview check**

On the Vercel preview in Chrome and Safari, desktop and phone width: switch to each of the four packs, add a job, check columns and chips, open Preferences. Record the result in the pull request. Name the tasks skipped for missing dependencies (22, 23, 24, 25 as applicable).

- [ ] **Step 5: Commit**

```bash
git add tests playwright.config.ts .github README.md docs .env.example
git commit -m "test(packs): end to end for the packs, docs and the packs-check CI step"
```

**Acceptance:**
1. Spec section 9 Milestone 34 done-when: software engineering labels on a new job, its seniority list and title chips, the recorded addendum, and `seed --pack data` with six jobs and no pay.
2. Spec 8: Chromium, WebKit, phone, axe light and dark; `seed --pack` for each pack covered by Task 20's integration test.
3. The pull request names every skipped task and the owner's pending items (review entries, product design lists).
