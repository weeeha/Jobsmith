// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { scoreFitAction } from "@/app/(app)/jobs/[slug]/actions";
import { FitCard } from "@/components/fit/fit-card";
import { fitCardModel, FIT_POLL_MAX, FIT_POLL_MS, type CardOpportunity, type FitCardModel } from "@/lib/fit/card";
import { toStoredFit } from "@/lib/fit/stored";
import { DEFAULT_PREFERENCES, type Preferences } from "@/lib/preferences/schema";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(app)/jobs/[slug]/actions", () => ({ scoreFitAction: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const NOW = new Date("2026-10-15T12:00:00.000Z");
const STORED = toStoredFit(
  {
    score: 64,
    summary: "Strong craft match, but the role is onsite in a city outside your list.",
    pros: ["Design lead scope", "Mature research practice"],
    cons: ["Onsite five days", "Relocation likely"],
  },
  "fake-extractor",
  new Date("2026-10-15T09:00:00.000Z"),
);
const OPPORTUNITY: CardOpportunity = {
  id: "00000000-0000-4000-8000-000000000001",
  roleTitle: "Design Lead",
  location: "Berlin, Germany",
  workMode: "onsite",
  compMin: null,
  compMax: null,
  compCurrency: null,
  postingMd: "About the job",
  fitStatus: "done",
  fitScore: 64,
  fit: STORED,
  updatedAt: new Date("2026-10-15T09:00:00.000Z"),
};

function modelWith(over: Partial<CardOpportunity> = {}, prefs: Partial<Preferences> = {}, resumeMd: string | null = "# Resume"): FitCardModel {
  return fitCardModel({
    opportunity: { ...OPPORTUNITY, ...over },
    profile: { headline: null, resumeMd, preferences: { ...DEFAULT_PREFERENCES, ...prefs } },
    aiOn: true,
    now: NOW,
  });
}

function renderCard(model: FitCardModel) {
  return render(
    <LiveAnnouncerProvider>
      <FitCard model={model} />
    </LiveAnnouncerProvider>,
  );
}

beforeEach(() => {
  cleanup();
  refresh.mockReset();
  vi.mocked(scoreFitAction).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("FitCard, scored", () => {
  it("shows the score with its band, the summary, pros, cons and the filter line", () => {
    renderCard(modelWith({ fitScore: 82, fit: { ...STORED, score: 82 } }, { titles: ["Design lead"] }));
    const card = screen.getByRole("region", { name: "Fit" });
    expect(within(card).getByText("82 · Good fit")).toBeTruthy();
    expect(within(card).getByText(STORED.summary)).toBeTruthy();
    expect(within(card).getByRole("list", { name: "Pros" }).textContent).toContain("Design lead scope");
    expect(within(card).getByRole("list", { name: "Cons" }).textContent).toContain("Relocation likely");
    expect(within(card).getByText("Passes your hard filters.")).toBeTruthy();
    expect(within(card).getByText(/^Scored/)).toBeTruthy();
    expect(within(card).queryByRole("button")).toBeNull();
  });

  it("names a failed hard filter in a chip and in the box, and drops the pass line", () => {
    renderCard(modelWith({}, { locations: ["Rotterdam"] }));
    const card = screen.getByRole("region", { name: "Fit" });
    expect(within(card).getByText("64 · Mixed")).toBeTruthy();
    expect(within(card).getByText("Fails 1 filter")).toBeTruthy();
    expect(within(card).getByText("Fails a hard filter")).toBeTruthy();
    expect(within(card).getByText("Location: Berlin, Germany is not in your locations.")).toBeTruthy();
    expect(within(card).queryByText("Passes your hard filters.")).toBeNull();
  });

  it("lets long unbroken text wrap instead of widening the page", () => {
    const long = "x".repeat(200);
    renderCard(modelWith({ fit: { ...STORED, summary: long, pros: [long] } }));
    expect(screen.getByText(long, { selector: "p" }).className).toContain("break-words");
  });
});

describe("FitCard, other states", () => {
  it("shows the scoring line and placeholder bars while a run is pending, and refreshes on a timer up to the cap", () => {
    vi.useFakeTimers();
    renderCard(modelWith({ fitStatus: "pending", updatedAt: new Date(NOW.getTime() - 1_000) }));
    expect(screen.getByText("Scoring this job")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(FIT_POLL_MS * (FIT_POLL_MAX + 5));
    });
    expect(refresh).toHaveBeenCalledTimes(FIT_POLL_MAX);
  });

  it("offers Score again after a failed run, and scores when pressed", async () => {
    vi.mocked(scoreFitAction).mockResolvedValue({ ok: true, data: { status: "done", score: 81 } });
    renderCard(modelWith({ fitStatus: "failed", fit: null, fitScore: null }));
    expect(screen.getByText("The fit score didn't come back. Nothing about the job changed.")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Score again" }));
    });
    expect(scoreFitAction).toHaveBeenCalledWith(OPPORTUNITY.id);
  });

  it("shows the scoring line while its own run is in flight", async () => {
    let finish: (value: Awaited<ReturnType<typeof scoreFitAction>>) => void = () => {};
    vi.mocked(scoreFitAction).mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    renderCard(modelWith({ fitStatus: "failed", fit: null, fitScore: null }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Score again" }));
    });
    expect(screen.getByText("Scoring this job")).toBeTruthy();
    await act(async () => finish({ ok: true, data: { status: "done", score: 81 } }));
  });

  it("links to Settings when there is no resume", () => {
    renderCard(modelWith({ fitStatus: "none", fit: null, fitScore: null }, {}, null));
    expect(screen.getByText("Add your resume in Settings to get a fit score for this job.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Settings" }).getAttribute("href")).toBe("/settings");
  });

  it("offers a first score to a ready job with none", () => {
    renderCard(modelWith({ fitStatus: "none", fit: null, fitScore: null }));
    expect(screen.getByText("This job has no fit score yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Score this job" })).toBeTruthy();
  });

  it("says AI is off without offering a button", () => {
    renderCard(
      fitCardModel({
        opportunity: { ...OPPORTUNITY, fitStatus: "none", fit: null, fitScore: null },
        profile: { headline: null, resumeMd: "# Resume", preferences: DEFAULT_PREFERENCES },
        aiOn: false,
        now: NOW,
      }),
    );
    expect(screen.getByText("Fit scoring needs AI, and AI is off on this server.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
