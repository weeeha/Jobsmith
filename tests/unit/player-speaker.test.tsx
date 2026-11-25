// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useSpeaker, type AudioLike, type SpeakerEnv, type UtteranceLike } from "@/components/player/speaker";
import type { PlaybackStep } from "@/lib/prep/plan";

class FakeAudio implements AudioLike {
  src = "";
  playbackRate = 1;
  ended = false;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  played = 0;
  paused = 0;
  playResult: () => Promise<void> = () => Promise.resolve();
  play() {
    this.played += 1;
    return this.playResult();
  }
  pause() {
    this.paused += 1;
  }
}

class FakeSpeech {
  spoken: UtteranceLike[] = [];
  cancelled = 0;
  voices = [
    { name: "Samantha", voiceURI: "sam-uri" },
    { name: "Daniel", voiceURI: "dan-uri" },
  ];
  synth = {
    speak: (u: UtteranceLike) => void this.spoken.push(u),
    cancel: () => void (this.cancelled += 1),
    getVoices: () => this.voices,
  };
  createUtterance = (text: string): UtteranceLike => ({ text, rate: 1, voice: null, onend: null, onerror: null });
}

function step(over: Partial<PlaybackStep> = {}): PlaybackStep {
  return {
    id: "0-0",
    questionIndex: 0,
    blockIndex: null,
    kind: "question",
    speaker: "interviewer",
    text: "Tell me about yourself.",
    hash: "h",
    clip: null,
    gapAfterMs: 600,
    ...over,
  };
}

const VOICES = { interviewer: "Daniel", candidate: "sam-uri" };

function setup(env: Partial<SpeakerEnv> & { audio?: FakeAudio; speech?: FakeSpeech | null }) {
  const audio = env.audio ?? new FakeAudio();
  const speech = env.speech === undefined ? new FakeSpeech() : env.speech;
  const full: SpeakerEnv = {
    createAudio: env.createAudio === undefined ? () => audio : env.createAudio,
    speech: speech ? { synth: speech.synth, createUtterance: speech.createUtterance } : null,
  };
  const hook = renderHook(() => useSpeaker({ browserVoices: VOICES, env: full }));
  return { audio, speech, hook };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useSpeaker", () => {
  it("a step with a clip plays /api/assets/<assetId> with playbackRate set to the speed and resolves ended when it ends", async () => {
    const { audio, hook } = setup({});
    let outcome: string | null = null;
    act(() => void hook.result.current.speak(step({ clip: { assetId: "abc", suspect: false } }), 1.3).then((o) => (outcome = o)));
    expect(audio.src).toBe("/api/assets/abc");
    expect(audio.playbackRate).toBe(1.3);
    expect(audio.played).toBe(1);
    await act(async () => audio.onended?.());
    expect(outcome).toBe("ended");
  });

  it("a clip error falls back to the browser voice for that step and resolves clip_failed", async () => {
    const { audio, speech, hook } = setup({});
    let outcome: string | null = null;
    act(() => void hook.result.current.speak(step({ clip: { assetId: "abc", suspect: false } }), 1).then((o) => (outcome = o)));
    await act(async () => audio.onerror?.());
    expect(speech!.spoken).toHaveLength(1);
    expect(outcome).toBeNull();
    await act(async () => speech!.spoken[0].onend?.());
    expect(outcome).toBe("clip_failed");
  });

  it("a rejected play() also falls back", async () => {
    const audio = new FakeAudio();
    audio.playResult = () => Promise.reject(new Error("NotSupportedError"));
    const { speech, hook } = setup({ audio });
    let outcome: string | null = null;
    await act(async () => void hook.result.current.speak(step({ clip: { assetId: "abc", suspect: false } }), 1).then((o) => (outcome = o)));
    expect(speech!.spoken).toHaveLength(1);
    await act(async () => speech!.spoken[0].onend?.());
    expect(outcome).toBe("clip_failed");
  });

  it("a step without a clip speaks through speechSynthesis with rate equal to the speed and the voice chosen for the speaker", async () => {
    const { speech, hook } = setup({});
    let outcome: string | null = null;
    act(() => void hook.result.current.speak(step({ speaker: "interviewer" }), 1.2).then((o) => (outcome = o)));
    const utterance = speech!.spoken[0];
    expect(utterance.text).toBe("Tell me about yourself.");
    expect(utterance.rate).toBe(1.2);
    expect(utterance.voice).toEqual({ name: "Daniel", voiceURI: "dan-uri" });
    await act(async () => utterance.onend?.());
    expect(outcome).toBe("ended");
    act(() => void hook.result.current.speak(step({ speaker: "candidate" }), 1));
    expect(speech!.spoken[1].voice).toEqual({ name: "Samantha", voiceURI: "sam-uri" });
  });

  it("with no speechSynthesis the step resolves after text length / 13 / speed seconds so text-only mode still advances", async () => {
    const { hook } = setup({ speech: null });
    const text = "x".repeat(130); // 10 seconds at speed 1, 5 at speed 2 is out of range, use 1.25: 8 s
    let outcome: string | null = null;
    act(() => void hook.result.current.speak(step({ text }), 1.25).then((o) => (outcome = o)));
    await act(async () => void vi.advanceTimersByTime(7_900));
    expect(outcome).toBeNull();
    await act(async () => void vi.advanceTimersByTime(200));
    expect(outcome).toBe("ended");
  });

  it("with no Audio either, a clip step reads as text and resolves clip_failed", async () => {
    const { hook } = setup({ createAudio: null, speech: null });
    let outcome: string | null = null;
    act(() => void hook.result.current.speak(step({ clip: { assetId: "abc", suspect: false }, text: "x".repeat(26) }), 1).then((o) => (outcome = o)));
    await act(async () => void vi.advanceTimersByTime(2_100));
    expect(outcome).toBe("clip_failed");
  });

  it("cancel stops audio and speech and resolves cancelled", async () => {
    const { audio, speech, hook } = setup({});
    const outcomes: string[] = [];
    act(() => void hook.result.current.speak(step({ clip: { assetId: "abc", suspect: false } }), 1).then((o) => outcomes.push(o)));
    await act(async () => hook.result.current.cancel());
    expect(audio.paused).toBe(1);
    expect(outcomes).toEqual(["cancelled"]);
    act(() => void hook.result.current.speak(step(), 1).then((o) => outcomes.push(o)));
    await act(async () => hook.result.current.cancel());
    expect(speech!.cancelled).toBe(1);
    expect(outcomes).toEqual(["cancelled", "cancelled"]);
  });

  it("a new speak cancels the one still running", async () => {
    const { hook } = setup({});
    const outcomes: string[] = [];
    act(() => void hook.result.current.speak(step(), 1).then((o) => outcomes.push(o)));
    act(() => void hook.result.current.speak(step({ id: "0-1" }), 1).then((o) => outcomes.push(o)));
    await act(async () => void 0);
    expect(outcomes).toEqual(["cancelled"]);
  });
});
