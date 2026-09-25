# Jobsmith Core Milestone 4 (Intake): Tasks 1 to 4

Part of the Milestone 4 plan. Read `README.md` first: it holds the goal, the global constraints
and the Contract (called "the README" in the task text below) that these tasks follow. These four
tasks build the pure intake layer everything else in the milestone sits on: constants and text
normalization, the fetch guard that is the only outbound HTTP path for intake, HTML-to-markdown
and JSON-LD extraction for a fetched page, and the three ATS vendor adapters.

Every name, signature, constant, error code and copy string below is copied character for
character from `README.md`'s Contract. A Sonnet builder implementing one of these tasks sees only
that task's own text, so each one restates the props, copy and risks it needs rather than pointing
back at an earlier task's prose.

---

### Task 1: Intake values, text normalization and dedupe hashing

**Files:**
- Create: `lib/intake/values.ts`, `lib/intake/text.ts`, `lib/intake/dedupe.ts`, `tests/unit/intake-text.test.ts`, `tests/unit/intake-dedupe.test.ts`

**Interfaces:**
- Consumes: `WorkMode` from `lib/pipeline/values.ts` (Milestone 2, unmodified). `companyNameKey` from `lib/companies/name-key.ts` (Milestone 2, unmodified). Nothing else: this task is the foundation everything else in the milestone imports from.
- Produces (copied from the README's Contract character for character):

```typescript
// lib/intake/values.ts (imports only WorkMode from lib/pipeline/values)
export const MIN_POSTING_TEXT = 600;
export const MAX_POSTING_CHARS = 100_000;
export const MAX_ARTICLE_HTML = 300_000;
export const MAX_LINK_CHARS = 2_048;
export const NEEDS_TEXT_REASONS = ["login_required", "blocked", "timeout", "too_large", "not_found", "too_short", "unreadable", "fetch_failed"] as const;
export type NeedsTextReason = (typeof NEEDS_TEXT_REASONS)[number];
export const EXTRACTIONS = ["ats", "json_ld", "ai", "ai_off", "ai_failed", "ai_incomplete"] as const;
export type Extraction = (typeof EXTRACTIONS)[number];
export const VIAS = ["greenhouse", "ashby", "lever", "page", "text"] as const;
export type Via = (typeof VIAS)[number];
export type AtsVendor = "greenhouse" | "ashby" | "lever";
export type PostingFields = { companyName: string | null; roleTitle: string | null; location: string | null; workMode: WorkMode | null; compMin: number | null; compMax: number | null; compCurrency: string | null };
export const EMPTY_FIELDS: PostingFields;               // every field null
export const LOGIN_WALLED_HOSTS = ["linkedin.com"] as const;
export function isLoginWalled(url: URL): boolean;       // host equal to an entry or ending in "." + entry
export function needsReviewFor(extraction: Extraction): boolean;   // ai_off, ai_failed, ai_incomplete
// lib/intake/text.ts
export function textToMarkdown(text: string): string;   // D16 rules below, cut to MAX_POSTING_CHARS
export function visibleTextLength(markdown: string): number;   // D14
// lib/intake/dedupe.ts (pure; imports companyNameKey)
export type DedupeParts = { companyName: string; roleTitle: string; location?: string | null };
export function normalizeForDedupe(value: string | null | undefined): string;
export function dedupeBasis(parts: DedupeParts): string;   // "northwindtraders|senior product designer|rotterdam nl"
export function dedupeHash(parts: DedupeParts): string;    // 64 hex characters
```

`textToMarkdown` rules (D16, verified in the spike): strip a leading BOM; CRLF and lone CR to LF;
no-break space and tab to a plain space; trailing whitespace trimmed per line; a line starting
with optional spaces then one of `• ● ▪ ◦ · ‣ ∙ * – — -` and whitespace becomes `- <rest>`; `N.` or
`N)` (1 to 3 digits) becomes `N. <rest>`; consecutive list lines stay on adjacent lines (no blank
line forced between them); every other non-blank line becomes its own paragraph (blank line
between it and its neighbors); runs of blank lines collapse to one; the result is trimmed, then
cut to `MAX_POSTING_CHARS`. Applying it twice never changes the output further (idempotent).

`visibleTextLength` (D14): markdown punctuation `` #*_>`-[]()!| `` becomes spaces, whitespace runs
collapse to one space, the result is trimmed, and its length is returned.

`dedupeBasis`/`dedupeHash` (D9): the basis is `companyNameKey(companyName) + "|" + norm(roleTitle)
+ "|" + norm(location ?? "")`, where `norm` is `normalizeForDedupe`: NFKD-normalize, strip
combining marks, lowercase, turn `&` into `" and "`, turn every run of characters that are not a
Unicode letter or digit into one space, trim. The hash is the sha256 hex digest of the basis
string, encoded as UTF-8.

- [ ] **Step 1: Write `lib/intake/values.ts` in full**

```typescript
import type { WorkMode } from "@/lib/pipeline/values";

export const MIN_POSTING_TEXT = 600;
export const MAX_POSTING_CHARS = 100_000;
export const MAX_ARTICLE_HTML = 300_000;
export const MAX_LINK_CHARS = 2_048;

export const NEEDS_TEXT_REASONS = [
  "login_required",
  "blocked",
  "timeout",
  "too_large",
  "not_found",
  "too_short",
  "unreadable",
  "fetch_failed",
] as const;
export type NeedsTextReason = (typeof NEEDS_TEXT_REASONS)[number];

export const EXTRACTIONS = ["ats", "json_ld", "ai", "ai_off", "ai_failed", "ai_incomplete"] as const;
export type Extraction = (typeof EXTRACTIONS)[number];

export const VIAS = ["greenhouse", "ashby", "lever", "page", "text"] as const;
export type Via = (typeof VIAS)[number];

export type AtsVendor = "greenhouse" | "ashby" | "lever";

export type PostingFields = {
  companyName: string | null;
  roleTitle: string | null;
  location: string | null;
  workMode: WorkMode | null;
  compMin: number | null;
  compMax: number | null;
  compCurrency: string | null;
};

export const EMPTY_FIELDS: PostingFields = {
  companyName: null,
  roleTitle: null,
  location: null,
  workMode: null,
  compMin: null,
  compMax: null,
  compCurrency: null,
};

export const LOGIN_WALLED_HOSTS = ["linkedin.com"] as const;

export function isLoginWalled(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return LOGIN_WALLED_HOSTS.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

export function needsReviewFor(extraction: Extraction): boolean {
  return extraction === "ai_off" || extraction === "ai_failed" || extraction === "ai_incomplete";
}
```

This file has no failing-test-first step of its own: it is constants plus two one-line functions,
and both functions are exercised below by `tests/unit/intake-dedupe.test.ts` (the README places
`isLoginWalled`'s test there). `needsReviewFor` is exercised directly by Part B's `resolvePosting`
tests; nothing in Part A calls it in isolation, so it gets no dedicated assertion here.

- [ ] **Step 2: Write the failing test `tests/unit/intake-text.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { textToMarkdown, visibleTextLength } from "@/lib/intake/text";
import { MAX_POSTING_CHARS } from "@/lib/intake/values";

describe("textToMarkdown", () => {
  it("strips a leading BOM", () => {
    expect(textToMarkdown("﻿Hello world")).toBe("Hello world");
  });

  it("turns CRLF into LF, and gives each line its own paragraph", () => {
    expect(textToMarkdown("Line one\r\nLine two")).toBe("Line one\n\nLine two");
  });

  it("turns a lone CR into LF the same way", () => {
    expect(textToMarkdown("Line one\rLine two")).toBe("Line one\n\nLine two");
  });

  it("turns a no-break space into a regular space", () => {
    expect(textToMarkdown("Hello world")).toBe("Hello world");
  });

  it("turns a tab into a regular space", () => {
    expect(textToMarkdown("Hello\tworld")).toBe("Hello world");
  });

  it("trims trailing whitespace from a line before deciding whether it is blank", () => {
    expect(textToMarkdown("Hello   \nWorld  ")).toBe("Hello\n\nWorld");
  });

  const bulletGlyphs = ["•", "●", "▪", "◦", "·", "‣", "∙", "*", "–", "—", "-"];
  it.each(bulletGlyphs)("turns a %s bullet into a - list item", (glyph) => {
    expect(textToMarkdown(`${glyph} Item one`)).toBe("- Item one");
  });

  it("turns 'N)' and 'N.' (up to three digits) into 'N. ', keeping adjacent items on adjacent lines", () => {
    expect(textToMarkdown("1) First\n2) Second")).toBe("1. First\n2. Second");
    expect(textToMarkdown("123. Item")).toBe("123. Item");
  });

  it("gives every other non-blank line its own paragraph, separated by a blank line", () => {
    expect(textToMarkdown("First line\nSecond line\nThird line")).toBe("First line\n\nSecond line\n\nThird line");
  });

  it("collapses runs of blank lines to a single blank line", () => {
    expect(textToMarkdown("First\n\n\n\nSecond")).toBe("First\n\nSecond");
  });

  it("keeps a list's own items adjacent to each other, but separate from the paragraphs around it", () => {
    // This is the case the list-adjacency branch exists for: without it,
    // "- one" and "- two" would each become their own paragraph instead of
    // staying together as one list.
    expect(textToMarkdown("Intro\n- one\n- two\nOutro")).toBe("Intro\n\n- one\n- two\n\nOutro");
  });

  it("is idempotent: running it again on its own output changes nothing", () => {
    const inputs = [
      "﻿Hello world",
      "Line one\r\nLine two",
      "1) First\n2) Second",
      "First line\nSecond line\nThird line",
      "Intro\n- one\n- two\nOutro",
    ];
    for (const input of inputs) {
      const once = textToMarkdown(input);
      expect(textToMarkdown(once)).toBe(once);
    }
  });

  it("cuts the result to MAX_POSTING_CHARS", () => {
    const huge = "x".repeat(200_000);
    const result = textToMarkdown(huge);
    expect(result.length).toBe(MAX_POSTING_CHARS);
    expect(result).toBe("x".repeat(MAX_POSTING_CHARS));
  });
});

describe("visibleTextLength", () => {
  it("treats markdown punctuation as whitespace and counts what is left", () => {
    expect(visibleTextLength("## A\n\n- b")).toBe(3);
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/unit/intake-text.test.ts
```

Expected: fails with `Cannot find module '@/lib/intake/text'` (the file does not exist yet).

- [ ] **Step 4: Write `lib/intake/text.ts` in full**

```typescript
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
```

- [ ] **Step 5: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/intake-text.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 24 passed (24)` (6 individual `textToMarkdown` cases + 11
`it.each` bullet-glyph cases + 6 more `textToMarkdown` cases + 1 `visibleTextLength` case).

- [ ] **Step 6: Mutation check: the list-adjacency branch**

In `lib/intake/text.ts`, change:

```typescript
      out.push(inList ? item : `\n${item}`);
```

to:

```typescript
      out.push(`\n${item}`);
```

(dropping the `inList` check, so every list item always starts its own paragraph). Run:

```bash
pnpm exec vitest run tests/unit/intake-text.test.ts
```

Expected: two tests fail - `"turns 'N)' and 'N.' (up to three digits) into 'N. ', keeping adjacent
items on adjacent lines"` (now produces `"1. First\n\n2. Second"` instead of `"1. First\n2.
Second"`) and `"keeps a list's own items adjacent to each other, but separate from the paragraphs
around it"` (now produces `"Intro\n\n- one\n\n- two\n\nOutro"` instead of `"Intro\n\n- one\n-
two\n\nOutro"`). Revert the change and rerun to confirm all 24 tests pass again.

- [ ] **Step 7: Write the failing test `tests/unit/intake-dedupe.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { dedupeBasis, dedupeHash, normalizeForDedupe } from "@/lib/intake/dedupe";
import { isLoginWalled } from "@/lib/intake/values";

describe("dedupeBasis", () => {
  it("normalizes the company through companyNameKey and the role/location through normalizeForDedupe", () => {
    expect(
      dedupeBasis({ companyName: "Northwind Traders, Inc.", roleTitle: "  Senior  Product Designer ", location: "Rotterdam, NL" }),
    ).toBe("northwindtraders|senior product designer|rotterdam nl");
  });

  it("uses an empty location segment when location is missing or null", () => {
    expect(dedupeBasis({ companyName: "Northwind Traders", roleTitle: "Designer" })).toBe("northwindtraders|designer|");
    expect(dedupeBasis({ companyName: "Northwind Traders", roleTitle: "Designer", location: null })).toBe("northwindtraders|designer|");
  });
});

describe("dedupeHash", () => {
  it("is the sha256 hex digest of the basis string, computed here rather than pasted", () => {
    const parts = { companyName: "Northwind Traders", roleTitle: "Designer" };
    expect(dedupeHash(parts)).toBe(createHash("sha256").update(dedupeBasis(parts), "utf8").digest("hex"));
  });

  it("is 64 hex characters long", () => {
    expect(dedupeHash({ companyName: "A", roleTitle: "B" })).toHaveLength(64);
  });

  it("gives four differently-punctuated, differently-cased equivalent inputs the same hash", () => {
    const equivalent = [
      { companyName: "Northwind Traders", roleTitle: "Product Designer", location: "Berlin" },
      { companyName: "northwind traders inc", roleTitle: "PRODUCT DESIGNER", location: " berlin " },
      { companyName: "Northwind Traders", roleTitle: "Product-Designer", location: "Berlin." },
      { companyName: "Nörthwind Traders", roleTitle: "Product Designer", location: "Berlin" },
    ];
    const hashes = new Set(equivalent.map(dedupeHash));
    expect(hashes.size).toBe(1);
  });

  it("changes when the location changes", () => {
    const base = { companyName: "Northwind Traders", roleTitle: "Product Designer" };
    expect(dedupeHash({ ...base, location: "Berlin" })).not.toBe(dedupeHash({ ...base, location: "Lisbon" }));
  });

  it("treats a missing location the same as an empty one", () => {
    const base = { companyName: "Northwind Traders", roleTitle: "Designer" };
    expect(dedupeHash(base)).toBe(dedupeHash({ ...base, location: "" }));
  });
});

describe("normalizeForDedupe", () => {
  it("turns & into ' and '", () => {
    expect(normalizeForDedupe("R&D")).toBe("r and d");
  });
});

describe("isLoginWalled", () => {
  it("is true for linkedin.com and for a subdomain of it", () => {
    expect(isLoginWalled(new URL("https://www.linkedin.com/jobs/view/1"))).toBe(true);
    expect(isLoginWalled(new URL("https://linkedin.com/jobs/view/1"))).toBe(true);
  });

  it("is false for a host that merely contains linkedin.com as a substring", () => {
    expect(isLoginWalled(new URL("https://notlinkedin.com/jobs/view/1"))).toBe(false);
  });
});
```

- [ ] **Step 8: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/unit/intake-dedupe.test.ts
```

Expected: fails with `Cannot find module '@/lib/intake/dedupe'` (the file does not exist yet).

- [ ] **Step 9: Write `lib/intake/dedupe.ts` in full**

```typescript
import { createHash } from "node:crypto";
import { companyNameKey } from "@/lib/companies/name-key";

export type DedupeParts = { companyName: string; roleTitle: string; location?: string | null };

export function normalizeForDedupe(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function dedupeBasis(parts: DedupeParts): string {
  return [companyNameKey(parts.companyName), normalizeForDedupe(parts.roleTitle), normalizeForDedupe(parts.location)].join("|");
}

export function dedupeHash(parts: DedupeParts): string {
  return createHash("sha256").update(dedupeBasis(parts), "utf8").digest("hex");
}
```

- [ ] **Step 10: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/intake-dedupe.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 10 passed (10)` (2 `dedupeBasis` + 5 `dedupeHash` + 1
`normalizeForDedupe` + 2 `isLoginWalled`).

- [ ] **Step 11: Mutation check: plain lowercasing instead of `companyNameKey`**

In `lib/intake/dedupe.ts`, change `dedupeBasis` from:

```typescript
  return [companyNameKey(parts.companyName), normalizeForDedupe(parts.roleTitle), normalizeForDedupe(parts.location)].join("|");
```

to:

```typescript
  return [parts.companyName.toLowerCase(), normalizeForDedupe(parts.roleTitle), normalizeForDedupe(parts.location)].join("|");
```

Run:

```bash
pnpm exec vitest run tests/unit/intake-dedupe.test.ts
```

Expected: `"gives four differently-punctuated, differently-cased equivalent inputs the same hash"`
fails - the set of hashes now has more than one member (`"northwind traders inc"` keeps its `inc`
suffix without `companyNameKey`'s legal-suffix stripping, so it no longer matches the others).
Revert the change and rerun to confirm all 10 tests pass again.

- [ ] **Step 12: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Expected: all three exit 0, with `pnpm test` reporting every existing test still passing alongside
the 34 new ones.

- [ ] **Step 13: Commit**

```bash
git add lib/intake/values.ts lib/intake/text.ts lib/intake/dedupe.ts tests/unit/intake-text.test.ts tests/unit/intake-dedupe.test.ts
git commit -m "$(cat <<'EOF'
feat: add intake values, text-to-markdown and dedupe hashing

EOF
)"
```

End the message with the co-author trailer supplied by the executing session.

---

### Task 2: The address policy and the fetch guard

**Files:**
- Create: `lib/intake/address-policy.ts`, `lib/intake/fetch-guard.ts`, `tests/unit/address-policy.test.ts`, `tests/unit/fetch-guard.test.ts`
- Modify: `package.json` (adds `ipaddr.js`), `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `Result`, `ok`, `fail` from `lib/result.ts` (Milestone 1, unmodified: `type Result<T, C extends string = string> = { ok: true; data: T } | { ok: false; code: C; message: string }`). Nothing from Task 1: this task is self-contained - `lib/intake/fetch-guard.ts` is the only code in the whole milestone that makes an outbound HTTP request for intake (Global Constraints).
- Produces (copied from the README's Contract character for character):

```typescript
// address-policy.ts
export type AddressPolicy = { allowAddress(address: string): boolean; allowPort(port: number): boolean };
export function isPublicAddress(address: string): boolean;   // ipaddr.isValid, then ipaddr.process(address).range() === "unicast"
export const DEFAULT_POLICY: AddressPolicy;                   // isPublicAddress; ports 80 and 443
// fetch-guard.ts
export const FETCH_TIMEOUT_MS = 8_000;
export const FETCH_MAX_BYTES = 2 * 1024 * 1024;
export const FETCH_MAX_REDIRECTS = 3;
export const FETCH_FAILURES = ["invalid_url", "blocked_scheme", "blocked_port", "blocked_address", "dns_failed", "too_many_redirects", "timeout", "too_large", "unsupported_type", "not_found", "http_error", "network_error"] as const;
export type FetchFailure = (typeof FETCH_FAILURES)[number];
export type ResolveHost = (hostname: string) => Promise<{ address: string; family: 4 | 6 }[]>;
export type GuardOptions = { accept: "html" | "json"; method?: "GET" | "POST"; body?: string; headers?: Record<string, string>; signal?: AbortSignal; timeoutMs?: number; maxBytes?: number; maxRedirects?: number; resolveHost?: ResolveHost; policy?: AddressPolicy };
export type GuardedResponse = { url: string; status: number; contentType: "html" | "json"; body: string; redirects: number };
export type GuardedFetch = (url: string, options: GuardOptions) => Promise<Result<GuardedResponse, FetchFailure>>;
export const guardedFetch: GuardedFetch;
```

Order per hop (D10): parse the URL (`URL.canParse`, else `invalid_url`); scheme must be `http:` or
`https:` (else `blocked_scheme`); no username/password in the URL (else `invalid_url`);
`policy.allowPort` on the effective port (else `blocked_port`); an address literal (brackets
stripped) is checked against `policy.allowAddress` right here, because Node's own connection layer
skips the `lookup` hook entirely for a literal IP host - nothing else would ever check it (else
`blocked_address`); the request runs with a pinned `lookup` hook that resolves the host, refuses
the request when any answer is disallowed (`blocked_address`) or when the resolver fails or
returns nothing (`dns_failed`), and hands the socket exactly the checked address (no DNS-rebinding
window; TLS still verifies the hostname); a 3xx with `Location`: POST gives `http_error`, a 4th
redirect gives `too_many_redirects`, an unparseable `Location` gives `invalid_url`, a relative
`Location` resolves against the current URL; 404 and 410 give `not_found`; any other non-2xx gives
`http_error`; a content type that does not match `accept` gives `unsupported_type`, as does an
unrecognized `content-encoding`; a declared `Content-Length` over the cap is refused before
reading; the byte cap is counted on decoded bytes (after gzip/deflate/br decompression); the
timeout (checked first in the catch) gives `timeout`; anything else gives `network_error`.

- [ ] **Step 1: Install `ipaddr.js`**

```bash
pnpm add ipaddr.js@2.5.0
```

Expected: `package.json`'s `dependencies` gains exactly this one entry (alphabetically between
`drizzle-orm` and `lucide-react`), and `pnpm-lock.yaml` updates. `ipaddr.js` ships its own
TypeScript types (`lib/ipaddr.d.ts`), so no `@types` package is needed.

- [ ] **Step 2: Write the failing test `tests/unit/address-policy.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { isPublicAddress } from "@/lib/intake/address-policy";

describe("isPublicAddress", () => {
  const table: Array<[string, boolean]> = [
    ["93.184.216.34", true],
    ["8.8.8.8", true],
    ["2606:4700:4700::1111", true],
    ["127.0.0.1", false],
    ["127.255.255.254", false],
    ["10.1.2.3", false],
    ["172.16.0.1", false],
    ["172.31.255.255", false],
    ["172.32.0.1", true],
    ["192.168.1.1", false],
    ["169.254.169.254", false],
    ["100.64.0.1", false],
    ["0.0.0.0", false],
    ["255.255.255.255", false],
    ["224.0.0.1", false],
    ["192.0.2.1", false],
    ["198.18.0.1", false],
    ["::1", false],
    ["::", false],
    ["fe80::1", false],
    ["fc00::1", false],
    ["fd12:3456::1", false],
    ["ff02::1", false],
    ["::ffff:127.0.0.1", false],
    ["::ffff:7f00:1", false],
    ["::ffff:10.0.0.1", false],
    ["::ffff:169.254.169.254", false],
    ["::ffff:8.8.8.8", true],
    ["64:ff9b::7f00:1", false],
    ["2002:7f00:1::", false],
    ["2001:db8::1", false],
    ["2001::1", false],
    ["fec0::1", false],
    ["not-an-ip", false],
  ];

  it.each(table)("%s", (address, expected) => {
    expect(isPublicAddress(address)).toBe(expected);
  });
});
```

This table covers: ordinary public IPv4 and IPv6; loopback (both ends of `127.0.0.0/8`);
RFC1918 private ranges and their boundary (`172.31.255.255` blocked, `172.32.0.1` allowed);
link-local; CGNAT (`100.64.0.0/10`); unspecified and broadcast; multicast; documentation ranges
(`192.0.2.0/24`, `198.18.0.0/15`); IPv6 loopback, unspecified, link-local, unique-local and
multicast; IPv4-mapped IPv6 forms of loopback/private/link-local (blocked) and of a public address
(allowed, `::ffff:8.8.8.8`); NAT64 (`64:ff9b::/96`); 6to4 (`2002::/16`); IPv6 documentation
(`2001:db8::/32`); Teredo (`2001::/32`); a deprecated site-local range (`fec0::/10`); and a
non-address string.

- [ ] **Step 3: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/unit/address-policy.test.ts
```

Expected: fails with `Cannot find module '@/lib/intake/address-policy'`.

- [ ] **Step 4: Write `lib/intake/address-policy.ts` in full**

```typescript
import ipaddr from "ipaddr.js";

export type AddressPolicy = { allowAddress(address: string): boolean; allowPort(port: number): boolean };

export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  // process() unwraps an IPv4-mapped IPv6 address (::ffff:a.b.c.d) into the
  // plain IPv4 address it carries, so the range check below sees the real
  // address either way.
  return ipaddr.process(address).range() === "unicast";
}

export const DEFAULT_POLICY: AddressPolicy = {
  allowAddress: isPublicAddress,
  allowPort: (port) => port === 80 || port === 443,
};
```

- [ ] **Step 5: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/address-policy.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 34 passed (34)`.

- [ ] **Step 6: Write the failing test `tests/unit/fetch-guard.test.ts`**

```typescript
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import zlib from "node:zlib";
import { guardedFetch, type ResolveHost } from "@/lib/intake/fetch-guard";
import { isPublicAddress, type AddressPolicy } from "@/lib/intake/address-policy";

describe("guardedFetch", () => {
  const hits: Record<string, number> = {};
  const hostHeaders: string[] = [];
  const bigBody = "x".repeat(3 * 1024 * 1024);
  const bomb = zlib.gzipSync(Buffer.alloc(10 * 1024 * 1024, 0x61));
  const smallHtml = `<html><body><p>${"Posting text. ".repeat(80)}</p></body></html>`;

  let server: http.Server;
  let port: number;
  let base: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const route = (req.url ?? "/").split("?")[0]!;
      hits[route] = (hits[route] ?? 0) + 1;
      hostHeaders.push(String(req.headers.host));
      const redirectMatch = /^\/redirect\/(\d+)$/.exec(route);
      if (redirectMatch) {
        const n = Number(redirectMatch[1]);
        res.writeHead(302, { location: n === 0 ? "/html" : `/redirect/${n - 1}` });
        res.end();
        return;
      }
      switch (route) {
        case "/html":
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          res.end(smallHtml);
          return;
        case "/json":
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
          return;
        case "/problem-json":
          res.writeHead(200, { "content-type": "application/problem+json" });
          res.end("{}");
          return;
        case "/text":
          res.writeHead(200, { "content-type": "text/plain" });
          res.end("plain");
          return;
        case "/notype":
          res.writeHead(200);
          res.end("<html></html>");
          return;
        case "/relative":
          res.writeHead(301, { location: "html" });
          res.end();
          return;
        case "/to-private":
          res.writeHead(302, { location: "http://10.0.0.1/" });
          res.end();
          return;
        case "/to-evil-name":
          res.writeHead(302, { location: `http://evil.test:${port}/html` });
          res.end();
          return;
        case "/to-ftp":
          res.writeHead(302, { location: "ftp://example.org/file" });
          res.end();
          return;
        case "/hang":
          return;
        case "/drip": {
          res.writeHead(200, { "content-type": "text/html" });
          const timer = setInterval(() => res.write("a"), 100);
          req.on("close", () => clearInterval(timer));
          return;
        }
        case "/big-length":
          res.writeHead(200, { "content-type": "text/html", "content-length": String(bigBody.length) });
          res.end(bigBody);
          return;
        case "/big-chunked":
          res.writeHead(200, { "content-type": "text/html" });
          res.end(bigBody);
          return;
        case "/gzip-bomb":
          res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
          res.end(bomb);
          return;
        case "/gzip-ok":
          res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
          res.end(zlib.gzipSync(smallHtml));
          return;
        case "/br-ok":
          res.writeHead(200, { "content-type": "text/html", "content-encoding": "br" });
          res.end(zlib.brotliCompressSync(smallHtml));
          return;
        case "/latin1":
          res.writeHead(200, { "content-type": "text/html; charset=iso-8859-1" });
          res.end(Buffer.from([0x63, 0x61, 0x66, 0xe9]));
          return;
        case "/404":
          res.writeHead(404, { "content-type": "text/html" });
          res.end("gone");
          return;
        case "/500":
          res.writeHead(500, { "content-type": "text/html" });
          res.end("boom");
          return;
        case "/post": {
          let body = "";
          req.on("data", (c) => (body += c));
          req.on("end", () => {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ method: req.method, body }));
          });
          return;
        }
        case "/post-redirect":
          res.writeHead(307, { location: "/post" });
          res.end();
          return;
        default:
          res.writeHead(404);
          res.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as { port: number }).port;
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(() => {
    server.close();
    server.closeAllConnections();
  });

  const loopbackOk: AddressPolicy = { allowAddress: (a) => a === "127.0.0.1" || isPublicAddress(a), allowPort: () => true };
  const names: Record<string, string[]> = {
    "public.test": ["127.0.0.1"],
    "evil.test": ["10.1.2.3"],
    "mixed.test": ["127.0.0.1", "10.0.0.9"],
  };
  const resolveHost: ResolveHost = async (hostname) => {
    const list = names[hostname];
    if (!list) throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
    return list.map((address) => ({ address, family: (address.includes(":") ? 6 : 4) as 4 | 6 }));
  };
  const t = { policy: loopbackOk, resolveHost };
  const code = (r: Awaited<ReturnType<typeof guardedFetch>>) => (r.ok ? `ok:${r.data.contentType}:${r.data.redirects}` : r.code);

  describe("default policy (no policy option given)", () => {
    it("blocks a loopback literal on a non-default port (blocked_port)", async () => {
      const result = await guardedFetch(`${base}/html`, { accept: "html" });
      expect(code(result)).toBe("blocked_port");
    });

    const literalCases: Array<[string, string]> = [
      ["http://127.0.0.1/html", "blocked_address"],
      ["http://localhost/html", "blocked_address"],
      ["http://[::1]/html", "blocked_address"],
      ["http://2130706433/html", "blocked_address"],
      ["http://0x7f.1/html", "blocked_address"],
      ["http://127.1/", "blocked_address"],
      ["http://[::ffff:127.0.0.1]/", "blocked_address"],
      ["http://[::ffff:7f00:1]/", "blocked_address"],
      ["http://169.254.169.254/latest/meta-data/", "blocked_address"],
      ["http://[fe80::1]/", "blocked_address"],
      ["http://[fd00::1]/", "blocked_address"],
    ];
    it.each(literalCases)("blocks the literal address in %s (%s)", async (url, expected) => {
      const result = await guardedFetch(url, { accept: "html" });
      expect(code(result)).toBe(expected);
    });

    const schemeCases: Array<[string, string]> = [
      ["ftp://example.org/", "blocked_scheme"],
      ["file:///etc/passwd", "blocked_scheme"],
      ["javascript:alert(1)", "blocked_scheme"],
    ];
    it.each(schemeCases)("blocks the scheme in %s (%s)", async (url, expected) => {
      const result = await guardedFetch(url, { accept: "html" });
      expect(code(result)).toBe(expected);
    });

    it("rejects credentials in the URL", async () => {
      const result = await guardedFetch("http://user:pw@example.org/", { accept: "html" });
      expect(code(result)).toBe("invalid_url");
    });

    it("rejects a string that is not a URL", async () => {
      const result = await guardedFetch("not a url", { accept: "html" });
      expect(code(result)).toBe("invalid_url");
    });

    it("never contacts the local server for any of the calls above", async () => {
      expect(hits["/html"] ?? 0).toBe(0);
    });
  });

  describe("against the local server, under a test policy that allows loopback", () => {
    it("returns an html body on 200", async () => {
      const result = await guardedFetch(`${base}/html`, { accept: "html", ...t });
      expect(code(result)).toBe("ok:html:0");
    });

    it("returns a json body on 200", async () => {
      const result = await guardedFetch(`${base}/json`, { accept: "json", ...t });
      expect(code(result)).toBe("ok:json:0");
    });

    it("accepts a +json content-type suffix", async () => {
      const result = await guardedFetch(`${base}/problem-json`, { accept: "json", ...t });
      expect(code(result)).toBe("ok:json:0");
    });

    it("rejects json when html was requested", async () => {
      const result = await guardedFetch(`${base}/json`, { accept: "html", ...t });
      expect(code(result)).toBe("unsupported_type");
    });

    it("rejects text/plain when html was requested", async () => {
      const result = await guardedFetch(`${base}/text`, { accept: "html", ...t });
      expect(code(result)).toBe("unsupported_type");
    });

    it("rejects a response with no content-type header", async () => {
      const result = await guardedFetch(`${base}/notype`, { accept: "html", ...t });
      expect(code(result)).toBe("unsupported_type");
    });

    it("follows up to 3 redirects", async () => {
      const result = await guardedFetch(`${base}/redirect/2`, { accept: "html", ...t });
      expect(code(result)).toBe("ok:html:3");
    });

    it("refuses a 4th redirect", async () => {
      const result = await guardedFetch(`${base}/redirect/3`, { accept: "html", ...t });
      expect(code(result)).toBe("too_many_redirects");
    });

    it("resolves a relative redirect Location against the current URL", async () => {
      const result = await guardedFetch(`${base}/relative`, { accept: "html", ...t });
      expect(code(result)).toBe("ok:html:1");
    });

    it("blocks a redirect to a private literal address", async () => {
      const result = await guardedFetch(`${base}/to-private`, { accept: "html", ...t });
      expect(code(result)).toBe("blocked_address");
    });

    it("blocks a redirect to a name that resolves to a private address, and never reaches the target host", async () => {
      const before = hits["/html"] ?? 0;
      const result = await guardedFetch(`${base}/to-evil-name`, { accept: "html", ...t });
      expect(code(result)).toBe("blocked_address");
      expect(hits["/html"] ?? 0).toBe(before);
    });

    it("blocks a redirect to ftp", async () => {
      const result = await guardedFetch(`${base}/to-ftp`, { accept: "html", ...t });
      expect(code(result)).toBe("blocked_scheme");
    });

    it("blocks a name that resolves to one private answer among several", async () => {
      const result = await guardedFetch(`http://mixed.test:${port}/html`, { accept: "html", ...t });
      expect(code(result)).toBe("blocked_address");
    });

    it("gives dns_failed for an unknown name", async () => {
      const result = await guardedFetch(`http://nowhere.test:${port}/html`, { accept: "html", ...t });
      expect(code(result)).toBe("dns_failed");
    });

    it("connects to the resolved address for a pinned name, and keeps the original Host header", async () => {
      hostHeaders.length = 0;
      const result = await guardedFetch(`http://public.test:${port}/html`, { accept: "html", ...t });
      expect(code(result)).toBe("ok:html:0");
      expect(hostHeaders[0]).toBe(`public.test:${port}`);
    });

    it("times out a server that never answers", async () => {
      const started = Date.now();
      const result = await guardedFetch(`${base}/hang`, { accept: "html", timeoutMs: 400, ...t });
      expect(code(result)).toBe("timeout");
      expect(Date.now() - started).toBeLessThan(1200);
    });

    it("times out a server that drips the body forever", async () => {
      const started = Date.now();
      const result = await guardedFetch(`${base}/drip`, { accept: "html", timeoutMs: 500, ...t });
      expect(code(result)).toBe("timeout");
      expect(Date.now() - started).toBeLessThan(1300);
    });

    it("rejects a declared Content-Length over the cap before reading the body", async () => {
      const result = await guardedFetch(`${base}/big-length`, { accept: "html", ...t });
      expect(code(result)).toBe("too_large");
    });

    it("rejects a chunked body over the cap", async () => {
      const result = await guardedFetch(`${base}/big-chunked`, { accept: "html", ...t });
      expect(code(result)).toBe("too_large");
    });

    it("counts the cap on decoded bytes, so a gzip bomb is rejected", async () => {
      const result = await guardedFetch(`${base}/gzip-bomb`, { accept: "html", ...t });
      expect(code(result)).toBe("too_large");
    });

    it("decodes a gzip body", async () => {
      const result = await guardedFetch(`${base}/gzip-ok`, { accept: "html", ...t });
      expect(code(result)).toBe("ok:html:0");
    });

    it("decodes a brotli body", async () => {
      const result = await guardedFetch(`${base}/br-ok`, { accept: "html", ...t });
      expect(code(result)).toBe("ok:html:0");
    });

    it("decodes a non-UTF-8 charset from the content-type header", async () => {
      const result = await guardedFetch(`${base}/latin1`, { accept: "html", ...t });
      expect(result.ok && result.data.body).toBe("café");
    });

    it("gives not_found for a 404", async () => {
      const result = await guardedFetch(`${base}/404`, { accept: "html", ...t });
      expect(code(result)).toBe("not_found");
    });

    it("gives http_error for a 500", async () => {
      const result = await guardedFetch(`${base}/500`, { accept: "html", ...t });
      expect(code(result)).toBe("http_error");
    });

    it("sends a POST body and method through to the server", async () => {
      const result = await guardedFetch(`${base}/post`, { accept: "json", method: "POST", body: '{"q":1}', ...t });
      expect(result.ok && JSON.parse(result.data.body)).toEqual({ method: "POST", body: '{"q":1}' });
    });

    it("never follows a redirect on POST", async () => {
      const result = await guardedFetch(`${base}/post-redirect`, { accept: "json", method: "POST", body: "{}", ...t });
      expect(code(result)).toBe("http_error");
    });

    it("gives network_error when the caller's own signal aborts", async () => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 100);
      const result = await guardedFetch(`${base}/hang`, { accept: "html", signal: controller.signal, ...t });
      expect(code(result)).toBe("network_error");
    });
  });
});
```

- [ ] **Step 7: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/unit/fetch-guard.test.ts
```

