# Milestone 35: Self-host

**Done when (spec section 9):** "On a clean Linux machine, someone other than the owner follows the guide verbatim and reaches the app over HTTPS behind Caddy, creates the first account with `SETUP_TOKEN`, adds a job, restores the previous night's backup into a new stack with the same jobs, and upgrades from `v0.9.0-rc.1` to `v0.9.0-rc.2` with data intact; both tags were published to GHCR for amd64 and arm64 by the workflow."

**Branch:** `feat/m35-self-host`, cut from `main`. Tasks 27 to 40. Contract: `README.md`.

**Before starting:** this milestone builds on Core alone. It uses milestone 33 only for `PACKS_DIR` and `packs-check`:

```bash
test -f lib/packs/registry.ts && test -f scripts/migrate.ts && test -f proxy.ts && test -f scripts/build-cli.mjs
test ! -e Dockerfile && test ! -e deploy && test ! -e app/api/health
```

If `lib/packs/registry.ts` is missing, milestone 33 has not merged: leave out the `packs-check` command, the `PACKS_DIR` volume and the pack row of the env table, and name that in the pull request. Check each other dependency before its task and skip with a named note when absent:

```bash
test -f lib/jobs/index.ts            # Task 31 scheduler wiring (hosted milestone 11); without it no `scheduler` command, no compose `scheduler` service
test -f scripts/feed-scan.ts         # Task 31 feed-scan bundle (feed milestone 16)
test -d lib/storage                  # Task 27 STORAGE_* and S3_* names (prep milestone 7)
test -d app/api/debrief              # Task 37 24 MB upload step (debrief milestone 28)
test -d cli/src/commands && grep -rq "work" cli/src/commands   # Task 36 runner units (bridge-two milestone 31)
```

Read `node_modules/next/dist/docs/01-app/02-guides/self-hosting.md`, `.../01-app/03-api-reference/05-config/01-next-config-js/output.md` and `.../01-app/02-guides/data-security.md` (parent checkout) before Task 30. Docker Engine 24 or newer with Compose v2 is needed on the executor's machine for Tasks 33 to 35 and 37 (README item 11).

---

### Task 27: Environment inventory

**Files:**
- Create: `tests/fixtures/env-inventory.ts`, `tests/helpers/env-inventory.ts`, `tests/unit/env-inventory.test.ts`, `docs/self-hosting.md` (only the "Environment variables" section for now; Task 39 writes the rest)
- Modify: `lib/env.ts` (`export const ENV_NAMES`), `lib/ai/config.ts` (`ENV_NAMES`), `lib/auth/policy.ts` (`ENV_NAMES`), `.env.example` (`DATABASE_URL_UNPOOLED`, `DEMO_MODE`)
- Test: `tests/unit/env-inventory.test.ts`

**Interfaces:**
- Consumes: `lib/packs/files.ts` `ENV_NAMES` (milestone 33), every parser module that exists.
- Produces: `ENV_NAMES: readonly string[]` exported by each config parser; in `tests/fixtures/env-inventory.ts`: `APP_VARIABLES` (the 60 names, in the Contract's order), `COMPOSE_VARIABLES`, `BUILD_VARIABLES`, `NOT_OPERATOR`, `EXTRA_SINCE_SPEC = ["DEMO_MODE"] as const`; in `tests/helpers/env-inventory.ts`: `undocumentedNames(names: readonly string[], documented: ReadonlySet<string>): string[]`, `envExampleNames(text: string): Set<string>` (names on lines `NAME=` or `# NAME=`), `tableNames(markdown: string, block = "env-table"): Set<string>` (backticked upper-case names between `<!-- <block>:start -->` and `<!-- <block>:end -->`; the compose and build rows sit in a second block named `env-table-extra`), `PARSER_MODULES: string[]` (the list of parser module paths; a path is read only when the file exists, so a later cycle's module joins by adding its path).

`ENV_NAMES` today: `lib/env.ts`: `DATABASE_URL`, `DATABASE_URL_UNPOOLED` (read by `scripts/migrate.ts`, listed here so the migration variable has an owner), `BETTER_AUTH_SECRET`, `APP_URL`, `SETUP_TOKEN`, `ALLOW_SIGNUP`, `DEMO_MODE`; `lib/ai/config.ts`: `AI_PROVIDER`, `AI_GATEWAY_API_KEY`, `ANTHROPIC_API_KEY`, `AI_MODEL`; `lib/auth/policy.ts`: `AUTH_SIGNIN_MAX_PER_MINUTE`; `lib/packs/files.ts`: `PACKS_DIR`. Platform names (`VERCEL`, `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`) are read by `lib/env.ts` and `lib/ai/config.ts` and are in `NOT_OPERATOR`, so they are not in `ENV_NAMES`.

- [ ] **Step 1: Write the failing tests**

```ts
it("the fixture holds 60 distinct names in spec 5.11 order")                         // APP_VARIABLES.length === 60; new Set size 60; first DATABASE_URL, last TICK_INTERVAL_MINUTES
it("every ENV_NAMES entry of an existing parser module is in .env.example")
it("every ENV_NAMES entry is in the self-hosting table")
it("every ENV_NAMES entry is one of the 60, the compose names, the build names or EXTRA_SINCE_SPEC")  // the guard that catches a parser reading a name the list lacks
it("the self-hosting table lists exactly the 60 names plus DEMO_MODE, and a second block lists the compose and build names")
it("a planted unknown name is caught")                                                // undocumentedNames(["PLANTED_UNKNOWN_NAME"], new Set(APP_VARIABLES)) equals ["PLANTED_UNKNOWN_NAME"]; the same call is made on the real union first and returns []
it("a name read through process.env or source. in a parser file but missing from its ENV_NAMES is caught") // scan lib/env.ts, lib/ai/config.ts, lib/auth/policy.ts for /(?:process\.env|source)\.([A-Z][A-Z0-9_]{2,})/g; subtract NOT_OPERATOR; expect subset of ENV_NAMES
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/env-inventory.test.ts`
Expected: FAIL, `ENV_NAMES` is not exported.

- [ ] **Step 3: Implement**

