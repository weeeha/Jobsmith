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
  // Proposed. The hub's Save for offline panel.
  panel: {
    heading: "Offline",
    help: "Saves this job's questions, pages and clips on this device, so they play with no connection.",
    save: "Save for offline",
    saving: (done: number, total: number) => `Saving ${done} of ${total}`,
    saved: "Saved",
    remove: "Remove saved copy",
    failedLine: (count: number) => (count === 1 ? "1 item could not be saved" : `${count} items could not be saved`),
    retry: "Try again",
    sizeFailed: "Could not read what this job needs to save.",
    savedAnnouncement: "Saved for offline.",
    removedAnnouncement: "Saved copy removed.",
  },
  // Proposed. The collapsible install card on the hub.
  install: {
    heading: "Install on your phone",
    body: "Install Jobsmith from the share sheet or the browser menu. Safari clears saved jobs after seven days of not opening the site unless the app is on the home screen. Audio on a locked screen depends on your phone.",
    dismiss: "Dismiss",
  },
  // Proposed. The /offline page the worker serves for a page that is not saved.
  offline: {
    heading: "You are offline.",
    help: "This page is not saved on this device. Saved jobs still open.",
    openHeading: "Open a saved job",
    empty: "Nothing is saved on this device yet.",
    jobLabel: (role: string, company: string) => (company ? `${role} at ${company}` : role),
    listen: "Listen",
    drill: "Drill",
    quickFire: "Quick-fire",
  },
} as const;