Expected: fails with `Cannot find module '@/lib/intake/fetch-guard'`.

- [ ] **Step 8: Write `lib/intake/fetch-guard.ts` in full**

```typescript
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";
import zlib from "node:zlib";
import type { Readable } from "node:stream";
import type { Result } from "@/lib/result";
import { ok, fail } from "@/lib/result";
import { DEFAULT_POLICY, type AddressPolicy } from "./address-policy";

export const FETCH_TIMEOUT_MS = 8_000;
export const FETCH_MAX_BYTES = 2 * 1024 * 1024;
export const FETCH_MAX_REDIRECTS = 3;

export const FETCH_FAILURES = [
  "invalid_url",
  "blocked_scheme",
  "blocked_port",
  "blocked_address",
  "dns_failed",
  "too_many_redirects",
  "timeout",
  "too_large",
  "unsupported_type",
  "not_found",
  "http_error",
  "network_error",
] as const;
export type FetchFailure = (typeof FETCH_FAILURES)[number];

export type ResolveHost = (hostname: string) => Promise<{ address: string; family: 4 | 6 }[]>;

export type GuardOptions = {
  accept: "html" | "json";
  method?: "GET" | "POST";
  body?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  resolveHost?: ResolveHost;
  policy?: AddressPolicy;
};

export type GuardedResponse = { url: string; status: number; contentType: "html" | "json"; body: string; redirects: number };
export type GuardedFetch = (url: string, options: GuardOptions) => Promise<Result<GuardedResponse, FetchFailure>>;

const defaultResolve: ResolveHost = async (hostname) => {
  const rows = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  return rows.map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 }));
};

class GuardError extends Error {
  constructor(readonly code: FetchFailure) {
    super(code);
  }
}

function pinnedLookup(resolveHost: ResolveHost, policy: AddressPolicy): net.LookupFunction {
  return ((hostname: string, options: dns.LookupOptions, callback: (...args: unknown[]) => void) => {
    resolveHost(hostname)
      .then((addresses) => {
        if (addresses.length === 0) throw new GuardError("dns_failed");
        // Every answer must pass: a name that also resolves to a disallowed
        // address is refused outright, even if one of its other answers is
        // fine (otherwise a caller could connect through the one allowed
        // answer while a second, disallowed answer goes unnoticed).
        if (addresses.some((a) => !policy.allowAddress(a.address))) throw new GuardError("blocked_address");
        if (options.all) {
          callback(null, addresses);
        } else {
          const wanted = options.family === 6 ? 6 : options.family === 4 ? 4 : undefined;
          const pick = addresses.find((a) => wanted === undefined || a.family === wanted) ?? addresses[0]!;
          callback(null, pick.address, pick.family);
        }
      })
      .catch((error: unknown) => {
        const coded = error instanceof GuardError ? error : Object.assign(new GuardError("dns_failed"), { cause: error });
        callback(coded, options.all ? [] : "", 4);
      });
  }) as unknown as net.LookupFunction;
}

function mediaType(header: string | undefined): string | null {
  if (!header) return null;
  return header.split(";")[0]!.trim().toLowerCase() || null;
}

function charsetOf(header: string | undefined): string {
  const match = header ? /charset\s*=\s*"?([^";\s]+)"?/i.exec(header) : null;
  return match ? match[1]!.toLowerCase() : "utf-8";
}

function kindOf(type: string | null): "html" | "json" | null {
  if (type === "text/html" || type === "application/xhtml+xml") return "html";
  if (type === "application/json" || (type !== null && /^application\/[a-z0-9.+-]+\+json$/.test(type))) return "json";
  return null;
}

function decoderFor(encoding: string | undefined): (Readable & NodeJS.WritableStream) | null | "unsupported" {
  const value = (encoding ?? "identity").trim().toLowerCase();
  if (value === "identity" || value === "") return null;
  if (value === "gzip" || value === "x-gzip") return zlib.createGunzip();
  if (value === "deflate") return zlib.createInflate();
  if (value === "br") return zlib.createBrotliDecompress();
  return "unsupported";
}

function hostForCheck(url: URL): string {
  return url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
}

function portOf(url: URL): number {
  if (url.port) return Number(url.port);
  return url.protocol === "https:" ? 443 : 80;
}

type Hop = { status: number; location: string | null; type: string | null; charset: string; body: string | null };

function oneHop(url: URL, options: GuardOptions, policy: AddressPolicy, resolveHost: ResolveHost, signal: AbortSignal, maxBytes: number): Promise<Hop> {
  return new Promise<Hop>((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const host = hostForCheck(url);
    const request = client.request(
      {
        protocol: url.protocol,
        hostname: host,
        port: portOf(url),
        path: `${url.pathname}${url.search}`,
        method: options.method ?? "GET",
        agent: false,
        lookup: pinnedLookup(resolveHost, policy),
        signal,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; Jobsmith)",
          accept: options.accept === "json" ? "application/json" : "text/html,application/xhtml+xml",
          "accept-encoding": "gzip, deflate, br",
          ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
          ...options.headers,
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const location = typeof response.headers.location === "string" ? response.headers.location : null;
        const type = mediaType(response.headers["content-type"]);
        const charset = charsetOf(response.headers["content-type"]);
        if ((status >= 300 && status < 400) || status < 200 || status >= 300 || kindOf(type) !== options.accept) {
          response.resume();
          resolve({ status, location, type, charset, body: null });
          return;
        }
        const declared = Number(response.headers["content-length"] ?? NaN);
        if (Number.isFinite(declared) && declared > maxBytes) {
          response.destroy();
          reject(new GuardError("too_large"));
          return;
        }
        const decoder = decoderFor(response.headers["content-encoding"]);
        if (decoder === "unsupported") {
          response.destroy();
          reject(new GuardError("unsupported_type"));
          return;
        }
        const stream: Readable = decoder ? response.pipe(decoder) : response;
        const chunks: Buffer[] = [];
        let total = 0;
        // The cap applies to decoded bytes: counting on `stream` (the output
        // of the decoder, when there is one) rather than the raw `response`
        // is what stops a gzip bomb.
        stream.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > maxBytes) {
            response.destroy();
            if (decoder) decoder.destroy();
            reject(new GuardError("too_large"));
            return;
          }
          chunks.push(chunk);
        });
        stream.on("end", () => {
          let text: string;
          try {
            text = new TextDecoder(charset).decode(Buffer.concat(chunks));
          } catch {
            text = new TextDecoder("utf-8").decode(Buffer.concat(chunks));
          }
          resolve({ status, location, type, charset, body: text });
        });
        stream.on("error", reject);
        response.on("error", reject);
      },
    );
    request.on("error", reject);
    if (options.body !== undefined) request.write(options.body);
    request.end();
  });
}

export const guardedFetch: GuardedFetch = async (rawUrl, options) => {
  const policy = options.policy ?? DEFAULT_POLICY;
  const resolveHost = options.resolveHost ?? defaultResolve;
  const maxRedirects = options.maxRedirects ?? FETCH_MAX_REDIRECTS;
  const maxBytes = options.maxBytes ?? FETCH_MAX_BYTES;
  const timeout = AbortSignal.timeout(options.timeoutMs ?? FETCH_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;

  if (!URL.canParse(rawUrl)) return fail("invalid_url", "invalid_url");
  let url = new URL(rawUrl);
  let redirects = 0;

  for (;;) {
    if (url.protocol !== "http:" && url.protocol !== "https:") return fail("blocked_scheme", "blocked_scheme");
    if (url.username || url.password) return fail("invalid_url", "invalid_url");
    if (!policy.allowPort(portOf(url))) return fail("blocked_port", "blocked_port");
    const host = hostForCheck(url);
    // An address literal never reaches the lookup hook (Node's own
    // connection logic skips DNS resolution when the hostname is already an
    // IP), so it is checked here instead, before any connection is made.
    if (net.isIP(host) !== 0 && !policy.allowAddress(host)) return fail("blocked_address", "blocked_address");

    let hop: Hop;
    try {
      hop = await oneHop(url, options, policy, resolveHost, signal, maxBytes);
    } catch (error) {
      if (timeout.aborted) return fail("timeout", "timeout");
      if (error instanceof GuardError) return fail(error.code, error.code);
      return fail("network_error", "network_error");
    }

    if (hop.status >= 300 && hop.status < 400 && hop.location) {
      if ((options.method ?? "GET") !== "GET") return fail("http_error", "http_error");
      if (redirects >= maxRedirects) return fail("too_many_redirects", "too_many_redirects");
      if (!URL.canParse(hop.location, url)) return fail("invalid_url", "invalid_url");
      url = new URL(hop.location, url);
      redirects += 1;
      continue;
    }
    if (hop.status === 404 || hop.status === 410) return fail("not_found", "not_found");
    if (hop.status < 200 || hop.status >= 300) return fail("http_error", "http_error");
    const kind = kindOf(hop.type);
    if (kind === null || kind !== options.accept || hop.body === null) return fail("unsupported_type", "unsupported_type");
    return ok({ url: url.toString(), status: hop.status, contentType: kind, body: hop.body, redirects });
  }
};
```

