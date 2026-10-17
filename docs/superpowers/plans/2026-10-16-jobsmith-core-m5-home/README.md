# Jobsmith Core Milestone 5, part A: Preferences, Settings and Home

**Goal:** Home tells the user what to do today. Preferences stores the filters and scoring inputs, Settings gains the profile (headline, time zone, resume) and "Export my data", and Home lists what needs attention in the spec's order, with one primary action and a snooze per item, the counts per column and the last five pushed documents.

**Scope split.** Milestone 5 in the spec also holds fit scoring: `hardFilters`, `scoreFit` with retry, the fit card on the job page and the "Test against a posting" box. That is part B, on its own branch. Part A ships the inputs fit scoring will read (Preferences, profile resume) and everything Home needs. Nothing in part A calls a model.

**Design source:** the "M5 Fit and Home - drafts" page of the JS - Design Figma file, in four sections: "Part A: screens" (desktop 1440, phone 375, one dark check), "Part A: states, menus and errors" (empty, loading, Snooze menu open, field errors, time zone suggestions, toasts), "Part B: fit scoring" (fit card in five states on the job page, board cards with score bands and a failed filter, the test box with a result) and "Components". The test box belongs to part B. The time zone field is a combobox with suggestions, as drawn, not a free text box.

**Spec:** `docs/superpowers/specs/2026-09-18-jobsmith-core-design.md`, sections 5.7, 5.8, 5.9, 6, 7 and the Milestone 5 row of section 9.

**Architecture:** no migration. `profile` already has `headline`, `resume_md`, `timezone` and a `preferences` jsonb defaulting to `{}`. New code sits in four small `lib/` modules with tests first, each called by thin server actions or a route handler:

| File | New/changed | One responsibility |
|---|---|---|
| `lib/preferences/schema.ts` | new | versioned preferences document, defaults, tolerant `parsePreferences`, strict `preferencesInputSchema` |
| `lib/preferences/form.ts` | new | FormData to preferences input (lists, numbers, toggles) |
| `lib/preferences/save.ts` | new | `getPreferences`, `savePreferences` through `s.profile` |
| `lib/profile/index.ts` | new | `profileInputSchema`, `getProfile`, `saveProfile`, `isTimeZone` |
| `lib/export/collect.ts` | new | `collectExport`: every row the user owns, no secrets |
| `lib/time/zone.ts` | new | `zonedDayStart`, `addZonedDays`, `zonedAt` for a named IANA zone |
| `lib/attention/items.ts` | new | pure `attentionItems(input)`: the five rules, order, snooze filter |
| `lib/attention/load.ts` | new | `loadHome(s, now)`: items, column counts, recent pushes |
| `lib/attention/snooze.ts` | new | `snoozeItem(s, input, now)` through `setNextAction` |
| `lib/db/scoped/*` | changed | `listAll` per owned table, `stage.listForActiveOpportunities`, `event.lastOccurredByOpportunity`, `artifact.listRecentPushed` |
| `app/(app)/preferences/*` | changed | page and `savePreferencesAction` |
| `app/(app)/settings/*` | changed | profile form, `saveProfileAction`, export section |
| `app/(app)/settings/export/route.ts` | new | `GET` download of the export as JSON |
| `app/(app)/page.tsx`, `app/(app)/home-actions.ts` | changed, new | Home and its three actions |
| `components/home/*`, `components/preferences/*`, `components/settings/*` | new | the client pieces |
| `components/chip-field.tsx` | new | multi-value text field (no registry match, recorded in `docs/design-system.md`) |

## Global constraints

