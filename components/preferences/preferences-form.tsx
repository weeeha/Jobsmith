"use client";

import * as React from "react";
import { toast } from "sonner";

import { savePreferencesAction } from "@/app/(app)/preferences/actions";
import { ChipField } from "@/components/chip-field";
import { useAnnounce } from "@/components/live-announcer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { focusWasLost } from "@/lib/dom/focus";
import { submitViaTransition } from "@/lib/forms/submit";
import type { FormState } from "@/lib/forms/state";
import { WORK_MODE_LABELS } from "@/lib/pipeline/labels";
import { WORK_MODES } from "@/lib/pipeline/values";
import { SENIORITY_LEVELS, type Preferences } from "@/lib/preferences/schema";

const SAVE_FAILED = "Not saved: the connection dropped. Your changes are still on this page.";

// useActionState rethrows a rejected action into the nearest error boundary,
// which would replace the form and lose what the user typed. Turning the
// rejection into a failed state keeps the form on screen.
async function saveSafely(prev: FormState, formData: FormData): Promise<FormState> {
  try {
    return await savePreferencesAction(prev, formData);
  } catch (error) {
    console.error("save preferences failed", error);
    return { ok: false, code: "unexpected", message: SAVE_FAILED };
  }
}

function numberText(value: number | null): string {
  return value === null ? "" : value.toLocaleString("en-US");
}

interface FieldProps {
  label: string;
  hint?: string;
  /** Messages from the server, one per form field this row covers. */
  errors?: (string | undefined)[];
  /** A toggle group is named through `labelId`, so its label is plain text, not a <label> pointing at a control. */
  group?: boolean;
  /** A native control uses `controlId`; a toggle group is named through `labelId`. */
  children: (ids: { controlId: string; labelId: string; describedBy?: string; invalid: boolean }) => React.ReactNode;
}