Failure messages equal the code itself (`fail(code, code)`): they are never shown to a user, who
sees `NEEDS_TEXT_MESSAGES` instead (Part B).

- [ ] **Step 9: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/fetch-guard.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 46 passed (46)` (6 individual + 11 `it.each` literal
cases + 3 `it.each` scheme cases in "default policy", 28 individual cases against the local
server).

- [ ] **Step 10: Mutation check: remove the address-literal pre-check**

In `lib/intake/fetch-guard.ts`, delete these two lines from inside the `for (;;)` loop of
`guardedFetch` (keep `hostForCheck` itself; only this call site goes):

```typescript
    const host = hostForCheck(url);
    if (net.isIP(host) !== 0 && !policy.allowAddress(host)) return fail("blocked_address", "blocked_address");
```

Run:

```bash
pnpm exec vitest run tests/unit/fetch-guard.test.ts
```

Expected: 11 failures - every case in the `"blocks the literal address in %s (%s)"` `it.each`
table now reports `network_error` or `timeout` instead of `blocked_address` (Node's connection
layer skips the `lookup` hook entirely for a literal IP host, so nothing but this pre-check ever
protected against one). Revert the deletion and rerun to confirm all 46 tests pass again.

- [ ] **Step 11: Mutation check: skip the policy check inside the lookup hook**

In `pinnedLookup`, delete this line:

```typescript
        if (addresses.some((a) => !policy.allowAddress(a.address))) throw new GuardError("blocked_address");
