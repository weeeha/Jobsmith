// Makes a block's markdown speakable (spec 5.5): emphasis markers, link
// addresses, the warning marker and emoji go; list items become sentences.
const WARNING = "⚠️";
const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+/;
const SENTENCE_END = /[.!?:;]$/;

function cleanInline(text: string): string {
  return text
    .replace(/\{\{\s*include\b[^}]*\}\}/gi, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`+([^`]*)`+/g, "$1")
    .replaceAll(WARNING, " ")
    .replace(/(\*{1,3})(?=\S)([^*_]*?\S)\1/g, "$2")
    .replace(/(?<![\p{L}\p{N}_])(_{1,3})(?=\S)([^*_]*?\S)\1(?![\p{L}\p{N}_])/gu, "$2")
    .replace(/\*+/g, "")
    .replace(/(^|\s)_+|_+(?=\s|$)/g, "$1")
    .replace(/[\p{Extended_Pictographic}️‍]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function toSpokenText(markdown: string): string {
  const parts: string[] = [];
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.replace(/^\s*#{1,6}\s+/, "");
    const isItem = BULLET.test(line);
    const text = cleanInline(isItem ? line.replace(BULLET, "") : line);
    if (text === "") continue;
    parts.push(isItem && !SENTENCE_END.test(text) ? `${text}.` : text);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function labelSpokenText(label: string): string {
  const text = label.trim();
  return text.endsWith(":") ? text : `${text}:`;
}
