// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Toaster } from "sonner";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { QuickFireCard, type QuickFireQuestion } from "@/components/player/quick-fire-card";
import { QuickFireRound } from "@/components/player/quick-fire-round";
import { endSessionAction, markQuestionAction, startSessionAction } from "@/app/(app)/jobs/[slug]/prep-actions";
import { PREP_COPY } from "@/lib/prep/copy";

vi.mock("@/app/(app)/jobs/[slug]/prep-actions", () => ({
  markQuestionAction: vi.fn(),
  startSessionAction: vi.fn(),
  endSessionAction: vi.fn(),
  rebuildQuestionsAction: vi.fn(),
}));

const JOB = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";

function qs(n: number): QuickFireQuestion[] {
  return Array.from({ length: n }, (_, i) => ({
    questionKey: (i + 1).toString(16).padStart(16, "0"),
    number: i + 1,
    question: `Question ${i + 1}`,
    spine: `Spine ${i + 1}`,
    level: null,
  }));
}

function renderCard(questions: QuickFireQuestion[]) {
  return render(
    <LiveAnnouncerProvider>
      <Toaster />
      <QuickFireCard questions={questions} sessionId={SESSION} opportunityId={JOB} backHref={`/jobs/x?tab=prep`} />
    </LiveAnnouncerProvider>,
  );
}

async function tick(seconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(seconds * 1000);
  });
}

