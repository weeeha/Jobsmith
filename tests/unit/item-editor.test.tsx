// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { ArchiveButton, ItemEditor } from "@/components/library/item-editor";
import { archiveLibraryItemAction, updateLibraryItemAction } from "@/app/(app)/library/actions";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(app)/library/actions", () => ({
  updateLibraryItemAction: vi.fn(),
  archiveLibraryItemAction: vi.fn(),
}));

const ID = "11111111-1111-4111-8111-111111111111";

function renderEditor(tags: string[] = ["pricing"]) {
  return render(
    <LiveAnnouncerProvider>
      <ItemEditor id={ID} title="Northwind pricing" bodyMd={"We cut the steps.\n\n**Bold claim**"} tags={tags} renderedBody={<p>Rendered body</p>} />
    </LiveAnnouncerProvider>,
  );
}

beforeEach(() => {
  cleanup();
  refresh.mockReset();
  vi.mocked(updateLibraryItemAction).mockReset();
  vi.mocked(archiveLibraryItemAction).mockReset();
});
afterEach(cleanup);

describe("ItemEditor", () => {
  it("shows the rendered body until Edit is pressed", () => {
    renderEditor();
    expect(screen.getByText("Rendered body")).toBeTruthy();
    expect(screen.queryByLabelText("Title")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit Northwind pricing" }));
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Northwind pricing");
  });

  it("the Write and Preview toggle renders the markdown preview and saving calls the action", async () => {
    vi.mocked(updateLibraryItemAction).mockResolvedValue({ ok: true, data: { id: ID } });
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit Northwind pricing" }));
    const body = screen.getByLabelText("Body") as HTMLTextAreaElement;
    expect(body.value).toContain("Bold claim");
    fireEvent.change(body, { target: { value: "Changed **strong** text" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByText("strong").tagName).toBe("STRONG");
    expect(screen.queryByLabelText("Body")).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    });
    await waitFor(() => expect(updateLibraryItemAction).toHaveBeenCalledTimes(1));
    const [id, , formData] = vi.mocked(updateLibraryItemAction).mock.calls[0];
    expect(id).toBe(ID);
    expect((formData as FormData).get("bodyMd")).toBe("Changed **strong** text");
    expect((formData as FormData).get("title")).toBe("Northwind pricing");
    expect((formData as FormData).getAll("tags")).toEqual(["pricing"]);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByLabelText("Title")).toBeNull());
  });

  it("tags use the chip field with the 20 and 80 limits", async () => {
    vi.mocked(updateLibraryItemAction).mockResolvedValue({
      ok: false,
      code: "invalid",
      message: "Check the item and try again.",
      fieldErrors: { tags: "Use at most 20 tags." },
    });
    renderEditor(Array.from({ length: 21 }, (_, i) => `tag ${i}`));
    fireEvent.click(screen.getByRole("button", { name: "Edit Northwind pricing" }));
    expect(screen.getByRole("button", { name: "Remove tag 0" })).toBeTruthy();
    expect(screen.getByText(/up to 20 tags/i)).toBeTruthy();
    expect(screen.getByText(/80 characters/i)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    });
    await waitFor(() => expect(screen.getAllByText("Use at most 20 tags.").length).toBeGreaterThan(0));
    expect(screen.getByLabelText("Tags").getAttribute("aria-invalid")).toBe("true");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows the title error from the action and keeps the form open", async () => {
    vi.mocked(updateLibraryItemAction).mockResolvedValue({
      ok: false,
      code: "invalid",
      message: "x",
      fieldErrors: { title: "Give the item a title." },
    });
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit Northwind pricing" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    });
    await waitFor(() => expect(screen.getByText("Give the item a title.")).toBeTruthy());
    expect(screen.getByLabelText("Title").getAttribute("aria-invalid")).toBe("true");
  });
});

describe("ArchiveButton", () => {
  it("archives and refreshes, and offers Restore for an archived item", async () => {
    vi.mocked(archiveLibraryItemAction).mockResolvedValue({ ok: true, data: { archived: true } });
    const view = render(
      <LiveAnnouncerProvider>
        <ArchiveButton id={ID} archived={false} />
      </LiveAnnouncerProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    });
    await waitFor(() => expect(archiveLibraryItemAction).toHaveBeenCalledWith(ID, true));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    view.unmount();
    render(
      <LiveAnnouncerProvider>
        <ArchiveButton id={ID} archived />
      </LiveAnnouncerProvider>,
    );
    expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy();
  });
});
