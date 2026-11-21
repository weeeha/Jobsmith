# Milestone 36: Open the repo

**Done when (spec section 9):** "A pull request from a second GitHub account is blocked until its CLA is signed and then merges with CI green; the perf and accessibility jobs pass on `main` with their numbers in the job summary; `v1.0.0` is tagged and its image, release notes and CLI file are on GHCR and GitHub."

**Branch:** `feat/m36-open-the-repo`, cut from `main` after milestones 33 to 35 have merged. Tasks 41 to 52. Contract: `README.md`.

**Before starting:**

```bash
test -f lib/packs/registry.ts && test -f Dockerfile && test -f .github/workflows/image.yml && test -f .github/workflows/release.yml
test -f scripts/check-version.mjs && test -f docs/self-hosting.md && test -f tests/fixtures/env-inventory.ts
test ! -e CONTRIBUTING.md && test ! -e CLA.md
```

The milestone needs Core and milestones 33 to 35 only. One row is left out when its dependency is absent: the Listen row of the perf budget and its `perf-seed` bank (prep milestone 7; its cached case needs prep milestone 10), named in Task 50 and the pull request. The keyboard flows for Drill, Quick-fire and compare run once prep milestones 8 and 9 and apply-research have merged; Task 49 lists them as skipped by name until then.

Owner and outside items (README items 4 to 7, 14 to 16): the CLA licensee name and lawyer review, the project address, the signatures repo and token, GitHub settings, a second account, the banned word list. Each task below says what runs without them.

---

### Task 41: `check:copy`

**Files:**
- Create: `scripts/check-copy.mjs`, `scripts/check-copy.words.json` (`{ "words": [] }`, filled by the owner), `tests/fixtures/check-copy/` (planted files), `tests/unit/check-copy.test.ts`
- Modify: `package.json` (`"check:copy": "node scripts/check-copy.mjs"`), `.github/workflows/ci.yml` (step in `build`), any existing copy module that the first run flags (list them in the report; a maintainer reviews every changed string)
- Test: `tests/unit/check-copy.test.ts`

**Blocked on:** the owner's banned word list (README item 14) for the word rule. The other rules and the tests run now.

