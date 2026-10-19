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

# Part B: fit scoring

**Goal:** every job added with a posting gets a fit score after the response, the job page shows a fit card, board cards carry a score band and a failed hard filter, and Preferences gets a "Test against a posting" box. Work happens on `feat/m5-fit-scoring`, cut from part A's tip.

**Design source:** "Part B: fit scoring" on the M5 drafts page: the fit card in five states (scored, scored with a failed filter, scoring, score failed, no resume), board cards with score bands, a failed filter and "Scoring", and the test box with its filter rows and result.

**Ported, not rewritten:** the scoring core from `feat/m5-fit-home` (2026-10-11, reviewed there): `hardFilters` matching, `scoreFit` with its prompt and `sanitizeScore`, the fake driver's `Fit score:` line, `queueFitScoring` and `scoreSafely` with the pending-only settle, the poll constants. Its UI copy and bands predate the drafts and are replaced by the drafts.

| File | New/changed | One responsibility |
|---|---|---|
| `lib/fit/bands.ts` | new | the score bands against the user's threshold, the one file for chip colors |
| `lib/fit/hard-filters.ts` | new | `hardFilters(posting, preferences)`: one check per filter, pass, fail or not checked |
| `lib/fit/messages.ts` | new | every fit line on screen, built from checks and bands |
| `lib/preferences/summary.ts` | new | preferences as prompt lines |
| `lib/ai/score-fit.ts`, `lib/ai/fake.ts`, `lib/ai/driver.ts` | new, changed | the `score_fit` task, its prompt and the fake driver's deterministic score |
| `lib/fit/stored.ts`, `readiness.ts`, `log.ts`, `deps.ts`, `profile.ts` | new | the `fit` jsonb shape, readiness, log lines, injected deps, the inputs read for scoring |
| `lib/fit/score-opportunity.ts` | new | `queueFitScoring`, `scoreOpportunity`, `scoreSafely` |
| `lib/fit/card.ts`, `lib/fit/board.ts` | new | the fit card's view model; a board card's chips |
| `lib/fit/test-posting.ts` | new | read a link, check and score it, write nothing |
| `lib/db/scoped/opportunity.ts` | changed | `listBoard` carries fit status and the filter facts; `settleFitStatusIfPending` |
| `app/(app)/board/actions.ts`, `jobs/[slug]/actions.ts`, `preferences/actions.ts` | changed | `after()` scoring on add, `scoreFitAction`, `testPostingAction` |
| `components/fit/*` | new | fit card, result body, chips, filter rows |

## Part B decisions

- **B1. No migration.** `fit_score`, `fit`, `fit_status` exist. Cost: none.
- **B2. Hard filters are checked in code, at render, never stored.** Title keywords, locations, work modes, pay floor, as part A's D4 lists them. Whole-word phrase match on normalized text (case, accents and punctuation ignored). A filter with no preference is not set; a posting fact that is missing leaves it not checked; a remote job skips locations; pay is checked only with a floor, against the top of the range, and not checked when the currencies differ. A failing job stays on the board, marked. Cost: "Product Design Lead" does not match the keyword "Product Designer".
- **B3. Bands follow the user's threshold, as the drafts propose.** At or above `scoreThreshold` is good (green, "Good fit"), up to 15 below is mixed (amber, "Mixed"), lower is weak (neutral, "Weak fit"). Constants in `lib/fit/bands.ts`. Tone rides on the chip's fill and the word, never on color alone; board chips carry the band word as screen-reader text. Cost: a user with threshold 0 never sees amber.
- **B4. When scoring runs.** After `addJobAction` adds a job that is ready, through `after()`, and from the fit card's button (`scoreFitAction`, awaited). Never on import, seed, preferences or resume save. Cost: a score goes stale when the resume changes.
- **B5. Readiness, in order:** AI off, no posting text, no resume, ready. Not ready leaves `fit_status` at `none`, and the card says what is missing (the drafts draw the no-resume state; AI off and no posting reuse its layout without a button). A ready job with no score yet offers "Score this job" in the same layout. Cost: three short lines not drawn as their own frames.
- **B6. One run never overwrites a newer one.** Failure and not-ready only settle a job that is still `pending`; `scoreSafely` never throws and never leaves `pending` behind; errors log by name and code only. A `pending` older than two minutes shows as failed with "Score again". While pending, the card refreshes every 3 seconds, at most 40 times. Cost: up to 40 refreshes for one add.
- **B7. The fit card is the first section of Overview,** above Posting. Cost: the posting moves down.
- **B8. The test box scores a link against the saved preferences and resume,** through the same fetch guard and extraction as Add job, and writes nothing. A link it cannot read (a login wall, a timeout) asks for the posting text, as Add job does, and the text box stays for later tries. Cost: the user saves before testing; the text box is not drawn.
- **B9. Logs never carry posting text, resume text, preference values or fit summaries.** One `[fit]` line per run: ids, outcome, reason code, model id, milliseconds, token counts.
- **B10. Durations.** `maxDuration = 60` on the job page and Preferences, so the awaited score and the test box fit inside one function lifetime.
- **B11. e2e owns the shared account's resume and preferences in its own projects.** `fit-chromium`, `fit-webkit` and `fit-phone` run `fit.spec.ts` after every other project, one engine at a time, because every other spec reads the same profile. The fake driver holds a score for a `Fit wait: <ms>` line in the posting (at most 30 seconds), so the scoring state can be scanned. Cost: the e2e run takes about three minutes longer.

## Part B copy (binding, from the drafts)

- Card heading "Fit"; chip "{score} · {band word}"; "Scored {date}"; "Pros", "Cons"; footnote "Passes your hard filters."
- Failed filter: chip "Fails 1 filter" / "Fails {n} filters"; box "Fails a hard filter" / "Fails {n} hard filters", one line per failure "{Filter}: {detail}".
- Scoring: "Scoring this job". Failed: "The fit score didn't come back. Nothing about the job changed." with "Score again". No resume: "Add your resume in Settings to get a fit score for this job." with "Open Settings".
- Board: score chip, "Fails {filter}" (one) or "Fails {n} filters", "Scoring".
- Test box: "Test against a posting", "Runs the hard filters and the fit score on one posting without adding it to the board.", label "Posting", button "Score this posting", caption "Hard filters", rows "Title keywords", "Locations", "Work modes", "Pay floor" with "Passes", "Fails", "Not checked", footnote "Nothing was added to the board."
- Filter details: "{keyword} matches.", "{location} is not in your locations.", "{Mode} is one of yours.", "The posting states no pay range.", and the same pattern for the other outcomes.
