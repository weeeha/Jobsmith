// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { usePlaybackEngine } from "@/components/player/engine";
import type { AudioLike, SpeakerEnv, UtteranceLike } from "@/components/player/speaker";
import type { PlaybackPlan, PlaybackStep } from "@/lib/prep/plan";

function step(questionIndex: number, n: number, gapAfterMs: number, over: Partial<PlaybackStep> = {}): PlaybackStep {
  return {
    id: `${questionIndex}-${n}`,
    questionIndex,
    blockIndex: null,
    kind: "text",
    speaker: "candidate",
    text: `q${questionIndex} s${n}`,
    hash: "h",
    clip: null,
    gapAfterMs,
    ...over,
  };
}

// Two questions, two steps each: gaps 600, 1400, 600, 1400.
const PLAN: PlaybackPlan = {
  title: "Bank",
  subtitle: "Job",
  questions: [],
  steps: [step(0, 0, 600), step(0, 1, 1400), step(1, 0, 600), step(1, 1, 1400)],
};

function makeEnv() {
  const spoken: UtteranceLike[] = [];
  let cancels = 0;
  const env: SpeakerEnv = {
    createAudio: null,
    speech: {
      synth: { speak: (u) => void spoken.push(u), cancel: () => void (cancels += 1), getVoices: () => [] },
      createUtterance: (text) => ({ text, rate: 1, voice: null, onend: null, onerror: null }),
    },
  };
  return { env, spoken, cancels: () => cancels };
}

const finish = async (u: UtteranceLike) => act(async () => u.onend?.());
const wait = async (ms: number) => act(async () => void vi.advanceTimersByTime(ms));
const VOICES = { interviewer: null, candidate: null };

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("usePlaybackEngine", () => {
  it("plays a two-question plan end to end through the speaker and the gaps: 600 ms inside a question, 1400 ms between", async () => {
    const { env, spoken } = makeEnv();
    const { result } = renderHook(() => usePlaybackEngine(PLAN, { speed: 1, browserVoices: VOICES, env }));
    expect(result.current.state.status).toBe("idle");
    act(() => result.current.dispatch({ type: "play" }));
    expect(spoken.map((u) => u.text)).toEqual(["q0 s0"]);

    await finish(spoken[0]);
    expect(result.current.state.status).toBe("gap");
    await wait(599);
    expect(spoken).toHaveLength(1);
    await wait(1);
    expect(spoken).toHaveLength(2);
    expect(result.current.currentQuestionIndex).toBe(0);

    await finish(spoken[1]);
    await wait(1399);
    expect(spoken).toHaveLength(2);
    await wait(1);
    expect(spoken).toHaveLength(3);
    expect(result.current.currentQuestionIndex).toBe(1);

    await finish(spoken[2]);
    await wait(600);
    await finish(spoken[3]);
    expect(result.current.state.status).toBe("ended");
    expect(spoken.map((u) => u.text)).toEqual(["q0 s0", "q0 s1", "q1 s0", "q1 s1"]);
  });

  it("the gap factor scales the pauses", async () => {
    const { env, spoken } = makeEnv();
    const { result } = renderHook(() => usePlaybackEngine(PLAN, { speed: 1, browserVoices: VOICES, env, gapFactor: 2 }));
    act(() => result.current.dispatch({ type: "play" }));
    await finish(spoken[0]);
    await wait(1199);
    expect(spoken).toHaveLength(1);
    await wait(1);
    expect(spoken).toHaveLength(2);
  });

  it("pause stops the speaker and play resumes the step", async () => {
    const { env, spoken, cancels } = makeEnv();
    const { result } = renderHook(() => usePlaybackEngine(PLAN, { speed: 1, browserVoices: VOICES, env }));
    act(() => result.current.dispatch({ type: "play" }));
    act(() => result.current.dispatch({ type: "pause" }));
    expect(result.current.state.status).toBe("paused");
    expect(cancels()).toBeGreaterThan(0);
    act(() => result.current.dispatch({ type: "play" }));
    expect(spoken.map((u) => u.text)).toEqual(["q0 s0", "q0 s0"]);
    expect(result.current.state.stepIndex).toBe(0);
  });

  it("repeat_question while playing speaks the first step again", async () => {
    const { env, spoken } = makeEnv();
    const { result } = renderHook(() => usePlaybackEngine(PLAN, { speed: 1, browserVoices: VOICES, env }));
    act(() => result.current.dispatch({ type: "play" }));
    act(() => result.current.dispatch({ type: "repeat_question" }));
    expect(spoken).toHaveLength(2);
  });

  it("marking never calls pause: the engine has no mark event", () => {
    const { env } = makeEnv();
    const { result } = renderHook(() => usePlaybackEngine(PLAN, { speed: 1, browserVoices: VOICES, env }));
    act(() => result.current.dispatch({ type: "play" }));
    // The union of events holds nothing a mark could map to: the only way to
    // reach "paused" is the explicit pause event.
    act(() => result.current.dispatch({ type: "set_speed", speed: 1.2 }));
    expect(result.current.state.status).toBe("playing");
    expect(result.current.state.speed).toBe(1.2);
  });

  it("starts at initialStepIndex, still idle, and plays from there", () => {
    const { env, spoken } = makeEnv();
    const { result } = renderHook(() => usePlaybackEngine(PLAN, { speed: 1, browserVoices: VOICES, env, initialStepIndex: 2 }));
    expect(result.current.state).toMatchObject({ stepIndex: 2, status: "idle" });
    expect(result.current.currentQuestionIndex).toBe(1);
    expect(spoken).toHaveLength(0);
    act(() => result.current.dispatch({ type: "play" }));
    expect(spoken.map((u) => u.text)).toEqual(["q1 s0"]);
  });

  it("onClipFailed is called once per failed step", async () => {
    const audio: AudioLike = {
      src: "",
      playbackRate: 1,
      ended: false,
      onended: null,
      onerror: null,
      play: () => Promise.resolve(),
      pause: () => {},
    };
    const { env: base, spoken } = makeEnv();
    const env: SpeakerEnv = { ...base, createAudio: () => audio };
    const plan: PlaybackPlan = { ...PLAN, steps: [step(0, 0, 600, { clip: { assetId: "a1", suspect: false } }), step(0, 1, 1400)] };
    const onClipFailed = vi.fn();
    const { result } = renderHook(() => usePlaybackEngine(plan, { speed: 1, browserVoices: VOICES, env, onClipFailed }));
    act(() => result.current.dispatch({ type: "play" }));
    await act(async () => audio.onerror?.());
    expect(spoken).toHaveLength(1);
    await finish(spoken[0]);
    expect(onClipFailed).toHaveBeenCalledTimes(1);
    expect(onClipFailed).toHaveBeenCalledWith(plan.steps[0]);
    expect(result.current.state.status).toBe("gap");
  });
});
