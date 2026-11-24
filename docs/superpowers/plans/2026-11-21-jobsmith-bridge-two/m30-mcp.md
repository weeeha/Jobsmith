# Milestone 30: MCP

> Done when: "In Claude Code on the owner's Mac, through `jobsmith mcp`, the model lists jobs, reads a context and writes a document that shows on the job page as pushed version 1, a second identical write reports `unchanged`, the same tools answer through `claude mcp add --transport http` with a bearer header, and Claude Desktop lists them."

Branch: `feat/m30-mcp`, cut from `main`. Read `README.md` of this folder first (Contract, Global Constraints). Tasks 1 to 14.

## Before starting

Run in the worktree, as `bash -c '...'`:

```bash
test -f lib/bridge/handlers.ts && test -f lib/bridge/context.ts && test -f cli/src/main.ts && echo core-ok
test -f lib/prep/parse.ts && echo prep-ok                              # Prep: get_prep, job/v1 prep block
ls lib/db/scoped | grep -E 'prep' ; echo "prep helpers above"
test -f lib/companies/open-roles.ts && echo apply-research-ok          # Apply and Research 23: open roles reader
grep -rn "artifacts/\[key\]" app/api/bridge >/dev/null 2>&1 && echo document-routes-ok   # Apply and Research: document read route
test -f lib/notify/write.ts && test -f lib/feed/items.ts && echo feed-ok
test -f lib/generate/start.ts && echo hosted-ok
```

What to leave out when a line does not print: `prep-ok` missing means Task 4 sets the `prep` block to `{ questions: 0, solid: 0, okay: 0, shaky: 0, unmarked: 0 }` and Task 7 skips `get_prep`; `document-routes-ok` missing means Task 4 sets `documents` to `[]`, Task 7 skips `list_documents` and `read_document`, Task 9 skips the document template; `feed-ok` or `apply-research-ok` missing means Tasks 11 and 13 are skipped. `hosted-ok` missing means `applyPush` has no suspension or storage check (Task 8). Each skip goes in the task report and in the pull request description. The tool-name test in Task 5 lists the skipped tools as expected-absent through one constant, `SKIPPED_TOOLS`, so the suite stays green and names what is missing.

---

### Task 1: SDK install and protocol confirmation

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (dependency `@modelcontextprotocol/sdk`, exact version)
- Create: `lib/mcp/protocol.ts`, `tests/unit/mcp-protocol.test.ts`, `tests/unit/mcp-sdk-probe.test.ts`
- Create (only if the probe in Step 3 fails): `lib/mcp/rpc.ts` is written in Task 10, not here; this task only records the decision.

**Interfaces:**
- Consumes: `MCP_PROTOCOL_BASELINE` from `lib/bridge/wire.ts` (added in Step 5 below).
- Produces:

```ts
// lib/mcp/protocol.ts
export const MCP_SUPPORTED_VERSIONS: readonly string[];   // the SDK's list, confirmed, includes "2025-06-18"
export const IMPLEMENTED_METHODS: ReadonlySet<string>;     // milestone 30: initialize, notifications/initialized, ping, tools/list, tools/call, resources/list, resources/templates/list, resources/read
export const MCP_PATH_BRANCH: "sdk" | "rpc";               // the decision recorded by this task
```

- [ ] **Step 1: Install and pin**

Run: `pnpm add -E @modelcontextprotocol/sdk` (network is allowed for this step only). Record the installed version in the task report. If pnpm asks to approve build scripts, read them first and approve only what the SDK itself needs.

- [ ] **Step 2: Confirm message shapes against the published specification**

Fetch the published Model Context Protocol specification, revision 2025-06-18, and read: the Streamable HTTP transport section (POST only here, one message per request, 202 for notifications and responses, the `MCP-Protocol-Version` header and what a server does when it is absent or invalid, the Origin rule), lifecycle (initialize request and result fields, `notifications/initialized`), `ping`, tools (`tools/list` result and `nextCursor`, `tools/call` result with `content`, `structuredContent`, `isError`, `outputSchema`, annotations, resource links), resources (`resources/list`, `resources/templates/list`, `resources/read` result and the not-found error code), prompts and completion (read now, used in Task 39). Write one table into the task report with the exact field names and error codes the spec gives. Do not copy a shape from memory or from this plan: every field name used in Tasks 5 to 11 comes from that table. Where the specification is silent, the table says "unspecified" and the task that needs it picks the SDK's behavior and says so.

- [ ] **Step 3: Probe the installed SDK**

Write `tests/unit/mcp-sdk-probe.test.ts`. It must show, against the installed release and with no network:

```ts
// test names and assertions
it("builds an McpServer whose tool takes a zod 4 input and output schema, lists it and calls it", ...)   // tools/list names "probe", inputSchema.type is "object"; tools/call returns structuredContent equal to the handler's object
it("a Web-standard Streamable HTTP server transport answers a POST built from a Request with a JSON body, stateless, JSON responses", ...) // status 200, content-type application/json, no Mcp-Session-Id header
it("the same transport answers a notification with 202 and no body", ...)
it("the SDK Client can be pointed at a custom fetch or a custom Transport so a test calls a route handler in process", ...) // initialize through it returns serverInfo
```

Use whichever exports the installed release has (class names, option names for stateless and JSON mode, `parsedBody` or not). Record the names in the report. If the first or second test cannot pass because the transport or zod 4 support is missing, set `MCP_PATH_BRANCH = "rpc"` and stop that test with a comment; Task 10 then writes `lib/mcp/rpc.ts`.

- [ ] **Step 4: Run it and watch it fail, then write `protocol.ts`**

Run: `pnpm vitest run tests/unit/mcp-sdk-probe.test.ts tests/unit/mcp-protocol.test.ts`
Expected: FAIL, `lib/mcp/protocol.ts` and the wire constant do not exist.

`tests/unit/mcp-protocol.test.ts`: `it("supports the baseline revision", ...)` (`MCP_SUPPORTED_VERSIONS` contains `MCP_PROTOCOL_BASELINE`); `it("lists exactly the eight milestone 30 methods", ...)`; `it("records a branch the code can follow", ...)` (`MCP_PATH_BRANCH` is `"sdk"` or `"rpc"`, and when `"rpc"` the test only checks the string).

- [ ] **Step 5: Implement**

Add `MCP_PROTOCOL_BASELINE`, `EVENTS_PAGE_MAX`, `EVENTS_PAGE_DEFAULT` (100), `EVENTS_LOOKBACK_DEFAULT_HOURS`, `EVENTS_LOOKBACK_MAX_DAYS`, `LIST_JOBS_MAX`, `LIST_JOBS_DEFAULT`, `FEED_ITEMS_MAX`, `FEED_ITEMS_DEFAULT`, `RESOURCES_PAGE` to `lib/bridge/wire.ts` with the Contract values (no import). Write `lib/mcp/protocol.ts` from the probe's findings.

