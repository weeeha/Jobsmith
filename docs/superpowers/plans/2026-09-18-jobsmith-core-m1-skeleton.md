# Jobsmith Core Milestone 1: Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Jobsmith skeleton so a fresh clone runs from the README and the deploy preview opens behind login on desktop and phone, with the database, auth, scoped query helper, empty board shell, CI and deploy wiring all in place for later milestones to build on.

**Architecture:** A Next.js App Router application on TypeScript strict, backed by Postgres through Drizzle ORM, with Better Auth providing email-and-password sessions gated by a first-run sign-up lock. Every `lib/*` module is a plain function set that takes a database handle and, where relevant, a user id, so routes and server actions stay thin and every module is testable without a browser. A single scoped query helper is the only way `app/` and `components/` code touches the database, enforced by an ESLint rule. The front end is assembled from two design systems, both copied into this repo: the token file and semantic layer from the Minimal Design System, primitives from shadcn `base-nova` (Base UI) and application shell components from the Super AI Components registry, in that order of preference, with new code last. A token lint script keeps `app/` and `components/` (outside `components/ui`) on semantic utilities and stock shadcn variable names only.

**Tech Stack:** Next.js 16.3.5 (App Router, Turbopack, React 19.2.8), TypeScript 5.9.3 strict, Tailwind CSS 4.3.3, shadcn/ui (`base-nova` style, Base UI) with components copied from the Super AI Components registry, the Minimal Design System's token file (`@weeeha/ui`, copied from a recorded commit, not installed as a package), `next-themes` 0.4.6, Better Auth 1.7.5 with the Drizzle adapter, Drizzle ORM 0.45.2 with `drizzle-kit` 0.31.10, `pg` 8.23.0 (node-postgres) for the runtime driver, `@electric-sql/pglite` 0.5.8 for tests, Zod 4.6.5, Vitest 5.0.1, Playwright 1.63.0 with `@axe-core/playwright` 4.13.0, pnpm 11.1.0, Node.js >=22 (developed on 24).

**Spec:** `docs/superpowers/specs/2026-09-18-jobsmith-core-design.md` (sections 2, 3, 4, 5.10, 6, 7, 8, 10 and the Milestone 1 row of section 9 govern this plan).

## Global Constraints

- Never commit to or push `main`. All work happens on branch `feat/m1-skeleton`.
- Public repo hygiene: fictional companies only, no compensation figures, no personal data, and no local absolute paths in committed files.
- The owner sets the shell variable `DESIGN_SYSTEM_DIR` to his local clone of the Minimal Design System before Task 2. It is read only through `git -C "$DESIGN_SYSTEM_DIR" show`/`grep` against its `main` branch; the working copy there is never checked out, fetched, pulled, installed or built.
- App code under `app/` and `components/`, excluding `components/ui/`, uses the Minimal Design System's semantic utilities and stock shadcn variable names only: no raw colors, no `oklch()`/`rgb()`/`hsl()`, no Tailwind palette classes (`bg-zinc-100`), no arbitrary values (`rounded-[14px]`). Motion uses the kit's `duration-fast`/`duration-base`/`duration-slow` and `ease-standard`/`ease-enter`/`ease-exit` tokens. `pnpm check:tokens` enforces this and must pass.
- Light and dark follow the system setting: `next-themes` with `attribute="class"`, `defaultTheme="system"`, `enableSystem`.
- Every page, server action and API route checks the session itself. Route-level protection (the request-interception file) is an extra layer and never the only check.
- Files under `app/` and `components/` never import the database client (`@/lib/db/client`) directly; they go through `@/lib/db/scoped`.
- UI copy has no exclamation marks.
- Commit messages end with the co-author trailer supplied by the executing session.
- Accessibility is built in from the start: labels, landmarks, keyboard access, visible focus.
- `package.json` has `"license": "AGPL-3.0-only"`.
- Node `>=22` in `engines`, and `.nvmrc` pinned to `24`.
- TypeScript strict, pnpm as the package manager, no `src/` directory.

## File Structure

```
.nvmrc                              Node version pin (24)
LICENSE                             AGPL-3.0 full text
docker-compose.yml                  Local Postgres for development
drizzle.config.ts                   drizzle-kit config (schema path, migrations out dir)
eslint.config.mjs                   Flat ESLint config; gets the no-restricted-imports rule
playwright.config.ts                Chromium, WebKit and phone-viewport projects
vitest.config.mts                   Vitest config with the @/* alias
vercel.ts                           Vercel build configuration (typed, @vercel/config)
proxy.ts                            Optimistic auth redirect (Next.js request interception)
.env.example                        Documented env vars
README.md                           Install notes, scripts table, license line

docs/
  design-system.md                  What was copied from the two design systems, from which commit,
                                     re-sync steps, and every local change to a copied file

app/
  layout.tsx                        Root layout: Geist/Geist Mono fonts, ThemeProvider, html/body shell
  globals.css                       The Minimal Design System's token file, copied verbatim
  api/auth/[...all]/route.ts        Better Auth's Next.js route handler
  (auth)/setup/page.tsx             First-run account creation (404s after)
  (auth)/setup/actions.ts           Server action backing the setup form
  (auth)/login/page.tsx             Email/password login
  (auth)/login/login-form.tsx       Client form: rate-limited sign-in through the auth client
  (app)/layout.tsx                  Calls requireUser(); renders the app shell
  (app)/actions.ts                  Logout server action
  (app)/page.tsx                    Home placeholder ("/")
  (app)/board/page.tsx              Empty board with seven columns ("/board")

components/
  ui/                               shadcn base-nova primitives (button, input, label, card, sidebar,
                                     badge, breadcrumb, button-group, dropdown-menu, radio-group, sheet,
                                     separator, skeleton, tooltip, ...), excluded from the token lint
  super-ai/                         Super AI Components registry items, copied verbatim: app-sidebar,
                                     sidebar-nav, section-header, app-topbar, account-menu, kbd,
                                     data-views, kanban-view, kanban-column, table-view, feed-view,
                                     calendar-view, timeline-view, data-views-shared
  theme-provider.tsx                Thin client wrapper around next-themes' ThemeProvider
  app-shell.tsx                     Composes AppSidebar/SidebarNav/AppTopbar/AccountMenu for desktop,
                                     a new-code bottom tab bar for phone

lib/
  env.ts                            parseEnv, EnvError, env() (Zod-validated process.env)
  utils.ts                          shadcn's cn() re-export
  initials.tsx                      initials(name), from the Super AI Components registry
  use-view-mode.tsx                 ViewMode type/hook, from the Super AI Components registry
  db/
    client.ts                       Db type, createDb(pool), getDb()
    scoped.ts                       scoped(db, userId) and scopedFor(userId) -> tenant-safe
                                     profile queries
    schema/
      auth.ts                       Generated by the Better Auth CLI (user, session, account,
                                     verification, rate_limit)
      app.ts                        profile table
      index.ts                      Re-exports both
    migrations/                     drizzle-kit generate output (SQL + meta)
  auth/
    index.ts                        betterAuth() instance, sign-up gate, session policy
    policy.ts                       sessionPolicy, MIN_PASSWORD_LENGTH, signInMaxPerMinute()
    return-to.ts                    safeReturnTo(): same-site return path after login
    signup-gate.ts                  signUpAllowed(userCount, allowSignup)
    users.ts                        countUsers(db)
    first-run.ts                    isFirstRun()
    session.ts                      getUser(), requireUser()
    client.ts                       createAuthClient() and its bound methods
  pipeline/
    kinds.ts                        STAGE_KINDS ordered list, StageKind type

hooks/
  use-mobile.ts                     useIsMobile(), from the Super AI Components registry (sidebar dep)

scripts/
  migrate.ts                        Applies migrations with the node-postgres migrator
  seed.ts                           Creates the synthetic demo user and profile
  reset-db.ts                       Drops and re-migrates a local database only
  check-tokens.mjs                  findViolations(), collectFiles(): the token lint, run by pnpm lint

tests/
  helpers/db.ts                     makeTestDb(), createTestUser()
  fixtures/check-tokens/            bad.tsx, clean.tsx: fixtures for the token lint tests
  unit/
    env.test.ts
    signup-gate.test.ts
    policy.test.ts
    return-to.test.ts
    kinds.test.ts
    check-tokens.test.ts
  integration/
    migrations.test.ts
    users.test.ts
    scoped.test.ts
  e2e/
    global-setup.ts                 Resets the database before the suite runs
    axe.ts                          scanForViolations(page, label): axe scan helper, light and dark
    account.ts                      The one account the suite creates and logs in with
    first-run.spec.ts               Runs once: setup, 404 after setup, logout, login, return-path guard
    shell.spec.ts                   Runs in chromium, webkit and phone: login, board, home, navigation

.github/workflows/ci.yml            Typecheck/lint (incl. check:tokens)/test/build, Playwright, gitleaks
```

---

