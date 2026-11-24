# Milestone 24: Company pages

> Done when: "Renaming a fictional company to a duplicate's name offers a merge, after which one page shows both companies' jobs, people, research and tracked roles, each moved job's timeline records it, and a new posting under the old name lands on the merged company" (spec section 9).

**Branch:** `feat/m24-company-pages`, cut from `main` after Milestones 20, 21 and 23 have merged.

**Before starting:**

```bash
grep -n "sourceBodyMd" lib/db/schema/artifact.ts            # Milestone 20 Task 1 (company document edits reuse base capture)
grep -n "saveEditInScope" lib/artifacts/edit.ts             # Milestone 22 Task 27 (company-only edit core)
test -f lib/compare/load.ts && test -f lib/research/refresh.ts   # Milestones 21 and 23 (Compare and Refresh on company documents)
grep -rl 'pgTable("feed_item"' lib/db/schema                # Feed milestone 16: the feed tables (Tasks 49, 52 second half, 55)
test -f lib/feed/sources.ts && test -f lib/feed/items.ts    # Feed: the only writers of feed_source, feed_item
```

Without Feed (the last two lines fail) build Tasks 44 to 48, 50, 51, 52 (first half), 53, 54 and 56 (without the tracked roles step). Task 48's merge then runs with the no-op feed port, and Tasks 49, 52 (open roles), 55 are left for when Feed lands. The spec states Feed as a prerequisite (section 1) and gives no other leave-out. If Feed lands after this milestone, Tasks 48 and 49 ship together so the foreign key test (Task 48) never sees an unhandled `feed_source.company_id` or `feed_item.company_id`.

Names this milestone consumes from Feed's plan are read from that plan's Contract before the task that uses them (Tasks 45 second half, 49, 52, 55): the feed source and item scoped helpers, the writers in `lib/feed/sources.ts` and `lib/feed/items.ts`, `saveFeedItem` (`lib/feed/save.ts`), the item row component and the tracking line component. The spec fixes only the module owners and `saveFeedItem(s, itemId, deps)`.

---

### Task 44: Migration: `company_alias`, the `company_merged` event kind, export

**Files:**
- Create: `lib/db/schema/company-alias.ts` (export it from `lib/db/schema/index.ts`), `lib/db/migrations/<n>_company_alias.sql` (generated: `pnpm db:generate --name company_alias`), `lib/db/scoped/company-alias.ts`
- Modify: `lib/pipeline/values.ts` (`EVENT_KINDS` gains `company_merged`, last), `lib/db/schema/pipeline.ts` (the event check is built from `EVENT_KINDS`), `lib/db/scoped/index.ts` (`Scoped.companyAlias`), `lib/pipeline/event-text.ts`, `lib/export/collect.ts` (`companyAliases`, raise `EXPORT_VERSION` by one from its value on `main`)
- Test: `tests/integration/scoped-isolation.test.ts`, `tests/integration/migrations.test.ts`, `tests/integration/company-alias-scoped.test.ts`, `tests/unit/event-text.test.ts`, `tests/integration/export.test.ts`

**Interfaces:**
- Consumes: `company_user_id_id_unique` (exists), `EVENT_KINDS` as it stands on `main` (earlier cycles have appended `prep_drilled`, `artifact_generated`, `research_acknowledged`, `posting_gone`; keep every entry that is there).
- Produces: table `company_alias` as the Contract; `companyAliasQueries(db, userId)`:

```ts
export type CompanyAliasRow = typeof schema.companyAlias.$inferSelect;
export type CompanyAliasFields = Omit<typeof schema.companyAlias.$inferInsert, "id" | "userId" | "createdAt" | "updatedAt">;
findByNameKey(nameKey: string): Promise<CompanyAliasRow | null>;
listForCompany(companyId: string): Promise<CompanyAliasRow[]>;
listAll(): Promise<CompanyAliasRow[]>;
insert(values: CompanyAliasFields): Promise<CompanyAliasRow>;
deleteById(id: string): Promise<CompanyAliasRow | null>;
reassign(fromCompanyId: string, toCompanyId: string, mergedCompanyId: string): Promise<number>; // sets company_id, source 'merge', merged_company_id; returns the row count
```

- [ ] **Step 1: Write the failing tests**

```ts
it("unique on (user_id, name_key): a second alias with the same key for the same user throws constraint company_alias_user_name_key_unique; another user may reuse it", ...);
it("source accepts 'rename' and 'merge' only; merged_company_id has no foreign key (a random uuid is accepted)", ...);
it("deleting the company cascades its aliases", ...);
it("the event check accepts every entry of EVENT_KINDS, including company_merged and each kind earlier cycles added, and rejects 'bogus'", ...); // loops EVENT_KINDS
it("reassign moves every alias of one company to another with source 'merge' and merged_company_id set", ...);
// isolation: B cannot read, delete or reassign A's aliases; insert ignores a smuggled userId
// event-text: company_merged meta { fromName: 'Northwind Labs', toName: 'Northwind', counts { jobs: 3, people: 4, documents: 2 }, renamedKeys [{ from: 'research', to: 'research-2' }] } reads
//   'Merged Northwind Labs into Northwind: 3 jobs, 4 people and 2 documents moved. research became research-2.'; 1 job and 1 person read singular; no renames drops the last sentence
// export: companyAliases holds rows without userId; EXPORT_VERSION is the previous value plus one
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/company-alias-scoped.test.ts tests/integration/migrations.test.ts tests/unit/event-text.test.ts`
Expected: FAIL, `schema.companyAlias` is undefined and `company_merged` is not an event kind.

- [ ] **Step 3: Implement**