- [ ] **Step 6: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/mcp-protocol.test.ts tests/unit/mcp-sdk-probe.test.ts tests/unit/bridge-wire.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml lib/mcp/protocol.ts lib/bridge/wire.ts tests/unit/mcp-protocol.test.ts tests/unit/mcp-sdk-probe.test.ts
git commit -m "feat(mcp): install the SDK and record the protocol findings"
```

**Acceptance:** (spec 3) the installed release, its Web-standard transport and its zod 4 support are confirmed or the `rpc` branch is recorded; (5.1) the specification table is in the report; (10) the SDK is a dependency of the app only (`cli/package.json` unchanged, `cli-bundle.test.ts` still green).

---

### Task 2: Move authenticate, the deps type and logging; widen the error table

**Files:**
- Create: `lib/bridge/auth.ts`, `lib/bridge/log.ts`, `lib/bridge/context-load.ts`, `tests/integration/bridge-auth.test.ts`
- Modify: `lib/bridge/handlers.ts` (remove the private `authenticate`, `AuthResult`, `logBridgeError` and the `BridgeDeps` type; import them; `handleGetContext` calls `loadContextDocument`), `lib/bridge/errors.ts` (status union gains 403 and 409, `origin_refused`), `lib/bridge/deps.ts` (`appUrl`), `tests/unit/bridge-errors.test.ts`
- Test: `tests/integration/bridge-auth.test.ts`, `tests/unit/bridge-log.test.ts`

**Interfaces:**
- Consumes: `parseBearer`, `bridgeError` (`lib/bridge/http.ts`); `authenticateBearer` (`lib/auth/api-token.ts`); `scoped` (`lib/db/scoped`); `getJobView` (`lib/pipeline/read.ts`); `buildContextDocument` (`lib/bridge/context.ts`).
- Produces:

```ts
// lib/bridge/auth.ts
export type BridgeDeps = { db: Db; now(): Date; revalidate(path: string): void; requestId(): string; appUrl?: string };
export type AuthResult = { ok: true; userId: string; s: Scoped } | { ok: false; response: Response };
export async function authenticate(deps: BridgeDeps, request: Request, requestId: string, now: Date): Promise<AuthResult>;
// lib/bridge/log.ts
export function logBridgeError(requestId: string, error: unknown): void;     // unchanged body, moved
export function logMcp(line: { requestId: string; method: string; tool?: string; code: string; ms: number }): void; // prefix "[mcp]"
// lib/bridge/context-load.ts
export async function loadContextDocument(s: Scoped, slug: string, now: Date): Promise<string | null>;
```

`handlers.ts` keeps `export type { BridgeDeps } from "./auth"` so existing test imports (`@/lib/bridge/handlers`) still compile.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/integration/bridge-auth.test.ts
it("answers 401 unauthorized for no header, a Basic header, a malformed token, an unknown token and a revoked token", ...)
it("never reads a cookie: a session-looking cookie alone is 401", ...)
it("returns ok with the token owner's userId and a Scoped for that user", ...)
it("counts each call once: the 120th passes, the 121st is 429 rate_limited with Retry-After between 1 and 60", ...)   // fixed now, as bridge-handlers.test.ts does
// tests/unit/bridge-errors.test.ts additions
it("origin_refused is status 403 with the Contract message", ...)
it("every code's status is one of 400, 401, 403, 404, 409, 413, 429, 500", ...)
// tests/unit/bridge-log.test.ts
it("logMcp prints one [mcp] line with request id, method, tool, code and ms, and nothing else", ...)  // spy on console.info
it("logBridgeError prints the constructor name and, for a DrizzleQueryError, only code and constraint", ...)
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/bridge-auth.test.ts tests/unit/bridge-errors.test.ts tests/unit/bridge-log.test.ts`
Expected: FAIL, `lib/bridge/auth.ts` and `lib/bridge/log.ts` do not exist.

- [ ] **Step 3: Implement**

Move the function bodies unchanged; only imports and exports change. `BRIDGE_ERRORS`' status type becomes `400 | 401 | 403 | 404 | 409 | 413 | 429 | 500`; add `origin_refused` (403) with the Contract message. `productionDeps()` adds `appUrl: env().APP_URL` (`lib/env.ts`). `loadContextDocument` is the body of `handleGetContext` after the slug check (view, company documents, `buildContextDocument`), returning null when the job is absent.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/bridge-auth.test.ts tests/integration/bridge-handlers.test.ts tests/integration/cli-bridge.test.ts tests/unit/bridge-errors.test.ts tests/unit/bridge-log.test.ts && pnpm typecheck`
Expected: PASS (the two existing bridge suites pass unchanged, which is the proof the move changed nothing)

- [ ] **Step 5: Commit**

```bash
git add lib/bridge tests/integration/bridge-auth.test.ts tests/unit/bridge-errors.test.ts tests/unit/bridge-log.test.ts
git commit -m "refactor(bridge): move authenticate, deps type and logging to their own modules"
```

**Acceptance:** (5.1) `authenticate` lives in `lib/bridge/auth.ts` and `grep -n "function authenticate" lib/bridge/handlers.ts` finds nothing; (6) `origin_refused` and the 403 and 409 statuses exist; (7) the existing bridge handler and CLI suites pass unmodified.

---

### Task 3: Events feed

**Files:**
- Create: `lib/bridge/events.ts`, `app/api/bridge/events/route.ts`, `tests/integration/bridge-events.test.ts`, `tests/unit/bridge-events-cursor.test.ts`
- Modify: `lib/db/scoped/event.ts` (add `listFeed`), `lib/bridge/handlers.ts` (add `handleListEvents`), `lib/bridge/wire.ts` (`WireEvent`, `WireEventsResponse`), `tests/helpers/bridge-fetch.ts` (route `GET /api/bridge/events`), `tests/integration/scoped-isolation.test.ts` (one case)
- Test: as listed

**Interfaces:**
- Consumes: `authenticate` (Task 2); `Scoped.event` (`lib/db/scoped/event.ts`, existing `insert`, `listAll`).
- Produces:

```ts
// lib/db/scoped/event.ts
export type FeedEventRow = { id: string; kind: string; slug: string; stageLabel: string | null; occurredAt: Date; createdAt: Date; body: string | null; meta: unknown };
// inside eventQueries:  async listFeed(input: { since: Date; after: { createdAt: Date; id: string } | null; limit: number }): Promise<FeedEventRow[]>
// lib/bridge/events.ts
export function encodeCursor(createdAt: Date, id: string): string;                  // base64url of "<ISO>|<id>"
export function decodeCursor(value: string): { createdAt: Date; id: string } | null;
export async function listEvents(s: Scoped, input: { after: string | null; limit: number; now: Date }): Promise<Result<{ events: WireEvent[]; next: string | null }, "invalid_cursor">>;
export async function handleListEvents(deps: BridgeDeps, request: Request): Promise<Response>;   // exported from handlers.ts
```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/bridge-events-cursor.test.ts
it("round-trips a created time and an id", ...)
it("returns null for text that is not base64url, for a missing separator and for a bad date", ...)
// tests/integration/bridge-events.test.ts (PGlite, real migrations; events inserted with s.event.insert and explicit createdAt through a raw update, since createdAt defaults to now)
it("returns events oldest first by created time then id, with slug and stage label, occurred_at and created_at as ISO strings", ...)
it("with no cursor starts 24 hours before now", ...)       // an event 25 h old is absent, one 23 h old is present
it("never reaches back more than 90 days, even for a cursor older than that", ...)
it("next continues exactly: two pages over events sharing one created time yield each event once", ...)  // limit 1, three ties
it("an empty page returns the after that was sent, and null when none was", ...)
it("limit 0, 201 and abc answer 400 invalid_query; a cursor that is not one answers 400 invalid_query", ...)
it("user B's token never sees user A's events", ...)
it("401 without a token; 429 over the rate window", ...)
```

Add to `scoped-isolation.test.ts`: `event.listFeed excludes A's rows for B`.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/bridge-events-cursor.test.ts tests/integration/bridge-events.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