```

Run:

```bash
pnpm exec vitest run tests/unit/fetch-guard.test.ts
```

Expected: 3 failures. `"blocks a name that resolves to one private answer among several"` now
succeeds (`ok:html:0`) - this is the clearest proof the check matters: `mixed.test` resolves to
both `127.0.0.1` (our own local server) and `10.0.0.9`, and without this check Node simply connects
through the one allowed answer, never noticing the other disallowed one. `"blocks a redirect to a
name that resolves to a private address..."` now times out instead of returning `blocked_address`
(it actually attempts to reach the unreachable private address). The `"http://localhost/html"`
case inside the default-policy `it.each` table also flips, from `blocked_address` to
`network_error` (nothing listens on port 80 locally). Revert the deletion and rerun to confirm all
46 tests pass again.

- [ ] **Step 12: Mutation check: count bytes before decoding**

In the `oneHop` function, change the byte-counting `stream.on("data", ...)` listener to attach to
the raw `response` instead of the (possibly decoded) `stream`, so the cap is checked before
decompression:

```typescript
        const stream: Readable = decoder ? response.pipe(decoder) : response;
        const chunks: Buffer[] = [];
        let total = 0;
        response.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > maxBytes) {
            response.destroy();
            if (decoder) decoder.destroy();
            reject(new GuardError("too_large"));
            return;
          }
        });
        stream.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });
```

Run:

```bash
pnpm exec vitest run tests/unit/fetch-guard.test.ts
```

Expected: `"counts the cap on decoded bytes, so a gzip bomb is rejected"` fails, now returning
`ok:html:0` instead of `too_large` - 10 MB of the repeated byte `0x61` compresses to only a few KB
on the wire, well under the 2 MiB cap, so counting the pre-decode bytes never catches it. Revert
the change (restore the original single `stream.on("data", ...)` listener that both counts and
collects `chunks`) and rerun to confirm all 46 tests pass again.

- [ ] **Step 13: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Expected: all three exit 0, with `pnpm test` reporting every existing test still passing alongside
the 80 new ones (34 + 46).

- [ ] **Step 14: Commit**

```bash
git add lib/intake/address-policy.ts lib/intake/fetch-guard.ts tests/unit/address-policy.test.ts tests/unit/fetch-guard.test.ts package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat: add the address policy and the fetch guard

EOF
)"
```

End the message with the co-author trailer supplied by the executing session.

---

### Task 3: Readable pages: HTML to markdown, JSON-LD, Readability

**Files:**
- Create: `lib/intake/html.ts`, `lib/intake/json-ld.ts`, `lib/intake/readable.ts`, `tests/unit/intake-html.test.ts`, `tests/unit/json-ld.test.ts`, `tests/unit/intake-readable.test.ts`, `tests/fixtures/intake/job-page.html`, `tests/fixtures/intake/job-page-no-jsonld.html`, `tests/fixtures/intake/login-wall.html`
- Modify: `next.config.ts` (insert `serverExternalPackages` after line 3), `package.json` (adds `@mozilla/readability`, `linkedom`, `turndown`, dev `@types/turndown`), `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `MAX_ARTICLE_HTML`, `MAX_POSTING_CHARS`, `MIN_POSTING_TEXT` from `lib/intake/values.ts`
  (Task 1). `visibleTextLength` from `lib/intake/text.ts` (Task 1). Nothing from Task 2.
- Produces (copied from the README's Contract character for character):

```typescript
// lib/intake/html.ts
export function tidyMarkdown(markdown: string): string;
export function htmlToMarkdown(html: string): string;        // cuts html to MAX_ARTICLE_HTML first
export function decodeIfEncoded(html: string): string;       // decode once only when there is no tag and there is "&lt;"
// lib/intake/json-ld.ts
export type JsonLdPosting = { companyName: string | null; roleTitle: string | null; location: string | null; workMode: "remote" | null; bodyMd: string | null };
export function jobPostingFromJsonLd(document: Document): JsonLdPosting | null;   // first JobPosting in any ld+json script, arrays and @graph walked; location "Locality, Region, Country" per place joined with "; "; TELECOMMUTE means remote
// lib/intake/readable.ts
export type ReadablePage = { bodyMd: string; textLength: number; jsonLd: JsonLdPosting | null };
export function readablePage(html: string): ReadablePage;
```

D13 (verified in the spike, on the fixtures this task writes): linkedom parses the html; JSON-LD is
read *before* Readability runs, because Readability strips every `<script>` as part of its own
cleanup; `Readability` runs with `charThreshold: 200` and picks the article, falling back to
`document.body`'s HTML when it finds nothing; turndown converts to markdown with `headingStyle:
"atx"`, `bulletListMarker: "-"`, `codeBlockStyle: "fenced"`, `emDelimiter: "_"`,
`strongDelimiter: "**"`, and removes `script, style, noscript, iframe, form, button, svg, img,
picture, video, audio, canvas, input, select, textarea, template`; list markers are tidied to one
space after the marker. The article HTML is cut to `MAX_ARTICLE_HTML` (300,000 characters) before
turndown runs on it (a 1.9 MB article took 4.6 s uncapped; capped, about 150 ms), and the resulting
body markdown is cut to `MAX_POSTING_CHARS`. When the page's JSON-LD `JobPosting` has a
`description` whose visible length is at least `MIN_POSTING_TEXT` (600), that description supplies
the body instead of the Readability-parsed article (a spec addition: with company and role also
present, this lets `resolvePosting` in Part B resolve with no model call).

- [ ] **Step 1: Install the HTML-processing packages**

```bash
pnpm add @mozilla/readability@0.6.0 linkedom@0.18.13 turndown@7.2.4
pnpm add -D @types/turndown@5.0.6
```

Expected: `package.json`'s `dependencies` gains `@mozilla/readability`, `linkedom` and `turndown`
(alphabetically among the existing list - `@mozilla/readability` sits with the other `@...`
packages, before `better-auth`; `linkedom` between `ipaddr.js` and `lucide-react`; `turndown`
between `tsx` and `tw-animate-css`), its `devDependencies` gains `@types/turndown` (between
`@types/react-dom` and `@vercel/config`), and `pnpm-lock.yaml` updates. No other dependency version
changes.

- [ ] **Step 2: Add `serverExternalPackages` to `next.config.ts` (D27)**

`turndown` ships a browser build and `linkedom` an optional `canvas` require; without this, Next
would try to bundle them for the server instead of requiring them at runtime, and the bundler can
choose the wrong build or choke on the optional require. Edit `next.config.ts` so the object
literal reads:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // turndown ships a browser build and linkedom an optional `canvas` require;
  // this makes Next require them at runtime instead of bundling them, so the
  // bundler never has to choose between turndown's builds or resolve an
  // optional native dependency linkedom does not actually need here.
  serverExternalPackages: ["linkedom", "turndown", "@mozilla/readability"],
  experimental: {
    serverActions: {
      // The default 1 MB would reject a document near the 1 MiB artifact
      // limit (MAX_ARTIFACT_BYTES, lib/bridge/wire.ts) once multipart
      // form-data overhead is added on top of the field's own bytes.
      bodySizeLimit: "2mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Blocks this app from being framed by any site at all, including
          // its own origin: there is no legitimate reason to embed it, and
          // this is the modern replacement for X-Frame-Options.
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          // Sends the full URL as a referrer only on same-origin navigation;
          // cross-origin navigation gets the origin alone, and downgrading
          // to a plain HTTP destination gets nothing.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Stops a browser from guessing a response's type from its
          // content and executing it as something other than what the
          // Content-Type header says.
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
```

