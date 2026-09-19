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

Registry components: re-run the same `shadcn add` command for that item with `--overwrite`, then re-apply anything listed under "Local changes" below.

## Local changes

- `hooks/use-mobile.ts` (Super AI Components, a dependency of `sidebar`): added one `eslint-disable-next-line react-hooks/set-state-in-effect` on the initial `setIsMobile` call, because the initial value needs `window.innerWidth`, which is only known once this effect runs client-side. No other change; safe to re-apply after a re-sync.