`listFeed` joins `opportunity` (slug) and left joins `stage` (label) with the `user_id` predicate on every table (Core's scoped pattern), orders by `created_at asc, id asc`, and compares the cursor as the tuple `(created_at, id) > (c, id)` with `sql`. `listEvents` computes `since = max(after.createdAt, now - 90 days)` when a cursor is given and `now - 24 hours` when not (`EVENTS_LOOKBACK_*`), reads `limit` rows, maps to `WireEvent` (`stage` is the label or null, `body` null when empty, `meta` the stored object), and sets `next` to the cursor of the last row, or to the incoming `after` for an empty page. The default `limit` is `EVENTS_PAGE_DEFAULT`; the handler accepts 1 to `EVENTS_PAGE_MAX`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/bridge-events-cursor.test.ts tests/integration/bridge-events.test.ts tests/integration/scoped-isolation.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/bridge lib/db/scoped/event.ts app/api/bridge/events tests
git commit -m "feat(bridge): events feed read by polling"
```

**Acceptance:** (5.11) `GET /api/bridge/events?after=&limit=` returns the user's events in `created_at` order with an opaque `next`; (5.11) default 24 hours back and 90 days at most; (7) isolation case added.

---

### Task 4: `job/v1` and its route

**Files:**
- Create: `lib/bridge/job-json.ts`, `app/api/bridge/opportunities/[slug]/route.ts`, `tests/unit/bridge-job-json.test.ts`, `tests/integration/bridge-job.test.ts`
- Modify: `lib/bridge/handlers.ts` (add `handleGetJob`), `lib/bridge/wire.ts` (`JobJson` type), `tests/helpers/bridge-fetch.ts` (route `GET /api/bridge/opportunities/:slug`)
- Test: as listed

**Interfaces:**
- Consumes: `getJobView` (`lib/pipeline/read.ts`, returns `JobView`); `parseStoredFit` (`lib/fit/stored.ts`); `hardFilters`, `HardFilterResult` (`lib/fit/hard-filters.ts`); `loadFitProfile` (`lib/fit/profile.ts`); `PERSON_ROLE_LABELS` is not used (roles stay as stored values); Apply and Research's document index function (the one behind `GET /api/bridge/opportunities/:slug/artifacts`; record its name); Prep's readers for question counts (record their names).
- Produces:

```ts
// lib/bridge/wire.ts
export type JobJsonDocument = { key: string; kind: string; scope: WireScope; title: string; stage: string | null; version: number; origin: string; updated_at: string; edited: boolean; sent_at: string | null; open_request: JobJsonOpenRequest | null };
export type JobJsonOpenRequest = Record<string, unknown>;   // copy the exact fields of the open-request entry in Apply and Research's JSON index here (spec 5.4 keeps them as defined there); Task 23 changes only where they are read from
export type JobJson = {
  schema: "job/v1"; generated_at: string; slug: string; role: string;
  company: { name: string; domain: string | null; size: string | null; industry: string | null; hq: string | null };
  location: string | null; work_mode: string | null; status: "active" | "closed"; closed_reason: string | null;
  source_url: string | null; posting_captured_at: string | null;
  current_stage: { id: string; kind: string; label: string };
  stages: { id: string; position: number; kind: string; label: string; status: string; scheduled_at: string | null; completed_at: string | null; format: string | null }[];
  people: { name: string; title: string | null; role: string; stage: string | null; linkedin_url: string | null }[];
  fit: { status: string; score: number | null; summary: string | null; failed_filters: string[] } | null;
  next_action: string | null; next_action_at: string | null;
  documents: JobJsonDocument[];
  prep: { questions: number; solid: number; okay: number; shaky: number; unmarked: number };
  requests: { id: string; kind: string; target: string; status: string; stage: string | null; runner: string | null }[];
};
// lib/bridge/job-json.ts
export type JobJsonInput = { view: JobView; documents: JobJsonDocument[]; prep: JobJson["prep"]; requests: JobJson["requests"]; failedFilters: string[]; generatedAt: Date };
export function buildJobJson(input: JobJsonInput): JobJson;                 // pure
export async function loadJobJson(s: Scoped, slug: string, now: Date): Promise<JobJson | null>;
export async function handleGetJob(deps: BridgeDeps, request: Request, slug: string): Promise<Response>;   // in handlers.ts
```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/bridge-job-json.test.ts (a fixture job at Northwind Traders, two stages, one person with an email)
it("carries every field of the job/v1 shape in the spec's order, with schema job/v1", ...)
it("leaves person emails out", ...)
it("leaves the posting body out and keeps source_url and posting_captured_at", ...)
it("fit is null when fit_status is none, and carries score, summary and failed_filters when done", ...)
it("stage on a person is the stage label or null", ...)
it("dates are ISO strings and null stays null", ...)
// tests/integration/bridge-job.test.ts
it("GET /api/bridge/opportunities/:slug answers job/v1 for the token's own job", ...)
it("answers 404 not_found for another user's slug and for a slug with a slash", ...)
it("documents holds one entry per key for the job and its company; prep is zeros when the job has no question rows", ...)
it("401 without a token", ...)
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/bridge-job-json.test.ts tests/integration/bridge-job.test.ts`
Expected: FAIL, `lib/bridge/job-json.ts` missing.

- [ ] **Step 3: Implement**

`buildJobJson` is a pure mapper over the `JobView` fields (`opportunity.roleTitle`, `opportunity.workMode`, `opportunity.closedReason`, `opportunity.sourceUrl`, `opportunity.postingCapturedAt`, `company.name`, `stages`, `people` with `link.person`, `link.role`, `link.stageId`). `loadJobJson` reads `getJobView`, the documents via the Apply and Research index function (empty list when it does not exist yet, per "Before starting"), the prep counts via Prep's readers (zeros when absent), `requests` as `[]` (Task 23 fills it), and `failedFilters` from `hardFilters({ roleTitle, location, workMode, compMin, compMax, compCurrency }, (await loadFitProfile(s)).preferences).failed`. `fit.status` is `opportunity.fitStatus`; `score` and `summary` come from `parseStoredFit(opportunity.fit)`. The route is the three-line shape of the existing `context` route.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/bridge-job-json.test.ts tests/integration/bridge-job.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/bridge app/api/bridge/opportunities tests
git commit -m "feat(bridge): job/v1 and its route"
```

**Acceptance:** (5.3) `job/v1` has the listed fields, no posting body and no person email; (5.3) the route is bearer-only with the shared error shape; (9) `documents`, `prep` and `requests` are present with their empty values when their cycles are absent.

---

### Task 5: MCP registry, error mapping, instructions and the static rule

**Files:**
- Create: `lib/mcp/registry.ts`, `lib/mcp/errors.ts`, `lib/mcp/instructions.ts`, `lib/mcp/tools/index.ts`, `tests/unit/mcp-registry.test.ts`, `tests/unit/mcp-static-rule.test.ts`, `tests/unit/mcp-errors.test.ts`
- Modify: none

**Interfaces:**
- Consumes: `Scoped` (`lib/db/scoped`), `BridgeDeps` (Task 2), `Result` (`lib/result.ts`), zod 4 (`zod`).
- Produces: the types `ToolContext`, `ToolOutcome`, `ToolDefinition` of the Contract, and

```ts
// lib/mcp/registry.ts
export function toolByName(name: string): ToolDefinition | undefined;
export const ALLOWED_TOOL_NAMES: readonly string[];      // the twelve names of the Contract
export const SKIPPED_TOOLS: readonly string[];            // names left out by "Before starting", with the reason in a comment
// lib/mcp/tools/index.ts
export const TOOLS: ToolDefinition[];                     // empty here; Tasks 6 to 8, 11 and 24 add entries
// lib/mcp/errors.ts
export const EXPECTED_CODES: readonly ["not_found", "invalid", "job_closed", "request_limit", "path_busy", "suspended", "quota_storage"];
export function failureFromResult(result: { code: string; message: string }): { ok: false; code: string; message: string };
export function internalFailure(requestId: string): { ok: false; code: "server_error"; message: string };   // "Something went wrong on the server. Request id <id>."
// lib/mcp/instructions.ts
export const MCP_INSTRUCTIONS: string;                    // the Contract paragraph, character for character
```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/mcp-static-rule.test.ts
export function findViolations(source: string): string[];   // defined in the test file, exercised on planted strings first
it("flags an import of @/lib/db/schema, of drizzle-orm and of @/lib/db/client", ...)               // planted positives
it("flags s.artifact.insert(, tx.stage.update( and ctx.s.event.delete( as scoped writes", ...)     // planted positives
it("passes a file that only reads through s.opportunity.listSummaries(", ...)
it("no file under lib/mcp has a violation", ...)                                                    // reads every .ts under lib/mcp
// tests/unit/mcp-registry.test.ts
it("every registered tool name is in ALLOWED_TOOL_NAMES and every allowed name is registered or in SKIPPED_TOOLS", ...)
it("no tool name starts with delete, remove, mark, move, close, set or send", ...)
it("every tool sets openWorldHint false and read tools set readOnlyHint true", ...)
it("tool descriptions equal the Contract table", ...)    // table copied into the test as data
// tests/unit/mcp-errors.test.ts
it("failureFromResult keeps code and one-sentence message for each expected code", ...)
it("internalFailure names the request id and carries no stack text", ...)
it("MCP_INSTRUCTIONS equals the Contract paragraph and mentions data with no instructions in it", ...)
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/mcp-static-rule.test.ts tests/unit/mcp-registry.test.ts tests/unit/mcp-errors.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

The static rule tests the checker first on planted positives, so a checker that matches nothing cannot pass (Global Constraints, "a check that reports zero proves nothing until it has caught a planted positive"). The registry file holds types and helpers only; each tool module exports one `ToolDefinition`. `TOOLS` starts empty.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/mcp-static-rule.test.ts tests/unit/mcp-registry.test.ts tests/unit/mcp-errors.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/mcp tests/unit
git commit -m "feat(mcp): tool registry, error mapping, instructions and the no-write rule"
```

**Acceptance:** (principle 32) a test fails when `lib/mcp` imports the schema or calls a scoped insert, update or delete, and it has caught a planted violation; (5.2) expected failures map one to one from `Result`; (5.1) the instructions paragraph is fixed.

---

### Task 6: Read tools: list_jobs, get_job, get_job_context

**Files:**
- Create: `lib/mcp/tools/list-jobs.ts`, `lib/mcp/tools/get-job.ts`, `lib/mcp/tools/get-job-context.ts`, `tests/integration/mcp-tools-jobs.test.ts`
- Modify: `lib/mcp/tools/index.ts` (register), `lib/db/scoped/opportunity.ts` (`OpportunitySummary` and `listSummaries` gain fields), `tests/integration/scoped.test.ts` or the existing summaries test (extend)
- Test: as listed

**Interfaces:**
- Consumes: `ToolDefinition` (Task 5), `loadJobJson` (Task 4), `loadContextDocument` (Task 2), `listSummaries` (`lib/db/scoped/opportunity.ts`, today returns `slug, roleTitle, companyName, companyId, status, stage`), `SLUG_PATTERN`, `STAGE_KIND_VALUES` (`lib/pipeline/values.ts`).
- Produces:

```ts
// OpportunitySummary (lib/db/scoped/opportunity.ts) gains:
fitScore: number | null; nextAction: string | null; nextActionAt: Date | null; updatedAt: Date;
// tools
listJobs: ToolDefinition   // input { status?: "active"|"closed"|"all" (default "active"), stage_kind?: StageKind, limit?: 1..200 (default 100) }
getJob: ToolDefinition      // input { slug }, output JobJson
getJobContext: ToolDefinition // input { slug }, text = context/v1 markdown, one resource_link to jobsmith://jobs/<slug>/context (text/markdown)
```

Output of `list_jobs`: `{ jobs: [{ slug, company, role, status, stage { kind, label }, fit_score, next_action, next_action_at, updated_at }] }`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/integration/mcp-tools-jobs.test.ts (PGlite; call each handler with a ToolContext built from a seeded user)
it("list_jobs returns the active jobs of the token's user with fit_score, next_action and updated_at, ordered as the bridge list", ...)
it("list_jobs status closed and all, stage_kind filter and limit cut the list", ...)
it("list_jobs never returns another user's job", ...)
it("list_jobs input schema rejects limit 0 and 201", ...)
it("get_job returns job/v1 for a slug and not_found with 'No job with the slug <slug>.' for another user's slug", ...)
it("get_job_context returns the context/v1 markdown as text plus one resource_link", ...)
it("get_job_context text equals the body of GET /context for the same job and time", ...)
it("the three tools declare readOnlyHint true and openWorldHint false", ...)
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/mcp-tools-jobs.test.ts`
Expected: FAIL, tools missing.

- [ ] **Step 3: Implement**

Extend `listSummaries`' select with `schema.opportunity.fitScore`, `nextAction`, `nextActionAt`, `updatedAt`; the existing handler maps explicit fields so the bridge list is unchanged (its test is the guard). Tool descriptions are the Contract's text. Slug inputs are `z.string().regex(SLUG_PATTERN, "slug must be letters, digits and hyphens.")`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/mcp-tools-jobs.test.ts tests/integration/bridge-handlers.test.ts tests/unit/mcp-registry.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/mcp lib/db/scoped/opportunity.ts tests
git commit -m "feat(mcp): list_jobs, get_job and get_job_context"
```

**Acceptance:** (5.2) the three tools match the table's inputs and outputs; (5.2) reads go through `listSummaries`, `loadJobJson` and `buildContextDocument`; (7) one user never sees another's rows.

---

### Task 7: Document, profile and prep read tools

**Files:**
- Create: `lib/mcp/tools/list-documents.ts`, `lib/mcp/tools/read-document.ts`, `lib/mcp/tools/get-profile.ts`, `lib/mcp/tools/get-prep.ts`, `tests/integration/mcp-tools-docs.test.ts`
- Modify: `lib/mcp/tools/index.ts`
- Test: as listed

**Interfaces:**
- Consumes: Apply and Research's index function and document read (names recorded in Task 4's report; from `lib/bridge/*` or `lib/artifacts/*`); `getProfile` (`lib/profile/index.ts`, `ProfileView { headline, timezone, resumeMd }`); `loadFitProfile` (`lib/fit/profile.ts`, `preferences`); `preferencesSummaryLines` (`lib/preferences/summary.ts`); Prep's scoped helpers for `prep_question` and `prep_mark` (names from `ls lib/db/scoped`).
- Produces: `listDocuments`, `readDocument`, `getProfile`, `getPrep` as `ToolDefinition`s.