Only the new `serverExternalPackages` line (and its comment) changed; `experimental` and
`headers()` are untouched.

- [ ] **Step 3: Write the failing test `tests/unit/intake-html.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { htmlToMarkdown, decodeIfEncoded } from "@/lib/intake/html";
import { MAX_ARTICLE_HTML } from "@/lib/intake/values";

describe("htmlToMarkdown", () => {
  it("turns h1/h2 into atx headings", () => {
    expect(htmlToMarkdown("<h1>Title</h1><h2>Sub</h2>")).toBe("# Title\n\n## Sub");
  });

  it("turns <ul> into - list items", () => {
    expect(htmlToMarkdown("<ul><li>One</li><li>Two</li></ul>")).toBe("- One\n- Two");
  });

  it("turns <ol> into numbered list items", () => {
    expect(htmlToMarkdown("<ol><li>First</li><li>Second</li></ol>")).toBe("1. First\n2. Second");
  });

  it("keeps <strong> as ** bold **", () => {
    expect(htmlToMarkdown("<p>Keep <strong>this</strong> word.</p>")).toBe("Keep **this** word.");
  });

  it("removes script, style, img and form content, keeping the surrounding text", () => {
    const html = "<p>Visible</p><script>bad()</script><style>.a{}</style><img src=x><form><input></form>";
    expect(htmlToMarkdown(html)).toBe("Visible");
  });

  it("cuts the html to MAX_ARTICLE_HTML before converting, so content past the cut never appears", () => {
    const filler = "<p>filler text here. </p>";
    const repeatCount = Math.ceil((MAX_ARTICLE_HTML + 50_000) / filler.length);
    const html = `<div>${filler.repeat(repeatCount)}<p>zzMARKERBEYONDCUTzz</p></div>`;
    expect(html.length).toBeGreaterThan(MAX_ARTICLE_HTML);
    expect(htmlToMarkdown(html)).not.toContain("zzMARKERBEYONDCUTzz");
  });
});

describe("decodeIfEncoded", () => {
  it("decodes HTML that was entity-encoded (Greenhouse's content field)", () => {
    const original = "<h2>What you will do</h2><p>Ship weekly.</p>";
    const encoded = original.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    expect(decodeIfEncoded(encoded)).toContain("<h2>What you will do</h2>");
  });

  it("leaves real HTML (containing a tag) alone, even if it also has an entity", () => {
    expect(decodeIfEncoded("<p>a &amp; b</p>")).toBe("<p>a &amp; b</p>");
  });
});
```

- [ ] **Step 4: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/unit/intake-html.test.ts
```

Expected: fails with `Cannot find module '@/lib/intake/html'`.

- [ ] **Step 5: Write `lib/intake/html.ts` in full**

```typescript
import TurndownService from "turndown";
import { parseHTML } from "linkedom";
import { MAX_ARTICLE_HTML } from "./values";

function turndown(): TurndownService {
  const service = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "_",
    strongDelimiter: "**",
  });
  service.remove([
    "script",
    "style",
    "noscript",
    "iframe",
    "form",
    "button",
    "svg",
    "picture",
    "video",
    "audio",
    "canvas",
    "input",
    "select",
    "textarea",
    "template",
  ]);
  // turndown 7.2.4 ships a built-in default rule for "img" (one of the
  // handful of tags with a first-class commonmark rule), and that default
  // rule is checked before the .remove() list above, so .remove(["img"])
  // alone has no effect: an <img> would still turn into markdown image
  // syntax. This explicit rule replaces it with nothing, actually dropping
  // it (verified: without this rule, "<img src=x>" survives as "![](x)").
  service.addRule("img", { filter: "img", replacement: () => "" });
  return service;
}

export function tidyMarkdown(markdown: string): string {
  return markdown
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/^(\s*)-\s{2,}/gm, "$1- ")
    .replace(/^(\s*\d+\.)\s{2,}/gm, "$1 ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function htmlToMarkdown(html: string): string {
  return tidyMarkdown(turndown().turndown(html.slice(0, MAX_ARTICLE_HTML)));
}

export function decodeIfEncoded(html: string): string {
  if (/<[a-z!/]/i.test(html) || !/&lt;/i.test(html)) return html;
  const { document } = parseHTML("<!doctype html><html><body><div id=x></div></body></html>");
  const div = document.getElementById("x")!;
  div.innerHTML = html;
  return div.textContent ?? "";
}
```

The README's Adjustments section records the `img` rule as a departure from D13's plain
`.remove([..., "img", ...])`; the reasoning is above.

- [ ] **Step 6: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/intake-html.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 8 passed (8)` (6 `htmlToMarkdown` + 2
`decodeIfEncoded`).

- [ ] **Step 7: Mutation check: remove the `MAX_ARTICLE_HTML` cut**

In `lib/intake/html.ts`, change `htmlToMarkdown` from:

```typescript
  return tidyMarkdown(turndown().turndown(html.slice(0, MAX_ARTICLE_HTML)));
```

to:

```typescript
  return tidyMarkdown(turndown().turndown(html));
```

Run:

```bash
pnpm exec vitest run tests/unit/intake-html.test.ts
```

Expected: `"cuts the html to MAX_ARTICLE_HTML before converting, so content past the cut never
appears"` fails - the marker text beyond the cut point now appears in the output. Revert the
change and rerun to confirm all 8 tests pass again.

- [ ] **Step 8: Write the failing test `tests/unit/json-ld.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { parseHTML } from "linkedom";
import { jobPostingFromJsonLd } from "@/lib/intake/json-ld";

function docOf(html: string): Document {
  return parseHTML(html).document as unknown as Document;
}

describe("jobPostingFromJsonLd", () => {
  it("returns null when there is no ld+json script at all", () => {
    expect(jobPostingFromJsonLd(docOf("<html><body></body></html>"))).toBeNull();
  });

  it("finds a JobPosting nested inside an @graph array", () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Organization", name: "Northwind Traders" },
        { "@type": "JobPosting", title: "Product Designer", hiringOrganization: { "@type": "Organization", name: "Northwind Traders" } },
      ],
    })}</script></head><body></body></html>`;
    const result = jobPostingFromJsonLd(docOf(html));
    expect(result?.roleTitle).toBe("Product Designer");
    expect(result?.companyName).toBe("Northwind Traders");
  });

  it("matches a JobPosting whose @type is an array of types", () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@type": ["Thing", "JobPosting"],
      title: "Array Type Role",
    })}</script></head><body></body></html>`;
    expect(jobPostingFromJsonLd(docOf(html))?.roleTitle).toBe("Array Type Role");
  });

  it("reads hiringOrganization given as a plain string", () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting",
      title: "R",
      hiringOrganization: "Acme Inc",
    })}</script></head><body></body></html>`;
    expect(jobPostingFromJsonLd(docOf(html))?.companyName).toBe("Acme Inc");
  });

  it("joins multiple jobLocation places with a semicolon", () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting",
      title: "R",
      jobLocation: [
        { "@type": "Place", address: { addressLocality: "Rotterdam", addressCountry: "NL" } },
        { "@type": "Place", address: { addressLocality: "Berlin", addressCountry: "DE" } },
      ],
    })}</script></head><body></body></html>`;
    expect(jobPostingFromJsonLd(docOf(html))?.location).toBe("Rotterdam, NL; Berlin, DE");
  });

  it("maps jobLocationType TELECOMMUTE to workMode remote, and anything else to null", () => {
    const remoteHtml = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting",
      title: "R",
      jobLocationType: "TELECOMMUTE",
    })}</script></head><body></body></html>`;
    const onsiteHtml = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting",
      title: "R",
    })}</script></head><body></body></html>`;
    expect(jobPostingFromJsonLd(docOf(remoteHtml))?.workMode).toBe("remote");
    expect(jobPostingFromJsonLd(docOf(onsiteHtml))?.workMode).toBeNull();
  });

  it("skips a script with invalid JSON and reads the next one instead", () => {
    const html = `<html><head>
<script type="application/ld+json">{not valid json</script>
<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "Role Two" })}</script>
</head><body></body></html>`;
    expect(jobPostingFromJsonLd(docOf(html))?.roleTitle).toBe("Role Two");
  });
});
```

- [ ] **Step 9: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/unit/json-ld.test.ts
```

Expected: fails with `Cannot find module '@/lib/intake/json-ld'`.

- [ ] **Step 10: Write `lib/intake/json-ld.ts` in full**

```typescript
import { htmlToMarkdown, decodeIfEncoded } from "./html";

export type JsonLdPosting = {
  companyName: string | null;
  roleTitle: string | null;
  location: string | null;
  workMode: "remote" | null;
  bodyMd: string | null;
};

function textOf(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object" && "name" in value && typeof (value as { name: unknown }).name === "string") {
    return (value as { name: string }).name.trim() || null;
  }
  return null;
}

function locationOf(value: unknown): string | null {
  const places = Array.isArray(value) ? value : value ? [value] : [];
  const labels: string[] = [];
  for (const place of places) {
    const address = (place as { address?: unknown })?.address;
    if (typeof address === "string") {
      labels.push(address.trim());
      continue;
    }
    if (address && typeof address === "object") {
      const a = address as Record<string, unknown>;
      const parts = [textOf(a.addressLocality), textOf(a.addressRegion), textOf(a.addressCountry)].filter((p): p is string => Boolean(p));
      const unique = parts.filter((p, i) => parts.indexOf(p) === i);
      if (unique.length > 0) labels.push(unique.join(", "));
    }
  }
  const unique = labels.filter((l, i) => l && labels.indexOf(l) === i);
  return unique.length > 0 ? unique.join("; ") : null;
}

function isJobPosting(node: unknown): node is Record<string, unknown> {
  if (!node || typeof node !== "object") return false;
  const type = (node as { "@type"?: unknown })["@type"];
  return type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
}

function* walk(node: unknown): Generator<unknown> {
  if (Array.isArray(node)) {
    for (const item of node) yield* walk(item);
    return;
  }
  if (node && typeof node === "object") {
    yield node;
    const graph = (node as { "@graph"?: unknown })["@graph"];
    if (graph) yield* walk(graph);
  }
}

export function jobPostingFromJsonLd(document: Document): JsonLdPosting | null {
  for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    let data: unknown;
    try {
      data = JSON.parse(script.textContent ?? "");
    } catch {
      continue;
    }
    for (const node of walk(data)) {
      if (!isJobPosting(node)) continue;
      const description = typeof node.description === "string" ? htmlToMarkdown(decodeIfEncoded(node.description)) : null;
      return {
        companyName: textOf(node.hiringOrganization),
        roleTitle: textOf(node.title),
        location: locationOf(node.jobLocation),
        workMode: node.jobLocationType === "TELECOMMUTE" ? "remote" : null,
        bodyMd: description,
      };
    }
  }
  return null;
}
```

- [ ] **Step 11: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/json-ld.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 7 passed (7)`.

- [ ] **Step 12: Write the three fixtures under `tests/fixtures/intake/`**

`job-page.html`:

