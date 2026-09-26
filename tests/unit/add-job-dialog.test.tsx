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
    let resolveAction!: (value: Awaited<ReturnType<typeof addJobAction>>) => void;
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
