"use client";

import * as React from "react";

import type { PlaybackStep } from "@/lib/prep/plan";
import { IDEAL_CPS } from "@/lib/tts/gate";

export type SpeakOutcome = "ended" | "clip_failed" | "cancelled";

// The slices of HTMLAudioElement and speechSynthesis the speaker uses, so
// tests hand it fakes and a browser that lacks one of them degrades instead
// of throwing.
export interface AudioLike {
  src: string;
  playbackRate: number;
  ended: boolean;
  onended: (() => void) | null;
  onerror: (() => void) | null;
  play(): Promise<void> | void;
  pause(): void;
}
export interface UtteranceLike {
  text: string;
  rate: number;
  voice: unknown;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}
export interface SpeechLike {
  speak(utterance: UtteranceLike): void;
  cancel(): void;
  getVoices(): { name: string; voiceURI: string }[];
}
export type SpeakerEnv = {
  createAudio: (() => AudioLike) | null;
  speech: { synth: SpeechLike; createUtterance(text: string): UtteranceLike } | null;
};

/** The real browser, with each API feature-detected. */
export function browserSpeakerEnv(): SpeakerEnv {
  if (typeof window === "undefined") return { createAudio: null, speech: null };
  const createAudio = typeof window.Audio === "function" ? () => new window.Audio() as unknown as AudioLike : null;
  const synth = typeof window.speechSynthesis === "undefined" ? null : window.speechSynthesis;
  const speech =
    synth && typeof window.SpeechSynthesisUtterance === "function"
      ? {
          synth: synth as unknown as SpeechLike,
          createUtterance: (text: string) => new window.SpeechSynthesisUtterance(text) as unknown as UtteranceLike,
        }
      : null;
  return { createAudio, speech };
}

export type BrowserVoices = { interviewer: string | null; candidate: string | null };

// Text-only mode: how long the line would take to read at the ideal pace.
export function readingMs(text: string, speed: number): number {
  return Math.max(400, (text.length / IDEAL_CPS / speed) * 1000);
}

export function assetUrl(assetId: string): string {
  return `/api/assets/${assetId}`;
}

type Pending = { settle: (outcome: SpeakOutcome) => void; stop: () => void };

export function useSpeaker(options: { browserVoices: BrowserVoices; env?: SpeakerEnv }): {
  speak(step: PlaybackStep, speed: number): Promise<SpeakOutcome>;
  cancel(): void;
} {
  const voicesRef = React.useRef(options.browserVoices);
  React.useEffect(() => {
    voicesRef.current = options.browserVoices;
  });
  const envRef = React.useRef<SpeakerEnv | null>(options.env ?? null);
  const audioRef = React.useRef<AudioLike | null>(null);
  const utteranceRef = React.useRef<UtteranceLike | null>(null); // kept alive: Chrome drops unreferenced utterances
  const pendingRef = React.useRef<Pending | null>(null);

  const getEnv = React.useCallback((): SpeakerEnv => {
    if (envRef.current === null) envRef.current = browserSpeakerEnv();
    return envRef.current;
  }, []);

  const cancel = React.useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending) return;
    pending.stop();
    pending.settle("cancelled");
  }, []);

  const speak = React.useCallback(
    (step: PlaybackStep, speed: number): Promise<SpeakOutcome> => {
      cancel();
      const env = getEnv();
      return new Promise<SpeakOutcome>((resolve) => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        let stopBrowser: () => void = () => {};
        let stopClip: () => void = () => {};
        let done = false;
        const pending: Pending = {
          settle: (outcome) => {
            if (done) return;
            done = true;
            if (pendingRef.current === pending) pendingRef.current = null;
            resolve(outcome);
          },
          stop: () => {
            if (timer) clearTimeout(timer);
            stopClip();
            stopBrowser();
          },
        };
        pendingRef.current = pending;

        const viaBrowser = (outcome: SpeakOutcome) => {
          const speech = env.speech;
          if (!speech) {
            timer = setTimeout(() => pending.settle(outcome), readingMs(step.text, speed));
            return;
          }
          const utterance = speech.createUtterance(step.text);
          utterance.rate = speed;
          const wanted = voicesRef.current[step.speaker];
          if (wanted) {
            const voice = speech.synth.getVoices().find((v) => v.voiceURI === wanted || v.name === wanted);
            if (voice) utterance.voice = voice;
          }
          const finish = () => pending.settle(outcome);
          utterance.onend = finish;
          utterance.onerror = finish;
          utteranceRef.current = utterance;
          stopBrowser = () => {
            utterance.onend = null;
            utterance.onerror = null;
            speech.synth.cancel();
          };
          speech.synth.speak(utterance);
        };

        if (step.clip && env.createAudio) {
          const audio = audioRef.current ?? (audioRef.current = env.createAudio());
          const failed = () => {
            stopClip();
            viaBrowser("clip_failed");
          };
          stopClip = () => {
            audio.onended = null;
            audio.onerror = null;
            if (!audio.ended) audio.pause();
          };
          audio.onended = () => {
            audio.onended = null;
            audio.onerror = null;
            pending.settle("ended");
          };
          audio.onerror = failed;
          audio.src = assetUrl(step.clip.assetId);
          audio.playbackRate = speed;
          try {
            const started = audio.play();
            if (started && typeof started.catch === "function") {
              started.catch(() => {
                // An interrupted play() (a new src or a pause) is not a failed clip.
                if (!done && pendingRef.current === pending) failed();
              });
            }
          } catch {
            failed();
          }
          return;
        }
        viaBrowser(step.clip ? "clip_failed" : "ended");
      });
    },
    [cancel, getEnv],
  );

  React.useEffect(() => cancel, [cancel]);

  return { speak, cancel };
}
