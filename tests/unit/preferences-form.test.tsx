// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { savePreferencesAction } from "@/app/(app)/preferences/actions";
import { PreferencesForm } from "@/components/preferences/preferences-form";
import { DEFAULT_PREFERENCES, type Preferences } from "@/lib/preferences/schema";

vi.mock("@/app/(app)/preferences/actions", () => ({ savePreferencesAction: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockedAction = vi.mocked(savePreferencesAction);

const saved: Preferences = {
  ...DEFAULT_PREFERENCES,
  titles: ["Product designer", "Design lead"],
  workModes: ["remote", "hybrid"],
  seniority: ["senior"],
  compFloor: 120000,
  companySize: { min: 50, max: 2000 },
  scoreThreshold: 75,
  attention: { followUpDays: 5, savedDays: 2 },
};

function renderForm() {
  return render(
    <LiveAnnouncerProvider>
      <PreferencesForm preferences={saved} />
    </LiveAnnouncerProvider>,
  );
}

async function submit() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));
  });
}

describe("PreferencesForm", () => {
  // Braces: a returned function would run as vitest teardown.
  beforeEach(() => {
    mockedAction.mockReset();
  });

  it("renders the saved values", () => {
    const { container } = renderForm();
    expect((screen.getByLabelText("Pay floor") as HTMLInputElement).value).toBe("120,000");
    expect((screen.getByLabelText("Score threshold") as HTMLInputElement).value).toBe("75");
    expect((screen.getByLabelText("Follow up after") as HTMLInputElement).value).toBe("5");
    expect((screen.getByLabelText("Company size, largest") as HTMLInputElement).value).toBe("2,000");
    expect(screen.getByRole("button", { name: "Remove Design lead" })).toBeTruthy();
    const values = (name: string) =>
      Array.from(container.querySelectorAll<HTMLInputElement>(`input[type="hidden"][name="${name}"]`)).map((i) => i.value);
    expect(values("titles")).toEqual(["Product designer", "Design lead"]);
    expect(values("workModes")).toEqual(["remote", "hybrid"]);
    expect(values("seniority")).toEqual(["senior"]);
    expect(screen.getByText("New and rescored jobs use the saved version.")).toBeTruthy();
  });

  it("shows field errors and the failure message from a failed save", async () => {
    mockedAction.mockResolvedValue({
      ok: false,
      code: "invalid",
      message: "Check the highlighted fields.",
      fieldErrors: { followUpDays: "Enter a whole number of days from 1 to 60." },
    });
    renderForm();
    await submit();
    const field = screen.getByLabelText("Follow up after");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    const error = screen.getByText("Enter a whole number of days from 1 to 60.");
    expect(field.getAttribute("aria-describedby")).toContain(error.parentElement!.id);
    expect(screen.getByRole("alert").textContent).toBe("Check the highlighted fields.");
    expect(screen.queryByText("New and rescored jobs use the saved version.")).toBeNull();
    // A failed save keeps what was typed.
    expect((screen.getByLabelText("Pay floor") as HTMLInputElement).value).toBe("120,000");
  });

  it("keeps the form and says so when the action rejects", async () => {
    mockedAction.mockRejectedValue(new Error("network"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderForm();
    await submit();
    expect(screen.getByRole("alert").textContent).toBe(
      "Not saved: the connection dropped. Your changes are still on this page.",
    );
  });

  it("toasts on success", async () => {
    const { toast } = await import("sonner");
    mockedAction.mockResolvedValue({ ok: true });
    renderForm();
    await submit();
    expect(toast.success).toHaveBeenCalledWith("Preferences saved.");
  });
});
