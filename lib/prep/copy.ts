// Binding copy for the Prep hub. Strings the spec fixes are exact; the ones
// marked proposed are the plan's wording, kept here so the Figma drafts can
// replace them in one place.
// The browser-voice line with its Settings link split out, so the link can be
// a real anchor and the sentence still reads the same.
export const VOICE_LINE = {
  before: "Audio uses your browser's voices. ",
  link: "Settings",
  after: " has the voice options.",
} as const;

export const PREP_COPY = {
  empty: "No prep yet. Push a question bank or paste one.",
  noQuestions:
    'This document has no questions Jobsmith can read. A question is a line like `### 1. "Tell me about yourself"`.',
  audio: {
    browser: "Browser voice",
    // Proposed. The hub's audio line and panel.
    ready: "Audio ready",
    preparing: "Preparing audio",
    paused: "Paused, trying again in a minute",
    readyAnnouncement: "Audio ready.",
    prepare: "Prepare audio",
    delete: "Delete audio",
    deleteTitle: "Delete audio clips?",
    deleteBody:
      "This removes clips that no current question, library item or pitch needs, in every job. Clips still in use stay, and you can prepare any of them again.",
    deleteConfirm: "Delete clips",
    deleteCancel: "Keep clips",
    deletedAnnouncement: (count: number) => (count === 1 ? "Deleted 1 clip." : `Deleted ${count} clips.`),
    prepareFailed: "Could not prepare the audio.",
    deleteFailed: "Could not delete the audio.",
  },
  buttons: {
    quickFire: "Quick-fire",
    rebuild: "Rebuild questions",
    checkBank: "Check the bank",
    unfilledChip: "unfilled",
  },
  marks: {
    shaky: "Shaky",
    okay: "Okay",
    solid: "Solid",
  },
  // Proposed. Home's interview item when research exists and no questions do.
  homeNoPrep: "No prep yet",
  // Proposed. The hub's own labels; the plan fixes none of these.
  hub: {
    pasteLabel: "Paste a question bank",
    pushLead: "Or run",
    bankSelected: "Showing",
    markDisclosure: "Mark",
    questionsHeading: "Questions",
    bankLabel: "Question banks",
    selectedBank: "Showing questions",
    selectBank: "Show questions",
    checkBankNone: "Nothing to check.",
    markGroup: "Mark this answer",
    rebuildFailed: "Could not rebuild the questions.",
    markFailed: "Could not save the mark.",
  },
  // Proposed. The Quick-fire screen's own labels.
  quickFire: {
    next: "Next question",
    countdownAnnounce: "Five seconds. Recall the shape of your answer.",
    spineLabel: "Spine",
    summaryHeading: "This round",
    noMark: "No mark",
    back: "Back to Prep",
    startFailed: "Could not start the round.",
    retry: "Try again",
    starting: "Starting the round.",
    keysHint: "Space or Enter for the next question. 1, 2 and 3 mark Shaky, Okay and Solid.",
    sessionEndFailed: "Could not save the round.",
  },
  // Proposed.
  quickFireEmpty: "Nothing to practice yet. Quick-fire needs questions that have a Spine.",
  toTheBrowserVoiceLine: `${VOICE_LINE.before}${VOICE_LINE.link}${VOICE_LINE.after}`,
} as const;

export function questionCountLabel(count: number): string {
  return count === 1 ? "1 question" : `${count} questions`;
}

export function markedAnnouncement(level: "shaky" | "okay" | "solid"): string {
  return `Marked ${level}.`;
}

export function rebuiltAnnouncement(rows: number): string {
  return rows === 1 ? "Rebuilt 1 question." : `Rebuilt ${rows} questions.`;
}

export function quickFireProgress(position: number, total: number): string {
  return `Question ${position} of ${total}`;
}
