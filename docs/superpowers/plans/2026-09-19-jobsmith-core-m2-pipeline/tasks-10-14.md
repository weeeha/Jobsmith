# Milestone 2 (Pipeline): Tasks 10 to 14

Part of the Milestone 2 plan. Read [README.md](README.md) first: it holds the goal, the global constraints and the Contract (called "the frame" in the task text) that these tasks follow. These tasks cover the job page, the one-time import, the seed and end-to-end tests, and docs.


### Task 10: Job page: header, stepper, next action

**Files:**
- Create: `app/(app)/jobs/[slug]/page.tsx`, `app/(app)/jobs/[slug]/actions.ts`, `lib/pipeline/stage-controls.ts`, `components/job/job-header.tsx`, `components/job/edit-details-dialog.tsx`, `components/job/stage-stepper.tsx`, `components/job/stage-detail-sheet.tsx`, `components/job/edit-stages-dialog.tsx`, `components/job/next-action-bar.tsx`
- Test: `tests/unit/stage-controls.test.ts`

**Interfaces:**
- Consumes: `requireUser` (`@/lib/auth/session`, Milestone 1). `getJobView`, `JobView` (`@/lib/pipeline/read`, Task 5). `scopedFor` (`@/lib/db/scoped`, Task 2). `addStage`, `renameStage`, `reorderStages`, `skipStage`, `unskipStage`, `removeStage` (`@/lib/pipeline/stages`, Task 4). `scheduleStage`, `setStageOutcome` (`@/lib/pipeline/schedule`, Task 5). `setNextAction`, `setNextActionSchema`, `completeNextAction` (`@/lib/pipeline/next-action`, Task 5). `updateOpportunityDetails`, `updateOpportunityDetailsSchema` (`@/lib/pipeline/details`, Task 5). `planRemove`, `planSkip`, `planUnskip`, `planReorder`, `OpportunityState`, `StageState`, `EditError` (`@/lib/pipeline/rules`, Task 3). `Result` (`@/lib/result`, Task 3). `opportunityIdSchema`, `stageIdSchema` (`@/lib/pipeline/action-schemas`, Task 7). `StageKind`, `STAGE_KINDS` (`@/lib/pipeline/kinds`, Milestone 1). `StageStatus`, `StageFormat`, `STAGE_FORMATS`, `OpportunityStatus`, `ClosedReason`, `WorkMode` (`@/lib/pipeline/values`, Task 1). `messageFor` (`@/lib/pipeline/messages`, Task 6). `columnTitle`, `STAGE_FORMAT_LABELS`, `STAGE_STATUS_WORDS`, `WORK_MODE_LABELS`, `CLOSED_REASON_LABELS` (`@/lib/pipeline/labels`, Task 6). `FormState`, `fieldErrorsFromZod` (`@/lib/forms/state`, Task 6). `useAnnounce` (`@/components/live-announcer`, Task 6). `LocalTime`, `LocalDateTimeInput` (`@/components/local-time`, `@/components/local-datetime-input`, Task 6). `toInstant`, `toLocalInputValue` (`@/lib/time/local`, Task 6). `moveAction`, `closeAction`, `reopenAction` (`@/app/(app)/board/actions`, Task 7). `CloseDialog` (`@/components/board/close-dialog`, Task 7; props `{ open: boolean; onOpenChange(open: boolean): void; job: { roleTitle: string; companyName: string } | null; onConfirm(reason: ClosedReason): void }`; it makes no server call). `Dialog`/`DialogTrigger`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter`/`DialogClose` (`@/components/ui/dialog`), `Sheet`/`SheetTrigger`/`SheetContent`/`SheetHeader`/`SheetTitle`/`SheetFooter` (`@/components/ui/sheet`), `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem` (`@/components/ui/select`), `Textarea` (`@/components/ui/textarea`), `RadioGroup`/`RadioGroupItem` (`@/components/ui/radio-group`, Milestone 1), `Button` (`@/components/ui/button`, Milestone 1), `Label` (`@/components/ui/label`, Milestone 1), `Input` (`@/components/ui/input`, Milestone 1), `DropdownMenu`/`DropdownMenuTrigger`/`DropdownMenuContent`/`DropdownMenuItem`/`DropdownMenuSeparator` (`@/components/ui/dropdown-menu`, Milestone 1): all Task 6 primitives except where marked otherwise. `toast` from `"sonner"` (Task 6 mounts `<Toaster />` once in the app layout; every other call site imports `toast` straight from the package).
- Produces: the routed page `GET /jobs/[slug]`.
  From `lib/pipeline/stage-controls.ts`:
  ```typescript
  export type StageControl = { allowed: true } | { allowed: false; reason: string };
  export type StageControls = { remove: StageControl; skip: StageControl; moveUp: StageControl; moveDown: StageControl };
  export function toOpportunityState(view: Pick<JobView, "opportunity" | "stages">): OpportunityState;
  export function stageControlsFor(state: OpportunityState, now: Date): Record<string, StageControls>;
  ```
  From `app/(app)/jobs/[slug]/actions.ts` (Task 11 appends more exports to this same file, it does not redefine any of these):
  ```typescript
  export async function skipStageAction(opportunityId: string, stageId: string): Promise<Result<null, string>>;
  export async function unskipStageAction(opportunityId: string, stageId: string): Promise<Result<null, string>>;
  export async function removeStageAction(opportunityId: string, stageId: string): Promise<Result<null, string>>;
  export async function reorderStagesAction(opportunityId: string, orderedIds: string[]): Promise<Result<null, string>>;
  export async function completeNextActionAction(opportunityId: string): Promise<Result<null, string>>;
  export async function renameStageAction(opportunityId: string, stageId: string, prev: FormState, formData: FormData): Promise<FormState>;
  export async function addStageAction(opportunityId: string, prev: FormState, formData: FormData): Promise<FormState>;
  export async function saveStageDetailAction(opportunityId: string, stageId: string, prev: FormState, formData: FormData): Promise<FormState>;
  export async function setNextActionAction(opportunityId: string, prev: FormState, formData: FormData): Promise<FormState>;
  export async function updateOpportunityDetailsAction(opportunityId: string, prev: FormState, formData: FormData): Promise<FormState>;
  ```

**Frame gap closed:** the frame says the Edit stages dialog's disabled states are decided "on the server from the same pure rules," but names no file for that precomputation. `lib/pipeline/stage-controls.ts` is this plan's addition: a small pure module (no database import) that turns a `JobView` into the rule functions' `OpportunityState` shape and runs `planRemove`/`planSkip`/`planUnskip`/`planReorder` once per stage, so `page.tsx` computes it once and passes plain data down. It is not `loadState` (Task 4): `loadState` takes a lock (`SELECT ... FOR UPDATE`) meant for a mutation's transaction, and calling it from a page render would take a pointless lock and cost an extra query when `getJobView` already has everything needed.

Verified in a planning scratch file (`partc-stage-controls-spike.ts`, not kept in the repo) (type-checks under strict; a redeclared stand-in of the rule functions, since Tasks 3 to 5's files do not exist yet): for a fresh seven-stage job, Saved (current) has both `moveUp` and `moveDown` disabled with the "That order is not allowed" message, Applied and Offer are also pinned in both directions, and a middle stage such as Recruiter screen can move down but not up (its neighbor above is Applied). `skip` came back `allowed: true` for Applied and Offer in this state: `planSkip`'s own rule (Task 3, point 10) only excludes the *current* stage and a non-upcoming/scheduled status, it carries no exception for the three fixed-kind stages the way `planRemove` and `planAddStage` do, so this is the rule's real answer, not a bug in the precomputation, and the dialog must reflect it rather than second-guess it.

- [ ] **Step 1: Write the failing `stage-controls` tests**

Create `tests/unit/stage-controls.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { toOpportunityState, stageControlsFor } from "@/lib/pipeline/stage-controls";
import type { JobView } from "@/lib/pipeline/read";
import type { OpportunityRow, StageRow } from "@/lib/db/scoped";

const NOW = new Date("2026-09-19T12:00:00.000Z");