function Field({ label, hint, errors, group, children }: FieldProps) {
  const id = React.useId();
  const messages = (errors ?? []).filter((m): m is string => Boolean(m));
  const errorId = messages.length > 0 ? `${id}-error` : undefined;
  const hintId = hint ? `${id}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      {group ? (
        <span id={`${id}-label`} className="text-sm font-medium text-foreground">
          {label}
        </span>
      ) : (
        <label id={`${id}-label`} htmlFor={`${id}-control`} className="text-sm font-medium text-foreground">
          {label}
        </label>
      )}
      {children({ controlId: `${id}-control`, labelId: `${id}-label`, describedBy, invalid: messages.length > 0 })}
      {errorId ? (
        <div id={errorId} className="flex flex-col text-xs text-destructive">
          {messages.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      ) : null}
      {hintId ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Section({ title, intro, first, children }: { title: string; intro: string; first?: boolean; children: React.ReactNode }) {
  return (
    <section className={cn("flex flex-col gap-4 md:flex-row md:gap-8", first ? "pb-6" : "border-t border-border py-6")}>
      <div className="flex flex-col gap-1 md:w-70 md:shrink-0">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{intro}</p>
      </div>
      <div className="flex w-full min-w-0 flex-col gap-6 md:max-w-140">{children}</div>
    </section>
  );
}

export function PreferencesForm({ preferences }: { preferences: Preferences }) {
  const [state, formAction, pending] = React.useActionState<FormState, FormData>(saveSafely, undefined);
  const announce = useAnnounce();
  const submitRef = React.useRef<HTMLButtonElement>(null);

  // Toggles need their own state so they can submit one hidden input per choice.
  const [workModes, setWorkModes] = React.useState<string[]>(preferences.workModes);
  const [seniority, setSeniority] = React.useState<string[]>(preferences.seniority);
  const [currency, setCurrency] = React.useState(preferences.currency);

  React.useEffect(() => {
    if (state === undefined) return;
    if (state.ok) {
      toast.success("Preferences saved.");
      announce("Preferences saved.");
    }
    // Disabling the button while saving drops focus to <body>.
    if (focusWasLost()) submitRef.current?.focus();
  }, [state, announce]);

  const errors = state?.ok === false ? state.fieldErrors : undefined;
  const e = (name: string) => errors?.[name];

  return (
    // noValidate and submitViaTransition: same reasons as edit-details-dialog.tsx.
    <form onSubmit={(event) => submitViaTransition(event, formAction)} noValidate className="flex flex-col">
      <Section
        first
        title="Hard filters"
        intro="Checked in code. A job that fails one still lands on the board, marked with the filter it failed."
      >
        <Field label="Title keywords" hint="The posting title has to contain one of these." errors={[e("titles")]}>
          {({ controlId, describedBy, invalid }) => (
            <ChipField
              id={controlId}
              name="titles"
              defaultValues={preferences.titles}
              placeholder="Add a title"
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </Field>
        <Field label="Locations" hint="Matched against the posting location." errors={[e("locations")]}>
          {({ controlId, describedBy, invalid }) => (
            <ChipField
              id={controlId}
              name="locations"
              defaultValues={preferences.locations}
              placeholder="Add a location"
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </Field>
        <Field label="Work modes" group errors={[e("workModes")]}>
          {({ labelId, describedBy, invalid }) => (
            <>
              <ToggleGroup
                multiple
                variant="outline"
                spacing={1}
                value={workModes}
                onValueChange={setWorkModes}
                aria-labelledby={labelId}
                aria-describedby={describedBy}
                className="flex-wrap"
              >
                {WORK_MODES.map((mode) => (
                  <ToggleGroupItem key={mode} value={mode} aria-invalid={invalid || undefined}>
                    {WORK_MODE_LABELS[mode]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {workModes.map((mode) => (
                <input key={mode} type="hidden" name="workModes" value={mode} />
              ))}
            </>
          )}
        </Field>
        <Field label="Pay floor" hint="Only checked when the posting states a range." errors={[e("compFloor"), e("currency")]}>
          {({ controlId, describedBy }) => (
            <div className="flex items-center gap-2">
              <Input
                id={controlId}
                name="compFloor"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Minimum yearly pay"
                defaultValue={numberText(preferences.compFloor)}
                aria-describedby={describedBy}
                aria-invalid={Boolean(e("compFloor")) || undefined}
                className="w-55"
              />
              <Input
                name="currency"
                aria-label="Currency"
                autoComplete="off"
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
                aria-describedby={describedBy}
                aria-invalid={Boolean(e("currency")) || undefined}
                className="w-22"
              />
            </div>
          )}
        </Field>
      </Section>

      <Section
        title="Fit score"
        intro="Sent to a small model as data, with your resume. It returns a score from 0 to 100, a one-line summary, and up to three pros and cons."
      >
        <Field label="Seniority" group errors={[e("seniority")]}>
          {({ labelId, describedBy, invalid }) => (
            <>
              <ToggleGroup
                multiple
                variant="outline"
                spacing={1}
                value={seniority}
                onValueChange={setSeniority}
                aria-labelledby={labelId}
                aria-describedby={describedBy}
                className="flex-wrap"
              >
                {SENIORITY_LEVELS.map((level) => (
                  <ToggleGroupItem key={level.value} value={level.value} aria-invalid={invalid || undefined}>
                    {level.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {seniority.map((level) => (
                <input key={level} type="hidden" name="seniority" value={level} />
              ))}
            </>
          )}
        </Field>
        <Field label="Target pay" errors={[e("compTarget")]}>
          {({ controlId, describedBy }) => (
            <div className="flex items-center gap-2">
              <Input
                id={controlId}
                name="compTarget"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Target yearly pay"
                defaultValue={numberText(preferences.compTarget)}
                aria-describedby={describedBy}
                aria-invalid={Boolean(e("compTarget")) || undefined}
                className="w-55"
              />
              <span className="text-sm text-muted-foreground">{currency.trim().toUpperCase()}</span>
            </div>
          )}
        </Field>
        <Field label="Must-haves" errors={[e("mustHaves")]}>
          {({ controlId, describedBy, invalid }) => (
            <ChipField
              id={controlId}
              name="mustHaves"
              defaultValues={preferences.mustHaves}
              placeholder="Add a must-have"
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </Field>
        <Field label="Dealbreakers" errors={[e("dealbreakers")]}>
          {({ controlId, describedBy, invalid }) => (
            <ChipField
              id={controlId}
              name="dealbreakers"
              defaultValues={preferences.dealbreakers}
              placeholder="Add a dealbreaker"
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </Field>
        <Field label="Industries to avoid" errors={[e("industriesAvoid")]}>
          {({ controlId, describedBy, invalid }) => (
            <ChipField
              id={controlId}
              name="industriesAvoid"
              defaultValues={preferences.industriesAvoid}
              placeholder="Add an industry"
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </Field>
        <Field label="Company size" hint="Employees." errors={[e("sizeMin"), e("sizeMax")]}>
          {({ controlId, describedBy }) => (
            <div className="flex items-center gap-2">
              <Input
                id={controlId}
                name="sizeMin"
                aria-label="Company size, smallest"
                inputMode="numeric"
                autoComplete="off"
                defaultValue={numberText(preferences.companySize.min)}
                aria-describedby={describedBy}
                aria-invalid={Boolean(e("sizeMin")) || undefined}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                name="sizeMax"
                aria-label="Company size, largest"
                inputMode="numeric"
                autoComplete="off"
                defaultValue={numberText(preferences.companySize.max)}
                aria-describedby={describedBy}
                aria-invalid={Boolean(e("sizeMax")) || undefined}
                className="w-24"
              />
            </div>
          )}
        </Field>
      </Section>

      <Section title="Home" intro="When a job shows up in the Home list.">
        <Field label="Score threshold" hint="A fit score under this marks the job as a weak fit." errors={[e("scoreThreshold")]}>
          {({ controlId, describedBy }) => (
            <div className="flex items-center gap-2">
              <Input
                id={controlId}
                name="scoreThreshold"
                inputMode="numeric"
                autoComplete="off"
                defaultValue={String(preferences.scoreThreshold)}
                aria-describedby={describedBy}
                aria-invalid={Boolean(e("scoreThreshold")) || undefined}
                className="w-18"
              />
              <span className="text-sm text-muted-foreground">out of 100</span>
            </div>
          )}
        </Field>
        <Field
          label="Follow up after"
          hint="Applied, nothing happened since, and no next action set."
          errors={[e("followUpDays")]}
        >
          {({ controlId, describedBy }) => (
            <div className="flex items-center gap-2">
              <Input
                id={controlId}
                name="followUpDays"
                inputMode="numeric"
                autoComplete="off"
                defaultValue={String(preferences.attention.followUpDays)}
                aria-describedby={describedBy}
                aria-invalid={Boolean(e("followUpDays")) || undefined}
                className="w-18"
              />
              <span className="text-sm text-muted-foreground">days</span>
            </div>
          )}
        </Field>
        <Field label="Apply or drop after" hint="How long a job can sit in Saved." errors={[e("savedDays")]}>
          {({ controlId, describedBy }) => (
            <div className="flex items-center gap-2">
              <Input
                id={controlId}
                name="savedDays"
                inputMode="numeric"
                autoComplete="off"
                defaultValue={String(preferences.attention.savedDays)}
                aria-describedby={describedBy}
                aria-invalid={Boolean(e("savedDays")) || undefined}
                className="w-18"
              />
              <span className="text-sm text-muted-foreground">days</span>
            </div>
          )}
        </Field>
      </Section>

      <div className="flex flex-col gap-2 border-t border-border pt-6 sm:flex-row sm:items-center md:pl-78">
        <Button ref={submitRef} type="submit" disabled={pending} className="self-start">
          Save preferences
        </Button>
        {state?.ok === false ? (
          <p role="alert" className="text-xs text-destructive">
            {state.message}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">New and rescored jobs use the saved version.</p>
        )}
      </div>
    </form>
  );
}
