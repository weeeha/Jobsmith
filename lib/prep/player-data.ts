// What the Listen screen needs, built on the server: the playback plan for one
// document with each step's saved clip attached by hash.
import { lookupSegments, segmentHash } from "@/lib/audio/segments";
import type { Scoped } from "@/lib/db/scoped";
import { fail, ok, type Result } from "@/lib/result";
import { TTS_STYLE_ID } from "@/lib/tts/driver";
import { toPlanSource, type AudioContext } from "./audio-status";
import { buildPlaybackPlan, pitchChapters, spokenSteps, type PlanSource, type PlaybackPlan, type Speaker, type StepSpec } from "./plan";
import { getPrepSettings, type PrepSettings } from "./settings";
import { PARSED_KINDS, type MarkLevel } from "./values";

export type ClipResolver = (speaker: Speaker, text: string) => { hash: string; clip: { assetId: string; suspect: boolean } | null };

// Looks up the saved clips for every step once, then answers per step. Shared
// by the Listen and Drill pages so a step's hash is computed in one place.
export async function makeClipResolver(
  s: Scoped,
  audio: Pick<AudioContext, "identity" | "voices">,
  steps: Pick<StepSpec, "speaker" | "text">[],
): Promise<ClipResolver> {
  const { identity, voices } = audio;
  const hashOf = (speaker: Speaker, text: string) =>
    segmentHash({ ...identity, voice: voices[speaker], style: TTS_STYLE_ID, spokenText: text });
  const clips = await lookupSegments(s, [...new Set(steps.map((st) => hashOf(st.speaker, st.text)))]);
  return (speaker, text) => {
    const hash = hashOf(speaker, text);
    return { hash, clip: clips.get(hash) ?? null };
  };
}

export type PlayerData = { plan: PlaybackPlan; settings: PrepSettings; subtitle: string; kind: "bank" | "pitch" };

export async function loadPlayerData(
  s: Scoped,
  // `audio` carries the voice identity and voices, as in loadPrepHub; the page
  // builds it with audioContext so the hashes match what the hub and the
  // audio actions generated.
  input: { opportunityId: string; docKey: string; scope: "opportunity"; audio: AudioContext },
): Promise<Result<PlayerData, "not_found">> {
  const opportunity = await s.opportunity.getById(input.opportunityId);
  if (!opportunity) return fail("not_found", "That job was not found.");
  const artifact = await s.artifact.getLatest({ opportunityId: opportunity.id }, input.docKey);
  if (!artifact) return fail("not_found", "That document was not found.");

  let kind: "bank" | "pitch";
  let sources: PlanSource[];
  let levels = new Map<string, MarkLevel>();
  if (artifact.kind === "pitch") {
    kind = "pitch";
    sources = pitchChapters(artifact.bodyMd);
  } else if ((PARSED_KINDS as readonly string[]).includes(artifact.kind)) {
    kind = "bank";
    sources = (await s.prepQuestion.listForArtifactKey(opportunity.id, input.docKey)).map(toPlanSource);
    levels = new Map((await s.prepMark.listForJob(opportunity.id)).map((m) => [m.questionKey, m.level]));
  } else {
    return fail("not_found", "That document cannot be played.");
  }
  if (sources.length === 0) return fail("not_found", "That document has nothing to play.");

  const resolveClip = await makeClipResolver(s, input.audio, spokenSteps(sources));

  const company = await s.company.getById(opportunity.companyId);
  const subtitle = company ? `${opportunity.roleTitle} at ${company.name}` : opportunity.roleTitle;
  const plan = buildPlaybackPlan({
    title: artifact.title,
    subtitle,
    sources,
    levels,
    resolveClip,
  });
  return ok({ plan, settings: await getPrepSettings(s), subtitle, kind });
}
