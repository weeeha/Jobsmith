# Jobsmith Core Milestone 5 (Fit and Home): Tasks 6 to 9

Part B of the Milestone 5 plan. Read `README.md` first: it holds the goal, the global constraints
and the Contract (called "the README" in the task text below) that these tasks follow. These four
tasks build the screens that sit on the Part A foundations: the Home page (the attention list, the
pipeline counts, the recent pushes and the snooze action), the Settings profile section with the
time zone picker, Export my data (the scoped reads, the envelope, the download route and its
isolation cases), and the Preferences page (the list input, the form and the save action).

Every name, signature, constant, error code and copy string below is copied character for
character from the README's Contract, except where the README's "Adjustments" section lists the
change. A Sonnet builder implementing one of these tasks sees only that task's own text plus the
README, so each task restates the rules, copy and risks it needs rather than pointing back at an
earlier task's prose.

All code in this file was written and run in a scratch checkout before it was put here: every
Vitest file and implementation file below passed there, and every mutation check was made, watched
failing and reverted. The Playwright specs (`tests/e2e/settings.spec.ts`,
`tests/e2e/preferences.spec.ts` and the `nav.spec.ts` change) were type-checked and linted but
**not run** while drafting; they were written against the accessible names of the components in the
same tasks. The first real run happened in Task 12's end-to-end gate, in Chromium and WebKit: the
settings specs and the `nav.spec.ts` change passed as written, and one selector in
`preferences.spec.ts` was corrected (the alert, below). Where a step shows a diff, apply it to
the file as it stands at the start of the task (the lines starting with `-` and `+` are the change,
the others are context).

Conventions used in every task:

- Test files import with `@/` paths and, under `tests/integration`, the helpers with `../helpers/...`.
  Component tests start with `// @vitest-environment jsdom`. This repo has no `@testing-library/jest-dom`:
  assertions read the DOM directly (`textContent`, `getAttribute`, `document.activeElement`).
- `tests/integration/*.test.ts` only matches `.ts` files (the Vitest `include` in `vitest.config.mts`),
  so an integration test that renders a component builds its element with `createElement`, not JSX.
- Commands run from the repository root with `pnpm exec vitest run <file>`.
- The live announcer (`LiveAnnouncerProvider`) speaks 50 ms after `announce()` is called. A test that reads
  the announcement uses `vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })` and advances
  the clock by 100 ms inside `act`, then restores real timers. Tests that also talk to PGlite fake only
  `Date`: faking its timers would stall the database.
- "Mutation check" steps are part of the task: make the change, run the named test, see it fail,
  revert, run again and see it pass. The task report says all of them were made. Revert by undoing the
  edit by hand, not with `git checkout -- <file>`, because the file holds the task's uncommitted work.
- Do not touch `main`. The branch is `feat/m5-fit-home`.

---

### Task 6: Home page

**Files:**
- Create: `lib/attention/messages.ts`, `components/home/attention-list.tsx`, `components/home/pipeline-counts.tsx`, `components/home/recent-pushes.tsx`, `tests/unit/attention-list.test.tsx`, `tests/integration/home-actions.test.ts`, `tests/integration/home-page.test.ts`
- Modify: `app/(app)/page.tsx`, `app/(app)/actions.ts`

