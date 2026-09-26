# Design system

Jobsmith's front end is copied from two design systems into this repo, so a
stranger can install Jobsmith with no private access.

## What was copied

| Source | What | From | Into |
|---|---|---|---|
| Minimal Design System (`@weeeha/ui`, MIT, same owner, private repo) | token file: primitive ramps, semantic layer, shadcn alias layer | commit `21610c6` on `main` | `app/globals.css` |
| shadcn `base-nova` (Base UI) | primitives | `shadcn add` | `components/ui/` |
| Super AI Components (public registry, same owner, no license file yet; the owner holds the rights) | application shell components | `shadcn add <registry url>` | `components/super-ai/`, plus their own `components/ui/`, `lib/` and `hooks/` dependencies |

## Order of preference for new UI

1. A Super AI Components registry item.
2. A `base-nova` primitive.
3. A component copied from the Minimal Design System (Radix-based; copy only when neither above fits).
4. New code.

## Token lint rules

`pnpm check:tokens` keeps `app/` and `components/` (outside `components/ui/`) on semantic utilities and stock shadcn variable names: no raw colors, no Tailwind palette classes, no arbitrary values other than a bare `var()` reference.

`components/ui/` and `components/super-ai/` are both excluded, because both are vendored registry code, never hand-edited for token compliance, rather than app code written against the token layer.

The `check-tokens-ignore-next-line` comment suppresses the check for the single line below it, and exists only for genuine false positives.
Every use must carry its reason in the same comment, for example `// check-tokens-ignore-next-line: "#face" is an anchor fragment, not a hex color`.

The lint reads text, not syntax: it has no real parser, so a regex literal or an apostrophe in JSX text can still cause a false positive.
That is what the suppression comment above is for.

## Re-sync

Token file: re-run the `git -C "$DESIGN_SYSTEM_DIR" show main:src/styles/globals.css > app/globals.css` command against a newer commit, re-run `pnpm check:tokens` and the axe suite, and update the commit hash above.

Registry components: re-run `shadcn add https://super-ai-components.vercel.app/r/<name>.json --overwrite` for that item, then re-apply anything listed under "Local changes" below.

Items installed so far (`<name>` above, one per file in `components/super-ai/`): `account-menu`, `app-sidebar`, `app-topbar`, `calendar-view`, `data-views`, `data-views-shared`, `feed-view`, `kanban-column`, `kanban-view`, `kbd`, `section-header`, `sidebar-nav`, `table-view`, `timeline-view`, `detail-view-shell`, `detail-tabs`, `detail-fields`, `use-container-width`, `empty-state`, `mode-tabs`, `field-row`, `reset-affordance` (installed as `field-row`'s own registry dependency; not wired up anywhere yet - see `FieldRow`'s `reset` prop doc comment).

`base-nova` primitives installed by name via `shadcn add` (earlier primitives predate this list): `dialog`, `select`, `textarea`, `sonner` (added the `sonner` package to `dependencies`), `toggle-group`, `toggle` (transitive dependency of `toggle-group`), `empty`.

Other dependencies: `@dnd-kit/core` `6.3.1` (not a registry item; the board's drag-and-drop primitive).

`pb-safe` utility: lives in `app/globals.css` next to the four `duration-*` utilities - `padding-bottom: max(0.5rem, env(safe-area-inset-bottom, 0px))`, for content that sits above the mobile bottom nav.

## Local changes

- `app/globals.css` (the copied token file): added the `pb-safe` utility class, `padding-bottom: max(0.5rem, env(safe-area-inset-bottom, 0px))`, for content that sits above the mobile bottom nav. Not part of the upstream token file; re-add it after a re-sync.
- `hooks/use-mobile.ts` (Super AI Components, a dependency of `sidebar`): added one `eslint-disable-next-line react-hooks/set-state-in-effect` on the initial `setIsMobile` call, because the initial value needs `window.innerWidth`, which is only known once this effect runs client-side. No other change; safe to re-apply after a re-sync.
- `components/super-ai/account-menu.tsx` (Super AI Components): made `background`/`onBackgroundChange` optional and render the Background heading, its radio group and the separator before it only when both are supplied, because Jobsmith Core has no persisted background preference to back that control and an unwired swatch group is a control with no effect. Should go upstream to the registry so consumers without a background preference don't ship a dead control.
- `components/super-ai/account-menu.tsx`'s own doc comment (`Spec: docs/design-system/component-specs.md#b8-account-menu`) points to a spec file that lives in the Super AI Components registry's own source repository, not under this repo's `docs/`. Nothing is missing here; that path is simply not resolvable from Jobsmith.
- `components/job/job-tabs.tsx` passes `className="flex-wrap"` to the vendored `DetailTabs`
  (`components/super-ai/detail-tabs.tsx`) so five and then six tabs wrap to a second row at phone
  width instead of forcing the page wider. `DetailTabs` already accepts a `className` prop
  (`DetailTabsProps.className`), so this needed no change to the vendored file itself - nothing to
  re-apply after a re-sync.

## New application code (no registry or primitive match)

- `components/markdown.tsx` and `components/copy-button.tsx`: hand-written, not vendored. The
  Super AI Components registry has chat/agent-output-shaped markdown renderers (`ai-doc-block`,
  `answer-block`) but nothing that is a plain sanitized GFM viewer, and no reveal-once-secret or
  copy-a-value pattern at all. Both are ordinary app code, fully subject to
  `pnpm check:tokens` (unlike `components/ui/` and `components/super-ai/`, which are excluded as
  vendored) and hand-maintained the same as any other file under `components/`.
- `components/job/review-notice.tsx`: hand-written, not vendored. The registry has no "needs review"
  or similar inline notice pattern to copy from; it reuses the exact
  `rounded-lg border border-border bg-muted p-3 text-sm` shell `job-header.tsx`'s own closed-job
  banner already uses, rather than inventing a second one.