### Task 1: Scaffold, license and environment validation

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `postcss.config.mjs`, `.nvmrc`, `LICENSE`, `.env.example`, `README.md`, `vitest.config.mts`, `lib/env.ts`
- Test: `tests/unit/env.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `parseEnv(source: Record<string, string | undefined>): Env`, `class EnvError extends Error`, `env(): Env` (memoized), and the type `Env = { DATABASE_URL: string; BETTER_AUTH_SECRET: string; APP_URL: string; ALLOW_SIGNUP: boolean; TRUSTED_ORIGINS: string[] }`, all from `lib/env.ts`. Package scripts `dev`, `build`, `start`, `lint`, `typecheck`, `test`. The `@/*` import alias resolving to the project root, in both `tsconfig.json` and `vitest.config.mts`.

- [ ] **Step 1: Scaffold the Next.js app**

Run from the repository root (the branch `feat/m1-skeleton` must already be checked out):

```bash
pnpm dlx create-next-app@latest . --typescript --tailwind --eslint --app --import-alias "@/*" --use-pnpm --disable-git --yes
```

Expected output ends with:

```
Success! Created jobsmith-skeleton at ...
```

(the create-next-app installer names the app after the directory; that name only affects the value it writes for `"name"` in `package.json`, not the folder). This installs Next.js `16.3.5`, React `19.2.8`, Tailwind CSS `4.3.3` and TypeScript `5.9.3`, and writes `app/`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `AGENTS.md` and a one-line `CLAUDE.md` that points at it. Do not delete `AGENTS.md`; it tells future sessions to read `node_modules/next/dist/docs/` before writing framework-specific code, which is exactly the practice this plan followed while it was written.

- [ ] **Step 2: Set the package name, license and engines**

Open `package.json` and set:

```json
{
  "name": "jobsmith",
  "version": "0.1.0",
  "private": true,
  "license": "AGPL-3.0-only",
  "engines": {
    "node": ">=22"
  }
}
```

Keep the `scripts`, `dependencies` and `devDependencies` blocks create-next-app wrote; you are adding fields, not replacing the file.

- [ ] **Step 3: Pin the Node version**

```bash
echo "24" > .nvmrc
```

- [ ] **Step 4: Add the AGPL-3.0 license file**

```bash
curl -fsSL https://www.gnu.org/licenses/agpl-3.0.txt -o LICENSE
head -1 LICENSE
```

Expected output: `                    GNU AFFERO GENERAL PUBLIC LICENSE`

- [ ] **Step 5: Install Zod and Vitest**

```bash
pnpm add zod
pnpm add -D vitest
```

- [ ] **Step 6: Write the Vitest config**

Create `vitest.config.mts` (the `.mts` extension, not `.ts`, avoids a Vite 5 "native config loader" deprecation warning about loading an ESM file as CommonJS):

```typescript
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});
```

- [ ] **Step 7: Add the typecheck, test and db script placeholders**

In `package.json`, add to `scripts` (keep `dev`, `build`, `start`, `lint` as create-next-app wrote them):

```json
{
  "scripts": {
    "typecheck": "next typegen && tsc --noEmit",
    "test": "vitest run"
  }
}
```

`next typegen` generates the route types Next.js 16 needs for the `PageProps<'/route'>` and `LayoutProps<'/route'>` helpers this plan uses throughout (`app/layout.tsx`, generated by create-next-app, already uses `LayoutProps<"/">`). Without running it first, a bare `tsc --noEmit` fails with `Cannot find name 'LayoutProps'`, because those types live in a generated `.next/types` directory that only `next build`, `next dev` or `next typegen` produce.

- [ ] **Step 8: Confirm typecheck passes on the untouched scaffold**

```bash
pnpm typecheck
```

Expected: no output, exit code 0.

- [ ] **Step 9: Write the failing tests for env parsing**

Create `tests/unit/env.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { parseEnv, EnvError } from "@/lib/env";

const validSource = {
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/jobsmith",
  BETTER_AUTH_SECRET: "x".repeat(32),
  APP_URL: "http://localhost:3000",
};

const withoutAppUrl = {
  DATABASE_URL: validSource.DATABASE_URL,
  BETTER_AUTH_SECRET: validSource.BETTER_AUTH_SECRET,
};

describe("parseEnv", () => {
  it("returns a validated Env for valid input", () => {
    const env = parseEnv(validSource);
    expect(env.DATABASE_URL).toBe(validSource.DATABASE_URL);
    expect(env.BETTER_AUTH_SECRET).toBe(validSource.BETTER_AUTH_SECRET);
    expect(env.APP_URL).toBe(validSource.APP_URL);
    expect(env.ALLOW_SIGNUP).toBe(false);
  });

  it("parses ALLOW_SIGNUP=true", () => {
    const env = parseEnv({ ...validSource, ALLOW_SIGNUP: "true" });
    expect(env.ALLOW_SIGNUP).toBe(true);
  });

  it("rejects a BETTER_AUTH_SECRET shorter than 32 characters", () => {
    expect(() =>
      parseEnv({ ...validSource, BETTER_AUTH_SECRET: "too-short" }),
    ).toThrow(EnvError);
  });

  it("throws an EnvError listing every missing variable by name", () => {
    expect.assertions(2);
    try {
      parseEnv({});
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError);
      const message = (error as EnvError).message;
      expect(message).toBe(
        "Invalid environment variables: DATABASE_URL, BETTER_AUTH_SECRET, APP_URL",
      );
    }
  });
});

describe("parseEnv: APP_URL falls back to Vercel system variables", () => {
  it("uses APP_URL when set, ignoring any Vercel variables", () => {
    const env = parseEnv({ ...validSource, VERCEL_URL: "some-preview.vercel.app" });
    expect(env.APP_URL).toBe(validSource.APP_URL);
  });

  it("falls back to VERCEL_PROJECT_PRODUCTION_URL when VERCEL_ENV is production", () => {
    const env = parseEnv({
      ...withoutAppUrl,
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "jobsmith.vercel.app",
    });
    expect(env.APP_URL).toBe("https://jobsmith.vercel.app");
  });

  it("does not use VERCEL_PROJECT_PRODUCTION_URL when VERCEL_ENV is not production", () => {
    const env = parseEnv({
      ...withoutAppUrl,
      VERCEL_ENV: "preview",
      VERCEL_PROJECT_PRODUCTION_URL: "jobsmith.vercel.app",
      VERCEL_BRANCH_URL: "jobsmith-git-feat-branch.vercel.app",
    });
    expect(env.APP_URL).toBe("https://jobsmith-git-feat-branch.vercel.app");
  });

  it("falls back to VERCEL_BRANCH_URL when a production URL is unavailable", () => {
    const env = parseEnv({
      ...withoutAppUrl,
      VERCEL_BRANCH_URL: "jobsmith-git-feat-branch.vercel.app",
      VERCEL_URL: "jobsmith-abc123.vercel.app",
    });
    expect(env.APP_URL).toBe("https://jobsmith-git-feat-branch.vercel.app");
  });

  it("falls back to VERCEL_URL when neither a production nor a branch URL is available", () => {
    const env = parseEnv({ ...withoutAppUrl, VERCEL_URL: "jobsmith-abc123.vercel.app" });
    expect(env.APP_URL).toBe("https://jobsmith-abc123.vercel.app");
  });

  it("reports APP_URL as missing when none of the sources are available", () => {
    expect.assertions(1);
    try {
      parseEnv(withoutAppUrl);
    } catch (error) {
      expect((error as EnvError).message).toBe("Invalid environment variables: APP_URL");
    }
  });

  it("reports APP_URL as missing when VERCEL_ENV is production but no production URL is set", () => {
    expect.assertions(1);
    try {
      parseEnv({ ...withoutAppUrl, VERCEL_ENV: "production" });
    } catch (error) {
      expect((error as EnvError).message).toBe("Invalid environment variables: APP_URL");
    }
  });
});

describe("parseEnv: TRUSTED_ORIGINS", () => {
  it("contains only APP_URL when no Vercel variables are set", () => {
    const env = parseEnv(validSource);
    expect(env.TRUSTED_ORIGINS).toEqual([validSource.APP_URL]);
  });

  it("includes APP_URL plus every present Vercel-derived origin, deduplicated", () => {
    const env = parseEnv({
      ...validSource,
      APP_URL: "https://custom-domain.example.com",
      VERCEL_URL: "jobsmith-abc123.vercel.app",
      VERCEL_BRANCH_URL: "jobsmith-git-feat-branch.vercel.app",
      VERCEL_PROJECT_PRODUCTION_URL: "jobsmith.vercel.app",
    });
    expect(env.TRUSTED_ORIGINS).toEqual([
      "https://custom-domain.example.com",
      "https://jobsmith-abc123.vercel.app",
      "https://jobsmith-git-feat-branch.vercel.app",
      "https://jobsmith.vercel.app",
    ]);
  });

  it("de-duplicates when APP_URL was itself derived from a Vercel variable", () => {
    const env = parseEnv({ ...withoutAppUrl, VERCEL_URL: "jobsmith-abc123.vercel.app" });
    expect(env.TRUSTED_ORIGINS).toEqual(["https://jobsmith-abc123.vercel.app"]);
  });
});
```

`VERCEL_URL`, `VERCEL_BRANCH_URL` and `VERCEL_PROJECT_PRODUCTION_URL` are Vercel's own system environment variables: a bare hostname with no protocol, which is why each is prefixed with `https://` before use. `VERCEL_PROJECT_PRODUCTION_URL` is only trusted when `VERCEL_ENV` is exactly `"production"`, since that variable is present (and stable) on every environment but only correct as the app's own URL on a production deploy.

- [ ] **Step 10: Run the tests and confirm they fail**

```bash
pnpm test
```

Expected: fails with `Cannot find module '@/lib/env'` (the file does not exist yet).

- [ ] **Step 11: Implement `lib/env.ts`**

```typescript
import { z } from "zod";

const rawEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  ALLOW_SIGNUP: z
    .string()
    .optional()
    .transform((value) => value === "true"),
});

export type Env = {
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  APP_URL: string;
  ALLOW_SIGNUP: boolean;
  TRUSTED_ORIGINS: string[];
};

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvError";
  }
}

function resolveAppUrl(source: Record<string, string | undefined>): string | undefined {
  if (source.APP_URL) return source.APP_URL;
  if (source.VERCEL_ENV === "production" && source.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${source.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (source.VERCEL_BRANCH_URL) return `https://${source.VERCEL_BRANCH_URL}`;
  if (source.VERCEL_URL) return `https://${source.VERCEL_URL}`;
  return undefined;
}

function resolveTrustedOrigins(
  source: Record<string, string | undefined>,
  appUrl: string | undefined,
): string[] {
  const origins = new Set<string>();
  if (appUrl) origins.add(appUrl);
  for (const key of ["VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"] as const) {
    const value = source[key];
    if (value) origins.add(`https://${value}`);
  }
  return [...origins];
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = rawEnvSchema.safeParse(source);

  const appUrl = resolveAppUrl(source);
  const urlResult = appUrl ? z.url().safeParse(appUrl) : undefined;

  if (!result.success || !urlResult?.success) {
    const names = new Set<string>();
    if (!result.success) {
      for (const issue of result.error.issues) names.add(issue.path.join("."));
    }
    if (!urlResult?.success) names.add("APP_URL");
    throw new EnvError(`Invalid environment variables: ${[...names].join(", ")}`);
  }

  return {
    DATABASE_URL: result.data.DATABASE_URL,
    BETTER_AUTH_SECRET: result.data.BETTER_AUTH_SECRET,
    APP_URL: urlResult.data,
    ALLOW_SIGNUP: result.data.ALLOW_SIGNUP,
    TRUSTED_ORIGINS: resolveTrustedOrigins(source, urlResult.data),
  };
}

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    cached = parseEnv(process.env);
  }
  return cached;
}
```

`resolveAppUrl` checks `APP_URL` first, then Vercel's system variables in the order Vercel sets them: `VERCEL_PROJECT_PRODUCTION_URL` only applies on a production deploy, then `VERCEL_BRANCH_URL`, then `VERCEL_URL` (present on every deployment). `resolveTrustedOrigins` collects the resolved `APP_URL` plus every present Vercel-derived origin into a `Set`, so a preview deployment trusts both its stable branch URL and its unique per-build URL, with no duplicates when they happen to coincide. `names` is built as a `Set` rather than the earlier array-plus-dedupe, since `APP_URL` is now added separately from the rest of the schema's issues instead of appearing in `result.error.issues`.

- [ ] **Step 12: Run the tests and confirm they pass**

```bash
pnpm test
```

Expected: `Test Files 1 passed (1)`, `Tests 14 passed (14)`.

- [ ] **Step 13: Add a memoization test and confirm it passes**

Append to `tests/unit/env.test.ts`:

```typescript
import { env } from "@/lib/env";

describe("env", () => {
  it("memoizes its result across calls", () => {
    process.env.DATABASE_URL = validSource.DATABASE_URL;
    process.env.BETTER_AUTH_SECRET = validSource.BETTER_AUTH_SECRET;
    process.env.APP_URL = validSource.APP_URL;
    expect(env()).toBe(env());
  });
});
```

Run `pnpm test` again. Expected: `Tests 15 passed (15)`.

- [ ] **Step 14: Write `.env.example`**

```bash
# Postgres connection string. For local development, docker-compose.yml
# (added in the next task) starts a Postgres you can point this at.
DATABASE_URL=postgres://postgres:postgres@localhost:5432/jobsmith

# Session signing secret, at least 32 characters. Generate with:
#   openssl rand -base64 32
BETTER_AUTH_SECRET=

# The public URL this app is served from. Also used as the Better Auth base
# URL and trusted origin. Required for local development and self-hosting.
# On Vercel this can usually be left unset: Preview always derives it from
# Vercel's own system environment variables, and so does Production unless
# it is served from a custom domain (see the README).
APP_URL=http://localhost:3000

# Set to "true" to allow sign-up after the first account already exists.
# Defaults to false: only the first account can sign up until you flip this.
ALLOW_SIGNUP=false
```

- [ ] **Step 15: Write the README skeleton**

```markdown
# Jobsmith

Jobsmith is one app for a whole job search: find, qualify, apply, research,
prepare for each interview stage, debrief. It is open source under
AGPL-3.0 and self-hostable.

Install notes land here at the end of Milestone 1.

## License

AGPL-3.0-only. See `LICENSE`.
```

- [ ] **Step 16: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: scaffold Next.js app with license and validated env

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Design system foundation

**Files:**
- Create: `components.json`, `components/ui/button.tsx`, `components/ui/input.tsx`, `components/ui/label.tsx`, `components/ui/card.tsx`, `lib/utils.ts`, `components/theme-provider.tsx`, `scripts/check-tokens.mjs`, `docs/design-system.md`
- Modify: `app/globals.css` (replaced in full), `app/layout.tsx`, `app/page.tsx` (temporary smoke check; Task 6 deletes it), `package.json` (scripts)
- Test: `tests/unit/check-tokens.test.ts`, `tests/fixtures/check-tokens/bad.tsx`, `tests/fixtures/check-tokens/clean.tsx`

**Interfaces:**
- Consumes: nothing beyond Task 1's scaffold (`package.json`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx` as create-next-app wrote them).
- Produces: `components/ui/{button,input,label,card}.tsx` (base-nova/Base UI primitives, consumed by Tasks 6 and 7), `ThemeProvider` from `components/theme-provider.tsx`, the `--font-sans`/`--font-mono` CSS variables that `app/globals.css` expects, `findViolations(filePath: string, contents: string): { file: string; line: number; rule: string; text: string }[]` and `collectFiles(root?: string): string[]` from `scripts/check-tokens.mjs`, the `pnpm check:tokens` script wired into `pnpm lint`, and `docs/design-system.md`.

- [ ] **Step 1: OWNER INPUT: point at the Minimal Design System clone**

The owner sets this before continuing, and it is never committed:

```bash
export DESIGN_SYSTEM_DIR=/path/to/his/local/clone/of/minimal-design-system
git -C "$DESIGN_SYSTEM_DIR" rev-parse --short main
```

Expected: a short commit hash. Record it; Step 4 copies from this commit and Step 15 writes it into `docs/design-system.md`. This plan never checks out, fetches, pulls, installs or builds inside `$DESIGN_SYSTEM_DIR`; every read goes through `git -C "$DESIGN_SYSTEM_DIR" show`/`grep` against `main`.

- [ ] **Step 2: Initialize shadcn non-interactively with the base-nova preset**

```bash
pnpm dlx shadcn@latest init --defaults -y
```

`--defaults` is `--template=next --preset=base-nova`; combined with `-y` (skip confirmation, the CLI's own default) this needs no prompts. Expected output ends with:

```
✔ Created 2 files:
  - components/ui/button.tsx
  - lib/utils.ts
- Updating app/globals.css
✔ Updating app/globals.css

Project initialization completed.
You may now add components.
```

This writes `components.json` with `"style": "base-nova"`, `"baseColor": "neutral"`, `"rsc": true`, and installs `@base-ui/react`, `class-variance-authority`, `cn`, `lucide-react`, `shadcn` and `tw-animate-css` as dependencies. That last pair matters: `tw-animate-css` and `shadcn/tailwind.css`, two of the three imports at the top of the file Step 4 copies in, are satisfied by this step alone, with nothing extra to install for them. This step also overwrites `app/globals.css` and `app/layout.tsx` with its own defaults; Steps 4 and 7 replace both.

- [ ] **Step 3: Add the remaining primitives**

```bash
pnpm dlx shadcn@latest add button input label card -y
```

Expected output:

```
✔ Created 3 files:
  - components/ui/input.tsx
  - components/ui/label.tsx
  - components/ui/card.tsx
ℹ Skipped 1 file: (files might be identical, use --overwrite to overwrite)
  - components/ui/button.tsx
```

- [ ] **Step 4: Copy the Minimal Design System's token file**

```bash
git -C "$DESIGN_SYSTEM_DIR" show main:src/styles/globals.css > app/globals.css
wc -l app/globals.css
```

Expected: `733 app/globals.css`.

This file imports `tailwindcss`, `tw-animate-css` and `shadcn/tailwind.css` (all already installed by Step 2), declares `@custom-variant dark (&:where(.dark, .dark *, [data-theme="dark"], [data-theme="dark"] *))`, and defines three tiers: primitive ramps, a semantic layer (`--surface-*`, `--text-*`, `--icon-*`, `--button-*`, `--accent-*`, `--status-*`, `--border-*`, `--border-hover`), and a shadcn alias layer (`--background`, `--foreground`, `--card`, `--primary`, ...) so a stock shadcn component inherits the theme unmodified. It also declares `@utility duration-fast/base/slow/ambient` and exposes `--ease-standard`/`--ease-enter`/`--ease-exit` through `@theme inline` for motion. `--font-sans: var(--font-sans)` inside `@theme inline` (and likewise `--font-mono`) means the file does not supply a sans or mono face itself; Step 7 defines both. A fallback stack in `@layer base` (system fonts) keeps the file valid on its own until then.

- [ ] **Step 5: Confirm the project still typechecks**

```bash
pnpm typecheck
```

Expected: exits 0.

- [ ] **Step 6: Install next-themes and write the provider**

```bash
pnpm add next-themes
```

Create `components/theme-provider.tsx`:

```tsx
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
```

This step adds no toggle UI of its own: `defaultTheme="system"` with `enableSystem` is the whole behavior this task needs to prove. Task 7's account menu is where a person-facing appearance control lives, because the Super AI Components registry's `account-menu` already ships one.

- [ ] **Step 7: Wire Geist and Geist Mono to the variable names the tokens expect**

Replace `app/layout.tsx` in full:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jobsmith",
  description: "Track a job search from saved to offer.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

Passing `variable: "--font-sans"` directly to the `Geist` loader, instead of the loader's own default name `--font-geist-sans`, means the font sets the exact custom property `app/globals.css` reads, with no separate mapping line needed. `suppressHydrationWarning` on `<html>` is `next-themes`' own documented requirement: it sets the `class` attribute after hydration, which would otherwise log a one-time mismatch warning.

Only Geist and Geist Mono are cleared for this repo (spec section 10). The design system's own Storybook additionally loads Outfit for a `--font-site` marketing face (`.storybook/preview-head.html` on the design system's `main`), but `app/globals.css` itself does not set `--font-site` to Outfit anywhere: it falls back to `var(--font-sans)` in the copied file's own `@layer base`, so Outfit is not part of what this repo needs and is not added.

- [ ] **Step 8: Prove a base-nova Button renders with the copied tokens**

Replace `app/page.tsx` in full (temporary; Task 6 deletes this file when it adds the real routes):

```tsx
import { Button } from "@/components/ui/button";

export default function DesignSystemSmokeCheck() {
  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <Button>Themed button</Button>
    </main>
  );
}
```

```bash
DATABASE_URL="postgres://postgres:postgres@localhost:5432/jobsmith" BETTER_AUTH_SECRET="$(openssl rand -base64 32)" APP_URL="http://localhost:3000" pnpm build
```

Expected: succeeds, route list includes `○ /`.

```bash
DATABASE_URL="postgres://postgres:postgres@localhost:5432/jobsmith" BETTER_AUTH_SECRET="$(openssl rand -base64 32)" APP_URL="http://localhost:3000" pnpm dev &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
kill %1
```

Expected: `200`. Open `http://localhost:3000` in a browser and confirm the button renders with a dark, rounded fill in light mode and inverts in dark mode (toggle the OS color scheme; there is no in-app switch yet). That fill is `bg-primary` resolving through the alias layer to `--button-primary` to `--accent-solid` to `--accent-900`, the copied file's own value, not shadcn's stock default.

- [ ] **Step 9: Write the failing token lint tests**

Create `tests/fixtures/check-tokens/bad.tsx`:

```tsx
export function Bad() {
  return (
    <div
      className="bg-zinc-100 text-slate-500 rounded-[14px] duration-[250ms]"
      style={{ color: "#ff0000" }}
    >
      <span className="bg-[oklch(0.5_0_0)]">oklch</span>
      <span style={{ background: "rgb(0, 0, 0)" }}>rgb</span>
      <span style={{ background: "hsl(0, 0%, 0%)" }}>hsl</span>
    </div>
  );
}
```

Create `tests/fixtures/check-tokens/clean.tsx`:

```tsx
export function Clean() {
  return (
    <div
      data-slot="clean"
      className="bg-surface-card text-text-primary border border-border duration-fast ease-enter data-[state=open]:bg-accent [&_svg]:size-4"
    >
      Clean
    </div>
  );
}
```

Create `tests/unit/check-tokens.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { findViolations } from "../../scripts/check-tokens.mjs";

const fixture = (name: string) =>
  readFileSync(path.join(__dirname, "../fixtures/check-tokens", name), "utf8");

describe("findViolations", () => {
  it("flags raw hex colors", () => {
    const violations = findViolations("bad.tsx", fixture("bad.tsx"));
    expect(violations.some((v) => v.rule === "raw-hex-color")).toBe(true);
  });

  it("flags oklch/rgb/hsl functions", () => {
    const violations = findViolations("bad.tsx", fixture("bad.tsx"));
    expect(
      violations.some((v) => v.rule === "raw-color-function" && v.text.includes("oklch(")),
    ).toBe(true);
    expect(
      violations.some((v) => v.rule === "raw-color-function" && v.text.includes("rgb(")),
    ).toBe(true);
    expect(
      violations.some((v) => v.rule === "raw-color-function" && v.text.includes("hsl(")),
    ).toBe(true);
  });

  it("flags Tailwind palette classes", () => {
    const violations = findViolations("bad.tsx", fixture("bad.tsx"));
    expect(
      violations.some((v) => v.rule === "tailwind-palette-class" && v.text.includes("bg-zinc-100")),
    ).toBe(true);
    expect(
      violations.some((v) => v.rule === "tailwind-palette-class" && v.text.includes("text-slate-500")),
    ).toBe(true);
  });

  it("flags arbitrary values", () => {
    const violations = findViolations("bad.tsx", fixture("bad.tsx"));
    expect(violations.some((v) => v.rule === "arbitrary-value" && v.text === "rounded-[14px]")).toBe(
      true,
    );
    expect(
      violations.some((v) => v.rule === "arbitrary-value" && v.text === "duration-[250ms]"),
    ).toBe(true);
  });

  it("passes semantic utilities, motion tokens and data-attribute/arbitrary-selector variants", () => {
    const violations = findViolations("clean.tsx", fixture("clean.tsx"));
    expect(violations).toEqual([]);
  });
});
```

- [ ] **Step 10: Run the tests and confirm they fail**

```bash
pnpm test tests/unit/check-tokens.test.ts
```

Expected: fails with `Cannot find module '../../scripts/check-tokens.mjs'`.

- [ ] **Step 11: Implement the token lint script**

Create `scripts/check-tokens.mjs`:

```javascript
#!/usr/bin/env node
// Fails on raw hex colors, oklch()/rgb()/hsl(), stock Tailwind palette
// classes (bg-zinc-100, text-slate-500, ...) and Tailwind arbitrary VALUES
// (rounded-[14px], duration-[250ms]) under app/ and components/, excluding
// app/globals.css (where the token ramps themselves live) and components/ui/
// (vendored shadcn primitives, which read theme variables through raw CSS
// functions like color-mix() by design).
//
// Arbitrary-value brackets are told apart from arbitrary VARIANT brackets
// (data-[state=open]:, group-data-[collapsible=icon]:, [&_svg]:) by what
// follows the closing bracket: a variant is always followed by ":", a value
// never is.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SCAN_ROOTS = ["app", "components"];
const EXCLUDE_FILES = new Set([path.join("app", "globals.css")]);
const EXCLUDE_DIRS = [path.join("components", "ui")];
const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".mjs"]);

const TAILWIND_PALETTE_COLORS = [
  "slate", "gray", "zinc", "neutral", "stone",
  "red", "orange", "amber", "yellow", "lime", "green", "emerald",
  "teal", "cyan", "sky", "blue", "indigo", "violet", "purple",
  "fuchsia", "pink", "rose", "black", "white",
];

const PALETTE_PREFIXES = [
  "bg", "text", "border", "ring", "fill", "stroke", "from", "via", "to",
  "outline", "decoration", "divide", "caret", "accent", "shadow", "placeholder",
];

const PALETTE_CLASS_RE = new RegExp(
  `\\b(?:${PALETTE_PREFIXES.join("|")})-(?:${TAILWIND_PALETTE_COLORS.join("|")})(?:-[0-9]{2,3})?\\b`,
  "g",
);

const HEX_COLOR_RE = /#(?:[0-9a-fA-F]{3,4}){1,2}\b/g;
const RAW_FUNCTION_RE = /\b(?:oklch|rgb|hsl)\(/g;
const ARBITRARY_VALUE_RE = /[a-zA-Z][a-zA-Z0-9]*-\[[^\]]+\]/g;

/** @typedef {{ file: string, line: number, rule: string, text: string }} Violation */

