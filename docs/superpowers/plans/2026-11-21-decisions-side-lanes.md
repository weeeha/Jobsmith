# Side lanes built beside Prep: decisions (branch build/compare-m21)

Milestone 21 (Compare), tasks 16 to 24, built 2026-11-21 on `build/compare-m21`, cut from `docs/plans-2026-11-21` (9fdaeee). Each choice below took the recommended option, per the owner's instruction for these runs.

## Setup

- Worktree `.claude/worktrees/compare-m21`, its own `pnpm install`, `.env` with `APP_URL=http://localhost:3521` and the e2e database `jobsmith_m21_e2e` on the shared local Postgres. Unit and integration tests use PGlite in process, so they cannot collide with other lanes.

## Decisions

- `diff` (jsdiff) pinned at exact 9.0.0; it ships its own types, so no `@types/diff`. Reason: the plan names jsdiff and the installed version needs nothing else.
- The join-property test reads `tests/fixtures/export` only when present. Reason: Milestone 20 has not merged and that folder does not exist yet.
- Code fences allow up to three leading spaces. Reason: the CommonMark rule.
- `resolvePair` returns null for the whole pair when either version is missing. Reason: one clear not-found state.
- Company compare hrefs carry the bare key; job hrefs carry the prefixed ref. Reason: matches how each route parses its document key.
- The header title is version b's title. Reason: b is the version shown on the right, the newer one by default.
- Unknown key, unknown version, a one-version document and another user's scope all give `not_found`. Reason: no information leaks across users.
- Version pickers are native `<select>` elements. Reason: testable, and native pickers work best on phones.
- One `ChangeNavigator`: a fixed bar above the shell's bottom nav on phone, static in the header on desktop. Reason: one source of keyboard and focus state.
- `ChangeNavigator` and `VersionPicker` live in `components/compare/` (the plan said `lib/compare/navigator.ts`). Reason: they are client components; the plan text was corrected.
- `CompareVersionsLink` takes a `title` prop. Reason: its aria-label is "Compare versions of <title>"; the plan text was corrected.
- "Newest job of the company" for company links uses the last of `opportunity.listAll()`, falling back to `/companies`. Reason: `listSummaries` has no created date.
- The company route accepts only a bare key and a uuid-shaped id. Reason: a non-uuid id would error on the uuid column.
- The split view's scroll box is a labelled, focusable region. Reason: axe `scrollable-region-focusable` failed at phone width with `?view=split`.
- The `apply-*` Playwright projects are created here. Reason: Milestone 20 has not merged; expect a textual conflict with its project blocks.

## Known merge points

- `components/job/tab-prep.tsx` gains one import and a `CompareVersionsLink`; the Prep branch edits the same file.
- `playwright.config.ts`, `README.md` and `docs/design-system.md` are common files every milestone edits.

## Postponed

- Task 24 Step 5: push, pull request, preview deploy, and the Chrome and Safari check at desktop and phone width on a preview. Needs pushing and hosting, which are off limits for this run.
- WebKit e2e needs `pnpm exec playwright install webkit` on this Mac (revision 2359 is not installed). The executor ran webkit and phone through a temporary config pointing at the installed revision 2388; the controller reran first-run plus `apply-chromium` only.
- A fresh e2e database needs `pnpm db:migrate` once before the first run, because the web server's readiness check runs before the global setup resets the database.
