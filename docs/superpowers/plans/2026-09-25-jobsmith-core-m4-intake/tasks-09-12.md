# Jobsmith Core Milestone 4 (Intake): Tasks 9 to 12

Part of the Milestone 4 plan. Read `README.md` first: it holds the goal, the global constraints and
the Contract (called "the README" in the task text below) that these tasks follow. These four tasks
build the user-facing half of intake on top of Tasks 1 to 8's pure library, AI and server-action
layer: the Add job dialog's three new states, the posting rendered as markdown with a review notice
on the job page, end-to-end coverage of the whole flow, and the docs that ship it.

Every accessible name, announcement, toast and validation message below is copied character for
character from `README.md`'s "UI copy and accessible names" section. Every signature is copied
character for character from `README.md`'s Contract. A Sonnet builder implementing one of these
tasks sees only that task's own text, so each one restates the props, copy and risks it needs rather
than pointing back at an earlier task's prose.

---

### Task 9: The Add job dialog

**Files:**
- Modify: `components/board/add-job-dialog.tsx`, `lib/forms/submit.ts`
- Create: `tests/unit/add-job-dialog.test.tsx`
- Modify: `tests/unit/form-submit.test.ts`

**Interfaces:**
- Consumes, from Task 8 (`lib/intake/state.ts`, `lib/intake/messages.ts`, `app/(app)/board/actions.ts`):
  `addJobAction(_prev: AddJobState, formData: FormData): Promise<AddJobState>`; `type AddJobState =
  undefined | { ok: true; data: AddedJob } | { ok: false; code: AddJobFailureCode; message: string;
  fieldErrors?: Record<string, string>; href?: string; draft?: string }`; `type AddedJob = { slug:
  string; roleTitle: string; companyName: string; note: "none" | "review" | "link_only" }`;
  `draftFor(state: AddJobState, dropped: string | null): string`; `PENDING_MESSAGE: string`;
  `addedAnnouncement(data: AddedJob): string`. The dialog reads `state.message` and
  `state.fieldErrors` directly wherever the README's `NEEDS_TEXT_MESSAGES`, `NEEDS_DETAILS_MESSAGES`,
  `DUPLICATE_MESSAGE` and `POSTING_TEXT_HINT` are named in the Contract's UI copy section: those are
  already baked into `state.message`/`state.fieldErrors` by `addJobAction` (Task 8's own mapping), so
  this component never imports them itself. `PENDING_MESSAGE` and `addedAnnouncement` are the only
  two names it imports from `lib/intake/messages.ts`, because the pending line has no server round
  trip to embed text into, and the success announcement has no `message` field on `AddJobState` at
  all to read from.
- Consumes, unchanged: `useAnnounce` (`@/components/live-announcer`); `FieldRow`
  (`@/components/super-ai/field-row`); `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`,
  `DialogDescription`, `DialogFooter` (`@/components/ui/dialog`); `RadioGroup`, `RadioGroupItem`
  (`@/components/ui/radio-group`); `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`,
  `SelectValue` (`@/components/ui/select`); `Textarea` (`@/components/ui/textarea`); `Input`
  (`@/components/ui/input`); `Label` (`@/components/ui/label`); `Button` (`@/components/ui/button`);
  `STAGE_KINDS` (`@/lib/pipeline/kinds`).
- Produces (copied from the README character for character):

```typescript
// lib/forms/submit.ts
export const UNREADABLE_INPUT_VALUE = "unreadable";
export function submitFormData(form: HTMLFormElement, dispatch: (formData: FormData) => void, extra?: Record<string, string>): void;
export function submitViaTransition(event: React.FormEvent<HTMLFormElement>, dispatch: (formData: FormData) => void): void;
// components/board/add-job-dialog.tsx
export function AddJobDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; companyNames: string[] }): React.ReactElement;
```

**What changed and why.** D28 splits `submitViaTransition` into a lower-level `submitFormData` (form,
dispatch, optional extra entries) that it now calls internally, so "Add anyway" - a `type="button"`
with no submit event to call `preventDefault` on - can reach the exact same FormData-building and
unreadable-number-stand-in logic a real submit does, plus one extra entry (`intent: "add_anyway"`).
D2 moves `Link to the posting` and `Posting text` to the top of the form, ahead of `Company` and
`Role`; D7 adds a hidden `draft` field that round-trips a resolved posting so a second submit never
re-fetches or re-calls the model; D29 keeps `Add a job`, `Company`, `Role` and `Add job` exactly as
they are today, and keeps `addJobAndOpen` (`tests/e2e/session.ts`) working with no change to that
file.

**Verified while this plan was written:** the dialog and test file below were run against this repo's own installed React 19, Testing Library, Base UI and
Vitest, with three throwaway stand-ins for `lib/intake/state.ts`, `lib/intake/messages.ts` and
`addJobAction`. Three things surfaced
that are not obvious from reading the contract alone, and are baked into the test file below:

1. **This repo has no `@testing-library/jest-dom`.** Every existing `tests/unit/*.test.tsx` file was
   grepped for `toBeInTheDocument`/`toHaveFocus`/`toHaveAttribute`/`toBeDisabled`/`toHaveValue`: zero
   uses, and the package is not in `package.json`. The test below reads the DOM directly instead
   (`document.activeElement`, `.getAttribute(...)`, `.disabled`, `.value`), the same style
   `copy-button.test.tsx` already uses. Do not add the package to make a jest-dom matcher work; match
   the existing style instead.
2. **Setting `.value` and dispatching a bare `Event("input")` never fires React's `onChange`.** The
   value read back off the node afterward is correct (which is why this trap is easy to miss - a
   focus/value assertion elsewhere in the same test can still pass), but the component's own
   `onChange` handler silently never runs, because React's `ChangeEventPlugin` value tracker does not
   register the change that way. `fireEvent.change(field, { target: { value } })` from
   `@testing-library/react` (already a dependency, via `@testing-library/dom`) goes through the
   native property setter the tracker expects and fires `onChange` reliably. The "hidden draft input
   disappears once Link to the posting changes" test below only passes with `fireEvent.change`; it
   silently fails to prove anything (the input stays in the DOM, and no error is raised) with a raw
   `dispatchEvent`.
3. **Base UI's Dialog schedules its own initial-open focus through a `requestAnimationFrame`.**
   Confirmed by reading `node_modules/@base-ui/react/floating-ui-react/utils/enqueueFocus.js`. In a
   real browser this settles within one frame, long before a user could fill the form and get a
   response back, so it never collides with anything - this is why `pipeline.spec.ts`'s and
   `addJobAndOpen`'s own focus assertions never needed a settle step. In jsdom's compressed timeline
   it can fire *late*, after this component's own effect-driven `ref.current?.focus()` call for
   `needs_text`/`needs_details`/`duplicate`/error already ran and set focus correctly, and silently
   revert it back to the dialog's first field one macrotask later. Flushing one macrotask tick (`await
   act(async () => { await new Promise((r) => setTimeout(r, 0)); })`) immediately after `render()`,
   before the test does anything else, lets that queued call settle first, exactly the way a real
   browser's own next paint would - `renderDialog()` below does this once, so every test built on it
   is trustworthy. Skipping this step does not make the test flaky; it makes every focus assertion
   after the very first one fail deterministically, every run.

- [ ] **Step 1: Write the failing test additions to `tests/unit/form-submit.test.ts`**

Replace the file in full (the six existing tests stay unchanged; only the import line and a new
`describe("submitFormData", ...)` block are added):

```typescript
// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";

const startTransitionMock = vi.fn((callback: () => void) => callback());

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, startTransition: startTransitionMock };
});

// Imported after the mock so submit.ts's own `import { startTransition }
// from "react"` binds to the mock above, not the real implementation.
const { submitFormData, submitViaTransition, UNREADABLE_INPUT_VALUE } = await import("@/lib/forms/submit");

function makeFormEvent(fields: Record<string, string>, extraInputs: HTMLInputElement[] = []) {
  const form = document.createElement("form");
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  for (const input of extraInputs) form.appendChild(input);
  document.body.appendChild(form);

  let defaultPrevented = false;
  const event = {
    currentTarget: form,
    preventDefault: () => {
      defaultPrevented = true;
    },
  } as unknown as React.FormEvent<HTMLFormElement>;

  return { event, wasDefaultPrevented: () => defaultPrevented };
}

// jsdom has no typing that can go wrong, so it never reports badInput. A
// number box holding "12e" in Chromium or WebKit reports the value "" with
// validity.badInput true (and so valid false); `unreadable` stubs exactly
// that state.
function numberInput(name: string, { unreadable = false, disabled = false } = {}): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "number";
  input.name = name;
  input.disabled = disabled;
  if (unreadable) {
    Object.defineProperty(input, "validity", {
      value: {
        badInput: true,
        customError: false,
        patternMismatch: false,
        rangeOverflow: false,
        rangeUnderflow: false,
        stepMismatch: false,
        tooLong: false,
        tooShort: false,
        typeMismatch: false,
        valid: false,
        valueMissing: false,
      },
    });
  }
  return input;
}

function sentFormData(dispatch: ReturnType<typeof vi.fn>): FormData {
  expect(dispatch).toHaveBeenCalledTimes(1);
  return dispatch.mock.calls[0]![0] as FormData;
}

