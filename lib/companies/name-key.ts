const LEGAL_SUFFIXES = new Set(["inc", "llc", "ltd", "gmbh", "corp", "co", "plc"]);

export function companyNameKey(name: string): string {
  const normalized = name.normalize("NFKD").toLowerCase().replace(/&/g, "and");
  const cleaned = normalized.replace(/[^\p{L}\p{N}\s]/gu, "");
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1])) {
    words.pop();
  }
  return words.join("");
}
