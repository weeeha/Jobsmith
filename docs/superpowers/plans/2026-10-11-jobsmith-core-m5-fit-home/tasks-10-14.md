# Jobsmith Core Milestone 5 (Fit and Home): Tasks 10 to 14

Part C of the Milestone 5 plan. Read `README.md` first: it holds the goal, the global constraints
and the Contract (called "the README" in the task text below) that these tasks follow. This file
holds the job page and rule 6 work: Task 10 puts the fit card on the job page and the banded chip
on the job page header and both boards, and Task 11 offers to set the next action after a move.
(Tasks 12 to 14, the end-to-end specs, the test box and the docs, follow Task 11. They are Part D: they were written and run on the combined Tasks 1 to 11 checkout, with a scratch database for the browser suites.)

Every name, signature, constant, error code and copy string below is copied character for
character from the README's Contract. A Sonnet builder implementing one of these tasks sees only
that task's own text plus the README, so each task restates the rules, copy and risks it needs
rather than pointing back at an earlier task's prose.

All code in this file was written and run in a scratch checkout before it was put here, and the
steps were then replayed in a second fresh checkout of the same starting commit: every file block
and diff below is the file or diff from the verified commit, every test file passed there, and
every mutation check was made, watched failing and reverted. Where a step shows a diff, apply it to
the file as it stands at the start of that step (the lines starting with `-` and `+` are the
change, the others are context).

Conventions used in every task:

- Test files import with `@/` paths and, under `tests/unit`, the shared helpers with `../helpers/...`.
- Commands run from the repository root with `pnpm exec vitest run <file>`.
- "Mutation check" steps are part of the task: make the change, run the named test, see it fail,
  revert, run again and see it pass. The task report says all of them were made.
- React component tests start with `// @vitest-environment jsdom` and read the DOM directly: the
  repo has no `@testing-library/jest-dom`.
- Do not touch `main`. The branch is `feat/m5-fit-home`.

---

### Task 10: Job page fit card and chips

**Files:**
- Create: `lib/fit/card.ts`, `lib/fit/messages.ts`, `components/fit/fit-chip.tsx`, `components/fit/fit-card.tsx`, `tests/helpers/board-card.ts`, `tests/unit/fit-card-model.test.ts`, `tests/unit/fit-chip.test.tsx`, `tests/unit/fit-card.test.tsx`, `tests/unit/job-card.test.tsx`, `tests/unit/phone-board.test.tsx`, `tests/unit/tab-overview.test.tsx`
- Modify: `components/board/job-card.tsx`, `components/board/phone-board.tsx`, `components/job/job-header.tsx`, `components/job/tab-overview.tsx`, `app/(app)/jobs/[slug]/page.tsx`

**Interfaces:**
- Consumes: `ProfileView` and `loadProfile` (Task 2, `lib/profile/store.ts`), `hasHardFilters` and `parsePreferences` (Task 2, `lib/preferences/schema.ts`), `fitBand`, `FIT_BAND_WORDS`, `hardFilters`, `HardFilter`, `HardFilterResult`, `parseStoredFit`, `StoredFit` and `fitReadiness` (Task 3, `lib/fit`), `FitRun` and `scoreFitAction` (Task 4; the action returns `Result<FitRun, "not_found" | "not_ready">` and the job page already exports `maxDuration = 60`), `getAiDriver` from `lib/ai` (Milestone 4), `OpportunityRow` and `BoardCard` from `lib/db/scoped`, `useAnnounce` and `LiveAnnouncerProvider`, `LocalTime`, `correctFocusOnceLost`, `Badge`, `Button` (Milestones 1 to 4, unmodified). `status-approved`, `status-pending` and `status-action` are existing tokens in `app/globals.css`.
- Produces (copied from the README's Contract character for character, plus the helpers that keep the copy in one file):

```typescript
// lib/fit/card.ts (pure)
export const FIT_PENDING_STALE_MS = 120_000;
export const FIT_POLL_MS = 3_000;
export const FIT_POLL_MAX = 40;
export type FitCardView = "pending" | "stalled" | "failed" | "done" | "none";
export type FitCardModel = { opportunityId: string; roleTitle: string; companyName: string; view: FitCardView; readiness: FitReadiness; fit: StoredFit | null; band: FitBand | null; threshold: number; profileChangedSince: boolean; hardFilters: HardFilterResult; hasHardFilters: boolean };
export function fitCardModel(input: { opportunity: Pick<OpportunityRow, "id" | "roleTitle" | "fitStatus" | "fit" | "updatedAt" | "postingMd" | "location" | "workMode" | "compMin" | "compMax" | "compCurrency">; companyName: string; profile: ProfileView; aiOn: boolean; now: Date }): FitCardModel;
// lib/fit/messages.ts
export const FIT_MESSAGES;                      // every fixed line of the fit card, keyed as in the README's copy section
export const HARD_FILTER_LABELS: Record<HardFilter, string>;   // title "job title", work_mode "work mode", location "location", pay "pay floor"
export function missesFiltersLine(failed: HardFilter[]): string;     // "Misses your hard filters: job title, pay floor."
export function uncheckedFiltersLine(unchecked: HardFilter[]): string;   // "Not checked: location."
export function thresholdLine(score: number, threshold: number): string; // "Above your good-fit line of 70." / "Below ..."
export function scoredAnnouncement(subject: { roleTitle: string; companyName: string }, score: number): string;
export function scoreFailureToast(message: string): string;           // "Could not score this job. <message>"
// components/fit/fit-chip.tsx
export function FitChip(props: { score: number; size?: "sm" | "default" }): React.ReactElement;
// components/fit/fit-card.tsx ("use client")
export function FitCard(props: { model: FitCardModel }): React.ReactElement;
// components/job/job-header.tsx (changed): JobHeader gains the prop fitScore: number | null
// components/job/tab-overview.tsx (changed): TabOverview gains the prop fit: FitCardModel
```

Rules this task enforces:

- `fitCardModel` is pure: no database, no framework, no clock of its own (the caller passes `now`). `view`: a `pending` status whose `updatedAt` is no more than `FIT_PENDING_STALE_MS` old is `pending`, older (strictly) is `stalled`; `failed` and `done` are as stored; everything else is `none`. A `done` status whose `fit` document does not parse is `none` (there is nothing to show), and `fit` stays `null`. A `failed` run keeps the previous parsed `fit` and `band` in the model, because the previous score still shows in the header chip.
- `profileChangedSince` is true only when there is a parsed `fit`, the profile has an `updatedAt`, and it is strictly later than `fit.scoredAt`. `threshold` is `profile.preferences.scoreThreshold`. `readiness` comes from `fitReadiness` with the profile's resume and the job's `postingMd`. `hardFilters` and `hasHardFilters` are computed from the job's own columns and the saved preferences, whatever the view is.
- The fit card always shows the hard-filter result, even with AI off. Hard filters only flag; nothing is hidden anywhere.
- The band mark carries the tone and the label text never does (`text-foreground` on the chip, a `text-status-*` utility on the hidden icon). Screen-reader text reads `Fit score <n>, <band word>`. Semantic token utilities only; `pnpm lint` runs `check:tokens`.
- The card shows its action button only when `readiness` is `ready`: `Score this job` for `none`, `Try again` for `failed` and `stalled`, `Score again` for `done`, nothing for `pending`. When the job is not ready (and not pending) the card says why, with a link to `/settings` for `no_resume`. The paragraph with `role="status"` is always in the document; it holds the pending line while the view is `pending` or the action is running, and is empty otherwise.
- A score at exactly the good-fit line counts as above it (the Preferences hint says "at or above").
- The links inside the card's muted text lines (`Open Settings`, `Set preferences`) are underlined at rest (`text-foreground underline underline-offset-4`, the same classes the other inline links in the app use). A link that differs from its surrounding text by color alone fails axe's `link-in-text-block` rule in light mode; the end-to-end gate found this on the job page.
- Scoring from the card: the action runs in a transition and the button is disabled meanwhile. `ok` with `done` announces `Scored <role> at <company>: <n>.`, `failed` announces the failure line, `none` announces the no-score line; `!ok` toasts `Could not score this job. <message>`; a rejected call toasts the same line with the generic message and logs the error to the console. Whatever happens, `correctFocusOnceLost` puts focus back on the button afterwards (Chromium drops focus to `<body>` when a focused button becomes disabled).
- Polling: while the view is `pending` the card calls `router.refresh()` every `FIT_POLL_MS` and stops after `FIT_POLL_MAX` refreshes. The count lives in a ref so a re-run of the effect cannot hand a stuck run a new budget; it starts over only after the view leaves `pending`.
- Next 16: the card calls `useRouter().refresh()` from `next/navigation`, as `components/refresh-on-focus.tsx` already does. Read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md` before changing that. The card lives on the Overview tab only, so a pending job is polled only while that tab is open; on other tabs the header chip updates on the next navigation or window focus (`RefreshOnFocus`).
- A `LocalTime` is never interpolated into a template string (it renders `[object Object]`). The scored line is JSX around a `LocalTime`.
- The job page computes the model on the server with `aiOn: getAiDriver() !== null` and passes `fitScore` to the header and the model to `TabOverview`. The board chip and the phone chip become `<FitChip score={card.fitScore} size="sm" />`.
- Existing tests: no test at the start of this task renders `JobCard`, `PhoneBoard`, `JobHeader` or `TabOverview` (the README's "existing `job-card` and `phone-board` tests" do not exist), so none changes. This task creates `job-card.test.tsx`, `phone-board.test.tsx` and `tab-overview.test.tsx`; Task 11 replaces the first two in full.
- Not asserted here, because no unit test can: the chip's colors in light and dark, and the card in a real browser. The end-to-end task scans the job page with axe.

- [ ] **Step 1: Write the failing test `tests/unit/fit-card-model.test.ts` in full**

The fixture builders (`opportunity`, `profile`, `model`) are local to the file. The preferences come from `parsePreferences`, so the test follows the schema's own defaults.

```typescript
import { describe, expect, it } from "vitest";
import { FIT_PENDING_STALE_MS, fitCardModel } from "@/lib/fit/card";
import { parsePreferences } from "@/lib/preferences/schema";
import type { ProfileView } from "@/lib/profile/store";

const NOW = new Date("2026-10-11T12:00:00.000Z");
const RESUME = "Product designer with eight years in internal tools and design systems.";

type Opportunity = Parameters<typeof fitCardModel>[0]["opportunity"];

function opportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    roleTitle: "Product Designer",
    fitStatus: "none",
    fit: null,
    updatedAt: NOW,
    postingMd: "About the job. We are looking for a designer.",
    location: "Amsterdam",
    workMode: "hybrid",
    compMin: null,
    compMax: null,
    compCurrency: null,
    ...overrides,
  };
}

function profile(overrides: Partial<ProfileView> = {}): ProfileView {
  return { headline: null, resumeMd: RESUME, timezone: "UTC", preferences: parsePreferences({}), updatedAt: null, ...overrides };
}

const STORED_FIT = {
  v: 1,
  score: 81,
  summary: "A strong match for internal tools work.",
  pros: ["Eight years in design systems."],
  cons: ["The posting does not state pay."],
  modelId: "fake-extractor",
  scoredAt: "2026-10-10T09:00:00.000Z",
};

function model(
  overrides: { opportunity?: Partial<Opportunity>; profile?: Partial<ProfileView>; aiOn?: boolean } = {},
) {
  return fitCardModel({
    opportunity: opportunity(overrides.opportunity),
    companyName: "Northwind Traders",
    profile: profile(overrides.profile),
    aiOn: overrides.aiOn ?? true,
    now: NOW,
  });
}

describe("fitCardModel: view", () => {
  it("is none for a job that was never scored", () => {
    const result = model();
    expect(result).toMatchObject({
      opportunityId: "00000000-0000-4000-8000-000000000001",
      roleTitle: "Product Designer",
      companyName: "Northwind Traders",
      view: "none",
      readiness: "ready",
      fit: null,
      band: null,
    });
  });

  it("is pending while the run is inside the stale window", () => {
    expect(model({ opportunity: { fitStatus: "pending", updatedAt: new Date(NOW.getTime() - 30_000) } }).view).toBe("pending");
  });

  it("keeps pending at exactly the stale limit and calls it stalled one millisecond later", () => {
    expect(FIT_PENDING_STALE_MS).toBe(120_000);
    const atLimit = new Date(NOW.getTime() - FIT_PENDING_STALE_MS);
    const pastLimit = new Date(NOW.getTime() - FIT_PENDING_STALE_MS - 1);
    expect(model({ opportunity: { fitStatus: "pending", updatedAt: atLimit } }).view).toBe("pending");
    expect(model({ opportunity: { fitStatus: "pending", updatedAt: pastLimit } }).view).toBe("stalled");
  });

  it("is failed, and keeps the previous fit for the header chip's sake", () => {
    const result = model({ opportunity: { fitStatus: "failed", fit: STORED_FIT } });
    expect(result.view).toBe("failed");
    expect(result.fit?.score).toBe(81);
    expect(result.band).toBe("strong");
  });

  it("is done with the parsed fit and its band", () => {
    const result = model({ opportunity: { fitStatus: "done", fit: STORED_FIT } });
    expect(result.view).toBe("done");
    expect(result.fit).toEqual(STORED_FIT);
    expect(result.band).toBe("strong");
  });

  it.each([
    [81, "strong"],
    [55, "partial"],
    [12, "weak"],
  ])("puts a score of %i in the %s band", (score, band) => {
    expect(model({ opportunity: { fitStatus: "done", fit: { ...STORED_FIT, score } } }).band).toBe(band);
  });

  it("falls back to none when the status says done but the stored fit does not parse", () => {
    const result = model({ opportunity: { fitStatus: "done", fit: { v: 2, score: "high" } } });
    expect(result.view).toBe("none");
    expect(result.fit).toBeNull();
    expect(result.band).toBeNull();
  });
});

describe("fitCardModel: readiness", () => {
  it("reads AI, posting and resume in that order", () => {
    expect(model({ aiOn: false, opportunity: { postingMd: null }, profile: { resumeMd: null } }).readiness).toBe("ai_off");
    expect(model({ opportunity: { postingMd: null }, profile: { resumeMd: null } }).readiness).toBe("no_posting");
    expect(model({ opportunity: { postingMd: "   " } }).readiness).toBe("no_posting");
    expect(model({ profile: { resumeMd: null } }).readiness).toBe("no_resume");
  });
});

describe("fitCardModel: profile changes and the good fit line", () => {
  const done = { fitStatus: "done" as const, fit: STORED_FIT };

  it("flags a profile saved after the score", () => {
    expect(model({ opportunity: done, profile: { updatedAt: new Date("2026-10-10T09:00:01.000Z") } }).profileChangedSince).toBe(true);
  });

  it("does not flag a profile saved before the score, at the same instant, or never saved", () => {
    expect(model({ opportunity: done, profile: { updatedAt: new Date("2026-10-10T08:59:59.000Z") } }).profileChangedSince).toBe(false);
    expect(model({ opportunity: done, profile: { updatedAt: new Date("2026-10-10T09:00:00.000Z") } }).profileChangedSince).toBe(false);
    expect(model({ opportunity: done, profile: { updatedAt: null } }).profileChangedSince).toBe(false);
  });

  it("does not flag a job without a stored fit", () => {
    expect(model({ profile: { updatedAt: NOW } }).profileChangedSince).toBe(false);
  });

  it("carries the good fit line from the preferences", () => {
    expect(model().threshold).toBe(70);
    expect(model({ profile: { preferences: parsePreferences({ scoreThreshold: 55 }) } }).threshold).toBe(55);
  });
});

