# Side lanes built beside Prep: decisions (branch build/mcp-m30)

Milestone 30 (MCP), tasks 1 to 14, built 2026-11-21 on `build/mcp-m30`, cut from `docs/plans-2026-11-21` (9fdaeee). Each choice below took the recommended option, per the owner's instruction for these runs.

## Setup

- Worktree `.claude/worktrees/mcp-m30`, its own `pnpm install`, `.env` with `APP_URL=http://localhost:3530` and the e2e database `jobsmith_m30_e2e` on the shared local Postgres. Unit and integration tests use PGlite in process.

## What was built and what was left out

Built: `@modelcontextprotocol/sdk` 1.32.2; `authenticate`, deps and logging moved out of the handlers; `GET /api/bridge/events`; `job/v1` and `GET /api/bridge/opportunities/:slug`; the MCP registry, error mapping, instructions and static rule; tools `list_jobs`, `get_job`, `get_job_context`, `get_profile`, `write_document` (over a shared push); resources; `POST /api/bridge/mcp`; the `jobsmith mcp` relay with its token rules; the `questions` and `research` suffixes; `tests/e2e/mcp.spec.ts`; the README MCP section.

Left out because their cycle is not built (the milestone's own "Before starting" rules):

- Task 11 whole: `list_feed_items`, `GET /api/bridge/feed`, `WireFeedItem` and the context's "Open roles" section. Needs Feed (milestones 16 to 19) and `lib/companies/open-roles.ts` (milestone 23).
- Task 13: `jobsmith feed`, `runFeed`, `formatFeed`. Needs Feed and Task 11.
- Task 7: `get_prep` (no `lib/prep`), `list_documents` and `read_document` (no document read route from Apply and Research). Task 9: the document resource template, same reason.
- Task 4: `job/v1` carries `documents: []`, prep zeros and `requests: []` until those cycles land.
- Task 14: the privacy data-map row (Hosted's privacy template does not exist).

## Decisions

- SDK path (`MCP_PATH_BRANCH = "sdk"`), no hand-written JSON-RPC layer. Reason: all four protocol probes passed on the installed SDK with no network.
- A new MCP server and transport per request. Reason: the SDK's stateless Streamable HTTP transport handles one request.
- The app enforces Origin itself: a foreign Origin gets 403 `origin_refused`, no Origin is allowed. Reason: the SDK lets a request with no Origin through, and command line clients send none.
- `createMcpServer` sets `listChanged` to false on the SDK's private `_capabilities`. Reason: the SDK always advertises true and cannot be told otherwise; revisit on SDK upgrade.
- Invalid JSON answers 400 with JSON-RPC -32700; over 4 MB answers `payload_too_large`; non-POST answers 405 `method_not_allowed`. Reason: the client speaks JSON-RPC, and the bridge table has no 405 code.
- Resource not found is JSON-RPC -32002 (thrown as `McpError(-32002)`, not in the SDK's enum); a bad URI is -32602.
- An invalid resource cursor is an invalid-params error. Reason: restarting silently at page one would hide client bugs.
- `job/v1` body is the bare versioned document; the request id travels in `x-request-id`. Reason: same shape rule as `context/v1`.
- `fit` is null only when `fit_status` is none; pending or failed gives a status with null score and summary.
- The events cursor compares `created_at` truncated to milliseconds. Reason: a JS `Date` holds milliseconds while the column holds microseconds, so an untruncated cursor returns its own row again.
- `applyPush` follows the README contract signature; no suspension or quota errors. Reason: Hosted is not built.
- The relay wraps a non-JSON-RPC 4xx reply as JSON-RPC -32603 with the server's message, fills a null reply id with the request's id when known, and refuses a saved token that does not match the token pattern.
- The relay's file-mode check runs even with `--allow-env-token` when a config file exists. Reason: the acceptance says a group or world readable config refuses start.
- The `[mcp]` log line format is `[mcp] id method tool|- code Nms`, written for every request including early refusals.

## Plan fixes made on this branch

- Task 1 acceptance: the test path is `tests/integration/cli-bundle.test.ts`.
- Task 4: the documents test line now says empty values while the cycles are absent; the body has no `requestId`.

## Postponed

- Task 14 Step 5: the done-when check in Claude Code (relay and `--transport http` with a bearer header) and Claude Desktop with a real token on the owner's Mac, the preview check, push and pull request.
- The live Inspector test (`tests/integration/mcp-inspector-live.test.ts`) is written and runs only with `JOBSMITH_LIVE_MCP=1`; its Inspector flags are unconfirmed.
- WebKit e2e: revision 2359 is not installed on this Mac, so `mcp.spec.ts` ran on Chromium only.
- Owner question 10 (review the tool descriptions before shipping) stays open.