Add the `ENV_NAMES` exports. In `docs/self-hosting.md` write `## Environment variables`, one sentence on `.env` mode 600, then the table between the two markers (the `PACKS_DIR` row stays in the table when milestone 33 has not merged, because it shares a row with `SOURCE_URL`, `MIGRATE_ON_START` and `TICK_INTERVAL_MINUTES`; the doc says it takes effect once packs ship): one row per row of spec 5.11 (Variable, Needed for, Default, Hosted only, From), copied from the spec; add the `DEMO_MODE` row (`Needed for`: a public showcase instance only, never one that holds a real search; default off; Hosted only no; From Core demo sign-in); then a second block "Compose and Caddy only" and "Build only" with the spec's two rows. `.env.example` gains the two names today's parsers read (`DATABASE_URL_UNPOOLED`, `DEMO_MODE`) with comments; later tasks add their own names when their parsers exist (`MIGRATE_ON_START` and `TICK_INTERVAL_MINUTES` in Tasks 31 and 32, `SOURCE_URL` in Task 44, `STORAGE_LOCAL_DIR` and `S3_*` when `lib/storage` exists), each with "hosted only" marked where the spec says so.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/env-inventory.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib tests .env.example docs/self-hosting.md
git commit -m "test(env): inventory of operator variables against .env.example and the self-hosting table"
```

**Acceptance:**
1. Spec 5.11: each parser exports `ENV_NAMES`; a test fails on a name missing from `.env.example` or the table and first catches a planted unknown name.
2. The table holds the spec's 60 names; `DEMO_MODE` is documented as the one extra (README "Spec ambiguities").
3. A later cycle's variables join by exporting `ENV_NAMES` and adding the module path to `PARSER_MODULES`.

---

### Task 28: No-session route table

**Files:**
- Create: `tests/fixtures/no-session-routes.json`, `tests/unit/proxy-routes.test.ts`
- Modify: `proxy.ts` only if a Core row fails (none expected)
- Test: `tests/unit/proxy-routes.test.ts`

**Interfaces:**
- Consumes: `proxy`, `config` from `proxy.ts`.
- Produces: the JSON table: an array of `{ "id": string, "ships": string, "path": string, "method": "GET" | "POST" | "PUT", "mechanism": "matcher" | "public_paths", "why": string, "check": string, "existsAny": string[] }`, one entry per concrete path of the eight rows of spec 5.8: Core `/login`, `/setup` (public_paths) and `/api/auth/sign-in/email` POST (public_paths via the auth prefix); Core `/api/bridge/context/northwind-example` GET (matcher); Hosted `/signup`, `/verify-email`, `/reset-password`, `/pricing`, `/privacy`, `/terms` (public_paths); Hosted `POST /api/billing/webhook` and `POST /api/jobs/tick` (matcher); Feed `POST /api/telegram/webhook` and `POST /api/notify/unsubscribe` (matcher); Debrief `PUT /api/debrief/upload/northwind-token` (matcher); Prep `/manifest.webmanifest`, `/icon.svg`, `/apple-icon.png` (matcher); Widen `GET /api/health` (matcher). `existsAny` lists the repo paths that must exist for the row to be tested (for example `["app/(auth)/login/page.tsx"]`, `["app/api/bridge"]`, `["app/(auth)/signup"]`, `["app/api/billing/webhook/route.ts"]`, `["app/api/jobs/tick/route.ts"]`, `["app/api/telegram"]`, `["app/api/debrief"]`, `["app/manifest.ts", "public/manifest.webmanifest"]`, `["app/api/health/route.ts"]`).

- [ ] **Step 1: Write the failing test**

```ts
it("every row whose route exists passes through the proxy without a redirect to /login")
// public_paths rows: proxy(new NextRequest(url)) returns a response without a Location header and with x-middleware-next
// matcher rows: the path does NOT match new RegExp("^" + config.matcher[0]) so the proxy never runs on it
it("a row whose route does not exist yet is skipped and listed in the test output")           // it.skip with the missing path in the title
it("a protected page still redirects to /login with ?from=")                                  // /board with no cookie
it("the table has exactly the eight spec rows by id")                                          // ids: auth, bridge, hosted-pages, hosted-posts, feed-posts, debrief-upload, manifest-icons, health
it("a planted route in the table that the proxy would redirect is reported by name")          // run the check function on a row for path /api/not-excluded and expect a failure naming its id
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/proxy-routes.test.ts`
Expected: FAIL, the JSON file does not exist.

- [ ] **Step 3: Write the table and the check**

Each of the eight spec rows gets one `id`; a row with several paths has one entry per path sharing the `id`. The check function (`routeProblems(rows, existsFn)`) is exported from `tests/helpers/no-session-routes.ts`. Task 37's smoke script applies the same rule to the same JSON against a running container. Rule from spec 5.8: the cycle that ships a no-session route adds its matcher exclusion or `PUBLIC_PATHS` entry and a row here in the same milestone; add that sentence to the comment above `config` in `proxy.ts`.

- [ ] **Step 4: Run the test and watch it pass**

Run: `pnpm vitest run tests/unit/proxy-routes.test.ts`
Expected: PASS (Core rows tested, the rest skipped by name).

- [ ] **Step 5: Commit**

```bash
git add tests proxy.ts
git commit -m "test(proxy): the 5.8 table of routes that answer without a session"
```

**Acceptance:**
1. Spec 5.8: a unit test checks `proxy.ts` against the table; pages sit in `PUBLIC_PATHS`, API routes and static files in the matcher exclusion.
2. A planted row the proxy would redirect is reported by id.
3. The table is data the image smoke test (Task 37) reads.

---

### Task 29: Health route

**Files:**
- Create: `lib/health/schema.ts`, `lib/health/check.ts`, `lib/health/index.ts`, `app/api/health/route.ts`
- Modify: `proxy.ts` (add `api/health` to the matcher exclusion)
- Test: `tests/unit/health-schema.test.ts`, `tests/integration/health.test.ts`, `tests/unit/proxy-routes.test.ts` (the health row now runs)

**Interfaces:**
- Consumes: `Db`, `getDb()`, `drizzle.__drizzle_migrations`, `lib/db/migrations/meta/_journal.json`.
- Produces: `compareSchema(applied: number, known: number): "current" | "pending" | "ahead"`; `readAppliedCount(db: Db): Promise<number>` (0 when the table or schema is missing); `knownMigrationCount(): number` (journal entries); `aheadMessage(applied: number, known: number): string` (the Contract's schema-ahead sentence); `runHealth(db: Db, journalCount: number, version: string): Promise<HealthBody>`; `healthResponse(): Promise<{ status: 200 | 503; body: HealthBody }>` in `lib/health/index.ts`, the only file that imports `getDb`; `type HealthBody = { status: "ok" | "down"; version: string; checks: { database: "ok" | "down"; schema: "current" | "pending" | "ahead" } }`.

- [ ] **Step 1: Write the failing tests**

```ts
// health-schema.test.ts
it("compareSchema: equal is current, fewer is pending, more is ahead")
it("aheadMessage(41, 38) is 'Database schema is newer than this version (applied 41, known 38). Restore a backup or run a newer image.'")
// health.test.ts (PGlite with the real migrations)
it("database up and schema current gives 200 and status ok")
it("an extra row in drizzle.__drizzle_migrations gives schema ahead, status down and 503")
it("a database that throws gives database down, status down and 503, without crashing")
it("the select 1 runs under a 1500 ms statement timeout")                      // spy on the executed SQL: 'set local statement_timeout = 1500'
it("the body has exactly the keys status, version and checks; checks has exactly database and schema")   // no counts, no provider status, no env values
it("the route answers without a session and sets Cache-Control: no-store")
it("version comes from JOBSMITH_VERSION, else the package.json version")
it("logs only failures")                                                         // console.error spy not called when ok; called once with ids and codes when down
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/health-schema.test.ts tests/integration/health.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`app/api/health/route.ts`: `export const dynamic = "force-dynamic"`, `GET` returns `Response.json(body, { status, headers: { "Cache-Control": "no-store" } })`. No `requireUser()` (Global Constraints). The route imports `@/lib/health`, never the db client. The journal is imported as a module so standalone tracing needs no extra file (spec 5.6).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit tests/integration/health.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/health app/api/health proxy.ts tests
git commit -m "feat(health): GET /api/health with database and schema checks"
```

**Acceptance:**
1. Spec 5.10: body, 200 only when every check is ok, 503 otherwise, `select 1` under 1.5 seconds, schema from the journal count, nothing else reported.
2. Spec 5.8: the route is in the matcher exclusion and the table test now exercises its row.
3. Spec 6: health logs only failures.

---

### Task 30: Standalone output and tracing includes

**Files:**
- Modify: `next.config.ts` (`output` behind `JOBSMITH_STANDALONE`, `outputFileTracingIncludes`)
- Test: `tests/unit/next-config.test.ts`

**Interfaces:**
- Consumes: the Next docs for `output` and `outputFileTracingIncludes`.
- Produces: with `process.env.JOBSMITH_STANDALONE === "1"` the config has `output: "standalone"`; otherwise no `output`. `outputFileTracingIncludes: { "/*": ["./content/legal/**", "./lib/auth/disposable-domains.txt", "./lib/doc-export/fonts/**"] }` (paths that do not exist yet match nothing; confirm the key form in the docs).

- [ ] **Step 1: Write the failing tests**

```ts
it("sets output standalone only when JOBSMITH_STANDALONE is 1")                    // vi.resetModules; import twice with the env set and unset
it("leaves output unset by default so the owner's Vercel build is unchanged")
it("declares the runtime-read files in outputFileTracingIncludes")
it("keeps serverExternalPackages and the action body limit")
it("vercel.ts does not set JOBSMITH_STANDALONE")                                    // read the file text
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/next-config.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add `...(process.env.JOBSMITH_STANDALONE === "1" ? { output: "standalone" as const } : {})` and the includes. Record in the task report which route key the docs require for `outputFileTracingIncludes`. Do not add `outputFileTracingRoot`.