describe("fitCardModel: hard filters", () => {
  it("passes everything and reports no filters set with empty preferences", () => {
    const result = model();
    expect(result.hasHardFilters).toBe(false);
    expect(result.hardFilters).toEqual({ pass: true, failed: [], unchecked: [] });
  });

  it("checks the job's own columns against the saved preferences", () => {
    const preferences = parsePreferences({ titles: ["Design Lead"], workModes: ["remote"], compFloor: 200 });
    const result = model({ profile: { preferences }, opportunity: { compMax: 150 } });
    expect(result.hasHardFilters).toBe(true);
    expect(result.hardFilters.pass).toBe(false);
    expect(result.hardFilters.failed).toEqual(["title", "work_mode", "pay"]);
  });

  it("reports a filter it could not check", () => {
    const preferences = parsePreferences({ workModes: ["remote"] });
    const result = model({ profile: { preferences }, opportunity: { workMode: null } });
    expect(result.hardFilters).toEqual({ pass: true, failed: [], unchecked: ["work_mode"] });
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/unit/fit-card-model.test.ts
```

Expected: the file fails to load, `Cannot find package '@/lib/fit/card'`.

- [ ] **Step 3: Write `lib/fit/messages.ts` and `lib/fit/card.ts` in full**

`messages.ts` holds every fixed line of the card and the helpers that build the lines with a variable in them. Nothing in it renders a time.

`lib/fit/messages.ts`:

```typescript
import type { HardFilter } from "@/lib/fit/hard-filters";

// Every line the fit card shows, in one place. Lines that carry a time are
// not built here: the card renders them in JSX around a LocalTime, because a
// LocalTime interpolated into a template string prints as [object Object].
export const FIT_MESSAGES = {
  heading: "Fit",
  whyItFits: "Why it fits",
  mayNotFit: "What may not fit",
  hardFilters: "Hard filters",
  changed: "Your profile changed after this score.",
  pending: "Scoring this job. This can take a few seconds.",
  stalled: "Scoring did not finish.",
  failed: "Scoring did not work this time. The job is saved as it is.",
  none: "This job has no fit score yet.",
  ai_off: "Fit scoring needs AI, and AI is not turned on for this server.",
  no_posting: "Fit scoring needs the posting text, and this job has none.",
  no_resume: "Add your resume in Settings to get a fit score.",
  openSettings: "Open Settings",
  scoreThisJob: "Score this job",
  tryAgain: "Try again",
  scoreAgain: "Score again",
  passes: "Passes your hard filters.",
  noFiltersSet: "No hard filters set.",
  setPreferences: "Set preferences",
} as const;

export const HARD_FILTER_LABELS: Record<HardFilter, string> = {
  title: "job title",
  work_mode: "work mode",
  location: "location",
  pay: "pay floor",
};

function labelList(filters: HardFilter[]): string {
  return filters.map((filter) => HARD_FILTER_LABELS[filter]).join(", ");
}

export function missesFiltersLine(failed: HardFilter[]): string {
  return `Misses your hard filters: ${labelList(failed)}.`;
}

export function uncheckedFiltersLine(unchecked: HardFilter[]): string {
  return `Not checked: ${labelList(unchecked)}.`;
}

// A score equal to the line counts as a good fit, as the Preferences hint says.
export function thresholdLine(score: number, threshold: number): string {
  return score >= threshold ? `Above your good-fit line of ${threshold}.` : `Below your good-fit line of ${threshold}.`;
}

export function scoredAnnouncement(subject: { roleTitle: string; companyName: string }, score: number): string {
  return `Scored ${subject.roleTitle} at ${subject.companyName}: ${score}.`;
}

export function scoreFailureToast(message: string): string {
  return `Could not score this job. ${message}`;
}
```

`lib/fit/card.ts`:

```typescript
import { fitBand, type FitBand } from "@/lib/fit/bands";
import { hardFilters, type HardFilterResult } from "@/lib/fit/hard-filters";
import { fitReadiness, type FitReadiness } from "@/lib/fit/readiness";
import { parseStoredFit, type StoredFit } from "@/lib/fit/stored";
import { hasHardFilters } from "@/lib/preferences/schema";
import type { OpportunityRow } from "@/lib/db/scoped";
import type { ProfileView } from "@/lib/profile/store";

// A run that has sat in `pending` this long was lost with its function
// instance; the card then offers a retry instead of polling for ever.
export const FIT_PENDING_STALE_MS = 120_000;
export const FIT_POLL_MS = 3_000;
export const FIT_POLL_MAX = 40;

export type FitCardView = "pending" | "stalled" | "failed" | "done" | "none";

export type FitCardModel = {
  opportunityId: string;
  roleTitle: string;
  companyName: string;
  view: FitCardView;
  readiness: FitReadiness;
  fit: StoredFit | null;
  band: FitBand | null;
  threshold: number;
  profileChangedSince: boolean;
  hardFilters: HardFilterResult;
  hasHardFilters: boolean;
};

type CardOpportunity = Pick<
  OpportunityRow,
  "id" | "roleTitle" | "fitStatus" | "fit" | "updatedAt" | "postingMd" | "location" | "workMode" | "compMin" | "compMax" | "compCurrency"
>;

function viewOf(opportunity: CardOpportunity, fit: StoredFit | null, now: Date): FitCardView {
  switch (opportunity.fitStatus) {
    case "pending":
      return now.getTime() - opportunity.updatedAt.getTime() > FIT_PENDING_STALE_MS ? "stalled" : "pending";
    case "failed":
      return "failed";
    // A done status whose document no longer parses has nothing to show.
    case "done":
      return fit ? "done" : "none";
    default:
      return "none";
  }
}

export function fitCardModel(input: {
  opportunity: CardOpportunity;
  companyName: string;
  profile: ProfileView;
  aiOn: boolean;
  now: Date;
}): FitCardModel {
  const { opportunity, profile } = input;
  const fit = parseStoredFit(opportunity.fit);
  const scoredAt = fit ? new Date(fit.scoredAt) : null;
  return {
    opportunityId: opportunity.id,
    roleTitle: opportunity.roleTitle,
    companyName: input.companyName,
    view: viewOf(opportunity, fit, input.now),
    readiness: fitReadiness({ aiOn: input.aiOn, postingMd: opportunity.postingMd, resumeMd: profile.resumeMd }),
    fit,
    band: fit ? fitBand(fit.score) : null,
    threshold: profile.preferences.scoreThreshold,
    profileChangedSince: scoredAt !== null && profile.updatedAt !== null && profile.updatedAt > scoredAt,
    hardFilters: hardFilters(opportunity, profile.preferences),
    hasHardFilters: hasHardFilters(profile.preferences),
  };
}
```

- [ ] **Step 4: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/fit-card-model.test.ts
```

Expected: `Tests  17 passed (17)`.

- [ ] **Step 5: Mutation check: drop the stale check**

In `lib/fit/card.ts`, replace the whole `return now.getTime() - ... ? "stalled" : "pending";` line inside `case "pending":` with `return "pending";`. Run the test.

Expected: `keeps pending at exactly the stale limit and calls it stalled one millisecond later` fails (`Tests  1 failed | 16 passed (17)`).

Revert, run again and confirm `Tests  17 passed (17)`.

- [ ] **Step 6: Write the failing test `tests/unit/fit-chip.test.tsx` in full**

It reads the chip through its `data-slot="badge"` root. The icon classes (`lucide-circle-check` and the like) are lucide's own, so a library rename would show up here first.

```typescript
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { FitChip } from "@/components/fit/fit-chip";

function renderChip(score: number, size?: "sm" | "default") {
  const { container } = render(<FitChip score={score} size={size} />);
  const chip = container.querySelector('[data-slot="badge"]') as HTMLElement;
  const mark = chip.querySelector("svg") as SVGElement;
  return { chip, mark };
}

describe("FitChip", () => {
  it("shows the number with screen-reader text that names the score and the band", () => {
    const { chip } = renderChip(81);
    expect(chip.textContent).toBe("Fit score 81, strong fit");
    const visible = Array.from(chip.childNodes)
      .filter((node) => !(node instanceof Element && (node.classList.contains("sr-only") || node.tagName === "svg")))
      .map((node) => node.textContent);
    expect(visible).toEqual(["81"]);
  });

  it("names the partial and weak bands", () => {
    expect(renderChip(55).chip.textContent).toBe("Fit score 55, partial fit");
    expect(renderChip(12).chip.textContent).toBe("Fit score 12, weak fit");
  });

  it("puts the band on the boundaries at 70 and 40", () => {
    expect(renderChip(70).chip.textContent).toContain("strong fit");
    expect(renderChip(69).chip.textContent).toContain("partial fit");
    expect(renderChip(40).chip.textContent).toContain("partial fit");
    expect(renderChip(39).chip.textContent).toContain("weak fit");
  });

  it("carries the tone on a hidden mark, one token per band", () => {
    for (const [score, token, icon] of [
      [81, "text-status-approved", "lucide-circle-check"],
      [55, "text-status-pending", "lucide-circle-dot"],
      [12, "text-status-action", "lucide-circle-minus"],
    ] as const) {
      const { mark } = renderChip(score);
      expect(mark.getAttribute("aria-hidden")).toBe("true");
      expect(mark.classList.contains(token)).toBe(true);
      expect(mark.classList.contains(icon)).toBe(true);
    }
  });

  it("never colors the label text", () => {
    const { chip } = renderChip(81);
    expect(chip.className).not.toMatch(/text-status-/);
    expect(chip.className).toMatch(/text-foreground/);
  });

  it("is larger in the default size than in the small one", () => {
    expect(renderChip(81, "sm").chip.className).not.toBe(renderChip(81, "default").chip.className);
    expect(renderChip(81).chip.className).toBe(renderChip(81, "default").chip.className);
  });
});
```

- [ ] **Step 7: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/unit/fit-chip.test.tsx
```

Expected: `Failed to resolve import "@/components/fit/fit-chip"`.

- [ ] **Step 8: Write `components/fit/fit-chip.tsx` in full**

```typescript
import { CircleCheck, CircleDot, CircleMinus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { FIT_BAND_WORDS, fitBand, type FitBand } from "@/lib/fit/bands";
import { cn } from "@/lib/utils";

// The tone rides on the mark, never on the label: the registry's rule for
// status colors, because the tokens are tuned for icons and not for text
// contrast.
const BAND_MARK: Record<FitBand, { Icon: typeof CircleCheck; tone: string }> = {
  strong: { Icon: CircleCheck, tone: "text-status-approved" },
  partial: { Icon: CircleDot, tone: "text-status-pending" },
  weak: { Icon: CircleMinus, tone: "text-status-action" },
};

export function FitChip({ score, size = "default" }: { score: number; size?: "sm" | "default" }) {
  const band = fitBand(score);
  const { Icon, tone } = BAND_MARK[band];
  return (
    <Badge variant="outline" className={cn("text-foreground", size === "default" && "h-6 px-2.5 text-sm")}>
      <Icon aria-hidden className={tone} />
      <span className="sr-only">Fit score </span>
      {score}
      <span className="sr-only">, {FIT_BAND_WORDS[band]}</span>
    </Badge>
  );
}
```

- [ ] **Step 9: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/fit-chip.test.tsx
```

Expected: `Tests  6 passed (6)`.

- [ ] **Step 10: Write the failing test `tests/unit/fit-card.test.tsx` in full**

`next/navigation`, `sonner` and the job actions are mocked at the top. The router object is created once in the hoisted block so `useRouter()` returns the same object on every render, as Next's does. Announcements are read from the live region (`aria-live="polite"`) rather than by text, because the failed view also shows the same sentence on the page.

```typescript
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const harness = vi.hoisted(() => ({
  refresh: vi.fn(),
  router: { refresh: undefined as unknown as () => void },
  toastError: vi.fn(),
}));
harness.router.refresh = harness.refresh;

vi.mock("next/navigation", () => ({ useRouter: () => harness.router }));
vi.mock("sonner", () => ({ toast: { error: harness.toastError } }));
vi.mock("@/app/(app)/jobs/[slug]/actions", () => ({ scoreFitAction: vi.fn() }));

import { scoreFitAction } from "@/app/(app)/jobs/[slug]/actions";
import { FitCard } from "@/components/fit/fit-card";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { FIT_POLL_MAX, FIT_POLL_MS, type FitCardModel } from "@/lib/fit/card";

const mockedScore = vi.mocked(scoreFitAction);

const FIT = {
  v: 1 as const,
  score: 81,
  summary: "A strong match for internal tools work.",
  pros: ["Eight years in design systems.", "Internal tools background."],
  cons: ["The posting does not state pay."],
  modelId: "fake-extractor",
  scoredAt: "2026-10-10T09:00:00.000Z",
};

function modelOf(overrides: Partial<FitCardModel> = {}): FitCardModel {
  return {
    opportunityId: "00000000-0000-4000-8000-000000000001",
    roleTitle: "Product Designer",
    companyName: "Northwind Traders",
    view: "none",
    readiness: "ready",
    fit: null,
    band: null,
    threshold: 70,
    profileChangedSince: false,
    hardFilters: { pass: true, failed: [], unchecked: [] },
    hasHardFilters: false,
    ...overrides,
  };
}

function doneModel(overrides: Partial<FitCardModel> = {}): FitCardModel {
  return modelOf({ view: "done", fit: FIT, band: "strong", ...overrides });
}

// The chip splits its text across a mark, hidden words and the number, so it
// is read from the badge itself.
function chipText(): string | undefined {
  return document.querySelector('[data-slot="badge"]')?.textContent ?? undefined;
}

function announced(): string | undefined {
  return document.querySelector('[aria-live="polite"]')?.textContent ?? undefined;
}

function renderCard(model: FitCardModel) {
  return render(
    <LiveAnnouncerProvider>
      <FitCard model={model} />
    </LiveAnnouncerProvider>,
  );
}

beforeEach(() => {
  harness.refresh.mockReset();
  harness.toastError.mockReset();
  mockedScore.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("FitCard: views", () => {
  it("none and ready: says there is no score yet and offers Score this job", () => {
    renderCard(modelOf());
    expect(screen.getByRole("heading", { level: 2, name: "Fit" })).toBeTruthy();
    expect(screen.getByText("This job has no fit score yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Score this job" })).toBeTruthy();
  });

  it.each([
    ["ai_off", "Fit scoring needs AI, and AI is not turned on for this server."],
    ["no_posting", "Fit scoring needs the posting text, and this job has none."],
  ] as const)("none and %s: explains and offers no button", (readiness, text) => {
    renderCard(modelOf({ readiness }));
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("none and no_resume: links to Settings", () => {
    renderCard(modelOf({ readiness: "no_resume" }));
    expect(screen.getByText(/Add your resume in Settings to get a fit score\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Settings" }).getAttribute("href")).toBe("/settings");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("pending: shows the pending line in the status region and no button", () => {
    renderCard(modelOf({ view: "pending" }));
    const line = screen.getByText("Scoring this job. This can take a few seconds.");
    expect(line.getAttribute("role")).toBe("status");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps the status region in the document for every view, empty when nothing is pending", () => {
    renderCard(modelOf());
    const regions = screen.getAllByRole("status");
    expect(regions.some((region) => region.tagName === "P" && region.textContent === "")).toBe(true);
  });

  it.each([
    ["stalled", "Scoring did not finish."],
    ["failed", "Scoring did not work this time. The job is saved as it is."],
  ] as const)("%s: shows its line and Try again", (view, text) => {
    renderCard(modelOf({ view }));
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("failed and not ready: shows the line and the reason, without a button", () => {
    renderCard(modelOf({ view: "failed", readiness: "ai_off" }));
    expect(screen.getByText("Scoring did not work this time. The job is saved as it is.")).toBeTruthy();
    expect(screen.getByText("Fit scoring needs AI, and AI is not turned on for this server.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("FitCard: done", () => {
  it("shows the chip, the line against the threshold, the summary and both lists", () => {
    renderCard(doneModel());
    expect(chipText()).toBe("Fit score 81, strong fit");
    expect(screen.getByText("Above your good-fit line of 70.")).toBeTruthy();
    expect(screen.getByText("A strong match for internal tools work.")).toBeTruthy();
    const pros = screen.getByRole("heading", { level: 3, name: "Why it fits" }).parentElement as HTMLElement;
    expect(within(pros).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Eight years in design systems.",
      "Internal tools background.",
    ]);
    const cons = screen.getByRole("heading", { level: 3, name: "What may not fit" }).parentElement as HTMLElement;
    expect(within(cons).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "The posting does not state pay.",
    ]);
    expect(screen.getByRole("button", { name: "Score again" })).toBeTruthy();
  });

  it("lets an 80-character word in the summary, a pro and a con break inside the word", () => {
    const word = "z".repeat(80);
    renderCard(doneModel({ fit: { ...FIT, summary: word, pros: [word], cons: [word] } }));
    const elements = screen.getAllByText(word);
    expect(elements).toHaveLength(3);
    for (const element of elements) expect(element.className).toContain("break-words");
  });

  it("says Below when the score is under the line, and Above at exactly the line", () => {
    const { unmount } = renderCard(doneModel({ threshold: 90 }));
    expect(screen.getByText("Below your good-fit line of 90.")).toBeTruthy();
    unmount();
    renderCard(doneModel({ threshold: 81 }));
    expect(screen.getByText("Above your good-fit line of 81.")).toBeTruthy();
  });

  it("omits an empty list and its heading", () => {
    renderCard(doneModel({ fit: { ...FIT, pros: [] } }));
    expect(screen.queryByRole("heading", { name: "Why it fits" })).toBeNull();
    expect(screen.getByRole("heading", { name: "What may not fit" })).toBeTruthy();
  });

  it("names the model and the time of the score", () => {
    renderCard(doneModel());
    const line = screen.getByText(/^Scored /);
    expect(line.textContent).toMatch(/^Scored .+ by fake-extractor\.$/);
    expect(line.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-10T09:00:00.000Z");
  });

  it("shows the profile-changed line only when the model says so", () => {
    const { unmount } = renderCard(doneModel());
    expect(screen.queryByText("Your profile changed after this score.")).toBeNull();
    unmount();
    renderCard(doneModel({ profileChangedSince: true }));
    expect(screen.getByText("Your profile changed after this score.")).toBeTruthy();
  });

  it("done and not ready: keeps the score and explains why it cannot be scored again", () => {
    renderCard(doneModel({ readiness: "no_resume" }));
    expect(chipText()).toBe("Fit score 81, strong fit");
    expect(screen.getByRole("link", { name: "Open Settings" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Score again" })).toBeNull();
  });
});

describe("FitCard: hard filters", () => {
  it("passes", () => {
    renderCard(modelOf({ hasHardFilters: true }));
    expect(screen.getByRole("heading", { level: 3, name: "Hard filters" })).toBeTruthy();
    expect(screen.getByText("Passes your hard filters.")).toBeTruthy();
  });

  it("lists the misses by their plain names", () => {
    renderCard(
      modelOf({ hasHardFilters: true, hardFilters: { pass: false, failed: ["title", "pay"], unchecked: [] } }),
    );
    expect(screen.getByText("Misses your hard filters: job title, pay floor.")).toBeTruthy();
    expect(screen.queryByText("Passes your hard filters.")).toBeNull();
  });

  it("lists what could not be checked next to a pass", () => {
    renderCard(
      modelOf({ hasHardFilters: true, hardFilters: { pass: true, failed: [], unchecked: ["location", "work_mode"] } }),
    );
    expect(screen.getByText("Passes your hard filters.")).toBeTruthy();
    expect(screen.getByText("Not checked: location, work mode.")).toBeTruthy();
  });

  it("with none set: says so and links to Preferences, even when AI is off", () => {
    renderCard(modelOf({ readiness: "ai_off", hasHardFilters: false }));
    expect(screen.getByText(/No hard filters set\./)).toBeTruthy();
    const link = screen.getByRole("link", { name: "Set preferences" });
    expect(link.getAttribute("href")).toBe("/preferences");
    // A link inside muted text needs more than color to stand out.
    expect(link.classList.contains("underline")).toBe(true);
    expect(screen.queryByText("Passes your hard filters.")).toBeNull();
  });
});

describe("FitCard: scoring from the card", () => {
  it("disables the button and shows the pending line while the action runs, then announces the score", async () => {
    let finish: (value: Awaited<ReturnType<typeof scoreFitAction>>) => void = () => {};
    mockedScore.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderCard(modelOf());
    const button = screen.getByRole("button", { name: "Score this job" }) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(button);
    });
    expect(mockedScore).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001");
    expect(button.disabled).toBe(true);
    expect(screen.getByText("Scoring this job. This can take a few seconds.").getAttribute("role")).toBe("status");
    await act(async () => {
      finish({ ok: true, data: { status: "done", score: 81 } });
    });
    await waitFor(() => expect(announced()).toBe("Scored Product Designer at Northwind Traders: 81."));
    expect(button.disabled).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(button));
  });

  it("announces the failure line when the run ended failed", async () => {
    mockedScore.mockResolvedValue({ ok: true, data: { status: "failed", score: null } });
    renderCard(modelOf({ view: "failed" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    await waitFor(() => expect(announced()).toBe("Scoring did not work this time. The job is saved as it is."));
  });

  it("toasts the message when the action refuses", async () => {
    mockedScore.mockResolvedValue({ ok: false, code: "not_ready", message: "This job cannot be scored yet." });
    renderCard(modelOf());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Score this job" }));
    });
    expect(harness.toastError).toHaveBeenCalledWith("Could not score this job. This job cannot be scored yet.");
  });

  it("toasts a generic message when the action rejects", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mockedScore.mockRejectedValue(new Error("network"));
    renderCard(modelOf());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Score this job" }));
    });
    expect(harness.toastError).toHaveBeenCalledWith("Could not score this job. Something went wrong. Try again.");
    error.mockRestore();
  });
});

describe("FitCard: polling while pending", () => {
  it("refreshes the page every three seconds and stops after forty refreshes", () => {
    vi.useFakeTimers();
    renderCard(modelOf({ view: "pending" }));
    expect(FIT_POLL_MS).toBe(3_000);
    expect(FIT_POLL_MAX).toBe(40);
    expect(harness.refresh).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(FIT_POLL_MS - 1);
    });
    expect(harness.refresh).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(harness.refresh).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(FIT_POLL_MS * (FIT_POLL_MAX - 1));
    });
    expect(harness.refresh).toHaveBeenCalledTimes(FIT_POLL_MAX);
    act(() => {
      vi.advanceTimersByTime(FIT_POLL_MS * 10);
    });
    expect(harness.refresh).toHaveBeenCalledTimes(FIT_POLL_MAX);
  });

  it("does not poll for any other view", () => {
    vi.useFakeTimers();
    for (const view of ["none", "stalled", "failed"] as const) {
      const { unmount } = renderCard(modelOf({ view }));
      act(() => {
        vi.advanceTimersByTime(FIT_POLL_MS * 5);
      });
      unmount();
    }
    const { unmount } = renderCard(doneModel());
    act(() => {
      vi.advanceTimersByTime(FIT_POLL_MS * 5);
    });
    unmount();
    expect(harness.refresh).not.toHaveBeenCalled();
  });

  it("stops polling the moment the page shows a result", () => {
    vi.useFakeTimers();
    const { rerender } = renderCard(modelOf({ view: "pending" }));
    act(() => {
      vi.advanceTimersByTime(FIT_POLL_MS * 2);
    });
    expect(harness.refresh).toHaveBeenCalledTimes(2);
    rerender(
      <LiveAnnouncerProvider>
        <FitCard model={doneModel()} />
      </LiveAnnouncerProvider>,
    );
    act(() => {
      vi.advanceTimersByTime(FIT_POLL_MS * 5);
    });
    expect(harness.refresh).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 11: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/unit/fit-card.test.tsx
```

Expected: `Failed to resolve import "@/components/fit/fit-card"`.

- [ ] **Step 12: Write `components/fit/fit-card.tsx` in full**

Read `components/live-announcer.tsx` and `lib/dom/focus.ts` first if either is unfamiliar: the card announces through `useAnnounce()` and restores focus through `correctFocusOnceLost`, as `next-action-bar.tsx` and `board.tsx` do.

```typescript
"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { scoreFitAction } from "@/app/(app)/jobs/[slug]/actions";
import { FitChip } from "@/components/fit/fit-chip";
import { useAnnounce } from "@/components/live-announcer";
import { LocalTime } from "@/components/local-time";
import { Button } from "@/components/ui/button";
import { FIT_POLL_MAX, FIT_POLL_MS, type FitCardModel } from "@/lib/fit/card";
import {
  FIT_MESSAGES,
  missesFiltersLine,
  scoreFailureToast,
  scoredAnnouncement,
  thresholdLine,
  uncheckedFiltersLine,
} from "@/lib/fit/messages";
import { correctFocusOnceLost } from "@/lib/dom/focus";
import { messageFor } from "@/lib/pipeline/messages";

// Underlined at rest: a link inside a line of muted text must differ from the
// text by more than color (axe link-in-text-block).
const LINK_CLASS = "text-foreground underline underline-offset-4";

function buttonLabel(view: FitCardModel["view"]): string | null {
  if (view === "none") return FIT_MESSAGES.scoreThisJob;
  if (view === "failed" || view === "stalled") return FIT_MESSAGES.tryAgain;
  if (view === "done") return FIT_MESSAGES.scoreAgain;
  return null;
}

export function FitCard({ model }: { model: FitCardModel }) {
  const headingId = React.useId();
  const router = useRouter();
  const announce = useAnnounce();
  const [isScoring, startScoring] = React.useTransition();
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  // Kept outside the effect so a re-run of it (the router object changing)
  // cannot hand a stuck run a fresh budget of refreshes. It starts over
  // only once the view leaves `pending`.
  const refreshesRef = React.useRef(0);

  React.useEffect(() => {
    if (model.view !== "pending") {
      refreshesRef.current = 0;
      return;
    }
    const timer = window.setInterval(() => {
      if (refreshesRef.current >= FIT_POLL_MAX) {
        window.clearInterval(timer);
        return;
      }
      refreshesRef.current += 1;
      router.refresh();
    }, FIT_POLL_MS);
    return () => window.clearInterval(timer);
  }, [model.view, router]);

  function score() {
    startScoring(async () => {
      try {
        const result = await scoreFitAction(model.opportunityId);
        if (!result.ok) {
          toast.error(scoreFailureToast(result.message));
          return;
        }
        const run = result.data;
        if (run.status === "done" && run.score !== null) announce(scoredAnnouncement(model, run.score));
        else announce(run.status === "failed" ? FIT_MESSAGES.failed : FIT_MESSAGES.none);
      } catch (error) {
        // The action can reject before it returns a Result, for example when
        // the session lookup cannot reach the database.
        console.error("score failed", error);
        toast.error(scoreFailureToast(messageFor("unexpected")));
      } finally {
        // The button is disabled while the action runs, and Chromium moves
        // focus to <body> when a focused button becomes disabled.
        correctFocusOnceLost(() => buttonRef.current?.focus());
      }
    });
  }

  const { fit, hardFilters } = model;
  const canScore = model.readiness === "ready";
  const label = buttonLabel(model.view);
  const showReason = model.view !== "pending" && !canScore;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-base font-semibold text-foreground">
        {FIT_MESSAGES.heading}
      </h2>

      {model.view === "done" && fit ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <FitChip score={fit.score} />
            <p className="text-sm text-muted-foreground">{thresholdLine(fit.score, model.threshold)}</p>
          </div>
          <p className="break-words text-foreground">{fit.summary}</p>
          {fit.pros.length > 0 ? (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium text-foreground">{FIT_MESSAGES.whyItFits}</h3>
              <ul className="list-disc pl-5 text-sm text-foreground">
                {fit.pros.map((pro, index) => (
                  <li key={index} className="break-words">
                    {pro}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {fit.cons.length > 0 ? (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium text-foreground">{FIT_MESSAGES.mayNotFit}</h3>
              <ul className="list-disc pl-5 text-sm text-foreground">
                {fit.cons.map((con, index) => (
                  <li key={index} className="break-words">
                    {con}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-sm text-muted-foreground">
            Scored <LocalTime value={fit.scoredAt} mode="datetime" /> by {fit.modelId}.
          </p>
          {model.profileChangedSince ? (
            <p className="text-sm text-muted-foreground">{FIT_MESSAGES.changed}</p>
          ) : null}
        </>
      ) : model.view !== "pending" ? (
        <p className="text-sm text-muted-foreground">{FIT_MESSAGES[model.view === "done" ? "none" : model.view]}</p>
      ) : null}

      {/* Always in the document, so a screen reader hears the line when it
          appears; empty unless a run is in flight. */}
      <p role="status" className="text-sm text-muted-foreground">
        {model.view === "pending" || isScoring ? FIT_MESSAGES.pending : null}
      </p>

      {showReason ? (
        <p className="text-sm text-muted-foreground">
          {FIT_MESSAGES[model.readiness as "ai_off" | "no_posting" | "no_resume"]}
          {model.readiness === "no_resume" ? (
            <>
              {" "}
              <Link href="/settings" className={LINK_CLASS}>
                {FIT_MESSAGES.openSettings}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      {label && canScore ? (
        <div>
          <Button ref={buttonRef} variant="outline" size="sm" disabled={isScoring} onClick={score}>
            {label}
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-foreground">{FIT_MESSAGES.hardFilters}</h3>
        {model.hasHardFilters ? (
          <>
            <p className="text-sm text-foreground">
              {hardFilters.failed.length > 0 ? missesFiltersLine(hardFilters.failed) : FIT_MESSAGES.passes}
            </p>
            {hardFilters.unchecked.length > 0 ? (
              <p className="text-sm text-muted-foreground">{uncheckedFiltersLine(hardFilters.unchecked)}</p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {FIT_MESSAGES.noFiltersSet}{" "}
            <Link href="/preferences" className={LINK_CLASS}>
              {FIT_MESSAGES.setPreferences}
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 13: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/fit-card.test.tsx
```

Expected: `Tests  27 passed (27)`.

- [ ] **Step 14: Mutation checks: never stop polling, and skip the focus restore**

In `components/fit/fit-card.tsx`, delete the four lines `if (refreshesRef.current >= FIT_POLL_MAX) { window.clearInterval(timer); return; }` from the interval callback. Run the test.

Expected: `refreshes the page every three seconds and stops after forty refreshes` fails (`Tests  1 failed | 26 passed (27)`).

Revert, then:

In the same file replace `correctFocusOnceLost(() => buttonRef.current?.focus());` with `void correctFocusOnceLost;`. Run the test.

Expected: `disables the button and shows the pending line while the action runs, then announces the score` fails on its last assertion (focus stays on `<body>`).

Revert, then:

In the same file set `LINK_CLASS` back to `"text-primary underline-offset-4 hover:underline"`. Run the test.

Expected: `with none set: says so and links to Preferences, even when AI is off` fails (`Tests  1 failed | 26 passed (27)`).

Revert, then:

In the same file delete `break-words` from the summary paragraph `<p className="break-words text-foreground">{fit.summary}</p>` (or from the `li` of the pros or the cons). Run the test.

Expected: `lets an 80-character word in the summary, a pro and a con break inside the word` fails (`Tests  1 failed | 26 passed (27)`).

Revert and run the file again to confirm `Tests  27 passed (27)`. Then run both fit files under other runtime zones (nothing here may depend on `TZ`):

```bash
for tz in UTC America/Toronto Pacific/Auckland; do TZ=$tz pnpm exec vitest run tests/unit/fit-card-model.test.ts tests/unit/fit-card.test.tsx; done
```

Expected: `Tests  44 passed (44)` three times.

- [ ] **Step 15: Write the board card helper and the chip tests for `JobCard` and `PhoneBoard`**

`tests/helpers/board-card.ts` builds a `BoardCard` for component tests; Task 11 reuses it. Both test files here are new (nothing rendered these components before). Task 11 replaces them in full, so the cases below carry over unchanged.

`tests/helpers/board-card.ts`:

```typescript
import type { BoardCard } from "@/lib/db/scoped";

export const BOARD_NOW = new Date("2026-10-11T12:00:00.000Z");

/** A saved-column card for component tests. Override only what a test cares about. */
export function boardCard(overrides: Partial<BoardCard> = {}): BoardCard {
  return {
    id: "00000000-0000-4000-8000-0000000000a1",
    slug: "product-designer-northwind-traders",
    roleTitle: "Product Designer",
    companyName: "Northwind Traders",
    fitScore: null,
    nextAction: null,
    nextActionAt: null,
    updatedAt: BOARD_NOW,
    stage: { id: "00000000-0000-4000-8000-0000000000b1", kind: "saved", label: "Saved", enteredAt: null },
    ...overrides,
  };
}
```

`tests/unit/job-card.test.tsx`:

```typescript
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";

import { JobCard } from "@/components/board/job-card";
import { BOARD_NOW, boardCard } from "../helpers/board-card";
import type { BoardCard } from "@/lib/db/scoped";

function renderCard(card: BoardCard) {
  return render(
    <DndContext>
      <JobCard card={card} now={BOARD_NOW} onMove={vi.fn()} onRequestClose={vi.fn()} />
    </DndContext>,
  );
}

function chips(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-slot="badge"]')).map((badge) => badge.textContent ?? "");
}

describe("JobCard: fit chip", () => {
  it("shows the banded chip with its screen-reader text when the job has a score", () => {
    const { container } = renderCard(boardCard({ fitScore: 81 }));
    expect(chips(container)).toEqual(["Fit score 81, strong fit"]);
    expect(container.querySelector("svg.text-status-approved")).not.toBeNull();
  });

  it("shows the partial and weak marks for lower scores", () => {
    expect(chips(renderCard(boardCard({ fitScore: 55 })).container)).toEqual(["Fit score 55, partial fit"]);
    expect(chips(renderCard(boardCard({ id: "other", fitScore: 12 })).container)).toEqual(["Fit score 12, weak fit"]);
  });

  it("shows no chip for a job without a score", () => {
    const { container } = renderCard(boardCard({ fitScore: null }));
    expect(chips(container)).toEqual([]);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/jobs/product-designer-northwind-traders");
  });

  it("keeps the stage label chip after the fit chip", () => {
    const { container } = renderCard(
      boardCard({ fitScore: 81, stage: { id: "s", kind: "saved", label: "Wishlist", enteredAt: null } }),
    );
    expect(chips(container)).toEqual(["Fit score 81, strong fit", "Wishlist"]);
  });
});
```

`tests/unit/phone-board.test.tsx`:

```typescript
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/app/(app)/board/actions", () => ({ moveAction: vi.fn(), closeAction: vi.fn(), addJobAction: vi.fn() }));

import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { PhoneBoard } from "@/components/board/phone-board";
import { BOARD_NOW, boardCard } from "../helpers/board-card";
import type { BoardCard } from "@/lib/db/scoped";

function renderBoard(cards: BoardCard[]) {
  return render(
    <LiveAnnouncerProvider>
      <PhoneBoard cards={cards} nowIso={BOARD_NOW.toISOString()} companyNames={["Northwind Traders"]} />
    </LiveAnnouncerProvider>,
  );
}

function chips(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-slot="badge"]')).map((badge) => badge.textContent ?? "");
}

describe("PhoneBoard: fit chip", () => {
  it("shows the banded chip on a scored job", () => {
    const { container } = renderBoard([boardCard({ fitScore: 81 })]);
    expect(chips(container)).toEqual(["Fit score 81, strong fit"]);
    expect(container.querySelector("svg.text-status-approved")).not.toBeNull();
  });

  it("shows no chip on an unscored job", () => {
    const { container } = renderBoard([boardCard({ fitScore: null })]);
    expect(chips(container)).toEqual([]);
  });
});
```

- [ ] **Step 16: Run them and confirm the chip cases fail**

```bash
pnpm exec vitest run tests/unit/job-card.test.tsx tests/unit/phone-board.test.tsx
```

Expected: four fail because the cards still print a bare number in a secondary `Badge` (`expected [ '81' ] to deeply equal [ 'Fit score 81, strong fit' ]`); the two "no chip" cases pass (`Tests  4 failed | 2 passed (6)`).

- [ ] **Step 17: Swap the badge for `FitChip` in both boards**

Apply this diff to `components/board/job-card.tsx`:

```diff
@@ -5,6 +5,7 @@ import Link from "next/link";
 import { useDraggable } from "@dnd-kit/core";
 
 import { Badge } from "@/components/ui/badge";
+import { FitChip } from "@/components/fit/fit-chip";
 import { LocalTime } from "@/components/local-time";
 import { MoveMenu } from "@/components/board/move-menu";
 import { daysInStage } from "@/lib/board/days";
@@ -105,7 +106,7 @@ export function JobCard({ card, now, onMove, onRequestClose, overlay }: JobCardP
       </div>
       {hasChips && (
         <div className="mt-2 flex flex-wrap items-center gap-1.5">
-          {card.fitScore !== null && <Badge variant="secondary">{card.fitScore}</Badge>}
+          {card.fitScore !== null && <FitChip score={card.fitScore} size="sm" />}
           {showStageLabel && <Badge variant="outline">{card.stage.label}</Badge>}
           {days !== null && <Badge variant="outline">{daysLabel(days)}</Badge>}
         </div>
```

Apply this diff to `components/board/phone-board.tsx`:

```diff
@@ -6,6 +6,7 @@ import { toast } from "sonner";
 
 import { Button } from "@/components/ui/button";
 import { Badge } from "@/components/ui/badge";
+import { FitChip } from "@/components/fit/fit-chip";
 import { EmptyState } from "@/components/super-ai/empty-state";
 import { LocalTime } from "@/components/local-time";
 import { useAnnounce } from "@/components/live-announcer";
@@ -256,7 +257,7 @@ export function PhoneBoard({
                         </div>
                         {hasChips && (
                           <div className="mt-2 flex flex-wrap items-center gap-1.5">
-                            {card.fitScore !== null && <Badge variant="secondary">{card.fitScore}</Badge>}
+                            {card.fitScore !== null && <FitChip score={card.fitScore} size="sm" />}
                             {showStageLabel && <Badge variant="outline">{card.stage.label}</Badge>}
                             {days !== null && <Badge variant="outline">{daysLabel(days)}</Badge>}
                           </div>
```

- [ ] **Step 18: Run them and confirm they pass**

```bash
pnpm exec vitest run tests/unit/job-card.test.tsx tests/unit/phone-board.test.tsx
```

Expected: `Tests  6 passed (6)`.

- [ ] **Step 19: Write the failing test `tests/unit/tab-overview.test.tsx` in full**

It pins the order of the Overview sections: the fit card comes first. The company dialog's action module is mocked because `TabOverview` renders `EditCompanyDialogTrigger`.

```typescript
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(app)/jobs/[slug]/actions", () => ({ scoreFitAction: vi.fn(), updateCompanyDetailsAction: vi.fn() }));

import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { TabOverview } from "@/components/job/tab-overview";
import type { FitCardModel } from "@/lib/fit/card";
import type { CompanyRow } from "@/lib/db/scoped";

const FIT: FitCardModel = {
  opportunityId: "00000000-0000-4000-8000-000000000001",
  roleTitle: "Product Designer",
  companyName: "Northwind Traders",
  view: "none",
  readiness: "ready",
  fit: null,
  band: null,
  threshold: 70,
  profileChangedSince: false,
  hardFilters: { pass: true, failed: [], unchecked: [] },
  hasHardFilters: false,
};

const COMPANY = {
  id: "00000000-0000-4000-8000-0000000000c1",
  name: "Northwind Traders",
  domain: null,
  careersUrl: null,
  size: null,
  industry: null,
  hq: null,
  notesMd: null,
} as unknown as CompanyRow;

describe("TabOverview", () => {
  it("puts the fit card before the posting, pay and company sections", () => {
    render(
      <LiveAnnouncerProvider>
        <TabOverview
          opportunity={{
            postingMd: "About the job",
            postingCapturedAt: null,
            compMin: null,
            compMax: null,
            compCurrency: null,
            compNote: null,
            myAsk: null,
          }}
          company={COMPANY}
          opportunityId={FIT.opportunityId}
          fit={FIT}
        />
      </LiveAnnouncerProvider>,
    );
    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual(["Fit", "Posting", "Pay", "Company"]);
  });
});
```

```bash
pnpm exec vitest run tests/unit/tab-overview.test.tsx
```

Run it. Expected: it fails with `Tests  1 failed (1)`, because `TabOverview` ignores the new `fit` prop and its headings are `Posting`, `Pay`, `Company`.

- [ ] **Step 20: Show the card and the chip: header, Overview and the job page**

Apply this diff to `components/job/job-header.tsx` (the chip sits beside the `h1`):

```diff
@@ -14,6 +14,7 @@ import {
 import { CloseDialog } from "@/components/board/close-dialog";
 import { EditDetailsDialog } from "@/components/job/edit-details-dialog";
 import { ReviewNotice } from "@/components/job/review-notice";
+import { FitChip } from "@/components/fit/fit-chip";
 import { LocalTime } from "@/components/local-time";
 import { useAnnounce } from "@/components/live-announcer";
 import { closeAction, reopenAction } from "@/app/(app)/board/actions";
@@ -47,9 +48,10 @@ interface JobHeaderProps {
   };
   companyName: string;
   needsReview: boolean;
+  fitScore: number | null;
 }
 
-export function JobHeader({ opportunity, companyName, needsReview }: JobHeaderProps) {
+export function JobHeader({ opportunity, companyName, needsReview, fitScore }: JobHeaderProps) {
   const [editOpen, setEditOpen] = React.useState(false);
   const [closeOpen, setCloseOpen] = React.useState(false);
   const [isReopenPending, startReopenTransition] = React.useTransition();
@@ -142,7 +144,10 @@ export function JobHeader({ opportunity, companyName, needsReview }: JobHeaderPr
     <header className="flex flex-col gap-3">
       <div className="flex items-start justify-between gap-2">
         <div className="min-w-0">
-          <h1 className="text-xl font-semibold text-foreground">{opportunity.roleTitle}</h1>
+          <div className="flex flex-wrap items-center gap-2">
+            <h1 className="min-w-0 text-xl font-semibold break-words text-foreground">{opportunity.roleTitle}</h1>
+            {fitScore !== null ? <FitChip score={fitScore} /> : null}
+          </div>
-          <p className="text-muted-foreground">
+          <p className="break-words text-muted-foreground">
             {companyName}
             {opportunity.location ? <> · {opportunity.location}</> : null}
```

The `h1` and the company line gain `break-words` (and the `h1` `min-w-0`) so a role or company name of 80 characters with no space wraps instead of widening the page. No unit test renders `JobHeader`; the phone spec in Task 12 (`an 80-character role and company name wrap...`) is the check, and without these classes it fails with the job page 734 px wide at 390 px.

Apply this diff to `components/job/tab-overview.tsx` (the fit card is the first section):

```diff
@@ -1,7 +1,9 @@
 import { DetailFields, type DetailField } from "@/components/super-ai/detail-fields";
+import { FitCard } from "@/components/fit/fit-card";
 import { EditCompanyDialogTrigger } from "@/components/job/edit-company-dialog";
 import { Markdown } from "@/components/markdown";
 import { LocalTime } from "@/components/local-time";
+import type { FitCardModel } from "@/lib/fit/card";
 import type { CompanyRow } from "@/lib/db/scoped";
 
 interface TabOverviewOpportunity {
@@ -34,10 +36,12 @@ export function TabOverview({
   opportunity,
   company,
   opportunityId,
+  fit,
 }: {
   opportunity: TabOverviewOpportunity;
   company: CompanyRow;
   opportunityId: string;
+  fit: FitCardModel;
 }) {
   const payFields: DetailField[] = [
     { id: "range", label: "Pay range", value: formatPayRange(opportunity.compMin, opportunity.compMax, opportunity.compCurrency) },
@@ -68,6 +72,10 @@ export function TabOverview({
 
   return (
     <section aria-label="Overview" className="flex flex-col gap-6 py-4">
+      {/* First, above the posting: a posting can run to thousands of words,
+          and the score is what the reader came here to see. */}
+      <FitCard model={fit} />
+
       <div className="flex flex-col gap-2">
         <h2 className="text-base font-semibold text-foreground">Posting</h2>
         {opportunity.postingMd ? (
```

Apply this diff to `app/(app)/jobs/[slug]/page.tsx` (the page already exports `maxDuration = 60` from Task 4; leave it):

```diff
@@ -1,5 +1,8 @@
 import { notFound } from "next/navigation";
 import { requireUser } from "@/lib/auth/session";
+import { getAiDriver } from "@/lib/ai";
+import { fitCardModel } from "@/lib/fit/card";
+import { loadProfile } from "@/lib/profile/store";
 import { scopedFor } from "@/lib/db/scoped";
 import { getJobView } from "@/lib/pipeline/read";
 import { toOpportunityState, stageControlsFor } from "@/lib/pipeline/stage-controls";
@@ -47,12 +50,25 @@ export default async function JobPage(props: PageProps<"/jobs/[slug]">) {
   const tab = resolveTab(searchParams.tab);
   const docRef = parseDocRef(searchParams.doc);
   const version = resolveVersion(searchParams.v);
+  const profile = await loadProfile(s);
+  const fit = fitCardModel({
+    opportunity: view.opportunity,
+    companyName: view.company.name,
+    profile,
+    aiOn: getAiDriver() !== null,
+    now: new Date(),
+  });
   const stageOptions = view.stages.map((stage) => ({ id: stage.id, label: stage.label }));
   const basePath = `/jobs/${slug}`;
 
   return (
     <div className="flex flex-col gap-6 p-6">
-      <JobHeader opportunity={view.opportunity} companyName={view.company.name} needsReview={view.opportunity.needsReview} />
+      <JobHeader
+        opportunity={view.opportunity}
+        companyName={view.company.name}
+        needsReview={view.opportunity.needsReview}
+        fitScore={view.opportunity.fitScore}
+      />
       <StageStepper
         opportunity={view.opportunity}
         companyName={view.company.name}
@@ -64,7 +80,7 @@ export default async function JobPage(props: PageProps<"/jobs/[slug]">) {
       <div>
         <JobTabs activeTab={tab} basePath={basePath} />
         {tab === "overview" && (
-          <TabOverview opportunity={view.opportunity} company={view.company} opportunityId={view.opportunity.id} />
+          <TabOverview opportunity={view.opportunity} company={view.company} opportunityId={view.opportunity.id} fit={fit} />
         )}
         {tab === "research" && (
           <TabResearch
```

- [ ] **Step 21: Run the card tests and confirm they pass**

```bash
pnpm exec vitest run tests/unit/tab-overview.test.tsx tests/unit/job-card.test.tsx tests/unit/phone-board.test.tsx tests/unit/fit-card.test.tsx tests/unit/fit-chip.test.tsx tests/unit/fit-card-model.test.ts
```

Expected: `Tests  57 passed (57)`.

- [ ] **Step 22: Mutation check: the card is not first**

In `components/job/tab-overview.tsx`, delete the line `<FitCard model={fit} />` (the comment above it can stay). Run the test.

Expected: `puts the fit card before the posting, pay and company sections` fails (`Tests  1 failed (1)`).

Revert and run the file again to confirm it passes.

- [ ] **Step 23: Run the wider checks**

```bash
pnpm typecheck
```

Expected: exit 0.

```bash
pnpm lint
```

Expected: exit 0, ending in `check:tokens: scanned 68 files, no violations.`

```bash
pnpm test
```

Expected: `Test Files  150 passed | 1 skipped (151)` and `Tests  1639 passed | 2 skipped (1641)` (6 new files and 57 new tests on top of Task 9's 144 files and 1582 tests).

- [ ] **Step 24: Commit**

```bash
git add lib/fit/card.ts lib/fit/messages.ts components/fit/fit-chip.tsx components/fit/fit-card.tsx components/board/job-card.tsx components/board/phone-board.tsx components/job/job-header.tsx components/job/tab-overview.tsx "app/(app)/jobs/[slug]/page.tsx" tests/unit/fit-card-model.test.ts tests/unit/fit-chip.test.tsx tests/unit/fit-card.test.tsx tests/unit/job-card.test.tsx tests/unit/phone-board.test.tsx tests/unit/tab-overview.test.tsx tests/helpers/board-card.ts
git commit -m "$(cat <<'EOF'
feat: add the fit card, fit chips and the header fit chip

EOF
)"
```

End the message with the co-author trailer supplied by the executing session.

---

### Task 11: Next action offer

**Files:**
- Create: `components/next-action/offer.ts`, `components/next-action/set-next-action-dialog.tsx`, `tests/unit/offer.test.ts`, `tests/unit/set-next-action-dialog.test.tsx`, `tests/unit/board.test.tsx`, `tests/unit/stage-detail-sheet.test.tsx`, `tests/unit/stage-stepper.test.tsx`, `tests/unit/next-action-bar.test.tsx`
- Modify: `lib/board/keys.ts`, `components/board/board.tsx`, `components/board/phone-board.tsx`, `components/board/job-card.tsx`, `components/job/stage-stepper.tsx`, `components/job/stage-detail-sheet.tsx`, `components/job/next-action-bar.tsx`, `tests/unit/board-keys.test.ts`, `tests/unit/job-card.test.tsx` (replaced in full), `tests/unit/phone-board.test.tsx` (replaced in full)

**Interfaces:**
- Consumes: `setNextActionAction(opportunityId, _prev, formData)` and its `text` and `at` fields (Milestone 2, `app/(app)/jobs/[slug]/actions.ts`, unmodified; it validates with `Enter what is next.` and `Enter a real date and time.`), `LocalDateTimeInput` (Task 1, zone-aware), `FieldRow`, `Dialog` parts, `Button`, `Input`, `useAnnounce`, `submitViaTransition`, `FormState`, `correctFocusOnceLost`, `focusCardLink`, `focusCardButton` (Milestones 1 to 4), `boardCard` and `BOARD_NOW` from `tests/helpers/board-card.ts` (Task 10), the `FitChip` cases in `job-card.test.tsx` and `phone-board.test.tsx` (Task 10), `sonner`'s `toast` (Milestone 1). No other task of this milestone is needed.
- Produces (copied from the README's Contract character for character):

```typescript
// components/next-action/offer.ts
export const NEXT_ACTION_OFFER_MS = 10_000;
export function offerNextAction(subject: { roleTitle: string; companyName: string }, open: () => void): void;   // toast(text, { action: { label: "Set next action", onClick: open }, duration: NEXT_ACTION_OFFER_MS })
// components/next-action/set-next-action-dialog.tsx ("use client")
export type NextActionSubject = { id: string; roleTitle: string; companyName: string; nextAction: string | null; nextActionAt: Date | null };
export function SetNextActionDialog(props: { subject: NextActionSubject | null; onClose: (saved: boolean) => void }): React.ReactElement;   // open while subject is not null
// lib/board/keys.ts
export type BoardKeyAction = { type: "move"; kind: StageKind } | { type: "close" } | { type: "next_action" };   // "n" or "N"
```

Signature changes inside the milestone (every caller is updated in this task; no existing test renders these components): `JobCard` gains the required prop `onRequestNextAction: () => void`; `StageDetailSheet` gains the required prop `onMoved: () => void`; `StageStepper`'s `opportunity` prop widens to `{ id; roleTitle; status; nextAction; nextActionAt }` (the job page already passes a full `OpportunityRow`).

Rules this task enforces:

- Sonner returns focus to the element that had it before a toast took focus, once focus leaves the toaster. The toast button therefore blurs itself before it calls `open`, so the return happens first and cannot pull focus out of the dialog (found in a real browser: the dialog opened, its field took focus, and focus was then sent back to the card behind it).
- Nothing opens on its own. After a successful move from the board (a drop, a digit key, the Move menu), from the phone sheet, and from the job page's stage sheet (`Move here`), `offerNextAction` shows one toast, `What is next for <role> at <company>?`, with the button `Set next action` and a ten second life. The button (or sonner's toast hotkey, Alt+T) opens `SetNextActionDialog`. On a focused desktop board card, `n` or `N` opens the dialog directly.
- The offer is made only after `result.ok` is known to be true, never for a refused move, a rejected request, or a move to the card's own column (which `runMove` already treats as no move).
- The dialog is `Set the next action`, described as `<role> at <company>`, with `What is next` (name `text`, focused on open), `When` (a `LocalDateTimeInput` named `at`, seeded with the ISO instant), a `role="alert"` message on failure, and `Cancel` and `Save` in the footer. It reuses `setNextActionAction` as it is. A successful save announces `Next action saved for <role> at <company>.` and calls `onClose(true)` exactly once; `Cancel`, Escape and a click outside call `onClose(false)`; a failure keeps it open and refocuses `Save` (Chromium drops focus to `<body>` when the clicked button is disabled while pending). The form takes a snapshot of its subject at mount, so a revalidation while it is open cannot change an uncontrolled default value.
- Focus: Base UI returns focus to whatever opened a dialog, but here the opener was the toast's button, which is gone, and on the board the card may have moved column since. So each host calls `correctFocusOnceLost` on close: `Board` focuses the card's title link (`focusCardLink`), `PhoneBoard` the card's `Move to` button (`focusCardButton`), `StageStepper` the element carrying `data-next-action-trigger` (`NextActionBar`'s `Add` or `Edit`, whichever the job's state shows; looked up at the moment focus is lost, because a save replaces `Add` with `Edit`).
- Each board mounts `SetNextActionDialog` once, as a stable sibling next to `AddJobDialog`, outside the empty and populated branches.
- A role or company name of 80 characters with no space must wrap inside the dialog at 390 px. The `DialogDescription` that names the job carries `break-words`, and the `form` (a grid item of the dialog, whose intrinsic width is that of its longest word unless it may shrink) carries `min-w-0`. The unit test asserts both classes; the phone spec in Task 12 measures it.
- The board's screen-reader drag instructions gain the sentence `Press N to set its next action.` (the keyboard help has to name the new key).
- `JobCard`'s key handler keeps every existing guard (events from inside a portal, modifier keys, held keys, text fields) in front of the new `n` case.
- Existing tests that change: `tests/unit/board-keys.test.ts` gains two cases. `tests/unit/job-card.test.tsx` and `tests/unit/phone-board.test.tsx` (new in Task 10) are replaced in full with versions that keep every Task 10 case and add the new ones. Nothing else changes, and the whole suite stays green.
- Tests that use `correctFocusOnceLost` fake the clock with `vi.useFakeTimers({ shouldAdvanceTime: true })` and call `vi.clearAllTimers()` after each test. Without that, one test's one-and-a-half-second polling refocuses the next test's card and hides a missing focus restore (found while writing these tests: the mutation check that skips the restore passed until the clock was faked). `shouldAdvanceTime` is needed because Testing Library's `waitFor` hangs on a clock that never moves.
- Next 16 docs: this task uses no new Next API. It adds no `after()` call and no route. Nothing in it reads `process.env`.
- For the end-to-end task: every successful move now leaves a ten second toast at the bottom of the screen. A spec that moves a card and then scans with axe, or taps near the bottom edge on the phone viewport, should dismiss it or wait it out first.

- [ ] **Step 1: Add the `n` cases to `tests/unit/board-keys.test.ts`**

Apply this diff:

```diff
@@ -14,11 +14,17 @@ describe("keyToAction", () => {
     expect(keyToAction("C")).toEqual({ type: "close" });
   });
 
+  it("maps n and N to the next action", () => {
+    expect(keyToAction("n")).toEqual({ type: "next_action" });
+    expect(keyToAction("N")).toEqual({ type: "next_action" });
+  });
+
   it("returns null for 0, 8 and other keys", () => {
     expect(keyToAction("0")).toBeNull();
     expect(keyToAction("8")).toBeNull();
     expect(keyToAction("Enter")).toBeNull();
     expect(keyToAction(" ")).toBeNull();
+    expect(keyToAction("m")).toBeNull();
   });
 
   it("returns null for a multi-character string", () => {
```

```bash
pnpm exec vitest run tests/unit/board-keys.test.ts
```

Run it. Expected: `maps n and N to the next action` fails (`Tests  1 failed | 4 passed (5)`).

- [ ] **Step 2: Map the key**

Apply this diff to `lib/board/keys.ts`:

```diff
@@ -1,10 +1,11 @@
 import { STAGE_KINDS, type StageKind } from "@/lib/pipeline/kinds";
 
-export type BoardKeyAction = { type: "move"; kind: StageKind } | { type: "close" };
+export type BoardKeyAction = { type: "move"; kind: StageKind } | { type: "close" } | { type: "next_action" };
 
 export function keyToAction(key: string): BoardKeyAction | null {
   if (key.length !== 1) return null;
   if (key === "c" || key === "C") return { type: "close" };
+  if (key === "n" || key === "N") return { type: "next_action" };
   const index = Number(key) - 1;
   if (!Number.isInteger(index) || index < 0 || index >= STAGE_KINDS.length) return null;
   return { type: "move", kind: STAGE_KINDS[index].kind };
```

```bash
pnpm exec vitest run tests/unit/board-keys.test.ts
```

Run the test. Expected: `Tests  5 passed (5)`. `pnpm typecheck` now reports one error in `components/board/job-card.tsx` (it reads `action.kind` without handling the new action type); the step that lets `JobCard` ask for the dialog fixes it.

- [ ] **Step 3: Write the failing test `tests/unit/offer.test.ts` in full**

```typescript
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast }));

import { NEXT_ACTION_OFFER_MS, offerNextAction } from "@/components/next-action/offer";

describe("offerNextAction", () => {
  beforeEach(() => {
    toast.mockReset();
  });

  it("shows one toast that names the job, with a Set next action button and a ten second life", () => {
    const open = vi.fn();
    offerNextAction({ roleTitle: "Product Designer", companyName: "Northwind Traders" }, open);
    expect(NEXT_ACTION_OFFER_MS).toBe(10_000);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith("What is next for Product Designer at Northwind Traders?", {
      action: { label: "Set next action", onClick: expect.any(Function) },
      duration: 10_000,
    });
  });

  it("does not open the dialog by itself", () => {
    const open = vi.fn();
    offerNextAction({ roleTitle: "Product Designer", companyName: "Northwind Traders" }, open);
    expect(open).not.toHaveBeenCalled();
  });

  it("opens the dialog when the toast button is clicked", () => {
    const open = vi.fn();
    offerNextAction({ roleTitle: "Product Designer", companyName: "Northwind Traders" }, open);
    const options = toast.mock.calls[0][1] as { action: { onClick: () => void } };
    options.action.onClick();
    expect(open).toHaveBeenCalledTimes(1);
  });

  // Sonner returns focus to whatever had it before the toast once focus
  // leaves the toaster. If the dialog took focus first, that return would
  // pull focus out of the dialog and back to the page behind it.
  it("lets focus leave the toast button before the dialog opens", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();
    let focusedWhenOpened: Element | null = null;
    const open = vi.fn(() => {
      focusedWhenOpened = document.activeElement;
    });
    offerNextAction({ roleTitle: "Product Designer", companyName: "Northwind Traders" }, open);
    const options = toast.mock.calls[0][1] as { action: { onClick: () => void } };
    options.action.onClick();
    expect(focusedWhenOpened).not.toBe(button);
    button.remove();
  });
});
```

```bash
pnpm exec vitest run tests/unit/offer.test.ts
```

Run it. Expected: `Cannot find package '@/components/next-action/offer'`.

- [ ] **Step 4: Write `components/next-action/offer.ts` in full**

```typescript
import { toast } from "sonner";

export const NEXT_ACTION_OFFER_MS = 10_000;

/**
 * The prompt after a successful move: a toast that names the job and holds
 * one button. Nothing opens on its own, so a keyboard user is never pulled
 * out of the board; the dialog opens only when the button (or the toast
 * hotkey) is used.
 */
export function offerNextAction(subject: { roleTitle: string; companyName: string }, open: () => void): void {
  toast(`What is next for ${subject.roleTitle} at ${subject.companyName}?`, {
    action: {
      label: "Set next action",
      onClick: () => {
        // Sonner returns focus to whatever had it before the toast once focus
        // leaves the toaster. Blurring the button first lets that return
        // happen now, so it cannot pull focus out of the dialog that
        // `open` is about to show.
        (document.activeElement as HTMLElement | null)?.blur();
        open();
      },
    },
    duration: NEXT_ACTION_OFFER_MS,
  });
}
```

```bash
pnpm exec vitest run tests/unit/offer.test.ts
```

Run the test. Expected: `Tests  4 passed (4)`.

Mutation check: delete the `(document.activeElement as HTMLElement | null)?.blur();` statement and its comment, then run the test.

Expected: `lets focus leave the toast button before the dialog opens` fails (`Tests  1 failed | 3 passed (4)`). Revert and run again to confirm `Tests  4 passed (4)`. (A unit test cannot reproduce sonner's own focus return, so the end-to-end `offer.spec.ts` is the other half of this check: without the blur, the dialog's field is not focused after the toast button is clicked.)

- [ ] **Step 5: Write the failing test `tests/unit/set-next-action-dialog.test.tsx` in full**

The dialog is rendered inside `TimeZoneProvider zone="UTC"` so the typed `2026-10-12T09:00` becomes the instant `2026-10-12T09:00:00.000Z` on any machine. Base UI queues its initial focus behind a `requestAnimationFrame`; `renderDialog` flushes it with one macrotask before a test looks at focus (the same reasoning `add-job-dialog.test.tsx` documents).

```typescript
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/app/(app)/jobs/[slug]/actions", () => ({ setNextActionAction: vi.fn() }));

import { setNextActionAction } from "@/app/(app)/jobs/[slug]/actions";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { TimeZoneProvider } from "@/components/time-zone-provider";
import { SetNextActionDialog, type NextActionSubject } from "@/components/next-action/set-next-action-dialog";

const mockedAction = vi.mocked(setNextActionAction);

const SUBJECT: NextActionSubject = {
  id: "00000000-0000-4000-8000-0000000000a1",
  roleTitle: "Product Designer",
  companyName: "Northwind Traders",
  nextAction: null,
  nextActionAt: null,
};

async function renderDialog(subject: NextActionSubject | null = SUBJECT) {
  const onClose = vi.fn();
  const view = render(
    <LiveAnnouncerProvider>
      <TimeZoneProvider zone="UTC">
        <SetNextActionDialog subject={subject} onClose={onClose} />
      </TimeZoneProvider>
    </LiveAnnouncerProvider>,
  );
  // Base UI queues its initial focus behind a requestAnimationFrame; flush it
  // so a later focus assertion is not racing it.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { onClose, ...view };
}

function dialog() {
  return screen.getByRole("dialog", { name: "Set the next action" });
}

async function type(label: string, value: string) {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  });
}

async function save() {
  await act(async () => {
    fireEvent.click(within(dialog()).getByRole("button", { name: "Save" }));
    await Promise.resolve();
  });
}

beforeEach(() => {
  mockedAction.mockReset();
});

describe("SetNextActionDialog", () => {
  it("is closed while there is no subject", async () => {
    await renderDialog(null);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lets an 80-character role and company name in the description break inside the word", async () => {
    await renderDialog({ ...SUBJECT, roleTitle: "r".repeat(80), companyName: "c".repeat(80) });
    const description = within(dialog()).getByText(`${"r".repeat(80)} at ${"c".repeat(80)}`);
    expect(description.getAttribute("data-slot")).toBe("dialog-description");
    expect(description.className).toContain("break-words");
    // The dialog is a grid, and a grid item without min-w-0 is as wide as its
    // longest word however the text may break.
    expect(dialog().querySelector("form")!.className).toContain("min-w-0");
  });

  it("opens with the title, the job in the description, and focus on What is next", async () => {
    await renderDialog();
    expect(within(dialog()).getByText("Product Designer at Northwind Traders")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("What is next")));
    expect(within(dialog()).getByLabelText("When")).toBeTruthy();
    expect(within(dialog()).getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("starts from the next action the job already has", async () => {
    await renderDialog({ ...SUBJECT, nextAction: "Send the portfolio", nextActionAt: new Date("2026-10-12T09:00:00.000Z") });
    expect((screen.getByLabelText("What is next") as HTMLInputElement).value).toBe("Send the portfolio");
    expect((screen.getByLabelText("When") as HTMLInputElement).value).toBe("2026-10-12T09:00");
  });

  it("posts the text and the instant, then closes as saved and announces it", async () => {
    mockedAction.mockResolvedValue({ ok: true });
    const { onClose } = await renderDialog();
    await type("What is next", "Send the portfolio");
    await type("When", "2026-10-12T09:00");
    await save();

    expect(mockedAction).toHaveBeenCalledTimes(1);
    const [id, , formData] = mockedAction.mock.calls[0] as unknown as [string, unknown, FormData];
    expect(id).toBe(SUBJECT.id);
    expect(formData.get("text")).toBe("Send the portfolio");
    expect(formData.get("at")).toBe("2026-10-12T09:00:00.000Z");
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(true));
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe(
        "Next action saved for Product Designer at Northwind Traders.",
      ),
    );
  });

  it("sends an empty instant when When is left blank", async () => {
    mockedAction.mockResolvedValue({ ok: true });
    await renderDialog();
    await type("What is next", "Follow up");
    await save();
    const [, , formData] = mockedAction.mock.calls[0] as unknown as [string, unknown, FormData];
    expect(formData.get("at")).toBe("");
  });

  it("keeps the dialog open on an error, shows it, and puts focus back on Save", async () => {
    mockedAction.mockResolvedValue({
      ok: false,
      code: "invalid",
      message: "Check the highlighted fields.",
      fieldErrors: { text: "Enter what is next." },
    });
    const { onClose } = await renderDialog();
    await save();

    expect(within(dialog()).getByRole("alert").textContent).toBe("Check the highlighted fields.");
    expect(within(dialog()).getByText("Enter what is next.")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(within(dialog()).getByRole("button", { name: "Save" })));
  });

  it("closes as not saved on Cancel and on Escape", async () => {
    const first = await renderDialog();
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    });
    expect(first.onClose).toHaveBeenCalledWith(false);
    first.unmount();

    const second = await renderDialog();
    await act(async () => {
      fireEvent.keyDown(dialog(), { key: "Escape" });
    });
    expect(second.onClose).toHaveBeenCalledWith(false);
    expect(mockedAction).not.toHaveBeenCalled();
  });
});
```

```bash
pnpm exec vitest run tests/unit/set-next-action-dialog.test.tsx
```

Run it. Expected: `Failed to resolve import "@/components/next-action/set-next-action-dialog"`.

- [ ] **Step 6: Write `components/next-action/set-next-action-dialog.tsx` in full**

`textRef` is created in the outer component because Base UI reads `initialFocus` on the popup, which is the form's parent. The `handled` ref makes each action state count once even though the host passes a new `onClose` on every render.

```typescript
"use client";

import * as React from "react";

import { setNextActionAction } from "@/app/(app)/jobs/[slug]/actions";
import { useAnnounce } from "@/components/live-announcer";
import { LocalDateTimeInput } from "@/components/local-datetime-input";
import { FieldRow } from "@/components/super-ai/field-row";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { submitViaTransition } from "@/lib/forms/submit";
import type { FormState } from "@/lib/forms/state";

export type NextActionSubject = {
  id: string;
  roleTitle: string;
  companyName: string;
  nextAction: string | null;
  nextActionAt: Date | null;
};

/**
 * The dialog behind the next action offer. Open while `subject` is not null;
 * `onClose(true)` after a save, `onClose(false)` for Cancel, Escape or a
 * click outside. The host decides where focus goes next, because only it
 * knows which element replaced the one that opened this.
 */
export function SetNextActionDialog({
  subject,
  onClose,
}: {
  subject: NextActionSubject | null;
  onClose: (saved: boolean) => void;
}) {
  // Created here, not in the form: Base UI reads `initialFocus` from the
  // popup, which is this component's child and so cannot own the ref.
  const textRef = React.useRef<HTMLInputElement>(null);
  return (
    <Dialog
      open={subject !== null}
      onOpenChange={(open) => {
        if (!open) onClose(false);
      }}
    >
      <DialogContent initialFocus={textRef}>
        {/* Keyed by job and mounted only while open, so every open starts a
            fresh action state instead of the last attempt's error. */}
        {subject ? <SetNextActionForm key={subject.id} subject={subject} textRef={textRef} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function SetNextActionForm({
  subject,
  textRef,
  onClose,
}: {
  subject: NextActionSubject;
  textRef: React.RefObject<HTMLInputElement | null>;
  onClose: (saved: boolean) => void;
}) {
  const [state, formAction, pending] = React.useActionState<FormState, FormData>(
    setNextActionAction.bind(null, subject.id),
    undefined,
  );
  const announce = useAnnounce();
  const submitRef = React.useRef<HTMLButtonElement>(null);
  // Snapshot, not a live read: the job page passes live props, and a save
  // revalidates them while this form is still mounted, which would hand the
  // uncontrolled fields a changed defaultValue.
  const [initial] = React.useState(subject);
  // A state is acted on once. The host re-renders with a new onClose each
  // time, and the same successful state must not announce and close twice.
  const handled = React.useRef<FormState>(undefined);

  React.useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state?.ok) {
      announce(`Next action saved for ${initial.roleTitle} at ${initial.companyName}.`);
      onClose(true);
    } else if (state?.ok === false) {
      // Chromium drops focus to <body> when the clicked Save button is
      // disabled while pending; a rejection leaves this form mounted.
      submitRef.current?.focus();
    }
  }, [state, announce, onClose, initial.roleTitle, initial.companyName]);

  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined;

  return (
    <form onSubmit={(event) => submitViaTransition(event, formAction)} className="flex min-w-0 flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Set the next action</DialogTitle>
        <DialogDescription className="break-words">
          {initial.roleTitle} at {initial.companyName}
        </DialogDescription>
      </DialogHeader>

      {state?.ok === false ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      <FieldRow label="What is next" hint={fieldErrors?.text}>
        {(id, describedBy) => (
          <Input
            ref={textRef}
            id={id}
            name="text"
            defaultValue={initial.nextAction ?? ""}
            aria-describedby={describedBy}
            aria-invalid={Boolean(fieldErrors?.text)}
          />
        )}
      </FieldRow>

      <FieldRow label="When" hint={fieldErrors?.at}>
        {(id, describedBy) => (
          <LocalDateTimeInput
            id={id}
            name="at"
            // The ISO instant itself: LocalDateTimeInput converts it to the
            // profile zone for the visible field.
            defaultValue={initial.nextActionAt ? initial.nextActionAt.toISOString() : null}
            aria-describedby={describedBy}
          />
        )}
      </FieldRow>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onClose(false)}>
          Cancel
        </Button>
        <Button ref={submitRef} type="submit" disabled={pending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
```

```bash
pnpm exec vitest run tests/unit/set-next-action-dialog.test.tsx
```

Run the test. Expected: `Tests  8 passed (8)`.

Mutation checks. In `components/next-action/set-next-action-dialog.tsx`, change `<DialogDescription className="break-words">` to `<DialogDescription>`. Run the test: `lets an 80-character role and company name in the description break inside the word` fails (`Tests  1 failed | 7 passed (8)`). Revert, then change `className="flex min-w-0 flex-col gap-4"` on the `form` to `className="flex flex-col gap-4"`. Run the test: the same test fails. Revert and run again to confirm `Tests  8 passed (8)`.

- [ ] **Step 7: Replace `tests/unit/job-card.test.tsx` in full**

The four chip cases from Task 10 are unchanged; the new `JobCard: keys` block follows them. The helper now returns the three handlers so a test can assert on them.

```typescript
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";

import { JobCard } from "@/components/board/job-card";
import { BOARD_NOW, boardCard } from "../helpers/board-card";
import type { BoardCard } from "@/lib/db/scoped";

function renderCard(card: BoardCard) {
  const handlers = { onMove: vi.fn(), onRequestClose: vi.fn(), onRequestNextAction: vi.fn() };
  const view = render(
    <DndContext>
      <JobCard card={card} now={BOARD_NOW} {...handlers} />
    </DndContext>,
  );
  return { ...view, ...handlers };
}

function chips(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-slot="badge"]')).map((badge) => badge.textContent ?? "");
}

describe("JobCard: fit chip", () => {
  it("shows the banded chip with its screen-reader text when the job has a score", () => {
    const { container } = renderCard(boardCard({ fitScore: 81 }));
    expect(chips(container)).toEqual(["Fit score 81, strong fit"]);
    expect(container.querySelector("svg.text-status-approved")).not.toBeNull();
  });

  it("shows the partial and weak marks for lower scores", () => {
    expect(chips(renderCard(boardCard({ fitScore: 55 })).container)).toEqual(["Fit score 55, partial fit"]);
    expect(chips(renderCard(boardCard({ id: "other", fitScore: 12 })).container)).toEqual(["Fit score 12, weak fit"]);
  });

  it("shows no chip for a job without a score", () => {
    const { container } = renderCard(boardCard({ fitScore: null }));
    expect(chips(container)).toEqual([]);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/jobs/product-designer-northwind-traders");
  });

  it("keeps the stage label chip after the fit chip", () => {
    const { container } = renderCard(
      boardCard({ fitScore: 81, stage: { id: "s", kind: "saved", label: "Wishlist", enteredAt: null } }),
    );
    expect(chips(container)).toEqual(["Fit score 81, strong fit", "Wishlist"]);
  });
});

describe("JobCard: keys", () => {
  it("n asks for the next action dialog and nothing else", () => {
    const { onMove, onRequestClose, onRequestNextAction } = renderCard(boardCard());
    fireEvent.keyDown(screen.getByRole("link"), { key: "n" });
    expect(onRequestNextAction).toHaveBeenCalledTimes(1);
    expect(onMove).not.toHaveBeenCalled();
    expect(onRequestClose).not.toHaveBeenCalled();
  });

  it("N does the same", () => {
    const { onRequestNextAction } = renderCard(boardCard());
    fireEvent.keyDown(screen.getByRole("link"), { key: "N" });
    expect(onRequestNextAction).toHaveBeenCalledTimes(1);
  });

  it("leaves a held key, and a key with a modifier, to the browser", () => {
    const { onRequestNextAction } = renderCard(boardCard());
    const link = screen.getByRole("link");
    fireEvent.keyDown(link, { key: "n", repeat: true });
    fireEvent.keyDown(link, { key: "n", ctrlKey: true });
    fireEvent.keyDown(link, { key: "n", metaKey: true });
    fireEvent.keyDown(link, { key: "n", altKey: true });
    expect(onRequestNextAction).not.toHaveBeenCalled();
  });

  it("still moves on a digit and closes on c", () => {
    const { onMove, onRequestClose, onRequestNextAction } = renderCard(boardCard());
    const link = screen.getByRole("link");
    fireEvent.keyDown(link, { key: "2" });
    fireEvent.keyDown(link, { key: "c" });
    expect(onMove).toHaveBeenCalledWith({ kind: "applied" });
    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(onRequestNextAction).not.toHaveBeenCalled();
  });
});
```

```bash
pnpm exec vitest run tests/unit/job-card.test.tsx
```

Run it. Expected: `n asks for the next action dialog and nothing else` and `N does the same` fail (`Tests  2 failed | 6 passed (8)`); with the key mapped but `JobCard` unchanged, `n` falls through to `onMove`.

- [ ] **Step 8: Let `JobCard` ask for the dialog**

Apply this diff to `components/board/job-card.tsx`:

```diff
@@ -20,6 +20,7 @@ interface JobCardProps {
   now: Date;
   onMove: (target: MoveTarget) => void;
   onRequestClose: () => void;
+  onRequestNextAction: () => void;
   overlay?: boolean;
 }
 
@@ -35,7 +36,7 @@ function daysLabel(days: number): string {
   return `${days} days`;
 }
 
-export function JobCard({ card, now, onMove, onRequestClose, overlay }: JobCardProps) {
+export function JobCard({ card, now, onMove, onRequestClose, onRequestNextAction, overlay }: JobCardProps) {
   const { setNodeRef, listeners, isDragging } = useDraggable({ id: card.id, disabled: overlay });
 
   function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
@@ -57,6 +58,7 @@ export function JobCard({ card, now, onMove, onRequestClose, overlay }: JobCardP
     if (!action) return;
     event.preventDefault();
     if (action.type === "close") onRequestClose();
+    else if (action.type === "next_action") onRequestNextAction();
     else onMove({ kind: action.kind });
   }
 
```

```bash
pnpm exec vitest run tests/unit/job-card.test.tsx
```

Run the test. Expected: `Tests  8 passed (8)`.

- [ ] **Step 9: Write the failing test `tests/unit/board.test.tsx` in full**

`Board` is rendered whole, with the board actions, the job actions and `sonner` mocked, and `offerNextAction` replaced by a spy so a test can read what it was given and run its `open` callback. The two focus tests blur the link first and open the dialog with the `n` key (`fireEvent.keyDown` needs no focus), so that only the host's own close handler can put focus back on the card.

```typescript
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const harness = vi.hoisted(() => ({ offer: vi.fn(), toastError: vi.fn() }));

vi.mock("@/app/(app)/board/actions", () => ({ moveAction: vi.fn(), closeAction: vi.fn(), addJobAction: vi.fn() }));
vi.mock("@/app/(app)/jobs/[slug]/actions", () => ({ setNextActionAction: vi.fn() }));
vi.mock("@/components/next-action/offer", () => ({ offerNextAction: harness.offer }));
vi.mock("sonner", () => ({ toast: { error: harness.toastError } }));

import { moveAction } from "@/app/(app)/board/actions";
import { setNextActionAction } from "@/app/(app)/jobs/[slug]/actions";
import { Board } from "@/components/board/board";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { TimeZoneProvider } from "@/components/time-zone-provider";
import { BOARD_NOW, boardCard } from "../helpers/board-card";
import type { BoardCard } from "@/lib/db/scoped";

const mockedMove = vi.mocked(moveAction);
const mockedSetNextAction = vi.mocked(setNextActionAction);

const MOVED = {
  ok: true as const,
  data: {
    from: { kind: "saved" as const, label: "Saved" },
    to: { stageId: "00000000-0000-4000-8000-0000000000b2", kind: "applied" as const, label: "Applied" },
  },
};

function renderBoard(cards: BoardCard[]) {
  return render(
    <LiveAnnouncerProvider>
      <TimeZoneProvider zone="UTC">
        <Board cards={cards} nowIso={BOARD_NOW.toISOString()} companyNames={["Northwind Traders"]} />
      </TimeZoneProvider>
    </LiveAnnouncerProvider>,
  );
}

function cardLink(): HTMLElement {
  return screen.getByRole("link");
}

async function press(key: string) {
  await act(async () => {
    fireEvent.keyDown(cardLink(), { key });
    await Promise.resolve();
  });
}

function announced(): string | undefined {
  return document.querySelector('[aria-live="polite"]')?.textContent ?? undefined;
}

// correctFocusOnceLost keeps polling for a second and a half after a move. Left
// on real timers, one test's polling would refocus the next test's card and
// hide a missing focus restore, so the clock is faked (still advancing by
// itself, which Testing Library's waitFor needs) and emptied after each test.
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockedMove.mockReset();
  mockedSetNextAction.mockReset();
  harness.offer.mockReset();
  harness.toastError.mockReset();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("Board: the next action offer after a move", () => {
  it("offers once, naming the job, after a successful move", async () => {
    mockedMove.mockResolvedValue(MOVED);
    renderBoard([boardCard()]);
    await press("2");
    await waitFor(() => expect(harness.offer).toHaveBeenCalledTimes(1));
    expect(mockedMove).toHaveBeenCalledWith("00000000-0000-4000-8000-0000000000a1", { kind: "applied" });
    expect(harness.offer.mock.calls[0][0]).toMatchObject({ roleTitle: "Product Designer", companyName: "Northwind Traders" });
    await waitFor(() => expect(announced()).toBe("Moved Product Designer at Northwind Traders to Applied."));
  });

  it("does not offer when the move comes back refused", async () => {
    mockedMove.mockResolvedValue({ ok: false, code: "closed", message: "This job is closed. Reopen it first." });
    renderBoard([boardCard()]);
    await press("2");
    await waitFor(() => expect(harness.toastError).toHaveBeenCalledTimes(1));
    expect(harness.offer).not.toHaveBeenCalled();
  });

  it("does not offer when the move request itself fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mockedMove.mockRejectedValue(new Error("offline"));
    renderBoard([boardCard()]);
    await press("2");
    await waitFor(() => expect(harness.toastError).toHaveBeenCalledTimes(1));
    expect(harness.offer).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("does not offer for a move to the card's own column, which is not a move", async () => {
    renderBoard([boardCard()]);
    await press("1");
    expect(mockedMove).not.toHaveBeenCalled();
    expect(harness.offer).not.toHaveBeenCalled();
  });

  it("opens nothing until the offer's button is used", async () => {
    mockedMove.mockResolvedValue(MOVED);
    renderBoard([boardCard()]);
    await press("2");
    await waitFor(() => expect(harness.offer).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the dialog, filled with the job's next action, when the offer's button runs", async () => {
    mockedMove.mockResolvedValue(MOVED);
    renderBoard([
      boardCard({ nextAction: "Send the portfolio", nextActionAt: new Date("2026-10-12T09:00:00.000Z") }),
    ]);
    await press("2");
    await waitFor(() => expect(harness.offer).toHaveBeenCalledTimes(1));
    const open = harness.offer.mock.calls[0][1] as () => void;
    await act(async () => {
      open();
    });
    const dialog = await screen.findByRole("dialog", { name: "Set the next action" });
    expect(within(dialog).getByText("Product Designer at Northwind Traders")).toBeTruthy();
    expect((within(dialog).getByLabelText("What is next") as HTMLInputElement).value).toBe("Send the portfolio");
  });
});

describe("Board: the n key", () => {
  it("opens the dialog on the focused card without moving it", async () => {
    renderBoard([boardCard()]);
    await press("n");
    expect(await screen.findByRole("dialog", { name: "Set the next action" })).toBeTruthy();
    expect(mockedMove).not.toHaveBeenCalled();
    expect(harness.offer).not.toHaveBeenCalled();
  });

  it("sends focus back to the card's title link after Cancel, even when focus had already left it", async () => {
    renderBoard([boardCard()]);
    cardLink().blur();
    await press("n");
    const dialog = await screen.findByRole("dialog", { name: "Set the next action" });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(cardLink()));
  });

  it("saves through the action for that job, announces it, and restores focus", async () => {
    mockedSetNextAction.mockResolvedValue({ ok: true });
    renderBoard([boardCard()]);
    cardLink().blur();
    await press("n");
    const dialog = await screen.findByRole("dialog", { name: "Set the next action" });
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText("What is next"), { target: { value: "Send the portfolio" } });
    });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const [id, , formData] = mockedSetNextAction.mock.calls[0] as unknown as [string, unknown, FormData];
    expect(id).toBe("00000000-0000-4000-8000-0000000000a1");
    expect(formData.get("text")).toBe("Send the portfolio");
    await waitFor(() => expect(announced()).toBe("Next action saved for Product Designer at Northwind Traders."));
    await waitFor(() => expect(document.activeElement).toBe(cardLink()));
  });
});
```

```bash
pnpm exec vitest run tests/unit/board.test.tsx
```

Run it. Expected: six fail, the three that assert nothing is offered pass already (`Tests  6 failed | 3 passed (9)`).

- [ ] **Step 10: Wire `Board`**

Apply this diff to `components/board/board.tsx`. `subjectOf` and the two helpers sit above `runMove`; the offer goes right after the move's `announce`, inside the branch that already returned on `!result.ok`; the dialog is written once at the end, next to `AddJobDialog`.

```diff
@@ -24,6 +24,8 @@ import { BoardColumn } from "@/components/board/board-column";
 import { JobCard } from "@/components/board/job-card";
 import { CloseDialog } from "@/components/board/close-dialog";
 import { AddJobDialog } from "@/components/board/add-job-dialog";
+import { offerNextAction } from "@/components/next-action/offer";
+import { SetNextActionDialog, type NextActionSubject } from "@/components/next-action/set-next-action-dialog";
 import { moveAction, closeAction } from "@/app/(app)/board/actions";
 import { applyMove, removeCard } from "@/lib/board/optimistic";
 import { actionFailureMessage } from "@/lib/board/messages";
@@ -67,7 +69,7 @@ const silentAnnouncements: Announcements = {
 };
 const screenReaderInstructions: ScreenReaderInstructions = {
   draggable:
-    "To move this job, open its Move menu, or focus its title and press 1 through 7 to change its column, or C to close it. Dragging with a pointer also works.",
+    "To move this job, open its Move menu, or focus its title and press 1 through 7 to change its column, or C to close it. Press N to set its next action. Dragging with a pointer also works.",
 };
 
 export function BoardViewSwitch({ view }: { view: "active" | "closed" }) {
@@ -109,6 +111,7 @@ export function Board({
   const [activeId, setActiveId] = React.useState<string | null>(null);
   const [pendingCloseId, setPendingCloseId] = React.useState<string | null>(null);
   const [addOpen, setAddOpen] = React.useState(false);
+  const [nextActionSubject, setNextActionSubject] = React.useState<NextActionSubject | null>(null);
   const isDragging = activeId !== null;
   // Attached to the "Add job" button in both the empty and non-empty
   // branches below (only one is ever mounted at once, matching
@@ -126,6 +129,32 @@ export function Board({
     useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
   );
 
+  function subjectOf(card: BoardCard): NextActionSubject {
+    return {
+      id: card.id,
+      roleTitle: card.roleTitle,
+      companyName: card.companyName,
+      nextAction: card.nextAction,
+      nextActionAt: card.nextActionAt,
+    };
+  }
+
+  function requestNextAction(cardId: string) {
+    const card = optimisticCards.find((c) => c.id === cardId);
+    if (card) setNextActionSubject(subjectOf(card));
+  }
+
+  // The dialog closes for a save, Cancel, Escape and a click outside alike.
+  // Base UI would return focus to whatever opened it, but when the toast's
+  // button opened it that button is gone by now, and the card itself may
+  // have moved column since: so focus is sent to the card's title link
+  // wherever it is, and only if it was actually lost.
+  function handleNextActionClose() {
+    const id = nextActionSubject?.id;
+    setNextActionSubject(null);
+    if (id) correctFocusOnceLost(() => focusCardLink(id));
+  }
+
   function runMove(cardId: string, target: MoveTarget) {
     const card = optimisticCards.find((c) => c.id === cardId);
     if (!card) return;
@@ -146,6 +175,7 @@ export function Board({
           return;
         }
         announce(`Moved ${card.roleTitle} at ${card.companyName} to ${columnTitle(result.data.to.kind)}.`);
+        offerNextAction(card, () => setNextActionSubject(subjectOf(card)));
         // The moved card's old title link (or its Move menu trigger, itself
         // inside the same card) unmounted the instant the optimistic dispatch
         // above swapped it into its new column. correctFocusOnceLost, not a
@@ -305,6 +335,7 @@ export function Board({
                         now={now}
                         onMove={(target) => runMove(card.id, target)}
                         onRequestClose={() => setPendingCloseId(card.id)}
+                        onRequestNextAction={() => requestNextAction(card.id)}
                       />
                     ))}
                   </BoardColumn>
@@ -314,7 +345,14 @@ export function Board({
             {isDragging && <ClosedDropZone />}
             <DragOverlay>
               {activeCard ? (
-                <JobCard card={activeCard} now={now} onMove={() => {}} onRequestClose={() => {}} overlay />
+                <JobCard
+                  card={activeCard}
+                  now={now}
+                  onMove={() => {}}
+                  onRequestClose={() => {}}
+                  onRequestNextAction={() => {}}
+                  overlay
+                />
               ) : null}
             </DragOverlay>
           </DndContext>
@@ -331,6 +369,10 @@ export function Board({
         </div>
       )}
       <AddJobDialog open={addOpen} onOpenChange={setAddOpen} companyNames={companyNames} />
+      {/* Written once, as a stable sibling like AddJobDialog above, so it
+          survives the board flipping between its empty and populated
+          branches while a save is in flight. */}
+      <SetNextActionDialog subject={nextActionSubject} onClose={handleNextActionClose} />
     </>
   );
 }
```

```bash
pnpm exec vitest run tests/unit/board.test.tsx
```

Run the test. Expected: `Tests  9 passed (9)`.

- [ ] **Step 11: Mutation checks for `Board`: offer before the result is known, and skip the focus restore**

In `components/board/board.tsx`, move the `offerNextAction(...)` line from after the `announce(...)` to directly after `const result = await moveAction(cardId, target);`, so it runs before `if (!result.ok)`. Run the test.

Expected: `does not offer when the move comes back refused` fails (`Tests  1 failed | 8 passed (9)`).

Revert, then:

In `handleNextActionClose` replace `if (id) correctFocusOnceLost(() => focusCardLink(id));` with `void id;`. Run the test.

Expected: both focus tests fail (`Tests  2 failed | 7 passed (9)`).

Revert and run the file again to confirm `Tests  9 passed (9)`.

- [ ] **Step 12: Replace `tests/unit/phone-board.test.tsx` in full**

The two chip cases from Task 10 stay. The new cases go through the real `MoveSheet`: tap `Move to`, tap a column. The focus case advances the fake clock past the move's own polling window (1,700 ms) before it blurs and opens the dialog, so only the dialog's close can restore focus.

```typescript
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const harness = vi.hoisted(() => ({ offer: vi.fn(), toastError: vi.fn() }));

vi.mock("@/app/(app)/board/actions", () => ({ moveAction: vi.fn(), closeAction: vi.fn(), addJobAction: vi.fn() }));
vi.mock("@/app/(app)/jobs/[slug]/actions", () => ({ setNextActionAction: vi.fn() }));
vi.mock("@/components/next-action/offer", () => ({ offerNextAction: harness.offer }));
vi.mock("sonner", () => ({ toast: { error: harness.toastError } }));

import { moveAction } from "@/app/(app)/board/actions";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { PhoneBoard } from "@/components/board/phone-board";
import { BOARD_NOW, boardCard } from "../helpers/board-card";
import type { BoardCard } from "@/lib/db/scoped";

const mockedMove = vi.mocked(moveAction);

const MOVED = {
  ok: true as const,
  data: {
    from: { kind: "saved" as const, label: "Saved" },
    to: { stageId: "00000000-0000-4000-8000-0000000000b2", kind: "applied" as const, label: "Applied" },
  },
};

function renderBoard(cards: BoardCard[]) {
  return render(
    <LiveAnnouncerProvider>
      <PhoneBoard cards={cards} nowIso={BOARD_NOW.toISOString()} companyNames={["Northwind Traders"]} />
    </LiveAnnouncerProvider>,
  );
}

function chips(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-slot="badge"]')).map((badge) => badge.textContent ?? "");
}

function moveButton(): HTMLElement {
  return screen.getByRole("button", { name: "Move Product Designer at Northwind Traders" });
}

// Opens the Move to sheet and picks a column, as a thumb would.
async function moveThroughSheet(column: string) {
  await act(async () => {
    fireEvent.click(moveButton());
  });
  const sheet = await screen.findByRole("dialog", { name: "Move to" });
  await act(async () => {
    fireEvent.click(within(sheet).getByRole("button", { name: column }));
    await Promise.resolve();
  });
}

// correctFocusOnceLost keeps polling for a second and a half after a move. Left
// on real timers, one test's polling would refocus the next test's card and
// hide a missing focus restore, so the clock is faked (still advancing by
// itself, which Testing Library's waitFor needs) and emptied after each test.
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockedMove.mockReset();
  harness.offer.mockReset();
  harness.toastError.mockReset();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("PhoneBoard: fit chip", () => {
  it("shows the banded chip on a scored job", () => {
    const { container } = renderBoard([boardCard({ fitScore: 81 })]);
    expect(chips(container)).toEqual(["Fit score 81, strong fit"]);
    expect(container.querySelector("svg.text-status-approved")).not.toBeNull();
  });

  it("shows no chip on an unscored job", () => {
    const { container } = renderBoard([boardCard({ fitScore: null })]);
    expect(chips(container)).toEqual([]);
  });
});

describe("PhoneBoard: the next action offer after a move", () => {
  it("offers once, naming the job, after a successful move through the sheet", async () => {
    mockedMove.mockResolvedValue(MOVED);
    renderBoard([boardCard()]);
    await moveThroughSheet("Applied");
    await waitFor(() => expect(harness.offer).toHaveBeenCalledTimes(1));
    expect(mockedMove).toHaveBeenCalledWith("00000000-0000-4000-8000-0000000000a1", { kind: "applied" });
    expect(harness.offer.mock.calls[0][0]).toMatchObject({ roleTitle: "Product Designer", companyName: "Northwind Traders" });
    expect(screen.queryByRole("dialog", { name: "Set the next action" })).toBeNull();
  });

  it("does not offer when the move comes back refused", async () => {
    mockedMove.mockResolvedValue({ ok: false, code: "closed", message: "This job is closed. Reopen it first." });
    renderBoard([boardCard()]);
    await moveThroughSheet("Applied");
    await waitFor(() => expect(harness.toastError).toHaveBeenCalledTimes(1));
    expect(harness.offer).not.toHaveBeenCalled();
  });

  it("does not offer when the move request itself fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mockedMove.mockRejectedValue(new Error("offline"));
    renderBoard([boardCard()]);
    await moveThroughSheet("Applied");
    await waitFor(() => expect(harness.toastError).toHaveBeenCalledTimes(1));
    expect(harness.offer).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("does not offer for the card's own column", async () => {
    renderBoard([boardCard()]);
    await moveThroughSheet("Saved");
    expect(mockedMove).not.toHaveBeenCalled();
    expect(harness.offer).not.toHaveBeenCalled();
  });

  it("opens the dialog when the offer's button runs, and sends focus back to the card's Move to button", async () => {
    mockedMove.mockResolvedValue(MOVED);
    renderBoard([boardCard()]);
    await moveThroughSheet("Applied");
    await waitFor(() => expect(harness.offer).toHaveBeenCalledTimes(1));
    // Let the move's own focus polling finish, so only the dialog's close
    // can put focus back.
    await act(async () => {
      vi.advanceTimersByTime(1_700);
    });
    (document.activeElement as HTMLElement | null)?.blur();

    const open = harness.offer.mock.calls[0][1] as () => void;
    await act(async () => {
      open();
    });
    const dialog = await screen.findByRole("dialog", { name: "Set the next action" });
    expect(within(dialog).getByText("Product Designer at Northwind Traders")).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(moveButton()));
  });
});
```

```bash
pnpm exec vitest run tests/unit/phone-board.test.tsx
```

Run it. Expected: `offers once, naming the job, after a successful move through the sheet` and the focus case fail (`Tests  2 failed | 5 passed (7)`).

- [ ] **Step 13: Wire `PhoneBoard`**

Apply this diff to `components/board/phone-board.tsx`:

```diff
@@ -13,6 +13,8 @@ import { useAnnounce } from "@/components/live-announcer";
 import { MoveSheet } from "@/components/board/move-sheet";
 import { CloseDialog } from "@/components/board/close-dialog";
 import { AddJobDialog } from "@/components/board/add-job-dialog";
+import { offerNextAction } from "@/components/next-action/offer";
+import { SetNextActionDialog, type NextActionSubject } from "@/components/next-action/set-next-action-dialog";
 import { moveAction, closeAction } from "@/app/(app)/board/actions";
 import { applyMove, removeCard } from "@/lib/board/optimistic";
 import { actionFailureMessage } from "@/lib/board/messages";
@@ -90,6 +92,7 @@ export function PhoneBoard({
   const [moveSheetCardId, setMoveSheetCardId] = React.useState<string | null>(null);
   const [pendingCloseId, setPendingCloseId] = React.useState<string | null>(null);
   const [addOpen, setAddOpen] = React.useState(false);
+  const [nextActionSubject, setNextActionSubject] = React.useState<NextActionSubject | null>(null);
   // Attached to the "Add job" button in both the empty and non-empty
   // branches below (only one is ever mounted at once), so this always
   // points at whichever one is currently on screen - the fallback runClose
@@ -98,6 +101,25 @@ export function PhoneBoard({
   // board's column rail, which stays in the DOM to be focused instead).
   const addJobButtonRef = React.useRef<HTMLButtonElement>(null);
 
+  function subjectOf(card: BoardCard): NextActionSubject {
+    return {
+      id: card.id,
+      roleTitle: card.roleTitle,
+      companyName: card.companyName,
+      nextAction: card.nextAction,
+      nextActionAt: card.nextActionAt,
+    };
+  }
+
+  // The toast's button that opened the dialog is gone by the time it
+  // closes, so focus goes to the card's own Move to button, wherever the
+  // move left it, and only if it was actually lost.
+  function handleNextActionClose() {
+    const id = nextActionSubject?.id;
+    setNextActionSubject(null);
+    if (id) correctFocusOnceLost(() => focusCardButton(id));
+  }
+
   function runMove(cardId: string, target: MoveTarget) {
     const card = optimisticCards.find((c) => c.id === cardId);
     if (!card) return;
@@ -116,6 +138,7 @@ export function PhoneBoard({
           return;
         }
         announce(`Moved ${card.roleTitle} at ${card.companyName} to ${columnTitle(result.data.to.kind)}.`);
+        offerNextAction(card, () => setNextActionSubject(subjectOf(card)));
         // The sheet already tried to return focus to the "Move to" button
         // that opened it (Sheet's own default), but that button belonged to
         // this card's row in its OLD group, which unmounted the instant the
@@ -312,6 +335,7 @@ export function PhoneBoard({
           - one call site at a fixed position keeps this instance mounted
           across that transition, so its state survives. */}
       <AddJobDialog open={addOpen} onOpenChange={setAddOpen} companyNames={companyNames} />
+      <SetNextActionDialog subject={nextActionSubject} onClose={handleNextActionClose} />
     </div>
   );
 }
```

```bash
pnpm exec vitest run tests/unit/phone-board.test.tsx
```

Run the test. Expected: `Tests  7 passed (7)`.

- [ ] **Step 14: Mutation checks for `PhoneBoard`**

In `components/board/phone-board.tsx`, move the `offerNextAction(...)` line to directly after `const result = await moveAction(cardId, target);`. Run the test.

Expected: `does not offer when the move comes back refused` fails (`Tests  1 failed | 6 passed (7)`).

Revert, then:

In `handleNextActionClose` replace `if (id) correctFocusOnceLost(() => focusCardButton(id));` with `void id;`. Run the test.

Expected: the focus case fails (`Tests  1 failed | 6 passed (7)`).

Revert and run the file again to confirm `Tests  7 passed (7)`.

- [ ] **Step 15: Write the failing tests for the job page: `stage-detail-sheet`, `stage-stepper` and `next-action-bar`**

`stage-detail-sheet.test.tsx` renders the sheet open and clicks `Move here`. `stage-stepper.test.tsx` renders the stepper with a stand-in `<button data-next-action-trigger>` beside it (the real one lives in `NextActionBar`, which the job page renders next to the stepper) and walks the whole path: open the stage sheet, move, take the offer, open the dialog, cancel, and find focus on the stand-in. `next-action-bar.test.tsx` pins the marker on `Add` and `Edit`.

`tests/unit/stage-detail-sheet.test.tsx`:

```typescript
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const harness = vi.hoisted(() => ({ toastError: vi.fn() }));

vi.mock("@/app/(app)/board/actions", () => ({ moveAction: vi.fn() }));
vi.mock("@/app/(app)/jobs/[slug]/actions", () => ({ saveStageDetailAction: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: harness.toastError } }));

import { moveAction } from "@/app/(app)/board/actions";
import { StageDetailSheet } from "@/components/job/stage-detail-sheet";
import { LiveAnnouncerProvider } from "@/components/live-announcer";

const mockedMove = vi.mocked(moveAction);

const MOVED = {
  ok: true as const,
  data: {
    from: { kind: "saved" as const, label: "Saved" },
    to: { stageId: "00000000-0000-4000-8000-0000000000b2", kind: "applied" as const, label: "Applied" },
  },
};

function renderSheet() {
  const onOpenChange = vi.fn();
  const onMoved = vi.fn();
  render(
    <LiveAnnouncerProvider>
      <StageDetailSheet
        open
        onOpenChange={onOpenChange}
        opportunity={{ id: "00000000-0000-4000-8000-0000000000a1", roleTitle: "Product Designer", status: "active" }}
        companyName="Northwind Traders"
        stage={{
          id: "00000000-0000-4000-8000-0000000000b2",
          label: "Applied",
          kind: "applied",
          scheduledAt: null,
          format: null,
          outcomeMd: null,
        }}
        isCurrent={false}
        onMoved={onMoved}
      />
    </LiveAnnouncerProvider>,
  );
  return { onOpenChange, onMoved };
}

async function moveHere() {
  const sheet = await screen.findByRole("dialog", { name: "Applied" });
  await act(async () => {
    fireEvent.click(within(sheet).getByRole("button", { name: "Move here" }));
    await Promise.resolve();
  });
}

beforeEach(() => {
  mockedMove.mockReset();
  harness.toastError.mockReset();
});

describe("StageDetailSheet: Move here", () => {
  it("announces the move, closes, and tells its host once", async () => {
    mockedMove.mockResolvedValue(MOVED);
    const { onOpenChange, onMoved } = renderSheet();
    await moveHere();
    await waitFor(() => expect(onMoved).toHaveBeenCalledTimes(1));
    expect(mockedMove).toHaveBeenCalledWith("00000000-0000-4000-8000-0000000000a1", {
      stageId: "00000000-0000-4000-8000-0000000000b2",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() =>
      expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe(
        "Moved Product Designer at Northwind Traders to Applied.",
      ),
    );
  });

  it("does not tell its host when the move comes back refused", async () => {
    mockedMove.mockResolvedValue({ ok: false, code: "closed", message: "This job is closed. Reopen it first." });
    const { onOpenChange, onMoved } = renderSheet();
    await moveHere();
    await waitFor(() => expect(harness.toastError).toHaveBeenCalledTimes(1));
    expect(onMoved).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("does not tell its host when the move request itself fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mockedMove.mockRejectedValue(new Error("offline"));
    const { onMoved } = renderSheet();
    await moveHere();
    await waitFor(() => expect(harness.toastError).toHaveBeenCalledTimes(1));
    expect(onMoved).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
```

`tests/unit/stage-stepper.test.tsx`:

```typescript
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const harness = vi.hoisted(() => ({ offer: vi.fn(), toastError: vi.fn() }));

vi.mock("@/app/(app)/board/actions", () => ({ moveAction: vi.fn() }));
vi.mock("@/app/(app)/jobs/[slug]/actions", () => ({ saveStageDetailAction: vi.fn(), setNextActionAction: vi.fn() }));
vi.mock("@/components/next-action/offer", () => ({ offerNextAction: harness.offer }));
vi.mock("sonner", () => ({ toast: { error: harness.toastError } }));

import { moveAction } from "@/app/(app)/board/actions";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { StageStepper } from "@/components/job/stage-stepper";
import { TimeZoneProvider } from "@/components/time-zone-provider";

const mockedMove = vi.mocked(moveAction);

const STAGE_IDS = {
  saved: "00000000-0000-4000-8000-0000000000b1",
  applied: "00000000-0000-4000-8000-0000000000b2",
};

function stage(id: string, kind: "saved" | "applied", label: string, status: "done" | "upcoming") {
  return { id, kind, label, status, scheduledAt: null, completedAt: null, format: null, outcomeMd: null };
}

function renderStepper() {
  return render(
    <LiveAnnouncerProvider>
      <TimeZoneProvider zone="UTC">
        {/* Stands in for NextActionBar's Add or Edit button, which the job
            page renders next to the stepper. */}
        <button data-next-action-trigger>Edit</button>
        <StageStepper
          opportunity={{
            id: "00000000-0000-4000-8000-0000000000a1",
            roleTitle: "Product Designer",
            status: "active",
            nextAction: "Send the portfolio",
            nextActionAt: new Date("2026-10-12T09:00:00.000Z"),
          }}
          companyName="Northwind Traders"
          stages={[stage(STAGE_IDS.saved, "saved", "Saved", "done"), stage(STAGE_IDS.applied, "applied", "Applied", "upcoming")]}
          currentStageId={STAGE_IDS.saved}
          controls={{}}
        />
      </TimeZoneProvider>
    </LiveAnnouncerProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockedMove.mockReset();
  harness.offer.mockReset();
  harness.toastError.mockReset();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("StageStepper: the next action offer", () => {
  it("offers after Move here, opens the dialog from the offer, and returns focus to the next action button", async () => {
    mockedMove.mockResolvedValue({
      ok: true,
      data: {
        from: { kind: "saved", label: "Saved" },
        to: { stageId: STAGE_IDS.applied, kind: "applied", label: "Applied" },
      },
    });
    renderStepper();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Applied, upcoming" }));
    });
    const sheet = await screen.findByRole("dialog", { name: "Applied" });
    await act(async () => {
      fireEvent.click(within(sheet).getByRole("button", { name: "Move here" }));
      await Promise.resolve();
    });

    await waitFor(() => expect(harness.offer).toHaveBeenCalledTimes(1));
    expect(harness.offer.mock.calls[0][0]).toEqual({ roleTitle: "Product Designer", companyName: "Northwind Traders" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Applied" })).toBeNull());
    expect(screen.queryByRole("dialog")).toBeNull();

    (document.activeElement as HTMLElement | null)?.blur();
    const open = harness.offer.mock.calls[0][1] as () => void;
    await act(async () => {
      open();
    });
    const dialog = await screen.findByRole("dialog", { name: "Set the next action" });
    expect((within(dialog).getByLabelText("What is next") as HTMLInputElement).value).toBe("Send the portfolio");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector("[data-next-action-trigger]")));
  });

  it("offers nothing when the move is refused", async () => {
    mockedMove.mockResolvedValue({ ok: false, code: "closed", message: "This job is closed. Reopen it first." });
    renderStepper();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Applied, upcoming" }));
    });
    const sheet = await screen.findByRole("dialog", { name: "Applied" });
    await act(async () => {
      fireEvent.click(within(sheet).getByRole("button", { name: "Move here" }));
      await Promise.resolve();
    });
    await waitFor(() => expect(harness.toastError).toHaveBeenCalledTimes(1));
    expect(harness.offer).not.toHaveBeenCalled();
  });
});
```

`tests/unit/next-action-bar.test.tsx`:

```typescript
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/(app)/jobs/[slug]/actions", () => ({ setNextActionAction: vi.fn(), completeNextActionAction: vi.fn() }));

import { NextActionBar } from "@/components/job/next-action-bar";

const BASE = { id: "00000000-0000-4000-8000-0000000000a1", roleTitle: "Product Designer" };

describe("NextActionBar: the focus marker", () => {
  it("marks Add when there is no next action", () => {
    render(<NextActionBar opportunity={{ ...BASE, nextAction: null, nextActionAt: null }} />);
    expect(screen.getByRole("button", { name: "Add" }).hasAttribute("data-next-action-trigger")).toBe(true);
    expect(document.querySelectorAll("[data-next-action-trigger]")).toHaveLength(1);
  });

  it("marks Edit, and only Edit, when there is one", () => {
    render(<NextActionBar opportunity={{ ...BASE, nextAction: "Send the portfolio", nextActionAt: null }} />);
    expect(screen.getByRole("button", { name: "Edit" }).hasAttribute("data-next-action-trigger")).toBe(true);
    expect(screen.getByRole("button", { name: "Done" }).hasAttribute("data-next-action-trigger")).toBe(false);
    expect(document.querySelectorAll("[data-next-action-trigger]")).toHaveLength(1);
  });
});
```

```bash
pnpm exec vitest run tests/unit/stage-detail-sheet.test.tsx tests/unit/stage-stepper.test.tsx tests/unit/next-action-bar.test.tsx
```

Expected: four fail (the sheet never calls `onMoved`, the stepper never offers, neither button carries the marker); `Tests  4 failed | 3 passed (7)`.

- [ ] **Step 16: Wire the job page**

Apply this diff to `components/job/next-action-bar.tsx` (the marker on `Add` and `Edit`):

```diff
@@ -85,6 +85,9 @@ export function NextActionBar({ opportunity }: NextActionBarProps) {
     });
   }
 
+  // data-next-action-trigger marks whichever of Add and Edit is on screen:
+  // the stage stepper's next action offer sends focus back to it once its
+  // dialog closes, without knowing which one the job's state is showing.
   return (
     <section className="flex flex-col gap-2">
       <h2 className="text-base font-semibold text-foreground">Next action</h2>
@@ -94,7 +97,7 @@ export function NextActionBar({ opportunity }: NextActionBarProps) {
       ) : opportunity.nextAction === null ? (
         <div className="flex items-center gap-2">
           <p className="text-muted-foreground">No next action.</p>
-          <Button ref={addRef} variant="outline" size="sm" onClick={() => setEditing(true)}>
+          <Button ref={addRef} variant="outline" size="sm" data-next-action-trigger onClick={() => setEditing(true)}>
             Add
           </Button>
         </div>
@@ -112,7 +115,7 @@ export function NextActionBar({ opportunity }: NextActionBarProps) {
           <Button ref={doneRef} variant="outline" size="sm" disabled={isDonePending} onClick={handleDone}>
             Done
           </Button>
-          <Button ref={editRef} variant="outline" size="sm" onClick={() => setEditing(true)}>
+          <Button ref={editRef} variant="outline" size="sm" data-next-action-trigger onClick={() => setEditing(true)}>
             Edit
           </Button>
         </div>
```

Apply this diff to `components/job/stage-detail-sheet.tsx` (`onMoved`, called after the announce and the close):

```diff
@@ -50,6 +50,8 @@ interface StageDetailSheetProps {
   companyName: string;
   stage: StageDetailStage;
   isCurrent: boolean;
+  /** Called once after a successful "Move here", for the host's next action offer. */
+  onMoved: () => void;
 }
 
 export function StageDetailSheet({
@@ -59,6 +61,7 @@ export function StageDetailSheet({
   companyName,
   stage,
   isCurrent,
+  onMoved,
 }: StageDetailSheetProps) {
   return (
     <Sheet open={open} onOpenChange={onOpenChange}>
@@ -75,6 +78,7 @@ export function StageDetailSheet({
           companyName={companyName}
           stage={stage}
           isCurrent={isCurrent}
+          onMoved={onMoved}
         />
       </SheetContent>
     </Sheet>
@@ -87,6 +91,7 @@ function StageDetailSheetBody({
   companyName,
   stage,
   isCurrent,
+  onMoved,
 }: Omit<StageDetailSheetProps, "open">) {
   const [state, formAction, pending] = React.useActionState<FormState, FormData>(
     saveStageDetailAction.bind(null, opportunity.id, stage.id),
@@ -136,6 +141,7 @@ function StageDetailSheetBody({
         }
         announce(`Moved ${opportunity.roleTitle} at ${companyName} to ${columnTitle(result.data.to.kind)}.`);
         onOpenChange(false);
+        onMoved();
       } catch (error) {
         // moveAction can reject before ever returning a Result - see
         // board.tsx's runMove for the same case.
```

Apply this diff to `components/job/stage-stepper.tsx` (the offer, the dialog and the focus return):

```diff
@@ -6,6 +6,9 @@ import { Button } from "@/components/ui/button";
 import { StageDetailSheet } from "@/components/job/stage-detail-sheet";
 import { EditStagesDialog } from "@/components/job/edit-stages-dialog";
 import { LocalTime } from "@/components/local-time";
+import { offerNextAction } from "@/components/next-action/offer";
+import { SetNextActionDialog } from "@/components/next-action/set-next-action-dialog";
+import { correctFocusOnceLost } from "@/lib/dom/focus";
 import { STAGE_STATUS_WORDS } from "@/lib/pipeline/labels";
 import { cn } from "@/lib/utils";
 import type { StageControls } from "@/lib/pipeline/stage-controls";
@@ -24,7 +27,13 @@ type StepperStage = {
 };
 
 interface StageStepperProps {
-  opportunity: { id: string; roleTitle: string; status: OpportunityStatus };
+  opportunity: {
+    id: string;
+    roleTitle: string;
+    status: OpportunityStatus;
+    nextAction: string | null;
+    nextActionAt: Date | null;
+  };
   companyName: string;
   stages: StepperStage[];
   currentStageId: string;
@@ -44,9 +53,18 @@ const DOT_CLASS_BY_STATUS: Record<StageStatus, string> = {
 export function StageStepper({ opportunity, companyName, stages, currentStageId, controls }: StageStepperProps) {
   const [openStageId, setOpenStageId] = React.useState<string | null>(null);
   const [editStagesOpen, setEditStagesOpen] = React.useState(false);
+  const [nextActionOpen, setNextActionOpen] = React.useState(false);
   const isClosed = opportunity.status === "closed";
   const openStage = stages.find((stage) => stage.id === openStageId) ?? null;
 
+  function handleNextActionClose() {
+    setNextActionOpen(false);
+    // Add or Edit in the next action bar. The toast button that opened the
+    // dialog is gone by now, and a save replaces Add with Edit, so the
+    // element is looked up when focus is actually lost, not captured here.
+    correctFocusOnceLost(() => document.querySelector<HTMLElement>("[data-next-action-trigger]")?.focus());
+  }
+
   return (
     <div className="flex flex-col gap-3">
       <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
@@ -129,6 +147,25 @@ export function StageStepper({ opportunity, companyName, stages, currentStageId,
           }
         }
         isCurrent={openStage !== null && openStage.id === currentStageId}
+        onMoved={() =>
+          offerNextAction({ roleTitle: opportunity.roleTitle, companyName }, () => setNextActionOpen(true))
+        }
+      />
+      {/* Built from the live props while open, so it shows the next action
+          the page holds now, not the one it held when the move happened. */}
+      <SetNextActionDialog
+        subject={
+          nextActionOpen
+            ? {
+                id: opportunity.id,
+                roleTitle: opportunity.roleTitle,
+                companyName,
+                nextAction: opportunity.nextAction,
+                nextActionAt: opportunity.nextActionAt,
+              }
+            : null
+        }
+        onClose={handleNextActionClose}
       />
       <EditStagesDialog
         open={editStagesOpen}
```

```bash
pnpm exec vitest run tests/unit/stage-detail-sheet.test.tsx tests/unit/stage-stepper.test.tsx tests/unit/next-action-bar.test.tsx
```

Run the three files. Expected: `Tests  7 passed (7)`.

- [ ] **Step 17: Mutation checks for the job page**

In `components/job/stage-detail-sheet.tsx`, move `onMoved();` from after `onOpenChange(false)` to directly after `const result = await moveAction(...)`. Run the test.

Expected: `does not tell its host when the move comes back refused` fails (`Tests  1 failed | 2 passed (3)`).

Revert, then:

In `handleNextActionClose` of `components/job/stage-stepper.tsx` replace the `correctFocusOnceLost(...)` statement with `void correctFocusOnceLost;`. Run the test.

Expected: the full-path case fails on its last assertion (`Tests  1 failed | 1 passed (2)`).

Revert and run both files again to confirm they pass.

- [ ] **Step 18: Run the wider checks**

```bash
pnpm typecheck
```

Expected: exit 0, no error in `job-card.tsx` any more.

```bash
pnpm lint
```

Expected: exit 0, ending in `check:tokens: scanned 70 files, no violations.`

```bash
pnpm test
```

Expected: `Test Files  156 passed | 1 skipped (157)` and `Tests  1677 passed | 2 skipped (1679)` (6 new files and 38 new tests on top of Task 10). Run the board, phone board, stepper, sheet, dialog and fit card files three times in a row once; they must pass every time, because the focus tests depend on timers.

- [ ] **Step 19: Commit**

```bash
git add lib/board/keys.ts components/next-action/offer.ts components/next-action/set-next-action-dialog.tsx components/board/board.tsx components/board/phone-board.tsx components/board/job-card.tsx components/job/stage-stepper.tsx components/job/stage-detail-sheet.tsx components/job/next-action-bar.tsx tests/unit/board-keys.test.ts tests/unit/offer.test.ts tests/unit/set-next-action-dialog.test.tsx tests/unit/job-card.test.tsx tests/unit/board.test.tsx tests/unit/phone-board.test.tsx tests/unit/stage-detail-sheet.test.tsx tests/unit/stage-stepper.test.tsx tests/unit/next-action-bar.test.tsx
git commit -m "$(cat <<'EOF'
feat: offer to set the next action after a move

EOF
)"
```

End the message with the co-author trailer supplied by the executing session.

---

### Task 12: End to end

**Files:**
- Create: `tests/e2e/home.spec.ts`, `tests/e2e/fit.spec.ts`, `tests/e2e/offer.spec.ts`, `tests/e2e/fit-home-phone.spec.ts`, `tests/e2e/scan-menu.ts`
- Modify: `tests/e2e/session.ts`, `tests/e2e/shell.spec.ts`, `playwright.config.ts`

`tests/e2e/account.ts` is not touched: `E2E_HEADLINE` and `E2E_RESUME` already exist from Task 8 and must not be added again.

**Interfaces:**
- Consumes: everything Tasks 6 to 11 built, by accessible name and copy (the README's "UI copy and accessible names"): Home, the fit card and chips, the next action offer and dialog, Settings and Preferences. Existing helpers `scanForViolations` (`axe.ts`), `scanOpenOverlay`, `scanInPlace`, `freezeTransitions`, `login`, `uniqueName`, `addJobAndOpen` (`session.ts`). `E2E_HEADLINE` and `E2E_RESUME` from `account.ts`. The e2e web server already starts with `AI_PROVIDER=fake` (`playwright.config.ts`), so scoring and extraction use the fake driver.
- Produces: the acceptance proof for Home, fit scoring and rule 6 in Chromium, WebKit and the phone viewport, plus these helpers: `addJobOnBoard`, `saveE2eProfile`, `utcInputValue` and `announcements` (in `session.ts`) and `scanOpenMenu` (`scan-menu.ts`).

Rules this task enforces:

- Every browser command runs against a scratch database, never `jobsmith`. The global setup of the suite DROPS the schema of whatever `DATABASE_URL` names, so each command below starts with its own `export` (shell state does not carry over between commands) and refuses to run unless the name is `m5_e2e`. Create it once with `docker exec jobsmith-postgres-1 psql -U postgres -c 'create database m5_e2e'` and drop it when the milestone is done. The owner's dev server on port 3100 is never stopped or reused; this suite runs on port 3400.
- The three browser projects share one account at the same time. No spec changes its time zone or its Home reminder days, and every spec that needs a resume saves the same `E2E_HEADLINE` and `E2E_RESUME` (`saveE2eProfile`), so a blank value from one spec can never wipe what another is about to read. Jobs a spec creates are named with `uniqueName`, and every Home or board assertion is scoped to those jobs.
- A Home row contains two links whose names include `<role> at <company>`: the job link and `Open job` (named `Open <role> at <company>`). Specs find the row by `getByRole("link", { name, exact: true })`.
- The account's zone is `UTC`, so a `datetime-local` value is read as UTC wall time. `utcInputValue` builds it from `toISOString()`; the new specs use no local date getters. (`job-page.spec.ts` has one helper that uses local getters for a value 14 days ahead; it stays in the future under a `UTC` profile whatever the host zone, so it is unchanged.)
- The overdue item uses a next action dated 30 hours back. "Overdue" means before the start of today in the profile zone, and 30 hours back is before that at any time of day. (One hour back, as the README's test list says, is overdue only before 01:00 UTC.)
- Every successful move leaves a ten second toast at the bottom of the screen. A spec that moves a card and then runs axe on the page, or taps near the phone's bottom bar, must dismiss it or wait it out first. These specs scan only the dialog (`scanOpenOverlay`) or pages before any move.
- A menu popup is portaled outside every landmark and carries Base UI focus guards, so a whole-page scan with a menu open reports `region` and (in WebKit) `aria-command-name`. `scanOpenMenu` scans the `[role="menu"]` popup alone with `region` disabled; the page itself is scanned with the menu closed.
- The fit flow is proven with the fake driver: a posting line `Fit score: 81` gives 81 and `Fit score: fail` gives a failed run. Rules 3 and 4 of Home need days to pass and stay covered by unit tests only.
- The server log shows `[WebServer] ⨯ Error: The destination stream closed early.` during a normal run (a request aborted by navigation). It is not a failure. The host can be slow: re-run a spec that timed out once before treating it as a defect.
- Long unbroken names: the phone spec adds a job whose role and company are 80 characters with no space (`Designer<suffix>` and `Lumen<suffix>` padded with letters, unique per run), moves it to Applied through the sheet, opens `Set the next action` and checks that the dialog does not scroll sideways, saves a next action dated 30 hours back so the job is listed on Home, and checks `document.documentElement.scrollWidth <= window.innerWidth` on the board, Home and the job page at 390 px. The classes that make it pass are in Tasks 6, 9, 10, 11 and 13; the dialog and the job header have no other check than this spec.
- Do not install or download browsers. Playwright's Chromium and WebKit builds are already installed; if one is missing, run what can run and say so in the report.

- [ ] **Step 1: Run the suite as it stands**

This is the first real browser run of Tasks 8 and 9 (`settings.spec.ts`, `preferences.spec.ts`, the rewritten `nav.spec.ts`) and of Tasks 6 to 11 against the existing specs. Create the scratch database, then run everything:

```bash
docker exec jobsmith-postgres-1 psql -U postgres -c 'create database m5_e2e'
```

```bash
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/m5_e2e && test "${DATABASE_URL##*/}" = m5_e2e && pnpm db:migrate && PORT=3400 APP_URL=http://localhost:3400 pnpm test:e2e --reporter=line 
```

Expected: `48 passed` and `3 skipped` (the three skips are the desktop-only and phone-only tests on the other project type). A failure here belongs to the task that owns the code or the spec, not to this task: fix it there, with a unit test that would have caught it where one can, and say so in the report. The drafting run of this gate found three: the Task 10 fit card links (axe `link-in-text-block`), the Task 9 alert selector (two elements have role `alert`), and the Task 11 toast button (below); all three fixes are already in those tasks' text.

- [ ] **Step 2: Add the helpers**

Apply this diff to `tests/e2e/session.ts`:

```diff
--- a/tests/e2e/session.ts
+++ b/tests/e2e/session.ts
@@ -1,5 +1,5 @@
 import { expect, type Page, type TestInfo } from "@playwright/test";
-import { EMAIL, PASSWORD } from "./account";
+import { E2E_HEADLINE, E2E_RESUME, EMAIL, PASSWORD } from "./account";
 
 export function uniqueName(testInfo: TestInfo, base: string): string {
   const suffix = Math.random().toString(36).slice(2, 8);
@@ -31,3 +31,36 @@ export async function addJobAndOpen(page: Page, company: string, role: string):
   }
   return slug;
 }
+
+// Adds a job from the board's dialog and stays on the board.
+export async function addJobOnBoard(page: Page, company: string, role: string) {
+  await page.getByRole("button", { name: "Add job" }).click();
+  const dialog = page.getByRole("dialog", { name: "Add a job" });
+  await expect(dialog).toBeVisible();
+  await dialog.getByLabel("Company").fill(company);
+  await dialog.getByLabel("Role").fill(role);
+  await dialog.getByRole("button", { name: "Add job" }).click();
+  await expect(dialog).toBeHidden();
+  await expect(page.getByRole("link", { name: `${role} at ${company}` })).toBeVisible();
+}
+
+// Saves the shared account's profile text. Every spec that needs a resume
+// saves these same two values, so concurrent projects never wipe each other's.
+export async function saveE2eProfile(page: Page) {
+  await page.goto("/settings");
+  await page.getByLabel("Headline").fill(E2E_HEADLINE);
+  await page.getByLabel("Resume").fill(E2E_RESUME);
+  await page.getByRole("button", { name: "Save profile" }).click();
+  await expect(page.getByRole("status").filter({ hasText: "Profile saved." })).toBeVisible();
+}
+
+// A datetime-local value in the profile zone. The shared account stays on
+// UTC, so this reads the UTC wall clock and no local getters.
+export function utcInputValue(offsetMs: number): string {
+  return new Date(Date.now() + offsetMs).toISOString().slice(0, 16);
+}
+
+// The live region the app announces into (not the toast region).
+export function announcements(page: Page) {
+  return page.locator('div[role="status"][aria-live="polite"].sr-only');
+}
```

Create `tests/e2e/scan-menu.ts` in full:

```typescript
import { expect, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { freezeTransitions } from "./freeze-transitions";

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Scans an open dropdown menu in both color schemes, with no reload (a
 * reload would close it). The run is scoped to the menu popup, as
 * scanOpenOverlay is to a dialog: the popup is portaled to the end of <body>,
 * outside every landmark by construction, so the `region` best practice
 * cannot apply to it, and the focus guards Base UI puts beside it are
 * library internals. The page behind it is already covered by
 * scanForViolations on the same route with the menu closed.
 */
export async function scanOpenMenu(page: Page, label: string, testInfo: TestInfo) {
  const slug = slugify(label);
  const unfreeze = await freezeTransitions(page);

  try {
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.waitForFunction(
        (scheme) => window.matchMedia(`(prefers-color-scheme: ${scheme})`).matches,
        colorScheme,
      );
      await page.waitForFunction(
        (scheme) => document.documentElement.classList.contains(scheme),
        colorScheme,
      );
      await expect(page.getByRole("menu")).toBeVisible();
      await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));

      await page.screenshot({
        path: `test-results/screens/${testInfo.project.name}-${slug}-${colorScheme}.png`,
        fullPage: true,
      });

      const results = await new AxeBuilder({ page }).include('[role="menu"]').disableRules(["region"]).analyze();
      for (const violation of results.violations) {
        console.log(`[${label} / ${colorScheme}] ${violation.id} (${violation.impact}): ${violation.help}`);
        for (const node of violation.nodes) {
          console.log(`  target: ${node.target.join(", ")}`);
          console.log(`  summary: ${node.failureSummary}`);
        }
      }
      expect(results.violations, `${label} (${colorScheme}) axe violations`).toEqual([]);
    }
  } finally {
    await unfreeze();
  }
}
```

- [ ] **Step 3: Write the specs**

`tests/e2e/home.spec.ts` in full:

```typescript
import { test, expect } from "@playwright/test";
import { scanInPlace } from "./scan-in-place";
import { scanOpenMenu } from "./scan-menu";
import { addJobAndOpen, announcements, login, uniqueName, utcInputValue } from "./session";

const HOUR_MS = 60 * 60 * 1000;

test("an overdue next action shows under Today, and Snooze until tomorrow removes it and focuses Today", async ({
  page,
}, testInfo) => {
  await login(page);
  const company = uniqueName(testInfo, "Northwind Traders");
  const role = "Product Designer";
  const slug = await addJobAndOpen(page, company, role);

  // 30 hours back is before the start of today in any zone the account can
  // be in, so the item is overdue whatever time of day the suite runs.
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("What is next").fill("Send the follow-up note");
  await page.getByLabel("When").fill(utcInputValue(-30 * HOUR_MS));
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Send the follow-up note")).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Today" })).toBeVisible();

  // The job link and the Open job button both contain the job's name, and
  // other projects add rows to the same list, so the row is found by its
  // exact link name.
  const row = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: `${role} at ${company}`, exact: true }) });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Send the follow-up note. Overdue since");
  await expect(row.getByRole("button", { name: `Mark the next action done for ${role} at ${company}` })).toBeVisible();

  await scanInPlace(page, "home with an overdue item", testInfo);

  const snooze = row.getByRole("button", { name: `Snooze ${role} at ${company}` });
  await snooze.click();
  await expect(page.getByRole("menuitem", { name: "Until tomorrow" })).toBeVisible();
  await scanOpenMenu(page, "home snooze menu", testInfo);

  await page.getByRole("menuitem", { name: "Until tomorrow" }).click();
  await expect(row).toHaveCount(0);
  await expect(announcements(page)).toHaveText(`Snoozed ${role} at ${company}.`);
  await expect(page.locator("#home-today")).toBeFocused();

  // The snooze moved the date and kept the text.
  await page.goto(`/jobs/${slug}`);
  await expect(page.getByText("Send the follow-up note")).toBeVisible();
});

test("a stage scheduled a day ahead shows under Today with Open prep, which opens the Prep tab", async ({
  page,
}, testInfo) => {
  await login(page);
  const company = uniqueName(testInfo, "Acme Robotics");
  const role = "Design Lead";
  await addJobAndOpen(page, company, role);

  await page.getByRole("button", { name: "Saved, current" }).click();
  const sheet = page.getByRole("dialog", { name: "Saved" });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("Date and time").fill(utcInputValue(24 * HOUR_MS));
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(sheet).toBeHidden();

  await page.goto("/");
  const row = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: `${role} at ${company}`, exact: true }) });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Saved, ");

  await row.getByRole("link", { name: `Open prep for ${role} at ${company}` }).click();
  await expect(page).toHaveURL(/tab=prep/);
  await expect(page.getByRole("tab", { name: "Prep" })).toHaveAttribute("aria-selected", "true");
});
```

`tests/e2e/fit.spec.ts` in full:

```typescript
import { test, expect, type Page } from "@playwright/test";
import { scanForViolations } from "./axe";
import { announcements, login, saveE2eProfile, uniqueName } from "./session";

function postingWithScore(company: string, role: string, score: string): string {
  return `Company: ${company}\nRole: ${role}\nFit score: ${score}\n\nAbout the job\nWe are looking for a designer who enjoys internal tools.`;
}

async function addPostedJob(page: Page, posting: string) {
  await page.goto("/board");
  await page.getByRole("button", { name: "Add job" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a job" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Posting text").fill(posting);
  await dialog.getByRole("button", { name: "Add job" }).click();
  await expect(dialog).toBeHidden();
}

test("a job added with a posting is scored after the response, and the score shows on the card, the header and the board", async ({
  page,
}, testInfo) => {
  test.slow();
  await login(page);
  await saveE2eProfile(page);

  const company = uniqueName(testInfo, "Northwind Traders");
  const role = "Product Designer";
  await addPostedJob(page, postingWithScore(company, role, "81"));

  // Open the job at once: the fit card polls while the score is pending.
  await page.getByRole("link", { name: `${role} at ${company}` }).click();
  await expect(page).toHaveURL(/\/jobs\//);

  const card = page.getByRole("region", { name: "Fit", exact: true });
  await expect(card.getByText("Fit score 81, strong fit")).toBeVisible({ timeout: 20_000 });
  await expect(card.getByText("A test score from the fake driver.")).toBeVisible();
  await expect(card.getByText("Above your good-fit line of 70.")).toBeVisible();
  await expect(card.getByRole("heading", { level: 3, name: "Why it fits" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Score again" })).toBeVisible();

  // The header chip sits beside the title.
  const title = page.getByRole("heading", { level: 1 });
  await expect(title.locator("..").getByText("Fit score 81, strong fit")).toBeVisible();

  await scanForViolations(page, "job page with a fit score", testInfo);

  await page.goto("/board");
  const boardCard = page.getByRole("link", { name: `${role} at ${company}` });
  await expect(boardCard).toBeVisible();
  const boardRow = page
    .getByRole("region", { name: "Board columns" })
    .locator("div.rounded-lg.border")
    .filter({ has: boardCard });
  await expect(boardRow.getByText("Fit score 81, strong fit")).toHaveCount(1);
  await expect(boardRow).toContainText("81");
});

test("a failed score shows the failed line, and Try again keeps it failed and says so", async ({ page }, testInfo) => {
  test.slow();
  await login(page);
  await saveE2eProfile(page);

  const company = uniqueName(testInfo, "Lumen Health");
  const role = "Design Lead";
  await addPostedJob(page, postingWithScore(company, role, "fail"));
  await page.getByRole("link", { name: `${role} at ${company}` }).click();
  await expect(page).toHaveURL(/\/jobs\//);

  const card = page.getByRole("region", { name: "Fit", exact: true });
  const failedLine = "Scoring did not work this time. The job is saved as it is.";
  await expect(card.getByText(failedLine)).toBeVisible({ timeout: 20_000 });

  const retry = card.getByRole("button", { name: "Try again" });
  await retry.click();
  await expect(announcements(page)).toHaveText(failedLine);
  await expect(card.getByText(failedLine)).toBeVisible();
  await expect(retry).toBeFocused();

  await scanForViolations(page, "job page with a failed score", testInfo);
});
```

`tests/e2e/offer.spec.ts` in full:

```typescript
import { test, expect } from "@playwright/test";
import { scanOpenOverlay } from "./scan-open";
import { addJobOnBoard, login, uniqueName } from "./session";

test("a move offers the next action, the toast opens the dialog, and n opens it from the card", async ({
  page,
}, testInfo) => {
  test.slow();
  await login(page);
  const company = uniqueName(testInfo, "Northwind Traders");
  const role = "Product Designer";
  const cardName = `${role} at ${company}`;
  await addJobOnBoard(page, company, role);

  const card = page.getByRole("link", { name: cardName });
  // The card's own box: the same text sits on the other projects' cards and
  // in the phone list that the desktop layout hides.
  const cardBox = page
    .getByRole("region", { name: "Board columns" })
    .locator("div.rounded-lg.border")
    .filter({ has: card });
  await card.focus();
  await page.keyboard.press("2");
  await expect(page.getByText(`Moved ${role} at ${company} to Applied.`)).toBeAttached();
  await expect(card).toBeFocused();

  const offer = page.getByText(`What is next for ${role} at ${company}?`);
  await expect(offer).toBeVisible();
  await page.getByRole("button", { name: "Set next action" }).click();

  const dialog = page.getByRole("dialog", { name: "Set the next action" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(cardName);
  await expect(dialog.getByLabel("What is next")).toBeFocused();

  await dialog.getByLabel("What is next").fill("Send the portfolio link");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(`Next action saved for ${role} at ${company}.`)).toBeAttached();
  await expect(card).toBeFocused();
  await expect(cardBox.getByText("Next: Send the portfolio link")).toBeVisible();

  // n opens the same dialog without a move, seeded with what is saved.
  await page.keyboard.press("n");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("What is next")).toHaveValue("Send the portfolio link");

  await scanOpenOverlay(page, "set the next action dialog", testInfo, async () => {
    if (!(await dialog.isVisible())) {
      await card.focus();
      await page.keyboard.press("n");
    }
    await expect(dialog).toBeVisible();
  });

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(card).toBeFocused();
});
```

`tests/e2e/fit-home-phone.spec.ts` in full:

```typescript
import { test, expect } from "@playwright/test";
import { scanForViolations } from "./axe";
import { addJobOnBoard, login, uniqueName, utcInputValue } from "./session";

test("phone: Home, Preferences and Settings fit the screen and pass axe, and a move through the sheet offers the dialog", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "phone only; playwright.config.ts also restricts this file to the phone project");
  test.slow();
  await login(page);

  for (const [path, heading] of [
    ["/", "Home"],
    ["/preferences", "Preferences"],
    ["/settings", "Settings"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      await page.evaluate(() => window.innerWidth),
    );
    await scanForViolations(page, `phone ${path}`, testInfo);
  }

  await page.goto("/board");
  const company = uniqueName(testInfo, "Lumen Health");
  const role = "Product Design Manager";
  await addJobOnBoard(page, company, role);

  await page.getByRole("button", { name: `Move ${role} at ${company}` }).click();
  const sheet = page.getByRole("dialog", { name: "Move to" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Applied" }).click();
  await expect(sheet).toBeHidden();

  await expect(page.getByText(`What is next for ${role} at ${company}?`)).toBeVisible();
  await page.getByRole("button", { name: "Set next action" }).click();
  const dialog = page.getByRole("dialog", { name: "Set the next action" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("What is next").fill("Send the portfolio link");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: `Move ${role} at ${company}` })).toBeFocused();
});

test("phone: an 80-character role and company name wrap on Home, the job page and the next action dialog", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "phone only; playwright.config.ts also restricts this file to the phone project");
  test.slow();
  await login(page);

  // No spaces anywhere, so the browser has no break point to use. The suffix
  // keeps both names unique per run on the shared account.
  const suffix = Math.random().toString(36).slice(2, 8);
  const company = `Lumen${suffix}`.padEnd(80, "c");
  const role = `Designer${suffix}`.padEnd(80, "r");

  const noSidewaysScroll = async (where: string) => {
    const [scrollWidth, innerWidth] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      window.innerWidth,
    ]);
    expect(scrollWidth, `${where} scrolls sideways`).toBeLessThanOrEqual(innerWidth);
  };

  await page.goto("/board");
  await addJobOnBoard(page, company, role);
  await noSidewaysScroll("the board");

  await page.getByRole("button", { name: `Move ${role} at ${company}` }).click();
  const sheet = page.getByRole("dialog", { name: "Move to" });
  await sheet.getByRole("button", { name: "Applied" }).click();
  await expect(sheet).toBeHidden();

  await page.getByRole("button", { name: "Set next action" }).click();
  const dialog = page.getByRole("dialog", { name: "Set the next action" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(`${role} at ${company}`)).toBeVisible();
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(390);
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  // 30 hours back is before the start of today in any zone, so the job is
  // listed on Home whatever time of day this runs.
  await dialog.getByLabel("What is next").fill("Send the portfolio link");
  await dialog.getByLabel("When").fill(utcInputValue(-30 * 60 * 60 * 1000));
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
  await expect(page.getByRole("link", { name: `${role} at ${company}`, exact: true })).toBeVisible();
  await noSidewaysScroll("Home");

  await page.getByRole("link", { name: `${role} at ${company}`, exact: true }).click();
  await expect(page).toHaveURL(/\/jobs\//);
  await expect(page.getByRole("heading", { level: 2, name: "Fit" })).toBeVisible();
  await noSidewaysScroll("the job page");
});
```

Apply this diff to `tests/e2e/shell.spec.ts` (the Home step):

```diff
--- a/tests/e2e/shell.spec.ts
+++ b/tests/e2e/shell.spec.ts
@@ -33,7 +33,8 @@ test("shell: login, board, home, navigation and accessibility", async ({ page },
 
   await test.step("home renders", async () => {
     await page.goto("/");
-    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
+    await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
+    await expect(page.getByRole("heading", { level: 2, name: "Today" })).toBeVisible();
     await scanForViolations(page, "/ (Home)", testInfo);
   });
 
```

- [ ] **Step 4: Run them and confirm nothing runs yet**

```bash
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/m5_e2e && test "${DATABASE_URL##*/}" = m5_e2e && pnpm db:migrate && PORT=3400 APP_URL=http://localhost:3400 pnpm test:e2e --reporter=line home.spec fit.spec offer.spec fit-home-phone
```

Expected: `Error: No tests found.` The new files are in no project's `testMatch` yet.

- [ ] **Step 5: Add the specs to the projects**

Apply this diff to `playwright.config.ts`:

```diff
--- a/playwright.config.ts
+++ b/playwright.config.ts
@@ -23,19 +23,19 @@ export default defineConfig({
     },
     {
       name: "chromium",
-      testMatch: /(shell|pipeline|job-page|documents|bridge|nav|intake|settings|preferences)\.spec\.ts$/,
+      testMatch: /(shell|pipeline|job-page|documents|bridge|nav|intake|settings|preferences|home|fit|offer)\.spec\.ts$/,
       dependencies: ["first-run"],
       use: { ...devices["Desktop Chrome"] },
     },
     {
       name: "webkit",
-      testMatch: /(shell|pipeline|job-page|documents|bridge|nav|intake|settings|preferences)\.spec\.ts$/,
+      testMatch: /(shell|pipeline|job-page|documents|bridge|nav|intake|settings|preferences|home|fit|offer)\.spec\.ts$/,
       dependencies: ["first-run"],
       use: { ...devices["Desktop Safari"] },
     },
     {
       name: "phone",
-      testMatch: /(shell|pipeline-phone|documents-phone|nav|intake-phone)\.spec\.ts$/,
+      testMatch: /(shell|pipeline-phone|documents-phone|nav|intake-phone|fit-home-phone)\.spec\.ts$/,
       dependencies: ["first-run"],
       use: {
         ...devices["iPhone 13"],
```

```bash
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/m5_e2e && test "${DATABASE_URL##*/}" = m5_e2e && pnpm db:migrate && PORT=3400 APP_URL=http://localhost:3400 pnpm test:e2e --reporter=line home.spec fit.spec offer.spec fit-home-phone shell.spec
```

Expected: `22 passed` (the account setup specs run first as the projects' dependency). If one times out, run the same command once more before looking for a cause.

- [ ] **Step 6: Mutation checks**

Each one needs the app rebuilt, which the command does. Make the change, run the named spec in Chromium, see it fail, revert.

1. In `components/home/attention-list.tsx`, delete the line `correctFocusOnceLost(focusToday);` that follows `announce(snoozedAnnouncement(item));`. Run `export DATABASE_URL=postgres://postgres:postgres@localhost:5432/m5_e2e && test "${DATABASE_URL##*/}" = m5_e2e && pnpm db:migrate && PORT=3400 APP_URL=http://localhost:3400 pnpm test:e2e --reporter=line --project=chromium home.spec`. Expected: the snooze test fails on `expect(page.locator("#home-today")).toBeFocused()` (`Received: inactive`).
2. In `app/(app)/board/actions.ts`, replace the `after(() => scoreSafely(scopedFor(user.id), result.id, deps));` line with `void scoreSafely;`. Run `export DATABASE_URL=postgres://postgres:postgres@localhost:5432/m5_e2e && test "${DATABASE_URL##*/}" = m5_e2e && pnpm db:migrate && PORT=3400 APP_URL=http://localhost:3400 pnpm test:e2e --reporter=line --project=chromium fit.spec`. Expected: both tests fail after 20 seconds waiting for the score and the failed line (the job stays `pending`, which the card shows as scoring).
3. In `components/next-action/offer.ts`, delete the `(document.activeElement as HTMLElement | null)?.blur();` statement. Run `export DATABASE_URL=postgres://postgres:postgres@localhost:5432/m5_e2e && test "${DATABASE_URL##*/}" = m5_e2e && pnpm db:migrate && PORT=3400 APP_URL=http://localhost:3400 pnpm test:e2e --reporter=line --project=chromium offer.spec`. Expected: `expect(dialog.getByLabel("What is next")).toBeFocused()` fails (`Received: inactive`): sonner returns focus to the card behind the dialog.

4. In `components/next-action/set-next-action-dialog.tsx`, change `<DialogDescription className="break-words">` back to `<DialogDescription>` and `className="flex min-w-0 flex-col gap-4"` on the `form` back to `className="flex flex-col gap-4"`. Run `export DATABASE_URL=postgres://postgres:postgres@localhost:5432/m5_e2e && test "${DATABASE_URL##*/}" = m5_e2e && pnpm db:migrate && PORT=3400 APP_URL=http://localhost:3400 pnpm test:e2e --reporter=line --project=phone fit-home-phone`. Expected: `an 80-character role and company name wrap...` fails on `expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)` (`Received: false`).
5. In `components/job/job-header.tsx`, change the `h1` class back to `text-xl font-semibold text-foreground` (drop `min-w-0` and `break-words`). Run the same command. Expected: the same test fails with `the job page scrolls sideways` (`Expected: <= 390`, `Received: 684`).

Revert all five and run the command of Step 5 again to confirm `22 passed`.

- [ ] **Step 7: Run the wider checks**

```bash
pnpm typecheck
```

Expected: exit 0.

```bash
pnpm lint
```

Expected: exit 0, ending in `check:tokens: scanned 81 files, no violations.`

```bash
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/m5_e2e && test "${DATABASE_URL##*/}" = m5_e2e && pnpm db:migrate && PORT=3400 APP_URL=http://localhost:3400 pnpm test:e2e --reporter=line 
```

Expected: `60 passed` and `3 skipped` (first-run 4, chromium 24, webkit 24, phone 8; one skip in each browser project), `0 failed`, `0 flaky`. Then confirm the working tree holds nothing but this task's files with `git status --short`.

- [ ] **Step 8: Commit**

```bash
git add tests/e2e/home.spec.ts tests/e2e/fit.spec.ts tests/e2e/offer.spec.ts tests/e2e/fit-home-phone.spec.ts tests/e2e/scan-menu.ts tests/e2e/session.ts tests/e2e/shell.spec.ts playwright.config.ts
git commit -m "$(cat <<'EOF'
test(e2e): add Home, fit, next action offer and phone specs

EOF
)"
```

End the message with the co-author trailer supplied by the executing session.


---

### Task 13: Test against a posting

This is the first task to cut. If the milestone runs long, skip it: nothing else depends on it. Task 14 says which README sentences to drop in that case.

**Files:**
- Create: `lib/fit/test-posting.ts`, `components/preferences/test-posting.tsx`, `tests/unit/fit-test-posting.test.ts`, `tests/unit/test-posting.test.tsx`
- Modify: `app/(app)/preferences/actions.ts`, `app/(app)/preferences/page.tsx`, `tests/integration/preferences-actions.test.ts`, `tests/e2e/preferences.spec.ts`

**Interfaces:**
- Consumes: `resolvePosting` (`lib/intake/resolve.ts`), `intakeDeps` and `AddJobDeps` (`lib/intake/deps.ts`), `addJobFormSchema` and `readAddJobForm` (`lib/intake/form.ts`), `NEEDS_TEXT_MESSAGES` and `NeedsTextReason`, `hardFilters` and `HardFilterResult` (Task 3), `fitReadiness` (Task 3), `scoreFit` and `FitResult` (Task 3), `logFit` and `logFitError` (Task 4), `loadProfile` and `ProfileView` (Task 2), `hasHardFilters` (Task 2), `FitChip`, `FIT_MESSAGES`, `missesFiltersLine`, `uncheckedFiltersLine` and `thresholdLine` (Task 10), `StackedField` (Task 7), `submitViaTransition`, `useAnnounce`, `fieldErrorsFromZod`, `messageFor`. The e2e step uses `saveE2eProfile` and `scanInPlace` (Task 12).
- Produces (the README's Contract, plus what the box needs to read like the job page):

```typescript
// lib/fit/test-posting.ts
export type TestPostingResult = { roleTitle: string | null; companyName: string | null; hardFilters: HardFilterResult; fit: FitResult | null; note: "ai_off" | "no_resume" | "failed" | null };
export type TestPostingOutcome = { kind: "result"; result: TestPostingResult } | { kind: "needs_text"; reason: NeedsTextReason };
export const testPostingFormSchema;   // sourceUrl and postingText as addJobFormSchema, refine "Paste a link or the posting text." on postingText
export async function testPosting(input: { url?: string; text?: string }, ctx: { userId: string; profile: ProfileView }, deps: AddJobDeps): Promise<TestPostingOutcome>;
// app/(app)/preferences/actions.ts (added)
export type TestPostingState = undefined | { ok: true; data: TestPostingResult } | { ok: false; code: "invalid" | "needs_text" | "server_error"; message: string; fieldErrors?: Record<string, string> };
export async function testPostingAction(_prev: TestPostingState, formData: FormData): Promise<TestPostingState>;
// components/preferences/test-posting.tsx ("use client")
export function TestPostingBox(props: { hasHardFilters: boolean; threshold: number }): React.ReactElement;
```

Rules this task enforces:

- The box scores against the SAVED preferences and resume, never unsaved edits on the page. Nothing is written: `testPosting` takes no database handle, and the action touches the database only to read the profile. The action test counts the rows of every table before and after.
- It reads a posting exactly as Add job does (`resolvePosting` with `intakeDeps()`: the fetch guard, ATS adapters, extraction). A link that cannot be read returns `needs_text` and the action maps it to `NEEDS_TEXT_MESSAGES[reason]`, so the messages are the Add job dialog's own. A thrown dependency returns `server_error` with `messageFor("unexpected")`; `logFitError` logs its name only, never its message, because a fetch error can carry the URL.
- Order inside `testPosting`: resolve; hard filters on the resolved fields (always, with or without AI or a resume); `fitReadiness` with `postingMd = bodyMd`; only a `ready` run calls `scoreFit`, with the role and company falling back to `Untitled posting` and `Unknown company`. Notes: `ai_off`, `no_resume`, and `failed` (a scoring failure, and also the readiness `no_posting`, which cannot happen after a successful read). One `[fit]` line per resolved posting with `outcome: "test"` and `opportunityId: null`, through `logFit` (ids, codes, model id, milliseconds, token counts; never posting, resume or summary text). A `needs_text` outcome logs nothing.
- `TestPostingBox` gets `hasHardFilters` and `threshold` from the page (read from the saved preferences). The result type cannot say whether any filter is set or where the good-fit line is, and the box must read like the job page: `No hard filters set.` with a link, and `Above your good-fit line of <n>.` or `Below ...`. (The README's `TestPostingBox(): React.ReactElement` takes no props; this is a listed adjustment.)
- The box is its own `<form>` after the preferences form, never nested in it. It is a `section` named `Test against a posting`; the result is a `section` named `Result` (`h3`) with `h4`s inside it. The status line is always in the document and holds the pending line while the request runs. After a result or a failure, focus returns to `Test` (Chromium drops focus from a disabled button); for `needs_text`, focus goes to `Posting text`. The inputs keep what was typed (the form goes through `submitViaTransition`, so React never resets it).
- The link in a muted line (`Open Settings`, `Set preferences`) is underlined at rest, as in the fit card.
- The result is built from text the person pasted and text a model wrote, so every element that holds it carries `break-words`: the title line, the summary and the `li`s of both lists. The unit test gives each an 80-character word and asserts the class.
- `app/(app)/preferences/page.tsx` already exports `maxDuration = 60` for this box (Task 9).
- No test touches the network: the unit and integration tests use `fakeGuardedFetch({})` and the fake AI driver, and the e2e server runs `AI_PROVIDER=fake`.

- [ ] **Step 1: Write the failing test `tests/unit/fit-test-posting.test.ts` in full**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDriver } from "@/lib/ai/fake";
import type { AiDriver } from "@/lib/ai/driver";
import { testPosting } from "@/lib/fit/test-posting";
import type { AddJobDeps } from "@/lib/intake/deps";
import { DEFAULT_PREFERENCES, parsePreferences } from "@/lib/preferences/schema";
import type { ProfileView } from "@/lib/profile/store";
import { fakeGuardedFetch } from "../helpers/intake";
import { readResumeFixture } from "../helpers/profile";

const NOW = new Date("2026-10-11T20:30:00.000Z");
const USER = { userId: "user-1" };

function profileWith(overrides: Partial<ProfileView> = {}): ProfileView {
  return {
    headline: null,
    resumeMd: readResumeFixture(),
    timezone: "UTC",
    preferences: DEFAULT_PREFERENCES,
    updatedAt: null,
    ...overrides,
  };
}

function depsWith(ai: AiDriver | null): AddJobDeps {
  return { fetch: fakeGuardedFetch({}), ai, now: () => NOW, requestId: "request-1" };
}

function posting(lines: string[] = []): string {
  return ["Company: Northwind Traders", "Role: Product Designer", ...lines, "", "About the job", "We build internal tools."].join("\n");
}

let info: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  info = vi.spyOn(console, "info").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("testPosting", () => {
  it("asks for the text when a link cannot be read", async () => {
    const outcome = await testPosting(
      { url: "https://www.linkedin.com/jobs/view/1000000001/" },
      { ...USER, profile: profileWith() },
      depsWith(createFakeDriver()),
    );
    expect(outcome).toEqual({ kind: "needs_text", reason: "login_required" });
    expect(info).not.toHaveBeenCalled();
  });

  it("scores a pasted posting and checks it against the saved hard filters", async () => {
    const preferences = parsePreferences({ titles: ["Product Designer"], locations: ["Berlin"] });
    const outcome = await testPosting(
      { text: posting(["Location: Amsterdam", "Fit score: 81"]) },
      { ...USER, profile: profileWith({ preferences }) },
      depsWith(createFakeDriver()),
    );
    expect(outcome.kind).toBe("result");
    if (outcome.kind !== "result") return;
    expect(outcome.result.roleTitle).toBe("Product Designer");
    expect(outcome.result.companyName).toBe("Northwind Traders");
    expect(outcome.result.fit?.score).toBe(81);
    expect(outcome.result.note).toBeNull();
    expect(outcome.result.hardFilters).toEqual({ pass: false, failed: ["location"], unchecked: [] });
  });

  it("still checks hard filters when there is no resume, and says why it did not score", async () => {
    const driver = createFakeDriver();
    const preferences = parsePreferences({ titles: ["Product Designer"] });
    const outcome = await testPosting(
      { text: posting() },
      { ...USER, profile: profileWith({ resumeMd: null, preferences }) },
      depsWith(driver),
    );
    if (outcome.kind !== "result") throw new Error("expected a result");
    expect(outcome.result.fit).toBeNull();
    expect(outcome.result.note).toBe("no_resume");
    expect(outcome.result.hardFilters.pass).toBe(true);
    expect(driver.calls.map((call) => call.task)).toEqual(["extract_posting"]);
  });

  it("with AI off, checks what it can and says AI is off", async () => {
    const outcome = await testPosting({ text: posting() }, { ...USER, profile: profileWith() }, depsWith(null));
    if (outcome.kind !== "result") throw new Error("expected a result");
    expect(outcome.result.fit).toBeNull();
    expect(outcome.result.note).toBe("ai_off");
  });

  it("reports a failed score as a note, not an error", async () => {
    const outcome = await testPosting(
      { text: posting(["Fit score: fail"]) },
      { ...USER, profile: profileWith() },
      depsWith(createFakeDriver()),
    );
    if (outcome.kind !== "result") throw new Error("expected a result");
    expect(outcome.result.fit).toBeNull();
    expect(outcome.result.note).toBe("failed");
  });

  it("falls back to Untitled posting and Unknown company in the prompt", async () => {
    const driver = createFakeDriver();
    await testPosting(
      { text: "About the job\nWe build internal tools.\nFit score: 70" },
      { ...USER, profile: profileWith() },
      depsWith(driver),
    );
    const scoring = driver.calls.find((call) => call.task === "score_fit");
    expect(scoring?.prompt).toContain("Role: Untitled posting");
    expect(scoring?.prompt).toContain("Company: Unknown company");
  });

  it("scores against the saved resume and preferences it was given", async () => {
    const driver = createFakeDriver();
    const preferences = parsePreferences({ dealbreakers: ["On-call rotation"] });
    await testPosting(
      { text: posting() },
      { ...USER, profile: profileWith({ headline: "Product designer", preferences }) },
      depsWith(driver),
    );
    const prompt = driver.calls.find((call) => call.task === "score_fit")?.prompt ?? "";
    expect(prompt).toContain("Product designer with eight years");
    expect(prompt).toContain("Dealbreakers: On-call rotation");
  });

  it("logs one test line with the model and no text", async () => {
    await testPosting(
      { text: posting(["Fit score: 81"]) },
      { ...USER, profile: profileWith({ headline: "SECRET-HEADLINE" }) },
      depsWith(createFakeDriver()),
    );
    expect(info).toHaveBeenCalledTimes(1);
    const [tag, json] = info.mock.calls[0] as [string, string];
    expect(tag).toBe("[fit]");
    expect(JSON.parse(json)).toEqual({
      opportunityId: null,
      outcome: "test",
      reason: null,
      modelId: "fake-extractor",
      ms: 0,
      inputTokens: null,
      outputTokens: null,
    });
    expect(json).not.toContain("Northwind");
    expect(json).not.toContain("SECRET");
    expect(error).not.toHaveBeenCalled();
  });
});
```

```bash
pnpm exec vitest run tests/unit/fit-test-posting.test.ts
```

Run it. Expected: it fails to load `@/lib/fit/test-posting`.

- [ ] **Step 2: Write `lib/fit/test-posting.ts` in full**

```typescript
import { z } from "zod";
import { scoreFit, type FitResult } from "@/lib/ai/score-fit";
import type { AddJobDeps } from "@/lib/intake/deps";
import { addJobFormSchema } from "@/lib/intake/form";
import { resolvePosting } from "@/lib/intake/resolve";
import type { NeedsTextReason } from "@/lib/intake/values";
import type { ProfileView } from "@/lib/profile/store";
import { hardFilters, type HardFilterResult } from "./hard-filters";
import { logFit } from "./log";
import { fitReadiness } from "./readiness";

export type TestPostingResult = {
  roleTitle: string | null;
  companyName: string | null;
  hardFilters: HardFilterResult;
  fit: FitResult | null;
  note: "ai_off" | "no_resume" | "failed" | null;
};

export type TestPostingOutcome =
  | { kind: "result"; result: TestPostingResult }
  | { kind: "needs_text"; reason: NeedsTextReason };

// The same two fields and messages as the Add job dialog, plus the rule that
// one of them has to be filled in.
export const testPostingFormSchema = z
  .object({
    sourceUrl: addJobFormSchema.shape.sourceUrl,
    postingText: addJobFormSchema.shape.postingText,
  })
  .refine((value) => Boolean(value.sourceUrl) || Boolean(value.postingText?.trim()), {
    message: "Paste a link or the posting text.",
    path: ["postingText"],
  });

/**
 * Reads a posting the way Add job does, then checks it against the saved
 * hard filters and scores it against the saved resume and preferences. It
 * touches no table: nothing is saved, so the box can be used on any posting
 * at any time. The caller loads the profile.
 */
export async function testPosting(
  input: { url?: string; text?: string },
  context: { userId: string; profile: ProfileView },
  deps: AddJobDeps,
): Promise<TestPostingOutcome> {
  const startedAt = deps.now().getTime();
  const resolved = await resolvePosting({ url: input.url, text: input.text, userId: context.userId }, deps);
  if (resolved.kind === "needs_text") return { kind: "needs_text", reason: resolved.reason };

  const { fields, bodyMd } = resolved.posting;
  const { profile } = context;
  const base = {
    roleTitle: fields.roleTitle,
    companyName: fields.companyName,
    hardFilters: hardFilters(fields, profile.preferences),
  };
  const elapsed = () => deps.now().getTime() - startedAt;
  const unscored = { opportunityId: null, outcome: "test", modelId: null, ms: 0, inputTokens: null, outputTokens: null } as const;

  const readiness = fitReadiness({ aiOn: deps.ai !== null, postingMd: bodyMd, resumeMd: profile.resumeMd });
  if (readiness !== "ready" || profile.resumeMd === null) {
    logFit({ ...unscored, reason: readiness, ms: elapsed() });
    // A blank posting cannot happen after a successful read; if it ever did,
    // "failed" is the honest word.
    const note = readiness === "ai_off" ? "ai_off" : readiness === "no_resume" ? "no_resume" : "failed";
    return { kind: "result", result: { ...base, fit: null, note } };
  }

  const outcome = await scoreFit(
    deps.ai,
    {
      posting: {
        roleTitle: fields.roleTitle ?? "Untitled posting",
        companyName: fields.companyName ?? "Unknown company",
        location: fields.location,
        workMode: fields.workMode,
        compMin: fields.compMin,
        compMax: fields.compMax,
        compCurrency: fields.compCurrency,
        bodyMd,
      },
      headline: profile.headline,
      resumeMd: profile.resumeMd,
      preferences: profile.preferences,
    },
    { userId: context.userId },
  );

  logFit({
    ...unscored,
    reason: outcome.status === "scored" ? null : outcome.error,
    modelId: outcome.modelId,
    ms: elapsed(),
    inputTokens: outcome.usage?.inputTokens ?? null,
    outputTokens: outcome.usage?.outputTokens ?? null,
  });

  if (outcome.status === "scored" && outcome.fit !== null) {
    return { kind: "result", result: { ...base, fit: outcome.fit, note: null } };
  }
  return { kind: "result", result: { ...base, fit: null, note: "failed" } };
}
```

```bash
pnpm exec vitest run tests/unit/fit-test-posting.test.ts
```

Run the test. Expected: `Tests  8 passed (8)`.

Mutation check: replace the `const readiness = fitReadiness({ ... });` statement with `const readiness = "ready" as ReturnType<typeof fitReadiness>;` and run the test. Expected: `still checks hard filters when there is no resume, and says why it did not score` and `with AI off, checks what it can and says AI is off` fail (`Tests  2 failed | 6 passed (8)`). Revert and run again to confirm `Tests  8 passed (8)`.

- [ ] **Step 3: Add the failing action tests**

Apply this diff to `tests/integration/preferences-actions.test.ts`:

```diff
--- a/tests/integration/preferences-actions.test.ts
+++ b/tests/integration/preferences-actions.test.ts
@@ -1,23 +1,37 @@
 import { afterEach, describe, expect, it, vi } from "vitest";
 import type { Db } from "@/lib/db/client";
 import { scoped } from "@/lib/db/scoped";
-import { savePreferencesAction } from "@/app/(app)/preferences/actions";
+import type { PGlite } from "@electric-sql/pglite";
+import { savePreferencesAction, testPostingAction } from "@/app/(app)/preferences/actions";
+import { createFakeDriver } from "@/lib/ai/fake";
+import type { AddJobDeps } from "@/lib/intake/deps";
+import { NEEDS_TEXT_MESSAGES } from "@/lib/intake/messages";
+import { parsePreferences } from "@/lib/preferences/schema";
 import { UNREADABLE_INPUT_VALUE } from "@/lib/forms/submit";
 import { DEFAULT_PREFERENCES } from "@/lib/preferences/schema";
 import { loadProfile } from "@/lib/profile/store";
 import { makeTestDb, createTestUser } from "../helpers/db";
+import { fakeGuardedFetch } from "../helpers/intake";
 import { seedProfile } from "../helpers/profile";
 
 // Same harness as the other action tests: the signed-in user and path
 // revalidation need a live Next.js request, so both are stubbed; scopedFor
 // points at a real PGlite database through the real scoped().
-const harness = vi.hoisted(() => ({ db: undefined as Db | undefined, userId: "" }));
+const harness = vi.hoisted(() => ({
+  db: undefined as Db | undefined,
+  userId: "",
+  deps: undefined as (() => AddJobDeps) | undefined,
+}));
 const revalidatePathMock = vi.hoisted(() => vi.fn());
 
 vi.mock("@/lib/auth/session", () => ({
   requireUser: async () => ({ id: harness.userId }),
 }));
 
+// The test box reads postings through the intake dependencies; each case
+// decides what they are.
+vi.mock("@/lib/intake/deps", () => ({ intakeDeps: () => harness.deps!() }));
+
 vi.mock("next/cache", () => ({
   revalidatePath: revalidatePathMock,
 }));
@@ -44,6 +58,18 @@ async function setup(email: string) {
   return { ...made, s: scoped(made.db, harness.userId) };
 }
 
+async function rowCounts(client: PGlite): Promise<Record<string, number>> {
+  const tables = await client.query<{ table_name: string }>(
+    `select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`,
+  );
+  const counts: Record<string, number> = {};
+  for (const { table_name } of tables.rows) {
+    const rows = await client.query<{ n: number }>(`select count(*)::int as n from "${table_name}"`);
+    counts[table_name] = rows.rows[0]!.n;
+  }
+  return counts;
+}
+
 describe("savePreferencesAction", () => {
   it("saves what the form posts, reads it back, and revalidates every page", async () => {
     const { s, close } = await setup("prefs-save@example.com");
@@ -185,3 +211,92 @@ describe("savePreferencesAction", () => {
     }
   });
 });
+
+describe("testPostingAction", () => {
+  const NOW = new Date("2026-10-11T20:30:00.000Z");
+  const POSTING = "Company: Northwind Traders\nRole: Product Designer\nFit score: 81\n\nAbout the job\nWe build internal tools.";
+
+  function useFakeDeps(overrides: Partial<AddJobDeps> = {}) {
+    harness.deps = () => ({ fetch: fakeGuardedFetch({}), ai: createFakeDriver(), now: () => NOW, requestId: "request-1", ...overrides });
+  }
+
+  afterEach(() => {
+    harness.deps = undefined;
+    vi.restoreAllMocks();
+  });
+
+  it("needs a link or text, and reports the same link error as Add job", async () => {
+    const { close } = await setup("test-posting-invalid@example.com");
+    try {
+      useFakeDeps();
+      expect(await testPostingAction(undefined, form([["postingText", "   "]]))).toEqual({
+        ok: false,
+        code: "invalid",
+        message: "Check the highlighted fields.",
+        fieldErrors: { postingText: "Paste a link or the posting text." },
+      });
+      expect(await testPostingAction(undefined, form([["sourceUrl", "ftp://example.com/job"]]))).toMatchObject({
+        ok: false,
+        code: "invalid",
+        fieldErrors: { sourceUrl: "Enter a link that starts with http or https." },
+      });
+    } finally {
+      await close();
+    }
+  });
+
+  it("scores a pasted posting against the saved resume and preferences, and writes nothing", async () => {
+    const { s, client, close } = await setup("test-posting-ok@example.com");
+    try {
+      await seedProfile(s, { preferences: parsePreferences({ titles: ["Product Designer"] }) });
+      useFakeDeps();
+      const before = await rowCounts(client);
+
+      const state = await testPostingAction(undefined, form([["postingText", POSTING]]));
+
+      expect(state).toMatchObject({
+        ok: true,
+        data: {
+          roleTitle: "Product Designer",
+          companyName: "Northwind Traders",
+          fit: { score: 81 },
+          note: null,
+          hardFilters: { pass: true, failed: [], unchecked: [] },
+        },
+      });
+      expect(await rowCounts(client)).toEqual(before);
+      expect(revalidatePathMock).not.toHaveBeenCalled();
+    } finally {
+      await close();
+    }
+  });
+
+  it("asks for the text when the link needs a login", async () => {
+    const { close } = await setup("test-posting-link@example.com");
+    try {
+      useFakeDeps();
+      expect(
+        await testPostingAction(undefined, form([["sourceUrl", "https://www.linkedin.com/jobs/view/1000000001/"]])),
+      ).toEqual({ ok: false, code: "needs_text", message: NEEDS_TEXT_MESSAGES.login_required });
+    } finally {
+      await close();
+    }
+  });
+
+  it("returns server_error when a dependency throws, and logs no text", async () => {
+    const { close } = await setup("test-posting-throw@example.com");
+    try {
+      const error = vi.spyOn(console, "error").mockImplementation(() => {});
+      useFakeDeps({
+        fetch: (async () => {
+          throw new Error("SECRET-POSTING-TEXT");
+        }) as AddJobDeps["fetch"],
+      });
+      const state = await testPostingAction(undefined, form([["sourceUrl", "https://example.com/jobs/1"]]));
+      expect(state).toMatchObject({ ok: false, code: "server_error" });
+      expect(JSON.stringify(error.mock.calls)).not.toContain("SECRET");
+    } finally {
+      await close();
+    }
+  });
+});
```

```bash
pnpm exec vitest run tests/integration/preferences-actions.test.ts
```

Run it. Expected: the four new `testPostingAction` cases fail (`Tests  4 failed | 5 passed (9)`): the action does not exist yet.

- [ ] **Step 4: Add the action**

Apply this diff to `app/(app)/preferences/actions.ts`:

```diff
--- a/app/(app)/preferences/actions.ts
+++ b/app/(app)/preferences/actions.ts
@@ -3,11 +3,16 @@
 import { revalidatePath } from "next/cache";
 import { requireUser } from "@/lib/auth/session";
 import { scopedFor } from "@/lib/db/scoped";
-import { fieldErrorsByPath, type FormState } from "@/lib/forms/state";
+import { logFitError } from "@/lib/fit/log";
+import { testPosting, testPostingFormSchema, type TestPostingResult } from "@/lib/fit/test-posting";
+import { fieldErrorsByPath, fieldErrorsFromZod, type FormState } from "@/lib/forms/state";
+import { intakeDeps } from "@/lib/intake/deps";
+import { readAddJobForm } from "@/lib/intake/form";
+import { NEEDS_TEXT_MESSAGES } from "@/lib/intake/messages";
 import { readPreferencesForm } from "@/lib/preferences/form";
 import { preferencesSchema } from "@/lib/preferences/schema";
 import { messageFor } from "@/lib/pipeline/messages";
-import { savePreferences } from "@/lib/profile/store";
+import { loadProfile, savePreferences } from "@/lib/profile/store";
 
 export async function savePreferencesAction(_prev: FormState, formData: FormData): Promise<FormState> {
   const user = await requireUser();
@@ -21,3 +26,39 @@ export async function savePreferencesAction(_prev: FormState, formData: FormData
   revalidatePath("/", "layout");
   return { ok: true };
 }
+
+export type TestPostingState =
+  | undefined
+  | { ok: true; data: TestPostingResult }
+  | {
+      ok: false;
+      code: "invalid" | "needs_text" | "server_error";
+      message: string;
+      fieldErrors?: Record<string, string>;
+    };
+
+// Reads, checks and scores one posting against the saved preferences and
+// resume, and writes nothing.
+export async function testPostingAction(_prev: TestPostingState, formData: FormData): Promise<TestPostingState> {
+  const user = await requireUser();
+  const form = readAddJobForm(formData);
+  const parsed = testPostingFormSchema.safeParse({ sourceUrl: form.sourceUrl, postingText: form.postingText });
+  if (!parsed.success) {
+    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: fieldErrorsFromZod(parsed.error) };
+  }
+  try {
+    const profile = await loadProfile(scopedFor(user.id));
+    const outcome = await testPosting(
+      { url: parsed.data.sourceUrl, text: parsed.data.postingText },
+      { userId: user.id, profile },
+      intakeDeps(),
+    );
+    if (outcome.kind === "needs_text") {
+      return { ok: false, code: "needs_text", message: NEEDS_TEXT_MESSAGES[outcome.reason] };
+    }
+    return { ok: true, data: outcome.result };
+  } catch (error) {
+    logFitError(error);
+    return { ok: false, code: "server_error", message: messageFor("unexpected") };
+  }
+}
```

```bash
pnpm exec vitest run tests/integration/preferences-actions.test.ts
```

Run the test. Expected: `Tests  9 passed (9)`.

Mutation check: in `testPostingAction`, after the line `const outcome = await testPosting(...)` completes and before `return { ok: true, data: outcome.result };`, add `const { createOpportunity } = await import("@/lib/pipeline/create"); await createOpportunity(scopedFor(user.id), { companyName: "Mutant", roleTitle: "Mutant" });`. Run the test. Expected: `scores a pasted posting against the saved resume and preferences, and writes nothing` fails (`Tests  1 failed | 8 passed (9)`). Revert and run again to confirm `Tests  9 passed (9)`.

- [ ] **Step 5: Write the failing test `tests/unit/test-posting.test.tsx` in full**

```typescript
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/app/(app)/preferences/actions", () => ({ testPostingAction: vi.fn() }));

import { testPostingAction, type TestPostingState } from "@/app/(app)/preferences/actions";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { TestPostingBox } from "@/components/preferences/test-posting";
import type { TestPostingResult } from "@/lib/fit/test-posting";

const mockedAction = vi.mocked(testPostingAction);

const RESULT: TestPostingResult = {
  roleTitle: "Product Designer",
  companyName: "Northwind Traders",
  hardFilters: { pass: true, failed: [], unchecked: [] },
  fit: {
    score: 81,
    summary: "A strong match for internal tools work.",
    pros: ["Eight years in design systems."],
    cons: ["The posting does not state pay."],
  },
  note: null,
};

function renderBox(props: Partial<{ hasHardFilters: boolean; threshold: number }> = {}) {
  return render(
    <LiveAnnouncerProvider>
      <TestPostingBox hasHardFilters={props.hasHardFilters ?? true} threshold={props.threshold ?? 70} />
    </LiveAnnouncerProvider>,
  );
}

async function submitWith(state: TestPostingState, fields: { link?: string; text?: string } = { text: "A posting" }) {
  mockedAction.mockResolvedValueOnce(state);
  if (fields.link !== undefined) fireEvent.change(screen.getByLabelText("Link to the posting"), { target: { value: fields.link } });
  if (fields.text !== undefined) fireEvent.change(screen.getByLabelText("Posting text"), { target: { value: fields.text } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    // One macrotask lets the mocked action settle and React apply the state.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function result(overrides: Partial<TestPostingResult> = {}): TestPostingState {
  return { ok: true, data: { ...RESULT, ...overrides } };
}

// The box's own status line; the live announcer is a second status element.
const pendingLine = () => document.querySelector('p[role="status"]');
const resultRegion = () => screen.getByRole("region", { name: "Result" });

beforeEach(() => {
  mockedAction.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("TestPostingBox result with long unbroken text", () => {
  it("lets the title, the summary and the lists break inside a word", async () => {
    renderBox();
    const word = "w".repeat(80);
    await submitWith(
      result({
        roleTitle: "r".repeat(80),
        companyName: "c".repeat(80),
        fit: { score: 81, summary: word, pros: [word], cons: [word] },
      }),
    );
    const title = within(resultRegion()).getByText(`${"r".repeat(80)} at ${"c".repeat(80)}`);
    expect(title.className).toContain("break-words");
    const elements = within(resultRegion()).getAllByText(word);
    expect(elements).toHaveLength(3);
    for (const element of elements) expect(element.className).toContain("break-words");
  });
});

describe("TestPostingBox", () => {
  it("has its heading, intro, two fields and a Test button, and nothing else until it runs", () => {
    renderBox();
    const section = screen.getByRole("region", { name: "Test against a posting" });
    expect(within(section).getByRole("heading", { level: 2, name: "Test against a posting" })).not.toBeNull();
    expect(
      within(section).getByText(
        "Paste a link or the posting text to see how a job would score against your saved preferences. Nothing is saved.",
      ),
    ).not.toBeNull();
    expect(within(section).getByLabelText("Link to the posting")).not.toBeNull();
    expect(within(section).getByLabelText("Posting text")).not.toBeNull();
    expect(within(section).getByRole("button", { name: "Test" })).not.toBeNull();
    expect(screen.queryByRole("heading", { level: 3, name: "Result" })).toBeNull();
  });

  it("posts the link and the text the fields hold", async () => {
    renderBox();
    await submitWith(result(), { link: "https://example.com/jobs/1", text: "Pasted text" });
    expect(mockedAction).toHaveBeenCalledTimes(1);
    const sent = mockedAction.mock.calls[0]![1];
    expect(sent.get("sourceUrl")).toBe("https://example.com/jobs/1");
    expect(sent.get("postingText")).toBe("Pasted text");
  });

  it("keeps what was typed after a result", async () => {
    renderBox();
    await submitWith(result(), { text: "Pasted text" });
    expect((screen.getByLabelText("Posting text") as HTMLTextAreaElement).value).toBe("Pasted text");
  });

  it("says it is working while the request runs, and disables Test", async () => {
    renderBox();
    let finish: (state: TestPostingState) => void = () => {};
    mockedAction.mockReturnValueOnce(new Promise<TestPostingState>((resolve) => (finish = resolve)));
    fireEvent.change(screen.getByLabelText("Posting text"), { target: { value: "A posting" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Test" }));
      await Promise.resolve();
    });
    expect(pendingLine()?.textContent).toBe(
      "Reading and scoring the posting. This can take up to half a minute.",
    );
    expect((screen.getByRole("button", { name: "Test" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      finish(result());
      await Promise.resolve();
    });
    expect(pendingLine()?.textContent).toBe("");
  });

  it("shows the score, the summary, both lists and the good-fit line", async () => {
    renderBox({ threshold: 90 });
    await submitWith(result());
    const region = resultRegion();
    expect(within(region).getByRole("heading", { level: 3, name: "Result" })).not.toBeNull();
    expect(within(region).getByText("Product Designer at Northwind Traders")).not.toBeNull();
    expect(region.querySelector('[data-slot="badge"]')?.textContent).toBe("Fit score 81, strong fit");
    expect(within(region).getByText("Below your good-fit line of 90.")).not.toBeNull();
    expect(within(region).getByText("A strong match for internal tools work.")).not.toBeNull();
    expect(within(region).getByText("Eight years in design systems.")).not.toBeNull();
    expect(within(region).getByText("The posting does not state pay.")).not.toBeNull();
    expect(within(region).getByText("Passes your hard filters.")).not.toBeNull();
  });

  it("names an untitled posting", async () => {
    renderBox();
    await submitWith(result({ roleTitle: null, companyName: null }));
    expect(within(resultRegion()).getByText("Untitled posting")).not.toBeNull();
  });

  it("names the role alone when the company is unknown", async () => {
    renderBox();
    await submitWith(result({ companyName: null }));
    expect(within(resultRegion()).getByText("Product Designer")).not.toBeNull();
  });

  it("lists the filters a posting misses and the ones it could not check", async () => {
    renderBox();
    await submitWith(result({ hardFilters: { pass: false, failed: ["title", "pay"], unchecked: ["location"] } }));
    const region = resultRegion();
    expect(within(region).getByText("Misses your hard filters: job title, pay floor.")).not.toBeNull();
    expect(within(region).getByText("Not checked: location.")).not.toBeNull();
  });

  it("says no filters are set, with a way to set them", async () => {
    renderBox({ hasHardFilters: false });
    await submitWith(result());
    const region = resultRegion();
    expect(within(region).getByText(/No hard filters set\./)).not.toBeNull();
    expect(within(region).queryByText("Passes your hard filters.")).toBeNull();
  });

  it.each([
    ["ai_off" as const, "Fit scoring needs AI, and AI is not turned on for this server."],
    ["failed" as const, "Scoring did not work this time. The job is saved as it is."],
  ])("explains a missing score: %s", async (note, line) => {
    renderBox();
    await submitWith(result({ fit: null, note }));
    const region = resultRegion();
    expect(within(region).getByText(line)).not.toBeNull();
    expect(region.querySelector('[data-slot="badge"]')).toBeNull();
  });

  it("explains a missing resume with a link to Settings", async () => {
    renderBox();
    await submitWith(result({ fit: null, note: "no_resume" }));
    const link = within(resultRegion()).getByRole("link", { name: "Open Settings" });
    expect(link.getAttribute("href")).toBe("/settings");
    expect(link.classList.contains("underline")).toBe(true);
  });

  it("announces the result", async () => {
    renderBox();
    await submitWith(result());
    const live = document.querySelector('div[role="status"][aria-live="polite"]');
    // The announcer sets its text on the next tick, so wait for it.
    await waitFor(() => expect(live?.textContent).toBe("Tested Product Designer at Northwind Traders. Fit score 81."));
  });

  it("shows field errors under the fields and puts focus back on Test", async () => {
    renderBox();
    await submitWith(
      {
        ok: false,
        code: "invalid",
        message: "Check the highlighted fields.",
        fieldErrors: { postingText: "Paste a link or the posting text." },
      },
      { text: "" },
    );
    expect(screen.getByRole("alert").textContent).toBe("Check the highlighted fields.");
    const text = screen.getByLabelText("Posting text");
    expect(text.getAttribute("aria-invalid")).toBe("true");
    expect(text.getAttribute("aria-describedby")).toContain(
      screen.getByText("Paste a link or the posting text.").id,
    );
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Test" }));
  });

  it("asks for the pasted text and focuses its field when a link cannot be read", async () => {
    renderBox();
    await submitWith(
      { ok: false, code: "needs_text", message: "This site needs a login, so Jobsmith cannot read the link. Paste the posting text instead." },
      { link: "https://www.linkedin.com/jobs/view/1000000001/", text: "" },
    );
    expect(screen.getByRole("alert").textContent).toContain("Paste the posting text instead.");
    expect(document.activeElement).toBe(screen.getByLabelText("Posting text"));
  });

  it("shows a server error and keeps the form usable", async () => {
    renderBox();
    await submitWith({ ok: false, code: "server_error", message: "Something went wrong. Try again." });
    expect(screen.getByRole("alert").textContent).toBe("Something went wrong. Try again.");
    expect((screen.getByRole("button", { name: "Test" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("clears the previous result and error when it runs again", async () => {
    renderBox();
    await submitWith(result());
    expect(screen.queryByRole("heading", { level: 3, name: "Result" })).not.toBeNull();
    await submitWith({ ok: false, code: "server_error", message: "Something went wrong. Try again." });
    expect(screen.queryByRole("heading", { level: 3, name: "Result" })).toBeNull();
  });
});
```

```bash
pnpm exec vitest run tests/unit/test-posting.test.tsx
```

Run it. Expected: it fails to load `@/components/preferences/test-posting`.

- [ ] **Step 6: Write `components/preferences/test-posting.tsx` in full**

```typescript
"use client";

import * as React from "react";
import Link from "next/link";

import { testPostingAction, type TestPostingState } from "@/app/(app)/preferences/actions";
import { FitChip } from "@/components/fit/fit-chip";
import { StackedField } from "@/components/forms/stacked-field";
import { useAnnounce } from "@/components/live-announcer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { TestPostingResult } from "@/lib/fit/test-posting";
import { FIT_MESSAGES, missesFiltersLine, thresholdLine, uncheckedFiltersLine } from "@/lib/fit/messages";
import { submitViaTransition } from "@/lib/forms/submit";

const LINK_CLASS = "text-foreground underline underline-offset-4";
const PENDING_TEXT = "Reading and scoring the posting. This can take up to half a minute.";

function titleOf(result: TestPostingResult): string {
  if (result.roleTitle && result.companyName) return `${result.roleTitle} at ${result.companyName}`;
  return result.roleTitle ?? "Untitled posting";
}

function ResultView({
  result,
  hasHardFilters,
  threshold,
}: {
  result: TestPostingResult;
  hasHardFilters: boolean;
  threshold: number;
}) {
  const headingId = React.useId();
  const { fit, hardFilters, note } = result;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-lg border p-4">
      <h3 id={headingId} className="text-sm font-medium text-foreground">
        Result
      </h3>
      <p className="font-medium break-words text-foreground">{titleOf(result)}</p>

      {fit ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <FitChip score={fit.score} />
            <p className="text-sm text-muted-foreground">{thresholdLine(fit.score, threshold)}</p>
          </div>
          <p className="break-words text-foreground">{fit.summary}</p>
          {fit.pros.length > 0 ? (
            <div className="flex flex-col gap-1">
              <h4 className="text-sm font-medium text-foreground">{FIT_MESSAGES.whyItFits}</h4>
              <ul className="list-disc pl-5 text-sm text-foreground">
                {fit.pros.map((pro, index) => (
                  <li key={index} className="break-words">
                    {pro}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {fit.cons.length > 0 ? (
            <div className="flex flex-col gap-1">
              <h4 className="text-sm font-medium text-foreground">{FIT_MESSAGES.mayNotFit}</h4>
              <ul className="list-disc pl-5 text-sm text-foreground">
                {fit.cons.map((con, index) => (
                  <li key={index} className="break-words">
                    {con}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : note ? (
        <p className="text-sm text-muted-foreground">
          {FIT_MESSAGES[note]}
          {note === "no_resume" ? (
            <>
              {" "}
              <Link href="/settings" className={LINK_CLASS}>
                {FIT_MESSAGES.openSettings}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="flex flex-col gap-1">
        <h4 className="text-sm font-medium text-foreground">{FIT_MESSAGES.hardFilters}</h4>
        {hasHardFilters ? (
          <>
            <p className="text-sm text-foreground">
              {hardFilters.failed.length > 0 ? missesFiltersLine(hardFilters.failed) : FIT_MESSAGES.passes}
            </p>
            {hardFilters.unchecked.length > 0 ? (
              <p className="text-sm text-muted-foreground">{uncheckedFiltersLine(hardFilters.unchecked)}</p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {FIT_MESSAGES.noFiltersSet}{" "}
            <Link href="/preferences" className={LINK_CLASS}>
              {FIT_MESSAGES.setPreferences}
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Scores one posting against the saved preferences and resume without saving
 * anything. `hasHardFilters` and `threshold` come from the saved preferences
 * the page loaded, so the result reads the same way the job page does.
 */
export function TestPostingBox({ hasHardFilters, threshold }: { hasHardFilters: boolean; threshold: number }) {
  const headingId = React.useId();
  const announce = useAnnounce();
  const [state, formAction, pending] = React.useActionState<TestPostingState, FormData>(testPostingAction, undefined);
  const submitRef = React.useRef<HTMLButtonElement>(null);
  const textRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (state === undefined) return;
    if (state.ok) {
      announce(
        state.data.fit
          ? `Tested ${titleOf(state.data)}. Fit score ${state.data.fit.score}.`
          : `Tested ${titleOf(state.data)}.`,
      );
    }
    // The button is disabled while the request runs, and Chromium drops focus
    // from a disabled button. A link that cannot be read sends the person to
    // the field that needs the text.
    if (!state.ok && state.code === "needs_text") textRef.current?.focus();
    else submitRef.current?.focus();
  }, [state, announce]);

  const errors = state?.ok === false ? state.fieldErrors : undefined;

  return (
    <section aria-labelledby={headingId} className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-base font-semibold text-foreground">
          Test against a posting
        </h2>
        <p className="text-sm text-muted-foreground">
          Paste a link or the posting text to see how a job would score against your saved preferences. Nothing is
          saved.
        </p>
      </div>

      <form noValidate onSubmit={(event) => submitViaTransition(event, formAction)} className="flex flex-col gap-4">
        {state?.ok === false ? (
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        ) : null}

        <StackedField label="Link to the posting" error={errors?.sourceUrl}>
          {(id, describedBy) => (
            <Input
              id={id}
              name="sourceUrl"
              type="url"
              inputMode="url"
              autoComplete="off"
              aria-describedby={describedBy}
              aria-invalid={Boolean(errors?.sourceUrl)}
            />
          )}
        </StackedField>

        <StackedField label="Posting text" error={errors?.postingText}>
          {(id, describedBy) => (
            <Textarea
              ref={textRef}
              id={id}
              name="postingText"
              rows={6}
              aria-describedby={describedBy}
              aria-invalid={Boolean(errors?.postingText)}
            />
          )}
        </StackedField>

        {/* Always in the document, so a screen reader hears the line when it appears. */}
        <p role="status" className="text-sm text-muted-foreground">
          {pending ? PENDING_TEXT : null}
        </p>

        <Button ref={submitRef} type="submit" disabled={pending} className="self-start">
          Test
        </Button>
      </form>

      {state?.ok ? <ResultView result={state.data} hasHardFilters={hasHardFilters} threshold={threshold} /> : null}
    </section>
  );
}
```

```bash
pnpm exec vitest run tests/unit/test-posting.test.tsx
```

Run the test. Expected: `Tests  18 passed (18)`.

Mutation checks:

1. Replace `{hasHardFilters ? (` with `{true ? (` in `ResultView`. Run the test. Expected: `says no filters are set, with a way to set them` fails (`Tests  1 failed | 17 passed (18)`). Revert.
2. Replace `if (!state.ok && state.code === "needs_text") textRef.current?.focus();` with `if (false) textRef.current?.focus();`. Run the test. Expected: `asks for the pasted text and focuses its field when a link cannot be read` fails (`Tests  1 failed | 17 passed (18)`). Revert.
3. In `ResultView`, delete `break-words` from the title paragraph `<p className="font-medium break-words text-foreground">{titleOf(result)}</p>` (or from the `li` of the pros or the cons). Run the test. Expected: `lets the title, the summary and the lists break inside a word` fails (`Tests  1 failed | 17 passed (18)`). Revert.

Run the file again to confirm `Tests  18 passed (18)`.

- [ ] **Step 7: Show the box on the page**

Apply this diff to `app/(app)/preferences/page.tsx`:

```diff
--- a/app/(app)/preferences/page.tsx
+++ b/app/(app)/preferences/page.tsx
@@ -1,6 +1,8 @@
 import { PreferencesForm } from "@/components/preferences/preferences-form";
+import { TestPostingBox } from "@/components/preferences/test-posting";
 import { requireUser } from "@/lib/auth/session";
 import { scopedFor } from "@/lib/db/scoped";
+import { hasHardFilters } from "@/lib/preferences/schema";
 import { loadProfile } from "@/lib/profile/store";
 
 // The test box on this page fetches a posting and scores it in one request
@@ -19,6 +21,10 @@ export default async function PreferencesPage() {
         preferences. A job that misses a filter is only flagged, never hidden.
       </p>
       <PreferencesForm preferences={profile.preferences} />
+      <TestPostingBox
+        hasHardFilters={hasHardFilters(profile.preferences)}
+        threshold={profile.preferences.scoreThreshold}
+      />
     </div>
   );
 }
```

- [ ] **Step 8: End to end**

Apply this diff to `tests/e2e/preferences.spec.ts`:

```diff
--- a/tests/e2e/preferences.spec.ts
+++ b/tests/e2e/preferences.spec.ts
@@ -1,6 +1,7 @@
 import { test, expect, type Page } from "@playwright/test";
 import { scanForViolations } from "./axe";
-import { login } from "./session";
+import { scanInPlace } from "./scan-in-place";
+import { login, saveE2eProfile } from "./session";
 
 // Chromium and WebKit run this file at the same time against one account, so
 // each test only makes sure a value is there and never removes one: whichever
@@ -86,3 +87,40 @@ test("Preferences has no accessibility violations", async ({ page }, testInfo) =
   await expect(page.getByRole("heading", { level: 1, name: "Preferences" })).toBeVisible();
   await scanForViolations(page, "preferences form", testInfo);
 });
+
+test("Test against a posting scores a pasted posting with the saved preferences and saves nothing", async ({
+  page,
+}, testInfo) => {
+  test.slow();
+  await login(page);
+  await saveE2eProfile(page);
+
+  await page.goto("/preferences");
+  await ensureTitle(page, "Product Designer");
+  await leaveMustHaveInBox(page, "Design reviews");
+  await page.getByRole("button", { name: "Save preferences" }).click();
+  await expect(page.getByRole("status").filter({ hasText: "Preferences saved." })).toBeVisible();
+
+  const box = page.getByRole("region", { name: "Test against a posting" });
+  await box.getByRole("button", { name: "Test" }).click();
+  await expect(box.getByText("Paste a link or the posting text.")).toBeVisible();
+  await expect(box.getByLabel("Posting text")).toHaveAttribute("aria-invalid", "true");
+
+  await box.getByLabel("Posting text").fill(
+    "Company: Northwind Traders\nRole: Product Designer\nFit score: 81\n\nAbout the job\nWe are looking for a designer who enjoys internal tools.",
+  );
+  await box.getByRole("button", { name: "Test" }).click();
+
+  const result = box.getByRole("region", { name: "Result" });
+  await expect(result).toBeVisible({ timeout: 30_000 });
+  await expect(result.getByText("Product Designer at Northwind Traders")).toBeVisible();
+  await expect(result.getByText("Fit score 81, strong fit")).toBeVisible();
+  await expect(result.getByText("Passes your hard filters.")).toBeVisible();
+  await expect(box.getByRole("button", { name: "Test" })).toBeFocused();
+
+  await scanInPlace(page, "preferences test box result", testInfo);
+
+  // Nothing was saved: the board has no job for this posting.
+  await page.goto("/board");
+  await expect(page.getByRole("link", { name: "Product Designer at Northwind Traders", exact: true })).toHaveCount(0);
+});
```

```bash
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/m5_e2e && test "${DATABASE_URL##*/}" = m5_e2e && pnpm db:migrate && PORT=3400 APP_URL=http://localhost:3400 pnpm test:e2e --reporter=line preferences.spec
```

Expected: `12 passed` (the account setup specs, then the four preferences tests in Chromium and in WebKit). The posting text carries `Fit score: 81`, which the fake driver turns into 81.

- [ ] **Step 9: Run the wider checks**

```bash
pnpm typecheck
```

Expected: exit 0.

```bash
pnpm lint
```

Expected: exit 0, ending in `check:tokens: scanned 81 files, no violations.`

```bash
pnpm test
```

Expected, in the combined checkout of Tasks 1 to 13: `Test Files  158 passed | 1 skipped (159)` and `Tests  1707 passed | 2 skipped (1709)`. (This task adds 30 tests: 8, 18 and 4.)

- [ ] **Step 10: Commit**

```bash
git add lib/fit/test-posting.ts components/preferences/test-posting.tsx app/\(app\)/preferences/actions.ts app/\(app\)/preferences/page.tsx tests/unit/fit-test-posting.test.ts tests/unit/test-posting.test.tsx tests/integration/preferences-actions.test.ts tests/e2e/preferences.spec.ts
git commit -m "$(cat <<'EOF'
feat: add the Test against a posting box to Preferences

EOF
)"
```

End the message with the co-author trailer supplied by the executing session.


---

### Task 14: Docs and ship

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-09-18-jobsmith-core-design.md`, `docs/design-system.md`

No code changes. The preview check may find a defect: fix it in the file the owning task changed, with a test first, as its own commit, before the docs commit below.

**Interfaces:**
- Consumes: the shipped behaviour of Tasks 1 to 13 (and Task 12's e2e gate).
- Produces: documentation that matches the code, and the milestone's preview pass.

Rules this task enforces:

- Prose in the README, the spec notes and the design system file follows the writing rules: plain words, no exclamation marks, no em dashes, no filler. Decision numbers (`D2`) appear only in the spec notes, which cite them the way the earlier milestones' notes do. The README does not cite them. Code comments never cite them.
- If Task 13 was cut, drop from the README diff the `"Test against a posting" scores ...` paragraph under Preferences and the sentence about the test box in the spec's 5.7 note (the spec's own line about the box stays).
- The spec notes go under the sections the README's task list names: 3 (D2), 5.1 (D22), 5.2 (D17, D10), 5.6 (D8, D11, D12, D13, D15), 5.7 (D6, D7), 5.8 (D19, D20, D21), 5.9 (D24, D26), 6 (D3, D4, D5) and 7 (D25, D27).
- `docs/design-system.md` lists `StackedField`, `ListInput`, `AttentionList`, `FitChip`, `FitCard` and `SetNextActionDialog` as new application code, each with the reason no installed registry item or `base-nova` primitive fits.
- The last step, pushing the branch and opening the pull request, happens only when the owner says so in chat. Never push `main`.

- [ ] **Step 1: Update `README.md`**

Apply this diff:

```diff
--- a/README.md
+++ b/README.md
@@ -10,8 +10,8 @@ provider key.
 Next.js 16 and React 19 with Tailwind CSS 4, Postgres through Drizzle ORM, Better Auth for sign-in, and
 the Vercel AI SDK for the optional AI features (`package.json`).
 
-Pages: `/board` (jobs by stage), `/companies`, `/jobs/<slug>` (one job), `/settings`, and `/` (Home).
-`/library` and `/preferences` are placeholders for later milestones. Without a session, every page
+Pages: `/` (Home), `/board` (jobs by stage), `/companies`, `/jobs/<slug>` (one job), `/preferences`
+and `/settings`. `/library` is a placeholder for a later milestone. Without a session, every page
 redirects to `/login`, except `/setup` and `/login` themselves.
 
 ## Requirements
@@ -87,8 +87,9 @@ it plain and moving the card afterward.
 
 ### AI (optional)
 
-Jobsmith works with no AI configured; intake then asks for the company and role by hand. Four
-environment variables turn it on, read in `.env.example`:
+Jobsmith works with no AI configured; intake then asks for the company and role by hand, and jobs
+get no fit score (hard filters still work). Four environment variables turn it on, read in
+`.env.example`, and the same four serve intake and fit scoring:
 
 - `AI_PROVIDER`: `gateway` (Vercel AI Gateway), `anthropic` (the Anthropic API directly), or `fake`
   (the test suite's own stand-in, which never sends text anywhere). Unset means AI stays off.
@@ -115,6 +116,82 @@ the card where it was.
 Below 768px wide the board is a list grouped by stage instead of columns;
 each row's "Move to" button opens the same seven choices in a sheet.
 
+After every successful move (a drag, a digit key, the "Move to" menu, the phone sheet, or the stage
+sheet on a job page) a toast asks "What is next for ..." with a "Set next action" button that stays for
+ten seconds. The button opens a small dialog for the next action and its time. Nothing opens by
+itself, so keyboard use is never interrupted. On a focused card, `n` opens the same dialog directly.
+
+## Fit scoring
+
+A job added with a posting is scored after the page responds, so adding never waits for the model.
+Scoring needs three things: AI turned on (above), the posting text, and a resume saved in Settings.
+Without a resume the job stays unscored and its fit card links to Settings. On a job page, "Score this
+job", "Try again" and "Score again" run it by hand. Nothing else triggers a score: importing, editing
+a job's details and saving preferences or the resume leave existing scores alone, and the card says
+"Your profile changed after this score." when the profile is newer than the score.
+
+What is sent to the model: the job's role, company, location, work mode and pay, the posting text
+(first 12,000 characters), the resume with its headline (first 12,000 characters), and a short
+summary of your preferences, each inside a fixed wrapper that tells the model to treat it as data.
+Nothing about your account goes with it. The result is a score from 0 to 100, one sentence on why, up
+to three pros and up to three cons, stored with the model id and the time. Logs carry ids, codes,
+durations and token counts, never posting, resume, preference or summary text.
+
+The chip on the board and the job page uses three bands, kept in `lib/fit/bands.ts`: strong from 70,
+partial from 40 to 69, weak below 40, shown as a mark (a check, a dot or a minus) beside the number.
+"Good fit from" in Preferences is separate: it sets the line the fit card says the score is above or
+below.
+
+Hard filters run in code, with or without AI, every time a job page renders: job titles, work modes,
+locations and a pay floor. A job that misses one is flagged on its fit card and never hidden or moved.
+A filter whose fact the posting does not state is listed as "Not checked" instead of failing.
+
+If a run fails, the job is saved as it is and the card offers "Try again". A job still marked as
+scoring after two minutes shows "Scoring did not finish." with the same button. With AI off the card
+says so and still shows the hard filters.
+
+## Home
+
+`/` lists what to do today, in this order: interviews in the next 72 hours (with "Open prep"), next
+actions that are due today or overdue (with "Done"), applied jobs with no news for "Follow up after"
+days and no next action, saved jobs older than "Apply or drop after" days with no next action, and
+past interviews to close out. Every item has one main action. Due next actions, follow-ups and
+apply-or-drop items also have "Snooze", which sets the next action to 09:00 tomorrow, in three days or
+in a week, in your time zone, and keeps the existing next action text. Interviews cannot be snoozed.
+Beside the list sit a count of jobs per column and the last five documents pushed from the command
+line. Days are counted in your profile's time zone, so a next action due "today" is the same whether
+you look in the morning or late at night.
+
+## Preferences
+
+`/preferences` stores one versioned document in your profile. Four fields are hard filters: job
+titles, work modes, locations and the pay floor (with its currency). Seniority, pay target,
+must-haves, dealbreakers, industries to avoid and company size only feed the model's prompt, and a
+dealbreaker never flags a job in code. "Good fit from" sets the fit card's line, and the two Home
+reminder fields set the days for follow-ups and for saved jobs. A stored value that no longer parses
+falls back to its default for that field alone, so a bad value never breaks a page.
+
+"Test against a posting" scores a link or pasted text against your saved preferences and resume
+without saving a job. It reads the posting the way Add job does, so a LinkedIn link asks for the
+text. Save your changes first: the box ignores edits you have not saved.
+
+## Settings, time zone and export
+
+`/settings` has three sections. Profile holds a headline (up to 200 characters), the resume as markdown
+(up to 50,000 characters) and your time zone. The resume is used only for fit scoring: it never
+appears in the command line context, and it is included in your export. API tokens are unchanged.
+
+Every date and time in the app is shown in the profile time zone, and times you type are read in it.
+It starts as UTC; nothing is detected for you. "Use this device's time zone" appears when your
+browser's zone differs from the saved one. A time that does not exist on a clock-change day (the hour
+that is skipped in spring) moves later by the length of the gap; a time that happens twice (autumn)
+means the first one.
+
+"Export my data" downloads `jobsmith-export-<date>.json` from `/settings/export`: your profile
+(including the resume), companies, jobs, stages, people, events, every version of every document and
+your API token records. It leaves out sign-in sessions, password hashes, token secrets and the
+derived values the app recomputes (such as duplicate-check hashes).
+
 ## Documents and the command line
 
 Every document on a job's Research, Documents and Prep tabs is markdown, and the `jobsmith` command
```

- [ ] **Step 2: Add the spec notes**

Apply this diff to `docs/superpowers/specs/2026-09-18-jobsmith-core-design.md`:

```diff
--- a/docs/superpowers/specs/2026-09-18-jobsmith-core-design.md
+++ b/docs/superpowers/specs/2026-09-18-jobsmith-core-design.md
@@ -89,6 +89,13 @@ ever sees the shared `AiDriver` interface, never a provider SDK directly. AI sta
 `AI_PROVIDER` is set, on purpose, so a developer's own leftover API key in the shell environment
 never sends a posting anywhere by accident.
 
+**Milestone 5 note.** Decision D2: `lib/fit`, `lib/preferences`, `lib/profile`, `lib/home` and
+`lib/export` are added to the module map. `lib/fit` holds score bands, hard filters, the stored fit
+document and the scoring runner. `lib/preferences` and `lib/profile` hold the versioned preferences
+schema and the profile reads and writes. `lib/home` assembles the Home view and `lib/export` the data
+export. `lib/time/zone.ts` holds all time zone math. The pure modules import no database or framework
+code.
+
 ## 4. Data model
 
 Core creates these tables. `prep_question`, `library_item` and `asset` appear on the board's data model but ship with the Prep cycle.
@@ -163,6 +170,12 @@ A card shows company, role, fit score, a chip for a custom stage label, days in
 
 **Milestone 2 notes.** Decision D8 (the "Move to" menu, above) is already noted inline. Rule 6's offer to set the next action after a move is not built in Milestone 2; it arrives with Home in Milestone 5, which owns next-action prompting.
 
+**Milestone 5 note.** Decision D22: rule 6 is built as an offer. After every successful move from the
+board (drag, digit keys, "Move to" menu), the phone sheet and the job page's stage sheet, a toast asks
+"What is next for ..." with a "Set next action" button for ten seconds, and the button opens a dialog
+that reuses the next action form. On a focused desktop card, `n` opens the dialog directly. Nothing
+opens on its own, so the board stays fully usable by keyboard.
+
 ### 5.2 Job page
 
 Route `/jobs/[slug]`. The header has the role, company, location, fit chip, a link to the original posting and a menu with Close and Reopen. Below it sit the stage stepper with "Edit stages" and the next action bar with Done and Edit.
@@ -187,6 +200,13 @@ sent. A `Paste markdown` button on each of the three tabs, and `Paste a new vers
 document, write with origin `pasted`. The tab order is Overview, Research, People, Documents,
 Timeline, Prep, and the strip wraps to a second row rather than growing the page at phone width.
 
+**Milestone 5 notes.** Decisions D17 and D10: the fit card is the first section of Overview, above the
+posting, and it always shows the hard-filter result, even with AI off or no score, so the Milestone 2
+rule that hid it while `fit_score` was null no longer applies. The chip beside the job title and on
+each board card is an outlined badge with the number, a band mark that carries the tone (strong from
+70, partial from 40, weak below 40) and screen-reader text with the band word. The "good fit from"
+preference only sets the line the card compares the score with.
+
 ### 5.3 Artifacts
 
 An artifact is identified inside its scope (one opportunity, or one company) by `key`, for example `cv`, `call-card`, `answers-full`. Versions count up from 1. The kind registry in `lib/artifacts/kinds.ts` is the single list of kinds, their tab and whether they can be marked as sent. An unknown kind arriving through the bridge is stored as `other` and reported as a warning.
@@ -296,6 +316,18 @@ Two parts, kept separate so the cheap part always works:
 
 Scoring runs after the response is sent. `fit_status` moves from `pending` to `done` or `failed`, and the job page offers a retry. With an empty resume text the status stays `none` and the fit card links to Settings. Posting and resume text are truncated to fixed limits before the call and are never logged. Score bands for the chip color are constants in one file.
 
+**Milestone 5 notes.** Decisions D8, D11, D12, D13 and D15. Hard filters (D8) match whole words after
+normalizing case, accents and punctuation; remote postings skip the location check; a filter whose
+posting fact is missing is "not checked", not failed. They are computed when a page renders and never
+stored. Scoring (D11) runs only for a newly added job and from the job page's buttons, never on
+import, edits or saves; it runs whatever the hard filters say. Readiness (D12) is checked in the order
+AI off, no posting, no resume, and a job that is not ready keeps status `none` with the reason on the
+card. The background run (D13) sets `pending` inside the request and runs through `after()`; the
+runner never throws and never leaves `pending` behind, and a `pending` older than two minutes shows as
+stalled with a retry. The model-facing schema (D15) has no numeric or length limits, because provider
+support for them varies; the sanitizer enforces every limit and treats an unusable answer as a failed
+run.
+
 ### 5.7 Preferences
 
 Route `/preferences`. Stored in `profile.preferences` as one document validated by a versioned Zod schema, so fields can change without migrations:
@@ -304,6 +336,13 @@ Route `/preferences`. Stored in `profile.preferences` as one document validated
 
 The page explains which fields are hard filters and which feed the scoring prompt. A "Test against a posting" box that scores a pasted URL is the last task of milestone 5 and is the first thing cut if the milestone runs long.
 
+**Milestone 5 notes.** Decisions D6 and D7: the document is validated by `preferencesSchema` version 1.
+`{}` parses to all defaults. Stored data is parsed whole first and then field by field, each failing
+top-level field falling back to its own default. Lists are trimmed, capped at 20 entries of 80
+characters and de-duplicated without regard to case. Job titles, work modes, locations and the pay
+floor are hard filters; every other field feeds only the scoring prompt or Home, and the page says
+which is which. Hard filters flag and never hide.
+
 ### 5.8 Home
 
 Route `/`. `lib/attention` is one pure function over opportunities, stages and the current time. It returns items in this order:
@@ -316,6 +355,17 @@ Route `/`. `lib/attention` is one pure function over opportunities, stages and t
 
 Each item has one primary action and a snooze that sets the next action date. Beside the list: counts per column and the last five artifact pushes. The feed block on the wireframe belongs to the Feed cycle.
 
+**Milestone 5 notes.** Decisions D19, D20 and D21. Items are per rule and job (or per rule and stage),
+so one job can appear under a stage rule and a next-action rule at once. Rules 3 and 4 apply only to a
+job with no next action, and a job with an undated next action never shows under rules 2 to 4. Rule 1
+covers now through 72 hours inclusive. Rule 2 means due before the start of tomorrow in the profile
+zone, and "overdue" before the start of today. Rules 3 and 4 count calendar days in the profile zone.
+Snooze is offered on rules 2, 3 and 4 only, with the presets tomorrow, in three days and next week at
+09:00 in the profile zone, and it writes no timeline event. On phones Home is one column; from the
+`lg` breakpoint, Today sits beside a Pipeline and Recent pushes column. The list is hand-written
+because the registry's feed view renders each row as one button, and a row here needs a link or button
+plus a menu.
+
 ### 5.9 Settings
 
 Profile (headline, resume text as markdown, timezone), API tokens (create, reveal once, revoke), and "Export my data", which downloads every row the user owns as JSON with no secrets. Export exists in Core because it is cheap now and the hosted version needs it.
@@ -324,6 +374,13 @@ Profile (headline, resume text as markdown, timezone), API tokens (create, revea
 Settings - Profile and Export both arrive in Milestone 5, on the same page. A token is shown once, at
 creation, and never again; only its sha256 hash and an eight-character display prefix are stored.
 
+**Milestone 5 notes.** Decisions D24 and D26. Settings has three sections under one `h1`: Profile,
+API tokens and Export my data. Export is `GET /settings/export`; it answers 401 without a session and
+otherwise sends one JSON file with `cache-control: no-store`. It excludes sessions, accounts,
+verification rows, rate limit rows, token hashes and rate counters, every `user_id`, and derived
+values (`name_key`, `dedupe_hash`, `content_hash`, `source_hash`). It includes every document
+version, person emails and links, and the resume.
+
 ### 5.10 Login and first run
 
 `/setup` works only while the user table is empty and creates the first account. First-run setup is protected by a setup token: when `SETUP_TOKEN` is set, the form asks for it and the sign-up endpoint rejects a first account without it. A production build requires the token. While the variable is unset, `/setup` shows a locked notice and no account can be created, so a stranger cannot claim a fresh public deployment. Local development works without a token. After the first account exists, `/setup` returns 404, and sign-up stays closed unless `ALLOW_SIGNUP=true`. `/login` takes email and password. Sessions are database-backed cookies. Every page, server action and API route checks the session or token itself. Route-level protection is an extra layer and never the only check.
@@ -342,6 +399,15 @@ creation, and never again; only its sha256 hash and an eight-character display p
 - Times are stored as `timestamptz` (UTC instants) and shown in the profile timezone.
 - Milestone 2 note (decision D7): there is no Settings page and no stored profile time zone until Milestone 5. Until then, every timestamp shown in the UI is rendered and entered in the browser's own time zone, through `components/local-time.tsx` and `components/local-datetime-input.tsx` only, so adding the real profile time zone later touches just those two files.
 
+**Milestone 5 note.** Decisions D3, D4 and D5: the profile time zone is read once in the app layout and
+handed to client components through a provider, so the existing `LocalTime` and `LocalDateTimeInput`
+call sites do not change; the provider adds a third file to the two named above. Server-side day math
+(Home, snooze, the export file name) uses `lib/time/zone.ts` with the same zone. Zone math uses `Intl`
+only, with no date library. A wall time that was skipped by a clock change moves later by the gap, and
+a repeated one resolves to the earlier instant. Existing profiles keep `UTC` until the owner picks a
+zone in Settings, which offers the device zone with one click. The stored value is the canonical name
+of an accepted zone, so `Etc/UTC` and `GMT` are stored as `UTC`.
+
 ## 7. Security and privacy
 
 - Tenancy through the scoped query helper, plus the isolation test in section 8.
@@ -367,6 +433,12 @@ never send a job posting anywhere without an explicit choice to turn intake's AI
 address, and every request it makes is checked against the same address and port policy before it
 connects.
 
+**Milestone 5 note.** Decisions D25 and D27: the headline is at most 200 characters and the resume at
+most 50,000, with line endings normalized. The resume is never part of the bridge context and never
+logged; it is in the export. The bridge context's Preferences section lists the saved preferences,
+including the pay floor and target, so pay figures reach command line context files; the resume and
+headline never do.
+
 ## 8. Testing
 
 Test-driven for everything under `lib/`.
```

- [ ] **Step 3: Record the new components in the design system file**

Apply this diff to `docs/design-system.md`:

```diff
--- a/docs/design-system.md
+++ b/docs/design-system.md
@@ -68,3 +68,24 @@ Other dependencies: `@dnd-kit/core` `6.3.1` (not a registry item; the board's dr
   or similar inline notice pattern to copy from; it reuses the exact
   `rounded-lg border border-border bg-muted p-3 text-sm` shell `job-header.tsx`'s own closed-job
   banner already uses, rather than inventing a second one.
+- `components/forms/stacked-field.tsx`: hand-written. The registry's `field-row` puts the label in a
+  fixed 6rem column beside the control, which wraps labels such as "Apply or drop after" onto three
+  lines on the Settings and Preferences pages. `StackedField` puts the label above the control and
+  wires the hint and error into `aria-describedby`; `field-row` stays in use for the dialogs.
+- `components/forms/list-input.tsx` (`ListInput`): hand-written. None of the installed registry items
+  or `base-nova` primitives is a list-of-strings input. It is a fieldset with removable chips
+  (`Badge`, `Button`), an `Input` and an Add button, and posts one hidden input per entry.
+- `components/home/attention-list.tsx` (`AttentionList`): hand-written. The registry's `feed-view`
+  renders each row as one button, and a Home row needs a link to the job, a primary action and a
+  snooze menu (`DropdownMenu`) as separate controls.
+- `components/fit/fit-chip.tsx` (`FitChip`): a thin composition of the `base-nova` `Badge` and a
+  `lucide-react` mark. None of the installed registry items shows a score with a tone. The tone rides
+  on the mark and the number stays in the foreground color, because the status tokens are tuned for
+  icons, not text contrast.
+- `components/fit/fit-card.tsx` (`FitCard`): hand-written. None of the installed registry items is a
+  score card with a summary, two lists, a retry and a polling state. It composes `FitChip` and
+  `Button`.
+- `components/next-action/set-next-action-dialog.tsx` (`SetNextActionDialog`): the `base-nova`
+  `Dialog` around the same two fields as the job page's next action form (`FieldRow`,
+  `LocalDateTimeInput`). None of the installed registry items is a dialog that opens from a toast and
+  from a card key.
```

- [ ] **Step 4: Check the prose**

```bash
pnpm lint
```

Expected: exit 0, ending in `check:tokens: scanned 81 files, no violations.` (The docs are not linted; this confirms nothing else changed.)

```bash
git diff -U0 README.md docs | grep '^+' | grep -nP '\x{2014}|\x{2013}|!' || echo clean
```

Expected: `clean`. Then read each README section once against the running app: the numbers (70, 40, 12,000 characters, 200 and 50,000, 72 hours, two minutes, ten seconds, 09:00) are the ones in the code.

- [ ] **Step 5: Commit the docs**

```bash
git add README.md docs/superpowers/specs/2026-09-18-jobsmith-core-design.md docs/design-system.md
git commit -m "$(cat <<'EOF'
docs: document fit scoring, Home, Preferences, Settings and export

EOF
)"
```

End the message with the co-author trailer supplied by the executing session.

- [ ] **Step 6: Preview check in Chrome and Safari**

Two targets, kept apart so nothing changes the owner's data:

- Scratch preview, where every step that writes may run. Use the scratch database from Task 12 or a new one. In one shell:

```bash
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/m5_e2e && test "${DATABASE_URL##*/}" = m5_e2e && pnpm db:migrate && pnpm seed
```

`pnpm seed` prints the demo account's password once; keep it for the browser. It refuses to run when an account already exists, so on a database the e2e suite used, run `ALLOW_DB_RESET=true pnpm reset-db` first (scratch databases only). Then, in the same command line style, build and start with the fake AI driver, so a pasted `Fit score: 81` line scores 81 without a key:

```bash
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/m5_e2e && test "${DATABASE_URL##*/}" = m5_e2e && pnpm build && PORT=3400 APP_URL=http://localhost:3400 AI_PROVIDER=fake pnpm start
```

- The owner's real data: only to look at Home, with his own server (his `pnpm dev` on port 3100, run from this branch by him) and his own sign-in. Do not run `seed`, `reset-db` or the e2e suite against his database, and do not click Done or Snooze there unless he says to.

Run the whole list in Chrome and in Safari, each at desktop width and at 390 px wide (Chrome's device toolbar; in Safari, Develop, Enter Responsive Design Mode, 390 by 844, or Safari in the iOS Simulator):

1. Sign in on the scratch preview. `/` shows `Home`, `Today` and the summary column. At desktop width the summary sits to the right of the list; at 390 px it sits below it. Nothing scrolls sideways.
2. Settings: save a headline and a resume, then reload; both stay. Pick `America/New_York` in the time zone list (type `new` in the open list to jump to it) and save. Every time on every page now reads in New York time.
3. The clock-change check, in Safari (the one thing no automated browser could prove). On a job's page, `Add` a next action `Zone check` with `When` set to 14 March 2027, 02:30, a time that does not exist in New York because the clocks jump from 02:00 to 03:00. Save. The page must show 3:30 AM on 14 March 2027 (the time moves later by the length of the gap). Edit it to 1 November 2026, 01:30, a time that happens twice. Save. The page must show 1:30 AM, and it must be the first of the two, the one before the clocks go back (the downloaded export file shows its `nextActionAt` as `2026-11-01T05:30:00.000Z`). If those dates have passed, use the next ones: US clocks change on the second Sunday of March and the first Sunday of November. Close the zone check job afterwards, and set the time zone back to `UTC` when this step is done.
4. Add a job with pasted text that has a line `Fit score: 81` and Company and Role lines. The job page opens with `Scoring this job`, then the Fit card shows 81 within about 20 seconds without a manual reload; the header chip and the board card show 81 with a check mark. Add one with `Fit score: fail`: the card says the score did not work, and `Try again` keeps it that way.
5. Move a card with a digit key: a toast `What is next for ...` appears; `Set next action` opens the dialog with the field focused; saving shows `Next:` on the card, and focus returns to the card. Press `n` on a card: the dialog opens without a move. On the 390 px layout, move through the `Move to` sheet and check the toast does not hide the sheet's last choices or the bottom bar for good (it leaves after ten seconds).
6. Home: a job with a next action dated yesterday shows `Overdue since`; `Snooze`, `Until tomorrow` removes it and focus lands on `Today`. A stage scheduled tomorrow shows `Open prep` and opens the Prep tab.
7. Preferences: add a job title with the keyboard (type, Enter), press `Remote`, save, reload. Use `Test against a posting` with a pasted posting: the result shows a score and a hard-filter line, and the board has no new job. (Skip this if Task 13 was cut.)
8. Export: `Download JSON` saves `jobsmith-export-<date>.json`; open it and confirm it has no `tokenHash`.
9. Dark mode: repeat items 1, 4 and 6 once with the system set to dark.
10. The owner's data, look only: open `/` and compare each row with the board by hand. Every interview within 72 hours, every due next action, every applied job quiet for the follow-up days and every saved job older than the apply-or-drop days should be there once, and nothing that has a next action in the future should appear under follow up or apply or drop. Note anything that reads wrongly and report it; do not change his data.

Evidence already in hand, so you know what to look for: the plan author ran the zone cases from item 3, the Amsterdam gap on 28 March 2027 and the midnight hour parse in Playwright's WebKit 26.6 and in Chromium; both gave the same instants (07:30 UTC, 05:30 UTC, 01:30 UTC) and midnight read as hour 0, not 24. That is the WebKit engine, not the Safari application, so item 3 stays a required step. The drafting run also found that WebKit reports `Etc/UTC` where Node reports `UTC`, and `Asia/Kolkata` where Node reports `Asia/Calcutta`; the stored value is always the server's canonical name, so neither changes anything the user sees.

A step that fails is a defect: report it with the browser, width and what was on screen.

- [ ] **Step 7: Final checks**

```bash
pnpm typecheck
```

```bash
pnpm lint
```

```bash
pnpm test
```

Expected: exit 0 for the first two; for the third, `Test Files  158 passed | 1 skipped (159)` and `Tests  1707 passed | 2 skipped (1709)` (one fewer file and 30 fewer tests if Task 13 was cut).

```bash
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/m5_e2e && test "${DATABASE_URL##*/}" = m5_e2e && pnpm db:migrate && PORT=3400 APP_URL=http://localhost:3400 pnpm test:e2e --reporter=line 
```

Expected: `62 passed` and `3 skipped` (first-run 4, chromium 25, webkit 25, phone 8), `0 failed`, `0 flaky`. If Task 13 was cut, `60 passed`. Then drop the scratch database: `docker exec jobsmith-postgres-1 psql -U postgres -c 'drop database m5_e2e'`.

- [ ] **Step 8: Owner-gated: push and open the pull request**

Stop here and report to the owner: the branch, the commit list (`git log --oneline main..HEAD`), the check results and the preview findings. Do nothing below until the owner says to push in chat.

State the target first: repo `weeeha/jobsmith`, branch `feat/m5-fit-home`, local path of this worktree. Check which GitHub account the session is signed in as (`gh auth status`): two Claude Code accounts exist with separate `gh` logins, and a push from the wrong one is refused with a 403. If it is the wrong one, tell the owner instead of changing credentials. Then:

```bash
git push -u origin feat/m5-fit-home
gh pr create --base main --head feat/m5-fit-home --title "feat: Fit and Home (Milestone 5)" --body "$(cat <<'EOF'
## Summary

Home lists what to do today (interviews in 72 hours, due next actions, follow-ups, saved jobs to apply to or drop, interviews to close out) with snooze, pipeline counts and recent pushes. New jobs with a posting get a fit score after the response, shown as a fit card on the job page and a banded chip on the job header and the board. Preferences and Settings (profile, time zone, export) are real pages, every time in the app renders in the profile time zone, and a successful move offers to set the next action. Preferences also has a Test against a posting box.

## Test plan

- [ ] pnpm typecheck, pnpm lint, pnpm test
- [ ] pnpm test:e2e on a scratch database: Chromium, WebKit and phone
- [ ] Preview checked in Chrome and Safari, desktop and 390 px, including a daylight-saving gap time in Safari
- [ ] Home checked against the owner's own data
EOF
)"
```

End the pull request body with the generated-with line supplied by the executing session. Report the pull request link and the preview link. Never merge, and never push `main`.

