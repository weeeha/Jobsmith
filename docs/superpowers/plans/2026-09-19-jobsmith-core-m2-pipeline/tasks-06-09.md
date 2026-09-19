# Milestone 2 (Pipeline): Tasks 6 to 9

Part of the Milestone 2 plan. Read [README.md](README.md) first: it holds the goal, the global constraints and the Contract (called "the frame" in the task text) that these tasks follow. These tasks cover the UI foundations, the desktop board, the add job dialog and the phone board.


### Task 6: UI foundations

**Files:**
- Create: `lib/time/local.ts`, `lib/pipeline/labels.ts`, `lib/pipeline/messages.ts`, `lib/forms/state.ts`, `components/live-announcer.tsx`, `components/local-time.tsx`, `components/local-datetime-input.tsx`, `components/refresh-on-focus.tsx`
- Test: `tests/unit/time-local.test.ts`, `tests/unit/pipeline-labels.test.ts`, `tests/unit/pipeline-messages.test.ts`, `tests/unit/form-state.test.ts`, `tests/unit/live-announcer.test.tsx`, `tests/unit/local-time.test.tsx`, `tests/unit/local-datetime-input.test.tsx`, `tests/unit/refresh-on-focus.test.tsx`
- Modify: `app/(app)/layout.tsx`, `app/globals.css`, `vitest.config.mts`, `package.json`, `docs/design-system.md`
- Install (files appear, exact set confirmed when you run the commands): `components/ui/dialog.tsx`, `components/ui/select.tsx`, `components/ui/textarea.tsx`, `components/ui/sonner.tsx`, `components/ui/toggle-group.tsx`, `components/ui/empty.tsx`, `components/super-ai/detail-view-shell.tsx`, `components/super-ai/detail-tabs.tsx`, `components/super-ai/detail-fields.tsx`, `components/super-ai/use-container-width.tsx`, `components/super-ai/empty-state.tsx`, `components/super-ai/mode-tabs.tsx`, `components/super-ai/field-row.tsx`, and whatever `field-row`'s own registry dependency `reset-affordance` writes

**Interfaces:**
- Consumes: `STAGE_KINDS`, `StageKind` from `lib/pipeline/kinds.ts` (Milestone 1). `CLOSED_REASONS`, `WORK_MODES`, `STAGE_FORMATS`, `PERSON_ROLES`, `STAGE_STATUSES` and their types from `lib/pipeline/values.ts` (Task 1).
- Produces (copied from the frame character for character, plus the two helpers named in this section):

```typescript
// components/live-announcer.tsx ("use client")
export function LiveAnnouncerProvider(props: { children: React.ReactNode }): React.ReactElement;
export function useAnnounce(): (message: string) => void;
// components/local-time.tsx ("use client")
export function LocalTime(props: { value: Date | string; mode?: "date" | "datetime" }): React.ReactElement;
// components/local-datetime-input.tsx ("use client")
export function LocalDateTimeInput(props: { id: string; name: string; defaultValue: string | null; "aria-describedby"?: string }): React.ReactElement;
// components/refresh-on-focus.tsx ("use client")
export function RefreshOnFocus(): null;
// lib/time/local.ts
export function toInstant(localValue: string): string;
export function toLocalInputValue(iso: string): string;
// lib/pipeline/labels.ts
export const CLOSED_REASON_LABELS: Record<ClosedReason, string>;
export const WORK_MODE_LABELS: Record<WorkMode, string>;
export const STAGE_FORMAT_LABELS: Record<StageFormat, string>;
export const PERSON_ROLE_LABELS: Record<PersonRole, string>;
export const STAGE_STATUS_WORDS: Record<StageStatus, string>;
export function columnTitle(kind: StageKind): string;
// lib/pipeline/messages.ts
export function messageFor(code: string): string;
// lib/forms/state.ts
export type FormState = { ok: true } | { ok: false; code: string; message: string; fieldErrors?: Record<string, string>; href?: string } | undefined;   // href: a link that belongs to the message, used for the duplicate job ("Open it")
export function fieldErrorsFromZod(error: z.ZodError): Record<string, string>;
```

This task also installs `@dnd-kit/core`, the `dialog`, `select`, `textarea`, `sonner`, `toggle-group` and `empty` primitives, and the `detail-view-shell`, `empty-state`, `mode-tabs` and `field-row` registry items, so every later task in this milestone can assume they are present.

One thing this task must resolve that the frame does not spell out:

