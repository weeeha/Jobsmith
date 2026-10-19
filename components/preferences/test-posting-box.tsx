"use client";

import * as React from "react";

import { testPostingAction } from "@/app/(app)/preferences/actions";
import { ToneChip, type ChipTone } from "@/components/fit/fit-chips";
import { FitFrame, FitResult } from "@/components/fit/fit-result";
import { useAnnounce } from "@/components/live-announcer";
import { PreferencesSection } from "@/components/preferences/preferences-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FIT_BAND_WORDS } from "@/lib/fit/bands";
import type { FilterOutcome, HardFilterCheck } from "@/lib/fit/hard-filters";
import { filterDetail, FILTER_OUTCOME_WORDS, FILTER_ROW_LABELS, TEST_BOX_MESSAGES } from "@/lib/fit/messages";
import type { TestPostingResult, TestPostingState } from "@/lib/fit/test-posting";
import { focusWasLost } from "@/lib/dom/focus";
import { submitViaTransition } from "@/lib/forms/submit";

const TEST_FAILED = "Not scored: the connection dropped. Try again.";

const OUTCOME_TONE: Record<FilterOutcome, ChipTone> = {
  passes: "approved",
  fails: "action",
  not_checked: "outline",
  not_set: "outline",
};

// What the box keeps between tries: the last response, the last result
// (it stays on screen while a new try fails), and whether the text box has
// been asked for (it stays once a link needed its text).
type BoxState = { response: TestPostingState; result: TestPostingResult | null; showText: boolean };
const INITIAL: BoxState = { response: undefined, result: null, showText: false };

// useActionState rethrows a rejected action into the nearest error boundary,
// which would replace the whole Preferences page. A failed state keeps it.
async function runTest(prev: BoxState, formData: FormData): Promise<BoxState> {
  let response: TestPostingState;
  try {
    response = await testPostingAction(prev.response, formData);
  } catch (error) {
    console.error("test posting failed", error);
    response = { ok: false, code: "server_error", message: TEST_FAILED };
  }
  return {
    response,
    result: response?.ok ? response.result : prev.result,
    showText: prev.showText || (response?.ok === false && response.code === "needs_text"),
  };
}

function FilterRow({ check }: { check: HardFilterCheck }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border py-2 text-sm">
      <span className="w-32 shrink-0 text-foreground">{FILTER_ROW_LABELS[check.filter]}</span>
      <span className="min-w-0 flex-1 basis-48 break-words text-muted-foreground">{filterDetail(check)}</span>
      <ToneChip tone={OUTCOME_TONE[check.outcome]} className="ml-auto">
        {FILTER_OUTCOME_WORDS[check.outcome]}
      </ToneChip>
    </li>
  );
}

function Result({ result }: { result: TestPostingResult }) {
  const listId = React.useId();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col">
        <h3 id={listId} className="text-xs text-muted-foreground">
          {TEST_BOX_MESSAGES.hardFilters}
        </h3>
        <ul aria-labelledby={listId} className="flex flex-col">
          {result.hardFilters.checks.map((check) => (
            <FilterRow key={check.filter} check={check} />
          ))}
        </ul>
      </div>
      {result.fit && result.band ? (
        <FitResult fit={result.fit} band={result.band} hardFilters={result.hardFilters} level={3} />
      ) : (
        <FitFrame level={3}>
          <p className="text-muted-foreground">{TEST_BOX_MESSAGES[result.note ?? "failed"]}</p>
        </FitFrame>
      )}
      <p className="text-xs text-muted-foreground">{TEST_BOX_MESSAGES.nothingAdded}</p>
    </div>
  );
}

function announcementFor(result: TestPostingResult): string {
  if (result.fit && result.band) return `Fit score ${result.fit.score}, ${FIT_BAND_WORDS[result.band]}.`;
  return TEST_BOX_MESSAGES[result.note ?? "failed"];
}

/**
 * "Test against a posting": reads one link (or its pasted text, once the link
 * turns out unreadable), then shows the hard filters and the fit score
 * against the saved preferences and resume. Nothing is saved.
 */
export function TestPostingBox() {
  const [box, formAction, pending] = React.useActionState<BoxState, FormData>(runTest, INITIAL);
  const { response: state, result, showText } = box;
  const announce = useAnnounce();
  const ids = { url: React.useId(), text: React.useId(), urlError: React.useId(), alert: React.useId() };
  const submitRef = React.useRef<HTMLButtonElement>(null);
  const textRef = React.useRef<HTMLTextAreaElement>(null);

  // A new result is announced; focus moves to the text box when it is asked
  // for, and otherwise back to the button that was disabled while reading.
  React.useEffect(() => {
    if (state === undefined) return;
    if (state.ok) announce(announcementFor(state.result));
    if (state.ok === false && state.code === "needs_text") textRef.current?.focus();
    else if (focusWasLost()) submitRef.current?.focus();
  }, [state, announce]);

  const errors = state?.ok === false ? state.fieldErrors : undefined;
  const urlError = errors?.sourceUrl;
  const alert = state?.ok === false && !urlError ? state.message : null;

  return (
    <PreferencesSection title={TEST_BOX_MESSAGES.title} intro={TEST_BOX_MESSAGES.intro}>
      <form onSubmit={(event) => submitViaTransition(event, formAction)} noValidate className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.url} className="text-sm font-medium text-foreground">
            {TEST_BOX_MESSAGES.label}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id={ids.url}
              name="sourceUrl"
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder={TEST_BOX_MESSAGES.placeholder}
              aria-invalid={Boolean(urlError) || undefined}
              aria-describedby={urlError ? ids.urlError : undefined}
              className="min-w-0 flex-1"
            />
            <Button ref={submitRef} type="submit" variant="outline" disabled={pending} className="self-start">
              {TEST_BOX_MESSAGES.submit}
            </Button>
          </div>
          {urlError ? (
            <p id={ids.urlError} className="text-xs text-destructive">
              {urlError}
            </p>
          ) : null}
        </div>
        {alert ? (
          <p id={ids.alert} role="alert" className="text-xs text-destructive">
            {alert}
          </p>
        ) : null}
        {showText ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.text} className="text-sm font-medium text-foreground">
              Posting text
            </label>
            <Textarea
              ref={textRef}
              id={ids.text}
              name="postingText"
              rows={6}
              aria-invalid={Boolean(errors?.postingText) || undefined}
              aria-describedby={alert ? ids.alert : undefined}
            />
          </div>
        ) : null}
      </form>
      {result ? <Result result={result} /> : null}
    </PreferencesSection>
  );
}