- [ ] **Step 4: Run the test and a standalone build**

Run: `pnpm vitest run tests/unit/next-config.test.ts && JOBSMITH_STANDALONE=1 pnpm build && test -f .next/standalone/server.js`
Expected: PASS; `server.js` exists. Run `pnpm build` again without the flag and confirm `.next/standalone` is not refreshed.

- [ ] **Step 5: Commit**

```bash
git add next.config.ts tests
git commit -m "feat(image): standalone output behind JOBSMITH_STANDALONE and tracing includes"
```

**Acceptance:**
1. Spec 3 and 5.13: the owner's Vercel build is unchanged without the flag.
2. Spec 5.6: runtime-read files are in `outputFileTracingIncludes`.
3. A standalone build produces `.next/standalone/server.js`.

---

### Task 31: Bundled commands and the scheduler loop

**Files:**
- Create: `scripts/build-scripts.mjs`, `scripts/tick.ts`, `scripts/scheduler.ts`, `lib/scheduler/loop.ts`, `tests/unit/scheduler-loop.test.ts`, `tests/unit/build-scripts.test.ts`, `tests/unit/migrate-script.test.ts`
- Modify: `scripts/migrate.ts` (resolve the migrations folder beside the bundle first), `package.json` (`"scripts:build": "node scripts/build-scripts.mjs"`, `"jobs:tick"` only if Hosted has not added it), `.env.example` (`TICK_INTERVAL_MINUTES`)
- Test: both new test files

**Interfaces:**
- Consumes: esbuild (already a dev dependency), `scripts/*.ts`, the hosted tick function (Task 31 wiring only).
- Produces: `scripts:build` writes `commands/<name>.mjs` for each entry that exists among `migrate`, `seed`, `tick`, `scheduler`, `feed-scan`, `packs-check`, `import-applications`, `serve-check` (Task 32), with `platform: "node"`, `format: "esm"`, `target: "node24"`, `tsconfig: "tsconfig.json"`; `lib/scheduler/loop.ts`:

```ts
export const ENV_NAMES = ["TICK_INTERVAL_MINUTES"] as const;
export const DEFAULT_TICK_MINUTES = 15; export const MIN_TICK_MINUTES = 5; export const MAX_TICK_MINUTES = 60;
export const JITTER_MAX_SECONDS = 60; export const SHUTDOWN_WAIT_MS = 25_000;
export type TickReport = { steps: { name: string; count: number; ms: number; error?: string }[] };
export type TickCall = (options: { trigger: "cron"; signal: AbortSignal }) => Promise<TickReport>;
export type SchedulerDeps = { tick: TickCall; sleep: (ms: number) => Promise<void>; random: () => number; log: (line: string) => void; signal: AbortSignal };
export function tickIntervalMinutes(source: Record<string, string | undefined>): number;   // throws EnvError "Invalid environment variables: TICK_INTERVAL_MINUTES" outside 5..60 or not an integer
export async function runScheduler(deps: SchedulerDeps, options: { intervalMinutes: number }): Promise<void>;
```

- [ ] **Step 1: Write the failing tests**

