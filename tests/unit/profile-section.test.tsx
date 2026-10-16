// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { saveProfileAction } from "@/app/(app)/settings/actions";
import { ProfileSection } from "@/components/settings/profile-section";

vi.mock("@/app/(app)/settings/actions", () => ({ saveProfileAction: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockedAction = vi.mocked(saveProfileAction);

function renderSection() {
  render(
    <LiveAnnouncerProvider>
      <ProfileSection
        profile={{ headline: "Product designer", timezone: "UTC", resumeMd: "# Resume" }}
        timeZones={["UTC", "America/New_York"]}
      />
    </LiveAnnouncerProvider>,
  );
}

async function submit() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
  });
}

beforeEach(() => {
  mockedAction.mockReset();
  vi.mocked(toast.success).mockReset();
});

describe("ProfileSection", () => {
  it("renders the saved values and the binding copy", () => {
    renderSection();
    expect((screen.getByLabelText("Headline") as HTMLInputElement).value).toBe("Product designer");
    expect((screen.getByLabelText("Time zone") as HTMLInputElement).value).toBe("UTC");
    expect((screen.getByLabelText("Resume") as HTMLTextAreaElement).value).toBe("# Resume");
    expect(screen.getByText("One line, the way you would introduce yourself.")).toBeTruthy();
    expect(screen.getByText("Home uses this zone to decide what is due today.")).toBeTruthy();
  });

  it("sends the three field names and toasts on success", async () => {
    mockedAction.mockResolvedValue({ ok: true });
    renderSection();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "Designer" } });
    });
    await submit();
    const formData = mockedAction.mock.calls[0][1];
    expect(formData.get("headline")).toBe("Designer");
    expect(formData.get("timezone")).toBe("UTC");
    expect(formData.get("resumeMd")).toBe("# Resume");
    expect(toast.success).toHaveBeenCalledWith("Profile saved.");
  });

  it("shows field errors under the control and keeps what was typed", async () => {
    mockedAction.mockResolvedValue({
      ok: false,
      code: "invalid",
      message: "x",
      fieldErrors: { timezone: "Pick a time zone from the list, like America/New_York." },
    });
    renderSection();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Time zone"), { target: { value: "Mars/Olympus" } });
    });
    await submit();
    const input = screen.getByLabelText("Time zone") as HTMLInputElement;
    expect(input.value).toBe("Mars/Olympus");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const error = screen.getByText("Pick a time zone from the list, like America/New_York.");
    expect(input.getAttribute("aria-describedby")).toContain(error.id);
    expect(screen.getByText("Check the highlighted fields.")).toBeTruthy();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("shows a message when the action rejects", async () => {
    mockedAction.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderSection();
    await submit();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
