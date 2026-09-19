const FALLBACK = "/board";
const BLOCKED_PATHS = new Set(["/login", "/setup"]);

// Browsers drop tabs and line breaks inside URLs, so "/\t/evil.example"
// would become "//evil.example". Reject control characters, spaces and
// backslashes before looking at the shape of the path.
function hasUnsafeCharacter(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x20 || code === 0x7f || char === "\\") return true;
  }
  return false;
}

export function safeReturnTo(value: string | null | undefined): string {
  if (!value) return FALLBACK;
  if (hasUnsafeCharacter(value)) return FALLBACK;
  if (!value.startsWith("/") || value.startsWith("//")) return FALLBACK;
  const path = value.split(/[?#]/)[0];
  if (BLOCKED_PATHS.has(path)) return FALLBACK;
  return value;
}