**Interfaces:**
- Consumes: spec 5.14 "Copy and hygiene".
- Produces: `checkCopy(files: { path: string; text: string }[], words: string[]): { path: string; line: number; rule: "dash" | "exclamation" | "word" | "not-but"; text: string }[]`; the CLI scans copy modules (any file named `copy.ts` or `messages.ts` under `app`, `components`, `lib`), `content/**` and `docs/**` (`*.md`, `*.mdx`), exits 1 with `path:line: rule: text` lines, and prints `check:copy: the banned word list is empty` to stderr when `words` is empty; `--require-words` makes an empty list a failure (used by Task 52 and `release.yml`'s verify).

Rules: no em dash (U+2014) or en dash (U+2013) anywhere in the scanned text; no `!`, checked inside string and template literals for `.ts` and `.tsx` files and in prose for Markdown (fenced code blocks and inline code skipped); a word from the list (case-insensitive, whole word); "not X but Y" patterns the script can match: `/\bnot\b[^.!?\n]{1,60}\bbut\b/i` and `/\b(?:isn't|is not|aren't|are not|wasn't|was not)\b[^.!?\n]{1,60}[,;] (?:it's|it is|they're|they are)\b/i`. A line preceded by `check-copy-ignore-next-line: <reason>` (as an HTML comment in Markdown, a `//` comment in code) is skipped, and the reason is required.

- [ ] **Step 1: Write the failing tests (each rule has a planted positive and a clean negative)**

```ts
it("flags an em dash and an en dash in prose and in a copy module string")
it("flags an exclamation mark inside a string literal but not the logical-not operator in code")
it("skips fenced code blocks and inline code in Markdown")
it("flags a banned word as a whole word only")                            // list ['seamless']: 'seamless' hit, 'seamlessly' not
it("flags 'not just a tool but a partner' and \"it isn't a plan, it's a promise\"")
it("accepts 'Do not delete this job.'")                                   // no 'but'
it("an ignore comment with a reason skips the next line; one without a reason does not")
it("an empty word list prints the notice and exits 0, and fails with --require-words")
it("scans only copy modules, content/ and docs/")                         // a .ts file that is not copy.ts or messages.ts is not scanned
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/check-copy.test.ts`
Expected: FAIL, script missing.

- [ ] **Step 3: Implement, then run it on the repo**

Run `pnpm check:copy`; fix each flagged line in existing docs and copy modules, or add an ignore with a reason for a true false positive. Core's rule "no exclamation marks in UI copy" means few hits are expected; report the count.

- [ ] **Step 4: Run the tests and the script**

Run: `pnpm vitest run tests/unit/check-copy.test.ts && pnpm check:copy`
Expected: PASS, the script exits 0 (with the empty-list notice until the owner supplies the list).

- [ ] **Step 5: Commit**

```bash
git add scripts package.json .github tests docs
git commit -m "feat(ci): check:copy for the writing rules with planted positives"
```

**Acceptance:**
1. Spec 5.14: no em or en dashes, no exclamation marks, the banned word list, the "not X but Y" patterns it can match, on copy modules, `content/` and `docs/`.
2. Spec 8: the check runs against fixtures with planted positives.
3. A CI step runs it; an empty word list is visible, never silent.

---

### Task 42: `check:licenses` and notices

**Files:**
- Create: `scripts/check-licenses.mjs`, `scripts/licenses-allowlist.json`, `scripts/notices.config.json` (`{ "superAiComponentsLicensed": false }`), `THIRD_PARTY_NOTICES.md`, `tests/fixtures/check-licenses/*.json`, `tests/unit/check-licenses.test.ts`, `tests/unit/third-party-notices.test.ts`
- Modify: `package.json` (`"check:licenses": "node scripts/check-licenses.mjs"`), `.github/workflows/ci.yml`
- Test: both new test files

**Interfaces:**
- Consumes: `pnpm licenses list --prod --json` (grouped by license identifier).
- Produces: `licenseProblems(report: Record<string, { name: string; versions: string[] }[]>, allowlist: { allowed: string[]; fontsOnly: string[]; fontPackages: string[]; refused: string[] }): string[]`; the allowlist file holds the Contract's allowed and refused lists (OFL-1.1 allowed only for packages matching `^@fontsource/` or `^geist$`). An SPDX `A OR B` passes when any alternative is allowed, `A AND B` when all are. `UNLICENSED`, `Unknown` and a missing license are refused. CLI: `node scripts/check-licenses.mjs [--json-file <path>]` (default runs `pnpm licenses list --prod --json`) exits 1 with `<package>: <license>: refused` lines.

- [ ] **Step 1: Write the failing tests**

```ts
it("passes MIT, MIT-0, ISC, 0BSD, BSD-2-Clause, BSD-3-Clause, Apache-2.0, BlueOak-1.0.0, CC0-1.0, MPL-2.0, LGPL-2.1-or-later, LGPL-3.0 and AGPL-3.0")
it("refuses GPL-2.0-only, SSPL-1.0, BUSL-1.1, Commons-Clause, CC-BY-NC-4.0, UNLICENSED and a missing license, naming the package")   // planted positives
it("OFL-1.1 passes for @fontsource/geist and fails for another package")
it("'(MIT OR GPL-2.0-only)' passes and '(MIT AND GPL-2.0-only)' fails")
it("exits 1 and prints a line per refusal from a fixture file")
// third-party-notices.test.ts
it("lists shadcn/ui components (MIT), the Minimal Design System token file (MIT), Geist, Source Sans 3 and Source Serif 4 (OFL-1.1) and the disposable domain list (CC0), each with license text")
it("omits Super AI Components while superAiComponentsLicensed is false and includes it when true")   // a pure render function over the config
it("no entry is empty and none names a person or address")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/check-licenses.test.ts tests/unit/third-party-notices.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement; write the notices from the upstream files**

`THIRD_PARTY_NOTICES.md` is produced by `scripts/render-notices.mjs` from `scripts/notices.config.json` plus the license files copied from each upstream source; copy each upstream's `LICENSE` text exactly (shadcn/ui, the Minimal Design System token file's repo, the Geist, Source Sans 3 and Source Serif 4 font licenses, the disposable-domain list's license) and record each source URL and commit in the report. Do not write a copyright holder's name from memory. Run `pnpm check:licenses` on the repo: report each current production dependency that fails, and ask the owner before adding any exception; add none by default.

- [ ] **Step 4: Run the tests and the check**

Run: `pnpm vitest run tests/unit/check-licenses.test.ts tests/unit/third-party-notices.test.ts && pnpm check:licenses`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts package.json .github tests THIRD_PARTY_NOTICES.md
git commit -m "feat(ci): check:licenses allowlist and THIRD_PARTY_NOTICES.md"
```

**Acceptance:**
1. Spec 5.14 Dependencies: the allowed and refused lists as written; fixtures with planted positives (spec 8).
2. Spec 5.14 notices: vendored code with its license text; Super AI Components appears once it is licensed (README item 15).
3. Spec 5.6: `THIRD_PARTY_LICENSES.txt` for the image is Task 33's, separate from this file.

---

### Task 43: Inline server-action lint rule

**Files:**
- Modify: `eslint.config.mjs` (a `no-restricted-syntax` block for `app/**` and `components/**`)
- Test: `tests/unit/eslint-inline-action.test.ts`

**Interfaces:**
- Consumes: spec 7 "Server Actions key".
- Produces: an error for a `"use server"` directive inside a function body, with the message `Inline "use server" actions are not allowed here. Export a module-level action that takes ids and re-checks the user.` Selectors: `FunctionDeclaration > BlockStatement > ExpressionStatement[directive="use server"]`, `FunctionExpression > BlockStatement > ExpressionStatement[directive="use server"]`, `ArrowFunctionExpression > BlockStatement > ExpressionStatement[directive="use server"]`. A module-level directive stays allowed.

- [ ] **Step 1: Write the failing test (uses ESLint's `ESLint` class with the repo config and `lintText`)**

```ts
it("errors on an inline directive in an async function in app/")
it("errors on an inline directive in an arrow function in components/")
it("allows a module-level 'use server' file in app/")
it("does not apply under lib/")
it("the real repo has no inline actions")            // lint app/ and components/ glob; expect zero errors for this rule id
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/eslint-inline-action.test.ts`
Expected: FAIL, no rule yet.

- [ ] **Step 3: Implement**

Add the rule to the existing `files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"]` block next to `no-restricted-imports`. If the repo run finds an inline action, convert it to a module-level action in its own task step and report it.

- [ ] **Step 4: Run the test and the lint**

Run: `pnpm vitest run tests/unit/eslint-inline-action.test.ts && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.mjs tests
git commit -m "feat(lint): refuse inline use server actions in app and components"
```

**Acceptance:**
1. Spec 7: an ESLint `no-restricted-syntax` rule fails a `"use server"` directive inside a function body in `app/` and `components/`.
2. Spec 7: module-level actions that take ids and re-check `requireUser()` stay allowed.
3. The rule is covered by a test that plants the violation.

---

### Task 44: Source link

**Files:**
- Create: `lib/source-url.ts`, `components/source-link.tsx`, `tests/unit/source-url.test.ts`, `tests/unit/source-link.test.tsx`
- Modify: `lib/env.ts` (`SOURCE_URL` parsed, in `ENV_NAMES` and `Env`), `app/(auth)/login/page.tsx` (footer), `app/(app)/settings/page.tsx` (footer with the version), `.env.example`, `tests/unit/env-inventory.test.ts` (nothing: `lib/env.ts` is already a parser module), `tests/e2e/settings-profile.spec.ts` and `tests/e2e/shell.spec.ts` (link assertions)
- Test: the new unit tests and the two e2e specs

**Interfaces:**
- Consumes: `env()`, `JOBSMITH_VERSION`, `JOBSMITH_COMMIT`, `VERCEL_GIT_COMMIT_SHA`, `VERCEL`.
- Produces: `Env.SOURCE_URL: string | undefined` (`z.url()` with protocol http or https, optional; invalid gives `EnvError` naming `SOURCE_URL`); `sourceUrl(source: Record<string, string | undefined>): string` with precedence: `SOURCE_URL`; on Vercel (`VERCEL` set) `https://github.com/weeeha/jobsmith/tree/<VERCEL_GIT_COMMIT_SHA>`; a release image (`JOBSMITH_VERSION` matching `^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?$`) `https://github.com/weeeha/jobsmith/tree/v<version>`; an image with `JOBSMITH_COMMIT` the commit URL; else `https://github.com/weeeha/jobsmith`. `appVersion(source): string` (`JOBSMITH_VERSION`, else the `package.json` version). `SourceLink` (server component) renders `<a href rel="noopener noreferrer">Source code</a>`. Settings footer reads `Version <appVersion>` (the bug template asks for it) beside the link.

- [ ] **Step 1: Write the failing tests**

```ts
it("SOURCE_URL wins over everything")
it("on Vercel the link points at VERCEL_GIT_COMMIT_SHA")
it("a release image links its tag: 1.0.0 gives /tree/v1.0.0")
it("a non-release version such as 0.0.0-dev or ci falls back to JOBSMITH_COMMIT, then the repository root")
it("an invalid SOURCE_URL makes parseEnv throw EnvError naming SOURCE_URL")
it("the link text is 'Source code' and the anchor has rel noopener noreferrer")
// e2e: the login page footer and the Settings footer each show a link named 'Source code' with a non-empty https href; axe zero violations on both pages in light and dark
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/source-url.test.ts tests/unit/source-link.test.tsx tests/unit/env.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

The login page is signed out, so `SourceLink` takes no session. `.env.example` gets a `SOURCE_URL` block with the section 13 reason: an operator who changes the code points it at their own source.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run tests/unit && pnpm typecheck && pnpm test:e2e --grep "Source code"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib components app tests .env.example
git commit -m "feat(license): AGPL source link on the sign-in page and in Settings"
```

**Acceptance:**
1. Spec 7 AGPL section 13: Settings and the sign-in page footer link "Source code" to `SOURCE_URL`, defaulting to the running tag or commit.
2. Spec 5.13: on the owner's Vercel deployment the link points at `VERCEL_GIT_COMMIT_SHA`.
3. Spec 5.11: `SOURCE_URL` is in `ENV_NAMES`, `.env.example` and the guide's table (Task 27 already lists it).

---

### Task 45: Contributor docs and templates

**Files:**
- Create: `CONTRIBUTING.md`, `MAINTAINERS.md`, `CODEOWNERS` (repo root, one line `* @weeeha`), `.github/ISSUE_TEMPLATE/bug.yml`, `feature.yml`, `role-pack.yml`, `config.yml`, `.github/pull_request_template.md`, `scripts/set-project-email.mjs`, `tests/unit/community-files.test.ts`
- Test: `tests/unit/community-files.test.ts`

**Blocked on:** the project address (README item 5). Every place that needs it holds the marker text `PROJECT_EMAIL_NOT_SET`; `node scripts/set-project-email.mjs <address>` replaces the marker in `CONTRIBUTING.md`, `MAINTAINERS.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` and `.github/ISSUE_TEMPLATE/config.yml` (Tasks 45 and 47). Task 52's check fails while the marker exists.

**Interfaces:**
- Consumes: spec 5.14 in full; Tasks 41 and 42 (the commands `CONTRIBUTING.md` names must exist).
- Produces: `setProjectEmail(files: Record<string, string>, address: string): Record<string, string>` (pure, throws when the address is not `local@domain.tld` shaped).

`CONTRIBUTING.md` sections, each from the spec's bullet: welcome without asking (bug fixes with a failing test, accessibility fixes, docs, new role packs, drivers behind an existing interface; everything else starts as an issue a maintainer labels `accepted`, because the roadmap lives in the specs); run and check (README's First run plus `pnpm seed`; `pnpm typecheck`, `lint`, `check:tokens`, `check:copy`, `check:licenses`, `test`, `test:e2e`; tests first for everything under `lib/`; read the bundled Next docs before using a framework API, `AGENTS.md`); code rules (the list in spec 5.14 including the 18-row single-writer table); design system (order of preference, semantic tokens, light and dark, axe at zero, `components/ui` and `components/super-ai` change upstream first and are re-synced); copy and hygiene (`pnpm check:copy`, fictional companies, no pay figures, no personal data, screenshots from the seed only); dependencies (one line in the PR on why and under which license, the allowed and refused lists from the Contract); a good PR (one concern, about 400 changed lines or fewer outside tests and snapshots, a linked issue, tests, light, dark and phone screenshots for UI, a CHANGELOG line under Unreleased, a Conventional Commits title, the CLA signed; a role pack PR adds one file in `packs/` at version 1 with `pnpm packs:check --repo` green and a reviewer who works in that role). `bug.yml` fields: version (from the Settings footer or the image tag), where it runs (hosted, Docker image, source), browser and OS, steps, expected, actual, logs (ids and codes only), and a required checkbox `I removed company names, people and document text`. `feature.yml` starts with the problem. `role-pack.yml`: stage flow, levels, typical titles, a reviewer from the role. `config.yml`: `blank_issues_enabled: false`, contact links to `SECURITY.md` and hosted support (the project address). `pull_request_template.md` repeats the good-PR list as checkboxes. `MAINTAINERS.md`: the owner (GitHub `weeeha`) as lead maintainer with merge and release rights, review within 7 days, maintainers invited after sustained contributions, the lead deciding when maintainers disagree.

- [ ] **Step 1: Write the failing tests**

```ts
it("CONTRIBUTING.md names every check command: pnpm typecheck, lint, check:tokens, check:copy, check:licenses, test, test:e2e")
it("CONTRIBUTING.md lists the allowed licenses exactly and the refused ones")                 // against scripts/licenses-allowlist.json
it("CONTRIBUTING.md lists all 18 single-writer modules")
it("CONTRIBUTING.md says about 400 changed lines and names the CLA and CHANGELOG")
it("bug.yml has the required checkbox 'I removed company names, people and document text'")
it("config.yml sets blank_issues_enabled false and links SECURITY.md")
it("role-pack.yml asks for stage flow, levels, typical titles and a reviewer")
it("the PR template has one checkbox per item of the good-PR list")
it("CODEOWNERS is exactly '* @weeeha'")
it("MAINTAINERS.md names weeeha and a 7-day review")
it("every file passes check:copy")
it("setProjectEmail replaces the marker in every listed file and rejects a malformed address")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/community-files.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the files**

Follow the writing rules (no dashes, no exclamation marks). Issue form `type` values follow GitHub's issue-forms syntax; check it against GitHub's current docs and record the page.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run tests/unit/community-files.test.ts && pnpm check:copy`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add CONTRIBUTING.md MAINTAINERS.md CODEOWNERS .github scripts tests
git commit -m "docs(community): contributing guide, templates, maintainers and code owners"
```

**Acceptance:**
1. Spec 5.14: every `CONTRIBUTING.md` bullet, the four issue templates, the PR template, `MAINTAINERS.md` and `CODEOWNERS` as the spec words them.
2. Spec 11 item 5: no personal address in the repo; the marker is replaced by one script.
3. Spec 8: `check:copy` passes on the files it covers.

---

### Task 46: CLA and its workflow

**Files:**
- Create: `CLA.md`, `.github/workflows/cla.yml`, `tests/unit/cla.test.ts`
- Test: `tests/unit/cla.test.ts`

**Blocked on:** the owner's confirmation of the CLA over a DCO and the licensee's legal name (README item 4), the lawyer's review (gate in Task 52), the private signatures repo and its token (item 6), a second GitHub account for the live test (item 7). The files and their tests run without them.

**Interfaces:**
- Consumes: the Apache ICLA and CCLA 2.0 forms (apache.org, the base the spec names), `contributor-assistant/github-action`.
- Produces: `CLA.md` with an individual and a corporate form; the licensee appears as the marker `CLA_LICENSEE_NOT_SET` until the owner and lawyer fill it. The terms (spec 5.14): the contributor keeps copyright; grants the owner a perpetual, worldwide, royalty-free copyright and patent license with the right to sublicense on any terms; every contribution also ships under AGPL-3.0. `cla.yml`: triggers per the action's current README (`pull_request_target` and `issue_comment`), `uses: contributor-assistant/github-action@<commit SHA>`, `path-to-signatures`, `path-to-document` (the `CLA.md` URL on `main`), `branch: main`, `allowlist: weeeha,dependabot[bot]`, the private signatures repo as `remote-organization-name` and `remote-repository-name`, the signatures token from the secret `CLA_SIGNATURES_TOKEN` (the secret name is this plan's choice), `GITHUB_TOKEN`, and no checkout of the pull request's head.

- [ ] **Step 1: Write the failing tests**

```ts
it("CLA.md has an individual and a corporate form")
it("states that the contributor keeps copyright and grants a perpetual, worldwide, royalty-free license with the right to sublicense on any terms")
it("states that every contribution also ships under AGPL-3.0")
it("covers patent license in both forms")
it("cla.yml is pinned by commit SHA, allowlists exactly weeeha and dependabot[bot], and reads the token from a secret")
it("cla.yml never checks out the pull request's head")                            // no 'head.sha', 'head.ref' or 'github.event.pull_request.head' anywhere
it("cla.yml's trigger set matches the action's README")                           // asserted against the list recorded in the task report
it("CLA.md keeps the Apache attribution the reuse terms need")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/cla.test.ts`
Expected: FAIL.

- [ ] **Step 3: Adapt the forms and write the workflow**

Fetch the ICLA and CCLA 2.0 text from apache.org. Adapt only these things: replace "the Foundation" with the licensee marker; add the AGPL-3.0 sentence; keep the contributor-retains-copyright and patent clauses; add the sublicense-on-any-terms wording. Do not reword anything else. Record the source URLs and fetch date. Read the action's current README for the trigger list and inputs, and record them.

- [ ] **Step 4: Run the tests and lint the workflow**

Run: `pnpm vitest run tests/unit/cla.test.ts && actionlint .github/workflows/cla.yml`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add CLA.md .github tests
git commit -m "feat(cla): license-grant CLA forms and the CLA Assistant Lite workflow"
```

**Acceptance:**
1. Spec 5.14 decision: a license-grant CLA over a DCO, forms adapted from Apache CLA 2.0, the owner and Dependabot allowlisted, signatures in a private repo through a scoped token.
2. Spec 7: stored personal data is GitHub login and id in the private repo only.
3. The first outside merge waits for the lawyer's review (Task 52 records it).

---

### Task 47: Conduct, security, CodeQL, Dependabot, changelog

**Files:**
- Create: `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`, `.github/workflows/codeql.yml`, `.github/workflows/changelog.yml`, `.github/dependabot.yml`, `scripts/changelog-check.mjs`, `tests/unit/policy-files.test.ts`, `tests/unit/changelog-check.test.ts`
- Test: both new test files

**Blocked on:** the project address (README item 5) and the GitHub settings (item 6: private vulnerability reporting, Dependabot alerts). The files and their checks run without them.

**Interfaces:**
- Consumes: Contributor Covenant 2.1 (CC BY 4.0, attribution kept), Keep a Changelog 1.1.
- Produces: `changelogProblem(changedFiles: string[], labels: string[], changelogChanged: boolean): string | null` returning a message when any changed file starts with `app/`, `components/`, `lib/`, `cli/`, `packs/` or `deploy/` and `CHANGELOG.md` is untouched and no `no-changelog` label exists.

Files: `CODE_OF_CONDUCT.md` is Contributor Covenant 2.1 with its attribution and the contact line set to the project address marker, plus the sentence that reports get an answer within 7 days. `SECURITY.md`: GitHub private vulnerability reporting first (`https://github.com/weeeha/jobsmith/security/advisories/new`), the project address second; scope: the code, the published image and the hosted service, tested with your own accounts only, no denial of service, no social engineering, no access to other users' data; acknowledgment within 3 business days; triage within 7 days; a fix released within 14 days for critical and 30 for high issues, others in the next minor; disclosure at the fix or after 90 days; credit in the advisory unless declined; advisories and CVEs through GitHub; supported: the latest minor of the current major, and the hosted service. `CHANGELOG.md`: Keep a Changelog 1.1 header, `## [Unreleased]` with one line per merged user-visible change of milestones 33 to 35 under Added and Changed, taken from those pull requests' titles. `codeql.yml`: on pull requests and weekly, language `javascript-typescript`, `github/codeql-action` pinned by SHA. `dependabot.yml`: weekly updates for `npm`, `docker` (directory `/`), `docker-compose` (directory `/deploy`, confirm the ecosystem name in Dependabot's docs and record it) and `github-actions`. `changelog.yml`: on pull requests, runs `scripts/changelog-check.mjs` over the changed file list and labels. The existing gitleaks job stays.

- [ ] **Step 1: Write the failing tests**

```ts
it("SECURITY.md carries every timing: 3 business days, 7 days, 14 days, 30 days, 90 days")
it("SECURITY.md names private vulnerability reporting first and the project address second")
it("SECURITY.md supports the latest minor of the current major and the hosted service")
it("CODE_OF_CONDUCT.md is Contributor Covenant 2.1 with its CC BY 4.0 attribution and a 7-day reply line")
it("CHANGELOG.md has an Unreleased section and follows Keep a Changelog 1.1")
it("dependabot.yml covers npm, docker, docker-compose and github-actions weekly")
it("codeql.yml runs on pull requests and on a weekly schedule and is pinned by SHA")
it("changelogProblem flags a change under lib/ with no CHANGELOG change and no label")
it("changelogProblem accepts the no-changelog label, a CHANGELOG change, and a docs-only change")
it("changelogProblem covers app/, components/, lib/, cli/, packs/ and deploy/")
it("every file passes check:copy where check:copy covers it")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/policy-files.test.ts tests/unit/changelog-check.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the files**

Pins by SHA as in Task 37; `workflows.test.ts` (Task 37) covers the new workflows automatically. The Covenant text comes from the project's published 2.1 text; record the source URL.

- [ ] **Step 4: Run the tests and lint the workflows**

Run: `pnpm vitest run tests/unit && actionlint .github/workflows/*.yml`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add CODE_OF_CONDUCT.md SECURITY.md CHANGELOG.md .github scripts tests
git commit -m "docs(policy): conduct, security policy, CodeQL, Dependabot and the changelog check"
```

**Acceptance:**
1. Spec 5.14: Covenant 2.1, `SECURITY.md` with every timing, CodeQL on PRs and weekly, Dependabot for npm, Docker and Actions, `changelog.yml` on the listed paths with the `no-changelog` label.
2. Spec 11 item 6: the security timings are exactly as stated.
3. Spec 7: supply chain items present; gitleaks stays.

---

### Task 48: Releasing, version bump and Node 24

**Files:**
- Create: `docs/releasing.md`, `scripts/bump-version.mjs`, `tests/unit/bump-version.test.ts`, `tests/unit/releasing-doc.test.ts`
- Modify: `package.json` (`engines.node` `>=24`), `cli/package.json` (`engines.node` `>=22`), `.github/workflows/ci.yml` (a `cli` job on Node 22 and 24), `scripts/check-version.mjs` (export `checkVersion` for the bump script)
- Test: both new test files

**Interfaces:**
- Consumes: `checkVersion` from Task 38, `CHANGELOG.md`.
- Produces: `bumpVersion(files: { packageJson: string; cliPackageJson: string; cliVersionTs: string; changelog: string }, version: string, date: string): typeof files` (pure); CLI `node scripts/bump-version.mjs <version>` updates `package.json`, `cli/package.json` and `cli/src/version.ts` together, moves `## [Unreleased]` content under `## [<version>] - <date>` (date UTC) and leaves an empty `## [Unreleased]`, and `--check <version>` runs `checkVersion`.

- [ ] **Step 1: Write the failing tests**

```ts
it("bumps the three version fields to the same value")
it("moves the Unreleased body under the new heading with a UTC date and leaves an empty Unreleased")
it("rejects a version that is not semver, and one lower than the current")
it("--check names every file that differs from the version")
it("docs/releasing.md lists the steps: bump the three files, move Unreleased, merge, push a signed vX.Y.Z tag on that main commit")
it("docs/releasing.md explains what release.yml does and the -rc.N behavior")
it("docs/releasing.md says a release that needs a step says so under Changed, for example 'Back up first: this release rewrites stage labels'")
it("package.json engines is >=24 and cli/package.json engines is >=22")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/bump-version.test.ts tests/unit/releasing-doc.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the script, the doc and the CI job**

`ci.yml` `cli` job: matrix `node-version: [22, 24]`, install with `pnpm install --frozen-lockfile`, run `pnpm vitest run tests/unit/cli-*.test.ts tests/integration/cli-*.test.ts`. Confirm that `pnpm install` on Node 22 succeeds with `engines` `>=24` (pnpm warns unless `engine-strict` is set); if it fails, set the matrix job to install under Node 24 and run the CLI tests under Node 22 with `actions/setup-node` switched after install. Record the result. The doc states supported versions as in spec 5.15 (Node 24 LTS for the app, Node 22 or newer for the CLI, Postgres 17 with 16 untested, Chrome and Edge current and previous major, Safari 17 or newer on macOS and iOS, Firefox current through a smoke project, Docker Engine 24 or newer with Compose v2) and semantic versions over the public surface listed in the spec.

- [ ] **Step 4: Run the tests and lint the workflow**

Run: `pnpm vitest run tests/unit/bump-version.test.ts tests/unit/releasing-doc.test.ts && actionlint .github/workflows/ci.yml && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs scripts package.json cli .github tests
git commit -m "chore(release): bump script, releasing guide and Node 24 for the app"
```

**Acceptance:**
1. Spec 5.15: bump `package.json`, `cli/package.json` and `cli/src/version.ts` together, move Unreleased, merge, signed tag on that `main` commit.
2. Spec 5.15: `engines` moves from `>=22` to `>=24`; the CLI is tested on 22 and 24.
3. `0.x` tags until `v1.0.0` (Task 52).

---

### Task 49: Accessibility statement and keyboard specs

**Files:**
- Create: `docs/accessibility.md`, `tests/e2e/routes.ts`, `tests/e2e/axe-routes.spec.ts`, `tests/e2e/keyboard-board.spec.ts`, `tests/e2e/keyboard-dialogs.spec.ts`, `tests/unit/a11y-routes.test.ts`, `tests/unit/accessibility-doc.test.ts`
- Modify: `playwright.config.ts` (add the three specs to the `chromium`, `webkit` and `phone` `testMatch`; `axe-routes` and the keyboard specs run in all three)
- Test: the new e2e specs and unit tests

**Interfaces:**
- Consumes: `tests/e2e/axe.ts`, `scanOpenOverlay`, existing dialogs and the board keys.
- Produces: `ROUTES: { path: string; needsJob?: boolean; requiresFlag?: string }[]` in `tests/e2e/routes.ts` (every `page.tsx` under `app/`, with the job route using the seeded job).

`docs/accessibility.md` (linked from the README, WCAG 2.2 AA): each public line ends with `Check:` and the job or record that tests it (principle 39). Tested on every pull request by the `e2e` job: axe with zero violations on every route in light and dark, in Chromium and WebKit; keyboard-only flows for the board (digits, `c`, Move to), every dialog, Drill and Quick-fire, compare and the pack switch; the phone layout at 390 px. Checked by hand for each release and recorded in its pull request: VoiceOver on macOS Safari and iOS Safari through sign-in, a board move, a job page and Listen. Known limits: exported PDFs are untagged (Apply and Research), browser voices vary by device (Prep), dragging has keyboard and menu equivalents. Reports use the `accessibility` label.

- [ ] **Step 1: Write the failing tests**

```ts
// a11y-routes.test.ts
it("every page.tsx under app/ is in tests/e2e/routes.ts")                  // a planted missing route is reported by path
// accessibility-doc.test.ts
it("every line under 'Tested on every pull request' names its check (a spec file or job name)")
it("the manual checks name the PR that records them")
it("lists the known limits and the accessibility label")
// axe-routes.spec.ts
test("axe zero violations on every route in light and dark")             // loops ROUTES; routes whose files do not exist are skipped by name
// keyboard-board.spec.ts
test("digits move the focused card to the visible column of that digit, c opens Close, Move to works with Enter and arrows, and focus lands on the moved card")
// keyboard-dialogs.spec.ts
test("every dialog opens from the keyboard, traps focus, closes on Escape and returns focus to its trigger")   // Add job, Close job, Edit details, Edit stages, Paste, Person, Mark sent, Edit company, Role pack switch
test("Drill, Quick-fire and compare are keyboard-operable")              // test.skip with 'prep milestone 8 and 9 / apply-research not merged' until their routes exist
test("phone layout at 390 px has no axe violations on the board and a job page")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/a11y-routes.test.ts tests/unit/accessibility-doc.test.ts && pnpm test:e2e --grep "keyboard|axe zero"`
Expected: FAIL.

- [ ] **Step 3: Write the specs, the route list and the doc**

Reuse `scanOpenOverlay` for dialogs. Any violation the new specs find is fixed in its own commit with a failing assertion first; list them in the report. Checks the doc names must exist by the time the statement is public.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run tests/unit && pnpm test:e2e`
Expected: PASS, skips named.

- [ ] **Step 5: Commit**

```bash
git add docs tests playwright.config.ts
git commit -m "docs(a11y): accessibility statement with its checks, axe on every route and keyboard flows"
```

**Acceptance:**
1. Spec 5.17: axe zero on every route in light and dark in Chromium and WebKit; keyboard-only flows; phone layout at 390 px.
2. Spec 2 principle 39: each line of the statement names its CI job or the manual check and the PR that records it.
3. A new page cannot skip axe: the route list test fails when `tests/e2e/routes.ts` misses a page.

---

### Task 50: Perf project and budgets

**Files:**
- Create: `tests/perf/budgets.json`, `tests/perf/budget.ts`, `tests/perf/measure.ts`, `tests/perf/summary.ts`, `tests/perf/board.perf.ts`, `scripts/perf-seed.ts`, `docs/performance.md`, `.github/workflows/perf.yml`, `tests/unit/perf-budget.test.ts`, `tests/unit/performance-doc.test.ts`
- Modify: `playwright.config.ts` (a `perf` project), `package.json` (`"test:perf": "playwright test --project=perf"`, `"perf:seed": "tsx --env-file-if-exists=.env scripts/perf-seed.ts"`), `.github/workflows/image.yml` (a `healthy` step), `scripts/image-smoke.mjs` (`healthy <container> <seconds>`)
- Test: both unit tests; `board.perf.ts` runs in CI only

**Blocked on:** the Listen row needs prep milestone 7 (`lib/tts`, the player) and its cached case prep milestone 10; the timing numbers on a hosted runner are a live check. Everything else runs now.

**Interfaces:**
- Consumes: Contract "Performance budgets", `createOpportunity`, `placeOpportunity`, `scoped`.
- Produces: `budgets.json` shaped `{ surfaces: { id: string; metrics: { id: string; kind: "bytes" | "timing"; budget: number; unit: "bytes" | "ms" }[] }[] }`; `evaluate(budgets, runs: Record<string, Record<string, number[]>>): { surface: string; metric: string; kind: "bytes" | "timing"; measured: number; budget: number; status: "pass" | "fail" }[]`, where `measured` is the median of the runs and a bytes metric fails on any overage (`measured > budget`), a timing metric fails when `measured > budget * 1.15`; `median(values: number[]): number`; `renderSummary(results): string` (a Markdown table appended to `$GITHUB_STEP_SUMMARY`). `scripts/perf-seed.ts` seeds one account with 60 active jobs across the seven columns (visible kinds of product design), and, when `lib/tts` exists, one 40-question bank with clips from the fake TTS driver. The `perf` project: Chromium only, `testMatch: /\.perf\.ts$/` under `tests/perf`, CDP `Emulation.setCPUThrottlingRate` rate 4 and `Network.emulateNetworkConditions` with 40 ms latency and 10 Mbps down (upload throughput is not in the spec, so the project sets `-1`, unlimited), 5 runs per surface.

Budgets in `budgets.json`: board cold load: JavaScript transferred 220 KB compressed, LCP 2,000 ms, document response 500 ms; board keyboard move: new column within 100 ms, server confirm within 800 ms; Listen row (when present): JavaScript 160 KB, first audible step 300 ms cached and 1,000 ms uncached, gaps within 100 ms of 600 and 1,400 ms, no task over 100 ms during playback; image: 400 MB, healthy within 20 s.

- [ ] **Step 1: Write the failing tests**

```ts
it("median of 5 is the middle value and median of 4 is the mean of the middle two")
it("a bytes metric fails on any overage and passes at the budget")
it("a timing metric passes at +15% and fails above it")                     // budget 2000: 2300 passes, 2301 fails
it("noise alone does not fail: one slow run in five leaves the median under the line")
it("renderSummary prints every surface and metric with measured, budget and status")
it("docs/performance.md lists each budget of budgets.json and names the CI job that measures it")
it("the Listen metrics are present in budgets.json but marked pending until the player exists")
it("the healthy step fails when the container is not healthy within 20 seconds")      // image-smoke healthy against a stub docker
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/perf-budget.test.ts tests/unit/performance-doc.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the budget code, the seed, the perf spec, the workflow and the doc**

`board.perf.ts`: cold load measures JavaScript transferred from CDP `Network.loadingFinished.encodedDataLength` for script requests, LCP from a `PerformanceObserver` for `largest-contentful-paint`, document response as `responseStart - requestStart` of the navigation entry; the keyboard move focuses a card, presses its digit, and measures time to the card appearing in the new column and time to the live announcement beginning `Moved`. Each run appends to the summary through `renderSummary`. `perf.yml` runs on pull requests and on `push` to `main`: production build, migrate, `pnpm perf:seed`, `pnpm start`, `pnpm test:perf`; actions pinned by SHA; the job fails when any `fail` status exists. The image `healthy` step restarts `app` on the already migrated database and requires `healthy` within 20 seconds.

- [ ] **Step 4: Run the tests and one local perf run**

Run: `pnpm vitest run tests/unit/perf-budget.test.ts tests/unit/performance-doc.test.ts && pnpm build && pnpm perf:seed && pnpm test:perf`
Expected: PASS; numbers printed. Record the local numbers and say they are not CI numbers.

- [ ] **Step 5: Commit**

```bash
git add tests scripts docs .github playwright.config.ts package.json
git commit -m "feat(perf): perf project with budgets, median of five and a job summary"
```

**Acceptance:**
1. Spec 5.17: Chromium, CPU slowed 4 times, 10 Mbps down, 40 ms round trip, a seeded production build; byte budgets fail on any overage, timing budgets use the median of 5 and fail above 15% over; every run writes its numbers to the job summary.
2. Spec 5.17: the budgets table matches `docs/performance.md`; the Listen row waits for prep milestone 7 and its cached case for 10.
3. Spec 8: image healthy within 20 s on a migrated database, size 400 MB (Task 37).

---

### Task 51: Firefox smoke and README updates

**Files:**
- Modify: `playwright.config.ts` (project `firefox-smoke`, `devices["Desktop Firefox"]`, `testMatch: /(shell|pipeline)\.spec\.ts$/`, depends on `first-run`), `.github/workflows/ci.yml` (`playwright install --with-deps chromium webkit firefox`), `README.md` (replace line 387 "Outside pull requests are not merged until a contribution policy exists."; add Contributing, Security, Accessibility, Performance, Self-hosting, Trademarks), `docs/design-system.md` (nothing expected)
- Test: `tests/unit/readme.test.ts`, the Firefox project run

**Interfaces:**
- Consumes: Tasks 45 to 50.
- Produces: README text: under License, the AGPL-3.0-only line stays and gains `Trademarks: the code is AGPL-3.0, and the Jobsmith name and logo are not licensed for another party's hosted service.`; a Contributing section pointing to `CONTRIBUTING.md`, `CLA.md` and `CODE_OF_CONDUCT.md`; links to `SECURITY.md`, `docs/accessibility.md`, `docs/performance.md` and `docs/self-hosting.md`; the Tests section names `pnpm check:copy`, `pnpm check:licenses`, `pnpm test:perf` and the Firefox project.

- [ ] **Step 1: Write the failing tests**

```ts
it("README no longer says outside pull requests are not merged")
it("README has the Trademarks line as the spec words it")
it("README links CONTRIBUTING.md, CLA.md, CODE_OF_CONDUCT.md, SECURITY.md, docs/accessibility.md, docs/performance.md and docs/self-hosting.md")
it("every relative link in README points at a file that exists")
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/unit/readme.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add the `firefox-smoke` project and run it: `pnpm test:e2e --project=firefox-smoke`. Any Firefox-only failure is a real finding: fix it test-first or record it as a known limit in `docs/accessibility.md` with an issue, and tell the owner.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run tests/unit/readme.test.ts && pnpm test:e2e --project=firefox-smoke && pnpm check:copy`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts .github README.md tests
git commit -m "docs(readme): contribution, security, trademark and statement links, and a Firefox smoke project"
```

**Acceptance:**
1. Spec 5.15: Firefox current through a `firefox-smoke` project running the shell and pipeline specs.
2. Spec 5.14: the README Trademarks line and the contribution pointers replace the "not merged" sentence.
3. Spec 5.17: the README links the accessibility statement.

---

### Task 52: End to end, docs and ship

**Files:**
- Modify: `README.md`, `docs/self-hosting.md` (the pinned version in the clone command), `CHANGELOG.md` (via `scripts/bump-version.mjs` at release), `.github/workflows/release.yml` (verify step adds `pnpm check:copy --require-words` and `pnpm check:licenses` and `pnpm packs:check --repo`)
- Test: the full suite and the recorded one-time checks

**Blocked on:** every owner or outside item (README items 4 to 9, 14 to 16), as listed under each step.

**Interfaces:**
- Consumes: Tasks 41 to 51.
- Produces: the milestone's proof and the `v1.0.0` handoff.

- [ ] **Step 1: Whole-suite verification**

Run: `pnpm typecheck && pnpm lint && pnpm check:tokens && pnpm check:copy --require-words && pnpm check:licenses && pnpm packs:check --repo && pnpm test && pnpm test:e2e && pnpm test:perf`
Expected: PASS. `grep -rn "PROJECT_EMAIL_NOT_SET\|CLA_LICENSEE_NOT_SET" . --include=*.md --include=*.yml --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.claude` prints nothing once the owner has set both (until then this is the visible list of what is pending).

- [ ] **Step 2: GitHub settings by the owner (recorded in the pull request)**

Private vulnerability reporting on; Dependabot alerts on; branch protection on `main` requiring the `build`, `e2e`, `image` and `cla` checks; the private signatures repo and its token stored as the secret `CLA_SIGNATURES_TOKEN`; a LICENSE added to the Super AI Components repo (and `superAiComponentsLicensed` set to `true`, then `THIRD_PARTY_NOTICES.md` re-rendered); the name checked for trademark conflicts; the project address set with `node scripts/set-project-email.mjs <address>`; the lawyer's review of `CLA.md` recorded (date, and the licensee name now in the file) before the first outside merge.

- [ ] **Step 3: One-time checks, recorded in the pull request**

1. **CLA flow from a second GitHub account:** open a pull request from it; the CLA check fails with the signing link and the merge is blocked; sign by comment; the check passes; CI is green; the pull request merges. 2. **A private security report:** send one through private vulnerability reporting; the owner receives it and acknowledges it. 3. **VoiceOver:** macOS Safari and iOS Safari through sign-in, a board move, a job page and Listen (Listen only once prep milestone 7 has merged); record the date and findings. 4. **Perf and accessibility jobs on `main`:** both pass after the merge, with the numbers visible in the job summaries.

- [ ] **Step 4: The release, by the owner**

```bash
node scripts/bump-version.mjs 1.0.0
git add package.json cli/package.json cli/src/version.ts CHANGELOG.md docs/self-hosting.md
git commit -m "chore(release): 1.0.0"
# merge through a pull request, then on that main commit:
git tag -s v1.0.0 -m "v1.0.0" && git push origin v1.0.0
```

Confirm: `docker buildx imagetools inspect ghcr.io/weeeha/jobsmith:1.0.0` lists amd64 and arm64; the tags `1.0`, `1` and `latest` point at it; the GitHub Release holds the changelog section and `jobsmith.mjs`; the Vercel deployment of `main` shows the source link pointing at its commit.

- [ ] **Step 5: Commit**

```bash
git add README.md docs .github
git commit -m "docs: ship checklist for 1.0 and the recorded one-time checks"
```

**Acceptance:**
1. Spec section 9 Milestone 36 done-when: a second account's PR is blocked until its CLA is signed and then merges with CI green; the perf and accessibility jobs pass on `main` with their numbers in the job summary; `v1.0.0` is tagged with its image, release notes and CLI file on GHCR and GitHub.
2. Spec 8 "Once, recorded in the PR": the CLA flow, a private security report reaching the owner, and the clean-machine install (Task 40).
3. Nothing in this plan tags or merges for the owner; the pull request names every item still waiting on a person.