describe("submitViaTransition", () => {
  beforeEach(() => {
    startTransitionMock.mockClear();
  });

  it("prevents the native form submit", () => {
    const { event, wasDefaultPrevented } = makeFormEvent({ text: "hello" });
    submitViaTransition(event, vi.fn());
    expect(wasDefaultPrevented()).toBe(true);
  });

  it("passes the form's own FormData to the dispatch function", () => {
    const { event } = makeFormEvent({ companyName: "Acme", roleTitle: "Designer" });
    const dispatch = vi.fn();
    submitViaTransition(event, dispatch);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const formData = dispatch.mock.calls[0]![0] as FormData;
    expect(formData.get("companyName")).toBe("Acme");
    expect(formData.get("roleTitle")).toBe("Designer");
  });

  it("runs the dispatch call inside a React transition", () => {
    const { event } = makeFormEvent({ text: "hello" });
    const dispatch = vi.fn();
    submitViaTransition(event, dispatch);
    expect(startTransitionMock).toHaveBeenCalledTimes(1);
    // The dispatch call must happen INSIDE the callback startTransition was
    // given, not before it - proven here because the mock only invokes
    // dispatch by calling that callback itself.
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  // FormData reads such a box as "", which is what a blank box sends, and
  // the server would save the field as blank: Add job would drop the figure
  // and Edit details would clear the stored one.
  it("sends the stand-in, not a blank, for a number box whose text the browser could not read", () => {
    const { event } = makeFormEvent({ companyName: "Acme" }, [numberInput("compMin", { unreadable: true })]);
    const dispatch = vi.fn();
    submitViaTransition(event, dispatch);
    const formData = sentFormData(dispatch);
    expect(formData.get("compMin")).toBe(UNREADABLE_INPUT_VALUE);
    expect(formData.get("companyName")).toBe("Acme");
  });

  it("still sends an empty number box as blank", () => {
    const { event } = makeFormEvent({}, [numberInput("compMin")]);
    const dispatch = vi.fn();
    submitViaTransition(event, dispatch);
    expect(sentFormData(dispatch).get("compMin")).toBe("");
  });

  it("adds nothing for an unreadable box the form does not submit", () => {
    const { event } = makeFormEvent({}, [numberInput("compMin", { unreadable: true, disabled: true })]);
    const dispatch = vi.fn();
    submitViaTransition(event, dispatch);
    expect(sentFormData(dispatch).has("compMin")).toBe(false);
  });
});

describe("submitFormData", () => {
  beforeEach(() => {
    startTransitionMock.mockClear();
  });

  it("sends the form's own fields plus every extra entry", () => {
    const form = document.createElement("form");
    const input = document.createElement("input");
    input.name = "roleTitle";
    input.value = "Designer";
    form.appendChild(input);
    document.body.appendChild(form);

    const dispatch = vi.fn();
    submitFormData(form, dispatch, { intent: "add_anyway" });
    const formData = sentFormData(dispatch);
    expect(formData.get("roleTitle")).toBe("Designer");
    expect(formData.get("intent")).toBe("add_anyway");
  });

  it("still applies the unreadable stand-in when extra entries are given", () => {
    const form = document.createElement("form");
    form.appendChild(numberInput("compMin", { unreadable: true }));
    document.body.appendChild(form);

    const dispatch = vi.fn();
    submitFormData(form, dispatch, { intent: "add_anyway" });
    const formData = sentFormData(dispatch);
    expect(formData.get("compMin")).toBe(UNREADABLE_INPUT_VALUE);
    expect(formData.get("intent")).toBe("add_anyway");
  });

  it("sends no extra entries when none are given", () => {
    const form = document.createElement("form");
    const input = document.createElement("input");
    input.name = "roleTitle";
    input.value = "Designer";
    form.appendChild(input);
    document.body.appendChild(form);

    const dispatch = vi.fn();
    submitFormData(form, dispatch);
    const formData = sentFormData(dispatch);
    expect(formData.get("roleTitle")).toBe("Designer");
    expect(formData.has("intent")).toBe(false);
  });

  it("runs the dispatch call inside a React transition", () => {
    const form = document.createElement("form");
    document.body.appendChild(form);
    const dispatch = vi.fn();
    submitFormData(form, dispatch);
    expect(startTransitionMock).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/unit/form-submit.test.ts
```

Expected: the six `submitViaTransition` tests still pass; every `submitFormData` test fails
(`submitFormData is not a function` - the export does not exist yet).

- [ ] **Step 3: Write `lib/forms/submit.ts` in full**

```typescript
import { startTransition, type FormEvent } from "react";

/**
 * Sent in place of a field whose text the browser could not read. A number
 * box holding text like "12e" reports `validity.badInput` and the value "",
 * and script has no way to read the text itself, so this fixed string
 * stands in for it. It is not blank and not a number, so the server
 * actions reject it with their usual "Enter a number." instead of reading
 * it as a blank box (which Add job takes as "no figure" and Edit details
 * as "clear the figure").
 */
export const UNREADABLE_INPUT_VALUE = "unreadable";

/**
 * Builds `form`'s own FormData, replacing any field whose text the browser
 * could not read with UNREADABLE_INPUT_VALUE, sets every entry in `extra`
 * on top (added or overwritten), and calls `dispatch` with the result
 * inside a transition, so React 19 never runs requestFormReset (see
 * submitViaTransition's own comment below for why that matters).
 *
 * `submitViaTransition` is this function's own thin wrapper around a real
 * submit event. A control with no submit event to prevent the default on -
 * the Add job dialog's "Add anyway", a type="button" that still has to
 * reach the same FormData-building and stand-in logic, plus one extra
 * `intent` entry - calls this directly instead.
 */
export function submitFormData(
  form: HTMLFormElement,
  dispatch: (formData: FormData) => void,
  extra?: Record<string, string>,
): void {
  const formData = new FormData(form);
  for (const element of form.elements) {
    // `has` skips fields FormData left out on purpose (unnamed or disabled).
    if (element instanceof HTMLInputElement && element.validity.badInput && formData.has(element.name)) {
      formData.set(element.name, UNREADABLE_INPUT_VALUE);
    }
  }
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      formData.set(key, value);
    }
  }
  startTransition(() => {
    dispatch(formData);
  });
}

/**
 * Shared submit path for every form here that is wired to a
 * `useActionState` dispatch function. React 19 calls `requestFormReset`
 * after every native `<form action={fn}>` dispatch settles, regardless of
 * success or failure, which resets every uncontrolled field back to its
 * `defaultValue` - wiping whatever the user typed even when the server
 * rejected the submission (confirmed empirically against add-job-dialog.tsx
 * and edit-details-dialog.tsx). Calling `dispatch`
 * directly, inside a transition, instead of wiring it to the form's own
 * `action` prop, never enters that native dispatch path, so
 * `requestFormReset` never fires.
 *
 * `dispatch` is a `useActionState` dispatch function (or anything with the
 * same `(formData: FormData) => void` shape) - the same one that would
 * otherwise be passed as `<form action={dispatch}>`.
 */
export function submitViaTransition(
  event: FormEvent<HTMLFormElement>,
  dispatch: (formData: FormData) => void,
): void {
  event.preventDefault();
  submitFormData(event.currentTarget, dispatch);
}
```

- [ ] **Step 4: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/form-submit.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 10 passed (10)` (6 `submitViaTransition` + 4
`submitFormData`).

- [ ] **Step 5: Write the failing test `tests/unit/add-job-dialog.test.tsx`**

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { addJobAction } from "@/app/(app)/board/actions";
import { AddJobDialog } from "@/components/board/add-job-dialog";

// This repo has no @testing-library/jest-dom (confirmed: grepping every
// existing tests/unit/*.test.tsx for toBeInTheDocument/toHaveFocus/
// toHaveAttribute/toBeDisabled/toHaveValue found zero uses, and the package
// is not in package.json), so every assertion below reads the DOM directly
// instead of reaching for a jest-dom matcher - the same style
// copy-button.test.tsx already uses. Field values are set with
// fireEvent.change, never a raw `el.value = x` plus a manually dispatched
// Event: a manual dispatch leaves the value visible on the node (a later
// `.value` read looks right) but never runs through React's own
// ChangeEventPlugin value tracker, so the component's onChange handler
// silently never fires. fireEvent.change goes through the native property
// setter the tracker expects and fires onChange reliably, the same as a
// real keystroke would.
vi.mock("@/app/(app)/board/actions", () => ({ addJobAction: vi.fn() }));

const mockedAction = vi.mocked(addJobAction);

async function renderDialog() {
  const onOpenChange = vi.fn();
  render(
    <LiveAnnouncerProvider>
      <AddJobDialog open onOpenChange={onOpenChange} companyNames={["Northwind Traders"]} />
    </LiveAnnouncerProvider>,
  );
  const dialog = screen.getByRole("dialog", { name: "Add a job" });
  // Base UI's Dialog schedules its own initial-open focus through
  // enqueueFocus (node_modules/@base-ui/react/floating-ui-react/utils/
  // enqueueFocus.js), a requestAnimationFrame-deferred call. In a real
  // browser that settles within one frame, long before a user could fill
  // the form and get a response back, so it never collides with this
  // dialog's own later, state-driven focus changes. In jsdom's compressed
  // timeline it can fire late and stomp on a focus change made afterward
  // for an unrelated reason - verified directly while drafting this task:
  // the very same effect-driven `ref.current?.focus()` call that holds
  // reliably once this tick has already run gets silently reverted one
  // macrotask later without it. Flushing it here, before a test does
  // anything else, is what makes every focus assertion below trustworthy.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { onOpenChange, dialog };
}

async function fillAndSubmit(fields: Record<string, string>) {
  for (const [label, value] of Object.entries(fields)) {
    const field = screen.getByLabelText(label);
    await act(async () => {
      fireEvent.change(field, { target: { value } });
    });
  }
  const dialog = screen.getByRole("dialog", { name: "Add a job" });
  await act(async () => {
    fireEvent.click(within(dialog).getByRole("button", { name: "Add job" }));
    await Promise.resolve();
  });
}

describe("AddJobDialog", () => {
  beforeEach(() => {
    mockedAction.mockReset();
  });

  it("needs_text: shows the alert, hints Posting text, and focuses Posting text", async () => {
    mockedAction.mockResolvedValue({
      ok: false,
      code: "needs_text",
      message: "This site needs a login, so Jobsmith cannot read the link. Paste the posting text instead.",
      fieldErrors: { postingText: "Paste the posting here." },
    });
    const { dialog } = await renderDialog();
    await fillAndSubmit({ "Link to the posting": "https://www.linkedin.com/jobs/view/1" });

    expect(within(dialog).getByRole("alert").textContent).toBe(
      "This site needs a login, so Jobsmith cannot read the link. Paste the posting text instead.",
    );
    expect(within(dialog).queryByText("Paste the posting here.")).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText("Posting text"));
    // link kept: nothing clears the sourceUrl field on a failed submit.
    expect((screen.getByLabelText("Link to the posting") as HTMLInputElement).value).toBe(
      "https://www.linkedin.com/jobs/view/1",
    );
  });

  it("needs_details: focuses Company when it was blank, and carries a hidden draft", async () => {
    mockedAction.mockResolvedValue({
      ok: false,
      code: "needs_details",
      message: "Jobsmith could not read the company and role from the posting. Add them to save the job.",
      fieldErrors: { companyName: "Enter a company name.", roleTitle: "Enter a role." },
      draft: '{"v":1,"bodyMd":"About the job"}',
    });
    const { dialog } = await renderDialog();
    await fillAndSubmit({ "Posting text": "About the job" });

    expect(document.activeElement).toBe(screen.getByLabelText("Company"));
    const hidden = dialog.querySelector('input[name="draft"]') as HTMLInputElement | null;
    expect(hidden).not.toBeNull();
    expect(hidden!.value).toBe('{"v":1,"bodyMd":"About the job"}');
  });

  it("needs_details: focuses Role instead when Company was filled but Role was blank", async () => {
    mockedAction.mockResolvedValue({
      ok: false,
      code: "needs_details",
      message: "Jobsmith could not read the company and role from the posting. Add them to save the job.",
      fieldErrors: { roleTitle: "Enter a role." },
    });
    await renderDialog();
    await fillAndSubmit({ "Posting text": "About the job", Company: "Northwind Traders" });
    expect(document.activeElement).toBe(screen.getByLabelText("Role"));
  });

  it("the hidden draft input disappears once Link to the posting changes", async () => {
    mockedAction.mockResolvedValue({
      ok: false,
      code: "needs_details",
      message: "Jobsmith could not read the company and role from the posting. Add them to save the job.",
      fieldErrors: { companyName: "Enter a company name." },
      draft: '{"v":1,"bodyMd":"About the job"}',
    });
    const { dialog } = await renderDialog();
    await fillAndSubmit({ "Posting text": "About the job" });
    expect(dialog.querySelector('input[name="draft"]')).not.toBeNull();

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Link to the posting"), {
        target: { value: "https://example.com/jobs/1" },
      });
    });
    expect(dialog.querySelector('input[name="draft"]')).toBeNull();
  });

  it("duplicate: alert reads You already have this job., shows Open it, and focuses Add anyway", async () => {
    mockedAction.mockResolvedValue({
      ok: false,
      code: "duplicate",
      message: "You already have this job.",
      href: "/jobs/acme-designer",
    });
    const { dialog } = await renderDialog();
    await fillAndSubmit({ Company: "Northwind Traders", Role: "Designer" });

    const alert = within(dialog).getByRole("alert");
    expect(alert.textContent).toContain("You already have this job.");
    const openIt = within(dialog).getByRole("link", { name: "Open it" });
    expect(openIt.getAttribute("href")).toBe("/jobs/acme-designer");
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Add anyway" }));
  });

  it('"Add anyway" resubmits with intent=add_anyway, and Enter in a field never sends an intent', async () => {
    mockedAction.mockResolvedValue({
      ok: false,
      code: "duplicate",
      message: "You already have this job.",
      href: "/jobs/acme-designer",
    });
    const { dialog } = await renderDialog();
    await fillAndSubmit({ Company: "Northwind Traders", Role: "Designer" });

    expect(mockedAction).toHaveBeenCalledTimes(1);
    const firstCall = mockedAction.mock.calls[0]![1] as FormData;
    expect(firstCall.has("intent")).toBe(false);

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Add anyway" }));
      await Promise.resolve();
    });
    expect(mockedAction).toHaveBeenCalledTimes(2);
    const secondCall = mockedAction.mock.calls[1]![1] as FormData;
    expect(secondCall.get("intent")).toBe("add_anyway");
  });

  it("Error row (invalid): the alert holds only the message text, and focus returns to Add job", async () => {
    mockedAction.mockResolvedValue({
      ok: false,
      code: "invalid",
      message: "Check the highlighted fields.",
      fieldErrors: { compMin: "Enter a whole number." },
    });
    const { dialog } = await renderDialog();
    await fillAndSubmit({ Company: "Northwind Traders", Role: "Designer" });

    expect(within(dialog).getByRole("alert").textContent).toBe("Check the highlighted fields.");
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Add job" }));
  });

  it("ok: closes the dialog and announces the added-with-review sentence", async () => {
    mockedAction.mockResolvedValue({
      ok: true,
      data: { slug: "acme-designer", roleTitle: "Designer", companyName: "Northwind Traders", note: "review" },
    });
    const { onOpenChange } = await renderDialog();
    await fillAndSubmit({ "Posting text": "About the job" });

    expect(onOpenChange).toHaveBeenCalledWith(false);
    // useAnnounce (components/live-announcer.tsx) clears its live region
    // and sets the real text on a 50ms setTimeout, specifically so the same
    // sentence announced twice in a row still counts as two DOM mutations
    // for assistive tech - so this waits past that delay before reading it.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    // The announcer's own status div lives outside the dialog (it is
    // LiveAnnouncerProvider's own sibling node, not part of AddJobForm's
    // markup), so it is queried directly rather than scoped `within(dialog)`.
    const statusNodes = screen.getAllByRole("status", { hidden: true });
    const announced = statusNodes.map((node) => node.textContent).find((text) => text && text.length > 0);
    expect(announced).toBe("Added Designer at Northwind Traders. Check its details on the job page.");
  });

  it("pending: shows the reading-the-posting line only when a link or text was submitted with no draft, and disables Add job but never Cancel", async () => {
    let resolveAction!: (value: unknown) => void;
    mockedAction.mockReturnValue(
      new Promise((resolve) => {
        resolveAction = resolve;
      }),
    );
    const { dialog } = await renderDialog();

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Link to the posting"), {
        target: { value: "https://example.com/jobs/1" },
      });
    });

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Add job" }));
    });

    expect(within(dialog).getByRole("status").textContent).toBe(
      "Reading the posting. This can take a few seconds.",
    );
    expect((within(dialog).getByRole("button", { name: "Add job" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(dialog).getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(false);

    await act(async () => {
      resolveAction({ ok: false, code: "invalid", message: "Check the highlighted fields." });
      await Promise.resolve();
    });
    expect(within(dialog).getByRole("status").textContent).toBe("");
  });
});
```

- [ ] **Step 6: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/unit/add-job-dialog.test.tsx
```

