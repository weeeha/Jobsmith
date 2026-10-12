// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const harness = vi.hoisted(() => ({
  refresh: vi.fn(),
  router: { refresh: undefined as unknown as () => void },
  toastError: vi.fn(),
}));
harness.router.refresh = harness.refresh;

vi.mock("next/navigation", () => ({ useRouter: () => harness.router }));
vi.mock("sonner", () => ({ toast: { error: harness.toastError } }));
vi.mock("@/app/(app)/jobs/[slug]/actions", () => ({ scoreFitAction: vi.fn() }));

import { scoreFitAction } from "@/app/(app)/jobs/[slug]/actions";
import { FitCard } from "@/components/fit/fit-card";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { FIT_POLL_MAX, FIT_POLL_MS, type FitCardModel } from "@/lib/fit/card";

const mockedScore = vi.mocked(scoreFitAction);

const FIT = {
  v: 1 as const,
  score: 81,
  summary: "A strong match for internal tools work.",
  pros: ["Eight years in design systems.", "Internal tools background."],
  cons: ["The posting does not state pay."],
  modelId: "fake-extractor",
  scoredAt: "2026-10-10T09:00:00.000Z",
};

function modelOf(overrides: Partial<FitCardModel> = {}): FitCardModel {
  return {
    opportunityId: "00000000-0000-4000-8000-000000000001",
    roleTitle: "Product Designer",
    companyName: "Northwind Traders",
    view: "none",
    readiness: "ready",
    fit: null,
    band: null,
    threshold: 70,
    profileChangedSince: false,
    hardFilters: { pass: true, failed: [], unchecked: [] },
    hasHardFilters: false,
    ...overrides,
  };
}

function doneModel(overrides: Partial<FitCardModel> = {}): FitCardModel {
  return modelOf({ view: "done", fit: FIT, band: "strong", ...overrides });
}

// The chip splits its text across a mark, hidden words and the number, so it
// is read from the badge itself.
function chipText(): string | undefined {
  return document.querySelector('[data-slot="badge"]')?.textContent ?? undefined;
}

function announced(): string | undefined {
  return document.querySelector('[aria-live="polite"]')?.textContent ?? undefined;
}

function renderCard(model: FitCardModel) {
  return render(
    <LiveAnnouncerProvider>
      <FitCard model={model} />
    </LiveAnnouncerProvider>,
  );
}