/**
 * @param {string} filePath
 * @param {string} contents
 * @returns {Violation[]}
 */
export function findViolations(filePath, contents) {
  /** @type {Violation[]} */
  const violations = [];
  const lines = contents.split("\n");

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    for (const match of line.matchAll(HEX_COLOR_RE)) {
      violations.push({ file: filePath, line: lineNumber, rule: "raw-hex-color", text: match[0] });
    }

    for (const match of line.matchAll(RAW_FUNCTION_RE)) {
      violations.push({ file: filePath, line: lineNumber, rule: "raw-color-function", text: match[0] });
    }

    for (const match of line.matchAll(PALETTE_CLASS_RE)) {
      violations.push({ file: filePath, line: lineNumber, rule: "tailwind-palette-class", text: match[0] });
    }

    for (const match of line.matchAll(ARBITRARY_VALUE_RE)) {
      const nextChar = line[match.index + match[0].length];
      if (nextChar !== ":") {
        violations.push({ file: filePath, line: lineNumber, rule: "arbitrary-value", text: match[0] });
      }
    }
  });

  return violations;
}

function shouldSkip(relativePath) {
  if (EXCLUDE_FILES.has(relativePath)) return true;
  return EXCLUDE_DIRS.some((dir) => relativePath === dir || relativePath.startsWith(dir + path.sep));
}

function walk(dir, root, results) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const relativePath = path.relative(root, fullPath);
    if (shouldSkip(relativePath)) continue;

    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walk(fullPath, root, results);
    } else if (SCAN_EXTENSIONS.has(path.extname(fullPath))) {
      results.push(fullPath);
    }
  }
}

/** @param {string} [root] */
export function collectFiles(root = process.cwd()) {
  const files = [];
  for (const dirName of SCAN_ROOTS) {
    walk(path.join(root, dirName), root, files);
  }
  return files;
}

