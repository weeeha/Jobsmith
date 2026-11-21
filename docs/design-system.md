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

`base-nova` primitives installed by name via `shadcn add` (earlier primitives predate this list): `dialog`, `select`, `textarea`, `sonner` (added the `sonner` package to `dependencies`), `toggle-group`, `toggle` (transitive dependency of `toggle-group`), `empty`, `combobox` (the Settings time zone field), `input-group` (transitive dependency of `combobox`).

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
- `components/chip-field.tsx`: hand-written, not vendored. Neither the registry nor `base-nova` has
  a free-text multi-value field (the `combobox` multiple mode picks from a fixed list), and the
  Preferences lists (titles, locations, keywords) take any text. Chips are plain `bg-muted` spans
  inside an `input`-shaped box with the same border, ring and invalid treatment as `Input`; each
  chip submits as its own hidden input, so the server reads the list with `FormData.getAll`.
- `components/settings/settings-section.tsx`: hand-written. The two-column Settings layout
  (intro left, content right, a hairline between sections) from the M5 Settings drafts. The
  registry's `section-header` is a single heading row, not a two-column form section.
- `components/home/home-skeleton.tsx`: hand-written, built from the vendored `components/ui/skeleton.tsx`
  primitive. It repeats the attention row's card and row rhythm so Home loads without a jump;
  the pulse stops under `prefers-reduced-motion` through the existing rule at the foot of
  `app/globals.css`.
- `components/fit/fit-chips.tsx`: hand-written, a thin wrapper over the vendored `Badge`. The
  drafts' Approved, Pending and Action badge variants are `Badge variant="secondary"` with the
  `status-*-soft` background and the matching `status-*` text token; neutral and outline are the
  plain `secondary` and `outline` variants. The score band to tone mapping lives here and the band
  thresholds in `lib/fit/bands.ts`, so chip colors are decided in one place.
- `components/fit/fit-result.tsx` and `components/fit/fit-card.tsx`: hand-written. The fit card from
  the M5 Part B drafts in all its states. Its surface reuses the Home side cards' shell
  (`rounded-xl bg-card ring-1 ring-foreground/10`); the failed-filter box is a `bg-muted` tint
  inside it, not a second card. The scoring placeholder bars are the vendored `Skeleton`, and the
  global reduced-motion rule stops their pulse.
- `components/preferences/preferences-section.tsx`: the two-column Preferences section, moved out
  of `preferences-form.tsx` unchanged (plus a heading-named region) so the "Test against a
  posting" box below the form sits in the same columns.
- `components/preferences/test-posting-box.tsx`: hand-written. The test box's filter rows are a
  plain list with a hairline between rows; the registry's `table-view` is a sortable data table,
  more than four fixed rows need.
- `components/prep/` (Prep hub): hand-written, built from `Badge` (through `ToneChip` in
  `components/fit/fit-chips.tsx`), `Button`, `EmptyState` and the Home side cards' shell
  (`rounded-xl bg-card ring-1 ring-foreground/10`). `mark-chip.tsx` is the Shaky, Okay and Solid word
  with its `status-*-soft` tone (a word first, tone second). `mark-buttons.tsx` is the three
  `aria-pressed` buttons, shared with the Quick-fire screen and the later players. `bank-card.tsx`
  is one card per question bank or call card; `question-list.tsx` is the section-grouped question
  list with a native `details` disclosure per row, so the list stays scannable at phone width and
  the control is keyboard reachable with no script. `rebuild-button.tsx` and `bank-warnings.tsx`
  are the safety-net button and the collapsible "Check the bank" list. The registry has no
  question-list or confidence-mark pattern. After a write the client calls `router.refresh()`;
  the prep actions never `revalidatePath`, because the job page reads the database on every
  request (it calls `requireUser()`, which reads cookies) and has no server cache to invalidate.
- `components/player/` (Quick-fire screen): hand-written, built from `Button`, `buttonVariants`,
  `EmptyState` and the same card shell as the hub (`rounded-xl bg-card ring-1 ring-foreground/10`).
  `quick-fire-card.tsx` is the question, the digit countdown, the revealed Spine, the shared
  `MarkButtons` and the round summary; `quick-fire-round.tsx` starts the session and orders the round;
  `use-countdown.ts` is the one-second timer. The registry has no flash-card or timed-recall pattern,
  and the countdown is plain digits (hidden from assistive tech, with one polite announcement per
  question) so nothing animates.
- `components/player/` (Quick-fire, and the shared home of the later Listen and Drill players):
  hand-written, built from `Button`, `EmptyState`, `MarkButtons` and `MarkChip`. `quick-fire-round.tsx`
  is the client shell that starts the session on mount and seeds the order from its id;
  `quick-fire-card.tsx` is the question, countdown, Spine reveal and round summary on the Home side
  cards' shell. `use-countdown.ts` is a one-second countdown hook. The registry has no
  timed-recall card. The card has no motion of its own (digits only), so `prefers-reduced-motion`
  needs nothing beyond the global rule; it is keyboard complete (space or Enter for next, keys 1 to
  3 mark) with a visible Next button for everyone else.
- `components/prep/audio-panel.tsx` (Prep hub audio line): hand-written, built from `Button`, `Dialog`
  and the hub card's text sizes. It is the bank card's audio line ("Audio ready", "Audio: 61 of 96
  clips", "Browser voice") with a Prepare audio button that calls the batch action on the fit card's
  rhythm (`FIT_POLL_MS`, `FIT_POLL_MAX`, one minute after a rate limit) and a Delete audio button
  behind a confirm dialog. Progress is text, not a bar, so nothing animates; "Audio ready." is announced
  once through the live announcer. The registry has no batch-progress pattern.
- `components/player/` (Listen screen): hand-written, built from `Button`, `buttonVariants`, `MarkButtons`
  and the hub's card shell. `listen-player.tsx` is the client shell (sticky header with "Question 7 of
  32" and the section, controls, transcript, sticky mark bar); `player-controls.tsx` is play and pause,
  previous, next, repeat and the speed select; `transcript.tsx` shows the current question's blocks, with
  the playing block marked `aria-current`, note blocks dimmed, "Browser voice" and "Check this clip" notes.
  `engine.ts`, `speaker.ts` and `media-session.ts` hold no markup: they are the playback hooks over
  `lib/prep/engine-state.ts`. The registry has no audio-player or transcript pattern. Playback never
  starts without a press of Play, nothing animates (so `prefers-reduced-motion` needs nothing beyond the
  global rule), and every control is a native button with an accessible name and the shared focus ring.
- `components/native-select.tsx`: hand-written. A styled native `select` with the field look of `Input`.
  Base UI's `Select` is the primary choice, but the speed list and the device-voice list (often over a
  hundred entries) are better in the phone's own picker, and a native element keeps keyboard and
  screen-reader behaviour with no script.