Outputs exactly as the spec's table: `list_documents` `{ documents: [{ key, kind, scope, title, stage, version, origin, updated_at, edited, sent_at, open_request }] }` (same shape as `JobJsonDocument`); `read_document` text `document/v1`, input `{ slug, key, scope?, version? }` (a job's own document wins when `scope` is absent, as the route does); `get_profile` `{ headline, timezone, preferences, preferences_summary: string[], resume_chars, resume_md? }`; `get_prep` `{ banks: [{ key, title, stage, version, counts { solid, okay, shaky, unmarked }, questions: [{ number, section, question, question_key, mark, marked_at, drill_count, last_drilled_at, unfilled, has_answer }] }] }`.

- [ ] **Step 1: Write the failing tests**

```ts
it("list_documents returns one row per key for the job and its company with open_request null when none", ...)
it("read_document returns document/v1 markdown with frontmatter key, kind, scope, title, version; version 1 of a two-version key when asked", ...)
it("read_document not_found for an unknown key and for another user's slug", ...)
it("get_profile omits resume_md by default, reports resume_chars, and returns it only with include_resume true", ...)
it("get_profile preferences_summary equals preferencesSummaryLines of the saved preferences", ...)
it("get_prep counts solid, okay, shaky and unmarked per bank and lists unfilled questions with has_answer false", ...)
it("get_prep with a key returns only that bank; a job with no banks returns banks []", ...)
it("the context document never carries resume text (existing rule), checked against get_profile's resume line", ...)
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/mcp-tools-docs.test.ts`
Expected: FAIL, tools missing.

