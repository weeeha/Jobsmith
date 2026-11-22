/** Next or previous change index. Stops at the ends (no wrap). `current` -1 means none yet. */
export function nextIndex(current: number, total: number, dir: "next" | "previous"): number {
  if (total <= 0) return -1;
  if (dir === "next") return Math.min(current + 1, total - 1);
  if (current < 0) return -1;
  return Math.max(current - 1, 0);
}

/** `index` is 0 based: "Change 3 of 12". */
export function changeLabel(index: number, total: number): string {
  if (total <= 0) return "No changes";
  return `Change ${index + 1} of ${total}`;
}

export function restingLabel(total: number): string {
  if (total <= 0) return "No changes";
  return total === 1 ? "1 change" : `${total} changes`;
}