describe("QuickFireCard", () => {
  beforeEach(() => {
    cleanup();
    vi.useFakeTimers();
    vi.mocked(markQuestionAction).mockReset();
    vi.mocked(endSessionAction).mockReset();
    vi.mocked(markQuestionAction).mockImplementation(async (input) => ({
      ok: true,
      data: { level: input.level, markedAt: input.markedAt, drillCount: 0, applied: true },
    }));
    vi.mocked(endSessionAction).mockResolvedValue({ ok: true, data: { eventWritten: true } });
  });
  afterEach(() => vi.useRealTimers());

  it("shows the question, counts down from 5 and then shows the Spine", async () => {
    renderCard(qs(3));
    expect(screen.getByText("Question 1")).toBeTruthy();
    expect(screen.getByTestId("quick-fire-count").textContent).toBe("5");
    expect(screen.queryByText("Spine 1")).toBeNull();
    await tick(1);
    expect(screen.getByTestId("quick-fire-count").textContent).toBe("4");
    await tick(4);
    expect(screen.getByText("Spine 1")).toBeTruthy();
  });

  it("a tap anywhere after the reveal moves to the next question", async () => {
    renderCard(qs(3));
    await tick(5);
    fireEvent.click(screen.getByTestId("quick-fire-surface"));
    expect(screen.getByText("Question 2")).toBeTruthy();
    expect(screen.queryByText("Spine 1")).toBeNull();
    expect(screen.getByTestId("quick-fire-count").textContent).toBe("5");
  });

  it("a tap during the countdown does not skip the Spine", async () => {
    renderCard(qs(3));
    await tick(2);
    fireEvent.click(screen.getByTestId("quick-fire-surface"));
    expect(screen.getByText("Question 1")).toBeTruthy();
    expect(screen.queryByText("Spine 1")).toBeNull();
  });

  it("a mark on the reveal calls markQuestionAction with drilled false and does not advance", async () => {
    renderCard(qs(3));
    await tick(5);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Solid" }));
    });
    const call = vi.mocked(markQuestionAction).mock.calls[0][0];
    expect(call).toMatchObject({ opportunityId: JOB, scope: "job", questionKey: qs(1)[0].questionKey, level: "solid", drilled: false });
    expect(screen.getByText("Question 1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Solid" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("after ten questions the summary lists what came up and the marks given, and ends the session", async () => {
    renderCard(qs(10));
    for (let i = 0; i < 10; i++) {
      await tick(5);
      if (i === 0) {
        await act(async () => {
          fireEvent.click(screen.getByRole("button", { name: "Solid" }));
        });
      }
      if (i === 1) {
        await act(async () => {
          fireEvent.click(screen.getByRole("button", { name: "Shaky" }));
        });
      }
      fireEvent.click(screen.getByTestId("quick-fire-surface"));
    }
    expect(screen.getByRole("heading", { name: PREP_COPY.quickFire.summaryHeading })).toBeTruthy();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(10);
    expect(items[0].textContent).toContain("Question 1");
    expect(items[0].textContent).toContain("Solid");
    expect(items[1].textContent).toContain("Shaky");
    expect(items[2].textContent).toContain(PREP_COPY.quickFire.noMark);
    expect(endSessionAction).toHaveBeenCalledTimes(1);
    expect(endSessionAction).toHaveBeenCalledWith({ id: SESSION, seen: 10, marked: 2, solid: 1 });
  });

  it("a pool smaller than ten ends the round after the pool", async () => {
    renderCard(qs(2));
    for (let i = 0; i < 2; i++) {
      await tick(5);
      fireEvent.click(screen.getByTestId("quick-fire-surface"));
    }
    expect(screen.getByRole("heading", { name: PREP_COPY.quickFire.summaryHeading })).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(endSessionAction).toHaveBeenCalledWith({ id: SESSION, seen: 2, marked: 0, solid: 0 });
  });

  it("an empty pool shows the empty copy", () => {
    renderCard([]);
    expect(
      screen.getByText("Nothing to practice yet. Quick-fire needs questions that have a Spine."),
    ).toBeTruthy();
    expect(endSessionAction).not.toHaveBeenCalled();
  });

  it("Quick-fire never plays audio and never calls speechSynthesis", async () => {
    const speak = vi.fn();
    const play = vi.fn();
    Object.defineProperty(window, "speechSynthesis", { value: { speak, cancel: vi.fn() }, configurable: true });
    const audio = vi.fn(() => ({ play }));
    vi.stubGlobal("Audio", audio);
    renderCard(qs(2));
    await tick(5);
    fireEvent.click(screen.getByTestId("quick-fire-surface"));
    await tick(5);
    expect(speak).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
    expect(audio).not.toHaveBeenCalled();
    expect(document.querySelector("audio")).toBeNull();
    vi.unstubAllGlobals();
    // @ts-expect-error cleanup of the stub
    delete window.speechSynthesis;
  });

  it("keyboard only: space or enter advances after the reveal and keys 1 to 3 mark Shaky, Okay and Solid on the reveal", async () => {
    renderCard(qs(3));
    // Before the reveal neither key does anything.
    fireEvent.keyDown(document.body, { key: " " });
    fireEvent.keyDown(document.body, { key: "1" });
    expect(screen.getByText("Question 1")).toBeTruthy();
    expect(markQuestionAction).not.toHaveBeenCalled();
    await tick(5);
    await act(async () => {
      fireEvent.keyDown(document.body, { key: "1" });
    });
    await act(async () => {
      fireEvent.keyDown(document.body, { key: "2" });
    });
    await act(async () => {
      fireEvent.keyDown(document.body, { key: "3" });
    });
    expect(vi.mocked(markQuestionAction).mock.calls.map((c) => c[0].level)).toEqual(["shaky", "okay", "solid"]);
    fireEvent.keyDown(document.body, { key: " " });
    expect(screen.getByText("Question 2")).toBeTruthy();
    await tick(5);
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(screen.getByText("Question 3")).toBeTruthy();
  });

  it("the Next button also advances, so a pointer or screen reader user is not left with a hidden target", async () => {
    renderCard(qs(2));
    await tick(5);
    fireEvent.click(screen.getByRole("button", { name: PREP_COPY.quickFire.next }));
    expect(screen.getByText("Question 2")).toBeTruthy();
  });

  it("the countdown is announced politely once per question and carries no motion", async () => {
    renderCard(qs(2));
    await tick(1);
    expect(screen.getByRole("status").textContent).toBe(PREP_COPY.quickFire.countdownAnnounce);
    // the ticking digits are not a live region
    expect(screen.getByTestId("quick-fire-count").closest("[aria-live]")).toBeNull();
    expect(document.body.innerHTML).not.toMatch(/animate-|transition/);
  });
});

describe("QuickFireRound", () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(startSessionAction).mockReset();
    vi.mocked(endSessionAction).mockReset();
  });

  it("starts one session on mount, seeds the order from its id, and passes the same ten to the card", async () => {
    vi.mocked(startSessionAction).mockResolvedValue({ ok: true, data: { id: SESSION } });
    const pool = qs(14);
    render(
      <LiveAnnouncerProvider>
        <Toaster />
        <QuickFireRound questions={pool} opportunityId={JOB} backHref="/jobs/x?tab=prep" />
      </LiveAnnouncerProvider>,
    );
    await act(async () => {});
    expect(startSessionAction).toHaveBeenCalledTimes(1);
    expect(startSessionAction).toHaveBeenCalledWith({ opportunityId: JOB, mode: "quick_fire", questions: 10 });
    expect(await screen.findByTestId("quick-fire-surface")).toBeTruthy();
  });

  it("shows the message and a retry when the session cannot start", async () => {
    vi.mocked(startSessionAction).mockResolvedValue({ ok: false, code: "not_found", message: "This job no longer exists." });
    render(
      <LiveAnnouncerProvider>
        <Toaster />
        <QuickFireRound questions={qs(3)} opportunityId={JOB} backHref="/jobs/x?tab=prep" />
      </LiveAnnouncerProvider>,
    );
    expect(await screen.findByText("This job no longer exists.")).toBeTruthy();
    expect(screen.getByRole("button", { name: PREP_COPY.quickFire.retry })).toBeTruthy();
  });
});

