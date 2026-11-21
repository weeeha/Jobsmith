"use client";

import * as React from "react";

import { engineReducer, type EngineEvent, type EngineState } from "@/lib/prep/engine-state";
import type { PlaybackPlan, PlaybackStep } from "@/lib/prep/plan";
import { useSpeaker, type BrowserVoices, type SpeakerEnv } from "./speaker";

// Events that start the current step over, even when stepIndex and status do
// not change (repeat on the first question while playing).
const RESTARTING = new Set<EngineEvent["type"]>(["play", "next_question", "prev_question", "repeat_question", "seek_step"]);

/**
 * The thin shell around engineReducer: it speaks the current step while the
 * status is playing, waits out the gap while it is gap, and feeds both back
 * as events. Marking is not an engine event, so it can never pause playback.
 */
export function usePlaybackEngine(
  plan: PlaybackPlan,
  options: {
    speed: number;
    browserVoices: BrowserVoices;
    onClipFailed?(step: PlaybackStep): void;
    // Multiplies the plan's gaps (Settings, "pause factor"). Wall-clock, never divided by speed.
    gapFactor?: number;
    env?: SpeakerEnv;
  },
): { state: EngineState; currentStep: PlaybackStep | null; currentQuestionIndex: number; dispatch(event: EngineEvent): void } {
  const reducer = React.useCallback((state: EngineState, event: EngineEvent) => engineReducer(state, event, plan), [plan]);
  const [state, rawDispatch] = React.useReducer(reducer, { stepIndex: 0, status: "idle", speed: options.speed } satisfies EngineState);
  const [restarts, setRestarts] = React.useState(0);
  const speaker = useSpeaker({ browserVoices: options.browserVoices, env: options.env });
  const onClipFailed = React.useRef(options.onClipFailed);
  React.useEffect(() => {
    onClipFailed.current = options.onClipFailed;
  });
  const gapFactor = options.gapFactor ?? 1;

  const dispatch = React.useCallback((event: EngineEvent) => {
    rawDispatch(event);
    if (RESTARTING.has(event.type)) setRestarts((n) => n + 1);
  }, []);

  // A speed set from outside (the saved setting arriving) follows the prop.
  React.useEffect(() => {
    rawDispatch({ type: "set_speed", speed: options.speed });
  }, [options.speed]);

  const currentStep: PlaybackStep | null = plan.steps[state.stepIndex] ?? null;
  const { status, stepIndex, speed } = state;
  const { speak, cancel } = speaker;

  React.useEffect(() => {
    if (status !== "playing") {
      cancel();
      return;
    }
    const step = plan.steps[stepIndex];
    if (!step) return;
    let live = true;
    void speak(step, speed).then((outcome) => {
      if (!live || outcome === "cancelled") return;
      if (outcome === "clip_failed") onClipFailed.current?.(step);
      rawDispatch({ type: "step_ended" });
    });
    return () => {
      live = false;
      cancel();
    };
    // restarts re-runs the effect for a step that did not change.
  }, [status, stepIndex, speed, restarts, plan, speak, cancel]);

  React.useEffect(() => {
    if (status !== "gap") return;
    const step = plan.steps[stepIndex];
    const id = setTimeout(() => rawDispatch({ type: "gap_elapsed" }), (step?.gapAfterMs ?? 0) * gapFactor);
    return () => clearTimeout(id);
  }, [status, stepIndex, plan, gapFactor]);

  return { state, currentStep, currentQuestionIndex: currentStep?.questionIndex ?? 0, dispatch };
}
