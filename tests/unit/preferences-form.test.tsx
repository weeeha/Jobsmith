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