Expected: fails against today's dialog - `screen.getByLabelText("Link to the posting")` throws
(`Unable to find a label with the text of: Link to the posting`), since that field and the whole
three-state alert machinery do not exist in the current `add-job-dialog.tsx` yet.

- [ ] **Step 7: Write `components/board/add-job-dialog.tsx` in full**

Not a diff: the dialog changes too much (D2's field reorder, D7's draft round-trip, D28's
`submitFormData`, and the whole three-state alert/focus machinery in place of the old single
`state?.ok === false` branch).

```tsx
"use client";

import * as React from "react";
import Link from "next/link";

import { addJobAction } from "@/app/(app)/board/actions";
import { useAnnounce } from "@/components/live-announcer";
import { FieldRow } from "@/components/super-ai/field-row";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { STAGE_KINDS } from "@/lib/pipeline/kinds";
import { submitViaTransition, submitFormData } from "@/lib/forms/submit";
import { draftFor, type AddJobState } from "@/lib/intake/state";
import { PENDING_MESSAGE, addedAnnouncement } from "@/lib/intake/messages";

// Base UI's <Select.Value> resolves its label purely from the Root's own
// `items` prop (node_modules/@base-ui/react/select/value/SelectValue.js:
// resolveSelectedLabel(value, items)), never from having once rendered a
// matching <Select.Item> - without it, a closed Select shows the raw
// stored value ("saved") until the popup has been opened at least once.
// Fixed here so every Select in the app follows the same pattern.
const STAGE_KIND_ITEMS: Record<string, string> = Object.fromEntries(
  STAGE_KINDS.map((stage) => [stage.kind, stage.columnTitle]),
);

// Postgres's `integer` columns (comp_min, comp_max) top out here - matches
// the bound createOpportunitySchema/addJobFormSchema enforce server-side;
// the input's own `max` gives the browser's native stepper/validation the
// same ceiling.
const MAX_COMP = 2_147_483_647;

// The three codes whose alert row reads as an informational, in-between
// state (foreground text) rather than an actual error (destructive text):
// needing more of the posting, needing company and role, or a duplicate
// are none of them a mistake the user made.
function isErrorCode(code: string): boolean {
  return code !== "needs_text" && code !== "needs_details" && code !== "duplicate";
}

interface AddJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyNames: string[];
}

export function AddJobDialog({ open, onOpenChange, companyNames }: AddJobDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/*
          AddJobForm owns useActionState and is a genuinely separate
          component, not inline JSX here, on purpose - see the identical
          reasoning in the Milestone 2 version of this file: AddJobDialog
          itself is a stable sibling in board.tsx that never unmounts, so a
          hook called directly in ITS body would keep its state forever,
          surviving every close/reopen. Base UI's DialogPortal genuinely
          unmounts whatever is inside DialogContent once closed, so a fresh
          AddJobForm - with a fresh useActionState starting at `undefined` -
          mounts the next time it opens.
        */}
        <AddJobForm onOpenChange={onOpenChange} companyNames={companyNames} />
      </DialogContent>
    </Dialog>
  );
}

function computeHadSource(formData: FormData, draft: string): boolean {
  // A draft round-trips the already-resolved posting: addJob uses it
  // instead of resolving again, so no fetch or model call happens even
  // when Link to the posting/Posting text still hold values, and the
  // pending line has nothing true to say in that case.
  if (draft !== "") return false;
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim();
  const postingText = String(formData.get("postingText") ?? "").trim();
  return sourceUrl !== "" || postingText !== "";
}

function AddJobForm({
  onOpenChange,
  companyNames,
}: {
  onOpenChange: (open: boolean) => void;
  companyNames: string[];
}) {
  const [state, formAction, pending] = React.useActionState<AddJobState, FormData>(addJobAction, undefined);
  const announce = useAnnounce();
  const companyListId = React.useId();

  const formRef = React.useRef<HTMLFormElement>(null);
  const postingTextRef = React.useRef<HTMLTextAreaElement>(null);
  const companyRef = React.useRef<HTMLInputElement>(null);
  const roleRef = React.useRef<HTMLInputElement>(null);
  const submitRef = React.useRef<HTMLButtonElement>(null);
  const addAnywayRef = React.useRef<HTMLButtonElement>(null);

  const [droppedDraft, setDroppedDraft] = React.useState<string | null>(null);
  const draft = draftFor(state, droppedDraft);

  // What the LAST submit (normal or "Add anyway") actually sent, read back
  // by the focus/pending effects below once the action responds - reading
  // live form values at that point would race whatever the user has typed
  // since, since submitFormData never resets the form itself (its whole
  // point: React 19's requestFormReset never fires because this app never
  // wires <form action={dispatch}> directly).
  const lastSubmitted = React.useRef<{ companyName: string; roleTitle: string; hadSource: boolean }>({
    companyName: "",
    roleTitle: "",
    hadSource: false,
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    lastSubmitted.current = {
      companyName: String(data.get("companyName") ?? ""),
      roleTitle: String(data.get("roleTitle") ?? ""),
      hadSource: computeHadSource(data, draft),
    };
    submitViaTransition(event, formAction);
  }

  function handleAddAnyway() {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    lastSubmitted.current = {
      companyName: String(data.get("companyName") ?? ""),
      roleTitle: String(data.get("roleTitle") ?? ""),
      hadSource: computeHadSource(data, draft),
    };
    submitFormData(form, formAction, { intent: "add_anyway" });
  }

  function handleSourceOrTextChange() {
    if (draft !== "") setDroppedDraft(draft);
  }

  React.useEffect(() => {
    if (state === undefined) return;
    if (state.ok) {
      onOpenChange(false);
      announce(addedAnnouncement(state.data));
      return;
    }
    switch (state.code) {
      case "needs_text":
        postingTextRef.current?.focus();
        break;
      case "needs_details":
        if (lastSubmitted.current.companyName.trim() === "") {
          companyRef.current?.focus();
        } else {
          roleRef.current?.focus();
        }
        break;
      case "duplicate":
        addAnywayRef.current?.focus();
        break;
      default:
        // invalid, server_error and every placement (MoveError) code: the
        // same "focus stays on the control the user just activated"
        // reasoning the earlier dialog already relied on - disabling
        // the button that was just clicked moves focus to <body> in
        // Chromium, and nothing else brings it back on its own once the
        // pending state clears and these field errors render.
        submitRef.current?.focus();
    }
  }, [state, onOpenChange, announce]);

  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined;
  const isDuplicate = state?.ok === false && state.code === "duplicate";
  const showPending = pending && lastSubmitted.current.hadSource;

  return (
    // noValidate: this app's own error presentation (the red hint text
    // under a field, from `fieldErrors`) is the only validation UI a user
    // should see here, matching every other form in this milestone.
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Add a job</DialogTitle>
        <DialogDescription>
          Paste a link or the posting text and Jobsmith fills in what it can. You can also type the
          company and role yourself.
        </DialogDescription>
      </DialogHeader>

      {state?.ok === false ? (
        <div role="alert" className="flex flex-col gap-2 text-sm">
          <p className={isErrorCode(state.code) ? "text-destructive" : "text-foreground"}>{state.message}</p>
          {isDuplicate ? (
            <div className="flex flex-wrap items-center gap-3">
              {state.href ? (
                <Link href={state.href} className="underline underline-offset-4">
                  Open it
                </Link>
              ) : null}
              <Button
                ref={addAnywayRef}
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={handleAddAnyway}
              >
                Add anyway
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <p role="status" className="text-sm text-muted-foreground">
        {showPending ? PENDING_MESSAGE : ""}
      </p>

      {draft !== "" ? <input type="hidden" name="draft" value={draft} /> : null}

      <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
        <FieldRow label="Link to the posting" hint={fieldErrors?.sourceUrl}>
          {(id, describedBy) => (
            <Input
              id={id}
              type="url"
              name="sourceUrl"
              onChange={handleSourceOrTextChange}
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.sourceUrl)}
            />
          )}
        </FieldRow>

        <FieldRow label="Posting text" hint={fieldErrors?.postingText}>
          {(id, describedBy) => (
            <Textarea
              id={id}
              name="postingText"
              rows={5}
              ref={postingTextRef}
              onChange={handleSourceOrTextChange}
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.postingText)}
            />
          )}
        </FieldRow>

        <FieldRow label="Company" hint={fieldErrors?.companyName}>
          {(id, describedBy) => (
            <>
              <Input
                id={id}
                name="companyName"
                list={companyListId}
                ref={companyRef}
                aria-describedby={describedBy}
                aria-invalid={Boolean(fieldErrors?.companyName)}
              />
              <datalist id={companyListId}>
                {companyNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </>
          )}
        </FieldRow>

        <FieldRow label="Role" hint={fieldErrors?.roleTitle}>
          {(id, describedBy) => (
            <Input
              id={id}
              name="roleTitle"
              ref={roleRef}
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.roleTitle)}
            />
          )}
        </FieldRow>

        <FieldRow label="Location" hint={fieldErrors?.location}>
          {(id, describedBy) => (
            <Input
              id={id}
              name="location"
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.location)}
            />
          )}
        </FieldRow>

        <FieldRow label="Work mode" hint={fieldErrors?.workMode}>
          {(id, describedBy) => {
            const legendId = `${id}-legend`;
            return (
              // A plain FieldRow label can't name this control: Base UI's
              // RadioGroup only takes its accessible name from its own
              // Field.Label or Fieldset.Legend context, which neither
              // FieldRow's `<label htmlFor>` nor a bare native
              // <fieldset>/<legend> ever provides - Base UI does not detect
              // a plain HTML fieldset. So the name is wired explicitly with
              // aria-labelledby rather than left to implicit association.
              <fieldset className="contents">
                <legend id={legendId} className="sr-only">
                  Work mode
                </legend>
                <RadioGroup
                  id={id}
                  name="workMode"
                  aria-labelledby={legendId}
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(fieldErrors?.workMode)}
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="remote" id={`${id}-remote`} />
                    <Label htmlFor={`${id}-remote`}>Remote</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="hybrid" id={`${id}-hybrid`} />
                    <Label htmlFor={`${id}-hybrid`}>Hybrid</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="onsite" id={`${id}-onsite`} />
                    <Label htmlFor={`${id}-onsite`}>On site</Label>
                  </div>
                </RadioGroup>
              </fieldset>
            );
          }}
        </FieldRow>

        <FieldRow label="Pay from" hint={fieldErrors?.compMin}>
          {(id, describedBy) => (
            <Input
              id={id}
              type="number"
              name="compMin"
              max={MAX_COMP}
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.compMin)}
            />
          )}
        </FieldRow>

        <FieldRow label="Pay to" hint={fieldErrors?.compMax}>
          {(id, describedBy) => (
            <Input
              id={id}
              type="number"
              name="compMax"
              max={MAX_COMP}
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.compMax)}
            />
          )}
        </FieldRow>

        <FieldRow label="Currency" hint={fieldErrors?.compCurrency}>
          {(id, describedBy) => (
            <Input
              id={id}
              name="compCurrency"
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.compCurrency)}
            />
          )}
        </FieldRow>

        <FieldRow label="Pay note" hint={fieldErrors?.compNote}>
          {(id, describedBy) => (
            <Textarea
              id={id}
              name="compNote"
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.compNote)}
            />
          )}
        </FieldRow>

        <FieldRow label="My ask" hint={fieldErrors?.myAsk}>
          {(id, describedBy) => (
            <Textarea
              id={id}
              name="myAsk"
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.myAsk)}
            />
          )}
        </FieldRow>

        <FieldRow label="Where is it now">
          {(id) => (
            <Select id={id} name="whereIsItNow" defaultValue="saved" items={STAGE_KIND_ITEMS}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGE_KINDS.map((stage) => (
                  <SelectItem key={stage.kind} value={stage.kind}>
                    {stage.columnTitle}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FieldRow>
      </div>

      <DialogFooter>
        <Button ref={submitRef} type="submit" disabled={pending}>
          Add job
        </Button>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
      </DialogFooter>
    </form>
  );
}
```

