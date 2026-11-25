import { createHash, randomBytes } from "node:crypto";

// Every object key starts with a per-user prefix so one user's objects can be
// listed and removed without a database join, and holds random hex only, so a
// key never carries the user id or any spoken text.
export const STORAGE_KEY_PATTERN = /^u\/[0-9a-f]{16}\/(tts|rec)\/[0-9a-f]{32}\.(mp3|wav|ogg|webm|mp4)$/;

export function userHash(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 16);
}

export function userPrefix(userId: string): string {
  return `u/${userHash(userId)}/`;
}

export function newSegmentKey(userId: string, ext: "mp3" | "wav" | "ogg"): string {
  return `${userPrefix(userId)}tts/${randomBytes(16).toString("hex")}.${ext}`;
}

export function newRecordingKey(userId: string, ext: "webm" | "mp4" | "ogg"): string {
  return `${userPrefix(userId)}rec/${randomBytes(16).toString("hex")}.${ext}`;
}