function stageRow(overrides: Partial<StageRow> & { id: string; kind: StageRow["kind"]; position: number }): StageRow {
  return {
    userId: "u1",
    opportunityId: "o1",
    label: overrides.kind,
    status: "upcoming",
    scheduledAt: null,
    format: null,
    enteredAt: null,
    completedAt: null,
    outcomeMd: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as StageRow;
}

const sevenStages: StageRow[] = [
  stageRow({ id: "s0", kind: "saved", position: 0, enteredAt: NOW }),
  stageRow({ id: "s1", kind: "applied", position: 1 }),
  stageRow({ id: "s2", kind: "recruiter_screen", position: 2 }),
  stageRow({ id: "s3", kind: "hiring_manager", position: 3 }),
  stageRow({ id: "s4", kind: "portfolio_case", position: 4 }),
  stageRow({ id: "s5", kind: "panel_final", position: 5 }),
  stageRow({ id: "s6", kind: "offer", position: 6 }),
];

function view(stages: StageRow[], currentStageId: string): Pick<JobView, "opportunity" | "stages"> {
  return {
    opportunity: { id: "o1", status: "active", currentStageId } as OpportunityRow,
    stages,
  };
}

describe("toOpportunityState", () => {
  it("maps stage rows into rule-shaped stage state, hasArtifacts always false", () => {
    const state = toOpportunityState(view(sevenStages, "s0"));
    expect(state.status).toBe("active");
    expect(state.currentStageId).toBe("s0");
    expect(state.stages).toHaveLength(7);
    expect(state.stages[0]).toMatchObject({ id: "s0", kind: "saved", position: 0, hasArtifacts: false });
  });
});

describe("stageControlsFor", () => {
  it("pins Saved, Applied and Offer in both directions and disallows removing them", () => {
    const state = toOpportunityState(view(sevenStages, "s0"));
    const controls = stageControlsFor(state, NOW);
    for (const id of ["s0", "s1", "s6"]) {
      expect(controls[id]!.moveUp).toEqual({ allowed: false, reason: "That order is not allowed." });
      expect(controls[id]!.moveDown).toEqual({ allowed: false, reason: "That order is not allowed." });
      expect(controls[id]!.remove).toEqual({ allowed: false, reason: "Saved, Applied and Offer always stay." });
    }
  });

  it("lets a middle stage move down but not up when its upward neighbor is fixed", () => {
    const state = toOpportunityState(view(sevenStages, "s0"));
    const controls = stageControlsFor(state, NOW);
    expect(controls["s2"]!.moveUp).toEqual({ allowed: false, reason: "That order is not allowed." });
    expect(controls["s2"]!.moveDown).toEqual({ allowed: true });
    expect(controls["s2"]!.remove).toEqual({ allowed: true });
  });

  it("disables skip and remove for the current stage", () => {
    const state = toOpportunityState(view(sevenStages, "s2"));
    const controls = stageControlsFor(state, NOW);
    expect(controls["s2"]!.skip).toEqual({ allowed: false, reason: "This is the current stage." });
    expect(controls["s2"]!.remove).toEqual({ allowed: false, reason: "This is the current stage." });
  });

  it("offers Unskip instead of Skip once a stage is skipped, and Unskip can fail too", () => {
    const skipped = sevenStages.map((s) => (s.id === "s3" ? { ...s, status: "skipped" as const } : s));
    const state = toOpportunityState(view(skipped, "s0"));
    const controls = stageControlsFor(state, NOW);
    expect(controls["s3"]!.skip).toEqual({ allowed: true });
    const notSkipped = toOpportunityState(view(sevenStages, "s0"));
    expect(stageControlsFor(notSkipped, NOW)["s3"]!.skip).toEqual({ allowed: true });
  });

  it("disables remove for the one stage with an artifact and for a done stage", () => {
    const done = sevenStages.map((s) => (s.id === "s2" ? { ...s, status: "done" as const } : s));
    const state = toOpportunityState(view(done, "s3"));
    const controls = stageControlsFor(state, NOW);
    expect(controls["s2"]!.remove).toEqual({ allowed: false, reason: "A finished stage stays in the history." });
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/unit/stage-controls.test.ts
```

Expected: fails with `Cannot find module '@/lib/pipeline/stage-controls'`.

- [ ] **Step 3: Write `lib/pipeline/stage-controls.ts` in full**

```typescript
import type { OpportunityState, StageState } from "@/lib/pipeline/rules";
import { planRemove, planSkip, planUnskip, planReorder } from "@/lib/pipeline/rules";
import { messageFor } from "@/lib/pipeline/messages";
import type { JobView } from "@/lib/pipeline/read";
import type { StageKind } from "@/lib/pipeline/kinds";
import type { StageStatus } from "@/lib/pipeline/values";

export type StageControl = { allowed: true } | { allowed: false; reason: string };
export type StageControls = { remove: StageControl; skip: StageControl; moveUp: StageControl; moveDown: StageControl };

export function toOpportunityState(view: Pick<JobView, "opportunity" | "stages">): OpportunityState {
  const stages: StageState[] = view.stages
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((row) => ({
      id: row.id,
      kind: row.kind as StageKind,
      label: row.label,
      position: row.position,
      status: row.status as StageStatus,
      scheduledAt: row.scheduledAt,
      enteredAt: row.enteredAt,
      completedAt: row.completedAt,
      hasArtifacts: false,
    }));
  return {
    status: view.opportunity.status,
    currentStageId: view.opportunity.currentStageId!,
    stages,
  };
}

function fromResult(result: { ok: true; data: unknown } | { ok: false; code: string; message: string }): StageControl {
  return result.ok ? { allowed: true } : { allowed: false, reason: messageFor(result.code) };
}

function reorderCheck(
  state: OpportunityState,
  orderedIds: string[],
  index: number,
  direction: "up" | "down",
): StageControl {
  const neighbor = direction === "up" ? index - 1 : index + 1;
  if (neighbor < 0 || neighbor >= orderedIds.length) {
    return { allowed: false, reason: messageFor("invalid_order") };
  }
  const candidate = orderedIds.slice();
  const a = candidate[index]!;
  const b = candidate[neighbor]!;
  candidate[index] = b;
  candidate[neighbor] = a;
  return fromResult(planReorder(state, candidate));
}

export function stageControlsFor(state: OpportunityState, now: Date): Record<string, StageControls> {
  const orderedIds = state.stages.map((s) => s.id);
  const result: Record<string, StageControls> = {};
  state.stages.forEach((stage, index) => {
    const skipOrUnskip = stage.status === "skipped" ? planUnskip(state, stage.id, now) : planSkip(state, stage.id);
    result[stage.id] = {
      remove: fromResult(planRemove(state, stage.id)),
      skip: fromResult(skipOrUnskip),
      moveUp: reorderCheck(state, orderedIds, index, "up"),
      moveDown: reorderCheck(state, orderedIds, index, "down"),
    };
  });
  return result;
}
```

The non-null assertion on `currentStageId` mirrors `loadState`'s own (Task 4, Step 5): every real opportunity has one from creation onward.

- [ ] **Step 4: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/stage-controls.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 6 passed (6)`.

- [ ] **Step 5: Write `app/(app)/jobs/[slug]/actions.ts` in full**

Every action starts with `requireUser()`, validates with Zod, calls one `lib/` function, revalidates, and returns. `revalidateJob` is the one place that looks up the opportunity's slug (an action only ever receives the opportunity's id, never a slug it would have to trust), the same convention Task 7's board actions already use for `revalidatePath(\`/jobs/${slug}\`)`.

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import type { Scoped } from "@/lib/db/scoped";
import { addStage, renameStage, reorderStages, skipStage, unskipStage, removeStage } from "@/lib/pipeline/stages";
import { scheduleStage, setStageOutcome } from "@/lib/pipeline/schedule";
import { setNextAction, setNextActionSchema, completeNextAction } from "@/lib/pipeline/next-action";
import { updateOpportunityDetails, updateOpportunityDetailsSchema } from "@/lib/pipeline/details";
import { opportunityIdSchema, stageIdSchema } from "@/lib/pipeline/action-schemas";
import { messageFor } from "@/lib/pipeline/messages";
import { fieldErrorsFromZod, type FormState } from "@/lib/forms/state";
import { STAGE_FORMATS, type StageFormat } from "@/lib/pipeline/values";
import { fail, type Result } from "@/lib/result";

const ADDABLE_STAGE_KINDS = ["recruiter_screen", "hiring_manager", "portfolio_case", "panel_final"] as const;

async function revalidateJob(s: Scoped, opportunityId: string) {
  const opportunity = await s.opportunity.getById(opportunityId);
  revalidatePath("/board");
  if (opportunity) revalidatePath(`/jobs/${opportunity.slug}`);
}

const opportunityAndStageIdSchema = z.object({ opportunityId: opportunityIdSchema, stageId: stageIdSchema });

export async function skipStageAction(opportunityId: string, stageId: string): Promise<Result<null, string>> {
  const user = await requireUser();
  const parsed = opportunityAndStageIdSchema.safeParse({ opportunityId, stageId });
  if (!parsed.success) return fail("not_found", messageFor("not_found"));
  const s = scopedFor(user.id);
  const result = await skipStage(s, opportunityId, stageId);
  if (result.ok) await revalidateJob(s, opportunityId);
  return result;
}

export async function unskipStageAction(opportunityId: string, stageId: string): Promise<Result<null, string>> {
  const user = await requireUser();
  const parsed = opportunityAndStageIdSchema.safeParse({ opportunityId, stageId });
  if (!parsed.success) return fail("not_found", messageFor("not_found"));
  const s = scopedFor(user.id);
  const result = await unskipStage(s, opportunityId, stageId);
  if (result.ok) await revalidateJob(s, opportunityId);
  return result;
}

export async function removeStageAction(opportunityId: string, stageId: string): Promise<Result<null, string>> {
  const user = await requireUser();
  const parsed = opportunityAndStageIdSchema.safeParse({ opportunityId, stageId });
  if (!parsed.success) return fail("not_found", messageFor("not_found"));
  const s = scopedFor(user.id);
  const result = await removeStage(s, opportunityId, stageId);
  if (result.ok) await revalidateJob(s, opportunityId);
  return result;
}

const reorderIdsSchema = z.object({ opportunityId: opportunityIdSchema, orderedIds: z.array(stageIdSchema).min(1) });

export async function reorderStagesAction(opportunityId: string, orderedIds: string[]): Promise<Result<null, string>> {
  const user = await requireUser();
  const parsed = reorderIdsSchema.safeParse({ opportunityId, orderedIds });
  if (!parsed.success) return fail("not_found", messageFor("not_found"));
  const s = scopedFor(user.id);
  const result = await reorderStages(s, opportunityId, orderedIds);
  if (result.ok) await revalidateJob(s, opportunityId);
  return result;
}

export async function completeNextActionAction(opportunityId: string): Promise<Result<null, string>> {
  const user = await requireUser();
  const parsed = opportunityIdSchema.safeParse(opportunityId);
  if (!parsed.success) return fail("not_found", messageFor("not_found"));
  const s = scopedFor(user.id);
  const result = await completeNextAction(s, opportunityId);
  if (result.ok) await revalidateJob(s, opportunityId);
  return result;
}

const renameStageFormSchema = z.object({ label: z.string().trim().min(1) });

export async function renameStageAction(
  opportunityId: string,
  stageId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const idsParsed = opportunityAndStageIdSchema.safeParse({ opportunityId, stageId });
  if (!idsParsed.success) return { ok: false, code: "not_found", message: messageFor("not_found") };
  const parsed = renameStageFormSchema.safeParse({ label: formData.get("label") });
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  const s = scopedFor(user.id);
  const result = await renameStage(s, opportunityId, stageId, parsed.data.label);
  if (!result.ok) return { ok: false, code: result.code, message: messageFor(result.code) };
  await revalidateJob(s, opportunityId);
  return { ok: true };
}

const addStageFormSchema = z.object({
  kind: z.enum(ADDABLE_STAGE_KINDS),
  label: z.string().trim().min(1),
});

export async function addStageAction(opportunityId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const idParsed = opportunityIdSchema.safeParse(opportunityId);
  if (!idParsed.success) return { ok: false, code: "not_found", message: messageFor("not_found") };
  const parsed = addStageFormSchema.safeParse({ kind: formData.get("kind"), label: formData.get("label") });
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  const s = scopedFor(user.id);
  const result = await addStage(s, opportunityId, parsed.data.kind, parsed.data.label);
  if (!result.ok) return { ok: false, code: result.code, message: messageFor(result.code) };
  await revalidateJob(s, opportunityId);
  return { ok: true };
}

const stageDetailFormSchema = z.object({
  scheduledAt: z.string(),
  format: z.enum([...STAGE_FORMATS, ""]),
  outcomeMd: z.string(),
});

export async function saveStageDetailAction(
  opportunityId: string,
  stageId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const idsParsed = opportunityAndStageIdSchema.safeParse({ opportunityId, stageId });
  if (!idsParsed.success) return { ok: false, code: "not_found", message: messageFor("not_found") };
  const parsed = stageDetailFormSchema.safeParse({
    scheduledAt: formData.get("scheduledAt") ?? "",
    format: formData.get("format") ?? "",
    outcomeMd: formData.get("outcomeMd") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  let scheduledAt: Date | null = null;
  if (parsed.data.scheduledAt !== "") {
    scheduledAt = new Date(parsed.data.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      return {
        ok: false,
        code: "invalid",
        message: messageFor("invalid"),
        fieldErrors: { scheduledAt: "Enter a real date and time." },
      };
    }
  }
  const format: StageFormat | null = parsed.data.format === "" ? null : parsed.data.format;
  const s = scopedFor(user.id);
  const scheduleResult = await scheduleStage(s, opportunityId, stageId, { scheduledAt, format });
  if (!scheduleResult.ok) return { ok: false, code: scheduleResult.code, message: messageFor(scheduleResult.code) };
  const outcomeResult = await setStageOutcome(s, opportunityId, stageId, parsed.data.outcomeMd);
  if (!outcomeResult.ok) return { ok: false, code: outcomeResult.code, message: messageFor(outcomeResult.code) };
  await revalidateJob(s, opportunityId);
  return { ok: true };
}

export async function setNextActionAction(
  opportunityId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const idParsed = opportunityIdSchema.safeParse(opportunityId);
  if (!idParsed.success) return { ok: false, code: "not_found", message: messageFor("not_found") };
  const atRaw = String(formData.get("at") ?? "");
  const at = atRaw === "" ? null : new Date(atRaw);
  if (at !== null && Number.isNaN(at.getTime())) {
    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: { at: "Enter a real date and time." } };
  }
  const parsed = setNextActionSchema.safeParse({ text: formData.get("text"), at });
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  const s = scopedFor(user.id);
  const result = await setNextAction(s, opportunityId, parsed.data);
  if (!result.ok) return { ok: false, code: result.code, message: messageFor(result.code) };
  await revalidateJob(s, opportunityId);
  return { ok: true };
}

export async function updateOpportunityDetailsAction(
  opportunityId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const idParsed = opportunityIdSchema.safeParse(opportunityId);
  if (!idParsed.success) return { ok: false, code: "not_found", message: messageFor("not_found") };
  const raw = {
    roleTitle: formData.get("roleTitle") || undefined,
    location: formData.get("location") || undefined,
    workMode: formData.get("workMode") || undefined,
    sourceUrl: formData.get("sourceUrl") || undefined,
    compMin: formData.get("compMin") ? Number(formData.get("compMin")) : undefined,
    compMax: formData.get("compMax") ? Number(formData.get("compMax")) : undefined,
    compCurrency: formData.get("compCurrency") || undefined,
    compNote: formData.get("compNote") || undefined,
    myAsk: formData.get("myAsk") || undefined,
  };
  const parsed = updateOpportunityDetailsSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  const s = scopedFor(user.id);
  const result = await updateOpportunityDetails(s, opportunityId, parsed.data);
  if (!result.ok) return { ok: false, code: result.code, message: messageFor(result.code) };
  await revalidateJob(s, opportunityId);
  return { ok: true };
}
```

Widening: every plain action's own declared return type is `Result<null, string>`, not the narrower `Result<null, EditError>` the underlying `lib/pipeline/stages.ts` functions return: `EditError` (and `"not_found"`/`"nothing_to_complete"` etc. elsewhere) is a subtype of `string`, so returning the lib call's result unchanged type-checks, and it lets the action add its own `"invalid"` code for a Zod failure without `EditError` ever needing to know about it. Verified in a planning scratch file (`partc-actions-pattern-spike.ts`, not kept in the repo): a narrow-union result returned from a function typed to return `Result<null, string>` type-checks under strict mode, and `someAction.bind(null, opportunityId, stageId)` leaves exactly `(prevState, formData)` for `useActionState`, matching Next's documented "passing additional arguments" pattern (`node_modules/next/dist/docs/01-app/02-guides/forms.md`).

- [ ] **Step 6: Note when the wider checks run**

This file cannot type-check on its own yet (Tasks 3 to 7 supply its imports); confirm it compiles as part of Step 12's `pnpm typecheck`.

- [ ] **Step 7: Build `components/job/job-header.tsx`**

Client component (`"use client"`; it renders a `DropdownMenu` with `onClick` handlers, and the closed banner's own "Reopen job" button starts a transition, so the whole header is one client boundary rather than splitting a few static words into their own server component).

```typescript
export function JobHeader(props: {
  opportunity: {
    id: string; roleTitle: string; sourceUrl: string | null; location: string | null;
    status: OpportunityStatus; closedReason: ClosedReason | null; closedAt: Date | null;
  };
  companyName: string;
}): React.ReactElement;
```

Structure:
- `<header>` with an `<h1>` holding `roleTitle` (copy: `<role>`, the literal `opportunity.roleTitle`).
- A line under the heading with `companyName`, and `location` appended after an interpunct when present (`{companyName}` alone when `location` is null).
- When `opportunity.sourceUrl` is set: `<a href={sourceUrl} target="_blank" rel="noreferrer">Original posting</a>`.
- A `DropdownMenu` whose trigger is a `Button` (`variant="ghost"`, `size="icon"`) with `aria-label="Job actions"`. Items: `DropdownMenuItem` "Edit details" (opens `EditDetailsDialog`, local `useState<boolean>` for `open`), a `DropdownMenuSeparator`, then either `DropdownMenuItem` "Close job" (sets local `closeOpen` state, a `useState<boolean>`, to true) when `status === "active"`, or `DropdownMenuItem` "Reopen job" when `status === "closed"`.
- `CloseDialog` from Task 7 renders beside the menu, controlled by that same state: `open={closeOpen}`, `onOpenChange={setCloseOpen}`, `job={{ roleTitle: opportunity.roleTitle, companyName }}`. `CloseDialog` itself makes no server call (Task 7's fixed shape); its `onConfirm` prop is `(reason) => startTransition(async () => { const result = await closeAction(opportunity.id, reason); if (!result.ok) { toast.error(\`Could not move ${opportunity.roleTitle} at ${companyName}. ${messageFor(result.code)}\`); } else { announce(\`Closed ${opportunity.roleTitle} at ${companyName}.\`); setCloseOpen(false); } })`, so `JobHeader` owns the request, the announcement and the failure toast.
- The "Reopen job" action (both the menu item and the banner button below run the identical handler): `startTransition(async () => { const result = await reopenAction(opportunity.id); if (!result.ok) { toast.error(messageFor(result.code)); } else { announce(\`Reopened ${opportunity.roleTitle} at ${companyName}.\`); } })`, using `useAnnounce()` and `useTransition()`. The button is `disabled` while the transition is pending.
- When `status === "closed"`: a banner (`<div role="status">`) reading `Closed: <reason label> on <date>.`, using `CLOSED_REASON_LABELS[closedReason]` for `<reason label>` and `<LocalTime value={closedAt} mode="date" />` for `<date>`, followed by a `Button` "Reopen job" (same handler as above; this is the frame's own second, deliberately redundant, affordance for the same action).
- A closed job's stepper is read-only; `JobHeader` does not decide that itself, `StageStepper` reads `opportunity.status` directly (Step 8).

Styling: semantic utilities only (`text-foreground`, `text-muted-foreground`, `border-border`, spacing scale), no raw colors or arbitrary values, matching `pnpm check:tokens`.

- [ ] **Step 8: Build `components/job/stage-stepper.tsx`**

Client component.

```typescript
export function StageStepper(props: {
  opportunity: { id: string; roleTitle: string; status: OpportunityStatus };
  companyName: string;
  stages: {
    id: string; kind: StageKind; label: string; status: StageStatus;
    scheduledAt: Date | null; format: StageFormat | null; outcomeMd: string | null;
  }[]; // already position-sorted, from view.stages
  currentStageId: string;
  controls: Record<string, StageControls>;
}): React.ReactElement;
```

Structure:
- `<nav aria-label="Stages">` containing an ordered list (`<ol>`); each stage is an `<li>` holding one `<button type="button">`.
- Each step button: `aria-current="step"` only on the stage whose `id === currentStageId`; `disabled` when `opportunity.status === "closed"` (this is what makes the whole stepper read-only on a closed job, per the frame, without a second code path). Its accessible name is set with `aria-label`, computed as `\`${stage.label}, ${statusWord}\`` where `statusWord` is `"current"` when this stage is the current one, otherwise `STAGE_STATUS_WORDS[stage.status]` (`upcoming`/`scheduled`/`done`/`skipped`, current always wins over the stored status, matching the frame's own words). The button's visible content (a status-colored dot plus the label text) can differ from the accessible name; the `aria-label` is what a screen reader and the end-to-end tests read.
- Clicking a non-disabled step button opens `StageDetailSheet` for that stage (`useState<string | null>` holding the open stage's id; the frame's "Move here" affordance lives inside the sheet, opening the sheet is what "a step button opens `stage-detail-sheet.tsx`" means: the stepper itself never calls `moveAction`).
- A `Button` "Edit stages" beside the list, `disabled` when the job is closed, opening `EditStagesDialog` (`useState<boolean>`).
- Renders one `StageDetailSheet` (Step 9) and one `EditStagesDialog` (Step 10) as siblings of the list, controlled by the local state above.

Styling: the ordered list uses `flex` / `gap-*` utilities to lay the steps out horizontally on wide viewports and does not need its own responsive split (unlike the board, one job page renders identically from phone to desktop width; the stepper wraps under Tailwind's default line-wrapping when narrow, no `md:` variant needed here).

- [ ] **Step 9: Build `components/job/stage-detail-sheet.tsx`**

Client component.

```typescript
export function StageDetailSheet(props: {
  open: boolean;
  onOpenChange(open: boolean): void;
  opportunity: { id: string; roleTitle: string; status: OpportunityStatus };
  companyName: string;
  stage: {
    id: string; label: string; kind: StageKind;
    scheduledAt: Date | null; format: StageFormat | null; outcomeMd: string | null;
  };
  isCurrent: boolean;
}): React.ReactElement;
```

Structure: `Sheet` (`side="right"`, this plan's choice: the frame fixes the copy, not the side, and a job-detail sheet sliding from the side reads as a panel rather than the phone board's bottom action sheet). `SheetHeader` > `SheetTitle` holding `stage.label` (copy: the stage's own label, the literal string, no wrapper text).
- "Move here" `Button`: rendered only when `!isCurrent && opportunity.status === "active"` (hidden on the current stage and on a closed job, per the frame). `onClick`: `startTransition(async () => { const result = await moveAction(opportunity.id, { stageId: stage.id }); if (!result.ok) { toast.error(\`Could not move ${opportunity.roleTitle} at ${companyName}. ${messageFor(result.code)}\`); } else { announce(\`Moved ${opportunity.roleTitle} at ${companyName} to ${columnTitle(result.data.to.kind)}.\`); onOpenChange(false); } })`. This plan reuses the board's own failure-toast and success-announcement copy (fixed under "Board" in the frame) because it is the same `moveAction`, doing the same thing, from a second entry point; the frame gives no separate copy for a job-page move failure, and inventing new wording here would leave two different sentences for one outcome.
- A form (`useActionState(saveStageDetailAction.bind(null, opportunity.id, stage.id), undefined)`) with:
  - `LocalDateTimeInput` labelled "Date and time" (`id`, `name="scheduledAt"`, `defaultValue={stage.scheduledAt ? toLocalInputValue(stage.scheduledAt.toISOString()) : null}`).
  - `Select` labelled "Format" (`name="format"`), options `STAGE_FORMATS` mapped through `STAGE_FORMAT_LABELS` (`Phone`, `Video`, `On site`, `Async`), plus a leading empty option for "no format set" (value `""`), `defaultValue={stage.format ?? ""}`.
  - `Textarea` labelled "Outcome notes" (`name="outcomeMd"`, `defaultValue={stage.outcomeMd ?? ""}`).
  - `Button type="submit"` "Save", `disabled` while `pending`.
  - Field errors (`state?.fieldErrors?.scheduledAt`, etc.) rendered under each field with `aria-describedby` wired to the field's `id` and `aria-invalid` set when that field has an error; a top-level `state?.message` shown in a `role="alert"` element when `state?.ok === false`.
- Focus: when the sheet opens, Base UI's `Dialog.Popup` (which `SheetContent` wraps) moves focus to itself/its first focusable element by default; when it closes, focus returns to the step button that opened it. Neither behavior needs code here (it is the primitive's own behavior), but the sheet must not set `initialFocus`/`finalFocus` overrides that would fight it.

- [ ] **Step 10: Build `components/job/edit-stages-dialog.tsx`**

Client component.

```typescript
export function EditStagesDialog(props: {
  open: boolean;
  onOpenChange(open: boolean): void;
  opportunity: { id: string };
  stages: { id: string; kind: StageKind; label: string; status: StageStatus }[]; // position-sorted
  controls: Record<string, StageControls>;
}): React.ReactElement;
```

Structure: `Dialog` > `DialogHeader` > `DialogTitle` "Edit stages".

Per stage, one row with:
- A small form (`useActionState(renameStageAction.bind(null, opportunity.id, stage.id), undefined)`) holding a single `Input` (`name="label"`, `defaultValue={stage.label}`, `aria-label`\`Rename ${stage.label}\`) that submits on blur or Enter (a native `<form>` with no visible submit button also submits on Enter inside a single-input form); this is the row's "Rename" control.
- `Button` "Move up" (`aria-label`\`Move ${stage.label} up\`), `disabled` unless `controls[stage.id].moveUp.allowed`; when disabled, the text next to it is `controls[stage.id].moveUp.reason`. `onClick`: compute `orderedIds` from the current `stages` prop with this stage's id and its upward neighbor's id swapped, then `startTransition(async () => { const result = await reorderStagesAction(opportunity.id, orderedIds); if (!result.ok) toast.error(messageFor(result.code)); })`.
- `Button` "Move down" (`aria-label`\`Move ${stage.label} down\`), mirrored the same way against `controls[stage.id].moveDown`.
- `Button` "Skip" (`aria-label`\`Skip ${stage.label}\`) when `stage.status !== "skipped"`, or "Unskip" (`aria-label`\`Unskip ${stage.label}\`) when it is; `disabled` unless `controls[stage.id].skip.allowed`, with the reason shown next to it when disabled. `onClick` calls `skipStageAction`/`unskipStageAction` through `startTransition`, toasting on failure the same way.
- `Button` "Remove" (`aria-label`\`Remove ${stage.label}\`), `disabled` unless `controls[stage.id].remove.allowed`, reason shown when disabled, calling `removeStageAction` through `startTransition`.

Below the list, an "Add a stage" section (`<h3>Add a stage</h3>`) with a form (`useActionState(addStageAction.bind(null, opportunity.id), undefined)`):
- `Select` labelled "Kind" (`name="kind"`), options from `STAGE_KINDS.filter((k) => k.kind !== "saved" && k.kind !== "applied" && k.kind !== "offer")` (`recruiter_screen`, `hiring_manager`, `portfolio_case`, `panel_final`), each rendered through its own `columnTitle`. Saved, Applied and Offer are never offered here: `planAddStage` always refuses them with `fixed_stage`, so this plan excludes them from the `Select` itself rather than rendering a control that is disabled 100% of the time. This is the same four-kind set `actions.ts`'s own (unexported) `ADDABLE_STAGE_KINDS` constant restricts `addStageAction`'s Zod schema to: a `"use server"` file may only export async functions, so the two sides derive the identical filter independently from `STAGE_KINDS` rather than sharing one constant across the module boundary.
- `Input` labelled "Label" (`name="label"`).
- `Button type="submit"` "Add stage".
- The same field-error and top-level-message pattern as Step 9's form.

`DialogFooter` > `Button` "Done" (`onClick={() => onOpenChange(false)}`), the only explicit close control besides the dialog's own built-in "X"/Escape dismissal (the `dialog` primitive, installed in Task 6, follows the same `Popup`/`Close` shape `components/ui/sheet.tsx` already shows in this repo, including a default close button).

- [ ] **Step 11: Build `components/job/edit-details-dialog.tsx` and `components/job/next-action-bar.tsx`**

`edit-details-dialog.tsx` (client).

```typescript
export function EditDetailsDialog(props: {
  open: boolean;
  onOpenChange(open: boolean): void;
  opportunity: {
    id: string; roleTitle: string; location: string | null; workMode: WorkMode | null; sourceUrl: string | null;
    compMin: number | null; compMax: number | null; compCurrency: string | null; compNote: string | null; myAsk: string | null;
  };
}): React.ReactElement;
```

`Dialog` > `DialogTitle` "Edit details". Fields, matching the add dialog's labels minus Company, Posting text and Where is it now: `Input` "Role" (`name="roleTitle"`), `Input` "Location" (`name="location"`), `RadioGroup` "Work mode" (`name="workMode"`, options `Remote`/`Hybrid`/`On site` from `WORK_MODE_LABELS`), `Input` "Link to the posting" (`name="sourceUrl"`), `Input` "Pay from" (`name="compMin"`, `type="number"`), `Input` "Pay to" (`name="compMax"`, `type="number"`), `Input` "Currency" (`name="compCurrency"`), `Textarea` "Pay note" (`name="compNote"`), `Textarea` "My ask" (`name="myAsk"`), every field's `defaultValue` from `opportunity`. `useActionState(updateOpportunityDetailsAction.bind(null, opportunity.id), undefined)`; a `useEffect` closes the dialog (`onOpenChange(false)`) when `state?.ok === true`. `Button type="submit"` "Save". No separate Cancel button: the frame's copy for this dialog names only "Save"; dismissal is the dialog's own "X"/Escape, the same as Step 10's "Done"-less alternative.

`next-action-bar.tsx` (client).

```typescript
export function NextActionBar(props: {
  opportunity: { id: string; roleTitle: string; nextAction: string | null; nextActionAt: Date | null };
}): React.ReactElement;
```

`<section>` with `<h2>Next action</h2>`. Local `useState<boolean>` `editing`.
- Not editing, `nextAction === null`: text "No next action.", `Button` "Add" (`onClick={() => setEditing(true)}`).
- Not editing, `nextAction` present: the text itself, then `<LocalTime value={nextActionAt} mode="datetime" />` when `nextActionAt` is set (omitted when it is null: the frame's "Filled" state names "the date" only for when there is one), `Button` "Done" (`onClick`: `startTransition(async () => { const result = await completeNextActionAction(opportunity.id); if (!result.ok) toast.error(messageFor(result.code)); })`), `Button` "Edit" (`onClick={() => setEditing(true)}`).
- Editing: a form (`useActionState(setNextActionAction.bind(null, opportunity.id), undefined)`) with `Input` "What is next" (`name="text"`, `defaultValue={opportunity.nextAction ?? ""}`), `LocalDateTimeInput` "When" (`name="at"`, `defaultValue={opportunity.nextActionAt ? toLocalInputValue(opportunity.nextActionAt.toISOString()) : null}`), `Button type="submit"` "Save". A `useEffect` sets `editing` back to `false` when `state?.ok === true`.

Styling for both: semantic utilities only, `duration-fast`/`ease-standard` if either animates a state change (neither strictly needs to).

- [ ] **Step 12: Assemble `app/(app)/jobs/[slug]/page.tsx`**

Server component.

```typescript
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { getJobView } from "@/lib/pipeline/read";
import { toOpportunityState, stageControlsFor } from "@/lib/pipeline/stage-controls";
import { JobHeader } from "@/components/job/job-header";
import { StageStepper } from "@/components/job/stage-stepper";
import { NextActionBar } from "@/components/job/next-action-bar";

export default async function JobPage(props: PageProps<"/jobs/[slug]">) {
  const user = await requireUser();
  const { slug } = await props.params;
  const view = await getJobView(scopedFor(user.id), slug);
  if (!view) {
    notFound();
  }

  const state = toOpportunityState(view);
  const controls = stageControlsFor(state, new Date());

  return (
    <div className="flex flex-col gap-6 p-6">
      <JobHeader opportunity={view.opportunity} companyName={view.company.name} />
      <StageStepper
        opportunity={view.opportunity}
        companyName={view.company.name}
        stages={view.stages}
        currentStageId={view.opportunity.currentStageId!}
        controls={controls}
      />
      <NextActionBar opportunity={view.opportunity} />
      {/* Task 11 adds the tab strip and the active tab's content below this line. */}
    </div>
  );
}
```

`PageProps<'/jobs/[slug]'>` is the Next.js 16 typegen helper (verified in `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` and its `not-found.md` example, which types a page the same way: `PageProps<'/blog/[slug]'>`); it resolves to `{ params: Promise<{ slug: string }>; searchParams: Promise<{ [key: string]: string | string[] | undefined }> }`, generated by `next typegen` (which `pnpm typecheck` runs first). `params` is a promise in this version and must be awaited, never read synchronously.

- [ ] **Step 13: Manual browser check**

With Tasks 1 to 9 built and a seeded job on the board:
1. `pnpm dev`, sign in, open a job from the board.
2. Confirm the h1 is the role title, the company and location line, and (when the job has one) the "Original posting" link.
3. Open "Job actions", confirm "Edit details" opens a dialog pre-filled with the job's current values, save a change, confirm it lands (revalidated) without a full reload.
4. Click a non-current step; confirm the sheet opens with that stage's label as its title, "Move here" is visible; click it; confirm the stepper's current step moves and the live region text is announced (inspect the accessibility tree or a screen reader).
5. Open "Edit stages"; confirm Saved, Applied and Offer show "Move up"/"Move down" disabled with "That order is not allowed." next to them, and their "Remove" is disabled with "Saved, Applied and Offer always stay."; add a stage, rename a stage, skip and unskip a stage, remove a removable stage.
6. Close the job (menu item, reusing Task 7's dialog); confirm the banner appears and the stepper's steps become inert (unclickable); reopen; confirm the banner disappears and steps are clickable again.
7. Set a next action, mark it Done, edit it again. Repeat the whole pass in Safari.

- [ ] **Step 14: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm check:tokens
pnpm test
pnpm build
```

Expected: all five exit 0. (`pnpm typecheck` and `pnpm build` are unverified by this plan beyond the isolated spikes above: Tasks 1–9's files do not exist in the tree yet, so the real command cannot run today; the spikes confirm the specific patterns this task adds, the `stage-controls` precomputation and the action-widening/`bind` shape, type-check in isolation under the same `strict`/`target`/`module` settings.)

- [ ] **Step 15: Commit**

```bash
git add lib/pipeline/stage-controls.ts tests/unit/stage-controls.test.ts app/\(app\)/jobs/\[slug\]/page.tsx app/\(app\)/jobs/\[slug\]/actions.ts components/job/job-header.tsx components/job/edit-details-dialog.tsx components/job/stage-stepper.tsx components/job/stage-detail-sheet.tsx components/job/edit-stages-dialog.tsx components/job/next-action-bar.tsx
git commit -m "$(cat <<'EOF'
feat: add the job page header, stage stepper and next action bar
EOF
)"
```

---

### Task 11: Job page: tabs

**Files:**
- Modify: `app/(app)/jobs/[slug]/page.tsx` (add the tab strip and the active tab's content, below the next action bar Task 10 left as the last element), `app/(app)/jobs/[slug]/actions.ts` (append the actions below)
- Create: `lib/pipeline/event-text.ts`, `components/job/job-tabs.tsx`, `components/job/tab-overview.tsx`, `components/job/edit-company-dialog.tsx`, `components/job/tab-people.tsx`, `components/job/person-dialog.tsx`, `components/job/tab-timeline.tsx`
- Test: `tests/unit/event-text.test.ts`

**Interfaces:**
- Consumes: everything Task 10 produces, plus: `updateCompanyDetails`, `updateCompanyDetailsSchema` (`@/lib/pipeline/details`, Task 5). `addPersonToOpportunity`, `updateLinkedPerson`, `unlinkPerson`, `personInputSchema`, `PersonInput` (`@/lib/people`, Task 5). `addNote`, `addNoteSchema` (`@/lib/pipeline/notes`, Task 5). `PersonRole` (`@/lib/pipeline/values`, Task 1). `WORK_MODE_LABELS`, `PERSON_ROLE_LABELS` (`@/lib/pipeline/labels`, Task 6). `CLOSED_REASON_LABELS` (`@/lib/pipeline/labels`, Task 6, used by `eventText`). `DetailTabs` (`@/components/super-ai/detail-tabs`, Task 6; props `{ items: { id: string; label: string; count?: number }[]; activeId: string; onSelect(id: string): void; ariaLabel: string; className?: string }`, a client component). `DetailFields` (`@/components/super-ai/detail-fields`, Task 6; props `{ fields: { id: string; label: string; value: React.ReactNode }[]; className?: string }`, a client component). `EmptyState` (`@/components/super-ai/empty-state`, Task 6; props include `size?: "page" | "panel" | "in-grid"` and `title: React.ReactNode`, used here as `<EmptyState size="panel" title="..." />` with no icon or action). `CompanyRow`, `LinkedPerson`, `EventRow`, `PersonRow` (`@/lib/db/scoped`, Task 2). `useRouter` from `"next/navigation"`.
- Produces:
  ```typescript
  // lib/pipeline/event-text.ts
  export function eventText(event: EventRow): string;
  ```
  From `app/(app)/jobs/[slug]/actions.ts` (appended to Task 10's file, none of its exports are redefined):
  ```typescript
  export async function updateCompanyDetailsAction(companyId: string, opportunityId: string, prev: FormState, formData: FormData): Promise<FormState>;
  export async function addPersonAction(opportunityId: string, prev: FormState, formData: FormData): Promise<FormState>;
  export async function updatePersonAction(opportunityId: string, linkId: string, prev: FormState, formData: FormData): Promise<FormState>;
  export async function unlinkPersonAction(opportunityId: string, linkId: string): Promise<Result<null, string>>;
  export async function addNoteAction(opportunityId: string, prev: FormState, formData: FormData): Promise<FormState>;
  ```

**On `DetailTabs` and tab panels:** the registry source (`detail-tabs.tsx` as the registry publishes it) renders only `role="tablist"` and `role="tab"` buttons with `data-tab={item.id}`; it gives each button no stable `id`, so a caller outside the component cannot point a panel's `aria-labelledby` at one. Rather than half-wire the ARIA tabs pattern (a `role="tabpanel"` with no working `aria-labelledby` is worse than not claiming the role), each tab's content is a plain `<section aria-label="Overview">` / `aria-label="People"` / `aria-label="Timeline"`: a labelled landmark region, not a formal tabpanel. This is this plan's own resolution of a real gap between the registry component's actual shape and a fully-wired tabs pattern; it does not change any of the frame's fixed copy (the tablist's own `aria-label="Job sections"` and the three tab labels are unaffected).

- [ ] **Step 1: Write the failing `eventText` tests**

Create `tests/unit/event-text.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { eventText } from "@/lib/pipeline/event-text";
import type { EventRow } from "@/lib/db/scoped";

const NOW = new Date("2026-09-19T12:00:00.000Z");

function makeEvent(overrides: Partial<EventRow> & Pick<EventRow, "kind">): EventRow {
  return {
    id: "e1",
    userId: "u1",
    opportunityId: "o1",
    stageId: null,
    body: null,
    meta: {},
    occurredAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as EventRow;
}

describe("eventText", () => {
  it("created: Added to the board.", () => {
    expect(eventText(makeEvent({ kind: "created" }))).toBe("Added to the board.");
  });

  it("stage_moved: Moved from <from label> to <to label>.", () => {
    const event = makeEvent({
      kind: "stage_moved",
      meta: {
        from: { stageId: "s1", kind: "saved", label: "Saved" },
        to: { stageId: "s2", kind: "applied", label: "Applied" },
      },
    });
    expect(eventText(event)).toBe("Moved from Saved to Applied.");
  });

  it("closed: Closed: <reason label>.", () => {
    expect(eventText(makeEvent({ kind: "closed", meta: { reason: "rejected" } }))).toBe("Closed: Rejected.");
  });

  it("reopened: Reopened.", () => {
    expect(eventText(makeEvent({ kind: "reopened" }))).toBe("Reopened.");
  });

  it("note: the body", () => {
    expect(eventText(makeEvent({ kind: "note", body: "Recruiter called, moving to onsite next week." }))).toBe(
      "Recruiter called, moving to onsite next week.",
    );
  });

  it("interview_scheduled: <stage label> scheduled.", () => {
    const event = makeEvent({
      kind: "interview_scheduled",
      meta: { stageLabel: "Panel", scheduledAt: NOW.toISOString(), format: "video" },
    });
    expect(eventText(event)).toBe("Panel scheduled.");
  });

  it("interview_scheduled falls back when meta.stageLabel is missing", () => {
    expect(eventText(makeEvent({ kind: "interview_scheduled", meta: {} }))).toBe("Scheduled.");
  });

  it("document_sent: Document sent.", () => {
    expect(eventText(makeEvent({ kind: "document_sent" }))).toBe("Document sent.");
  });

  it("artifact_pushed: Documents updated.", () => {
    expect(eventText(makeEvent({ kind: "artifact_pushed" }))).toBe("Documents updated.");
  });

  it("next_action_done: Done: <text>.", () => {
    expect(eventText(makeEvent({ kind: "next_action_done", body: "Follow up with recruiter" }))).toBe(
      "Done: Follow up with recruiter.",
    );
  });
});
```

The `interview_scheduled` fallback case is this plan's own defensive addition, not a frame sentence: `scheduleStage` (Task 5) writes `meta.stageLabel` on every real `interview_scheduled` event, so in practice the fallback never fires, but `event.meta` is untyped `jsonb` (no `.$type<...>()` on the column, confirmed in `part-a.md`'s Task 1 Step 2), so `eventText`'s own signature (`(event: EventRow): string`, fixed by the frame) cannot assume its shape at the type level and must not throw or print "undefined" if it is ever missing.

- [ ] **Step 2: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/unit/event-text.test.ts
```

Expected: fails with `Cannot find module '@/lib/pipeline/event-text'`.

- [ ] **Step 3: Write `lib/pipeline/event-text.ts` in full**

```typescript
import type { EventRow } from "@/lib/db/scoped";
import { CLOSED_REASON_LABELS } from "@/lib/pipeline/labels";
import type { ClosedReason } from "@/lib/pipeline/values";

function metaRecord(meta: unknown): Record<string, unknown> {
  return meta !== null && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
}

function metaString(meta: Record<string, unknown>, key: string): string {
  const value = meta[key];
  return typeof value === "string" ? value : "";
}

export function eventText(event: EventRow): string {
  switch (event.kind) {
    case "created":
      return "Added to the board.";
    case "stage_moved": {
      const meta = metaRecord(event.meta);
      const from = metaRecord(meta.from);
      const to = metaRecord(meta.to);
      return `Moved from ${metaString(from, "label")} to ${metaString(to, "label")}.`;
    }
    case "closed": {
      const meta = metaRecord(event.meta);
      const reason = metaString(meta, "reason") as ClosedReason;
      return `Closed: ${CLOSED_REASON_LABELS[reason] ?? reason}.`;
    }
    case "reopened":
      return "Reopened.";
    case "note":
      return event.body ?? "";
    case "interview_scheduled": {
      const meta = metaRecord(event.meta);
      const stageLabel = metaString(meta, "stageLabel");
      return stageLabel ? `${stageLabel} scheduled.` : "Scheduled.";
    }
    case "document_sent":
      return "Document sent.";
    case "artifact_pushed":
      return "Documents updated.";
    case "next_action_done":
      return `Done: ${event.body ?? ""}.`;
  }
}
```

The `switch` covers every member of `EVENT_KINDS` (Task 1) with no `default`, so TypeScript's own exhaustiveness check over the `EventKind` union is what catches a future event kind this function has not been taught to render: adding a tenth kind without adding a case here fails `pnpm typecheck` with "not all code paths return a value," not a silent `undefined` at runtime.

Verified in a planning scratch file (`partc-event-text-spike.ts`, not kept in the repo) (a redeclared stand-in of `EventRow`, since Task 2 does not exist yet): type-checks under strict, and running it under `tsx` prints the frame's nine sentences character for character for a representative event of each kind.

- [ ] **Step 4: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/event-text.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 10 passed (10)`.

- [ ] **Step 5: Append the tab-related actions to `app/(app)/jobs/[slug]/actions.ts`**

Add these imports to the top of the file (alongside Task 10's):

```typescript
import { updateCompanyDetails, updateCompanyDetailsSchema } from "@/lib/pipeline/details";
import { addPersonToOpportunity, updateLinkedPerson, unlinkPerson, personInputSchema } from "@/lib/people";
import { addNote, addNoteSchema } from "@/lib/pipeline/notes";
```

Append these exports:

```typescript
export async function updateCompanyDetailsAction(
  companyId: string,
  opportunityId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const idParsed = opportunityIdSchema.safeParse(opportunityId);
  if (!idParsed.success) return { ok: false, code: "not_found", message: messageFor("not_found") };
  const raw = {
    domain: formData.get("domain") || undefined,
    careersUrl: formData.get("careersUrl") || undefined,
    size: formData.get("size") || undefined,
    industry: formData.get("industry") || undefined,
    hq: formData.get("hq") || undefined,
    notesMd: formData.get("notesMd") || undefined,
  };
  const parsed = updateCompanyDetailsSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  const s = scopedFor(user.id);
  const result = await updateCompanyDetails(s, companyId, parsed.data);
  if (!result.ok) return { ok: false, code: result.code, message: messageFor(result.code) };
  await revalidateJob(s, opportunityId);
  return { ok: true };
}

function personInputFromFormData(formData: FormData) {
  const stageId = formData.get("stageId");
  return {
    name: formData.get("name"),
    title: formData.get("title") || undefined,
    linkedinUrl: formData.get("linkedinUrl") || undefined,
    email: formData.get("email") || undefined,
    notesMd: formData.get("notesMd") || undefined,
    role: formData.get("role"),
    stageId: stageId === "" || stageId === null ? null : stageId,
  };
}

export async function addPersonAction(opportunityId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const idParsed = opportunityIdSchema.safeParse(opportunityId);
  if (!idParsed.success) return { ok: false, code: "not_found", message: messageFor("not_found") };
  const parsed = personInputSchema.safeParse(personInputFromFormData(formData));
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  const s = scopedFor(user.id);
  const result = await addPersonToOpportunity(s, opportunityId, parsed.data);
  if (!result.ok) return { ok: false, code: result.code, message: messageFor(result.code) };
  await revalidateJob(s, opportunityId);
  return { ok: true };
}

export async function updatePersonAction(
  opportunityId: string,
  linkId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const idParsed = opportunityIdSchema.safeParse(opportunityId);
  if (!idParsed.success) return { ok: false, code: "not_found", message: messageFor("not_found") };
  const parsed = personInputSchema.safeParse(personInputFromFormData(formData));
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  const s = scopedFor(user.id);
  const result = await updateLinkedPerson(s, opportunityId, linkId, parsed.data);
  if (!result.ok) return { ok: false, code: result.code, message: messageFor(result.code) };
  await revalidateJob(s, opportunityId);
  return { ok: true };
}

export async function unlinkPersonAction(opportunityId: string, linkId: string): Promise<Result<null, string>> {
  const user = await requireUser();
  const parsed = z.object({ opportunityId: opportunityIdSchema, linkId: z.uuid() }).safeParse({ opportunityId, linkId });
  if (!parsed.success) return fail("not_found", messageFor("not_found"));
  const s = scopedFor(user.id);
  const result = await unlinkPerson(s, opportunityId, linkId);
  if (result.ok) await revalidateJob(s, opportunityId);
  return result;
}

export async function addNoteAction(opportunityId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const idParsed = opportunityIdSchema.safeParse(opportunityId);
  if (!idParsed.success) return { ok: false, code: "not_found", message: messageFor("not_found") };
  const parsed = addNoteSchema.safeParse({ body: formData.get("body") });
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  const s = scopedFor(user.id);
  const result = await addNote(s, opportunityId, parsed.data.body);
  if (!result.ok) return { ok: false, code: result.code, message: messageFor(result.code) };
  await revalidateJob(s, opportunityId);
  return { ok: true };
}
```

`updateCompanyDetailsAction` takes both `companyId` (what it edits) and `opportunityId` (only to find the one job's slug to revalidate, via the same `revalidateJob` helper Task 10 wrote): a company can have more than one job, and this dialog only ever opens from one job's Overview tab, so only that job's page needs a fresh render.

- [ ] **Step 6: Run the wider checks on the actions file so far**

```bash
pnpm typecheck
```

Expected: exits 0 once Tasks 1–9 exist (unverified today: see Task 10 Step 14's note; the same caveat applies here).

- [ ] **Step 7: Build `components/job/job-tabs.tsx`**

Client component (`"use client"`; it calls `useRouter()`).

```typescript
export type JobTabId = "overview" | "people" | "timeline";
export function JobTabs(props: { activeTab: JobTabId; basePath: string }): React.ReactElement;
```

Structure: a `TAB_ITEMS` constant `[{ id: "overview", label: "Overview" }, { id: "people", label: "People" }, { id: "timeline", label: "Timeline" }]` (no `count`: the frame's copy for these three tabs carries no badge count, and `DetailTabs`'s `count` is optional). Renders `<DetailTabs items={TAB_ITEMS} activeId={activeTab} onSelect={onSelect} ariaLabel="Job sections" />`, where `onSelect(id)` calls `router.push(\`${basePath}?tab=${id}\`, { scroll: false })`. No `useSearchParams()` here: `activeTab` arrives as a prop from the server page, which already read `searchParams` itself (the pattern the Next.js docs recommend, `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md`: "If you want to fetch data in a Server Component based on search params, it's often a better option to read the `searchParams` prop of the corresponding Page... and pass it down"), so this component needs no `<Suspense>` boundary.

- [ ] **Step 8: Build `components/job/tab-overview.tsx` and `components/job/edit-company-dialog.tsx`**

`tab-overview.tsx`: server component.

```typescript
export function TabOverview(props: {
  opportunity: {
    postingMd: string | null; postingCapturedAt: Date | null; compMin: number | null;
    compMax: number | null; compCurrency: string | null; compNote: string | null; myAsk: string | null;
  };
  company: CompanyRow;
  opportunityId: string;
}): React.ReactElement;
```

Structure: `<section aria-label="Overview">`.
- `<h2>Posting</h2>`. When `postingMd` is set: `Captured <LocalTime value={postingCapturedAt} mode="date" />.` above a `<div className="whitespace-pre-wrap">{postingMd}</div>` (D10: plain text, line breaks kept, no markdown rendering until Milestone 3). When `postingMd` is null: `No posting text saved.`
- `<h2>Pay</h2>` then `<DetailFields fields={payFields} />`. `payFields` (this plan's own field list; the frame fixes the *edit* dialog's field labels, not this read-only list's, so it reuses the same words for consistency): `[{ id: "range", label: "Pay range", value: formatPayRange(compMin, compMax, compCurrency) }, { id: "note", label: "Pay note", value: compNote ?? "Not set" }, { id: "ask", label: "My ask", value: myAsk ?? "Not set" }]`, where `formatPayRange` (a small function defined in this same file, not exported) returns `"Not set"` when both `compMin` and `compMax` are null, `\`${value.toLocaleString()} ${currency ?? ""}\`.trim()` when only one bound is set, and `\`${min.toLocaleString()}–${max.toLocaleString()} ${currency ?? ""}\`.trim()` when both are set.
- `<h2>Company</h2>` then `<DetailFields fields={companyFields} />`: `[{id:"website",label:"Website",value: company.domain ?? "Not set"}, {id:"careers",label:"Careers page",value: company.careersUrl ? <a href={company.careersUrl} target="_blank" rel="noreferrer">{company.careersUrl}</a> : "Not set"}, {id:"size",label:"Size",value: company.size ?? "Not set"}, {id:"industry",label:"Industry",value: company.industry ?? "Not set"}, {id:"hq",label:"Headquarters",value: company.hq ?? "Not set"}]`. When `company.notesMd` is set, a `<div className="whitespace-pre-wrap">{company.notesMd}</div>` underneath labelled `<h3>Notes</h3>`; omitted when null.
- `<EditCompanyDialogTrigger company={company} opportunityId={opportunityId} />` (from `edit-company-dialog.tsx`) renders the "Edit company" button and owns the dialog's open state.

`edit-company-dialog.tsx`: client component.

```typescript
export function EditCompanyDialogTrigger(props: { company: CompanyRow; opportunityId: string }): React.ReactElement;
```

A `Button` "Edit company" (`onClick={() => setOpen(true)}`) plus a `Dialog` (`open`, `onOpenChange`) with `DialogTitle` "Edit company", fields `Input` "Website" (`name="domain"`), `Input` "Careers page" (`name="careersUrl"`), `Input` "Size" (`name="size"`), `Input` "Industry" (`name="industry"`), `Input` "Headquarters" (`name="hq"`), `Textarea` "Notes" (`name="notesMd"`), every `defaultValue` from `company`. `useActionState(updateCompanyDetailsAction.bind(null, company.id, opportunityId), undefined)`, `Button type="submit"` "Save", a `useEffect` closing the dialog on `state?.ok === true`, the same field-error pattern as Task 10's forms.

- [ ] **Step 9: Build `components/job/tab-people.tsx` and `components/job/person-dialog.tsx`**

`tab-people.tsx`: server component for the list, delegating the interactive parts to client children.

```typescript
export function TabPeople(props: {
  opportunityId: string;
  stages: { id: string; label: string }[];
  people: LinkedPerson[];
}): React.ReactElement;
```

Structure: `<section aria-label="People">`. `PersonDialogTrigger` (from `person-dialog.tsx`) renders the `Button` "Add person" and owns the add dialog. When `people.length === 0`: `<EmptyState size="panel" title="No people yet." />` (the `empty-state` registry item, Task 6: a plain one-line title with no icon or action, since "Add person" already lives outside the empty state as a persistent control). Otherwise a list of rows, each: the person's `name` and `title` (when set), the role label (`PERSON_ROLE_LABELS[role]`), the stage label when `stageId` is set (looked up in `stages`), a client `PersonRowActions` component (defined in `person-dialog.tsx`, exported alongside `PersonDialogTrigger`) rendering `Button` "Edit" (`aria-label`\`Edit ${person.name}\`, opens an edit `PersonDialog` pre-filled from this row) and `Button` "Remove from this job" (`aria-label`\`Remove ${person.name} from this job\`, calls `unlinkPersonAction(opportunityId, linkId)` through `startTransition`, toasting `messageFor(result.code)` on failure).

`person-dialog.tsx`: client component. One shared dialog body for both modes:

```typescript
type PersonDialogMode =
  | { mode: "add" }
  | { mode: "edit"; linkId: string; initial: PersonInput };
export function PersonDialogTrigger(props: { opportunityId: string; stages: { id: string; label: string }[] }): React.ReactElement;
export function PersonRowActions(props: { opportunityId: string; linkId: string; person: { name: string; title: string | null; linkedinUrl: string | null; email: string | null; notesMd: string | null }; role: PersonRole; stageId: string | null; stages: { id: string; label: string }[] }): React.ReactElement;
```

The dialog itself (used by both exports through a shared internal `PersonDialog` component, not exported): `DialogTitle` is "Add a person" in add mode, "Edit person" in edit mode. Fields: `Input` "Name" (`name="name"`), `Input` "Title" (`name="title"`), `Select` "Role in this process" (`name="role"`, options `Recruiter`/`Hiring manager`/`Interviewer`/`Referrer`/`Other` from `PERSON_ROLE_LABELS`), `Select` "Stage" (`name="stageId"`, first option value `""` labelled "Any stage", then one option per `stages` entry), `Input` "LinkedIn" (`name="linkedinUrl"`), `Input` "Email" (`name="email"`, `type="email"`), `Textarea` "Notes" (`name="notesMd"`). `useActionState` bound to `addPersonAction.bind(null, opportunityId)` in add mode or `updatePersonAction.bind(null, opportunityId, linkId)` in edit mode; `Button type="submit"` "Save"; closes on `state?.ok === true`.

- [ ] **Step 10: Build `components/job/tab-timeline.tsx`**

Server component for the event list, one small client form for the note.

```typescript
export function TabTimeline(props: {
  opportunityId: string;
  events: EventRow[]; // already newest-first, per s.event.listForOpportunity's contract, Task 2
}): React.ReactElement;
```

Structure: `<section aria-label="Timeline">`. A note form (`useActionState(addNoteAction.bind(null, opportunityId), undefined)`, a client sub-component since it needs `useActionState`): `Textarea` labelled "Add a note" (`name="body"`), `Button type="submit"` "Add note". When `events.length === 0`: `<EmptyState size="panel" title="Nothing here yet." />`. Otherwise an ordered list, each item: `<LocalTime value={event.occurredAt} mode="datetime" />` then `eventText(event)`.

- [ ] **Step 11: Wire the tabs into `app/(app)/jobs/[slug]/page.tsx`**

Replace the file's contents with:

```typescript
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { getJobView } from "@/lib/pipeline/read";
import { toOpportunityState, stageControlsFor } from "@/lib/pipeline/stage-controls";
import { JobHeader } from "@/components/job/job-header";
import { StageStepper } from "@/components/job/stage-stepper";
import { NextActionBar } from "@/components/job/next-action-bar";
import { JobTabs, type JobTabId } from "@/components/job/job-tabs";
import { TabOverview } from "@/components/job/tab-overview";
import { TabPeople } from "@/components/job/tab-people";
import { TabTimeline } from "@/components/job/tab-timeline";

const TAB_IDS: readonly JobTabId[] = ["overview", "people", "timeline"];

function resolveTab(value: string | string[] | undefined): JobTabId {
  return typeof value === "string" && (TAB_IDS as readonly string[]).includes(value) ? (value as JobTabId) : "overview";
}

export default async function JobPage(props: PageProps<"/jobs/[slug]">) {
  const user = await requireUser();
  const { slug } = await props.params;
  const searchParams = await props.searchParams;
  const view = await getJobView(scopedFor(user.id), slug);
  if (!view) {
    notFound();
  }

  const state = toOpportunityState(view);
  const controls = stageControlsFor(state, new Date());
  const tab = resolveTab(searchParams.tab);
  const stageOptions = view.stages.map((stage) => ({ id: stage.id, label: stage.label }));

  return (
    <div className="flex flex-col gap-6 p-6">
      <JobHeader opportunity={view.opportunity} companyName={view.company.name} />
      <StageStepper
        opportunity={view.opportunity}
        companyName={view.company.name}
        stages={view.stages}
        currentStageId={view.opportunity.currentStageId!}
        controls={controls}
      />
      <NextActionBar opportunity={view.opportunity} />
      <div>
        <JobTabs activeTab={tab} basePath={`/jobs/${slug}`} />
        {tab === "overview" && (
          <TabOverview opportunity={view.opportunity} company={view.company} opportunityId={view.opportunity.id} />
        )}
        {tab === "people" && (
          <TabPeople opportunityId={view.opportunity.id} stages={stageOptions} people={view.people} />
        )}
        {tab === "timeline" && <TabTimeline opportunityId={view.opportunity.id} events={view.events} />}
      </div>
    </div>
  );
}
```

An unknown or missing `tab` value falls back to `"overview"` (`resolveTab`'s default), matching the frame exactly. `searchParams` is a promise in this version (verified against the same `page.md` guide as Task 10's `params`) and is read once, here, rather than in any child component.

- [ ] **Step 12: Manual browser check**

With Tasks 1 to 10 and this task built:
1. Open a job; confirm the tab strip reads "Overview", "People", "Timeline" and the URL gains `?tab=overview` after the first click (or starts there if you navigate straight to `?tab=people`).
2. Arrow-key between tabs with focus on the tablist; confirm the URL and the content both change with each arrow press (the registry `DetailTabs` calls `onSelect` on arrow navigation, not only on click).
3. Overview: confirm the posting text preserves line breaks, the Pay and Company fact lists render, "Edit company" saves and revalidates.
4. People: add a person, edit them, remove them; confirm the empty state text appears once none are left.
5. Timeline: confirm events read as the fixed sentences (add a note and confirm it appears verbatim, move the job from the board and confirm a "Moved from X to Y." line appears here too).
6. Repeat in Safari.

- [ ] **Step 13: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm check:tokens
pnpm test
pnpm build
```

Expected: all five exit 0 (same unverified-today caveat as Task 10 Step 14; `pnpm test` for this task's own new unit tests, `event-text.test.ts`, is verified in Steps 2 and 4 above).

- [ ] **Step 14: Commit**

```bash
git add lib/pipeline/event-text.ts tests/unit/event-text.test.ts app/\(app\)/jobs/\[slug\]/page.tsx app/\(app\)/jobs/\[slug\]/actions.ts components/job/job-tabs.tsx components/job/tab-overview.tsx components/job/edit-company-dialog.tsx components/job/tab-people.tsx components/job/person-dialog.tsx components/job/tab-timeline.tsx
git commit -m "$(cat <<'EOF'
feat: add the job page's Overview, People and Timeline tabs
EOF
)"
```

---

### Task 12: One-time import

**Files:**
- Create: `scripts/import-applications.ts`, `lib/import/applications.ts`, `tests/fixtures/applications.sample.json`, `tests/integration/import-applications.test.ts`
- Modify: `package.json` (add the `import:applications` script), `.gitignore` (add `local/`), `README.md` (add "Importing applications once")

**Interfaces:**
- Consumes: `createOpportunity` (`@/lib/pipeline/create`, Task 4). `placeOpportunity` (`@/lib/pipeline/place`, Task 5). `addNote` (`@/lib/pipeline/notes`, Task 5). `setNextAction` (`@/lib/pipeline/next-action`, Task 5). `companyNameKey` (`@/lib/companies/name-key`, Task 3). `Scoped`, `scoped` (`@/lib/db/scoped`, Task 2). `createDb` (`@/lib/db/client`, Milestone 1). `user` table (`@/lib/db/schema`, Milestone 1). `Result`, `ok`, `fail` (`@/lib/result`, Task 3). `STAGE_KIND_VALUES` (`@/lib/pipeline/values`, Task 1). `StageKind` (`@/lib/pipeline/kinds`, Milestone 1). `makeTestDb`, `createTestUser` (`tests/helpers/db.ts`, Milestone 1). `expectOk` (`tests/helpers/result.ts`, Task 3).
- Produces:
  ```typescript
  // lib/import/applications.ts
  export type ImportEntry = {
    company: string; roleTitle: string; stageKind: StageKind;
    appliedAt?: string; sourceUrl?: string; notes?: string; nextAction?: string;
  };
  export const importEntrySchema: z.ZodType<ImportEntry>;
  export function parseApplications(json: unknown): Result<ImportEntry[], "invalid">;
  export function importApplications(
    s: Scoped,
    entries: ImportEntry[],
    options: { dryRun: boolean },
  ): Promise<{ created: number; skipped: number; failed: { index: number; message: string }[] }>;
  ```
  `pnpm import:applications <file> [--email <address>] [--dry-run]`.

**README ownership note:** the frame lists a "README section" under this task's own files and separately under Task 14's ("Importing applications once"). This plan reads that as Task 12 writing the section (it ships with the feature, in the same commit), and Task 14 checking it is complete and accurate alongside the two sections Task 12 has no reason to touch ("Adding a job", "Keyboard shortcuts on the board", both depending on Tasks 7 to 9). Task 14 does not rewrite this section from scratch.

- [ ] **Step 1: Write the Zod schema in full**

Create `lib/import/applications.ts` (schema and type only for this step; the two functions follow in Steps 5 and 7):

```typescript
import { z } from "zod";
import { STAGE_KIND_VALUES } from "@/lib/pipeline/values";
import type { Result } from "@/lib/result";
import { ok, fail } from "@/lib/result";
import type { Scoped } from "@/lib/db/scoped";
import { companyNameKey } from "@/lib/companies/name-key";
import { createOpportunity } from "@/lib/pipeline/create";
import { placeOpportunity } from "@/lib/pipeline/place";
import { addNote } from "@/lib/pipeline/notes";
import { setNextAction } from "@/lib/pipeline/next-action";

export const importEntrySchema = z.object({
  company: z.string().trim().min(1),
  roleTitle: z.string().trim().min(1),
  stageKind: z.enum(STAGE_KIND_VALUES),
  // Deliberately loose: a non-empty string, not a strict date format. An
  // appliedAt that does not parse as a real date fails per entry, by index,
  // inside importApplications (Step 5/6). It must not reject the whole
  // file here, or one bad date would silently take seven good entries with
  // it.
  appliedAt: z.string().trim().min(1).optional(),
  sourceUrl: z.url({ protocol: /^https?$/ }).optional(),
  notes: z.string().trim().min(1).optional(),
  nextAction: z.string().trim().min(1).optional(),
});

export type ImportEntry = z.infer<typeof importEntrySchema>;

const importEntriesSchema = z.array(importEntrySchema);
```

Verified in a planning scratch file (`partc-applications-schema-spike.ts`, not kept in the repo) against the real installed `zod` (^4.6.5, not a stub): a well-formed array of entries parses; an entry with an unknown `stageKind` fails the whole array (this is what makes the file, not one entry, invalid: see Step 5); an entry whose `appliedAt` is a nonsense string ("not-a-real-date") still parses successfully at this layer and is only caught later by `new Date(...)` producing an `Invalid Date`; a non-array top-level value fails; a `javascript:` `sourceUrl` is rejected by `z.url`'s protocol restriction.

- [ ] **Step 2: Write the sample fixture**

Create `tests/fixtures/applications.sample.json` (fictional: Acme Robotics, Northwind Labs, Lumen Health, the same three companies `scripts/seed.ts` uses in Task 13, safe to reuse because the two datasets never load into the same database):

```json
[
  {
    "company": "Acme Robotics",
    "roleTitle": "Senior Product Designer",
    "stageKind": "saved"
  },
  {
    "company": "Acme Robotics",
    "roleTitle": "Staff Product Designer",
    "stageKind": "applied",
    "appliedAt": "2026-08-01",
    "notes": "Applied through the referral form."
  },
  {
    "company": "Northwind Labs",
    "roleTitle": "Product Designer",
    "stageKind": "recruiter_screen",
    "nextAction": "Prep for the recruiter call"
  },
  {
    "company": "Northwind Labs",
    "roleTitle": "Design Lead",
    "stageKind": "hiring_manager",
    "appliedAt": "2026-07-15",
    "sourceUrl": "https://northwindlabs.example/careers/design-lead"
  },
  {
    "company": "Lumen Health",
    "roleTitle": "Principal Product Designer",
    "stageKind": "panel_final",
    "notes": "Panel scheduled for next month."
  },
  {
    "company": "Lumen Health",
    "roleTitle": "Product Design Manager",
    "stageKind": "portfolio_case"
  },
  {
    "company": "Acme Robotics",
    "roleTitle": "Staff Product Designer",
    "stageKind": "applied"
  },
  {
    "company": "Lumen Health",
    "roleTitle": "Engineering Manager",
    "stageKind": "applied",
    "appliedAt": "not-a-real-date"
  }
]
```

Eight entries. Entries 2 and 7 are the duplicate pair (same company and role), exercising the skip path. Entry 8 has an unparseable `appliedAt`, exercising the per-entry failure path (index 7, zero-based) without touching the other seven. Entry 4 (Design Lead) pairs `appliedAt` with a `stageKind` beyond `applied`, exercising the two-event placement path `placeOpportunity` gives that case.

- [ ] **Step 3: Write the failing `parseApplications` tests**

Add to `tests/integration/import-applications.test.ts` (the whole file; `importApplications`'s tests are appended to it in Step 6):

```typescript
import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { parseApplications, importApplications } from "@/lib/import/applications";
import { expectOk } from "../helpers/result";
import sample from "../fixtures/applications.sample.json";

describe("parseApplications", () => {
  it("parses the sample fixture into eight entries", () => {
    const entries = expectOk(parseApplications(sample));
    expect(entries).toHaveLength(8);
    expect(entries[0]!.stageKind).toBe("saved");
  });

  it("rejects a file that is not an array", () => {
    const result = parseApplications({ not: "an array" });
    expect(result.ok).toBe(false);
  });

  it("rejects an entry with an unknown stageKind", () => {
    const result = parseApplications([{ company: "A", roleTitle: "B", stageKind: "not_a_real_kind" }]);
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 4: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/integration/import-applications.test.ts
```

Expected: fails, not with "Cannot find module" (the file exists since Step 1) but because `parseApplications` is not yet exported from it: Vitest's esbuild transform does not type-check, so the import resolves to `undefined` and the first call throws `TypeError: parseApplications is not a function` (the exact wording depends on the runtime, but every test in the file fails before any assertion runs).

- [ ] **Step 5: Write `parseApplications`'s and `importApplications`'s algorithms**

`parseApplications(json: unknown): Result<ImportEntry[], "invalid">`
1. `parsed = importEntriesSchema.safeParse(json)`.
2. `!parsed.success` is `fail("invalid", parsed.error.issues[0]?.message ?? "The file is not a valid import list.")`. A single malformed entry (bad `stageKind`, missing `company`, non-string `sourceUrl`) fails the *whole* call: the file is malformed and the owner fixes it and reruns, rather than the importer guessing around it.
3. Return `ok(parsed.data)`.

`importApplications(s, entries, options): Promise<{ created; skipped; failed }>` has two entirely separate bodies depending on `options.dryRun`, sharing only the per-entry `appliedAt` pre-check.

Real run (`options.dryRun === false`):
1. `now = new Date()`; `created = 0`; `skipped = 0`; `failed: { index: number; message: string }[] = []`.
2. For each `entry` at `index` in `entries`:
   1. If `entry.appliedAt` is present: `appliedDate = new Date(entry.appliedAt)`; if `Number.isNaN(appliedDate.getTime())`, push `{ index, message: "appliedAt is not a date this importer understands." }` and continue to the next entry (nothing else runs for this one, and nothing is created for it).
   2. `createResult = await createOpportunity(s, { companyName: entry.company, roleTitle: entry.roleTitle, sourceUrl: entry.sourceUrl }, now)`.
   3. `createResult.code === "duplicate"`: `skipped += 1`, continue.
   4. `!createResult.ok` (the remaining case is `"invalid"`): push `{ index, message: createResult.message }`, continue.
   5. `created += 1`; `id = createResult.data.id`.
   6. `placeResult = await placeOpportunity(s, id, entry.stageKind, { appliedAt: entry.appliedAt ? appliedDate! : undefined, now })`; if `!placeResult.ok`, push `{ index, message: placeResult.message }` (the opportunity itself is still counted as `created` and stays on the board wherever `placeOpportunity` last left it before the failure; this milestone has no compensating "undo a create" call, so a placement failure here is recorded rather than silently dropped or rolled back).
   7. If `entry.notes`: `await addNote(s, id, entry.notes, now)`.
   8. If `entry.nextAction`: `await setNextAction(s, id, { text: entry.nextAction, at: null })`.
3. Return `{ created, skipped, failed }`.

`placeOpportunity` (part A, Task 5) is what makes `appliedAt` honored for every `stageKind` other than `saved`: it always visits Applied first with `enteredAt` set to `appliedAt`, then continues on to the target kind when that is farther along, so the entered date is never lost even when the entry's own stage is past Applied.

Dry run (`options.dryRun === true`), chosen over wrapping the real run in a transaction and forcing a rollback, and justified here because the frame asks for one choice with a reason: `createOpportunity` opens its own `s.transaction(...)` (Task 4), and `placeOpportunity` (Task 5) calls `moveOpportunity`, which does the same, once or twice. Nesting a dry run's own outer transaction around calls that each start an inner one depends on the driver correctly turning the inner ones into savepoints: true of Postgres in general, but not something this plan can confirm holds for this app's exact driver versions without running a live database command, which the rules for writing this plan forbid. The path below needs only reads, so there is nothing to roll back and nothing to verify about transaction nesting:
1. `created = 0`; `skipped = 0`; `failed: { index: number; message: string }[] = []`; `seen = new Set<string>()`.
2. For each `entry` at `index` in `entries`:
   1. Same `appliedAt` pre-check as the real run, step 2.1; on failure, push and continue.
   2. `key = \`${companyNameKey(entry.company)}::${entry.roleTitle.trim().toLowerCase()}\``.
   3. `seen.has(key)`: `skipped += 1`, continue (an entry that duplicates an *earlier entry in this same file*, never written, so a database lookup alone would miss it).
   4. `company = await s.company.findByNameKey(companyNameKey(entry.company))`; `existing = company ? await s.opportunity.findByCompanyAndRole(company.id, entry.roleTitle) : null`.
   5. `existing !== null && existing.status === "active"`: `skipped += 1`, `seen.add(key)`, continue.
   6. `created += 1`; `seen.add(key)`.
3. Return `{ created, skipped, failed }`. No call to `createOpportunity`, `placeOpportunity`, `addNote` or `setNextAction` anywhere in this path.
4. `importApplications` itself is a two-line dispatch: call the dry-run body when `options.dryRun`, otherwise the real-run body.

- [ ] **Step 6: Append the failing `importApplications` tests, run them, confirm they fail**

Append to `tests/integration/import-applications.test.ts`:

```typescript
describe("importApplications", () => {
  it("creates six, skips the duplicate pair, and fails the bad-date entry by index", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner@example.com");
      const s = scoped(db, user.id);
      const entries = expectOk(parseApplications(sample));

      const summary = await importApplications(s, entries, { dryRun: false });

      expect(summary.created).toBe(6);
      expect(summary.skipped).toBe(1);
      expect(summary.failed).toEqual([{ index: 7, message: expect.any(String) }]);

      const board = await s.opportunity.listBoard();
      expect(board.map((c) => c.roleTitle).sort()).toEqual(
        [
          "Design Lead",
          "Principal Product Designer",
          "Product Design Manager",
          "Product Designer",
          "Senior Product Designer",
          "Staff Product Designer",
        ].sort(),
      );
    } finally {
      await close();
    }
  });

  it("a second run against the same fixture creates nothing", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner2@example.com");
      const s = scoped(db, user.id);
      const entries = expectOk(parseApplications(sample));

      await importApplications(s, entries, { dryRun: false });
      const second = await importApplications(s, entries, { dryRun: false });

      expect(second.created).toBe(0);
      expect(second.skipped).toBe(7);
      expect(second.failed).toHaveLength(1);
    } finally {
      await close();
    }
  });

  it("an entry whose stageKind is beyond applied lands there with exactly two stage_moved events, Applied done and the stage between skipped", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner3@example.com");
      const s = scoped(db, user.id);
      const entries = expectOk(parseApplications(sample));
      await importApplications(s, entries, { dryRun: false });

      const board = await s.opportunity.listBoard();
      const designLead = board.find((c) => c.roleTitle === "Design Lead")!;
      expect(designLead.stage.kind).toBe("hiring_manager");

      const stages = await s.stage.listForOpportunity(designLead.id);
      const applied = stages.find((st) => st.kind === "applied")!;
      const recruiterScreen = stages.find((st) => st.kind === "recruiter_screen")!;
      expect(applied.status).toBe("done");
      expect(applied.enteredAt?.toISOString().slice(0, 10)).toBe("2026-07-15");
      expect(recruiterScreen.status).toBe("skipped");

      const events = await s.event.listForOpportunity(designLead.id);
      expect(events.filter((e) => e.kind === "stage_moved")).toHaveLength(2);
    } finally {
      await close();
    }
  });

  it("appliedAt lands on the Applied stage's enteredAt, and notes become one note event", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner4@example.com");
      const s = scoped(db, user.id);
      const entries = expectOk(parseApplications(sample));
      await importApplications(s, entries, { dryRun: false });

      const board = await s.opportunity.listBoard();
      const staff = board.find((c) => c.roleTitle === "Staff Product Designer")!;
      const stages = await s.stage.listForOpportunity(staff.id);
      const applied = stages.find((st) => st.kind === "applied")!;
      expect(applied.enteredAt?.toISOString().slice(0, 10)).toBe("2026-08-01");

      const events = await s.event.listForOpportunity(staff.id);
      expect(events.filter((e) => e.kind === "note")).toHaveLength(1);
      expect(events.filter((e) => e.kind === "stage_moved")).toHaveLength(1);
    } finally {
      await close();
    }
  });

  it("sets nextAction from the entry that has one", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner5@example.com");
      const s = scoped(db, user.id);
      const entries = expectOk(parseApplications(sample));
      await importApplications(s, entries, { dryRun: false });

      const board = await s.opportunity.listBoard();
      const recruiterScreen = board.find((c) => c.companyName === "Northwind Labs" && c.roleTitle === "Product Designer")!;
      expect(recruiterScreen.nextAction).toBe("Prep for the recruiter call");
    } finally {
      await close();
    }
  });

  it("a dry run reports the same counts and writes nothing", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner6@example.com");
      const s = scoped(db, user.id);
      const entries = expectOk(parseApplications(sample));

      const summary = await importApplications(s, entries, { dryRun: true });
      const board = await s.opportunity.listBoard();

      expect(summary.created).toBe(6);
      expect(summary.skipped).toBe(1);
      expect(summary.failed).toHaveLength(1);
      expect(board).toHaveLength(0);
    } finally {
      await close();
    }
  });
});
```

```bash
pnpm exec vitest run tests/integration/import-applications.test.ts
```

Expected: fails (the schema exists from Step 1, but `parseApplications` and `importApplications` are not written until Step 7).

- [ ] **Step 7: Implement `parseApplications` and `importApplications`, run the tests, confirm they pass**

Append the two functions (Step 5's algorithms) to `lib/import/applications.ts`, below the schema from Step 1.

```bash
pnpm exec vitest run tests/integration/import-applications.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 9 passed (9)` (3 from `parseApplications`, 6 from `importApplications`).

- [ ] **Step 8: Write the CLI script**

Create `scripts/import-applications.ts`:

```typescript
import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { createDb } from "@/lib/db/client";
import { scoped } from "@/lib/db/scoped";
import { user } from "@/lib/db/schema";
import { parseApplications, importApplications } from "@/lib/import/applications";

function parseArgs(argv: string[]): { file: string; email?: string; dryRun: boolean } {
  const dryRun = argv.includes("--dry-run");
  const emailIndex = argv.indexOf("--email");
  const email = emailIndex === -1 ? undefined : argv[emailIndex + 1];
  const file = argv.find((arg, i) => {
    if (arg.startsWith("--")) return false;
    if (i > 0 && argv[i - 1] === "--email") return false;
    return true;
  });
  if (!file) {
    throw new Error("Usage: pnpm import:applications <file> [--email <address>] [--dry-run]");
  }
  return { file, email, dryRun };
}

async function main() {
  const { file, email, dryRun } = parseArgs(process.argv.slice(2));

  const raw = readFileSync(path.resolve(process.cwd(), file), "utf8");
  const parsed = parseApplications(JSON.parse(raw));
  if (!parsed.ok) {
    console.error(`Could not read ${file}: ${parsed.message}`);
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  const db = createDb(pool);

  try {
    const users = await db.select({ id: user.id, email: user.email }).from(user);

    let chosen: { id: string; email: string };
    if (email) {
      const match = users.find((u) => u.email === email);
      if (!match) {
        console.error(`No user with email ${email}.`);
        process.exit(1);
      }
      chosen = match;
    } else if (users.length === 1) {
      chosen = users[0]!;
    } else if (users.length === 0) {
      console.error("No users exist yet. Create an account first.");
      process.exit(1);
    } else {
      console.error("Multiple accounts exist; pass --email <address>.");
      process.exit(1);
    }

    const s = scoped(db, chosen.id);
    const summary = await importApplications(s, parsed.data, { dryRun });

    console.log(`${dryRun ? "[dry run] " : ""}Imported for ${chosen.email}:`);
    console.log(`  created: ${summary.created}`);
    console.log(`  skipped (already tracked): ${summary.skipped}`);
    console.log(`  failed: ${summary.failed.length}`);
    for (const failure of summary.failed) {
      console.log(`    [${failure.index}] ${failure.message}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

This creates its own `Pool`/`Db` through `createDb` (Milestone 1, `lib/db/client.ts`) rather than the shared `getDb()` singleton `scripts/seed.ts` uses, because `getDb()` caches its pool at module scope with no way to close it: the same reason `scripts/migrate.ts` and `scripts/reset-db.ts` already build their own `Pool` and call `pool.end()` in `finally`. `DATABASE_URL` is read directly from `process.env`, matching those two scripts, not through `lib/env.ts`'s `env()` (which validates variables this data-only script has no need of, such as `BETTER_AUTH_SECRET`).

Verified in a planning scratch file (`partc-cli-narrowing-spike.ts`, not kept in the repo) (against this repo's real `@types/node`): the `let chosen` assigned across an `if`/`else if`/`else if`/`else` chain, where three of the four branches call `process.exit(1)` instead of assigning it, type-checks under strict: `process.exit`'s return type is `never`, so TypeScript's definite-assignment analysis treats those branches as not falling through, and reading `chosen` afterward is not a "used before being assigned" error.

- [ ] **Step 9: Wire up `package.json`, `.gitignore` and the README**

Add to `package.json`'s `scripts`:

```json
{
  "scripts": {
    "import:applications": "tsx --env-file-if-exists=.env scripts/import-applications.ts"
  }
}
```

Add to `.gitignore` (a new group, near the other local-only entries):

```
# the owner's personal import mapping (owner-gated, Task 14), never committed
/local/
```

Add to `README.md`, a new `## Importing applications once` section (placed after "## Tests", before "## Design system"):

```markdown
## Importing applications once

`pnpm import:applications <file> [--email <address>] [--dry-run]` reads a
JSON array of applications and replays each one through the same rules the
app itself uses to add and move a job, so events and stage history stay
consistent with a job added by hand.

Each entry: `company`, `roleTitle`, `stageKind` (one of `saved`, `applied`,
`recruiter_screen`, `hiring_manager`, `portfolio_case`, `panel_final`,
`offer`), and optionally `appliedAt` (a date, landing on the Applied
stage's entered date, honored for every `stageKind` other than `saved`),
`sourceUrl`, `notes` and `nextAction`. See
`tests/fixtures/applications.sample.json` for a complete, fictional
example.

An entry whose company and role already exist for the target account is
skipped, so running the same file twice changes nothing on the second run.
`--email` chooses which account to import into: optional while the
instance has exactly one account, required once it has more than one.
`--dry-run` reports what would happen (created, skipped, and any entry it
could not read, by its position in the file) without writing anything.
```

- [ ] **Step 10: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm check:tokens
pnpm test
pnpm build
```

Expected: all five exit 0. `pnpm test` for this task's own two new pieces (the Zod schema smoke-checked in the spike, `parseApplications`/`importApplications`'s 9 integration tests) is verified in Steps 4, 6 and 7's `vitest` runs above; `pnpm typecheck`/`pnpm build` are unverified today for the same reason as every other task in this part: Tasks 1 to 9's files do not exist in the tree yet.

- [ ] **Step 11: Commit**

```bash
git add lib/import/applications.ts scripts/import-applications.ts tests/fixtures/applications.sample.json tests/integration/import-applications.test.ts package.json .gitignore README.md
git commit -m "$(cat <<'EOF'
feat: add the one-time application importer and its sample fixture
EOF
)"
```

---

### Task 13: Seed, end-to-end and accessibility

**Files:**
- Modify: `scripts/seed.ts`, `playwright.config.ts`
- Create: `tests/e2e/scan-open.ts`, `tests/e2e/pipeline.spec.ts`, `tests/e2e/job-page.spec.ts`, `tests/e2e/pipeline-phone.spec.ts`

**Interfaces:**
- Consumes: `createOpportunity` (Task 4). `placeOpportunity` (Task 5). `closeOpportunity` (Task 4). `scheduleStage` (Task 5). `addNote` (Task 5). `addPersonToOpportunity` (Task 5). `scoped`, `Scoped` (Task 2). `createDb` (Milestone 1). `Result` (Task 3). `EMAIL`, `PASSWORD` (`tests/e2e/account.ts`, Milestone 1). `scanForViolations` (`tests/e2e/axe.ts`, Milestone 1, unmodified). Every accessible name and copy string fixed under "UI copy and accessible names" in the Contract section of `README.md`, produced by Tasks 7, 8, 9 (board, add dialog, phone board, drafted in Tasks 6 to 9) and Tasks 10 and 11 above (job page). `STAGE_KINDS` column titles (Milestone 1, `lib/pipeline/kinds.ts`).
- Produces: `pnpm seed` extended with six fictional jobs. `pnpm test:e2e` extended with the three new spec files, running against `playwright.config.ts`'s existing `chromium`/`webkit`/`phone` projects (widened `testMatch`, Step 8). `scanOpenOverlay(page: Page, label: string, testInfo: TestInfo, reopen: () => Promise<void>): Promise<void>` from `tests/e2e/scan-open.ts`.

**Frame gap closed: a second scan helper for transient UI.** The frame says every dialog/sheet scan goes "through the existing `scanForViolations(page, label, testInfo)` helper," but that helper's own `page.reload()` (once per color scheme, `tests/e2e/axe.ts`, unmodified by this task) would close any dialog or sheet before the scan ran, because every one of them (`add-job-dialog`, `close-dialog`, `edit-stages-dialog`, `stage-detail-sheet`, `move-sheet`) is local component state, not a URL. `scanForViolations` is used unmodified for every target that *is* a real, reload-safe URL (the board, the closed list at `?view=closed`, each job page tab at `?tab=...`, the phone list). For the five transient targets, this task adds `tests/e2e/scan-open.ts`, a sibling helper with the same screenshot path, console logging and zero-violations assertion, that waits for the emulated color scheme to take effect and then calls a caller-supplied `reopen()` instead of reloading the page.

- [ ] **Step 1: Extend `scripts/seed.ts` with six fictional jobs**

Replace `scripts/seed.ts` with:

```typescript
import crypto from "node:crypto";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { scoped, type Scoped } from "@/lib/db/scoped";
import { createOpportunity } from "@/lib/pipeline/create";
import { placeOpportunity } from "@/lib/pipeline/place";
import { closeOpportunity } from "@/lib/pipeline/close";
import { scheduleStage } from "@/lib/pipeline/schedule";
import { addNote } from "@/lib/pipeline/notes";
import { addPersonToOpportunity } from "@/lib/people";
import type { Result } from "@/lib/result";

function unwrap<T>(result: Result<T, string>, what: string): T {
  if (!result.ok) {
    throw new Error(`seed: ${what} failed: ${result.code}: ${result.message}`);
  }
  return result.data;
}

async function seedJobs(s: Scoped) {
  // Acme Robotics: one job left in Saved, one moved to Applied.
  await createOpportunity(s, {
    companyName: "Acme Robotics",
    roleTitle: "Senior Product Designer",
    location: "Remote",
    workMode: "remote",
  });

  const staffAtAcme = unwrap(
    await createOpportunity(s, {
      companyName: "Acme Robotics",
      roleTitle: "Staff Product Designer",
      location: "Remote",
      workMode: "remote",
      compMin: 150000,
      compMax: 185000,
      compCurrency: "USD",
    }),
    "create Staff Product Designer at Acme Robotics",
  );
  unwrap(await placeOpportunity(s, staffAtAcme.id, "applied"), "place Staff Product Designer in Applied");

  // Northwind Labs: one job in Recruiter screen, one in Hiring manager with
  // a scheduled call, a linked person and a note.
  const productAtNorthwind = unwrap(
    await createOpportunity(s, {
      companyName: "Northwind Labs",
      roleTitle: "Product Designer",
      location: "Berlin, Germany",
      workMode: "hybrid",
    }),
    "create Product Designer at Northwind Labs",
  );
  unwrap(
    await placeOpportunity(s, productAtNorthwind.id, "recruiter_screen"),
    "place Product Designer in Recruiter screen",
  );

  const leadAtNorthwind = unwrap(
    await createOpportunity(s, {
      companyName: "Northwind Labs",
      roleTitle: "Design Lead",
      location: "Berlin, Germany",
      workMode: "hybrid",
      compMin: 165000,
      compMax: 200000,
      compCurrency: "USD",
    }),
    "create Design Lead at Northwind Labs",
  );
  unwrap(
    await placeOpportunity(s, leadAtNorthwind.id, "hiring_manager"),
    "place Design Lead in Hiring manager",
  );
  const leadStages = await s.stage.listForOpportunity(leadAtNorthwind.id);
  const leadHiringManagerStageId = leadStages.find((st) => st.kind === "hiring_manager")!.id;
  const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  unwrap(
    await scheduleStage(s, leadAtNorthwind.id, leadHiringManagerStageId, { scheduledAt: inThreeDays, format: "video" }),
    "schedule Design Lead's Hiring manager call",
  );
  unwrap(
    await addPersonToOpportunity(s, leadAtNorthwind.id, {
      name: "Tomas Okafor",
      role: "hiring_manager",
      title: "Head of Design",
    }),
    "add Tomas Okafor to Design Lead",
  );
  unwrap(
    await addNote(s, leadAtNorthwind.id, "Hiring manager call moved earlier in the week, still video."),
    "add note to Design Lead",
  );

  // Lumen Health: one job in Portfolio / case, one closed as rejected after
  // reaching Panel / final, with a linked recruiter and a note.
  const managerAtLumen = unwrap(
    await createOpportunity(s, {
      companyName: "Lumen Health",
      roleTitle: "Product Design Manager",
      location: "Remote",
      workMode: "remote",
    }),
    "create Product Design Manager at Lumen Health",
  );
  unwrap(
    await placeOpportunity(s, managerAtLumen.id, "portfolio_case"),
    "place Product Design Manager in Portfolio / case",
  );

  const principalAtLumen = unwrap(
    await createOpportunity(s, {
      companyName: "Lumen Health",
      roleTitle: "Principal Product Designer",
      location: "Remote",
      workMode: "remote",
    }),
    "create Principal Product Designer at Lumen Health",
  );
  unwrap(
    await addPersonToOpportunity(s, principalAtLumen.id, { name: "Priya Raman", role: "recruiter" }),
    "add Priya Raman to Principal Product Designer",
  );
  unwrap(
    await placeOpportunity(s, principalAtLumen.id, "panel_final"),
    "place Principal Product Designer in Panel / final",
  );
  unwrap(
    await addNote(s, principalAtLumen.id, "Panel went well, but the team hired internally."),
    "add note to Principal Product Designer",
  );
  unwrap(await closeOpportunity(s, principalAtLumen.id, "rejected"), "close Principal Product Designer");
}

async function main() {
  const email = "demo@example.com";
  const password = process.env.SEED_PASSWORD ?? crypto.randomBytes(9).toString("base64url");

  const result = await auth.api.signUpEmail({
    body: { email, password, name: "Demo user" },
    headers: process.env.SETUP_TOKEN ? { "x-setup-token": process.env.SETUP_TOKEN } : undefined,
  });

  const s = scoped(getDb(), result.user.id);

  await s.profile.upsert({
    headline: "Product designer exploring new roles",
    resumeMd: "# Demo resume\n\nThis is fictional seed data for local development.",
  });

  await seedJobs(s);

  console.log(`Seeded demo user: ${email}`);
  console.log("Seeded six fictional jobs across Acme Robotics, Northwind Labs and Lumen Health.");
  if (!process.env.SEED_PASSWORD) {
    console.log(`Generated password (shown once): ${password}`);
  }
}

// getDb() keeps a pooled connection open, which would hold the process for
// several seconds after the work is done, so exit explicitly on both paths.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

Nothing in `seedJobs` writes a stage row directly; every write goes through `createOpportunity`/`placeOpportunity`/`scheduleStage`/`addNote`/`addPersonToOpportunity`/`closeOpportunity` (all `lib/pipeline` or `lib/people`). The Hiring manager stage's id for the `scheduleStage` call comes from a fresh `s.stage.listForOpportunity` lookup, since `placeOpportunity` (unlike `moveOpportunity`) returns only `Result<null, MoveError>`, with no stage information to reuse.

Verified in a planning scratch file (`partc-seed-spike.ts`, not kept in the repo): `seedJobs`'s body, copied verbatim, type-checks under strict against stand-ins built to the exact signatures Tasks 4 and 5 give in the Contract section of `README.md`, and runs end to end against them with no thrown error.

- [ ] **Step 2: Manually verify the seed script**

```bash
pnpm reset-db
pnpm seed
```

Expected: `Seeded demo user: demo@example.com`, `Seeded six fictional jobs across Acme Robotics, Northwind Labs and Lumen Health.`, then either the generated password line or nothing more (if `SEED_PASSWORD` was set). Then `pnpm dev`, sign in as `demo@example.com`, and confirm on `/board`: six cards across Saved, Applied, Recruiter, Hiring manager, Portfolio / case and Panel / final; the Hiring manager card shows a next-action-free "N days" chip and, on its job page, a scheduled Hiring manager stage 3 days out in Video format with Tomas Okafor listed under People; switching to the Closed view shows the Lumen Health Principal Product Designer job with reason Rejected; its Timeline shows the note, the moves and the close, in that order (newest first).

- [ ] **Step 3: Write `tests/e2e/scan-open.ts`**

```typescript
import { expect, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Scans an already-open dialog or sheet in both color schemes, without the
 * full-page reload ./axe.ts's scanForViolations uses: a reload would close
 * any overlay driven by local component state, which every dialog and
 * sheet in this milestone is. `reopen` re-establishes the open overlay
 * after each scheme switch; it must leave the page with the overlay open
 * and nothing else mid-transition, the same expectation scanForViolations
 * has of the page it reloads onto.
 *
 * Waiting for the browser's own matchMedia to report the emulated scheme
 * before calling `reopen()` stands in for the settle time a reload gives
 * scanForViolations, so next-themes' change listener is not still racing
 * the axe scan below (see the comment on scanForViolations, ./axe.ts, for
 * why the reload exists there in the first place).
 */
export async function scanOpenOverlay(
  page: Page,
  label: string,
  testInfo: TestInfo,
  reopen: () => Promise<void>,
) {
  const slug = slugify(label);

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.waitForFunction(
      (scheme) => window.matchMedia(`(prefers-color-scheme: ${scheme})`).matches,
      colorScheme,
    );
    await reopen();

    await page.screenshot({
      path: `test-results/screens/${testInfo.project.name}-${slug}-${colorScheme}.png`,
      fullPage: true,
    });

    const results = await new AxeBuilder({ page }).analyze();
    for (const violation of results.violations) {
      console.log(`[${label} / ${colorScheme}] ${violation.id} (${violation.impact}): ${violation.help}`);
      for (const node of violation.nodes) {
        console.log(`  target: ${node.target.join(", ")}`);
        console.log(`  summary: ${node.failureSummary}`);
      }
    }
    expect(results.violations, `${label} (${colorScheme}) axe violations`).toEqual([]);
  }
}
```

- [ ] **Step 4: Write `tests/e2e/pipeline.spec.ts`**

Covers: add a job, the board with cards, the add dialog, dragging to a column, the timeline showing the move, the keyboard-only pass, the close dialog, the closed list, and reopening.

```typescript
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { scanForViolations } from "./axe";
import { scanOpenOverlay } from "./scan-open";
import { EMAIL, PASSWORD } from "./account";

function uniqueName(testInfo: TestInfo, base: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base} ${testInfo.project.name} ${suffix}`;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/board$/);
}

async function addJob(page: Page, company: string, role: string) {
  await page.getByRole("button", { name: "Add job" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a job" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Company").fill(company);
  await dialog.getByLabel("Role").fill(role);
  await dialog.getByRole("button", { name: "Add job" }).click();
  await expect(dialog).toBeHidden();
}

// dnd-kit's PointerSensor needs real intermediate pointer moves and more
// than 5 pixels of travel before it recognizes a drag; a single mouse.move
// straight to the target does not trigger it. A column's own container is
// exposed as a "region" whose accessible name starts with the column
// title in both states (a card-bearing column and the empty rail's
// "<column>, no jobs"), so one query locates the drop target either way;
// the drop lands on that region's own bounding box center.
async function dragCardToColumn(page: Page, cardName: string, columnName: string) {
  const card = page.getByRole("link", { name: cardName });
  const column = page.getByRole("region", { name: new RegExp("^" + columnName + ",") });
  const cardBox = await card.boundingBox();
  const columnBox = await column.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error(`dragCardToColumn: could not locate "${cardName}" or column "${columnName}"`);
  }
  const start = { x: cardBox.x + cardBox.width / 2, y: cardBox.y + cardBox.height / 2 };
  const end = { x: columnBox.x + columnBox.width / 2, y: columnBox.y + columnBox.height / 2 };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(start.x + ((end.x - start.x) * i) / steps, start.y + ((end.y - start.y) * i) / steps);
  }
  await page.mouse.up();
}

test("add a job by hand, drag it to Applied, and the timeline shows the move", async ({ page }, testInfo) => {
  await login(page);

  const company = uniqueName(testInfo, "Acme Robotics");
  const role = "Product Designer";
  const cardName = `${role} at ${company}`;

  await addJob(page, company, role);
  await expect(page.getByRole("link", { name: cardName })).toBeVisible();
  await scanForViolations(page, "board with cards", testInfo);

  await scanOpenOverlay(page, "add dialog", testInfo, async () => {
    const dialog = page.getByRole("dialog", { name: "Add a job" });
    if (!(await dialog.isVisible())) {
      await page.getByRole("button", { name: "Add job" }).click();
    }
    await expect(dialog).toBeVisible();
  });
  await page.keyboard.press("Escape");

  await dragCardToColumn(page, cardName, "Applied");
  await expect(page.getByText(`Moved ${role} at ${company} to Applied.`)).toBeAttached();

  await page.getByRole("link", { name: cardName }).click();
  await expect(page).toHaveURL(/\/jobs\//);
  await page.getByRole("tab", { name: "Timeline" }).click();
  await expect(page.getByText("Moved from Saved to Applied.")).toBeVisible();
});

test("keyboard-only pass: digits move the focused card, c closes it, and it can be reopened", async ({
  page,
}, testInfo) => {
  await login(page);

  const company = uniqueName(testInfo, "Northwind Labs");
  const role = "Design Lead";
  const cardName = `${role} at ${company}`;

  await addJob(page, company, role);
  const card = page.getByRole("link", { name: cardName });
  await card.focus();
  await page.keyboard.press("3");
  await expect(page.getByText(`Moved ${role} at ${company} to Recruiter.`)).toBeAttached();

  await card.focus();
  await page.keyboard.press("c");
  const closeDialog = page.getByRole("dialog", { name: "Close this job" });
  await expect(closeDialog).toBeVisible();

  await scanOpenOverlay(page, "close dialog", testInfo, async () => {
    if (!(await closeDialog.isVisible())) {
      await card.focus();
      await page.keyboard.press("c");
    }
    await expect(closeDialog).toBeVisible();
  });

  await closeDialog.getByRole("radio", { name: "Rejected" }).click();
  await closeDialog.getByRole("button", { name: "Close job" }).click();
  await expect(closeDialog).toBeHidden();
  await expect(card).toBeHidden();

  await page.goto("/board?view=closed");
  await expect(page.getByText(cardName)).toBeVisible();
  await scanForViolations(page, "closed list", testInfo);

  await page.getByRole("button", { name: `Reopen ${role} at ${company}` }).click();
  await expect(page.getByText(cardName)).toBeHidden();

  await page.goto("/board");
  await expect(page.getByRole("link", { name: cardName })).toBeVisible();
});
```

The board's "Closed" view switch is reached with `page.goto("/board?view=closed")` rather than clicking the switch: D8/the frame fix the search param (`view=closed`) but not the exact ARIA role Task 7's `mode-tabs`-based switch renders each option as, and navigating by URL is correct either way (both the click and the direct navigation land on the same server-rendered state, and the search param is the one thing the frame commits to here).

- [ ] **Step 5: Write `tests/e2e/job-page.spec.ts`**

Covers: the stepper opening the stage sheet, the stage sheet, editing stages (add a Take-home stage, rename, skip, remove), the Edit stages dialog, scheduling the current stage, the next action bar, adding a person, adding a note, and the Overview/People/Timeline tabs.

Select fields in this milestone's primitives (`components/ui/select`, Task 6, `base-nova`/Base UI) are not native `<select>` elements, so Playwright's `selectOption()` does not apply to them; `chooseOption` below opens the trigger (ARIA `combobox`) and clicks the matching `option`, the standard interaction for that pattern.

```typescript
import { test, expect, type Page, type Locator, type TestInfo } from "@playwright/test";
import { scanForViolations } from "./axe";
import { scanOpenOverlay } from "./scan-open";
import { EMAIL, PASSWORD } from "./account";

function uniqueName(testInfo: TestInfo, base: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base} ${testInfo.project.name} ${suffix}`;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/board$/);
}

async function addJobAndOpen(page: Page, company: string, role: string) {
  await page.getByRole("button", { name: "Add job" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a job" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Company").fill(company);
  await dialog.getByLabel("Role").fill(role);
  await dialog.getByRole("button", { name: "Add job" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("link", { name: `${role} at ${company}` }).click();
  await expect(page).toHaveURL(/\/jobs\//);
}

async function chooseOption(page: Page, scope: Locator, triggerLabel: string, optionText: string) {
  await scope.getByRole("combobox", { name: triggerLabel }).click();
  await page.getByRole("option", { name: optionText, exact: true }).click();
}

test("the stepper opens a stage sheet, Move here advances it, and the timeline records the move", async ({
  page,
}, testInfo) => {
  await login(page);
  const company = uniqueName(testInfo, "Lumen Health");
  const role = "Principal Product Designer";
  await addJobAndOpen(page, company, role);

  await page.getByRole("button", { name: "Applied, upcoming" }).click();
  const sheet = page.getByRole("dialog", { name: "Applied" });
  await expect(sheet).toBeVisible();

  await scanOpenOverlay(page, "stage sheet", testInfo, async () => {
    if (!(await sheet.isVisible())) {
      await page.getByRole("button", { name: "Applied, upcoming" }).click();
    }
    await expect(sheet).toBeVisible();
  });

  await sheet.getByRole("button", { name: "Move here" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("button", { name: "Applied, current" })).toBeVisible();

  await page.getByRole("tab", { name: "Timeline" }).click();
  await expect(page.getByText("Moved from Saved to Applied.")).toBeVisible();
});

test("edit stages: add a Take-home stage, rename, skip and remove it; schedule the current stage", async ({
  page,
}, testInfo) => {
  await login(page);
  const company = uniqueName(testInfo, "Acme Robotics");
  const role = "Staff Product Designer";
  await addJobAndOpen(page, company, role);

  await page.getByRole("button", { name: "Edit stages" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit stages" });
  await expect(dialog).toBeVisible();

  await scanOpenOverlay(page, "edit stages dialog", testInfo, async () => {
    if (!(await dialog.isVisible())) {
      await page.getByRole("button", { name: "Edit stages" }).click();
    }
    await expect(dialog).toBeVisible();
  });

  await chooseOption(page, dialog, "Kind", "Portfolio / case");
  await dialog.getByLabel("Label").fill("Take-home");
  await dialog.getByRole("button", { name: "Add stage" }).click();
  await expect(dialog.getByRole("textbox", { name: "Rename Take-home" })).toBeVisible();

  const renameInput = dialog.getByRole("textbox", { name: "Rename Take-home" });
  await renameInput.fill("Portfolio deep dive");
  await renameInput.press("Enter");
  await expect(dialog.getByRole("textbox", { name: "Rename Portfolio deep dive" })).toBeVisible();

  await dialog.getByRole("button", { name: "Skip Portfolio deep dive" }).click();
  await expect(dialog.getByRole("button", { name: "Unskip Portfolio deep dive" })).toBeVisible();

  await dialog.getByRole("button", { name: "Remove Portfolio deep dive" }).click();
  await expect(dialog.getByRole("textbox", { name: "Rename Portfolio deep dive" })).toBeHidden();

  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Saved, current" }).click();
  const sheet = page.getByRole("dialog", { name: "Saved" });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("Date and time").fill("2026-10-01T09:30");
  await chooseOption(page, sheet, "Format", "Video");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();
});

test("next action, people and notes, with axe across all three tabs", async ({ page }, testInfo) => {
  await login(page);
  const company = uniqueName(testInfo, "Northwind Labs");
  const role = "Engineering Manager";
  await addJobAndOpen(page, company, role);

  await page.getByRole("button", { name: "Add" }).click();
  await page.getByLabel("What is next").fill("Send a thank-you note");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Send a thank-you note")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("No next action.")).toBeVisible();

  await scanForViolations(page, "job page overview tab", testInfo);

  await page.getByRole("tab", { name: "People" }).click();
  await scanForViolations(page, "job page people tab", testInfo);
  await page.getByRole("button", { name: "Add person" }).click();
  const personDialog = page.getByRole("dialog", { name: "Add a person" });
  await expect(personDialog).toBeVisible();
  await personDialog.getByLabel("Name").fill("Priya Raman");
  await chooseOption(page, personDialog, "Role in this process", "Recruiter");
  await personDialog.getByRole("button", { name: "Save" }).click();
  await expect(personDialog).toBeHidden();
  await expect(page.getByText("Priya Raman")).toBeVisible();

  await page.getByRole("tab", { name: "Timeline" }).click();
  await scanForViolations(page, "job page timeline tab", testInfo);
  await page.getByLabel("Add a note").fill("Left a voicemail for the recruiter.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("Left a voicemail for the recruiter.")).toBeVisible();
  await expect(page.getByText("Done: Send a thank-you note.")).toBeVisible();
});
```

- [ ] **Step 6: Write `tests/e2e/pipeline-phone.spec.ts`**

Covers: the phone board's grouped list, moving with the sheet, the phone list, and the move sheet. Guarded twice: `playwright.config.ts`'s `phone` project is the only one whose `testMatch` reaches this file (Step 8), and the test itself calls `test.skip` as a second, in-file guard in case a future config change widens that `testMatch` without updating this file.

```typescript
import { test, expect, type TestInfo } from "@playwright/test";
import { scanForViolations } from "./axe";
import { scanOpenOverlay } from "./scan-open";
import { EMAIL, PASSWORD } from "./account";

function uniqueName(testInfo: TestInfo, base: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base} ${testInfo.project.name} ${suffix}`;
}

test("phone: the board renders as a grouped list, and Move to opens a sheet", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "phone",
    "phone board only; playwright.config.ts also restricts this file to the phone project",
  );

  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/board$/);

  const company = uniqueName(testInfo, "Lumen Health");
  const role = "Product Design Manager";
  await page.getByRole("button", { name: "Add job" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a job" });
  await dialog.getByLabel("Company").fill(company);
  await dialog.getByLabel("Role").fill(role);
  await dialog.getByRole("button", { name: "Add job" }).click();
  await expect(dialog).toBeHidden();

  const cardName = `${role} at ${company}`;
  await expect(page.getByRole("heading", { name: "Saved" })).toBeVisible();
  await expect(page.getByText(cardName)).toBeVisible();
  await scanForViolations(page, "phone list", testInfo);

  await page.getByRole("button", { name: `Move ${role} at ${company}` }).click();
  const sheet = page.getByRole("dialog", { name: "Move to" });
  await expect(sheet).toBeVisible();

  await scanOpenOverlay(page, "move sheet", testInfo, async () => {
    if (!(await sheet.isVisible())) {
      await page.getByRole("button", { name: `Move ${role} at ${company}` }).click();
    }
    await expect(sheet).toBeVisible();
  });

  await sheet.getByRole("button", { name: "Applied" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("heading", { name: "Applied" })).toBeVisible();
  await expect(page.getByText(cardName)).toBeVisible();
});
```

- [ ] **Step 7: Manually run all three specs and confirm they pass before touching the config**

```bash
pnpm exec playwright test pipeline.spec.ts --project=chromium
pnpm exec playwright test job-page.spec.ts --project=chromium
pnpm exec playwright test pipeline-phone.spec.ts --project=phone
```

Expected: each command's own spec passes (`playwright test <file>` matches by filename regardless of `testMatch`, so this checks the specs themselves before Step 8 wires them into the normal `pnpm test:e2e` run). Then repeat the first two against `--project=webkit`.

- [ ] **Step 8: Widen `playwright.config.ts`'s `testMatch`**

`pipeline.spec.ts` and `job-page.spec.ts` need a mouse and a full-width board, so they join `shell.spec.ts` on `chromium` and `webkit` only. `pipeline-phone.spec.ts` needs the sub-768px layout, so it replaces nothing and joins `phone` only. Edit the three browser projects' `testMatch`:

```typescript
    {
      name: "chromium",
      testMatch: /(shell|pipeline|job-page)\.spec\.ts$/,
      dependencies: ["first-run"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "webkit",
      testMatch: /(shell|pipeline|job-page)\.spec\.ts$/,
      dependencies: ["first-run"],
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "phone",
      testMatch: /(shell|pipeline-phone)\.spec\.ts$/,
      dependencies: ["first-run"],
      use: {
        ...devices["iPhone 13"],
        viewport: { width: 390, height: 844 },
      },
    },
```

`/(shell|pipeline|job-page)\.spec\.ts$/` does not also match `pipeline-phone.spec.ts`: after consuming `pipeline` the regex requires `.spec.ts` to follow immediately, and in that file name `-phone.spec.ts` follows instead, so the alternation never matches there. Everything else in the config (the `first-run` project, `webServer`, `globalSetup`) is unchanged.

- [ ] **Step 9: Run the full end-to-end suite**

```bash
pnpm test:e2e
```

Expected: `first-run` runs its three tests, then `chromium`, `webkit` and `phone` run in parallel; `chromium`/`webkit` each run `shell.spec.ts`, `pipeline.spec.ts` and `job-page.spec.ts` (6 tests each: 1 shell + 2 pipeline + 3 job-page), `phone` runs `shell.spec.ts` and `pipeline-phone.spec.ts` (2 tests). All green. Screenshots land under `test-results/screens/`, one PNG per project, per scanned target, per color scheme. Spot check a few from each of the three new spec files in both `-light` and `-dark`.

- [ ] **Step 10: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm check:tokens
pnpm test
pnpm build
pnpm test:e2e
```

Expected: all six exit 0. `pnpm test:e2e` is the one command in this whole part that this plan can meaningfully describe as fully exercised by Step 9 above once Tasks 1–11 exist; the other five carry the same unverified-today caveat as every prior task (Tasks 1–9's files are not in the tree).

- [ ] **Step 11: Manual browser check**

Run the suite once against Chrome and once against Safari directly (not just through Playwright's engines) as a human: add a job, drag it, close and reopen it, open a job page and move a stage, add a person and a note, and try the phone board at a narrow window. Confirm nothing above only "works under automation."

- [ ] **Step 12: Commit**

```bash
git add scripts/seed.ts playwright.config.ts tests/e2e/scan-open.ts tests/e2e/pipeline.spec.ts tests/e2e/job-page.spec.ts tests/e2e/pipeline-phone.spec.ts
git commit -m "$(cat <<'EOF'
test: seed six fictional jobs and add end-to-end pipeline coverage
EOF
)"
```

---

### Task 14: Docs and ship

**Files:**
- Modify: `README.md` (add "Adding a job" and "Keyboard shortcuts on the board"; "Importing applications once" was already added in Task 12 and is only checked here, not rewritten), `docs/design-system.md` (completeness pass), `docs/superpowers/specs/2026-09-18-jobsmith-core-design.md` (short notes for D7, D8, D10, D13)

**Interfaces:**
- Consumes: the whole milestone's shipped surface: the board and its cards, menus and dialogs (Tasks 7 to 9), the job page (Tasks 10 and 11), and the importer (Task 12), read as a user or a reviewer would, not imported as code.
- Produces: an updated `README.md`, `docs/design-system.md` and spec, and (this task's own final step only) the owner's first real import into their own instance. Nothing here is consumed by a later task; this is the milestone's last gate.

This task has no unit of executable logic of its own (it edits three documents and, in its last step, the owner acts once outside any of this). Steps are still numbered and checked off the same way, but there is no test-first pass and no new source file.

- [ ] **Step 1: Write the README's "Adding a job" section**

Insert into `README.md` a new `## Adding a job` section, placed directly after "## First run" and before "## Deploying": the natural next step once the app is running, ahead of the more operational sections (deploying, the reverse proxy, scripts, tests). "Importing applications once" (Task 12) stays where Task 12 put it, after "## Tests" and before "## Design system": it is a one-time, script-driven operation closer in kind to the Scripts section than to a first-run walkthrough, not a section that needs to sit next to this one.

```markdown
## Adding a job

Click "Add job" on the board. Company and role are required; everything
else (location, work mode, a link to the posting, pasted posting text, a
pay range and currency, a pay note, what you plan to ask for, and which
column it starts in) is optional. Retyping an existing company's name
matches that company, so the same company across several roles stays one
company record rather than several.

Adding the same company and role again while the first one is still
active shows "You already track this role at this company." with a link
to open it, instead of creating a second copy.

"Where is it now" defaults to Saved. Choosing a later column still creates
the job with all seven stages and then moves it once, the same as adding
it plain and dragging the card afterward.
```

- [ ] **Step 2: Write the README's "Keyboard shortcuts on the board" section**

Insert directly after "Adding a job":

```markdown
## Keyboard shortcuts on the board

Focus a card (its title is a link, reached by Tab in the normal reading
order) and press a digit 1 to 7 to move it straight to that column, or
`c` to close it and choose a reason. Every card also has a "Move to" menu
listing the same seven columns and a Close item, for a mouse or a screen
reader user who would rather not remember the numbers. A move that
succeeds is confirmed out loud through a screen reader (a visually hidden
live region); a move the server refuses shows why in a toast and leaves
the card where it was.

Below 768px wide the board is a list grouped by stage instead of columns;
each row's "Move to" button opens the same seven choices in a sheet.
```

- [ ] **Step 3: Confirm "Importing applications once" is still accurate**

Read the section Task 12 added. It should already cover the command, every field including the optional ones, the skip-on-duplicate behavior, `--email`'s one-account exception and `--dry-run`. If a detail drifted while Tasks 12 and 13 were built (for example, a fixture field this plan did not anticipate), correct it here, but do not rewrite the section from scratch; it already exists.

- [ ] **Step 4: Check `docs/design-system.md` for completeness**

Confirm every one of these is recorded (add whichever Task 6 did not already write down when it landed):
- The "Items installed so far" registry list includes `detail-view-shell`, `empty-state`, `mode-tabs`, `shortcuts-sheet`, `field-row` alongside the fourteen items already listed there from Milestone 1.
- "Local changes" records the `pb-safe` utility class added to `app/globals.css` (Task 6) and its reason (the bottom safe area on phones).
- "Local changes" records whatever import-path fix, if any, `use-view-mode` needed for the new registry items (Task 6's frame text: "Check the import path each new item expects for `use-view-mode`... and record any path fix as a local change"). If Task 6 needed no fix, this bullet does not get added. Do not invent a change that did not happen.
- The primitives list (`components/ui/`) reflects `dialog`, `select`, `textarea`, `sonner`, `toggle-group` and `empty` now existing alongside Milestone 1's thirteen.

- [ ] **Step 5: Amend the spec, D8 (the board's "Move to" menu)**

In `docs/superpowers/specs/2026-09-18-jobsmith-core-design.md`, section 5.1, add one bullet to the existing "Board interaction" list, after "Below 768px wide the board renders as a list grouped by stage, with a 'Move to' sheet that calls the same function." and before the paragraph that follows the list:

```markdown
- Every card also has a "Move to" menu (Milestone 2, decision D8) listing the seven columns plus Close. It calls the same function a drag, a keyboard digit or the phone sheet does, so every input method reaches every stage.
```

- [ ] **Step 6: Amend the spec, D10 and D13 (the job page)**

In the same file, section 5.2, add one paragraph directly after the tab table (after the `Prep` row, before section 5.3):

```markdown
**Milestone 2 notes.** Decision D13: this milestone ships only the Overview, People and Timeline rows above; Research, Documents and Prep arrive in Milestone 3, and Overview's fit card stays hidden while `fit_score` is null (Milestone 5). Decision D10: Overview's posting snapshot renders as plain text with line breaks kept, not through the sanitized markdown renderer in section 5.3, which arrives with artifacts in Milestone 3.
```

- [ ] **Step 7: Amend the spec, D7 (browser time zone)**

In the same file, section 6 ("Error handling"), add one bullet directly after "Times are stored as `timestamptz` (UTC instants) and shown in the profile timezone.":

```markdown
- Milestone 2 note (decision D7): there is no Settings page and no stored profile time zone until Milestone 5. Until then, every timestamp shown in the UI is rendered and entered in the browser's own time zone, through `components/local-time.tsx` and `components/local-datetime-input.tsx` only, so adding the real profile time zone later touches just those two files.
```

- [ ] **Step 8: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm check:tokens
pnpm test
pnpm build
pnpm test:e2e
```

Expected: all six exit 0. This task changes no source file, so if Tasks 1 to 13 were already green, this step is confirming that a documentation-only change did not somehow break a lint rule that reads Markdown (it does not, in this repo's `eslint`/`check:tokens` configuration) rather than expecting new failures or fixes.

- [ ] **Step 9: Preview check in Chrome and Safari**

Deploy or run the full build (`pnpm build && pnpm start`, or the project's preview deploy). In both Chrome and Safari: sign in, add a job, drag and keyboard-move a card, close and reopen it, open the job page, move a stage through the stepper, edit stages, schedule a stage, set and complete a next action, add a person, add a note, switch tabs, and check both light and dark. This is the milestone's own "Done when" bar (spec section 9's Milestone 2 row: "Every active application is on the board") and the standing rule every milestone ends with a preview link, a pass in Chrome and Safari, and the test suites green.

- [ ] **Step 10: Commit**

```bash
git add README.md docs/design-system.md docs/superpowers/specs/2026-09-18-jobsmith-core-design.md
git commit -m "$(cat <<'EOF'
docs: document adding a job, board shortcuts, and the M2 spec amendments
EOF
)"
```

- [ ] **Step 11 (owner-gated, not part of the builder's checklist): the owner's real import**

This step belongs to the owner alone. No builder, agent or CI job runs it, and it produces nothing that gets committed.

1. The owner writes a small script mapping their own current tracker's export into the neutral shape `tests/fixtures/applications.sample.json` demonstrates (`company`, `roleTitle`, `stageKind`, and the optional `appliedAt`/`sourceUrl`/`notes`/`nextAction`). It lives in `local/`, which `.gitignore` already excludes (Task 12, Step 9), because it is built around the owner's own real companies, roles and dates: it is never committed.
2. Run `pnpm import:applications local/<the owner's file>.json --dry-run` first, on the owner's own instance. The owner reads the printed summary (created, skipped, and any failed entry by index) before doing anything else.
3. Only after reading that summary does the owner rerun the same command without `--dry-run`, still on their own instance, against their own account.

---
