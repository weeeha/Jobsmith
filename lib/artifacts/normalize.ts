import { createHash } from "node:crypto";

const TITLE_MAX = 200;
const KEY_MAX = 60;

// One ATX level-1 heading: exactly one `#` (not two or more), then one or
// more spaces, then the rest of the line as its text.
const H1_LINE = /^#(?!#)\s+(.*)$/;

export function normalizeBody(raw: string): string {
  // Postgres text columns cannot hold a NUL byte at all (an insert throws),
  // so this has to come out here rather than being left for the database to
  // reject - a UTF-16 file read as UTF-8 is full of these.
  const withoutNul = raw.replace(/\u0000/g, "");
  const withoutBom = withoutNul.codePointAt(0) === 0xfeff ? withoutNul.slice(1) : withoutNul;
  const withLf = withoutBom.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = withLf.split("\n").map((line) => line.replace(/[ \t]+$/, ""));
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.join("\n");
}

export function hashBody(normalized: string): string {
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

export function deriveTitle(input: { title?: string | null; bodyMd: string; key: string }): string {
  // Same reason as normalizeBody: a title also lands in a Postgres text
  // column, so a NUL byte in either source has to go before it gets there.
  const given = input.title?.replace(/\u0000/g, "").trim();
  if (given) {
    return given.slice(0, TITLE_MAX);
  }

  const lines = input.bodyMd.split(/\r\n|\r|\n/);
  for (const line of lines) {
    const match = H1_LINE.exec(line);
    if (match) {
      const heading = match[1].replace(/\u0000/g, "").trimEnd().replace(/\s*#+$/, "");
      return heading.slice(0, TITLE_MAX);
    }
  }

  return input.key.slice(0, TITLE_MAX);
}

export function keyFromTitle(title: string): string {
  const slug = title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const clipped = slug.slice(0, KEY_MAX).replace(/-+$/g, "");
  return clipped.length > 0 ? clipped : "document";
}