- [ ] **Step 3: Implement**

Each handler is a few lines over the named functions. `mark` is the level (`shaky`, `okay`, `solid`) or null; `unmarked` counts null marks. A bank is the latest version of each question bank key on the job (Prep rows copy `artifact_key`). If a needed Prep or Apply and Research function is missing, apply the "Before starting" rule for that tool and do not write a replacement.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/mcp-tools-docs.test.ts tests/unit/mcp-registry.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/mcp tests
git commit -m "feat(mcp): list_documents, read_document, get_profile and get_prep"
```

**Acceptance:** (5.2) four tools match the table; (5.2) the resume is reachable only through `get_profile` with `include_resume`; (9) skipped tools are named in `SKIPPED_TOOLS`.

---

### Task 8: Shared push and `write_document`

**Files:**
- Create: `lib/bridge/push.ts`, `lib/mcp/tools/write-document.ts`, `tests/integration/bridge-push.test.ts`, `tests/integration/mcp-write-document.test.ts`
- Modify: `lib/bridge/handlers.ts` (`handlePushArtifacts` calls `applyPush` for the block after `toIncoming`), `lib/bridge/push-schema.ts` (export `wireArtifactSchema`), `lib/mcp/tools/index.ts`
- Test: as listed

**Interfaces:**
- Consumes: `upsertArtifacts` (`lib/artifacts/upsert.ts`: `(s, opportunityId, inputs, { origin, dryRun, now }) => Result<UpsertOutcome, "not_found" | "invalid">`), `toIncoming`, `wireArtifactSchema` fields (key by `KEY_PATTERN`, kind non-empty, `body_md` non-empty), `MAX_ARTIFACT_BYTES`, `utf8Bytes`.
- Produces: `applyPush` (Contract) and `writeDocument: ToolDefinition` with input `{ slug, key, kind, body_md, title?, scope?: "opportunity"|"company", stage?, dry_run? }`, output `{ key, scope, status, version, warnings: [{ code, message }] }`, annotations `readOnlyHint false, destructiveHint false, idempotentHint true, openWorldHint false`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/integration/bridge-push.test.ts
it("applyPush revalidates /jobs/<slug> after a change and nothing after a dry run or an unchanged push", ...)
it("a company-scoped change also revalidates every other job slug of that company", ...)
it("applyPush writes one artifact_pushed event for a change and none for unchanged", ...)
// tests/integration/mcp-write-document.test.ts
it("the first write reports created, version 1, and the version's origin is pushed", ...)
it("a second write with the same body reports unchanged and version 1", ...)
it("a changed body reports versioned and version 2", ...)
it("dry_run changes nothing and revalidates nothing", ...)
it("an unknown kind is stored as other and returns warning unknown_kind", ...)
it("a sent version's metadata change is reported unchanged with warning sent_locked", ...)
it("body_md of 1 MiB passes and 1 MiB plus one byte fails the input schema", ...)
it("another user's slug returns not_found; an empty body returns invalid", ...)
it("declares idempotentHint true and destructiveHint false", ...)
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/bridge-push.test.ts tests/integration/mcp-write-document.test.ts`
Expected: FAIL, `lib/bridge/push.ts` missing.

- [ ] **Step 3: Implement**

Move the code after `const inputs = parsed.data.artifacts.map(toIncoming);` in `handlePushArtifacts` (upsert, result mapping, the changed check, the revalidate calls including sibling slugs of a company-scoped change) into `applyPush`, unchanged. If `grep -n "suspended\|quota" lib/bridge/handlers.ts` shows Hosted's checks, they move into `applyPush` too and its error union gains `"suspended" | "quota_storage"`. The tool's handler validates nothing the schema already did, builds one `IncomingArtifact` through `toIncoming`, finds the opportunity through `s.opportunity.getBySlug`, and calls `applyPush` with origin `pushed` (the function fixes the origin).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/bridge-push.test.ts tests/integration/mcp-write-document.test.ts tests/integration/bridge-handlers.test.ts tests/integration/cli-bridge.test.ts tests/unit/mcp-static-rule.test.ts && pnpm typecheck`
Expected: PASS (existing push tests pass unchanged)

- [ ] **Step 5: Commit**

```bash
git add lib/bridge lib/mcp tests
git commit -m "feat(mcp): write_document through one shared push"
```

**Acceptance:** (5.2) `write_document` adds a version with origin `pushed` and nothing else; (Core 5.3 rule 3) a repeat reports `unchanged`; (5.2) the push route and the tool share one function, so revalidation and the `artifact_pushed` event cannot drift.

---

### Task 9: Resources

**Files:**
- Create: `lib/mcp/resources.ts`, `tests/integration/mcp-resources.test.ts`
- Modify: none
- Test: as listed

**Interfaces:**
- Consumes: `loadContextDocument` (Task 2), `loadJobJson` (Task 4), Apply and Research's document read (as in Task 7), `RESOURCES_PAGE`, `s.opportunity.listSummaries("active")` ordered newest first (Task 6 adds `updatedAt`).
- Produces:

```ts
export const RESOURCE_TEMPLATES: { uriTemplate: string; name: string; mimeType: string; description: string }[];
// "jobsmith://jobs/{slug}/context" text/markdown; "jobsmith://jobs/{slug}" application/json; "jobsmith://jobs/{slug}/documents/{key}{?scope,version}" text/markdown
export async function listResources(ctx: ToolContext, cursor: string | null): Promise<{ resources: { uri: string; name: string; mimeType: string }[]; nextCursor: string | null }>;
export async function readResource(ctx: ToolContext, uri: string): Promise<Result<{ uri: string; mimeType: string; text: string }, "not_found" | "invalid">>;
```

- [ ] **Step 1: Write the failing tests**

```ts
it("resources/templates lists the templates (two without the document template when Apply and Research is absent)", ...)
it("listResources returns the context and job/v1 resource of each active job, newest first, 50 per page, with a cursor that continues without repeats", ...)   // 30 jobs gives 50 then 10
it("a closed job is not listed", ...)
it("readResource of a context URI returns the same markdown as get_job_context", ...)
it("readResource of a job URI returns job/v1 JSON text", ...)
it("readResource of a document URI honors scope and version", ...)
it("an unknown slug, a slug with a slash and a malformed URI return not_found or invalid, never another user's data", ...)
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/mcp-resources.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement**

