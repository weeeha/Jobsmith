# Jobsmith Core Milestone 2: Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every active application is on the board. Companies, opportunities and stages live in the database, the pipeline rules are the only write path, the board supports drag, keyboard moves and a phone list, the job page has Overview, People and Timeline, and jobs can be added by hand, closed, reopened and imported once from a file.

**Architecture:** Six new owned tables. Tenant safety is enforced twice: every query goes through the scoped helper, and every owned child references its parent with a composite foreign key that includes `user_id`, so the database itself refuses a cross-user reference. The pipeline rules are a pure module (`lib/pipeline/rules.ts`) that turns a snapshot and a command into a plan, tested as a table of cases. A thin persistence layer applies a plan inside one transaction with the opportunity row locked, and writes one event. Server actions stay thin: session check, Zod validation, one `lib/` call, a typed result, revalidation. The board is a server page that loads cards and a client component that moves them optimistically with React's `useOptimistic`. Every drag has a non-drag alternative.

**Tech stack additions:** `@dnd-kit/core` (latest 6.x at install time, exact version recorded in the plan's Task 6), shadcn `base-nova` primitives `dialog`, `select`, `textarea`, `sonner`, `toggle-group`, `empty`, and the Super AI Components registry items `detail-view-shell`, `empty-state`, `mode-tabs`, `field-row`. Everything else is already installed (Next.js 16.3.5, React 19.2.8, TypeScript strict, Tailwind 4.3.3, Drizzle 0.45.2, drizzle-kit 0.31.10, `pg`, PGlite 0.5.8, Zod 4, Vitest 5, Playwright 1.63 with `@axe-core/playwright`, pnpm 11.1.0).

**Spec:** `docs/superpowers/specs/2026-09-18-jobsmith-core-design.md`. Sections 2, 3, 4, 5.1, 5.2, 5.11, 6, 7, 8, 10 and the Milestone 2 row of section 9 govern this plan.

## How this plan is organized

The plan is a folder, because one file would be too large to read comfortably on GitHub.

| File | Content |
|---|---|
| `README.md` (this file) | Goal, global constraints, and the Contract: decisions, schema, every signature, the pipeline rules, the fixed UI copy, the task list |
| [tasks-01-05.md](tasks-01-05.md) | Schema and migration, scoped helpers, pure pipeline rules, persistence, everyday job data |
| [tasks-06-09.md](tasks-06-09.md) | UI foundations, the desktop board, the add job dialog, the phone board |
| [tasks-10-14.md](tasks-10-14.md) | The job page, the one-time import, seed and end-to-end tests, docs |

How to read the task text:

- The task text calls the Contract section below "the frame". A name, a signature or a copy string in the frame is binding, character for character.
- The format is a hybrid. Tests, the schema, Zod schemas, server actions, scripts, end-to-end specs and a few wiring recipes are given as full code. Other function bodies are described as numbered steps that point at the rules in the frame, and the builder writes the body so that the tests pass. Components are described by structure, states, copy and accessibility, with short recipes where the wiring is easy to get wrong. Reason: in Milestone 1 most plan defects came from plan code that had never been run.
- Notes such as "verified in a planning scratch file" refer to small checks made against the installed package versions while this plan was written. Those files are not part of the repo. Anything marked "unverified" could not be checked at planning time (for example code that imports a package this milestone installs) and is the builder's to confirm.
- Each task is one review gate with its own tests and ends with a commit. A builder sees only one task, so every task restates what it consumes and produces.

## Global Constraints

- Never commit to or push `main`. All work happens on branch `feat/m2-pipeline`, cut from `main` after Milestone 1 is merged.
- Never change git config. The repo-local identity is already the owner's GitHub noreply address.
- Public repo hygiene: fictional companies and people only, no compensation figures taken from real life, no personal data, no local absolute paths in committed files.
- This is Next.js 16. Before using any Next.js API, read the matching guide under `node_modules/next/dist/docs/` (the repo's `AGENTS.md` requires it). The request-interception file is `proxy.ts`, `headers()` and `cookies()` are async, and `next typegen` runs before `tsc`.
- Every page, server action and route handler checks the session itself with `requireUser()` from `@/lib/auth/session`. `proxy.ts` is an extra layer and never the only check.
- Files under `app/` and `components/` never import `@/lib/db/client`. They reach the database through `scopedFor(userId)` from `@/lib/db/scoped` and through `lib/` functions that take a `Scoped`.
- `lib/pipeline` is the only code that writes `opportunity.status`, `opportunity.current_stage_id`, the `closed_*` columns, `stage` rows and pipeline events.
- Server functions return the typed `Result` from `@/lib/result`. Expected failures (validation, not found, closed opportunity, duplicate, a broken stage rule) are returned, never thrown.
- Test first for everything under `lib/`: write the failing test, watch it fail, then write the code.
- App code under `app/` and `components/`, excluding `components/ui/` and `components/super-ai/`, uses semantic utilities and stock shadcn variable names only: no raw colors, no Tailwind palette classes, no arbitrary values. Motion uses `duration-fast`, `duration-base`, `duration-slow` and `ease-standard`, `ease-enter`, `ease-exit`. `pnpm check:tokens` must pass.
- Order of preference for any UI need: a Super AI Components registry item, then a `base-nova` primitive, then new code. Registry items are installed with `pnpm dlx shadcn@latest add https://super-ai-components.vercel.app/r/<name>.json`, are copied verbatim into `components/super-ai/`, and every item and every local change is recorded in `docs/design-system.md`.
- Accessibility is built in: labels, landmarks, keyboard access, visible focus, an aria-live announcement for every move, and a non-drag way to do everything a drag does (WCAG 2.2, 2.5.7). The axe scan has zero violations in light and in dark on every new route and every dialog.
- Times are stored as `timestamptz`. In this milestone, times are shown and edited in the browser's time zone, and only through `components/local-time.tsx` and `components/local-datetime-input.tsx` (decision D7).
- UI copy has no exclamation marks and uses plain words.
- Commit messages end with the co-author trailer supplied by the executing session.

## Contract

### Decisions

- **D1. Enumerations are `text` columns with a CHECK constraint**, typed in Drizzle with `text("col", { enum: [...] })`. Reason: adding a value later is a one-line constraint change, and PGlite and Postgres behave the same.
- **D2. Composite tenant foreign keys.** Every owned parent has `unique(user_id, id)`. Every owned child references its parent with `foreignKey({ columns: [t.userId, t.parentId], foreignColumns: [parent.userId, parent.id] })`. The two pointer columns on `opportunity` (`current_stage_id`, `closed_stage_id`) are single-column references written as `.references((): AnyPgColumn => stage.id)` because the two tables refer to each other, with the default NO ACTION. Nullable "soft" references that need SET NULL (`opportunity_person.stage_id`, `event.stage_id`) are single-column too, and the `lib/` function checks that the stage belongs to the opportunity. Verified while planning (type-checks under strict, drizzle-kit emits every foreign key as a separate ALTER so the circular pair is fine, PGlite rejects a cross-user stage and a cross-user company, deleting a user cascades cleanly through the circular pair).
- **D3. The `opportunity` table is created with every column the spec lists**, including the fit, intake and dedupe columns that later milestones fill. Reason: one table definition, no chain of ALTERs.
- **D4. Stage order.** `position` is unique per opportunity. The spike showed that `UPDATE stage SET position = position + 1 WHERE ...` fails on the unique constraint, so every structural change (add, reorder, remove, a stage created by a move) ends with `stage.renumber(opportunityId, orderedIds)`, which runs two statements inside the caller's transaction: first add 1000 to every position of that opportunity, then set each row to its index in `orderedIds`.
- **D5. Pure rules, thin persistence.** `lib/pipeline/rules.ts` has no imports from `lib/db`. Persistence functions run `s.transaction(...)`, lock the opportunity row (`SELECT ... FOR UPDATE`), build the snapshot, call the rule, apply the plan, write one event.
- **D6. Optimistic moves use `useOptimistic` inside a transition.** On a rejected move the optimistic state is dropped when the transition ends, so the card returns by itself. The error is shown with a `sonner` toast. A successful move is announced through the visually hidden live region.
- **D7. Browser time zone in this milestone.** There is no Settings page until Milestone 5, so the profile time zone is still `UTC` for everyone. Times are rendered by a client component with `Intl.DateTimeFormat` and entered through a `datetime-local` input that the client converts to an ISO instant. Cost if wrong: when Milestone 5 adds the profile time zone, only these two components change.
- **D8. Every card has a "Move to" menu** (a `dropdown-menu` listing the seven columns plus "Close"). It calls the same action as a drop and as the keys 1 to 7, and it is the control the phone sheet reuses. Reason: WCAG 2.5.7 and tablets.
- **D9. The job page is a routed page.** It uses `DetailTabs` and `DetailFields` from the `detail-view-shell` registry item for the tab strip and the fact lists. It does not wrap the page in the dialog shell. The active tab is the `tab` search param, so a tab is linkable and rendered on the server.
- **D10. The posting snapshot is shown as plain text with line breaks kept.** The sanitized markdown renderer arrives with artifacts in Milestone 3.
- **D11. The company field in the add dialog is a text input with a native `<datalist>` of existing company names.** The registry has no combobox.
- **D12. Stages are reordered with "Move up" and "Move down" buttons** in the Edit stages dialog. No drag inside the dialog.
- **D13. The job page shows only the tabs that work: Overview, People, Timeline.** Research, Documents and Prep arrive in Milestone 3. The fit chip and fit card arrive in Milestone 5 and are hidden while `fit_score` is null.
- **D14. Import.** `pnpm import:applications <file> [--email <address>] [--dry-run]` reads the neutral JSON shape from spec 5.11 and replays each entry through `createOpportunity` and `moveOpportunity`. With one user in the database `--email` is optional, with more it is required. An entry whose company name key and role title already exist for that user is skipped, so a second run changes nothing. The owner's own mapping script lives in the git-ignored folder `local/` and is the last, owner-gated step.
- **D15. Skipping.** A stage can be skipped when it is not current and its status is `upcoming` or `scheduled`. `unskip` returns it to `upcoming`, or to `scheduled` when it has a future date. A stage that becomes current always leaves `skipped` and `done`.

### Schema (Task 1). File `lib/db/schema/pipeline.ts`, re-exported from `lib/db/schema/index.ts`

All tables: `id uuid primaryKey defaultRandom`, `userId text("user_id") notNull references user.id onDelete cascade`, `createdAt` and `updatedAt` as `timestamp(..., { withTimezone: true }).defaultNow().notNull()`. Every `timestamp` in this file passes `{ withTimezone: true }` (an existing integration test fails otherwise). Every enum column gets a CHECK constraint named `<table>_<column>_check`.

Shared value lists live in `lib/pipeline/values.ts` (no database imports) so rules, schema, Zod schemas and UI share them:

```ts
export const STAGE_STATUSES = ["upcoming", "scheduled", "done", "skipped"] as const;
export const STAGE_FORMATS = ["phone", "video", "onsite", "async"] as const;
export const WORK_MODES = ["remote", "hybrid", "onsite"] as const;
export const OPPORTUNITY_SOURCES = ["url", "text", "manual", "feed"] as const;
export const OPPORTUNITY_STATUSES = ["active", "closed"] as const;
export const CLOSED_REASONS = ["rejected", "withdrawn", "ghosted", "declined", "accepted"] as const;
export const FIT_STATUSES = ["none", "pending", "done", "failed"] as const;
export const ATS_KINDS = ["greenhouse", "ashby", "lever", "other"] as const;
export const PERSON_ROLES = ["recruiter", "hiring_manager", "interviewer", "referrer", "other"] as const;
export const EVENT_KINDS = ["created", "stage_moved", "closed", "reopened", "note", "interview_scheduled", "document_sent", "artifact_pushed", "next_action_done"] as const;
export const STAGE_KIND_VALUES = STAGE_KINDS.map((s) => s.kind);  // from lib/pipeline/kinds.ts, typed as a tuple
```

- **company**: `name` text notNull, `nameKey` text notNull, `domain`, `careersUrl`, `atsKind` (ATS_KINDS, nullable), `atsOrg`, `size`, `industry`, `hq`, `notesMd` (all text, nullable), `tracked` boolean notNull default false. `unique(user_id, id)`, `unique(user_id, name_key)`.
- **opportunity**: `companyId` uuid notNull (composite FK to company, NO ACTION), `slug` text notNull, `roleTitle` text notNull, `location` text, `workMode` (WORK_MODES, nullable), `source` (OPPORTUNITY_SOURCES, notNull, default `manual`), `sourceUrl` text, `postingMd` text, `postingCapturedAt` timestamptz, `compMin` integer, `compMax` integer, `compCurrency` text, `compNote` text, `myAsk` text, `fitScore` integer (CHECK 0 to 100 when not null), `fit` jsonb, `fitStatus` (FIT_STATUSES, notNull, default `none`), `needsReview` boolean notNull default false, `currentStageId` uuid (pointer, D2), `status` (OPPORTUNITY_STATUSES, notNull, default `active`), `closedReason` (CLOSED_REASONS, nullable), `closedAt` timestamptz, `closedStageId` uuid (pointer, D2), `nextAction` text, `nextActionAt` timestamptz, `dedupeHash` text. `unique(user_id, id)`, `unique(user_id, slug)`, index on `(user_id, status)`, index on `(company_id)`. CHECK `opportunity_closed_consistency`: `(status = 'closed') = (closed_reason is not null and closed_at is not null)`.
- **stage**: `opportunityId` uuid notNull (composite FK to opportunity, CASCADE), `kind` (seven kinds, notNull), `label` text notNull, `position` integer notNull, `status` (STAGE_STATUSES, notNull, default `upcoming`), `scheduledAt` timestamptz, `format` (STAGE_FORMATS, nullable), `enteredAt` timestamptz, `completedAt` timestamptz, `outcomeMd` text. `unique(user_id, id)`, `unique(opportunity_id, position)`.
- **person**: `companyId` uuid notNull (composite FK to company, CASCADE), `name` text notNull, `title`, `linkedinUrl`, `email`, `notesMd` (text, nullable). `unique(user_id, id)`.
- **opportunity_person**: `opportunityId` (composite FK to opportunity, CASCADE), `personId` (composite FK to person, CASCADE), `role` (PERSON_ROLES, notNull, default `other`), `stageId` uuid nullable (single-column FK to stage.id, SET NULL). `unique(opportunity_id, person_id)`.
- **event**: `opportunityId` (composite FK to opportunity, CASCADE), `stageId` uuid nullable (single-column FK to stage.id, SET NULL), `kind` (EVENT_KINDS, notNull), `body` text, `meta` jsonb notNull default `{}`, `occurredAt` timestamptz notNull defaultNow. Index on `(opportunity_id, occurred_at)`.

Migration: one generated file `lib/db/migrations/0002_*.sql` from `pnpm db:generate`. Task 1 tests (integration, PGlite with the real migrations): the six tables exist; a stage whose `user_id` differs from its opportunity's is rejected; an opportunity pointing at another user's company is rejected; each CHECK rejects a bad value; `opportunity_closed_consistency` rejects `closed` without a reason; deleting a user removes that user's rows in all six tables; the existing "every timestamp column has a time zone" test still passes.

### Scoped helpers (Task 2). Folder `lib/db/scoped/`, import path stays `@/lib/db/scoped`

`lib/db/scoped.ts` is replaced by `lib/db/scoped/index.ts` plus one file per table (`profile.ts`, `company.ts`, `opportunity.ts`, `stage.ts`, `person.ts`, `opportunity-person.ts`, `event.ts`) and `strip.ts` (the existing `stripScopedKeys`). Rules for every helper: every read filters on `user_id = userId`; every write passes its values through `stripScopedKeys` and sets `userId` last; `update` and `remove` add `and user_id = userId` and return the row or `null`; every `update` sets `updatedAt: new Date()`.

```ts
export type Scoped = ReturnType<typeof scoped>;
export function scoped(db: Db, userId: string): {
  userId: string;
  transaction<T>(fn: (tx: Scoped) => Promise<T>): Promise<T>;   // db.transaction((tx) => fn(scoped(tx, userId)))
  profile: { get(): Promise<ProfileRow | null>; upsert(values: Partial<ProfileFields>): Promise<ProfileRow> };
  company: {
    getById(id: string): Promise<CompanyRow | null>;
    findByNameKey(nameKey: string): Promise<CompanyRow | null>;
    list(): Promise<CompanyRow[]>;                                // ordered by name
    insert(values: CompanyFields): Promise<CompanyRow>;
    update(id: string, values: Partial<CompanyFields>): Promise<CompanyRow | null>;
  };
  opportunity: {
    getById(id: string): Promise<OpportunityRow | null>;
    getBySlug(slug: string): Promise<OpportunityRow | null>;
    lockById(id: string): Promise<OpportunityRow | null>;         // SELECT ... FOR UPDATE, call inside transaction()
    listBoard(): Promise<BoardCard[]>;                            // status active, joined with company and current stage
    listClosed(): Promise<ClosedCard[]>;                          // status closed, newest closed_at first
    listSlugsWithPrefix(prefix: string): Promise<string[]>;
    findByCompanyAndRole(companyId: string, roleTitle: string): Promise<OpportunityRow | null>;  // case-insensitive role match
    insert(values: OpportunityFields): Promise<OpportunityRow>;
    update(id: string, values: Partial<OpportunityFields>): Promise<OpportunityRow | null>;
  };
  stage: {
    listForOpportunity(opportunityId: string): Promise<StageRow[]>;   // ordered by position
    insert(values: StageFields): Promise<StageRow>;
    insertMany(values: StageFields[]): Promise<StageRow[]>;
    update(id: string, values: Partial<StageFields>): Promise<StageRow | null>;
    remove(id: string): Promise<StageRow | null>;
    renumber(opportunityId: string, orderedIds: string[]): Promise<void>;  // two statements, D4
  };
  person: {
    getById(id: string): Promise<PersonRow | null>;
    listForCompany(companyId: string): Promise<PersonRow[]>;
    insert(values: PersonFields): Promise<PersonRow>;
    update(id: string, values: Partial<PersonFields>): Promise<PersonRow | null>;
  };
  opportunityPerson: {
    listForOpportunity(opportunityId: string): Promise<LinkedPerson[]>;  // link row joined with person
    link(values: OpportunityPersonFields): Promise<OpportunityPersonRow>;
    update(id: string, values: Partial<OpportunityPersonFields>): Promise<OpportunityPersonRow | null>;
    unlink(id: string): Promise<OpportunityPersonRow | null>;
  };
  event: {
    insert(values: EventFields): Promise<EventRow>;
    listForOpportunity(opportunityId: string): Promise<EventRow[]>;      // newest occurred_at first
  };
};
export function scopedFor(userId: string): Scoped;   // scoped(getDb(), userId)
```

`XFields` is `Omit<typeof table.$inferInsert, "id" | "userId" | "createdAt" | "updatedAt">`, exported next to each helper. Read shapes:

```ts
export type BoardCard = {
  id: string; slug: string; roleTitle: string; companyName: string; fitScore: number | null;
  nextAction: string | null; nextActionAt: Date | null; updatedAt: Date;
  stage: { id: string; kind: StageKind; label: string; enteredAt: Date | null };
};
export type ClosedCard = { id: string; slug: string; roleTitle: string; companyName: string; closedReason: ClosedReason; closedAt: Date; closedStageLabel: string | null };
export type LinkedPerson = { linkId: string; role: PersonRole; stageId: string | null; person: PersonRow };
```

Task 2 test: the tenant isolation matrix. Two users, one row per table for user A. For every helper method that takes an id or lists rows, user B gets `null` or an empty list and cannot update or remove A's row, and a smuggled `userId` in `insert` or `update` values is ignored. `renumber` is tested with a reorder of five stages and with an insert in the middle. The ESLint rule that keeps `@/lib/db/client` out of `app/` and `components/` stays as it is.

### Shared utilities (inside Task 3)

- `lib/result.ts`: `export type Result<T, C extends string = string> = { ok: true; data: T } | { ok: false; code: C; message: string };` plus `ok(data)` and `fail(code, message)`.
- `lib/companies/name-key.ts`: `companyNameKey(name: string): string`. NFKD, lowercase, `&` becomes `and`, strip everything that is not a letter or digit, then drop one trailing legal suffix token (`inc`, `llc`, `ltd`, `gmbh`, `corp`, `co`, `plc`) when something is left in front of it. Cases in the test: "Acme, Inc." and "ACME inc" give `acme`; "Northwind & Co" gives `northwindand`; "Co" stays `co`.
- `lib/pipeline/slug.ts`: `baseSlug(company: string, role: string): string` (kebab case, ASCII, at most 60 characters, never empty, falls back to `job`), `uniqueSlug(base: string, taken: string[]): string` (`base`, then `base-2`, `base-3`).

### Pipeline rules (Task 3). File `lib/pipeline/rules.ts`, pure, no database imports

```ts
export type StageState = {
  id: string; kind: StageKind; label: string; position: number; status: StageStatus;
  scheduledAt: Date | null; enteredAt: Date | null; completedAt: Date | null; hasArtifacts: boolean;
};
export type OpportunityState = { status: "active" | "closed"; currentStageId: string; stages: StageState[] };  // stages sorted by position
export type MoveTarget = { stageId: string } | { kind: StageKind };
export const NEW_STAGE = "new" as const;
export type StagePatch = { id: string | typeof NEW_STAGE; status?: StageStatus; enteredAt?: Date; completedAt?: Date | null; label?: string };
export type StageDraft = { kind: StageKind; label: string };
export type MovePlan = {
  create: StageDraft | null;                       // set when a kind target has no stage yet
  order: (string | typeof NEW_STAGE)[] | null;     // full order after the move, only when create is set
  patches: StagePatch[];
  currentStageId: string | typeof NEW_STAGE;
  from: { stageId: string; kind: StageKind; label: string };
  to: { stageId: string | typeof NEW_STAGE; kind: StageKind; label: string };
};
export type MoveError = "closed" | "not_found" | "same_stage" | "same_column";
export type EditError = "closed" | "not_found" | "fixed_stage" | "stage_current" | "stage_done" | "stage_has_artifacts" | "invalid_order" | "label_required" | "not_skippable" | "not_skipped";

export function defaultStages(): StageDraft[];                                   // seven, from STAGE_KINDS defaultLabel
export function placementIndex(stages: StageState[], kind: StageKind): number;   // where a new stage of this kind goes
export function nextStageId(state: OpportunityState): string | null;            // first later stage that is not skipped
export function planMove(state: OpportunityState, target: MoveTarget, now: Date): Result<MovePlan, MoveError>;
export function planAddStage(state: OpportunityState, kind: StageKind, label: string): Result<{ create: StageDraft; order: (string | typeof NEW_STAGE)[] }, EditError>;
export function planReorder(state: OpportunityState, orderedIds: string[]): Result<{ order: string[] }, EditError>;
export function planRename(state: OpportunityState, stageId: string, label: string): Result<StagePatch, EditError>;
export function planSkip(state: OpportunityState, stageId: string): Result<StagePatch, EditError>;
export function planUnskip(state: OpportunityState, stageId: string, now: Date): Result<StagePatch, EditError>;
export function planRemove(state: OpportunityState, stageId: string): Result<{ order: string[] }, EditError>;
```

Rules, in the words of spec 5.1 plus the gaps this frame closes:

1. A closed opportunity cannot move or be edited: `closed`.
2. A `{ kind }` target whose kind equals the current stage's kind is `same_column`, even when another stage of that kind exists. A `{ stageId }` target equal to the current stage is `same_stage`. An unknown id is `not_found`.
3. A `{ kind }` target resolves to the first stage of that kind (by position) that is not `skipped`. When every stage of that kind is skipped, it resolves to the first of them. When the job has no stage of that kind, `create` is set with the default label and `order` places `NEW_STAGE` at `placementIndex`.
4. `placementIndex`: right after the last stage of the same kind. When there is none, right after the last stage whose kind comes earlier in `STAGE_KINDS` order, and never after Offer.
5. Direction is decided by position, never by kind order. Forward: the old current stage becomes `done` with `completedAt = now`, and every stage strictly between that is `upcoming` becomes `skipped`. Backward: every stage after the target up to and including the old current stage becomes `upcoming`, or `scheduled` when `scheduledAt` is later than `now`, with `completedAt` null. `enteredAt` and notes are kept.
6. The target becomes current. If its status is `done` or `skipped` it becomes `upcoming`, or `scheduled` when it has a future date, with `completedAt` null. `enteredAt` is set to `now` only when it is null.
7. `planAddStage`: `label_required` for a blank label, `fixed_stage` for kind `saved`, `applied` or `offer` (they exist exactly once).
8. `planReorder`: `orderedIds` must be a permutation of the current ids with Saved first, Applied second and Offer last, otherwise `invalid_order`.
9. `planRemove`: `fixed_stage` for Saved, Applied, Offer; `stage_current`; `stage_done`; `stage_has_artifacts`. In this milestone `hasArtifacts` is always false, the rule exists so Milestone 3 only supplies data.
10. `planSkip`: allowed when the stage is not current and its status is `upcoming` or `scheduled`, otherwise `not_skippable` (or `stage_current`). `planUnskip`: `not_skipped` unless the status is `skipped`.

Task 3 tests are one table per function. The move table covers at least: forward by one, forward jump that skips two upcoming stages and leaves a scheduled one alone, backward by two with one future-dated stage, kind target with two stages of that kind where the first is skipped, kind target where all are skipped, kind target with a missing stage (placement before Offer), a reordered job where a drop to the right is a backward move, moving back onto a done stage, `enteredAt` kept on a second visit, `closed`, `same_stage`, `same_column`, `not_found`.

### Pipeline persistence (Task 4). Folder `lib/pipeline/`

```ts
// lib/pipeline/create.ts
export type CreateOpportunityInput = {
  companyName: string; roleTitle: string; location?: string; workMode?: WorkMode; sourceUrl?: string;
  postingText?: string; compMin?: number; compMax?: number; compCurrency?: string; compNote?: string; myAsk?: string;
  source?: OpportunitySource;   // default "manual"
};
export function createOpportunity(s: Scoped, input: CreateOpportunityInput, now?: Date): Promise<Result<{ id: string; slug: string }, "invalid" | "duplicate">>;
// lib/pipeline/move.ts
export function moveOpportunity(s: Scoped, opportunityId: string, target: MoveTarget, now?: Date): Promise<Result<{ from: { kind: StageKind; label: string }; to: { stageId: string; kind: StageKind; label: string } }, MoveError>>;
// lib/pipeline/close.ts
export function closeOpportunity(s: Scoped, opportunityId: string, reason: ClosedReason, now?: Date): Promise<Result<null, "not_found" | "closed">>;
export function reopenOpportunity(s: Scoped, opportunityId: string, now?: Date): Promise<Result<null, "not_found" | "not_closed">>;
// lib/pipeline/stages.ts
export function addStage(s: Scoped, opportunityId: string, kind: StageKind, label: string): Promise<Result<{ stageId: string }, EditError>>;
export function renameStage(s: Scoped, opportunityId: string, stageId: string, label: string): Promise<Result<null, EditError>>;
export function reorderStages(s: Scoped, opportunityId: string, orderedIds: string[]): Promise<Result<null, EditError>>;
export function skipStage(s: Scoped, opportunityId: string, stageId: string): Promise<Result<null, EditError>>;
export function unskipStage(s: Scoped, opportunityId: string, stageId: string, now?: Date): Promise<Result<null, EditError>>;
export function removeStage(s: Scoped, opportunityId: string, stageId: string): Promise<Result<null, EditError>>;
// lib/pipeline/snapshot.ts
export function loadState(s: Scoped, opportunityId: string): Promise<{ opportunity: OpportunityRow; state: OpportunityState } | null>;  // locks the row
```

- `createOpportunity`: validates with Zod (`companyName` and `roleTitle` required after trim, `compMin <= compMax`, `sourceUrl` a http or https URL), finds or creates the company by `companyNameKey`, returns `duplicate` when `findByCompanyAndRole` matches an ACTIVE opportunity, builds the slug, inserts the opportunity, inserts the seven default stages at positions 0 to 6, makes Saved current with `enteredAt = now`, stores `postingText` as `postingMd` with `postingCapturedAt = now`, writes one `created` event. One transaction.
- `moveOpportunity`: transaction, `loadState`, `planMove`, insert the new stage when `create` is set (temporary position: current maximum plus 1), `renumber` when `order` is set, apply patches, update `currentStageId`, write one `stage_moved` event with `stageId` = the target and `meta: { from, to }`.
- `closeOpportunity`: sets `status`, `closedReason`, `closedAt`, `closedStageId = currentStageId`, writes one `closed` event with `meta: { reason }`. `reopenOpportunity` clears the three `closed_*` columns, sets `status` back to `active`, writes one `reopened` event.
- Stage edits write no events in this milestone.

Task 4 tests (integration, PGlite): create gives seven stages, Saved current, one event, a unique slug on the second job with the same names, `duplicate` for the same company and role while the first is active; move forward, backward and to a missing kind (the new stage sits before Offer and positions stay 0..n without gaps); exactly one event per move; a closed opportunity rejects a move; close then reopen round-trips the columns; every stage edit with its refusals; user B cannot move, close or edit user A's opportunity (`not_found`).

### Everyday job data (Task 5)

```ts
// lib/pipeline/next-action.ts
export function setNextAction(s: Scoped, opportunityId: string, input: { text: string; at: Date | null }): Promise<Result<null, "not_found" | "invalid">>;
export function completeNextAction(s: Scoped, opportunityId: string, now?: Date): Promise<Result<null, "not_found" | "nothing_to_complete">>;  // writes next_action_done with the text in body, then clears both columns
// lib/pipeline/notes.ts
export function addNote(s: Scoped, opportunityId: string, body: string, now?: Date): Promise<Result<{ eventId: string }, "not_found" | "invalid">>;
// lib/pipeline/schedule.ts
export function scheduleStage(s: Scoped, opportunityId: string, stageId: string, input: { scheduledAt: Date | null; format: StageFormat | null }, now?: Date): Promise<Result<null, "not_found" | "closed">>;
//   a future date on an upcoming stage makes it scheduled and writes interview_scheduled; clearing the date returns scheduled to upcoming
export function setStageOutcome(s: Scoped, opportunityId: string, stageId: string, outcomeMd: string): Promise<Result<null, "not_found">>;
// lib/pipeline/details.ts
export function updateOpportunityDetails(s: Scoped, opportunityId: string, input: Partial<Pick<CreateOpportunityInput, "roleTitle" | "location" | "workMode" | "sourceUrl" | "compMin" | "compMax" | "compCurrency" | "compNote" | "myAsk">>): Promise<Result<null, "not_found" | "invalid">>;
export function updateCompanyDetails(s: Scoped, companyId: string, input: { domain?: string; careersUrl?: string; size?: string; industry?: string; hq?: string; notesMd?: string }): Promise<Result<null, "not_found" | "invalid">>;
// lib/people/index.ts
export type PersonInput = { name: string; title?: string; linkedinUrl?: string; email?: string; notesMd?: string; role: PersonRole; stageId?: string | null };
export function addPersonToOpportunity(s: Scoped, opportunityId: string, input: PersonInput): Promise<Result<{ linkId: string; personId: string }, "not_found" | "invalid">>;
export function updateLinkedPerson(s: Scoped, opportunityId: string, linkId: string, input: PersonInput): Promise<Result<null, "not_found" | "invalid">>;
export function unlinkPerson(s: Scoped, opportunityId: string, linkId: string): Promise<Result<null, "not_found">>;
// lib/pipeline/read.ts  (read model for the job page)
export type JobView = { opportunity: OpportunityRow; company: CompanyRow; stages: StageRow[]; currentStage: StageRow; people: LinkedPerson[]; events: EventRow[] };
export function getJobView(s: Scoped, slug: string): Promise<JobView | null>;
```

```ts
// lib/pipeline/place.ts
export function placeOpportunity(s: Scoped, opportunityId: string, kind: StageKind, options?: { appliedAt?: Date; now?: Date }): Promise<Result<null, MoveError>>;
```

`placeOpportunity` puts a freshly created job where it really is, with a truthful history. A job that sits at the recruiter screen was applied to first, so jumping there straight from Saved would mark Applied as skipped, which is wrong. Algorithm: `kind === "saved"` returns `ok(null)` and writes nothing. Otherwise `now = options?.now ?? new Date()` and `appliedAt = options?.appliedAt ?? now`; call `moveOpportunity(s, opportunityId, { kind: "applied" }, appliedAt)` (so Applied gets `enteredAt = appliedAt` and the event carries that time); when `kind !== "applied"`, call `moveOpportunity(s, opportunityId, { kind }, now)`. Return the first failure, else `ok(null)`. It is the only way the add dialog (Task 8) and the import (Task 12) place a job; the seed uses it too. Tests (integration): `saved` writes no event; `applied` with an `appliedAt` gives one `stage_moved` event whose `occurredAt` and the Applied stage's `enteredAt` equal `appliedAt`; a farther kind gives exactly two `stage_moved` events, Applied is `done` with `enteredAt = appliedAt`, the stages in between are `skipped`, the target is current; user B gets `not_found`.

A person is created under the opportunity's company. `stageId`, when given, must be a stage of that opportunity, otherwise `invalid`. Tests: integration, each function with its refusals and the tenant check.

### User interface

#### Task 6. UI foundations
Install `@dnd-kit/core`; add primitives `dialog`, `select`, `textarea`, `sonner`, `toggle-group`, `empty`; add registry items `detail-view-shell`, `empty-state`, `mode-tabs`, `field-row`. Check the import path each new item expects for `use-view-mode` (Jobsmith keeps it at `lib/use-view-mode.tsx`) and record any path fix as a local change. Mount `<Toaster />` once in `app/(app)/layout.tsx`. New components: `components/live-announcer.tsx` (context plus a visually hidden `aria-live="polite"` region, `useAnnounce()`), `components/local-time.tsx`, `components/local-datetime-input.tsx`, `components/refresh-on-focus.tsx` (calls `router.refresh()` when the window regains focus or the tab becomes visible, at most once every 10 seconds). Add one utility class `pb-safe` to `app/globals.css` for the bottom safe area and record it in `docs/design-system.md`. Unit tests (Vitest with the existing setup; add `jsdom` and `@testing-library/react` only if the repo does not have them yet, and say so): announcer, the local time conversion helpers `toInstant(localValue: string): string` and `toLocalInputValue(iso: string): string` in `lib/time/local.ts`.

Shared pieces that Tasks 7 to 13 rely on are all created in Task 6, with these exact shapes:

```ts
// components/live-announcer.tsx ("use client"); the provider wraps the shell in app/(app)/layout.tsx
export function LiveAnnouncerProvider(props: { children: React.ReactNode }): React.ReactElement;
export function useAnnounce(): (message: string) => void;
// components/local-time.tsx ("use client"); renders <time dateTime={iso}>. Server render and first client render show the ISO date (YYYY-MM-DD, plus HH:MM UTC for "datetime"); after mount it shows Intl.DateTimeFormat(undefined, ...) in the browser's zone. suppressHydrationWarning is not needed because the first client render equals the server render.
export function LocalTime(props: { value: Date | string; mode?: "date" | "datetime" }): React.ReactElement;
// components/local-datetime-input.tsx ("use client"); a visible <input type="datetime-local" id={id}> plus a hidden <input name={name}> that carries the ISO instant (empty string when cleared)
export function LocalDateTimeInput(props: { id: string; name: string; defaultValue: string | null; "aria-describedby"?: string }): React.ReactElement;
// components/refresh-on-focus.tsx ("use client")
export function RefreshOnFocus(): null;
// lib/time/local.ts
export function toInstant(localValue: string): string;          // "2026-10-01T09:30" in the runtime's zone -> ISO instant; "" -> ""
export function toLocalInputValue(iso: string): string;         // ISO instant -> "YYYY-MM-DDTHH:MM" in the runtime's zone
// lib/pipeline/labels.ts (unit tested: every value of every list has a label)
export const CLOSED_REASON_LABELS: Record<ClosedReason, string>;   // Rejected, Withdrawn, Ghosted, Declined the offer, Accepted the offer
export const WORK_MODE_LABELS: Record<WorkMode, string>;           // Remote, Hybrid, On site
export const STAGE_FORMAT_LABELS: Record<StageFormat, string>;     // Phone, Video, On site, Async
export const PERSON_ROLE_LABELS: Record<PersonRole, string>;       // Recruiter, Hiring manager, Interviewer, Referrer, Other
export const STAGE_STATUS_WORDS: Record<StageStatus, string>;      // upcoming, scheduled, done, skipped
export function columnTitle(kind: StageKind): string;              // from STAGE_KINDS
// lib/pipeline/messages.ts (unit tested against the table in "UI copy")
export function messageFor(code: string): string;
// lib/forms/state.ts
export type FormState = { ok: true } | { ok: false; code: string; message: string; fieldErrors?: Record<string, string>; href?: string } | undefined;   // href: a link that belongs to the message, used for the duplicate job ("Open it")
export function fieldErrorsFromZod(error: z.ZodError): Record<string, string>;   // first message per top-level field
```

Rulings made while the draft was reviewed (binding for every task):
- `CloseDialog` (Task 7, reused by the job page in Task 10) has exactly this shape: `CloseDialog(props: { open: boolean; onOpenChange(open: boolean): void; job: { roleTitle: string; companyName: string } | null; onConfirm(reason: ClosedReason): void })`. It makes no server call. The caller's `onConfirm` calls `closeAction`, announces and shows the failure toast.
- Server actions are public endpoints, so the plain-argument actions validate too. `lib/pipeline/action-schemas.ts` (Task 7, unit tested) exports `opportunityIdSchema = z.uuid()`, `stageIdSchema = z.uuid()`, `moveTargetSchema = z.union([z.object({ kind: z.enum(STAGE_KIND_VALUES) }).strict(), z.object({ stageId: z.uuid() }).strict()])`, `closedReasonSchema = z.enum(CLOSED_REASONS)`. An action whose input fails these returns `fail("not_found", messageFor("not_found"))` and touches nothing. Reason: a malformed id would otherwise reach a uuid column and throw.
- Card keys: the keydown handler ignores the event when `!event.currentTarget.contains(event.target as Node)` (React events bubble out of portals, so a key typed inside the open Move to menu would otherwise count), when `event.metaKey`, `event.ctrlKey` or `event.altKey` is set, and when `event.repeat` is true.
- Dragging uses a `DragOverlay`, so the source card is never transformed: it stays in place with reduced opacity while `isDragging`. The title link has `draggable={false}`, otherwise the browser starts a native link drag and cancels the pointer events dnd-kit needs.
- `BoardColumn` wraps the registry's `KanbanColumn` when the column has cards (the droppable wrapper `div` owns the width and its transition, `KanbanColumn` gets a class that lets it fill the wrapper) and renders new markup only for the empty rail, whose accessible name is `<column>, no jobs`. Reason: the design system's order of preference.
- `shortcuts-sheet` is not installed in this milestone: nothing uses it, and the hint line under the board heading covers the two shortcuts.

Every form in this milestone is a client component that uses `useActionState<FormState, FormData>` with a server action of the shape `(prev: FormState, formData: FormData) => Promise<FormState>`. Actions that are not forms (move, close, reopen, skip, reorder, remove, unlink, complete next action) take plain arguments and return `Promise<Result<...>>`. Every action starts with `const user = await requireUser();`, parses its input with Zod, calls one `lib/` function with `scopedFor(user.id)`, calls `revalidatePath("/board")` and, when it concerns one job, `revalidatePath(\`/jobs/${slug}\`)`, and returns the result.

#### Task 7. Board on desktop
Files: `app/(app)/board/page.tsx` (server; `?view=closed` switches to the closed list), `app/(app)/board/actions.ts` (`moveAction`, `closeAction`, `reopenAction`), `components/board/board.tsx`, `board-column.tsx`, `job-card.tsx`, `move-menu.tsx`, `close-dialog.tsx`, `closed-list.tsx`, `lib/board/sort.ts` (`sortCards(cards: BoardCard[]): BoardCard[]`, next action date ascending with nulls last, then `updatedAt` descending, unit tested), `lib/board/days.ts` (`daysInStage(enteredAt: Date | null, now: Date): number | null`, unit tested).
Behavior: `DndContext` with `PointerSensor` (distance 5) and `TouchSensor` (delay 200, tolerance 5); the card root takes `setNodeRef` and `listeners` only, never dnd-kit's `attributes`; the focus target is the title link to `/jobs/[slug]`; a keydown handler on the card handles `1` to `7` and `c` when focus is inside the card and no input is focused; a `DragOverlay` shows the dragged card; each column is a droppable whose id is the kind; a column with no cards renders as a narrow rail that is still droppable and widens while a drag is over it; while dragging, a "Closed" drop zone appears and a drop on it opens `close-dialog.tsx` (radio group with the five reasons, none preselected); `move-menu.tsx` lists the seven columns and "Close"; the view switch Active or Closed uses `mode-tabs`; the closed list shows reason, date and a Reopen button; the move runs inside `startTransition` with `useOptimistic`, failure shows `toast.error(message)`, success calls `announce("Moved <role> at <company> to <column>.")`. Card content: company, role, fit score only when not null, a chip with the stage label when it differs from the kind's default label, "N days" from `daysInStage`, the next action with its date. `RefreshOnFocus` is mounted on the board. The empty board uses `empty-state` with an "Add job" button.

#### Task 8. Add job dialog
Files: `components/board/add-job-dialog.tsx`, `createOpportunityAction` in `app/(app)/board/actions.ts`, `lib/pipeline/create-schema.ts` (the Zod schema shared by the action and the import). Fields: company (input with `<datalist>`), role, location, work mode (radio group), link to the posting, posting text (textarea), compensation minimum, maximum, currency and note, my ask, "Where is it now" (select of the seven columns, default Saved). When a later column is chosen the action calls `createOpportunity` and then `moveOpportunity({ kind })`. Errors show inline next to the field from the Zod issues, `duplicate` shows a link to the existing job. After success the dialog closes, the board refreshes and the announcer says "Added <role> at <company>.".

#### Task 9. Board on phones
Files: `components/board/phone-board.tsx`, `move-sheet.tsx`, and the deferred Milestone 1 items in `components/app-shell.tsx` (a visible active state on the bottom tab bar driven by `aria-current`, and `pb-safe`). Below 768px the board renders a list grouped by stage (group header with the column title and count, empty groups hidden), each row opens the job and has a "Move to" button that opens a bottom `sheet` with the seven columns and "Close". Both layouts are rendered and switched with `md:hidden` and `hidden md:flex`; ids and labels stay unique across the two trees. The sheet calls the same actions as the desktop board.

#### Task 10. Job page: header, stepper, next action
Files: `app/(app)/jobs/[slug]/page.tsx` (server, `getJobView`, `notFound()` when null), `app/(app)/jobs/[slug]/actions.ts`, `components/job/job-header.tsx` (role, company, location, link to the posting, menu with Close or Reopen and "Edit details"), `edit-details-dialog.tsx`, `stage-stepper.tsx` (an ordered list; each step shows label, status and date; the current step has `aria-current="step"`; a step button opens `stage-detail-sheet.tsx`), `stage-detail-sheet.tsx` ("Move here", date and time with `LocalDateTimeInput`, format select, outcome notes textarea), `edit-stages-dialog.tsx` (rename, add with kind select and label, Move up and Move down, Skip and Unskip, Remove; a disabled control says why, in words that match the `EditError` codes), `next-action-bar.tsx` (text, date, Done, Edit). A closed job shows a banner with the reason and a Reopen button, and its stepper is read-only.

#### Task 11. Job page: tabs
Files: `components/job/job-tabs.tsx` (`DetailTabs`, `tab` search param, default `overview`), `tab-overview.tsx` (posting snapshot as plain text with the capture date, compensation facts and company facts with `DetailFields`, "Edit company" dialog), `tab-people.tsx` with `person-dialog.tsx` (add, edit, unlink; role select; optional stage select), `tab-timeline.tsx` (events newest first, each with `LocalTime`, a readable sentence per event kind from `lib/pipeline/event-text.ts`, unit tested, and an "Add note" form).

#### Task 12. One-time import
Files: `scripts/import-applications.ts`, `lib/import/applications.ts` (`parseApplications(json: unknown): Result<ImportEntry[], "invalid">`, `importApplications(s: Scoped, entries: ImportEntry[], options: { dryRun: boolean }): Promise<{ created: number; skipped: number; failed: { index: number; message: string }[] }>`), `tests/fixtures/applications.sample.json` (fictional), `package.json` script `import:applications` (`tsx --env-file-if-exists=.env scripts/import-applications.ts`), `.gitignore` entry `local/`, README section. `ImportEntry` is `{ company: string; roleTitle: string; stageKind: StageKind; appliedAt?: string; sourceUrl?: string; notes?: string; nextAction?: string }`. Replay: `createOpportunity`, then `moveOpportunity({ kind: stageKind })` unless it is `saved`; `appliedAt` becomes the Applied stage's `enteredAt`; `notes` becomes one `note` event; `nextAction` goes through `setNextAction`. The script closes its pool in `finally` and exits explicitly, like `scripts/seed.ts`.

#### Task 13. Seed, end-to-end and accessibility
`scripts/seed.ts` adds six fictional jobs across columns through the pipeline functions. New specs: `tests/e2e/pipeline.spec.ts` (add a job by hand, the card appears in Saved, drag it to Applied with stepped mouse moves, the timeline shows the move, keyboard-only pass: focus a card, press `3`, hear the announcement text in the live region, press `c`, choose a reason, the job shows under Closed, reopen it), `tests/e2e/job-page.spec.ts` (stepper move, edit stages: add a Take-home stage, rename, skip, remove; schedule a stage; next action Done; add a person; add a note), `tests/e2e/pipeline-phone.spec.ts` (phone project only: the grouped list, move with the sheet). The three browser projects share one account and one database and run in parallel, so every spec names its companies with the project name plus a random suffix and asserts only on its own cards. Axe scans, light and dark: the board with cards, the closed list, the add dialog, the close dialog, the job page on each tab, the Edit stages dialog, the stage sheet, the phone list and the move sheet. Screenshots go through the existing `scanForViolations(page, label, testInfo)`.

#### Task 14. Docs and ship
README (adding a job, keyboard shortcuts, the import with the sample file), `docs/design-system.md` (new items, local changes), spec amendments for D7, D8, D10 and D13 as notes under sections 5.1, 5.2 and 6, the preview check in Chrome and Safari, and the owner-gated last step: a mapping script for the owner's own tracker in `local/` (never committed), a dry run, then the real import on the owner's instance.

### UI copy and accessible names (fixed)

Components and end-to-end tests are written by different people, so every visible string and accessible name they share is fixed here. Use them character for character. `<role>`, `<company>`, `<column>` are runtime values; `<column>` is the `columnTitle` from `STAGE_KINDS`. No exclamation marks anywhere.

**Board (`/board`)**
- Page heading (h1): `Board`. Hint under it: `Keys 1 to 7 move the focused job. C closes it.`
- Button: `Add job`. View switch, aria-label `Board view`, options `Active` and `Closed` (search param `view=closed`).
- Columns region aria-label: `Board columns`. An empty column rail has the accessible name `<column>, no jobs`.
- Card: the title link's accessible name is `<role> at <company>` (role on the first line, company on the second). Days chip: `Today`, `1 day`, `<n> days`. Next action line: `Next: <text>`. Custom stage label chip: the label itself.
- Card menu button aria-label: `Move <role> at <company>`. Menu items: the seven column titles, a separator, then `Close job`.
- Closed drop zone text: `Drop here to close`.
- Close dialog: title `Close this job`, description `<role> at <company>`, radio group legend `Reason`, options `Rejected`, `Withdrawn`, `Ghosted`, `Declined the offer`, `Accepted the offer` (values `rejected`, `withdrawn`, `ghosted`, `declined`, `accepted`), buttons `Close job` and `Cancel`. `Close job` is disabled until a reason is chosen.
- Closed list: each row shows `<role> at <company>`, the reason label, the closed date and a `Reopen` button (aria-label `Reopen <role> at <company>`). Empty closed list: `No closed jobs.`
- Live region announcements: `Moved <role> at <company> to <column>.`, `Closed <role> at <company>.`, `Reopened <role> at <company>.`, `Added <role> at <company>.`
- Failure toast: `Could not move <role> at <company>. <message>` where `<message>` comes from `lib/pipeline/messages.ts`.
- Empty board: title `No jobs yet`, text `Add the first job you are tracking.`, button `Add job`.

**Messages for result codes (`lib/pipeline/messages.ts`, unit tested, written in Task 6):** `closed`: `This job is closed. Reopen it first.` `not_found`: `This job no longer exists.` `same_stage`: `It is already in this stage.` `same_column`: `It is already in this column.` `fixed_stage`: `Saved, Applied and Offer always stay.` `stage_current`: `This is the current stage.` `stage_done`: `A finished stage stays in the history.` `stage_has_artifacts`: `This stage has documents.` `invalid_order`: `That order is not allowed.` `label_required`: `Give the stage a name.` `not_skippable`: `Only upcoming stages can be skipped.` `not_skipped`: `This stage is not skipped.` `duplicate`: `You already track this role at this company.` `invalid`: `Check the highlighted fields.` `nothing_to_complete`: `There is no next action.` `not_closed`: `This job is not closed.` Signature: `messageFor(code: string): string`, unknown codes give `Something went wrong. Try again.`

**Add job dialog:** title `Add a job`. Field labels: `Company`, `Role`, `Location`, `Work mode` (options `Remote`, `Hybrid`, `On site`), `Link to the posting`, `Posting text`, `Pay from`, `Pay to`, `Currency`, `Pay note`, `My ask`, `Where is it now` (the seven column titles, default `Saved`). Buttons `Add job` and `Cancel`. Duplicate: the message above plus a link `Open it` to the existing job.

**Phone board:** group heading `<column>` with its count. Row button aria-label `Move <role> at <company>`, visible text `Move to`. Sheet title `Move to`, items the seven column titles and `Close job`.

**Job page (`/jobs/[slug]`)**
- h1: `<role>`. Under it the company name and the location. Link: `Original posting`. Menu button aria-label `Job actions`, items `Edit details`, then `Close job` or `Reopen job`.
- Closed banner: `Closed: <reason label> on <date>.` with a `Reopen job` button.
- Stepper: `nav` with aria-label `Stages`. Each step is a button whose accessible name is `<label>, <status word>` with status words `current`, `done`, `skipped`, `scheduled`, `upcoming` (current wins over the stored status). Button `Edit stages`.
- Stage sheet: title is the stage label. Button `Move here` (hidden on the current stage and on a closed job). Fields `Date and time`, `Format` (options `Phone`, `Video`, `On site`, `Async`), `Outcome notes`. Button `Save`.
- Edit stages dialog: title `Edit stages`. Per stage: `Rename` (aria-label `Rename <label>`), `Move up` (`Move <label> up`), `Move down` (`Move <label> down`), `Skip` or `Unskip` (`Skip <label>`, `Unskip <label>`), `Remove` (`Remove <label>`). A control that would be refused is disabled and its reason from `messageFor` is shown as text next to it. Add section heading `Add a stage`, fields `Kind` and `Label`, button `Add stage`. Button `Done` closes the dialog.
- Next action bar: heading `Next action`. Empty: `No next action.` with button `Add`. Filled: the text, the date through `LocalTime`, buttons `Done` and `Edit`. Form fields `What is next` and `When`, button `Save`.
- Edit details dialog: title `Edit details`, the same field labels as the add dialog except `Company`, `Posting text` and `Where is it now`. Button `Save`.
- Tabs: tablist aria-label `Job sections`, tabs `Overview`, `People`, `Timeline`.
- Overview: headings `Posting`, `Pay`, `Company`. `Captured <date>`. No posting: `No posting text saved.` Button `Edit company`, dialog title `Edit company`, fields `Website`, `Careers page`, `Size`, `Industry`, `Headquarters`, `Notes`.
- People: button `Add person`. Dialog titles `Add a person` and `Edit person`. Fields `Name`, `Title`, `Role in this process` (options `Recruiter`, `Hiring manager`, `Interviewer`, `Referrer`, `Other`), `Stage` (first option `Any stage`), `LinkedIn`, `Email`, `Notes`. Row buttons `Edit` (`Edit <name>`) and `Remove from this job` (`Remove <name> from this job`). Empty: `No people yet.`
- Timeline: field label `Add a note`, button `Add note`. Empty: `Nothing here yet.` Event sentences from `lib/pipeline/event-text.ts` (`eventText(event: EventRow): string`): `created`: `Added to the board.` `stage_moved`: `Moved from <from label> to <to label>.` `closed`: `Closed: <reason label>.` `reopened`: `Reopened.` `note`: the body. `interview_scheduled`: `<stage label> scheduled.` `next_action_done`: `Done: <text>.` `document_sent`: `Document sent.` `artifact_pushed`: `Documents updated.` The stage label for `interview_scheduled` is stored in `meta.stageLabel` when the event is written (Task 5).


### Adjustments made while the tasks were written

Where a task's text and this Contract differ on one of these points, the task's text wins.

- Task 1: `STAGE_KIND_VALUES` carries a tuple cast so Drizzle accepts it as an enum list, and `lib/pipeline/values.ts` also exports the derived types (`StageStatus`, `WorkMode`, `ClosedReason` and the others).
- Task 4 creates `lib/pipeline/create-schema.ts`. Tasks 8 and 12 reuse it.
- Task 7 adds `lib/board/optimistic.ts`, `lib/board/keys.ts` and `lib/pipeline/action-schemas.ts`, so the board logic and the action input checks are testable without a browser.
- Task 9 wires the phone board into `app/(app)/board/page.tsx`.
- Task 10 adds `lib/pipeline/stage-controls.ts`, which precomputes on the server which Edit stages controls are allowed, from the same pure rules the server enforces.
- Task 13 adds `tests/e2e/scan-open.ts`, because the existing scan helper reloads the page and would close a dialog before scanning it.

### Task list

| # | Task | File |
|---|---|---|
| 1 | Schema and migration | [tasks-01-05.md](tasks-01-05.md) |
| 2 | Scoped helpers per table, transaction, isolation matrix | [tasks-01-05.md](tasks-01-05.md) |
| 3 | Result, name key, slug, pipeline rules (pure) | [tasks-01-05.md](tasks-01-05.md) |
| 4 | Pipeline persistence | [tasks-01-05.md](tasks-01-05.md) |
| 5 | Next action, notes, schedule, details, people, job read model | [tasks-01-05.md](tasks-01-05.md) |
| 6 | UI foundations | [tasks-06-09.md](tasks-06-09.md) |
| 7 | Board on desktop | [tasks-06-09.md](tasks-06-09.md) |
| 8 | Add job dialog | [tasks-06-09.md](tasks-06-09.md) |
| 9 | Board on phones | [tasks-06-09.md](tasks-06-09.md) |
| 10 | Job page: header, stepper, next action | [tasks-10-14.md](tasks-10-14.md) |
| 11 | Job page: tabs | [tasks-10-14.md](tasks-10-14.md) |
| 12 | One-time import | [tasks-10-14.md](tasks-10-14.md) |
| 13 | Seed, end-to-end, accessibility | [tasks-10-14.md](tasks-10-14.md) |
| 14 | Docs and ship | [tasks-10-14.md](tasks-10-14.md) |

Each task is one reviewer gate with its own tests and ends with a commit. Later tasks may rely only on what the "Produces" block of an earlier task names.
