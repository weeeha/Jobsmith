const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function daysInStage(enteredAt: Date | null, now: Date): number | null {
  if (!enteredAt) return null;
  const elapsed = now.getTime() - enteredAt.getTime();
  return Math.max(0, Math.floor(elapsed / MS_PER_DAY));
}
