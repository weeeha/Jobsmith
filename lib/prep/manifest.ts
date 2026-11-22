// Everything the phone needs to play one job offline, built on the server: the
// questions with their blocks and marks, the playback plan of every bank and
// pitch with each clip's asset id, the settings, and the distinct clips with
// their sizes so the hub can show the total before Save for offline.
import type { Scoped } from "@/lib/db/scoped";
import type { AudioContext } from "./audio-status";
import type { PlaybackPlan } from "./plan";
import { loadPlayerData } from "./player-data";
import { getPrepSettings, type PrepSettings } from "./settings";
import { PARSED_KINDS, type MarkLevel } from "./values";

export type PrepManifestQuestion = {
  number: number;
  section: string | null;
  questionKey: string;
  question: string;
  blocks: { label: string; spoken: boolean; text: string }[];
  level: MarkLevel | null;
  lastDrilledAt: string | null;
};

export type PrepManifest = {
  version: 1;
  slug: string;
  generatedAt: string;
  job: { roleTitle: string; companyName: string };
  banks: {
    key: string;
    title: string;
    kind: "question_bank" | "call_card";
    stageLabel: string | null;
    questions: PrepManifestQuestion[];
    plan: PlaybackPlan;
  }[];
  pitches: { key: string; title: string; plan: PlaybackPlan }[];
  settings: { speed: number; gapFactor: number; browserVoices: PrepSettings["browserVoices"] };
  assets: { id: string; bytes: number }[]; // every distinct clip the plans need, once
  totalBytes: number;
};

type ParsedKind = (typeof PARSED_KINDS)[number];
const isParsedKind = (kind: string): kind is ParsedKind => (PARSED_KINDS as readonly string[]).includes(kind);
const byTitleThenKey = <T extends { title: string; key: string }>(a: T, b: T) => a.title.localeCompare(b.title) || a.key.localeCompare(b.key);

// `audio` is the voice identity and voices the pages build with audioContext, so
// the clip hashes match the ones the hub and the audio actions generated.
export async function buildPrepManifest(
  s: Scoped,
  slug: string,
  audio: AudioContext,
  now: Date = new Date(),
): Promise<PrepManifest | null> {
  const opportunity = await s.opportunity.getBySlug(slug);
  if (!opportunity) return null;

  const [company, docs, stages, rows, marks, settings] = await Promise.all([
    s.company.getById(opportunity.companyId),
    s.artifact.listLatestForOpportunity(opportunity.id),
    s.stage.listForOpportunity(opportunity.id),
    s.prepQuestion.listForJob(opportunity.id),
    s.prepMark.listForJob(opportunity.id),
    getPrepSettings(s),
  ]);
  const stageLabel = new Map(stages.map((st) => [st.id, st.label]));
  const markByKey = new Map(marks.map((m) => [m.questionKey, m]));
  const jobDocs = docs.filter((d) => d.companyId === null);

  const banks: PrepManifest["banks"] = [];
  for (const doc of jobDocs.filter((d) => isParsedKind(d.kind)).sort(byTitleThenKey)) {
    if (!isParsedKind(doc.kind)) continue;
    const loaded = await loadPlayerData(s, { opportunityId: opportunity.id, docKey: doc.key, scope: "opportunity", audio });
    if (!loaded.ok) continue; // a bank with no questions has nothing to save
    banks.push({
      key: doc.key,
      title: doc.title,
      kind: doc.kind,
      stageLabel: doc.stageId ? (stageLabel.get(doc.stageId) ?? null) : null,
      questions: rows
        .filter((r) => r.artifactKey === doc.key)
        .map((r) => ({
          number: r.number,
          section: r.section,
          questionKey: r.questionKey,
          question: r.question,
          blocks: r.blocks.map((b) => ({ label: b.label, spoken: b.spoken, text: b.text })),
          level: markByKey.get(r.questionKey)?.level ?? null,
          lastDrilledAt: markByKey.get(r.questionKey)?.lastDrilledAt?.toISOString() ?? null,
        })),
      plan: loaded.data.plan,
    });
  }

  const pitches: PrepManifest["pitches"] = [];
  for (const doc of jobDocs.filter((d) => d.kind === "pitch").sort(byTitleThenKey)) {
    const loaded = await loadPlayerData(s, { opportunityId: opportunity.id, docKey: doc.key, scope: "opportunity", audio });
    if (!loaded.ok) continue;
    pitches.push({ key: doc.key, title: doc.title, plan: loaded.data.plan });
  }

  // Drill and Quick-fire speak the same question and Say steps as Listen, so
  // their clips are already among the plans' clips.
  const wanted = new Set<string>();
  for (const plan of [...banks.map((b) => b.plan), ...pitches.map((p) => p.plan)]) {
    for (const step of plan.steps) if (step.clip) wanted.add(step.clip.assetId);
  }
  const assets = (await s.asset.listByIds([...wanted]))
    .map((a) => ({ id: a.id, bytes: a.bytes }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    version: 1,
    slug: opportunity.slug,
    generatedAt: now.toISOString(),
    job: { roleTitle: opportunity.roleTitle, companyName: company?.name ?? "" },
    banks,
    pitches,
    settings: { speed: settings.speed, gapFactor: settings.gapFactor, browserVoices: settings.browserVoices },
    assets,
    totalBytes: assets.reduce((sum, a) => sum + a.bytes, 0),
  };
}
