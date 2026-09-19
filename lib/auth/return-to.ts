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

// Lowercases and drops a single trailing slash, so "/LOGIN" and "/login/"
// both match the same entry in BLOCKED_PATHS as "/login". Never shortens
// the root path itself ("/" stays "/", not "").
function normalizeForBlockedPathCheck(path: string): string {
  const lower = path.toLowerCase();
  return lower.length > 1 && lower.endsWith("/") ? lower.slice(0, -1) : lower;
}

// This function only ever compares literal path strings; it never resolves
// "." or ".." segments. That is safe for the client-side router.push() call
// this feeds (login-form.tsx): Next's client router matches the string
// against known routes rather than resolving dot segments into a different
// one. It would NOT be safe to reuse for a server-side redirect(): an HTTP
// redirect's Location header is resolved by the browser under normal URL
// rules, so a value like "/x/../login" would need its dot segments
// normalized before these checks could reliably block it.
export function safeReturnTo(value: string | null | undefined): string {
  if (!value) return FALLBACK;
  if (hasUnsafeCharacter(value)) return FALLBACK;
  if (!value.startsWith("/") || value.startsWith("//")) return FALLBACK;
  const path = value.split(/[?#]/)[0];
  if (BLOCKED_PATHS.has(normalizeForBlockedPathCheck(path))) return FALLBACK;
  return value;
}