```html
<!doctype html><html><head><title>Product Designer - Northwind Traders</title>
<style>.x{color:red}</style>
<script>window.tracking = "should never appear";</script>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Northwind Traders"},{"@type":"JobPosting","title":"Product Designer, Warehouse Tools","hiringOrganization":{"@type":"Organization","name":"Northwind Traders"},"jobLocation":[{"@type":"Place","address":{"@type":"PostalAddress","addressLocality":"Rotterdam","addressCountry":"NL"}}],"jobLocationType":"TELECOMMUTE","description":"\n  <h1>Product Designer, Warehouse Tools</h1>\n  <p>We are looking for a designer who enjoys working on internal tools and talks with the people who use them every week. We are looking for a designer who enjoys working on internal tools and talks with the people who use them every week. </p>\n  <h2>What you will do</h2>\n  <ul><li>Run discovery with the floor teams.</li><li>Ship design changes <strong>every week</strong>.</li><li>Keep the design system in step.</li></ul>\n  <h2>What you bring</h2>\n  <ol><li>Four or more years in product design.</li><li>A portfolio with shipped work.</li></ol>\n  <p>We are looking for a designer who enjoys working on internal tools and talks with the people who use them every week. We are looking for a designer who enjoys working on internal tools and talks with the people who use them every week. </p>"}]}</script></head>
<body>
<header><nav><a href="/">Home</a><a href="/jobs">Jobs</a><a href="/about">About us</a></nav></header>
<div class="cookie">We use cookies. <button>Accept all</button></div>
<main><article>
  <h1>Product Designer, Warehouse Tools</h1>
  <p>We are looking for a designer who enjoys working on internal tools and talks with the people who use them every week. We are looking for a designer who enjoys working on internal tools and talks with the people who use them every week. </p>
  <h2>What you will do</h2>
  <ul><li>Run discovery with the floor teams.</li><li>Ship design changes <strong>every week</strong>.</li><li>Keep the design system in step.</li></ul>
  <h2>What you bring</h2>
  <ol><li>Four or more years in product design.</li><li>A portfolio with shipped work.</li></ol>
  <p>We are looking for a designer who enjoys working on internal tools and talks with the people who use them every week. We are looking for a designer who enjoys working on internal tools and talks with the people who use them every week. </p><p><a href="https://example.org/apply">Apply now</a></p></article></main>
<footer><p>Northwind Traders. All rights reserved.</p><form><input name=email><button>Subscribe</button></form></footer>
</body></html>
```

`job-page-no-jsonld.html` (the same page with the `ld+json` script removed):

```html
<!doctype html><html><head><title>Product Designer - Northwind Traders</title>
<style>.x{color:red}</style>
<script>window.tracking = "should never appear";</script>
</head>
<body>
<header><nav><a href="/">Home</a><a href="/jobs">Jobs</a><a href="/about">About us</a></nav></header>
<div class="cookie">We use cookies. <button>Accept all</button></div>
<main><article>
  <h1>Product Designer, Warehouse Tools</h1>
  <p>We are looking for a designer who enjoys working on internal tools and talks with the people who use them every week. We are looking for a designer who enjoys working on internal tools and talks with the people who use them every week. </p>
  <h2>What you will do</h2>
  <ul><li>Run discovery with the floor teams.</li><li>Ship design changes <strong>every week</strong>.</li><li>Keep the design system in step.</li></ul>
  <h2>What you bring</h2>
  <ol><li>Four or more years in product design.</li><li>A portfolio with shipped work.</li></ol>
  <p>We are looking for a designer who enjoys working on internal tools and talks with the people who use them every week. We are looking for a designer who enjoys working on internal tools and talks with the people who use them every week. </p><p><a href="https://example.org/apply">Apply now</a></p></article></main>
<footer><p>Northwind Traders. All rights reserved.</p><form><input name=email><button>Subscribe</button></form></footer>
</body></html>
```

`login-wall.html`:

```html
<!doctype html><html><body><main><h1>Sign in to see this job</h1><p>Join now to see who you already know.</p></main></body></html>
```

- [ ] **Step 13: Write the failing test `tests/unit/intake-readable.test.ts`**

`readFixture` does not exist yet (Task 4 adds it); this test reads its own fixtures directly.

```typescript
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { readablePage } from "@/lib/intake/readable";
import { MIN_POSTING_TEXT } from "@/lib/intake/values";

function readFixture(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), "tests/fixtures/intake", name), "utf-8");
}

describe("readablePage", () => {
  it("reads company, role and work mode from JSON-LD on job-page.html", () => {
    const result = readablePage(readFixture("job-page.html"));
    expect(result.jsonLd).not.toBeNull();
    expect(result.jsonLd?.companyName).toBe("Northwind Traders");
    expect(result.jsonLd?.roleTitle).toBe("Product Designer, Warehouse Tools");
    expect(result.jsonLd?.workMode).toBe("remote");
  });

  it("has at least MIN_POSTING_TEXT visible characters of body on job-page.html", () => {
    const result = readablePage(readFixture("job-page.html"));
    expect(result.textLength).toBeGreaterThanOrEqual(MIN_POSTING_TEXT);
  });

  it("finds no JSON-LD and falls back to Readability on job-page-no-jsonld.html", () => {
    const result = readablePage(readFixture("job-page-no-jsonld.html"));
    expect(result.jsonLd).toBeNull();
    expect(result.bodyMd).toContain("## What you will do");
  });

  it("drops the nav, the cookie banner and the footer form on job-page-no-jsonld.html", () => {
    const result = readablePage(readFixture("job-page-no-jsonld.html"));
    expect(result.bodyMd).not.toContain("About us");
    expect(result.bodyMd).not.toContain("Accept all");
    expect(result.bodyMd).not.toContain("Subscribe");
  });

  it("keeps the apply link as markdown on job-page-no-jsonld.html", () => {
    const result = readablePage(readFixture("job-page-no-jsonld.html"));
    expect(result.bodyMd).toContain("[Apply now](https://example.org/apply)");
  });

  it("is under MIN_POSTING_TEXT visible characters on the login wall", () => {
    const result = readablePage(readFixture("login-wall.html"));
    expect(result.textLength).toBeLessThan(MIN_POSTING_TEXT);
  });
});
```

- [ ] **Step 14: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/unit/intake-readable.test.ts
```

Expected: fails with `Cannot find module '@/lib/intake/readable'`.

- [ ] **Step 15: Write `lib/intake/readable.ts` in full**

```typescript
import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import { htmlToMarkdown } from "./html";
import { jobPostingFromJsonLd, type JsonLdPosting } from "./json-ld";
import { visibleTextLength } from "./text";
import { MIN_POSTING_TEXT, MAX_POSTING_CHARS } from "./values";

export type ReadablePage = { bodyMd: string; textLength: number; jsonLd: JsonLdPosting | null };

export function readablePage(html: string): ReadablePage {
  const { document } = parseHTML(html);
  // JSON-LD first: Readability strips every <script> as part of its own
  // cleanup, so reading it afterward would always find nothing.
  const jsonLd = jobPostingFromJsonLd(document as unknown as Document);
  const article = new Readability(document as unknown as Document, { charThreshold: 200 }).parse();
  const fallbackHtml = (document as unknown as Document).body?.innerHTML ?? "";
  const articleMd = htmlToMarkdown(article?.content ?? fallbackHtml);
  const preferJsonLd = jsonLd?.bodyMd && visibleTextLength(jsonLd.bodyMd) >= MIN_POSTING_TEXT;
  const bodyMd = (preferJsonLd ? jsonLd!.bodyMd! : articleMd).slice(0, MAX_POSTING_CHARS);
  return { bodyMd, textLength: visibleTextLength(bodyMd), jsonLd };
}
```

- [ ] **Step 16: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/intake-readable.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 6 passed (6)`.

- [ ] **Step 17: Mutation check: run Readability before reading JSON-LD**

In `lib/intake/readable.ts`, swap the order so `Readability` runs first:

```typescript
  const { document } = parseHTML(html);
  const article = new Readability(document as unknown as Document, { charThreshold: 200 }).parse();
  const jsonLd = jobPostingFromJsonLd(document as unknown as Document);
```

Run:

```bash
pnpm exec vitest run tests/unit/intake-readable.test.ts
```

Expected: `"reads company, role and work mode from JSON-LD on job-page.html"` fails -
`result.jsonLd` is now `null`, because `Readability.parse()` mutates the document and strips its
`<script>` tags before `jobPostingFromJsonLd` gets to read them. Revert the order and rerun to
confirm all 6 tests pass again.

- [ ] **Step 18: Confirm `pnpm build` passes (D27)**

```bash
pnpm build
```

Expected: exits 0. This is the one check in the milestone that a real Next.js build can load
`linkedom`, `turndown` and `@mozilla/readability` as `serverExternalPackages` without a bundling
error (D27 was unverified at planning time).

- [ ] **Step 19: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Expected: all three exit 0, with `pnpm test` reporting every existing test still passing alongside
the 21 new ones (8 + 7 + 6).

- [ ] **Step 20: Commit**

```bash
git add lib/intake/html.ts lib/intake/json-ld.ts lib/intake/readable.ts tests/unit/intake-html.test.ts tests/unit/json-ld.test.ts tests/unit/intake-readable.test.ts tests/fixtures/intake/job-page.html tests/fixtures/intake/job-page-no-jsonld.html tests/fixtures/intake/login-wall.html next.config.ts package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat: add readable-page extraction from HTML and JSON-LD

EOF
)"
```

End the message with the co-author trailer supplied by the executing session.

---

### Task 4: ATS adapters for Greenhouse, Lever, Ashby

**Files:**
- Create: `lib/intake/ats/match.ts`, `lib/intake/ats/greenhouse.ts`, `lib/intake/ats/lever.ts`, `lib/intake/ats/ashby.ts`, `lib/intake/ats/index.ts`, `tests/unit/ats-match.test.ts`, `tests/unit/ats-adapters.test.ts`, `tests/fixtures/intake/greenhouse-job.json`, `tests/fixtures/intake/lever-posting.json`, `tests/fixtures/intake/ashby-posting.json`, `tests/helpers/intake.ts`

**Interfaces:**
- Consumes: `AtsVendor` from `lib/intake/values.ts` (Task 1). `WorkMode` from `lib/pipeline/values.ts`
  (Milestone 2, unmodified). `htmlToMarkdown`, `decodeIfEncoded` from `lib/intake/html.ts` (Task 3).
  `GuardedFetch`, `FetchFailure`, `GuardOptions` from `lib/intake/fetch-guard.ts` (Task 2). `Result`,
  `ok`, `fail` from `lib/result.ts` (Milestone 1, unmodified).
- Produces (copied from the README's Contract character for character):

```typescript
// lib/intake/ats/match.ts
export type AtsRef = { kind: AtsVendor; org: string; jobId: string; region: "us" | "eu" };
export function matchAtsUrl(raw: string): AtsRef | null;
export function atsApiRequest(ref: AtsRef): { url: string; method: "GET" | "POST"; body?: string };
export function titleFromSlug(slug: string): string;          // "northwind-traders" to "Northwind Traders"
export function workModeFromText(text: string | null | undefined): WorkMode | null;   // hybrid, then remote, then on-site/onsite/in office
// lib/intake/ats/{greenhouse,lever,ashby}.ts: each exports its Zod response schema and
export type AtsPosting = { companyName: string; companyFromSlug: boolean; roleTitle: string; location: string | null; workMode: WorkMode | null; bodyMd: string };
export function mapGreenhouse(ref: AtsRef, json: unknown): AtsPosting | null;   // likewise mapLever, mapAshby; null when the shape or title is missing
// lib/intake/ats/index.ts
export async function fetchAtsPosting(ref: AtsRef, fetch: GuardedFetch, signal?: AbortSignal): Promise<Result<AtsPosting, FetchFailure | "unreadable">>;
```

`AtsPosting` is defined once, in `match.ts` (alongside `AtsRef`, since both are shared by all three
vendor files), and each vendor file re-exports it (`export type { AtsPosting } from "./match";`),
matching "each exports ... `AtsPosting`" while keeping one definition. Vendor schemas are lenient
(`nullish` everywhere except the title, `z.string().trim().min(1)`); invalid JSON or a null mapping
is `unreadable` (D12).

Host matching is exact, never by substring (D12): Greenhouse `boards.greenhouse.io`,
`job-boards.greenhouse.io` and their `.eu.` forms with `/<board>/jobs/<digits>` or
`/embed/job_app?for=<board>&token=<digits>`; Lever `jobs.lever.co` and `jobs.eu.lever.co` with
`/<org>/<uuid>`; Ashby `jobs.ashbyhq.com/<org>/<uuid>` (org URL-decoded). APIs, all through the
guard with `accept: "json"`: Greenhouse `GET https://boards-api[.eu].greenhouse.io/v1/boards/<board>/jobs/<id>`;
Lever `GET https://api[.eu].lever.co/v0/postings/<org>/<id>?mode=json`; Ashby
`POST https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobPosting` with the fixed GraphQL query
body below. Mapping: company from Greenhouse `company_name` or Ashby `organization.name`, else the
slug title-cased (Lever always, `companyFromSlug: true`); work mode from Lever `workplaceType`,
else from the words hybrid/remote/on-site in the location; body markdown (Greenhouse `content`
entity-decoded once; Lever description, then each list as `## <text>` with its items, then
`additional`). No model call anywhere in this task.

- [ ] **Step 1: Write the failing test `tests/unit/ats-match.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { matchAtsUrl, atsApiRequest, titleFromSlug, workModeFromText } from "@/lib/intake/ats/match";

const U = "00000000-0000-4000-8000-000000000001";

describe("matchAtsUrl", () => {
  const cases: Array<[string, unknown]> = [
    ["https://boards.greenhouse.io/northwindtraders/jobs/4000000001", { kind: "greenhouse", org: "northwindtraders", jobId: "4000000001", region: "us" }],
    ["https://job-boards.greenhouse.io/northwindtraders/jobs/4000000001?gh_src=abc#app", { kind: "greenhouse", org: "northwindtraders", jobId: "4000000001", region: "us" }],
    ["https://job-boards.eu.greenhouse.io/northwindtraders/jobs/4000000001", { kind: "greenhouse", org: "northwindtraders", jobId: "4000000001", region: "eu" }],
    ["https://boards.greenhouse.io/embed/job_app?for=northwindtraders&token=4000000001", { kind: "greenhouse", org: "northwindtraders", jobId: "4000000001", region: "us" }],
    ["https://boards.greenhouse.io/northwindtraders", null],
    ["https://boards.greenhouse.io/northwindtraders/jobs/abc", null],
    ["https://evilgreenhouse.io/northwindtraders/jobs/1", null],
    ["https://boards.greenhouse.io.evil.test/northwindtraders/jobs/1", null],
    [`https://jobs.lever.co/northwind-traders/${U}`, { kind: "lever", org: "northwind-traders", jobId: U, region: "us" }],
    [`https://jobs.lever.co/northwind-traders/${U}/apply`, { kind: "lever", org: "northwind-traders", jobId: U, region: "us" }],
    [`https://jobs.eu.lever.co/northwind-traders/${U.toUpperCase()}`, { kind: "lever", org: "northwind-traders", jobId: U, region: "eu" }],
    ["https://jobs.lever.co/northwind-traders", null],
    [`https://jobs.ashbyhq.com/Northwind%20Traders/${U}`, { kind: "ashby", org: "Northwind Traders", jobId: U, region: "us" }],
    [`https://jobs.ashbyhq.com/northwind/${U}/application`, { kind: "ashby", org: "northwind", jobId: U, region: "us" }],
    ["https://jobs.ashbyhq.com/northwind", null],
    ["https://www.linkedin.com/jobs/view/1000000001/", null],
    ["ftp://boards.greenhouse.io/northwindtraders/jobs/1", null],
    ["not a url", null],
  ];

  it.each(cases)("matches %s", (url, expected) => {
    expect(matchAtsUrl(url)).toEqual(expected);
  });
});