**Interfaces:**
- Consumes: `AttentionItem`, `SNOOZABLE_RULES` and `SnoozableRule` (Task 5, `lib/attention/index.ts`), `SNOOZE_PRESETS`, `SnoozePreset`, `SNOOZE_FALLBACK_TEXT` and `snoozeUntil` (Task 5, `lib/attention/snooze.ts`), `snoozeNextAction` (Task 5, `lib/pipeline/next-action.ts`), `getHomeView`, `PipelineCount` and `RecentPush` (Task 5, `lib/home/read.ts`), `loadProfile` (Task 2), `seedProfile` (Task 2, `tests/helpers/profile.ts`), `TimeZoneProvider` and `LocalTime` (Task 1), `completeNextActionAction` (Milestone 2, `app/(app)/jobs/[slug]/actions.ts`, unmodified), `opportunityIdSchema`, `messageFor`, `Result`, `fail`, `EmptyState`, `Button`, `buttonVariants`, `DropdownMenu`, `useAnnounce`, `correctFocusOnceLost`, `focusWasLost` (Milestones 1 to 4, unmodified).
- Produces (copied from the README's Contract character for character):

```typescript
// app/(app)/actions.ts (added)
export async function snoozeAction(opportunityId: string, rule: SnoozableRule, preset: SnoozePreset): Promise<Result<null, "not_found" | "closed" | "invalid">>;
// components/home/attention-list.tsx ("use client")
export function AttentionList(props: { items: AttentionItem[] }): React.ReactElement;
// components/home/pipeline-counts.tsx, recent-pushes.tsx (server)
export function PipelineCounts(props: { counts: PipelineCount[] }): React.ReactElement;
export function RecentPushes(props: { pushes: RecentPush[] }): React.ReactElement;
```

This task also adds `lib/attention/messages.ts` (pure functions and constants for Home's copy: `attentionReason`, `primaryAction`, `SNOOZE_LABELS`, `snoozeAriaLabel`, `snoozedAnnouncement`, `doneAnnouncement`, `snoozeFailure`, `doneFailure`, `documentsLabel`, `HOME_MESSAGES`), so the components only lay text out.

Rules this task enforces:

- `snoozeAction`: `requireUser`; one `safeParse` of `{ opportunityId, rule, preset }` with `opportunityIdSchema`, `z.enum(SNOOZABLE_RULES)` and `z.enum(SNOOZE_PRESETS)`, any failure being `fail("invalid", messageFor("invalid"))` (so `interview_soon`, a preset that does not exist and an id that is not a uuid are all `invalid`; `not_found` means the job is missing or belongs to someone else). `until = snoozeUntil(preset, new Date(), (await loadProfile(s)).timezone)`: 09:00 in the profile zone, that many calendar days after today's date there. The fallback text comes from `SNOOZE_FALLBACK_TEXT` (a due next action always has text, so `next_action_due` passes `"Follow up"` and it is never used). Then `snoozeNextAction`; a failure is `fail(code, messageFor(code))` (`not_found`, `closed`); on success it revalidates `/`, `/board` and `/jobs/<slug>`. It writes no event.
- `app/(app)/actions.ts` is a `"use server"` file: it may export only async functions. It also holds `logout`, which imports the auth instance, and that module reads the server environment when it loads. Tests that import this file therefore mock `@/lib/auth` (the integration tests below do; the component test mocks the whole actions module).
- Home lists items in the order `attentionItems` returns them (rule order); the list renders the order it is given.
- Per item (`AttentionList`): line 1 a link `<role> at <company>` to `/jobs/<slug>` (`font-medium break-words`); line 2 the reason text with a `LocalTime mode="datetime"` where it names a time; line 3 a `flex flex-wrap gap-2` row with the primary action and, when `snoozable`, the Snooze menu. Reason texts: `interview_soon` `<stage label>, <time>` · `next_action_due` `<next action>. Due <time>.` or `<next action>. Overdue since <time>.` · `follow_up` `Follow up? No news for <n> days.` · `apply_or_drop` `Apply or drop. Saved <n> days ago.` · `mark_done` `<stage label> was <time>. Mark it done and add notes.` (`<n>` reads `1 day` when it is 1.)
- Primary actions: `Open prep` (aria-label `Open prep for <role> at <company>`, link to `/jobs/<slug>?tab=prep`) for `interview_soon`; `Done` (aria-label `Mark the next action done for <role> at <company>`, a button that runs `completeNextActionAction(opportunityId)`) for `next_action_due`; `Open job` (aria-label `Open <role> at <company>`, link to `/jobs/<slug>`) for `follow_up`, `apply_or_drop` and `mark_done`. Snooze: a `DropdownMenuTrigger` rendering a `Button size="sm" variant="outline"` with visible text `Snooze` and aria-label `Snooze <role> at <company>`; items `Until tomorrow` (`tomorrow`), `For 3 days` (`in_3_days`), `For a week` (`next_week`). Only rules 2, 3 and 4 (`item.snoozable`) get the menu.
- Both actions run in a transition inside try/catch. Success announces (`Snoozed <role> at <company>.` or `Marked the next action done for <role> at <company>.`) and calls `correctFocusOnceLost(() => document.getElementById("home-today")?.focus())`: a finished item leaves the list, so the button that was clicked goes away with it. Failure toasts (`Could not snooze <role> at <company>. <message>` or `Could not mark the next action done. <message>`; a rejected action uses `messageFor("unexpected")` as the message), does not announce, and puts focus back on the button when it was lost (the button is disabled while the request runs, and Chromium drops focus from a disabled button).
- The page: `requireUser`; `getHomeView(scopedFor(user.id), new Date())`; `<div className="flex flex-col gap-6 p-6">`, `h1 Home`, then a row that is one column on phones and two columns from `lg`: a `<section aria-labelledby="home-today">` whose `h2 Today` has `id="home-today"` and `tabIndex={-1}`, holding `AttentionList` or an `EmptyState size="panel"`, and an `<aside aria-label="Summary">` holding `PipelineCounts` and `RecentPushes`, each its own `<section aria-labelledby>` with an `h2` (`Pipeline`, `Recent pushes`). No active jobs: title `No jobs yet.`, description `Add a job on the board and Home starts telling you what to do next.`, a link `Go to the board` to `/board`. Jobs but no items: title `Nothing needs attention today.`, description `Interviews, due next actions and jobs that sat too long show up here.`. Pipeline: one row per column (label and count, seven rows in column order) and a link `Open the board`. Pushes: `<role> at <company>` linking to the job's Documents tab, `1 document` or `<n> documents`, and the time; empty text `No pushes yet. Documents pushed from the command line show up here.`
- The README's grid class `lg:grid-cols-[minmax(0,1fr)_20rem]` is an arbitrary value, which `pnpm check:tokens` rejects. Use `flex flex-col gap-6 lg:flex-row lg:items-start` with `lg:flex-1` on the Today section and `lg:w-80 lg:shrink-0` (20 rem) on the aside.
- No exclamation marks. Semantic token utilities only. `pnpm lint` (which includes `pnpm check:tokens`) is part of the wider checks.
- For the end-to-end task: the job link in a row is named `<role> at <company>` and the `Open job` link is named `Open <role> at <company>`, so a Playwright `getByRole("link", { name })` with the plain text matches both; use `exact: true`.

- [ ] **Step 1: Write the failing test `tests/integration/home-actions.test.ts` in full**

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db/client";
import { scoped } from "@/lib/db/scoped";
import { setNextAction } from "@/lib/pipeline/next-action";
import { closeOpportunity } from "@/lib/pipeline/close";
import { snoozeAction } from "@/app/(app)/actions";
import { makeTestDb, createTestUser } from "../helpers/db";
import { seedOpportunity } from "../helpers/opportunity-fixture";
import { seedProfile } from "../helpers/profile";

// Same harness as job-actions.test.ts: the signed-in user and path
// revalidation need a live Next.js request, so both are stubbed, and scopedFor
// points at a real PGlite database through the real scoped().
const harness = vi.hoisted(() => ({ db: undefined as Db | undefined, userId: "" }));
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => ({ id: harness.userId }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

// app/(app)/actions.ts also holds the sign-out action, which imports the auth
// instance; that module reads the server environment when it loads, and no
// test here signs out.
vi.mock("@/lib/auth", () => ({ auth: { api: { signOut: async () => {} } } }));

vi.mock("@/lib/db/scoped", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/scoped")>();
  return { ...actual, scopedFor: (userId: string) => actual.scoped(harness.db!, userId) };
});

afterEach(() => {
  vi.useRealTimers();
  revalidatePathMock.mockClear();
});

// Only Date is faked: PGlite and the event loop need the real timers.
function freezeNow(iso: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
}

describe("snoozeAction", () => {
  it("sets the next action to 09:00 the next calendar day in the profile zone and keeps its text", async () => {
    const { db, close } = await makeTestDb();
    try {
      harness.db = db;
      harness.userId = (await createTestUser(db, "snooze-owner@example.com")).id;
      const s = scoped(db, harness.userId);
      await seedProfile(s, { timezone: "America/New_York" });
      const { id, slug } = await seedOpportunity(s);
      await setNextAction(s, id, { text: "Send portfolio", at: new Date("2026-10-10T13:00:00.000Z") });

      // 16:30 on 11 October in New York (UTC-4).
      freezeNow("2026-10-11T20:30:00.000Z");
      const result = await snoozeAction(id, "next_action_due", "tomorrow");

      expect(result).toEqual({ ok: true, data: null });
      const row = await s.opportunity.getById(id);
      expect(row?.nextAction).toBe("Send portfolio");
      // 09:00 on 12 October in New York is 13:00 UTC.
      expect(row?.nextActionAt).toEqual(new Date("2026-10-12T13:00:00.000Z"));
      expect(revalidatePathMock).toHaveBeenCalledWith("/");
      expect(revalidatePathMock).toHaveBeenCalledWith("/board");
      expect(revalidatePathMock).toHaveBeenCalledWith(`/jobs/${slug}`);
    } finally {
      await close();
    }
  });

  it("gives a job with no next action the fallback text for its rule", async () => {
    const { db, close } = await makeTestDb();
    try {
      harness.db = db;
      harness.userId = (await createTestUser(db, "snooze-fallback@example.com")).id;
      const s = scoped(db, harness.userId);
      await seedProfile(s, { timezone: "UTC" });
      const followUp = await seedOpportunity(s, { companyName: "Northwind Traders", roleTitle: "Design Lead" });
      const saved = await seedOpportunity(s, { companyName: "Lumen Health", roleTitle: "Researcher" });

      freezeNow("2026-10-11T20:30:00.000Z");
      expect(await snoozeAction(followUp.id, "follow_up", "in_3_days")).toEqual({ ok: true, data: null });
      expect(await snoozeAction(saved.id, "apply_or_drop", "next_week")).toEqual({ ok: true, data: null });

      expect(await s.opportunity.getById(followUp.id)).toMatchObject({
        nextAction: "Follow up",
        nextActionAt: new Date("2026-10-14T09:00:00.000Z"),
      });
      expect(await s.opportunity.getById(saved.id)).toMatchObject({
        nextAction: "Apply or drop",
        nextActionAt: new Date("2026-10-18T09:00:00.000Z"),
      });
    } finally {
      await close();
    }
  });

  it("rejects a preset that does not exist and a rule that cannot be snoozed, and changes nothing", async () => {
    const { db, close } = await makeTestDb();
    try {
      harness.db = db;
      harness.userId = (await createTestUser(db, "snooze-invalid@example.com")).id;
      const s = scoped(db, harness.userId);
      const { id } = await seedOpportunity(s);

      const badPreset = await snoozeAction(id, "follow_up", "next_year" as never);
      expect(badPreset).toMatchObject({ ok: false, code: "invalid", message: "Check the highlighted fields." });

      const interview = await snoozeAction(id, "interview_soon" as never, "tomorrow");
      expect(interview).toMatchObject({ ok: false, code: "invalid" });

      expect(await s.opportunity.getById(id)).toMatchObject({ nextAction: null, nextActionAt: null });
      expect(revalidatePathMock).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("returns not_found for another user's job and invalid for an id that is not a uuid", async () => {
    const { db, close } = await makeTestDb();
    try {
      harness.db = db;
      const owner = await createTestUser(db, "snooze-a@example.com");
      const other = await createTestUser(db, "snooze-b@example.com");
      const { id } = await seedOpportunity(scoped(db, owner.id));
      harness.userId = other.id;

      expect(await snoozeAction(id, "follow_up", "tomorrow")).toMatchObject({ ok: false, code: "not_found" });
      expect(await snoozeAction("not-a-uuid", "follow_up", "tomorrow")).toMatchObject({ ok: false, code: "invalid" });
      expect(await scoped(db, owner.id).opportunity.getById(id)).toMatchObject({ nextAction: null });
    } finally {
      await close();
    }
  });

  it("fails with closed on a closed job", async () => {
    const { db, close } = await makeTestDb();
    try {
      harness.db = db;
      harness.userId = (await createTestUser(db, "snooze-closed@example.com")).id;
      const s = scoped(db, harness.userId);
      const { id } = await seedOpportunity(s);
      await closeOpportunity(s, id, "rejected", new Date("2026-10-01T09:00:00.000Z"));

      expect(await snoozeAction(id, "follow_up", "tomorrow")).toMatchObject({
        ok: false,
        code: "closed",
        message: "This job is closed. Reopen it first.",
      });
    } finally {
      await close();
    }
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/integration/home-actions.test.ts
```

Expected: `Tests  5 failed (5)`, each with `TypeError: snoozeAction is not a function`.

- [ ] **Step 3: Add `snoozeAction` to `app/(app)/actions.ts`**

Replace the file with the following (`logout` is unchanged; the new imports and `snoozeAction` are the addition):

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { SNOOZABLE_RULES, type SnoozableRule } from "@/lib/attention";
import { SNOOZE_FALLBACK_TEXT, SNOOZE_PRESETS, snoozeUntil, type SnoozePreset } from "@/lib/attention/snooze";
import { snoozeNextAction } from "@/lib/pipeline/next-action";
import { opportunityIdSchema } from "@/lib/pipeline/action-schemas";
import { messageFor } from "@/lib/pipeline/messages";
import { loadProfile } from "@/lib/profile/store";
import { fail, type Result } from "@/lib/result";

export async function logout() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}

const snoozeInputSchema = z.object({
  opportunityId: opportunityIdSchema,
  rule: z.enum(SNOOZABLE_RULES),
  preset: z.enum(SNOOZE_PRESETS),
});

/**
 * Pushes a job's next action to 09:00 in the profile zone, a few calendar days
 * ahead. Home offers it on due next actions, follow-ups and apply-or-drop
 * items only; an interview's time is fixed.
 */
export async function snoozeAction(
  opportunityId: string,
  rule: SnoozableRule,
  preset: SnoozePreset,
): Promise<Result<null, "not_found" | "closed" | "invalid">> {
  const user = await requireUser();
  const parsed = snoozeInputSchema.safeParse({ opportunityId, rule, preset });
  if (!parsed.success) return fail("invalid", messageFor("invalid"));

  const s = scopedFor(user.id);
  const profile = await loadProfile(s);
  // A due next action always has text, so this fallback is never used for it.
  const fallbackText =
    parsed.data.rule === "next_action_due" ? SNOOZE_FALLBACK_TEXT.follow_up : SNOOZE_FALLBACK_TEXT[parsed.data.rule];
  const result = await snoozeNextAction(s, parsed.data.opportunityId, {
    until: snoozeUntil(parsed.data.preset, new Date(), profile.timezone),
    fallbackText,
  });
  if (!result.ok) return fail(result.code, messageFor(result.code));

  const job = await s.opportunity.getById(parsed.data.opportunityId);
  revalidatePath("/");
  revalidatePath("/board");
  if (job) revalidatePath(`/jobs/${job.slug}`);
  return result;
}
```

- [ ] **Step 4: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/integration/home-actions.test.ts
```

Expected: `Tests  5 passed (5)`.

- [ ] **Step 5: Mutation check: ignore the profile zone**

In `snoozeAction`, replace `profile.timezone` with `"UTC"` in the `snoozeUntil(...)` call. Run:

```bash
pnpm exec vitest run tests/integration/home-actions.test.ts
```

Expected: `sets the next action to 09:00 the next calendar day in the profile zone and keeps its text` fails (the stored time is 09:00 UTC, not 13:00 UTC); 4 pass. Revert and rerun to confirm 5 pass.

- [ ] **Step 6: Write the failing test `tests/unit/attention-list.test.tsx` in full**

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { toast } from "sonner";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { TimeZoneProvider } from "@/components/time-zone-provider";
import { AttentionList } from "@/components/home/attention-list";
import { snoozeAction } from "@/app/(app)/actions";
import { completeNextActionAction } from "@/app/(app)/jobs/[slug]/actions";
import type { AttentionItem } from "@/lib/attention";

// Same style as the other component tests here: no jest-dom, direct DOM reads.
vi.mock("@/app/(app)/actions", () => ({ snoozeAction: vi.fn() }));
vi.mock("@/app/(app)/jobs/[slug]/actions", () => ({ completeNextActionAction: vi.fn() }));

const mockedSnooze = vi.mocked(snoozeAction);
const mockedDone = vi.mocked(completeNextActionAction);

function item(overrides: Partial<AttentionItem> = {}): AttentionItem {
  return {
    key: "follow_up:job-1",
    rule: "follow_up",
    opportunityId: "job-1",
    slug: "product-designer-acme",
    roleTitle: "Product Designer",
    companyName: "Acme Robotics",
    at: new Date("2026-10-02T09:00:00.000Z"),
    stage: null,
    nextAction: null,
    days: 9,
    overdue: false,
    snoozable: true,
    ...overrides,
  };
}

const INTERVIEW = item({
  key: "interview_soon:stage-1",
  rule: "interview_soon",
  at: new Date("2026-10-12T14:00:00.000Z"),
  stage: { id: "stage-1", label: "Phone screen" },
  days: null,
  snoozable: false,
});
const DUE = item({
  key: "next_action_due:job-1",
  rule: "next_action_due",
  at: new Date("2026-10-11T15:00:00.000Z"),
  nextAction: "Send portfolio",
  days: null,
});
const OVERDUE = { ...DUE, overdue: true, at: new Date("2026-10-09T15:00:00.000Z") };
const FOLLOW_UP = item();
const APPLY = item({ key: "apply_or_drop:job-1", rule: "apply_or_drop", days: 4 });
const MARK_DONE = item({
  key: "mark_done:stage-2",
  rule: "mark_done",
  at: new Date("2026-10-10T14:00:00.000Z"),
  stage: { id: "stage-2", label: "Technical interview" },
  days: null,
  snoozable: false,
});

function renderList(items: AttentionItem[]) {
  const view = (list: AttentionItem[]) => (
    <LiveAnnouncerProvider>
      <TimeZoneProvider zone="UTC">
        <h2 id="home-today" tabIndex={-1}>
          Today
        </h2>
        <AttentionList items={list} />
      </TimeZoneProvider>
    </LiveAnnouncerProvider>
  );
  const utils = render(view(items));
  return { ...utils, rerenderWith: (list: AttentionItem[]) => utils.rerender(view(list)) };
}

function reasonOf(li: HTMLElement): string {
  return li.querySelector("[data-attention-reason]")?.textContent ?? "";
}

async function openSnoozeMenu(label: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: label }));
  });
}

beforeEach(() => {
  mockedSnooze.mockReset();
  mockedDone.mockReset();
  vi.restoreAllMocks();
});

describe("AttentionList", () => {
  it("is a list named Things to do today with a job link per item", () => {
    renderList([FOLLOW_UP, { ...APPLY, opportunityId: "job-2", slug: "design-lead-northwind", roleTitle: "Design Lead", companyName: "Northwind Traders" }]);
    const list = screen.getByRole("list", { name: "Things to do today" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    const link = within(rows[1]!).getByRole("link", { name: "Design Lead at Northwind Traders" });
    expect(link.getAttribute("href")).toBe("/jobs/design-lead-northwind");
  });

  // An unbroken name has no space to wrap at, so the elements that hold it
  // must be allowed to break inside a word.
  it("lets an 80-character role and company name break inside the word", () => {
    renderList([item({ roleTitle: "r".repeat(80), companyName: "c".repeat(80), nextAction: "n".repeat(80), rule: "next_action_due", key: "next_action_due:job-1" })]);
    const link = screen.getByRole("link", { name: `${"r".repeat(80)} at ${"c".repeat(80)}` });
    expect(link.className).toContain("break-words");
    const reason = document.querySelector("[data-attention-reason]") as HTMLElement;
    expect(reason.textContent).toContain("n".repeat(80));
    expect(reason.className).toContain("break-words");
  });

  it.each([
    ["interview_soon", INTERVIEW, /^Phone screen, .+$/],
    ["next_action_due", DUE, /^Send portfolio\. Due .+\.$/],
    ["next_action_due overdue", OVERDUE, /^Send portfolio\. Overdue since .+\.$/],
    ["follow_up", FOLLOW_UP, /^Follow up\? No news for 9 days\.$/],
    ["apply_or_drop", APPLY, /^Apply or drop\. Saved 4 days ago\.$/],
    ["mark_done", MARK_DONE, /^Technical interview was .+\. Mark it done and add notes\.$/],
  ])("%s: reason text", (_name, entry, pattern) => {
    renderList([entry]);
    expect(reasonOf(screen.getByRole("listitem"))).toMatch(pattern);
  });

  it("says 1 day, not 1 days", () => {
    renderList([item({ days: 1 })]);
    expect(reasonOf(screen.getByRole("listitem"))).toBe("Follow up? No news for 1 day.");
  });

  it("puts the time in a <time> element with the instant", () => {
    renderList([DUE]);
    const time = screen.getByRole("listitem").querySelector("time");
    expect(time?.getAttribute("datetime")).toBe("2026-10-11T15:00:00.000Z");
  });

  it("gives each rule one primary action", () => {
    renderList([INTERVIEW, DUE, FOLLOW_UP, APPLY, MARK_DONE]);
    const rows = screen.getAllByRole("listitem");
    const prep = within(rows[0]!).getByRole("link", { name: "Open prep for Product Designer at Acme Robotics" });
    expect(prep.getAttribute("href")).toBe("/jobs/product-designer-acme?tab=prep");
    expect(prep.textContent).toBe("Open prep");
    const done = within(rows[1]!).getByRole("button", { name: "Mark the next action done for Product Designer at Acme Robotics" });
    expect(done.textContent).toBe("Done");
    for (const index of [2, 3, 4]) {
      const open = within(rows[index]!).getByRole("link", { name: "Open Product Designer at Acme Robotics" });
      expect(open.textContent).toBe("Open job");
      expect(open.getAttribute("href")).toBe("/jobs/product-designer-acme");
    }
  });

  it("offers Snooze on due next actions, follow-ups and apply-or-drop items only", () => {
    renderList([INTERVIEW, DUE, FOLLOW_UP, APPLY, MARK_DONE]);
    const rows = screen.getAllByRole("listitem");
    const snoozeIn = (index: number) => within(rows[index]!).queryByRole("button", { name: "Snooze Product Designer at Acme Robotics" });
    expect(snoozeIn(0)).toBeNull();
    expect(snoozeIn(1)).not.toBeNull();
    expect(snoozeIn(2)).not.toBeNull();
    expect(snoozeIn(3)).not.toBeNull();
    expect(snoozeIn(4)).toBeNull();
  });

  it("lists the three presets and posts the rule and the chosen preset", async () => {
    mockedSnooze.mockResolvedValue({ ok: true, data: null });
    renderList([FOLLOW_UP]);
    await openSnoozeMenu("Snooze Product Designer at Acme Robotics");
    const items = screen.getAllByRole("menuitem").map((entry) => entry.textContent);
    expect(items).toEqual(["Until tomorrow", "For 3 days", "For a week"]);

    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "For 3 days" }));
    });
    expect(mockedSnooze).toHaveBeenCalledWith("job-1", "follow_up", "in_3_days");
  });

  it("announces a snooze and moves focus to Today once the item is gone", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    mockedSnooze.mockResolvedValue({ ok: true, data: null });
    const { rerenderWith } = renderList([FOLLOW_UP]);
    await openSnoozeMenu("Snooze Product Designer at Acme Robotics");
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Until tomorrow" }));
      await Promise.resolve();
    });
    // The server action revalidates Home, so the row disappears and focus
    // falls back to <body>.
    await act(async () => {
      rerenderWith([]);
      (document.activeElement as HTMLElement | null)?.blur();
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByRole("status").textContent).toBe("Snoozed Product Designer at Acme Robotics.");
    expect(document.activeElement).toBe(document.getElementById("home-today"));
    vi.useRealTimers();
  });

  it("marks a next action done, announces it, and calls the existing action with the job id", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    mockedDone.mockResolvedValue({ ok: true, data: null });
    renderList([DUE]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark the next action done for Product Designer at Acme Robotics" }));
      await Promise.resolve();
      vi.advanceTimersByTime(60);
    });
    expect(mockedDone).toHaveBeenCalledWith("job-1");
    expect(screen.getByRole("status").textContent).toBe("Marked the next action done for Product Designer at Acme Robotics.");
    vi.useRealTimers();
  });

  it("toasts a failed snooze with the server's message and does not announce", async () => {
    // The announcer speaks 50 ms after it is called, so the clock is moved
    // past that before the status region is read.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    mockedSnooze.mockResolvedValue({ ok: false, code: "closed", message: "This job is closed. Reopen it first." });
    const toastError = vi.spyOn(toast, "error");
    renderList([FOLLOW_UP]);
    await openSnoozeMenu("Snooze Product Designer at Acme Robotics");
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "For a week" }));
      await Promise.resolve();
      vi.advanceTimersByTime(200);
    });
    vi.useRealTimers();
    expect(toastError).toHaveBeenCalledWith(
      "Could not snooze Product Designer at Acme Robotics. This job is closed. Reopen it first.",
    );
    expect(screen.getByRole("status").textContent).toBe("");
    expect(document.activeElement).not.toBe(document.getElementById("home-today"));
  });

  it("toasts a failed Done and a rejected action, and keeps the row", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const toastError = vi.spyOn(toast, "error");
    renderList([DUE]);
    const button = screen.getByRole("button", { name: "Mark the next action done for Product Designer at Acme Robotics" });

    mockedDone.mockResolvedValueOnce({ ok: false, code: "nothing_to_complete", message: "There is no next action." });
    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });
    expect(toastError).toHaveBeenLastCalledWith("Could not mark the next action done. There is no next action.");

    mockedDone.mockRejectedValueOnce(new Error("network"));
    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });
    expect(toastError).toHaveBeenLastCalledWith("Could not mark the next action done. Something went wrong. Try again.");
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });
});
```

- [ ] **Step 7: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/unit/attention-list.test.tsx
```

Expected: the file fails to load with `Failed to resolve import "@/components/home/attention-list"`. No test runs.

- [ ] **Step 8: Write `lib/attention/messages.ts` and `components/home/attention-list.tsx` in full**

`lib/attention/messages.ts`:

```typescript
import type { AttentionItem } from "@/lib/attention";
import type { SnoozePreset } from "@/lib/attention/snooze";

// Home's copy, as plain functions so the component only lays it out. A reason
// that names a time comes back in three parts so the page can put a
// <LocalTime> between them.
export type ReasonParts = { before: string; time: Date | null; after: string };

function dayCount(days: number | null): string {
  return days === 1 ? "1 day" : `${days ?? 0} days`;
}

export function attentionReason(item: AttentionItem): ReasonParts {
  switch (item.rule) {
    case "interview_soon":
      return { before: `${item.stage?.label ?? "Interview"}, `, time: item.at, after: "" };
    case "next_action_due":
      return {
        before: item.overdue ? `${item.nextAction ?? ""}. Overdue since ` : `${item.nextAction ?? ""}. Due `,
        time: item.at,
        after: ".",
      };
    case "follow_up":
      return { before: `Follow up? No news for ${dayCount(item.days)}.`, time: null, after: "" };
    case "apply_or_drop":
      return { before: `Apply or drop. Saved ${dayCount(item.days)} ago.`, time: null, after: "" };
    case "mark_done":
      return {
        before: `${item.stage?.label ?? "Interview"} was `,
        time: item.at,
        after: ". Mark it done and add notes.",
      };
  }
}

export type PrimaryAction =
  | { kind: "link"; label: string; ariaLabel: string; href: string }
  | { kind: "done"; label: string; ariaLabel: string };

export function primaryAction(item: AttentionItem): PrimaryAction {
  const subject = `${item.roleTitle} at ${item.companyName}`;
  switch (item.rule) {
    case "interview_soon":
      return { kind: "link", label: "Open prep", ariaLabel: `Open prep for ${subject}`, href: `/jobs/${item.slug}?tab=prep` };
    case "next_action_due":
      return { kind: "done", label: "Done", ariaLabel: `Mark the next action done for ${subject}` };
    default:
      return { kind: "link", label: "Open job", ariaLabel: `Open ${subject}`, href: `/jobs/${item.slug}` };
  }
}

export const SNOOZE_LABELS: Record<SnoozePreset, string> = {
  tomorrow: "Until tomorrow",
  in_3_days: "For 3 days",
  next_week: "For a week",
};

export function snoozeAriaLabel(item: Pick<AttentionItem, "roleTitle" | "companyName">): string {
  return `Snooze ${item.roleTitle} at ${item.companyName}`;
}

export function snoozedAnnouncement(item: Pick<AttentionItem, "roleTitle" | "companyName">): string {
  return `Snoozed ${item.roleTitle} at ${item.companyName}.`;
}

export function doneAnnouncement(item: Pick<AttentionItem, "roleTitle" | "companyName">): string {
  return `Marked the next action done for ${item.roleTitle} at ${item.companyName}.`;
}

export function snoozeFailure(item: Pick<AttentionItem, "roleTitle" | "companyName">, message: string): string {
  return `Could not snooze ${item.roleTitle} at ${item.companyName}. ${message}`;
}

export function doneFailure(message: string): string {
  return `Could not mark the next action done. ${message}`;
}

export function documentsLabel(count: number): string {
  return count === 1 ? "1 document" : `${count} documents`;
}

export const HOME_MESSAGES = {
  noJobsTitle: "No jobs yet.",
  noJobsDescription: "Add a job on the board and Home starts telling you what to do next.",
  noJobsAction: "Go to the board",
  nothingTitle: "Nothing needs attention today.",
  nothingDescription: "Interviews, due next actions and jobs that sat too long show up here.",
  openBoard: "Open the board",
  noPushes: "No pushes yet. Documents pushed from the command line show up here.",
} as const;
```

`components/home/attention-list.tsx`:

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";

import { snoozeAction } from "@/app/(app)/actions";
import { completeNextActionAction } from "@/app/(app)/jobs/[slug]/actions";
import { useAnnounce } from "@/components/live-announcer";
import { LocalTime } from "@/components/local-time";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SNOOZABLE_RULES, type AttentionItem, type SnoozableRule } from "@/lib/attention";
import {
  SNOOZE_LABELS,
  attentionReason,
  doneAnnouncement,
  doneFailure,
  primaryAction,
  snoozeAriaLabel,
  snoozeFailure,
  snoozedAnnouncement,
} from "@/lib/attention/messages";
import { SNOOZE_PRESETS, type SnoozePreset } from "@/lib/attention/snooze";
import { focusWasLost, correctFocusOnceLost } from "@/lib/dom/focus";
import { messageFor } from "@/lib/pipeline/messages";

function isSnoozableRule(rule: AttentionItem["rule"]): rule is SnoozableRule {
  return (SNOOZABLE_RULES as readonly string[]).includes(rule);
}

// A finished item leaves the list, so the button that was clicked disappears
// with it. Focus goes to the Today heading, which the page makes focusable.
function focusToday() {
  document.getElementById("home-today")?.focus();
}

export function AttentionList({ items }: { items: AttentionItem[] }) {
  return (
    <ul aria-label="Things to do today" className="flex flex-col divide-y rounded-lg border">
      {items.map((item) => (
        <AttentionRow key={item.key} item={item} />
      ))}
    </ul>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const announce = useAnnounce();
  const [pending, startTransition] = React.useTransition();
  const doneRef = React.useRef<HTMLButtonElement>(null);
  const snoozeRef = React.useRef<HTMLButtonElement>(null);
  const reason = attentionReason(item);
  const action = primaryAction(item);

  function handleDone() {
    startTransition(async () => {
      try {
        const result = await completeNextActionAction(item.opportunityId);
        if (!result.ok) {
          toast.error(doneFailure(result.message));
          if (focusWasLost()) doneRef.current?.focus();
          return;
        }
        announce(doneAnnouncement(item));
        correctFocusOnceLost(focusToday);
      } catch (error) {
        // The action can reject before it ever returns a result (a dropped
        // connection); nothing changed, so the button is still the place for
        // focus to be.
        console.error("complete next action failed", error);
        toast.error(doneFailure(messageFor("unexpected")));
        if (focusWasLost()) doneRef.current?.focus();
      }
    });
  }

  function handleSnooze(preset: SnoozePreset) {
    if (!isSnoozableRule(item.rule)) return;
    const rule = item.rule;
    startTransition(async () => {
      try {
        const result = await snoozeAction(item.opportunityId, rule, preset);
        if (!result.ok) {
          toast.error(snoozeFailure(item, result.message));
          if (focusWasLost()) snoozeRef.current?.focus();
          return;
        }
        announce(snoozedAnnouncement(item));
        correctFocusOnceLost(focusToday);
      } catch (error) {
        console.error("snooze failed", error);
        toast.error(snoozeFailure(item, messageFor("unexpected")));
        if (focusWasLost()) snoozeRef.current?.focus();
      }
    });
  }

  return (
    <li className="flex flex-col gap-2 p-4">
      <Link href={`/jobs/${item.slug}`} className="font-medium break-words text-foreground hover:underline">
        {item.roleTitle} at {item.companyName}
      </Link>
      <p data-attention-reason="" className="text-sm break-words text-muted-foreground">
        {reason.before}
        {reason.time ? <LocalTime value={reason.time} mode="datetime" /> : null}
        {reason.after}
      </p>
      <div className="flex flex-wrap gap-2">
        {action.kind === "link" ? (
          <Link
            href={action.href}
            aria-label={action.ariaLabel}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {action.label}
          </Link>
        ) : (
          <Button
            ref={doneRef}
            size="sm"
            variant="outline"
            aria-label={action.ariaLabel}
            disabled={pending}
            onClick={handleDone}
          >
            {action.label}
          </Button>
        )}
        {item.snoozable && isSnoozableRule(item.rule) ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  ref={snoozeRef}
                  size="sm"
                  variant="outline"
                  aria-label={snoozeAriaLabel(item)}
                  disabled={pending}
                />
              }
            >
              Snooze
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {SNOOZE_PRESETS.map((preset) => (
                <DropdownMenuItem key={preset} onClick={() => handleSnooze(preset)}>
                  {SNOOZE_LABELS[preset]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </li>
  );
}
```

- [ ] **Step 9: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/attention-list.test.tsx
```

Expected: `Tests  17 passed (17)`.

- [ ] **Step 10: Mutation checks on the list**

(a) In `handleSnooze`, add `announce(snoozedAnnouncement(item));` on the line right after `const result = await snoozeAction(...)`, before the `if (!result.ok)` check. Run the file: `toasts a failed snooze with the server's message and does not announce` fails; 16 pass. Revert.

(b) In `handleSnooze`, delete the `correctFocusOnceLost(focusToday);` line. Run the file: `announces a snooze and moves focus to Today once the item is gone` fails; 16 pass. Revert.

(c) Replace the condition `item.snoozable && isSnoozableRule(item.rule)` that guards the `DropdownMenu` with `true`. Run the file: `offers Snooze on due next actions, follow-ups and apply-or-drop items only` fails; 16 pass. Revert.

(d) In the job link's `className`, delete `break-words` (or delete it from the reason paragraph's). Run the file: `lets an 80-character role and company name break inside the word` fails; 16 pass. Revert and rerun to confirm 17 pass.

- [ ] **Step 11: Write the failing test `tests/integration/home-page.test.ts` in full**

The page is an async server component. The test awaits it and renders the element it returns to markup with `renderToStaticMarkup`, with `requireUser` and `scopedFor` stubbed as in the action tests and a real PGlite database behind them.

```typescript
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Db } from "@/lib/db/client";
import { scoped } from "@/lib/db/scoped";
import { setNextAction } from "@/lib/pipeline/next-action";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import HomePage from "@/app/(app)/page";
import { makeTestDb, createTestUser } from "../helpers/db";
import { seedOpportunity } from "../helpers/opportunity-fixture";

// The page is an async server component, so the test awaits it and renders the
// element it returns to markup. requireUser and scopedFor are stubbed the same
// way the action tests do it; the database is a real PGlite.
const harness = vi.hoisted(() => ({ db: undefined as Db | undefined, userId: "" }));

vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ id: harness.userId }) }));
vi.mock("@/lib/db/scoped", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/scoped")>();
  return { ...actual, scopedFor: (userId: string) => actual.scoped(harness.db!, userId) };
});
// The page imports the client list, which imports the server actions file, and
// that file imports the auth instance (it reads the server environment).
vi.mock("@/lib/auth", () => ({ auth: { api: { signOut: async () => {} } } }));

async function renderHome(): Promise<string> {
  const page = await HomePage();
  return renderToStaticMarkup(createElement(LiveAnnouncerProvider, null, page));
}

describe("Home page", () => {
  it("shows the no-jobs empty state and the summary column for a new account", async () => {
    const { db, close } = await makeTestDb();
    try {
      harness.db = db;
      harness.userId = (await createTestUser(db, "home-empty@example.com")).id;
      const html = await renderHome();
      expect(html).toContain("<h1");
      expect(html).toContain("No jobs yet.");
      expect(html).toContain("Go to the board");
      expect(html).toContain("No pushes yet.");
      expect(html).not.toContain("Things to do today");
    } finally {
      await close();
    }
  });

  it("lists a due next action under Today and the columns under Pipeline", async () => {
    const { db, close } = await makeTestDb();
    try {
      harness.db = db;
      harness.userId = (await createTestUser(db, "home-due@example.com")).id;
      const s = scoped(db, harness.userId);
      const { id } = await seedOpportunity(s);
      await setNextAction(s, id, { text: "Send portfolio", at: new Date("2020-01-01T09:00:00.000Z") });
      const html = await renderHome();
      expect(html).toContain('aria-label="Things to do today"');
      expect(html).toContain("Product Designer at Acme Robotics");
      expect(html).toContain("Send portfolio. Overdue since");
      expect(html).toContain("Snooze");
      for (const label of ["Saved", "Applied", "Offer"]) expect(html).toContain(label);
      expect(html).not.toContain("Nothing needs attention today.");
    } finally {
      await close();
    }
  });

  it("says nothing needs attention when there are jobs and no items", async () => {
    const { db, close } = await makeTestDb();
    try {
      harness.db = db;
      harness.userId = (await createTestUser(db, "home-quiet@example.com")).id;
      await seedOpportunity(scoped(db, harness.userId), {}, new Date());
      const html = await renderHome();
      expect(html).toContain("Nothing needs attention today.");
      expect(html).not.toContain("No jobs yet.");
    } finally {
      await close();
    }
  });
});
```

- [ ] **Step 12: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/integration/home-page.test.ts
```

Expected: `Tests  3 failed (3)`; the markup is the old one-line page, so each assertion fails with `expected '<div class="p-6"><h1 class="text-lg f…' to contain ...`.

- [ ] **Step 13: Write the three Home pieces and the page in full**

`components/home/pipeline-counts.tsx`:

```tsx
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { HOME_MESSAGES } from "@/lib/attention/messages";
import type { PipelineCount } from "@/lib/home/read";

export function PipelineCounts({ counts }: { counts: PipelineCount[] }) {
  return (
    <section aria-labelledby="home-pipeline" className="flex flex-col gap-3">
      <h2 id="home-pipeline" className="text-base font-semibold text-foreground">
        Pipeline
      </h2>
      <ul className="flex flex-col divide-y rounded-lg border">
        {counts.map((entry) => (
          <li key={entry.kind} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <span className="text-foreground">{entry.label}</span>
            <span className="text-muted-foreground tabular-nums">{entry.count}</span>
          </li>
        ))}
      </ul>
      <Link href="/board" className={buttonVariants({ variant: "outline", size: "sm", className: "self-start" })}>
        {HOME_MESSAGES.openBoard}
      </Link>
    </section>
  );
}
```

`components/home/recent-pushes.tsx`:

```tsx
import Link from "next/link";

import { LocalTime } from "@/components/local-time";
import { HOME_MESSAGES, documentsLabel } from "@/lib/attention/messages";
import type { RecentPush } from "@/lib/home/read";

export function RecentPushes({ pushes }: { pushes: RecentPush[] }) {
  return (
    <section aria-labelledby="home-pushes" className="flex flex-col gap-3">
      <h2 id="home-pushes" className="text-base font-semibold text-foreground">
        Recent pushes
      </h2>
      {pushes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{HOME_MESSAGES.noPushes}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {pushes.map((push) => (
            <li key={push.id} className="flex flex-col gap-1 px-4 py-2 text-sm">
              <Link href={`/jobs/${push.slug}?tab=documents`} className="font-medium break-words text-foreground hover:underline">
                {push.roleTitle} at {push.companyName}
              </Link>
              <span className="text-muted-foreground">
                {documentsLabel(push.documents)}, <LocalTime value={push.occurredAt} mode="datetime" />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

`app/(app)/page.tsx`:

```tsx
import Link from "next/link";

import { AttentionList } from "@/components/home/attention-list";
import { PipelineCounts } from "@/components/home/pipeline-counts";
import { RecentPushes } from "@/components/home/recent-pushes";
import { EmptyState } from "@/components/super-ai/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { HOME_MESSAGES } from "@/lib/attention/messages";
import { getHomeView } from "@/lib/home/read";

export default async function HomePage() {
  const user = await requireUser();
  const home = await getHomeView(scopedFor(user.id), new Date());

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-lg font-semibold">Home</h1>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <section aria-labelledby="home-today" className="flex min-w-0 flex-col gap-3 lg:flex-1">
          <h2 id="home-today" tabIndex={-1} className="text-base font-semibold text-foreground">
            Today
          </h2>
          {!home.hasActiveJobs ? (
            <EmptyState
              size="panel"
              title={HOME_MESSAGES.noJobsTitle}
              description={HOME_MESSAGES.noJobsDescription}
              action={
                <Link href="/board" className={buttonVariants({ variant: "outline", size: "sm" })}>
                  {HOME_MESSAGES.noJobsAction}
                </Link>
              }
            />
          ) : home.items.length === 0 ? (
            <EmptyState
              size="panel"
              title={HOME_MESSAGES.nothingTitle}
              description={HOME_MESSAGES.nothingDescription}
            />
          ) : (
            <AttentionList items={home.items} />
          )}
        </section>
        <aside aria-label="Summary" className="flex min-w-0 flex-col gap-6 lg:w-80 lg:shrink-0">
          <PipelineCounts counts={home.counts} />
          <RecentPushes pushes={home.pushes} />
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 14: Run the Home tests and confirm they pass**

```bash
pnpm exec vitest run tests/unit/attention-list.test.tsx tests/integration/home-actions.test.ts tests/integration/home-page.test.ts
```

Expected: `Test Files  3 passed (3)`, `Tests  25 passed (25)` (17 + 5 + 3).

- [ ] **Step 15: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Expected: all three exit 0. At the end of this task the suite reports `Test Files  135 passed | 1 skipped (136)` and `Tests  1510 passed | 2 skipped (1512)`.

- [ ] **Step 16: Commit**

```bash
git add lib/attention/messages.ts components/home app/\(app\)/page.tsx app/\(app\)/actions.ts tests/unit/attention-list.test.tsx tests/integration/home-actions.test.ts tests/integration/home-page.test.ts
git commit -m "$(cat <<'EOF'
feat: add the Home page with attention list, counts, pushes and snooze

EOF
)"
```

End the message with the co-author trailer supplied by the executing session.

---

### Task 7: Settings profile and time zone

**Files:**
- Create: `components/forms/stacked-field.tsx`, `components/settings/profile-section.tsx`, `tests/unit/stacked-field.test.tsx`, `tests/unit/profile-section.test.tsx`, `tests/integration/settings-actions.test.ts`
- Modify: `components/settings/api-tokens-section.tsx`, `app/(app)/settings/page.tsx`, `app/(app)/settings/actions.ts`

**Interfaces:**
- Consumes: `profileFormSchema` and `readProfileForm` (Task 2, `lib/profile/schema.ts`), `loadProfile` and `saveProfile` (Task 2, `lib/profile/store.ts`), `fieldErrorsByPath` and `FormState` (Task 2, `lib/forms/state.ts`), `seedProfile` (Task 2, `tests/helpers/profile.ts`), `canonicalTimeZone` and `listTimeZones` (Task 1, `lib/time/zone.ts`), `timeZoneItems` and `TimeZoneItem` (Task 1, `lib/time/zone-list.ts`), `submitViaTransition` (Milestone 2, `lib/forms/submit.ts`), `useAnnounce`, `Select` with `SelectGroup` and `SelectLabel`, `Input`, `Textarea`, `Button`, `Label`, `messageFor`, `requireUser`, `scopedFor` (Milestones 1 to 4, unmodified).
- Produces (copied from the README's Contract character for character):

```typescript
// app/(app)/settings/actions.ts (added)
export async function saveProfileAction(_prev: FormState, formData: FormData): Promise<FormState>;   // parse readProfileForm with profileFormSchema; invalid -> messageFor("invalid") + fieldErrorsByPath; saveProfile; revalidatePath("/", "layout")
// components/settings/profile-section.tsx ("use client")
export function ProfileSection(props: { profile: { headline: string | null; resumeMd: string | null; timezone: string }; timeZones: TimeZoneItem[] }): React.ReactElement;
// components/forms/stacked-field.tsx
export function StackedField(props: { label: string; hint?: string; error?: string; children: (id: string, describedBy: string | undefined) => React.ReactNode }): React.ReactElement;
```

Rules this task enforces:

- Page structure: `h1 Settings`, then sibling `<section aria-labelledby>` blocks each with an `h2`: `Profile`, `API tokens`, and (Task 8) `Export my data`. This task puts `ProfileSection` first and leaves `ApiTokensSection` second; `ExportSection` joins them in the next task. `ApiTokensSection` gains `aria-labelledby` on its `<section>` and an `id` (from `React.useId()`) on its `h2`; nothing else in it changes.
- `StackedField` renders `<div className="flex flex-col gap-1.5">`, a `Label` bound to the control by `htmlFor`, the control (the render prop receives the generated id and the `aria-describedby` string), then `hint` in `text-muted-foreground text-sm` and `error` in `text-destructive text-sm`. Both are wired into `aria-describedby` (hint first, then error). `FieldRow` puts the label in a fixed 6rem column and wraps long labels such as `Apply or drop after` onto three lines, which is why the Settings and Preferences forms use this instead.
- `ProfileSection`: intro `Your resume is used only to score how well jobs fit. It never leaves through the bridge.`; fields `Headline` (`Input`, name `headline`, hint `A short line about you, for example: Product designer, design systems.`), `Resume` (`Textarea rows={12}`, name `resumeMd`, hint `Markdown. Paste your resume text here.`), `Time zone` (controlled `Select` with `items`, name `timezone`, hint `Dates and times across Jobsmith use this zone.`, grouped with `SelectGroup` and `SelectLabel`, the group labels being the region names `UTC`, `Africa`, `America`...); submit `Save profile`; announcement `Profile saved.`. Field errors come from `state.fieldErrors` under the keys `headline`, `resumeMd`, `timezone`; the failure message shows as `<p role="alert" className="text-sm text-destructive">`; on failure focus goes back to `Save profile` (the button is disabled while the request runs and Chromium drops focus from a disabled button).
- The device-zone button: after mount, `Intl.DateTimeFormat().resolvedOptions().timeZone` is read in an effect (the server cannot know it; the one `eslint-disable-next-line react-hooks/set-state-in-effect` is justified by that, as in `LocalTime`) and passed through `canonicalTimeZone`. When the result is not null and differs from `canonicalTimeZone(selected zone)`, a `Button variant="link"` shows `Use this device's time zone (<zone>)`. Both names are canonicalized in the browser, because the saved value was canonicalized by the server's engine and the two can spell one zone differently (Node says `Asia/Calcutta` and `Europe/Kiev`, browsers say `Asia/Kolkata` and `Europe/Kyiv`); comparing the saved name with the browser's would offer the zone the person already has, forever. Clicking it adds the zone to the items when the list lacks it (`timeZoneItems(values, [zone])`) and selects it; the button then disappears, so focus moves to the time zone picker.
- The form holds a snapshot of the profile props in state (`const [initial] = React.useState(profile)`) and uses it for the `defaultValue`s: a save revalidates the page and hands the component new props, and a changed `defaultValue` on a mounted uncontrolled field makes Base UI warn. The form is wired with `onSubmit={(event) => submitViaTransition(event, formAction)}`, not `action`, so React does not reset the fields after a rejected save.
- `saveProfileAction`: `requireUser`; `profileFormSchema.safeParse(readProfileForm(formData))`; invalid gives `{ ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: fieldErrorsByPath(error) }` and writes nothing; valid calls `saveProfile` and `revalidatePath("/", "layout")` (the zone shows in every page's times and the preferences in every job's hard-filter line), then `{ ok: true }`. `saveProfile` writes only the three profile columns, so saved preferences survive.
- The page reads the profile through `loadProfile(s)` and builds the items with `timeZoneItems(listTimeZones(), [profile.timezone])`. Nothing in the resume or headline is logged.
- Testing the device zone: the component reads `Intl.DateTimeFormat()` with no arguments, while every zone helper passes a `timeZone` option. The test therefore spies on `Intl.DateTimeFormat` and, only for a call without a `timeZone` option, returns an object whose `resolvedOptions()` reports the stub zone; calls that name a zone get the real formatter. A second stub, `stubBrowserNames`, plays a browser that names zones its own way: for a call without a zone it reports the device zone, and for a call with one it wraps the real formatter in a `Proxy` whose `resolvedOptions()` renames `Asia/Calcutta` to `Asia/Kolkata` and `Europe/Kiev` to `Europe/Kyiv`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/stacked-field.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StackedField } from "@/components/forms/stacked-field";

function field(props: { hint?: string; error?: string }) {
  return render(
    <StackedField label="Headline" {...props}>
      {(id, describedBy) => <input id={id} aria-describedby={describedBy} />}
    </StackedField>,
  );
}

describe("StackedField", () => {
  it("puts the label above the control and ties them together", () => {
    field({});
    const control = screen.getByLabelText("Headline");
    expect(control.tagName).toBe("INPUT");
    const label = screen.getByText("Headline");
    expect(label.tagName).toBe("LABEL");
    // Document order: the label comes before the control it names.
    expect(label.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("gives the control no description when there is no hint or error", () => {
    field({});
    expect(screen.getByLabelText("Headline").getAttribute("aria-describedby")).toBeNull();
  });

  it("points the control at the hint", () => {
    field({ hint: "A short line about you." });
    const control = screen.getByLabelText("Headline");
    const hint = screen.getByText("A short line about you.");
    expect(control.getAttribute("aria-describedby")).toBe(hint.id);
    expect(hint.className).toContain("text-muted-foreground");
  });

  it("points the control at the hint and the error, in that order", () => {
    field({ hint: "A short line about you.", error: "Keep the headline under 200 characters." });
    const control = screen.getByLabelText("Headline");
    const hint = screen.getByText("A short line about you.");
    const error = screen.getByText("Keep the headline under 200 characters.");
    expect(control.getAttribute("aria-describedby")).toBe(`${hint.id} ${error.id}`);
    expect(error.className).toContain("text-destructive");
  });
});
```

`tests/integration/settings-actions.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db/client";
import { scoped } from "@/lib/db/scoped";
import { saveProfileAction } from "@/app/(app)/settings/actions";
import { loadProfile } from "@/lib/profile/store";
import { makeTestDb, createTestUser } from "../helpers/db";
import { seedProfile } from "../helpers/profile";

// Same harness as the other action tests: the signed-in user and path
// revalidation need a live Next.js request, so both are stubbed; scopedFor
// points at a real PGlite database through the real scoped().
const harness = vi.hoisted(() => ({ db: undefined as Db | undefined, userId: "" }));
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => ({ id: harness.userId }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/db/scoped", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/scoped")>();
  return { ...actual, scopedFor: (userId: string) => actual.scoped(harness.db!, userId) };
});

afterEach(() => {
  revalidatePathMock.mockClear();
});

function profileForm(values: { headline?: string; resumeMd?: string; timezone?: string }): FormData {
  const formData = new FormData();
  formData.set("headline", values.headline ?? "");
  formData.set("resumeMd", values.resumeMd ?? "");
  formData.set("timezone", values.timezone ?? "UTC");
  return formData;
}

async function setup(email: string) {
  const made = await makeTestDb();
  harness.db = made.db;
  harness.userId = (await createTestUser(made.db, email)).id;
  return { ...made, s: scoped(made.db, harness.userId) };
}

describe("saveProfileAction", () => {
  it("saves the headline, resume and zone, and revalidates every page", async () => {
    const { s, close } = await setup("profile-save@example.com");
    try {
      const state = await saveProfileAction(
        undefined,
        profileForm({ headline: "  Product designer, design systems  ", resumeMd: "# Resume\r\nEight years.", timezone: "Etc/UTC" }),
      );

      expect(state).toEqual({ ok: true });
      const profile = await loadProfile(s);
      expect(profile.headline).toBe("Product designer, design systems");
      expect(profile.resumeMd).toBe("# Resume\nEight years.");
      expect(profile.timezone).toBe("UTC");
      expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
    } finally {
      await close();
    }
  });

  it("stores a canonical zone name for a real zone", async () => {
    const { s, close } = await setup("profile-zone@example.com");
    try {
      expect(await saveProfileAction(undefined, profileForm({ timezone: "Europe/Amsterdam" }))).toEqual({ ok: true });
      expect((await loadProfile(s)).timezone).toBe("Europe/Amsterdam");
    } finally {
      await close();
    }
  });

  it("rejects a name that is not a zone and keeps what was saved", async () => {
    const { s, close } = await setup("profile-bad-zone@example.com");
    try {
      await seedProfile(s, { headline: "Before", timezone: "Asia/Tokyo" });
      const state = await saveProfileAction(undefined, profileForm({ headline: "After", timezone: "Mars/Olympus" }));

      expect(state).toEqual({
        ok: false,
        code: "invalid",
        message: "Check the highlighted fields.",
        fieldErrors: { timezone: "Choose a time zone from the list." },
      });
      const profile = await loadProfile(s);
      expect(profile.headline).toBe("Before");
      expect(profile.timezone).toBe("Asia/Tokyo");
      expect(revalidatePathMock).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("rejects a resume over 50,000 characters and a headline over 200", async () => {
    const { close } = await setup("profile-long@example.com");
    try {
      const state = await saveProfileAction(
        undefined,
        profileForm({ headline: "h".repeat(201), resumeMd: "r".repeat(50_001) }),
      );
      expect(state).toMatchObject({
        ok: false,
        code: "invalid",
        fieldErrors: {
          headline: "Keep the headline under 200 characters.",
          resumeMd: "Keep the resume under 50,000 characters.",
        },
      });
    } finally {
      await close();
    }
  });

  it("stores blank text as null and leaves the preferences alone", async () => {
    const { s, close } = await setup("profile-blank@example.com");
    try {
      await seedProfile(s, { headline: "Before", preferences: { v: 1, titles: ["Product Designer"] } });
      expect(await saveProfileAction(undefined, profileForm({ headline: "   ", resumeMd: "  \n " }))).toEqual({ ok: true });
      const profile = await loadProfile(s);
      expect(profile.headline).toBeNull();
      expect(profile.resumeMd).toBeNull();
      expect(profile.preferences.titles).toEqual(["Product Designer"]);
    } finally {
      await close();
    }
  });
});
```

`tests/unit/profile-section.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { ProfileSection } from "@/components/settings/profile-section";
import { saveProfileAction } from "@/app/(app)/settings/actions";
import { listTimeZones } from "@/lib/time/zone";
import { timeZoneItems } from "@/lib/time/zone-list";

// Same style as the other component tests here: no jest-dom, direct DOM reads.
vi.mock("@/app/(app)/settings/actions", () => ({ saveProfileAction: vi.fn() }));

const mockedSave = vi.mocked(saveProfileAction);

const PROFILE: { headline: string | null; resumeMd: string | null; timezone: string } = { headline: "Product designer, design systems", resumeMd: "# Resume\n\nEight years.", timezone: "UTC" };
const ITEMS = [
  { value: "UTC", label: "UTC", group: "UTC" },
  { value: "Asia/Tokyo", label: "Tokyo", group: "Asia" },
  { value: "America/New_York", label: "New York", group: "America" },
];

function renderSection(profile = PROFILE, timeZones = ITEMS) {
  return render(
    <LiveAnnouncerProvider>
      <ProfileSection profile={profile} timeZones={timeZones} />
    </LiveAnnouncerProvider>,
  );
}

// Only a call with no zone option asks for the device's own zone; every call
// that names a zone (the zone helpers use those) still gets the real thing.
function stubDeviceZone(zone: string) {
  const Real = Intl.DateTimeFormat;
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (
    locales?: string | string[],
    options?: Intl.DateTimeFormatOptions,
  ) {
    if (options?.timeZone !== undefined) return new Real(locales, options);
    return { resolvedOptions: () => ({ timeZone: zone }) } as Intl.DateTimeFormat;
  } as never);
}

// A browser that names zones its own way: it says Asia/Kolkata and Europe/Kyiv
// where Node (which built the list and the saved value) says Asia/Calcutta
// and Europe/Kiev, for the device zone and for any zone it is asked about.
const BROWSER_NAMES: Record<string, string> = { "Asia/Calcutta": "Asia/Kolkata", "Europe/Kiev": "Europe/Kyiv" };
function stubBrowserNames(deviceZone: string) {
  const Real = Intl.DateTimeFormat;
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (
    locales?: string | string[],
    options?: Intl.DateTimeFormatOptions,
  ) {
    if (options?.timeZone === undefined) return { resolvedOptions: () => ({ timeZone: deviceZone }) } as Intl.DateTimeFormat;
    const real = new Real(locales, options);
    return new Proxy(real, {
      get(target, key) {
        if (key === "resolvedOptions") {
          return () => ({ ...target.resolvedOptions(), timeZone: BROWSER_NAMES[options.timeZone!] ?? options.timeZone });
        }
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  } as never);
}

function submittedForm(): FormData {
  const form = screen.getByRole("button", { name: "Save profile" }).closest("form")!;
  return new FormData(form);
}

beforeEach(() => {
  mockedSave.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ProfileSection", () => {
  it("is a section named Profile with the intro, three fields and their hints", () => {
    renderSection();
    const section = screen.getByRole("region", { name: "Profile" });
    expect(within(section).getByRole("heading", { level: 2, name: "Profile" })).not.toBeNull();
    expect(
      within(section).getByText("Your resume is used only to score how well jobs fit. It never leaves through the bridge."),
    ).not.toBeNull();
    expect((screen.getByLabelText("Headline") as HTMLInputElement).value).toBe(PROFILE.headline);
    expect((screen.getByLabelText("Resume") as HTMLTextAreaElement).value).toBe(PROFILE.resumeMd);
    expect(screen.getByText("A short line about you, for example: Product designer, design systems.")).not.toBeNull();
    expect(screen.getByText("Markdown. Paste your resume text here.")).not.toBeNull();
    expect(screen.getByText("Dates and times across Jobsmith use this zone.")).not.toBeNull();
    expect(screen.getByLabelText("Time zone").textContent).toContain("UTC");
    expect(screen.getByRole("button", { name: "Save profile" })).not.toBeNull();
  });

  it("starts blank for a profile with nothing saved", () => {
    renderSection({ headline: null, resumeMd: null, timezone: "UTC" });
    expect((screen.getByLabelText("Headline") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Resume") as HTMLTextAreaElement).value).toBe("");
  });

  it("sends headline, resumeMd and timezone, and announces Profile saved.", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    mockedSave.mockResolvedValue({ ok: true });
    renderSection({ headline: null, resumeMd: null, timezone: "Asia/Tokyo" });
    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "Design lead" } });
    fireEvent.change(screen.getByLabelText("Resume"), { target: { value: "Led a team." } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
      await Promise.resolve();
    });
    // The announcer speaks 50 ms after the result lands.
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    vi.useRealTimers();

    expect(mockedSave).toHaveBeenCalledTimes(1);
    const sent = mockedSave.mock.calls[0]![1];
    expect(sent.get("headline")).toBe("Design lead");
    expect(sent.get("resumeMd")).toBe("Led a team.");
    expect(sent.get("timezone")).toBe("Asia/Tokyo");
    expect(screen.getByRole("status").textContent).toBe("Profile saved.");
  });

  it("shows the field errors under their fields, the alert, and puts focus back on Save profile", async () => {
    mockedSave.mockResolvedValue({
      ok: false,
      code: "invalid",
      message: "Check the highlighted fields.",
      fieldErrors: {
        headline: "Keep the headline under 200 characters.",
        resumeMd: "Keep the resume under 50,000 characters.",
        timezone: "Choose a time zone from the list.",
      },
    });
    renderSection();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
      await Promise.resolve();
    });

    expect(screen.getByRole("alert").textContent).toBe("Check the highlighted fields.");
    for (const [label, message] of [
      ["Headline", "Keep the headline under 200 characters."],
      ["Resume", "Keep the resume under 50,000 characters."],
      ["Time zone", "Choose a time zone from the list."],
    ] as const) {
      const control = screen.getByLabelText(label);
      const error = screen.getByText(message);
      expect(control.getAttribute("aria-describedby")?.split(" ")).toContain(error.id);
    }
    expect(screen.getByLabelText("Headline").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Save profile" }));
    // A rejected save keeps what was typed.
    expect((screen.getByLabelText("Headline") as HTMLInputElement).value).toBe(PROFILE.headline);
  });

  it("offers the device's zone when it differs and selects it, adding it to the list when missing", async () => {
    stubDeviceZone("Europe/Amsterdam");
    renderSection();
    const button = await screen.findByRole("button", { name: "Use this device's time zone (Europe/Amsterdam)" });

    await act(async () => {
      fireEvent.click(button);
    });

    expect(submittedForm().get("timezone")).toBe("Europe/Amsterdam");
    expect(screen.getByLabelText("Time zone").textContent).toContain("Amsterdam");
    expect(screen.queryByRole("button", { name: /Use this device's time zone/ })).toBeNull();
    // The button took focus with it when it went away; the picker gets it.
    expect(document.activeElement).toBe(screen.getByLabelText("Time zone"));
  });

  it("canonicalizes the device's zone name before comparing", async () => {
    stubDeviceZone("Etc/UTC");
    renderSection();
    // Give the mount effect a turn, then check that nothing was offered.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole("button", { name: /Use this device's time zone/ })).toBeNull();
  });

  it.each([
    ["Asia/Calcutta", "Asia/Kolkata"],
    ["Europe/Kiev", "Europe/Kyiv"],
  ])("offers nothing when the browser spells the selected %s as %s", async (saved, device) => {
    stubBrowserNames(device);
    renderSection({ ...PROFILE, timezone: saved });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole("button", { name: /Use this device's time zone/ })).toBeNull();
  });

  it("offers nothing when the device zone is the selected one or not a zone", async () => {
    stubDeviceZone("Asia/Tokyo");
    const { unmount } = renderSection({ ...PROFILE, timezone: "Asia/Tokyo" });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole("button", { name: /Use this device's time zone/ })).toBeNull();
    unmount();

    vi.restoreAllMocks();
    stubDeviceZone("Mars/Olympus");
    renderSection();
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole("button", { name: /Use this device's time zone/ })).toBeNull();
  });

  it("works with the full zone list and groups it by region", async () => {
    const full = timeZoneItems(listTimeZones(), ["UTC"]);
    renderSection(PROFILE, full);
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Time zone"));
    });
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getAllByRole("group").length).toBeGreaterThan(5);
    expect(within(listbox).getByRole("option", { name: "Amsterdam" })).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

```bash
pnpm exec vitest run tests/unit/stacked-field.test.tsx tests/unit/profile-section.test.tsx tests/integration/settings-actions.test.ts
```

Expected: `Test Files  3 failed (3)`. The two component files fail to load (`Failed to resolve import "@/components/forms/stacked-field"` and `"@/components/settings/profile-section"`), and `settings-actions.test.ts` runs 5 tests that all fail with `TypeError: saveProfileAction is not a function`.

- [ ] **Step 3: Write `components/forms/stacked-field.tsx` in full**

```tsx
"use client";

import * as React from "react";

import { Label } from "@/components/ui/label";

interface StackedFieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: (controlId: string, describedBy: string | undefined) => React.ReactNode;
}

/**
 * A label above its control, with a hint and an error below it. `FieldRow`
 * puts the label in a fixed 6rem column beside the control, which wraps long
 * labels such as "Apply or drop after" onto three lines.
 */
export function StackedField({ label, hint, error, children }: StackedFieldProps) {
  const id = React.useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children(id, describedBy)}
      {hint ? (
        <p id={hintId} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Add `saveProfileAction` to `app/(app)/settings/actions.ts`**

```diff
@@ -6,6 +6,9 @@ import { requireUser } from "@/lib/auth/session";
 import { scopedFor } from "@/lib/db/scoped";
 import { createApiToken, revokeApiToken, tokenNameSchema, type TokenFormState } from "@/lib/auth/api-token";
 import { messageFor } from "@/lib/pipeline/messages";
+import { fieldErrorsByPath, type FormState } from "@/lib/forms/state";
+import { profileFormSchema, readProfileForm } from "@/lib/profile/schema";
+import { saveProfile } from "@/lib/profile/store";
 import { fail, type Result } from "@/lib/result";
 
 export async function createTokenAction(_prev: TokenFormState, formData: FormData): Promise<TokenFormState> {
@@ -34,3 +37,16 @@ export async function revokeTokenAction(tokenId: string): Promise<Result<null, s
   revalidatePath("/settings");
   return { ok: true, data: null };
 }
+
+export async function saveProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
+  const user = await requireUser();
+  const parsed = profileFormSchema.safeParse(readProfileForm(formData));
+  if (!parsed.success) {
+    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: fieldErrorsByPath(parsed.error) };
+  }
+  await saveProfile(scopedFor(user.id), parsed.data);
+  // The zone shows in every page's times and the preferences in every job's
+  // hard-filter line, so the whole app re-renders.
+  revalidatePath("/", "layout");
+  return { ok: true };
+}
```

- [ ] **Step 5: Write `components/settings/profile-section.tsx` in full**

```tsx
"use client";

import * as React from "react";

import { saveProfileAction } from "@/app/(app)/settings/actions";
import { StackedField } from "@/components/forms/stacked-field";
import { useAnnounce } from "@/components/live-announcer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/lib/forms/state";
import { submitViaTransition } from "@/lib/forms/submit";
import { canonicalTimeZone } from "@/lib/time/zone";
import { timeZoneItems, type TimeZoneItem } from "@/lib/time/zone-list";

interface ProfileSectionProps {
  profile: { headline: string | null; resumeMd: string | null; timezone: string };
  timeZones: TimeZoneItem[];
}

export function ProfileSection({ profile, timeZones }: ProfileSectionProps) {
  const headingId = React.useId();
  const announce = useAnnounce();
  const [state, formAction, pending] = React.useActionState<FormState, FormData>(saveProfileAction, undefined);
  // A snapshot, not a live read: a save revalidates the page and hands this
  // component new props, and a changed defaultValue on a mounted uncontrolled
  // field makes Base UI warn.
  const [initial] = React.useState(profile);
  const [zone, setZone] = React.useState(profile.timezone);
  const [deviceZone, setDeviceZone] = React.useState<string | null>(null);
  const [addedZone, setAddedZone] = React.useState<string | null>(null);
  const submitRef = React.useRef<HTMLButtonElement>(null);
  const zoneRef = React.useRef<HTMLButtonElement>(null);
  const refocusZone = React.useRef(false);

  React.useEffect(() => {
    // The browser's zone is only known on the client, so it is read after
    // mount (the server render and the first client render show no button).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDeviceZone(canonicalTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone));
  }, []);

  React.useEffect(() => {
    if (state?.ok) {
      announce("Profile saved.");
    } else if (state?.ok === false) {
      // The Save button is disabled while the request runs, and Chromium
      // drops focus from a disabled button; this form stays mounted on a
      // failure, so focus goes back to it.
      submitRef.current?.focus();
    }
  }, [state, announce]);

  React.useEffect(() => {
    // Choosing the device zone removes the button that was just pressed, so
    // focus moves to the picker that now shows the choice.
    if (refocusZone.current) {
      refocusZone.current = false;
      zoneRef.current?.focus();
    }
  }, [zone]);

  const items = React.useMemo(
    () =>
      addedZone && !timeZones.some((item) => item.value === addedZone)
        ? timeZoneItems(
            timeZones.map((item) => item.value),
            [addedZone],
          )
        : timeZones,
    [timeZones, addedZone],
  );
  const groups = React.useMemo(() => {
    const byGroup = new Map<string, TimeZoneItem[]>();
    for (const item of items) byGroup.set(item.group, [...(byGroup.get(item.group) ?? []), item]);
    return [...byGroup];
  }, [items]);

  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined;
  // The saved zone is named by the server's engine and the device zone by this
  // browser's. Two engines can spell one zone differently, so both go through
  // this browser's canonicalTimeZone before they are compared.
  const offerDeviceZone = deviceZone !== null && deviceZone !== canonicalTimeZone(zone);

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 id={headingId} className="text-base font-semibold text-foreground">
          Profile
        </h2>
        <p className="text-sm text-muted-foreground">
          Your resume is used only to score how well jobs fit. It never leaves through the bridge.
        </p>
      </div>

      <form onSubmit={(event) => submitViaTransition(event, formAction)} className="flex max-w-2xl flex-col gap-4">
        {state?.ok === false ? (
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        ) : null}

        <StackedField
          label="Headline"
          hint="A short line about you, for example: Product designer, design systems."
          error={fieldErrors?.headline}
        >
          {(id, describedBy) => (
            <Input
              id={id}
              name="headline"
              defaultValue={initial.headline ?? ""}
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.headline)}
            />
          )}
        </StackedField>

        <StackedField label="Resume" hint="Markdown. Paste your resume text here." error={fieldErrors?.resumeMd}>
          {(id, describedBy) => (
            <Textarea
              id={id}
              name="resumeMd"
              rows={12}
              className="min-h-64"
              defaultValue={initial.resumeMd ?? ""}
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.resumeMd)}
            />
          )}
        </StackedField>

        <StackedField
          label="Time zone"
          hint="Dates and times across Jobsmith use this zone."
          error={fieldErrors?.timezone}
        >
          {(id, describedBy) => (
            <Select
              id={id}
              name="timezone"
              value={zone}
              onValueChange={(next) => {
                if (next) setZone(next);
              }}
              items={items}
            >
              <SelectTrigger
                ref={zoneRef}
                className="w-full"
                aria-describedby={describedBy}
                aria-invalid={Boolean(fieldErrors?.timezone)}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {groups.map(([group, entries]) => (
                  <SelectGroup key={group}>
                    <SelectLabel>{group}</SelectLabel>
                    {entries.map((entry) => (
                      <SelectItem key={entry.value} value={entry.value}>
                        {entry.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          )}
        </StackedField>

        {offerDeviceZone ? (
          <Button
            type="button"
            variant="link"
            className="self-start px-0"
            onClick={() => {
              refocusZone.current = true;
              setAddedZone(deviceZone);
              setZone(deviceZone);
            }}
          >
            Use this device&apos;s time zone ({deviceZone})
          </Button>
        ) : null}

        <Button ref={submitRef} type="submit" disabled={pending} className="self-start">
          Save profile
        </Button>
      </form>
    </section>
  );
}
```

- [ ] **Step 6: Label the API tokens section and put the profile on the page**

`components/settings/api-tokens-section.tsx`:

```diff
@@ -20,11 +20,14 @@ import type { ApiTokenListItem } from "@/lib/db/scoped";
 
 export function ApiTokensSection({ tokens }: { tokens: ApiTokenListItem[] }) {
   const [createOpen, setCreateOpen] = React.useState(false);
+  const headingId = React.useId();
 
   return (
-    <section className="flex flex-col gap-4">
+    <section aria-labelledby={headingId} className="flex flex-col gap-4">
       <div className="flex flex-col gap-2">
-        <h2 className="text-base font-semibold text-foreground">API tokens</h2>
+        <h2 id={headingId} className="text-base font-semibold text-foreground">
+          API tokens
+        </h2>
         <p className="text-sm text-muted-foreground">
           Tokens let the jobsmith command line read your jobs and push documents to them.
         </p>
```

`app/(app)/settings/page.tsx` (replace the whole file):

```tsx
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { listApiTokens } from "@/lib/auth/api-token";
import { loadProfile } from "@/lib/profile/store";
import { listTimeZones } from "@/lib/time/zone";
import { timeZoneItems } from "@/lib/time/zone-list";
import { ApiTokensSection } from "@/components/settings/api-tokens-section";
import { ProfileSection } from "@/components/settings/profile-section";

export default async function SettingsPage() {
  const user = await requireUser();
  const s = scopedFor(user.id);
  const [tokens, profile] = await Promise.all([listApiTokens(s), loadProfile(s)]);

  return (
    <div className="flex flex-col gap-8 p-6">
      <h1 className="text-lg font-semibold">Settings</h1>
      <ProfileSection
        profile={{ headline: profile.headline, resumeMd: profile.resumeMd, timezone: profile.timezone }}
        timeZones={timeZoneItems(listTimeZones(), [profile.timezone])}
      />
      <ApiTokensSection tokens={tokens} />
    </div>
  );
}
```

- [ ] **Step 7: Run the three files and confirm they pass**

```bash
pnpm exec vitest run tests/unit/stacked-field.test.tsx tests/unit/profile-section.test.tsx tests/integration/settings-actions.test.ts
```

Expected: `Test Files  3 passed (3)`, `Tests  19 passed (19)` (4 + 10 + 5).

- [ ] **Step 8: Mutation checks**

(a) In `components/settings/profile-section.tsx`, change the effect to `setDeviceZone(Intl.DateTimeFormat().resolvedOptions().timeZone);` (drop `canonicalTimeZone`). Run `pnpm exec vitest run tests/unit/profile-section.test.tsx`: `canonicalizes the device's zone name before comparing` and `offers nothing when the device zone is the selected one or not a zone` fail; 8 pass. Revert.

(a2) In the same file, change `const offerDeviceZone = deviceZone !== null && deviceZone !== canonicalTimeZone(zone);` to `... && deviceZone !== zone;`. Run the same file: the two `offers nothing when the browser spells the selected ... as ...` cases (`Asia/Calcutta` as `Asia/Kolkata`, `Europe/Kiev` as `Europe/Kyiv`) fail; 8 pass. Revert.

(b) In `saveProfileAction`, delete the `revalidatePath("/", "layout");` line. Run `pnpm exec vitest run tests/integration/settings-actions.test.ts`: `saves the headline, resume and zone, and revalidates every page` fails; 4 pass. Revert and rerun both files to confirm 15 pass.

- [ ] **Step 9: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Expected: all three exit 0. At the end of this task the suite reports `Test Files  138 passed | 1 skipped (139)` and `Tests  1529 passed | 2 skipped (1531)`.

- [ ] **Step 10: Commit**

```bash
git add components/forms/stacked-field.tsx components/settings/profile-section.tsx components/settings/api-tokens-section.tsx app/\(app\)/settings/page.tsx app/\(app\)/settings/actions.ts tests/unit/stacked-field.test.tsx tests/unit/profile-section.test.tsx tests/integration/settings-actions.test.ts
git commit -m "$(cat <<'EOF'
feat: add the Settings profile section with a time zone picker

EOF
)"
```

End the message with the co-author trailer supplied by the executing session.

---

### Task 8: Export my data

**Files:**
- Create: `lib/db/scoped/data-export.ts`, `lib/export/build.ts`, `app/(app)/settings/export/route.ts`, `components/settings/export-section.tsx`, `tests/integration/data-export.test.ts`, `tests/integration/export-route.test.ts`, `tests/unit/export-section.test.tsx`, `tests/e2e/settings.spec.ts`
- Modify: `lib/db/scoped/index.ts`, `app/(app)/settings/page.tsx`, `tests/integration/scoped-isolation.test.ts`, `tests/e2e/account.ts`, `playwright.config.ts`

**Interfaces:**
- Consumes: the `Scoped` shape and `scoped()` (Milestones 1 to 4, `lib/db/scoped/index.ts`), `s.profile.get()` (Milestone 1), `loadProfile` (Task 2), `zonedDateKey` (Task 1, `lib/time/zone.ts`), `seedProfile` (Task 2, `tests/helpers/profile.ts`), `seedOneOfEach` and `createTestUser` (`tests/helpers/db.ts`), the `run(a, b, ids, db)` shape of the isolation cases (Task 5), `getUser` (`lib/auth/session.ts`), `buttonVariants` (Milestones 1 to 4), `login`, `addJobAndOpen`, `uniqueName`, `scanForViolations` (the existing e2e helpers). `ProfileSection` and the Settings page (Task 7).
- Produces (copied from the README's Contract character for character):

```typescript
// lib/db/scoped/data-export.ts (columns exactly as the list below keeps them; each ordered by createdAt then id)
export function dataExportQueries(db: Db, userId: string): {
  user(): Promise<{ id: string; name: string; email: string; createdAt: Date } | null>;
  companies(): Promise<ExportCompany[]>; opportunities(): Promise<ExportOpportunity[]>; stages(): Promise<ExportStage[]>;
  people(): Promise<ExportPerson[]>; opportunityPeople(): Promise<ExportOpportunityPerson[]>; events(): Promise<ExportEvent[]>;
  artifacts(): Promise<ExportArtifact[]>; apiTokens(): Promise<{ id: string; name: string; prefix: string; lastUsedAt: Date | null; revokedAt: Date | null; createdAt: Date }[]>;
};
// lib/export/build.ts
export const EXPORT_FORMAT = "jobsmith-export/v1";
export type ExportDocument = { format: typeof EXPORT_FORMAT; exportedAt: string; user: { id: string; name: string; email: string; createdAt: Date } | null; profile: { headline: string | null; resumeMd: string | null; timezone: string; preferences: unknown; createdAt: Date; updatedAt: Date } | null; companies: ExportCompany[]; opportunities: ExportOpportunity[]; stages: ExportStage[]; people: ExportPerson[]; opportunityPeople: ExportOpportunityPerson[]; events: ExportEvent[]; artifacts: ExportArtifact[]; apiTokens: ExportApiToken[] };   // profile.preferences is the stored jsonb as is
export async function buildExport(s: Scoped, now: Date): Promise<ExportDocument>;
export function exportFileName(now: Date, timeZone: string): string;   // "jobsmith-export-2026-10-11.json"
// app/(app)/settings/export/route.ts
export async function GET(): Promise<Response>;
// components/settings/export-section.tsx (server)
export function ExportSection(): React.ReactElement;   // h2, text, <a href="/settings/export" download className={buttonVariants({ variant: "outline" })}>
```

`Scoped` gains `dataExport: ReturnType<typeof dataExportQueries>`. The `Export*` row types (`ExportCompany`, `ExportOpportunity`, `ExportStage`, `ExportPerson`, `ExportOpportunityPerson`, `ExportEvent`, `ExportArtifact`, `ExportApiToken`) are exported from `lib/db/scoped/data-export.ts` and derived from the selections.

Rules this task enforces:

- Kept columns, table by table: companies `id, name, domain, careersUrl, atsKind, atsOrg, size, industry, hq, notesMd, tracked, createdAt, updatedAt`; opportunities `id, companyId, slug, roleTitle, location, workMode, source, sourceUrl, postingMd, postingCapturedAt, compMin, compMax, compCurrency, compNote, myAsk, fitScore, fit, fitStatus, needsReview, currentStageId, status, closedReason, closedAt, closedStageId, nextAction, nextActionAt, createdAt, updatedAt`; stages `id, opportunityId, kind, label, position, status, scheduledAt, format, enteredAt, completedAt, outcomeMd, createdAt, updatedAt`; people `id, companyId, name, title, linkedinUrl, email, notesMd, createdAt, updatedAt`; opportunityPeople `id, opportunityId, personId, role, stageId, createdAt, updatedAt`; events `id, opportunityId, stageId, kind, body, meta, occurredAt, createdAt`; artifacts `id, opportunityId, companyId, stageId, key, version, kind, title, bodyMd, origin, editedAt, sentAt, createdAt, updatedAt`; apiTokens `id, name, prefix, lastUsedAt, revokedAt, createdAt`; user `id, name, email, createdAt`.
- Left out on purpose: the tables `session`, `account`, `verification`, `rate_limit`; `user.emailVerified`, `image`, `updatedAt`; every `user_id`; `api_token.token_hash`, `rate_window_start`, `rate_count`; derived values `company.name_key`, `opportunity.dedupe_hash`, `artifact.content_hash` and `source_hash`. Included: every artifact version, person emails and LinkedIn links (the user's own records) and the resume.
- **`select()` without a column list is forbidden in `lib/db/scoped/data-export.ts`** (and on `api_token` anywhere): a column added to a table later, or a secret, must never reach the file by default. Every select names its columns from a constant object, and the test below compares each row's key list with the list above.
- Every query filters by the caller's `user_id` (the `user` query by `user.id`) and orders by `createdAt` then `id`.
- `buildExport` reads one table after another (not `Promise.all`): this is a one-off download, and when one read fails no other query is left running behind it. It puts `exportedAt: now.toISOString()` in the envelope and the profile row's stored `preferences` as it is; a user without a profile row gets `profile: null`.
- `exportFileName(now, timeZone)` is `jobsmith-export-<zonedDateKey(now, timeZone)>.json`, so the date is the day in the profile zone, not UTC.
- The route (`GET /settings/export`): `getUser()`; no user gives `Response.json({ error: "unauthorized" }, { status: 401 })` (the proxy already redirects a request with no session cookie to `/login`, so this covers a cookie that no longer names a session). Otherwise `buildExport(scopedFor(user.id), new Date())`, `loadProfile` for the zone, and a `200` with `content-type: application/json; charset=utf-8`, `content-disposition: attachment; filename="<exportFileName>"`, `cache-control: no-store` and the body `JSON.stringify(doc, null, 2)`. It logs one line, `console.info("[export]", JSON.stringify({ requestId, ms }))`, and never a body. An error goes to `logExportError(requestId, error)` (constructor name, and for a Drizzle error the Postgres `code` and `constraint`, never the message: Drizzle's message carries the SQL and every bound parameter, which here is the resume) and the response is `500` `{ "error": "server_error" }`.
- `ExportSection` (server component): `<section aria-labelledby="settings-export">`, `h2 Export my data`, the text `Download everything you saved in Jobsmith as one JSON file. Passwords, sign-in sessions and token secrets are left out.`, and a plain `<a href="/settings/export" download>` styled with `buttonVariants({ variant: "outline" })` reading `Download JSON` (not `next/link`: the response is a file). The page order is `ProfileSection`, `ApiTokensSection`, `ExportSection`.
- Tenant isolation (nine new cases in `tests/integration/scoped-isolation.test.ts`): `dataExport.user returns only B's own user`, and `dataExport.companies`, `.opportunities`, `.stages`, `.people`, `.opportunityPeople`, `.events`, `.artifacts`, `.apiTokens` each `hides A's rows from B`.
- End to end: all three browser projects share one account at the same time. `tests/e2e/account.ts` gains `E2E_HEADLINE` and `E2E_RESUME`; every spec that submits the profile form fills **both**, because a blank headline from one spec would wipe the headline another spec reads back. The specs never change the account's time zone (it stays `UTC`) and make no assertion about other specs' jobs: they find their own job by a `uniqueName`. `settings.spec.ts` runs in chromium and webkit.

- [ ] **Step 1: Write the failing tests**

`tests/integration/data-export.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { scoped } from "@/lib/db/scoped";
import { EXPORT_FORMAT, buildExport, exportFileName } from "@/lib/export/build";
import { makeTestDb, createTestUser, seedOneOfEach } from "../helpers/db";
import { seedProfile } from "../helpers/profile";

const NOW = new Date("2026-10-11T20:30:00.000Z");

// The columns the export keeps, table by table. A column that is not on this
// list is not exported, so a new column (or a secret) never leaks by default.
const KEPT = {
  companies: ["atsKind", "atsOrg", "careersUrl", "createdAt", "domain", "hq", "id", "industry", "name", "notesMd", "size", "tracked", "updatedAt"],
  opportunities: [
    "closedAt", "closedReason", "closedStageId", "companyId", "compCurrency", "compMax", "compMin", "compNote", "createdAt",
    "currentStageId", "fit", "fitScore", "fitStatus", "id", "location", "myAsk", "needsReview", "nextAction", "nextActionAt",
    "postingCapturedAt", "postingMd", "roleTitle", "slug", "source", "sourceUrl", "status", "updatedAt", "workMode",
  ],
  stages: ["completedAt", "createdAt", "enteredAt", "format", "id", "kind", "label", "opportunityId", "outcomeMd", "position", "scheduledAt", "status", "updatedAt"],
  people: ["companyId", "createdAt", "email", "id", "linkedinUrl", "name", "notesMd", "title", "updatedAt"],
  opportunityPeople: ["createdAt", "id", "opportunityId", "personId", "role", "stageId", "updatedAt"],
  events: ["body", "createdAt", "id", "kind", "meta", "occurredAt", "opportunityId", "stageId"],
  artifacts: [
    "bodyMd", "companyId", "createdAt", "editedAt", "id", "key", "kind", "opportunityId", "origin", "sentAt", "stageId", "title", "updatedAt", "version",
  ],
  apiTokens: ["createdAt", "id", "lastUsedAt", "name", "prefix", "revokedAt"],
} as const;

async function seededExport() {
  const made = await makeTestDb();
  const user = await createTestUser(made.db, "export-owner@example.com");
  const s = scoped(made.db, user.id);
  await seedProfile(s, {
    headline: "Product designer",
    timezone: "Asia/Tokyo",
    preferences: { v: 1, titles: ["Product Designer"], compFloor: 100 },
  });
  const ids = await seedOneOfEach(s);
  await s.opportunity.update(ids.opportunityId, {
    dedupeHash: "DEDUPE-MARK",
    fitScore: 81,
    fitStatus: "done",
    fit: { v: 1, score: 81, summary: "A test summary.", pros: [], cons: [], modelId: "fake-extractor", scoredAt: NOW.toISOString() },
    postingMd: "About the job",
  });
  await s.artifact.insert({
    opportunityId: ids.opportunityId,
    companyId: null,
    stageId: null,
    key: "cv",
    version: 2,
    kind: "cv",
    title: "CV",
    bodyMd: "# CV, second version",
    contentHash: "CONTENT-MARK",
    sourceHash: "SOURCE-MARK",
    origin: "pushed",
  });
  await s.apiToken.insert({ name: "Desktop", tokenHash: "NEVER-EXPORT-TOKEN-HASH", prefix: "jsm_BBBB" });
  return { ...made, user, s, ids };
}

describe("buildExport", () => {
  it("wraps every table the user owns in one envelope", async () => {
    const { close, s, user, ids } = await seededExport();
    try {
      const doc = await buildExport(s, NOW);

      expect(doc.format).toBe(EXPORT_FORMAT);
      expect(EXPORT_FORMAT).toBe("jobsmith-export/v1");
      expect(doc.exportedAt).toBe("2026-10-11T20:30:00.000Z");
      expect(doc.user).toMatchObject({ id: user.id, name: "export-owner@example.com", email: "export-owner@example.com" });
      expect(doc.profile).toMatchObject({
        headline: "Product designer",
        timezone: "Asia/Tokyo",
        preferences: { v: 1, titles: ["Product Designer"], compFloor: 100 },
      });
      expect(doc.profile?.resumeMd).toContain("Northwind Traders");
      expect(doc.companies.map((row) => row.id)).toEqual([ids.companyId]);
      expect(doc.opportunities.map((row) => row.id)).toEqual([ids.opportunityId]);
      expect(doc.stages.map((row) => row.id)).toEqual([ids.stageId]);
      expect(doc.people.map((row) => row.id)).toEqual([ids.personId]);
      expect(doc.opportunityPeople.map((row) => row.id)).toEqual([ids.linkId]);
      expect(doc.events.map((row) => row.id)).toEqual([ids.eventId]);
      // Every version of a document is exported, not only the latest.
      expect(doc.artifacts.map((row) => row.version).sort()).toEqual([1, 2]);
      expect(doc.apiTokens.map((row) => row.name).sort()).toEqual(["Desktop", "Laptop"]);
      expect(doc.opportunities[0]).toMatchObject({ fitScore: 81, fitStatus: "done", postingMd: "About the job" });
      expect(doc.opportunities[0]?.fit).toMatchObject({ v: 1, score: 81 });
    } finally {
      await close();
    }
  });

  it("has a null profile for a user who never saved one", async () => {
    const made = await makeTestDb();
    try {
      const user = await createTestUser(made.db, "export-empty@example.com");
      const doc = await buildExport(scoped(made.db, user.id), NOW);
      expect(doc.profile).toBeNull();
      expect(doc.user?.id).toBe(user.id);
      expect(doc.companies).toEqual([]);
      expect(doc.artifacts).toEqual([]);
      expect(doc.apiTokens).toEqual([]);
    } finally {
      await made.close();
    }
  });

  it("keeps exactly the listed columns of each table and no others", async () => {
    const { close, s } = await seededExport();
    try {
      const doc = await buildExport(s, NOW);
      for (const table of Object.keys(KEPT) as (keyof typeof KEPT)[]) {
        const rows = doc[table];
        expect(rows.length, table).toBeGreaterThan(0);
        for (const row of rows) {
          expect(Object.keys(row).sort(), table).toEqual([...KEPT[table]].sort());
        }
      }
      expect(Object.keys(doc.user ?? {}).sort()).toEqual(["createdAt", "email", "id", "name"]);
      expect(Object.keys(doc.profile ?? {}).sort()).toEqual(["createdAt", "headline", "preferences", "resumeMd", "timezone", "updatedAt"]);
    } finally {
      await close();
    }
  });

  it("leaves out secrets, hashes and user ids from the JSON text", async () => {
    const { close, s } = await seededExport();
    try {
      const text = JSON.stringify(await buildExport(s, NOW));
      for (const forbidden of [
        "tokenHash",
        "NEVER-EXPORT-TOKEN-HASH",
        "seed-hash",
        "dedupeHash",
        "DEDUPE-MARK",
        "contentHash",
        "CONTENT-MARK",
        "sourceHash",
        "SOURCE-MARK",
        "nameKey",
        "rateCount",
        "rateWindowStart",
        "emailVerified",
        "userId",
        "password",
      ]) {
        expect(text, forbidden).not.toContain(forbidden);
      }
    } finally {
      await close();
    }
  });

  it("orders each table by created time, then id", async () => {
    const { close, s, db } = await seededExport();
    try {
      const second = await s.company.insert({ name: "Northwind Traders", nameKey: "northwindtraders" });
      const third = await s.company.insert({ name: "Lumen Health", nameKey: "lumenhealth" });
      const first = (await s.company.list()).find((row) => row.name === "Acme Robotics")!;
      // Created order: Northwind first, then Acme and Lumen at the same instant.
      await db.update(schema.company).set({ createdAt: new Date("2026-01-01T00:00:00.000Z") }).where(eq(schema.company.id, second.id));
      const tie = new Date("2026-02-01T00:00:00.000Z");
      await db.update(schema.company).set({ createdAt: tie }).where(eq(schema.company.id, first.id));
      await db.update(schema.company).set({ createdAt: tie }).where(eq(schema.company.id, third.id));

      const doc = await buildExport(s, NOW);

      const tied = [first.id, third.id].sort();
      expect(doc.companies.map((row) => row.id)).toEqual([second.id, ...tied]);
    } finally {
      await close();
    }
  });
});

describe("exportFileName", () => {
  it("dates the file in the profile zone, not UTC", () => {
    // 05:30 on 12 October in Tokyo is still 11 October in UTC and in New York.
    const instant = new Date("2026-10-11T20:30:00.000Z");
    expect(exportFileName(instant, "Asia/Tokyo")).toBe("jobsmith-export-2026-10-12.json");
    expect(exportFileName(instant, "UTC")).toBe("jobsmith-export-2026-10-11.json");
    expect(exportFileName(instant, "America/New_York")).toBe("jobsmith-export-2026-10-11.json");
  });
});
```

`tests/integration/export-route.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { DrizzleQueryError } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { scoped } from "@/lib/db/scoped";
import { logExportError } from "@/lib/export/build";
import { GET } from "@/app/(app)/settings/export/route";
import { makeTestDb, createTestUser, seedOneOfEach } from "../helpers/db";
import { seedProfile } from "../helpers/profile";

// The route reads the session and scopes its queries by the signed-in user;
// both are stubbed, and scopedFor points at a real PGlite database through the
// real scoped(). `broken` makes the first query throw, to reach the error path.
const harness = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  user: null as { id: string } | null,
  broken: false,
}));

vi.mock("@/lib/auth/session", () => ({
  getUser: async () => harness.user,
}));

vi.mock("@/lib/db/scoped", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/scoped")>();
  return {
    ...actual,
    scopedFor: (userId: string) => {
      const real = actual.scoped(harness.db!, userId);
      if (!harness.broken) return real;
      return {
        ...real,
        dataExport: {
          ...real.dataExport,
          user: async () => {
            throw new Error("SECRET-QUERY-TEXT");
          },
        },
      };
    },
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  harness.broken = false;
  harness.user = null;
});

describe("GET /settings/export", () => {
  it("answers 401 with a JSON error when nobody is signed in", async () => {
    const response = await GET();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("downloads the user's data as a pretty JSON attachment named for the profile-zone date", async () => {
    const { db, close } = await makeTestDb();
    try {
      harness.db = db;
      const user = await createTestUser(db, "route-owner@example.com");
      harness.user = { id: user.id };
      const s = scoped(db, user.id);
      await seedProfile(s, { headline: "SECRET-HEADLINE", timezone: "Asia/Tokyo" });
      const ids = await seedOneOfEach(s);
      // 05:30 on 12 October in Tokyo, still 11 October in UTC.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-11T20:30:00.000Z"));
      const info = vi.spyOn(console, "info").mockImplementation(() => {});

      const response = await GET();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
      expect(response.headers.get("content-disposition")).toBe('attachment; filename="jobsmith-export-2026-10-12.json"');
      expect(response.headers.get("cache-control")).toBe("no-store");
      const text = await response.text();
      expect(text).toContain('\n  "format": "jobsmith-export/v1"');
      const body = JSON.parse(text);
      expect(body.format).toBe("jobsmith-export/v1");
      expect(body.exportedAt).toBe("2026-10-11T20:30:00.000Z");
      expect(body.profile.headline).toBe("SECRET-HEADLINE");
      expect(body.opportunities.map((row: { id: string }) => row.id)).toEqual([ids.opportunityId]);

      // One counts-and-timing line, never a body.
      expect(info).toHaveBeenCalledTimes(1);
      const [tag, line] = info.mock.calls[0] as [string, string];
      expect(tag).toBe("[export]");
      expect(Object.keys(JSON.parse(line)).sort()).toEqual(["ms", "requestId"]);
      expect(JSON.stringify(info.mock.calls)).not.toContain("SECRET");
    } finally {
      await close();
    }
  });

  it("answers 500 with a fixed error and logs the error name only", async () => {
    const { db, close } = await makeTestDb();
    try {
      harness.db = db;
      harness.user = { id: (await createTestUser(db, "route-broken@example.com")).id };
      harness.broken = true;
      const error = vi.spyOn(console, "error").mockImplementation(() => {});

      const response = await GET();

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "server_error" });
      expect(error).toHaveBeenCalledTimes(1);
      const [tag, line] = error.mock.calls[0] as [string, string];
      expect(tag).toBe("[export]");
      expect(JSON.parse(line)).toMatchObject({ error: "Error" });
      expect(JSON.stringify(error.mock.calls)).not.toContain("SECRET");
    } finally {
      await close();
    }
  });
});

describe("logExportError", () => {
  it("logs a Drizzle error by name, Postgres code and constraint, never the SQL or its parameters", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = Object.assign(new Error("SECRET-ROW"), { code: "57014", constraint: undefined });
    logExportError("req-1", new DrizzleQueryError('select "resume_md" -- SECRET-ROW', ["SECRET-ROW"], cause));
    const [tag, line] = error.mock.calls[0] as [string, string];
    expect(tag).toBe("[export]");
    expect(JSON.parse(line)).toEqual({ requestId: "req-1", error: "DrizzleQueryError", code: "57014" });
    expect(JSON.stringify(error.mock.calls)).not.toContain("SECRET");
  });

  it("logs a thrown non-error as UnknownError", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logExportError("req-2", "SECRET-ROW");
    const [, line] = error.mock.calls[0] as [string, string];
    expect(JSON.parse(line)).toEqual({ requestId: "req-2", error: "UnknownError" });
  });
});
```

`tests/unit/export-section.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ExportSection } from "@/components/settings/export-section";

describe("ExportSection", () => {
  it("is a section named Export my data with the copy and a download link", () => {
    render(<ExportSection />);
    const section = screen.getByRole("region", { name: "Export my data" });
    expect(within(section).getByRole("heading", { level: 2, name: "Export my data" })).not.toBeNull();
    expect(
      within(section).getByText(
        "Download everything you saved in Jobsmith as one JSON file. Passwords, sign-in sessions and token secrets are left out.",
      ),
    ).not.toBeNull();
    const link = within(section).getByRole("link", { name: "Download JSON" });
    expect(link.getAttribute("href")).toBe("/settings/export");
    // Present and empty: the server's file name (dated in the profile zone) wins.
    expect(link.getAttribute("download")).toBe("");
  });
});
```

- [ ] **Step 2: Add the nine isolation cases to `tests/integration/scoped-isolation.test.ts`**

Append these entries to the end of the `cases` array (after the `event.listRecentPushes` case, before the closing `];`):

```diff
@@ -480,6 +480,69 @@ const cases: Case[] = [
       expect(pushes[0]).toMatchObject({ roleTitle: "Product Designer", companyName: "Acme Robotics" });
     },
   },
+  {
+    name: "dataExport.user returns only B's own user",
+    run: async (a, b) => {
+      expect((await b.dataExport.user())?.id).toBe(b.userId);
+      expect((await a.dataExport.user())?.id).toBe(a.userId);
+    },
+  },
+  {
+    name: "dataExport.companies hides A's rows from B",
+    run: async (a, b) => {
+      expect(await b.dataExport.companies()).toEqual([]);
+      expect((await a.dataExport.companies()).length).toBeGreaterThan(0);
+    },
+  },
+  {
+    name: "dataExport.opportunities hides A's rows from B",
+    run: async (a, b) => {
+      expect(await b.dataExport.opportunities()).toEqual([]);
+      expect((await a.dataExport.opportunities()).length).toBeGreaterThan(0);
+    },
+  },
+  {
+    name: "dataExport.stages hides A's rows from B",
+    run: async (a, b) => {
+      expect(await b.dataExport.stages()).toEqual([]);
+      expect((await a.dataExport.stages()).length).toBeGreaterThan(0);
+    },
+  },
+  {
+    name: "dataExport.people hides A's rows from B",
+    run: async (a, b) => {
+      expect(await b.dataExport.people()).toEqual([]);
+      expect((await a.dataExport.people()).length).toBeGreaterThan(0);
+    },
+  },
+  {
+    name: "dataExport.opportunityPeople hides A's rows from B",
+    run: async (a, b) => {
+      expect(await b.dataExport.opportunityPeople()).toEqual([]);
+      expect((await a.dataExport.opportunityPeople()).length).toBeGreaterThan(0);
+    },
+  },
+  {
+    name: "dataExport.events hides A's rows from B",
+    run: async (a, b) => {
+      expect(await b.dataExport.events()).toEqual([]);
+      expect((await a.dataExport.events()).length).toBeGreaterThan(0);
+    },
+  },
+  {
+    name: "dataExport.artifacts hides A's rows from B",
+    run: async (a, b) => {
+      expect(await b.dataExport.artifacts()).toEqual([]);
+      expect((await a.dataExport.artifacts()).length).toBeGreaterThan(0);
+    },
+  },
+  {
+    name: "dataExport.apiTokens hides A's rows from B",
+    run: async (a, b) => {
+      expect(await b.dataExport.apiTokens()).toEqual([]);
+      expect((await a.dataExport.apiTokens()).length).toBeGreaterThan(0);
+    },
+  },
 ];
 
 describe("scoped tenant isolation", () => {
```

- [ ] **Step 3: Run the tests and confirm they fail**

```bash
pnpm exec vitest run tests/integration/data-export.test.ts tests/integration/export-route.test.ts tests/unit/export-section.test.tsx tests/integration/scoped-isolation.test.ts
```

Expected: `data-export.test.ts` and `export-route.test.ts` fail to load (`Cannot find package '@/lib/export/build'`), `export-section.test.tsx` fails to load (`Failed to resolve import "@/components/settings/export-section"`), and in `scoped-isolation.test.ts` 9 cases fail with `TypeError: Cannot read properties of undefined (reading 'companies')` (and the same for `apiTokens`, `artifacts`, `events`, and so on), 43 pass.

- [ ] **Step 4: Write `lib/db/scoped/data-export.ts` and expose it on `Scoped`**

`lib/db/scoped/data-export.ts`:

```typescript
import { asc, eq } from "drizzle-orm";
import * as schema from "../schema";
import type { Db } from "../client";

// The reads behind "Export my data". Every select names its columns, and the
// list is the export: nothing is ever read with `select()` and no column list
// here, so a column added to a table later (or a secret such as the API token
// hash) never reaches the file until someone adds it on purpose. Excluded on
// purpose: every user_id, derived values (name_key, dedupe_hash, content_hash,
// source_hash) and the token hash with its rate-limit counters.
const userColumns = {
  id: schema.user.id,
  name: schema.user.name,
  email: schema.user.email,
  createdAt: schema.user.createdAt,
};

const companyColumns = {
  id: schema.company.id,
  name: schema.company.name,
  domain: schema.company.domain,
  careersUrl: schema.company.careersUrl,
  atsKind: schema.company.atsKind,
  atsOrg: schema.company.atsOrg,
  size: schema.company.size,
  industry: schema.company.industry,
  hq: schema.company.hq,
  notesMd: schema.company.notesMd,
  tracked: schema.company.tracked,
  createdAt: schema.company.createdAt,
  updatedAt: schema.company.updatedAt,
};

const opportunityColumns = {
  id: schema.opportunity.id,
  companyId: schema.opportunity.companyId,
  slug: schema.opportunity.slug,
  roleTitle: schema.opportunity.roleTitle,
  location: schema.opportunity.location,
  workMode: schema.opportunity.workMode,
  source: schema.opportunity.source,
  sourceUrl: schema.opportunity.sourceUrl,
  postingMd: schema.opportunity.postingMd,
  postingCapturedAt: schema.opportunity.postingCapturedAt,
  compMin: schema.opportunity.compMin,
  compMax: schema.opportunity.compMax,
  compCurrency: schema.opportunity.compCurrency,
  compNote: schema.opportunity.compNote,
  myAsk: schema.opportunity.myAsk,
  fitScore: schema.opportunity.fitScore,
  fit: schema.opportunity.fit,
  fitStatus: schema.opportunity.fitStatus,
  needsReview: schema.opportunity.needsReview,
  currentStageId: schema.opportunity.currentStageId,
  status: schema.opportunity.status,
  closedReason: schema.opportunity.closedReason,
  closedAt: schema.opportunity.closedAt,
  closedStageId: schema.opportunity.closedStageId,
  nextAction: schema.opportunity.nextAction,
  nextActionAt: schema.opportunity.nextActionAt,
  createdAt: schema.opportunity.createdAt,
  updatedAt: schema.opportunity.updatedAt,
};

const stageColumns = {
  id: schema.stage.id,
  opportunityId: schema.stage.opportunityId,
  kind: schema.stage.kind,
  label: schema.stage.label,
  position: schema.stage.position,
  status: schema.stage.status,
  scheduledAt: schema.stage.scheduledAt,
  format: schema.stage.format,
  enteredAt: schema.stage.enteredAt,
  completedAt: schema.stage.completedAt,
  outcomeMd: schema.stage.outcomeMd,
  createdAt: schema.stage.createdAt,
  updatedAt: schema.stage.updatedAt,
};

const personColumns = {
  id: schema.person.id,
  companyId: schema.person.companyId,
  name: schema.person.name,
  title: schema.person.title,
  linkedinUrl: schema.person.linkedinUrl,
  email: schema.person.email,
  notesMd: schema.person.notesMd,
  createdAt: schema.person.createdAt,
  updatedAt: schema.person.updatedAt,
};

const opportunityPersonColumns = {
  id: schema.opportunityPerson.id,
  opportunityId: schema.opportunityPerson.opportunityId,
  personId: schema.opportunityPerson.personId,
  role: schema.opportunityPerson.role,
  stageId: schema.opportunityPerson.stageId,
  createdAt: schema.opportunityPerson.createdAt,
  updatedAt: schema.opportunityPerson.updatedAt,
};

const eventColumns = {
  id: schema.event.id,
  opportunityId: schema.event.opportunityId,
  stageId: schema.event.stageId,
  kind: schema.event.kind,
  body: schema.event.body,
  meta: schema.event.meta,
  occurredAt: schema.event.occurredAt,
  createdAt: schema.event.createdAt,
};

const artifactColumns = {
  id: schema.artifact.id,
  opportunityId: schema.artifact.opportunityId,
  companyId: schema.artifact.companyId,
  stageId: schema.artifact.stageId,
  key: schema.artifact.key,
  version: schema.artifact.version,
  kind: schema.artifact.kind,
  title: schema.artifact.title,
  bodyMd: schema.artifact.bodyMd,
  origin: schema.artifact.origin,
  editedAt: schema.artifact.editedAt,
  sentAt: schema.artifact.sentAt,
  createdAt: schema.artifact.createdAt,
  updatedAt: schema.artifact.updatedAt,
};

const apiTokenColumns = {
  id: schema.apiToken.id,
  name: schema.apiToken.name,
  prefix: schema.apiToken.prefix,
  lastUsedAt: schema.apiToken.lastUsedAt,
  revokedAt: schema.apiToken.revokedAt,
  createdAt: schema.apiToken.createdAt,
};

export function dataExportQueries(db: Db, userId: string) {
  return {
    async user() {
      const [row] = await db.select(userColumns).from(schema.user).where(eq(schema.user.id, userId));
      return row ?? null;
    },
    async companies() {
      return db
        .select(companyColumns)
        .from(schema.company)
        .where(eq(schema.company.userId, userId))
        .orderBy(asc(schema.company.createdAt), asc(schema.company.id));
    },
    async opportunities() {
      return db
        .select(opportunityColumns)
        .from(schema.opportunity)
        .where(eq(schema.opportunity.userId, userId))
        .orderBy(asc(schema.opportunity.createdAt), asc(schema.opportunity.id));
    },
    async stages() {
      return db
        .select(stageColumns)
        .from(schema.stage)
        .where(eq(schema.stage.userId, userId))
        .orderBy(asc(schema.stage.createdAt), asc(schema.stage.id));
    },
    async people() {
      return db
        .select(personColumns)
        .from(schema.person)
        .where(eq(schema.person.userId, userId))
        .orderBy(asc(schema.person.createdAt), asc(schema.person.id));
    },
    async opportunityPeople() {
      return db
        .select(opportunityPersonColumns)
        .from(schema.opportunityPerson)
        .where(eq(schema.opportunityPerson.userId, userId))
        .orderBy(asc(schema.opportunityPerson.createdAt), asc(schema.opportunityPerson.id));
    },
    async events() {
      return db
        .select(eventColumns)
        .from(schema.event)
        .where(eq(schema.event.userId, userId))
        .orderBy(asc(schema.event.createdAt), asc(schema.event.id));
    },
    async artifacts() {
      return db
        .select(artifactColumns)
        .from(schema.artifact)
        .where(eq(schema.artifact.userId, userId))
        .orderBy(asc(schema.artifact.createdAt), asc(schema.artifact.id));
    },
    async apiTokens() {
      return db
        .select(apiTokenColumns)
        .from(schema.apiToken)
        .where(eq(schema.apiToken.userId, userId))
        .orderBy(asc(schema.apiToken.createdAt), asc(schema.apiToken.id));
    },
  };
}

type Queries = ReturnType<typeof dataExportQueries>;
type RowOf<K extends keyof Queries> = Awaited<ReturnType<Queries[K]>> extends (infer Row)[] ? Row : never;

export type ExportCompany = RowOf<"companies">;
export type ExportOpportunity = RowOf<"opportunities">;
export type ExportStage = RowOf<"stages">;
export type ExportPerson = RowOf<"people">;
export type ExportOpportunityPerson = RowOf<"opportunityPeople">;
export type ExportEvent = RowOf<"events">;
export type ExportArtifact = RowOf<"artifacts">;
export type ExportApiToken = RowOf<"apiTokens">;
```

`lib/db/scoped/index.ts`:

```diff
@@ -8,6 +8,7 @@ import { opportunityPersonQueries } from "./opportunity-person";
 import { eventQueries } from "./event";
 import { artifactQueries } from "./artifact";
 import { apiTokenQueries } from "./api-token";
+import { dataExportQueries } from "./data-export";
 import { getDb } from "../client";
 
 export * from "./strip";
@@ -20,6 +21,7 @@ export * from "./opportunity-person";
 export * from "./event";
 export * from "./artifact";
 export * from "./api-token";
+export * from "./data-export";
 
 // Declared explicitly rather than as `ReturnType<typeof scoped>`. That
 // inferred form is circular: `scoped`'s own `transaction` method takes a
@@ -46,6 +48,7 @@ export type Scoped = {
   event: ReturnType<typeof eventQueries>;
   artifact: ReturnType<typeof artifactQueries>;
   apiToken: ReturnType<typeof apiTokenQueries>;
+  dataExport: ReturnType<typeof dataExportQueries>;
 };
 
 export function scoped(db: Db, userId: string): Scoped {
@@ -63,6 +66,7 @@ export function scoped(db: Db, userId: string): Scoped {
     event: eventQueries(db, userId),
     artifact: artifactQueries(db, userId),
     apiToken: apiTokenQueries(db, userId),
+    dataExport: dataExportQueries(db, userId),
   };
 }
 
```

- [ ] **Step 5: Write `lib/export/build.ts` in full**

```typescript
import { DrizzleQueryError } from "drizzle-orm";
import type {
  ExportApiToken,
  ExportArtifact,
  ExportCompany,
  ExportEvent,
  ExportOpportunity,
  ExportOpportunityPerson,
  ExportPerson,
  ExportStage,
} from "@/lib/db/scoped/data-export";
import type { Scoped } from "@/lib/db/scoped";
import { zonedDateKey } from "@/lib/time/zone";

export const EXPORT_FORMAT = "jobsmith-export/v1";

export type ExportDocument = {
  format: typeof EXPORT_FORMAT;
  exportedAt: string;
  user: { id: string; name: string; email: string; createdAt: Date } | null;
  // preferences is the stored jsonb as it is, so an export shows what is in
  // the database even when it no longer parses.
  profile: {
    headline: string | null;
    resumeMd: string | null;
    timezone: string;
    preferences: unknown;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  companies: ExportCompany[];
  opportunities: ExportOpportunity[];
  stages: ExportStage[];
  people: ExportPerson[];
  opportunityPeople: ExportOpportunityPerson[];
  events: ExportEvent[];
  artifacts: ExportArtifact[];
  apiTokens: ExportApiToken[];
};

/**
 * Everything the user owns, in one envelope. Secrets and derived hashes are
 * not selected at all. The reads run one after another: this is a one-off
 * download, and when one read fails no other query is left running behind it.
 */
export async function buildExport(s: Scoped, now: Date): Promise<ExportDocument> {
  const user = await s.dataExport.user();
  const profile = await s.profile.get();
  const companies = await s.dataExport.companies();
  const opportunities = await s.dataExport.opportunities();
  const stages = await s.dataExport.stages();
  const people = await s.dataExport.people();
  const opportunityPeople = await s.dataExport.opportunityPeople();
  const events = await s.dataExport.events();
  const artifacts = await s.dataExport.artifacts();
  const apiTokens = await s.dataExport.apiTokens();

  return {
    format: EXPORT_FORMAT,
    exportedAt: now.toISOString(),
    user,
    profile: profile
      ? {
          headline: profile.headline,
          resumeMd: profile.resumeMd,
          timezone: profile.timezone,
          preferences: profile.preferences,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
        }
      : null,
    companies,
    opportunities,
    stages,
    people,
    opportunityPeople,
    events,
    artifacts,
    apiTokens,
  };
}

/** "jobsmith-export-2026-10-11.json", dated in the zone the user reads times in. */
export function exportFileName(now: Date, timeZone: string): string {
  return `jobsmith-export-${zonedDateKey(now, timeZone)}.json`;
}

// The request id, the error's constructor name, and for a database error the
// Postgres code and constraint. Never the message: Drizzle's carries the SQL
// and every bound parameter, which here would be the user's resume and notes.
export function logExportError(requestId: string, error: unknown): void {
  const name = error instanceof Error ? error.constructor.name : "UnknownError";
  if (error instanceof DrizzleQueryError) {
    const cause = error.cause as { code?: string; constraint?: string } | undefined;
    console.error("[export]", JSON.stringify({ requestId, error: name, code: cause?.code, constraint: cause?.constraint }));
    return;
  }
  console.error("[export]", JSON.stringify({ requestId, error: name }));
}
```

- [ ] **Step 6: Run the data and isolation tests and confirm they pass**

```bash
pnpm exec vitest run tests/integration/data-export.test.ts tests/integration/scoped-isolation.test.ts
```

Expected: `Test Files  2 passed (2)`, `Tests  58 passed (58)` (6 + 52).

- [ ] **Step 7: Mutation checks**

(a) In `lib/db/scoped/data-export.ts`, in `apiTokens()`, change `.select(apiTokenColumns)` to `.select()`. Run `pnpm exec vitest run tests/integration/data-export.test.ts`: `keeps exactly the listed columns of each table and no others` and `leaves out secrets, hashes and user ids from the JSON text` fail; 4 pass. Revert.

(b) In `companies()`, delete the line `.where(eq(schema.company.userId, userId))`. Run `pnpm exec vitest run tests/integration/scoped-isolation.test.ts`: `dataExport.companies hides A's rows from B` fails; 51 pass. Revert and rerun both files to confirm 58 pass.

- [ ] **Step 8: Write the route in full**

`app/(app)/settings/export/route.ts`:

```typescript
import { getUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { buildExport, exportFileName, logExportError } from "@/lib/export/build";
import { loadProfile } from "@/lib/profile/store";

// A download, so it is never cached and never served to anyone else. The proxy
// already redirects a request with no session cookie to /login; the 401 below
// covers a cookie that no longer names a session.
export async function GET(): Promise<Response> {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const requestId = crypto.randomUUID();
  const started = Date.now();
  try {
    const s = scopedFor(user.id);
    const now = new Date();
    const doc = await buildExport(s, now);
    const profile = await loadProfile(s);
    const body = JSON.stringify(doc, null, 2);
    // Counts and timing only: the body holds the resume and every note.
    console.info("[export]", JSON.stringify({ requestId, ms: Date.now() - started }));
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${exportFileName(now, profile.timezone)}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    logExportError(requestId, error);
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
```

- [ ] **Step 9: Run the route test and confirm it passes**

```bash
pnpm exec vitest run tests/integration/export-route.test.ts
```

Expected: `Tests  5 passed (5)`. If a version of `buildExport` that runs its reads in parallel is used instead, `answers 500 with a fixed error and logs the error name only` never finishes: the test closes PGlite while the other nine queries are still running. That is why the reads are sequential.

- [ ] **Step 10: Write `ExportSection` and put it on the page**

`components/settings/export-section.tsx`:

```tsx
import { buttonVariants } from "@/components/ui/button";

export function ExportSection() {
  return (
    <section aria-labelledby="settings-export" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 id="settings-export" className="text-base font-semibold text-foreground">
          Export my data
        </h2>
        <p className="text-sm text-muted-foreground">
          Download everything you saved in Jobsmith as one JSON file. Passwords, sign-in sessions and token secrets are
          left out.
        </p>
      </div>
      <div>
        {/* A plain link, not next/link: the response is a file, not a page. */}
        <a href="/settings/export" download className={buttonVariants({ variant: "outline" })}>
          Download JSON
        </a>
      </div>
    </section>
  );
}
```

`app/(app)/settings/page.tsx`:

```diff
@@ -5,6 +5,7 @@ import { loadProfile } from "@/lib/profile/store";
 import { listTimeZones } from "@/lib/time/zone";
 import { timeZoneItems } from "@/lib/time/zone-list";
 import { ApiTokensSection } from "@/components/settings/api-tokens-section";
+import { ExportSection } from "@/components/settings/export-section";
 import { ProfileSection } from "@/components/settings/profile-section";
 
 export default async function SettingsPage() {
@@ -20,6 +21,7 @@ export default async function SettingsPage() {
         timeZones={timeZoneItems(listTimeZones(), [profile.timezone])}
       />
       <ApiTokensSection tokens={tokens} />
+      <ExportSection />
     </div>
   );
 }
```

Run `pnpm exec vitest run tests/unit/export-section.test.tsx`; expected `Tests  1 passed (1)`.

- [ ] **Step 11: Write the end-to-end spec and wire it in**

`tests/e2e/account.ts` (append the two constants):

```diff
@@ -4,3 +4,10 @@ export const PASSWORD = "correct horse battery staple";
 // Must match the SETUP_TOKEN the webServer command in playwright.config.ts
 // starts the server with.
 export const SETUP_TOKEN = "e2e-setup-token-0123456789";
+
+// The shared account's profile text. The three browser projects use one
+// account at the same time, so every spec that saves the profile form saves
+// these same two values: a spec that saved a blank headline would wipe the one
+// another spec is about to read back.
+export const E2E_HEADLINE = "Product designer, design systems";
+export const E2E_RESUME = "Product designer with eight years in internal tools and design systems.";
```

`tests/e2e/settings.spec.ts`:

```typescript
import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { E2E_HEADLINE, E2E_RESUME } from "./account";
import { scanForViolations } from "./axe";
import { addJobAndOpen, login, uniqueName } from "./session";

test("Settings saves the profile, keeps it after a reload, and shows the time zone", async ({ page }, testInfo) => {
  await login(page);
  await page.goto("/settings");

  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Profile" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "API tokens" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Export my data" })).toBeVisible();

  await page.getByLabel("Headline").fill(E2E_HEADLINE);
  await page.getByLabel("Resume").fill(E2E_RESUME);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Profile saved." })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Headline")).toHaveValue(E2E_HEADLINE);
  await expect(page.getByLabel("Resume")).toHaveValue(E2E_RESUME);
  // The shared account stays on UTC: no spec changes its zone.
  await expect(page.getByLabel("Time zone")).toContainText("UTC");

  await scanForViolations(page, "settings profile", testInfo);
});

test("Download JSON gives a file with the user's data and no token hashes", async ({ page }, testInfo) => {
  await login(page);
  const company = uniqueName(testInfo, "Northwind Traders");
  const role = "Design Lead";
  await addJobAndOpen(page, company, role);

  await page.goto("/settings");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download JSON" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^jobsmith-export-\d{4}-\d{2}-\d{2}\.json$/);

  const filePath = await download.path();
  const text = fs.readFileSync(filePath, "utf8");
  expect(text).not.toContain("tokenHash");
  expect(text).not.toContain("dedupeHash");

  const doc = JSON.parse(text) as {
    format: string;
    companies: { name: string }[];
    opportunities: { roleTitle: string }[];
  };
  expect(doc.format).toBe("jobsmith-export/v1");
  expect(doc.companies.map((row) => row.name)).toContain(company);
  expect(doc.opportunities.map((row) => row.roleTitle)).toContain(role);
});
```

`playwright.config.ts` (the `chromium` and `webkit` projects both match `settings`):

```diff
@@ -23,13 +23,13 @@ export default defineConfig({
     },
     {
       name: "chromium",
-      testMatch: /(shell|pipeline|job-page|documents|bridge|nav|intake)\.spec\.ts$/,
+      testMatch: /(shell|pipeline|job-page|documents|bridge|nav|intake|settings)\.spec\.ts$/,
       dependencies: ["first-run"],
       use: { ...devices["Desktop Chrome"] },
     },
     {
       name: "webkit",
-      testMatch: /(shell|pipeline|job-page|documents|bridge|nav|intake)\.spec\.ts$/,
+      testMatch: /(shell|pipeline|job-page|documents|bridge|nav|intake|settings)\.spec\.ts$/,
       dependencies: ["first-run"],
       use: { ...devices["Desktop Safari"] },
     },
```

This spec is type-checked here and run in the end-to-end gate. Its selectors: `getByLabel("Time zone")` is expected to resolve to the Select's trigger button (the label's `for` is the Select's `id`; the jsdom test finds it that way), `getByRole("link", { name: "Download JSON" })` is the export anchor, and the `Profile saved.` text is read from the live region (`getByRole("status").filter({ hasText })`), not from a visible banner.

- [ ] **Step 12: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Expected: all three exit 0. At the end of this task the suite reports `Test Files  141 passed | 1 skipped (142)` and `Tests  1550 passed | 2 skipped (1552)`.

- [ ] **Step 13: Commit**

```bash
git add lib/db/scoped/data-export.ts lib/db/scoped/index.ts lib/export/build.ts app/\(app\)/settings/export/route.ts components/settings/export-section.tsx app/\(app\)/settings/page.tsx tests/integration/data-export.test.ts tests/integration/export-route.test.ts tests/unit/export-section.test.tsx tests/integration/scoped-isolation.test.ts tests/e2e/settings.spec.ts tests/e2e/account.ts playwright.config.ts
git commit -m "$(cat <<'EOF'
feat: add Export my data with a JSON download and isolation cases

EOF
)"
```

End the message with the co-author trailer supplied by the executing session.

---

### Task 9: Preferences page

**Files:**
- Create: `components/forms/list-input.tsx`, `components/preferences/preferences-form.tsx`, `app/(app)/preferences/actions.ts`, `tests/unit/list-input.test.tsx`, `tests/unit/preferences-form.test.tsx`, `tests/integration/preferences-actions.test.ts`, `tests/e2e/preferences.spec.ts`
- Modify: `app/(app)/preferences/page.tsx`, `tests/e2e/nav.spec.ts`, `playwright.config.ts`

**Interfaces:**
- Consumes: `preferencesSchema`, `Preferences`, `DEFAULT_PREFERENCES`, `MAX_LIST_ITEMS`, `MAX_ITEM_CHARS`, `SENIORITY_LEVELS` and `SENIORITY_LABELS` (Task 2, `lib/preferences/schema.ts`), `readPreferencesForm` (Task 2, `lib/preferences/form.ts`), `loadProfile` and `savePreferences` (Task 2, `lib/profile/store.ts`), `fieldErrorsByPath` and `FormState` (Task 2, `lib/forms/state.ts`), `seedProfile` (Task 2, `tests/helpers/profile.ts`), `StackedField` (Task 7), `WORK_MODES` (`lib/pipeline/values.ts`) and `WORK_MODE_LABELS` (`lib/pipeline/labels.ts`), `UNREADABLE_INPUT_VALUE` and `submitViaTransition` (Milestone 2, `lib/forms/submit.ts`), `useAnnounce`, `Badge`, `Button`, `Input`, `ToggleGroup` and `ToggleGroupItem`, `messageFor`, `requireUser`, `scopedFor` (Milestones 1 to 4, unmodified), and the existing e2e helpers `login` and `scanForViolations`.
- Produces (copied from the README's Contract character for character):

```typescript
// app/(app)/preferences/actions.ts ("use server")
export async function savePreferencesAction(_prev: FormState, formData: FormData): Promise<FormState>;   // readPreferencesForm -> preferencesSchema; invalid -> messageFor("invalid") + fieldErrorsByPath; savePreferences; revalidatePath("/", "layout")
// components/forms/list-input.tsx ("use client")
export function ListInput(props: { name: string; label: string; hint?: string; error?: string; placeholder: string; defaultValue: string[]; saved?: object }): React.ReactElement;
// components/preferences/preferences-form.tsx ("use client")
export function PreferencesForm(props: { preferences: Preferences }): React.ReactElement;
```

Rules this task enforces:

- `savePreferencesAction`: `requireUser`; `preferencesSchema.safeParse(readPreferencesForm(formData))`; invalid gives `{ ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: fieldErrorsByPath(error) }` and writes nothing (the keys are dotted paths with array indices dropped: `companySize.max`, `attention.followUpDays`, `titles`); valid calls `savePreferences(scopedFor(user.id), data)` and `revalidatePath("/", "layout")`, then `{ ok: true }`. `savePreferences` writes only the `preferences` column, so the headline and resume survive.
- Page: `export const maxDuration = 60` (the test box added in a later task fetches and scores in one request); `requireUser`; `loadProfile(scopedFor(user.id))`; `h1 Preferences`; the intro paragraph `Jobsmith checks each job against your hard filters and gives it a fit score from your resume and these preferences. A job that misses a filter is only flagged, never hidden.`; `PreferencesForm` with `profile.preferences`. A later task appends the test box.
- `PreferencesForm`: `<form noValidate onSubmit={(event) => submitViaTransition(event, formAction)}>` (`noValidate` so the server's messages show instead of the browser's bubbles on a number box); an alert `<p role="alert" className="text-sm text-destructive">` on `ok: false`; three `<section aria-labelledby>` blocks, each with an `h2` and an intro `p`; one submit button `Save preferences`, refocused on failure (the button is disabled while the request runs and Chromium drops focus from a disabled button); announcement `Preferences saved.` on success. The form keeps a snapshot of the preferences in state and uses it for every default, as `ProfileSection` does. It passes `saved={state?.ok ? state : undefined}` to every `ListInput`, so text left in a list box becomes a chip after a successful save.
- Sections and fields (labels, hints and placeholders are exact; every field uses `StackedField` or `ListInput`):
  - `Hard filters`, intro `Checked on every job page, with or without AI.`: `Job titles` (`ListInput`, name `titles`, hint `A job passes when its title contains one of these.`, placeholder `Add a title`); `Work modes` (toggles `Remote`, `Hybrid`, `On site`, name `workModes`, hint `A job passes when its work mode is one of these.`); `Locations` (`ListInput`, name `locations`, hint `A job passes when its location contains one of these. Remote jobs skip this check.`, placeholder `Add a place`); `Pay floor` (number, name `compFloor`, hint `A job fails only when its stated pay tops out below this.`); `Currency` (text, name `currency`, hint `Three letters, for example EUR. Pay in another currency is not compared.`).
  - `For the fit score`, intro `Sent to the AI model with your resume when a job is scored.`: `Seniority` (toggles from `SENIORITY_LABELS`, name `seniority`, no hint); `Pay target` (number, `compTarget`); `Must-haves` (`ListInput`, `mustHaves`, placeholder `Add a must-have`); `Dealbreakers` (`ListInput`, `dealbreakers`, placeholder `Add a dealbreaker`); `Industries to avoid` (`ListInput`, `industriesAvoid`, placeholder `Add an industry`); `Company size from` (number, `companySize.min`); `Company size to` (number, `companySize.max`, hint `Number of people.`); `Good fit from` (number, `scoreThreshold`, hint `Scores at or above this count as a good fit. 0 to 100.`).
  - `Home reminders`, intro `When Home asks you to act on a quiet job.`: `Follow up after` (number, `attention.followUpDays`, hint `Days without news on an applied job.`); `Apply or drop after` (number, `attention.savedDays`, hint `Days a saved job can wait.`).
  - The field names in the DOM are exactly these keys, because `readPreferencesForm` reads them by name. Number boxes are `Input type="number" inputMode="numeric"`; a blank box posts an empty string (the schema reads that as "no value" or as "restore the default").
- Toggles: `ToggleGroup multiple variant="outline"` with `aria-labelledby` pointing at a visible label `span`, the pressed values held in state, one `<input type="hidden" name={name} value={value}>` per pressed value. The group is controlled, so a test clicks one toggle per `act`: two clicks in one batch are both computed from the value before the first.
- `ListInput`: a `<fieldset>` with a `<legend className="text-sm font-medium">`; the hint and error paragraphs are referenced by `aria-describedby` on the text box; a `<ul aria-label={label}>` of chips (`Badge variant="secondary"` holding the text and a `Button variant="ghost" size="icon-xs"` with an `X` icon and `aria-label="Remove <entry>"`), rendered only when there are entries; a row with the `Input` (`aria-label="New entry for <label>"`, the placeholder) and `Button type="button" variant="outline" size="sm"` `Add`. Enter in the box adds an entry and never submits the form (it calls `preventDefault`, and does not add while an input method is composing). The entry is trimmed and a blank one ignored. A duplicate (compared case-insensitively) shows `<entry> is already in the list.` in an always-rendered `<p role="status">` below the box; at `MAX_LIST_ITEMS` (20) the box and `Add` are disabled and the status reads `Lists hold up to 20 entries.`; more than `MAX_ITEM_CHARS` (80) characters is refused with `Keep each entry under 80 characters.` in the same status line; typing clears a refusal. Adding announces `Added <entry>.`, removing announces `Removed <entry>.`. Removing moves focus to the next chip's remove button, else the previous one, else the text box (decided before the state change, applied in an effect after the removal is drawn). One `<input type="hidden" name={name} value={entry}>` per entry. A server error for the list (`error`) shows in `text-destructive text-sm`.
- Text left in a list box (typed, not added with Enter or `Add`) is saved with the form, under the same rules as `Add`. `ListInput` renders one more hidden input under `name` carrying the box's trimmed text, unless the box is blank or repeats a chip in another letter case (then nothing is posted for it, as `Add` would refuse it). The length and count limits are left to the schema, so an over-long box is posted as typed and comes back as the field error `Keep each entry under 80 characters.` with the text still in the box. The optional `saved` prop changes to a new object on each successful save (`PreferencesForm` passes `state` when `state.ok`); `ListInput` then moves the text that was in the box when the form was submitted into the chips (unless it repeats one) and empties the box, so the form shows what was saved. What the box held at submit is remembered by a native `submit` listener on the surrounding form, and the move is made while rendering, keyed on the prop (no effect), so text typed while the save runs stays in the box and is not shown as saved.
- Long unbroken text: a chip's `Badge` carries `max-w-full break-words whitespace-normal`, its text `min-w-0 break-words`, and its `li` `max-w-full`, so an 80-character entry with no spaces wraps inside the chip.
- `tests/e2e/nav.spec.ts` keeps its existing steps; only the two assertions about the old holding text become `h2 Hard filters`. `playwright.config.ts` adds `preferences` to the `chromium` and `webkit` `testMatch` (the phone project is not changed here).
- End to end (`preferences.spec.ts`, chromium and webkit, one shared account at the same time): each test only makes sure a value is present and never removes one, so whichever project saves last saves the same state. The size-range test submits an invalid form and so saves nothing. The first test also types the must-have `Design reviews` into its box and presses Save without Enter or `Add`, then expects a chip and an empty box, and the chip again after a reload; every test that saves leaves that text in the box (`leaveMustHaveInBox`), so a save from another project never removes it.

- [ ] **Step 1: Write the failing tests**

`tests/unit/list-input.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { ListInput } from "@/components/forms/list-input";

// No jest-dom here (see add-job-dialog.test.tsx); assertions read the DOM.

function renderList(props: Partial<React.ComponentProps<typeof ListInput>> = {}, onSubmit = vi.fn()) {
  render(
    <LiveAnnouncerProvider>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <ListInput name="titles" label="Job titles" placeholder="Add a title" defaultValue={[]} {...props} />
      </form>
    </LiveAnnouncerProvider>,
  );
  const group = screen.getByRole("group", { name: "Job titles" });
  return { group, onSubmit };
}

const input = () => screen.getByLabelText("New entry for Job titles") as HTMLInputElement;
const addButton = (group: HTMLElement) => within(group).getByRole("button", { name: "Add" }) as HTMLButtonElement;
const hiddenValues = (group: HTMLElement) =>
  [...group.querySelectorAll<HTMLInputElement>('input[type="hidden"][name="titles"]')].map((node) => node.value);
// The fieldset's own always-rendered status line, not the page-wide announcer.
const statusOf = (group: HTMLElement) => within(group).getByRole("status").textContent;
const chipNames = (group: HTMLElement) =>
  within(group)
    .queryAllByRole("button", { name: /^Remove / })
    .map((button) => button.getAttribute("aria-label"));

async function type(value: string) {
  await act(async () => {
    fireEvent.change(input(), { target: { value } });
  });
}

async function press(key: string) {
  await act(async () => {
    fireEvent.keyDown(input(), { key });
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ListInput", () => {
  it("is a group named by its label, with a chip, a remove button and a hidden input per entry", () => {
    const { group } = renderList({ defaultValue: ["Product Designer", "Design Lead"], hint: "A job passes when its title matches." });
    expect(within(group).getByRole("list", { name: "Job titles" }).querySelectorAll("li")).toHaveLength(2);
    expect(chipNames(group)).toEqual(["Remove Product Designer", "Remove Design Lead"]);
    expect(hiddenValues(group)).toEqual(["Product Designer", "Design Lead"]);
    expect(input().placeholder).toBe("Add a title");
    expect(within(group).getByText("A job passes when its title matches.")).not.toBeNull();
    expect(statusOf(group)).toBe("");
  });

  // The box's text is posted as one more entry when the form is submitted
  // without pressing Add, under the same rules as Add.
  it("posts text typed but not added as one more entry, trimmed", async () => {
    const { group } = renderList({ defaultValue: ["Product Designer"] });
    await type("  Design Lead  ");
    expect(hiddenValues(group)).toEqual(["Product Designer", "Design Lead"]);
    expect(chipNames(group)).toEqual(["Remove Product Designer"]);
  });

  it("posts nothing extra for a blank box or a case-insensitive duplicate", async () => {
    const { group } = renderList({ defaultValue: ["Product Designer"] });
    await type("   ");
    expect(hiddenValues(group)).toEqual(["Product Designer"]);
    await type("product DESIGNER");
    expect(hiddenValues(group)).toEqual(["Product Designer"]);
  });

  it("posts an over-long box as typed, for the server to refuse with its own message", async () => {
    const { group } = renderList();
    await type("x".repeat(81));
    expect(hiddenValues(group)).toEqual(["x".repeat(81)]);
  });

  it("folds the posted text into the chips and empties the box when a save succeeds", async () => {
    function Harness({ saved }: { saved?: object }) {
      return (
        <LiveAnnouncerProvider>
          <form>
            <ListInput name="titles" label="Job titles" placeholder="Add a title" defaultValue={["Product Designer"]} saved={saved} />
          </form>
        </LiveAnnouncerProvider>
      );
    }
    const view = render(<Harness />);
    const group = screen.getByRole("group", { name: "Job titles" });
    await type("Design Lead");
    await act(async () => {
      group.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    // Typing after the submit is not part of what was saved.
    await type("Design Lead and more");
    expect(chipNames(group)).toEqual(["Remove Product Designer"]);

    view.rerender(<Harness saved={{}} />);
    expect(chipNames(group)).toEqual(["Remove Product Designer", "Remove Design Lead"]);
    expect(hiddenValues(group)).toEqual(["Product Designer", "Design Lead", "Design Lead and more"]);
    expect(input().value).toBe("Design Lead and more");
  });

  it("lets an 80-character entry break inside the word, in the chip and its text", () => {
    const long = "y".repeat(80);
    const { group } = renderList({ defaultValue: [long] });
    const chip = within(group).getByRole("listitem");
    expect(chip.className).toContain("max-w-full");
    const badge = chip.querySelector('[data-slot="badge"]') as HTMLElement;
    expect(badge.className).toContain("max-w-full");
    expect(badge.className).toContain("break-words");
    const text = within(badge).getByText(long);
    expect(text.className).toContain("min-w-0");
    expect(text.className).toContain("break-words");
    expect(group.className).toContain("min-w-0");
  });

  it("renders no list when there are no entries", () => {
    const { group } = renderList();
    expect(within(group).queryByRole("list")).toBeNull();
    expect(hiddenValues(group)).toEqual([]);
  });

  it("describes the input by the hint and the error", () => {
    const { group } = renderList({ hint: "A job passes when its title matches.", error: "Keep the list to 20 entries." });
    const hint = within(group).getByText("A job passes when its title matches.");
    const error = within(group).getByText("Keep the list to 20 entries.");
    expect(input().getAttribute("aria-describedby")?.split(" ")).toEqual([hint.id, error.id]);
    expect(error.className).toContain("text-destructive");
  });

  it("adds an entry on Enter without submitting the form, trims it, clears the box and announces it", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const { group, onSubmit } = renderList();
    await type("  Product Designer  ");
    await press("Enter");

    expect(chipNames(group)).toEqual(["Remove Product Designer"]);
    expect(hiddenValues(group)).toEqual(["Product Designer"]);
    expect(input().value).toBe("");
    expect(document.activeElement).toBe(input());
    expect(onSubmit).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getAllByRole("status").map((node) => node.textContent)).toContain("Added Product Designer.");
  });

  it("does not treat Enter in the box as a form submit even when the box is empty", async () => {
    const { onSubmit } = renderList();
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    await act(async () => {
      input().dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("adds with the Add button and ignores a blank box", async () => {
    const { group } = renderList();
    await type("   ");
    await act(async () => {
      fireEvent.click(addButton(group));
    });
    expect(chipNames(group)).toEqual([]);
    expect(statusOf(group)).toBe("");

    await type("Design Lead");
    await act(async () => {
      fireEvent.click(addButton(group));
    });
    expect(chipNames(group)).toEqual(["Remove Design Lead"]);
  });

  it("refuses a duplicate in any letter case and says so in the status line", async () => {
    const { group } = renderList({ defaultValue: ["Product Designer"] });
    await type("product designer");
    await press("Enter");

    expect(chipNames(group)).toEqual(["Remove Product Designer"]);
    expect(statusOf(group)).toBe("product designer is already in the list.");
    // The text stays so it can be corrected, and typing clears the message.
    expect(input().value).toBe("product designer");
    await type("product designer 2");
    expect(statusOf(group)).toBe("");
  });

  it("refuses an entry over 80 characters and accepts one of exactly 80", async () => {
    const { group } = renderList();
    await type("x".repeat(81));
    await press("Enter");
    expect(chipNames(group)).toEqual([]);
    expect(statusOf(group)).toBe("Keep each entry under 80 characters.");

    await type("y".repeat(80));
    await press("Enter");
    expect(chipNames(group)).toHaveLength(1);
    expect(statusOf(group)).toBe("");
  });

  it("stops at 20 entries: the box and Add are disabled and the status says why", async () => {
    const nineteen = Array.from({ length: 19 }, (_, index) => `Title ${index + 1}`);
    const { group } = renderList({ defaultValue: nineteen });
    expect(input().disabled).toBe(false);
    await type("Title 20");
    await press("Enter");

    expect(chipNames(group)).toHaveLength(20);
    expect(input().disabled).toBe(true);
    expect(addButton(group).disabled).toBe(true);
    expect(statusOf(group)).toBe("Lists hold up to 20 entries.");

    // Removing one brings the box back.
    await act(async () => {
      fireEvent.click(within(group).getByRole("button", { name: "Remove Title 20" }));
    });
    expect(input().disabled).toBe(false);
    expect(statusOf(group)).toBe("");
  });

  it("moves focus to the next chip's remove button, else the previous, else the box, and announces", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const { group } = renderList({ defaultValue: ["Alpha", "Bravo", "Charlie"] });
    const remove = (name: string) => within(group).getByRole("button", { name: `Remove ${name}` });

    await act(async () => {
      fireEvent.click(remove("Bravo"));
    });
    expect(hiddenValues(group)).toEqual(["Alpha", "Charlie"]);
    expect(document.activeElement).toBe(remove("Charlie"));
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getAllByRole("status").map((node) => node.textContent)).toContain("Removed Bravo.");

    await act(async () => {
      fireEvent.click(remove("Charlie"));
    });
    expect(document.activeElement).toBe(remove("Alpha"));

    await act(async () => {
      fireEvent.click(remove("Alpha"));
    });
    expect(hiddenValues(group)).toEqual([]);
    expect(document.activeElement).toBe(input());
  });
});
```

`tests/integration/preferences-actions.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db/client";
import { scoped } from "@/lib/db/scoped";
import { savePreferencesAction } from "@/app/(app)/preferences/actions";
import { UNREADABLE_INPUT_VALUE } from "@/lib/forms/submit";
import { DEFAULT_PREFERENCES } from "@/lib/preferences/schema";
import { loadProfile } from "@/lib/profile/store";
import { makeTestDb, createTestUser } from "../helpers/db";
import { seedProfile } from "../helpers/profile";

// Same harness as the other action tests: the signed-in user and path
// revalidation need a live Next.js request, so both are stubbed; scopedFor
// points at a real PGlite database through the real scoped().
const harness = vi.hoisted(() => ({ db: undefined as Db | undefined, userId: "" }));
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => ({ id: harness.userId }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/db/scoped", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/scoped")>();
  return { ...actual, scopedFor: (userId: string) => actual.scoped(harness.db!, userId) };
});

afterEach(() => {
  revalidatePathMock.mockClear();
});

function form(entries: [string, string][]): FormData {
  const formData = new FormData();
  for (const [name, value] of entries) formData.append(name, value);
  return formData;
}

async function setup(email: string) {
  const made = await makeTestDb();
  harness.db = made.db;
  harness.userId = (await createTestUser(made.db, email)).id;
  return { ...made, s: scoped(made.db, harness.userId) };
}

describe("savePreferencesAction", () => {
  it("saves what the form posts, reads it back, and revalidates every page", async () => {
    const { s, close } = await setup("prefs-save@example.com");
    try {
      const state = await savePreferencesAction(
        undefined,
        form([
          ["titles", "Product Designer"],
          ["titles", "Design Lead"],
          ["titles", "product designer"],
          ["workModes", "remote"],
          ["workModes", "hybrid"],
          ["seniority", "senior"],
          ["locations", "Amsterdam"],
          ["compFloor", "100"],
          ["compTarget", "150"],
          ["currency", " eur "],
          ["mustHaves", "Design systems"],
          ["dealbreakers", "On-call rotation"],
          ["industriesAvoid", "Gambling"],
          ["companySize.min", "50"],
          ["companySize.max", "500"],
          ["scoreThreshold", "75"],
          ["attention.followUpDays", "10"],
          ["attention.savedDays", "5"],
        ]),
      );

      expect(state).toEqual({ ok: true });
      expect((await loadProfile(s)).preferences).toEqual({
        v: 1,
        // A repeated title keeps its first place and its later spelling.
        titles: ["product designer", "Design Lead"],
        seniority: ["senior"],
        locations: ["Amsterdam"],
        workModes: ["remote", "hybrid"],
        compFloor: 100,
        compTarget: 150,
        currency: "EUR",
        mustHaves: ["Design systems"],
        dealbreakers: ["On-call rotation"],
        industriesAvoid: ["Gambling"],
        companySize: { min: 50, max: 500 },
        scoreThreshold: 75,
        attention: { followUpDays: 10, savedDays: 5 },
      });
      expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
    } finally {
      await close();
    }
  });

  it("restores the defaults for blank numbers and keeps the headline and resume", async () => {
    const { s, close } = await setup("prefs-blank@example.com");
    try {
      await seedProfile(s, { headline: "Product designer", preferences: { v: 1, compFloor: 100, scoreThreshold: 90 } });
      const state = await savePreferencesAction(
        undefined,
        form([
          ["compFloor", ""],
          ["scoreThreshold", ""],
          ["attention.followUpDays", ""],
          ["attention.savedDays", ""],
        ]),
      );

      expect(state).toEqual({ ok: true });
      const profile = await loadProfile(s);
      expect(profile.preferences).toEqual(DEFAULT_PREFERENCES);
      expect(profile.headline).toBe("Product designer");
      expect(profile.resumeMd).toContain("Northwind Traders");
    } finally {
      await close();
    }
  });

  it("keys nested errors by their dotted path and writes nothing", async () => {
    const { s, close } = await setup("prefs-errors@example.com");
    try {
      await seedProfile(s, { preferences: { v: 1, titles: ["Kept"] } });
      const state = await savePreferencesAction(
        undefined,
        form([
          ["companySize.min", "50"],
          ["companySize.max", "10"],
          ["attention.followUpDays", "90"],
          ["scoreThreshold", "101"],
          ["currency", "EURO"],
          ["titles", "x".repeat(81)],
        ]),
      );

      expect(state).toEqual({
        ok: false,
        code: "invalid",
        message: "Check the highlighted fields.",
        fieldErrors: {
          titles: "Keep each entry under 80 characters.",
          currency: "Enter a three-letter code such as EUR.",
          "companySize.max": "The smallest size must not be above the largest.",
          scoreThreshold: "Enter 0 to 100.",
          "attention.followUpDays": "Enter 1 to 60.",
        },
      });
      expect((await loadProfile(s)).preferences.titles).toEqual(["Kept"]);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("rejects the stand-in for a number box the browser could not read", async () => {
    const { close } = await setup("prefs-unreadable@example.com");
    try {
      const state = await savePreferencesAction(
        undefined,
        form([
          ["compFloor", UNREADABLE_INPUT_VALUE],
          ["companySize.min", UNREADABLE_INPUT_VALUE],
        ]),
      );
      expect(state).toMatchObject({
        ok: false,
        code: "invalid",
        fieldErrors: { compFloor: "Enter a number.", "companySize.min": "Enter a number." },
      });
    } finally {
      await close();
    }
  });

  it("rejects an unknown work mode instead of dropping it", async () => {
    const { close } = await setup("prefs-mode@example.com");
    try {
      const state = await savePreferencesAction(undefined, form([["workModes", "moon"]]));
      expect(state).toMatchObject({ ok: false, code: "invalid" });
    } finally {
      await close();
    }
  });
});
```

`tests/unit/preferences-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { PreferencesForm } from "@/components/preferences/preferences-form";
import { savePreferencesAction } from "@/app/(app)/preferences/actions";
import { DEFAULT_PREFERENCES, type Preferences } from "@/lib/preferences/schema";

// No jest-dom here (see add-job-dialog.test.tsx); assertions read the DOM.
vi.mock("@/app/(app)/preferences/actions", () => ({ savePreferencesAction: vi.fn() }));

const mockedSave = vi.mocked(savePreferencesAction);

const SAVED: Preferences = {
  ...DEFAULT_PREFERENCES,
  titles: ["Product Designer"],
  seniority: ["senior"],
  locations: ["Amsterdam"],
  workModes: ["remote"],
  compFloor: 100,
  compTarget: 150,
  currency: "EUR",
  mustHaves: ["Design systems"],
  dealbreakers: ["On-call rotation"],
  industriesAvoid: ["Gambling"],
  companySize: { min: 50, max: 500 },
  scoreThreshold: 75,
  attention: { followUpDays: 10, savedDays: 5 },
};

function renderForm(preferences: Preferences = SAVED) {
  return render(
    <LiveAnnouncerProvider>
      <PreferencesForm preferences={preferences} />
    </LiveAnnouncerProvider>,
  );
}

async function save() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));
    await Promise.resolve();
  });
}

function sent(): FormData {
  expect(mockedSave).toHaveBeenCalledTimes(1);
  return mockedSave.mock.calls[0]![1];
}

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

beforeEach(() => {
  mockedSave.mockReset();
  mockedSave.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PreferencesForm", () => {
  it("has three sections, each with its heading and intro", () => {
    renderForm();
    for (const [name, intro] of [
      ["Hard filters", "Checked on every job page, with or without AI."],
      ["For the fit score", "Sent to the AI model with your resume when a job is scored."],
      ["Home reminders", "When Home asks you to act on a quiet job."],
    ] as const) {
      const section = screen.getByRole("region", { name });
      expect(within(section).getByRole("heading", { level: 2, name })).not.toBeNull();
      expect(within(section).getByText(intro)).not.toBeNull();
    }
  });

  it("puts each field in its section with its label and hint", () => {
    renderForm();
    const hard = screen.getByRole("region", { name: "Hard filters" });
    for (const name of ["Job titles", "Work modes", "Locations"]) {
      expect(within(hard).getByRole("group", { name })).not.toBeNull();
    }
    expect(within(hard).getByLabelText("Pay floor")).not.toBeNull();
    expect(within(hard).getByLabelText("Currency")).not.toBeNull();
    expect(within(hard).getByText("A job passes when its title contains one of these.")).not.toBeNull();
    expect(within(hard).getByText("A job passes when its work mode is one of these.")).not.toBeNull();
    expect(within(hard).getByText("A job passes when its location contains one of these. Remote jobs skip this check.")).not.toBeNull();
    expect(within(hard).getByText("A job fails only when its stated pay tops out below this.")).not.toBeNull();
    expect(within(hard).getByText("Three letters, for example EUR. Pay in another currency is not compared.")).not.toBeNull();

    const score = screen.getByRole("region", { name: "For the fit score" });
    for (const name of ["Seniority", "Must-haves", "Dealbreakers", "Industries to avoid"]) {
      expect(within(score).getByRole("group", { name })).not.toBeNull();
    }
    for (const label of ["Pay target", "Company size from", "Company size to", "Good fit from"]) {
      expect(within(score).getByLabelText(label)).not.toBeNull();
    }
    expect(within(score).getByText("Number of people.")).not.toBeNull();
    expect(within(score).getByText("Scores at or above this count as a good fit. 0 to 100.")).not.toBeNull();

    const home = screen.getByRole("region", { name: "Home reminders" });
    expect(within(home).getByLabelText("Follow up after")).not.toBeNull();
    expect(within(home).getByLabelText("Apply or drop after")).not.toBeNull();
    expect(within(home).getByText("Days without news on an applied job.")).not.toBeNull();
    expect(within(home).getByText("Days a saved job can wait.")).not.toBeNull();
  });

  it("shows the saved values", () => {
    renderForm();
    expect(screen.getByRole("group", { name: "Job titles" }).querySelectorAll('input[type="hidden"]')).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Remove Product Designer" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Remove Amsterdam" })).not.toBeNull();
    expect(field("Pay floor").value).toBe("100");
    expect(field("Pay target").value).toBe("150");
    expect(field("Currency").value).toBe("EUR");
    expect(field("Company size from").value).toBe("50");
    expect(field("Company size to").value).toBe("500");
    expect(field("Good fit from").value).toBe("75");
    expect(field("Follow up after").value).toBe("10");
    expect(field("Apply or drop after").value).toBe("5");
    expect(screen.getByRole("button", { name: "Remote" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Hybrid" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "On site" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Senior" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Mid-level" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("starts empty and with the defaults for a profile with no preferences", () => {
    renderForm(DEFAULT_PREFERENCES);
    expect(field("Pay floor").value).toBe("");
    expect(field("Currency").value).toBe("");
    expect(field("Good fit from").value).toBe("70");
    expect(field("Follow up after").value).toBe("7");
    expect(field("Apply or drop after").value).toBe("3");
    expect(screen.getByRole("button", { name: "Remote" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("posts a hidden input for each pressed toggle and drops it when the toggle is released", async () => {
    renderForm();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Hybrid" }));
      fireEvent.click(screen.getByRole("button", { name: "Lead" }));
    });
    expect(screen.getByRole("button", { name: "Hybrid" }).getAttribute("aria-pressed")).toBe("true");
    await save();
    expect(sent().getAll("workModes")).toEqual(["remote", "hybrid"]);
    expect(sent().getAll("seniority")).toEqual(["senior", "lead"]);

    mockedSave.mockClear();
    // One click per act: the group is controlled, so a second click in the
    // same batch would be computed from the value before the first.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remote" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Hybrid" }));
    });
    await save();
    expect(sent().getAll("workModes")).toEqual([]);
  });

  it("posts every field under its exact name", async () => {
    renderForm();
    await save();
    const data = sent();
    expect(data.getAll("titles")).toEqual(["Product Designer"]);
    expect(data.getAll("locations")).toEqual(["Amsterdam"]);
    expect(data.getAll("mustHaves")).toEqual(["Design systems"]);
    expect(data.getAll("dealbreakers")).toEqual(["On-call rotation"]);
    expect(data.getAll("industriesAvoid")).toEqual(["Gambling"]);
    expect(data.get("compFloor")).toBe("100");
    expect(data.get("compTarget")).toBe("150");
    expect(data.get("currency")).toBe("EUR");
    expect(data.get("companySize.min")).toBe("50");
    expect(data.get("companySize.max")).toBe("500");
    expect(data.get("scoreThreshold")).toBe("75");
    expect(data.get("attention.followUpDays")).toBe("10");
    expect(data.get("attention.savedDays")).toBe("5");
  });

  async function typeInto(label: string, value: string) {
    await act(async () => {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    });
  }

  it("saves text left in a list box as an entry, and shows it as a chip with an empty box afterwards", async () => {
    renderForm();
    await typeInto("New entry for Job titles", "  Design Lead ");
    await typeInto("New entry for Must-haves", "Design reviews");
    await save();

    expect(sent().getAll("titles")).toEqual(["Product Designer", "Design Lead"]);
    expect(sent().getAll("mustHaves")).toEqual(["Design systems", "Design reviews"]);
    expect(screen.getByRole("button", { name: "Remove Design Lead" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Remove Design reviews" })).not.toBeNull();
    expect((screen.getByLabelText("New entry for Job titles") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("New entry for Must-haves") as HTMLInputElement).value).toBe("");
  });

  it("ignores a left-over duplicate and empties its box after a save", async () => {
    renderForm();
    await typeInto("New entry for Job titles", "product designer");
    await save();

    expect(sent().getAll("titles")).toEqual(["Product Designer"]);
    expect(screen.getAllByRole("button", { name: /^Remove product designer$/i })).toHaveLength(1);
    expect((screen.getByLabelText("New entry for Job titles") as HTMLInputElement).value).toBe("");
  });

  it("keeps an over-long left-over text in its box, with the server's message, when the save is refused", async () => {
    mockedSave.mockResolvedValue({
      ok: false,
      code: "invalid",
      message: "Check the highlighted fields.",
      fieldErrors: { titles: "Keep each entry under 80 characters." },
    });
    renderForm();
    await typeInto("New entry for Job titles", "x".repeat(81));
    await save();

    expect(sent().getAll("titles")).toEqual(["Product Designer", "x".repeat(81)]);
    expect(within(screen.getByRole("group", { name: "Job titles" })).getByText("Keep each entry under 80 characters.")).not.toBeNull();
    expect((screen.getByLabelText("New entry for Job titles") as HTMLInputElement).value).toBe("x".repeat(81));
    expect(screen.queryByRole("button", { name: `Remove ${"x".repeat(81)}` })).toBeNull();
  });

  it("posts a cleared number as an empty string", async () => {
    renderForm();
    await act(async () => {
      fireEvent.change(field("Pay floor"), { target: { value: "" } });
    });
    await save();
    expect(sent().get("compFloor")).toBe("");
  });

  it("announces Preferences saved. after a successful save", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    renderForm();
    await save();
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getAllByRole("status").map((node) => node.textContent)).toContain("Preferences saved.");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows nested errors under their fields, the alert, and puts focus on Save preferences", async () => {
    mockedSave.mockResolvedValue({
      ok: false,
      code: "invalid",
      message: "Check the highlighted fields.",
      fieldErrors: {
        "companySize.max": "The smallest size must not be above the largest.",
        "attention.followUpDays": "Enter 1 to 60.",
        titles: "Keep the list to 20 entries.",
        scoreThreshold: "Enter 0 to 100.",
      },
    });
    renderForm();
    await save();

    expect(screen.getByRole("alert").textContent).toBe("Check the highlighted fields.");
    const underSizeTo = screen.getByText("The smallest size must not be above the largest.");
    expect(field("Company size to").getAttribute("aria-describedby")?.split(" ")).toContain(underSizeTo.id);
    expect(field("Company size to").getAttribute("aria-invalid")).toBe("true");
    expect(field("Company size from").getAttribute("aria-invalid")).toBe("false");
    expect(field("Follow up after").getAttribute("aria-describedby")?.split(" ")).toContain(screen.getByText("Enter 1 to 60.").id);
    expect(field("Good fit from").getAttribute("aria-describedby")?.split(" ")).toContain(screen.getByText("Enter 0 to 100.").id);
    const titles = screen.getByRole("group", { name: "Job titles" });
    expect(within(titles).getByText("Keep the list to 20 entries.")).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Save preferences" }));
    // A rejected save keeps what was typed.
    expect(field("Company size to").value).toBe("500");
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

```bash
pnpm exec vitest run tests/unit/list-input.test.tsx tests/unit/preferences-form.test.tsx tests/integration/preferences-actions.test.ts
```

Expected: `Test Files  3 failed (3)`, all three failing to load: `Failed to resolve import "@/components/forms/list-input"`, `Failed to resolve import "@/components/preferences/preferences-form"` and `Cannot find package '@/app/(app)/preferences/actions'`. No test runs.

- [ ] **Step 3: Write `components/forms/list-input.tsx` in full**

```tsx
"use client";

import * as React from "react";
import { X } from "lucide-react";

import { useAnnounce } from "@/components/live-announcer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_ITEM_CHARS, MAX_LIST_ITEMS } from "@/lib/preferences/schema";

interface ListInputProps {
  /** The form field name; every entry is posted under it, one hidden input each. */
  name: string;
  label: string;
  hint?: string;
  error?: string;
  placeholder: string;
  defaultValue: string[];
  /**
   * Changes to a new object each time the surrounding form saves
   * successfully. The text that was left in the box when that form was
   * submitted then becomes a chip.
   */
  saved?: object;
}

const LIMIT_MESSAGE = `Lists hold up to ${MAX_LIST_ITEMS} entries.`;
const TOO_LONG_MESSAGE = `Keep each entry under ${MAX_ITEM_CHARS} characters.`;

type Focus = { entry: string } | "input" | null;

/**
 * A list of short strings: chips with remove buttons and a box to add more.
 * Enter in the box adds an entry and never submits the surrounding form.
 */
export function ListInput({ name, label, hint, error, placeholder, defaultValue, saved }: ListInputProps) {
  const id = React.useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const announce = useAnnounce();

  // A snapshot: a save re-renders the page with new props, and the list keeps
  // what is on screen.
  const [entries, setEntries] = React.useState<string[]>(() => [...defaultValue]);
  const [draft, setDraft] = React.useState("");
  const [refusal, setRefusal] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const removeButtons = React.useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = React.useRef<Focus>(null);

  // Text typed but not added is posted as one more entry, so a Save pressed
  // without Add or Enter keeps it. A case-insensitive repeat of a chip is
  // ignored, as Add ignores it; the server does the length and count checks.
  const typed = draft.trim();
  const isRepeat = (text: string) => entries.some((existing) => existing.toLowerCase() === text.toLowerCase());
  const posted = typed !== "" && !isRepeat(typed) ? typed : "";

  // What the box held when the form was last submitted, so text typed while
  // the save runs is not shown as saved.
  const typedRef = React.useRef(typed);
  React.useEffect(() => {
    typedRef.current = typed;
  });
  const [submitted, setSubmitted] = React.useState("");
  React.useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const remember = () => setSubmitted(typedRef.current);
    form.addEventListener("submit", remember);
    return () => form.removeEventListener("submit", remember);
  }, []);

  // A successful save moves what was submitted from the box to the chips.
  // Adjusting state while rendering, keyed on the prop, needs no effect.
  const [seenSave, setSeenSave] = React.useState(saved);
  if (saved !== seenSave) {
    setSeenSave(saved);
    if (saved !== undefined && submitted !== "") {
      if (!isRepeat(submitted)) setEntries([...entries, submitted]);
      if (typed === submitted) setDraft("");
      setSubmitted("");
    }
  }

  const full = entries.length >= MAX_LIST_ITEMS;
  const status = full ? LIMIT_MESSAGE : refusal;

  React.useEffect(() => {
    // Runs after a removal has been drawn, so the target exists (and the box
    // is enabled again when the list was full).
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    if (target === "input") inputRef.current?.focus();
    else removeButtons.current.get(target.entry)?.focus();
  }, [entries]);

  function add() {
    const entry = draft.trim();
    if (entry === "") return;
    if (entry.length > MAX_ITEM_CHARS) {
      setRefusal(TOO_LONG_MESSAGE);
      return;
    }
    if (entries.some((existing) => existing.toLowerCase() === entry.toLowerCase())) {
      setRefusal(`${entry} is already in the list.`);
      return;
    }
    setEntries([...entries, entry]);
    setDraft("");
    setRefusal("");
    announce(`Added ${entry}.`);
    inputRef.current?.focus();
  }

  function remove(entry: string) {
    const index = entries.indexOf(entry);
    const neighbour = entries[index + 1] ?? entries[index - 1];
    pendingFocus.current = neighbour === undefined ? "input" : { entry: neighbour };
    setEntries(entries.filter((existing) => existing !== entry));
    announce(`Removed ${entry}.`);
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="text-sm font-medium">{label}</legend>

      {entries.length > 0 ? (
        <ul aria-label={label} className="flex flex-wrap gap-2">
          {entries.map((entry) => (
            <li key={entry} className="max-w-full">
              <Badge variant="secondary" className="h-auto max-w-full gap-1 py-0.5 pr-0.5 break-words whitespace-normal">
                <span className="min-w-0 break-words">{entry}</span>
                <Button
                  ref={(node) => {
                    if (node) removeButtons.current.set(entry, node);
                    else removeButtons.current.delete(entry);
                  }}
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${entry}`}
                  onClick={() => remove(entry)}
                >
                  <X aria-hidden />
                </Button>
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex gap-2">
        <Input
          ref={inputRef}
          value={draft}
          placeholder={placeholder}
          aria-label={`New entry for ${label}`}
          aria-describedby={describedBy}
          aria-invalid={refusal !== ""}
          disabled={full}
          onChange={(event) => {
            setDraft(event.target.value);
            setRefusal("");
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            // Enter belongs to the box: it never submits the form around it.
            event.preventDefault();
            if (!event.nativeEvent.isComposing) add();
          }}
        />
        <Button type="button" variant="outline" size="sm" className="h-8" disabled={full} onClick={add}>
          Add
        </Button>
      </div>

      {hint ? (
        <p id={hintId} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <p role="status" className="text-muted-foreground text-sm empty:hidden">
        {status}
      </p>

      {entries.map((entry) => (
        <input key={entry} type="hidden" name={name} value={entry} />
      ))}
      {posted !== "" ? <input type="hidden" name={name} value={posted} /> : null}
    </fieldset>
  );
}
```

- [ ] **Step 4: Run the list tests and confirm they pass**

```bash
pnpm exec vitest run tests/unit/list-input.test.tsx
```

Expected: `Tests  15 passed (15)`.

- [ ] **Step 5: Mutation checks on the list**

(a) In `add()`, replace the condition `entries.some((existing) => existing.toLowerCase() === entry.toLowerCase())` with `false`. Run the file: `refuses a duplicate in any letter case and says so in the status line` fails; 14 pass. Revert.

(b) In the box's `onKeyDown`, delete the `event.preventDefault();` line. Run the file: `does not treat Enter in the box as a form submit even when the box is empty` fails; 14 pass. Revert.

(c) In `ListInput`, change `const posted = typed !== "" && !isRepeat(typed) ? typed : "";` to `const posted = typed !== "" ? typed : "";`. Run the file: `posts nothing extra for a blank box or a case-insensitive duplicate` fails; 14 pass. Revert.

(d) In `ListInput`, delete the line `{posted !== "" ? <input type="hidden" name={name} value={posted} /> : null}`. Run the file: `posts text typed but not added as one more entry, trimmed`, `posts an over-long box as typed, for the server to refuse with its own message` and `folds the posted text into the chips and empties the box when a save succeeds` fail; 12 pass. Revert.

(e) In the save block of `ListInput`, change `if (typed === submitted) setDraft("");` to `setDraft("");`. Run the file: `folds the posted text into the chips and empties the box when a save succeeds` fails (the text typed after the submit is wiped); 14 pass. Revert.

(f) Delete the `if (!isRepeat(submitted)) setEntries([...entries, submitted]);` line. Run the file: `folds the posted text into the chips and empties the box when a save succeeds` fails; 14 pass. Revert.

(g) In `span className="min-w-0 break-words"`, delete `break-words` (or delete `break-words` from the `Badge`'s class list). Run the file: `lets an 80-character entry break inside the word, in the chip and its text` fails; 14 pass. Revert and rerun to confirm 15 pass.

- [ ] **Step 6: Write the action in full**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { fieldErrorsByPath, type FormState } from "@/lib/forms/state";
import { readPreferencesForm } from "@/lib/preferences/form";
import { preferencesSchema } from "@/lib/preferences/schema";
import { messageFor } from "@/lib/pipeline/messages";
import { savePreferences } from "@/lib/profile/store";

export async function savePreferencesAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = preferencesSchema.safeParse(readPreferencesForm(formData));
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: fieldErrorsByPath(parsed.error) };
  }
  await savePreferences(scopedFor(user.id), parsed.data);
  // Hard filters show on every job page and in the bridge context, and the
  // Home reminder days change what Home lists, so the whole app re-renders.
  revalidatePath("/", "layout");
  return { ok: true };
}
```

- [ ] **Step 7: Run the action tests and confirm they pass**

```bash
pnpm exec vitest run tests/integration/preferences-actions.test.ts
```

Expected: `Tests  5 passed (5)`.

- [ ] **Step 8: Write the form and the page in full**

`components/preferences/preferences-form.tsx`:

```tsx
"use client";

import * as React from "react";

import { savePreferencesAction } from "@/app/(app)/preferences/actions";
import { ListInput } from "@/components/forms/list-input";
import { StackedField } from "@/components/forms/stacked-field";
import { useAnnounce } from "@/components/live-announcer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { FormState } from "@/lib/forms/state";
import { submitViaTransition } from "@/lib/forms/submit";
import { WORK_MODE_LABELS } from "@/lib/pipeline/labels";
import { WORK_MODES } from "@/lib/pipeline/values";
import { SENIORITY_LABELS, SENIORITY_LEVELS, type Preferences } from "@/lib/preferences/schema";

function FormSection({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  const headingId = React.useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-base font-semibold text-foreground">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{intro}</p>
      </div>
      {children}
    </section>
  );
}

function NumberField({
  name,
  label,
  hint,
  error,
  defaultValue,
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  defaultValue: number | null;
}) {
  return (
    <StackedField label={label} hint={hint} error={error}>
      {(id, describedBy) => (
        <Input
          id={id}
          name={name}
          type="number"
          inputMode="numeric"
          className="max-w-40"
          defaultValue={defaultValue ?? ""}
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
        />
      )}
    </StackedField>
  );
}

// Several values can be pressed. Each pressed one is posted as its own hidden
// input under `name`, which is how a form reads a list.
function ToggleField<Value extends string>({
  name,
  label,
  hint,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  hint?: string;
  options: { value: Value; label: string }[];
  defaultValue: readonly Value[];
}) {
  const id = React.useId();
  const labelId = `${id}-label`;
  const hintId = hint ? `${id}-hint` : undefined;
  const [pressed, setPressed] = React.useState<Value[]>(() => [...defaultValue]);

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-sm font-medium">
        {label}
      </span>
      <ToggleGroup
        multiple
        variant="outline"
        className="flex-wrap"
        aria-labelledby={labelId}
        aria-describedby={hintId}
        value={pressed}
        onValueChange={(next) => setPressed(next as Value[])}
      >
        {options.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {hint ? (
        <p id={hintId} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
      {pressed.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}
    </div>
  );
}

export function PreferencesForm({ preferences }: { preferences: Preferences }) {
  const announce = useAnnounce();
  const [state, formAction, pending] = React.useActionState<FormState, FormData>(savePreferencesAction, undefined);
  // A snapshot: a save re-renders the page with new props, and the uncontrolled
  // boxes keep what is on screen instead of warning about a changed default.
  const [initial] = React.useState(preferences);
  const submitRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (state?.ok) {
      announce("Preferences saved.");
    } else if (state?.ok === false) {
      // The button is disabled while the request runs, and Chromium drops
      // focus from a disabled button; the form stays mounted on a failure.
      submitRef.current?.focus();
    }
  }, [state, announce]);

  const errors = state?.ok === false ? state.fieldErrors : undefined;
  // A new object per successful save: the list boxes turn the text they held
  // at submit into chips.
  const saved = state?.ok ? state : undefined;

  return (
    // noValidate: the server's messages are the ones to show, not the
    // browser's own bubbles on a number box.
    <form noValidate onSubmit={(event) => submitViaTransition(event, formAction)} className="flex max-w-2xl flex-col gap-8">
      {state?.ok === false ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      <FormSection title="Hard filters" intro="Checked on every job page, with or without AI.">
        <ListInput
          name="titles"
          label="Job titles"
          hint="A job passes when its title contains one of these."
          error={errors?.titles}
          placeholder="Add a title"
          defaultValue={initial.titles}
          saved={saved}
        />
        <ToggleField
          name="workModes"
          label="Work modes"
          hint="A job passes when its work mode is one of these."
          options={WORK_MODES.map((mode) => ({ value: mode, label: WORK_MODE_LABELS[mode] }))}
          defaultValue={initial.workModes}
        />
        <ListInput
          name="locations"
          label="Locations"
          hint="A job passes when its location contains one of these. Remote jobs skip this check."
          error={errors?.locations}
          placeholder="Add a place"
          defaultValue={initial.locations}
          saved={saved}
        />
        <NumberField
          name="compFloor"
          label="Pay floor"
          hint="A job fails only when its stated pay tops out below this."
          error={errors?.compFloor}
          defaultValue={initial.compFloor}
        />
        <StackedField
          label="Currency"
          hint="Three letters, for example EUR. Pay in another currency is not compared."
          error={errors?.currency}
        >
          {(id, describedBy) => (
            <Input
              id={id}
              name="currency"
              className="max-w-40"
              autoCapitalize="characters"
              defaultValue={initial.currency ?? ""}
              aria-describedby={describedBy}
              aria-invalid={Boolean(errors?.currency)}
            />
          )}
        </StackedField>
      </FormSection>

      <FormSection title="For the fit score" intro="Sent to the AI model with your resume when a job is scored.">
        <ToggleField
          name="seniority"
          label="Seniority"
          options={SENIORITY_LEVELS.map((level) => ({ value: level, label: SENIORITY_LABELS[level] }))}
          defaultValue={initial.seniority}
        />
        <NumberField name="compTarget" label="Pay target" error={errors?.compTarget} defaultValue={initial.compTarget} />
        <ListInput
          name="mustHaves"
          label="Must-haves"
          error={errors?.mustHaves}
          placeholder="Add a must-have"
          defaultValue={initial.mustHaves}
          saved={saved}
        />
        <ListInput
          name="dealbreakers"
          label="Dealbreakers"
          error={errors?.dealbreakers}
          placeholder="Add a dealbreaker"
          defaultValue={initial.dealbreakers}
          saved={saved}
        />
        <ListInput
          name="industriesAvoid"
          label="Industries to avoid"
          error={errors?.industriesAvoid}
          placeholder="Add an industry"
          defaultValue={initial.industriesAvoid}
          saved={saved}
        />
        <NumberField
          name="companySize.min"
          label="Company size from"
          error={errors?.["companySize.min"]}
          defaultValue={initial.companySize.min}
        />
        <NumberField
          name="companySize.max"
          label="Company size to"
          hint="Number of people."
          error={errors?.["companySize.max"]}
          defaultValue={initial.companySize.max}
        />
        <NumberField
          name="scoreThreshold"
          label="Good fit from"
          hint="Scores at or above this count as a good fit. 0 to 100."
          error={errors?.scoreThreshold}
          defaultValue={initial.scoreThreshold}
        />
      </FormSection>

      <FormSection title="Home reminders" intro="When Home asks you to act on a quiet job.">
        <NumberField
          name="attention.followUpDays"
          label="Follow up after"
          hint="Days without news on an applied job."
          error={errors?.["attention.followUpDays"]}
          defaultValue={initial.attention.followUpDays}
        />
        <NumberField
          name="attention.savedDays"
          label="Apply or drop after"
          hint="Days a saved job can wait."
          error={errors?.["attention.savedDays"]}
          defaultValue={initial.attention.savedDays}
        />
      </FormSection>

      <Button ref={submitRef} type="submit" disabled={pending} className="self-start">
        Save preferences
      </Button>
    </form>
  );
}
```

`app/(app)/preferences/page.tsx`:

```tsx
import { PreferencesForm } from "@/components/preferences/preferences-form";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { loadProfile } from "@/lib/profile/store";

// The test box on this page fetches a posting and scores it in one request
// (up to about 45 seconds), past the framework's default.
export const maxDuration = 60;

export default async function PreferencesPage() {
  const user = await requireUser();
  const profile = await loadProfile(scopedFor(user.id));

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-lg font-semibold">Preferences</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Jobsmith checks each job against your hard filters and gives it a fit score from your resume and these
        preferences. A job that misses a filter is only flagged, never hidden.
      </p>
      <PreferencesForm preferences={profile.preferences} />
    </div>
  );
}
```

- [ ] **Step 9: Run the form tests and confirm they pass**

```bash
pnpm exec vitest run tests/unit/preferences-form.test.tsx
```

Expected: `Tests  12 passed (12)`.

Mutation check: in `PreferencesForm`, change `const saved = state?.ok ? state : undefined;` to `const saved = undefined;`. Run the same file: `saves text left in a list box as an entry, and shows it as a chip with an empty box afterwards` and `ignores a left-over duplicate and empties its box after a save` fail (the box keeps its text and no chip appears); 10 pass. Revert and rerun to confirm 12 pass.

- [ ] **Step 10: Write the end-to-end spec and rewrite the nav lines**

`tests/e2e/preferences.spec.ts`:

```typescript
import { test, expect, type Page } from "@playwright/test";
import { scanForViolations } from "./axe";
import { login } from "./session";

// Chromium and WebKit run this file at the same time against one account, so
// each test only makes sure a value is there and never removes one: whichever
// project saves last saves the same thing.

async function ensureTitle(page: Page, title: string) {
  const titles = page.getByRole("group", { name: "Job titles" });
  const remove = titles.getByRole("button", { name: `Remove ${title}` });
  if ((await remove.count()) === 0) {
    await titles.getByLabel("New entry for Job titles").fill(title);
    await page.keyboard.press("Enter");
    await expect(remove).toBeVisible();
  }
}

// Types a must-have into its box and leaves it there, without Enter or Add:
// pressing Save preferences has to keep it. Every test here that saves also
// leaves it in the box, so a save from another project never removes it.
async function leaveMustHaveInBox(page: Page, text: string) {
  const mustHaves = page.getByRole("group", { name: "Must-haves" });
  if ((await mustHaves.getByRole("button", { name: `Remove ${text}` }).count()) === 0) {
    await mustHaves.getByLabel("New entry for Must-haves").fill(text);
  }
}

async function ensureRemotePressed(page: Page) {
  const remote = page.getByRole("button", { name: "Remote", exact: true });
  if ((await remote.getAttribute("aria-pressed")) !== "true") await remote.click();
  await expect(remote).toHaveAttribute("aria-pressed", "true");
}

test("Preferences keeps a title added with the keyboard and a pressed work mode after a reload", async ({ page }) => {
  await login(page);
  await page.goto("/preferences");
  await expect(page.getByRole("heading", { level: 1, name: "Preferences" })).toBeVisible();
  for (const name of ["Hard filters", "For the fit score", "Home reminders"]) {
    await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
  }

  await ensureTitle(page, "Product Designer");
  await ensureRemotePressed(page);
  await leaveMustHaveInBox(page, "Design reviews");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Preferences saved." })).toBeVisible();

  // The text left in the box was saved as an entry: it is a chip now and the
  // box is empty.
  const mustHaves = page.getByRole("group", { name: "Must-haves" });
  await expect(mustHaves.getByRole("button", { name: "Remove Design reviews" })).toBeVisible();
  await expect(mustHaves.getByLabel("New entry for Must-haves")).toHaveValue("");

  await page.reload();
  await expect(
    page.getByRole("group", { name: "Job titles" }).getByRole("button", { name: "Remove Product Designer" }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Must-haves" }).getByRole("button", { name: "Remove Design reviews" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Remote", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("Preferences shows the size range error under the field and returns focus to Save preferences", async ({
  page,
}) => {
  await login(page);
  await page.goto("/preferences");

  await page.getByLabel("Company size from").fill("50");
  await page.getByLabel("Company size to").fill("10");
  await page.getByRole("button", { name: "Save preferences" }).click();

  await expect(page.getByText("The smallest size must not be above the largest.")).toBeVisible();
  await expect(page.getByLabel("Company size to")).toHaveAttribute("aria-invalid", "true");
  // Next's route announcer is a second element with role "alert", so the
  // alert is found by its text.
  await expect(page.getByRole("alert").filter({ hasText: "Check the highlighted fields." })).toHaveText(
    "Check the highlighted fields.",
  );
  await expect(page.getByRole("button", { name: "Save preferences" })).toBeFocused();
});

test("Preferences has no accessibility violations", async ({ page }, testInfo) => {
  await login(page);
  await page.goto("/preferences");
  await expect(page.getByRole("heading", { level: 1, name: "Preferences" })).toBeVisible();
  await scanForViolations(page, "preferences form", testInfo);
});
```

`tests/e2e/nav.spec.ts` (the Preferences step of the desktop test):

```diff
@@ -42,10 +42,7 @@ test("desktop: the sidebar lists six sections, Companies shows a job under its c
 
   await page.goto("/preferences");
   await expect(page.getByRole("heading", { level: 1, name: "Preferences" })).toBeVisible();
-  await expect(page.getByText("Preferences come with fit scoring.")).toBeVisible();
-  await expect(
-    page.getByText("Titles, locations, pay floor and dealbreakers will live here, and new jobs get scored against them."),
-  ).toBeVisible();
+  await expect(page.getByRole("heading", { level: 2, name: "Hard filters" })).toBeVisible();
   await scanForViolations(page, "preferences", testInfo);
 });
 
```

`playwright.config.ts`:

```diff
@@ -23,13 +23,13 @@ export default defineConfig({
     },
     {
       name: "chromium",
-      testMatch: /(shell|pipeline|job-page|documents|bridge|nav|intake|settings)\.spec\.ts$/,
+      testMatch: /(shell|pipeline|job-page|documents|bridge|nav|intake|settings|preferences)\.spec\.ts$/,
       dependencies: ["first-run"],
       use: { ...devices["Desktop Chrome"] },
     },
     {
       name: "webkit",
-      testMatch: /(shell|pipeline|job-page|documents|bridge|nav|intake|settings)\.spec\.ts$/,
+      testMatch: /(shell|pipeline|job-page|documents|bridge|nav|intake|settings|preferences)\.spec\.ts$/,
       dependencies: ["first-run"],
       use: { ...devices["Desktop Safari"] },
     },
```

These specs are type-checked here and run in the end-to-end gate. Their selectors: the list is `getByRole("group", { name: "Job titles" })` (the fieldset and its legend), the text box inside it is `getByLabel("New entry for Job titles")`, a chip's button is `getByRole("button", { name: "Remove Product Designer" })`, the toggle is `getByRole("button", { name: "Remote", exact: true })` with `aria-pressed`, and the saved announcement is read from the live region with `getByRole("status").filter({ hasText: "Preferences saved." })`.

- [ ] **Step 11: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Expected: all three exit 0. At the end of this task the suite reports `Test Files  144 passed | 1 skipped (145)` and `Tests  1582 passed | 2 skipped (1584)` (the two skipped tests are the live AI smoke tests).

- [ ] **Step 12: Commit**

```bash
git add components/forms/list-input.tsx components/preferences/preferences-form.tsx app/\(app\)/preferences/page.tsx app/\(app\)/preferences/actions.ts tests/unit/list-input.test.tsx tests/unit/preferences-form.test.tsx tests/integration/preferences-actions.test.ts tests/e2e/preferences.spec.ts tests/e2e/nav.spec.ts playwright.config.ts
git commit -m "$(cat <<'EOF'
feat: add the Preferences page with list inputs and a save action

EOF
)"
```

End the message with the co-author trailer supplied by the executing session.