describe("QuickFireCard in the library scope", () => {
  beforeEach(() => {
    cleanup();
    vi.useFakeTimers();
    vi.mocked(markQuestionAction).mockReset();
    vi.mocked(endSessionAction).mockReset();
    vi.mocked(markQuestionAction).mockImplementation(async (input) => ({
      ok: true,
      data: { level: input.level, markedAt: input.markedAt, drillCount: 0, applied: true },
    }));
    vi.mocked(endSessionAction).mockResolvedValue({ ok: true, data: { eventWritten: false } });
  });
  afterEach(() => vi.useRealTimers());

  it("with scope library each mark calls the action with scope library and no job", async () => {
    render(
      <LiveAnnouncerProvider>
        <Toaster />
        <QuickFireCard
          scope="library"
          questions={qs(2).map((q) => ({ ...q, number: undefined }))}
          sessionId={SESSION}
          opportunityId={null}
          backHref="/library"
          backLabel="Back to Library"
        />
      </LiveAnnouncerProvider>,
    );
    await tick(5);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Shaky" }));
    });
    expect(vi.mocked(markQuestionAction).mock.calls[0][0]).toMatchObject({
      opportunityId: null,
      scope: "library",
      level: "shaky",
      drilled: false,
    });
  });

  it("a library round ends with the library back link and no numbers when there are none", async () => {
    render(
      <LiveAnnouncerProvider>
        <QuickFireCard
          scope="library"
          questions={qs(1).map((q) => ({ ...q, number: undefined }))}
          sessionId={SESSION}
          opportunityId={null}
          backHref="/library"
          backLabel="Back to Library"
        />
      </LiveAnnouncerProvider>,
    );
    await tick(5);
    fireEvent.click(screen.getByTestId("quick-fire-surface"));
    expect(screen.getByRole("link", { name: "Back to Library" }).getAttribute("href")).toBe("/library");
    expect(screen.getAllByRole("listitem")[0].textContent).toBe("Question 1No mark");
  });
});
