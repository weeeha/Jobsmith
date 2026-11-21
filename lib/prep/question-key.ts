import { createHash } from "node:crypto";
import { WARNING_MARKER } from "./values";

// Lower-case, remove the warning marker, quotes and punctuation, collapse
// whitespace. Two spellings of one question share a key, so a mark survives a
// light edit of the question line.
export function normalizeQuestion(text: string): string {
  return text
    .split(WARNING_MARKER)
    .join(" ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function questionKey(text: string): string {
  return createHash("sha256").update(normalizeQuestion(text)).digest("hex").slice(0, 16);
}
