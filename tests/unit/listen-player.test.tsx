// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Toaster } from "sonner";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { ListenPlayer } from "@/components/player/listen-player";
import { usePlaybackEngine } from "@/components/player/engine";
import { useMediaSession } from "@/components/player/media-session";
import { markQuestionAction } from "@/app/(app)/jobs/[slug]/prep-actions";
import { regenerateClipAction } from "@/app/(app)/jobs/[slug]/audio-actions";
import type { EngineEvent, EngineState } from "@/lib/prep/engine-state";
import type { PlaybackPlan, PlaybackStep } from "@/lib/prep/plan";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(app)/library/actions", () => ({ saveToLibraryAction: vi.fn() }));
vi.mock("@/app/(app)/jobs/[slug]/prep-actions", () => ({ markQuestionAction: vi.fn() }));
vi.mock("@/app/(app)/jobs/[slug]/audio-actions", () => ({ regenerateClipAction: vi.fn() }));
vi.mock("@/components/player/engine", () => ({ usePlaybackEngine: vi.fn() }));
vi.mock("@/components/player/media-session", () => ({ useMediaSession: vi.fn() }));

const JOB = "11111111-1111-4111-8111-111111111111";
const dispatch = vi.fn<(event: EngineEvent) => void>();
let engineOptions: Parameters<typeof usePlaybackEngine>[1] | null = null;
let engineState: EngineState;
let media = { backgroundStopped: false };

function mkStep(questionIndex: number, n: number, over: Partial<PlaybackStep> = {}): PlaybackStep {
  return {
    id: `${questionIndex}-${n}`,
    questionIndex,
    blockIndex: n === 0 ? null : n,
    kind: n === 0 ? "question" : "text",
    speaker: n === 0 ? "interviewer" : "candidate",
    text: `text ${questionIndex} ${n}`,
    hash: "0123456789abcdef",
    clip: null,
    gapAfterMs: 600,
    ...over,
  };
}

function bank(count: number): PlaybackPlan {
  return {
    title: "Question bank",
    subtitle: "Designer at Northwind Traders",
    questions: Array.from({ length: count }, (_, i) => ({
      number: i + 1,
      section: i < 2 ? "Opening" : "Craft",
      questionKey: (i + 1).toString(16).padStart(16, "0"),
      question: `Question text ${i + 1}`,
      level: i === 0 ? ("okay" as const) : null,
      blocks: [{ index: 1, label: "Say:", spoken: true, text: `Answer ${i + 1}` }],
    })),
    steps: Array.from({ length: count }, (_, i) => [mkStep(i, 0), mkStep(i, 1)]).flat(),
  };
}

const pitch: PlaybackPlan = {
  title: "Portfolio pitch",
  subtitle: "Designer at Northwind Traders",
  questions: [
    { number: 1, section: null, questionKey: "00000000000000a1", question: "Short version", level: null, blocks: [{ index: 0, label: "", spoken: true, text: "One sentence." }] },
    { number: 2, section: null, questionKey: "00000000000000a2", question: "Long version", level: null, blocks: [{ index: 0, label: "", spoken: true, text: "The long story." }] },
  ],
  steps: [mkStep(0, 0, { speaker: "candidate" }), mkStep(0, 1), mkStep(1, 0, { speaker: "candidate" }), mkStep(1, 1)],
};

function renderPlayer(plan: PlaybackPlan, kind: "bank" | "pitch" = "bank", over: Partial<React.ComponentProps<typeof ListenPlayer>> = {}) {
  return render(
    <LiveAnnouncerProvider>
      <Toaster />
      <ListenPlayer
        plan={plan}
        kind={kind}
        opportunityId={JOB}
        speed={1}
        gapFactor={1}
        browserVoices={{ interviewer: null, candidate: null }}
        initialStepIndex={0}
        backHref="/jobs/northwind?tab=prep"
        {...over}
      />
    </LiveAnnouncerProvider>,
  );
}

function engineAt(stepIndex: number, status: EngineState["status"] = "idle", speed = 1) {
  engineState = { stepIndex, status, speed };
}

beforeEach(() => {
  dispatch.mockReset();
  refresh.mockReset();
  media = { backgroundStopped: false };
  engineAt(0);
  vi.mocked(usePlaybackEngine).mockImplementation((plan, options) => ({
    state: (engineOptions = options, engineState),
    currentStep: plan.steps[engineState.stepIndex] ?? null,
    currentQuestionIndex: plan.steps[engineState.stepIndex]?.questionIndex ?? 0,
    dispatch,
  }));
  vi.mocked(useMediaSession).mockImplementation(() => media);
  vi.mocked(markQuestionAction).mockReset();
  vi.mocked(regenerateClipAction).mockReset();
});
afterEach(cleanup);