Carried from Milestones 3 and 4: `requireUser()` in every page, action and handler; `app/` and `components/` never import `@/lib/db/client`; `lib/pipeline` owns stage and status writes (Home's "Mark applied" calls `moveOpportunity`, "Mark done" calls `completeNextAction`, Snooze calls `setNextAction`); typed `Result`; tests first under `lib/`; semantic token utilities only and `pnpm check:tokens`; registry, then `base-nova`, then new code; axe zero violations in light and dark; no exclamation marks in copy; times through `LocalTime` except where a time zone rule says otherwise; forms through `lib/forms/submit.ts`; explicit Zod messages; fictional data only in tests and no real pay figures. Work happens on `feat/m5-home-preferences-settings`, never on `main`.

## Decisions

Each line: decision, reason, cost if wrong.

- **D1. No migration.** Every column exists. Cost: none.
- **D2. One preferences document, versioned, read tolerantly.** `version: 1`. `parsePreferences(raw)` never throws: each field falls back to its own default when missing or invalid, so one bad field never wipes the rest. Saving goes through the strict `preferencesInputSchema`. Cost: a corrupt field silently shows its default until saved again.
- **D3. Field rules.** Lists (titles, locations, must-haves, dealbreakers, industries to avoid) are trimmed, blank entries dropped, deduplicated without regard to case, at most 20 entries of at most 80 characters. Seniority is a fixed list: Mid, Senior, Staff, Principal, Manager. Work modes are the pipeline's `WORK_MODES`. Pay floor and target are whole numbers from 0 to 10,000,000 in one currency (three letters, upper-cased, default USD); a target below the floor is rejected. Company size min and max are whole numbers from 1 to 1,000,000, min not above max. Score threshold 0 to 100, default 70. Follow-up days and saved days 1 to 60, defaults 7 and 3. Cost: a list cap someone hits.
- **D4. The page says which fields are hard filters.** Hard filters: title keywords, locations, work modes, pay floor. Fit score: seniority, target pay, must-haves, dealbreakers, industries to avoid, company size. Home: score threshold, follow-up days, saved days. Cost: none.
- **D5. Profile rules.** Headline at most 200 characters, resume at most 100,000 characters, blank means cleared. The time zone must be a zone `Intl.DateTimeFormat` accepts; the field suggests every zone `Intl.supportedValuesOf("timeZone")` lists. Cost: none.
- **D6. Export is a GET download at `/settings/export`.** `Content-Disposition: attachment; filename="jobsmith-export-YYYY-MM-DD.json"`, `Cache-Control: no-store`. It holds the account (email, name, created), profile, companies, jobs, stages, people, job links, events, every document version, and API tokens as name, prefix and dates only. It never holds a token hash, a session, an account row (passwords) or a verification row. Cost: a bigger file for a long search, fine at Core scale.
- **D7. "Today" uses the profile time zone.** Due today means a next action date before the start of tomorrow in `profile.timezone`. Snooze dates land at 09:00 in that zone. Times on screen still render through `LocalTime` (the browser zone), as everywhere else. Cost: a user whose browser and profile zones differ sees a due time in one zone and the "today" cut in the other; the Settings hint says which zone Home uses.
- **D8. The five rules, in order.** Only active jobs. (1) `interview`: a stage with status `scheduled` and a date from now to now plus 72 hours, soonest first. (2) `due`: a next action with a date before the start of tomorrow, oldest first, labelled overdue when its date has passed. (3) `follow_up`: current stage kind `applied`, no next action, and the newest event older than follow-up days, oldest first. (4) `saved`: current stage kind `saved`, entered at least saved days ago, oldest first. (5) `passed`: a stage with status `scheduled` whose date has passed, oldest first. A job can appear under more than one rule. Cost: a job shows twice when two rules fit, which is correct.
- **D9. Snooze sets the next action date.** Options: Tomorrow, In 3 days, Next week (7 days), each at 09:00 in the profile zone. The text kept is the job's existing next action, or the rule's default: "Follow up", "Apply or drop", "Add notes for {stage label}". Rules 3, 4 and 5 skip a job whose next action date is still ahead, so a snoozed item leaves the list until its date. Interview items have no Snooze: hiding an interview in the next 72 hours is never what the user wants, so this departs from the spec's "each item has a snooze" on purpose. Cost: one fewer control on the most important row.
- **D10. Primary actions.** interview: "Open prep", a link to the job's Prep tab. due: "Mark done", `completeNextAction`. follow_up: "Set next action", a link to the job page. saved: "Mark applied", `moveOpportunity` to `applied`. passed: "Add notes", a link to the job page. Only the interview action is a filled button. Cost: three links leave Home, which keeps one write path per concept.
- **D11. Beside the list.** Counts per column use the board's column titles for all seven kinds, zeros included, active jobs only. Recent pushes are the five newest artifact versions with origin `pushed`, newest first, each with its title, its job ("Role, Company") or company ("Company, shared research"), and its time. Cost: none.
- **D12. Layout.** Desktop: list beside a 320 px column. Below the `lg` breakpoint the column drops under the list and each item's actions move under its text. Cost: none.

## Copy (binding)

- Home subline: "{n} things need you today." / "1 thing needs you today." Empty title "Nothing needs you today." Empty description "Interviews, due next actions and jobs that went quiet show up here." Empty action "Open the board".
- Group headers: "Interviews in the next 72 hours", "Due today or overdue", "Follow up?", "Apply or drop", "Mark it done and add notes".
- Item lines (reason, then job "{role} at {company}", then meta), matching the Figma drafts: interview reason "{stage label}", meta "{when} · {format}" (format left out when not set); due reason "{next action text}", meta "Overdue · {when}" or "Due today · {when}"; follow_up reason "Nothing new for {d} days", meta "In Applied since {date}. No next action set."; saved reason "In Saved for {d} days", meta "Saved {date}."; passed reason "{stage label}", meta "Was {when}. Still marked as scheduled." Dates and times render through `LocalTime`.
- Snooze menu: "Snooze", "Tomorrow", "In 3 days", "Next week". Announcements: "Snoozed to {date}.", "Marked done.", "Moved to Applied."
- Side cards: "Pipeline", "Recent pushes", empty pushes "No documents pushed yet."
- Preferences intro and section intros as in the Figma draft; save button "Save preferences", saved toast "Preferences saved.", note "New and rescored jobs use the saved version."
- Settings: "Profile", "Save profile", toast "Profile saved."; "Export", body "Every row you own, in one JSON file. Nothing secret is in it: no password, no token hashes.", button "Export my data".

## Tasks

1. `lib/time/zone.ts` with unit tests (zones with DST, day starts, 09:00 placement).
2. `lib/preferences/schema.ts`, `form.ts`, `save.ts` with unit and integration tests.
3. `lib/profile/index.ts` with unit and integration tests.
4. Scoped `listAll` queries and `lib/export/collect.ts`, with an integration test that a second user's rows never appear and no secret field does.
5. Scoped Home queries, `lib/attention/items.ts` (unit tests per rule, order, snooze filter, zone), `load.ts` and `snooze.ts` (integration tests).
6. Preferences page, `ChipField`, `savePreferencesAction`.
7. Settings profile form and export section, `saveProfileAction`, `GET /settings/export`.
8. Home page, item actions, snooze menu, side cards, empty state, phone layout.
9. e2e: Preferences round trip, profile save, export download, Home due item and Mark done, axe scans, phone project; update `nav.spec.ts` for the new Preferences page.