Table: uuid `id`, `user_id` with index, timestamps, `company_id` uuid with composite foreign key `company_alias_company_fk` on `(user_id, company_id)` to `company (user_id, id)` cascade, `name`, `name_key`, `source` with a check, `merged_company_id` uuid nullable, unique `company_alias_user_name_key_unique`. In `lib/db/schema/pipeline.ts` replace the literal list in `event_kind_check` with `sql.raw(EVENT_KINDS.map((k) => `'${k}'`).join(", "))` so the check can never drift from the code list; generate and read the migration SQL. `eventText` wording above is this plan's own (spec: "wording in `lib/pipeline/event-text.ts`, fixed in the Milestone 24 plan"); plural rule `1 job`, `n jobs`, `1 person`, `n people`, `1 document`, `n documents`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration tests/unit && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/db lib/pipeline lib/export tests
git commit -m "feat(companies): company_alias table, company_merged event, export"
```

**Acceptance:**
- Spec 4: `company_alias` columns and unique key, `event.kind` gains `company_merged` keeping every earlier kind, the data export adds `companyAliases` and its version goes up by one (spec 4 says "by one" for the cycle; this milestone raises it again because Milestone 20 already did, recorded in the task report).
- Spec 5.7 "wording in `lib/pipeline/event-text.ts`, fixed in the Milestone 24 plan": fixed in the test above.
- A row for the new table in the isolation test (spec 7).

---

### Task 45: Alias-aware company matching

**Files:**
- Create: `lib/companies/match.ts`
- Modify: `lib/pipeline/create.ts` (`createOpportunity`: resolve through `resolveCompany`, hash and duplicate check use the resolved company's name), `lib/pipeline/duplicates.ts` (`findActiveDuplicate` resolves the typed name first)
- Test: `tests/unit/companies-match.test.ts` (against PGlite), `tests/integration/pipeline-create.test.ts`, `tests/integration/intake-add-job.test.ts`

**Interfaces:**
- Consumes: `companyNameKey`, `Scoped.company.findByNameKey`, `Scoped.companyAlias.findByNameKey`.
- Produces:

```ts
export type CompanyMatch = { company: CompanyRow; via: "name" | "alias" };
export async function resolveCompany(s: Scoped, name: string): Promise<CompanyMatch | null>; // name_key first, then alias; null when neither
export async function nameKeyTakenBy(s: Scoped, nameKey: string): Promise<{ company: CompanyRow; via: "name" | "alias" } | null>; // the same lookup by key, used by rename and merge
```

- [ ] **Step 1: Write the failing tests**

```ts
it("match order: an exact name key wins over an alias; an alias key returns the owning company with via 'alias'; neither returns null", ...);
it("a legal suffix still folds: 'Northwind Inc' matches the company 'Northwind' (companyNameKey)", ...);
it("createOpportunity for 'Northwind Labs' after the company was renamed from that name lands on the renamed company and creates no second company", ...);
it("createOpportunity creates a company only when neither table matches", ...);
it("duplicate check through an alias: an active 'Product Designer' at Northwind and a new add for 'Northwind Labs' / 'Product Designer' returns duplicate, and the stored dedupe_hash uses the resolved name", ...);
it("addJob with a typed company that is an alias attaches to the merged company and warns about the active duplicate", ...);
it("another user's alias never matches", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/companies-match.test.ts tests/integration/pipeline-create.test.ts tests/integration/intake-add-job.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

In `createOpportunity`, replace `tx.company.findByNameKey(key)` with `resolveCompany(tx, input.companyName)`, create only on `null`, then compute `dedupeHash({ companyName: company.name, ... })` and the `findActiveDuplicate` call with the resolved `company.name`. `findActiveDuplicate(s, parts)` resolves `parts.companyName` first and hashes with the canonical name when it matches. `lib/import/applications.ts` keeps its own `findByNameKey` (the import is a one-time script; left out on purpose, recorded in the README).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/companies lib/pipeline tests
git commit -m "feat(companies): match a company by name, then by alias"
```

**Acceptance:**
- Spec 5.7 Matching paragraph ("name_key, then alias ... then creates one when neither matches"), 8 ("intake and Feed matching an alias"): the intake half is this task, Feed's aggregator half is a line in Task 49.

---

### Task 46: `lib/companies/edit.ts`: edit, rename, aliases

**Files:**
- Create: `lib/companies/edit.ts`
- Modify: `lib/pipeline/details.ts` (remove `updateCompanyDetails` and `updateCompanyDetailsSchema`; they move), `app/(app)/jobs/[slug]/actions.ts` (`updateCompanyDetailsAction` becomes `updateCompanyAction`, same file), `components/job/edit-company-dialog.tsx` (gains the name field; calls the renamed action), `lib/db/scoped/company.ts` (`deleteById`), `lib/db/scoped/opportunity.ts` (`listByCompany`)
- Test: `tests/unit/company-edit-schema.test.ts`, `tests/integration/company-edit.test.ts`, `tests/integration/pipeline-details.test.ts` (company cases move to the new test), `tests/unit/details-schema.test.ts`, `tests/integration/scoped-isolation.test.ts`

**Interfaces:**
- Consumes: `nameKeyTakenBy` (Task 45), `companyNameKey`, `dedupeHash`, `Scoped.companyAlias`, `Scoped.opportunity.listByCompany(companyId): Promise<OpportunityRow[]>` (new here).
- Produces:

```ts
export const updateCompanySchema: z.ZodType<UpdateCompanyInput>; // name?, domain?, careersUrl?, size?, industry?, hq?, notesMd?, atsKind?, atsOrg? (and atsRegion? once Feed milestone 16 has added company.ats_region), each nullable except name
export type UpdateCompanyResult =
  | { ok: true; data: { renamed: boolean; aliasAdded: boolean; rehashed: number } }
  | { ok: false; code: "name_taken"; message: string; other: { id: string; name: string } }
  | { ok: false; code: "not_found" | "invalid" | "link_locked"; message: string };
export async function updateCompany(s: Scoped, companyId: string, input: UpdateCompanyInput): Promise<UpdateCompanyResult>;
export async function removeAlias(s: Scoped, companyId: string, aliasId: string): Promise<Result<null, "not_found">>;
```

- [ ] **Step 1: Write the failing tests**

```ts
it("every existing company-details case still passes through updateCompany (blank clears, bad careers link rejected, unknown company not_found)", ...);
it("rename: the name and name_key change, the old name becomes an alias with source 'rename', every job at the company gets a fresh dedupe_hash, slugs never change", ...);
it("a capitalization fix ('NORTHWIND' to 'Northwind') keeps the key, adds no alias and rehashes nothing", ...);
it("renaming to a name whose key belongs to another company returns name_taken with that company's id and name and writes nothing", ...);
it("renaming to a name whose key is another company's alias returns name_taken with the owning company", ...);
it("renaming to a key that is this company's own alias removes that alias and does not add one for the old name twice", ...);
it("an alias with the old key is added in the same transaction as the rename (rollback on a thrown error leaves the old name)", ...);
it("tracked company: changing careersUrl, atsKind or atsOrg returns link_locked; resending the same values is allowed; tracked itself never changes here", ...);
it("untracked company: careers link, ats kind and org are editable", ...);
it("removeAlias deletes only that company's alias; another company's alias id is not_found", ...);
it("another user's company is not_found", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/company-edit-schema.test.ts tests/integration/company-edit.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

One `s.transaction`: lock the company row, read key owners through `nameKeyTakenBy`, write name, key, alias, rehash (`dedupeHash` with the new name for every row of `listByCompany`). `tracked` is read from the row only to lock the link fields; nothing here writes it (Feed's `lib/feed/sources.ts` owns `tracked` and the link fields set by tracking). Delete the old pipeline exports in the same commit, update the job page action and dialog imports, and move the company cases of `tests/integration/pipeline-details.test.ts` and `tests/unit/details-schema.test.ts` rather than deleting them.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib app components tests
git commit -m "feat(companies): edit and rename a company, keep the old name as an alias"
```

**Acceptance:**
- Spec 5.7 first two paragraphs (editable fields, tracked link fields read-only, `name_taken` with that company, alias on rename, capitalization case, own-alias removal, fresh `dedupe_hash`, slugs unchanged), spec 3 (`lib/companies` is the writer of company rows and aliases; `updateCompanyDetails` moved).
- `git grep updateCompanyDetails` finds nothing outside git history.

---

### Task 47: The merge planner

**Files:**
- Create: `lib/companies/merge-plan.ts`
- Test: `tests/unit/merge-plan.test.ts`

**Interfaces:**
- Consumes: row types from `lib/db/scoped` (`CompanyRow`, `PersonRow`, `CompanyAliasRow`, `OpportunityRow`, `ArtifactMeta`), `companyNameKey`.
- Produces:

```ts
export type FeedFacts = { sourceHasSource: boolean; targetHasSource: boolean; itemsToMove: number }; // counts only; the port fills it
export type MergePlanInput = {
  source: CompanyRow; target: CompanyRow;
  sourceJobs: Pick<OpportunityRow, "id" | "slug" | "roleTitle" | "location">[];
  sourcePeople: PersonRow[]; targetPeople: PersonRow[];
  sourceDocuments: { key: string }[]; targetDocumentKeys: string[];
  sourceAliases: CompanyAliasRow[]; targetAliasKeys: string[];
  feed: FeedFacts;
};
export type PersonCombine = { sourcePersonId: string; targetPersonId: string; fill: { title?: string; linkedinUrl?: string; email?: string }; notesAppend: string | null };
export type MergePlan = {
  jobIds: string[];
  peopleMoves: string[];                    // source person ids that move as they are
  peopleCombines: PersonCombine[];
  documentMoves: { key: string; toKey: string }[]; // toKey equals key when it does not collide
  fields: Partial<Pick<CompanyRow, "domain" | "careersUrl" | "size" | "industry" | "hq" | "atsKind" | "atsOrg" | "notesMd">>; // values for the target (ats_region joins once Feed milestone 16 has added it)
  aliasesToAdd: { name: string; nameKey: string }[];
  feed: "none" | "move_source" | "keep_target_source";
  preview: { jobs: number; people: number; combined: number; documents: number; renamed: { from: string; to: string }[]; sentence: string };
};
export function planMerge(input: MergePlanInput): MergePlan;
export function previewSentence(p: { targetName: string; sourceName: string; jobs: number; people: number; combined: number; documents: number; renamed: { from: string; to: string }[]; feedItems: number }): string;
export function renameKey(base: string, taken: ReadonlySet<string>): string; // "<base>-2", first free number, base cut so the key stays within 100 characters
```

- [ ] **Step 1: Write the failing tests**

```ts
it("people: same name after case folding and whitespace collapse with equal or one-empty LinkedIn and email combines; a conflicting LinkedIn or email does not combine and the person moves as is", ...);
it("a combine fills the target's empty title, LinkedIn and email, appends the source notes after a blank line, and never overwrites a non-empty target field", ...);
it("two source people matching one target person both combine into it", ...);
it("documents: a key the target lacks moves with its own key; a colliding key moves as '<key>-2', then '-3' when '-2' is taken (by the target or by an earlier move)", ...);
it("renameKey cuts a 99 character base so the result is at most 100 characters", ...);
it("fields: the target's non-empty values stay, empty ones take the source's, notes append under 'From Northwind Labs:' (and when the target has none the notes become 'From Northwind Labs:' plus the source notes)", ...);
it("ATS kind, org (and region) come from the target when its kind is set, and as one unit from the source when it is not", ...);
it("aliases: the source name and each of its aliases are added; one whose key equals the target's own name key or an alias the target already has is skipped", ...);
it("feed cases: only the source tracked is 'move_source'; both is 'keep_target_source'; the target only or neither is 'none'", ...);
it("previewSentence for 3 jobs, 4 people with 1 combined, 2 documents with 1 renamed: 'Moves 3 jobs, 4 people (1 matches someone already at Northwind and is combined) and 2 research documents (1 renamed research-2). Northwind Labs becomes an alias.'", ...);
it("previewSentence with nothing to combine or rename drops both parentheticals; singular forms '1 job', '1 person', '1 research document'; with nothing at all it reads 'Moves nothing. Northwind Labs becomes an alias.'; with feed items it appends ' Its 12 tracked roles move too.'", ...);
it("the planner is pure: calling it twice with the same input gives equal results and mutates nothing", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/merge-plan.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

A "combined" person counts in the "people" total (the spec's sentence: "4 people (1 matches ...)"). The same function feeds the preview and the write (Task 48), so the dialog and the transaction cannot disagree.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/merge-plan.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/companies tests
git commit -m "feat(companies): the merge planner and its preview sentence"
```

**Acceptance:**
- Spec 5.7 Merge: preview sentence word for word, people rule, document key rule with the 100 character cut, field rule, alias rule, the three feed source cases (spec 11 item 11), spec 8 ("the merge planner").

---

### Task 48: `mergeCompanies`: one transaction, events, and the foreign key test

**Files:**
- Create: `lib/companies/merge.ts`, `lib/companies/merge-log.ts`
- Modify: `lib/db/scoped/opportunity.ts` (`lockAllForCompany(companyId)`), `lib/db/scoped/person.ts` (`deleteById`), `lib/db/scoped/opportunity-person.ts` (`listForPersonIds`, `countForPerson`), `lib/db/scoped/artifact.ts` (`moveCompanyDocument(fromCompanyId, key, toCompanyId, toKey)`, `listCompanyKeys` through the existing `listKeys`), `lib/db/scoped/company.ts` (`deleteById` from Task 46)
- Test: `tests/integration/company-merge.test.ts`, `tests/integration/company-merge-fk.test.ts`, `tests/integration/scoped-isolation.test.ts`

A text column that names a company document by key (for example a later cycle's `artifact_key` copy) is not a foreign key, so the test below cannot see it. The test file carries a comment saying so, and a later cycle that adds such a column adds its handling to `merge.ts` in its own plan.

**Interfaces:**
- Consumes: `planMerge`, `MergePlan`, `FeedFacts` (Task 47), `Scoped.companyAlias.reassign`, `tx.event.insert`, `dedupeHash`.
- Produces:

```ts
export interface FeedMergePort {
  inspect(tx: Scoped, sourceId: string, targetId: string): Promise<FeedFacts>;
  apply(tx: Scoped, plan: MergePlan["feed"], ids: { sourceId: string; targetId: string }): Promise<{ movedItems: number }>;
}
export const NO_FEED: FeedMergePort; // every company has no feed rows; used until Feed ships and in tests
export type MergeCounts = { jobs: number; people: number; combinedPeople: number; documents: number; feedItems: number };
export const MERGE_HANDLED_REFERENCES: readonly string[]; // "table.column" of every foreign key to company this file handles: opportunity.company_id, person.company_id, artifact.company_id, company_alias.company_id
export async function previewMerge(s: Scoped, ids: { sourceId: string; targetId: string }, port?: FeedMergePort): Promise<Result<{ sentence: string; counts: MergeCounts; targetName: string; sourceName: string }, "not_found" | "same_company">>;
export async function mergeCompanies(s: Scoped, ids: { sourceId: string; targetId: string }, options?: { port?: FeedMergePort; now?: Date; requestId?: string }): Promise<Result<{ counts: MergeCounts; renamed: { from: string; to: string }[]; targetId: string }, "not_found" | "same_company">>;
```

- [ ] **Step 1: Write the failing tests**

```ts
it("moves every job to the target, recomputes dedupe_hash with the target's name, and writes one company_merged event per moved job with meta { fromCompanyId, fromName, toCompanyId, toName, counts, renamedKeys } shown on its timeline", ...);
it("a job's slug and stage state do not change", ...);
it("people: unmatched people move; a matching person is combined (fields filled, notes appended after a blank line, job links repointed, where both were linked to one job the target's link and role stay) and the source person row is deleted", ...);
it("documents: a key the target lacks moves with every version; a colliding key moves as research-2 with all its versions and titles unchanged; the renames are in the event meta", ...);
it("fields and notes follow the planner; ATS fields follow the planner", ...);
it("aliases: the source's name and aliases become the target's with source 'merge' and merged_company_id set to the source id; the source row is deleted last", ...);
it("previewMerge returns the sentence the write then matches: counts equal the write's counts", ...);
it("lock order: the source's opportunities by id, then both company rows by id; a concurrent push to a source job waits and then sees the job on the target (run two transactions with a barrier)", ...);
it("one failure rolls everything back: a port that throws leaves both companies, their jobs, people, documents and aliases untouched", ...);
it("same company id returns same_company; a source or target that vanished returns not_found and changes nothing; another user's id is not_found", ...);
it("a [merge] log line holds company ids and counts and no names", ...);
it("FK test: every foreign key that references company, listed from information_schema.table_constraints, key_column_usage and constraint_column_usage (column other than user_id), is in MERGE_HANDLED_REFERENCES, plus the feed ones when feed_source exists (then the feed port must declare them: Task 49)", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/company-merge.test.ts tests/integration/company-merge-fk.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Inside `s.transaction`: `lockAllForCompany(source.id)` (rows `for update` ordered by id), then `lockById` for the two company rows in ascending id order, re-read both (a vanished one is `not_found`), `port.inspect`, `planMerge`, then write jobs, people, documents, feed (`port.apply`), fields, aliases, and `companyDelete` last. The event is written per job with the same `occurredAt`. A failure anywhere throws and the transaction rolls back. Previews call the same load and `planMerge` without writing. The FK test builds its expected set from `MERGE_HANDLED_REFERENCES` and, when the `feed_source` table exists, from `FEED_HANDLED_REFERENCES` exported by Task 49's module, so a table that a later cycle adds fails this test until merge handles it.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration tests/unit && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(companies): merge two companies in one transaction"
```

**Acceptance:**
- Spec 5.7 Merge bullets (jobs and events, people, documents, fields, aliases, source deleted last, lock order), spec 5.7 last paragraph (the foreign key test, no undo), 6 (a merge whose source or target vanished returns `not_found` and changes nothing), 6 Logs (`[merge]`), 8 (merge moving jobs, people, documents with an event per job, plus the foreign key test).

---

### Task 49: The Feed side of a merge

**Blocked on:** Feed milestone 16 (the tables) and the writers in `lib/feed/sources.ts` and `lib/feed/items.ts`. Without Feed, `NO_FEED` stays the default and this task is not built.

**Files:**
- Create: `lib/companies/merge-feed.ts`
- Modify: `lib/feed/sources.ts` and `lib/feed/items.ts` only if Feed's plan names no writer for a step below (they are the only writers of those tables; the change is a new exported function in each, listed in the PR), `lib/companies/merge.ts` (the default port becomes `feedMergePort` when the Feed tables exist: `options.port ?? feedMergePort`), and the Feed function that matches an aggregator item's company name by `name_key` (find it with `grep -rn "findByNameKey" lib/feed`): it calls `resolveCompany` from `lib/companies/match.ts` instead. That last line is **blocked on** Feed milestone 19 (aggregator sources); skip it when the grep finds nothing.
- Test: `tests/integration/company-merge-feed.test.ts`

**Interfaces:**
- Consumes: Feed's `feed_source` and `feed_item` scoped helpers, the writers named in Feed's Contract.
- Produces:

```ts
export const FEED_HANDLED_REFERENCES = ["feed_source.company_id", "feed_item.company_id"] as const;
export const feedMergePort: FeedMergePort;
```

- [ ] **Step 1: Write the failing tests**

```ts
it("only the source company has a feed_source: it moves to the target, which becomes tracked, and every feed_item.company_id moves to the target", ...);
it("both have a feed_source: the target's stays; the source's 'saved' and 'dismissed' items move to it unless an item with the same external id is already there; the source's source is removed with its other items and scan runs", ...);
it("only the target has a source: nothing moves except items whose company_id was the source's (none), and the target stays tracked", ...);
it("neither has one: apply returns movedItems 0 and writes nothing", ...);
it("inspect counts the items that will move so previewMerge says 'Its 12 tracked roles move too.'", ...);
it("the writes go through lib/feed/sources.ts and lib/feed/items.ts (a spy on each), never through direct table writes in lib/companies", ...);
it("the foreign key test from Task 48 passes with the feed tables present", ...);
it("an aggregator item whose company name is a merged company's old name gets company_id of the merged company (Feed milestone 19 only)", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/company-merge-feed.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`inspect` reads counts through the Feed scoped helpers; `apply` branches on the plan's `feed` value and calls Feed's writers. If Feed's plan already ships a "move source to company" and a "delete source with items" function, call them; otherwise add them to the two Feed-owned modules in this task. Also the aggregator-matching line from Task 45 if it is still open.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration tests/unit && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(companies): move feed sources and roles in a company merge"
```

**Acceptance:**
- Spec 5.7 Merge, Feed bullet (the three cases, writes through `lib/feed/sources.ts` and `lib/feed/items.ts`), spec 11 item 11.

---

### Task 50: Company-only document edit and paste

**Files:**
- Create: `lib/artifacts/company.ts`
- Modify: `lib/artifacts/upsert.ts` (`applyUpserts` context type), `lib/artifacts/paste.ts` and `upsertArtifacts` in `lib/artifacts/upsert.ts` (the two existing callers pass the new context shape)
- Test: `tests/integration/artifact-company.test.ts`, `tests/integration/artifact-upsert.test.ts`, `tests/integration/artifact-paste.test.ts`

**Interfaces:**
- Consumes: `saveEditInScope` (Milestone 22 Task 27), `planUpsert`, `applyUpserts`, `keyFromTitle`, `uniqueSlug` (`lib/pipeline/slug.ts`), `kindInfo(kind).companyWide`, `tx.company.lockById`.
- Produces:

```ts
// upsert.ts
export type UpsertContext = { opportunity: { id: string } | null; companyId: string; stages: StageRow[] }; // opportunity is null for a company-only write, which accepts company scope only
// company.ts
export const COMPANY_KINDS = ["research", "fit_brief", "people_notes"] as const;
export async function saveCompanyArtifactEdit(s: Scoped, companyId: string, key: string, bodyMd: string, baseVersion: number, now?: Date): Promise<Result<EditOutcome, "not_found" | "artifact_not_found" | "invalid">>; // locks the company row only
export type CompanyPasteInput = { target: { mode: "new" } | { mode: "version"; key: string }; title: string; kind: (typeof COMPANY_KINDS)[number]; bodyMd: string };
export async function pasteCompanyArtifact(s: Scoped, companyId: string, input: CompanyPasteInput, now?: Date): Promise<Result<UpsertResult & { title: string }, "not_found" | "artifact_not_found" | "invalid">>;
```

- [ ] **Step 1: Write the failing tests**

```ts
it("saveCompanyArtifactEdit edits a company document in place, sets the base on its first edit, forks nothing for an unsent document, and locks only the company row (spy: company lockById called, opportunity lockById never)", ...);
it("an edit with a stale baseVersion forks a new version exactly as saveArtifactEdit does", ...);
it("pasteCompanyArtifact new: key from the title, unique among the company's keys, scope company, origin pasted, version 1", ...);
it("pasteCompanyArtifact version: adds version 2 with origin pasted; an identical body is unchanged", ...);
it("a kind outside research, fit_brief and people_notes returns invalid 'Only research, fit briefs and people notes can live on a company.'", ...);
it("a paste never writes an artifact_pushed event (origin pasted) and needs no opportunity", ...);
it("every existing applyUpserts and pasteArtifact test passes with the new context shape", ...);
it("another user's company is not_found", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/artifact-company.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Replace `context.opportunity.companyId` with `context.companyId` throughout `applyUpserts`; with `opportunity === null` a job-scoped input is a programming error, so assert with a thrown `Error`, because the company-only wrappers have already refused other kinds. The event insert for `pushed` and `generated` stays guarded on a non-null opportunity. Existing callers pass `{ opportunity, companyId: opportunity.companyId, stages }`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration tests/unit && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/artifacts tests
git commit -m "feat(artifacts): edit and paste company documents without a job"
```

**Acceptance:**
- Spec 5.6 item 5 ("company-only entry points for edit and paste that reuse `planUpsert` ... lock only the company row, and offer only the three company-wide kinds"), spec 3 (`lib/artifacts` keeps every artifact write).

---

### Task 51: People at company level

**Files:**
- Modify: `lib/people/index.ts` (`addPersonToCompany`, `updateCompanyPerson`, `removeCompanyPerson`), `lib/db/scoped/person.ts` (`deleteById`, already added in Task 48), `lib/db/scoped/opportunity-person.ts` (`countForPerson`, added in Task 48)
- Test: `tests/integration/people.test.ts`, `tests/unit/person-schema.test.ts`

**Interfaces:**
- Consumes: `personInputSchema` (exists), `Scoped.person`, `Scoped.opportunityPerson`.
- Produces:

```ts
export const companyPersonInputSchema: z.ZodType<CompanyPersonInput>; // personInputSchema without role and stageId
export type CompanyPersonInput = { name: string; title?: string | null; linkedinUrl?: string | null; email?: string | null; notesMd?: string | null };
export async function addPersonToCompany(s: Scoped, companyId: string, input: CompanyPersonInput): Promise<Result<{ personId: string }, "not_found" | "invalid">>;
export async function updateCompanyPerson(s: Scoped, companyId: string, personId: string, input: CompanyPersonInput): Promise<Result<null, "not_found" | "invalid">>;
export async function removeCompanyPerson(s: Scoped, companyId: string, personId: string): Promise<Result<null, "not_found" | "linked">>; // only a person linked to no job
```

- [ ] **Step 1: Write the failing tests**

```ts
it("addPersonToCompany creates a person with no job link", ...);
it("updateCompanyPerson changes name, title, links and notes of any person at the company, linked or not, and leaves their job links untouched", ...);
it("removeCompanyPerson deletes an unlinked person; a person linked to a job returns linked 'Unlink this person from the job on its People tab first.' and deletes nothing", ...);
it("a person of another company or another user is not_found", ...);
it("the job-level functions (addPersonToOpportunity, updateLinkedPerson, unlinkPerson) behave exactly as before", ...);
it("an invalid email or LinkedIn link returns invalid with the schema's message", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/people.test.ts tests/unit/person-schema.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Writes go through `lib/people` only (spec 5.6 item 6). `removeCompanyPerson` counts links through `opportunityPerson.countForPerson` before deleting.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration tests/unit && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(people): add, edit and remove people at company level"
```

**Acceptance:**
- Spec 5.6 item 6 (Add person with no job, Edit, Remove only for a person linked to no job; a linked person is unlinked from the job's People tab first).

---

### Task 52: The company page loader, and open roles from Feed

**Blocked on:** Feed milestone 16 for the open roles half (`loadOpenRoles`). The loader half has no dependency.

**Files:**
- Create: `lib/companies/page.ts`, `lib/companies/open-roles.ts`
- Modify: `lib/companies/overview.ts` (`CompanyOverviewDoc` loses `jobSlug`; the `linkJob` rule goes), `lib/companies/load.ts`, `lib/compare/links.ts` (`documentHrefForCompany` returns `/companies/<id>?doc=<key>`)
- Test: `tests/integration/company-page.test.ts`, `tests/integration/company-open-roles.test.ts`, `tests/unit/companies-overview.test.ts`, `tests/unit/compare-links.test.ts`

**Interfaces:**
- Consumes: `Scoped.company.getById`, `Scoped.companyAlias.listForCompany`, `Scoped.opportunity.listByCompany`, `Scoped.stage.listAll`, `Scoped.event.lastOccurredByOpportunity`, `Scoped.artifact.listLatestForCompany`, `Scoped.person.listForCompany`, `Scoped.opportunityPerson.listForPersonIds`, Feed's scoped item helper (name from the Feed plan), `CLOSED_REASON_LABELS`.
- Produces:

```ts
export type CompanyJobRow = { slug: string; roleTitle: string; status: "active" | "closed"; stageLabel: string; addedAt: Date; appliedAt: Date | null; lastActivityAt: Date | null };
export type CompanyPerson = { person: PersonRow; jobs: { slug: string; roleTitle: string; role: PersonRole }[] };
export type CompanyPageData = { company: CompanyRow; aliases: CompanyAliasRow[]; jobs: CompanyJobRow[]; documents: ArtifactMeta[]; people: CompanyPerson[] };
export async function loadCompanyPage(s: Scoped, companyId: string): Promise<CompanyPageData | null>; // null for an unknown id or another user's
// open-roles.ts
export type OpenRole = { id: string; roleTitle: string; location: string | null; url: string; firstSeenAt: Date; state: "new" | "seen" };
export type RoleHistoryRow = { id: string; roleTitle: string; firstSeenAt: Date; goneAt: Date | null; state: "new" | "seen" | "saved" | "dismissed" | "expired"; jobSlug: string | null };
export async function loadOpenRoles(s: Scoped, companyId: string): Promise<{ open: OpenRole[]; history: RoleHistoryRow[]; tracked: boolean }>;
```

- [ ] **Step 1: Write the failing tests**

```ts
it("jobs: active ones first by last activity (newest first), then closed ones newest closed first; stageLabel is the stage label or 'Closed · Rejected' (reason label)", ...);
it("appliedAt is the Applied stage's entered_at, null for a job never applied; lastActivityAt is the newest event", ...);
it("people carry one entry per linked job with the job's role title and the person's role", ...);
it("documents are the company's latest versions of research kinds only", ...);
it("an unknown company id and another user's id return null", ...);
it("overview: research links no longer carry a job slug; the Companies list builds its link from the company id", ...);
it("documentHrefForCompany returns /companies/<id>?doc=<key>", ...);
it("open roles: feed items of the company in state new or seen with no gone_at, newest first_seen_at first", ...);
it("role history: every retained item newest first by first_seen_at, with goneAt, state and, for a saved item, its job slug; items with duplicate_of_id set are left out, as everywhere in Feed", ...);
it("an untracked company with no items returns open [] and history [] and tracked false", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/integration/company-page.test.ts tests/unit/companies-overview.test.ts tests/unit/compare-links.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Plain scoped reads, no transaction. The loader never fetches over the network. `loadOpenRoles` reads Feed's rows through the scoped helper only (spec 5.6 item 7); it writes nothing. Update `buildCompanyOverviews` and its test, then `loadCompanyOverviews`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat(companies): load a company page and its open roles"
```

**Acceptance:**
- Spec 5.6 items 4 and 7 (jobs ordering and columns, open roles and role history from Feed), and the retirement of the "pick a job to carry the link" rule in `lib/companies/overview.ts` (spec 5.6 intro).

---

### Task 53: The company page, route and list links

**Files:**
- Create: `app/(app)/companies/[id]/page.tsx`, `components/company/company-header.tsx`, `components/company/company-facts.tsx`, `components/company/notes-editor.tsx`, `components/company/company-jobs.tsx`, `components/company/company-research.tsx`, `components/company/company-people.tsx`, `components/company/person-dialog.tsx`
- Modify: `app/(app)/companies/page.tsx` (each name links to `/companies/<id>`, research links to `/companies/<id>?doc=<key>`), `components/job/job-header.tsx` is unchanged
- Test: `tests/unit/company-page-sections.test.tsx`, `tests/unit/companies-list.test.tsx`

**Interfaces:**
- Consumes: `loadCompanyPage` (Task 52), `getDocument` (`lib/artifacts/read.ts`), `DocumentList`, `DocumentView`, `PasteDialogTrigger` (a company variant: takes `companyId`; add a `scope` prop to `components/job/paste-dialog.tsx` or create `components/company/company-paste-dialog.tsx` that calls `pasteCompanyArtifact`), the registry's `detail-view-shell`, `section-header`, `field-row`, `table-view`, `empty-state`, `CompareVersionsLink` (Milestone 21), `RefreshDialogTrigger` with `target: { companyId }` (Milestone 23 Task 41), `LocalTime`.
- Produces: the page and its section components; `?doc=<key>` selects the research document; the sections in this order: header, facts, notes, jobs, research, people, open roles (Task 55 fills the last).

- [ ] **Step 1: Write the failing tests**

```ts
it("an unknown id and another user's id render the 404 page; the page calls requireUser()", ...);
it("sections appear in order: header, facts, notes, jobs, research, people; open roles joins in Task 55", ...);
it("the header shows the name, the domain as a link 'https://' plus the domain, the careers link, an ATS chip like 'Greenhouse · northwind', and 'Also known as Northwind Labs' for aliases", ...);
it("facts are field rows for size, industry and HQ; notes render through the sanitized Markdown component and edit in place with Write and Preview", ...);
it("jobs: each row has role, stage label or 'Closed · Rejected', added date, applied date and last activity, and links to the job; times through LocalTime", ...);
it("research: the document list, version picker, 'Compare versions' (two or more versions), Refresh, edit and 'Paste markdown' work on company documents and offer only the three company kinds", ...);
it("people: title, LinkedIn and a chip per linked job showing the role; Add person; Edit; Remove only for a person linked to no job", ...);
it("at phone width the sections stack in the same order and jobs become two-line rows (class assertions for the 'md' breakpoints)", ...);
it("the Companies list links each name to /companies/<id> and each research document to /companies/<id>?doc=<key>", ...);
it("only semantic tokens (pnpm check:tokens)", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/company-page-sections.test.tsx tests/unit/companies-list.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Server component page with `requireUser()`, `scopedFor(user.id)`, `loadCompanyPage`, `notFound()`. Registry components are read in place before use (their props are in `components/super-ai/`); dialogs use the installed `base-nova` primitives. The menu in the header ("Edit company", "Merge into another company") opens the dialogs of Task 54; this task renders the menu with the two items wired in Task 54. Notes editing calls `updateCompany` with `notesMd` through an action added in Task 54. Company documents' Compare route is Milestone 21's `/companies/[id]/compare`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit && pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS, and the build lists `/companies/[id]`.

- [ ] **Step 5: Commit**

```bash
git add app components tests
git commit -m "feat(companies): the company page"
```

**Acceptance:**
- Spec 5.6 items 1 (without the Feed tracking line), 2, 3, 4, 5 and 6 and the phone paragraph, spec 7 (`requireUser()` and a scoped lookup; unknown or another user's id is 404), spec 10 (registry components named there).

---

### Task 54: Edit, rename and merge dialogs and the company actions

**Files:**
- Create: `app/(app)/companies/[id]/actions.ts`, `components/company/edit-company-dialog.tsx`, `components/company/merge-dialog.tsx`, `components/company/alias-list.tsx`
- Modify: `components/job/edit-company-dialog.tsx` (shares the form fields; on `name_taken` offers a link to `/companies/<id>?merge=<otherId>`), `components/company/company-header.tsx` (menu wiring), `app/(app)/companies/[id]/page.tsx` (`?merge=<id>` opens the merge dialog preselected)
- Test: `tests/unit/edit-company-dialog.test.tsx`, `tests/unit/merge-dialog.test.tsx`, `tests/integration/company-actions.test.ts`

**Interfaces:**
- Consumes: `updateCompany`, `removeAlias` (Task 46), `previewMerge`, `mergeCompanies` (Task 48), `pasteCompanyArtifact`, `saveCompanyArtifactEdit` (Task 50), `addPersonToCompany`, `updateCompanyPerson`, `removeCompanyPerson` (Task 51), `matchAtsBoardUrl` (`lib/intake/ats/match.ts`, from Feed milestone 16).
- Produces:

```ts
export async function updateCompanyAction(companyId: string, _prev: FormState, formData: FormData): Promise<FormState & { nameTaken?: { id: string; name: string } }>;
export async function previewMergeAction(sourceId: string, targetId: string): Promise<Result<{ sentence: string }, "not_found" | "same_company">>;
export async function mergeCompaniesAction(sourceId: string, targetId: string): Promise<Result<{ targetId: string; targetName: string; sourceName: string }, "not_found" | "same_company">>;
export async function removeAliasAction(companyId: string, aliasId: string): Promise<Result<null, "not_found">>;
// plus thin actions for company document paste and edit and for person add, edit and remove, each calling the lib function and revalidating /companies, /companies/<id> and the jobs at that company; refresh request, cancel and the copied prompt reuse Milestone 23's actions in app/(app)/research-actions.ts with target { companyId }
```

- [ ] **Step 1: Write the failing tests**

```ts
it("the edit dialog covers name, domain, size, industry, HQ and notes; on an untracked company also the careers link and ATS kind and org; on a tracked company those link fields are read-only with the hint 'Change the link from the tracking line.'", ...);
it("pasting a Greenhouse board link into the careers field fills kind, org (and region) through matchAtsBoardUrl; a LinkedIn link is refused", ...); // Blocked on Feed milestone 16 for this one case
it("a rename that collides shows 'Northwind is already a company.' with the buttons 'Merge into Northwind' and a field to pick a different name; nothing is saved", ...);
it("Merge into another company: a combobox of the other companies, then the preview sentence from previewMerge, then 'Merge'; Cancel changes nothing", ...);
it("after a merge the user lands on the target's page with the toast 'Merged Northwind Labs into Northwind.' and the announcement", ...);
it("the alias list shows 'Also known as ...' with a Remove button per alias; Remove confirms by announcing 'Alias removed.'", ...);
it("every action requires a session and scopes through scopedFor(user.id); another user's ids return not_found", ...);
it("the job page's Edit company dialog now has a name field and a collision there links to /companies/<id>?merge=<otherId>", ...);
it("focus returns to a live control after each dialog closes (correctFocusOnceLost)", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/edit-company-dialog.test.tsx tests/unit/merge-dialog.test.tsx tests/integration/company-actions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Forms go through `lib/forms/submit.ts` like the other dialogs; the server actions follow `app/(app)/jobs/[slug]/actions.ts` (parse, `requireUser()`, `scopedFor`, typed state). The company page's Edit link and Stop tracking for a tracked company are Feed's (Task 55).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app components tests
git commit -m "feat(companies): edit, rename and merge dialogs"
```

**Acceptance:**
- Spec 5.7 (Edit company contents, `name_taken` offering "Merge into Northwind" or a different name, the merge dialog and preview), 5.6 item 1 (menu with Edit company and Merge into another company, aliases with Remove), spec 8 (axe on the merge dialog is checked in Task 56).

---

### Task 55: Open roles, role history and the tracking line on the page

**Blocked on:** Feed milestones 16 and 17 (tables, tracking line, Feed's item row with Add to board and Dismiss). Without them this task is not built; the page works with its other sections.

**Files:**
- Create: `components/company/open-roles.tsx`
- Modify: `app/(app)/companies/[id]/page.tsx` (`export const maxDuration = 60`, the open roles section), `components/company/company-header.tsx` (Feed's tracking line or its Track action)
- Test: `tests/unit/company-open-roles.test.tsx`, `tests/integration/company-page-feed.test.ts`

**Interfaces:**
- Consumes: `loadOpenRoles` (Task 52), Feed's item row component (`components/feed/`, with Add to board through `saveFeedItem(s, itemId, deps)` in `lib/feed/save.ts` and Dismiss through `lib/feed/items.ts`; names from Feed's plan), Feed's tracking line and Track dialog components.
- Produces: `OpenRoles(props: { open: OpenRole[]; history: RoleHistoryRow[]; tracked: boolean; companyId: string })`.

- [ ] **Step 1: Write the failing tests**

```ts
it("open roles use Feed's item row with Add to board and Dismiss and the same actions, not new ones", ...);
it("role history lists every retained item newest first with role, first seen, 'Taken down 12 Oct' from gone_at, and its state: Saved (a link to the job), Dismissed, Expired", ...);
it("one line says history covers Feed's 90-day retention", ...);
it("an untracked company with no items shows the Track action and one sentence: 'Tracking checks this company's careers page or job board every few hours and lists new roles on Feed.'", ...);
it("the header shows Feed's tracking line for a tracked company (reader, last check, open and matching roles, health, Check now, Edit link, Stop tracking) and Track for an untracked one", ...);
it("dates through LocalTime; at phone width the roles are two-line rows", ...);
it("Add to board creates a feed job linked to the item and the history row then links to it", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/company-open-roles.test.tsx tests/integration/company-page-feed.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Compose Feed's components; add no feed write. `maxDuration = 60` because "Check now" and Track run a scan inside the action, as on the Companies page (Feed 5.1).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration && pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app components tests
git commit -m "feat(companies): open roles, role history and tracking on the company page"
```

**Acceptance:**
- Spec 5.6 items 1 (tracking line) and 7 (open roles, role history, retention line, untracked sentence), spec 3 (feed item writes stay with `lib/feed/items.ts`).

---

### Task 56: End to end, docs and ship

**Blocked on:** Feed milestones 16 and 17 for the tracked roles step only (the last assertion of the done-when sentence). Every other step runs without Feed.

**Files:**
- Create: `tests/e2e/company.spec.ts`
- Modify: `playwright.config.ts` (add `company` to the `apply-*` `testMatch` regex), `README.md` (a "Companies" section: the page, rename, merge, aliases), `docs/design-system.md` ("New application code": `components/company/*` pieces that have no registry match, with reasons), `.env.example` (no new variable; `git diff --exit-code .env.example`)
- Test: the spec above

**Interfaces:**
- Consumes: `login`, `uniqueName`, `addJobAndOpen`, `runCli` (push a research document to a company), the paste dialog, `scanForViolations`, `scanOpenOverlay`; for tracked roles, Feed's e2e fixtures (`FEED_FETCH=fixtures`) as Feed's plan defines them.

- [ ] **Step 1: Write the failing e2e specs**

```ts
test("company page: edit the company, add a person with no job, paste a research document, compare two versions of it", ...);
test("rename a company to a duplicate's name offers the merge; merging shows one page with both companies' jobs, people and research", ...);
test("each moved job's timeline says 'Merged Northwind Labs into Northwind: ...'", ...);
test("a new posting added under the old name lands on the merged company (Add job with company 'Northwind Labs' opens a job whose company page is Northwind)", ...);
test("an active duplicate through the old name is flagged by the add dialog's duplicate warning", ...);
test("tracked roles: both fictional companies tracked by Feed fixtures, after the merge the page lists the open roles of both", ...); // Blocked on Feed
test("axe in light and dark on the company page, the edit dialog and the merge dialog; keyboard-only through the merge", ...);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test:e2e --project=apply-chromium -g "company"`
Expected: FAIL before the page is linked in a clean checkout of the task.

- [ ] **Step 3: Make the specs pass and update the docs**

Chromium and WebKit desktop and the phone project (sections stack at 390 px).

- [ ] **Step 4: Run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`
Expected: PASS

- [ ] **Step 5: Preview check**

Push the branch, open the pull request, deploy the preview and run the done-when sequence in Chrome and Safari, desktop and phone.

```bash
git add tests playwright.config.ts README.md docs
git commit -m "test(companies): company pages end to end, docs"
```

**Acceptance:**
- Spec 9 Done-when sentence for Milestone 24, in Chromium and WebKit.
- Spec 8 accessibility: axe on the company page and the merge dialog in light and dark.
