// Proposed copy for the offline features, kept in one place so the Figma
// drafts can replace it. No exclamation marks, no em dashes.
export const OFFLINE_COPY = {
  sync: {
    retry: "Retry",
    discard: "Discard",
    stuckLine: (count: number) => (count === 1 ? "1 mark could not sync" : `${count} marks could not sync`),
    stuckHelp: "It was tried 10 times. Retry it, or discard it.",
    syncedAnnouncement: "Marks synced.",
  },
} as const;