describe("atsApiRequest", () => {
  it("builds the Greenhouse GET URL", () => {
    const ref = matchAtsUrl("https://boards.greenhouse.io/northwindtraders/jobs/4000000001")!;
    expect(atsApiRequest(ref).url).toBe("https://boards-api.greenhouse.io/v1/boards/northwindtraders/jobs/4000000001");
  });

  it("builds the EU Greenhouse GET URL", () => {
    const ref = matchAtsUrl("https://job-boards.eu.greenhouse.io/northwindtraders/jobs/4000000001")!;
    expect(atsApiRequest(ref).url).toBe("https://boards-api.eu.greenhouse.io/v1/boards/northwindtraders/jobs/4000000001");
  });

  it("builds the Lever GET URL", () => {
    const ref = matchAtsUrl(`https://jobs.lever.co/northwind-traders/${U}`)!;
    expect(atsApiRequest(ref).url).toBe(`https://api.lever.co/v0/postings/northwind-traders/${U}?mode=json`);
  });

  it("builds a POST for Ashby, with the org and job id in the GraphQL variables", () => {
    const ref = matchAtsUrl(`https://jobs.ashbyhq.com/northwind/${U}`)!;
    const request = atsApiRequest(ref);
    expect(request.method).toBe("POST");
    expect(JSON.parse(request.body!)).toMatchObject({
      operationName: "ApiJobPosting",
      variables: { organizationHostedJobsPageName: "northwind", jobPostingId: U },
    });
  });
});

describe("titleFromSlug", () => {
  it("title-cases a hyphenated slug", () => {
    expect(titleFromSlug("northwind-traders")).toBe("Northwind Traders");
  });
});

describe("workModeFromText", () => {
  it("reads remote, hybrid and onsite from free text, and null when none match", () => {
    expect(workModeFromText("Remote - US")).toBe("remote");
    expect(workModeFromText("Berlin (Hybrid)")).toBe("hybrid");
    expect(workModeFromText("On-site, Lisbon")).toBe("onsite");
    expect(workModeFromText("Berlin")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/unit/ats-match.test.ts
```

Expected: fails with `Cannot find module '@/lib/intake/ats/match'`.

- [ ] **Step 3: Write `lib/intake/ats/match.ts` in full**

```typescript
import type { AtsVendor } from "@/lib/intake/values";
import type { WorkMode } from "@/lib/pipeline/values";

export type AtsRef = { kind: AtsVendor; org: string; jobId: string; region: "us" | "eu" };
export type AtsPosting = {
  companyName: string;
  companyFromSlug: boolean;
  roleTitle: string;
  location: string | null;
  workMode: WorkMode | null;
  bodyMd: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIGITS = /^\d{1,20}$/;
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

export function matchAtsUrl(raw: string): AtsRef | null {
  if (!URL.canParse(raw)) return null;
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p));

  const gh = /^(?:job-boards|boards)(\.eu)?\.greenhouse\.io$/.exec(host);
  if (gh) {
    // /{board}/jobs/{id}
    if (parts.length >= 3 && parts[1] === "jobs" && SLUG.test(parts[0]!) && DIGITS.test(parts[2]!)) {
      return { kind: "greenhouse", org: parts[0]!, jobId: parts[2]!, region: gh[1] ? "eu" : "us" };
    }
    // /embed/job_app?for={board}&token={id}
    const board = url.searchParams.get("for");
    const token = url.searchParams.get("token");
    if (parts[0] === "embed" && board && token && SLUG.test(board) && DIGITS.test(token)) {
      return { kind: "greenhouse", org: board, jobId: token, region: gh[1] ? "eu" : "us" };
    }
    return null;
  }
  const lever = /^jobs(\.eu)?\.lever\.co$/.exec(host);
  if (lever) {
    if (parts.length >= 2 && SLUG.test(parts[0]!) && UUID.test(parts[1]!)) {
      return { kind: "lever", org: parts[0]!, jobId: parts[1]!.toLowerCase(), region: lever[1] ? "eu" : "us" };
    }
    return null;
  }
  if (host === "jobs.ashbyhq.com") {
    if (parts.length >= 2 && parts[0]!.length > 0 && parts[0]!.length <= 100 && UUID.test(parts[1]!)) {
      return { kind: "ashby", org: parts[0]!, jobId: parts[1]!.toLowerCase(), region: "us" };
    }
    return null;
  }
  return null;
}

export function atsApiRequest(ref: AtsRef): { url: string; method: "GET" | "POST"; body?: string } {
  switch (ref.kind) {
    case "greenhouse":
      return {
        url: `https://boards-api${ref.region === "eu" ? ".eu" : ""}.greenhouse.io/v1/boards/${encodeURIComponent(ref.org)}/jobs/${ref.jobId}`,
        method: "GET",
      };
    case "lever":
      return {
        url: `https://api${ref.region === "eu" ? ".eu" : ""}.lever.co/v0/postings/${encodeURIComponent(ref.org)}/${ref.jobId}?mode=json`,
        method: "GET",
      };
    case "ashby":
      return {
        url: "https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobPosting",
        method: "POST",
        body: JSON.stringify({
          operationName: "ApiJobPosting",
          variables: { organizationHostedJobsPageName: ref.org, jobPostingId: ref.jobId },
          query:
            "query ApiJobPosting($organizationHostedJobsPageName: String!, $jobPostingId: String!) { jobPosting(organizationHostedJobsPageName: $organizationHostedJobsPageName, jobPostingId: $jobPostingId) { id title descriptionHtml locationName employmentType compensationTierSummary publishedDate applicationDeadline jobPostingUrl organization { name } } }",
        }),
      };
  }
}

export function titleFromSlug(slug: string): string {
  return slug
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function workModeFromText(text: string | null | undefined): WorkMode | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/\bhybrid\b/.test(t)) return "hybrid";
  if (/\bremote\b/.test(t)) return "remote";
  if (/\b(on-?site|in office|in-office)\b/.test(t)) return "onsite";
  return null;
}
```

- [ ] **Step 4: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/ats-match.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 24 passed (24)` (18 `matchAtsUrl` `it.each` + 4
`atsApiRequest` + 1 `titleFromSlug` + 1 `workModeFromText`).

- [ ] **Step 5: Mutation check: match the Greenhouse host by substring**

In `matchAtsUrl`, change:

```typescript
  const gh = /^(?:job-boards|boards)(\.eu)?\.greenhouse\.io$/.exec(host);
```

to:

```typescript
  const gh = host.includes("greenhouse.io") ? ([host, host.includes(".eu.") ? ".eu" : undefined] as unknown as RegExpExecArray) : null;
```

Run:

```bash
pnpm exec vitest run tests/unit/ats-match.test.ts
```

Expected: two cases in the `matchAtsUrl` `it.each` table fail - `"matches
https://evilgreenhouse.io/northwindtraders/jobs/1"` and `"matches
https://boards.greenhouse.io.evil.test/northwindtraders/jobs/1"` - both now match as Greenhouse
instead of returning `null`. Revert the change and rerun to confirm all 24 tests pass again.

- [ ] **Step 6: Write the three fixtures under `tests/fixtures/intake/`**

`greenhouse-job.json`:

```json
{
  "id": 4000000001,
  "internal_job_id": 4000000000,
  "title": "Senior Product Designer",
  "updated_at": "2026-09-01T10:00:00-04:00",
  "requisition_id": "REQ-1",
  "location": {
    "name": "Rotterdam, Netherlands (Hybrid)"
  },
  "absolute_url": "https://job-boards.greenhouse.io/northwindtraders/jobs/4000000001",
  "language": "en",
  "metadata": null,
  "content": "&lt;h2&gt;About the role&lt;/h2&gt;&lt;p&gt;Northwind Traders builds tools for warehouse teams.&lt;/p&gt;&lt;h2&gt;What you will do&lt;/h2&gt;&lt;ul&gt;&lt;li&gt;Run discovery.&lt;/li&gt;&lt;li&gt;Ship weekly.&lt;/li&gt;&lt;/ul&gt;",
  "departments": [
    {
      "id": 1,
      "name": "Design",
      "child_ids": [],
      "parent_id": null
    }
  ],
  "offices": [
    {
      "id": 1,
      "name": "Rotterdam",
      "location": "Rotterdam, Netherlands",
      "child_ids": [],
      "parent_id": null
    }
  ],
  "company_name": "Northwind Traders"
}
```

`lever-posting.json`:

```json
{
  "id": "00000000-0000-4000-8000-000000000001",
  "text": "Product Designer",
  "hostedUrl": "https://jobs.lever.co/northwind-traders/00000000-0000-4000-8000-000000000001",
  "categories": {
    "commitment": "Full-time",
    "department": "Design",
    "location": "Remote, Europe",
    "team": "Product"
  },
  "description": "<div><b>Northwind Traders</b> builds tools for warehouse teams.</div>",
  "descriptionPlain": "Northwind Traders builds tools for warehouse teams.",
  "lists": [
    {
      "text": "What you will do",
      "content": "<li>Run discovery.</li><li>Ship weekly.</li>"
    },
    {
      "text": "What you bring",
      "content": "<li>A portfolio.</li>"
    }
  ],
  "additional": "<div>We answer every application.</div>",
  "workplaceType": "remote",
  "createdAt": 1767225600000
}
```

`ashby-posting.json`:

```json
{
  "data": {
    "jobPosting": {
      "id": "00000000-0000-4000-8000-000000000001",
      "title": "Design Lead",
      "descriptionHtml": "<p>Lead the design team.</p>",
      "locationName": "Lisbon",
      "organization": {
        "name": "Northwind Traders"
      }
    }
  }
}
```

All three are fictional (Northwind Traders), carry no pay figures and no personal data. `id`s are
zero-padded (`4000000001`) or the fixed UUID `00000000-0000-4000-8000-000000000001`, never a
key-shaped literal built by hand elsewhere.

- [ ] **Step 7: Write `tests/helpers/intake.ts` in full**

```typescript
import fs from "node:fs";
import path from "node:path";
import { ok, fail } from "@/lib/result";
import type { GuardedFetch, GuardOptions, FetchFailure } from "@/lib/intake/fetch-guard";

export function readFixture(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), "tests/fixtures/intake", name), "utf-8");
}

export type FakeRoute = { contentType: "html" | "json"; body: string; status?: number } | FetchFailure;

export function fakeGuardedFetch(routes: Record<string, FakeRoute>): GuardedFetch & { calls: { url: string; options: GuardOptions }[] } {
  const calls: { url: string; options: GuardOptions }[] = [];
  const fetchFn = (async (url: string, options: GuardOptions) => {
    calls.push({ url, options });
    const route = routes[url];
    if (route === undefined) return fail("network_error", "network_error");
    if (typeof route === "string") return fail(route, route);
    return ok({ url, status: route.status ?? 200, contentType: route.contentType, body: route.body, redirects: 0 });
  }) as GuardedFetch & { calls: typeof calls };
  fetchFn.calls = calls;
  return fetchFn;
}
```

`readFixture` reads from `tests/fixtures/intake/` (its "that folder"): a call site passes only the
file's own name, e.g. `readFixture("greenhouse-job.json")`. `fakeGuardedFetch` records every call
it receives and answers a URL that is not in `routes` with `network_error`, exactly like an
unreachable address would.

- [ ] **Step 8: Write the failing test `tests/unit/ats-adapters.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { mapGreenhouse } from "@/lib/intake/ats/greenhouse";
import { mapLever } from "@/lib/intake/ats/lever";
import { mapAshby } from "@/lib/intake/ats/ashby";
import { matchAtsUrl, atsApiRequest } from "@/lib/intake/ats/match";
import { fetchAtsPosting } from "@/lib/intake/ats";
import { readFixture, fakeGuardedFetch } from "../helpers/intake";

const U = "00000000-0000-4000-8000-000000000001";

describe("mapGreenhouse", () => {
  const json = JSON.parse(readFixture("greenhouse-job.json"));
  const ref = matchAtsUrl(json.absolute_url)!;

  it("maps company, role, location and work mode", () => {
    const posting = mapGreenhouse(ref, json);
    expect(posting).toMatchObject({
      companyName: "Northwind Traders",
      companyFromSlug: false,
      roleTitle: "Senior Product Designer",
      location: "Rotterdam, Netherlands (Hybrid)",
      workMode: "hybrid",
    });
  });

  it("decodes the entity-encoded content into markdown", () => {
    const posting = mapGreenhouse(ref, json);
    expect(posting?.bodyMd).toBe(
      "## About the role\n\nNorthwind Traders builds tools for warehouse teams.\n\n## What you will do\n\n- Run discovery.\n- Ship weekly.",
    );
  });

  it("falls back to a title-cased slug when company_name is missing", () => {
    const posting = mapGreenhouse(ref, { ...json, company_name: undefined });
    expect(posting?.companyName).toBe("Northwindtraders");
    expect(posting?.companyFromSlug).toBe(true);
  });

  it("returns null when the title is missing or blank", () => {
    expect(mapGreenhouse(ref, { ...json, title: " " })).toBeNull();
  });
});

describe("mapLever", () => {
  const json = JSON.parse(readFixture("lever-posting.json"));
  const ref = matchAtsUrl(json.hostedUrl)!;

  it("always names the company from the org slug", () => {
    const posting = mapLever(ref, json);
    expect(posting?.companyName).toBe("Northwind Traders");
    expect(posting?.companyFromSlug).toBe(true);
  });

  it("reads work mode from workplaceType", () => {
    expect(mapLever(ref, json)?.workMode).toBe("remote");
  });

  it("builds the body from description, each list as its own section, then additional", () => {
    const posting = mapLever(ref, json);
    expect(posting?.bodyMd).toBe(
      "**Northwind Traders** builds tools for warehouse teams.\n\n## What you will do\n\n- Run discovery.\n- Ship weekly.\n\n## What you bring\n\n- A portfolio.\n\nWe answer every application.",
    );
  });
});

describe("mapAshby", () => {
  const json = JSON.parse(readFixture("ashby-posting.json"));
  const ref = matchAtsUrl(`https://jobs.ashbyhq.com/northwind/${U}`)!;

  it("maps company, role, location and body", () => {
    expect(mapAshby(ref, json)).toMatchObject({
      companyName: "Northwind Traders",
      roleTitle: "Design Lead",
      location: "Lisbon",
      bodyMd: "Lead the design team.",
    });
  });

  it("returns null when jobPosting is null", () => {
    expect(mapAshby(ref, { data: { jobPosting: null } })).toBeNull();
  });
});

describe("fetchAtsPosting", () => {
  it("fetches, parses and maps a Greenhouse posting with accept: json and a GET request", async () => {
    const json = JSON.parse(readFixture("greenhouse-job.json"));
    const ref = matchAtsUrl(json.absolute_url)!;
    const request = atsApiRequest(ref);
    const fetch = fakeGuardedFetch({ [request.url]: { contentType: "json", body: JSON.stringify(json) } });

    const result = await fetchAtsPosting(ref, fetch);

    expect(result.ok && result.data.companyName).toBe("Northwind Traders");
    expect(fetch.calls[0]?.options.accept).toBe("json");
    expect(fetch.calls[0]?.options.method).toBe("GET");
  });

  it("sends the Ashby request as a POST with the GraphQL body", async () => {
    const json = JSON.parse(readFixture("ashby-posting.json"));
    const ref = matchAtsUrl(`https://jobs.ashbyhq.com/northwind/${U}`)!;
    const request = atsApiRequest(ref);
    const fetch = fakeGuardedFetch({ [request.url]: { contentType: "json", body: JSON.stringify(json) } });

    const result = await fetchAtsPosting(ref, fetch);

    expect(result.ok && result.data.roleTitle).toBe("Design Lead");
    expect(fetch.calls[0]?.options.method).toBe("POST");
    expect(fetch.calls[0]?.options.body).toBe(request.body);
  });

  it("passes a guard failure straight through", async () => {
    const json = JSON.parse(readFixture("greenhouse-job.json"));
    const ref = matchAtsUrl(json.absolute_url)!;
    const request = atsApiRequest(ref);
    const fetch = fakeGuardedFetch({ [request.url]: "not_found" });

    const result = await fetchAtsPosting(ref, fetch);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.code).toBe("not_found");
  });

  it("gives unreadable for a body that is not valid JSON", async () => {
    const json = JSON.parse(readFixture("greenhouse-job.json"));
    const ref = matchAtsUrl(json.absolute_url)!;
    const request = atsApiRequest(ref);
    const fetch = fakeGuardedFetch({ [request.url]: { contentType: "json", body: "{not valid" } });

    const result = await fetchAtsPosting(ref, fetch);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.code).toBe("unreadable");
  });

  it("gives unreadable for a payload with no title", async () => {
    const json = JSON.parse(readFixture("greenhouse-job.json"));
    const ref = matchAtsUrl(json.absolute_url)!;
    const request = atsApiRequest(ref);
    const fetch = fakeGuardedFetch({ [request.url]: { contentType: "json", body: JSON.stringify({ ...json, title: " " }) } });

    const result = await fetchAtsPosting(ref, fetch);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.code).toBe("unreadable");
  });
});
```

- [ ] **Step 9: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/unit/ats-adapters.test.ts
```

