import { MAX_POSTING_CHARS } from "./values";

// Bullet glyphs a pasted posting might use, plus the plain hyphen (harmless
// to also match here: a line that already starts "- " just round-trips).
const BULLET = /^\s*[•●▪◦·‣∙*–—-]\s+/;
const NUMBERED = /^\s*(\d{1,3})[.)]\s+/;

export function textToMarkdown(text: string): string {
  const lines = text
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/\t/g, " ")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""));
  const out: string[] = [];
  let inList = false;
  for (const line of lines) {
    if (line.trim() === "") {
      inList = false;
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    if (bullet || numbered) {
      const item = bullet ? `- ${line.slice(bullet[0].length).trim()}` : `${numbered![1]}. ${line.slice(numbered![0].length).trim()}`;
      // Adjacent list lines stay adjacent (no blank line between them); the
      // first item of a new list still opens its own paragraph.
      out.push(inList ? item : `\n${item}`);
      inList = true;
      continue;
    }
    out.push(`\n${line.trim()}`);
    inList = false;
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_POSTING_CHARS);
}

export function visibleTextLength(markdown: string): number {
  return markdown.replace(/[#*_>`\-[\]()!|]/g, " ").replace(/\s+/g, " ").trim().length;
}
