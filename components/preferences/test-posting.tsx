"use client";

import * as React from "react";
import Link from "next/link";

import { testPostingAction, type TestPostingState } from "@/app/(app)/preferences/actions";
import { FitResultBody } from "@/components/fit/fit-result-body";
import { FIT_LINK_CLASS, HardFilterLines } from "@/components/fit/hard-filter-lines";
import { StackedField } from "@/components/forms/stacked-field";
import { useAnnounce } from "@/components/live-announcer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { TestPostingResult } from "@/lib/fit/test-posting";
import { FIT_MESSAGES } from "@/lib/fit/messages";
import { submitViaTransition } from "@/lib/forms/submit";

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
        <FitResultBody fit={fit} threshold={threshold} headingLevel="h4" />
      ) : note ? (
        <p className="text-sm text-muted-foreground">
          {FIT_MESSAGES[note]}
          {note === "no_resume" ? (
            <>
              {" "}
              <Link href="/settings" className={FIT_LINK_CLASS}>
                {FIT_MESSAGES.openSettings}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      <HardFilterLines hardFilters={hardFilters} hasHardFilters={hasHardFilters} headingLevel="h4" />
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