- [ ] **Step 8: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/add-job-dialog.test.tsx
```

Expected: `Test Files 1 passed (1)`, `Tests 9 passed (9)`.

- [ ] **Step 9: Mutation check: dropping the draft on a field change**

In `components/board/add-job-dialog.tsx`, change:

```typescript
  function handleSourceOrTextChange() {
    if (draft !== "") setDroppedDraft(draft);
  }
```

to:

```typescript
  function handleSourceOrTextChange() {
    // dropped
  }
```

Run:

```bash
pnpm exec vitest run tests/unit/add-job-dialog.test.tsx
```

Expected: `"the hidden draft input disappears once Link to the posting changes"` fails - the hidden
`draft` input is still present after the field change. Revert the change and rerun to confirm all 9
tests pass again.

- [ ] **Step 10: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm check:tokens
pnpm test
```

Expected: all four exit 0, with `pnpm test` reporting every existing test still passing alongside the
19 new ones (10 `form-submit.test.ts` + 9 `add-job-dialog.test.tsx`; `form-submit.test.ts`'s count
rises from 6 to 10, a net gain of 4). `pnpm check:tokens` passes because every class touched above is
a semantic utility or a stock shadcn variable name, none of them new.

- [ ] **Step 11: Run every e2e spec that touches the Add job dialog**

D29: `addJobAndOpen` (`tests/e2e/session.ts`) is unchanged, and this dialog is now reached by six
different spec files across three projects. Run all of them before touching `playwright.config.ts`
(Task 11 does that):

```bash
pnpm exec playwright test job-page.spec.ts documents.spec.ts bridge.spec.ts nav.spec.ts pipeline.spec.ts --project=chromium
pnpm exec playwright test job-page.spec.ts documents.spec.ts bridge.spec.ts nav.spec.ts pipeline.spec.ts --project=webkit
pnpm exec playwright test documents-phone.spec.ts pipeline-phone.spec.ts --project=phone
```