**`use-view-mode` import path.** Jobsmith already has `lib/use-view-mode.tsx` (ported in Milestone 1, not under `hooks/` despite `components.json`'s `hooks` alias). The `detail-view-shell` registry item's own manifest declares its `use-view-mode` dependency's install target as `lib/use-view-mode.tsx`, the same path Jobsmith already uses, so installing it should be a no-op or an identical-file skip. What is not guaranteed is the import line **inside** the installed `components/super-ai/detail-view-shell.tsx` and `detail-fields.tsx`: their source writes `import type { DetailMode } from "@/registry/super-ai/use-view-mode"` and relies on the shadcn CLI rewriting that prefix to the real installed path at install time. Step 12 below has the builder grep the installed files for this and fix it by hand if the CLI left the wrong path in. This is called out here because it is easy to miss: the files still compile-error only when something else imports `DetailMode` from the wrong place, which will not happen until Task 10 (Tasks 10 to 14) imports it, so a silent wrong path here would surface as a confusing error far from its cause.

Do not use `FieldRow`'s optional `reset` prop anywhere in this milestone. It is meant to hold a `reset-affordance` control, and that item's source is not part of the registry snapshot this plan was written against, so its props are unverified. Every `FieldRow` in Task 8 renders without `reset`, which is a supported, complete state of the component (its doc comment: "Omitting it renders exactly what shipped before").

**Deciding on `jsdom` and `@testing-library/react`:** `vitest.config.mts` sets `environment: "node"` with no per-file override, and `package.json` has neither `jsdom` nor `@testing-library/react` nor `@testing-library/dom` in `devDependencies`. Four of this task's components render React and need to be unit tested by mounting them, so both packages are added in Step 1. The default environment stays `"node"` (cheaper for the plain-function tests elsewhere in this milestone); each test file that mounts a component opts into `jsdom` for itself with a `// @vitest-environment jsdom` comment on its first line, a per-file Vitest pragma that does not touch the shared config's default.

**`pb-safe`:** `app/globals.css` already defines custom utilities the same way (`@utility duration-fast { ... }` and its three neighbors, around line 207), for the same reason: `pb-safe` needs a `padding-bottom` value from `env()`, which has no Tailwind theme namespace to fall into. Step 13 adds one more `@utility` block next to those four, not a new `@layer` section.

- [ ] **Step 1: Add the component-testing dependencies and wire the `.tsx` test glob**

```bash
pnpm add -D jsdom @testing-library/react
```

Expected: `jsdom` and `@testing-library/react` appear under `devDependencies` in `package.json` (`@testing-library/dom` comes in transitively as `@testing-library/react`'s own dependency; nothing to add for it).

Edit `vitest.config.mts`, adding the `.tsx` glob next to the existing `.ts` one:

```typescript
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "tests/unit/**/*.test.ts",
      "tests/unit/**/*.test.tsx",
      "tests/integration/**/*.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});
```

The default `environment` stays `"node"`. A test file that needs a DOM opts in for itself (Step 6 below shows the exact comment).

- [ ] **Step 2: Write the failing test for the local time helpers**

Create `tests/unit/time-local.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { toInstant, toLocalInputValue } from "@/lib/time/local";

describe("toInstant", () => {
  it("converts a datetime-local value in the runtime zone to an ISO instant", () => {
    expect(toInstant("2026-10-01T09:30")).toBe(new Date("2026-10-01T09:30").toISOString());
  });

  it("passes an empty string through unchanged", () => {
    expect(toInstant("")).toBe("");
  });
});

describe("toLocalInputValue", () => {
  it("converts an ISO instant back to a datetime-local value in the runtime zone", () => {
    const iso = new Date("2026-10-01T09:30").toISOString();
    expect(toLocalInputValue(iso)).toBe("2026-10-01T09:30");
  });

  it("passes an empty string through unchanged", () => {
    expect(toLocalInputValue("")).toBe("");
  });

  it("round-trips through toInstant", () => {
    const original = "2026-01-05T00:15";
    expect(toLocalInputValue(toInstant(original))).toBe(original);
  });
});
```

Both expectations compute their own reference value the same way the implementation will, instead of a hardcoded literal, so the test passes in any timezone the runner happens to use.

- [ ] **Step 3: Run it and confirm it fails**

```bash
pnpm exec vitest run tests/unit/time-local.test.ts
```

Expected: fails with `Cannot find module '@/lib/time/local'`.

- [ ] **Step 4: Implement the local time helpers**

Create `lib/time/local.ts`:

```typescript
/**
 * A `datetime-local` input's value ("2026-10-01T09:30") has no time zone
 * designator. The Date constructor's ISO-8601 parsing treats a date-time
 * string with no zone as LOCAL time (only a date-only string parses as UTC),
 * which is exactly the browser's own zone that produced the input value, so
 * this is a plain parse, not a manual offset calculation.
 */
export function toInstant(localValue: string): string {
  if (localValue === "") return "";
  return new Date(localValue).toISOString();
}

/** Zero-padded to two digits, e.g. 5 -> "05". */
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * The inverse of toInstant: an ISO instant back to a "YYYY-MM-DDTHH:MM"
 * value in the runtime's own zone, read through the local getters
 * (getFullYear/getMonth/...), never the UTC ones.
 */
export function toLocalInputValue(iso: string): string {
  if (iso === "") return "";
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
```

- [ ] **Step 5: Run it and confirm it passes**

```bash
pnpm exec vitest run tests/unit/time-local.test.ts
```

Expected: `Tests 5 passed (5)`.

- [ ] **Step 6: Write the failing test for the live announcer, implement, confirm it passes**

Create `tests/unit/live-announcer.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { LiveAnnouncerProvider, useAnnounce } from "@/components/live-announcer";

function Announcer({ message }: { message: string }) {
  const announce = useAnnounce();
  return (
    <button type="button" onClick={() => announce(message)}>
      Announce
    </button>
  );
}

describe("LiveAnnouncerProvider", () => {
  it("renders an empty, visually hidden aria-live region by default", () => {
    render(
      <LiveAnnouncerProvider>
        <p>content</p>
      </LiveAnnouncerProvider>,
    );
    const region = screen.getByRole("status");
    expect(region.textContent).toBe("");
    expect(region.className).toContain("sr-only");
  });

  it("puts the announced message into the live region", () => {
    vi.useFakeTimers();
    render(
      <LiveAnnouncerProvider>
        <Announcer message="Moved Priya Raman at Acme Robotics to Applied." />
      </LiveAnnouncerProvider>,
    );
    act(() => {
      screen.getByRole("button").click();
      vi.advanceTimersByTime(50);
    });
    expect(screen.getByRole("status").textContent).toBe(
      "Moved Priya Raman at Acme Robotics to Applied.",
    );
    vi.useRealTimers();
  });

  it("throws when useAnnounce is called outside the provider", () => {
    function Bad() {
      useAnnounce();
      return null;
    }
    expect(() => render(<Bad />)).toThrow();
  });
});
```

Run it:

```bash
pnpm exec vitest run tests/unit/live-announcer.test.tsx
```

Expected: fails with `Cannot find module '@/components/live-announcer'`.

Create `components/live-announcer.tsx`:

```tsx
"use client";

import * as React from "react";

const LiveAnnouncerContext = React.createContext<((message: string) => void) | null>(null);

export function LiveAnnouncerProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = React.useState("");

  const announce = React.useCallback((next: string) => {
    // A live region only speaks on a text change. Setting the identical
    // string twice in a row (moving two different cards to the same column,
    // for example, can produce the same sentence) would otherwise be silent
    // the second time, so this clears first and sets the real text on the
    // next tick, which is two distinct DOM mutations for assistive tech to
    // pick up rather than one no-op write.
    setMessage("");
    window.setTimeout(() => setMessage(next), 50);
  }, []);

  return (
    <LiveAnnouncerContext.Provider value={announce}>
      {children}
      <div role="status" aria-live="polite" className="sr-only">
        {message}
      </div>
    </LiveAnnouncerContext.Provider>
  );
}

export function useAnnounce(): (message: string) => void {
  const announce = React.useContext(LiveAnnouncerContext);
  if (!announce) {
    throw new Error("useAnnounce must be used within a LiveAnnouncerProvider");
  }
  return announce;
}
```

```bash
pnpm exec vitest run tests/unit/live-announcer.test.tsx
```

Expected: `Tests 3 passed (3)`.

- [ ] **Step 7: Write the failing test for `LocalTime`, implement, confirm it passes**

Create `tests/unit/local-time.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocalTime } from "@/components/local-time";

const ISO = "2026-10-01T09:30:00.000Z";

describe("LocalTime", () => {
  it("renders the raw ISO instant as the dateTime attribute", () => {
    render(<LocalTime value={ISO} />);
    expect(screen.getByRole("time" as never, { hidden: true })).toBeUndefined;
  });

  it("shows the Intl-formatted date, in date mode", () => {
    render(<LocalTime value={ISO} />);
    const expected = new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(ISO));
    const el = screen.getByText(expected);
    expect(el.tagName).toBe("TIME");
    expect(el.getAttribute("dateTime")).toBe(ISO);
  });

  it("shows the Intl-formatted date and time, in datetime mode", () => {
    render(<LocalTime value={ISO} mode="datetime" />);
    const expected = new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(ISO));
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it("accepts a Date value directly", () => {
    render(<LocalTime value={new Date(ISO)} />);
    const expected = new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(ISO));
    expect(screen.getByText(expected)).toBeTruthy();
  });
});
```

The first test above is a placeholder assertion that always passes (`toBeUndefined` on a getter that already threw would fail the suite, not this line) - replace it before running Step 8's failure check. Delete it now and keep only the other three; a `<time>` element's `dateTime` attribute is already covered by the second test, so a fourth, DOM-role-based check adds nothing.

Run it:

```bash
pnpm exec vitest run tests/unit/local-time.test.tsx
```

Expected: fails with `Cannot find module '@/components/local-time'`.

Create `components/local-time.tsx`:

```tsx
"use client";

import * as React from "react";

const DATE_OPTIONS: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };
const DATETIME_OPTIONS: Intl.DateTimeFormatOptions = {
  ...DATE_OPTIONS,
  hour: "numeric",
  minute: "2-digit",
};

export function LocalTime({
  value,
  mode = "date",
}: {
  value: Date | string;
  mode?: "date" | "datetime";
}) {
  const date = typeof value === "string" ? new Date(value) : value;
  const iso = date.toISOString();

  // Server render and the first client render both take this branch, so they
  // produce identical HTML and there is no hydration mismatch to suppress.
  // Only after mount does the effect below flip this to the localized text,
  // which is then an ordinary client-side update, not a hydration diff.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const fallback = mode === "datetime" ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : iso.slice(0, 10);
  const formatted = mounted
    ? new Intl.DateTimeFormat(undefined, mode === "datetime" ? DATETIME_OPTIONS : DATE_OPTIONS).format(date)
    : fallback;

  return <time dateTime={iso}>{formatted}</time>;
}
```

```bash
pnpm exec vitest run tests/unit/local-time.test.tsx
```

Expected: `Tests 3 passed (3)`.

- [ ] **Step 8: Write the failing test for `LocalDateTimeInput`, implement, confirm it passes**

Create `tests/unit/local-datetime-input.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { LocalDateTimeInput } from "@/components/local-datetime-input";
import { toInstant } from "@/lib/time/local";

describe("LocalDateTimeInput", () => {
  it("seeds the visible field from an ISO defaultValue", () => {
    const iso = new Date("2026-10-01T09:30").toISOString();
    render(<LocalDateTimeInput id="when" name="scheduledAt" defaultValue={iso} />);
    const visible = document.getElementById("when") as HTMLInputElement;
    expect(visible.value).toBe("2026-10-01T09:30");
  });

  it("starts both fields empty when defaultValue is null", () => {
    render(<LocalDateTimeInput id="when" name="scheduledAt" defaultValue={null} />);
    const visible = document.getElementById("when") as HTMLInputElement;
    const hidden = document.querySelector('input[name="scheduledAt"]') as HTMLInputElement;
    expect(visible.value).toBe("");
    expect(hidden.value).toBe("");
  });

  it("keeps the hidden ISO input in step with the visible field", () => {
    render(<LocalDateTimeInput id="when" name="scheduledAt" defaultValue={null} />);
    const visible = document.getElementById("when") as HTMLInputElement;
    fireEvent.change(visible, { target: { value: "2026-11-05T14:00" } });
    const hidden = document.querySelector('input[name="scheduledAt"]') as HTMLInputElement;
    expect(hidden.value).toBe(toInstant("2026-11-05T14:00"));
  });

  it("the hidden input carries the given name and the visible one does not", () => {
    render(<LocalDateTimeInput id="when" name="scheduledAt" defaultValue={null} />);
    const visible = document.getElementById("when") as HTMLInputElement;
    expect(visible.name).toBe("");
  });
});
```

Run it:

```bash
pnpm exec vitest run tests/unit/local-datetime-input.test.tsx
```

Expected: fails with `Cannot find module '@/components/local-datetime-input'`.

Create `components/local-datetime-input.tsx`:

```tsx
"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { toInstant, toLocalInputValue } from "@/lib/time/local";

export function LocalDateTimeInput({
  id,
  name,
  defaultValue,
  "aria-describedby": ariaDescribedBy,
}: {
  id: string;
  name: string;
  defaultValue: string | null;
  "aria-describedby"?: string;
}) {
  const [localValue, setLocalValue] = React.useState(() =>
    defaultValue ? toLocalInputValue(defaultValue) : "",
  );

  return (
    <>
      {/* No name attribute: this field is never submitted on its own. The
          hidden input below carries the real ISO instant under the caller's
          name, so the server action only ever sees a valid instant or "". */}
      <Input
        id={id}
        type="datetime-local"
        value={localValue}
        aria-describedby={ariaDescribedBy}
        onChange={(event) => setLocalValue(event.target.value)}
      />
      <input type="hidden" name={name} value={toInstant(localValue)} />
    </>
  );
}
```

```bash
pnpm exec vitest run tests/unit/local-datetime-input.test.tsx
```

Expected: `Tests 4 passed (4)`.

- [ ] **Step 9: Write the failing test for `RefreshOnFocus`, implement, confirm it passes**

Create `tests/unit/refresh-on-focus.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import { RefreshOnFocus } from "@/components/refresh-on-focus";

describe("RefreshOnFocus", () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes on window focus", () => {
    render(<RefreshOnFocus />);
    window.dispatchEvent(new Event("focus"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not refresh again inside the 10 second window", () => {
    render(<RefreshOnFocus />);
    window.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(5000);
    window.dispatchEvent(new Event("focus"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes again after 10 seconds", () => {
    render(<RefreshOnFocus />);
    window.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(10_001);
    window.dispatchEvent(new Event("focus"));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("refreshes when the tab becomes visible", () => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    render(<RefreshOnFocus />);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
```

Run it:

```bash
pnpm exec vitest run tests/unit/refresh-on-focus.test.tsx
```

Expected: fails with `Cannot find module '@/components/refresh-on-focus'`.

Create `components/refresh-on-focus.tsx`:

```tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

const MIN_INTERVAL_MS = 10_000;

export function RefreshOnFocus(): null {
  const router = useRouter();
  const lastRefreshRef = React.useRef(0);

  React.useEffect(() => {
    function maybeRefresh() {
      const now = Date.now();
      if (now - lastRefreshRef.current < MIN_INTERVAL_MS) return;
      lastRefreshRef.current = now;
      router.refresh();
    }
    function onVisibilityChange() {
      if (document.visibilityState === "visible") maybeRefresh();
    }
    window.addEventListener("focus", maybeRefresh);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", maybeRefresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router]);

  return null;
}
```

```bash
pnpm exec vitest run tests/unit/refresh-on-focus.test.tsx
```

Expected: `Tests 4 passed (4)`.

- [ ] **Step 10: Write the failing test for the pipeline labels, implement, confirm it passes**

Create `tests/unit/pipeline-labels.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { CLOSED_REASONS, WORK_MODES, STAGE_FORMATS, PERSON_ROLES, STAGE_STATUSES } from "@/lib/pipeline/values";
import { STAGE_KINDS } from "@/lib/pipeline/kinds";
import {
  CLOSED_REASON_LABELS,
  WORK_MODE_LABELS,
  STAGE_FORMAT_LABELS,
  PERSON_ROLE_LABELS,
  STAGE_STATUS_WORDS,
  columnTitle,
} from "@/lib/pipeline/labels";

describe("pipeline labels", () => {
  it("gives every closed reason a non-empty label", () => {
    for (const reason of CLOSED_REASONS) {
      expect(CLOSED_REASON_LABELS[reason].length).toBeGreaterThan(0);
    }
  });

  it("matches the fixed closed reason copy", () => {
    expect(CLOSED_REASON_LABELS).toEqual({
      rejected: "Rejected",
      withdrawn: "Withdrawn",
      ghosted: "Ghosted",
      declined: "Declined the offer",
      accepted: "Accepted the offer",
    });
  });

  it("gives every work mode a non-empty label", () => {
    for (const mode of WORK_MODES) {
      expect(WORK_MODE_LABELS[mode].length).toBeGreaterThan(0);
    }
  });

  it("matches the fixed work mode copy", () => {
    expect(WORK_MODE_LABELS).toEqual({ remote: "Remote", hybrid: "Hybrid", onsite: "On site" });
  });

  it("gives every stage format a non-empty label", () => {
    for (const format of STAGE_FORMATS) {
      expect(STAGE_FORMAT_LABELS[format].length).toBeGreaterThan(0);
    }
  });

  it("matches the fixed stage format copy", () => {
    expect(STAGE_FORMAT_LABELS).toEqual({
      phone: "Phone",
      video: "Video",
      onsite: "On site",
      async: "Async",
    });
  });

  it("gives every person role a non-empty label", () => {
    for (const role of PERSON_ROLES) {
      expect(PERSON_ROLE_LABELS[role].length).toBeGreaterThan(0);
    }
  });

  it("matches the fixed person role copy", () => {
    expect(PERSON_ROLE_LABELS).toEqual({
      recruiter: "Recruiter",
      hiring_manager: "Hiring manager",
      interviewer: "Interviewer",
      referrer: "Referrer",
      other: "Other",
    });
  });

  it("gives every stage status a non-empty word", () => {
    for (const status of STAGE_STATUSES) {
      expect(STAGE_STATUS_WORDS[status].length).toBeGreaterThan(0);
    }
  });

  it("uses the status value itself as the word", () => {
    expect(STAGE_STATUS_WORDS).toEqual({
      upcoming: "upcoming",
      scheduled: "scheduled",
      done: "done",
      skipped: "skipped",
    });
  });

  it("gives every stage kind its column title", () => {
    for (const entry of STAGE_KINDS) {
      expect(columnTitle(entry.kind)).toBe(entry.columnTitle);
    }
  });
});
```

Run it:

```bash
pnpm exec vitest run tests/unit/pipeline-labels.test.ts
```

Expected: fails with `Cannot find module '@/lib/pipeline/labels'`.

Create `lib/pipeline/labels.ts`:

```typescript
import type { ClosedReason, WorkMode, StageFormat, PersonRole, StageStatus } from "@/lib/pipeline/values";
import { STAGE_KINDS, type StageKind } from "@/lib/pipeline/kinds";

export const CLOSED_REASON_LABELS: Record<ClosedReason, string> = {
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  ghosted: "Ghosted",
  declined: "Declined the offer",
  accepted: "Accepted the offer",
};

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On site",
};

export const STAGE_FORMAT_LABELS: Record<StageFormat, string> = {
  phone: "Phone",
  video: "Video",
  onsite: "On site",
  async: "Async",
};

export const PERSON_ROLE_LABELS: Record<PersonRole, string> = {
  recruiter: "Recruiter",
  hiring_manager: "Hiring manager",
  interviewer: "Interviewer",
  referrer: "Referrer",
  other: "Other",
};

export const STAGE_STATUS_WORDS: Record<StageStatus, string> = {
  upcoming: "upcoming",
  scheduled: "scheduled",
  done: "done",
  skipped: "skipped",
};

export function columnTitle(kind: StageKind): string {
  const entry = STAGE_KINDS.find((s) => s.kind === kind);
  if (!entry) {
    throw new Error(`Unknown stage kind: ${kind}`);
  }
  return entry.columnTitle;
}
```

```bash
pnpm exec vitest run tests/unit/pipeline-labels.test.ts
```

Expected: `Tests 11 passed (11)`.

- [ ] **Step 11: Write the failing test for the result messages, implement, confirm it passes**

Create `tests/unit/pipeline-messages.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { messageFor } from "@/lib/pipeline/messages";

describe("messageFor", () => {
  const cases: [string, string][] = [
    ["closed", "This job is closed. Reopen it first."],
    ["not_found", "This job no longer exists."],
    ["same_stage", "It is already in this stage."],
    ["same_column", "It is already in this column."],
    ["fixed_stage", "Saved, Applied and Offer always stay."],
    ["stage_current", "This is the current stage."],
    ["stage_done", "A finished stage stays in the history."],
    ["stage_has_artifacts", "This stage has documents."],
    ["invalid_order", "That order is not allowed."],
    ["label_required", "Give the stage a name."],
    ["not_skippable", "Only upcoming stages can be skipped."],
    ["not_skipped", "This stage is not skipped."],
    ["duplicate", "You already track this role at this company."],
    ["invalid", "Check the highlighted fields."],
    ["nothing_to_complete", "There is no next action."],
    ["not_closed", "This job is not closed."],
  ];

  it.each(cases)("maps %s to its fixed message", (code, expected) => {
    expect(messageFor(code)).toBe(expected);
  });

  it("falls back for an unknown code", () => {
    expect(messageFor("something_else")).toBe("Something went wrong. Try again.");
  });
});
```

Run it:

```bash
pnpm exec vitest run tests/unit/pipeline-messages.test.ts
```

Expected: fails with `Cannot find module '@/lib/pipeline/messages'`.

Create `lib/pipeline/messages.ts`:

```typescript
const MESSAGES: Record<string, string> = {
  closed: "This job is closed. Reopen it first.",
  not_found: "This job no longer exists.",
  same_stage: "It is already in this stage.",
  same_column: "It is already in this column.",
  fixed_stage: "Saved, Applied and Offer always stay.",
  stage_current: "This is the current stage.",
  stage_done: "A finished stage stays in the history.",
  stage_has_artifacts: "This stage has documents.",
  invalid_order: "That order is not allowed.",
  label_required: "Give the stage a name.",
  not_skippable: "Only upcoming stages can be skipped.",
  not_skipped: "This stage is not skipped.",
  duplicate: "You already track this role at this company.",
  invalid: "Check the highlighted fields.",
  nothing_to_complete: "There is no next action.",
  not_closed: "This job is not closed.",
};

export function messageFor(code: string): string {
  return MESSAGES[code] ?? "Something went wrong. Try again.";
}
```

```bash
pnpm exec vitest run tests/unit/pipeline-messages.test.ts
```

Expected: `Tests 17 passed (17)`.

- [ ] **Step 12: Write the failing test for the form state helper, implement, confirm it passes**

Create `tests/unit/form-state.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fieldErrorsFromZod } from "@/lib/forms/state";

describe("fieldErrorsFromZod", () => {
  it("keeps one message per top-level field", () => {
    const schema = z.object({
      companyName: z.string().trim().min(1),
      roleTitle: z.string().trim().min(1),
    });
    const result = schema.safeParse({ companyName: "", roleTitle: "" });
    if (result.success) throw new Error("expected validation to fail");
    const errors = fieldErrorsFromZod(result.error);
    expect(Object.keys(errors).sort()).toEqual(["companyName", "roleTitle"]);
    expect(errors.companyName.length).toBeGreaterThan(0);
    expect(errors.roleTitle.length).toBeGreaterThan(0);
  });

  it("keeps only the first issue when one field fails more than one rule", () => {
    const schema = z.object({ value: z.string().min(5).email() });
    const result = schema.safeParse({ value: "a" });
    if (result.success) throw new Error("expected validation to fail");
    const errors = fieldErrorsFromZod(result.error);
    expect(Object.keys(errors)).toEqual(["value"]);
  });
});
```

Run it:

```bash
pnpm exec vitest run tests/unit/form-state.test.ts
```

Expected: fails with `Cannot find module '@/lib/forms/state'`.

Create `lib/forms/state.ts`:

```typescript
import type { z } from "zod";

export type FormState =
  | { ok: true }
  | { ok: false; code: string; message: string; fieldErrors?: Record<string, string>; href?: string }
  | undefined;

/** First message per top-level field; a later issue on the same field is dropped. */
export function fieldErrorsFromZod(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key !== "string" || key in fieldErrors) continue;
    fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}
```

```bash
pnpm exec vitest run tests/unit/form-state.test.ts
```

Expected: `Tests 2 passed (2)`.

- [ ] **Step 13: Install `@dnd-kit/core`**

```bash
pnpm add @dnd-kit/core
```

Expected: `@dnd-kit/core` appears under `dependencies` in `package.json`. Open `package.json` and note the exact resolved version (for example `6.3.1`); you need it for Step 18's commit message. This is unverified beyond "the frame calls for the latest 6.x release" - no network call was made while writing this plan.

- [ ] **Step 14: Install the shadcn primitives**

```bash
pnpm dlx shadcn@latest add dialog select textarea sonner toggle-group empty -y
```

Expected: creates `components/ui/dialog.tsx`, `components/ui/select.tsx`, `components/ui/textarea.tsx`, `components/ui/sonner.tsx`, `components/ui/toggle-group.tsx`, `components/ui/empty.tsx`, adds the `sonner` package to `dependencies`, and reports `components/ui/tooltip.tsx` as already present and unchanged (it was installed in Milestone 1). The exact file list and any further transitive files are unverified here: no network call was made while writing this plan, and the live `base-nova` style registry can add supporting files this plan does not know about. Accept whatever the command reports, then run:

```bash
pnpm typecheck
```

Expected: succeeds. If it does not, read the error: a primitive whose generated code does not match what this plan assumes below (Step 8's `Input`-style usage, Task 7's `dialog`/`toggle-group` composition) needs the smallest fix that makes the type error go away, and that fix belongs in `docs/design-system.md`'s "Local changes" section (Step 17).

- [ ] **Step 15: Install the Super AI Components registry items**

```bash
pnpm dlx shadcn@latest add https://super-ai-components.vercel.app/r/detail-view-shell.json -y
pnpm dlx shadcn@latest add https://super-ai-components.vercel.app/r/empty-state.json -y
pnpm dlx shadcn@latest add https://super-ai-components.vercel.app/r/mode-tabs.json -y
pnpm dlx shadcn@latest add https://super-ai-components.vercel.app/r/field-row.json -y
```

Expected, from the registry item manifests read while writing this plan (the registry item manifests):
- `detail-view-shell` creates `components/super-ai/detail-view-shell.tsx`, `components/super-ai/detail-tabs.tsx`, `components/super-ai/detail-fields.tsx`, `components/super-ai/use-container-width.tsx`, and installs its `use-view-mode` dependency to `lib/use-view-mode.tsx` (already there; expect it reported as identical or skipped, since Jobsmith's copy came from the same source).
- `empty-state` creates `components/super-ai/empty-state.tsx` (its `empty` primitive dependency is already installed by Step 14, and `lucide-react` is already a dependency).
- `mode-tabs` creates `components/super-ai/mode-tabs.tsx` (`toggle-group` from Step 14, `tooltip` already present).
- `field-row` creates `components/super-ai/field-row.tsx` and also installs `reset-affordance` as a registry dependency. This plan has not read `reset-affordance`'s source (it was not among the item sources read for this plan), so its output file(s) and props are unverified; accept whatever it installs and do not wire it up (see the note above `FieldRow`'s `reset` prop).

Now check the `use-view-mode` import path:

```bash
grep -n "use-view-mode" components/super-ai/detail-view-shell.tsx components/super-ai/detail-fields.tsx
```

If either line reads `from "@/registry/super-ai/use-view-mode"` (the shadcn CLI failed to rewrite the cross-item registry dependency), change it by hand to `from "@/lib/use-view-mode"` in both files, and add a line under `docs/design-system.md`'s "Local changes" recording it, for example: `components/super-ai/detail-view-shell.tsx` and `detail-fields.tsx` (Super AI Components): fixed an `import type { DetailMode }` path the installer left pointing at `@/registry/super-ai/use-view-mode` instead of `@/lib/use-view-mode`, where Jobsmith keeps this file; re-check after a re-sync. If the import already reads `from "@/lib/use-view-mode"`, no change is needed.

```bash
pnpm typecheck
```

Expected: succeeds.

- [ ] **Step 16: Add the `pb-safe` utility**

Open `app/globals.css` and find the four `@utility duration-*` blocks (around line 207). Add a fifth utility immediately after `duration-ambient`'s closing brace:

```css
@utility pb-safe {
    /* max(), not env() alone: on a device with no safe area (env() falls
       back to 0px), a bare env() would zero out the bottom padding entirely.
       0.5rem matches the bottom nav bar's own py-2 (Task 9), so a caller
       replaces py-2 with pt-2 pb-safe and gets an unchanged result on a
       device with no inset and a larger one where the inset needs it. */
    padding-bottom: max(0.5rem, env(safe-area-inset-bottom, 0px));
}
```

- [ ] **Step 17: Mount the announcer and the toaster in the authenticated layout**

Replace `app/(app)/layout.tsx` in full:

```tsx
import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/app-shell";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { Toaster } from "@/components/ui/sonner";
import { logout } from "./actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <LiveAnnouncerProvider>
      <AppShell email={user.email} onSignOut={logout}>
        {children}
      </AppShell>
      <Toaster />
    </LiveAnnouncerProvider>
  );
}
```

`LiveAnnouncerProvider` and `Toaster` are both client components; a server layout rendering them as ordinary children is the standard pattern and needs no extra wiring.

- [ ] **Step 18: Update `docs/design-system.md`**

Add `@dnd-kit/core` (with the version noted in Step 13), `dialog`, `select`, `textarea`, `sonner`, `toggle-group`, `empty`, `detail-view-shell`, `detail-tabs`, `detail-fields`, `use-container-width`, `empty-state`, `mode-tabs`, `field-row` (and `reset-affordance`, once you see what it installed) to the "Items installed so far" line. Add the `pb-safe` utility to a short new line noting it lives in `app/globals.css` next to the duration utilities. Add the `use-view-mode` import fix under "Local changes" only if Step 15 actually needed it.

- [ ] **Step 19: Confirm the wider checks pass**

```bash
pnpm typecheck
pnpm lint
pnpm check:tokens
pnpm test
DATABASE_URL="postgres://postgres:postgres@localhost:5432/jobsmith" BETTER_AUTH_SECRET="$(openssl rand -base64 32)" APP_URL="http://localhost:3000" pnpm build
```

Expected: all five succeed. `pnpm check:tokens` passing confirms `scripts/check-tokens.mjs`'s `EXCLUDE_DIRS` (`components/ui`, `components/super-ai`) still covers every file this task's install steps added - open the script and confirm both entries are still there; nothing in this task needs to change in it, since it excludes by directory, not by file name. `pnpm test` reports more passing tests than before this task (this task alone adds 49: 5 + 3 + 3 + 4 + 4 + 11 + 17 + 2, from Steps 2 through 12).

- [ ] **Step 20: Manually verify in the browser**

```bash
DATABASE_URL="postgres://postgres:postgres@localhost:5432/jobsmith" BETTER_AUTH_SECRET="$(openssl rand -base64 32)" APP_URL="http://localhost:3000" pnpm dev &
sleep 3
```

Sign in (or use the seed script's account from Milestone 1) and open `/board`. Confirm no console errors from the new `Toaster` mount. There is no visible UI change yet from this task alone - Task 7 is what puts the announcer, the toaster and the new registry items to use - so this check is only that the app still starts and renders with the new provider and primitives in place, in both light and dark.

```bash
kill %1
```

- [ ] **Step 21: Commit**

```bash
git add lib/time/local.ts lib/pipeline/labels.ts lib/pipeline/messages.ts lib/forms/state.ts \
  components/live-announcer.tsx components/local-time.tsx components/local-datetime-input.tsx components/refresh-on-focus.tsx \
  tests/unit/time-local.test.ts tests/unit/pipeline-labels.test.ts tests/unit/pipeline-messages.test.ts tests/unit/form-state.test.ts \
  tests/unit/live-announcer.test.tsx tests/unit/local-time.test.tsx tests/unit/local-datetime-input.test.tsx tests/unit/refresh-on-focus.test.tsx \
  app/\(app\)/layout.tsx app/globals.css vitest.config.mts package.json pnpm-lock.yaml docs/design-system.md \
  components/ui/dialog.tsx components/ui/select.tsx components/ui/textarea.tsx components/ui/sonner.tsx components/ui/toggle-group.tsx components/ui/empty.tsx \
  components/super-ai/detail-view-shell.tsx components/super-ai/detail-tabs.tsx components/super-ai/detail-fields.tsx components/super-ai/use-container-width.tsx \
  components/super-ai/empty-state.tsx components/super-ai/mode-tabs.tsx components/super-ai/field-row.tsx
git commit -m "$(cat <<'EOF'
feat: add board UI foundations (dnd-kit core x.y.z, announcer, local time, registry items)
EOF
)"
```

Replace `x.y.z` with the version noted in Step 13. If `field-row` installed a `reset-affordance` file, add its path to the `git add` line above too.

---

### Task 7: Board on desktop

**Files:**
- Create: `components/board/board.tsx`, `components/board/board-column.tsx`, `components/board/job-card.tsx`, `components/board/move-menu.tsx`, `components/board/close-dialog.tsx`, `components/board/closed-list.tsx`, `app/(app)/board/actions.ts`, `lib/board/sort.ts`, `lib/board/days.ts`, `lib/board/optimistic.ts`, `lib/board/keys.ts`, `lib/pipeline/action-schemas.ts`
- Test: `tests/unit/board-sort.test.ts`, `tests/unit/board-days.test.ts`, `tests/unit/board-optimistic.test.ts`, `tests/unit/board-keys.test.ts`, `tests/unit/action-schemas.test.ts`
- Modify: `app/(app)/board/page.tsx` (replace in full)

**Interfaces:**
- Consumes: `requireUser` from `@/lib/auth/session`. `scopedFor`, `BoardCard`, `ClosedCard` from `@/lib/db/scoped` (Task 2). `moveOpportunity` from `lib/pipeline/move.ts`, `closeOpportunity`/`reopenOpportunity` from `lib/pipeline/close.ts` (Task 4). `MoveTarget`, `MoveError` from `lib/pipeline/rules.ts` (Task 3). `StageKind`, `STAGE_KINDS` from `lib/pipeline/kinds.ts`. `ClosedReason`, `CLOSED_REASONS` from `lib/pipeline/values.ts` (Task 1). `Result` from `lib/result.ts` (Task 3). `columnTitle`, `CLOSED_REASON_LABELS` from `lib/pipeline/labels.ts`, `messageFor` from `lib/pipeline/messages.ts`, `useAnnounce` from `components/live-announcer.tsx`, `LocalTime` from `components/local-time.tsx`, `RefreshOnFocus` from `components/refresh-on-focus.tsx` (all Task 6). `ModeTabs` from `components/super-ai/mode-tabs.tsx`, `EmptyState` from `components/super-ai/empty-state.tsx` (Task 6 installs). `Button`, `DropdownMenu`/`DropdownMenuTrigger`/`DropdownMenuContent`/`DropdownMenuItem`/`DropdownMenuSeparator`, `RadioGroup`/`RadioGroupItem`, `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription` from `components/ui/*`. `toast` from `sonner`. `DndContext`, `DragOverlay`, `PointerSensor`, `TouchSensor`, `useSensor`, `useSensors`, `useDraggable`, `useDroppable` from `@dnd-kit/core`.
- Produces:

```typescript
// lib/board/sort.ts
export function sortCards(cards: BoardCard[]): BoardCard[];
// lib/board/days.ts
export function daysInStage(enteredAt: Date | null, now: Date): number | null;
// lib/board/optimistic.ts
export function applyMove(cards: BoardCard[], move: { id: string; toKind: StageKind }): BoardCard[];
export function removeCard(cards: BoardCard[], id: string): BoardCard[];
// lib/board/keys.ts
export type BoardKeyAction = { type: "move"; kind: StageKind } | { type: "close" };
export function keyToAction(key: string): BoardKeyAction | null;
// lib/pipeline/action-schemas.ts
export const opportunityIdSchema = z.uuid();
export const stageIdSchema = z.uuid();
export const moveTargetSchema = z.union([z.object({ kind: z.enum(STAGE_KIND_VALUES) }).strict(), z.object({ stageId: z.uuid() }).strict()]);
export const closedReasonSchema = z.enum(CLOSED_REASONS);
// app/(app)/board/actions.ts
export function moveAction(opportunityId: string, target: MoveTarget): Promise<Result<{ from: { kind: StageKind; label: string }; to: { stageId: string; kind: StageKind; label: string } }, MoveError>>;
export function closeAction(opportunityId: string, reason: ClosedReason): Promise<Result<null, "not_found" | "closed">>;
export function reopenAction(opportunityId: string): Promise<Result<null, "not_found" | "not_closed">>;
// components/board/board.tsx ("use client")
export function Board(props: { cards: BoardCard[]; nowIso: string }): React.ReactElement;
export function BoardViewSwitch(props: { view: "active" | "closed" }): React.ReactElement;
// components/board/close-dialog.tsx ("use client")
export function CloseDialog(props: { open: boolean; onOpenChange(open: boolean): void; job: { roleTitle: string; companyName: string } | null; onConfirm(reason: ClosedReason): void }): React.ReactElement;
```

`lib/board/optimistic.ts` and `lib/board/keys.ts` are not named in the frame's Task 7 paragraph. They exist so the optimistic-update math and the keyboard mapping are unit tested without a browser, per this plan's own requirement to make the board logic testable; report them as an addition in the final summary, not a frame violation, since nothing they do conflicts with the frame and Task 9 (same part of the plan) is the only other consumer.

**A frame gap this task cannot avoid touching:** the frame gives Task 9 (phone board) no file that renders `PhoneBoard` anywhere. `app/(app)/board/page.tsx` is the only place it could go, and the frame lists that file only under Task 7. The smallest fix: this task's `page.tsx` renders `Board` alone for the active view (`Board`'s own root already carries `hidden md:flex`, so it is inert, not merely styled, at phone widths - see the "why no `aria-hidden`" note in Task 9); Task 9 then **modifies** this same `page.tsx` to add `PhoneBoard` beside it. Task 9's Files section below is written with that modification in it, and this is flagged again in the final summary as a frame correction.

**Ownership of the optimistic state:** `Board` is the only place `useOptimistic` is called. `JobCard` (drag, keyboard) and `MoveMenu` (the non-drag "Move to" menu) both call functions `Board` passes down - `onMove(kind)` and `onRequestClose()` - rather than importing `moveAction`/`closeAction` or touching optimistic state themselves. This is what lets three different triggers (a drop, a keypress, a menu click) share one `runMove`/`runClose` implementation and one rollback behavior (D6).

**Unverified:** every `@dnd-kit/core` call in this task's recipes ((a), (b), (c), (f): `DndContext`, `DragOverlay`, `PointerSensor`, `TouchSensor`, `useSensor`, `useSensors`, `useDraggable`, `useDroppable`) is written from that library's stable, documented public API, but `@dnd-kit/core` is only installed by Task 6, one task before this one, and this plan's own spike folder cannot install packages, so none of it has been type-checked here. By the time this task actually runs, Task 6 will already have installed it, and `pnpm typecheck` in Step 14 below is the real check.

- [ ] **Step 1: Write the failing test for `sortCards`, implement, confirm it passes**

Create `tests/unit/board-sort.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { sortCards } from "@/lib/board/sort";
import type { BoardCard } from "@/lib/db/scoped";

function card(overrides: Partial<BoardCard>): BoardCard {
  return {
    id: "id",
    slug: "slug",
    roleTitle: "Product Designer",
    companyName: "Acme Robotics",
    fitScore: null,
    nextAction: null,
    nextActionAt: null,
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    stage: { id: "stage", kind: "saved", label: "Saved", enteredAt: null },
    ...overrides,
  };
}

describe("sortCards", () => {
  it("orders by next action date ascending, nulls last", () => {
    const soon = card({ id: "soon", nextActionAt: new Date("2026-09-20T00:00:00.000Z") });
    const later = card({ id: "later", nextActionAt: new Date("2026-09-25T00:00:00.000Z") });
    const none = card({ id: "none", nextActionAt: null });
    expect(sortCards([none, later, soon]).map((c) => c.id)).toEqual(["soon", "later", "none"]);
  });

  it("breaks ties, including two nulls, by updatedAt descending", () => {
    const older = card({ id: "older", updatedAt: new Date("2026-09-01T00:00:00.000Z") });
    const newer = card({ id: "newer", updatedAt: new Date("2026-09-10T00:00:00.000Z") });
    expect(sortCards([older, newer]).map((c) => c.id)).toEqual(["newer", "older"]);
  });

  it("does not mutate the input array", () => {
    const input = [card({ id: "a" }), card({ id: "b" })];
    const copy = [...input];
    sortCards(input);
    expect(input).toEqual(copy);
  });
});
```

Run it:

```bash
pnpm exec vitest run tests/unit/board-sort.test.ts
```

Expected: fails with `Cannot find module '@/lib/board/sort'`.

Create `lib/board/sort.ts`:

```typescript
import type { BoardCard } from "@/lib/db/scoped";

export function sortCards(cards: BoardCard[]): BoardCard[] {
  return [...cards].sort((a, b) => {
    const aTime = a.nextActionAt ? a.nextActionAt.getTime() : Number.POSITIVE_INFINITY;
    const bTime = b.nextActionAt ? b.nextActionAt.getTime() : Number.POSITIVE_INFINITY;
    if (aTime !== bTime) return aTime - bTime;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });
}
```

```bash
pnpm exec vitest run tests/unit/board-sort.test.ts
```

Expected: `Tests 3 passed (3)`.

- [ ] **Step 2: Write the failing test for `daysInStage`, implement, confirm it passes**

Create `tests/unit/board-days.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { daysInStage } from "@/lib/board/days";

describe("daysInStage", () => {
  const now = new Date("2026-09-19T12:00:00.000Z");

  it("returns null when there is no entered date", () => {
    expect(daysInStage(null, now)).toBeNull();
  });

  it("returns 0 for the same day", () => {
    expect(daysInStage(new Date("2026-09-19T08:00:00.000Z"), now)).toBe(0);
  });

  it("returns 1 for exactly one day earlier", () => {
    expect(daysInStage(new Date("2026-09-18T12:00:00.000Z"), now)).toBe(1);
  });

  it("floors a partial day", () => {
    expect(daysInStage(new Date("2026-09-17T13:00:00.000Z"), now)).toBe(1);
  });

  it("never returns a negative number for a future entered date", () => {
    expect(daysInStage(new Date("2026-09-20T00:00:00.000Z"), now)).toBe(0);
  });
});
```

Run it:

```bash
pnpm exec vitest run tests/unit/board-days.test.ts
```

Expected: fails with `Cannot find module '@/lib/board/days'`.

Create `lib/board/days.ts`:

```typescript
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function daysInStage(enteredAt: Date | null, now: Date): number | null {
  if (!enteredAt) return null;
  const elapsed = now.getTime() - enteredAt.getTime();
  return Math.max(0, Math.floor(elapsed / MS_PER_DAY));
}
```

```bash
pnpm exec vitest run tests/unit/board-days.test.ts
```

Expected: `Tests 5 passed (5)`.

- [ ] **Step 3: Write the failing test for the optimistic helpers, implement, confirm it passes**

Create `tests/unit/board-optimistic.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { applyMove, removeCard } from "@/lib/board/optimistic";
import type { BoardCard } from "@/lib/db/scoped";

function card(overrides: Partial<BoardCard>): BoardCard {
  return {
    id: "id",
    slug: "slug",
    roleTitle: "Product Designer",
    companyName: "Acme Robotics",
    fitScore: null,
    nextAction: null,
    nextActionAt: null,
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    stage: {
      id: "stage-1",
      kind: "saved",
      label: "Saved",
      enteredAt: new Date("2026-09-01T00:00:00.000Z"),
    },
    ...overrides,
  };
}

describe("applyMove", () => {
  it("moves the named card to the target column with its default label", () => {
    const cards = [card({ id: "a" }), card({ id: "b" })];
    const result = applyMove(cards, { id: "a", toKind: "applied" });
    expect(result.find((c) => c.id === "a")?.stage).toMatchObject({ kind: "applied", label: "Applied" });
  });

  it("leaves every other card untouched", () => {
    const cards = [card({ id: "a" }), card({ id: "b" })];
    const result = applyMove(cards, { id: "a", toKind: "applied" });
    expect(result.find((c) => c.id === "b")).toEqual(cards[1]);
  });

  it("keeps enteredAt as it was; the true value is only known after the server round trip", () => {
    const enteredAt = new Date("2026-09-01T00:00:00.000Z");
    const cards = [card({ id: "a", stage: { id: "stage-1", kind: "saved", label: "Saved", enteredAt } })];
    const result = applyMove(cards, { id: "a", toKind: "offer" });
    expect(result[0].stage.enteredAt).toBe(enteredAt);
  });

  it("does not mutate the input array", () => {
    const cards = [card({ id: "a" })];
    const before = cards[0].stage.kind;
    applyMove(cards, { id: "a", toKind: "applied" });
    expect(cards[0].stage.kind).toBe(before);
  });
});

describe("removeCard", () => {
  it("removes the named card", () => {
    const cards = [card({ id: "a" }), card({ id: "b" })];
    expect(removeCard(cards, "a").map((c) => c.id)).toEqual(["b"]);
  });

  it("is a no-op when the id is not present", () => {
    const cards = [card({ id: "a" })];
    expect(removeCard(cards, "missing")).toEqual(cards);
  });
});
```

Run it:

```bash
pnpm exec vitest run tests/unit/board-optimistic.test.ts
```

Expected: fails with `Cannot find module '@/lib/board/optimistic'`.

Create `lib/board/optimistic.ts`:

```typescript
import { STAGE_KINDS, type StageKind } from "@/lib/pipeline/kinds";
import type { BoardCard } from "@/lib/db/scoped";

function defaultLabelFor(kind: StageKind): string {
  const entry = STAGE_KINDS.find((s) => s.kind === kind);
  if (!entry) throw new Error(`Unknown stage kind: ${kind}`);
  return entry.defaultLabel;
}

/**
 * Optimistic placeholder for a move: sets the card's column and the
 * column's default label. It does not know the real target stage id (an
 * existing stage of that kind, or one the server is about to create) or the
 * real enteredAt, so stage.id becomes the kind itself, a value nothing
 * downstream keys on, and enteredAt is left as it was. Both are corrected
 * within moments by the server round trip: the optimistic value is dropped
 * when the transition ends and the revalidated page data takes over (D6).
 */
export function applyMove(cards: BoardCard[], move: { id: string; toKind: StageKind }): BoardCard[] {
  return cards.map((card) =>
    card.id === move.id
      ? {
          ...card,
          stage: { ...card.stage, id: move.toKind, kind: move.toKind, label: defaultLabelFor(move.toKind) },
        }
      : card,
  );
}

export function removeCard(cards: BoardCard[], id: string): BoardCard[] {
  return cards.filter((card) => card.id !== id);
}
```

```bash
pnpm exec vitest run tests/unit/board-optimistic.test.ts
```

Expected: `Tests 6 passed (6)`.

- [ ] **Step 4: Write the failing test for `keyToAction`, implement, confirm it passes**

Create `tests/unit/board-keys.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { keyToAction } from "@/lib/board/keys";
import { STAGE_KINDS } from "@/lib/pipeline/kinds";

describe("keyToAction", () => {
  it("maps 1 through 7 to the seven kinds in column order", () => {
    ["1", "2", "3", "4", "5", "6", "7"].forEach((key, index) => {
      expect(keyToAction(key)).toEqual({ type: "move", kind: STAGE_KINDS[index].kind });
    });
  });

  it("maps c and C to close", () => {
    expect(keyToAction("c")).toEqual({ type: "close" });
    expect(keyToAction("C")).toEqual({ type: "close" });
  });

  it("returns null for 0, 8 and other keys", () => {
    expect(keyToAction("0")).toBeNull();
    expect(keyToAction("8")).toBeNull();
    expect(keyToAction("Enter")).toBeNull();
    expect(keyToAction(" ")).toBeNull();
  });

  it("returns null for a multi-character string", () => {
    expect(keyToAction("10")).toBeNull();
  });
});
```

Run it:

```bash
pnpm exec vitest run tests/unit/board-keys.test.ts
```

Expected: fails with `Cannot find module '@/lib/board/keys'`.

Create `lib/board/keys.ts`:

```typescript
import { STAGE_KINDS, type StageKind } from "@/lib/pipeline/kinds";

export type BoardKeyAction = { type: "move"; kind: StageKind } | { type: "close" };

export function keyToAction(key: string): BoardKeyAction | null {
  if (key.length !== 1) return null;
  if (key === "c" || key === "C") return { type: "close" };
  const index = Number(key) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= STAGE_KINDS.length) return null;
  return { type: "move", kind: STAGE_KINDS[index].kind };
}
```

```bash
pnpm exec vitest run tests/unit/board-keys.test.ts
```

Expected: `Tests 4 passed (4)`.

- [ ] **Step 5: Write the failing test for the action schemas, implement, confirm it passes**

Create `tests/unit/action-schemas.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  opportunityIdSchema,
  stageIdSchema,
  moveTargetSchema,
  closedReasonSchema,
} from "@/lib/pipeline/action-schemas";

const UUID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

describe("opportunityIdSchema and stageIdSchema", () => {
  it("accepts a valid uuid", () => {
    expect(opportunityIdSchema.safeParse(UUID).success).toBe(true);
    expect(stageIdSchema.safeParse(UUID).success).toBe(true);
  });

  it("rejects a non-uuid string", () => {
    expect(opportunityIdSchema.safeParse("abc").success).toBe(false);
    expect(stageIdSchema.safeParse("abc").success).toBe(false);
  });
});

describe("moveTargetSchema", () => {
  it("accepts a kind target", () => {
    expect(moveTargetSchema.safeParse({ kind: "applied" }).success).toBe(true);
  });

  it("accepts a stageId target", () => {
    expect(moveTargetSchema.safeParse({ stageId: UUID }).success).toBe(true);
  });

  it("rejects an object with both keys", () => {
    expect(moveTargetSchema.safeParse({ kind: "applied", stageId: UUID }).success).toBe(false);
  });

  it("rejects an unknown kind", () => {
    expect(moveTargetSchema.safeParse({ kind: "bogus" }).success).toBe(false);
  });
});

describe("closedReasonSchema", () => {
  it("rejects an unknown reason", () => {
    expect(closedReasonSchema.safeParse("bogus").success).toBe(false);
  });
});
```

Run it:

```bash
pnpm exec vitest run tests/unit/action-schemas.test.ts
```

Expected: fails with `Cannot find module '@/lib/pipeline/action-schemas'`.

Confirmed in a planning scratch file (`partb-action-schemas-spike.ts`, not kept in the repo) (type-checked with the repo's strict compiler options, then run with `tsx`): `z.uuid()` and `ZodObject`'s `.strict()` both exist in the installed Zod 4 (4.6.5) and behave exactly as below, including a union of two `.strict()` objects correctly rejecting an object that carries both keys, so no spelling changes are needed.

Create `lib/pipeline/action-schemas.ts`:

```typescript
import { z } from "zod";
import { STAGE_KIND_VALUES, CLOSED_REASONS } from "@/lib/pipeline/values";

export const opportunityIdSchema = z.uuid();
export const stageIdSchema = z.uuid();
export const moveTargetSchema = z.union([
  z.object({ kind: z.enum(STAGE_KIND_VALUES) }).strict(),
  z.object({ stageId: z.uuid() }).strict(),
]);
export const closedReasonSchema = z.enum(CLOSED_REASONS);
```

```bash
pnpm exec vitest run tests/unit/action-schemas.test.ts
```

Expected: `Tests 7 passed (7)`.

- [ ] **Step 6: Write `app/(app)/board/actions.ts` in full**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { scopedFor, type Scoped } from "@/lib/db/scoped";
import { moveOpportunity } from "@/lib/pipeline/move";
import { closeOpportunity, reopenOpportunity } from "@/lib/pipeline/close";
import type { StageKind } from "@/lib/pipeline/kinds";
import type { MoveTarget, MoveError } from "@/lib/pipeline/rules";
import type { ClosedReason } from "@/lib/pipeline/values";
import { fail, type Result } from "@/lib/result";
import { messageFor } from "@/lib/pipeline/messages";
import { opportunityIdSchema, moveTargetSchema, closedReasonSchema } from "@/lib/pipeline/action-schemas";

// Every board action concerns exactly one opportunity, which may also be
// open as a job page in another tab, so both routes are revalidated
// (Task 6's action convention). The job's slug is not part of any of these
// actions' own return values, so it is re-read here; a not-found id simply
// yields no second revalidation.
async function revalidateBoardAndJob(s: Scoped, opportunityId: string) {
  revalidatePath("/board");
  const opportunity = await s.opportunity.getById(opportunityId);
  if (opportunity) revalidatePath(`/jobs/${opportunity.slug}`);
}

export async function moveAction(
  opportunityId: string,
  target: MoveTarget,
): Promise<
  Result<
    { from: { kind: StageKind; label: string }; to: { stageId: string; kind: StageKind; label: string } },
    MoveError
  >
> {
  const user = await requireUser();
  const idParsed = opportunityIdSchema.safeParse(opportunityId);
  const targetParsed = moveTargetSchema.safeParse(target);
  if (!idParsed.success || !targetParsed.success) {
    return fail("not_found", messageFor("not_found"));
  }
  const s = scopedFor(user.id);
  const result = await moveOpportunity(s, idParsed.data, targetParsed.data);
  await revalidateBoardAndJob(s, idParsed.data);
  return result;
}

export async function closeAction(
  opportunityId: string,
  reason: ClosedReason,
): Promise<Result<null, "not_found" | "closed">> {
  const user = await requireUser();
  const idParsed = opportunityIdSchema.safeParse(opportunityId);
  const reasonParsed = closedReasonSchema.safeParse(reason);
  if (!idParsed.success || !reasonParsed.success) {
    return fail("not_found", messageFor("not_found"));
  }
  const s = scopedFor(user.id);
  const result = await closeOpportunity(s, idParsed.data, reasonParsed.data);
  await revalidateBoardAndJob(s, idParsed.data);
  return result;
}

export async function reopenAction(opportunityId: string): Promise<Result<null, "not_found" | "not_closed">> {
  const user = await requireUser();
  const idParsed = opportunityIdSchema.safeParse(opportunityId);
  if (!idParsed.success) {
    return fail("not_found", messageFor("not_found"));
  }
  const s = scopedFor(user.id);
  const result = await reopenOpportunity(s, idParsed.data);
  await revalidateBoardAndJob(s, idParsed.data);
  return result;
}
```

Server actions are public endpoints (a request can reach them with any body, regardless of what the TypeScript signature above promises), so `opportunityId`, `target` and `reason` are all validated at runtime before anything reaches the database; a malformed id would otherwise reach a uuid column and throw. There is no test file for this step beyond Step 5's: it is a thin pass-through over Task 4's already-tested `lib/pipeline` functions, in the same shape the Global Constraints describe for every action (session check, validate with Zod, one `lib/` call, revalidate, return the result), and Task 13 (Tasks 10 to 14) exercises it end to end.

- [ ] **Step 7: Write `app/(app)/board/page.tsx` in full**

Replace `app/(app)/board/page.tsx` in full:

```tsx
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { sortCards } from "@/lib/board/sort";
import { Board, BoardViewSwitch } from "@/components/board/board";
import { ClosedList } from "@/components/board/closed-list";
import { RefreshOnFocus } from "@/components/refresh-on-focus";

export default async function BoardPage(props: PageProps<"/board">) {
  const user = await requireUser();
  const searchParams = await props.searchParams;
  const view = searchParams.view === "closed" ? "closed" : "active";
  const s = scopedFor(user.id);
  const nowIso = new Date().toISOString();

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold">Board</h1>
      <p className="mt-2 text-muted-foreground">Keys 1 to 7 move the focused job. C closes it.</p>
      <div className="mt-4">
        <BoardViewSwitch view={view} />
      </div>
      {view === "closed" ? (
        <ClosedList cards={await s.opportunity.listClosed()} />
      ) : (
        <Board cards={sortCards(await s.opportunity.listBoard())} nowIso={nowIso} />
      )}
      <RefreshOnFocus />
    </div>
  );
}
```

`searchParams` is a promise in this Next.js version (verified in `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`); `PageProps<"/board">` is the generated helper that types it, filled in by `next typegen`, which `pnpm typecheck` already runs first. Task 9 will modify this same file to add `PhoneBoard` beside `Board` for the active view; nothing here anticipates that beyond `Board`'s own root class (Step 10).

- [ ] **Step 8: Build `board-column.tsx`**

`components/board/board-column.tsx`. Client component (drag state). Props: `{ kind: StageKind; cards: BoardCard[]; children: React.ReactNode }`. One per `STAGE_KINDS` entry, rendered by `Board`. Structure: a droppable wrapper `div` (recipe below) that owns the column's width and its transition; when the column has cards, it wraps the registry component `KanbanColumn` (`components/super-ai/kanban-column.tsx`, already installed in Milestone 1 - confirmed by reading its source: props `title`, `count`, `tone`, `className`, `children`) around `children` (the column's `JobCard`s, passed down by `Board` rather than fetched or filtered here, so this component stays a pure layout shell); when it has none, the wrapper renders a narrow empty rail this task writes itself, since `KanbanColumn` has no empty-rail mode. No dialog, no menu, no server call.

Order of preference (Global Constraints): a Super AI Components registry item before new code. `KanbanColumn` already does everything a populated column needs, including its own accessible name (`groupAccessibleName`, read in its source: `` `${title}, ${count} items` ``); this plan does not restate or override that string. Only the empty rail, a case `KanbanColumn` has no mode for, gets new markup.

Recipe (f), the droppable wrapper and the empty rail:

```tsx
function BoardColumn({ kind, cards, children }: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: kind });
  const title = columnTitle(kind);
  const count = cards.length;
  const rail = count === 0 && !isOver;

  return (
    <div
      ref={setNodeRef}
      className={cn("h-full overflow-hidden transition-all duration-base ease-standard", rail ? "w-12" : "w-64")}
    >
      {count > 0 ? (
        <KanbanColumn title={title} count={count} className="h-full w-full">
          {children}
        </KanbanColumn>
      ) : (
        <section
          aria-label={`${title}, no jobs`}
          className="flex h-full flex-col items-center gap-2 rounded-lg border bg-muted/40 px-1 py-2"
        >
          <h2 className="truncate text-sm font-medium">{title}</h2>
          <span className="text-xs tabular-nums opacity-70">0</span>
        </section>
      )}
    </div>
  );
}
```

`kind` doubles as the droppable's id, which is what lets `board.tsx`'s `onDragEnd` read `over.id` straight back as a `StageKind` (Step 9's recipe (c)). The wrapper `div`, not the `<section>` inside it, is the droppable and the thing that widens: it stays mounted across a card count going from zero to one and back, so a card being added or removed never remounts the drop target mid-drag. `KanbanColumn` is given `className="h-full w-full"` so it fills that wrapper instead of sitting at its own `min-w-64` intrinsic size (its default class list, read from its source, is `` cn("bg-muted/40 flex min-w-64 flex-col rounded-lg border", className) ``; `lib/utils.ts`'s `cn` re-exports the `cn` package, "a drop-in replacement for clsx + tailwind-merge", confirmed by reading both files - `w-full` does not collide with `min-w-64`'s class group, so both classes coexist and the column simply fills the wrapper). The empty rail's own accessible name (`"<column>, no jobs"`) is the frame's fixed copy, character for character. Its title is truncated rather than shown vertically: rotating text needs a `writing-mode` value with no stock Tailwind utility, which is exactly the kind of bracketed arbitrary value `check:tokens` rejects, the same reasoning `transition-all` (not `transition-[width]`) already relies on below. `transition-all` on purpose: `check:tokens` treats any bracketed Tailwind value as an arbitrary value unless it is a bare `var()` reference, and `[width]` is neither a color nor a `var()`, so it would fail the lint; `transition-all` needs no brackets and produces the same widening animation.

- [ ] **Step 9: Build `job-card.tsx`**

`components/board/job-card.tsx`. Client component. Props: `{ card: BoardCard; now: Date; onMove: (target: MoveTarget) => void; onRequestClose: () => void; overlay?: boolean }`. `onMove`/`onRequestClose` are the callbacks `board.tsx` passes down (Step 10); this file never imports `moveAction`/`closeAction` or the announcer itself.

Element structure: a root `<div>` (recipe (b) below: draggable, but not given dnd-kit's `attributes`, and not itself a distinct ARIA role) containing:
- The title link, `<Link href={`/jobs/${card.slug}`} draggable={false}>`, accessible name `"<role> at <company>"` - one link whose visible content is two lines, role on top (`<span className="block font-medium">{card.roleTitle}</span>`) and company below (`<span className="block text-muted-foreground">{card.companyName}</span>`); the link's accessible name is the concatenation of both spans' text, which already reads as `"<role> <company>"` - insert the word "at" as a third, visually inline but still-read span (`<span> at </span>` between them, or reorder so "at" is literal text between the two spans) so the accessible name is exactly `"<role> at <company>"` and not `"<role> <company>"`. `draggable={false}` is required here: without it, starting a drag on the link's own text triggers the browser's native link-drag instead of dnd-kit's, which cancels the pointer events dnd-kit needs to see the gesture at all.
- The fit score, only when `card.fitScore` is not null (a small `Badge`, e.g. `variant="secondary"`, text `card.fitScore` as a plain number - no unit or copy is fixed for this by the frame, so keep it to the number alone).
- A chip with the stage label, shown only when `card.stage.label` differs from that kind's own default label (find the `STAGE_KINDS` entry whose `kind` matches `card.stage.kind` and compare against its `defaultLabel`; do not compare against `columnTitle`, which is the column heading, a different string from the default stage label) - a `Badge variant="outline"`, text is the label itself, no extra copy.
- The days chip: `daysInStage(card.stage.enteredAt, now)` fed into `"Today"` for `0`, `"1 day"` for `1`, `"<n> days"` otherwise; omit this element when the result is `null`.
- The next action line, shown only when `card.nextAction` is not null: `"Next: <text>"` (`card.nextAction` is the text; `card.nextActionAt`, if present, can render alongside via `LocalTime` - the frame fixes the `"Next: <text>"` prefix and leaves the date's presentation to this plan; render it in parentheses after the text using `LocalTime` mode `"date"` if `nextActionAt` is set, nothing extra if it is null).
- `MoveMenu` (Step 11), passed `card` and `onMove`/`onRequestClose`.

States: this card has no loading/error state of its own - `onMove`/`onRequestClose` are fire-and-forget from its point of view, and `board.tsx` owns pending/error feedback (toast, announce) centrally.

Recipe (b), the draggable root that keeps the link as the one clear focus target:

```tsx
function JobCard({ card, now, onMove, onRequestClose, overlay }: JobCardProps) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: card.id, disabled: overlay });

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    // A key typed inside the open "Move to" menu (Step 11) reaches the DOM
    // through a portal outside this div, but React still bubbles its
    // synthetic keydown event here, so this ignores any event whose real
    // target is not inside this card.
    if (!event.currentTarget.contains(event.target as Node)) return;
    // A modifier held down means the browser or the OS owns this key
    // combination (Cmd+1 switching tabs, for example), not the board.
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    // A held key auto-repeats; only the first press should trigger a move.
    if (event.repeat) return;
    const target = event.target as HTMLElement;
    // Lets a future field inside the card (none exist yet) receive its own
    // keystrokes instead of the board's.
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
    const action = keyToAction(event.key);
    if (!action) return;
    event.preventDefault();
    if (action.type === "close") onRequestClose();
    else onMove({ kind: action.kind });
  }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      onKeyDown={handleKeyDown}
      className={cn("rounded-lg border bg-card p-3", isDragging && "opacity-50")}
    >
      {/* title link, chips, MoveMenu - see the element structure above */}
    </div>
  );
}
```

Never spread `useDraggable`'s `attributes` (they would add `role="button"` and their own `tabIndex` to this root `div`, competing with the title link as the thing a keyboard or screen reader user lands on). With only `setNodeRef` and `listeners` applied, the root is not independently focusable; the title `<Link>` inside it is the one native tab stop. `onKeyDown` still fires for "1" to "7"/"c" pressed while the link has focus, because a `keydown` event bubbles up from the focused link to this root `div`. `overlay` disables the hook so the `DragOverlay`'s copy of this card (Step 10) is not itself draggable. The source card takes no `transform` style and is never itself repositioned: a `DragOverlay` (Step 10) already renders a floating copy that follows the pointer, so transforming the source card too would move two copies at once; `isDragging` instead gives the source reduced opacity (`opacity-50`, a semantic utility, no arbitrary value) so it reads as lifted while its `DragOverlay` twin does the moving.

- [ ] **Step 10: Build `board.tsx`**

`components/board/board.tsx`. Client component, two exports.

`BoardViewSwitch({ view }: { view: "active" | "closed" })`: wraps `ModeTabs` (`components/super-ai/mode-tabs.tsx`) with `label="Board view"`, `modes={[{ value: "active", label: "Active" }, { value: "closed", label: "Closed" }]}`, `value={view}`, and `onValueChange` that pushes `/board` (dropping the query string) for `"active"` and `/board?view=closed"` for `"closed"`, via `useRouter()` from `next/navigation`.