function main() {
  const root = process.cwd();
  const files = collectFiles(root);
  /** @type {Violation[]} */
  const allViolations = [];

  for (const file of files) {
    const relativePath = path.relative(root, file);
    const contents = readFileSync(file, "utf8");
    allViolations.push(...findViolations(relativePath, contents));
  }

  if (allViolations.length > 0) {
    console.error(`check:tokens found ${allViolations.length} violation(s):\n`);
    for (const violation of allViolations) {
      console.error(`  ${violation.file}:${violation.line}  [${violation.rule}]  ${violation.text}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`check:tokens: scanned ${files.length} files, no violations.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

- [ ] **Step 12: Run the tests and confirm they pass**

```bash
pnpm test tests/unit/check-tokens.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 5 passed (5)`.

- [ ] **Step 13: Wire it into `pnpm lint` and add `pnpm check:tokens`**

In `package.json`, change `scripts.lint` and add `check:tokens`:

```json
{
  "scripts": {
    "lint": "eslint && node scripts/check-tokens.mjs",
    "check:tokens": "node scripts/check-tokens.mjs"
  }
}
```

- [ ] **Step 14: Run it against the repo so far**

```bash
pnpm check:tokens
```

Expected: `check:tokens: scanned 2 files, no violations.` (`app/layout.tsx` and `app/page.tsx`; `components/ui/*` is excluded and `app/globals.css` is excluded by name).

- [ ] **Step 15: Write `docs/design-system.md`**

Create `docs/design-system.md` (replace `<commit>` with the hash Step 1 recorded):

```markdown
# Design system

Jobsmith's front end is copied from two design systems into this repo, so a
stranger can install Jobsmith with no private access.

## What was copied

| Source | What | From | Into |
|---|---|---|---|
| Minimal Design System (`@weeeha/ui`, MIT, same owner, private repo) | token file: primitive ramps, semantic layer, shadcn alias layer | commit `<commit>` on `main` | `app/globals.css` |
| shadcn `base-nova` (Base UI) | primitives | `shadcn add` | `components/ui/` |
| Super AI Components (public registry, same owner, no license file yet; the owner holds the rights) | application shell components | `shadcn add <registry url>` | `components/super-ai/`, plus their own `components/ui/`, `lib/` and `hooks/` dependencies |

## Order of preference for new UI

1. A Super AI Components registry item.
2. A `base-nova` primitive.
3. A component copied from the Minimal Design System (Radix-based; copy only when neither above fits).
4. New code.

## Re-sync

Token file: re-run the `git -C "$DESIGN_SYSTEM_DIR" show main:src/styles/globals.css > app/globals.css` command against a newer commit, re-run `pnpm check:tokens` and the axe suite, and update the commit hash above.

Registry components: re-run the same `shadcn add` command for that item with `--overwrite`, then re-apply anything listed under "Local changes" below.

## Local changes

(none yet)
```

- [ ] **Step 16: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add the design system foundation (tokens, base-nova, token lint)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Database client, Better Auth schema and migrations

**Files:**
- Create: `docker-compose.yml`, `drizzle.config.ts`, `lib/db/client.ts`, `lib/auth/index.ts` (minimal version, replaced in Task 4), `lib/db/schema/auth.ts` (generated), `lib/db/schema/app.ts`, `lib/db/schema/index.ts`, `lib/db/migrations/` (generated), `scripts/migrate.ts`, `tests/helpers/db.ts`
- Test: `tests/integration/migrations.test.ts`

**Interfaces:**
- Consumes: `env()` from `lib/env.ts` (Task 1).
- Produces: `type Db = PgDatabase<PgQueryResultHKT, typeof schema>`, `createDb(pool: Pool): Db`, `getDb(): Db` (memoized) from `lib/db/client.ts`. Schema tables `user`, `session`, `account`, `verification`, `rateLimit` (from the generated `lib/db/schema/auth.ts`) and `profile` (from `lib/db/schema/app.ts`), all re-exported from `lib/db/schema/index.ts`. Test helpers `makeTestDb(): Promise<{ db: Db; close(): Promise<void> }>` and `createTestUser(db: Db, email: string): Promise<{ id: string; email: string }>` from `tests/helpers/db.ts`. Package scripts `db:generate`, `db:migrate`.

- [ ] **Step 1: Add the local Postgres service**

Create `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: jobsmith
    ports:
      - "5432:5432"
    volumes:
      - jobsmith-postgres-data:/var/lib/postgresql/data

volumes:
  jobsmith-postgres-data:
```

Start it and confirm it is healthy:

```bash
docker compose up -d
docker compose exec postgres pg_isready -U postgres
```

Expected: `/var/run/postgresql:5432 - accepting connections`

- [ ] **Step 2: Install the database and auth packages**

```bash
pnpm add better-auth drizzle-orm pg
pnpm add -D drizzle-kit @electric-sql/pglite @types/pg tsx
```

- [ ] **Step 3: Allow the packages that need a native build step**

pnpm 11 refuses to run install scripts for dependencies it does not recognize, which blocks `drizzle-kit`'s `esbuild` dependency from installing its binary. Create `pnpm-workspace.yaml` (or add to it if create-next-app already wrote one for the package manager pin):

```yaml
allowBuilds:
  esbuild: true
  '@prisma/client': false
  better-sqlite3: false
  sharp: false
  unrs-resolver: false
```

```bash
rm -rf node_modules
pnpm install
```

Expected: installs without an `ERR_PNPM_IGNORED_BUILDS` error.

- [ ] **Step 4: Write the Drizzle client module**

Create `lib/db/client.ts`:

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

// Shared shape both the node-postgres driver (Neon, self-hosted Postgres) and
// the PGlite driver (tests) satisfy, so every lib/db function accepts either
// without depending on either driver's concrete type.
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export function createDb(pool: Pool): Db {
  return drizzle(pool, { schema });
}

let cached: Db | undefined;

export function getDb(): Db {
  if (!cached) {
    const pool = new Pool({ connectionString: env().DATABASE_URL });
    cached = createDb(pool);
  }
  return cached;
}
```

This references `./schema`, which does not exist yet; that is expected until Step 8.

- [ ] **Step 5: Write a minimal Better Auth config to drive schema generation**

Create `lib/auth/index.ts`:

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true },
  rateLimit: { enabled: true, storage: "database" },
  plugins: [nextCookies()],
});
```

This deliberately does not import `@/lib/db/client` or a schema yet: at this point neither exists, and the Better Auth CLI only needs a working adapter configuration to introspect, not the full application wiring. Task 4 replaces this file with the final version once the schema exists, with the real `window`, `max` and `customRules`; `storage: "database"` is enough on its own to make the CLI generate a rate-limit table below, regardless of what `enabled` ends up being at runtime.

- [ ] **Step 6: Generate the Drizzle schema for the auth tables**

```bash
mkdir -p lib/db/schema
pnpm dlx auth@latest generate --output lib/db/schema/auth.ts -y
```

Expected output ends with `🚀 Schema was generated successfully!` (an earlier `ERROR ... Drizzle schema mismatch` line, listing `user, session, account, verification, rateLimit` as missing, is expected noise: the CLI validates the empty adapter config before it generates the file, and generates it anyway). The CLI auto-detects `lib/auth/index.ts`; no `--config` flag is needed. Note: the CLI package is `auth`, not the older `@better-auth/cli`, which is deprecated and no longer published against a current version.

Confirm the generated file defines five tables named `user`, `session`, `account`, `verification` and `rateLimit` (the last one mapped to the SQL table `rate_limit`, with columns `id`, `key`, `count` and `lastRequest`, from the `storage: "database"` rate limiter configured in Step 5), and that `user.id` is:

```typescript
id: text("id").primaryKey(),
```

`user.id` is a `text` column generated by Better Auth's own id generator, not a native Postgres `uuid`. Every table in this codebase that references the auth user (starting with `profile` in Step 7) must use a matching `text` column, not `uuid`, even though every other table in the data model uses `uuid`.

- [ ] **Step 7: Write the `profile` table**

Create `lib/db/schema/app.ts`:

```typescript
import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const profile = pgTable("profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  headline: text("headline"),
  resumeMd: text("resume_md"),
  preferences: jsonb("preferences").notNull().default({}),
  timezone: text("timezone").notNull().default("UTC"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

- [ ] **Step 8: Re-export the combined schema**

Create `lib/db/schema/index.ts`:

```typescript
export * from "./auth";
export * from "./app";
```

- [ ] **Step 9: Update the Better Auth config to use the real database client and schema**

Replace the contents of `lib/auth/index.ts`:

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(getDb(), { provider: "pg", schema }),
  emailAndPassword: { enabled: true },
  plugins: [nextCookies()],
});
```

- [ ] **Step 10: Write the drizzle-kit config**

Create `drizzle.config.ts`:

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema/index.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/jobsmith",
  },
});
```

- [ ] **Step 11: Generate the migration and add the `db:generate` script**

Add to `package.json` `scripts`:

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate"
  }
}
```

```bash
pnpm db:generate
```

Expected output includes:

```
6 tables
account 13 columns 1 indexes 1 fks
rate_limit 4 columns 0 indexes 0 fks
session 8 columns 1 indexes 1 fks
user 7 columns 0 indexes 0 fks
verification 6 columns 1 indexes 0 fks
profile 7 columns 0 indexes 1 fks

[✓] Your SQL migration file ➜ lib/db/migrations/0000_<name>.sql
```

- [ ] **Step 12: Write the migration runner and the `db:migrate` script**

Create `scripts/migrate.ts`:

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import path from "node:path";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to run migrations");
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  try {
    await migrate(db, {
      migrationsFolder: path.resolve(import.meta.dirname, "../lib/db/migrations"),
    });
    console.log("Migrations applied");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Add to `package.json` `scripts`:

```json
{
  "scripts": {
    "db:migrate": "tsx scripts/migrate.ts"
  }
}
```

Run it against the local database and confirm the tables land:

```bash
pnpm db:migrate
docker compose exec postgres psql -U postgres -d jobsmith -c "\dt"
```

Expected: `Migrations applied`, then a table listing showing `account`, `profile`, `rate_limit`, `session`, `user`, `verification`.

- [ ] **Step 13: Write the failing migration test**

Create `tests/helpers/db.ts`:

```typescript
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import * as schema from "@/lib/db/schema";
import type { Db } from "@/lib/db/client";

export async function makeTestDb(): Promise<{ db: Db; close(): Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, "../../lib/db/migrations"),
  });

  return {
    db,
    close: () => client.close(),
  };
}

export async function createTestUser(
  db: Db,
  email: string,
): Promise<{ id: string; email: string }> {
  const [row] = await db
    .insert(schema.user)
    .values({ id: crypto.randomUUID(), name: email, email, emailVerified: false })
    .returning({ id: schema.user.id, email: schema.user.email });
  return row;
}
```

Create `tests/integration/migrations.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import * as schema from "@/lib/db/schema";

describe("migrations", () => {
  it("apply cleanly on PGlite and create every expected table", async () => {
    const { db, close } = await makeTestDb();
    try {
      await expect(db.select().from(schema.user)).resolves.toEqual([]);
      await expect(db.select().from(schema.session)).resolves.toEqual([]);
      await expect(db.select().from(schema.account)).resolves.toEqual([]);
      await expect(db.select().from(schema.verification)).resolves.toEqual([]);
      await expect(db.select().from(schema.profile)).resolves.toEqual([]);
      await expect(db.select().from(schema.rateLimit)).resolves.toEqual([]);
    } finally {
      await close();
    }
  });

  it("creates a test user through the shared helper", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "reviewer@example.com");
      expect(user.email).toBe("reviewer@example.com");
    } finally {
      await close();
    }
  });
});
```

This test does not fail for a missing module (the helper and schema already exist by this step); it is the first real exercise of the migrations against PGlite. Run it once to see it pass, per Step 14: there is no meaningful "red" state to check here because the code under test (the generated SQL migration) was written by a tool in Step 11, not by hand in this step. Proceed straight to running it.

- [ ] **Step 14: Run the migration test**

```bash
pnpm test tests/integration/migrations.test.ts
```

Expected: `Test Files 1 passed (1)`, `Tests 2 passed (2)`.

- [ ] **Step 15: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add Postgres client, Better Auth schema and migrations

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Sign-up gate, session helper and session policy

**Files:**
- Create: `lib/auth/signup-gate.ts`, `lib/auth/users.ts`, `lib/auth/first-run.ts`, `lib/auth/policy.ts`, `lib/auth/session.ts`, `lib/auth/client.ts`, `app/api/auth/[...all]/route.ts`
- Modify: `lib/auth/index.ts`
- Test: `tests/unit/signup-gate.test.ts`, `tests/unit/policy.test.ts`, `tests/integration/users.test.ts`

**Interfaces:**
- Consumes: `Db`, `getDb()` (Task 3), `env()` (Task 1), `makeTestDb`, `createTestUser` (Task 3).
- Produces: `signUpAllowed(userCount: number, allowSignup: boolean): boolean`, `countUsers(db: Db): Promise<number>`, `isFirstRun(): Promise<boolean>`, `sessionPolicy: { expiresInDays: number; refreshAfterDays: number }`, `MIN_PASSWORD_LENGTH: number`, `signInMaxPerMinute(source?: Record<string, string | undefined>): number` (default 5, read from `AUTH_SIGNIN_MAX_PER_MINUTE`), `getUser()`, `requireUser()`, `authClient`/`signIn`/`signUp`/`signOut`/`useSession`, and the final `auth` instance with the sign-up gate, trusted origins and the login rate limit wired in.

- [ ] **Step 1: Write the failing test for the pure sign-up gate**

Create `tests/unit/signup-gate.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { signUpAllowed } from "@/lib/auth/signup-gate";

describe("signUpAllowed", () => {
  it("allows sign-up when there are no users yet, regardless of the flag", () => {
    expect(signUpAllowed(0, false)).toBe(true);
    expect(signUpAllowed(0, true)).toBe(true);
  });

  it("blocks sign-up once a user exists and the flag is off", () => {
    expect(signUpAllowed(1, false)).toBe(false);
  });

  it("allows sign-up once a user exists if the flag is on", () => {
    expect(signUpAllowed(1, true)).toBe(true);
    expect(signUpAllowed(5, true)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
pnpm test tests/unit/signup-gate.test.ts
```

Expected: fails with `Cannot find module '@/lib/auth/signup-gate'`.

- [ ] **Step 3: Implement the gate**

Create `lib/auth/signup-gate.ts`:

```typescript
export function signUpAllowed(userCount: number, allowSignup: boolean): boolean {
  return userCount === 0 || allowSignup;
}
```

- [ ] **Step 4: Run it and confirm it passes**

```bash
pnpm test tests/unit/signup-gate.test.ts
```

Expected: `Tests 3 passed (3)`.

- [ ] **Step 5: Write the failing integration test for countUsers**

Create `tests/integration/users.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { countUsers } from "@/lib/auth/users";

describe("countUsers", () => {
  it("counts zero users on a fresh database", async () => {
    const { db, close } = await makeTestDb();
    try {
      expect(await countUsers(db)).toBe(0);
    } finally {
      await close();
    }
  });

  it("counts users after they are created", async () => {
    const { db, close } = await makeTestDb();
    try {
      await createTestUser(db, "one@example.com");
      await createTestUser(db, "two@example.com");
      expect(await countUsers(db)).toBe(2);
    } finally {
      await close();
    }
  });
});
```

- [ ] **Step 6: Run it and confirm it fails**

```bash
pnpm test tests/integration/users.test.ts
```

Expected: fails with `Cannot find module '@/lib/auth/users'`.

- [ ] **Step 7: Implement countUsers**

Create `lib/auth/users.ts`:

```typescript
import { count } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import type { Db } from "@/lib/db/client";

export async function countUsers(db: Db): Promise<number> {
  const [row] = await db.select({ value: count() }).from(schema.user);
  return row?.value ?? 0;
}
```

- [ ] **Step 8: Run it and confirm it passes**

```bash
pnpm test tests/integration/users.test.ts
```

Expected: `Tests 2 passed (2)`.

- [ ] **Step 9: Add isFirstRun**

Create `lib/auth/first-run.ts`:

```typescript
import { getDb } from "@/lib/db/client";
import { countUsers } from "./users";

export async function isFirstRun(): Promise<boolean> {
  const count = await countUsers(getDb());
  return count === 0;
}
```

This has no dedicated test: it is a two-line composition of `getDb()` and `countUsers()`, both already tested, and it needs a live database connection to exercise, which is what the end-to-end suite (Task 8) and the pages that call it (Task 6) do.

- [ ] **Step 10: OWNER INPUT: session policy trade-off**

Job-search data is sensitive: people search while employed and do not want a session that a shared or work computer keeps alive indefinitely. Against that, the owner opens Jobsmith daily from a phone and re-typing a password every session is friction he will feel immediately. Longer sessions with a shorter silent-refresh window are a reasonable middle point: the cookie lasts weeks, but it re-issues itself only if used within the last day, so an abandoned laptop's session goes cold quickly.

Defaults, used unless changed:

```typescript
export const sessionPolicy = {
  expiresInDays: 30,
  refreshAfterDays: 1,
};

export const MIN_PASSWORD_LENGTH = 12;
```

The executor pauses here. If the owner has a preference for `expiresInDays`, `refreshAfterDays` or `MIN_PASSWORD_LENGTH`, edit `lib/auth/policy.ts` in Step 11 before continuing; otherwise continue with the defaults above.

- [ ] **Step 11: Write the policy constants and the sign-in limit, test first**

The sign-in limit is 5 attempts per minute per client. It is read from `AUTH_SIGNIN_MAX_PER_MINUTE` so the end-to-end suite and CI can raise it: every browser project in that suite logs in from the same address, and its six sign-ins in one run would trip the default limit of five against itself, before any retry.

Create `tests/unit/policy.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { signInMaxPerMinute } from "@/lib/auth/policy";

describe("signInMaxPerMinute", () => {
  it("defaults to 5 when the variable is absent", () => {
    expect(signInMaxPerMinute({})).toBe(5);
  });

  it("uses a whole number of 1 or more", () => {
    expect(signInMaxPerMinute({ AUTH_SIGNIN_MAX_PER_MINUTE: "1" })).toBe(1);
    expect(signInMaxPerMinute({ AUTH_SIGNIN_MAX_PER_MINUTE: "1000" })).toBe(1000);
  });

  it("falls back to 5 for anything else", () => {
    for (const value of ["0", "-3", "2.5", "many", ""]) {
      expect(signInMaxPerMinute({ AUTH_SIGNIN_MAX_PER_MINUTE: value })).toBe(5);
    }
  });
});
```

```bash
pnpm test tests/unit/policy.test.ts
```

Expected: fails with `Cannot find module '@/lib/auth/policy'`.

Create `lib/auth/policy.ts`:

```typescript
export const sessionPolicy = {
  expiresInDays: 30,
  refreshAfterDays: 1,
};

export const MIN_PASSWORD_LENGTH = 12;

const DEFAULT_SIGNIN_MAX_PER_MINUTE = 5;

export function signInMaxPerMinute(
  source: Record<string, string | undefined> = process.env,
): number {
  const raw = source.AUTH_SIGNIN_MAX_PER_MINUTE;
  if (!raw) return DEFAULT_SIGNIN_MAX_PER_MINUTE;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 ? value : DEFAULT_SIGNIN_MAX_PER_MINUTE;
}
```

```bash
pnpm test tests/unit/policy.test.ts
```

Expected: `Tests 3 passed (3)`.

Add to `.env.example`:

```bash
# Sign-in attempts allowed per minute per client. Leave unset for the default
# of 5. The end-to-end suite sets a high value, because all of its browsers
# log in from the same address.
# AUTH_SIGNIN_MAX_PER_MINUTE=5
```

- [ ] **Step 12: Replace `lib/auth/index.ts` with the final configuration**

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { env } from "@/lib/env";
import { countUsers } from "./users";
import { signUpAllowed } from "./signup-gate";
import { sessionPolicy, MIN_PASSWORD_LENGTH, signInMaxPerMinute } from "./policy";

export const auth = betterAuth({
  database: drizzleAdapter(getDb(), { provider: "pg", schema }),
  baseURL: env().APP_URL,
  trustedOrigins: env().TRUSTED_ORIGINS,
  secret: env().BETTER_AUTH_SECRET,
  emailAndPassword: { enabled: true, minPasswordLength: MIN_PASSWORD_LENGTH },
  session: {
    expiresIn: sessionPolicy.expiresInDays * 24 * 60 * 60,
    updateAge: sessionPolicy.refreshAfterDays * 24 * 60 * 60,
  },
  rateLimit: {
    // True everywhere this app runs. Next compiles NODE_ENV into a build as
    // "production", so the server the end-to-end suite starts is limited too;
    // that suite raises AUTH_SIGNIN_MAX_PER_MINUTE instead (playwright.config.ts).
    enabled: process.env.NODE_ENV !== "test",
    storage: "database",
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/email": { window: 60, max: signInMaxPerMinute() },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;
      const userCount = await countUsers(getDb());
      if (!signUpAllowed(userCount, env().ALLOW_SIGNUP)) {
        throw new APIError("FORBIDDEN", { message: "Sign-up is closed." });
      }
    }),
  },
  plugins: [nextCookies()],
});
```

`hooks.before` runs on every request to the auth handler; the early `return` on any path other than `/sign-up/email` keeps it a no-op for sign-in, session checks and everything else. `createAuthMiddleware` and `APIError` come from `better-auth/api`.

`trustedOrigins` accepts a plain `string[]`, so `env().TRUSTED_ORIGINS` (Task 1) is enough on its own; Better Auth rejects any request whose `Origin` header does not match one of these, which is what makes a preview deployment's own URL work without a fixed `APP_URL`. `rateLimit` accepts `enabled`, `storage`, `window`, `max` and `customRules` directly on the top-level option (confirmed against the installed `better-auth@1.7.5` types in `node_modules/better-auth/dist/types/index.d.mts`, re-exported from `@better-auth/core`): `storage: "database"` uses the `rateLimit` table from Task 3 instead of memory, so every server instance behind a load balancer shares the same counters; the general rule allows 60 requests per 60 seconds, and `customRules["/sign-in/email"]` overrides that to 5 per 60 seconds for sign-in specifically (Better Auth also ships a built-in default of 3 requests per 10 seconds for every path starting with `/sign-in`, `/sign-up`, `/change-password` or `/change-email`, which this custom rule replaces for the exact path `/sign-in/email` only).

`enabled` is set explicitly because Better Auth's own default is production only (`enabled: options.rateLimit?.enabled ?? isProduction` in `node_modules/better-auth/dist/context/create-context.mjs`), which would leave `pnpm dev` unlimited and Step 18 impossible to verify. `process.env.NODE_ENV !== "test"` is `true` everywhere this app runs. It is `false` only for code that Vitest loads, and no test in this milestone imports the auth instance: its importers are the route handler, `lib/auth/session.ts`, the two server-action files and `scripts/seed.ts`. It cannot be switched at run time on a Next.js server either. Next compiles `process.env.NODE_ENV` into the server bundle as the literal `"production"` (`node_modules/next/dist/build/define-env.js`), so a server started with `pnpm build && pnpm start` has the limiter on even with `NODE_ENV=test` exported, and Playwright never sets `NODE_ENV` for the server it starts. Confirmed against the installed versions: a production build carrying this exact expression, built and started with `NODE_ENV=test` exported, evaluated `process.env.NODE_ENV` to `production` inside a route handler while the process's real environment held `test`, and answered five `POST /api/auth/sign-up/email` requests in a row with `200 200 200 429 429`.

So the end-to-end server in Task 8 runs with the limiter on, and that suite stays under the limits by construction. Creating the account and signing out are server actions that call `auth.api.*`, which the limiter never sees: its only caller is the HTTP router's `onRequest` (`node_modules/better-auth/dist/api/index.mjs`). Signing in is the one call that goes over HTTP, and Task 8 raises its limit for the server it starts through `AUTH_SIGNIN_MAX_PER_MINUTE`. `lib/auth/policy.ts` reads that variable when the server process loads the module, so setting it on `pnpm start` alone is enough.

Read each limit as attempts per burst. Better Auth measures a window from the last allowed request (the `consume` functions in `node_modules/better-auth/dist/api/rate-limiter/index.mjs`, for database and memory storage alike), so a counter resets once that path has been quiet for a full window from that client. Five sign-ins spaced 30 seconds apart use up the limit just as five in one second do, and the sixth is refused until 60 quiet seconds have passed.

- [ ] **Step 13: Write the Next.js route handler**

Create `app/api/auth/[...all]/route.ts`:

```typescript
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
```

- [ ] **Step 14: Write the session helper**

Create `lib/auth/session.ts`:

```typescript
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./index";

