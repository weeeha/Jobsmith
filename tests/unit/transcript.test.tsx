// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Transcript } from "@/components/player/transcript";
import type { PlaybackPlan, PlaybackStep } from "@/lib/prep/plan";

function step(over: Partial<PlaybackStep> & Pick<PlaybackStep, "questionIndex" | "id">): PlaybackStep {
  return {
    blockIndex: null,
    kind: "text",
    speaker: "candidate",
    text: "t",
    hash: "0123456789abcdef",
    clip: null,
    gapAfterMs: 600,
    ...over,
  };
}

const clip = (suspect = false) => ({ assetId: "a", suspect });

// Question 0: the question line (step 0), a Spine note (no step), a Say block
// (step 1) and a Proof block (steps 2 and 3: label, then text; both browser).
// Question 1 only keeps the global step indexes honest.
const PLAN: PlaybackPlan = {
  title: "Bank",
  subtitle: "Job",
  questions: [
    {
      number: 1,
      section: "Opening",
      questionKey: "0000000000000001",
      question: "Tell me about yourself",
      level: null,
      blocks: [
        { index: 0, label: "Spine:", spoken: false, text: "Craft, range, why us." },
        { index: 1, label: "Say:", spoken: true, text: "I design ordering tools." },
        { index: 2, label: "Proof:", spoken: true, text: "Shipped three products." },
      ],
    },
    { number: 2, section: null, questionKey: "0000000000000002", question: "Why us?", level: null, blocks: [] },
  ],
  steps: [
    step({ id: "0-0", questionIndex: 0, kind: "question", speaker: "interviewer", clip: clip() }),
    step({ id: "0-1", questionIndex: 0, blockIndex: 1, kind: "text", clip: clip() }),
    step({ id: "0-2", questionIndex: 0, blockIndex: 2, kind: "label", speaker: "interviewer", hash: "aaaaaaaaaaaaaaaa", clip: null }),
    step({ id: "0-3", questionIndex: 0, blockIndex: 2, kind: "text", hash: "bbbbbbbbbbbbbbbb", clip: null }),
    step({ id: "1-0", questionIndex: 1, kind: "question", speaker: "interviewer", clip: clip() }),
  ],
};

function renderTranscript(over: Partial<React.ComponentProps<typeof Transcript>> = {}) {
  const onSeek = vi.fn();
  const onRegenerate = vi.fn();
  render(
    <Transcript plan={PLAN} questionIndex={0} currentStepIndex={1} onSeek={onSeek} onRegenerate={onRegenerate} regenerating={false} {...over} />,
  );
  return { onSeek, onRegenerate };
}

afterEach(cleanup);

describe("Transcript", () => {
  it("highlights the playing block with aria-current and nothing else", () => {
    renderTranscript({ currentStepIndex: 1 });
    const current = document.querySelectorAll('[aria-current="true"]');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain("I design ordering tools.");
    cleanup();
    renderTranscript({ currentStepIndex: 0 }); // the question line is playing: no block is
    expect(document.querySelectorAll('[aria-current="true"]')).toHaveLength(0);
  });

  it("the block of a label step is the playing block too", () => {
    renderTranscript({ currentStepIndex: 2 });
    expect(document.querySelector('[aria-current="true"]')?.textContent).toContain("Shipped three products.");
  });

  it("tapping a block seeks to its first step", () => {
    const { onSeek } = renderTranscript();
    fireEvent.click(screen.getByRole("button", { name: /Shipped three products/ }));
    expect(onSeek).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByRole("button", { name: /I design ordering tools/ }));
    expect(onSeek).toHaveBeenLastCalledWith(1);
  });

  it("note blocks show dimmed and are never given a step", () => {
    const { onSeek } = renderTranscript();
    const note = screen.getByText("Craft, range, why us.");
    expect(note.closest("[data-note]")).not.toBeNull();
    expect(note.closest("button")).toBeNull();
    fireEvent.click(note);
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("shows the question as a heading", () => {
    renderTranscript();
    expect(screen.getByRole("heading", { name: "Tell me about yourself" })).toBeTruthy();
  });

  it("shows 'browser voice' on a block with a step without a clip and nothing on a block that has clips", () => {
    renderTranscript();
    const withClips = screen.getByRole("button", { name: /I design ordering tools/ }).closest("li")!;
    const without = screen.getByRole("button", { name: /Shipped three products/ }).closest("li")!;
    expect(withClips.textContent).not.toContain("Browser voice");
    expect(without.textContent).toContain("Browser voice");
  });

  it("shows 'check this clip' with a Regenerate button on a suspect one and regenerates that block's suspect hashes", () => {
    const plan: PlaybackPlan = {
      ...PLAN,
      steps: PLAN.steps.map((s) => (s.id === "0-1" ? { ...s, clip: clip(true), hash: "cccccccccccccccc" } : s)),
    };
    const { onRegenerate } = renderTranscript({ plan });
    expect(screen.getByText("Check this clip")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(onRegenerate).toHaveBeenCalledWith(["cccccccccccccccc"]);
  });

  it("disables Regenerate while one is running", () => {
    const plan: PlaybackPlan = { ...PLAN, steps: PLAN.steps.map((s) => (s.id === "0-1" ? { ...s, clip: clip(true) } : s)) };
    renderTranscript({ plan, regenerating: true });
    expect((screen.getByRole("button", { name: /Regenerating/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