`Board({ cards, nowIso }: { cards: BoardCard[]; nowIso: string })`: computes `const now = new Date(nowIso)` once (a prop, not a fresh `new Date()` in the client, so the server-rendered HTML and the first client render agree, the same reasoning `LocalTime` uses); owns `useOptimistic` over `cards`; owns `activeId` (currently dragged card, for `DragOverlay`), `isDragging` (derived from `activeId !== null`, controls whether the Closed drop zone renders) and `pendingCloseId` (which card's `CloseDialog` is open) as local state; wraps the columns in `DndContext` (recipe (a)); renders one `BoardColumn` per `STAGE_KINDS` entry with that column's optimistic cards, each `JobCard` wired to `runMove`/`runClose` below; renders the Closed drop zone only while `isDragging`; renders `CloseDialog` once, passing `open={pendingCloseId !== null}`, `job` built from the card matching `pendingCloseId` (or `null` when none does), and `onConfirm` set to `runClose` below; renders `EmptyState` (title `"No jobs yet"`, description `"Add the first job you are tracking."`, `action` a `Button` reading `"Add job"` that opens the add job dialog - Task 8 supplies that dialog and tells this task nothing more than "a button with this text opens it") instead of the columns when `cards.length === 0`. Root wrapper carries `hidden md:flex` (Task 9 renders the phone list beside it with the opposite classes).

Recipe (a), the sensors:

```tsx
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
);

return (
  <DndContext
    sensors={sensors}
    onDragStart={(event) => setActiveId(String(event.active.id))}
    onDragEnd={handleDragEnd}
    onDragCancel={() => setActiveId(null)}
  >
    {/* columns, Closed drop zone */}
    <DragOverlay>
      {activeCard ? <JobCard card={activeCard} now={now} onMove={() => {}} onRequestClose={() => {}} overlay /> : null}
    </DragOverlay>
  </DndContext>
);
```

Recipe (c), mapping the drop target:

```tsx
function handleDragEnd(event: DragEndEvent) {
  setActiveId(null);
  const { active, over } = event;
  if (!over) return;
  const cardId = String(active.id);
  if (over.id === "closed") {
    setPendingCloseId(cardId);
    return;
  }
  const toKind = over.id as StageKind;
  const card = optimisticCards.find((c) => c.id === cardId);
  if (!card || card.stage.kind === toKind) return; // dropping on its own column does nothing
  runMove(cardId, { kind: toKind });
}
```

Recipe (d), the move flow (also the model for close and reopen, described below rather than repeated):

```tsx
const [optimisticCards, dispatchOptimistic] = useOptimistic(
  cards,
  (state: BoardCard[], action: { type: "move"; id: string; toKind: StageKind } | { type: "remove"; id: string }) =>
    action.type === "move" ? applyMove(state, { id: action.id, toKind: action.toKind }) : removeCard(state, action.id),
);
const announce = useAnnounce();

function runMove(cardId: string, target: MoveTarget) {
  const card = optimisticCards.find((c) => c.id === cardId);
  if (!card) return;
  startTransition(async () => {
    if ("kind" in target) dispatchOptimistic({ type: "move", id: cardId, toKind: target.kind });
    const result = await moveAction(cardId, target);
    if (!result.ok) {
      toast.error(`Could not move ${card.roleTitle} at ${card.companyName}. ${messageFor(result.code)}`);
      return;
    }
    announce(`Moved ${card.roleTitle} at ${card.companyName} to ${columnTitle(result.data.to.kind)}.`);
  });
}
```

No manual rollback branch exists because none is needed: `useOptimistic`'s overlay only lasts for the transition it was set in, so once `moveAction` resolves and the transition ends, a failed move's optimistic card simply reverts to whatever `cards` (the real prop) still says, which is the pre-move state (D6). `runClose(cardId, reason)` is the same shape with three differences: it dispatches `{ type: "remove", id: cardId }` instead of `{ type: "move", ... }` (a closed job leaves the active board entirely), it calls `closeAction(cardId, reason)`, and on success it announces `` `Closed ${card.roleTitle} at ${card.companyName}.` `` instead of the move sentence; its failure toast reads `` `Could not move ${card.roleTitle} at ${card.companyName}. ${messageFor(result.code)}` `` - the frame's one fixed failure-toast template covers every action in this milestone, close included, so it is not restated with different wording. `CloseDialog` (Step 12) calls `runClose`; `reopenAction` is only ever called from `closed-list.tsx` (Step 13), never from this file.

- [ ] **Step 11: Build `move-menu.tsx`**

`components/board/move-menu.tsx`. Client component. Props: `{ card: BoardCard; onMove: (target: MoveTarget) => void; onRequestClose: () => void }`. A `DropdownMenu` whose trigger is an icon `Button` (`variant="ghost"`, `size="icon-sm"`; any Lucide icon that reads as "more/move", for example `MoreVertical` - not fixed by the frame), `aria-label={`Move ${card.roleTitle} at ${card.companyName}`}`. `DropdownMenuContent` lists the seven `STAGE_KINDS` column titles as `DropdownMenuItem`s (`onSelect={() => onMove({ kind: entry.kind })}`), a `DropdownMenuSeparator`, then one item reading `"Close job"` (`onSelect={onRequestClose}`, `variant="destructive"` - the prop `components/ui/dropdown-menu.tsx` already defines). This is the one control D8 calls out as every drag's non-drag twin: it is the same list a keyboard user reaches with Tab/Enter instead of 1–7, and it is what Task 9's phone sheet reuses (by calling the same `onMove`/`onRequestClose`, not by importing this component, since a `DropdownMenu` is not the right primitive for a phone sheet - see Task 9).

- [ ] **Step 12: Build `close-dialog.tsx`**

`components/board/close-dialog.tsx`. Client component. Props, fixed by the controller after reading this part: `{ open: boolean; onOpenChange(open: boolean): void; job: { roleTitle: string; companyName: string } | null; onConfirm(reason: ClosedReason): void }`. `board.tsx` passes `open={pendingCloseId !== null}`, `job` built from the card matching `pendingCloseId` (or `null`), and `onConfirm` set to `runClose` (Step 10). It makes no server call. Uses the `dialog` primitive installed in Task 6 (`components/ui/dialog.tsx`, unverified exact export names - it wraps the same `@base-ui/react/dialog` primitive `components/ui/sheet.tsx` already wraps, so expect `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription` mirroring `Sheet`'s naming; confirm the real names once Task 6 has installed it).

Structure: `DialogTitle` "Close this job"; `DialogDescription` `` `${job.roleTitle} at ${job.companyName}` `` (rendered only once `job` is non-null, same as every other field below); a native `<fieldset>` with a `<legend>Reason</legend>` wrapping a `RadioGroup` (`components/ui/radio-group.tsx`) whose state starts unset (`value={reason}`, `reason: ClosedReason | undefined`, no default) and five `RadioGroupItem`s, one per `CLOSED_REASONS` entry in that array's order, each with a `Label` reading `CLOSED_REASON_LABELS[reason]` (`Rejected`, `Withdrawn`, `Ghosted`, `Declined the offer`, `Accepted the offer`); two buttons, `"Cancel"` (`onClick={() => onOpenChange(false)}`) and `"Close job"` (`disabled={!reason}`, `onClick={() => reason && onConfirm(reason)}`). This file has no server call and no toast/announce of its own - `onConfirm` is `board.tsx`'s `runClose`, described in Step 10.

The selected reason resets each time the dialog opens: an effect - `React.useEffect(() => { if (open) setReason(undefined); }, [open])` - clears it whenever `open` turns `true`, so a reason chosen on a previous open never lingers into the next one.

- [ ] **Step 13: Build `closed-list.tsx`**

`components/board/closed-list.tsx`. Client component (the Reopen button needs a pending state and a server call). Props: `{ cards: ClosedCard[] }`.

Empty state (`cards.length === 0`): `EmptyState` with only `title="No closed jobs."` (no `description`, no `action` - both are optional).

Otherwise, a `<ul>` (or an `<ol>`; the frame does not fix which, and neither implies an order the reader needs to preserve across re-fetches, so a plain unordered list is enough) of rows, each showing `"<role> at <company>"` (plain text, not a link - the frame does not ask this row to open the job), `CLOSED_REASON_LABELS[card.closedReason]`, `<LocalTime value={card.closedAt} mode="date" />`, and a `Button` reading `"Reopen"` with `aria-label={`Reopen ${card.roleTitle} at ${card.companyName}`}`.

The Reopen button uses `useTransition` (not `useOptimistic`: nothing here needs an instant drag-style update, and `reopenAction`'s own `revalidatePath("/board")` already re-renders this list with the row gone in the same round trip, per the Next.js Server Actions guide read for this plan - "a single response carries data and UI"). On click: `startTransition(async () => { const result = await reopenAction(card.id); if (!result.ok) { toast.error(`Could not move ${card.roleTitle} at ${card.companyName}. ${messageFor(result.code)}`); return; } announce(`Reopened ${card.roleTitle} at ${card.companyName}.`); })`; the button is `disabled` while `isPending`.

- [ ] **Step 14: Confirm the wider checks pass**

```bash
pnpm typecheck
pnpm lint
pnpm check:tokens
pnpm test
DATABASE_URL="postgres://postgres:postgres@localhost:5432/jobsmith" BETTER_AUTH_SECRET="$(openssl rand -base64 32)" APP_URL="http://localhost:3000" pnpm build
```

Expected: all five succeed. `pnpm test` gains the 25 tests from Steps 1 through 5 (3 + 5 + 6 + 4 + 7).

- [ ] **Step 15: Manually verify in the browser**

Phone width is not part of this check: `Board`'s root is `hidden` below the `md` breakpoint until Task 9 adds `PhoneBoard` beside it, so a narrow viewport is expected to show nothing under the view switch right now.

```bash
DATABASE_URL="postgres://postgres:postgres@localhost:5432/jobsmith" BETTER_AUTH_SECRET="$(openssl rand -base64 32)" APP_URL="http://localhost:3000" pnpm seed
DATABASE_URL="postgres://postgres:postgres@localhost:5432/jobsmith" BETTER_AUTH_SECRET="$(openssl rand -base64 32)" APP_URL="http://localhost:3000" pnpm dev &
sleep 3
```

At a desktop width, sign in and open `/board`. Confirm: seven columns in `STAGE_KINDS` order, each an empty rail when it has no seeded card; dragging a card with the mouse to another column moves it there, the source column's rail narrows back down and the target widens while the drag is over it; dragging a card onto itself does nothing; while dragging, a "Drop here to close" zone appears, and dropping there opens the close dialog with no reason preselected and "Close job" disabled until one is chosen; choosing a reason and confirming removes the card from the board; opening the "Active"/"Closed" switch and choosing "Closed" shows it there with its reason and date, and "Reopen" returns it to the board; a card's menu button (`Move <role> at <company>`) lists the seven columns and "Close job" and does the same thing a drag does; with a card's title link focused, pressing `3` moves it and `c` opens the close dialog; the visually hidden live region (inspect it in devtools) receives the `Moved …`/`Closed …`/`Reopened …` sentences; forcing a failure (temporarily stop the database, attempt a move, then restart it) shows the error toast text and leaves the card where it was; the board looks correct in both light and dark.

```bash
kill %1
```

- [ ] **Step 16: Commit**

```bash
git add components/board/board.tsx components/board/board-column.tsx components/board/job-card.tsx \
  components/board/move-menu.tsx components/board/close-dialog.tsx components/board/closed-list.tsx \
  app/\(app\)/board/actions.ts app/\(app\)/board/page.tsx \
  lib/board/sort.ts lib/board/days.ts lib/board/optimistic.ts lib/board/keys.ts lib/pipeline/action-schemas.ts \
  tests/unit/board-sort.test.ts tests/unit/board-days.test.ts tests/unit/board-optimistic.test.ts tests/unit/board-keys.test.ts tests/unit/action-schemas.test.ts
git commit -m "$(cat <<'EOF'
feat: add the desktop board with drag, keyboard moves and close/reopen
EOF
)"
```

---

### Task 8: Add job dialog

**Files:**
- Create: `components/board/add-job-dialog.tsx`
- Modify: `app/(app)/board/actions.ts` (add `createOpportunityAction`), `components/board/board.tsx` (add the header row with the persistent "Add job" button, wire the empty state's action button to the same dialog, accept and pass down the company name list), `app/(app)/board/page.tsx` (fetch `scopedFor(user.id).company.list()` and pass the names to `Board`)

**Interfaces:**
- Consumes: `createOpportunity` from `lib/pipeline/create.ts`, `createOpportunitySchema` from `lib/pipeline/create-schema.ts` (both Task 4 - this task does not redefine the schema, only imports it, exactly as the frame says: "the Zod schema shared by the action and the import"). `placeOpportunity` from `lib/pipeline/place.ts` (part A, Task 5). `companyNameKey` from `lib/companies/name-key.ts` (Task 3). `STAGE_KINDS`, `StageKind` from `lib/pipeline/kinds.ts`. `FormState`, `fieldErrorsFromZod` from `lib/forms/state.ts`, `messageFor` from `lib/pipeline/messages.ts`, `useAnnounce` from `components/live-announcer.tsx` (Task 6). `FieldRow` from `components/super-ai/field-row.tsx` (Task 6). `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter`, `RadioGroup`/`RadioGroupItem`, the `select` and `textarea` primitives, `Input`, `Label`, `Button` from `components/ui/*`.
- Produces: `createOpportunityAction(prev: FormState, formData: FormData): Promise<FormState>` from `app/(app)/board/actions.ts`. `AddJobDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; companyNames: string[] }): React.ReactElement` from `components/board/add-job-dialog.tsx`.

**Carrying the duplicate link:** the copy for a duplicate result is "the message above plus a link `Open it` to the existing job" (frame, "Add job dialog"). `FormState`'s failure branch carries an `href` for exactly this (Task 6): on a `"duplicate"` result, the action looks the existing job up a second time (createOpportunity's own duplicate check does the same lookup internally but its `Result` failure branch carries no data, per Task 3's `Result` type) and returns it as `href: \`/jobs/${existing.slug}\``, which `add-job-dialog.tsx` reads as `state.href`. A successful `{ ok: true }` still carries no role or company text for the announcer's `"Added <role> at <company>."` sentence; the dialog solves that one itself, by keeping the just-submitted values in a ref (Step 3 below), never by adding fields to `FormState`.

- [ ] **Step 1: Write `createOpportunityAction` in full**

Add to `app/(app)/board/actions.ts` (the file Task 7 created; keep `moveAction`, `closeAction`, `reopenAction` and `revalidateBoardAndJob` as they are, and their existing imports). Task 7 already imports `type StageKind` from `@/lib/pipeline/kinds`; change that one line to also bring in the `STAGE_KINDS` value instead of adding a second, conflicting import of the same module:

```typescript
// Was: import type { StageKind } from "@/lib/pipeline/kinds";
import { STAGE_KINDS, type StageKind } from "@/lib/pipeline/kinds";
```

Add these new imports alongside Task 7's existing ones (`revalidatePath`, `requireUser`, `scopedFor`/`Scoped`, `moveOpportunity`, `closeOpportunity`/`reopenOpportunity`, `MoveTarget`/`MoveError`, `ClosedReason`, `Result` are all already there and unchanged):

```typescript
import { createOpportunity } from "@/lib/pipeline/create";
import { createOpportunitySchema } from "@/lib/pipeline/create-schema";
import { placeOpportunity } from "@/lib/pipeline/place";
import { companyNameKey } from "@/lib/companies/name-key";
import { messageFor } from "@/lib/pipeline/messages";
import { fieldErrorsFromZod, type FormState } from "@/lib/forms/state";
```

Then add the following to the same file:

```typescript
function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  return value;
}

function toNumberOrUndefined(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? undefined : n;
}

function isStageKind(value: string): value is StageKind {
  return STAGE_KINDS.some((entry) => entry.kind === value);
}

async function findExistingOpportunity(s: Scoped, companyName: string, roleTitle: string) {
  const company = await s.company.findByNameKey(companyNameKey(companyName));
  if (!company) return null;
  return s.opportunity.findByCompanyAndRole(company.id, roleTitle);
}

export async function createOpportunityAction(prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = {
    companyName: String(formData.get("companyName") ?? ""),
    roleTitle: String(formData.get("roleTitle") ?? ""),
    location: emptyToUndefined(formData.get("location")),
    workMode: emptyToUndefined(formData.get("workMode")),
    sourceUrl: emptyToUndefined(formData.get("sourceUrl")),
    postingText: emptyToUndefined(formData.get("postingText")),
    compMin: toNumberOrUndefined(formData.get("compMin")),
    compMax: toNumberOrUndefined(formData.get("compMax")),
    compCurrency: emptyToUndefined(formData.get("compCurrency")),
    compNote: emptyToUndefined(formData.get("compNote")),
    myAsk: emptyToUndefined(formData.get("myAsk")),
  };

  const parsed = createOpportunitySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid",
      message: messageFor("invalid"),
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const s = scopedFor(user.id);
  const result = await createOpportunity(s, parsed.data);
  if (!result.ok) {
    if (result.code === "duplicate") {
      const existing = await findExistingOpportunity(s, parsed.data.companyName, parsed.data.roleTitle);
      return {
        ok: false,
        code: "duplicate",
        message: messageFor("duplicate"),
        href: existing ? `/jobs/${existing.slug}` : undefined,
      };
    }
    return { ok: false, code: result.code, message: messageFor(result.code) };
  }

  // placeOpportunity (part A, Task 5), not moveOpportunity directly: a job
  // that is already at a later stage was applied to first, so Applied must
  // not end up skipped.
  const whereIsItNow = formData.get("whereIsItNow");
  if (typeof whereIsItNow === "string" && isStageKind(whereIsItNow)) {
    await placeOpportunity(s, result.data.id, whereIsItNow);
  }

  revalidatePath("/board");
  return { ok: true };
}
```

`z` is imported above only because `createOpportunitySchema`'s type references it in some TypeScript configurations; if `pnpm typecheck` does not need it, remove the unused import rather than leave it in. This action never redefines `createOpportunitySchema`: it imports the one Task 4 wrote, exactly as the frame requires. There is no dedicated test file for it: like Task 7's actions, it is a thin wrapper over already-tested `lib/pipeline` functions, verified here by Step 6's manual check and end to end by Task 13 (Tasks 10 to 14).

- [ ] **Step 2: Fetch the company list in the board page**

Edit `app/(app)/board/page.tsx` (Task 7's version): add `const companyNames = (await s.company.list()).map((c) => c.name);` after `const s = scopedFor(user.id);`, and pass it to `Board`: `<Board cards={...} nowIso={nowIso} companyNames={companyNames} />`. This runs for both views (`active` and `closed`), since the persistent "Add job" button lives in `Board`'s own header row, not the closed list; `ClosedList` needs no company names.

- [ ] **Step 3: Build `add-job-dialog.tsx`**

`components/board/add-job-dialog.tsx`. Client component. Props: `{ open: boolean; onOpenChange: (open: boolean) => void; companyNames: string[] }`. Uses `useActionState(createOpportunityAction, undefined)` to get `[state, formAction, pending]` (recipe (g) below).

Element structure inside `Dialog`/`DialogContent` (`components/ui/dialog.tsx`, installed in Task 6 - confirm its exact exported names once installed; expected to mirror `sheet.tsx`'s `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter` since both wrap the same Base UI primitive):
- `DialogTitle`: `"Add a job"`.
- A general error line, shown when `state?.ok === false`: the message text (`state.message`), plus, only when `state.href` is set, a `Link` reading `"Open it"` pointing at `state.href`.
- One `FieldRow` per field, `label` set to the frame's exact copy and `hint` set to that field's entry in `state?.fieldErrors` (this both shows the error text under the control and, through `FieldRow`'s own `describedBy`, wires `aria-describedby` - pass `aria-invalid={Boolean(state?.fieldErrors?.<field>)}` on the control alongside it):
  - `"Company"`: an `Input` with `list` pointing at a `<datalist>` built from `companyNames`, `name="companyName"`.
  - `"Role"`: `Input`, `name="roleTitle"`.
  - `"Location"`: `Input`, `name="location"`.
  - `"Work mode"`: a `RadioGroup` (`name="workMode"`, nothing selected by default - this field is optional in the schema) with three `RadioGroupItem`s, values `remote`/`hybrid`/`onsite`, labelled `"Remote"`/`"Hybrid"`/`"On site"`.
  - `"Link to the posting"`: `Input` `type="url"`, `name="sourceUrl"`.
  - `"Posting text"`: the `textarea` primitive, `name="postingText"`.
  - `"Pay from"` / `"Pay to"`: two `Input type="number"`, `name="compMin"` / `name="compMax"`.
  - `"Currency"`: `Input`, `name="compCurrency"`.
  - `"Pay note"`: the `textarea` primitive, `name="compNote"`.
  - `"My ask"`: the `textarea` primitive, `name="myAsk"`.
  - `"Where is it now"`: the `select` primitive (confirm its exact exported names once Task 6 installs it; expected to be a root/trigger/content/item family like this repo's other Base UI wrappers), `name="whereIsItNow"`, one option per `STAGE_KINDS` entry (`value` the kind, visible text the `columnTitle`), defaulting to `"saved"`.
- `DialogFooter`: `Button type="submit"` reading `"Add job"` (`disabled={pending}`), `Button type="button"` reading `"Cancel"` (`onClick={() => onOpenChange(false)}`).

Focus: the dialog primitive's own default behavior is enough here and nothing overrides it - opening moves focus to the first focusable element inside `DialogContent` (the Company input, first in tab order), and closing (Cancel, Escape, the backdrop, or a successful submit closing the dialog programmatically) returns focus to whichever button opened it. No custom focus management is written for this component.

Recipe (g), the form state wiring, including the one piece that is easy to get wrong - capturing the just-submitted company and role before the action resolves, since a successful `FormState` carries no data to announce with:

```tsx
const [state, formAction, pending] = useActionState<FormState, FormData>(createOpportunityAction, undefined);
const announce = useAnnounce();
const lastSubmitted = React.useRef({ companyName: "", roleTitle: "" });

function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
  const data = new FormData(event.currentTarget);
  lastSubmitted.current = {
    companyName: String(data.get("companyName") ?? ""),
    roleTitle: String(data.get("roleTitle") ?? ""),
  };
}

React.useEffect(() => {
  if (state?.ok) {
    onOpenChange(false);
    announce(`Added ${lastSubmitted.current.roleTitle} at ${lastSubmitted.current.companyName}.`);
  }
}, [state, onOpenChange, announce]);

return (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <form action={formAction} onSubmit={handleSubmit}>
        {/* fields */}
      </form>
    </DialogContent>
  </Dialog>
);
```

`onSubmit` here does not call `event.preventDefault()`: React's own form action handling still takes over the submission, this handler only reads the `FormData` synchronously first. The board refreshing is not this component's job - `createOpportunityAction` already calls `revalidatePath("/board")`.

- [ ] **Step 4: Wire the dialog into `board.tsx`**

Edit `components/board/board.tsx` (Task 7's version): add `companyNames: string[]` to `Board`'s props; add local state `const [addOpen, setAddOpen] = useState(false)`; render one row above the columns containing a `Button` reading `"Add job"` (`onClick={() => setAddOpen(true)}`); render `<AddJobDialog open={addOpen} onOpenChange={setAddOpen} companyNames={companyNames} />` once, alongside that row; change the empty state's `action` (Task 7's `EmptyState`) from a plain `Button` to one with `onClick={() => setAddOpen(true)}` - the same setter, not a second dialog instance, so the board never mounts `AddJobDialog` twice.

- [ ] **Step 5: Confirm the wider checks pass**

```bash
pnpm typecheck
pnpm lint
pnpm check:tokens
pnpm test
DATABASE_URL="postgres://postgres:postgres@localhost:5432/jobsmith" BETTER_AUTH_SECRET="$(openssl rand -base64 32)" APP_URL="http://localhost:3000" pnpm build
```

Expected: all five succeed. No new unit tests are added in this task; `pnpm test`'s count is unchanged from Task 7.

- [ ] **Step 6: Manually verify in the browser**

```bash
DATABASE_URL="postgres://postgres:postgres@localhost:5432/jobsmith" BETTER_AUTH_SECRET="$(openssl rand -base64 32)" APP_URL="http://localhost:3000" pnpm dev &
sleep 3
```

Open `/board`. Click the header "Add job" button: the dialog opens with focus on Company, typing a partial company name shows the datalist suggestions from the seeded companies. Submit with Company and Role blank: both show inline errors, focus stays in the dialog, nothing is created. Fill in Company, Role and set "Where is it now" to a column other than Saved, submit: the dialog closes, the new card appears directly in that column (not Saved), and the live region receives `"Added <role> at <company>."`. Submit the same Company and Role again: the duplicate message appears with an "Open it" link that opens the job page for the first one. Trigger the empty-state's "Add job" button (temporarily against a fresh/emptied board, or by reading the code) and confirm it opens the same dialog. Check both light and dark.

```bash
kill %1
```

- [ ] **Step 7: Commit**

```bash
git add components/board/add-job-dialog.tsx app/\(app\)/board/actions.ts app/\(app\)/board/page.tsx components/board/board.tsx
git commit -m "$(cat <<'EOF'
feat: add the add job dialog with duplicate detection and stage placement
EOF
)"
```

---

### Task 9: Board on phones

**Files:**
- Create: `components/board/phone-board.tsx`, `components/board/move-sheet.tsx`
- Modify: `components/app-shell.tsx` (the two deferred Milestone 1 items: a visible active state on the bottom tab bar, and `pb-safe`), `app/(app)/board/page.tsx` (render `PhoneBoard` beside `Board` for the active view - see the frame gap noted in Task 7)

**Interfaces:**
- Consumes: `BoardCard` from `@/lib/db/scoped` (Task 2). `STAGE_KINDS`, `StageKind` from `lib/pipeline/kinds.ts`. `columnTitle` from `lib/pipeline/labels.ts`, `messageFor` from `lib/pipeline/messages.ts`, `useAnnounce` from `components/live-announcer.tsx` (Task 6). `MoveTarget` from `lib/pipeline/rules.ts` (Task 3). `ClosedReason`, `CLOSED_REASONS` from `lib/pipeline/values.ts` (Task 1). `moveAction`, `closeAction` from `app/(app)/board/actions.ts` (Task 7). `CloseDialog` from `components/board/close-dialog.tsx`, `applyMove`/`removeCard` from `lib/board/optimistic.ts`, `daysInStage` from `lib/board/days.ts` (all Task 7). `AddJobDialog` from `components/board/add-job-dialog.tsx` (Task 8). `Sheet`/`SheetContent`/`SheetHeader`/`SheetTitle`, `Button` from `components/ui/*`.
- Produces: `PhoneBoard(props: { cards: BoardCard[]; nowIso: string; companyNames: string[] }): React.ReactElement`, `MoveSheet(props: { card: BoardCard | null; onOpenChange: (open: boolean) => void; onMove: (target: MoveTarget) => void; onRequestClose: () => void }): React.ReactElement`.

**Why no `aria-hidden` or `inert` is added anywhere in this task:** `Board`'s root carries `hidden md:flex` and `PhoneBoard`'s carries `flex md:hidden` (both Tailwind utilities that resolve to `display: none` on one side of the `md` breakpoint). An element with `display: none` is not exposed in the accessibility tree at all - this is how every browser implements it, not a Jobsmith-specific choice - so whichever of the two trees is hidden at the current viewport width is invisible to assistive technology already, with no further attribute needed; adding `aria-hidden` or `inert` on top of `display: none` would be redundant. This also settles the accessible-name question: `Board`'s cards and `PhoneBoard`'s rows can read the same `"<role> at <company>"` name without clashing, because only one tree is ever exposed at a time. What `display: none` does **not** relax is HTML's own id-uniqueness rule - a literal `id="…"` attribute repeated in both trees is invalid HTML regardless of visibility, and could make a `document.getElementById` or an `aria-describedby` reference resolve to the wrong tree's element. Neither `Board` nor `PhoneBoard` (nor `CloseDialog`, `MoveMenu` or `MoveSheet`) hardcodes an `id` anywhere; the one place this milestone generates ids for form controls is `React.useId()` (used inside `FieldRow`, Task 6's registry install), which is unique per mounted instance regardless of how many trees are mounted at once. No id-prefixing scheme is needed.

- [ ] **Step 1: Modify `app/(app)/board/page.tsx` to render `PhoneBoard`**

This file has been replaced once (Task 7) and edited once (Task 8, adding `companyNames`). Replace it in full again, rather than patching it a third time, so there is one unambiguous version:

```tsx
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { sortCards } from "@/lib/board/sort";
import { Board, BoardViewSwitch } from "@/components/board/board";
import { PhoneBoard } from "@/components/board/phone-board";
import { ClosedList } from "@/components/board/closed-list";
import { RefreshOnFocus } from "@/components/refresh-on-focus";

export default async function BoardPage(props: PageProps<"/board">) {
  const user = await requireUser();
  const searchParams = await props.searchParams;
  const view = searchParams.view === "closed" ? "closed" : "active";
  const s = scopedFor(user.id);
  const nowIso = new Date().toISOString();
  const companyNames = (await s.company.list()).map((c) => c.name);
  const activeCards = view === "active" ? sortCards(await s.opportunity.listBoard()) : [];

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold">Board</h1>
      <p className="mt-2 text-muted-foreground">Keys 1 to 7 move the focused job. C closes it.</p>
      <div className="mt-4">
        <BoardViewSwitch view={view} />
      </div>
      {view === "closed" ? (
        <ClosedList cards={await s.opportunity.listClosed()} />
      ) : (
        <>
          <Board cards={activeCards} nowIso={nowIso} companyNames={companyNames} />
          <PhoneBoard cards={activeCards} nowIso={nowIso} companyNames={companyNames} />
        </>
      )}
      <RefreshOnFocus />
    </div>
  );
}
```

- [ ] **Step 2: Build `move-sheet.tsx`**

`components/board/move-sheet.tsx`. Client component. Props as in the Interfaces block. Uses `Sheet`/`SheetContent` (`side="bottom"`) rather than `move-menu.tsx`'s `DropdownMenu`: a hover-oriented popover is a poor fit for touch, which is why the frame asks for a sheet here specifically, even though the two components list the same eight actions. `open={card !== null}`.

Structure: `SheetHeader`/`SheetTitle` reading `"Move to"`; a list of eight plain full-width buttons, one per `STAGE_KINDS` entry (visible text its `columnTitle`, `onClick={() => { onMove({ kind: entry.kind }); onOpenChange(false); }}`), then `"Close job"` (`onClick={() => { onRequestClose(); onOpenChange(false); }}`). No radio group, no destructive styling beyond what `Button variant="ghost"` already gives every row; the reason for closing is still collected afterward, by `CloseDialog` (Task 7), which `onRequestClose` opens - the sheet itself never asks for one.

Focus: `Sheet`'s own default applies - opening moves focus into the popup (its first focusable row), closing (Escape, the backdrop, or any row's own `onClick` above, which calls `onOpenChange(false)`) returns focus to whichever "Move to" button opened it.

- [ ] **Step 3: Build `phone-board.tsx`**

`components/board/phone-board.tsx`. Client component. Props: `{ cards: BoardCard[]; nowIso: string; companyNames: string[] }`. Root wrapper carries `flex md:hidden` (the opposite of `Board`'s `hidden md:flex`).

Owns its own `useOptimistic` over `cards`, its own `moveSheetCardId`/`pendingCloseId`/`addOpen` state, and its own `runMove`/`runClose` - the same shape as `Board`'s (Task 7, Step 10's recipe (d): `startTransition`, dispatch the optimistic change from `lib/board/optimistic.ts`, call `moveAction`/`closeAction`, `toast.error` with the fixed template on failure, `announce` the fixed sentence on success). This duplicates `Board`'s state rather than sharing it, because the two are separate mounted component trees with no shared client parent (`app/(app)/board/page.tsx` is a server component and cannot hold state); only one tree is ever visible at a given viewport width, so the duplication costs nothing a user can observe.

When `cards.length === 0`: render the same `EmptyState` copy as `Board`'s (title `"No jobs yet"`, description `"Add the first job you are tracking."`, action `"Add job"`) and its own `AddJobDialog` (Task 8) with its own `addOpen` state - a second, independent mount of the same dialog component, for the same reason the optimistic state is duplicated.

Otherwise: group `optimisticCards` by `stage.kind` in `STAGE_KINDS` order, drop any group with zero cards, and render the remaining groups as `<section>`s, each with a header showing the column title and count (`<h2>{title}</h2><span>{count}</span>`, no `aria-label` override needed here since, unlike `BoardColumn`'s narrow rail, the heading text itself is always visible - there is no empty-group case to give a fixed accessible name to, since empty groups are not rendered at all) and a `<ul>` of rows. Each row (`<li>`) contains the same title link as `JobCard`'s (`"<role> at <company>"`, linking to `/jobs/[slug]`, with the fit score, stage label chip, days-in-stage and next action rendered the same way) and a `Button` with visible text `"Move to"` and `aria-label={`Move ${card.roleTitle} at ${card.companyName}`}` that sets `moveSheetCardId` to that card's id. Renders one `MoveSheet` (`card` resolved from `moveSheetCardId`) and one `CloseDialog` (Task 7, `card` resolved from `pendingCloseId`) once each, at the bottom of the tree, the same pattern `Board` uses for its own single `CloseDialog`.

No keyboard-shortcut handler is added to these rows: there is no drag here for 1–7/`c` to be a non-drag alternative to, and the "Move to" button and its sheet are already the alternative interaction WCAG 2.5.7 asks for.

- [ ] **Step 4: Add the bottom tab bar's active state and safe-area padding**

Edit `components/app-shell.tsx`. Change:

```tsx
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
```

to:

```tsx
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 flex items-center justify-around border-t border-border bg-surface-sidebar pt-2 pb-safe md:hidden"
      >
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            aria-current={item.href === pathname ? "page" : undefined}
            className="rounded-md px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover aria-[current=page]:bg-secondary aria-[current=page]:text-text-accent"
          >
            {item.label}
          </Link>
        ))}
      </nav>
```

`py-2` is replaced with `pt-2 pb-safe` rather than combined with it: both `py-2` and `pb-safe` set `padding-bottom`, and two Tailwind utility classes that set the same property have equal specificity, so which one wins would depend on stylesheet source order, not on which is written later in the `className` string - a fragile thing to rely on. `pt-2 pb-safe` sets each side through exactly one utility. `pb-safe`'s own `max(0.5rem, env(...))` (Task 6) is what keeps this visually unchanged on a device with no safe area. `aria-[current=page]:` is Tailwind's arbitrary-attribute-variant syntax (the bracket is followed by `:`, which `scripts/check-tokens.mjs` already recognizes as a variant rather than a value - it only flags a bracket followed by anything else); `aria-current` itself is unchanged, so this is a purely visual addition on top of behavior Milestone 1 already shipped.

- [ ] **Step 5: Confirm the wider checks pass**

```bash
pnpm typecheck
pnpm lint
pnpm check:tokens
pnpm test
DATABASE_URL="postgres://postgres:postgres@localhost:5432/jobsmith" BETTER_AUTH_SECRET="$(openssl rand -base64 32)" APP_URL="http://localhost:3000" pnpm build
```

Expected: all five succeed. No new unit tests are added in this task; `pnpm test`'s count is unchanged from Task 7.

- [ ] **Step 6: Manually verify in the browser**

```bash
DATABASE_URL="postgres://postgres:postgres@localhost:5432/jobsmith" BETTER_AUTH_SECRET="$(openssl rand -base64 32)" APP_URL="http://localhost:3000" pnpm dev &
sleep 3
```

Resize the browser window below 768px wide (or use a phone-width device emulation) and open `/board`. Confirm: the seven-column board is gone and a grouped list appears instead, with a group only for each stage that actually has a card in it; each row's title opens the job; each row's "Move to" button opens a bottom sheet listing the seven columns and "Close job"; choosing a column moves the card and the row reappears under its new group's header; choosing "Close job" opens the same reason dialog Task 7 built, and confirming removes the row; the bottom tab bar's current section (Home or Board) now has a visibly different background and text color from the other tab, not only the invisible `aria-current` attribute; on a device or emulation with a bottom safe area (an iPhone simulator with a home indicator, for example), the tab bar's bottom padding visibly grows to clear it. Resize back above 768px and confirm the desktop board reappears with the phone list gone. Check both light and dark.

```bash
kill %1
```

- [ ] **Step 7: Commit**

```bash
git add components/board/phone-board.tsx components/board/move-sheet.tsx components/app-shell.tsx app/\(app\)/board/page.tsx
git commit -m "$(cat <<'EOF'
feat: add the phone board list and the bottom tab bar's active state
EOF
)"
```