export async function getUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export async function requireUser() {
  const user = await getUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
```

- [ ] **Step 15: Write the client-side auth bindings**

Create `lib/auth/client.ts`:

```typescript
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
```

No `baseURL` option is passed. When `createAuthClient` gets none, it resolves the auth handler's path against the page's own origin (confirmed against the installed `better-auth@1.7.5` types and `node_modules/better-auth/dist/client/config.mjs`, which falls back to the relative path `/api/auth` when no `baseURL` is configured), so the browser always calls same-origin, on `localhost`, on any preview URL and on production alike. This is also why no `NEXT_PUBLIC_APP_URL` variable exists anywhere in this plan: the client never needs the server's own idea of its URL.

- [ ] **Step 16: Confirm the whole project typechecks and builds**

```bash
pnpm typecheck
DATABASE_URL="postgres://postgres:postgres@localhost:5432/jobsmith" BETTER_AUTH_SECRET="$(openssl rand -base64 32)" APP_URL="http://localhost:3000" pnpm build
```

Expected: both succeed. The build output lists `ƒ /api/auth/[...all]` as a dynamic route.

- [ ] **Step 17: Manually verify the sign-up gate against the local database**

With `docker compose up -d` running and migrated (Task 3):

```bash
DATABASE_URL="postgres://postgres:postgres@localhost:5432/jobsmith" BETTER_AUTH_SECRET="$(openssl rand -base64 32)" APP_URL="http://localhost:3000" pnpm dev &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@example.com","password":"correct horse battery staple","name":"Owner"}'
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"second@example.com","password":"correct horse battery staple","name":"Second"}'
kill %1
```

Expected: the first request prints `200`, the second prints `403`.

- [ ] **Step 18: Manually verify trusted origins and the login rate limit against the local database**

With the same dev server and the `owner@example.com` account from Step 17:

```bash
DATABASE_URL="postgres://postgres:postgres@localhost:5432/jobsmith" BETTER_AUTH_SECRET="$(openssl rand -base64 32)" APP_URL="http://localhost:3000" pnpm dev &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" -H "Origin: http://localhost:3000" \
  -d '{"email":"owner@example.com","password":"correct horse battery staple"}'
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" -H "Origin: http://evil.example.com" \
  -d '{"email":"owner@example.com","password":"correct horse battery staple"}'
kill %1
```

Expected: the first request (its `Origin` matches `APP_URL`, which is `TRUSTED_ORIGINS`' only entry here) prints `200`; the second (an origin never in `TRUSTED_ORIGINS`) prints `403`, since Better Auth rejects it before checking the password at all.

Rate limiting shares state in the `rate_limit` table, so reset it before driving the limit on its own:

```bash
docker compose exec postgres psql -U postgres -d jobsmith -c "TRUNCATE rate_limit;"
DATABASE_URL="postgres://postgres:postgres@localhost:5432/jobsmith" BETTER_AUTH_SECRET="$(openssl rand -base64 32)" APP_URL="http://localhost:3000" pnpm dev &
sleep 3
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/auth/sign-in/email \
    -H "Content-Type: application/json" -H "Origin: http://localhost:3000" \
    -d '{"email":"owner@example.com","password":"wrong password"}'
done
kill %1
```

Expected: the first five requests print `401` (wrong password, but under the limit), the sixth prints `429`. The `customRules` entry for `/sign-in/email` in `lib/auth/index.ts` limits that path to 5 requests per 60 seconds regardless of whether the credentials are correct, since the limiter runs before the credentials are even checked.

- [ ] **Step 19: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: wire up the sign-up gate, session helper, trusted origins and login rate limit

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Scoped query helper and tenant isolation

**Files:**
- Create: `lib/db/scoped.ts`
- Modify: `eslint.config.mjs`
- Test: `tests/integration/scoped.test.ts`

**Interfaces:**
- Consumes: `Db`, `makeTestDb`, `createTestUser` (Task 3), `schema.profile` (Task 3).
- Produces: `type ProfileFields = Omit<typeof schema.profile.$inferInsert, "userId" | "createdAt" | "updatedAt">`, `scoped(db: Db, userId: string): { profile: { get(): Promise<ProfileRow | null>; upsert(values: Partial<ProfileFields>): Promise<ProfileRow> } }`, `scopedFor(userId: string)` (same return shape as `scoped`, using `getDb()` internally), and the ESLint rule that keeps `@/lib/db/client` out of `app/` and `components/`. App code uses `scopedFor(userId)`; tests and scripts use `scoped(db, userId)` with an explicit `db` handle.

- [ ] **Step 1: Write the failing isolation test**

Create `tests/integration/scoped.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";

describe("scoped profile isolation", () => {
  it("prevents one user from reading or overwriting another user's profile", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice@example.com");
      const bob = await createTestUser(db, "bob@example.com");

      await scoped(db, alice.id).profile.upsert({ headline: "Alice's headline" });
      await scoped(db, bob.id).profile.upsert({ headline: "Bob's headline" });

      expect((await scoped(db, alice.id).profile.get())?.headline).toBe("Alice's headline");
      expect((await scoped(db, bob.id).profile.get())?.headline).toBe("Bob's headline");

      await scoped(db, bob.id).profile.upsert({ headline: "Bob overwrites" });

      expect((await scoped(db, alice.id).profile.get())?.headline).toBe("Alice's headline");
    } finally {
      await close();
    }
  });

  it("ignores a userId smuggled inside values, so a caller cannot write another user's row", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice2@example.com");
      const bob = await createTestUser(db, "bob2@example.com");

      await scoped(db, bob.id).profile.upsert({ headline: "Bob's original headline" });

      // Alice tries to smuggle Bob's userId inside the values object. The
      // type system blocks this (ProfileFields excludes userId), so the
      // attack has to go through `as never` to compile at all.
      await scoped(db, alice.id).profile.upsert({
        userId: bob.id,
        headline: "Alice overwrote Bob",
      } as never);

      const bobProfile = await scoped(db, bob.id).profile.get();
      const aliceProfile = await scoped(db, alice.id).profile.get();

      expect(bobProfile?.headline).toBe("Bob's original headline");
      expect(aliceProfile?.headline).toBe("Alice overwrote Bob");
    } finally {
      await close();
    }
  });

  it("creates a profile row with column defaults when called with no fields", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner@example.com");
      const row = await scoped(db, user.id).profile.upsert({});
      expect(row.userId).toBe(user.id);
      expect(row.timezone).toBe("UTC");
      expect(row.preferences).toEqual({});
    } finally {
      await close();
    }
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
pnpm test tests/integration/scoped.test.ts
```

Expected: fails with `Cannot find module '@/lib/db/scoped'`.

- [ ] **Step 3: Implement the scoped helper**

Create `lib/db/scoped.ts`:

```typescript
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import type { Db } from "./client";
import { getDb } from "./client";

export type ProfileFields = Omit<
  typeof schema.profile.$inferInsert,
  "userId" | "createdAt" | "updatedAt"
>;

function stripScopedKeys<T extends object>(
  values: T,
): Omit<T, "userId" | "createdAt" | "updatedAt"> {
  const clone = { ...values } as Record<string, unknown>;
  delete clone.userId;
  delete clone.createdAt;
  delete clone.updatedAt;
  return clone as Omit<T, "userId" | "createdAt" | "updatedAt">;
}

export function scoped(db: Db, userId: string) {
  return {
    profile: {
      async get() {
        const [row] = await db
          .select()
          .from(schema.profile)
          .where(eq(schema.profile.userId, userId));
        return row ?? null;
      },
      async upsert(values: Partial<ProfileFields>) {
        const fields = stripScopedKeys(values);
        const [row] = await db
          .insert(schema.profile)
          .values({ ...fields, userId })
          .onConflictDoUpdate({
            target: schema.profile.userId,
            // `set` must never be empty (drizzle throws "No values to set"
            // if it is), and every update should bump updatedAt regardless
            // of which fields actually changed.
            set: { ...fields, updatedAt: new Date() },
          })
          .returning();
        return row;
      },
    },
  };
}

export function scopedFor(userId: string) {
  return scoped(getDb(), userId);
}
```

`ProfileFields` excludes `userId`, `createdAt` and `updatedAt` from the accepted input, so a caller who tries `upsert({ userId: someoneElsesId, ... })` gets a type error instead of a silent tenant-boundary bypass. `stripScopedKeys` is the runtime backstop for the same rule: a value smuggled past the type system with a cast (for example `as never`, the way the isolation test above does it deliberately) is deleted before it reaches either the `.values()` or the `set` clause, and `userId` is added back exactly once, last, in `.values({ ...fields, userId })`, so nothing that arrived through `values` can ever win over the scoped id. `scopedFor` is the entry point app code uses (`Task 6`): it closes over `getDb()` so `app/` and `components/` never need to obtain a `Db` handle themselves, which is what the ESLint rule below enforces. It has no dedicated test: it is a one-line composition of two already-tested functions (`scoped`, `getDb`), the same reasoning `lib/auth/first-run.ts` uses in Task 4.

- [ ] **Step 4: Run it and confirm it passes**

```bash
pnpm test tests/integration/scoped.test.ts
```

Expected: `Tests 3 passed (3)`.

- [ ] **Step 5: Add the deliberate ESLint violation**

Create a throwaway file to prove the rule fires before it exists, `app/_eslint-violation-check.ts`, importing the client once through the alias and once through a relative path, so Step 8 below can confirm the rule catches both:

```typescript
import { getDb as getDbByAlias } from "@/lib/db/client";
import { getDb as getDbByRelative } from "../lib/db/client";

export function violatingUsageByAlias() {
  return getDbByAlias();
}

export function violatingUsageByRelative() {
  return getDbByRelative();
}
```

- [ ] **Step 6: Run ESLint and confirm it does not yet flag the violation**

```bash
pnpm exec eslint app/_eslint-violation-check.ts
```

Expected: exits 0 (no rule exists yet to catch this).

- [ ] **Step 7: Add the no-restricted-imports rule**

Open `eslint.config.mjs`. It currently looks like this (as create-next-app wrote it):

```javascript
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
```

Add a new config object before the `globalIgnores` entry:

```javascript
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/db/client", "**/lib/db/client", "**/db/client"],
              message:
                "app/ and components/ must not import the database client directly. Use the scoped helper from @/lib/db/scoped.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
```

A `group` pattern only matches the exact specifier text a file imports, not the module it resolves to, so `"@/lib/db/client"` alone catches the alias import but lets the same file back in through `"../lib/db/client"` or `"../../db/client"`. `"**/lib/db/client"` and `"**/db/client"` close that gap by matching any relative path ending in `lib/db/client` or `db/client`, however many `../` segments precede it.

- [ ] **Step 8: Run ESLint and confirm the violation is now caught**

```bash
pnpm exec eslint app/_eslint-violation-check.ts
```

Expected: exits 1 with two `no-restricted-imports` errors, one per import style:

```
app/_eslint-violation-check.ts
  1:1  error  '@/lib/db/client' import is restricted from being used by a pattern. app/ and components/ must not import the database client directly. Use the scoped helper from @/lib/db/scoped   no-restricted-imports
  2:1  error  '../lib/db/client' import is restricted from being used by a pattern. app/ and components/ must not import the database client directly. Use the scoped helper from @/lib/db/scoped  no-restricted-imports

✖ 2 problems (2 errors, 0 warnings)
```

- [ ] **Step 9: Remove the violation and confirm the whole project is clean**

```bash
rm app/_eslint-violation-check.ts
pnpm lint
```

Expected: exits 0.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add the scoped query helper and the tenant-boundary lint rule

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Setup, login and logout pages with route protection

**Files:**
- Create: `app/(auth)/setup/page.tsx`, `app/(auth)/setup/actions.ts`, `app/(auth)/setup/setup-form.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/login/login-form.tsx`, `lib/auth/return-to.ts`, `app/(app)/layout.tsx`, `app/(app)/actions.ts`, `app/(app)/page.tsx` (temporary stub, replaced in Task 7), `app/(app)/board/page.tsx` (temporary stub, replaced in Task 7), `proxy.ts`
- Modify: delete `app/page.tsx`
- Test: `tests/unit/return-to.test.ts`; the routes themselves are verified with `pnpm build` in Step 12 and the dev server plus curl in Step 13

**Interfaces:**
- Consumes: `isFirstRun()` (Task 4), `auth.api.signUpEmail` / `auth.api.signOut` (Task 4), `signIn` from `lib/auth/client.ts` (Task 4), `scopedFor()` (Task 5), `requireUser()` (Task 4), `getSessionCookie` from `better-auth/cookies`, `Button`/`Input`/`Label`/`Card` (Task 2's shadcn install).
- Produces: `safeReturnTo(value: string | null | undefined): string` from `lib/auth/return-to.ts`, the routes `/setup`, `/login`, `/`, `/board`, and the `logout()` server action, all of which Task 7 builds on without changing their auth behavior.

Login and setup use base-nova `Card`, not the Super AI Components registry's `auth-shell`. `auth-shell`'s only local sign-in path is a single email field that calls `onEmailSubmit(email)`, a passwordless/magic-link shape with no password input anywhere in the block, while Core's spec (5.10) is email-and-password. Fitting a password field in would mean replacing almost everything the block renders (its provider rows, its email region, its legal footer), so it does not fit without edits and is left out; `Card` carries the same two forms with no such mismatch.

The only logic in this task with its own unit test is the return-path guard in Step 6. Everything else is route wiring composed from already-tested pieces (`isFirstRun`, `scopedFor`, `auth.api.*`), and the automated coverage that actually drives a browser through these routes is the Playwright suite in Task 8, which does not exist yet. Each step below is instead verified with the dev server and `curl`, with an exact expected result, before moving on.

- [ ] **Step 1: Remove the design-system smoke check and note why**

```bash
rm app/page.tsx
```

Task 2 left a temporary `app/page.tsx` there to prove the copied tokens render on a real page. Home does not exist yet (Task 7 adds it under `app/(app)/`), so `/` has no page at all until then; unauthenticated visits still redirect to `/login` once `proxy.ts` exists (Step 8), because the redirect happens before Next.js resolves a route.

- [ ] **Step 2: Write the setup page**

Create `app/(auth)/setup/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { isFirstRun } from "@/lib/auth/first-run";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage(props: PageProps<"/setup">) {
  void props;
  if (!(await isFirstRun())) {
    notFound();
  }

  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create the first account</CardTitle>
          <CardDescription>
            This runs once. After this account exists, sign-up closes unless it
            is explicitly allowed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SetupForm />
        </CardContent>
      </Card>
    </main>
  );
}
```

`export const dynamic = "force-dynamic"` matters here: without it, Next.js tries to prerender this page once at build time (since it reads the database but calls neither `headers()` nor `cookies()` directly), which both fails the build when the database is unreachable at build time and, if it did succeed, would bake in a stale answer to "does a user exist yet" forever. `force-dynamic` makes every request re-run the check.

- [ ] **Step 3: Write the setup server action**

Create `app/(auth)/setup/actions.ts`:

```typescript
"use server";