beforeEach(() => {
  harness.refresh.mockReset();
  harness.toastError.mockReset();
  mockedScore.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("FitCard: views", () => {
  it("none and ready: says there is no score yet and offers Score this job", () => {
    renderCard(modelOf());
    expect(screen.getByRole("heading", { level: 2, name: "Fit" })).toBeTruthy();
    expect(screen.getByText("This job has no fit score yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Score this job" })).toBeTruthy();
  });

  it.each([
    ["ai_off", "Fit scoring needs AI, and AI is not turned on for this server."],
    ["no_posting", "Fit scoring needs the posting text, and this job has none."],
  ] as const)("none and %s: explains and offers no button", (readiness, text) => {
    renderCard(modelOf({ readiness }));
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("none and no_resume: links to Settings", () => {
    renderCard(modelOf({ readiness: "no_resume" }));
    expect(screen.getByText(/Add your resume in Settings to get a fit score\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Settings" }).getAttribute("href")).toBe("/settings");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("pending: shows the pending line in the status region and no button", () => {
    renderCard(modelOf({ view: "pending" }));
    const line = screen.getByText("Scoring this job. This can take a few seconds.");
    expect(line.getAttribute("role")).toBe("status");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps the status region in the document for every view, empty when nothing is pending", () => {
    renderCard(modelOf());
    const regions = screen.getAllByRole("status");
    expect(regions.some((region) => region.tagName === "P" && region.textContent === "")).toBe(true);
  });

  it.each([
    ["stalled", "Scoring did not finish."],
    ["failed", "Scoring did not work this time. The job is saved as it is."],
  ] as const)("%s: shows its line and Try again", (view, text) => {
    renderCard(modelOf({ view }));
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("failed and not ready: shows the line and the reason, without a button", () => {
    renderCard(modelOf({ view: "failed", readiness: "ai_off" }));
    expect(screen.getByText("Scoring did not work this time. The job is saved as it is.")).toBeTruthy();
    expect(screen.getByText("Fit scoring needs AI, and AI is not turned on for this server.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("FitCard: done", () => {
  it("shows the chip, the line against the threshold, the summary and both lists", () => {
    renderCard(doneModel());
    expect(chipText()).toBe("Fit score 81, strong fit");
    expect(screen.getByText("Above your good-fit line of 70.")).toBeTruthy();
    expect(screen.getByText("A strong match for internal tools work.")).toBeTruthy();
    const pros = screen.getByRole("heading", { level: 3, name: "Why it fits" }).parentElement as HTMLElement;
    expect(within(pros).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Eight years in design systems.",
      "Internal tools background.",
    ]);
    const cons = screen.getByRole("heading", { level: 3, name: "What may not fit" }).parentElement as HTMLElement;
    expect(within(cons).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "The posting does not state pay.",
    ]);
    expect(screen.getByRole("button", { name: "Score again" })).toBeTruthy();
  });

  it("lets an 80-character word in the summary, a pro and a con break inside the word", () => {
    const word = "z".repeat(80);
    renderCard(doneModel({ fit: { ...FIT, summary: word, pros: [word], cons: [word] } }));
    const elements = screen.getAllByText(word);
    expect(elements).toHaveLength(3);
    for (const element of elements) expect(element.className).toContain("break-words");
  });

  it("says Below when the score is under the line, and Above at exactly the line", () => {
    const { unmount } = renderCard(doneModel({ threshold: 90 }));
    expect(screen.getByText("Below your good-fit line of 90.")).toBeTruthy();
    unmount();
    renderCard(doneModel({ threshold: 81 }));
    expect(screen.getByText("Above your good-fit line of 81.")).toBeTruthy();
  });

  it("omits an empty list and its heading", () => {
    renderCard(doneModel({ fit: { ...FIT, pros: [] } }));
    expect(screen.queryByRole("heading", { name: "Why it fits" })).toBeNull();
    expect(screen.getByRole("heading", { name: "What may not fit" })).toBeTruthy();
  });

  it("names the model and the time of the score", () => {
    renderCard(doneModel());
    const line = screen.getByText(/^Scored /);
    expect(line.textContent).toMatch(/^Scored .+ by fake-extractor\.$/);
    expect(line.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-10T09:00:00.000Z");
  });

  it("shows the profile-changed line only when the model says so", () => {
    const { unmount } = renderCard(doneModel());
    expect(screen.queryByText("Your profile changed after this score.")).toBeNull();
    unmount();
    renderCard(doneModel({ profileChangedSince: true }));
    expect(screen.getByText("Your profile changed after this score.")).toBeTruthy();
  });

  it("done and not ready: keeps the score and explains why it cannot be scored again", () => {
    renderCard(doneModel({ readiness: "no_resume" }));
    expect(chipText()).toBe("Fit score 81, strong fit");
    expect(screen.getByRole("link", { name: "Open Settings" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Score again" })).toBeNull();
  });
});

describe("FitCard: hard filters", () => {
  it("passes", () => {
    renderCard(modelOf({ hasHardFilters: true }));
    expect(screen.getByRole("heading", { level: 3, name: "Hard filters" })).toBeTruthy();
    expect(screen.getByText("Passes your hard filters.")).toBeTruthy();
  });

  it("lists the misses by their plain names", () => {
    renderCard(
      modelOf({ hasHardFilters: true, hardFilters: { pass: false, failed: ["title", "pay"], unchecked: [] } }),
    );
    expect(screen.getByText("Misses your hard filters: job title, pay floor.")).toBeTruthy();
    expect(screen.queryByText("Passes your hard filters.")).toBeNull();
  });

  it("lists what could not be checked next to a pass", () => {
    renderCard(
      modelOf({ hasHardFilters: true, hardFilters: { pass: true, failed: [], unchecked: ["location", "work_mode"] } }),
    );
    expect(screen.getByText("Passes your hard filters.")).toBeTruthy();
    expect(screen.getByText("Not checked: location, work mode.")).toBeTruthy();
  });

  it("with none set: says so and links to Preferences, even when AI is off", () => {
    renderCard(modelOf({ readiness: "ai_off", hasHardFilters: false }));
    expect(screen.getByText(/No hard filters set\./)).toBeTruthy();
    const link = screen.getByRole("link", { name: "Set preferences" });
    expect(link.getAttribute("href")).toBe("/preferences");
    // A link inside muted text needs more than color to stand out.
    expect(link.classList.contains("underline")).toBe(true);
    expect(screen.queryByText("Passes your hard filters.")).toBeNull();
  });
});

describe("FitCard: scoring from the card", () => {
  it("disables the button and shows the pending line while the action runs, then announces the score", async () => {
    let finish: (value: Awaited<ReturnType<typeof scoreFitAction>>) => void = () => {};
    mockedScore.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderCard(modelOf());
    const button = screen.getByRole("button", { name: "Score this job" }) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(button);
    });
    expect(mockedScore).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001");
    expect(button.disabled).toBe(true);
    expect(screen.getByText("Scoring this job. This can take a few seconds.").getAttribute("role")).toBe("status");
    await act(async () => {
      finish({ ok: true, data: { status: "done", score: 81 } });
    });
    await waitFor(() => expect(announced()).toBe("Scored Product Designer at Northwind Traders: 81."));
    expect(button.disabled).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(button));
  });

  it("announces the failure line when the run ended failed", async () => {
    mockedScore.mockResolvedValue({ ok: true, data: { status: "failed", score: null } });
    renderCard(modelOf({ view: "failed" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    await waitFor(() => expect(announced()).toBe("Scoring did not work this time. The job is saved as it is."));
  });

  it("toasts the message when the action refuses", async () => {
    mockedScore.mockResolvedValue({ ok: false, code: "not_ready", message: "This job cannot be scored yet." });
    renderCard(modelOf());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Score this job" }));
    });
    expect(harness.toastError).toHaveBeenCalledWith("Could not score this job. This job cannot be scored yet.");
  });

  it("toasts a generic message when the action rejects", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mockedScore.mockRejectedValue(new Error("network"));
    renderCard(modelOf());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Score this job" }));
    });
    expect(harness.toastError).toHaveBeenCalledWith("Could not score this job. Something went wrong. Try again.");
    error.mockRestore();
  });
});

describe("FitCard: polling while pending", () => {
  it("refreshes the page every three seconds and stops after forty refreshes", () => {
    vi.useFakeTimers();
    renderCard(modelOf({ view: "pending" }));
    expect(FIT_POLL_MS).toBe(3_000);
    expect(FIT_POLL_MAX).toBe(40);
    expect(harness.refresh).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(FIT_POLL_MS - 1);
    });
    expect(harness.refresh).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(harness.refresh).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(FIT_POLL_MS * (FIT_POLL_MAX - 1));
    });
    expect(harness.refresh).toHaveBeenCalledTimes(FIT_POLL_MAX);
    act(() => {
      vi.advanceTimersByTime(FIT_POLL_MS * 10);
    });
    expect(harness.refresh).toHaveBeenCalledTimes(FIT_POLL_MAX);
  });

  it("does not poll for any other view", () => {
    vi.useFakeTimers();
    for (const view of ["none", "stalled", "failed"] as const) {
      const { unmount } = renderCard(modelOf({ view }));
      act(() => {
        vi.advanceTimersByTime(FIT_POLL_MS * 5);
      });
      unmount();
    }
    const { unmount } = renderCard(doneModel());
    act(() => {
      vi.advanceTimersByTime(FIT_POLL_MS * 5);
    });
    unmount();
    expect(harness.refresh).not.toHaveBeenCalled();
  });

  it("stops polling the moment the page shows a result", () => {
    vi.useFakeTimers();
    const { rerender } = renderCard(modelOf({ view: "pending" }));
    act(() => {
      vi.advanceTimersByTime(FIT_POLL_MS * 2);
    });
    expect(harness.refresh).toHaveBeenCalledTimes(2);
    rerender(
      <LiveAnnouncerProvider>
        <FitCard model={doneModel()} />
      </LiveAnnouncerProvider>,
    );
    act(() => {
      vi.advanceTimersByTime(FIT_POLL_MS * 5);
    });
    expect(harness.refresh).toHaveBeenCalledTimes(2);
  });
});