(`playwright test <file>` matches by filename regardless of `testMatch`, confirmed by the identical
technique in this milestone's own Task 11 below.) `job-page.spec.ts`, `documents.spec.ts`,
`bridge.spec.ts` and `nav.spec.ts` each define or import a function literally named `addJobAndOpen`;
`pipeline.spec.ts` and `pipeline-phone.spec.ts` open the dialog through their own local `addJob`
helper or inline steps instead, but exercise the same `Company`/`Role`/`Add job` path and so are
named explicitly by the README alongside the `addJobAndOpen` callers. Expected: every one of these
seven runs passes, unchanged in behavior from before this task - this dialog rewrite must be
invisible to a plain company-and-role add with no link or text.

- [ ] **Step 12: Commit**

```bash
git add components/board/add-job-dialog.tsx lib/forms/submit.ts tests/unit/add-job-dialog.test.tsx tests/unit/form-submit.test.ts
git commit -m "$(cat <<'EOF'
feat: rebuild the Add job dialog around link and pasted-text intake

EOF
)"
```

End the message with the co-author trailer supplied by the executing session.

---

### Task 10: Job page: posting through Markdown, the review notice, `markReviewedAction`

**Files:**
- Modify: `components/job/tab-overview.tsx`, `components/job/job-header.tsx`,
  `app/(app)/jobs/[slug]/actions.ts`, `app/(app)/jobs/[slug]/page.tsx`
- Create: `components/job/review-notice.tsx`
- Modify: `tests/integration/job-actions.test.ts`

**Interfaces:**
- Consumes, from Task 7 (`lib/pipeline/details.ts`): `markOpportunityReviewed(s: Scoped,
  opportunityId: string): Promise<Result<null, "not_found">>`.
- Consumes, from Task 8 (`lib/intake/messages.ts`): `REVIEW_NOTICE_TEXT`, `MARKED_REVIEWED_MESSAGE`.
  That file owns this copy; the notice imports it instead of repeating the strings.
- Consumes, unchanged: `Markdown` (`@/components/markdown`, Milestone 3, `headingBase: 2 | 3 | 4`);
  `messageFor` (`@/lib/pipeline/messages`); `useAnnounce` (`@/components/live-announcer`); `Button`
  (`@/components/ui/button`); `focusWasLost`, `correctFocusOnceLost` (`@/lib/dom/focus`);
  `opportunityIdSchema` (`@/lib/pipeline/action-schemas`); `fail`, `type Result` (`@/lib/result`);
  `requireUser` (`@/lib/auth/session`); `scopedFor` (`@/lib/db/scoped`).
- **`needsReview` needs no new plumbing on the read path.** `needs_review` is an existing Drizzle
  column (`lib/db/schema/pipeline.ts:83`, `needsReview: boolean("needs_review").notNull().default(false)`,
  D1: no migration this milestone), `OpportunityRow` is `typeof schema.opportunity.$inferSelect`
  (`lib/db/scoped/opportunity.ts:8`), and both `getById` and `getBySlug` already do a bare `.select()`
  with no explicit column list (`lib/db/scoped/opportunity.ts:45-58`). `view.opportunity.needsReview`
  is therefore already a valid, correctly-typed read in `app/(app)/jobs/[slug]/page.tsx` today, with
  zero changes needed to `lib/db/scoped/opportunity.ts` or `lib/pipeline/read.ts` - verified by
  reading both files directly while drafting this task, not assumed from the README's prose.
- Produces (copied from the README character for character):

```typescript
// components/job/review-notice.tsx
export function ReviewNotice(props: { opportunityId: string; onEditDetails: () => void }): React.ReactElement;
// app/(app)/jobs/[slug]/actions.ts (addition)
export async function markReviewedAction(opportunityId: string): Promise<Result<null, "not_found">>;
```

**`app/(app)/jobs/[slug]/page.tsx` is not in the README's own module map, and that is a gap, not a
choice; the README's Adjustments section lists it.** `JobHeader` gains a required `needsReview: boolean` prop
(below); its one caller is `page.tsx`, and nothing else in this milestone's task list touches that
file. Without passing `view.opportunity.needsReview` through, the prop is either a type error or (if
made optional with a default) a notice that can never actually appear - silently defeating D6's whole
point. Step 5 below adds the one-line fix.

- [ ] **Step 1: Write `components/job/review-notice.tsx` in full**

No dedicated unit test file: this task's only test is the integration test in Step 6, matching the
Contract's own test list for Task 10 (`I job-actions.test.ts adds markReviewedAction`) and the same
"go straight to a manual check and end-to-end coverage" reasoning `app/(app)/settings/actions.ts` used
in Milestone 3 for a thin, already-tested-underneath action wrapper. Task 11's `intake.spec.ts`
exercises this component for real, through the browser, including the focus-after-response path.

```tsx
"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAnnounce } from "@/components/live-announcer";
import { markReviewedAction } from "@/app/(app)/jobs/[slug]/actions";
import { messageFor } from "@/lib/pipeline/messages";
import { MARKED_REVIEWED_MESSAGE, REVIEW_NOTICE_TEXT } from "@/lib/intake/messages";

export function ReviewNotice({
  opportunityId,
  onEditDetails,
}: {
  opportunityId: string;
  onEditDetails: () => void;
}) {
  const announce = useAnnounce();
  const [pending, startTransition] = React.useTransition();

  function handleMarkAsChecked() {
    startTransition(async () => {
      try {
        const result = await markReviewedAction(opportunityId);
        if (!result.ok) {
          toast.error(`Could not mark the details as checked. ${messageFor(result.code)}`);
          return;
        }
        announce(MARKED_REVIEWED_MESSAGE);
      } catch (error) {
        // markReviewedAction can reject before ever returning a Result -
        // requireUser()'s own session lookup throws when the database is
        // unreachable, the same case job-header.tsx's handleConfirmClose
        // and handleReopen already document for their own actions. Without
        // this catch, that would fail silently with no toast at all.
        console.error("mark reviewed failed", error);
        toast.error(`Could not mark the details as checked. ${messageFor("unexpected")}`);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted p-3 text-sm">
      <p className="text-foreground">
        {REVIEW_NOTICE_TEXT}
      </p>
      <Button variant="outline" size="sm" onClick={onEditDetails}>
        Edit details
      </Button>
      <Button variant="outline" size="sm" disabled={pending} onClick={handleMarkAsChecked}>
        Mark as checked
      </Button>
    </div>
  );
}
```

The notice text is wrapped `{"..."}` rather than typed straight into JSX, the same way
`components/job/bridge-panel.tsx` already writes a sentence with an apostrophe in it - a literal
apostrophe in JSX text trips `react/no-unescaped-entities`, and this repo's own precedent is a plain
string expression, not `&apos;`.

- [ ] **Step 2: Modify `components/job/tab-overview.tsx`**

Before (line 1-4, the import block):

```typescript
import { DetailFields, type DetailField } from "@/components/super-ai/detail-fields";
import { EditCompanyDialogTrigger } from "@/components/job/edit-company-dialog";
import { LocalTime } from "@/components/local-time";
import type { CompanyRow } from "@/lib/db/scoped";
```

After:

```typescript
import { DetailFields, type DetailField } from "@/components/super-ai/detail-fields";
import { EditCompanyDialogTrigger } from "@/components/job/edit-company-dialog";
import { Markdown } from "@/components/markdown";
import { LocalTime } from "@/components/local-time";
import type { CompanyRow } from "@/lib/db/scoped";
```

Before (the Posting section, lines 70-88):

```tsx
      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-foreground">Posting</h2>
        {opportunity.postingMd ? (
          <>
            {opportunity.postingCapturedAt ? (
              <p className="text-sm text-muted-foreground">
                Captured <LocalTime value={opportunity.postingCapturedAt} mode="date" />.
              </p>
            ) : null}
            {/* Plain text, line breaks kept, no markdown rendering until
                Milestone 3. break-words: an unbroken long string (e.g. a
                pasted URL with no spaces) has no other wrap point and
                would otherwise force page-level horizontal overflow. */}
            <div className="whitespace-pre-wrap break-words text-sm text-foreground">{opportunity.postingMd}</div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No posting text saved.</p>
        )}
      </div>
```

After:

```tsx
      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-foreground">Posting</h2>
        {opportunity.postingMd ? (
          <>
            {opportunity.postingCapturedAt ? (
              <p className="text-sm text-muted-foreground">
                Captured <LocalTime value={opportunity.postingCapturedAt} mode="date" />.
              </p>
            ) : null}
            {/* Sanitized markdown: a posting saved before links
                were read was plain text and may run its lines
                together, since Markdown does not invent paragraph breaks a
                plain-text posting never had. headingBase={3}: this
                section's own heading is an h2 ("Posting"), so a posting's
                own # Title starts one level below it, never colliding with
                it. */}
            <Markdown source={opportunity.postingMd} headingBase={3} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No posting text saved.</p>
        )}
      </div>
```

Nothing else in this file changes: `TabOverviewOpportunity`'s `postingMd: string | null` field, the
heading, the captured line and the empty-text branch all stay exactly as they are.

- [ ] **Step 3: Modify `components/job/job-header.tsx`**

Before (the import block, lines 1-23):

```typescript
"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CloseDialog } from "@/components/board/close-dialog";
import { EditDetailsDialog } from "@/components/job/edit-details-dialog";
import { LocalTime } from "@/components/local-time";
import { useAnnounce } from "@/components/live-announcer";
import { closeAction, reopenAction } from "@/app/(app)/board/actions";
import { actionFailureMessage } from "@/lib/board/messages";
import { focusWasLost } from "@/lib/dom/focus";
import { CLOSED_REASON_LABELS } from "@/lib/pipeline/labels";
import type { OpportunityStatus, ClosedReason, WorkMode } from "@/lib/pipeline/values";
import { MoreVertical } from "lucide-react";
```

After:

```typescript
"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CloseDialog } from "@/components/board/close-dialog";
import { EditDetailsDialog } from "@/components/job/edit-details-dialog";
import { ReviewNotice } from "@/components/job/review-notice";
import { LocalTime } from "@/components/local-time";
import { useAnnounce } from "@/components/live-announcer";
import { closeAction, reopenAction } from "@/app/(app)/board/actions";
import { actionFailureMessage } from "@/lib/board/messages";
import { focusWasLost, correctFocusOnceLost } from "@/lib/dom/focus";
import { CLOSED_REASON_LABELS } from "@/lib/pipeline/labels";
import type { OpportunityStatus, ClosedReason, WorkMode } from "@/lib/pipeline/values";
import { MoreVertical } from "lucide-react";
```

Before (`JobHeaderProps`, lines 31-48):

```typescript
interface JobHeaderProps {
  opportunity: {
    id: string;
    roleTitle: string;
    sourceUrl: string | null;
    location: string | null;
    status: OpportunityStatus;
    closedReason: ClosedReason | null;
    closedAt: Date | null;
    workMode: WorkMode | null;
    compMin: number | null;
    compMax: number | null;
    compCurrency: string | null;
    compNote: string | null;
    myAsk: string | null;
  };
  companyName: string;
}
```

After:

```typescript
interface JobHeaderProps {
  opportunity: {
    id: string;
    roleTitle: string;
    sourceUrl: string | null;
    location: string | null;
    status: OpportunityStatus;
    closedReason: ClosedReason | null;
    closedAt: Date | null;
    workMode: WorkMode | null;
    compMin: number | null;
    compMax: number | null;
    compCurrency: string | null;
    compNote: string | null;
    myAsk: string | null;
  };
  companyName: string;
  needsReview: boolean;
}
```

Before (the function signature and refs, lines 50-56):

```typescript
export function JobHeader({ opportunity, companyName }: JobHeaderProps) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [closeOpen, setCloseOpen] = React.useState(false);
  const [isReopenPending, startReopenTransition] = React.useTransition();
  const announce = useAnnounce();
  const jobActionsRef = React.useRef<HTMLButtonElement>(null);
  const prevStatusRef = React.useRef(opportunity.status);
```

After:

```typescript
export function JobHeader({ opportunity, companyName, needsReview }: JobHeaderProps) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [closeOpen, setCloseOpen] = React.useState(false);
  const [isReopenPending, startReopenTransition] = React.useTransition();
  const announce = useAnnounce();
  const jobActionsRef = React.useRef<HTMLButtonElement>(null);
  const prevStatusRef = React.useRef(opportunity.status);
  const prevNeedsReviewRef = React.useRef(needsReview);
```

Before (right after the existing Reopen focus effect, lines 70-76 - this block itself is unchanged,
shown only so the new block's insertion point is unambiguous):

```typescript
  React.useEffect(() => {
    const justReopened = prevStatusRef.current === "closed" && opportunity.status === "active";
    prevStatusRef.current = opportunity.status;
    if (justReopened && focusWasLost()) {
      jobActionsRef.current?.focus();
    }
  }, [opportunity.status]);
```

After (the existing effect stays exactly as it is; a new one is added immediately below it):

```typescript
  React.useEffect(() => {
    const justReopened = prevStatusRef.current === "closed" && opportunity.status === "active";
    prevStatusRef.current = opportunity.status;
    if (justReopened && focusWasLost()) {
      jobActionsRef.current?.focus();
    }
  }, [opportunity.status]);

  // Mark as checked (review-notice.tsx) and a saved Edit details change
  // (updateOpportunityDetails clears needs_review on every successful
  // save, lib/pipeline/details.ts) both remove this notice's own buttons -
  // the Edit details path from inside a closing EditDetailsDialog, whose
  // own exit animation queues Base UI's usual focus restoration behind it.
  // correctFocusOnceLost (not a one-time focusWasLost() check, unlike the
  // Reopen effect above) is what that race needs: the same one
  // lib/dom/focus.ts's own doc comment describes for CloseDialog,
  // confirmed there empirically. Recovers onto "Job actions", the one
  // control in this header that exists regardless of needsReview.
  React.useEffect(() => {
    const justResolved = prevNeedsReviewRef.current && !needsReview;
    prevNeedsReviewRef.current = needsReview;
    if (justResolved) {
      correctFocusOnceLost(() => jobActionsRef.current?.focus());
    }
  }, [needsReview]);
```

Before (the title block's own closing tag through the closed-status banner, lines 120-169 - shown for
context; only the one line between them is new):

```tsx
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {/* ...unchanged... */}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* ...unchanged... */}
        </div>
      </div>

      {opportunity.status === "closed" && opportunity.closedReason && opportunity.closedAt ? (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted p-3 text-sm">
          {/* ...unchanged... */}
        </div>
      ) : null}
```

After:

```tsx
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {/* ...unchanged... */}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* ...unchanged... */}
        </div>
      </div>

      {needsReview ? (
        <ReviewNotice opportunityId={opportunity.id} onEditDetails={() => setEditOpen(true)} />
      ) : null}

      {opportunity.status === "closed" && opportunity.closedReason && opportunity.closedAt ? (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted p-3 text-sm">
          {/* ...unchanged... */}
        </div>
      ) : null}
```

Nothing else in the file changes: `handleConfirmClose`, `handleReopen`, the `DropdownMenu`, both
dialogs at the bottom and every other line stay exactly as they are.

- [ ] **Step 4: Modify `app/(app)/jobs/[slug]/actions.ts`**

Before (the imports, line 11):

```typescript
import { updateOpportunityDetails, updateOpportunityDetailsSchema, updateCompanyDetails, updateCompanyDetailsSchema } from "@/lib/pipeline/details";
```

After:

```typescript
import { updateOpportunityDetails, updateOpportunityDetailsSchema, updateCompanyDetails, updateCompanyDetailsSchema, markOpportunityReviewed } from "@/lib/pipeline/details";
```

Append at the end of the file (after `addNoteAction`), in full:

```typescript
export async function markReviewedAction(opportunityId: string): Promise<Result<null, "not_found">> {
  const user = await requireUser();
  const parsed = opportunityIdSchema.safeParse(opportunityId);
  if (!parsed.success) return fail("not_found", messageFor("not_found"));
  const s = scopedFor(user.id);
  const result = await markOpportunityReviewed(s, opportunityId);
  if (result.ok) await revalidateJob(s, opportunityId);
  return result;
}
```

`revalidateJob` (already defined near the top of this file, line 44) revalidates `/board` and this
job's own `/jobs/<slug>`, reading the slug fresh from the database after the write - the same helper
every other action in this file already reuses, so `markReviewedAction` needs no new revalidation
logic of its own.

- [ ] **Step 5: Modify `app/(app)/jobs/[slug]/page.tsx`**

Before:

```tsx
      <JobHeader opportunity={view.opportunity} companyName={view.company.name} />
```

After:

```tsx
      <JobHeader opportunity={view.opportunity} companyName={view.company.name} needsReview={view.opportunity.needsReview} />
```

Nothing else in the file changes.

- [ ] **Step 6: Write the `markReviewedAction` additions to `tests/integration/job-actions.test.ts`**

Replace the file in full (the existing `updateOpportunityDetailsAction` describe block is unchanged;
the `next/cache` mock becomes an inspectable spy so the new tests can assert on it, and a second
describe block is added):

```typescript
import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { scoped } from "@/lib/db/scoped";
import { createOpportunity } from "@/lib/pipeline/create";
import { updateOpportunityDetailsAction, markReviewedAction } from "@/app/(app)/jobs/[slug]/actions";
import { UNREADABLE_INPUT_VALUE } from "@/lib/forms/submit";
import { makeTestDb, createTestUser } from "../helpers/db";

// updateOpportunityDetailsAction turns the Edit details form's text into
// values before updateOpportunityDetailsSchema sees it, and a blank Pay box
// means "clear this figure" there, so these tests call the action itself.
// Same harness as board-actions.test.ts: the signed-in user and path
// revalidation need a live Next.js request, so both are stubbed; scopedFor
// is pointed at a real PGlite database through the real scoped().
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

async function jobPaying120To150(db: Db): Promise<string> {
  harness.db = db;
  harness.userId = (await createTestUser(db, "editor@example.com")).id;
  const created = await createOpportunity(scoped(db, harness.userId), {
    companyName: "Acme Robotics",
    roleTitle: "Product Designer",
    compMin: 120000,
    compMax: 150000,
  });
  if (!created.ok) throw new Error(created.message);
  return created.data.id;
}

function detailsForm(pay: Record<string, string>): FormData {
  const formData = new FormData();
  formData.set("roleTitle", "Product Designer");
  for (const [name, value] of Object.entries(pay)) formData.set(name, value);
  return formData;
}

async function storedPay(db: Db, opportunityId: string) {
  const [row] = await db
    .select({ compMin: schema.opportunity.compMin, compMax: schema.opportunity.compMax })
    .from(schema.opportunity)
    .where(eq(schema.opportunity.id, opportunityId));
  return row;
}

describe("updateOpportunityDetailsAction pay figures", () => {
  // lib/forms/submit.ts sends this in place of a Pay box the browser holds
  // text for but cannot read ("125e"). Read as blank, it would clear the
  // stored figure.
  it("rejects the stand-in sent for a pay figure the browser could not read and keeps the stored one", async () => {
    const { db, close } = await makeTestDb();
    try {
      const id = await jobPaying120To150(db);
      const state = await updateOpportunityDetailsAction(
        id,
        undefined,
        detailsForm({ compMin: UNREADABLE_INPUT_VALUE, compMax: "150000" }),
      );
      expect(state).toMatchObject({ ok: false, code: "invalid", fieldErrors: { compMin: "Enter a number." } });
      expect(await storedPay(db, id)).toEqual({ compMin: 120000, compMax: 150000 });
    } finally {
      await close();
    }
  });

  it("clears a pay figure left blank", async () => {
    const { db, close } = await makeTestDb();
    try {
      const id = await jobPaying120To150(db);
      const state = await updateOpportunityDetailsAction(id, undefined, detailsForm({ compMin: "", compMax: "150000" }));
      expect(state).toEqual({ ok: true });
      expect(await storedPay(db, id)).toEqual({ compMin: null, compMax: 150000 });
    } finally {
      await close();
    }
  });
});

async function jobNeedingReview(db: Db): Promise<{ id: string; slug: string }> {
  harness.db = db;
  harness.userId = (await createTestUser(db, "reviewer@example.com")).id;
  const created = await createOpportunity(scoped(db, harness.userId), {
    companyName: "Northwind Traders",
    roleTitle: "Product Designer",
    needsReview: true,
  });
  if (!created.ok) throw new Error(created.message);
  return { id: created.data.id, slug: created.data.slug };
}

async function storedNeedsReview(db: Db, opportunityId: string): Promise<boolean | undefined> {
  const [row] = await db
    .select({ needsReview: schema.opportunity.needsReview })
    .from(schema.opportunity)
    .where(eq(schema.opportunity.id, opportunityId));
  return row?.needsReview;
}

describe("markReviewedAction", () => {
  it("clears needs_review and revalidates the board and the job page", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { id, slug } = await jobNeedingReview(db);
      expect(await storedNeedsReview(db, id)).toBe(true);
      revalidatePathMock.mockClear();

      const result = await markReviewedAction(id);

      expect(result).toEqual({ ok: true, data: null });
      expect(await storedNeedsReview(db, id)).toBe(false);
      expect(revalidatePathMock).toHaveBeenCalledWith("/board");
      expect(revalidatePathMock).toHaveBeenCalledWith(`/jobs/${slug}`);
    } finally {
      await close();
    }
  });

  // Only the code is pinned here, not markOpportunityReviewed's own
  // message text (lib/pipeline/messages.ts owns it) - asserting an
  // exact string owned by another file would make this test fail
  // for a reason that has nothing to do with markReviewedAction itself.
  it("returns not_found for an id that does not exist, and revalidates nothing", async () => {
    const { db, close } = await makeTestDb();
    try {
      harness.db = db;
      harness.userId = (await createTestUser(db, "reviewer2@example.com")).id;
      revalidatePathMock.mockClear();

      const result = await markReviewedAction("00000000-0000-4000-8000-000000000099");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("not_found");
      }
      expect(revalidatePathMock).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });
});
```

- [ ] **Step 7: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/integration/job-actions.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 4 passed (4)` (2 existing `updateOpportunityDetailsAction`
+ 2 new `markReviewedAction`).

- [ ] **Step 8: Manual browser check**

1. `pnpm dev`. Add a job with pasted plain text and no Company/Role (`ai_off`, no AI configured
   locally unless `AI_PROVIDER` is set), giving it typed company and role at the `needs_details` step.
   Open the job. Confirm the notice reads `Check this job's details. They were not read from the
   posting automatically.` with `Edit details` and `Mark as checked` buttons, styled like the closed
   banner (`rounded-lg border border-border bg-muted p-3`).
2. Click `Mark as checked`. Confirm the notice disappears, a live-region announcement fires (inspect
   the accessibility tree), and focus lands on `Job actions` (Tab immediately afterward and confirm
   the very next stop is whatever follows it in the header, not a page reload with focus reset).
3. Reopen a job with the notice, click `Edit details`, save any change; confirm the notice disappears
   there too and focus still lands on `Job actions`.
4. Open a job whose posting has a pasted bullet list; confirm it renders as a real list item, not a
   run-together paragraph.
5. Check both light and dark, then repeat the whole pass in Safari.

- [ ] **Step 9: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm check:tokens
pnpm test
```

Expected: all four exit 0. `pnpm check:tokens` passes because `review-notice.tsx`'s own classes
(`rounded-lg`, `border-border`, `bg-muted`, `p-3`, `text-sm`, `text-foreground`) are the same semantic
set the closed-status banner already uses.

- [ ] **Step 10: Commit**

```bash
git add components/job/review-notice.tsx components/job/job-header.tsx components/job/tab-overview.tsx "app/(app)/jobs/[slug]/actions.ts" "app/(app)/jobs/[slug]/page.tsx" tests/integration/job-actions.test.ts
git commit -m "$(cat <<'EOF'
feat: render the posting through Markdown and add the needs-review notice

EOF
)"
```

End the message with the co-author trailer supplied by the executing session.

---

### Task 11: End to end

**Files:**
- Create: `tests/e2e/intake.spec.ts`, `tests/e2e/intake-phone.spec.ts`
- Modify: `playwright.config.ts`

**Interfaces:**
- Consumes: `login`, `uniqueName` (`tests/e2e/session.ts`, unmodified). `scanForViolations`
  (`tests/e2e/axe.ts`, unmodified). `scanOpenOverlay` (`tests/e2e/scan-open.ts`, unmodified). Every
  accessible name and copy string fixed under "UI copy and accessible names" in the README, produced by
  Tasks 9 and 10 (`Add a job`, `Link to the posting`, `Posting text`, `Company`, `Role`, `Add job`,
  `Add anyway`, `Open it`, `Cancel`, the `NEEDS_TEXT_MESSAGES.login_required` and
  `NEEDS_DETAILS_MESSAGES.ai_failed` sentences, `You already have this job.`, the notice text,
  `Edit details`, `Mark as checked`, `Job actions`). No route handler, no direct `lib/ai`/`lib/intake`
  import: every one of these specs reaches the server only through the app's own pages and the fake
  driver the webServer boots with.
- Produces: `pnpm test:e2e` extended with two new spec files, running against the existing
  `chromium`/`webkit`/`phone` projects.

**Why no ATS fixture here.** D34: the Greenhouse half of the milestone's "done when" is proven by
Task 8's own integration test of `addJob` against the Greenhouse fixture with no driver, plus an
owner check on the real preview (Task 12's last step). Every e2e spec in this whole milestone runs
with no network access (global constraint), and a real ATS vendor API is exactly the kind of outside
call that constraint rules out - so the LinkedIn/pasted-text path, which never leaves the app's own
guarded surface (`login_required` is returned before any request, D15), is what these two specs cover
instead.

- [ ] **Step 1: Modify `playwright.config.ts`**

Before:

```typescript
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.APP_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "html",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      // Runs once, on the freshly reset database, and creates the only account.
      // No retries: a second attempt would find the account already there.
      name: "first-run",
      testMatch: /first-run\.spec\.ts/,
      retries: 0,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      testMatch: /(shell|pipeline|job-page|documents|bridge|nav)\.spec\.ts$/,
      dependencies: ["first-run"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "webkit",
      testMatch: /(shell|pipeline|job-page|documents|bridge|nav)\.spec\.ts$/,
      dependencies: ["first-run"],
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "phone",
      testMatch: /(shell|pipeline-phone|documents-phone|nav)\.spec\.ts$/,
      dependencies: ["first-run"],
      use: {
        ...devices["iPhone 13"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    // All browsers log in from the same address, so the suite raises the
    // sign-in limit for the server it starts. The default stays 5 per
    // minute. SETUP_TOKEN matches the constant in tests/e2e/account.ts, so
    // first-run.spec.ts can exercise both a missing and a wrong token
    // before using the right one to create the only account.
    command:
      "pnpm build && SETUP_TOKEN=e2e-setup-token-0123456789 AUTH_SIGNIN_MAX_PER_MINUTE=1000 pnpm start",
    url: baseURL,
    // Never reuse a server already listening on baseURL: it would be
    // whatever `pnpm dev` or a stale `pnpm start` happens to have running,
    // built without this suite's SETUP_TOKEN and AUTH_SIGNIN_MAX_PER_MINUTE,
    // which would then fail in confusing ways rather than at startup.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
```

After (in full):

```typescript
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.APP_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "html",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      // Runs once, on the freshly reset database, and creates the only account.
      // No retries: a second attempt would find the account already there.
      name: "first-run",
      testMatch: /first-run\.spec\.ts/,
      retries: 0,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      testMatch: /(shell|pipeline|job-page|documents|bridge|nav|intake)\.spec\.ts$/,
      dependencies: ["first-run"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "webkit",
      testMatch: /(shell|pipeline|job-page|documents|bridge|nav|intake)\.spec\.ts$/,
      dependencies: ["first-run"],
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "phone",
      testMatch: /(shell|pipeline-phone|documents-phone|nav|intake-phone)\.spec\.ts$/,
      dependencies: ["first-run"],
      use: {
        ...devices["iPhone 13"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    // All browsers log in from the same address, so the suite raises the
    // sign-in limit for the server it starts. The default stays 5 per
    // minute. SETUP_TOKEN matches the constant in tests/e2e/account.ts, so
    // first-run.spec.ts can exercise both a missing and a wrong token
    // before using the right one to create the only account. AI_PROVIDER=fake
    // means every intake spec's extraction goes through the
    // deterministic fake driver: no network call, no real AI key needed to
    // run this suite at all.
    command:
      "pnpm build && SETUP_TOKEN=e2e-setup-token-0123456789 AUTH_SIGNIN_MAX_PER_MINUTE=1000 AI_PROVIDER=fake pnpm start",
    url: baseURL,
    // Never reuse a server already listening on baseURL: it would be
    // whatever `pnpm dev` or a stale `pnpm start` happens to have running,
    // built without this suite's SETUP_TOKEN, AUTH_SIGNIN_MAX_PER_MINUTE and
    // AI_PROVIDER, which would then fail in confusing ways rather than at
    // startup.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
```

`intake-phone.spec.ts` does not also satisfy `chromium`/`webkit`'s own regex: after the engine
consumes the literal word `intake`, that alternative's own `\.spec\.ts$` demands the very next
characters be `.spec.ts` to the end of the string, and in `intake-phone.spec.ts` `-phone.spec.ts`
follows instead - the same reasoning `pipeline`/`pipeline-phone` and `documents`/`documents-phone`
already rely on, extended to a third pair of names. `intake.spec.ts` (no `-phone`) does not satisfy
`phone`'s own regex either, since `intake-phone` never appears as a substring of it.

- [ ] **Step 2: Write `tests/e2e/intake.spec.ts`**

Covers all three intake outcomes the dialog's own alert states can reach with no network access: (a)
a LinkedIn link needs pasted text, and text with `Company:`/`Role:` lines and a bullet list resolves
with no review notice; (b) plain text with no such lines needs company and role typed by hand, and the
saved job carries the review notice until "Mark as checked" clears it; (c) a manual duplicate offers
"Add anyway", and a second duplicate attempt offers "Open it" instead.

```typescript
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { scanForViolations } from "./axe";
import { scanOpenOverlay } from "./scan-open";
import { login, uniqueName } from "./session";

function postingWithCompanyAndRole(company: string, role: string): string {
  return `Company: ${company}\nRole: ${role}\n\nAbout the job\nWe are looking for a designer who enjoys internal tools.\n\n• Run discovery with the floor teams.\n• Ship design changes every week.`;
}

const PLAIN_POSTING_TEXT = "About the job\nWe are looking for a designer who enjoys internal tools.";

async function openAddJobDialog(page: Page) {
  await page.getByRole("button", { name: "Add job" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a job" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("a LinkedIn link needs pasted text, plain text needs company and role, and a repeat add offers Add anyway then Open it", async ({
  page,
}, testInfo) => {
  test.slow();
  await login(page);

  await test.step("(a) a LinkedIn link asks for the text, then Company/Role lines and a bullet list resolve with no review notice", async () => {
    const company = uniqueName(testInfo, "Northwind Traders");
    const role = "Product Designer";

    const dialog = await openAddJobDialog(page);
    await dialog.getByLabel("Link to the posting").fill("https://www.linkedin.com/jobs/view/1000000001/");
    await dialog.getByRole("button", { name: "Add job" }).click();

    await expect(dialog.getByRole("alert")).toHaveText(
      "This site needs a login, so Jobsmith cannot read the link. Paste the posting text instead.",
    );
    await expect(dialog.getByLabel("Posting text")).toBeFocused();

    await scanOpenOverlay(page, "add job: needs the posting text", testInfo, async () => {
      if (!(await dialog.isVisible())) {
        await page.getByRole("button", { name: "Add job" }).click();
      }
      await expect(dialog).toBeVisible();
    });

    await dialog.getByLabel("Posting text").fill(postingWithCompanyAndRole(company, role));
    await dialog.getByRole("button", { name: "Add job" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("link", { name: `${role} at ${company}` })).toBeVisible();

    await page.getByRole("link", { name: `${role} at ${company}` }).click();
    await expect(page).toHaveURL(/\/jobs\//);
    await expect(
      page.getByRole("listitem").filter({ hasText: "Run discovery with the floor teams." }),
    ).toBeVisible();
    await expect(page.getByText("Check this job's details.")).toHaveCount(0);
  });

  await test.step("(b) plain text needs company and role, and the saved job carries the review notice until Mark as checked", async () => {
    const company = uniqueName(testInfo, "Riverbend Studio");
    const role = "Senior Designer";

    await page.goto("/board");
    const dialog = await openAddJobDialog(page);
    await dialog.getByLabel("Posting text").fill(PLAIN_POSTING_TEXT);
    await dialog.getByRole("button", { name: "Add job" }).click();

    await expect(dialog.getByRole("alert")).toHaveText(
      "Jobsmith could not read the company and role from the posting. Add them to save the job.",
    );
    await expect(dialog.getByLabel("Company")).toBeFocused();

    await scanOpenOverlay(page, "add job: needs company and role", testInfo, async () => {
      if (!(await dialog.isVisible())) {
        await page.getByRole("button", { name: "Add job" }).click();
      }
      await expect(dialog).toBeVisible();
    });

    await dialog.getByLabel("Company").fill(company);
    await dialog.getByLabel("Role").fill(role);
    await dialog.getByRole("button", { name: "Add job" }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole("link", { name: `${role} at ${company}` }).click();
    await expect(page).toHaveURL(/\/jobs\//);

    await expect(
      page.getByText("Check this job's details. They were not read from the posting automatically."),
    ).toBeVisible();
    await scanForViolations(page, "job page with the review notice", testInfo);

    await page.getByRole("button", { name: "Mark as checked" }).click();
    await expect(page.getByText("Check this job's details.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Job actions" })).toBeFocused();
  });

  await test.step("(c) a manual job added twice offers Add anyway, then a third attempt offers Open it", async () => {
    const company = uniqueName(testInfo, "Harborview Systems");
    const role = "Design Lead";

    await page.goto("/board");
    let dialog = await openAddJobDialog(page);
    await dialog.getByLabel("Company").fill(company);
    await dialog.getByLabel("Role").fill(role);
    await dialog.getByRole("button", { name: "Add job" }).click();
    await expect(dialog).toBeHidden();

    dialog = await openAddJobDialog(page);
    await dialog.getByLabel("Company").fill(company);
    await dialog.getByLabel("Role").fill(role);
    await dialog.getByRole("button", { name: "Add job" }).click();

    await expect(dialog.getByRole("alert")).toContainText("You already have this job.");
    await expect(dialog.getByRole("button", { name: "Add anyway" })).toBeFocused();

    await scanOpenOverlay(page, "add job: duplicate", testInfo, async () => {
      if (!(await dialog.isVisible())) {
        await page.getByRole("button", { name: "Add job" }).click();
        await dialog.getByLabel("Company").fill(company);
        await dialog.getByLabel("Role").fill(role);
        await dialog.getByRole("button", { name: "Add job" }).click();
      }
      await expect(dialog).toBeVisible();
    });

    await dialog.getByRole("button", { name: "Add anyway" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("link", { name: `${role} at ${company}` })).toHaveCount(2);

    dialog = await openAddJobDialog(page);
    await dialog.getByLabel("Company").fill(company);
    await dialog.getByLabel("Role").fill(role);
    await dialog.getByRole("button", { name: "Add job" }).click();
    await expect(dialog.getByRole("alert")).toContainText("You already have this job.");

    await dialog.getByRole("link", { name: "Open it" }).click();
    await expect(page).toHaveURL(/\/jobs\//);
  });
});
```

- [ ] **Step 3: Write `tests/e2e/intake-phone.spec.ts`**

Covers flow (a) at 390px: no page-level horizontal overflow while the dialog is open, and axe on the
open dialog.

```typescript
import { test, expect, type TestInfo } from "@playwright/test";
import { scanOpenOverlay } from "./scan-open";
import { login, uniqueName } from "./session";

test("phone: a LinkedIn link needs the posting text, with no page-level horizontal overflow in the dialog", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "phone",
    "phone board only; playwright.config.ts also restricts this file to the phone project",
  );

  await login(page);
  const company = uniqueName(testInfo, "Northwind Traders");
  const role = "Product Designer";

  await page.getByRole("button", { name: "Add job" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a job" });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Link to the posting").fill("https://www.linkedin.com/jobs/view/1000000001/");
  await dialog.getByRole("button", { name: "Add job" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "This site needs a login, so Jobsmith cannot read the link. Paste the posting text instead.",
  );

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth),
  );

  await scanOpenOverlay(page, "phone add job: needs the posting text", testInfo, async () => {
    if (!(await dialog.isVisible())) {
      await page.getByRole("button", { name: "Add job" }).click();
    }
    await expect(dialog).toBeVisible();
  });

  await dialog.getByLabel("Posting text").fill(
    `Company: ${company}\nRole: ${role}\n\nAbout the job\nWe are looking for a designer who enjoys internal tools.\n\n• Run discovery with the floor teams.\n• Ship design changes every week.`,
  );
  await dialog.getByRole("button", { name: "Add job" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("link", { name: `${role} at ${company}` })).toBeVisible();
});
```

Only one `scanOpenOverlay` call here (unlike `intake.spec.ts`'s three), so `test.slow()` is not
needed - the same threshold `documents-phone.spec.ts` (two `scanForViolations` calls, no
`test.slow()`) already sets, versus `bridge.spec.ts` and `documents.spec.ts` (four and five scan
calls respectively, both call `test.slow()`).

- [ ] **Step 4: Manually run both new specs before touching anything CI depends on**

```bash
pnpm exec playwright test intake.spec.ts --project=chromium
pnpm exec playwright test intake.spec.ts --project=webkit
pnpm exec playwright test intake-phone.spec.ts --project=phone
```

Expected: each passes on its own (`playwright test <file>` matches by filename regardless of
`testMatch`, so this checks both specs before Step 1's config change wires them into the normal
`pnpm test:e2e` run).

- [ ] **Step 5: Run the full end-to-end suite**

```bash
pnpm test:e2e
```

Expected: `first-run` runs its own tests, then `chromium`, `webkit` and `phone` run in parallel.
`chromium`/`webkit` each now also run `intake.spec.ts`; `phone` also runs `intake-phone.spec.ts`. All
green. Screenshots land under `test-results/screens/`; spot check a few of the new ones in both
`-light` and `-dark`.

- [ ] **Step 6: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm check:tokens
pnpm test
pnpm build
pnpm test:e2e
```

Expected: all six exit 0.

- [ ] **Step 7: Commit**

```bash
git add playwright.config.ts tests/e2e/intake.spec.ts tests/e2e/intake-phone.spec.ts
git commit -m "$(cat <<'EOF'
test: add end-to-end coverage for link and pasted-text intake

EOF
)"
```

End the message with the co-author trailer supplied by the executing session.

---

### Task 12: Docs and ship

**Files:**
- Modify: `README.md`, `docs/design-system.md`, `docs/superpowers/specs/2026-09-18-jobsmith-core-design.md`

**Interfaces:**
- Consumes: the whole milestone's shipped surface (Tasks 1 to 11), read as a user, a self-hoster or a
  reviewer would, not imported as code.
- Produces: an updated `README.md`, `docs/design-system.md` and spec. Nothing here is consumed by
  anything later; this is the milestone's last gate.

This task has no unit of executable logic of its own - it edits three documents. Steps are still
numbered and checked off the same way, but there is no test-first pass and no new source file.

- [ ] **Step 1: Replace the README's "Adding a job" section**

Replace the existing `## Adding a job` section in full (it currently sits directly after "First run"
and before "## Keyboard shortcuts on the board" - that position does not change):

```markdown
## Adding a job

Click "Add job" on the board. Paste a link to the posting, paste the posting text, or both, next to
the company and role fields it already had. Company and role are optional when a link or text is
given; Jobsmith fills them in when it can read the posting.

A Greenhouse, Ashby or Lever link is read straight from that vendor's own public API. Any other link
is fetched and read as a web page. LinkedIn is not read: paste the posting text instead, since
LinkedIn requires a login Jobsmith does not have. A link that cannot be read for another reason
(blocked, timed out, too large, not found, too short, or simply unreadable) asks for the pasted text
too, unless company and role are already typed, in which case the job saves with the link alone.

When an AI provider is configured (below), pasted or fetched text is sent to it to read the company,
role, location, work mode and pay. Only the posting text is sent, inside a fixed wrapper that tells
the model to treat it as data, never instructions; nothing about your account goes with it. The
stored posting itself is never rewritten by the model: it stays the pasted text or the fetched page,
turned into plain markdown. When the model is off, fails, or cannot find the company and role, the
dialog asks for them directly and the job is saved with a "Check this job's details" notice on its
page, cleared by editing the details or by "Mark as checked."

Adding the same company and role again while the first one is still active shows "You already have
this job." with a link to open it, and "Add anyway" to add a second copy.

"Where is it now" defaults to Saved. The job is always created with all seven stages. Choosing
Applied moves it there once. Choosing a column after Applied moves it to Applied first and then to
the chosen column, so its history shows two moves, unlike the single drag you would get from adding
it plain and moving the card afterward.

### AI (optional)

Jobsmith works with no AI configured; intake then asks for the company and role by hand. Four
environment variables turn it on, read in `.env.example`:

- `AI_PROVIDER`: `gateway` (Vercel AI Gateway), `anthropic` (the Anthropic API directly), or `fake`
  (the test suite's own stand-in, which never sends text anywhere). Unset means AI stays off.
- `AI_GATEWAY_API_KEY`: needed for `gateway`, except on Vercel, where the project's own OIDC token is
  used instead.
- `ANTHROPIC_API_KEY`: needed for `anthropic`.
- `AI_MODEL`: optional, overrides the provider's default model.

`AI_PROVIDER` has to be set on purpose: a developer's own shell `ANTHROPIC_API_KEY`, left over from
another project, must never send a posting anywhere by accident. Every call to the Vercel AI Gateway
asks for zero data retention.
```

- [ ] **Step 2: Confirm "Keyboard shortcuts on the board" is still accurate**

That section describes nothing this milestone touches (no field, no shortcut and no board behavior
changed), so this step is a read-through to confirm that, not a rewrite.

- [ ] **Step 3: Update `docs/design-system.md`**

No new registry item and no new `base-nova` primitive this milestone. Add one bullet to the existing
"New application code (no registry or primitive match)" section, after the `components/markdown.tsx`
and `components/copy-button.tsx` bullet:

```markdown
- `components/job/review-notice.tsx`: hand-written, not vendored. The registry has no "needs review"
  or similar inline notice pattern to copy from; it reuses the exact
  `rounded-lg border border-border bg-muted p-3 text-sm` shell `job-header.tsx`'s own closed-job
  banner already uses, rather than inventing a second one.
```

- [ ] **Step 4: Amend the spec, section 3 (Architecture)**

In `docs/superpowers/specs/2026-09-18-jobsmith-core-design.md`, section 3, add a paragraph directly
after the module map's own code block, before `## 4. Data model`:

```markdown
**Milestone 4 note.** Decisions D18, D19: the AI driver behind `lib/ai` is one of three
implementations picked by `AI_PROVIDER` at boot (`gateway`, `anthropic`, `fake`); intake code only
ever sees the shared `AiDriver` interface, never a provider SDK directly. AI stays off unless
`AI_PROVIDER` is set, on purpose, so a developer's own leftover API key in the shell environment
never sends a posting anywhere by accident.
```

- [ ] **Step 5: Amend the spec, section 5.5 (Intake)**

In the same file, section 5.5, add a paragraph directly after the existing final paragraph
(`createOpportunity matches or creates the company by name_key...`), before `### 5.6 Fit scoring`:

```markdown
**Milestone 4 notes.** Decisions D3, D5, D8, D11, D13, D15, D16: resolution tries a known ATS link
first, then pasted text (a non-ATS link next to it is kept as the link and never fetched), then a
plain link, fetched and read as a web page. A link alone that cannot be read blocks the add only when
company and role are also missing; otherwise the job saves with the link alone. LinkedIn is never
fetched at all: it returns the "paste the text" outcome before any request, since it requires a login
Jobsmith does not have. A fetched page's article is read with Readability and turned to markdown; a
result under 600 visible characters is treated as unread. Only ports 80 and 443 are ever reached. The
model, when configured, returns fields only and never rewrites the stored body: the saved posting
stays the pasted text or the fetched page, turned to markdown, so it never drifts from what the
posting actually said.
```

- [ ] **Step 6: Amend the spec, section 7 (Security and privacy)**

In the same file, section 7, add a paragraph directly after the existing Milestone 3 note, before
`## 8. Testing`:

```markdown
**Milestone 4 note.** Decision D19: AI is opt-in through `AI_PROVIDER`, never through the mere
presence of a provider API key in the environment, since a key left over from another project must
never send a job posting anywhere without an explicit choice to turn intake's AI on. The fetch guard
(section 5.5) is the only code path in the app that makes an outbound request on a user's behalf, and
every request it makes is checked against the same address and port policy before it connects.
```

- [ ] **Step 7: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm check:tokens
pnpm test
pnpm build
pnpm test:e2e
```

Expected: all six exit 0. This task changes no source file (only docs), so this step confirms a
documentation-only change did not somehow break a rule that reads Markdown, not that anything new
needed fixing.

- [ ] **Step 8: The owner hand-edits the README before this ships**

Every sentence in Step 1's README section was drafted for this plan, not by the owner. Before this
milestone ships, the owner reads it against their own voice and the writing rules in their own
working notes (no em dashes, no exclamation marks, TL;DR first on anything long, state the positive
claim rather than "not X, Y") and hand-edits anything that reads as generated rather than written.
This step is not optional and is not satisfied by an agent rereading its own draft.

- [ ] **Step 9 (owner-gated, not part of the builder's checklist): the preview check**

This step belongs to the owner alone. No builder, agent or CI job runs it, and it produces nothing
that gets committed.

1. Deploy or run the full build (`pnpm build && pnpm start`, or the project's preview deploy) with no
   `AI_PROVIDER` set at all.
2. Add a job from one real Greenhouse job posting link. Confirm it reads company, role, location and
   the posting body with no AI key present (D34's Greenhouse half of "done when": the ATS path never
   needs a model).
3. Add a second job by pasting the text of one real LinkedIn posting. Confirm the dialog asks for the
   link's text first (no request ever goes to LinkedIn), and that typing company and role saves it
   with the review notice, since no AI is configured.
4. Check both light and dark, at desktop width and at 390px, in Chrome and Safari.
5. Optionally, repeat step 3 with `AI_PROVIDER=gateway` set, and confirm the same posting now resolves
   company and role on its own, with no review notice.

- [ ] **Step 10: Commit**

```bash
git add README.md docs/design-system.md docs/superpowers/specs/2026-09-18-jobsmith-core-design.md
git commit -m "$(cat <<'EOF'
docs: document intake, AI configuration and the M4 spec amendments

EOF
)"
```

End the message with the co-author trailer supplied by the executing session.

---