import { redirect } from "next/navigation";
import { isFirstRun } from "@/lib/auth/first-run";
import { auth } from "@/lib/auth";
import { scopedFor } from "@/lib/db/scoped";

export type SetupState = { error: string } | undefined;

export async function setupAction(
  _state: SetupState,
  formData: FormData,
): Promise<SetupState> {
  if (!(await isFirstRun())) {
    redirect("/login");
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  let userId: string;
  try {
    const result = await auth.api.signUpEmail({ body: { email, password, name: email } });
    userId = result.user.id;
  } catch {
    return { error: "Could not create the account. Check the password length and try again." };
  }

  await scopedFor(userId).profile.upsert({});

  redirect("/board");
}
```

`auth.api.signUpEmail` sets the session cookie itself: the `nextCookies()` plugin configured in Task 4 reads the response headers Better Auth produces and applies them through Next's own `cookies()` API whenever `auth.api.*` runs inside a server action, so no manual cookie handling is needed here. This action calls `scopedFor(userId)` rather than `scoped(getDb(), userId)`: `getDb` lives behind `@/lib/db/client`, which the ESLint rule from Task 5 forbids importing anywhere under `app/`, so app code always goes through `scopedFor` and only `lib/`, `scripts/` and `tests/` code calls `scoped` with an explicit `db`.

- [ ] **Step 4: Write the setup form as a client component**

Create `app/(auth)/setup/setup-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setupAction, type SetupState } from "./actions";

export function SetupForm() {
  const [state, action, pending] = useActionState<SetupState, FormData>(setupAction, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
        />
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        Create account
      </Button>
    </form>
  );
}
```

- [ ] **Step 5: Write the login page**

Create `app/(auth)/login/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { isFirstRun } from "@/lib/auth/first-run";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  if (await isFirstRun()) {
    redirect("/setup");
  }

  const from = typeof searchParams.from === "string" ? searchParams.from : undefined;

  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Log in</CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm from={from} />
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 6: Write the return-path guard, test first**

After login the user returns to the page they asked for. That path arrives in the URL, so an attacker controls it: without a guard, a link such as `/login?from=//evil.example` would send a freshly signed-in user to another site. The guard accepts same-site paths only.

Create `tests/unit/return-to.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { safeReturnTo } from "@/lib/auth/return-to";

describe("safeReturnTo", () => {
  it("keeps a plain same-site path", () => {
    expect(safeReturnTo("/board")).toBe("/board");
    expect(safeReturnTo("/jobs/northwind-staff-designer?tab=prep")).toBe(
      "/jobs/northwind-staff-designer?tab=prep",
    );
  });

  it("falls back to /board when nothing usable is given", () => {
    expect(safeReturnTo(undefined)).toBe("/board");
    expect(safeReturnTo(null)).toBe("/board");
    expect(safeReturnTo("")).toBe("/board");
  });

  it("rejects anything that could leave the site or loop", () => {
    for (const value of [
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example",
      "https://evil.example",
      "javascript:alert(1)",
      "board",
      "/login",
      "/setup?x=1",
    ]) {
      expect(safeReturnTo(value)).toBe("/board");
    }
  });
});
```

```bash
pnpm test tests/unit/return-to.test.ts
```

Expected: fails with `Cannot find module '@/lib/auth/return-to'`.

Create `lib/auth/return-to.ts`:

```typescript
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
```

```bash
pnpm test tests/unit/return-to.test.ts
```

Expected: `Tests 3 passed (3)`.

- [ ] **Step 7: Write the login form as a client component**

The form signs in through the auth client, which posts to `/api/auth/sign-in/email`. That route goes through Better Auth's request pipeline, so the sign-in rate limit from Task 4 applies. A server action calling `auth.api.signInEmail` would skip that pipeline: Better Auth does not rate limit server-side `auth.api` calls, and login would be left without the limit that spec section 7 requires.

Create `app/(auth)/login/login-form.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/lib/auth/client";
import { safeReturnTo } from "@/lib/auth/return-to";

export function LoginForm({ from }: { from?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);

    const result = await signIn.email({
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });

    if (result.error) {
      setPending(false);
      setError(
        result.error.status === 429
          ? "Too many attempts. Wait a minute and try again."
          : "Wrong email or password.",
      );
      return;
    }

    router.push(safeReturnTo(from));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required autoComplete="current-password" />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        Log in
      </Button>
    </form>
  );
}
```

`safeReturnTo` runs in the browser here, and it is the only place the `from` value is used, so a tampered link can do no more than land the user on `/board`.

- [ ] **Step 8: Write the request-interception file**

Create `proxy.ts` in the project root (this Next.js major renamed the file and export from `middleware`/`middleware.ts` to `proxy`/`proxy.ts`; the old name is deprecated):

```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_PATHS = ["/login", "/setup"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/api/auth");
  if (isPublic) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

This is an optimistic check only (it reads a cookie's presence, not its validity), which is why every route it lets through still calls `requireUser()` itself.

- [ ] **Step 9: Write the authenticated layout**

Create `app/(app)/layout.tsx`:

```tsx
import { requireUser } from "@/lib/auth/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireUser();
  return <>{children}</>;
}
```

- [ ] **Step 10: Write the logout action**

Create `app/(app)/actions.ts`:

```typescript
"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export async function logout() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
```

- [ ] **Step 11: Write temporary stubs for Home and Board**

These prove the authenticated area works end to end; Task 7 replaces both files with the real shell, Home content and board columns.

Create `app/(app)/page.tsx`:

```tsx
import { requireUser } from "@/lib/auth/session";
import { logout } from "./actions";

export default async function HomePage(props: PageProps<"/">) {
  void props;
  const user = await requireUser();
  return (
    <main className="p-6">
      <p>Signed in as {user.email}</p>
      <form action={logout}>
        <button type="submit">Log out</button>
      </form>
    </main>
  );
}
```

Create `app/(app)/board/page.tsx`:

```tsx
import { requireUser } from "@/lib/auth/session";

export default async function BoardPage(props: PageProps<"/board">) {
  void props;
  await requireUser();
  return (
    <main className="p-6">
      <h1>Board</h1>
    </main>
  );
}
```

- [ ] **Step 12: Confirm the project builds**

```bash
DATABASE_URL="postgres://postgres:postgres@localhost:5432/jobsmith" BETTER_AUTH_SECRET="$(openssl rand -base64 32)" APP_URL="http://localhost:3000" pnpm build
```

Expected: build succeeds. The route list shows `ƒ /`, `ƒ /board`, `ƒ /login` and `ƒ /setup` as dynamic, and `ƒ Proxy (Middleware)`.

- [ ] **Step 13: Verify the redirect chain manually against the dev server**

With the local Postgres from Task 3 migrated and empty of users:

```bash
DATABASE_URL="postgres://postgres:postgres@localhost:5432/jobsmith" BETTER_AUTH_SECRET="$(openssl rand -base64 32)" APP_URL="http://localhost:3000" pnpm dev &
sleep 3
curl -s -D - -o /dev/null http://localhost:3000/board | head -3
curl -s -D - -o /dev/null http://localhost:3000/login | head -3
kill %1
```

Expected: the first command shows `HTTP/1.1 307 Temporary Redirect` with `location: /login?from=%2Fboard`; the second shows `HTTP/1.1 200 OK` (or a further redirect to `/setup` once you check the response body, since no user exists yet: `/login` is in `PUBLIC_PATHS`, so the proxy never redirects it, and the page's own `isFirstRun()` check sends it to `/setup` instead).

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add setup, login and logout pages with route protection

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: App shell with empty board

**Files:**
- Create: `lib/pipeline/kinds.ts`, `components/app-shell.tsx`, and everything the five `shadcn add` commands in Step 5 write: `components/ui/{separator,skeleton,tooltip,sheet,sidebar,badge,breadcrumb,button-group,dropdown-menu,radio-group}.tsx`, `components/super-ai/{app-sidebar,section-header,sidebar-nav,app-topbar,account-menu,kbd,data-views,kanban-view,kanban-column,table-view,feed-view,calendar-view,timeline-view,data-views-shared}.tsx`, `hooks/use-mobile.ts`, `lib/initials.tsx`, `lib/use-view-mode.tsx`
- Modify: `app/(app)/layout.tsx`, `app/(app)/page.tsx`, `app/(app)/board/page.tsx`, `hooks/use-mobile.ts` (one-line lint fix), `docs/design-system.md` (Local changes)
- Test: `tests/unit/kinds.test.ts`

**Interfaces:**
- Consumes: `requireUser()` (Task 4), `logout()` (Task 6), `Button`, `Card` and the token layer, including the `duration-*`/`ease-*` motion utilities (Task 2), `useTheme()` from `next-themes` (Task 2).
- Produces: `STAGE_KINDS: readonly { kind: string; columnTitle: string; defaultLabel: string }[]`, `type StageKind` from `lib/pipeline/kinds.ts`, `AppShell` from `components/app-shell.tsx`, and the final Home (`/`) and Board (`/board`) content that Task 8's end-to-end test drives.

The desktop shell is built from the Super AI Components registry's `app-sidebar`, `sidebar-nav`, `app-topbar` and `account-menu`, as verified: together they need no edits, add no npm dependency, and pick up the tokens from Task 2 automatically because they only use stock shadcn variable names. The seven board columns use the same registry's `kanban-column`, which already renders a titled, counted column and needs no edits either. The phone bottom tab bar is new code built from tokens only, because the registry has no mobile navigation item. shadcn's own `Sidebar` primitive (inside `app-sidebar`) already collapses to a closed slide-over below the `md` breakpoint on its own, so no extra hide/show wrapper is needed around it.

- [ ] **Step 1: Write the failing test for the stage kind list**

Create `tests/unit/kinds.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { STAGE_KINDS } from "@/lib/pipeline/kinds";

