import type { StageKind } from "@/lib/pipeline/kinds";

type StageRefCandidate = { id: string; kind: StageKind; label: string; position: number };

export function matchStageRef(stages: StageRefCandidate[], ref: string): string | null {
  const normalizedLabel = ref.trim().toLowerCase().replace(/\s+/g, " ");
  for (const stage of stages) {
    const stageLabel = stage.label.trim().toLowerCase().replace(/\s+/g, " ");
    if (stageLabel === normalizedLabel) return stage.id;
  }

  const normalizedKind = ref.trim().toLowerCase().replace(/[\s-]+/g, "_");
  for (const stage of stages) {
    if (stage.kind === normalizedKind) return stage.id;
  }

  return null;
}
