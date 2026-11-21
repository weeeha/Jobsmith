// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { Toaster } from "sonner";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { QuestionList } from "@/components/prep/question-list";
import { RebuildButton } from "@/components/prep/rebuild-button";
import { BankWarnings } from "@/components/prep/bank-warnings";
import { rebuildQuestionsAction } from "@/app/(app)/jobs/[slug]/prep-actions";
import type { HubQuestion } from "@/lib/prep/hub";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(app)/jobs/[slug]/prep-actions", () => ({
  markQuestionAction: vi.fn(),
  rebuildQuestionsAction: vi.fn(),
}));

const JOB = "11111111-1111-4111-8111-111111111111";

function q(n: number, section: string | null, over: Partial<HubQuestion> = {}): HubQuestion {
  return {
    id: `id-${n}`,
    artifactKey: "bank",
    number: n,
    section,
    position: n - 1,
    question: `Question text ${n}`,
    questionKey: n.toString(16).padStart(16, "0"),
    unfilled: false,
    hasAnswer: true,
    level: null,
    ...over,
  };
}

function renderList(questions: HubQuestion[]) {
  return render(
    <LiveAnnouncerProvider>
      <Toaster />
      <QuestionList opportunityId={JOB} questions={questions} />
    </LiveAnnouncerProvider>,
  );
}

describe("QuestionList", () => {
  beforeEach(() => {
    cleanup();
    refresh.mockReset();
    vi.mocked(rebuildQuestionsAction).mockReset();
  });

  it("groups questions under their section headings in file order", () => {
    renderList([q(1, "Motivation"), q(2, "Motivation"), q(3, "Craft"), q(4, null)]);
    const headings = screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent);
    expect(headings).toEqual(["Motivation", "Craft"]);
    const items = screen.getAllByRole("listitem").filter((li) => li.textContent?.includes("Question text"));
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining("Question text 1"),
      expect.stringContaining("Question text 2"),
      expect.stringContaining("Question text 3"),
      expect.stringContaining("Question text 4"),
    ]);
    // number shown with the text
    expect(items[0].textContent).toContain("1.");
  });

  it("shows the 'unfilled' chip only on flagged rows", () => {
    renderList([q(1, null), q(2, null, { unfilled: true })]);
    const chips = screen.getAllByText("unfilled");
    expect(chips).toHaveLength(1);
    expect(chips[0].closest("li")?.textContent).toContain("Question text 2");
  });

  it("shows each row's mark level as a chip", () => {
    renderList([q(1, null, { level: "solid" }), q(2, null)]);
    const first = screen.getAllByRole("listitem").find((li) => li.textContent?.includes("Question text 1"))!;
    expect(within(first).getAllByText("Solid").length).toBeGreaterThan(0);
  });

  it("puts the mark buttons inside a disclosure per question", () => {
    renderList([q(1, null)]);
    const summary = screen.getByText("Mark").closest("summary")!;
    expect(summary.getAttribute("aria-label")).toBe("Mark question 1");
    expect(summary.closest("details")?.hasAttribute("open")).toBe(false);
  });
});

describe("RebuildButton", () => {
  beforeEach(() => {
    cleanup();
    refresh.mockReset();
    vi.mocked(rebuildQuestionsAction).mockReset();
  });

  it("the Rebuild questions button calls rebuildQuestionsAction and refreshes", async () => {
    vi.mocked(rebuildQuestionsAction).mockResolvedValue({ ok: true, data: { rows: 12 } });
    render(
      <LiveAnnouncerProvider>
        <Toaster />
        <RebuildButton opportunityId={JOB} />
      </LiveAnnouncerProvider>,
    );
    await act(async () => {
      screen.getByRole("button", { name: "Rebuild questions" }).click();
    });
    expect(rebuildQuestionsAction).toHaveBeenCalledWith(JOB);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("a failed rebuild shows the message and does not refresh", async () => {
    vi.mocked(rebuildQuestionsAction).mockResolvedValue({ ok: false, code: "not_found", message: "That job no longer exists." });
    render(
      <LiveAnnouncerProvider>
        <Toaster />
        <RebuildButton opportunityId={JOB} />
      </LiveAnnouncerProvider>,
    );
    await act(async () => {
      screen.getByRole("button", { name: "Rebuild questions" }).click();
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(await screen.findByText("That job no longer exists.")).toBeTruthy();
  });
});

describe("BankWarnings", () => {
  it("renders nothing without warnings and a collapsible list with them", () => {
    const { container, rerender } = render(<BankWarnings warnings={[]} />);
    expect(container.firstChild).toBeNull();
    rerender(<BankWarnings warnings={[{ code: "unknown_label", line: 4, question: 1, message: "Unknown label Foo." }]} />);
    const summary = screen.getByText("Check the bank").closest("summary")!;
    expect(summary.closest("details")?.hasAttribute("open")).toBe(false);
    expect(screen.getByText("Unknown label Foo.")).toBeTruthy();
  });
});