describe("STAGE_KINDS", () => {
  it("lists the seven kinds in board-column order", () => {
    expect(STAGE_KINDS.map((s) => s.kind)).toEqual([
      "saved",
      "applied",
      "recruiter_screen",
      "hiring_manager",
      "portfolio_case",
      "panel_final",
      "offer",
    ]);
  });

  it("has a unique kind for every entry", () => {
    const kinds = STAGE_KINDS.map((s) => s.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it("gives every entry a column title and a default label", () => {
    for (const entry of STAGE_KINDS) {
      expect(entry.columnTitle.length).toBeGreaterThan(0);
      expect(entry.defaultLabel.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
pnpm test tests/unit/kinds.test.ts
```

Expected: fails with `Cannot find module '@/lib/pipeline/kinds'`.

- [ ] **Step 3: Implement STAGE_KINDS**

Create `lib/pipeline/kinds.ts`:

```typescript
export const STAGE_KINDS = [
  { kind: "saved", columnTitle: "Saved", defaultLabel: "Saved" },
  { kind: "applied", columnTitle: "Applied", defaultLabel: "Applied" },
  { kind: "recruiter_screen", columnTitle: "Recruiter", defaultLabel: "Recruiter screen" },
  { kind: "hiring_manager", columnTitle: "Hiring manager", defaultLabel: "Hiring manager" },
  { kind: "portfolio_case", columnTitle: "Portfolio / case", defaultLabel: "Portfolio review" },
  { kind: "panel_final", columnTitle: "Panel / final", defaultLabel: "Panel" },
  { kind: "offer", columnTitle: "Offer", defaultLabel: "Offer" },
] as const satisfies readonly { kind: string; columnTitle: string; defaultLabel: string }[];

export type StageKind = (typeof STAGE_KINDS)[number]["kind"];
```

- [ ] **Step 4: Run it and confirm it passes**

```bash
pnpm test tests/unit/kinds.test.ts
```

Expected: `Tests 3 passed (3)`.

- [ ] **Step 5: Install the Super AI Components shell items**

```bash
pnpm dlx shadcn@latest add https://super-ai-components.vercel.app/r/app-sidebar.json -y
```

Expected output:

```
✔ Created 7 files:
  - components/ui/separator.tsx
  - components/ui/skeleton.tsx
  - components/ui/tooltip.tsx
  - hooks/use-mobile.ts
  - components/ui/sheet.tsx
  - components/ui/sidebar.tsx
  - components/super-ai/app-sidebar.tsx
ℹ Skipped 2 files: (files might be identical, use --overwrite to overwrite)
  - components/ui/button.tsx
  - components/ui/input.tsx
```

```bash
pnpm dlx shadcn@latest add https://super-ai-components.vercel.app/r/sidebar-nav.json -y
```

Expected output:

```
✔ Created 3 files:
  - components/ui/badge.tsx
  - components/super-ai/section-header.tsx
  - components/super-ai/sidebar-nav.tsx
```

```bash
pnpm dlx shadcn@latest add https://super-ai-components.vercel.app/r/app-topbar.json -y
```

Expected output:

```
✔ Created 3 files:
  - components/ui/breadcrumb.tsx
  - components/ui/button-group.tsx
  - components/super-ai/app-topbar.tsx
ℹ Skipped 3 files: (files might be identical, use --overwrite to overwrite)
  - components/ui/badge.tsx
  - components/ui/button.tsx
  - components/ui/separator.tsx
```

```bash
pnpm dlx shadcn@latest add https://super-ai-components.vercel.app/r/account-menu.json -y
```

Expected output:

```
✔ Created 5 files:
  - components/ui/dropdown-menu.tsx
  - components/ui/radio-group.tsx
  - lib/initials.tsx
  - components/super-ai/kbd.tsx
  - components/super-ai/account-menu.tsx
```

```bash
pnpm dlx shadcn@latest add https://super-ai-components.vercel.app/r/data-views.json -y
```

Expected output:

```
✔ Created 9 files:
  - lib/use-view-mode.tsx
  - components/super-ai/data-views.tsx
  - components/super-ai/kanban-view.tsx
  - components/super-ai/kanban-column.tsx
  - components/super-ai/table-view.tsx
  - components/super-ai/feed-view.tsx
  - components/super-ai/calendar-view.tsx
  - components/super-ai/timeline-view.tsx
  - components/super-ai/data-views-shared.tsx
ℹ Skipped 1 file: (files might be identical, use --overwrite to overwrite)
  - components/ui/button.tsx
```

None of the five add an npm dependency: `package.json` is unchanged, because every file above needs only `lucide-react`, already installed since Task 2. `data-views` installs a five-view switcher (kanban, table, feed, calendar, timeline) as one bundle, because the registry has no standalone `kanban-column` item, but this milestone imports only `KanbanColumn` directly; the rest sit ready for a later milestone's board. The registry's `auth-shell` is not installed here; Task 6 already found it does not fit Core's email-and-password login.

```bash
pnpm typecheck
DATABASE_URL="postgres://postgres:postgres@localhost:5432/jobsmith" BETTER_AUTH_SECRET="$(openssl rand -base64 32)" APP_URL="http://localhost:3000" pnpm build
```

Expected: both succeed, same route list as Task 6.

- [ ] **Step 6: Fix the vendored mobile-breakpoint hook's lint violation**

```bash
pnpm lint
```

Expected: fails. `hooks/use-mobile.ts` (installed by Step 5 as a dependency of `sidebar`, and identical to stock shadcn's own hook) calls `setIsMobile(...)` synchronously inside a `useEffect` with no guard, which trips `react-hooks/set-state-in-effect` under this Next.js version's ESLint config:

```
Error: Calling setState synchronously within an effect can trigger cascading renders
hooks/use-mobile.ts:14:5
react-hooks/set-state-in-effect
```

In `hooks/use-mobile.ts`, change:

```typescript
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
```

to:

```typescript
    mql.addEventListener("change", onChange)
    // The initial value needs window.innerWidth, which only exists
    // client-side; there is no server-renderable way to know it before this
    // effect runs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
```

```bash
pnpm lint
```

Expected: exits 0.

In `docs/design-system.md`, replace the `## Local changes` section:

```markdown
## Local changes

- `hooks/use-mobile.ts` (Super AI Components, a dependency of `sidebar`): added one `eslint-disable-next-line react-hooks/set-state-in-effect` on the initial `setIsMobile` call, because the initial value needs `window.innerWidth`, which is only known once this effect runs client-side. No other change; safe to re-apply after a re-sync.
```

- [ ] **Step 7: Write the app shell component**

Create `components/app-shell.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useState } from "react";

import { AppSidebar } from "@/components/super-ai/app-sidebar";
import { SidebarNav } from "@/components/super-ai/sidebar-nav";
import { AppTopbar } from "@/components/super-ai/app-topbar";
import { AccountMenu } from "@/components/super-ai/account-menu";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

const NAV_ITEMS = [
  { id: "home", label: "Home", href: "/" },
  { id: "board", label: "Board", href: "/board" },
];

export function AppShell({
  email,
  onSignOut,
  children,
}: {
  email: string;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const activeId = NAV_ITEMS.find((item) => item.href === pathname)?.id;
  const { theme, setTheme } = useTheme();
  const [background, setBackground] = useState("default");

  return (
    <SidebarProvider>
      <AppSidebar
        nav={
          <SidebarNav
            sections={[{ label: "Jobsmith", items: NAV_ITEMS }]}
            activeId={activeId}
          />
        }
        footer={
          <AccountMenu
            user={{ name: email, email }}
            theme={theme ?? "system"}
            onThemeChange={setTheme}
            background={background}
            onBackgroundChange={setBackground}
            onSignOut={onSignOut}
          />
        }
      />

      <SidebarInset>
        <AppTopbar context="document" title="Jobsmith" />
        {/* SidebarInset already renders <main data-slot="sidebar-inset">, so
            this is a div: a nested <main> reads as a second, indistinguishable
            top-level landmark (axe landmark-unique / landmark-no-duplicate-main,
            found and fixed while building the end-to-end axe suite in Task 8). */}
        <div className="flex-1 pb-16 md:pb-0">{children}</div>
      </SidebarInset>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 flex items-center justify-around border-t border-border bg-surface-sidebar py-2 md:hidden"
      >
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            aria-current={item.href === pathname ? "page" : undefined}
            className="rounded-md px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </SidebarProvider>
  );
}
```

`AppSidebar` needs no explicit responsive wrapper: `Sidebar` (which it renders) already switches itself, below the `md` breakpoint, to a closed Base UI `Sheet` that mounts no content until opened (this repo never renders a trigger for it), so at a phone width the `SidebarNav` landmark is absent from the DOM rather than merely hidden, and the bottom tab bar (new code, `md:hidden` on itself) is the only navigation landmark visible. `AccountMenu` ships its own Appearance submenu (a theme radio bound to `useTheme()`, plus five decorative background swatches held in local state, not persisted); that is the one person-facing theme control in Core, matching the constraint that light and dark otherwise just follow the system setting.

- [ ] **Step 8: Wire the shell into the authenticated layout**

Replace `app/(app)/layout.tsx` in full:

```tsx
import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/app-shell";
import { logout } from "./actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <AppShell email={user.email} onSignOut={logout}>
      {children}
    </AppShell>
  );
}
```

Passing the `logout` server action as `onSignOut` works the same way `<form action={logout}>` did in Task 6: `AccountMenu`'s "Sign out" item calls it from a plain `onClick`, which Next.js server actions support directly, not only from a form's `action` prop.

- [ ] **Step 9: Replace the Home stub**

Replace `app/(app)/page.tsx` in full:

```tsx
import { requireUser } from "@/lib/auth/session";

export default async function HomePage(props: PageProps<"/">) {
  void props;
  await requireUser();
  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold">Home</h1>
      <p className="mt-2 text-muted-foreground">Nothing needs attention yet.</p>
    </div>
  );
}
```

- [ ] **Step 10: Replace the Board stub**

Replace `app/(app)/board/page.tsx` in full:

```tsx
import { requireUser } from "@/lib/auth/session";
import { KanbanColumn } from "@/components/super-ai/kanban-column";
import { STAGE_KINDS } from "@/lib/pipeline/kinds";

export default async function BoardPage(props: PageProps<"/board">) {
  void props;
  await requireUser();

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold">Board</h1>
      <p className="mt-2 text-muted-foreground">
        No jobs yet. Adding jobs arrives in the next milestone.
      </p>
      {/* tabIndex + aria-label, not a bare div: this row scrolls sideways
          once the columns outrun the viewport, and axe's
          scrollable-region-focusable rule catches a scroll container with
          no tab stop (kanban-view.tsx applies the same fix to itself, for
          the same reason). Found and fixed while building Task 8's axe suite. */}
      <section
        tabIndex={0}
        aria-label="Board columns"
        className="mt-6 flex gap-4 overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {STAGE_KINDS.map((stage) => (
          <KanbanColumn key={stage.kind} title={stage.columnTitle} count={0} />
        ))}
      </section>
    </div>
  );
}
```

`KanbanColumn` takes `title`, `count` and an optional `tone`; with no children it renders the header (title plus count) and an empty body, which is exactly a titled, counted, empty column. Its title renders as an `<h2>`, so the seven column headings Task 8's end-to-end test looks for by role and name are unchanged.

- [ ] **Step 11: Confirm the project builds and the full test suite passes**

```bash
pnpm typecheck
pnpm lint
pnpm test
DATABASE_URL="postgres://postgres:postgres@localhost:5432/jobsmith" BETTER_AUTH_SECRET="$(openssl rand -base64 32)" APP_URL="http://localhost:3000" pnpm build
```

Expected: all four succeed. `pnpm test` reports at least 12 passing tests across the unit and integration suites written so far.

- [ ] **Step 12: Manually verify the responsive shell**

```bash
DATABASE_URL="postgres://postgres:postgres@localhost:5432/jobsmith" BETTER_AUTH_SECRET="$(openssl rand -base64 32)" APP_URL="http://localhost:3000" pnpm dev &
sleep 3
curl -s http://localhost:3000/board -H "Cookie: better-auth.session_token=nonsense" -o /tmp/board.html -w "%{http_code}\n"
kill %1
```

Expected: `307` (the cookie is present but invalid, so the proxy's optimistic check passes it through, and `requireUser()` in the real check redirects it). Open `http://localhost:3000` in a browser after logging in (Task 4's curl-based sign-up from Step 17 of Task 4, or the seed script in Task 8) and resize the window across 768px to confirm the sidebar and the bottom tab bar swap. Click the account avatar in the sidebar footer and confirm the menu opens with the signed-in email, an "Appearance" submenu (Theme: Light/Dark/System, matching the OS setting; Background: five swatches), and "Sign out" at the bottom.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add the responsive app shell, Home placeholder and empty board

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Seed, reset and end-to-end tests

**Files:**
- Create: `scripts/seed.ts`, `scripts/reset-db.ts`, `playwright.config.ts`, `tests/e2e/global-setup.ts`, `tests/e2e/axe.ts`, `tests/e2e/account.ts`, `tests/e2e/first-run.spec.ts`, `tests/e2e/shell.spec.ts`
- Modify: `package.json` (scripts and dependencies)

**Interfaces:**
- Consumes: `auth.api.signUpEmail` (Task 4), `scoped()` (Task 5), `getDb()` (Task 3), the routes from Tasks 6 and 7, `STAGE_KINDS` (Task 7).
- Produces: `pnpm seed`, `pnpm reset-db`, `pnpm test:e2e`, `scanForViolations(page: Page, label: string): Promise<void>` from `tests/e2e/axe.ts`, and the Playwright suite every later milestone extends.

When an axe scan below reports a contrast failure that traces to a token pair, fix that pair in the semantic layer of `app/globals.css` and list the change under "Local changes" in `docs/design-system.md`, the same way Step 6 of Task 7 recorded its lint fix. Scanning the shell built in Task 7 (which already carries that task's two structural fixes: a `div` instead of a nested `main` inside `SidebarInset`, and a focusable, labeled `section` around the horizontally scrolling board columns) against the Minimal Design System's tokens in both color schemes found no contrast failures: the design system's own `main` branch already carries fixes for its known contrast issues (documented inline in `app/globals.css`, for example `--text-tertiary` and `--border-focus-ring`), and none of axe's rules, `color-contrast` included, flagged anything on `/setup`, `/board`, `/` or `/login` in light or dark. If a future page introduces a new failing pair, this is where the fix belongs; nothing in this milestone needs it.

- [ ] **Step 1: Write the seed script**

Create `scripts/seed.ts`:

```typescript
import crypto from "node:crypto";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { scoped } from "@/lib/db/scoped";

async function main() {
  const email = "demo@example.com";
  const password = process.env.SEED_PASSWORD ?? crypto.randomBytes(9).toString("base64url");

  const result = await auth.api.signUpEmail({
    body: { email, password, name: "Demo user" },
  });

  await scoped(getDb(), result.user.id).profile.upsert({
    headline: "Product designer exploring new roles",
    resumeMd: "# Demo resume\n\nThis is fictional seed data for local development.",
  });

  console.log(`Seeded demo user: ${email}`);
  if (!process.env.SEED_PASSWORD) {
    console.log(`Generated password (shown once): ${password}`);
  }
}

// getDb() keeps a pooled connection open, which would hold the process for
// several seconds after the work is done, so exit explicitly on both paths.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

Add to `package.json` `scripts`:

```json
{
  "scripts": {
    "seed": "tsx scripts/seed.ts"
  }
}
```

- [ ] **Step 2: Write the reset script**

Create `scripts/reset-db.ts`:

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import path from "node:path";

async function main() {
  if (process.env.ALLOW_DB_RESET !== "true") {
    throw new Error("Refusing to reset: set ALLOW_DB_RESET=true to confirm.");
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required.");
  }

  const host = new URL(connectionString).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(
      `Refusing to reset a non-local database host: ${host}. This script only runs against localhost or 127.0.0.1.`,
    );
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  // drizzle-orm's node-postgres migrator tracks applied migrations in its own
  // "drizzle" schema, separate from "public". Both must be dropped together,
  // otherwise the migrator sees migration 0000 as already applied and skips
  // recreating the application tables.
  try {
    await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
    await db.execute(sql`CREATE SCHEMA public`);

    await migrate(db, {
      migrationsFolder: path.resolve(import.meta.dirname, "../lib/db/migrations"),
    });
    console.log("Database reset and migrated.");
  } finally {
    // Close the pool on failure as well as success, same as scripts/migrate.ts.
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Add to `package.json` `scripts`:

```json
{
  "scripts": {
    "reset-db": "tsx scripts/reset-db.ts"
  }
}
```

- [ ] **Step 3: Manually verify the reset script's guards and its effect**

```bash
DATABASE_URL="postgres://postgres:postgres@localhost:5432/jobsmith" pnpm reset-db
```

Expected: fails with `Refusing to reset: set ALLOW_DB_RESET=true to confirm.`

```bash
pnpm db:migrate
DATABASE_URL="postgres://postgres:postgres@localhost:5432/jobsmith" ALLOW_DB_RESET=true pnpm reset-db
docker compose exec postgres psql -U postgres -d jobsmith -c "\dt"
```

Expected: `Database reset and migrated.`, then a table listing showing all six tables again (this is the check that catches a reset which silently no-ops: dropping only `public` without also dropping the `drizzle` bookkeeping schema leaves the migrator believing migration 0000 is already applied, and the tables would be missing from this listing).

- [ ] **Step 4: Install Playwright and axe**

```bash
pnpm add -D @playwright/test @axe-core/playwright
pnpm exec playwright install --with-deps chromium webkit
```

- [ ] **Step 5: Write the Playwright config**

The suite shares one database, reset once before it starts. Only one test may run the first-run flow, because `/setup` works only while no account exists. So the config has four projects: `first-run` creates the account on a fresh database, and the three browser projects depend on it and log in with that account.

Create `playwright.config.ts`:

```typescript
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.APP_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "html",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      // Runs once, on the freshly reset database, and creates the only account.
      // No retries: a second attempt would find the account already there.
      name: "first-run",
      testMatch: /first-run\.spec\.ts/,
      retries: 0,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      testMatch: /shell\.spec\.ts/,
      dependencies: ["first-run"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "webkit",
      testMatch: /shell\.spec\.ts/,
      dependencies: ["first-run"],
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "phone",
      testMatch: /shell\.spec\.ts/,
      dependencies: ["first-run"],
      use: {
        ...devices["iPhone 13"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    // All browsers log in from the same address, so the suite raises the
    // sign-in limit for the server it starts. The default stays 5 per minute.
    command: "pnpm build && AUTH_SIGNIN_MAX_PER_MINUTE=1000 pnpm start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
```

The `phone` project starts from the `iPhone 13` device preset (WebKit engine, touch, mobile user agent) but overrides `viewport` explicitly: the preset's own `viewport` is `390x664`, not `390x844` (`844` is only the preset's `screen` height, which is not what the page actually renders at), and the design spec calls for the browser viewport itself to be `390x844`.

Stop any dev server on port 3000 before running the suite. With `reuseExistingServer`, Playwright would use that server instead of starting its own, and that server has the default sign-in limit.

The server Playwright starts has the rate limiter on (Task 4, Step 12), and every browser reaches it from the same address, so all four projects share one counter per auth path. The only requests this suite sends through the limiter are sign-ins: three in `first-run` (one of them with a wrong password, which counts), then one in each browser project. That is six in a run, and nine on CI if every browser project uses its one retry, and they can all land inside one burst. A limit of 1000 leaves room for the specs later milestones add. Creating the account and signing out do not count, because both are server actions that call `auth.api.*`.

A later milestone that sends `/sign-up/*`, `/change-password` or `/change-email` over HTTP from this suite, through the auth client instead of a server action, meets Better Auth's built-in rule for those paths: three requests per burst, shared by every browser project, and untouched by `AUTH_SIGNIN_MAX_PER_MINUTE`. The fourth such request inside one burst is answered with `429`, and with three browser projects running in parallel one burst is the normal case. Give that path its own `customRules` entry and its own variable at that point, the way `/sign-in/email` is handled here.

- [ ] **Step 6: Write the global setup that resets the database**

Create `tests/e2e/global-setup.ts`:

```typescript
async function globalSetup() {
  process.env.ALLOW_DB_RESET = "true";
  const { execSync } = await import("node:child_process");
  execSync("pnpm reset-db", { stdio: "inherit" });
}

export default globalSetup;
```

- [ ] **Step 7: Write the axe scan helper**

Create `tests/e2e/axe.ts`:

```typescript
import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Scans the current URL once per color scheme and asserts zero violations.
 * Reloads for each scheme rather than flipping it on the live page, so
 * next-themes resolves "system" from the color scheme the page is actually
 * born with instead of racing its own change listener.
 */
export async function scanForViolations(page: Page, label: string) {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.reload();

    const results = await new AxeBuilder({ page }).analyze();
    for (const violation of results.violations) {
      console.log(`[${label} / ${colorScheme}] ${violation.id} (${violation.impact}): ${violation.help}`);
      for (const node of violation.nodes) {
        console.log(`  target: ${node.target.join(", ")}`);
        console.log(`  summary: ${node.failureSummary}`);
      }
    }

    expect(results.violations, `${label} (${colorScheme}) axe violations`).toEqual([]);
  }
}
```

- [ ] **Step 8: Write the failing end-to-end specs**

Create `tests/e2e/account.ts`, the one account the whole suite uses:

```typescript
export const EMAIL = "e2e-owner@example.com";
export const PASSWORD = "correct horse battery staple";
```

Create `tests/e2e/first-run.spec.ts` (runs once, in the `first-run` project):

```typescript
import { test, expect } from "@playwright/test";
import { scanForViolations } from "./axe";
import { EMAIL, PASSWORD } from "./account";

test("first run: setup, board, logout and login round-trip", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);
  await scanForViolations(page, "/setup");

  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/board$/);

  await page.goto("/setup");
  await expect(page.getByText(/this page could not be found/i)).toBeVisible();

  // Sign-out lives in the account menu: open the trigger (its accessible
  // name is "Account menu for {email}"), then the "Sign out" item.
  await page.goto("/board");
  await page.getByRole("button", { name: /Account menu/i }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await scanForViolations(page, "/login");

  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill("wrong password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("alert")).toHaveText("Wrong email or password.");

  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/board$/);
});

test("a tampered return path lands on the board, not on another site", async ({ page }) => {
  await page.goto("/login?from=//evil.example");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/board$/);
});
```

The two tests in this file run in order in one worker, so the second one finds the account the first one created.

Create `tests/e2e/shell.spec.ts` (runs in `chromium`, `webkit` and `phone`):

```typescript
import { test, expect } from "@playwright/test";
import { scanForViolations } from "./axe";
import { EMAIL, PASSWORD } from "./account";

const COLUMN_TITLES = [
  "Saved",
  "Applied",
  "Recruiter",
  "Hiring manager",
  "Portfolio / case",
  "Panel / final",
  "Offer",
];

test("shell: login, board, home, navigation and accessibility", async ({ page }, testInfo) => {
  await test.step("an unauthenticated visit is sent to login and returns to the board", async () => {
    await page.goto("/board");
    await expect(page).toHaveURL(/\/login\?from=%2Fboard$/);
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/board$/);
  });

  await test.step("the board shows its seven empty columns", async () => {
    for (const title of COLUMN_TITLES) {
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
    }
    await scanForViolations(page, "/board");
  });

  await test.step("home renders", async () => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    await scanForViolations(page, "/ (Home)");
  });

  await test.step("navigation matches the viewport", async () => {
    await page.goto("/board");
    const bottomTabs = page.getByRole("navigation", { name: "Primary" });
    if (testInfo.project.name === "phone") {
      // Below the md breakpoint the sidebar is a closed sheet that mounts no
      // content, and the bottom tab bar is the only navigation on screen.
      await expect(bottomTabs).toBeVisible();
      await expect(bottomTabs.getByRole("link", { name: "Board" })).toBeVisible();
    } else {
      await expect(bottomTabs).toBeHidden();
      await expect(page.getByRole("link", { name: "Board" }).first()).toBeVisible();
    }
  });
});
```

- [ ] **Step 9: Add the `test:e2e` script**

```json
{
  "scripts": {
    "test:e2e": "playwright test"
  }
}
```

- [ ] **Step 10: Run the suite and confirm it fails before the server exists**

```bash
DATABASE_URL="postgres://postgres:postgres@localhost:5432/jobsmith" BETTER_AUTH_SECRET="$(openssl rand -base64 32)" APP_URL="http://localhost:3000" pnpm test:e2e
```

Run this once against a database that still has the demo user from Step 3's manual check; expected: the `first run` test fails at `await expect(page).toHaveURL(/\/setup$/)` because `/` redirects to `/login` instead (a user already exists). This confirms `global-setup.ts` is required, not optional.

- [ ] **Step 11: Run the full suite for real**

```bash
DATABASE_URL="postgres://postgres:postgres@localhost:5432/jobsmith" BETTER_AUTH_SECRET="$(openssl rand -base64 32)" APP_URL="http://localhost:3000" pnpm test:e2e
```

Expected: `global-setup.ts` resets the database first (visible in the output as the reset script's own log lines). The `first-run` project runs alone and passes its two tests, then `chromium`, `webkit` and `phone` each pass `shell.spec.ts`. Axe scans run on `/setup` and `/login` once, and on `/board` and Home in every browser project, each in light and dark. If a browser project is reported as skipped, `first-run` failed: fix that first. If a login step fails with the form showing `Too many attempts. Wait a minute and try again.`, the suite reused a server that was already on port 3000 and has the default sign-in limit (Step 5): stop that server and run again.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add seed and reset scripts and the first-run end-to-end suite, with axe

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: CI

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `package.json` (confirm `typecheck`, `lint` (chaining `check:tokens` since Task 2), `check:tokens`, `test`, `test:e2e` all exist; they do, from Tasks 1, 2, 5 and 8)

**Interfaces:**
- Consumes: every package script written so far (`typecheck`, `lint`, `check:tokens`, `test`, `build`, `test:e2e`, `db:migrate`).
- Produces: a green check on every push and pull request.

- [ ] **Step 1: Confirm every script CI depends on works locally first**

```bash
pnpm typecheck
pnpm lint
pnpm check:tokens
pnpm test
DATABASE_URL="postgres://postgres:postgres@localhost:5432/jobsmith" BETTER_AUTH_SECRET="$(openssl rand -base64 32)" APP_URL="http://localhost:3000" pnpm build
```

Expected: all five succeed (this plan verified each individually in earlier tasks; `pnpm lint` already runs `check:tokens` as part of itself since Task 2, and this step runs it again on its own so the workflow below can give it a dedicated, separately named check). This step is the last local check before writing a workflow that assumes they do.

- [ ] **Step 2: Write the CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
  pull_request:

env:
  DATABASE_URL: postgres://postgres:postgres@localhost:5432/jobsmith
  BETTER_AUTH_SECRET: ci-only-dummy-secret-value-32-characters-long
  APP_URL: http://localhost:3000

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm check:tokens
      - run: pnpm test
      - run: pnpm build

  e2e:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: jobsmith
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      ALLOW_DB_RESET: "true"
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium webkit
      - run: pnpm db:migrate
      - run: pnpm test:e2e

  gitleaks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

`pnpm/action-setup@v4` reads the pinned version from this repo's `package.json` `packageManager` field; it does not need an explicit `version:` input. The `build` job's dummy `BETTER_AUTH_SECRET`, `DATABASE_URL` and `APP_URL` are enough for `pnpm build` to succeed even though no Postgres service runs in that job: every route that touches the database or session (`/`, `/board`, `/login`, `/setup`, `/api/auth/[...all]`) calls `headers()` or is marked `export const dynamic = "force-dynamic"`, so Next.js defers all of it to request time instead of trying to run it during the build.

- [ ] **Step 3: Confirm the workflow YAML is well-formed**

```bash
python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "valid yaml"
```

Expected: `valid yaml`. (This checks syntax only; the workflow itself can only be exercised for real once the branch is pushed and a pull request opened, in Task 10.)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add CI for typecheck, lint, check:tokens, tests, build, e2e and a secret scan

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Deploy preview, install notes and cross-browser check

**Files:**
- Create: `vercel.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: every task's output; this task ships it.
- Produces: a Vercel preview URL behind login, and a README a stranger can follow from a fresh clone.

- [ ] **Step 1: Write the Vercel build configuration**

Create `vercel.ts`:

```typescript
import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  buildCommand: "pnpm db:migrate && pnpm build",
  framework: "nextjs",
};
```

```bash
pnpm add -D @vercel/config
pnpm typecheck
```

Expected: `pnpm typecheck` still exits 0. `vercel.ts` must export a named `config`, not a default export; a default export is silently ignored by Vercel's current build platform.

- [ ] **Step 2: OWNER CONFIRMS FIRST: link the Vercel project**

This step creates a real project in the owner's Vercel account. Ask the owner to confirm before running it, or have them run it themselves:

```bash
pnpm dlx vercel link
```

- [ ] **Step 3: OWNER CONFIRMS FIRST: add Neon Postgres for Preview**

In the Vercel dashboard, under the linked project's Storage tab, add Postgres through the Vercel Marketplace (Neon), scoped to the Preview environment. This creates a database in the owner's Neon account; confirm before doing it, or have the owner do it. Do not reuse the Production database for Preview.

- [ ] **Step 4: OWNER CONFIRMS FIRST: add Neon Postgres for Production**

Repeat Step 3, scoped to Production, as a separate database from Preview.

- [ ] **Step 5: OWNER CONFIRMS FIRST: set the remaining environment variables**

For both Preview and Production, set:

```bash
pnpm dlx vercel env add BETTER_AUTH_SECRET preview
pnpm dlx vercel env add BETTER_AUTH_SECRET production
```

Generate each value with `openssl rand -base64 32`; use a distinct secret per environment. `DATABASE_URL` is already set by the Marketplace integration in Steps 3 and 4, as a separate database per environment. Confirm with the owner before running these, since they write real values into his Vercel project.

Do not set `APP_URL` for Preview: `lib/env.ts` (Task 1) derives it from Vercel's own system environment variables when it is unset, so every preview deployment trusts its own URL automatically. This needs Vercel's system environment variables exposed to the project, which is the default for new projects (Project Settings > Environment Variables > System Environment Variables, if it was ever turned off). Set `APP_URL` for Production only when a custom domain is used instead of the default `*.vercel.app` production URL:

```bash
pnpm dlx vercel env add APP_URL production
```

Self-hosters outside Vercel always set `APP_URL` in `.env`, since none of the `VERCEL_*` variables exist there for `lib/env.ts` to fall back to.

- [ ] **Step 6: Write the README install notes**

Replace `README.md` in full:

```markdown
# Jobsmith

Jobsmith is one app for a whole job search: find, qualify, apply, research,
prepare for each interview stage, debrief. It is open source under
AGPL-3.0 and self-hostable with your own database and, later, your own AI
provider key.

## Requirements

- Node.js 24 (see `.nvmrc`)
- pnpm
- Docker, for the local Postgres in `docker-compose.yml`

## First run

```bash
cp .env.example .env
```

Fill in `.env`:

- `DATABASE_URL`: leave the default if you use `docker-compose.yml`.
- `BETTER_AUTH_SECRET`: generate one with `openssl rand -base64 32`.
- `APP_URL`: `http://localhost:3000` for local development.

```bash
docker compose up -d
pnpm install
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000`. The first visit redirects to `/setup`, which
creates the only account this instance will accept until you set
`ALLOW_SIGNUP=true`.

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Run the app locally |
| `pnpm build` | Production build |
| `pnpm start` | Run a production build |
| `pnpm typecheck` | Generate route types, then check them |
| `pnpm lint` | ESLint, then the token lint (`check:tokens`) |
| `pnpm check:tokens` | Fails on raw colors, palette classes or arbitrary values outside `components/ui` |
| `pnpm test` | Unit and integration tests (Vitest) |
| `pnpm test:e2e` | End-to-end tests (Playwright), resets the database first |
| `pnpm db:generate` | Generate a SQL migration from the schema |
| `pnpm db:migrate` | Apply migrations |
| `pnpm seed` | Create a fictional demo user and profile |
| `pnpm reset-db` | Drop and re-migrate a local database (refuses non-local hosts) |

## License

AGPL-3.0-only. See `LICENSE`.

Outside pull requests are not merged until a contribution policy exists.
```

- [ ] **Step 7: Verify a fresh clone works from the README alone**

```bash
cd "$(mktemp -d)"
git clone --branch feat/m1-skeleton <this repo's URL> jobsmith-fresh-clone
cd jobsmith-fresh-clone
cp .env.example .env
# fill in .env by hand: BETTER_AUTH_SECRET via `openssl rand -base64 32`,
# APP_URL to http://localhost:3000
docker compose up -d
pnpm install
pnpm db:migrate
pnpm dev
```

Expected: `pnpm dev` starts without error, and `http://localhost:3000` redirects to `/setup`.

- [ ] **Step 8: OWNER CONFIRMS FIRST: push the branch and open the pull request**

The executor never pushes to `main` and does not push the feature branch or open a pull request until the owner says so.

```bash
git push -u origin feat/m1-skeleton
gh pr create --title "Milestone 1: skeleton" --body "$(cat <<'EOF'
## Summary
- Scaffold, license, validated env
- Design system foundation: Minimal Design System tokens, base-nova primitives, a token lint script
- Database, Better Auth schema and migrations
- Sign-up gate, session helper, session policy, trusted origins for preview deployments, and a login rate limit
- Scoped query helper with a tenant-isolation test
- Setup, login and logout with route protection
- Responsive app shell built from the Super AI Components registry, with an empty board
- Seed, reset and first-run end-to-end tests, with an axe accessibility scan per route
- CI: typecheck, lint, token lint, tests, build, Playwright, secret scan
- Deploy preview and install notes

## Test plan
- [ ] Fresh clone in a temp folder, following only the README
- [ ] Preview URL opens behind login in Chrome and Safari, desktop and phone
- [ ] CI green on the pull request
EOF
)"
```

- [ ] **Step 9: Final verification checklist**

Confirm each of the following, in Chrome and Safari, on desktop and at a 390-wide viewport:

- [ ] A fresh clone in a temporary folder runs end to end using only the README's instructions.
- [ ] The Vercel Preview URL redirects an unauthenticated visit to `/setup` on a fresh database, or to `/login` once an account exists.
- [ ] Creating the account and logging in both succeed on the Preview URL itself, not only on `localhost`, confirming `TRUSTED_ORIGINS` covers the preview's own origin with no `APP_URL` set for Preview.
- [ ] Creating the account lands on `/board` with all seven column headings visible.
- [ ] `/setup` returns a 404 once an account exists.
- [ ] The account menu in the sidebar footer opens, shows the signed-in email and an Appearance submenu, and its "Sign out" item returns to `/login`; a wrong password shows "Wrong email or password."; the right password returns to `/board`.
- [ ] Below 768px wide, the bottom tab bar is visible and the sidebar is not; above it, the reverse.
- [ ] Light and dark match the OS setting on every route, with no manual toggle needed for that default.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm check:tokens`, `pnpm test`, `pnpm build` and `pnpm test:e2e` are all green in CI on the pull request, including the axe scans inside `test:e2e`.
