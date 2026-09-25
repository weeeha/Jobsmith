export function splitFrontmatter(text: string): { data: Record<string, string>; body: string } {
  const normalized = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { data: {}, body: normalized };
  }
  const end = normalized.indexOf("\n---", 4);
  if (end === -1) {
    // Starts with "---" but never closes: this is treated as plain content
    // with no frontmatter, not as a truncated or invalid block.
    return { data: {}, body: normalized };
  }
  const after = normalized.indexOf("\n", end + 4);
  const block = normalized.slice(4, end);
  const body = after === -1 ? "" : normalized.slice(after + 1);
  const data: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const match = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (!match) {
      continue;
    }
    let value = match[2]!.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    data[match[1]!] = value;
  }
  return { data, body };
}