Expected: fails with `Cannot find module '@/lib/intake/ats/greenhouse'` (none of the four
implementation files exist yet).

- [ ] **Step 10: Write `lib/intake/ats/greenhouse.ts` in full**

```typescript
import { z } from "zod";
import { htmlToMarkdown, decodeIfEncoded } from "@/lib/intake/html";
import { titleFromSlug, workModeFromText, type AtsRef } from "./match";
import type { AtsPosting } from "./match";

export type { AtsPosting } from "./match";

const nonEmpty = z.string().trim().min(1);

export const greenhouseJobSchema = z.object({
  title: nonEmpty,
  content: z.string().default(""),
  location: z.object({ name: z.string().nullish() }).nullish(),
  company_name: z.string().nullish(),
  absolute_url: z.string().nullish(),
});

export function mapGreenhouse(ref: AtsRef, json: unknown): AtsPosting | null {
  const parsed = greenhouseJobSchema.safeParse(json);
  if (!parsed.success) return null;
  const job = parsed.data;
  const company = job.company_name?.trim();
  const location = job.location?.name?.trim() || null;
  return {
    companyName: company || titleFromSlug(ref.org),
    companyFromSlug: !company,
    roleTitle: job.title,
    location,
    workMode: workModeFromText(location),
    bodyMd: htmlToMarkdown(decodeIfEncoded(job.content)),
  };
}
```

- [ ] **Step 11: Write `lib/intake/ats/lever.ts` in full**

```typescript
import { z } from "zod";
import { htmlToMarkdown } from "@/lib/intake/html";
import type { WorkMode } from "@/lib/pipeline/values";
import { titleFromSlug, workModeFromText, type AtsRef } from "./match";
import type { AtsPosting } from "./match";

export type { AtsPosting } from "./match";

const nonEmpty = z.string().trim().min(1);

export const leverPostingSchema = z.object({
  text: nonEmpty,
  description: z.string().nullish(),
  descriptionPlain: z.string().nullish(),
  lists: z.array(z.object({ text: z.string().default(""), content: z.string().default("") })).nullish(),
  additional: z.string().nullish(),
  categories: z.object({ location: z.string().nullish(), commitment: z.string().nullish() }).nullish(),
  workplaceType: z.string().nullish(),
});

export function mapLever(ref: AtsRef, json: unknown): AtsPosting | null {
  const parsed = leverPostingSchema.safeParse(json);
  if (!parsed.success) return null;
  const p = parsed.data;
  const html = [p.description ?? "", ...(p.lists ?? []).map((l) => `<h2>${l.text}</h2><ul>${l.content}</ul>`), p.additional ?? ""].join("\n");
  const location = p.categories?.location?.trim() || null;
  const wt = (p.workplaceType ?? "").toLowerCase();
  const workMode: WorkMode | null =
    wt === "remote" ? "remote" : wt === "hybrid" ? "hybrid" : wt === "onsite" || wt === "on-site" ? "onsite" : workModeFromText(location);
  return {
    companyName: titleFromSlug(ref.org),
    companyFromSlug: true,
    roleTitle: p.text,
    location,
    workMode,
    bodyMd: htmlToMarkdown(html),
  };
}
```

- [ ] **Step 12: Write `lib/intake/ats/ashby.ts` in full**

```typescript
import { z } from "zod";
import { htmlToMarkdown } from "@/lib/intake/html";
import { titleFromSlug, workModeFromText, type AtsRef } from "./match";
import type { AtsPosting } from "./match";

export type { AtsPosting } from "./match";

const nonEmpty = z.string().trim().min(1);

export const ashbyResponseSchema = z.object({
  data: z.object({
    jobPosting: z
      .object({
        title: nonEmpty,
        descriptionHtml: z.string().nullish(),
        locationName: z.string().nullish(),
        organization: z.object({ name: z.string().nullish() }).nullish(),
      })
      .nullable(),
  }),
});

export function mapAshby(ref: AtsRef, json: unknown): AtsPosting | null {
  const parsed = ashbyResponseSchema.safeParse(json);
  if (!parsed.success || !parsed.data.data.jobPosting) return null;
  const p = parsed.data.data.jobPosting;
  const company = p.organization?.name?.trim();
  const location = p.locationName?.trim() || null;
  return {
    companyName: company || titleFromSlug(ref.org),
    companyFromSlug: !company,
    roleTitle: p.title,
    location,
    workMode: workModeFromText(location),
    bodyMd: htmlToMarkdown(p.descriptionHtml ?? ""),
  };
}
```

- [ ] **Step 13: Write `lib/intake/ats/index.ts` in full**

```typescript
import type { Result } from "@/lib/result";
import { ok, fail } from "@/lib/result";
import type { GuardedFetch, FetchFailure } from "@/lib/intake/fetch-guard";
import { atsApiRequest, type AtsRef, type AtsPosting } from "./match";
import { mapGreenhouse } from "./greenhouse";
import { mapLever } from "./lever";
import { mapAshby } from "./ashby";

export async function fetchAtsPosting(
  ref: AtsRef,
  fetch: GuardedFetch,
  signal?: AbortSignal,
): Promise<Result<AtsPosting, FetchFailure | "unreadable">> {
  const request = atsApiRequest(ref);
  const response = await fetch(request.url, { accept: "json", method: request.method, body: request.body, signal });
  if (!response.ok) return fail(response.code, response.message);

  let json: unknown;
  try {
    json = JSON.parse(response.data.body);
  } catch {
    return fail("unreadable", "unreadable");
  }

  const posting =
    ref.kind === "greenhouse" ? mapGreenhouse(ref, json) : ref.kind === "lever" ? mapLever(ref, json) : mapAshby(ref, json);
  if (!posting) return fail("unreadable", "unreadable");
  return ok(posting);
}
```

- [ ] **Step 14: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/ats-adapters.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 14 passed (14)` (4 `mapGreenhouse` + 3 `mapLever` + 2
`mapAshby` + 5 `fetchAtsPosting`).

- [ ] **Step 15: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Expected: all three exit 0, with `pnpm test` reporting every existing test still passing alongside
the 38 new ones (24 + 14).

- [ ] **Step 16: Commit**

```bash
git add lib/intake/ats/match.ts lib/intake/ats/greenhouse.ts lib/intake/ats/lever.ts lib/intake/ats/ashby.ts lib/intake/ats/index.ts tests/unit/ats-match.test.ts tests/unit/ats-adapters.test.ts tests/fixtures/intake/greenhouse-job.json tests/fixtures/intake/lever-posting.json tests/fixtures/intake/ashby-posting.json tests/helpers/intake.ts
git commit -m "$(cat <<'EOF'
feat: add the Greenhouse, Lever and Ashby ATS adapters

EOF
)"
```

End the message with the co-author trailer supplied by the executing session.
