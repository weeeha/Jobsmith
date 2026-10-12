// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/app/(app)/jobs/[slug]/actions", () => ({ setNextActionAction: vi.fn() }));

import { setNextActionAction } from "@/app/(app)/jobs/[slug]/actions";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { TimeZoneProvider } from "@/components/time-zone-provider";
import { SetNextActionDialog, type NextActionSubject } from "@/components/next-action/set-next-action-dialog";

const mockedAction = vi.mocked(setNextActionAction);

const SUBJECT: NextActionSubject = {
  id: "00000000-0000-4000-8000-0000000000a1",
  roleTitle: "Product Designer",
  companyName: "Northwind Traders",
  nextAction: null,
  nextActionAt: null,
};

async function renderDialog(subject: NextActionSubject | null = SUBJECT) {
  const onClose = vi.fn();
  const view = render(
    <LiveAnnouncerProvider>
      <TimeZoneProvider zone="UTC">
        <SetNextActionDialog subject={subject} onClose={onClose} />
      </TimeZoneProvider>
    </LiveAnnouncerProvider>,
  );
  // Base UI queues its initial focus behind a requestAnimationFrame; flush it
  // so a later focus assertion is not racing it.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { onClose, ...view };
}

function dialog() {
  return screen.getByRole("dialog", { name: "Set the next action" });
}

async function type(label: string, value: string) {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  });
}

async function save() {
  await act(async () => {
    fireEvent.click(within(dialog()).getByRole("button", { name: "Save" }));
    await Promise.resolve();
  });
}

beforeEach(() => {
  mockedAction.mockReset();
});

describe("SetNextActionDialog", () => {
  it("is closed while there is no subject", async () => {
    await renderDialog(null);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens with the title, the job in the description, and focus on What is next", async () => {
    await renderDialog();
    expect(within(dialog()).getByText("Product Designer at Northwind Traders")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("What is next")));
    expect(within(dialog()).getByLabelText("When")).toBeTruthy();
    expect(within(dialog()).getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("starts from the next action the job already has", async () => {
    await renderDialog({ ...SUBJECT, nextAction: "Send the portfolio", nextActionAt: new Date("2026-10-12T09:00:00.000Z") });
    expect((screen.getByLabelText("What is next") as HTMLInputElement).value).toBe("Send the portfolio");
    expect((screen.getByLabelText("When") as HTMLInputElement).value).toBe("2026-10-12T09:00");
  });

  it("posts the text and the instant, then closes as saved and announces it", async () => {
    mockedAction.mockResolvedValue({ ok: true });
    const { onClose } = await renderDialog();
    await type("What is next", "Send the portfolio");
    await type("When", "2026-10-12T09:00");
    await save();

    expect(mockedAction).toHaveBeenCalledTimes(1);
    const [id, , formData] = mockedAction.mock.calls[0] as unknown as [string, unknown, FormData];
    expect(id).toBe(SUBJECT.id);
    expect(formData.get("text")).toBe("Send the portfolio");
    expect(formData.get("at")).toBe("2026-10-12T09:00:00.000Z");
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(true));
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe(
        "Next action saved for Product Designer at Northwind Traders.",
      ),
    );
  });

  it("sends an empty instant when When is left blank", async () => {
    mockedAction.mockResolvedValue({ ok: true });
    await renderDialog();
    await type("What is next", "Follow up");
    await save();
    const [, , formData] = mockedAction.mock.calls[0] as unknown as [string, unknown, FormData];
    expect(formData.get("at")).toBe("");
  });

  it("keeps the dialog open on an error, shows it, and puts focus back on Save", async () => {
    mockedAction.mockResolvedValue({
      ok: false,
      code: "invalid",
      message: "Check the highlighted fields.",
      fieldErrors: { text: "Enter what is next." },
    });
    const { onClose } = await renderDialog();
    await save();

    expect(within(dialog()).getByRole("alert").textContent).toBe("Check the highlighted fields.");
    expect(within(dialog()).getByText("Enter what is next.")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(within(dialog()).getByRole("button", { name: "Save" })));
  });

  it("closes as not saved on Cancel and on Escape", async () => {
    const first = await renderDialog();
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    });
    expect(first.onClose).toHaveBeenCalledWith(false);
    first.unmount();

    const second = await renderDialog();
    await act(async () => {
      fireEvent.keyDown(dialog(), { key: "Escape" });
    });
    expect(second.onClose).toHaveBeenCalledWith(false);
    expect(mockedAction).not.toHaveBeenCalled();
  });
});
