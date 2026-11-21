import { QUICK_FIRE_COUNT, type MarkLevel } from "./values";

export { QUICK_FIRE_COUNT, QUICK_FIRE_SECONDS } from "./values";

// FNV-1a over the id, so one session id always gives one order.
export function seedFromId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates over a copy, then the first `count`. The list is never changed.
export function pickQuickFire<T>(items: readonly T[], seed: number, count: number = QUICK_FIRE_COUNT): T[] {
  const copy = [...items];
  const random = mulberry32(seed);
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.max(0, count));
}

export type QuickFireSource = {
  questionKey: string;
  artifactKey: string;
  number: number;
  question: string;
  spine: string | null;
};

export type QuickFirePoolItem = {
  questionKey: string;
  number: number;
  question: string;
  spine: string;
  level: MarkLevel | null;
};

// Quick-fire trains the Spine, so a row without one is not in the pool.
// `artifactKey` narrows the pool to one bank; null takes every bank.
export function quickFirePool(
  rows: readonly QuickFireSource[],
  levels: ReadonlyMap<string, MarkLevel>,
  artifactKey: string | null,
): QuickFirePoolItem[] {
  const out: QuickFirePoolItem[] = [];
  for (const r of rows) {
    if (artifactKey !== null && r.artifactKey !== artifactKey) continue;
    if (r.spine === null || r.spine.trim() === "") continue;
    out.push({
      questionKey: r.questionKey,
      number: r.number,
      question: r.question,
      spine: r.spine,
      level: levels.get(r.questionKey) ?? null,
    });
  }
  return out;
}
