// Binding copy for the Prep hub. Strings the spec fixes are exact; the ones
// marked proposed are the plan's wording, kept here so the Figma drafts can
// replace them in one place.
export const PREP_COPY = {
  empty: "No prep yet. Push a question bank or paste one.",
  noQuestions:
    'This document has no questions Jobsmith can read. A question is a line like `### 1. "Tell me about yourself"`.',
  audio: {
    browser: "Browser voice",
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
  // Proposed.
  quickFireEmpty: "Nothing to practice yet. Quick-fire needs questions that have a Spine.",
  toTheBrowserVoiceLine: "Audio uses your browser's voices. Settings has the voice options.",
} as const;
