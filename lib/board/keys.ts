import { STAGE_KINDS, type StageKind } from "@/lib/pipeline/kinds";

export type BoardKeyAction = { type: "move"; kind: StageKind } | { type: "close" };

export function keyToAction(key: string): BoardKeyAction | null {
  if (key.length !== 1) return null;
  if (key === "c" || key === "C") return { type: "close" };
  const index = Number(key) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= STAGE_KINDS.length) return null;
  return { type: "move", kind: STAGE_KINDS[index].kind };
}
