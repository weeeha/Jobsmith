# Milestone 3 (Bridge): Tasks 5 to 9

Part of the Milestone 3 plan. Read `README.md` first: it holds the goal, the global constraints and the Contract (called "the frame" in the task text below) that these tasks follow, and read `tasks-01-04.md` for the schema, scoped helpers and pure artifact core that these five tasks consume. These five tasks build API tokens, the bridge (its parsing and error core, its three route handlers, and the proxy exclusion that keeps the proxy off the bridge entirely) and the CLI (its core pieces, its four commands, the esbuild bundle, and a fictional interview packet that proves the whole pipeline end to end).

---

### Task 5: API tokens

D5's token format, D3's tenant shape and D4's one-statement rate limiter meet here in one small file. Everything the bridge (Tasks 6 and 7) needs to turn a bearer header into a user id and a request count is produced by this task alone.

**Files:**
- Create: `lib/auth/api-token.ts`, `tests/unit/api-token.test.ts`, `tests/integration/api-token.test.ts`

**Interfaces:**
- Consumes: `Scoped`, `ApiTokenListItem` from `lib/db/scoped` (Task 2). `Db` from `lib/db/client.ts` (Milestone 1). `Result`, `ok`, `fail` from `lib/result.ts` (Milestone 1). `FormStateWith` from `lib/forms/state.ts` (Task 4). `TOKEN_PATTERN` from `lib/bridge/wire.ts` (Task 3). `makeTestDb`, `createTestUser` from `tests/helpers/db.ts`. `scoped` from `lib/db/scoped` (the test file builds its own `Scoped` directly; this task needs no seeding helper and does not touch `seedOneOfEach`).
- Produces (copied from the frame character for character):

```typescript
// TOKEN_PATTERN is imported from @/lib/bridge/wire (the CLI checks it too)
export function generateToken(): { token: string; hash: string; prefix: string };    // randomBytes(32).toString("base64url")
export type TokenFormState = FormStateWith<{ token: string; name: string }>;
export function hashToken(token: string): string;                                  // sha256 hex
export const tokenNameSchema: z.ZodType<string>;                                    // trim, messages under "Validation messages"
export function createApiToken(s: Scoped, name: string): Promise<Result<{ token: string; item: ApiTokenListItem }, "invalid">>;
export function listApiTokens(s: Scoped): Promise<ApiTokenListItem[]>;
export function revokeApiToken(s: Scoped, id: string, now?: Date): Promise<Result<null, "token_not_found">>;   // idempotent
export type BearerAuth = { tokenId: string; userId: string; count: number; windowStart: Date };
export function authenticateBearer(db: Db, token: string, now: Date): Promise<BearerAuth | null>;
```

**Global constraints restated for this task:** `lib/auth/api-token.ts` is the only code that writes `api_token` rows, and it never imports `lib/auth/index.ts` (that file is Better Auth's own session and sign-up wiring; the bridge's bearer check has nothing to do with it, and importing it would pull Better Auth's server setup into a module the CLI's own tests exercise directly). Tests never contain a literal API token; every test that needs one calls `generateToken()` and reads `.token` off the result, so the secret-scan rule (D41) never matches a committed file.

The token's own display prefix (`prefix`, the first 8 characters, e.g. `jsm_AbCd`) is not a secret, and this task's tests print or compare it freely; only the full 47-character token and its raw bytes count as the secret this rule protects.

- [ ] **Step 1: Write the failing unit test for the pure token pieces**

Create `tests/unit/api-token.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { generateToken, hashToken, tokenNameSchema } from "@/lib/auth/api-token";
import { TOKEN_PATTERN } from "@/lib/bridge/wire";

describe("generateToken", () => {
  it("produces a token matching TOKEN_PATTERN, its sha256 hash, and an 8-character prefix", () => {
    const { token, hash, prefix } = generateToken();
    expect(TOKEN_PATTERN.test(token)).toBe(true);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(prefix).toBe(token.slice(0, 8));
    expect(prefix.startsWith("jsm_")).toBe(true);
  });

  it("hashToken(token) reproduces the same hash generateToken already returned", () => {
    const { token, hash } = generateToken();
    expect(hashToken(token)).toBe(hash);
  });

  it("generates 1000 distinct tokens", () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateToken().token));
    expect(tokens.size).toBe(1000);
  });
});

describe("tokenNameSchema", () => {
  it("accepts a normal name and trims surrounding whitespace", () => {
    const result = tokenNameSchema.safeParse("  Laptop  ");
    expect(result).toMatchObject({ success: true, data: "Laptop" });
  });

  it("accepts exactly 60 characters", () => {
    expect(tokenNameSchema.safeParse("N".repeat(60)).success).toBe(true);
  });

  it.each([
    ["", "Give the token a name."],
    ["   ", "Give the token a name."],
    ["N".repeat(61), "Keep the name to 60 characters or fewer."],
  ])("rejects %j with the message %s", (input, message) => {
    const result = tokenNameSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(message);
    }
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/unit/api-token.test.ts
```

Expected: fails with `Cannot find module '@/lib/auth/api-token'`.

- [ ] **Step 3: Write `lib/auth/api-token.ts`, the pure half, in full**

Only the exports Step 1 needs. The scoped and database-facing exports are added in Step 7, appended to the same file.

```typescript
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import type { FormStateWith } from "@/lib/forms/state";
import { TOKEN_PATTERN } from "@/lib/bridge/wire";

export function generateToken(): { token: string; hash: string; prefix: string } {
  const token = `jsm_${randomBytes(32).toString("base64url")}`;
  const hash = hashToken(token);
  const prefix = token.slice(0, 8);
  return { token, hash, prefix };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type TokenFormState = FormStateWith<{ token: string; name: string }>;

export const tokenNameSchema: z.ZodType<string> = z
  .string()
  .trim()
  .min(1, "Give the token a name.")
  .max(60, "Keep the name to 60 characters or fewer.");
```

`randomBytes(32).toString("base64url")` always produces exactly 43 characters (32 bytes is 256 bits; base64url encodes 6 bits per character with no padding, so `ceil(256 / 6) = 43`), matching `TOKEN_PATTERN`'s `{43}` exactly. This is arithmetic, not a probabilistic property, so the unit test above checks the pattern match (which would fail on day one if the length were ever wrong) rather than hand-computing the character count.

- [ ] **Step 4: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/api-token.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 8 passed (8)` (3 `generateToken` cases plus 5 `tokenNameSchema` cases: accepts-and-trims, accepts-60-characters, and the 3-case `it.each`).

- [ ] **Step 5: Write the failing integration test**

Create `tests/integration/api-token.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { createApiToken, listApiTokens, revokeApiToken, authenticateBearer } from "@/lib/auth/api-token";

describe("createApiToken / listApiTokens", () => {
  it("returns the plain token once, stores only its hash, and lists it without the hash", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "alice@example.com");
      const s = scoped(db, user.id);

      const created = await createApiToken(s, "Laptop");
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      expect(created.data.token.startsWith("jsm_")).toBe(true);
      expect(created.data.item.name).toBe("Laptop");
      expect(created.data.item.prefix).toBe(created.data.token.slice(0, 8));
      expect(created.data.item).not.toHaveProperty("tokenHash");

      const list = await listApiTokens(s);
      expect(list).toHaveLength(1);
      expect(list[0]).not.toHaveProperty("tokenHash");
      expect(list[0]!.id).toBe(created.data.item.id);
    } finally {
      await close();
    }
  });

  it("rejects a blank name and writes nothing", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "bob@example.com");
      const s = scoped(db, user.id);

      const result = await createApiToken(s, "   ");
      expect(result).toMatchObject({ ok: false, code: "invalid", message: "Give the token a name." });
      expect(await listApiTokens(s)).toEqual([]);
    } finally {
      await close();
    }
  });
});

describe("revokeApiToken", () => {
  it("is idempotent for its own owner and refuses another user's token", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice2@example.com");
      const bob = await createTestUser(db, "bob2@example.com");
      const sa = scoped(db, alice.id);
      const sb = scoped(db, bob.id);
      const created = await createApiToken(sa, "Laptop");
      if (!created.ok) throw new Error("setup failed");

      const crossUser = await revokeApiToken(sb, created.data.item.id);
      expect(crossUser).toMatchObject({ ok: false, code: "token_not_found" });
      // Confirming the cross-user attempt above did not revoke it for its
      // real owner is what makes this case discriminating: a buggy
      // revokeApiToken that ignores the caller's userId entirely would still
      // report token_not_found by accident if it also failed to find the
      // row for an unrelated reason, but it would leave the row revoked.
      const stillActive = await listApiTokens(sa);
      expect(stillActive[0]!.revokedAt).toBeNull();

      const now = new Date("2026-09-19T12:00:00.000Z");
      const first = await revokeApiToken(sa, created.data.item.id, now);
      expect(first.ok).toBe(true);
      const afterFirst = await listApiTokens(sa);
      expect(afterFirst[0]!.revokedAt?.toISOString()).toBe(now.toISOString());

      const second = await revokeApiToken(sa, created.data.item.id, new Date("2026-09-20T00:00:00.000Z"));
      expect(second.ok).toBe(true);
      const afterSecond = await listApiTokens(sa);
      // Still the FIRST revoke's timestamp: revoking twice does not move it.
      expect(afterSecond[0]!.revokedAt?.toISOString()).toBe(now.toISOString());
    } finally {
      await close();
    }
  });

  it("reports token_not_found for an id that never existed", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "carol@example.com");
      const s = scoped(db, user.id);
      const result = await revokeApiToken(s, crypto.randomUUID());
      expect(result).toMatchObject({ ok: false, code: "token_not_found" });
    } finally {
      await close();
    }
  });
});

describe("authenticateBearer", () => {
  it("counts requests inside one window, resets in the next window, and writes last_used_at", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "dora@example.com");
      const s = scoped(db, user.id);
      const created = await createApiToken(s, "Laptop");
      if (!created.ok) throw new Error("setup failed");
      const token = created.data.token;

      const first = await authenticateBearer(db, token, new Date("2026-10-01T10:00:05.000Z"));
      expect(first).toMatchObject({ userId: user.id, count: 1 });

      const second = await authenticateBearer(db, token, new Date("2026-10-01T10:00:59.000Z"));
      expect(second?.count).toBe(2);

      // A new 60-second window (10:01:00 floors to a different windowStart
      // than 10:00:05 and 10:00:59 both do) resets the counter to 1, not 3.
      const third = await authenticateBearer(db, token, new Date("2026-10-01T10:01:00.000Z"));
      expect(third?.count).toBe(1);

      const list = await listApiTokens(s);
      expect(list[0]!.lastUsedAt?.toISOString()).toBe("2026-10-01T10:01:00.000Z");
    } finally {
      await close();
    }
  });

  it("returns null for a revoked token, an unknown token, and a malformed token, none of which change last_used_at", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "erin@example.com");
      const s = scoped(db, user.id);
      const created = await createApiToken(s, "Laptop");
      if (!created.ok) throw new Error("setup failed");
      const now = new Date("2026-10-02T00:00:00.000Z");

      // Right shape (passes TOKEN_PATTERN) but never issued: no row to match.
      expect(await authenticateBearer(db, `jsm_${"z".repeat(43)}`, now)).toBeNull();
      // Wrong shape entirely: rejected before any query runs.
      expect(await authenticateBearer(db, "not-a-token", now)).toBeNull();

      await revokeApiToken(s, created.data.item.id, now);
      expect(await authenticateBearer(db, created.data.token, now)).toBeNull();

      // None of the three attempts above touched the row.
      const list = await listApiTokens(s);
      expect(list[0]!.lastUsedAt).toBeNull();
    } finally {
      await close();
    }
  });
});
```

- [ ] **Step 6: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/integration/api-token.test.ts
```

Expected: fails, because `createApiToken`, `listApiTokens`, `revokeApiToken` and `authenticateBearer` are not exported by `lib/auth/api-token.ts` yet (a `TypeError` calling `undefined` as a function, or a Vitest "no matching export" error depending on the runner, once the module itself resolves).

- [ ] **Step 7: Append the scoped and database-facing exports to `lib/auth/api-token.ts`**

Add these imports to the top of the file (next to the existing ones) and the four exports below to the end of the file. Nothing written in Step 3 changes.

```typescript
import { eq, and, isNull, sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import type { Db } from "@/lib/db/client";
import type { Scoped, ApiTokenListItem } from "@/lib/db/scoped";
import { type Result, ok, fail } from "@/lib/result";
```

```typescript
export async function createApiToken(
  s: Scoped,
  name: string,
): Promise<Result<{ token: string; item: ApiTokenListItem }, "invalid">> {
  const parsed = tokenNameSchema.safeParse(name);
  if (!parsed.success) {
    // safeParse's failure branch always carries at least one issue.
    return fail("invalid", parsed.error.issues[0]!.message);
  }
  const { token, hash, prefix } = generateToken();
  const item = await s.apiToken.insert({ name: parsed.data, tokenHash: hash, prefix });
  return ok({ token, item });
}

export async function listApiTokens(s: Scoped): Promise<ApiTokenListItem[]> {
  return s.apiToken.list();
}

export async function revokeApiToken(
  s: Scoped,
  id: string,
  now: Date = new Date(),
): Promise<Result<null, "token_not_found">> {
  const revoked = await s.apiToken.revoke(id, now);
  if (!revoked) {
    return fail("token_not_found", "This token no longer exists.");
  }
  return ok(null);
}

export type BearerAuth = { tokenId: string; userId: string; count: number; windowStart: Date };

export async function authenticateBearer(db: Db, token: string, now: Date): Promise<BearerAuth | null> {
  // The shape check first, with no query, means an arbitrary Authorization
  // header (a session-cookie-shaped value, a different app's API key, a
  // stray "Bearer undefined") never reaches the database at all.
  if (!TOKEN_PATTERN.test(token)) {
    return null;
  }
  const hash = hashToken(token);
  const windowStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  // One statement: authenticate, touch last_used_at and count the
  // rate limit together, so nothing can read the counter between two
  // separate statements and race it. The bound windowStart is cast
  // explicitly (::timestamptz) because PGlite cannot infer a parameter's
  // type from its position inside a CASE expression; Postgres proper can
  // usually infer it, but the explicit cast is correct and harmless there
  // too, so both databases take the same statement.
  const rows = await db
    .update(schema.apiToken)
    .set({
      lastUsedAt: now,
      rateWindowStart: windowStart,
      rateCount: sql`case when ${schema.apiToken.rateWindowStart} = ${windowStart.toISOString()}::timestamptz then ${schema.apiToken.rateCount} + 1 else 1 end`,
    })
    .where(and(eq(schema.apiToken.tokenHash, hash), isNull(schema.apiToken.revokedAt)))
    .returning({ id: schema.apiToken.id, userId: schema.apiToken.userId, count: schema.apiToken.rateCount });
  const row = rows[0];
  if (!row) {
    return null;
  }
  return { tokenId: row.id, userId: row.userId, count: row.count, windowStart };
}
```

- [ ] **Step 8: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/integration/api-token.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 6 passed (6)`.

- [ ] **Step 9: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Expected: all three exit 0, with `pnpm test` reporting every existing test still passing alongside the 14 new ones (8 unit, 6 integration).

- [ ] **Step 10: Commit**

```bash
git add lib/auth/api-token.ts tests/unit/api-token.test.ts tests/integration/api-token.test.ts
git commit -m "$(cat <<'EOF'
feat: add API token creation, listing, revocation and bearer authentication
EOF
)"
```

---

### Task 6: Bridge core (parsing, capped reader, errors, push schema, context document)

Everything in this task is a plain function: no route, no session, no `Scoped`. Task 7 wires these into the three endpoints.

**Files:**
- Create: `lib/bridge/errors.ts`, `lib/bridge/push-schema.ts`, `lib/bridge/http.ts`, `lib/bridge/context.ts`, `tests/unit/bridge-errors.test.ts`, `tests/unit/bridge-http.test.ts`, `tests/unit/bridge-push-schema.test.ts`, `tests/unit/bridge-context.test.ts`

**Interfaces:**
- Consumes: `TOKEN_PATTERN`, `KEY_PATTERN`, `WireArtifact`, `WireScope` from `lib/bridge/wire.ts` (Task 3). `IncomingArtifact`, `StageInput` from `lib/artifacts/upsert.ts` (Task 4). `JobView` from `lib/pipeline/read.ts` (Milestone 2, extended by Task 4 with `documents: ArtifactMeta[]`). `ArtifactMeta` from `lib/db/scoped` (Task 2). `ArtifactKind`, `kindInfo` from `lib/artifacts/kinds.ts` (Task 1). `PERSON_ROLE_LABELS` from `lib/pipeline/labels.ts` (Milestone 2). `Result`, `ok`, `fail` from `lib/result.ts` (Milestone 1).
- Produces (copied from the frame character for character):

```typescript
// lib/bridge/http.ts
export function parseBearer(header: string | null): string | null;   // scheme case-insensitive, token must match TOKEN_PATTERN
export function readJsonCapped(request: Request, maxBytes: number): Promise<Result<unknown, "payload_too_large" | "invalid_json">>;  // as a planning scratch file
export function bridgeJson(body: object, init: { status?: number; requestId: string; headers?: Record<string, string> }): Response;
export function bridgeError(code: BridgeErrorCode, requestId: string, detail?: BridgeErrorDetail, headers?: Record<string, string>): Response;  // status and message from BRIDGE_ERRORS
// lib/bridge/errors.ts
export type BridgeErrorCode = "unauthorized" | "rate_limited" | "not_found" | "invalid_query" | "invalid_json" | "invalid_payload" | "duplicate_key" | "payload_too_large" | "too_many_artifacts" | "artifact_too_large" | "server_error";
export type BridgeErrorDetail = { slug?: string; key?: string; seconds?: number; text?: string };   // text: invalid_query and invalid_payload messages
export const BRIDGE_ERRORS: Record<BridgeErrorCode, { status: 400 | 401 | 404 | 413 | 429 | 500; message(detail: BridgeErrorDetail & { requestId: string }): string }>;
// lib/bridge/push-schema.ts
export const pushBodySchema: z.ZodType<{ artifacts: WireArtifact[] }>;   // unknown fields ignored
export function firstIssue(error: z.ZodError): string;                  // "<path>: <message>", path joined with "."
export function toIncoming(artifact: WireArtifact): IncomingArtifact;     // scope default "opportunity"; stage string to { ref }, absent to null
// lib/bridge/context.ts
export type ContextInput = { view: JobView; companyDocuments: ArtifactMeta[]; generatedAt: Date };
export function buildContextDocument(input: ContextInput): string;
```

**Global constraints restated for this task:** every user-visible string here (every `BRIDGE_ERRORS` message, every push-schema Zod message) comes from the frame verbatim; none of these files touch `lib/db` or the session, so nothing here needs `requireUser`, `getSession` or `cookies()` (Task 7's handlers are the layer that reaches the database and enforces D6). Code comments state reasons and never cite decision ids.

- [ ] **Step 1: Write the failing errors test**

Create `tests/unit/bridge-errors.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { BRIDGE_ERRORS } from "@/lib/bridge/errors";

const requestId = "req-test-1";

