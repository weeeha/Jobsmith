// What the hub says about a bank's audio, and the context (voice identity,
// voices, whether TTS is on) that the hub and the audio actions share.
import type { Scoped } from "@/lib/db/scoped";
import type { PrepQuestionRow } from "@/lib/db/scoped/prep-question";
import type { AudioDeps } from "@/lib/audio/deps";
import { ttsIdentity, type TtsConfig, type TtsIdentity } from "@/lib/tts/config";
import { PREP_COPY } from "./copy";
import type { PlanSource } from "./plan";
import { getPrepSettings, resolveVoices, type VoicePair } from "./settings";

export type AudioStatus =
  | { state: "browser" } // TTS off and no clips
  | { state: "partial"; done: number; total: number }
  | { state: "ready" };

export type AudioStatusView = AudioStatus | { state: "preparing" } | { state: "paused" };

export function audioStatusText(status: AudioStatusView, done?: number, total?: number): string {
  switch (status.state) {
    case "ready":
      return PREP_COPY.audio.ready;
    case "browser":
      return PREP_COPY.audio.browser;
    case "paused":
      return PREP_COPY.audio.paused;
    case "preparing":
      return done !== undefined && total !== undefined ? `Audio: ${done} of ${total} clips` : PREP_COPY.audio.preparing;
    case "partial":
      return `Audio: ${done ?? status.done} of ${total ?? status.total} clips`;
  }
}

export function audioStatusFor(plan: { total: number; done: number }, ttsOn: boolean): AudioStatus {
  if (plan.total === 0) return { state: "browser" };
  if (plan.done >= plan.total) return { state: "ready" };
  if (plan.done > 0 || ttsOn) return { state: "partial", done: plan.done, total: plan.total };
  return { state: "browser" };
}

export type AudioContext = { identity: TtsIdentity; voices: VoicePair<string>; ttsOn: boolean };

// Saved voices win, otherwise the code defaults. This never asks the provider
// for its voice list: rendering a page must not make a network call. Only the
// Settings Voice section fetches that list, on demand.
export async function audioContext(s: Scoped, deps: Pick<AudioDeps, "tts">, config: TtsConfig | null): Promise<AudioContext> {
  const settings = await getPrepSettings(s);
  return { identity: ttsIdentity(config), voices: resolveVoices(settings, []), ttsOn: config !== null && deps.tts !== null };
}

export function toPlanSource(row: PrepQuestionRow): PlanSource {
  return { question: row.question, section: row.section, number: row.number, questionKey: row.questionKey, blocks: row.blocks };
}

// One bank when docKey is given, otherwise every bank of the job.
export async function sourcesForJob(s: Scoped, opportunityId: string, docKey: string | null): Promise<PlanSource[]> {
  const rows = docKey === null ? await s.prepQuestion.listForJob(opportunityId) : await s.prepQuestion.listForArtifactKey(opportunityId, docKey);
  return rows.map(toPlanSource);
}