describe("ListenPlayer", () => {
  it("shows 'Question 7 of 32' and the section name", () => {
    engineAt(12); // question index 6
    renderPlayer(bank(32));
    expect(screen.getByText("Question 7 of 32")).toBeTruthy();
    expect(screen.getByText("Craft")).toBeTruthy();
  });

  it("speed select offers 0.8 to 1.5 in steps of 0.1 and dispatches set_speed", () => {
    renderPlayer(bank(3));
    const select = screen.getByLabelText("Speed") as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["0.8", "0.9", "1", "1.1", "1.2", "1.3", "1.4", "1.5"]);
    expect(select.value).toBe("1");
    fireEvent.change(select, { target: { value: "1.3" } });
    expect(dispatch).toHaveBeenCalledWith({ type: "set_speed", speed: 1.3 });
  });

  it("mark buttons stay visible, call the action and never dispatch pause", async () => {
    engineAt(0, "playing");
    vi.mocked(markQuestionAction).mockResolvedValue({
      ok: true,
      data: { level: "shaky", markedAt: "2026-11-21T12:00:00.000Z", drillCount: 0, applied: true },
    });
    renderPlayer(bank(3));
    const group = screen.getByRole("group", { name: "Mark this answer" });
    await act(async () => void fireEvent.click(within(group).getByRole("button", { name: "Shaky" })));
    expect(markQuestionAction).toHaveBeenCalledWith(
      expect.objectContaining({ opportunityId: JOB, scope: "job", questionKey: "0000000000000001", level: "shaky", drilled: false }),
    );
    expect(dispatch.mock.calls.some(([e]) => e.type === "pause")).toBe(false);
    expect(within(group).getByRole("button", { name: "Shaky" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("previous, next, repeat and play and pause dispatch the matching engine events", () => {
    renderPlayer(bank(3));
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous question" }));
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    fireEvent.click(screen.getByRole("button", { name: "Repeat question" }));
    expect(dispatch.mock.calls.map(([e]) => e.type)).toEqual(["play", "prev_question", "next_question", "repeat_question"]);
    cleanup();
    dispatch.mockReset();
    engineAt(0, "playing");
    renderPlayer(bank(3));
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "pause" });
  });

  it("a gap counts as playing: the button offers Pause", () => {
    engineAt(0, "gap");
    renderPlayer(bank(3));
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
  });

  it("shows the background notice once, and not again after Play", () => {
    media = { backgroundStopped: true };
    renderPlayer(bank(3));
    expect(screen.getAllByText(/Playback stopped when the screen turned off/)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.queryByText(/Playback stopped when the screen turned off/)).toBeNull();
  });

  it("does not show the notice when nothing stopped", () => {
    renderPlayer(bank(3));
    expect(screen.queryByText(/Playback stopped/)).toBeNull();
  });

  it("a pitch shows chapters and no mark buttons", () => {
    engineAt(2);
    renderPlayer(pitch, "pitch");
    expect(screen.getByText("Chapter 2 of 2")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Mark this answer" })).toBeNull();
    expect(screen.getByRole("button", { name: "Previous chapter" })).toBeTruthy();
  });

  it("seeking from the transcript dispatches seek_step", () => {
    renderPlayer(bank(3));
    fireEvent.click(screen.getByRole("button", { name: /Answer 1/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: "seek_step", stepIndex: 1 });
  });

  it("an ended player says so", () => {
    engineAt(5, "ended");
    renderPlayer(bank(3));
    expect(screen.getByText(/End of the list/)).toBeTruthy();
  });

  it("a clip that fails while playing is relabelled 'Browser voice' in the transcript", () => {
    const plan = bank(1);
    plan.steps = plan.steps.map((step, i) => ({ ...step, clip: { assetId: `a${i}`, suspect: false }, hash: `d${i}`.padEnd(16, "d") }));
    renderPlayer(plan);
    expect(screen.queryByText("Browser voice")).toBeNull();
    act(() => engineOptions!.onClipFailed!(plan.steps[1]));
    expect(screen.getByText("Browser voice")).toBeTruthy();
  });

  it("regenerating a suspect clip calls the action and refreshes", async () => {
    const plan = bank(1);
    plan.steps[1] = { ...plan.steps[1], clip: { assetId: "a", suspect: true }, hash: "cccccccccccccccc" };
    vi.mocked(regenerateClipAction).mockResolvedValue({ ok: true, data: { suspect: false } });
    renderPlayer(plan);
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Regenerate" })));
    expect(regenerateClipAction).toHaveBeenCalledWith(JOB, "cccccccccccccccc");
    expect(refresh).toHaveBeenCalled();
  });

  it("passes the title, the subtitle and the artwork to the Media Session", () => {
    renderPlayer(bank(3));
    expect(vi.mocked(useMediaSession)).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Question bank", artist: "Designer at Northwind Traders", artworkUrl: "/brand/mark.svg" }),
    );
  });
});