The cursor is base64url of the integer offset into the newest-first list. URI parsing uses a strict pattern per template; the slug is checked with `SLUG_PATTERN` and the key with `KEY_PATTERN`. The not-found JSON-RPC code is the one Task 1 recorded from the specification; this module returns a typed `Result` and Task 10 maps it.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/mcp-resources.test.ts tests/unit/mcp-static-rule.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/mcp tests
git commit -m "feat(mcp): resource templates, listing and reading"
```

**Acceptance:** (5.3) three templates (two when documents are absent), `resources/list` returns the first two for active jobs, newest first, pages of 50 with a cursor; (7) reads are scoped.

---

### Task 10: Transport and endpoint

**Files:**
- Create: `lib/mcp/server.ts` (path A) or `lib/mcp/rpc.ts` (path B, only when `MCP_PATH_BRANCH` is `"rpc"`), `lib/bridge/mcp-handler.ts`, `app/api/bridge/mcp/route.ts`, `lib/app-version.ts`, `tests/helpers/mcp-client.ts`, `tests/integration/mcp-endpoint.test.ts`, `tests/unit/mcp-handler.test.ts`, `tests/unit/app-version.test.ts`
- Modify: `tests/helpers/bridge-fetch.ts` (route `POST|GET|DELETE /api/bridge/mcp`)
- Test: as listed

**Interfaces:**
- Consumes: `authenticate` (Task 2), `readJsonCapped`, `bridgeError`, `MAX_PUSH_BYTES`, `TOOLS`, `MCP_INSTRUCTIONS`, `listResources`, `readResource`, `RESOURCE_TEMPLATES`, `logMcp`, `MCP_SUPPORTED_VERSIONS`, `IMPLEMENTED_METHODS`, `failureFromResult`, `internalFailure`.
- Produces:

```ts
// lib/bridge/mcp-handler.ts
export async function handleMcp(deps: BridgeDeps, request: Request): Promise<Response>;
// lib/mcp/server.ts
export function createMcpServer(ctx: ToolContext): McpServer;     // type from the SDK; tools, resources and nothing else registered; capabilities tools and resources with listChanged and subscribe false
// lib/app-version.ts
export const APP_VERSION: string;                                   // equals package.json's version, checked by a test
// tests/helpers/mcp-client.ts
export async function connectClient(deps: BridgeDeps, token: string): Promise<Client>;   // SDK Client over a transport that calls handleMcp in process, per Task 1's finding
```

Request order inside `handleMcp`, one test each: (1) method other than POST answers 405 with `Allow: POST`; (2) a present `Origin` whose origin differs from `new URL(deps.appUrl).origin`, or any `Origin` when `appUrl` is unset, answers 403 `origin_refused`; (3) `authenticate` (401 or 429, each POST counts once); (4) an `MCP-Protocol-Version` header that is present and not in `MCP_SUPPORTED_VERSIONS` answers 400 `invalid_payload` with the text `Unsupported MCP-Protocol-Version.`; an absent header is accepted as the specification says (Task 1 table); (5) `readJsonCapped(request, MAX_PUSH_BYTES)`; (6) a JSON array (a batch) or a non-object answers 400 with a JSON-RPC error -32600; (7) a message with no `id` (a notification) answers 202 with no body; (8) delegate to the server with a `ToolContext` for the user; (9) one `[mcp]` line.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/mcp-handler.test.ts (handler with a fake db, no SDK needed for the first eight)
it("GET and DELETE answer 405 with Allow: POST", ...)
it("a foreign Origin answers 403 origin_refused before any database read", ...)   // db proxy that throws on any call
it("no Origin header passes the check", ...)
it("an unsupported MCP-Protocol-Version answers 400; a supported one passes", ...)
it("a batch array answers -32600", ...)
it("a notification answers 202 with an empty body", ...)
it("a body over 4 MB answers 413 payload_too_large", ...)
// tests/integration/mcp-endpoint.test.ts (SDK Client in process)
it("initialize answers serverInfo jobsmith with APP_VERSION, the instructions paragraph, and capabilities tools and resources only", ...)
it("tools/list returns exactly the milestone 30 tools with their schemas (snapshot)", ...)
it("tools/call list_jobs, get_job, get_job_context, write_document answer for the token's user", ...)
it("write_document twice through the client reports created then unchanged", ...)   // part of the done-when
it("resources/templates/list, resources/list and resources/read answer", ...)
it("prompts/list and completion/complete answer method not found until milestone 32", ...)
it("401 without a token, with a revoked token", ...)
it("the 121st message in a window is 429 with Retry-After; initialize, tools/list and tools/call each count once", ...)
it("a tool whose database call throws returns isError with 'Something went wrong on the server. Request id' and no stack text", ...)
it("a call for another user's slug returns isError not_found and never data", ...)
it("sends no CORS headers and never reads a cookie (a cookie-only request is 401)", ...)
// tests/unit/app-version.test.ts
it("APP_VERSION equals package.json's version", ...)
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/mcp-handler.test.ts tests/integration/mcp-endpoint.test.ts tests/unit/app-version.test.ts`
Expected: FAIL, handler and server missing.

- [ ] **Step 3: Implement**

Path A: `createMcpServer` registers each `TOOLS` entry with its zod schemas and annotations; the callback calls `handler(ctx, args)`, wraps in try and catch (log with request id, answer `internalFailure`), and builds the result per Task 1's table: a text content item holding the JSON of `structuredContent` for structured output (the specification asks for this for older clients), resource links as `resource_link` content, and `isError: true` with one sentence for a failed outcome. The handler builds a fresh transport and server per request (stateless, JSON responses), passes the already-read body (`parsedBody` if the installed transport takes it, else a rebuilt `Request` over the same bytes), and returns the transport's `Response`. Path B (only if recorded): `lib/mcp/rpc.ts` dispatches the eight methods by hand over the same registry with the same shapes and the same test file. The route exports `POST`, `GET` and `DELETE` calling `handleMcp(productionDeps(), request)` and `export const maxDuration = 60;` (read the Route Segment Config page in `node_modules/next/dist/docs/` first). `proxy.ts` needs no change: its matcher already excludes `api/bridge/`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/mcp-handler.test.ts tests/integration/mcp-endpoint.test.ts tests/unit/app-version.test.ts tests/unit/mcp-static-rule.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/mcp lib/bridge lib/app-version.ts app/api/bridge/mcp tests
git commit -m "feat(mcp): stateless Streamable HTTP endpoint with the bridge's auth"
```

**Acceptance:** (5.1) Origin 403, 405 for GET and DELETE, protocol header 400, 4 MB cap, 202 for notifications, one message per POST each counting once, `maxDuration` 60; (7) no cookie read and no CORS header; (8) the SDK `Client` covers initialize, every tool, resources, auth, Origin and the rate window.

---

### Task 11: Feed handoff, server side

**Files:**
- Create: `lib/mcp/tools/list-feed-items.ts`, `lib/bridge/feed.ts`, `app/api/bridge/feed/route.ts`, `tests/integration/mcp-feed.test.ts`
- Modify: `lib/mcp/tools/index.ts`, `lib/bridge/context.ts` (`## Open roles at <company>`), `lib/bridge/context-load.ts` (load the roles), `lib/bridge/handlers.ts` (`handleListFeed` re-exported from `lib/bridge/feed.ts`), `lib/bridge/wire.ts` (`WireFeedItem`), `tests/helpers/bridge-fetch.ts`, `tests/unit/bridge-context.test.ts`
- Test: as listed

**Interfaces:**
- Consumes: Feed's item readers (`lib/feed/items.ts` and its scoped helper; record the names), Apply and Research's `lib/companies/open-roles.ts`, `authenticate`.
- Produces:

```ts
// lib/bridge/wire.ts
export type WireFeedItem = { id: string; company: string; role: string; location: string | null; work_mode: string | null; fit_score: number | null; state: string; first_seen_at: string; url: string };
// lib/bridge/feed.ts
export async function listFeedForBridge(s: Scoped, input: { state: "new" | "saved" | "all"; limit: number }): Promise<WireFeedItem[]>;
export async function handleListFeed(deps: BridgeDeps, request: Request): Promise<Response>;   // GET /api/bridge/feed?state=&limit= -> { items, requestId }
// lib/bridge/context.ts
export type OpenRole = { role: string; location: string | null; state: string; firstSeenAt: Date; url: string };
// ContextInput gains: openRoles?: OpenRole[]
```

