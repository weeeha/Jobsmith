export const MARK_LEVELS = ["shaky", "okay", "solid"] as const;
export type MarkLevel = (typeof MARK_LEVELS)[number];

export const MARK_SCOPES = ["job", "library"] as const;
export type MarkScope = (typeof MARK_SCOPES)[number];

export const PREP_MODES = ["listen", "drill", "quick_fire"] as const;
export type PrepMode = (typeof PREP_MODES)[number];

export const LIBRARY_KINDS = ["answer", "story", "intro", "fact"] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];

export const ASSET_KINDS = ["tts_segment", "recording", "other"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const SEGMENT_STATUSES = ["pending", "done", "failed"] as const;
export type SegmentStatus = (typeof SEGMENT_STATUSES)[number];

// Artifact kinds whose body is parsed into question rows.
export const PARSED_KINDS = ["question_bank", "call_card"] as const;
export type ParsedKind = (typeof PARSED_KINDS)[number];

// U+26A0 U+FE0F: the owner's marker for an answer that is not written yet.
export const WARNING_MARKER = "⚠️";

export const QUICK_FIRE_COUNT = 10;
export const QUICK_FIRE_SECONDS = 5;

// Pauses of the Listen player (spec 5.3), in milliseconds.
export const GAP_STEP_MS = 600;
export const GAP_QUESTION_MS = 1400;

// The spec's assumption 2: the voices of the owner's local Qwen3-TTS server.
export const DEFAULT_LOCAL_VOICES = { interviewer: "Vivian", candidate: "Ryan" } as const;

// Audio generation limits (README constants).
export const SEGMENT_BATCH_LIMIT = 20;
export const BATCH_BUDGET_MS = 45_000;
// One clip stays under 2 MB (spec 5.5); the request cap is AUDIO_PUT_MAX_BYTES.
export const SEGMENT_MAX_BYTES = 2_097_152;
export const AUDIO_PUT_MAX_BYTES = 4_194_304;
export const AUDIO_PUT_MAX_SEGMENTS = 50;
