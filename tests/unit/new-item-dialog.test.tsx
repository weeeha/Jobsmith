// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { NewItemDialog } from "@/components/library/new-item-dialog";
import { createLibraryItemAction } from "@/app/(app)/library/actions";

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));
vi.mock("@/app/(app)/library/actions", () => ({ createLibraryItemAction: vi.fn(), saveToLibraryAction: vi.fn() }));

beforeEach(() => {
  cleanup();
  refresh.mockReset();
  push.mockReset();
  vi.mocked(createLibraryItemAction).mockReset();
});
afterEach(cleanup);

async function open() {
  render(
    <LiveAnnouncerProvider>
      <NewItemDialog />
    </LiveAnnouncerProvider>,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "New item" }));
  });
  const dialog = await screen.findByRole("dialog", { name: "New library item" });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return dialog;
}

describe("NewItemDialog", () => {
  it("offers story, intro and fact only", async () => {
    const dialog = await open();
    const kind = within(dialog).getByLabelText("Kind") as HTMLSelectElement;
    expect(Array.from(kind.options).map((o) => o.value)).toEqual(["story", "intro", "fact"]);
  });

  it("the New item dialog validates the title and tags and closes on success", async () => {
    vi.mocked(createLibraryItemAction).mockResolvedValueOnce({
      ok: false,
      code: "invalid",
      message: "Check the highlighted fields.",
      fieldErrors: { title: "Give the item a title.", tags: "Use at most 20 tags." },
    });
    const dialog = await open();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Create item" }));
    });
    await waitFor(() => expect(within(dialog).getByText("Give the item a title.")).toBeTruthy());
    expect(within(dialog).getByText("Use at most 20 tags.")).toBeTruthy();
    expect(within(dialog).getByLabelText("Title").getAttribute("aria-invalid")).toBe("true");
    // The dialog stays open and the focus returns to the first field in error.
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByLabelText("Title")));

    vi.mocked(createLibraryItemAction).mockResolvedValueOnce({ ok: true, data: { id: "33333333-3333-4333-8333-333333333333" } });
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "Northwind pricing" } });
      fireEvent.change(within(dialog).getByLabelText("Body"), { target: { value: "We cut the steps." } });
    });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Create item" }));
    });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New library item" })).toBeNull());
    const formData = vi.mocked(createLibraryItemAction).mock.calls[1][1] as FormData;
    expect(formData.get("kind")).toBe("story");
    expect(formData.get("title")).toBe("Northwind pricing");
    expect(refresh).toHaveBeenCalled();
  });
});