The tool `list_feed_items`: input `{ state?: "new"|"saved"|"all" (default "new"), limit?: 1..50 (default 20) }`, output `{ items: WireFeedItem[] }`, newest first by `first_seen_at`. `all` means every state.

- [ ] **Step 1: Write the failing tests**

```ts
it("list_feed_items returns new items newest first with the eight spec fields plus id", ...)
it("state saved and all, and limit 50, work; limit 51 is rejected by the schema", ...)
it("GET /api/bridge/feed returns the same items as the tool for the same token", ...)
it("another user's feed items never appear", ...)
// tests/unit/bridge-context.test.ts additions
it("the context document ends with '## Open roles at Northwind Traders' and one table row per role, at most 10", ...)
it("with no roles it says 'No open roles from this company in your feed.'", ...)
it("an open role's role and location cells escape pipes and line breaks", ...)
it("the frontmatter stays jobsmith: context/v1", ...)
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/integration/mcp-feed.test.ts tests/unit/bridge-context.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

`listFeedForBridge` maps Feed's item rows (`company_name`, `role_title`, `location`, `work_mode`, `fit_score`, `state`, `first_seen_at`, `url`) and is the only reader both the tool and the route use. The Open roles section reads at most 10 items through `lib/companies/open-roles.ts` (new or seen, no `gone_at`), table columns Role, Location, State, First seen, Link, and uses the existing `escapeCell`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/integration/mcp-feed.test.ts tests/unit/bridge-context.test.ts tests/unit/mcp-registry.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib app/api/bridge/feed tests
git commit -m "feat(bridge): feed items for MCP and jobsmith feed, open roles in the context"
```

**Acceptance:** (5.2) `list_feed_items` goes through Feed's readers; (5.11) the context gains `## Open roles at <company>` and stays `context/v1`; (5.11) `jobsmith feed` has a route to read (an addition the module map does not list; see the README, spec ambiguities).

---

### Task 12: CLI relay and token rules

**Files:**
- Create: `cli/src/relay.ts`, `cli/src/commands/mcp.ts`, `tests/unit/cli-relay.test.ts`, `tests/integration/cli-mcp.test.ts`
- Modify: `cli/src/config.ts` (add `readSavedCredentials`, `secretFileProblem`), `cli/src/args.ts` (`mcp` command, `--allow-env-token`, `USAGE` line), `cli/src/io.ts` (optional `stdin`), `cli/src/index.ts` (pass `process.stdin`), `cli/src/main.ts` (case `mcp`), `tests/unit/cli-args.test.ts`, `tests/unit/cli-config.test.ts`
- Test: as listed

**Interfaces:**
- Consumes: `CliIo` (`cli/src/io.ts`), `configPath`, `CLI_VERSION`, `MAX_PUSH_BYTES` and `TOKEN_PATTERN` from `@/lib/bridge/wire` (the only non-relative import allowed).
- Produces:

```ts
// cli/src/args.ts
export type Command = ... | { name: "mcp"; allowEnvToken: boolean };
// cli/src/config.ts
export async function readSavedCredentials(io: CliIo): Promise<{ url: string; token: string } | null>;   // config.json only, never env
export async function secretFileProblem(file: string, platform: string): Promise<string | null>;          // null when fine or on win32; else the chmod 600 sentence naming the file
// cli/src/relay.ts
export async function runRelay(io: CliIo & { stdin: AsyncIterable<string | Uint8Array> }, creds: { url: string; token: string }): Promise<number>;
// cli/src/commands/mcp.ts
export async function runMcp(io: CliIo, command: { allowEnvToken: boolean }): Promise<number>;
```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/cli-config.test.ts additions
it("readSavedCredentials ignores JOBSMITH_TOKEN and JOBSMITH_URL", ...)
it("secretFileProblem is null for mode 600, names chmod 600 and the file for 644, 660 and 604, and is null on win32", ...)
// tests/unit/cli-args.test.ts additions
it("parses 'mcp' and 'mcp --allow-env-token'; rejects 'mcp extra'", ...)
// tests/unit/cli-relay.test.ts (fake fetch, in-memory stdin)
it("a JSON reply becomes exactly one stdout line", ...)
it("202 writes nothing", ...)
it("sends authorization, accept 'application/json, text/event-stream', content-type, user-agent, redirect manual and a 60 s timeout signal", ...)
it("sends MCP-Protocol-Version only after initialize answered, with the version the server returned", ...)
it("401 becomes error -32001 'Token missing or revoked. Run jobsmith login.' carrying the request id", ...)
it("429 waits Retry-After capped at 30 seconds, retries once, then answers -32002", ...)   // fake timers
it("a network failure and a 500 answer -32003 with the request id", ...)
it("a 3xx and a text/event-stream reply answer -32003", ...)
it("a line over 4 MB answers -32600 and is never sent", ...)
it("at most 4 messages are in flight", ...)
it("stdout holds only protocol lines; one stderr line per failure names the method and status", ...)
it("end of stdin waits for in-flight messages, then exits 0", ...)
it("a notification that fails writes no stdout line and one stderr line", ...)
// tests/integration/cli-mcp.test.ts (real handler on PGlite through tests/helpers/bridge-fetch.ts)
it("exits 2 with the Contract message when JOBSMITH_TOKEN is set and --allow-env-token is absent", ...)
it("with --allow-env-token it uses the environment's token", ...)
it("exits 2 naming chmod 600 for a group-readable config.json, on linux and darwin", ...)
it("exits 1 'Not logged in. Run jobsmith login first.' with no saved login", ...)
it("relays initialize and tools/list to the real endpoint and prints the tool names", ...)
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/cli-relay.test.ts tests/unit/cli-config.test.ts tests/unit/cli-args.test.ts tests/integration/cli-mcp.test.ts`
Expected: FAIL, modules missing. (The integration test needs Task 10's handler; run Tasks 12 after it in a single branch, or stub `bridge-fetch` for the unit tests only until then.)

- [ ] **Step 3: Implement**

The relay splits stdin on newlines (bytes, so a multi-byte character cut across chunks stays whole), parses each line only to read `id` and `method`, and posts the original text. The token refusal checks `io.env.JOBSMITH_TOKEN` before reading any file; the saved URL and token are the only pair used without the flag (an environment URL is never combined with the saved token). `cli/src/index.ts` passes `process.stdin`. Keep `cli/src` free of imports outside `node:` builtins, relative files and `@/lib/bridge/wire` (`cli-imports.test.ts`).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/cli-relay.test.ts tests/unit/cli-config.test.ts tests/unit/cli-args.test.ts tests/integration/cli-mcp.test.ts tests/unit/cli-imports.test.ts tests/integration/cli-bundle.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cli tests
git commit -m "feat(cli): jobsmith mcp, a stdio relay with the token and permission rules"
```

**Acceptance:** (5.1) the relay's status handling matches the codes in the README Contract; (5.1) an environment token needs `--allow-env-token` and a group or world readable config refuses start; (3) the CLI bundle gains no dependency (`cli-bundle.test.ts`).

---

### Task 13: `jobsmith feed` and the two suffixes

**Files:**
- Create: `cli/src/commands/feed.ts`, `tests/unit/cli-feed.test.ts`
- Modify: `cli/src/args.ts` (`feed` command with `--state` and `--limit`), `cli/src/main.ts`, `cli/src/output.ts` (`formatFeed`), `cli/src/suffixes.ts` (add `questions` and `research`), `tests/unit/cli-suffixes.test.ts`, `tests/unit/cli-output.test.ts`
- Test: as listed