```ts
// scheduler-loop.test.ts (fake clock: sleep records the requested ms and resolves at once)
it("sleeps the interval plus jitter, then calls the tick once with trigger cron")        // interval 15, random 0.5: sleep(15*60*1000 + 30*1000)
it("calls the tick once per interval and never at start")
it("jitter is floor(random * 60) seconds, so random 0.999 adds 59 seconds")
it("logs one [scheduler] line per run with steps, counts and milliseconds")              // '[scheduler] {"steps":[{"name":"x","count":3,"ms":12}],"ms":..}'
it("a tick that throws is logged with its constructor name and the loop continues")
it("an abort during sleep returns without calling the tick")
it("an abort during a tick waits for the tick, up to 25 seconds, then returns")
it("tickIntervalMinutes: unset gives 15; '5' and '60' pass; '4', '61', '7.5' and 'abc' throw naming TICK_INTERVAL_MINUTES")
// build-scripts.test.ts
it("lists the entry points that exist and skips the ones that do not")                  // pure function entryPoints(existsFn)
it("migrate resolves migrations beside the bundle when present, else ../lib/db/migrations")
it("a failed migration exits 1 and prints a [migrate] line")             // tests/unit/migrate-script.test.ts: run scripts/migrate.ts with DATABASE_URL on a closed local port; exit code 1 and stderr contains "[migrate]"
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/scheduler-loop.test.ts tests/unit/build-scripts.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`scripts/migrate.ts`: its final `catch` prints `console.error("[migrate]", <error message>)` before `process.exit(1)` (spec 6); `const folder = fs.existsSync(path.resolve(import.meta.dirname, "migrations")) ? that : path.resolve(import.meta.dirname, "../lib/db/migrations")`. `scripts/tick.ts` calls the tick once with `{ trigger: "cron", signal }` and prints the same log line; `scripts/scheduler.ts` wires `runScheduler` with real `sleep`, `Math.random`, `console.info` and a SIGTERM and SIGINT abort. Both import the tick function by the name hosted milestone 11 exports from `lib/jobs/index.ts`; that import line is the only place the name appears. When hosted milestone 11 has not merged, create neither script, do not list them in `scripts/build-scripts.mjs`, and name it in the pull request. If esbuild fails on an optional native require (for example `canvas` through `linkedom`), mark exactly that module `external`, copy it into the image in Task 33, and record it in the report.

- [ ] **Step 4: Run the tests, then the bundler**

Run: `pnpm vitest run tests/unit/scheduler-loop.test.ts tests/unit/build-scripts.test.ts && pnpm scripts:build && ls commands`
Expected: PASS; `commands/` lists `migrate.mjs`, `seed.mjs`, `packs-check.mjs`, `import-applications.mjs` (and `tick.mjs`, `scheduler.mjs`, `feed-scan.mjs` when their sources exist). Add `commands` to `.gitignore`.

- [ ] **Step 5: Commit**

```bash
git add scripts lib/scheduler package.json .env.example .gitignore tests
git commit -m "feat(image): bundled commands and the sleep-and-call scheduler loop"
```

**Acceptance:**
1. Spec 5.7: every `TICK_INTERVAL_MINUTES` (15 default, 5 to 60) plus up to 60 seconds of jitter it calls the tick in process with trigger `cron`; it holds no queue between calls.
2. Spec 6: a failed step is logged with its code and the loop continues; on SIGTERM it stops within 30 seconds.
3. Spec 3: esbuild bundles the commands; migrations sit beside them.

---

### Task 32: Entrypoint and schema-ahead check

**Files:**
- Create: `docker-entrypoint.sh` (mode 755), `scripts/serve-check.ts`, `tests/unit/entrypoint.test.ts`, `tests/integration/serve-check.test.ts`
- Modify: `scripts/build-scripts.mjs` (add `serve-check`), `.env.example` (`MIGRATE_ON_START`)
- Test: both new test files

**Interfaces:**
- Consumes: `lib/health/schema.ts` (`readAppliedCount`, `knownMigrationCount`, `compareSchema`, `aheadMessage`), `getRegistry`.
- Produces: the entrypoint with commands `serve` (default), `migrate`, `seed [--pack <id>]`, `scheduler`, `tick`, `feed-scan`, `packs-check <file>`, `import-applications <file> [--email] [--dry-run]`; an unknown command prints the list to stderr and exits 64. `serve`: `node commands/serve-check.mjs`, then `node commands/migrate.mjs` unless `MIGRATE_ON_START=false`, then `exec node server.js`. `serve-check`: loads the pack registry (a `PackError` prints `PackError: ...` and exits 1, so a broken pack stops start even if Next would keep serving), then compares applied and known migration counts and prints `aheadMessage` and exits 1 when `ahead`.

- [ ] **Step 1: Write the failing tests**

```ts
// entrypoint.test.ts: spawn `sh docker-entrypoint.sh ...` with PATH = a temp dir holding a stub `node` that appends its arguments to a log file
it("no arguments runs serve-check, then migrate, then server.js, in that order")
it("MIGRATE_ON_START=false skips migrate")
it("a failing serve-check stops before migrate and server.js, and the script exits 1")
it("seed passes its arguments: seed --pack data runs commands/seed.mjs --pack data")
it("packs-check, tick, scheduler, feed-scan and import-applications dispatch to their bundles with their arguments")
it("an unknown command prints the command list and exits 64")
it("a command whose bundle file is absent prints '<name> is not available in this build' and exits 64")   // feed-scan before Feed ships
// serve-check.test.ts (PGlite)
it("exits ok when applied equals known")
it("prints the schema-newer message and fails when applied is higher")
it("prints a PackError line and fails for a PACKS_DIR file that breaks the schema")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/entrypoint.test.ts tests/integration/serve-check.test.ts`
Expected: FAIL, files missing.

- [ ] **Step 3: Implement**

POSIX `sh` only (the runtime image is `node:24-slim`, `sh` is dash). Use `case "$cmd" in`; the command list text is one `usage()` function. `serve-check` reads `DATABASE_URL` with a single `pg` `Client` and closes it.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/entrypoint.test.ts tests/integration/serve-check.test.ts && shellcheck docker-entrypoint.sh`
Expected: PASS; shellcheck clean (install it if absent, record the version).

- [ ] **Step 5: Commit**

```bash
git add docker-entrypoint.sh scripts .env.example tests
git commit -m "feat(image): entrypoint dispatch and a schema-ahead refusal"
```

**Acceptance:**
1. Spec 5.6: commands list, unknown command exits 64, `serve` refuses to start on a newer schema with the fixed message.
2. Spec 6: a missing required variable exits through `EnvError` with its name (the commands call `env()` as before); a broken pack file stops start naming the file.
3. `MIGRATE_ON_START=false` skips the migration step.

---

### Task 33: Dockerfile, ignore file and license collection

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `scripts/licenses-collect.mjs`, `scripts/image-placeholders.json`, `tests/unit/dockerfile.test.ts`, `tests/unit/licenses-collect.test.ts`
- Modify: `package.json` (`"licenses:collect": "node scripts/licenses-collect.mjs"`), `.gitignore` (`THIRD_PARTY_LICENSES.txt`)
- Test: both new test files

**Blocked on:** Docker Engine 24 or newer on the executor's machine, and network for `next/font/google` (Geist) during the build (spec 5.6). The static tests run anywhere.

**Interfaces:**
- Consumes: `pnpm licenses list --prod --json`, Tasks 30 to 32.
- Produces: the Contract's image block. `scripts/image-placeholders.json`: `{ "databaseUrl": "postgres://build:build@build.invalid:5432/build", "secret": "build-only-placeholder-secret-0000", "appUrl": "http://build.invalid" }` (the secret is 34 characters, past the 32 minimum, and not key-like). `scripts/licenses-collect.mjs [--out THIRD_PARTY_LICENSES.txt]` writes name, version, license identifier and the license file text of every production dependency.

- [ ] **Step 1: Write the failing tests**

```ts
// dockerfile.test.ts (reads the text)
it("has four stages named base, deps, build and runtime")
it("every FROM pins node:24-slim by digest")                                  // /FROM node:24-slim@sha256:[0-9a-f]{64}/
it("deps installs with pnpm install --frozen-lockfile and a BuildKit cache mount")
it("the build stage sets JOBSMITH_STANDALONE=1, NEXT_TELEMETRY_DISABLED=1 and the placeholders from scripts/image-placeholders.json")
it("the placeholders appear in the build stage only")                          // not after 'FROM ... AS runtime'
it("the build stage runs pnpm build, pnpm scripts:build and pnpm licenses:collect and copies public and .next/static into the standalone folder")
it("the runtime stage sets NODE_ENV production, PORT 3000, HOSTNAME 0.0.0.0, NEXT_TELEMETRY_DISABLED 1 and STORAGE_LOCAL_DIR /data/storage")
it("JOBSMITH_VERSION and JOBSMITH_COMMIT are build args that become env values and OCI labels source, version, revision and licenses=AGPL-3.0-only")
it("runs as user node, owns /data, copies migrations beside the commands, and has the HEALTHCHECK with interval 30s timeout 5s start-period 60s retries 3 against /api/health")
it(".dockerignore drops .env*, .git, node_modules, .next, tests, docs, .claude, .superpowers and cli/dist")
// licenses-collect.test.ts: a fixture JSON of two packages with fake license files in a temp dir
it("writes each package's name, version, license and text")
it("fails with the package name when a license file cannot be read")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/dockerfile.test.ts tests/unit/licenses-collect.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the files**

Read the digest of `node:24-slim` the day of the task (`docker buildx imagetools inspect node:24-slim`) and pin all three stages' bases to it; record it in the report. The build stage copies `public` to `.next/standalone/public` and `.next/static` to `.next/standalone/.next/static`, as the Next docs require. The runtime copies `.next/standalone` to `/app` (owner `node`), `commands/` to `/app/commands`, `lib/db/migrations` to `/app/commands/migrations`, `docker-entrypoint.sh` and `THIRD_PARTY_LICENSES.txt`; `mkdir -p /data/storage && chown -R node:node /data`; `USER node`; `ENTRYPOINT ["./docker-entrypoint.sh"]`. Copy any module Task 31 marked `external` into the runtime's `node_modules`.

- [ ] **Step 4: Build and measure**

Run: `pnpm vitest run tests/unit/dockerfile.test.ts tests/unit/licenses-collect.test.ts && docker build --build-arg JOBSMITH_VERSION=0.0.0-dev --build-arg JOBSMITH_COMMIT=$(git rev-parse HEAD) -t jobsmith:dev . && docker image inspect jobsmith:dev --format '{{.Size}}'`
Expected: PASS; image built; size under 400 MB (419430400 bytes). If over, record the largest layers (`docker history`) before changing anything.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile .dockerignore scripts package.json .gitignore tests
git commit -m "feat(image): four-stage Dockerfile on the standalone output with build-time placeholders"
```