describe("BRIDGE_ERRORS", () => {
  it("unauthorized is 401 with a fixed message", () => {
    expect(BRIDGE_ERRORS.unauthorized.status).toBe(401);
    expect(BRIDGE_ERRORS.unauthorized.message({ requestId })).toBe("Missing, unknown or revoked token.");
  });

  it("rate_limited is 429 and reports the given seconds", () => {
    expect(BRIDGE_ERRORS.rate_limited.status).toBe(429);
    expect(BRIDGE_ERRORS.rate_limited.message({ requestId, seconds: 42 })).toBe(
      "Too many requests. Try again in 42 seconds.",
    );
  });

  it("not_found is 404 and names the slug", () => {
    expect(BRIDGE_ERRORS.not_found.status).toBe(404);
    expect(BRIDGE_ERRORS.not_found.message({ requestId, slug: "acme-designer" })).toBe(
      "No job with the slug acme-designer.",
    );
  });

  it("invalid_query and invalid_payload are 400 and pass the given text straight through", () => {
    expect(BRIDGE_ERRORS.invalid_query.status).toBe(400);
    expect(BRIDGE_ERRORS.invalid_query.message({ requestId, text: "status must be active, closed or all." })).toBe(
      "status must be active, closed or all.",
    );
    expect(BRIDGE_ERRORS.invalid_payload.status).toBe(400);
    expect(BRIDGE_ERRORS.invalid_payload.message({ requestId, text: "key: key must be a string." })).toBe(
      "key: key must be a string.",
    );
  });

  it("invalid_json is 400 with a fixed message", () => {
    expect(BRIDGE_ERRORS.invalid_json.status).toBe(400);
    expect(BRIDGE_ERRORS.invalid_json.message({ requestId })).toBe("The request body is not valid JSON.");
  });

  it("duplicate_key is 400 and names the key", () => {
    expect(BRIDGE_ERRORS.duplicate_key.status).toBe(400);
    expect(BRIDGE_ERRORS.duplicate_key.message({ requestId, key: "cv" })).toBe(
      "The key cv appears more than once in this push.",
    );
  });

  it("payload_too_large, too_many_artifacts and artifact_too_large are all 413", () => {
    expect(BRIDGE_ERRORS.payload_too_large.status).toBe(413);
    expect(BRIDGE_ERRORS.payload_too_large.message({ requestId })).toBe(
      "The request is larger than 4 MB. Push fewer files at a time.",
    );
    expect(BRIDGE_ERRORS.too_many_artifacts.status).toBe(413);
    expect(BRIDGE_ERRORS.too_many_artifacts.message({ requestId })).toBe("A push holds at most 50 documents.");
    expect(BRIDGE_ERRORS.artifact_too_large.status).toBe(413);
    expect(BRIDGE_ERRORS.artifact_too_large.message({ requestId, key: "cover-letter" })).toBe(
      "cover-letter is larger than 1 MB.",
    );
  });

  it("server_error is 500 and reports the request id, nothing else", () => {
    expect(BRIDGE_ERRORS.server_error.status).toBe(500);
    expect(BRIDGE_ERRORS.server_error.message({ requestId: "abc-123" })).toBe(
      "Something went wrong on the server. Request id abc-123.",
    );
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/unit/bridge-errors.test.ts
```

Expected: fails with `Cannot find module '@/lib/bridge/errors'`.

- [ ] **Step 3: Write `lib/bridge/errors.ts` in full**

```typescript
export type BridgeErrorCode =
  | "unauthorized"
  | "rate_limited"
  | "not_found"
  | "invalid_query"
  | "invalid_json"
  | "invalid_payload"
  | "duplicate_key"
  | "payload_too_large"
  | "too_many_artifacts"
  | "artifact_too_large"
  | "server_error";

// text carries the already-composed message for the two codes whose wording
// depends on which endpoint raised them (invalid_query: a list-only or a
// push-only sentence; invalid_payload: whatever firstIssue produced for this
// request), so BRIDGE_ERRORS itself does not need to know which endpoint is
// calling it.
export type BridgeErrorDetail = { slug?: string; key?: string; seconds?: number; text?: string };

export const BRIDGE_ERRORS: Record<
  BridgeErrorCode,
  { status: 400 | 401 | 404 | 413 | 429 | 500; message(detail: BridgeErrorDetail & { requestId: string }): string }
> = {
  unauthorized: {
    status: 401,
    message: () => "Missing, unknown or revoked token.",
  },
  rate_limited: {
    status: 429,
    message: (d) => `Too many requests. Try again in ${d.seconds} seconds.`,
  },
  not_found: {
    status: 404,
    message: (d) => `No job with the slug ${d.slug}.`,
  },
  invalid_query: {
    status: 400,
    message: (d) => d.text ?? "",
  },
  invalid_json: {
    status: 400,
    message: () => "The request body is not valid JSON.",
  },
  invalid_payload: {
    status: 400,
    message: (d) => d.text ?? "",
  },
  duplicate_key: {
    status: 400,
    message: (d) => `The key ${d.key} appears more than once in this push.`,
  },
  payload_too_large: {
    status: 413,
    message: () => "The request is larger than 4 MB. Push fewer files at a time.",
  },
  too_many_artifacts: {
    status: 413,
    message: () => "A push holds at most 50 documents.",
  },
  artifact_too_large: {
    status: 413,
    message: (d) => `${d.key} is larger than 1 MB.`,
  },
  server_error: {
    status: 500,
    message: (d) => `Something went wrong on the server. Request id ${d.requestId}.`,
  },
};
```

- [ ] **Step 4: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/bridge-errors.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 8 passed (8)`.

- [ ] **Step 5: Write the failing http test**

Create `tests/unit/bridge-http.test.ts`. The five `readJsonCapped` cases are the ones a planning scratch file already proved against a real `Request`; this test is the same five cases against the real module.

```typescript
import { describe, expect, it } from "vitest";
import { parseBearer, readJsonCapped, bridgeJson, bridgeError } from "@/lib/bridge/http";

describe("parseBearer", () => {
  it("extracts a token that matches TOKEN_PATTERN from a Bearer header", () => {
    const token = `jsm_${"A".repeat(43)}`;
    expect(parseBearer(`Bearer ${token}`)).toBe(token);
  });

  it("matches the scheme case-insensitively", () => {
    const token = `jsm_${"A".repeat(43)}`;
    expect(parseBearer(`bearer ${token}`)).toBe(token);
    expect(parseBearer(`BEARER ${token}`)).toBe(token);
  });

  it("returns null for a missing header, a different scheme, or no token", () => {
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer(`Basic ${btoa("a:b")}`)).toBeNull();
    expect(parseBearer("Bearer")).toBeNull();
    expect(parseBearer("Bearer ")).toBeNull();
  });

  it("returns null when the token does not match TOKEN_PATTERN, even with the right scheme", () => {
    expect(parseBearer("Bearer not-a-real-token")).toBeNull();
    expect(parseBearer(`Bearer jsm_${"A".repeat(42)}`)).toBeNull();
  });
});

describe("readJsonCapped", () => {
  it("parses a small JSON body under the cap", async () => {
    const request = new Request("http://t/x", { method: "PUT", body: JSON.stringify({ a: 1 }) });
    const result = await readJsonCapped(request, 1024);
    expect(result).toEqual({ ok: true, data: { a: 1 } });
  });

  it("rejects a body over the cap by a truthful Content-Length header", async () => {
    const big = "x".repeat(5000);
    const request = new Request("http://t/x", { method: "PUT", body: JSON.stringify({ big }) });
    const result = await readJsonCapped(request, 1024);
    expect(result).toMatchObject({ ok: false, code: "payload_too_large" });
  });

  it("rejects a body over the cap read as a stream with no Content-Length at all", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 10; i++) controller.enqueue(new TextEncoder().encode("y".repeat(200)));
        controller.close();
      },
    });
    const request = new Request("http://t/x", { method: "PUT", body: stream, duplex: "half" } as RequestInit);
    const result = await readJsonCapped(request, 1024);
    expect(result).toMatchObject({ ok: false, code: "payload_too_large" });
  });

  it("rejects a body over the cap even when Content-Length lies about being small", async () => {
    const big = "x".repeat(5000);
    const request = new Request("http://t/x", {
      method: "PUT",
      body: JSON.stringify({ big }),
      headers: { "content-length": "10" },
    });
    const result = await readJsonCapped(request, 1024);
    expect(result).toMatchObject({ ok: false, code: "payload_too_large" });
  });

  it("rejects malformed JSON that is still under the cap", async () => {
    const request = new Request("http://t/x", { method: "PUT", body: "{nope" });
    const result = await readJsonCapped(request, 1024);
    expect(result).toMatchObject({ ok: false, code: "invalid_json" });
  });
});

describe("bridgeJson", () => {
  it("sets x-request-id, cache-control: no-store, and the given status", async () => {
    const response = bridgeJson({ ok: true }, { status: 201, requestId: "req-1" });
    expect(response.status).toBe(201);
    expect(response.headers.get("x-request-id")).toBe("req-1");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true });
  });

  it("defaults to status 200 and merges extra headers", async () => {
    const response = bridgeJson({ a: 1 }, { requestId: "req-2", headers: { "x-extra": "1" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-extra")).toBe("1");
    expect(response.headers.get("x-request-id")).toBe("req-2");
  });
});

describe("bridgeError", () => {
  it("builds the WireError shape with the code's own status and message", async () => {
    const response = bridgeError("not_found", "req-3", { slug: "acme-designer" });
    expect(response.status).toBe(404);
    expect(response.headers.get("x-request-id")).toBe("req-3");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "No job with the slug acme-designer." },
      requestId: "req-3",
    });
  });

  it("passes extra headers through, e.g. Retry-After for rate_limited", async () => {
    const response = bridgeError("rate_limited", "req-4", { seconds: 30 }, { "Retry-After": "30" });
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(await response.json()).toMatchObject({ error: { code: "rate_limited" } });
  });
});
```

- [ ] **Step 6: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/unit/bridge-http.test.ts
```

Expected: fails with `Cannot find module '@/lib/bridge/http'`.

- [ ] **Step 7: Write `lib/bridge/http.ts` in full**

```typescript
import { type Result, ok, fail } from "@/lib/result";
import { TOKEN_PATTERN } from "./wire";
import { BRIDGE_ERRORS, type BridgeErrorCode, type BridgeErrorDetail } from "./errors";

export function parseBearer(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const match = /^bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    return null;
  }
  const token = match[1]!.trim();
  return TOKEN_PATTERN.test(token) ? token : null;
}

// Reads the body under a hard byte cap. It must hold in five cases: a truthful Content-Length over the cap, a stream with no
// Content-Length at all, a lying Content-Length under the cap while the
// stream itself is over it, a small body under the cap, and malformed JSON.
// The internal fail() messages here are never shown to a caller directly;
// every handler reports the user-facing text through bridgeError, keyed off
// the returned code.
export async function readJsonCapped(
  request: Request,
  maxBytes: number,
): Promise<Result<unknown, "payload_too_large" | "invalid_json">> {
  const declared = Number(request.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declared) && declared > maxBytes) {
    return fail("payload_too_large", "Declared content length exceeds the cap.");
  }
  if (!request.body) {
    return fail("invalid_json", "The request has no body.");
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      // Stop reading immediately: a lying or absent Content-Length must not
      // let an attacker force the server to buffer an unbounded stream
      // before the cap is enforced.
      await reader.cancel();
      return fail("payload_too_large", "The request body exceeds the cap.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return ok(JSON.parse(text));
  } catch {
    return fail("invalid_json", "The request body is not valid JSON.");
  }
}

export function bridgeJson(
  body: object,
  init: { status?: number; requestId: string; headers?: Record<string, string> },
): Response {
  return Response.json(body, {
    status: init.status ?? 200,
    headers: {
      "x-request-id": init.requestId,
      "cache-control": "no-store",
      ...init.headers,
    },
  });
}

export function bridgeError(
  code: BridgeErrorCode,
  requestId: string,
  detail: BridgeErrorDetail = {},
  headers?: Record<string, string>,
): Response {
  const entry = BRIDGE_ERRORS[code];
  const message = entry.message({ ...detail, requestId });
  return bridgeJson({ error: { code, message }, requestId }, { status: entry.status, requestId, headers });
}
```

- [ ] **Step 8: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/bridge-http.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 13 passed (13)` (4 `parseBearer` + 5 `readJsonCapped` + 2 `bridgeJson` + 2 `bridgeError`).

- [ ] **Step 9: Write the failing push-schema test**

Create `tests/unit/bridge-push-schema.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { pushBodySchema, firstIssue, toIncoming } from "@/lib/bridge/push-schema";

describe("pushBodySchema", () => {
  it("accepts a minimal valid artifact and ignores unknown fields", () => {
    const result = pushBodySchema.safeParse({
      artifacts: [{ key: "cv", kind: "cv", body_md: "# CV", extra: "ignored" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts every optional field", () => {
    const result = pushBodySchema.safeParse({
      artifacts: [
        { key: "recon", kind: "research", title: "Recon", scope: "company", stage: "Saved", body_md: "# Recon" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it.each([
    [null, "The body must be a JSON object."],
    [{ artifacts: "nope" }, "artifacts: artifacts must be a list."],
    [{ artifacts: [] }, "artifacts: artifacts must hold at least one document."],
    [{ artifacts: [{ key: 5, kind: "cv", body_md: "x" }] }, "artifacts.0.key: key must be a string."],
    [
      { artifacts: [{ key: "Not Valid!", kind: "cv", body_md: "x" }] },
      "artifacts.0.key: key must be 1 to 100 lowercase letters, digits, dots, dashes or underscores, starting with a letter or digit.",
    ],
    [{ artifacts: [{ key: "cv", kind: 5, body_md: "x" }] }, "artifacts.0.kind: kind must be a string."],
    [{ artifacts: [{ key: "cv", kind: "", body_md: "x" }] }, "artifacts.0.kind: kind must not be empty."],
    [{ artifacts: [{ key: "cv", kind: "cv", title: 5, body_md: "x" }] }, "artifacts.0.title: title must be a string."],
    [
      { artifacts: [{ key: "cv", kind: "cv", scope: "everyone", body_md: "x" }] },
      "artifacts.0.scope: scope must be opportunity or company.",
    ],
    [{ artifacts: [{ key: "cv", kind: "cv", stage: 5, body_md: "x" }] }, "artifacts.0.stage: stage must be a string."],
    [{ artifacts: [{ key: "cv", kind: "cv", body_md: 5 }] }, "artifacts.0.body_md: body_md must be a string."],
    [
      { artifacts: [{ key: "cv", kind: "cv", body_md: "   " }] },
      "artifacts.0.body_md: body_md must not be empty.",
    ],
  ])("rejects %o with firstIssue text %s", (input, message) => {
    const result = pushBodySchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(firstIssue(result.error)).toBe(message);
    }
  });
});

describe("firstIssue", () => {
  it("joins a nested path with dots", () => {
    const result = pushBodySchema.safeParse({ artifacts: [{ key: "cv", kind: "cv", body_md: "x" }, { key: 5, kind: "cv", body_md: "x" }] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(firstIssue(result.error)).toBe("artifacts.1.key: key must be a string.");
    }
  });

  it("reports a root-level failure with no path prefix", () => {
    const result = pushBodySchema.safeParse(null);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(firstIssue(result.error)).toBe("The body must be a JSON object.");
    }
  });
});

describe("toIncoming", () => {
  it("defaults scope to opportunity and stage to null when absent", () => {
    expect(toIncoming({ key: "cv", kind: "cv", body_md: "# CV" })).toEqual({
      key: "cv",
      kind: "cv",
      title: null,
      scope: "opportunity",
      stage: null,
      bodyMd: "# CV",
    });
  });

  it("turns a stage string into a ref and keeps a given scope and title", () => {
    expect(
      toIncoming({ key: "recon", kind: "research", title: "Recon", scope: "company", stage: "Saved", body_md: "# Recon" }),
    ).toEqual({
      key: "recon",
      kind: "research",
      title: "Recon",
      scope: "company",
      stage: { ref: "Saved" },
      bodyMd: "# Recon",
    });
  });

  it("turns a null title into null, not the string \"null\"", () => {
    expect(toIncoming({ key: "cv", kind: "cv", title: null, body_md: "# CV" }).title).toBeNull();
  });
});
```

- [ ] **Step 10: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/unit/bridge-push-schema.test.ts
```

Expected: fails with `Cannot find module '@/lib/bridge/push-schema'`.

- [ ] **Step 11: Write `lib/bridge/push-schema.ts` in full**

Zod's per-field `{ error: "..." }` option customizes the "wrong type entirely" message; every field below also needs one, unlike Task 4's form schemas, because this input arrives over the wire as arbitrary JSON (a number, `null`, an array) rather than from a `FormData` that is already all strings.

```typescript
import { z } from "zod";
import { KEY_PATTERN, type WireArtifact } from "./wire";
import type { IncomingArtifact } from "@/lib/artifacts/upsert";

const WIRE_SCOPES = ["opportunity", "company"] as const;

const wireArtifactSchema = z.object({
  key: z
    .string({ error: "key must be a string." })
    .regex(
      KEY_PATTERN,
      "key must be 1 to 100 lowercase letters, digits, dots, dashes or underscores, starting with a letter or digit.",
    ),
  kind: z.string({ error: "kind must be a string." }).min(1, "kind must not be empty."),
  title: z.string({ error: "title must be a string." }).nullable().optional(),
  scope: z.enum(WIRE_SCOPES, { error: "scope must be opportunity or company." }).optional(),
  stage: z.string({ error: "stage must be a string." }).nullable().optional(),
  body_md: z
    .string({ error: "body_md must be a string." })
    .refine((v) => v.trim().length > 0, "body_md must not be empty."),
});

export const pushBodySchema: z.ZodType<{ artifacts: WireArtifact[] }> = z.object(
  {
    artifacts: z
      .array(wireArtifactSchema, { error: "artifacts must be a list." })
      .min(1, "artifacts must hold at least one document."),
  },
  { error: "The body must be a JSON object." },
);

export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0]!;
  const path = issue.path.join(".");
  return path === "" ? issue.message : `${path}: ${issue.message}`;
}

export function toIncoming(artifact: WireArtifact): IncomingArtifact {
  return {
    key: artifact.key,
    kind: artifact.kind,
    title: artifact.title ?? null,
    scope: artifact.scope ?? "opportunity",
    stage: artifact.stage ? { ref: artifact.stage } : null,
    bodyMd: artifact.body_md,
  };
}
```

`wireArtifactSchema` is defined but not exported: nothing outside this file names an individual artifact's shape, only the whole push body (`pushBodySchema`) and the one-artifact mapper (`toIncoming`).

- [ ] **Step 12: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/bridge-push-schema.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 19 passed (19)` (2 accept cases + 12 `it.each` rejections in the `pushBodySchema` block, plus 2 `firstIssue` cases and 3 `toIncoming` cases).

- [ ] **Step 13: Write the failing context-document test**

This is the big one. Two fixtures: a rich `JobView` exercising every branch (a fenced code block already inside the posting text, a pipe character inside a label, a staged and an unstaged person, notes spanning two lines, a planted string that must never appear, job and company documents), and a bare `JobView` with nothing in any optional slot, to pin the "No ..." fallback line for every section. Every field the real `OpportunityRow`/`CompanyRow`/`StageRow`/`PersonRow`/`ArtifactMeta` types carry but this function never reads is filled in through small builder helpers, the same shape `tests/unit/artifact-tabs.test.ts`'s own `meta()` helper already uses in this plan's Task 3.

Create `tests/unit/bridge-context.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildContextDocument } from "@/lib/bridge/context";
import type { JobView } from "@/lib/pipeline/read";
import type { OpportunityRow, CompanyRow, StageRow, LinkedPerson, PersonRow, ArtifactMeta } from "@/lib/db/scoped";

function opportunityRow(partial: Partial<OpportunityRow>): OpportunityRow {
  return {
    id: "o1",
    userId: "u1",
    companyId: "c1",
    slug: "acme-designer",
    roleTitle: "Product Designer",
    location: null,
    workMode: null,
    source: "manual",
    sourceUrl: null,
    postingMd: null,
    postingCapturedAt: null,
    compMin: null,
    compMax: null,
    compCurrency: null,
    compNote: null,
    myAsk: null,
    fitScore: null,
    fit: null,
    fitStatus: "none",
    needsReview: false,
    currentStageId: "s1",
    status: "active",
    closedReason: null,
    closedAt: null,
    closedStageId: null,
    nextAction: null,
    nextActionAt: null,
    dedupeHash: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...partial,
  } as OpportunityRow;
}

function companyRow(partial: Partial<CompanyRow>): CompanyRow {
  return {
    id: "c1",
    userId: "u1",
    name: "Acme Robotics",
    nameKey: "acmerobotics",
    domain: null,
    careersUrl: null,
    atsKind: null,
    atsOrg: null,
    size: null,
    industry: null,
    hq: null,
    notesMd: null,
    tracked: false,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...partial,
  } as CompanyRow;
}

function stageRow(partial: Partial<StageRow> & Pick<StageRow, "id" | "kind" | "label" | "position">): StageRow {
  return {
    userId: "u1",
    opportunityId: "o1",
    status: "upcoming",
    scheduledAt: null,
    format: null,
    enteredAt: null,
    completedAt: null,
    outcomeMd: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...partial,
  } as StageRow;
}

function personRow(partial: Partial<PersonRow> & Pick<PersonRow, "id" | "name">): PersonRow {
  return {
    userId: "u1",
    companyId: "c1",
    title: null,
    linkedinUrl: null,
    email: null,
    notesMd: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...partial,
  } as PersonRow;
}

function linkedPerson(partial: Partial<LinkedPerson> & { person: PersonRow }): LinkedPerson {
  return { linkId: partial.person.id, role: "other", stageId: null, ...partial };
}

function artifactMeta(partial: Partial<ArtifactMeta> & { key: string; kind: ArtifactMeta["kind"] }): ArtifactMeta {
  return {
    id: partial.key,
    title: partial.key,
    stageId: null,
    opportunityId: null,
    companyId: null,
    version: 1,
    contentHash: "h",
    sourceHash: "h",
    origin: "pushed",
    editedAt: null,
    sentAt: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    ...partial,
  } as ArtifactMeta;
}

const generatedAt = new Date("2026-09-23T18:00:00.000Z");

describe("buildContextDocument, a rich fixture", () => {
  const stageDone = stageRow({
    id: "s0",
    kind: "saved",
    label: "Saved",
    position: 0,
    status: "done",
    completedAt: new Date("2026-09-01T10:00:00.000Z"),
  });
  const stageCurrent = stageRow({
    id: "s1",
    kind: "recruiter_screen",
    label: "Recruiter | screen",
    position: 1,
    status: "scheduled",
    scheduledAt: new Date("2026-09-10T15:00:00.000Z"),
  });
  const view: JobView = {
    opportunity: opportunityRow({
      postingMd: "See the ```js\nconst x = 1;\n``` snippet inline.",
      postingCapturedAt: new Date("2026-08-20T09:00:00.000Z"),
    }),
    company: companyRow({
      // Plants a resume-shaped sentence in a field the template never
      // reads, so a careless implementation that spreads the whole company
      // row into the document would be caught here.
      notesMd: "Managed a resume-writing team of six across two offices.",
    }),
    stages: [stageDone, stageCurrent],
    currentStage: stageCurrent,
    people: [
      linkedPerson({
        role: "recruiter",
        stageId: "s1",
        person: personRow({
          id: "p1",
          name: "Priya Raman",
          title: "Recruiter",
          linkedinUrl: "https://linkedin.com/in/priya",
          email: "priya@example-mail.test",
          notesMd: "Prefers async updates.\nFollow up Friday.",
        }),
      }),
      linkedPerson({
        role: "hiring_manager",
        person: personRow({ id: "p2", name: "Sam Okafor" }),
      }),
    ],
    events: [],
    documents: [artifactMeta({ key: "cv", kind: "cv", version: 2, updatedAt: new Date("2026-09-05T12:00:00.000Z") })],
  };
  const companyDocuments = [
    artifactMeta({ key: "recon", kind: "research", updatedAt: new Date("2026-09-02T08:00:00.000Z") }),
  ];

  const doc = buildContextDocument({ view, companyDocuments, generatedAt });

  it("matches the exact expected document", () => {
    expect(doc).toBe(
      [
        "---",
        "jobsmith: context/v1",
        'slug: "acme-designer"',
        'company: "Acme Robotics"',
        'role: "Product Designer"',
        "status: active",
        'current_stage: "Recruiter | screen"',
        "current_stage_kind: recruiter_screen",
        "generated: 2026-09-23T18:00:00.000Z",
        "---",
        "",
        "# Product Designer at Acme Robotics",
        "",
        "## Posting",
        "",
        "Captured 2026-08-20T09:00:00.000Z.",
        "",
        "````markdown",
        "See the ```js",
        "const x = 1;",
        "``` snippet inline.",
        "````",
        "",
        "## Stages",
        "",
        "| # | Kind | Label | Status | Date | People |",
        "|---|---|---|---|---|---|",
        "| 1 | saved | Saved | done | 2026-09-01T10:00:00.000Z |  |",
        "| 2 | recruiter_screen | Recruiter \\| screen | current | 2026-09-10T15:00:00.000Z | Priya Raman |",
        "",
        "## People",
        "",
        "- Priya Raman, Recruiter. Role: Recruiter. Stage: Recruiter | screen. LinkedIn: https://linkedin.com/in/priya.",
        "  Notes:",
        "  Prefers async updates.",
        "  Follow up Friday.",
        "- Sam Okafor. Role: Hiring manager.",
        "",
        "## Preferences",
        "",
        "No preferences saved yet.",
        "",
        "## Artifacts",
        "",
        "| Key | Kind | Scope | Stage | Version | Updated |",
        "|---|---|---|---|---|---|",
        "| cv | CV | job |  | 2 | 2026-09-05T12:00:00.000Z |",
        "| recon | Research | company |  | 1 | 2026-09-02T08:00:00.000Z |",
        "",
      ].join("\n"),
    );
  });

  it("never includes the company's internal notes or a person's email address", () => {
    expect(doc).not.toContain("resume-writing team");
    expect(doc).not.toContain("priya@example-mail.test");
  });

  it("the fence is one backtick longer than the longest run already inside the posting", () => {
    // The posting's own longest run is three backticks; the fence used to
    // wrap it is four, so the posting's own ``` never closes the block early.
    expect(doc).toContain("````markdown");
    expect(doc).toContain("````\n");
  });
});

