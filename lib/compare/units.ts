import { LONG_LINE_CHARS } from "./limits";

const FENCE = /^\s{0,3}(```|~~~)/;
const HEADING = /^#{1,6}\s/;
const LIST_ITEM = /^\s*([-*+]|\d+[.)])\s/;
const TABLE_ROW = /^\s*\|/;
const SENTENCE_END = /(?<=[.?!])(?=\s+["'(\[\p{Lu}\d])/u;

function splitSentences(line: string): string[] {
  // Trailing newline stays with the last piece; whitespace after a sentence end stays left.
  const body = line.endsWith("\n") ? line.slice(0, -1) : line;
  const tail = line.slice(body.length);
  const pieces = body.split(SENTENCE_END);
  // split() drops nothing, but whitespace begins the next piece; move it left.
  const out: string[] = [];
  for (let i = 0; i < pieces.length; i++) {
    let piece = pieces[i];
    if (i > 0) {
      const ws = /^\s+/.exec(piece)?.[0] ?? "";
      if (ws) {
        out[out.length - 1] += ws;
        piece = piece.slice(ws.length);
      }
    }
    out.push(piece);
  }
  out[out.length - 1] += tail;
  return out;
}

/** Split a body into diff units. Every unit keeps its trailing separator, so units.join("") === body. */
export function splitUnits(body: string): string[] {
  if (body === "") return [];
  const lines = body.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const units: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      units.push(line);
      continue;
    }
    const plain = line.endsWith("\n") ? line.slice(0, -1) : line;
    const splittable =
      !inFence &&
      plain.length > LONG_LINE_CHARS &&
      !HEADING.test(line) &&
      !LIST_ITEM.test(line) &&
      !TABLE_ROW.test(line);
    if (splittable) units.push(...splitSentences(line));
    else units.push(line);
  }
  return units;
}

/** Stored bodies end without a newline; appending one keeps a last line from showing as changed when lines follow it. */
export function unitsForDiff(body: string): string[] {
  return splitUnits(body + "\n");
}

/** units.join("") with exactly one trailing newline removed. */
export function bodyFromUnits(units: string[]): string {
  const joined = units.join("");
  return joined.endsWith("\n") ? joined.slice(0, -1) : joined;
}
