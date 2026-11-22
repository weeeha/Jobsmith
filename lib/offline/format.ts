const MB = 1024 * 1024;

/** "38 MB, 96 clips", "1 MB, 1 clip"; never under 1 MB. */
export function formatSaveSize(bytes: number, clips: number): string {
  const mb = Math.max(1, Math.round(bytes / MB));
  return `${mb} MB, ${clips} ${clips === 1 ? "clip" : "clips"}`;
}
