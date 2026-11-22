export const COPY = {
  pickDifferent: "Pick two different versions",
  tooManyToMark: "Too many changes to mark word by word",
  tooDifferent:
    "These versions differ too much to compare line by line. Both are shown in full below.",
  showUnchanged: (n: number) => `Show ${n} unchanged lines`,
} as const;
