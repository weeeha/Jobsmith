// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { testPostingAction } from "@/app/(app)/preferences/actions";
import { TestPostingBox } from "@/components/preferences/test-posting-box";
import { hardFilters } from "@/lib/fit/hard-filters";
import { toStoredFit } from "@/lib/fit/stored";
import { DEFAULT_PREFERENCES } from "@/lib/preferences/schema";
import type { TestPostingState } from "@/lib/fit/test-posting";

vi.mock("@/app/(app)/preferences/actions", () => ({ testPostingAction: vi.fn(), savePreferencesAction: vi.fn() }));

const FILTERS = hardFilters(
  { roleTitle: "Design Lead", location: "Berlin, Germany", workMode: "hybrid", compMin: null, compMax: null, compCurrency: null },
  { ...DEFAULT_PREFERENCES, titles: ["Design lead"], locations: ["Rotterdam"], workModes: ["hybrid"], compFloor: 100 },
);
const RESULT: Extract<TestPostingState, { ok: true }> = {
  ok: true,
  result: {
    roleTitle: "Design Lead",
    companyName: "Northwind Labs",
    hardFilters: FILTERS,
    fit: toStoredFit(
      { score: 64, summary: "Strong craft match.", pros: ["Design lead scope"], cons: ["Relocation likely"] },
      "fake-extractor",
      new Date("2026-10-15T09:00:00.000Z"),
    ),
    band: "mixed",
    note: null,
  },
};

function renderBox() {
  return render(
    <LiveAnnouncerProvider>
      <TestPostingBox />
    </LiveAnnouncerProvider>,
  );
}

async function submit() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Score this posting" }));
  });
}

beforeEach(() => {
  cleanup();
  vi.mocked(testPostingAction).mockReset();
});

describe("TestPostingBox", () => {
  it("shows the drawn intro, label and button", () => {
    renderBox();
    expect(screen.getByRole("heading", { name: "Test against a posting" })).toBeTruthy();
    expect(
      screen.getByText("Runs the hard filters and the fit score on one posting without adding it to the board."),
    ).toBeTruthy();
    expect(screen.getByLabelText("Posting")).toBeTruthy();
  });

  it("puts a field message under the link", async () => {
    vi.mocked(testPostingAction).mockResolvedValue({
      ok: false,
      code: "invalid",
      message: "Check the highlighted fields.",
      fieldErrors: { sourceUrl: "Paste a link to a posting." },
    });
    renderBox();
    await submit();
    const input = screen.getByLabelText("Posting");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Paste a link to a posting.")).toBeTruthy();
  });

  it("asks for the posting text when the link cannot be read, and sends both next time", async () => {
    vi.mocked(testPostingAction).mockResolvedValueOnce({
      ok: false,
      code: "needs_text",
      message: "This site needs a login, so Jobsmith cannot read the link. Paste the posting text instead.",
      fieldErrors: { postingText: "Paste the posting here." },
    });
    renderBox();
    fireEvent.change(screen.getByLabelText("Posting"), { target: { value: "https://www.linkedin.com/jobs/view/1/" } });
    await submit();
    expect(screen.getByRole("alert").textContent).toContain("needs a login");
    const text = screen.getByLabelText("Posting text");
    expect(document.activeElement).toBe(text);

    vi.mocked(testPostingAction).mockResolvedValueOnce(RESULT);
    fireEvent.change(text, { target: { value: "Role: Design Lead" } });
    await submit();
    const sent = vi.mocked(testPostingAction).mock.calls[1]?.[1] as FormData;
    expect(sent.get("sourceUrl")).toBe("https://www.linkedin.com/jobs/view/1/");
    expect(sent.get("postingText")).toBe("Role: Design Lead");
  });

  it("lists every hard filter with its outcome, then the fit result and the nothing-added line", async () => {
    vi.mocked(testPostingAction).mockResolvedValue(RESULT);
    renderBox();
    await submit();
    const rows = within(screen.getByRole("list", { name: "Hard filters" })).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      "Title keywordsDesign lead matches.Passes",
      "LocationsBerlin, Germany is not in your locations.Fails",
      "Work modesHybrid is one of yours.Passes",
      "Pay floorThe posting states no pay range.Not checked",
    ]);
    const card = screen.getByRole("region", { name: "Fit" });
    expect(within(card).getByText("64 · Mixed")).toBeTruthy();
    expect(within(card).getByText("Fails 1 filter")).toBeTruthy();
    expect(screen.getByText("Nothing was added to the board.")).toBeTruthy();
  });

  it("says why there is no score, under the filter rows", async () => {
    vi.mocked(testPostingAction).mockResolvedValue({ ok: true, result: { ...RESULT.result, fit: null, band: null, note: "no_resume" } });
    renderBox();
    await submit();
    expect(screen.getByText("Add your resume in Settings to get a fit score. The hard filters still ran.")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Hard filters" })).toBeTruthy();
  });
});