**Interfaces:**
- Consumes: `WireFeedItem` (Task 11), `bridgeRequest` (`cli/src/http.ts`, `GET`).
- Produces: `runFeed(io, creds, command: { state: "new" | "saved" | "all"; limit: number })`, `formatFeed(items: WireFeedItem[]): string`; suffix entries `questions: { kind: "question_bank" }` and `research: { kind: "research", scope: "company" }`.

- [ ] **Step 1: Write the failing tests**

```ts
it("lookupSuffix maps 'questions-recruiter-screen' to question_bank and 'research' to research with scope company", ...)
it("an existing 'research-refresh' entry still wins over 'research' for 'research-refresh' (longest prefix)", ...)   // adds the entry in the test map
it("call-card and people still match as before", ...)
it("formatFeed prints one aligned line per item: company, role, location or '-', state, fit score or '-', url; 'No roles in your feed.' for none", ...)
it("jobsmith feed --state saved --limit 5 requests /api/bridge/feed?state=saved&limit=5", ...)
it("feed rejects --limit 0 and --limit 51 before any request", ...)
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/cli-feed.test.ts tests/unit/cli-suffixes.test.ts tests/unit/cli-output.test.ts tests/unit/cli-args.test.ts`
Expected: FAIL, `feed` unknown.

- [ ] **Step 3: Implement**

Follow `runList`'s shape (401, non-200, unparsable reply messages). If `feed-ok` did not print in "Before starting", add only the two suffixes and skip the rest.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/cli-feed.test.ts tests/unit/cli-suffixes.test.ts tests/unit/cli-output.test.ts tests/unit/cli-args.test.ts tests/unit/cli-imports.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cli tests
git commit -m "feat(cli): jobsmith feed and the questions and research suffixes"
```

**Acceptance:** (5.4) the suffix map gains the two entries so a hand push of the same file names lands where a run does; (5.11) `jobsmith feed` prints what `list_feed_items` returns.

---

### Task 14: End to end, docs and ship

**Files:**
- Create: `tests/e2e/mcp.spec.ts`, `tests/e2e/token.ts`, `tests/integration/mcp-inspector-live.test.ts`
- Modify: `tests/e2e/bridge.spec.ts` (import `createToken` from `token.ts`), `tests/e2e/cli.ts` (add `runCliWithStdin`), `playwright.config.ts` (add `mcp` to the `chromium` and `webkit` `testMatch`), `README.md` (MCP section, API table rows, error table row), `lib/privacy` template if Hosted shipped one
- Test: as listed

**Interfaces:**
- Consumes: `login`, `addJobAndOpen`, `uniqueName` (`tests/e2e/session.ts`), `scanForViolations` (`tests/e2e/axe.ts`), `runCli`, `ORIGIN_WORDS` (`lib/artifacts/kinds.ts`).
- Produces: `createToken(page, name, testInfo): Promise<string>` in `tests/e2e/token.ts` (the function body moves out of `bridge.spec.ts` unchanged); `runCliWithStdin(args, { configHome, lines }): Promise<{ code: number; stdout: string; stderr: string }>`.

- [ ] **Step 1: Write the failing end-to-end spec**

```ts
// tests/e2e/mcp.spec.ts  (Chromium and WebKit; no new UI, so axe runs on the job page that shows the result)
test("a token drives the MCP endpoint and jobsmith mcp: list, context, write, repeat", async ({ page, request }, testInfo) => {
  // login; addJobAndOpen "Northwind Traders" "Design Lead"; createToken
  // 1. request.post('/api/bridge/mcp', initialize) with the bearer token: 200, result.serverInfo.name 'jobsmith'
  // 2. tools/call list_jobs: structuredContent.jobs contains the slug
  // 3. tools/call get_job_context: text contains 'jobsmith: context/v1'
  // 4. tools/call write_document {slug, key:'cv', kind:'cv', body_md:'# CV for Northwind Traders\n...'}: status 'created', version 1
  // 5. the same call again: status 'unchanged'
  // 6. a request with 'Origin: https://evil.example' is 403; with no token is 401
  // 7. jobsmith login (via runCli), then runCliWithStdin(['mcp'], lines: initialize, notifications/initialized, tools/list, tools/call list_jobs): stdout has one line per request, none for the notification
  // 8. page.goto(`/jobs/${slug}?tab=documents`): the link 'CV for Northwind Traders' is visible and the origin word ORIGIN_WORDS.pushed is shown for version 1
  // 9. scanForViolations(page, 'documents tab after an MCP write', testInfo)
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm cli:build && pnpm test:e2e tests/e2e/mcp.spec.ts --project=chromium`
Expected: FAIL, the spec and helpers are not wired. (`pnpm test:e2e` builds and starts the app itself.)

- [ ] **Step 3: Implement the helpers, README and the opt-in test**

README gains an "MCP" section: the Claude Code remote line `claude mcp add --transport http --scope user jobsmith <APP_URL>/api/bridge/mcp --header "Authorization: Bearer <token>"`, the relay line `claude mcp add --scope user jobsmith -- jobsmith mcp`, a Claude Desktop JSON entry with absolute paths to `node` and `cli/dist/jobsmith.mjs` (a desktop app does not read the shell's `PATH`), the token rules (`--allow-env-token`, `chmod 600`), the tool list with the write rules, and rows for `POST /api/bridge/mcp`, `GET /api/bridge/opportunities/:slug`, `GET /api/bridge/events`, `GET /api/bridge/feed` in the API table and `origin_refused` (403) in the error table. If Hosted shipped a privacy template, add the data-map row from spec section 7 ("documents and job data that a user's runner or MCP client fetches go to that user's machine and the AI tools the user runs there, and Jobsmith sends them nowhere else"). `tests/integration/mcp-inspector-live.test.ts` runs only when `JOBSMITH_LIVE_MCP=1` with `JOBSMITH_URL` and `JOBSMITH_TOKEN` set: it runs `npx @modelcontextprotocol/inspector` in its CLI mode against that server and checks `tools/list` (confirm the Inspector's flags with `npx @modelcontextprotocol/inspector --help` first; never install it). No `.env.example` change: no new variable. No `docs/design-system.md` change: no new UI.

- [ ] **Step 4: Run everything**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm cli:build && pnpm test:e2e`
Expected: PASS on Chromium, WebKit and the phone project's existing specs. Run `uptime` first; above 50 treat timing failures as unproven.

- [ ] **Step 5: Preview check and live checks**

Open the preview URL of the branch. In a terminal on the owner's Mac: `claude mcp add --scope user jobsmith -- jobsmith mcp`, then in Claude Code ask for the jobs, a job's context, and to write a document; repeat the write and see `unchanged`; confirm it shows on the job page as pushed version 1. Add the remote line with `--transport http` and a bearer header and repeat. Add the Claude Desktop entry and confirm Desktop lists the tools. Record each result, with the Claude Code and Claude Desktop versions, in the pull request. If a live check cannot run, say so in the pull request as unverified.

**Blocked on:** Claude Code, Claude Desktop and a preview or local app with a real token on the owner's Mac (Step 5 only).

- [ ] **Step 6: Commit**

```bash
git add tests playwright.config.ts README.md
git commit -m "test(mcp): end to end, install docs and the opt-in inspector check"
```

**Acceptance:** (9, M30 done-when) the e2e spec proves list, context, write, repeat and the job page on Chromium and WebKit; (5.1) the README has the three install lines; (8) the full suite is green; the live checks are recorded or marked unverified.