describe("buildContextDocument, a bare fixture", () => {
  const stage = stageRow({ id: "s0", kind: "saved", label: "Saved", position: 0, status: "upcoming" });
  const view: JobView = {
    opportunity: opportunityRow({ slug: "bare-job", roleTitle: "Engineer", status: "closed" }),
    company: companyRow({ name: "Bare Co" }),
    stages: [stage],
    currentStage: stage,
    people: [],
    events: [],
    documents: [],
  };

  const doc = buildContextDocument({ view, companyDocuments: [], generatedAt });

  it("falls back to the fixed sentence in Posting, People and Artifacts, and still emits the Stages table", () => {
    expect(doc).toBe(
      [
        "---",
        "jobsmith: context/v1",
        'slug: "bare-job"',
        'company: "Bare Co"',
        'role: "Engineer"',
        "status: closed",
        'current_stage: "Saved"',
        "current_stage_kind: saved",
        "generated: 2026-09-23T18:00:00.000Z",
        "---",
        "",
        "# Engineer at Bare Co",
        "",
        "## Posting",
        "",
        "No posting text saved.",
        "",
        "## Stages",
        "",
        "| # | Kind | Label | Status | Date | People |",
        "|---|---|---|---|---|---|",
        "| 1 | saved | Saved | current |  |  |",
        "",
        "## People",
        "",
        "No people linked to this job.",
        "",
        "## Preferences",
        "",
        "No preferences saved yet.",
        "",
        "## Artifacts",
        "",
        "No artifacts yet.",
        "",
      ].join("\n"),
    );
  });
});
```

- [ ] **Step 14: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/unit/bridge-context.test.ts
```

Expected: fails with `Cannot find module '@/lib/bridge/context'`.

- [ ] **Step 15: Implement `lib/bridge/context.ts`**

`buildContextDocument(input: ContextInput): string`, per D29 and the frame's fixed format block. Two private helpers used throughout: `escapeCell(value: string): string` (replace every `|` with `\|`, then every `\r\n`, lone `\r` or `\n` with a single space) for any value placed inside a table cell, and `fenceFor(text: string): string` (find every run of one or more consecutive backtick characters in `text`, take the longest run's length, use `Math.max(longestRun + 1, 3)` backticks, so a posting with no backticks at all gets the ordinary 3-backtick fence).

Imports: `type { JobView }` from `@/lib/pipeline/read`; `type { ArtifactMeta }` from `@/lib/db/scoped`; `kindInfo` from `@/lib/artifacts/kinds`; `PERSON_ROLE_LABELS` from `@/lib/pipeline/labels`.

```typescript
export type ContextInput = { view: JobView; companyDocuments: ArtifactMeta[]; generatedAt: Date };
```

`JobView` already carries `documents: ArtifactMeta[]` (Task 4's addition to `lib/pipeline/read.ts`), so `input.view.documents` is the job-scoped list; `input.companyDocuments` is the separately supplied company-scoped list.

Build the output as an array of lines, joined with `"\n"` at the very end plus one trailing `"\n"` (every fixture above ends its joined array with a final empty string, which is exactly what `.join("\n")` followed by nothing extra produces when the array's last element is `""`; do not append a second `"\n"` on top of that).

1. Frontmatter block, one line per entry, in this order: `"---"`; `"jobsmith: context/v1"`; `` `slug: ${JSON.stringify(view.opportunity.slug)}` ``; `` `company: ${JSON.stringify(view.company.name)}` ``; `` `role: ${JSON.stringify(view.opportunity.roleTitle)}` ``; `` `status: ${view.opportunity.status}` `` (bare, no quotes: the value is always the literal word `active` or `closed`); `` `current_stage: ${JSON.stringify(view.currentStage.label)}` ``; `` `current_stage_kind: ${view.currentStage.kind}` `` (bare); `` `generated: ${input.generatedAt.toISOString()}` ``; `"---"`; then a blank line.
2. `` `# ${view.opportunity.roleTitle} at ${view.company.name}` ``, then a blank line.
3. `"## Posting"`, blank line. When `view.opportunity.postingCapturedAt` is set, push `` `Captured ${postingCapturedAt.toISOString()}.` `` and a blank line (this line is independent of whether `postingMd` itself is set). When `view.opportunity.postingMd` is a non-null, non-empty string: compute `fence = fenceFor(postingMd)`, push `` `${fence}markdown` ``, then push `postingMd` itself as a single element (it may contain internal newlines; pushing it as one array element and joining the whole document with `"\n"` prints it verbatim, embedded newlines included), then push `fence` alone. Otherwise (null or empty) push the single line `"No posting text saved."`. Blank line.
4. `"## Stages"`, blank line, the two header lines `"| # | Kind | Label | Status | Date | People |"` and `"|---|---|---|---|---|---|"`. For each `stage` of `view.stages` (already in position order): `status` is `"current"` when `stage.id === view.currentStage.id`, else `stage.status` itself; `date` is `stage.scheduledAt ?? stage.completedAt`, rendered as `date.toISOString()` or `""` when both are null; `names` is every entry of `view.people` whose `stageId === stage.id`, mapped to `person.name`, joined with `", "`, then passed through `escapeCell`. Push `` `| ${stage.position + 1} | ${stage.kind} | ${escapeCell(stage.label)} | ${status} | ${date ? date.toISOString() : ""} | ${names} |` ``. Blank line after the loop.
5. `"## People"`, blank line. When `view.people.length === 0`, push `"No people linked to this job."`. Otherwise, for each `link` of `view.people`: build `head = "- " + person.name`, then `, ${person.title}` when `person.title` is set, then `` `. Role: ${PERSON_ROLE_LABELS[link.role]}.` ``, then when `link.stageId` is set and matches a stage in `view.stages`, `` ` Stage: ${thatStage.label}.` `` (never escaped: this text sits in a plain sentence, not a table cell), then when `person.linkedinUrl` is set, `` ` LinkedIn: ${person.linkedinUrl}.` ``. Push `head`. Never read or print `person.email` anywhere (D29). When `person.notesMd` is a non-null, non-empty string, push `"  Notes:"`, then push every line of `person.notesMd.split(/\r\n|\r|\n/)` with `"  "` prepended (this keeps the notes as a continuation of the same bullet, indented under the `"- "` marker). Blank line after the loop.
6. `"## Preferences"`, blank line, `"No preferences saved yet."`, blank line (D29: fixed text until Milestone 5, so this section needs no input at all).
7. `"## Artifacts"`, blank line. Build `rows` as `view.documents` sorted by `key` (ascending, `localeCompare`), each tagged `"job"`, followed by `input.companyDocuments` sorted by `key` the same way, each tagged `"company"`. When `rows.length === 0`, push `"No artifacts yet."` (no header, no separator line: an empty Artifacts section reads the same shallow shape as an empty People section). Otherwise push the two header lines `"| Key | Kind | Scope | Stage | Version | Updated |"` and `"|---|---|---|---|---|---|"`, then for each row: `stageLabel` is, when `row.stageId` is set and matches a stage in `view.stages`, that stage's `label`, else `""`; push `` `| ${escapeCell(row.key)} | ${kindInfo(row.kind).label} | ${tag} | ${escapeCell(stageLabel)} | ${row.version} | ${row.updatedAt.toISOString()} |` ``.
8. Push a final empty string (so the joined document ends with a trailing newline), then `return lines.join("\n")`.

The whole function never reads `person.email`, never reads any `profile` or resume field (it has no such input to read), and never spreads an entire row object into the output; every value that reaches the string is named individually above.

- [ ] **Step 16: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/bridge-context.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 4 passed (4)`.

- [ ] **Step 17: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Expected: all three exit 0, with `pnpm test` reporting every existing test still passing alongside the 8 + 13 + 19 + 4 = 44 new ones.

- [ ] **Step 18: Commit**

```bash
git add lib/bridge/errors.ts lib/bridge/push-schema.ts lib/bridge/http.ts lib/bridge/context.ts tests/unit/bridge-errors.test.ts tests/unit/bridge-http.test.ts tests/unit/bridge-push-schema.test.ts tests/unit/bridge-context.test.ts
git commit -m "$(cat <<'EOF'
feat: add the bridge's error table, capped JSON reader, push schema and context document builder
EOF
)"
```

---

### Task 7: Bridge handlers and routes, plus the proxy exclusion

D6, D7 and D8 all land here: handlers that never touch the session, a matcher that keeps the proxy off the bridge entirely, and route files that are two-line wrappers.

**Files:**
- Create: `lib/bridge/handlers.ts`, `lib/bridge/deps.ts`, `app/api/bridge/opportunities/route.ts`, `app/api/bridge/opportunities/[slug]/context/route.ts`, `app/api/bridge/opportunities/[slug]/artifacts/route.ts`, `tests/integration/bridge-handlers.test.ts`, `tests/unit/proxy-matcher.test.ts`
- Modify: `proxy.ts`

**Interfaces:**
- Consumes: `parseBearer`, `readJsonCapped`, `bridgeJson`, `bridgeError` from `lib/bridge/http.ts` (Task 6). `BRIDGE_ERRORS` type only (via `bridgeError`) from `lib/bridge/errors.ts` (Task 6). `pushBodySchema`, `firstIssue`, `toIncoming` from `lib/bridge/push-schema.ts` (Task 6). `buildContextDocument` from `lib/bridge/context.ts` (Task 6). `MAX_ARTIFACTS_PER_PUSH`, `MAX_PUSH_BYTES`, `RATE_LIMIT_PER_MINUTE`, `WireOpportunity`, `WireStatus`, `WirePushResponse`, `WireListResponse` from `lib/bridge/wire.ts` (Task 3). `utf8Bytes` from `lib/artifacts/normalize.ts` (Task 3). `upsertArtifacts` from `lib/artifacts/upsert.ts` (Task 4). `getDocument` is not needed here (context uses `getJobView` directly, not a single document). `authenticateBearer` from `lib/auth/api-token.ts` (Task 5). `scoped`, `type Scoped`, `type Db` from `lib/db/scoped` and `lib/db/client.ts`. `getJobView`, `type JobView` from `lib/pipeline/read.ts` (Milestone 2, extended by Task 4). `getDb` from `lib/db/client.ts` (Milestone 1, `deps.ts` only). `revalidatePath` from `next/cache` (`deps.ts` only). `defaultStages` from `lib/pipeline/rules.ts`, `createTestUser`, `makeTestDb` from `tests/helpers/db.ts`, `createApiToken`, `revokeApiToken` from `lib/auth/api-token.ts` (the test file only).
- Produces (copied from the frame character for character):

```typescript
// lib/bridge/handlers.ts
export type BridgeDeps = { db: Db; now(): Date; revalidate(path: string): void; requestId(): string };
export function handleListOpportunities(deps: BridgeDeps, request: Request): Promise<Response>;
export function handleGetContext(deps: BridgeDeps, request: Request, slug: string): Promise<Response>;
export function handlePushArtifacts(deps: BridgeDeps, request: Request, slug: string): Promise<Response>;
// lib/bridge/deps.ts: the only bridge file that imports @/lib/db/client and next/cache
export function productionDeps(): BridgeDeps;   // getDb(), () => new Date(), revalidatePath, crypto.randomUUID
```

Route files: `app/api/bridge/opportunities/route.ts` (`GET`, `return handleListOpportunities(productionDeps(), request)`), `app/api/bridge/opportunities/[slug]/context/route.ts` (`GET`) and `app/api/bridge/opportunities/[slug]/artifacts/route.ts` (`PUT`), the last two `return handleX(productionDeps(), request, (await ctx.params).slug)` with `ctx: RouteContext<"<their route literal>">`.

**Global constraints restated for this task:** every handler authenticates the bearer token itself and never calls `getSession`, `requireUser` or `cookies()` (D6); `proxy.ts` is an extra layer for pages and never the only check, and it must never be the ONLY thing standing between a stray cookie and a bridge response, which is exactly what the "session-looking cookie" test below proves. `lib/bridge/deps.ts` is the only bridge file that imports `@/lib/db/client` or `next/cache`; every other bridge file (including `handlers.ts` itself) takes its database handle and its side effects as `BridgeDeps` parameters, which is what lets Task 6 and this task's own handler logic run against PGlite with no server and no Next.js request context. Before writing the route files or the proxy change, read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (the `RouteContext` helper, generated by `next typegen`/`next dev`/`next build` and globally available with no import) and `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` (the `matcher` config shape).

- [ ] **Step 1: Write the failing integration test**

This is the whole bridge surface exercised directly against the handlers, on PGlite, with no server: the same shape a planning scratch file already proved works. Every test builds its own `Request` and calls a handler function; nothing here imports the route files (those are two-line wrappers with nothing of their own to test, verified only by `pnpm typecheck` in Step 11).

Create `tests/integration/bridge-handlers.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import type { Db } from "@/lib/db/client";
import type { BridgeDeps } from "@/lib/bridge/handlers";
import { handleListOpportunities, handleGetContext, handlePushArtifacts } from "@/lib/bridge/handlers";
import { createApiToken, revokeApiToken } from "@/lib/auth/api-token";
import { defaultStages } from "@/lib/pipeline/rules";
import { RATE_LIMIT_PER_MINUTE } from "@/lib/bridge/wire";

const BASE = "http://test.local";

function testDeps(db: Db, overrides: Partial<BridgeDeps> = {}): { deps: BridgeDeps; revalidated: string[] } {
  const revalidated: string[] = [];
  let counter = 0;
  const deps: BridgeDeps = {
    db,
    now: () => new Date(),
    revalidate: (path) => revalidated.push(path),
    requestId: () => `req-${++counter}`,
    ...overrides,
  };
  return { deps, revalidated };
}

async function seedJob(
  db: Db,
  opts: { slug: string; email: string; companyName?: string; nameKey?: string },
) {
  const user = await createTestUser(db, opts.email);
  const s = scoped(db, user.id);
  const company = await s.company.insert({
    name: opts.companyName ?? "Acme Robotics",
    nameKey: opts.nameKey ?? `acme-${opts.slug}`,
  });
  const opportunity = await s.opportunity.insert({
    companyId: company.id,
    slug: opts.slug,
    roleTitle: "Product Designer",
  });
  const drafts = defaultStages();
  const stages = await s.stage.insertMany(
    drafts.map((d, i) => ({ opportunityId: opportunity.id, kind: d.kind, label: d.label, position: i })),
  );
  await s.opportunity.update(opportunity.id, { currentStageId: stages[0]!.id });
  const created = await createApiToken(s, "Test");
  if (!created.ok) throw new Error("token setup failed");
  return { user, s, company, opportunity, stages, token: created.data.token };
}

describe("bridge authentication", () => {
  it("401 for no Authorization header", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { deps } = testDeps(db);
      const response = await handleListOpportunities(deps, new Request(`${BASE}/api/bridge/opportunities`));
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("unauthorized");
    } finally {
      await close();
    }
  });

  it("401 for a Basic scheme header", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { deps } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities`, {
        headers: { authorization: `Basic ${btoa("a:b")}` },
      });
      expect((await handleListOpportunities(deps, request)).status).toBe(401);
    } finally {
      await close();
    }
  });

  it("401 for a bearer value that does not match TOKEN_PATTERN", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { deps } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities`, {
        headers: { authorization: "Bearer not-a-real-token" },
      });
      expect((await handleListOpportunities(deps, request)).status).toBe(401);
    } finally {
      await close();
    }
  });

  it("401 for a well-shaped but unknown token", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { deps } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities`, {
        headers: { authorization: `Bearer jsm_${"z".repeat(43)}` },
      });
      expect((await handleListOpportunities(deps, request)).status).toBe(401);
    } finally {
      await close();
    }
  });

  it("401 for a revoked token", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s, token } = await seedJob(db, { slug: "acme-designer", email: "alice@example.com" });
      const list = await s.apiToken.list();
      await revokeApiToken(s, list[0]!.id);
      const { deps } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect((await handleListOpportunities(deps, request)).status).toBe(401);
    } finally {
      await close();
    }
  });

  it("401 for a request carrying only a session-looking cookie, proving the bridge never reads cookies", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { deps } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities`, {
        headers: { cookie: "better-auth.session_token=some-real-looking-session-value" },
      });
      const response = await handleListOpportunities(deps, request);
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("unauthorized");
    } finally {
      await close();
    }
  });
});

describe("bridge rate limiting", () => {
  it("allows exactly RATE_LIMIT_PER_MINUTE requests in one window and 429s the next, with Retry-After", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seedJob(db, { slug: "acme-designer", email: "rate@example.com" });
      const fixedNow = new Date("2026-10-01T10:00:05.000Z");
      const { deps } = testDeps(db, { now: () => fixedNow });
      const request = () =>
        new Request(`${BASE}/api/bridge/opportunities`, { headers: { authorization: `Bearer ${token}` } });

      let last!: Response;
      for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) {
        last = await handleListOpportunities(deps, request());
        expect(last.status).toBe(200);
      }
      const overLimit = await handleListOpportunities(deps, request());
      expect(overLimit.status).toBe(429);
      const body = await overLimit.json();
      expect(body.error.code).toBe("rate_limited");
      const retryAfter = Number(overLimit.headers.get("Retry-After"));
      expect(retryAfter).toBeGreaterThanOrEqual(1);
      expect(retryAfter).toBeLessThanOrEqual(60);
    } finally {
      await close();
    }
  });
});

describe("handleListOpportunities", () => {
  it("lists active jobs by default and maps every field", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token, stages } = await seedJob(db, { slug: "acme-designer", email: "list1@example.com" });
      const { deps } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const response = await handleListOpportunities(deps, request);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.opportunities).toEqual([
        {
          slug: "acme-designer",
          company: "Acme Robotics",
          role: "Product Designer",
          status: "active",
          stage: { kind: stages[0]!.kind, label: stages[0]!.label },
        },
      ]);
      expect(body.requestId).toBe(response.headers.get("x-request-id"));
    } finally {
      await close();
    }
  });

  it("status=closed and status=all both work; an unrecognized status is 400 invalid_query", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s, token, opportunity } = await seedJob(db, { slug: "acme-designer", email: "list2@example.com" });
      await s.opportunity.update(opportunity.id, {
        status: "closed",
        closedReason: "withdrawn",
        closedAt: new Date(),
      });
      const { deps } = testDeps(db);
      const auth = { headers: { authorization: `Bearer ${token}` } };

      const active = await handleListOpportunities(deps, new Request(`${BASE}/api/bridge/opportunities`, auth));
      expect((await active.json()).opportunities).toEqual([]);

      const closed = await handleListOpportunities(
        deps,
        new Request(`${BASE}/api/bridge/opportunities?status=closed`, auth),
      );
      expect((await closed.json()).opportunities).toHaveLength(1);

      const all = await handleListOpportunities(deps, new Request(`${BASE}/api/bridge/opportunities?status=all`, auth));
      expect((await all.json()).opportunities).toHaveLength(1);

      const bad = await handleListOpportunities(
        deps,
        new Request(`${BASE}/api/bridge/opportunities?status=nope`, auth),
      );
      expect(bad.status).toBe(400);
      expect((await bad.json()).error).toEqual({
        code: "invalid_query",
        message: "status must be active, closed or all.",
      });
    } finally {
      await close();
    }
  });
});