**Acceptance:**
1. Spec 5.6: four stages by digest, placeholders in the build stage only, license collection, standalone copy steps, runtime env, labels, user `node`, `HEALTHCHECK`, `.dockerignore`.
2. Spec 7: placeholders exist only in the build stage (proved by Task 37's grep).
3. Spec 5.17: image at most 400 MB uncompressed on amd64.

---

### Task 34: Compose, Caddyfile, env example, Postgres 17

**Files:**
- Create: `deploy/compose.yaml`, `deploy/Caddyfile`, `deploy/env.example`, `deploy/packs/.gitkeep`, `deploy/compose.ci.yaml`, `tests/unit/compose.test.ts`
- Modify: `docker-compose.yml` (`postgres:17-alpine`), `.github/workflows/ci.yml` (the `e2e` service image `postgres:17-alpine`)
- Test: `tests/unit/compose.test.ts`

**Blocked on:** the Kokoro-FastAPI details and the Caddy directive confirmation (README items 12 and 13), and a Linux machine with a public name for the live HTTPS check. The rest runs without them.

**Interfaces:**
- Consumes: the image from Task 33, `deploy/env.example` names from the Contract.
- Produces: services `app`, `postgres`, `scheduler` (only when Task 31 wired it), `caddy` (profile `proxy`), `tts` (profile `tts`, only once confirmed), volumes `pgdata`, `storage`, `caddy_data`, `caddy_config`. `deploy/compose.ci.yaml` publishes `127.0.0.1:3000` for `app` and `127.0.0.1:5432` for `postgres`, for `image.yml` only.

- [ ] **Step 1: Write the failing tests (text assertions; no YAML parser is added)**

```ts
it("app uses ghcr.io/weeeha/jobsmith:${JOBSMITH_TAG:-1}, env_file .env, init true, restart unless-stopped, stop_grace_period 30s")
it("app is read_only with tmpfs /tmp and /app/.next/cache, cap_drop ALL and no-new-privileges, and has no ports")
it("app mounts storage:/data and ./packs:/packs:ro and sets PACKS_DIR=/packs")
it("app depends on postgres being healthy")
it("postgres is postgres:17-alpine by digest, user and database jobsmith, POSTGRES_PASSWORD required with ${POSTGRES_PASSWORD:?}, volume pgdata, pg_isready every 5 seconds, no ports")
it("scheduler is the same image with command scheduler, depends on app healthy and sets TICK_INTERVAL_MINUTES")   // skipped with a named reason when Task 31 did not wire it
it("caddy is in profile proxy with ports 80, 443 and 443/udp and volumes caddy_data and caddy_config")
it("the Caddyfile equals the spec 5.8 block")                                   // JOBSMITH_DOMAIN, tls {$ACME_EMAIL}, HSTS max-age=31536000, request_body max_size 32MB, reverse_proxy app:3000 with header_up X-Forwarded-For {remote_host}
it("env.example names every compose variable and DATABASE_URL is not in it")    // compose builds DATABASE_URL from POSTGRES_PASSWORD
it("the root docker-compose.yml and ci.yml use postgres:17-alpine")
it("every image in deploy/compose.yaml is pinned by digest")
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/compose.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the files; confirm the two external facts**

1. Digests: read the digests of `postgres:17-alpine` and `caddy:2-alpine` the day of the task and pin both; record them.
2. **Caddy confirmation (spec 5.8):** read Caddy's current docs for `tls`, `header`, `request_body` `max_size`, `reverse_proxy` `header_up` and the `{remote_host}` placeholder; record the page and result for each directive in the task report; any difference is fixed in `deploy/Caddyfile` and noted in the guide.
3. **Kokoro confirmation (spec 5.7, 11 item 7):** read Kokoro-FastAPI's own README for its CPU image reference, port (the spec says 8880), voice list and memory use; record all four in the report and write them as the literal `image: <reference>@sha256:<digest>` of the `tts` service. If it cannot be confirmed, leave the `tts` service out of the file and the guide, and name it in the pull request. Do not guess a tag.
4. `deploy/env.example`: `POSTGRES_PASSWORD`, `JOBSMITH_DOMAIN`, `ACME_EMAIL`, `JOBSMITH_TAG`, `APP_URL`, `BETTER_AUTH_SECRET`, `SETUP_TOKEN`, and commented examples of `AI_PROVIDER`, `STORAGE_PROVIDER`; mode-600 advice in a leading comment.
5. Root `docker-compose.yml`: image only. Its comment says an existing development volume made by Postgres 16 must be removed with `docker compose down -v` once.

- [ ] **Step 4: Run the tests and validate with Docker**

Run: `pnpm vitest run tests/unit/compose.test.ts && cd deploy && cp env.example .env && docker compose config -q && docker run --rm -e JOBSMITH_DOMAIN=localhost -e ACME_EMAIL=ops@example.invalid -v "$PWD/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile` (remove the copied `.env` afterwards)
Expected: PASS; `docker compose config` and `caddy validate` exit 0.

- [ ] **Step 5: Commit**

```bash
git add deploy docker-compose.yml .github/workflows/ci.yml tests
git commit -m "feat(deploy): compose stack with Caddy, scheduler and Postgres 17 across dev, CI and compose"
```

**Acceptance:**
1. Spec 5.7: every property in the service list; Postgres 17 in dev, CI and compose.
2. Spec 5.8: the Caddyfile block is verbatim and each directive is confirmed against Caddy's docs.
3. Spec 7: no host port for the app or Postgres; read-only root; capabilities dropped.

---

### Task 35: Backup and restore scripts

**Files:**
- Create: `deploy/backup.sh`, `deploy/restore.sh` (both mode 755), `tests/unit/backup-restore.test.ts`
- Test: `tests/unit/backup-restore.test.ts`

**Interfaces:**
- Consumes: Compose services `postgres` and `app`.
- Produces: `deploy/backup.sh` (no arguments; `KEEP_DAYS`, default 14) writing `backups/db-<UTC timestamp>.dump` and `backups/storage-<UTC timestamp>.tar.gz` with `umask 077`; `deploy/restore.sh <dump> <tar>`.

- [ ] **Step 1: Write the failing tests**

Each test puts a stub `docker` first on `PATH` that logs its arguments, writes a byte to the file its command would write, and fails on demand.

```ts
it("backup runs pg_dump -Fc through docker compose exec -T postgres, then tars the storage volume through a throwaway run of the app image")
it("backup writes both files with mode 600 under UTC timestamps")
it("backup deletes files older than KEEP_DAYS only after both succeed")             // old files created with utimes 15 days back are removed, a 13-day-old file stays
it("a failing pg_dump exits non-zero, leaves no new files and keeps every older backup")
it("a failing tar removes the new dump too and keeps every older backup")
it("the dump comes before the files")                                                // call order in the stub log
it("restore refuses a dump that fails pg_restore --list before stopping anything")  // no 'stop' call in the log, exit 1
it("restore stops app and scheduler, runs pg_restore --clean --if-exists --no-owner, replaces the volume contents, starts both and waits for health")  // call order; 'up -d --wait app scheduler'
it("restore with a missing argument prints usage and exits 64")
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/backup-restore.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Bash with `set -euo pipefail`. Backup commands: `docker compose exec -T postgres pg_dump -U jobsmith -Fc jobsmith > "$dump"`; `docker compose run --rm --no-deps --entrypoint tar -v "$PWD/backups:/backup" app czf "/backup/$tarname" -C /data .`. A `trap` removes this run's partial files on failure. Restore: `docker compose exec -T postgres pg_restore --list < "$dump" > /dev/null`; `docker compose stop app scheduler`; `docker compose exec -T postgres pg_restore -U jobsmith -d jobsmith --clean --if-exists --no-owner < "$dump"`; `docker compose run --rm --no-deps --entrypoint sh -v "$tar_abs:/restore/storage.tgz:ro" app -c 'find /data -mindepth 1 -delete && tar xzf /restore/storage.tgz -C /data'`; `docker compose up -d --wait app scheduler`. The scheduler name is dropped from the commands when the compose file has no scheduler.

- [ ] **Step 4: Run the tests and a real round trip**

Run: `pnpm vitest run tests/unit/backup-restore.test.ts && shellcheck deploy/backup.sh deploy/restore.sh`
Expected: PASS. The real round trip (backup, restore into a fresh project with the same job count) is Task 37's step.

- [ ] **Step 5: Commit**

```bash
git add deploy tests
git commit -m "feat(deploy): backup and restore scripts, database first then files"
```

**Acceptance:**
1. Spec 5.9: `pg_dump -Fc`, storage tar through a throwaway container, `umask 077`, `KEEP_DAYS`, deletion only after both succeed, non-zero exit on any failure; restore checks with `pg_restore --list` and follows the listed order.
2. Spec 6: `backup.sh` keeps every older backup on failure; `restore.sh` refuses a bad dump.
3. Spec 7: dumps are mode 600.

---

### Task 36: Runner units

**Files:**
- Create: `deploy/runner/jobsmith-work.service`, `deploy/runner/com.jobsmith.work.plist`, `tests/unit/runner-units.test.ts`
- Test: `tests/unit/runner-units.test.ts`

**Blocked on:** bridge-two milestone 31 (`jobsmith work`). Skip and name in the pull request when absent. The install steps are written in Task 39.

**Interfaces:**
- Consumes: `jobsmith work` (Bridge part two 5.6).
- Produces: a systemd user unit and a launchd agent that keep `jobsmith work` running on the user's own computer. Neither unit sets `JOBSMITH_TOKEN` (the CLI refuses it for `work` without `--allow-env-token`); the runner uses the CLI's own saved login.

- [ ] **Step 1: Write the failing tests**

```ts
it("the systemd unit runs 'jobsmith work', restarts on failure after 10 seconds, and installs into default.target")
it("the unit sets no JOBSMITH_TOKEN and no --allow-env-token")
it("the launchd plist has Label com.jobsmith.work, ProgramArguments jobsmith and work, RunAtLoad and KeepAlive, and no token")
it("the plist is well-formed XML")                                       // DOMParser from jsdom
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/runner-units.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the units**

`ExecStart=/usr/bin/env jobsmith work`, `Restart=on-failure`, `RestartSec=10`, `WantedBy=default.target`; `StandardOutput=journal`. The plist runs `/usr/bin/env jobsmith work` with `StandardOutPath` and `StandardErrorPath` under `~/Library/Logs/`. Use the command name as Bridge part two names it; read its plan and match it.

- [ ] **Step 4: Run the tests and the platform linters**

Run: `pnpm vitest run tests/unit/runner-units.test.ts && (command -v systemd-analyze >/dev/null && systemd-analyze --user verify deploy/runner/jobsmith-work.service || true) && (command -v plutil >/dev/null && plutil -lint deploy/runner/com.jobsmith.work.plist || true)`
Expected: PASS; whichever linter exists on the executor's machine passes.

- [ ] **Step 5: Commit**

```bash
git add deploy/runner tests
git commit -m "feat(deploy): systemd user unit and launchd agent for the local runner"
```

**Acceptance:**
1. Spec 5.7: `deploy/runner/` holds both units that keep `jobsmith work` running.
2. Spec 7 and Bridge part two: no token in the unit files.
3. Install steps for both are in the guide (Task 39).

---

### Task 37: `image.yml` and the smoke script

**Files:**
- Create: `.github/workflows/image.yml`, `scripts/image-smoke.mjs`, `tests/unit/image-smoke.test.ts`, `tests/unit/workflows.test.ts`
- Modify: `playwright.config.ts` (`webServer` omitted when `E2E_EXTERNAL_SERVER=1`), `.github/workflows/ci.yml` (every action pinned by commit SHA)
- Test: both new test files

**Blocked on:** GitHub Actions on the repo, Docker on the runner. The unit tests run locally. The upload step needs debrief milestone 28 and the previous-release upgrade step needs a first tag.

**Interfaces:**
- Consumes: Tasks 28, 33, 34, 35, `tests/fixtures/no-session-routes.json`.
- Produces: `scripts/image-smoke.mjs` subcommands: `placeholders <root>` (exit 1 and print each file when any file under `<root>` contains `build.invalid` or the placeholder secret from `scripts/image-placeholders.json`), `routes <baseUrl>` (call every row of the route table with no cookie and exit 1 naming the row id of any answer that is a 3xx whose `Location` contains `/login`; 200, 401, 403, 404 and 405 pass), `size <image> <budgetBytes>` (exit 1 when over); `SIZE_BUDGET_BYTES = 400 * 1024 * 1024`.

`image.yml` runs on `pull_request` and on `push` to `main`, and declares `workflow_call` so `release.yml` reuses it. One job on `ubuntu-24.04`, amd64:
1. build the image (`docker/build-push-action`, load, tag `jobsmith:ci`, cache `gha`); 2. `image-smoke size`; 3. `docker run --rm --entrypoint id jobsmith:ci -u` prints `1000`, and a write to `/` fails under `--read-only`; 4. placeholders: run `image-smoke placeholders /app` inside the image (mount the script read-only; expect no hits), and the planted positive: `docker run ... sh -c 'echo build.invalid > /tmp/planted && node /s/image-smoke.mjs placeholders /tmp'` must exit 1; 5. generate `deploy/.env` (random `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`; `APP_URL=http://localhost:3000`; `SETUP_TOKEN=e2e-setup-token-0123456789`; `AUTH_SIGNIN_MAX_PER_MINUTE=1000`; `AI_PROVIDER=fake`; the fake `TTS_`, `TRANSCRIBE_` and `EMAIL_` providers and `STORAGE_PROVIDER=local` only when their parsers exist), `docker compose -f compose.yaml -f compose.ci.yaml up -d --wait`; 6. Playwright `first-run`, `chromium` for `pipeline` and `documents` against `http://localhost:3000` with `E2E_EXTERNAL_SERVER=1 ALLOW_DB_RESET=true`; 7. `image-smoke routes http://localhost:3000`; 8. the 24 MB upload through Caddy (`--profile proxy`, `JOBSMITH_DOMAIN=localhost`, `curl -k`) arrives whole, run only when `app/api/debrief` exists (`if: hashFiles('app/api/debrief/**') != ''`); 9. `docker compose run --rm app seed --pack data`, then six jobs counted with `psql`; 10. `docker compose down` then `up -d --wait`, count unchanged; 11. `./backup.sh`, then `COMPOSE_PROJECT_NAME=jobsmith-restore` stack started and `./restore.sh` run, same job count; 12. a broken pack: a temporary `deploy/packs/broken.json` with a 25-character column, `docker compose run --rm app` exits non-zero and its output contains `broken.json`; 13. upgrade from the previous tag's image with data intact, run only when `git describe --tags --abbrev=0` finds a tag and that image exists on GHCR; 14. on failure upload `docker compose logs` as an artifact.

- [ ] **Step 1: Write the failing tests**

```ts
// image-smoke.test.ts
it("placeholders finds build.invalid in a planted file and names it")
it("placeholders finds the placeholder secret")
it("placeholders returns clean for a folder without either")
it("routes reports the row id of a route that redirects to /login")                // a local http server answers 302 Location /login for one path and 405 for another
it("routes passes 200, 401, 403, 404 and 405")
it("size fails over the budget and passes under it")
// workflows.test.ts
it("every uses: line in .github/workflows is pinned to a 40-character commit SHA")  // includes the existing ci.yml
it("image.yml triggers on pull_request, push to main and workflow_call")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/image-smoke.test.ts tests/unit/workflows.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the script, the workflow and the pins**

Read each Action's latest tag commit SHA the day of the task (`gh api repos/<owner>/<repo>/git/ref/tags/<tag>`), pin all, and keep the tag in a trailing comment. The Playwright `webServer` block is wrapped so that `E2E_EXTERNAL_SERVER=1` omits it (the spec then talks to the container). Do not weaken the existing local behavior (`reuseExistingServer: false` stays when the block exists).

- [ ] **Step 4: Run the tests, lint the workflow, run the job**

Run: `pnpm vitest run tests/unit/image-smoke.test.ts tests/unit/workflows.test.ts && actionlint .github/workflows/*.yml`
Expected: PASS. Push the branch and read the `image` job result; every step green (steps 8 and 13 skipped with their reasons shown).

- [ ] **Step 5: Commit**

```bash
git add .github scripts playwright.config.ts tests
git commit -m "ci(image): build, size, user, placeholder, compose, route, seed, restore and pack checks on every PR"
```

**Acceptance:**
1. Spec 8 Image: every listed check, with the placeholder grep carrying its own planted positive.
2. Spec 5.8: every route of the table is called with no cookie and none redirected to `/login`.
3. Spec 7: all Actions pinned by commit SHA.

---

### Task 38: `release.yml`

**Files:**
- Create: `.github/workflows/release.yml`, `scripts/release-tags.mjs`, `scripts/changelog-section.mjs`, `scripts/check-version.mjs`, `tests/unit/release-scripts.test.ts`
- Modify: `tests/unit/workflows.test.ts` (release.yml triggers)
- Test: `tests/unit/release-scripts.test.ts`

**Blocked on:** GHCR publishing and the owner cutting tags (README items 8 and 9). Everything but the live run works locally.

**Interfaces:**
- Consumes: `image.yml` through `workflow_call`, `pnpm cli:build`, `CHANGELOG.md` (Task 47; until then the changelog script prints the line `No changelog yet.`).
- Produces: `releaseTags(tag: string, existing: string[]): string[]`: for `v1.2.3` returns `1.2.3`, plus `1.2` when no existing `1.2.x` stable tag is higher, plus `1` when no existing `1.x.y` stable tag is higher, plus `latest` when no existing stable tag is higher; a prerelease (`-rc.N`) returns only its exact version. `changelogSection(markdown: string, version: string): string` (the body under `## [version]`). `checkVersion(tag: string, files: { packageJson: string; cliPackageJson: string; cliVersionTs: string }): string[]` (problems when any of the three differs from the tag).

`release.yml`: on `push` of tags `v*`. Jobs: `verify` (checkout, pnpm, Node 24, `pnpm typecheck`, `pnpm lint`, `pnpm test`; and a step that fails when the tag commit is not an ancestor of `origin/main`, and one that runs `scripts/check-version.mjs`); `smoke` (`uses: ./.github/workflows/image.yml`); `build` matrix `ubuntu-24.04` (amd64) and `ubuntu-24.04-arm` (arm64), each `needs: [verify, smoke]`, `docker/build-push-action` with `outputs: type=image,name=ghcr.io/weeeha/jobsmith,push-by-digest=true,name-canonical=true,push=true`, `provenance: mode=max`, `sbom: true`, digest uploaded as an artifact; `merge` (`docker buildx imagetools create` with the tags from `release-tags.mjs`); `release` (GitHub Release with the changelog section and `cli/dist/jobsmith.mjs`, prerelease flag for `-rc`). Permissions: `contents: write`, `packages: write`, `id-token: write`, `attestations: write`.

- [ ] **Step 1: Write the failing tests**

```ts
it("v1.2.3 with nothing newer gets 1.2.3, 1.2, 1 and latest")
it("v1.2.3 when 1.2.4 exists gets only 1.2.3")                          // plan decision: floating tags move only forward
it("v1.2.3 when 1.3.0 exists gets 1.2.3 and 1.2 but not 1 or latest")
it("v0.9.0-rc.1 gets only 0.9.0-rc.1, never latest")
it("changelogSection returns the body of '## [1.0.0]' up to the next '## ['")
it("checkVersion names each file that differs from the tag")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/release-scripts.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the scripts and the workflow**

Pins by SHA as in Task 37. Reading of spec 5.15 "nothing reaches the registry unless every job passed": `build` runs only after `verify` and `smoke` pass, so a failed verify or smoke pushes nothing; if one architecture's push fails after the other succeeded, an untagged digest remains but no tag points at it (named in the README ambiguities).

- [ ] **Step 4: Run the tests and lint**

Run: `pnpm vitest run tests/unit/release-scripts.test.ts tests/unit/workflows.test.ts && actionlint .github/workflows/release.yml`
Expected: PASS. The owner's tag cut for `v0.9.0-rc.1` is Task 40.

- [ ] **Step 5: Commit**

```bash
git add .github scripts tests
git commit -m "ci(release): tag-driven multi-arch publish with provenance, SBOM and the CLI file"
```

**Acceptance:**
1. Spec 5.15: native runners per architecture, smoke test on amd64, digest push, manifest list with `X.Y.Z`, `X.Y`, `X` and `latest` for the highest stable version, provenance and SBOM, GitHub Release with the changelog section and `jobsmith.mjs`; `-rc.N` pushes only its exact tag.
2. Spec 5.15: nothing is tagged unless every job passed.
3. A tag whose commit is not on `main`, or whose version differs from the three files, fails `verify`.

---

### Task 39: Self-hosting guide

**Files:**
- Modify: `docs/self-hosting.md` (everything around the Task 27 table), `README.md` (Deploying: a link, the Docker path), `.env.example`
- Test: `tests/unit/self-hosting-guide.test.ts`

**Interfaces:**
- Consumes: Tasks 27, 29, 31 to 36.
- Produces: the guide, written so a stranger can follow it verbatim.

Sections in order: Requirements (a Linux machine, Docker Engine 24 or newer with Compose v2, a domain with an A record, ports 80, 443 and 443/udp open); Get the files (`git clone --depth 1 --branch v<version> https://github.com/weeeha/jobsmith.git`, then copy its `deploy/` contents to `/opt/jobsmith`); Configure (`cp env.example .env`, `chmod 600 .env`, how to make secrets with `openssl rand -base64 32` and `openssl rand -base64 24`, set `JOBSMITH_DOMAIN`, `ACME_EMAIL`, `APP_URL=https://<domain>`, `SETUP_TOKEN`, `POSTGRES_PASSWORD`); Start (`docker compose --profile proxy up -d`, wait for health, open `https://<domain>/setup`, enter the setup token, create the account); Demo data (`docker compose run --rm app seed --pack software-engineering`, which prints a generated password once); Packs (copy `packs/product-design.json` to `deploy/packs/<id>.json`, change `id`, `name` and fields, `docker compose run --rm app packs-check /packs/<id>.json`, `docker compose restart app scheduler`; the app stops at start naming the file when it is invalid); Backups (the crontab line `15 3 * * * cd /opt/jobsmith && ./backup.sh >> backups/backup.log 2>&1`, copy `backups/` to another machine encrypted); Restore (`./restore.sh backups/db-<ts>.dump backups/storage-<ts>.tar.gz`); Upgrade (read the release notes, `./backup.sh`, `docker compose pull && docker compose up -d`; `JOBSMITH_TAG=1` follows every 1.x release; going back is a restore plus the older tag, because migrations only move forward; a newer schema stops an older image with the fixed message); Postgres major upgrade (dump with `pg_dump -Fc`, stop the stack, remove `pgdata`, change the image, start `postgres`, `pg_restore --clean --if-exists --no-owner`, start the rest); Other proxies (the README's nginx line `proxy_set_header X-Forwarded-For $remote_addr;`, `trustedProxies`, raise Caddy's 32 MB and `TRANSCRIBE_MAX_MB` together); Text to speech (the `tts` profile, `TTS_PROVIDER=openai_compatible`, `TTS_BASE_URL=http://tts:8880/v1`, written only with Task 34's confirmed details, otherwise one sentence that any OpenAI-compatible server works by setting those two variables); Local runner (systemd: copy the unit to `~/.config/systemd/user/`, `systemctl --user enable --now jobsmith-work`; launchd: copy the plist to `~/Library/LaunchAgents/`, `launchctl load`); Source code (AGPL section 13: an operator who changes the code sets `SOURCE_URL` to their own source); Multi-replica (one note: build your own image with `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`; no shared cache guide); Supported versions (Docker Engine 24, Compose v2, Postgres 17, 16 runs the same migrations and is untested); Troubleshooting (`docker compose logs app`, `curl http://localhost:3000/api/health` from inside the network, the `EnvError` line names the variable).

- [ ] **Step 1: Write the failing tests**

```ts
it("contains the crontab line verbatim")                                    // 15 3 * * * cd /opt/jobsmith && ./backup.sh >> backups/backup.log 2>&1
it("contains each docker compose command the spec lists: --profile proxy up -d, run --rm app seed --pack, run --rm app packs-check, restart app scheduler, pull, up -d")
it("keeps the env table between its markers and still passes the inventory test")
it("tells the operator to chmod 600 .env and to copy backups off the machine, encrypted")
it("names no personal address and uses example.com style hosts only")
it("has no em dash, no en dash and no exclamation mark")
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/self-hosting-guide.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the guide and the README link**

Prose follows the writing rules. Every command in the guide is one an executor ran in Task 37's workflow or in Task 40.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run tests/unit/self-hosting-guide.test.ts tests/unit/env-inventory.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs README.md .env.example tests
git commit -m "docs(self-host): the self-hosting guide with the environment table"
```

**Acceptance:**
1. Spec 5.7, 5.8, 5.9: start, packs, backup cron line, restore, upgrade and the Postgres major upgrade are written out.
2. Spec 5.11: the table of 60 variables is in the guide and checked by the inventory test.
3. Spec 7: `.env` at mode 600, encrypted off-machine copies, `SOURCE_URL` for modified code.

---

### Task 40: End to end, docs and ship

**Files:**
- Modify: `README.md` (Deploying), `docs/design-system.md` (no change expected; confirm), `.env.example`
- Test: the full suite, `image.yml` on the pull request, and the recorded install

**Blocked on:** the owner cutting `v0.9.0-rc.1` and `v0.9.0-rc.2` (README item 9), GHCR publishing (item 8), the person other than the owner and a Linux machine with a domain (items 10 and 11).

**Interfaces:**
- Consumes: Tasks 27 to 39.
- Produces: the milestone's proof.

- [ ] **Step 1: Run the whole suite**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm scripts:build && git diff --exit-code main -- tests/unit/__snapshots__/product-design-baseline.test.ts.snap`
Expected: PASS, no diff.

- [ ] **Step 2: Image workflow on the pull request**

Open the pull request; every step of `image.yml` is green (upload and upgrade steps skipped with their named reasons when their dependencies are absent). Preview check: the Vercel preview deploys without `JOBSMITH_STANDALONE`, `/api/health` answers 200 with status `ok` and no cookie, and the board loads in Chrome and Safari.

- [ ] **Step 3: Release candidates by the owner**

The owner merges the milestone, then cuts the two tags on `main` commits:

```bash
git tag -s v0.9.0-rc.1 -m "v0.9.0-rc.1" && git push origin v0.9.0-rc.1
# later, after a commit that changes something visible:
git tag -s v0.9.0-rc.2 -m "v0.9.0-rc.2" && git push origin v0.9.0-rc.2
```

Confirm for each tag: `docker buildx imagetools inspect ghcr.io/weeeha/jobsmith:0.9.0-rc.1` lists `linux/amd64` and `linux/arm64`, provenance and an SBOM exist, and no `latest` or `0.9` tag was moved.

- [ ] **Step 4: The recorded install by someone else**

A person other than the owner, on a clean Linux machine with a domain, follows `docs/self-hosting.md` verbatim with `JOBSMITH_TAG=0.9.0-rc.1` and records, in the pull request: the date and machine, each step they had to deviate from (each deviation is a guide bug to fix), that the app answered over HTTPS behind Caddy, that the first account was created with `SETUP_TOKEN`, that a job was added, that last night's backup restored into a new stack with the same jobs, and that `JOBSMITH_TAG=0.9.0-rc.2` with `docker compose pull && docker compose up -d` kept the data.

- [ ] **Step 5: Commit**

```bash
git add README.md docs .env.example
git commit -m "docs(self-host): README Deploying and the recorded install"
```

**Acceptance:**
1. Spec section 9 Milestone 35 done-when, in full, recorded in the pull request with the person's name left out unless they agree.
2. Spec 1 success criteria: a clean-machine install by someone other than the owner, verbatim.
3. Left out and named in the pull request: anything skipped for a missing dependency (scheduler wiring, `feed-scan`, upload step, runner units, Kokoro `tts` service).