describe("handleGetContext", () => {
  it("200 with a markdown content type and every section heading", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seedJob(db, { slug: "acme-designer", email: "ctx1@example.com" });
      const { deps } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities/acme-designer/context`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const response = await handleGetContext(deps, request, "acme-designer");
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-request-id")).toBeTruthy();
      const text = await response.text();
      expect(text).toContain("jobsmith: context/v1");
      expect(text).toContain("## Posting");
      expect(text).toContain("## Stages");
      expect(text).toContain("## People");
      expect(text).toContain("## Preferences");
      expect(text).toContain("## Artifacts");
    } finally {
      await close();
    }
  });

  it("404 not_found for an unknown slug", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seedJob(db, { slug: "acme-designer", email: "ctx2@example.com" });
      const { deps } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities/no-such-job/context`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const response = await handleGetContext(deps, request, "no-such-job");
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("not_found");
    } finally {
      await close();
    }
  });

  it("404 for a slug that belongs to another user", async () => {
    const { db, close } = await makeTestDb();
    try {
      await seedJob(db, { slug: "acme-designer", email: "ctx3a@example.com" });
      const { token: bobToken } = await seedJob(db, {
        slug: "northwind-designer",
        email: "ctx3b@example.com",
        companyName: "Northwind Labs",
        nameKey: "northwind-ctx3",
      });
      const { deps } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities/acme-designer/context`, {
        headers: { authorization: `Bearer ${bobToken}` },
      });
      const response = await handleGetContext(deps, request, "acme-designer");
      expect(response.status).toBe(404);
    } finally {
      await close();
    }
  });
});

describe("handlePushArtifacts, validation", () => {
  it("400 invalid_query for a dry_run value that is not true, false, 0 or 1", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seedJob(db, { slug: "acme-designer", email: "push1@example.com" });
      const { deps } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities/acme-designer/artifacts?dry_run=maybe`, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ artifacts: [{ key: "cv", kind: "cv", body_md: "# CV" }] }),
      });
      const response = await handlePushArtifacts(deps, request, "acme-designer");
      expect(response.status).toBe(400);
      expect((await response.json()).error).toEqual({
        code: "invalid_query",
        message: "dry_run must be true or false.",
      });
    } finally {
      await close();
    }
  });

  it("404 not_found for an unknown slug, before the body is ever read", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seedJob(db, { slug: "acme-designer", email: "push2@example.com" });
      const { deps } = testDeps(db);
      // A body that would fail to parse if it were ever read: the 404 must
      // still win, proving the slug lookup runs before readJsonCapped.
      const request = new Request(`${BASE}/api/bridge/opportunities/no-such-job/artifacts`, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}` },
        body: "{not json",
      });
      const response = await handlePushArtifacts(deps, request, "no-such-job");
      expect(response.status).toBe(404);
    } finally {
      await close();
    }
  });

  it("413 payload_too_large for a body over 4 MB", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seedJob(db, { slug: "acme-designer", email: "push3@example.com" });
      const { deps } = testDeps(db);
      const huge = "x".repeat(5_000_000);
      const request = new Request(`${BASE}/api/bridge/opportunities/acme-designer/artifacts`, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ artifacts: [{ key: "cv", kind: "cv", body_md: huge }] }),
      });
      const response = await handlePushArtifacts(deps, request, "acme-designer");
      expect(response.status).toBe(413);
      expect((await response.json()).error.code).toBe("payload_too_large");
    } finally {
      await close();
    }
  });

  it("400 invalid_json for malformed JSON", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seedJob(db, { slug: "acme-designer", email: "push4@example.com" });
      const { deps } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities/acme-designer/artifacts`, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}` },
        body: "{not json",
      });
      const response = await handlePushArtifacts(deps, request, "acme-designer");
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("invalid_json");
    } finally {
      await close();
    }
  });

  it("413 too_many_artifacts for 51 artifacts, checked before the Zod schema even runs", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seedJob(db, { slug: "acme-designer", email: "push5@example.com" });
      const { deps } = testDeps(db);
      // Every artifact here is individually well-formed; only the count is
      // wrong, so a version of the handler that ran the schema first would
      // let this through to invalid_payload or 200 instead.
      const artifacts = Array.from({ length: 51 }, (_, i) => ({ key: `k${i}`, kind: "cv", body_md: `# ${i}` }));
      const request = new Request(`${BASE}/api/bridge/opportunities/acme-designer/artifacts`, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ artifacts }),
      });
      const response = await handlePushArtifacts(deps, request, "acme-designer");
      expect(response.status).toBe(413);
      expect((await response.json()).error.code).toBe("too_many_artifacts");
    } finally {
      await close();
    }
  });

  it("400 invalid_payload with the firstIssue text for a schema violation", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seedJob(db, { slug: "acme-designer", email: "push6@example.com" });
      const { deps } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities/acme-designer/artifacts`, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ artifacts: [{ key: "Not Valid!", kind: "cv", body_md: "# CV" }] }),
      });
      const response = await handlePushArtifacts(deps, request, "acme-designer");
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("invalid_payload");
      expect(body.error.message).toBe(
        "artifacts.0.key: key must be 1 to 100 lowercase letters, digits, dots, dashes or underscores, starting with a letter or digit.",
      );
    } finally {
      await close();
    }
  });

  it("413 artifact_too_large for a body_md over 1 MB, naming the key", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seedJob(db, { slug: "acme-designer", email: "push7@example.com" });
      const { deps } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities/acme-designer/artifacts`, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ artifacts: [{ key: "cv", kind: "cv", body_md: "a".repeat(1_048_577) }] }),
      });
      const response = await handlePushArtifacts(deps, request, "acme-designer");
      expect(response.status).toBe(413);
      const body = await response.json();
      expect(body.error).toEqual({ code: "artifact_too_large", message: "cv is larger than 1 MB." });
    } finally {
      await close();
    }
  });

  it("400 duplicate_key for a repeated key in one push", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seedJob(db, { slug: "acme-designer", email: "push8@example.com" });
      const { deps } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities/acme-designer/artifacts`, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({
          artifacts: [
            { key: "cv", kind: "cv", body_md: "# CV one" },
            { key: "cv", kind: "cv", body_md: "# CV two" },
          ],
        }),
      });
      const response = await handlePushArtifacts(deps, request, "acme-designer");
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toEqual({ code: "duplicate_key", message: "The key cv appears more than once in this push." });
    } finally {
      await close();
    }
  });
});

describe("handlePushArtifacts, applying a push", () => {
  it("creates every artifact, reports created, writes one event, and revalidates only the pushed job", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s, token, opportunity } = await seedJob(db, { slug: "acme-designer", email: "apply1@example.com" });
      const { deps, revalidated } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities/acme-designer/artifacts`, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({
          artifacts: [
            { key: "cv", kind: "cv", body_md: "# CV" },
            { key: "cover-letter", kind: "cover_letter", body_md: "# Cover letter" },
          ],
        }),
      });
      const response = await handlePushArtifacts(deps, request, "acme-designer");
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.dryRun).toBe(false);
      expect(body.results).toEqual(
        expect.arrayContaining([
          { key: "cv", scope: "opportunity", status: "created", version: 1 },
          { key: "cover-letter", scope: "opportunity", status: "created", version: 1 },
        ]),
      );
      expect(body.warnings).toEqual([]);

      const events = await s.event.listForOpportunity(opportunity.id);
      expect(events.filter((e) => e.kind === "artifact_pushed")).toHaveLength(1);
      expect(revalidated).toEqual(["/jobs/acme-designer"]);
    } finally {
      await close();
    }
  });

  it("a repeat push reports unchanged, writes no new event, and revalidates nothing", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s, token, opportunity } = await seedJob(db, { slug: "acme-designer", email: "apply2@example.com" });
      const push = () =>
        handlePushArtifacts(
          testDeps(db).deps,
          new Request(`${BASE}/api/bridge/opportunities/acme-designer/artifacts`, {
            method: "PUT",
            headers: { authorization: `Bearer ${token}` },
            body: JSON.stringify({ artifacts: [{ key: "cv", kind: "cv", body_md: "# CV" }] }),
          }),
          "acme-designer",
        );

      const first = await push();
      expect((await first.json()).results).toEqual([{ key: "cv", scope: "opportunity", status: "created", version: 1 }]);

      const { deps: secondDeps, revalidated } = testDeps(db);
      const second = await handlePushArtifacts(
        secondDeps,
        new Request(`${BASE}/api/bridge/opportunities/acme-designer/artifacts`, {
          method: "PUT",
          headers: { authorization: `Bearer ${token}` },
          body: JSON.stringify({ artifacts: [{ key: "cv", kind: "cv", body_md: "# CV" }] }),
        }),
        "acme-designer",
      );
      expect((await second.json()).results).toEqual([
        { key: "cv", scope: "opportunity", status: "unchanged", version: 1 },
      ]);
      expect(revalidated).toEqual([]);

      const events = await s.event.listForOpportunity(opportunity.id);
      expect(events.filter((e) => e.kind === "artifact_pushed")).toHaveLength(1);
    } finally {
      await close();
    }
  });

  it("a dry run reports what would happen and writes and revalidates nothing", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s, token, opportunity } = await seedJob(db, { slug: "acme-designer", email: "apply3@example.com" });
      const { deps, revalidated } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities/acme-designer/artifacts?dry_run=true`, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ artifacts: [{ key: "cv", kind: "cv", body_md: "# CV" }] }),
      });
      const response = await handlePushArtifacts(deps, request, "acme-designer");
      const body = await response.json();
      expect(body.dryRun).toBe(true);
      expect(body.results).toEqual([{ key: "cv", scope: "opportunity", status: "created", version: 1 }]);

      expect(await s.artifact.listLatestForOpportunity(opportunity.id)).toEqual([]);
      expect(await s.event.listForOpportunity(opportunity.id)).toEqual([]);
      expect(revalidated).toEqual([]);
    } finally {
      await close();
    }
  });

  it("revalidates every job at the company for a company-scoped change, and only the one job otherwise", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "apply4@example.com");
      const s = scoped(db, user.id);
      const company = await s.company.insert({ name: "Acme Robotics", nameKey: "acme-apply4" });
      const jobA = await s.opportunity.insert({ companyId: company.id, slug: "acme-designer-a", roleTitle: "Designer" });
      const jobB = await s.opportunity.insert({ companyId: company.id, slug: "acme-designer-b", roleTitle: "Design lead" });
      for (const opp of [jobA, jobB]) {
        const drafts = defaultStages();
        const stages = await s.stage.insertMany(
          drafts.map((d, i) => ({ opportunityId: opp.id, kind: d.kind, label: d.label, position: i })),
        );
        await s.opportunity.update(opp.id, { currentStageId: stages[0]!.id });
      }
      const created = await createApiToken(s, "Test");
      if (!created.ok) throw new Error("token setup failed");
      const token = created.data.token;

      // A job-scoped push to A only revalidates A.
      const jobScoped = testDeps(db);
      await handlePushArtifacts(
        jobScoped.deps,
        new Request(`${BASE}/api/bridge/opportunities/acme-designer-a/artifacts`, {
          method: "PUT",
          headers: { authorization: `Bearer ${token}` },
          body: JSON.stringify({ artifacts: [{ key: "cv", kind: "cv", body_md: "# CV" }] }),
        }),
        "acme-designer-a",
      );
      expect(jobScoped.revalidated).toEqual(["/jobs/acme-designer-a"]);

      // A company-scoped push to A revalidates both A and B, with no duplicates.
      const companyScoped = testDeps(db);
      const response = await handlePushArtifacts(
        companyScoped.deps,
        new Request(`${BASE}/api/bridge/opportunities/acme-designer-a/artifacts`, {
          method: "PUT",
          headers: { authorization: `Bearer ${token}` },
          body: JSON.stringify({
            artifacts: [{ key: "recon", kind: "research", scope: "company", body_md: "# Recon" }],
          }),
        }),
        "acme-designer-a",
      );
      expect(response.status).toBe(200);
      expect(new Set(companyScoped.revalidated)).toEqual(new Set(["/jobs/acme-designer-a", "/jobs/acme-designer-b"]));
      expect(companyScoped.revalidated).toHaveLength(2);
    } finally {
      await close();
    }
  });

  it("user B's token gets 404 for user A's slug, and a push through it changes nothing of A's", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s: sa, opportunity } = await seedJob(db, { slug: "acme-designer", email: "tenant-a@example.com" });
      const { token: bobToken } = await seedJob(db, {
        slug: "northwind-designer",
        email: "tenant-b@example.com",
        companyName: "Northwind Labs",
        nameKey: "northwind-tenant-b",
      });
      const { deps } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities/acme-designer/artifacts`, {
        method: "PUT",
        headers: { authorization: `Bearer ${bobToken}` },
        body: JSON.stringify({ artifacts: [{ key: "cv", kind: "cv", body_md: "# Hacked" }] }),
      });
      const response = await handlePushArtifacts(deps, request, "acme-designer");
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("not_found");
      expect(await sa.artifact.listLatestForOpportunity(opportunity.id)).toEqual([]);
    } finally {
      await close();
    }
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/integration/bridge-handlers.test.ts
```

Expected: fails with `Cannot find module '@/lib/bridge/handlers'`.

- [ ] **Step 3: Implement `lib/bridge/handlers.ts`**

Imports: `parseBearer`, `readJsonCapped`, `bridgeJson`, `bridgeError` from `./http`; `pushBodySchema`, `firstIssue`, `toIncoming` from `./push-schema`; `buildContextDocument` from `./context`; `MAX_ARTIFACTS_PER_PUSH`, `MAX_PUSH_BYTES`, `RATE_LIMIT_PER_MINUTE`, `type WireOpportunity`, `type WireStatus` from `./wire`; `utf8Bytes` from `@/lib/artifacts/normalize`; `upsertArtifacts` from `@/lib/artifacts/upsert`; `authenticateBearer` from `@/lib/auth/api-token`; `scoped`, `type Scoped` from `@/lib/db/scoped`; `type Db` from `@/lib/db/client`; `getJobView` from `@/lib/pipeline/read`.

```typescript
export type BridgeDeps = { db: Db; now(): Date; revalidate(path: string): void; requestId(): string };
```

A private helper, not exported, shared by all three handlers, does the D6/D4 authentication and rate-limit gate:

1. `authenticate(deps: BridgeDeps, request: Request, requestId: string, now: Date): Promise<{ ok: true; userId: string; s: Scoped } | { ok: false; response: Response }>`.
2. `token = parseBearer(request.headers.get("authorization"))`. `request.headers.get("cookie")` is never read anywhere in this function or its callers: that omission is what makes the "session-looking cookie" test pass, since there is simply no code path that looks at a cookie. When `token` is `null`, return `{ ok: false, response: bridgeError("unauthorized", requestId) }`.
3. `auth = await authenticateBearer(deps.db, token, now)`. When `null`, same `unauthorized` response.
4. When `auth.count > RATE_LIMIT_PER_MINUTE`: `windowEndMs = auth.windowStart.getTime() + 60_000`; `secondsLeft = Math.max(1, Math.ceil((windowEndMs - now.getTime()) / 1000))`; return `{ ok: false, response: bridgeError("rate_limited", requestId, { seconds: secondsLeft }, { "Retry-After": String(secondsLeft) }) }`.
5. Otherwise return `{ ok: true, userId: auth.userId, s: scoped(deps.db, auth.userId) }`.

The `now` this helper receives is captured once per request by the exported handler that calls it (Step 6 below), not re-read from `deps.now()` a second time inside this helper: two separate `deps.now()` calls could, in a real server, straddle the window boundary between authenticating and computing `Retry-After`, which is exactly the scenario the `Math.max(1, ...)` clamp above exists for. Capturing `now` once removes the scenario entirely and keeps the clamp purely defensive.

A private slug-shape check, also shared and not exported: `isValidSlugShape(slug: string): boolean` returns `/^[a-z0-9-]{1,100}$/.test(slug)`.

- [ ] **Step 4: Implement `handleListOpportunities`**

1. `const requestId = deps.requestId();` (before the `try`, so a request id always exists even if something below throws before `now` or `authenticate` runs. In practice `deps.requestId()` is `crypto.randomUUID()` in production and a plain synchronous counter in tests, neither of which throws, but the ordering itself costs nothing and removes any doubt).
2. `try { ... } catch (error) { console.error("[bridge]", requestId, error); return bridgeError("server_error", requestId); }` wraps everything below.
3. `const now = deps.now();`
4. `const auth = await authenticate(deps, request, requestId, now); if (!auth.ok) return auth.response;`
5. `const status = new URL(request.url).searchParams.get("status") ?? "active";`
6. When `status` is not one of `"active"`, `"closed"`, `"all"`: `return bridgeError("invalid_query", requestId, { text: "status must be active, closed or all." });`
7. `const summaries = await auth.s.opportunity.listSummaries(status as "active" | "closed" | "all");`
8. Map each summary to `WireOpportunity`: `{ slug: s.slug, company: s.companyName, role: s.roleTitle, status: s.status, stage: { kind: s.stage.kind, label: s.stage.label } }`.
9. `return bridgeJson({ opportunities, requestId }, { requestId });` (status defaults to 200). This handler never calls `deps.revalidate`: reading the list changes nothing.

- [ ] **Step 5: Implement `handleGetContext`**

1. Same `requestId`/try-catch/`now`/`authenticate` opening as Step 4.
2. When `!isValidSlugShape(slug)`: `return bridgeError("not_found", requestId, { slug });` (an invalid shape is reported exactly like a real miss, per the frame: never distinguish the two to the caller).
3. `const view = await getJobView(auth.s, slug); if (!view) return bridgeError("not_found", requestId, { slug });`
4. `const companyDocuments = await auth.s.artifact.listLatestForCompany(view.company.id);`
5. `const doc = buildContextDocument({ view, companyDocuments, generatedAt: now });`
6. `return new Response(doc, { status: 200, headers: { "content-type": "text/markdown; charset=utf-8", "x-request-id": requestId, "cache-control": "no-store" } });` This handler also never calls `deps.revalidate`.

- [ ] **Step 6: Implement `handlePushArtifacts`**

1. Same `requestId`/try-catch/`now`/`authenticate` opening.
2. Slug shape check, same as Step 5.
3. `dryRun`: the handler's own type is the plain `Request` (per D8 and the frame's exact signature), not `NextRequest`, so there is no `request.nextUrl` to read; use `new URL(request.url).searchParams.get("dry_run")` instead. `null`, `"false"` or `"0"` means `dryRun = false`; `"true"` or `"1"` means `dryRun = true`; anything else: `return bridgeError("invalid_query", requestId, { text: "dry_run must be true or false." });`
4. `const opportunity = await auth.s.opportunity.getBySlug(slug); if (!opportunity) return bridgeError("not_found", requestId, { slug });` This runs before the body is read at all, satisfying the frame's explicit ordering and the test that proves it with an unparsable body on an unknown slug.
5. `const bodyResult = await readJsonCapped(request, MAX_PUSH_BYTES); if (!bodyResult.ok) return bridgeError(bodyResult.code, requestId);` (`bodyResult.code` is already one of `"payload_too_large" | "invalid_json"`, both valid `BridgeErrorCode` values, so no translation is needed).
6. Peek at the artifact count before running the full schema: when `bodyResult.data` is a plain object with an `artifacts` property that is an array longer than `MAX_ARTIFACTS_PER_PUSH`, `return bridgeError("too_many_artifacts", requestId);` A minimal, defensive shape check is enough here (`typeof bodyResult.data === "object" && bodyResult.data !== null && Array.isArray((bodyResult.data as { artifacts?: unknown }).artifacts)`), since this step exists only to short-circuit an oversize array before Step 7's full validation, not to validate the shape itself, which Step 7 already does completely.
7. `const parsed = pushBodySchema.safeParse(bodyResult.data); if (!parsed.success) return bridgeError("invalid_payload", requestId, { text: firstIssue(parsed.error) });`
8. For each artifact in `parsed.data.artifacts`, in order: when `utf8Bytes(artifact.body_md) > MAX_ARTIFACT_BYTES`, `return bridgeError("artifact_too_large", requestId, { key: artifact.key });` (stop at the first oversize artifact found; do not keep scanning).
9. Track keys seen so far in a `Set<string>`; for each artifact in order, when its `key` is already in the set, `return bridgeError("duplicate_key", requestId, { key: artifact.key });`; otherwise add it.
10. `const inputs = parsed.data.artifacts.map(toIncoming);`
11. `const outcome = await upsertArtifacts(auth.s, opportunity.id, inputs, { origin: "pushed", dryRun, now });`
12. When `!outcome.ok`: `outcome.code === "not_found"` maps to `bridgeError("not_found", requestId, { slug })`. This handles the job existing at Step 4 above and being deleted in the moment between that check and this transaction, not exercised by any test but a real possibility under concurrent access, not a bug in this handler. Any other code maps to `bridgeError("invalid_payload", requestId, { text: outcome.message })`.
13. On success, `outcome.data: { results, warnings }`. Build the wire results: every result's `status` is `"created" | "versioned" | "updated" | "unchanged" | "edited"` (`UpsertStatus`), but a push (`origin: "pushed"`) never produces `"edited"` (`planUpsert`'s rule 4, the only rule that ever returns `"edited"`, only fires for origin `"manual"`). Map each result to `{ key, scope, status, version }`, narrowing or asserting `status` to `WireStatus` (whichever reads cleanest against this file's own lint rules, a type predicate or a commented `as WireStatus`), since the origin guarantee above is what makes it sound, not a runtime check.
14. `const changed = outcome.data.results.some((r) => r.status !== "unchanged");`
15. When `!dryRun && changed`: `deps.revalidate(\`/jobs/${slug}\`);` Then, when any changed result has `scope === "company"`: `const companySlugs = await auth.s.opportunity.listSlugsForCompany(opportunity.companyId); for (const otherSlug of companySlugs) { if (otherSlug !== slug) deps.revalidate(\`/jobs/${otherSlug}\`); }` (the pushed job's own slug was already revalidated on the line above; this loop skips it so it is never revalidated twice).
16. `return bridgeJson({ dryRun, results, warnings: outcome.data.warnings, requestId }, { requestId });`

- [ ] **Step 7: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/integration/bridge-handlers.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 25 passed (25)` (6 authentication + 1 rate limiting + 2 list + 3 context + 8 push validation + 5 push application).

- [ ] **Step 8: Write `lib/bridge/deps.ts` in full**

```typescript
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";
import type { BridgeDeps } from "./handlers";

export function productionDeps(): BridgeDeps {
  return {
    db: getDb(),
    now: () => new Date(),
    revalidate: (path) => revalidatePath(path),
    requestId: () => crypto.randomUUID(),
  };
}
```

- [ ] **Step 9: Write the three route files in full**

Per the guide read in this task's header note, `RouteContext<'route literal'>` is generated by `next typegen` (which `pnpm typecheck` runs first) and needs no import.

Create `app/api/bridge/opportunities/route.ts`:

```typescript
import { handleListOpportunities } from "@/lib/bridge/handlers";
import { productionDeps } from "@/lib/bridge/deps";

export async function GET(request: Request) {
  return handleListOpportunities(productionDeps(), request);
}
```

Create `app/api/bridge/opportunities/[slug]/context/route.ts`:

```typescript
import { handleGetContext } from "@/lib/bridge/handlers";
import { productionDeps } from "@/lib/bridge/deps";

export async function GET(request: Request, ctx: RouteContext<"/api/bridge/opportunities/[slug]/context">) {
  const { slug } = await ctx.params;
  return handleGetContext(productionDeps(), request, slug);
}
```

Create `app/api/bridge/opportunities/[slug]/artifacts/route.ts`:

```typescript
import { handlePushArtifacts } from "@/lib/bridge/handlers";
import { productionDeps } from "@/lib/bridge/deps";

export async function PUT(request: Request, ctx: RouteContext<"/api/bridge/opportunities/[slug]/artifacts">) {
  const { slug } = await ctx.params;
  return handlePushArtifacts(productionDeps(), request, slug);
}
```

These three files have nothing of their own worth a dedicated test (D8: they are two-line wrappers); `pnpm typecheck` in Step 14 is what proves the `RouteContext` literals match the real file paths, and Task 14's end-to-end suite is what proves the wiring works against a real server.

- [ ] **Step 10: Write the failing proxy-matcher test**

Verified already, at the planning stage, in planning scratch files: installing the `AsyncLocalStorage` global before dynamically importing `next/experimental/testing/server` and `@/proxy` works under Vitest, and the exact matcher string below produces every assertion below. This step reproduces that proof as a real, permanent unit test.

Create `tests/unit/proxy-matcher.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { AsyncLocalStorage } from "node:async_hooks";

describe("proxy matcher", () => {
  it("excludes every /api/bridge/* path, while still matching pages, /api/auth/* and a near-miss path", async () => {
    // Next's server-testing helpers expect the AsyncLocalStorage global its
    // own runtime installs; Vitest's plain Node environment does not
    // provide it automatically.
    (globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??= AsyncLocalStorage;
    const { unstable_doesMiddlewareMatch } = await import("next/experimental/testing/server");
    const { config } = await import("@/proxy");
    const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

    expect(matches("/api/bridge/opportunities")).toBe(false);
    expect(matches("/api/bridge/opportunities/acme-designer/artifacts")).toBe(false);
    expect(matches("/api/bridge/opportunities/acme-designer/context")).toBe(false);
    // A near-miss path that merely starts with the same characters must
    // still run the proxy: the exclusion is "api/bridge/" as a path
    // segment, not a bare string prefix match on "api/bridge".
    expect(matches("/api/bridgework")).toBe(true);
    expect(matches("/api/auth/sign-in/email")).toBe(true);
    expect(matches("/board")).toBe(true);
    expect(matches("/jobs/acme-designer")).toBe(true);
    expect(matches("/settings")).toBe(true);
    expect(matches("/")).toBe(true);
    expect(matches("/_next/static/chunk.js")).toBe(false);
  });
});
```

- [ ] **Step 11: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/unit/proxy-matcher.test.ts
```

Expected: fails on the three `/api/bridge/*` assertions (today's matcher still runs the proxy there, so `matches(...)` returns `true` where the test expects `false`).

- [ ] **Step 12: Change the matcher in `proxy.ts`**

Edit `proxy.ts`. Only the `matcher` array's regular expression changes; the `proxy` function body is untouched.

```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_PATHS = ["/login", "/setup"];

// A segment match, not pathname.startsWith("/api/auth"): that would also
// treat an unrelated route like "/api/authors" as public.
function isAuthApiPath(pathname: string): boolean {
  return pathname === "/api/auth" || pathname.startsWith("/api/auth/");
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.includes(pathname) || isAuthApiPath(pathname);
  if (isPublic) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    // Carries the query string too, so a return trip after login lands back
    // on the same filtered/paginated/etc. view, not just the same path.
    loginUrl.searchParams.set("from", pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // api/bridge/ is excluded here, in the matcher, rather than with an early
  // return inside proxy() above: when the proxy runs at all, Next buffers
  // the request body before the route handler ever sees it (capped by
  // proxyClientMaxBodySize, 10 MB by default, silently truncated beyond
  // that), which would corrupt a CLI push long before readJsonCapped gets a
  // chance to enforce its own 4 MB limit correctly. Excluding the path from
  // the matcher means the proxy never runs on it at all, so no buffering
  // and no cookie-based redirect ever happens to a bearer-only request.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/bridge/).*)"],
};
```

- [ ] **Step 13: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/proxy-matcher.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 1 passed (1)`.

- [ ] **Step 14: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm test
```

`pnpm typecheck` runs `next typegen` first (via the existing `typecheck` script), which is what generates the `RouteContext<'...'>` literal types the two dynamic route files use; confirm it exits 0 before treating a route file's type error as a real bug. `pnpm test` should report every existing test still passing alongside the 25 new integration tests and 1 new unit test.

- [ ] **Step 15: Commit**

```bash
git add lib/bridge/handlers.ts lib/bridge/deps.ts app/api/bridge proxy.ts tests/integration/bridge-handlers.test.ts tests/unit/proxy-matcher.test.ts
git commit -m "$(cat <<'EOF'
feat: add the three bridge route handlers and exclude /api/bridge from the proxy
EOF
)"
```

---

### Task 8: CLI core

D30's import rule shapes this whole task: everything here compiles standalone, with no path back into the rest of the repo except the one leaf module `lib/bridge/wire.ts`. `collectPacket`'s own test coverage is deliberately not in this task: Task 9's `tests/integration/cli-bridge.test.ts` exercises it end to end against the real fixture packet, which is a more meaningful proof than a synthetic unit test would be for a function whose whole job is "read real files off disk correctly." Nothing here is missing a test; it is tested one task later, against real files.

**Files:**
- Create: `cli/src/io.ts`, `cli/src/args.ts`, `cli/src/config.ts`, `cli/src/frontmatter.ts`, `cli/src/suffixes.ts`, `cli/src/collect.ts`, `cli/src/batch.ts`, `cli/src/output.ts`, `cli/src/version.ts`; `tests/unit/cli-args.test.ts`, `tests/unit/cli-config.test.ts`, `tests/unit/cli-frontmatter.test.ts`, `tests/unit/cli-suffixes.test.ts`, `tests/unit/cli-batch.test.ts`, `tests/unit/cli-output.test.ts`, `tests/unit/cli-imports.test.ts`

**Interfaces:**
- Consumes: `KEY_PATTERN`, `MAX_ARTIFACT_BYTES`, `MAX_ARTIFACTS_PER_PUSH`, `MAX_PUSH_BYTES`, `WireArtifact`, `WireOpportunity`, `WirePushResponse`, `WireStatus` from `lib/bridge/wire.ts` (Task 3, the only repo module `cli/src` may import; test files, which sit outside `cli/src`, are free to also import `ARTIFACT_KIND_VALUES` from `lib/artifacts/kinds.ts` and `STAGE_KIND_VALUES` from `lib/pipeline/values.ts` purely to cross-check the built-in suffix map's values against the real registries).
- Produces (copied from the frame character for character):

```typescript
// cli/src/io.ts
export type CliIo = { fetch: typeof fetch; env: Record<string, string | undefined>; cwd: string; homedir: string; stdout(text: string): void; stderr(text: string): void; readSecret(prompt: string): Promise<string> };
// cli/src/args.ts
export type Command = { name: "login"; url: string } | { name: "list" } | { name: "pull"; slug: string; out: string | null } | { name: "push"; slug: string; dir: string | null; prefix: string | null; dryRun: boolean } | { name: "help" } | { name: "version" };
export function parseCommand(argv: string[]): { ok: true; command: Command } | { ok: false; message: string };   // node:util parseArgs, strict
// cli/src/config.ts
export function configPath(env: CliIo["env"], homedir: string): string;
export function readCredentials(io: CliIo): Promise<{ url: string; token: string } | null>;   // env overrides file
export function writeCredentials(io: CliIo, creds: { url: string; token: string }): Promise<string>;   // mkdir 0o700, write 0o600, chmod 0o600 again; returns the path
// cli/src/frontmatter.ts
export function splitFrontmatter(text: string): { data: Record<string, string>; body: string };
// cli/src/suffixes.ts
export type SuffixEntry = { kind?: string; stage?: string; title?: string; scope?: string };
export const BUILT_IN_SUFFIXES: Record<string, SuffixEntry>;
export function mergeSuffixes(base: Record<string, SuffixEntry>, extra: Record<string, SuffixEntry>): Record<string, SuffixEntry>;
export function lookupSuffix(key: string, map: Record<string, SuffixEntry>): SuffixEntry | undefined;   // D33
// cli/src/collect.ts
export type Collected = { items: WireArtifact[]; notes: string[] };
export function collectPacket(options: { dir: string; prefix: string }): Promise<{ ok: true; value: Collected } | { ok: false; message: string }>;
// cli/src/batch.ts
export function batchArtifacts(items: WireArtifact[], limits?: { maxCount: number; maxBytes: number }): WireArtifact[][];   // greedy, serialized JSON size
// cli/src/output.ts
export function formatList(items: WireOpportunity[]): string;
export function formatPushReport(responses: WirePushResponse[], dryRun: boolean): string;
// cli/src/version.ts
export const CLI_VERSION = "0.1.0";
```

**Global constraints restated for this task:** `cli/src` may import only `node:` builtins, its own files, and `@/lib/bridge/wire`; Step 12's import-rule test enforces this mechanically over every `.ts` file under the folder, so a stray import anywhere in this task's own code fails that test immediately rather than surfacing later as a bundling surprise in Task 9. No test file in this task contains a literal API token.

- [ ] **Step 1: Write `cli/src/io.ts` and `cli/src/version.ts` in full**

Create `cli/src/io.ts`:

```typescript
export type CliIo = {
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
  cwd: string;
  homedir: string;
  stdout(text: string): void;
  stderr(text: string): void;
  readSecret(prompt: string): Promise<string>;
};
```

Create `cli/src/version.ts`:

```typescript
export const CLI_VERSION = "0.1.0";
```

Neither file has behavior to test in isolation: `CliIo` is a type with no runtime shape of its own, and `CLI_VERSION` is a literal Task 9's `--version` test (`tests/integration/cli-bridge.test.ts`) already exercises through the real CLI.

- [ ] **Step 2: Write the failing args test**

Create `tests/unit/cli-args.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { parseCommand, USAGE } from "@/cli/src/args";

describe("parseCommand", () => {
  it("parses login with a URL, stripping exactly one trailing slash", () => {
    expect(parseCommand(["login", "--url", "http://localhost:3000/"])).toEqual({
      ok: true,
      command: { name: "login", url: "http://localhost:3000" },
    });
  });

  it("login without --url is a usage error", () => {
    expect(parseCommand(["login"])).toEqual({ ok: false, message: USAGE });
  });

  it("login with a URL missing http:// or https:// gets its own specific message, not the usage block", () => {
    expect(parseCommand(["login", "--url", "ftp://x"])).toEqual({
      ok: false,
      message: "Enter a URL that starts with http:// or https://.",
    });
  });

  it("parses list", () => {
    expect(parseCommand(["list"])).toEqual({ ok: true, command: { name: "list" } });
  });

  it("parses pull with and without --out", () => {
    expect(parseCommand(["pull", "acme-designer"])).toEqual({
      ok: true,
      command: { name: "pull", slug: "acme-designer", out: null },
    });
    expect(parseCommand(["pull", "acme-designer", "--out", "./here"])).toEqual({
      ok: true,
      command: { name: "pull", slug: "acme-designer", out: "./here" },
    });
  });

  it("pull without a slug is a usage error", () => {
    expect(parseCommand(["pull"])).toEqual({ ok: false, message: USAGE });
  });

  it("parses push with every option set", () => {
    expect(parseCommand(["push", "acme-designer", "--dir", "./packet", "--prefix", "nwl", "--dry-run"])).toEqual({
      ok: true,
      command: { name: "push", slug: "acme-designer", dir: "./packet", prefix: "nwl", dryRun: true },
    });
  });

  it("parses push with only a slug, defaulting every option", () => {
    expect(parseCommand(["push", "acme-designer"])).toEqual({
      ok: true,
      command: { name: "push", slug: "acme-designer", dir: null, prefix: null, dryRun: false },
    });
  });

  it("push without a slug is a usage error", () => {
    expect(parseCommand(["push"])).toEqual({ ok: false, message: USAGE });
  });

  it("an unknown command name is a usage error", () => {
    expect(parseCommand(["frobnicate"])).toEqual({ ok: false, message: USAGE });
  });

  it("an unrecognized flag is a usage error", () => {
    expect(parseCommand(["list", "--bogus"])).toEqual({ ok: false, message: USAGE });
  });

  it("--help wins over everything else, regardless of position", () => {
    expect(parseCommand(["--help"])).toEqual({ ok: true, command: { name: "help" } });
    expect(parseCommand(["push", "--help"])).toEqual({ ok: true, command: { name: "help" } });
    expect(parseCommand(["help"])).toEqual({ ok: true, command: { name: "help" } });
  });

  it("--version and the bare word both report the version command", () => {
    expect(parseCommand(["--version"])).toEqual({ ok: true, command: { name: "version" } });
    expect(parseCommand(["version"])).toEqual({ ok: true, command: { name: "version" } });
  });

  it("no arguments at all is a usage error", () => {
    expect(parseCommand([])).toEqual({ ok: false, message: USAGE });
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/unit/cli-args.test.ts
```

Expected: fails with `Cannot find module '@/cli/src/args'`.

- [ ] **Step 4: Write `cli/src/args.ts` in full**

`USAGE` is exported (not just used internally) so `main.ts` (Task 9) can print the identical text to stdout for `--help`, per the frame's "stdout for `--help`, stderr and exit 2 otherwise" rule: one string, two destinations, decided by the caller, not duplicated.

```typescript
import { parseArgs } from "node:util";

export type Command =
  | { name: "login"; url: string }
  | { name: "list" }
  | { name: "pull"; slug: string; out: string | null }
  | { name: "push"; slug: string; dir: string | null; prefix: string | null; dryRun: boolean }
  | { name: "help" }
  | { name: "version" };

export const USAGE = `Usage: jobsmith <command> [options]

  login --url <base-url>          Save the Jobsmith URL and a token (read from standard input)
  list                            List active jobs and their slugs
  pull <slug> [--out <dir>]       Write <slug>-context.md
  push <slug> [--dir <dir>] [--prefix <file-prefix>] [--dry-run]
                                  Push <prefix>-*.md files as documents
`;

export function parseCommand(argv: string[]): { ok: true; command: Command } | { ok: false; message: string } {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    // strict defaults to true: an unrecognized flag or, since
    // allowPositionals is set, anything else out of shape throws here
    // rather than being silently accepted.
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        url: { type: "string" },
        out: { type: "string" },
        dir: { type: "string" },
        prefix: { type: "string" },
        "dry-run": { type: "boolean" },
        help: { type: "boolean" },
        version: { type: "boolean" },
      },
    });
  } catch {
    return { ok: false, message: USAGE };
  }
  const { positionals, values } = parsed;

  if (values.help) {
    return { ok: true, command: { name: "help" } };
  }
  if (values.version) {
    return { ok: true, command: { name: "version" } };
  }

  const [name, ...rest] = positionals;

  switch (name) {
    case "help":
      return { ok: true, command: { name: "help" } };
    case "version":
      return { ok: true, command: { name: "version" } };
    case "login": {
      if (!values.url) {
        return { ok: false, message: USAGE };
      }
      if (!/^https?:\/\//.test(values.url)) {
        return { ok: false, message: "Enter a URL that starts with http:// or https://." };
      }
      return { ok: true, command: { name: "login", url: values.url.replace(/\/$/, "") } };
    }
    case "list":
      return { ok: true, command: { name: "list" } };
    case "pull": {
      const slug = rest[0];
      if (!slug) {
        return { ok: false, message: USAGE };
      }
      return { ok: true, command: { name: "pull", slug, out: values.out ?? null } };
    }
    case "push": {
      const slug = rest[0];
      if (!slug) {
        return { ok: false, message: USAGE };
      }
      return {
        ok: true,
        command: {
          name: "push",
          slug,
          dir: values.dir ?? null,
          prefix: values.prefix ?? null,
          dryRun: values["dry-run"] ?? false,
        },
      };
    }
    default:
      return { ok: false, message: USAGE };
  }
}
```

Every usage-shaped failure (no command, unknown command, unknown flag, missing a required positional) returns the identical `USAGE` string as its `message`; only the login URL-shape check returns different, specific text. `main.ts` (Task 9) treats both the same way structurally (`io.stderr(parsed.message); return 2;`), so this file is the only place that decides which message a given mistake gets.

- [ ] **Step 5: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/cli-args.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 14 passed (14)`.

- [ ] **Step 6: Write the failing frontmatter test**

Create `tests/unit/cli-frontmatter.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { splitFrontmatter } from "@/cli/src/frontmatter";

describe("splitFrontmatter", () => {
  it("returns no data and the whole text when there is no frontmatter block", () => {
    expect(splitFrontmatter("# Title\n\nBody.\n")).toEqual({ data: {}, body: "# Title\n\nBody.\n" });
  });

  it("parses a flat key: value block and strips it from the body", () => {
    const text = '---\nkind: research\nscope: company\ntitle: "Company recon"\n---\n# Recon\n\nText.\n';
    expect(splitFrontmatter(text)).toEqual({
      data: { kind: "research", scope: "company", title: "Company recon" },
      body: "# Recon\n\nText.\n",
    });
  });

  it("tolerates a leading BOM and CRLF line endings", () => {
    const text = "﻿---\r\nkind: debrief\r\n---\r\n# Debrief\r\n";
    expect(splitFrontmatter(text)).toEqual({ data: { kind: "debrief" }, body: "# Debrief\n" });
  });

  it("treats a block that starts with --- but never closes as having no frontmatter at all", () => {
    const text = "---\nkind: debrief\n# Debrief\n";
    expect(splitFrontmatter(text)).toEqual({ data: {}, body: text });
  });

  it("strips matching quotes from a quoted value but leaves an unquoted value untouched", () => {
    const text = '---\ntitle: "Quoted title"\nstage: Unquoted stage\n---\nBody\n';
    expect(splitFrontmatter(text).data).toEqual({ title: "Quoted title", stage: "Unquoted stage" });
  });

  it("ignores a line inside the block that is not itself a key: value pair", () => {
    const text = "---\nkind: debrief\nnot a valid line\nstage: Final loop\n---\nBody\n";
    expect(splitFrontmatter(text).data).toEqual({ kind: "debrief", stage: "Final loop" });
  });
});
```

- [ ] **Step 7: Run it, confirm it fails, implement, confirm it passes**

```bash
pnpm exec vitest run tests/unit/cli-frontmatter.test.ts
```

Expected first: fails with `Cannot find module '@/cli/src/frontmatter'`.

Create `cli/src/frontmatter.ts`. This is a verified planning scratch file, copied over unchanged:

```typescript
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
```

```bash
pnpm exec vitest run tests/unit/cli-frontmatter.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 6 passed (6)`.

- [ ] **Step 8: Write the failing suffixes test**

Create `tests/unit/cli-suffixes.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { BUILT_IN_SUFFIXES, mergeSuffixes, lookupSuffix } from "@/cli/src/suffixes";
import { ARTIFACT_KIND_VALUES } from "@/lib/artifacts/kinds";
import { STAGE_KIND_VALUES } from "@/lib/pipeline/values";

describe("BUILT_IN_SUFFIXES", () => {
  it("names only real artifact kinds", () => {
    for (const [suffix, entry] of Object.entries(BUILT_IN_SUFFIXES)) {
      if (entry.kind) {
        expect(ARTIFACT_KIND_VALUES, `suffix "${suffix}"`).toContain(entry.kind);
      }
    }
  });

  it("names only real stage kinds", () => {
    for (const [suffix, entry] of Object.entries(BUILT_IN_SUFFIXES)) {
      if (entry.stage) {
        expect(STAGE_KIND_VALUES, `suffix "${suffix}"`).toContain(entry.stage);
      }
    }
  });

  it("names only opportunity or company as a scope", () => {
    for (const [suffix, entry] of Object.entries(BUILT_IN_SUFFIXES)) {
      if (entry.scope) {
        expect(["opportunity", "company"], `suffix "${suffix}"`).toContain(entry.scope);
      }
    }
  });
});

describe("lookupSuffix", () => {
  it("matches an exact key first", () => {
    expect(lookupSuffix("cv", BUILT_IN_SUFFIXES)).toEqual({ kind: "cv" });
  });

  it("falls back to the longest matching suffix-dash prefix", () => {
    expect(lookupSuffix("debrief-round2", BUILT_IN_SUFFIXES)).toEqual({ kind: "debrief" });
  });

  it("prefers the longer of two prefixes that could both match", () => {
    const map = { call: { kind: "other" }, "call-card": { kind: "call_card" } };
    expect(lookupSuffix("call-card-extra", map)).toEqual({ kind: "call_card" });
  });

  it("returns undefined when nothing matches", () => {
    expect(lookupSuffix("mystery-file", BUILT_IN_SUFFIXES)).toBeUndefined();
  });
});

describe("mergeSuffixes", () => {
  it("keeps every base entry untouched when there is no override", () => {
    expect(mergeSuffixes(BUILT_IN_SUFFIXES, {})).toEqual(BUILT_IN_SUFFIXES);
  });

  it("merges an override field by field, keeping the base entry's other fields", () => {
    const merged = mergeSuffixes(BUILT_IN_SUFFIXES, { "call-card": { stage: "Hiring manager" } });
    expect(merged["call-card"]).toEqual({ kind: "call_card", stage: "Hiring manager" });
  });

  it("adds a suffix the base map never had", () => {
    const merged = mergeSuffixes(BUILT_IN_SUFFIXES, { "custom-notes": { kind: "other" } });
    expect(merged["custom-notes"]).toEqual({ kind: "other" });
  });
});
```

- [ ] **Step 9: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/unit/cli-suffixes.test.ts
```

Expected: fails with `Cannot find module '@/cli/src/suffixes'`.

- [ ] **Step 10: Write `cli/src/suffixes.ts` in full**

The table below is D33's built-in map transcribed exactly, one entry per suffix, empty cells simply omitted from that suffix's object.

```typescript
export type SuffixEntry = { kind?: string; stage?: string; title?: string; scope?: string };

export const BUILT_IN_SUFFIXES: Record<string, SuffixEntry> = {
  recon: { kind: "research", scope: "company" },
  "design-recon": { kind: "research", scope: "company" },
  jd: { kind: "research" },
  "jd-evidence-map": { kind: "research" },
  "fit-brief": { kind: "fit_brief" },
  "fit-by-requirement": { kind: "fit_brief" },
  people: { kind: "people_notes" },
  cv: { kind: "cv" },
  "cover-letter": { kind: "cover_letter" },
  "recruiter-reply": { kind: "message_draft" },
  outreach: { kind: "message_draft" },
  "followup-note": { kind: "message_draft" },
  "form-answers": { kind: "message_draft" },
  "hr-bank": { kind: "question_bank", stage: "recruiter_screen" },
  "question-bank": { kind: "question_bank" },
  "interview-questions": { kind: "question_bank" },
  "answers-full": { kind: "question_bank" },
  curveballs: { kind: "question_bank" },
  "call-card": { kind: "call_card" },
  "recruiter-call-script": { kind: "call_card", stage: "recruiter_screen" },
  "hr-screen-prep": { kind: "call_card", stage: "recruiter_screen" },
  "pitch-and-story": { kind: "pitch" },
  intros: { kind: "pitch" },
  "intros-audio": { kind: "pitch" },
  "why-reasons": { kind: "pitch" },
  glossary: { kind: "glossary" },
  debrief: { kind: "debrief" },
};

export function mergeSuffixes(
  base: Record<string, SuffixEntry>,
  extra: Record<string, SuffixEntry>,
): Record<string, SuffixEntry> {
  const merged: Record<string, SuffixEntry> = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    merged[key] = { ...base[key], ...value };
  }
  return merged;
}

export function lookupSuffix(key: string, map: Record<string, SuffixEntry>): SuffixEntry | undefined {
  if (map[key]) {
    return map[key];
  }
  let best: string | undefined;
  for (const name of Object.keys(map)) {
    if (key.startsWith(`${name}-`) && (!best || name.length > best.length)) {
      best = name;
    }
  }
  return best ? map[best] : undefined;
}
```

- [ ] **Step 11: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/cli-suffixes.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 10 passed (10)`.

- [ ] **Step 12: Write the failing import-rule test**

Create `tests/unit/cli-imports.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

async function listTsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listTsFiles(full)));
    } else if (entry.name.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

describe("cli/src import rule", () => {
  it("imports only node: builtins, relative files, or @/lib/bridge/wire", async () => {
    const root = path.resolve(import.meta.dirname, "../../cli/src");
    const files = await listTsFiles(root);
    // A folder that exists but is somehow empty would make every assertion
    // below vacuously pass; failing loudly here means a future refactor
    // that empties or renames cli/src cannot silently defeat this test.
    expect(files.length).toBeGreaterThan(0);

    const importLine = /import\s+(?:type\s+)?[\s\S]*?\sfrom\s+["']([^"']+)["']/g;
    const offenders: string[] = [];
    for (const file of files) {
      const text = await readFile(file, "utf8");
      for (const match of text.matchAll(importLine)) {
        const spec = match[1]!;
        const allowed = spec.startsWith("node:") || spec.startsWith(".") || spec === "@/lib/bridge/wire";
        if (!allowed) {
          offenders.push(`${path.relative(root, file)}: "${spec}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 13: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/cli-imports.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 1 passed (1)`. Every file created so far in this task (`io.ts`, `args.ts`, `frontmatter.ts`, `suffixes.ts`) already satisfies the rule; the two remaining files below (`batch.ts`, `output.ts`) and Step 15's `config.ts` and Task 9's `main.ts`, `index.ts`, `http.ts`, `commands/*.ts` must keep satisfying it too, so re-run this test any time this milestone touches a file under `cli/src`.

- [ ] **Step 14: Write the failing config test**

Create `tests/unit/cli-config.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { configPath, readCredentials, writeCredentials } from "@/cli/src/config";
import type { CliIo } from "@/cli/src/io";

function testIo(overrides: Partial<CliIo> = {}): CliIo {
  return {
    fetch: globalThis.fetch,
    env: {},
    cwd: "/",
    homedir: "/home/test",
    stdout: () => {},
    stderr: () => {},
    readSecret: async () => "",
    ...overrides,
  };
}

describe("configPath", () => {
  it("uses <homedir>/.config/jobsmith/config.json by default", () => {
    expect(configPath({}, "/home/demo")).toBe(path.join("/home/demo", ".config", "jobsmith", "config.json"));
  });

  it("uses XDG_CONFIG_HOME when it is set", () => {
    expect(configPath({ XDG_CONFIG_HOME: "/custom/config" }, "/home/demo")).toBe(
      path.join("/custom/config", "jobsmith", "config.json"),
    );
  });
});

describe("writeCredentials / readCredentials", () => {
  it("writes the directory as 0700 and the file as 0600, and reads the same values back", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "jobsmith-cli-test-"));
    const io = testIo({ homedir: home });

    const file = await writeCredentials(io, { url: "http://localhost:3000", token: "placeholder-token" });
    expect(file).toBe(configPath({}, home));

    expect((await stat(path.dirname(file))).mode & 0o777).toBe(0o700);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ url: "http://localhost:3000", token: "placeholder-token" });
    expect(await readCredentials(io)).toEqual({ url: "http://localhost:3000", token: "placeholder-token" });
  });

  it("returns null when there is no config file and no env override", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "jobsmith-cli-test-"));
    expect(await readCredentials(testIo({ homedir: home }))).toBeNull();
  });

  it("JOBSMITH_URL and JOBSMITH_TOKEN each independently override the file", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "jobsmith-cli-test-"));
    const io = testIo({ homedir: home });
    await writeCredentials(io, { url: "http://file-url.example", token: "placeholder-file-token" });

    expect(
      await readCredentials(testIo({ env: { JOBSMITH_URL: "http://env-url.example" }, homedir: home })),
    ).toEqual({ url: "http://env-url.example", token: "placeholder-file-token" });

    expect(
      await readCredentials(
        testIo({ env: { JOBSMITH_URL: "http://env-url.example", JOBSMITH_TOKEN: "placeholder-env-token" }, homedir: home }),
      ),
    ).toEqual({ url: "http://env-url.example", token: "placeholder-env-token" });
  });
});
```

- [ ] **Step 15: Run it, confirm it fails, implement, confirm it passes**

```bash
pnpm exec vitest run tests/unit/cli-config.test.ts
```

Expected first: fails with `Cannot find module '@/cli/src/config'`.

Create `cli/src/config.ts`:

```typescript
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import type { CliIo } from "./io";

export function configPath(env: CliIo["env"], homedir: string): string {
  const base =
    env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.trim() !== "" ? env.XDG_CONFIG_HOME : path.join(homedir, ".config");
  return path.join(base, "jobsmith", "config.json");
}

async function readConfigFile(io: CliIo): Promise<{ url: string; token: string } | null> {
  try {
    const text = await readFile(configPath(io.env, io.homedir), "utf8");
    const data = JSON.parse(text) as { url?: unknown; token?: unknown };
    if (typeof data.url === "string" && typeof data.token === "string") {
      return { url: data.url, token: data.token };
    }
    return null;
  } catch {
    // Missing file, unreadable file, or malformed JSON: all three mean
    // "nothing usable on disk," which readCredentials treats the same as
    // an env override that supplies both fields on its own.
    return null;
  }
}

export async function readCredentials(io: CliIo): Promise<{ url: string; token: string } | null> {
  const fromFile = await readConfigFile(io);
  const url = io.env.JOBSMITH_URL ?? fromFile?.url;
  const token = io.env.JOBSMITH_TOKEN ?? fromFile?.token;
  if (!url || !token) {
    return null;
  }
  return { url, token };
}

export async function writeCredentials(io: CliIo, creds: { url: string; token: string }): Promise<string> {
  const file = configPath(io.env, io.homedir);
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, JSON.stringify({ url: creds.url, token: creds.token }), { mode: 0o600 });
  // writeFile's mode option only takes effect when this call creates the
  // file; re-running login against an existing file would otherwise leave
  // that file's mode exactly as it already was.
  await chmod(file, 0o600);
  return file;
}
```

```bash
pnpm exec vitest run tests/unit/cli-config.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 5 passed (5)`.

- [ ] **Step 16: Write the failing output test**

Create `tests/unit/cli-output.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { formatList, formatPushReport } from "@/cli/src/output";
import type { WireOpportunity, WirePushResponse } from "@/lib/bridge/wire";

describe("formatList", () => {
  it("prints the fixed empty line for no active jobs", () => {
    expect(formatList([])).toBe("No active jobs.\n");
  });

  it("pads the slug and role-at-company columns to the widest value in the list", () => {
    const items: WireOpportunity[] = [
      {
        slug: "acme-designer",
        company: "Acme Robotics",
        role: "Product Designer",
        status: "active",
        stage: { kind: "saved", label: "Saved" },
      },
      {
        slug: "nwl-pm",
        company: "Northwind Labs",
        role: "PM",
        status: "active",
        stage: { kind: "recruiter_screen", label: "Recruiter screen" },
      },
    ];
    expect(formatList(items)).toBe(
      "acme-designer  Product Designer at Acme Robotics  Saved\n" +
        "nwl-pm         PM at Northwind Labs                Recruiter screen\n",
    );
  });
});

describe("formatPushReport", () => {
  it("reports a version number for created and versioned rows, none for updated or unchanged, then warnings, then the summary", () => {
    const responses: WirePushResponse[] = [
      {
        dryRun: false,
        requestId: "r1",
        results: [
          { key: "cv", scope: "opportunity", status: "created", version: 1 },
          { key: "cover-letter", scope: "opportunity", status: "versioned", version: 2 },
          { key: "recon", scope: "company", status: "updated", version: 3 },
          { key: "glossary", scope: "opportunity", status: "unchanged", version: 1 },
        ],
        warnings: [
          {
            key: "debrief-round2",
            code: "stage_not_found",
            message: 'debrief-round2: no stage matches "Final loop", stored without a stage.',
          },
        ],
      },
    ];
    expect(formatPushReport(responses, false)).toBe(
      "  created    cv (version 1)\n" +
        "  versioned  cover-letter (version 2)\n" +
        "  updated    recon\n" +
        "  unchanged  glossary\n" +
        'Warning: debrief-round2: no stage matches "Final loop", stored without a stage.\n' +
        "1 created, 1 versioned, 1 updated, 1 unchanged.\n",
    );
  });

  it("prepends the dry-run line and combines totals across several batch responses", () => {
    const responses: WirePushResponse[] = [
      { dryRun: true, requestId: "r1", results: [{ key: "a", scope: "opportunity", status: "created", version: 1 }], warnings: [] },
      { dryRun: true, requestId: "r2", results: [{ key: "b", scope: "opportunity", status: "created", version: 1 }], warnings: [] },
    ];
    expect(formatPushReport(responses, true)).toBe(
      "Dry run: nothing was saved.\n" +
        "  created    a (version 1)\n" +
        "  created    b (version 1)\n" +
        "2 created, 0 versioned, 0 updated, 0 unchanged.\n",
    );
  });

  it("prints no warning line at all when there are none", () => {
    const responses: WirePushResponse[] = [
      { dryRun: false, requestId: "r1", results: [{ key: "cv", scope: "opportunity", status: "unchanged", version: 1 }], warnings: [] },
    ];
    expect(formatPushReport(responses, false)).toBe("  unchanged  cv\n0 created, 0 versioned, 0 updated, 1 unchanged.\n");
  });
});
```

- [ ] **Step 17: Run it, confirm it fails, implement, confirm it passes**

```bash
pnpm exec vitest run tests/unit/cli-output.test.ts
```

Expected first: fails with `Cannot find module '@/cli/src/output'`.

Create `cli/src/output.ts`:

```typescript
import type { WireOpportunity, WirePushResponse, WireStatus } from "@/lib/bridge/wire";

export function formatList(items: WireOpportunity[]): string {
  if (items.length === 0) {
    return "No active jobs.\n";
  }
  const rows = items.map((item) => ({
    slug: item.slug,
    roleAtCompany: `${item.role} at ${item.company}`,
    stage: item.stage.label,
  }));
  const slugWidth = Math.max(...rows.map((r) => r.slug.length));
  const roleWidth = Math.max(...rows.map((r) => r.roleAtCompany.length));
  return rows.map((r) => `${r.slug.padEnd(slugWidth)}  ${r.roleAtCompany.padEnd(roleWidth)}  ${r.stage}\n`).join("");
}

// "unchanged" and "versioned" are both exactly 9 characters, the longest of
// the four status words, which is why the frame pads every row to 9: it is
// the natural width of this column, not an arbitrary number.
const STATUS_WORDS: Record<WireStatus, string> = {
  created: "created",
  versioned: "versioned",
  updated: "updated",
  unchanged: "unchanged",
};

export function formatPushReport(responses: WirePushResponse[], dryRun: boolean): string {
  const lines: string[] = [];
  if (dryRun) {
    lines.push("Dry run: nothing was saved.");
  }
  const counts: Record<WireStatus, number> = { created: 0, versioned: 0, updated: 0, unchanged: 0 };
  for (const response of responses) {
    for (const result of response.results) {
      const word = STATUS_WORDS[result.status];
      const suffix = result.status === "created" || result.status === "versioned" ? ` (version ${result.version})` : "";
      lines.push(`  ${word.padEnd(9)}  ${result.key}${suffix}`);
      counts[result.status]++;
    }
  }
  for (const response of responses) {
    for (const warning of response.warnings) {
      lines.push(`Warning: ${warning.message}`);
    }
  }
  lines.push(
    `${counts.created} created, ${counts.versioned} versioned, ${counts.updated} updated, ${counts.unchanged} unchanged.`,
  );
  return lines.map((line) => `${line}\n`).join("");
}
```

```bash
pnpm exec vitest run tests/unit/cli-output.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 5 passed (5)`.

- [ ] **Step 18: Write the failing batch test**

Create `tests/unit/cli-batch.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { batchArtifacts } from "@/cli/src/batch";
import type { WireArtifact } from "@/lib/bridge/wire";

function artifact(key: string, bodyLength: number): WireArtifact {
  return { key, kind: "cv", body_md: "y".repeat(bodyLength) };
}

describe("batchArtifacts", () => {
  it("splits by count when every item is small", () => {
    const items = [1, 2, 3, 4, 5].map((n) => artifact(`k${n}`, 1));
    const batches = batchArtifacts(items, { maxCount: 2, maxBytes: 1_000_000 });
    expect(batches.map((b) => b.length)).toEqual([2, 2, 1]);
    expect(batches.flat()).toEqual(items);
  });

  it("splits by serialized byte size when the count limit would allow more per batch", () => {
    const items = [1, 2, 3, 4].map((n) => artifact(`key-${n}`, 20));
    const oneItemBytes = Buffer.byteLength(JSON.stringify({ artifacts: [items[0]] }), "utf8");
    const batches = batchArtifacts(items, { maxCount: 50, maxBytes: oneItemBytes + 10 });
    expect(batches.every((b) => b.length === 1)).toBe(true);
    expect(batches).toHaveLength(4);
  });

  it("gives a single item over the byte cap its own batch, rather than dropping it or looping forever", () => {
    const oversized = artifact("big", 200);
    const small = artifact("small", 1);
    expect(batchArtifacts([oversized, small], { maxCount: 50, maxBytes: 50 })).toEqual([[oversized], [small]]);
  });

  it("returns an empty array for no items", () => {
    expect(batchArtifacts([], { maxCount: 50, maxBytes: 1000 })).toEqual([]);
  });

  it("defaults to MAX_ARTIFACTS_PER_PUSH and MAX_PUSH_BYTES when no limits are given", () => {
    const items = Array.from({ length: 60 }, (_, i) => artifact(`k${i}`, 10));
    const batches = batchArtifacts(items);
    expect(batches[0]!.length).toBeLessThanOrEqual(50);
    expect(batches.flat()).toHaveLength(60);
  });
});
```

- [ ] **Step 19: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/unit/cli-batch.test.ts
```

Expected: fails with `Cannot find module '@/cli/src/batch'`.

- [ ] **Step 20: Implement `cli/src/batch.ts`**

`batchArtifacts(items, limits?): WireArtifact[][]`, greedy by the serialized size of the exact request shape the server receives. Verified in a planning scratch file: splits correctly by count, splits correctly by byte size, gives a single oversize item its own batch instead of dropping it or looping forever, and returns `[]` for an empty input, all four outcomes the test above checks.

1. `const maxCount = limits?.maxCount ?? MAX_ARTIFACTS_PER_PUSH;` `const maxBytes = limits?.maxBytes ?? MAX_PUSH_BYTES;` (both imported from `@/lib/bridge/wire`).
2. `const batches: WireArtifact[][] = []; let current: WireArtifact[] = [];`
3. For each `item` of `items`, in order: `const candidate = [...current, item];` `const candidateBytes = Buffer.byteLength(JSON.stringify({ artifacts: candidate }), "utf8");` (the exact `{ artifacts: [...] }` envelope the push endpoint's body has, so the measured size matches what actually crosses the wire, not just the sum of the items' own sizes).
4. When `current.length > 0` and (`candidate.length > maxCount` or `candidateBytes > maxBytes`): `batches.push(current); current = [item];` Otherwise: `current = candidate;` (this is also what makes a single oversize item safe: an empty `current` always takes the next item regardless of its size, so the loop always makes progress and no item is ever silently dropped).
5. After the loop, when `current.length > 0`, `batches.push(current);`
6. `return batches;` (an empty `items` array never enters the loop and `current` stays empty, so this returns `[]`).

- [ ] **Step 21: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/cli-batch.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 5 passed (5)`.

- [ ] **Step 22: Re-run the import-rule test**

```bash
pnpm exec vitest run tests/unit/cli-imports.test.ts
```

Expected: still `Tests 1 passed (1)`. `output.ts` and `batch.ts` only import from `@/lib/bridge/wire` and (in `batch.ts`'s case) nothing else at all.

- [ ] **Step 23: Implement `cli/src/collect.ts`**

Not test-driven in this task (Step "Global constraints" above explains why): Task 9's `tests/integration/cli-bridge.test.ts` is this function's real test, against the real fixture packet.

Imports: `KEY_PATTERN`, `MAX_ARTIFACT_BYTES`, `type WireArtifact` from `@/lib/bridge/wire`; `splitFrontmatter` from `./frontmatter`; `BUILT_IN_SUFFIXES`, `mergeSuffixes`, `lookupSuffix`, `type SuffixEntry` from `./suffixes`; `readdir`, `readFile` from `node:fs/promises`; `path` from `node:path`.

```typescript
export type Collected = { items: WireArtifact[]; notes: string[] };
export function collectPacket(options: { dir: string; prefix: string }): Promise<{ ok: true; value: Collected } | { ok: false; message: string }>;
```

1. Read `jobsmith.config.json` from `options.dir` (D32: the content folder itself, no parent walk, and a different file from the credentials file `readCredentials` reads). When it does not exist (`ENOENT`), proceed with `mergedSuffixes = BUILT_IN_SUFFIXES` and no error: a project with no per-folder overrides is the normal case, not a mistake. When it exists but fails to parse as JSON, or fails to read for any other reason, stop immediately and return `{ ok: false, message: \`Could not read jobsmith.config.json: ${reason}.\` }` (`reason` is the caught error's own `message`, falling back to a short fixed phrase like `"the file could not be read"` if the error has none). When it parses, read its `suffixes` property if present and shaped as an object (ignore every other top-level key silently, per D32/D34); when `suffixes` is missing or not an object, treat it as `{}`. `mergedSuffixes = mergeSuffixes(BUILT_IN_SUFFIXES, thatObject)`.
2. `const names = (await readdir(options.dir)).filter((n) => n.startsWith(\`${options.prefix}-\`) && n.endsWith(".md")).sort();`
3. When `names.length === 0`: return `{ ok: false, message: \`No ${options.prefix}-*.md files in ${options.dir}.\` }`.
4. `const items: WireArtifact[] = []; const notes: string[] = [];` Then, for each `name` of `names`, in order:
   a. `const raw = await readFile(path.join(options.dir, name), "utf8");` `const { data, body } = splitFrontmatter(raw);`
   b. When `data.jobsmith === "context/v1"`: this is a pulled context document sitting in the same folder (D34); skip it with no note at all (this is expected, not a mistake) and move to the next file.
   c. `const key = name.slice(options.prefix.length + 1, -".md".length).toLowerCase();` When `!KEY_PATTERN.test(key)`: push the note `` `Note: skipped ${name}: the key does not match the required pattern.` ``, skip this file, move to the next.
   d. `const entry = lookupSuffix(key, mergedSuffixes);`
   e. `const kind = data.kind ?? entry?.kind ?? "other";` When neither `data.kind` nor `entry?.kind` supplied a value (the `"other"` fallback was actually used): push the note `` `Note: ${name} has no kind in the suffix map, pushing it as other.` ``.
   f. `const stage = data.stage ?? entry?.stage;` `const title = data.title ?? entry?.title;` (both stay `undefined` when neither side supplied one; do not turn either into `null` or `""`).
   g. `const scope = data.scope ?? entry?.scope ?? "opportunity";` When `scope !== "opportunity" && scope !== "company"`: stop the whole push immediately, returning `{ ok: false, message: \`${name}: scope must be opportunity or company.\` }` (D34: an invalid scope stops before anything is sent, unlike a bad key or an empty body, which only skip that one file).
   h. `const bodyBytes = Buffer.byteLength(body, "utf8");` (the same computation `utf8Bytes` uses server-side, written out directly here because `cli/src` may not import `@/lib/artifacts/normalize`). When `bodyBytes > MAX_ARTIFACT_BYTES`: stop the whole push, returning `{ ok: false, message: \`${name} is larger than 1 MB. Split it or leave it out.\` }`.
   i. When `body.trim() === ""`: push the note `` `Note: skipped ${name}: the body is empty.` ``, skip this file, move to the next.
   j. Otherwise, push to `items`: `{ key, kind, body_md: body, scope, ...(stage !== undefined ? { stage } : {}), ...(title !== undefined ? { title } : {}) }`.
5. After the loop, return `{ ok: true, value: { items, notes } };` (an empty `items` here, after `names` was confirmed non-empty in Step 3, means every single file was individually skipped. That is still a successful collection, just an empty one, which `push`'s own command logic in Task 9 reports rather than treating as an error).

`<reason>` in the CLI lines list is a placeholder the frame leaves open (it is not one of the fixed strings elsewhere in that list); the two exact reason phrases above (`"the key does not match the required pattern"`, `"the body is empty"`) are this task's own wording, chosen to be short and literally accurate.

- [ ] **Step 24: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm exec vitest run tests/unit/cli-imports.test.ts
pnpm test
```

`collect.ts` has no dedicated test file yet (Task 9 supplies it), but it must still typecheck and keep satisfying the import rule; the explicit re-run above confirms the latter before the full suite does. Expected: all commands exit 0, with `pnpm test` reporting every existing test still passing alongside the 14 + 6 + 10 + 1 + 5 + 5 + 5 = 46 new ones from this task.

- [ ] **Step 25: Commit**

```bash
git add cli/src tests/unit/cli-args.test.ts tests/unit/cli-config.test.ts tests/unit/cli-frontmatter.test.ts tests/unit/cli-suffixes.test.ts tests/unit/cli-batch.test.ts tests/unit/cli-output.test.ts tests/unit/cli-imports.test.ts
git commit -m "$(cat <<'EOF'
feat: add the CLI's argument parsing, config storage, frontmatter, suffix map, batching and output formatting
EOF
)"
```

---

### Task 9: CLI commands, bundle, and the fixture packet

Everything Task 8 built in isolation gets wired together here: the four commands, the bundle that turns them into one file plain Node can run, and the fictional packet that proves the whole pipeline end to end.

**Files:**
- Create: `cli/src/main.ts`, `cli/src/index.ts`, `cli/src/http.ts`, `cli/src/commands/login.ts`, `cli/src/commands/list.ts`, `cli/src/commands/pull.ts`, `cli/src/commands/push.ts`, `cli/package.json`, `scripts/build-cli.mjs`, `tests/helpers/bridge-fetch.ts`, `tests/fixtures/packet/nwl-call-card.md`, `nwl-answers-full.md`, `nwl-hr-bank.md`, `nwl-recon.md`, `nwl-fit-brief.md`, `nwl-people.md`, `nwl-cv.md`, `nwl-cover-letter.md`, `nwl-glossary.md`, `nwl-pitch.md`, `nwl-debrief-round2.md`, `nwl-context.md`, `unrelated-notes.md`, `jobsmith.config.json`, `tests/integration/cli-bridge.test.ts`, `tests/integration/cli-bundle.test.ts`
- Modify: `package.json`, `.gitignore`

**Interfaces:**
- Consumes: everything Task 8 produced (`cli/src/io.ts`, `args.ts`, `config.ts`, `frontmatter.ts` via `collect.ts`, `suffixes.ts` via `collect.ts`, `collect.ts`, `batch.ts`, `output.ts`, `version.ts`). `TOKEN_PATTERN`, `WireListResponse`, `WirePushResponse` from `lib/bridge/wire.ts` (Task 3). `BridgeDeps`, `handleListOpportunities`, `handleGetContext`, `handlePushArtifacts` from `lib/bridge/handlers.ts` (Task 7, the test helper only). `createApiToken`, `revokeApiToken` from `lib/auth/api-token.ts` (Task 5, tests only). `makeTestDb`, `createTestUser` from `tests/helpers/db.ts`. `scoped` from `lib/db/scoped`. `defaultStages` from `lib/pipeline/rules.ts` (tests only).
- Produces (copied from the frame character for character):

```typescript
// cli/src/main.ts
export function run(argv: string[], io: CliIo): Promise<number>;     // D42 exit codes
// cli/src/index.ts: entry: real io (globalThis.fetch, process.env, process.cwd(), os.homedir(), stdout/stderr writes, readSecret), then process.exitCode = await run(process.argv.slice(2), io)
// cli/src/http.ts
export function bridgeRequest(io: CliIo, creds: { url: string; token: string }, method: "GET" | "PUT", path: string, body?: unknown): Promise<{ ok: true; status: number; text: string } | { ok: false; message: string; refused: boolean }>;
// tests/helpers/bridge-fetch.ts
export function bridgeFetch(deps: BridgeDeps): typeof fetch;
```

**Global constraints restated for this task:** `cli/src` (now including `main.ts`, `index.ts`, `http.ts` and `commands/*.ts`) still allows only `node:` builtins, its own relative files, and `@/lib/bridge/wire`; re-run `tests/unit/cli-imports.test.ts` after every step that adds a file here. No test in this task contains a literal API token: `tests/integration/cli-bridge.test.ts` gets its token from `createApiToken`, the same as every earlier task's tests. Fictional company and people only in the fixture packet: Northwind Labs and its staff exist nowhere outside this milestone's tests.

- [ ] **Step 1: Write `cli/src/http.ts` in full**

```typescript
import { CLI_VERSION } from "./version";
import type { CliIo } from "./io";

export async function bridgeRequest(
  io: CliIo,
  creds: { url: string; token: string },
  method: "GET" | "PUT",
  path: string,
  body?: unknown,
): Promise<{ ok: true; status: number; text: string } | { ok: false; message: string; refused: boolean }> {
  try {
    const response = await io.fetch(`${creds.url}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${creds.token}`,
        "user-agent": `jobsmith-cli/${CLI_VERSION}`,
        accept: "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    return { ok: true, status: response.status, text };
  } catch (error) {
    // Every failure this function can produce on its own is a network-level
    // one: a DNS failure, a refused connection, a TLS error, or the
    // 30-second timeout firing. The request never reached a server that
    // could answer at all, so refused is always true here; the field exists
    // so a caller or a future extension of this function could distinguish
    // a network failure from some other kind without another type change,
    // even though there is exactly one way to reach this branch today.
    return { ok: false, message: error instanceof Error ? error.message : String(error), refused: true };
  }
}
```

No dedicated unit test: this function is a thin wrapper over `io.fetch` with fixed headers and a fixed timeout, and every one of its branches (network failure, 401, another non-2xx status, a 200) is exercised through the four commands in `tests/integration/cli-bridge.test.ts` below, which is a more meaningful proof than mocking `fetch` in isolation would be.

- [ ] **Step 2: Implement the four commands**

Not test-driven as isolated units, for the same reason as Step 1 and as `collectPacket` in Task 8: `tests/integration/cli-bridge.test.ts` (Step 8 below) is what proves these are correct, running the real handlers underneath through `bridgeFetch`. Every string below is copied from the frame's "CLI lines" list character for character; every `io.stdout`/`io.stderr` call passes a string that already ends in `"\n"` (`CliIo`'s methods are raw writes, not `console.log`-shaped).

Create `cli/src/commands/login.ts`. `runLogin(io: CliIo, command: { url: string }): Promise<number>`:

1. `const secret = await io.readSecret("Token: ");` `const token = secret.trim();`
2. When `!TOKEN_PATTERN.test(token)` (imported from `@/lib/bridge/wire`): `io.stderr("That does not look like a Jobsmith token.\n"); return 1;`
3. `const response = await bridgeRequest(io, { url: command.url, token }, "GET", "/api/bridge/opportunities");`
4. When `!response.ok`: `io.stderr(\`Could not reach ${command.url}: ${response.message}.\n\`); return 1;`
5. When `response.status !== 200`: `io.stderr("The server refused this token.\n"); return 1;` (login treats any non-200 the same way; it has no separate concept of "a different kind of server error" the way `list`/`pull`/`push` do, because logging in has nothing else it could partially succeed at).
6. Otherwise: `const path = await writeCredentials(io, { url: command.url, token }); io.stdout(\`Logged in to ${command.url}. Saved to ${path}.\n\`); return 0;`

Create `cli/src/commands/list.ts`. `runList(io: CliIo, creds: { url: string; token: string }): Promise<number>`:

1. `const response = await bridgeRequest(io, creds, "GET", "/api/bridge/opportunities");`
2. When `!response.ok`: `io.stderr(\`Could not reach ${creds.url}: ${response.message}.\n\`); return 1;`
3. When `response.status === 401`: `io.stderr("The server refused the token. Create a new one in Settings and run jobsmith login.\n"); return 1;`
4. When `response.status !== 200`: extract `<server message>` (Step below) and `io.stderr(\`Error: ${message}\n\`); return 1;`
5. Otherwise: `const body = JSON.parse(response.text) as WireListResponse; io.stdout(formatList(body.opportunities)); return 0;` (`formatList` already ends its output in `"\n"`, including the "No active jobs." case, so nothing more is appended here).

Extracting `<server message>` (shared prose, used identically by `list`, `pull` and `push` below): try `JSON.parse(response.text)` and read `.error.message`; when that throws or the shape is not what is expected, fall back to `response.text` itself, so a response this CLI did not anticipate (an upstream proxy's own HTML error page, for example) still prints something rather than throwing out of the command.

Create `cli/src/commands/pull.ts`. `runPull(io: CliIo, creds: { url: string; token: string }, command: { slug: string; out: string | null }): Promise<number>`:

1. `const response = await bridgeRequest(io, creds, "GET", \`/api/bridge/opportunities/${command.slug}/context\`);`
2. Steps 2 to 4 exactly as `list` above (not reachable, 401, other non-2xx).
3. Otherwise: `const outDir = path.resolve(io.cwd, command.out ?? "."); await mkdir(outDir, { recursive: true }); const filePath = path.join(outDir, \`${command.slug}-context.md\`); await writeFile(filePath, response.text, "utf8"); io.stdout(\`Wrote ${filePath}.\n\`); return 0;` (`node:fs/promises`'s `mkdir`/`writeFile`, `node:path`'s `resolve`/`join`).

Create `cli/src/commands/push.ts`. `runPush(io: CliIo, creds: { url: string; token: string }, command: { slug: string; dir: string | null; prefix: string | null; dryRun: boolean }): Promise<number>`:

1. `const dir = path.resolve(io.cwd, command.dir ?? "."); const prefix = command.prefix ?? command.slug;` (D34: the prefix defaults to the job's own slug).
2. `const collected = await collectPacket({ dir, prefix });`
3. When `!collected.ok`: `io.stderr(\`${collected.message}\n\`); return 1;` (`collected.message` is already one complete sentence, one of the four `collectPacket` failure lines from Task 8).
4. `for (const note of collected.value.notes) io.stdout(\`${note}\n\`);` (printed before anything about the push's own result, so a person reading top to bottom sees what was skipped before they see what happened to the rest).
5. `const batches = batchArtifacts(collected.value.items);`
6. When `batches.length === 0` (every file on disk was individually skipped, which Step 4's notes already explained): `io.stdout(formatPushReport([], command.dryRun)); return 0;` (an all-zero summary, and the dry-run line first when `command.dryRun` is set; this is a real, reportable outcome, not an error, since `collectPacket` already confirmed at least one `<prefix>-*.md` file existed on disk).
7. Otherwise, `const responses: WirePushResponse[] = [];` then for each `batch` of `batches`, in order:
   - `const query = command.dryRun ? "?dry_run=true" : "";` `const response = await bridgeRequest(io, creds, "PUT", \`/api/bridge/opportunities/${command.slug}/artifacts${query}\`, { artifacts: batch });`
   - When `!response.ok`: `io.stderr(\`Could not reach ${creds.url}: ${response.message}.\n\`); return 1;` (stop immediately; do not send the remaining batches).
   - When `response.status === 401`: `io.stderr("The server refused the token. Create a new one in Settings and run jobsmith login.\n"); return 1;`
   - When `response.status !== 200`: extract `<server message>` the same way as `list`, `io.stderr(\`Error: ${message}\n\`); return 1;`
   - Otherwise: `responses.push(JSON.parse(response.text) as WirePushResponse);`
8. `io.stdout(formatPushReport(responses, command.dryRun)); return 0;`

- [ ] **Step 3: Write `cli/src/main.ts` in full**

```typescript
import { parseCommand, USAGE } from "./args";
import { CLI_VERSION } from "./version";
import { readCredentials } from "./config";
import { runLogin } from "./commands/login";
import { runList } from "./commands/list";
import { runPull } from "./commands/pull";
import { runPush } from "./commands/push";
import type { CliIo } from "./io";

export async function run(argv: string[], io: CliIo): Promise<number> {
  const parsed = parseCommand(argv);
  if (!parsed.ok) {
    io.stderr(`${parsed.message}\n`);
    return 2;
  }
  const command = parsed.command;

  switch (command.name) {
    case "help":
      io.stdout(USAGE);
      return 0;
    case "version":
      io.stdout(`${CLI_VERSION}\n`);
      return 0;
    case "login":
      return runLogin(io, command);
    case "list": {
      const creds = await readCredentials(io);
      if (!creds) {
        io.stderr("Not logged in. Run jobsmith login first.\n");
        return 1;
      }
      return runList(io, creds);
    }
    case "pull": {
      const creds = await readCredentials(io);
      if (!creds) {
        io.stderr("Not logged in. Run jobsmith login first.\n");
        return 1;
      }
      return runPull(io, creds, command);
    }
    case "push": {
      const creds = await readCredentials(io);
      if (!creds) {
        io.stderr("Not logged in. Run jobsmith login first.\n");
        return 1;
      }
      return runPush(io, creds, command);
    }
  }
}
```

`USAGE` already ends in `"\n"` (Task 8's template literal), so `io.stdout(USAGE)` for `--help` needs no extra newline appended; the usage-error branch above adds one because `parsed.message` is sometimes the specific, single-line URL-shape sentence (Task 8, Step 4), which does not carry its own trailing newline.

- [ ] **Step 4: Implement `readSecret` and the real `CliIo`, in `cli/src/index.ts`**

`readSecret(prompt: string): Promise<string>` (D31):

1. Write `prompt` to `process.stdout` with no trailing newline.
2. When `process.stdin.isTTY` is falsy (piped input, such as a script, a CI job, or this milestone's own end-to-end test in Task 14, which feeds the token over stdin rather than a real keyboard): read one line with `node:readline` (`createInterface({ input: process.stdin })`, resolve on its first `"line"` event, then `close()` the interface) and resolve with that line exactly as read, with no trimming inside this function (callers trim if they need to; `runLogin` already does).
3. Otherwise (a real terminal): `process.stdin.setRawMode(true)`, `process.stdin.resume()`, `process.stdin.setEncoding("utf8")`, so keystrokes arrive one at a time with the terminal's own line editing and echo both turned off.
4. Accumulate into a local `value`, starting `""`. On every `"data"` event, walk the chunk's characters one at a time:
   - `"\r"` or `"\n"` (Enter): stop listening, restore the terminal (`setRawMode(false)`, `pause()`), write a plain `"\n"` to `process.stdout` (raw mode suppressed the newline Enter would otherwise have produced, so the terminal's cursor still needs to move down for whatever gets printed next), and resolve the promise with `value`.
   - `"\u0003"` (Ctrl+C): restore the terminal the same way, write `"\n"`, then `process.exit(130)` directly (128 + SIGINT's signal number 2). There is nothing sensible left to return once the process is exiting on its own, so this does not resolve or reject the promise.
   - `"\u007f"` or `"\b"` (Backspace or Delete): `value = value.slice(0, -1)`.
   - Anything else: append the character to `value`.

No character typed while this is running is ever echoed to the terminal, on purpose: this is what keeps the token off the screen while it is being entered.

The rest of the file wires the real environment into `CliIo` and calls `run`:

```typescript
import { createInterface } from "node:readline";
import os from "node:os";
import { run } from "./main";
import type { CliIo } from "./io";

function readSecret(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    if (!process.stdin.isTTY) {
      const rl = createInterface({ input: process.stdin });
      rl.once("line", (line) => {
        rl.close();
        resolve(line);
      });
      return;
    }
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    let value = "";
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
    };
    function onData(chunk: string) {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u0003") {
          cleanup();
          process.stdout.write("\n");
          process.exit(130);
        }
        if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += char;
      }
    }
    process.stdin.on("data", onData);
  });
}

const io: CliIo = {
  fetch: globalThis.fetch,
  env: process.env,
  cwd: process.cwd(),
  homedir: os.homedir(),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  readSecret,
};

process.exitCode = await run(process.argv.slice(2), io);
```

- [ ] **Step 5: Re-run the import-rule test**

```bash
pnpm exec vitest run tests/unit/cli-imports.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 1 passed (1)`. `main.ts`, `index.ts`, `http.ts` and the four `commands/*.ts` files import only `node:` builtins, their own relative siblings, and (in `http.ts`'s case) nothing from the repo at all beyond `./version` and `./io`.

- [ ] **Step 6: Write `tests/helpers/bridge-fetch.ts` in full**

```typescript
import type { BridgeDeps } from "@/lib/bridge/handlers";
import { handleListOpportunities, handleGetContext, handlePushArtifacts } from "@/lib/bridge/handlers";

export function bridgeFetch(deps: BridgeDeps): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/bridge/opportunities") {
      return handleListOpportunities(deps, request);
    }
    const contextMatch = /^\/api\/bridge\/opportunities\/([^/]+)\/context$/.exec(url.pathname);
    if (request.method === "GET" && contextMatch) {
      return handleGetContext(deps, request, contextMatch[1]!);
    }
    const artifactsMatch = /^\/api\/bridge\/opportunities\/([^/]+)\/artifacts$/.exec(url.pathname);
    if (request.method === "PUT" && artifactsMatch) {
      return handlePushArtifacts(deps, request, artifactsMatch[1]!);
    }
    return new Response("Not Found", { status: 404 });
  }) as typeof fetch;
}
```

- [ ] **Step 7: Write the fixture packet**

Fictional company (Northwind Labs) and fictional people (Priya Raman, Sam Okafor) only. Every file starts with an H1 and its headings stay in order (H1, then H2s, with an H3 only ever nested under an H2 already open); none has frontmatter except the three the frame calls out by name (`nwl-pitch.md`, `nwl-debrief-round2.md`, `nwl-context.md`), because real prep packets usually have none, so the suffix map is what resolves the other eleven.

Create `tests/fixtures/packet/nwl-call-card.md`:

```markdown
# Northwind Labs: hiring manager call card

Open with the onboarding redesign story.

## Call details

| Field | Value |
|---|---|
| Date | TBD |
| Format | Video |
| Interviewer | Priya Raman |

## Talking points

### Strengths to highlight

- Led the design system rollout.
- Comfortable pairing with engineers.
```

Create `tests/fixtures/packet/nwl-answers-full.md`:

```markdown
# Northwind Labs: full answers

## Why Northwind Labs

Short answer about wanting to work on scheduling software for clinics.

### Longer version

A longer paragraph elaborating on the short answer above.

## Why this role

Short answer about the product design role.
```

Create `tests/fixtures/packet/nwl-hr-bank.md`:

```markdown
# Northwind Labs: recruiter screen questions

## Logistics

- Compensation range.
- Notice period.

## Motivation

- Why are you looking.
```

Create `tests/fixtures/packet/nwl-recon.md`:

```markdown
# Northwind Labs: company recon

Northwind Labs sells scheduling software to clinics.

## Product

Scheduling and intake software for outpatient clinics.

## Recent news

### Funding

Raised a Series B earlier this year.
```

Create `tests/fixtures/packet/nwl-fit-brief.md`:

```markdown
# Northwind Labs: fit brief

## Strongest match

Design systems experience lines up with the team's current rebuild.

## Weakest match

Limited exposure to healthcare compliance work.
```

Create `tests/fixtures/packet/nwl-people.md`:

```markdown
# Northwind Labs: people in the loop

## Priya Raman, Hiring Manager

Leads the product design team.

## Sam Okafor, Recruiter

First point of contact.
```

Create `tests/fixtures/packet/nwl-cv.md`:

```markdown
# CV for Northwind Labs

## Summary

Product designer with a systems background.

## Experience

### Acme Robotics

Led a design system used by four product teams.
```

Create `tests/fixtures/packet/nwl-cover-letter.md`:

```markdown
# Cover letter for Northwind Labs

## Opening

Dear Hiring Team,

## Body

A paragraph about fit for the role.

## Closing

Thank you for your consideration.
```

Create `tests/fixtures/packet/nwl-glossary.md`:

```markdown
# Northwind Labs: glossary

## Terms

### ATS

Applicant tracking system.

### EHR

Electronic health record, adjacent to Northwind's own product.
```

Create `tests/fixtures/packet/nwl-pitch.md`. Its frontmatter `title` wins over its own H1 as the artifact's stored title (D16 rule 1: a given title always wins), which is why the H1 below reads "Portfolio walkthrough" while the pushed document ends up titled "Portfolio walkthrough pitch":

```markdown
---
kind: pitch
stage: Portfolio review
title: Portfolio walkthrough pitch
---
# Portfolio walkthrough

## Short version

One sentence framing of the case study.

## Long version

### The problem

Describes the design problem tackled.

### The outcome

Describes the measurable outcome.
```

Create `tests/fixtures/packet/nwl-debrief-round2.md`. Its suffix (`debrief-round2`) resolves to kind `debrief` through the built-in map's longest-prefix rule (matching `debrief-`), but its frontmatter names a stage, "Final loop", that matches no default stage by label or by kind. This is the packet's one deliberate warning:

```markdown
---
stage: Final loop
---
# Northwind Labs: round two debrief

## What went well

Clear examples, good rapport with the panel.

## What to improve

Tighten the answer about cross-team conflict.
```

Create `tests/fixtures/packet/nwl-context.md` (a pulled context document, skipped by `collectPacket` on its `jobsmith: context/v1` frontmatter alone; its content is otherwise irrelevant):

```markdown
---
jobsmith: context/v1
slug: nwl
---
# Context
```

Create `tests/fixtures/packet/unrelated-notes.md` (no `nwl-` prefix, so it never matches the `<prefix>-*.md` glob regardless of its content):

```markdown
# Unrelated notes

Not part of any push.
```

Create `tests/fixtures/packet/jobsmith.config.json`:

```json
{ "suffixes": { "call-card": { "stage": "Hiring manager" } } }
```

Verified in a planning scratch file (reimplementing the suffix lookup and the server's kind/scope/stage resolution over these exact eleven files): every file resolves to the kind and scope the frame's fixture section states, `debrief-round2` is the only one that produces a warning (`stage_not_found`, because "Final loop" matches no default stage by label or by kind), and grouping every result by tab and stage reproduces exactly "Research job: Fit brief, People notes; shared: Recon; Documents: CV, Cover letter; Prep General: answers-full, glossary, debrief-round2; Recruiter screen: hr-bank; Hiring manager: call card; Portfolio review: pitch."

- [ ] **Step 8: Write the failing CLI integration test**

Create `tests/integration/cli-bridge.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import type { Db } from "@/lib/db/client";
import type { BridgeDeps } from "@/lib/bridge/handlers";
import { bridgeFetch } from "../helpers/bridge-fetch";
import { createApiToken, revokeApiToken } from "@/lib/auth/api-token";
import { defaultStages } from "@/lib/pipeline/rules";
import { run } from "@/cli/src/main";
import { configPath } from "@/cli/src/config";
import type { CliIo } from "@/cli/src/io";

const PACKET_DIR = path.resolve(import.meta.dirname, "../fixtures/packet");

function testDeps(db: Db): { deps: BridgeDeps } {
  let counter = 0;
  return {
    deps: {
      db,
      now: () => new Date(),
      revalidate: () => {},
      requestId: () => `req-${++counter}`,
    },
  };
}

async function seedJob(db: Db, opts: { slug: string; email: string }) {
  const user = await createTestUser(db, opts.email);
  const s = scoped(db, user.id);
  const company = await s.company.insert({ name: "Northwind Labs", nameKey: `northwind-${opts.slug}` });
  const opportunity = await s.opportunity.insert({ companyId: company.id, slug: opts.slug, roleTitle: "Product Designer" });
  const drafts = defaultStages();
  const stages = await s.stage.insertMany(
    drafts.map((d, i) => ({ opportunityId: opportunity.id, kind: d.kind, label: d.label, position: i })),
  );
  await s.opportunity.update(opportunity.id, { currentStageId: stages[0]!.id });
  const created = await createApiToken(s, "Test");
  if (!created.ok) throw new Error("token setup failed");
  return { user, s, opportunity, token: created.data.token };
}

async function testHome(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "jobsmith-home-"));
}

function buildIo(db: Db, overrides: Partial<CliIo> = {}): CliIo {
  const { deps } = testDeps(db);
  return {
    fetch: bridgeFetch(deps),
    env: {},
    cwd: "/",
    homedir: "/unused",
    stdout: () => {},
    stderr: () => {},
    readSecret: async () => "",
    ...overrides,
  };
}

describe("jobsmith login", () => {
  it("writes a 0600 credentials file and prints the confirmation line", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seedJob(db, { slug: "nwl-designer", email: "login1@example.com" });
      const home = await testHome();
      const out: string[] = [];
      const io = buildIo(db, {
        env: { XDG_CONFIG_HOME: path.join(home, "config") },
        homedir: home,
        readSecret: async () => `${token}\n`,
        stdout: (t) => out.push(t),
      });

      const code = await run(["login", "--url", "http://test.local"], io);
      expect(code).toBe(0);
      expect(out.join("")).toBe("Logged in to http://test.local. Saved to " + configPath(io.env, home) + ".\n");

      const file = configPath(io.env, home);
      expect((await stat(file)).mode & 0o777).toBe(0o600);
      expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ url: "http://test.local", token });
    } finally {
      await close();
    }
  });

  it("refuses a token that does not look like a Jobsmith token, before any request", async () => {
    const { db, close } = await makeTestDb();
    try {
      const home = await testHome();
      const err: string[] = [];
      const io = buildIo(db, {
        env: { XDG_CONFIG_HOME: path.join(home, "config") },
        homedir: home,
        readSecret: async () => "not-a-real-token",
        stderr: (t) => err.push(t),
      });
      const code = await run(["login", "--url", "http://test.local"], io);
      expect(code).toBe(1);
      expect(err.join("")).toBe("That does not look like a Jobsmith token.\n");
    } finally {
      await close();
    }
  });
});

describe("jobsmith list / pull / push", () => {
  it("list prints the seeded job", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seedJob(db, { slug: "nwl-designer", email: "list1@example.com" });
      const home = await testHome();
      const out: string[] = [];
      const io = buildIo(db, {
        env: { XDG_CONFIG_HOME: path.join(home, "config"), JOBSMITH_URL: "http://test.local", JOBSMITH_TOKEN: token },
        stdout: (t) => out.push(t),
      });
      const code = await run(["list"], io);
      expect(code).toBe(0);
      expect(out.join("")).toContain("nwl-designer");
      expect(out.join("")).toContain("Product Designer at Northwind Labs");
    } finally {
      await close();
    }
  });

  it("pull writes <slug>-context.md under --out", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seedJob(db, { slug: "nwl-designer", email: "pull1@example.com" });
      const outDir = await mkdtemp(path.join(os.tmpdir(), "jobsmith-pull-"));
      const out: string[] = [];
      const io = buildIo(db, {
        env: { JOBSMITH_URL: "http://test.local", JOBSMITH_TOKEN: token },
        cwd: outDir,
        stdout: (t) => out.push(t),
      });
      const code = await run(["pull", "nwl-designer", "--out", "."], io);
      expect(code).toBe(0);
      const filePath = path.join(outDir, "nwl-designer-context.md");
      expect(out.join("")).toBe(`Wrote ${filePath}.\n`);
      const content = await readFile(filePath, "utf8");
      expect(content).toContain("jobsmith: context/v1");
    } finally {
      await close();
    }
  });

  it("push of the fixture packet reports 11 created and one warning", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s, opportunity, token } = await seedJob(db, { slug: "nwl-designer", email: "push1@example.com" });
      const out: string[] = [];
      const io = buildIo(db, {
        env: { JOBSMITH_URL: "http://test.local", JOBSMITH_TOKEN: token },
        stdout: (t) => out.push(t),
      });

      const code = await run(["push", "nwl-designer", "--dir", PACKET_DIR, "--prefix", "nwl"], io);
      const printed = out.join("");
      expect(code).toBe(0);
      expect(printed).toContain("11 created, 0 versioned, 0 updated, 0 unchanged.");
      expect(printed).toContain(
        'Warning: debrief-round2: no stage matches "Final loop", stored without a stage.',
      );
      expect((printed.match(/^  created /gm) ?? []).length).toBe(11);

      const documents = await s.artifact.listLatestForOpportunity(opportunity.id);
      expect(documents).toHaveLength(11);
      const events = await s.event.listForOpportunity(opportunity.id);
      expect(events.filter((e) => e.kind === "artifact_pushed")).toHaveLength(1);
    } finally {
      await close();
    }
  });

  it("a second push of the same packet reports 11 unchanged and adds no second event", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s, opportunity, token } = await seedJob(db, { slug: "nwl-designer", email: "push2@example.com" });
      const io = () => buildIo(db, { env: { JOBSMITH_URL: "http://test.local", JOBSMITH_TOKEN: token } });

      const first = await run(["push", "nwl-designer", "--dir", PACKET_DIR, "--prefix", "nwl"], io());
      expect(first).toBe(0);

      const out: string[] = [];
      const second = await run(
        ["push", "nwl-designer", "--dir", PACKET_DIR, "--prefix", "nwl"],
        { ...io(), stdout: (t) => out.push(t) },
      );
      expect(second).toBe(0);
      expect(out.join("")).toContain("0 created, 0 versioned, 0 updated, 11 unchanged.");

      const events = await s.event.listForOpportunity(opportunity.id);
      expect(events.filter((e) => e.kind === "artifact_pushed")).toHaveLength(1);
      expect(await s.artifact.listLatestForOpportunity(opportunity.id)).toHaveLength(11);
    } finally {
      await close();
    }
  });

  it("--dry-run reports what would happen and writes nothing", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s, opportunity, token } = await seedJob(db, { slug: "nwl-designer", email: "push3@example.com" });
      const out: string[] = [];
      const io = buildIo(db, {
        env: { JOBSMITH_URL: "http://test.local", JOBSMITH_TOKEN: token },
        stdout: (t) => out.push(t),
      });
      const code = await run(["push", "nwl-designer", "--dir", PACKET_DIR, "--prefix", "nwl", "--dry-run"], io);
      expect(code).toBe(0);
      const printed = out.join("");
      expect(printed).toContain("Dry run: nothing was saved.");
      expect(printed).toContain("11 created, 0 versioned, 0 updated, 0 unchanged.");

      expect(await s.artifact.listLatestForOpportunity(opportunity.id)).toEqual([]);
      expect(await s.event.listForOpportunity(opportunity.id)).toEqual([]);
    } finally {
      await close();
    }
  });

  it("a revoked token exits 1 with the refused line, for list, pull and push alike", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s, token } = await seedJob(db, { slug: "nwl-designer", email: "revoked1@example.com" });
      const list = await s.apiToken.list();
      await revokeApiToken(s, list[0]!.id);
      const err: string[] = [];
      const io = buildIo(db, {
        env: { JOBSMITH_URL: "http://test.local", JOBSMITH_TOKEN: token },
        stderr: (t) => err.push(t),
      });
      const code = await run(["list"], io);
      expect(code).toBe(1);
      expect(err.join("")).toBe(
        "The server refused the token. Create a new one in Settings and run jobsmith login.\n",
      );
    } finally {
      await close();
    }
  });

  it("list, pull and push all refuse to run before login, with the same message", async () => {
    const { db, close } = await makeTestDb();
    try {
      const home = await testHome();
      const argvByCommand = [["list"], ["pull", "nwl-designer"], ["push", "nwl-designer"]];
      for (const argv of argvByCommand) {
        const err: string[] = [];
        const io = buildIo(db, {
          env: { XDG_CONFIG_HOME: path.join(home, "config") },
          homedir: home,
          stderr: (t) => err.push(t),
        });
        expect(await run(argv, io), argv.join(" ")).toBe(1);
        expect(err.join(""), argv.join(" ")).toBe("Not logged in. Run jobsmith login first.\n");
      }
    } finally {
      await close();
    }
  });
});
```

- [ ] **Step 9: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/integration/cli-bridge.test.ts
```

Expected: fails, because `@/cli/src/main` (and the files it imports) either do not exist yet or are incomplete, depending on how much of Steps 2 to 4 already landed by the time this is run.

- [ ] **Step 10: Confirm every step above is in place, then run it and confirm it passes**

```bash
pnpm exec vitest run tests/integration/cli-bridge.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 9 passed (9)`.

If the push test's warning text does not match exactly, re-check the fixture's `nwl-debrief-round2.md` frontmatter (`stage: Final loop`) against `matchStageRef` (Task 3): "Final loop" must match neither a default stage's label nor, kind-normalized, any default stage's kind. If the count is not exactly 11 created, re-check that `unrelated-notes.md` (no `nwl-` prefix) and `nwl-context.md` (skipped on its own frontmatter) are both correctly excluded, and that none of the other eleven files' bodies is empty after frontmatter stripping.

- [ ] **Step 11: Write the failing bundle test**

Create `tests/integration/cli-bundle.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as esbuild from "esbuild";

const execFileAsync = promisify(execFile);

describe("CLI bundle", () => {
  it(
    "builds one ESM file with the real build options, importing nothing from node_modules, and runs under plain Node",
    async () => {
      const outDir = await mkdtemp(path.join(os.tmpdir(), "jobsmith-bundle-test-"));
      const outfile = path.join(outDir, "jobsmith.mjs");
      const repoRoot = path.resolve(import.meta.dirname, "../..");

      const result = await esbuild.build({
        entryPoints: [path.join(repoRoot, "cli/src/index.ts")],
        bundle: true,
        platform: "node",
        target: "node20",
        format: "esm",
        outfile,
        banner: { js: "#!/usr/bin/env node" },
        tsconfig: path.join(repoRoot, "tsconfig.json"),
        metafile: true,
      });

      // No runtime dependencies means every input the bundle
      // actually pulled in is either the CLI's own source or the one leaf
      // module it is allowed to import; nothing from node_modules.
      for (const input of Object.keys(result.metafile!.inputs)) {
        expect(input.includes("node_modules"), input).toBe(false);
      }

      const { stdout } = await execFileAsync(process.execPath, [outfile, "--version"]);
      expect(stdout.trim()).toBe("0.1.0");
    },
    30_000,
  );
});
```

- [ ] **Step 12: Add `esbuild` as a devDependency**

```bash
pnpm add -D esbuild@0.28.2
```

Expected: `esbuild` appears under `devDependencies` in `package.json` at exactly `0.28.2`; the lockfile already carries this version through `tsx`'s own dependency on it (frame's tech stack note), so this installs nothing new.

- [ ] **Step 13: Run the bundle test and confirm it passes**

```bash
pnpm exec vitest run tests/integration/cli-bundle.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 1 passed (1)`. This step is unverified beyond what this test itself proves: a planning scratch file ran an equivalent bundle successfully under this same Node version (only Node 26 is installed here; Node 20 itself is untested), and neither this test nor any other step in this plan runs `npm install -g ./cli` (D30's install story, the owner's call, left for the owner to try by hand).

- [ ] **Step 14: Write `cli/package.json` in full**

```json
{
  "name": "jobsmith-cli",
  "version": "0.1.0",
  "private": true,
  "license": "AGPL-3.0-only",
  "type": "module",
  "bin": {
    "jobsmith": "dist/jobsmith.mjs"
  },
  "engines": {
    "node": ">=20"
  },
  "files": ["dist"]
}
```

This file is never installed as a pnpm workspace member (`pnpm-workspace.yaml` has no `packages` key), verified at planning time: pnpm 11 simply ignores a nested `package.json` when there is nothing in `packages` pointing at its folder, so this file exists purely for `npm install -g ./cli` to read later and does not touch the lockfile.

- [ ] **Step 15: Write `scripts/build-cli.mjs` in full**

```javascript
import * as esbuild from "esbuild";
import { chmod } from "node:fs/promises";

await esbuild.build({
  entryPoints: ["cli/src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "cli/dist/jobsmith.mjs",
  banner: { js: "#!/usr/bin/env node" },
  tsconfig: "tsconfig.json",
});

// esbuild's own output does not carry the execute bit; the shebang banner
// above is useless for a direct `./cli/dist/jobsmith.mjs` invocation (and
// for cli/package.json's own `bin` entry once installed) without it.
await chmod("cli/dist/jobsmith.mjs", 0o755);

console.log("Built cli/dist/jobsmith.mjs");
```

Every path above is relative to the process's current working directory, which is the repo root whenever this runs through the `cli:build` package script (Step 16), the normal way to invoke it.

- [ ] **Step 16: Add the two root package.json scripts and the .gitignore line**

Edit `package.json`'s `scripts` block, adding two entries (order does not matter; placed here next to the other `db:`/`cli`-adjacent scripts for readability):

```json
    "cli:build": "node scripts/build-cli.mjs",
    "jobsmith": "node cli/dist/jobsmith.mjs",
```

Edit `.gitignore`, adding one line in the "misc"/build-output section:

```
/cli/dist/
```

- [ ] **Step 17: Build the real CLI and smoke-test it by hand**

```bash
pnpm cli:build
node cli/dist/jobsmith.mjs --version
node cli/dist/jobsmith.mjs --help
```

Expected: the build prints `Built cli/dist/jobsmith.mjs`; `--version` prints `0.1.0`; `--help` prints the exact usage block from Task 8's `USAGE` constant. This is a manual sanity check, not a new automated test: `tests/integration/cli-bundle.test.ts` already covers the bundle mechanically, into a temporary file rather than the real `cli/dist/`.

- [ ] **Step 18: Run the wider checks**

```bash
pnpm typecheck
pnpm lint
pnpm exec vitest run tests/unit/cli-imports.test.ts
pnpm test
```

Expected: all commands exit 0, with `pnpm test` reporting every existing test still passing alongside this task's 9 + 1 = 10 new ones (`tests/integration/cli-bridge.test.ts` and `tests/integration/cli-bundle.test.ts`; every other file in this task has no dedicated automated test of its own, by design, as explained in Steps 1 and 2).

- [ ] **Step 19: Commit**

```bash
git add cli tests/helpers/bridge-fetch.ts tests/fixtures/packet tests/integration/cli-bridge.test.ts tests/integration/cli-bundle.test.ts scripts/build-cli.mjs package.json .gitignore
git commit -m "$(cat <<'EOF'
feat: add the CLI commands, the esbuild bundle, and the fictional interview packet fixture
EOF
)"
```

---
