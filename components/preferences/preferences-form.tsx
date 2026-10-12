"use client";

import * as React from "react";

import { savePreferencesAction } from "@/app/(app)/preferences/actions";
import { ListInput } from "@/components/forms/list-input";
import { StackedField } from "@/components/forms/stacked-field";
import { useAnnounce } from "@/components/live-announcer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { FormState } from "@/lib/forms/state";
import { submitViaTransition } from "@/lib/forms/submit";
import { WORK_MODE_LABELS } from "@/lib/pipeline/labels";
import { WORK_MODES } from "@/lib/pipeline/values";
import { SENIORITY_LABELS, SENIORITY_LEVELS, type Preferences } from "@/lib/preferences/schema";

function FormSection({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  const headingId = React.useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-base font-semibold text-foreground">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{intro}</p>
      </div>
      {children}
    </section>
  );
}

function NumberField({
  name,
  label,
  hint,
  error,
  defaultValue,
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  defaultValue: number | null;
}) {
  return (
    <StackedField label={label} hint={hint} error={error}>
      {(id, describedBy) => (
        <Input
          id={id}
          name={name}
          type="number"
          inputMode="numeric"
          className="max-w-40"
          defaultValue={defaultValue ?? ""}
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
        />
      )}
    </StackedField>
  );
}

// Several values can be pressed. Each pressed one is posted as its own hidden
// input under `name`, which is how a form reads a list.
function ToggleField<Value extends string>({
  name,
  label,
  hint,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  hint?: string;
  options: { value: Value; label: string }[];
  defaultValue: readonly Value[];
}) {
  const id = React.useId();
  const labelId = `${id}-label`;
  const hintId = hint ? `${id}-hint` : undefined;
  const [pressed, setPressed] = React.useState<Value[]>(() => [...defaultValue]);

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-sm font-medium">
        {label}
      </span>
      <ToggleGroup
        multiple
        variant="outline"
        className="flex-wrap"
        aria-labelledby={labelId}
        aria-describedby={hintId}
        value={pressed}
        onValueChange={(next) => setPressed(next as Value[])}
      >
        {options.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {hint ? (
        <p id={hintId} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
      {pressed.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}
    </div>
  );
}

export function PreferencesForm({ preferences }: { preferences: Preferences }) {
  const announce = useAnnounce();
  const [state, formAction, pending] = React.useActionState<FormState, FormData>(savePreferencesAction, undefined);
  // A snapshot: a save re-renders the page with new props, and the uncontrolled
  // boxes keep what is on screen instead of warning about a changed default.
  const [initial] = React.useState(preferences);
  const submitRef = React.useRef<HTMLButtonElement>(null);

  // A new object per successful save: the list boxes turn the text they held
  // at submit into chips.
  const saved = state?.ok ? state : undefined;
  // Counts saves, so the number and currency boxes can start over from what
  // was stored (a blank box is stored as the default, "eur" as "EUR"). Set
  // while rendering, the way React documents adjusting state to a changed
  // value.
  const [seenSaved, setSeenSaved] = React.useState(saved);
  const [saveCount, setSaveCount] = React.useState(0);
  if (saved !== seenSaved) {
    setSeenSaved(saved);
    if (saved) setSaveCount((count) => count + 1);
  }
  // After a save the page re-rendered with the stored values.
  const shown = saveCount > 0 ? preferences : initial;

  React.useEffect(() => {
    if (state?.ok) {
      announce("Preferences saved.");
    } else if (state?.ok === false) {
      // The button is disabled while the request runs, and Chromium drops
      // focus from a disabled button; the form stays mounted on a failure.
      submitRef.current?.focus();
    }
  }, [state, announce]);

  const errors = state?.ok === false ? state.fieldErrors : undefined;

  return (
    // noValidate: the server's messages are the ones to show, not the
    // browser's own bubbles on a number box.
    <form noValidate onSubmit={(event) => submitViaTransition(event, formAction)} className="flex max-w-2xl flex-col gap-8">
      {state?.ok === false ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      <FormSection title="Hard filters" intro="Checked on every job page, with or without AI.">
        <ListInput
          name="titles"
          label="Job titles"
          hint="A job passes when its title contains one of these."
          error={errors?.titles}
          placeholder="Add a title"
          defaultValue={initial.titles}
          saved={saved}
        />
        <ToggleField
          name="workModes"
          label="Work modes"
          hint="A job passes when its work mode is one of these."
          options={WORK_MODES.map((mode) => ({ value: mode, label: WORK_MODE_LABELS[mode] }))}
          defaultValue={initial.workModes}
        />
        <ListInput
          name="locations"
          label="Locations"
          hint="A job passes when its location contains one of these. Remote jobs skip this check."
          error={errors?.locations}
          placeholder="Add a place"
          defaultValue={initial.locations}
          saved={saved}
        />
        <NumberField
          key={saveCount}
          name="compFloor"
          label="Pay floor"
          hint="A job fails only when its stated pay tops out below this."
          error={errors?.compFloor}
          defaultValue={shown.compFloor}
        />
        <StackedField
          label="Currency"
          hint="Three letters, for example EUR. Pay in another currency is not compared."
          error={errors?.currency}
        >
          {(id, describedBy) => (
            <Input
              key={saveCount}
              id={id}
              name="currency"
              className="max-w-40"
              autoCapitalize="characters"
              defaultValue={shown.currency ?? ""}
              aria-describedby={describedBy}
              aria-invalid={Boolean(errors?.currency)}
            />
          )}
        </StackedField>
      </FormSection>

      <FormSection title="For the fit score" intro="Sent to the AI model with your resume when a job is scored.">
        <ToggleField
          name="seniority"
          label="Seniority"
          options={SENIORITY_LEVELS.map((level) => ({ value: level, label: SENIORITY_LABELS[level] }))}
          defaultValue={initial.seniority}
        />
        <NumberField key={saveCount} name="compTarget" label="Pay target" error={errors?.compTarget} defaultValue={shown.compTarget} />
        <ListInput
          name="mustHaves"
          label="Must-haves"
          error={errors?.mustHaves}
          placeholder="Add a must-have"
          defaultValue={initial.mustHaves}
          saved={saved}
        />
        <ListInput
          name="dealbreakers"
          label="Dealbreakers"
          error={errors?.dealbreakers}
          placeholder="Add a dealbreaker"
          defaultValue={initial.dealbreakers}
          saved={saved}
        />
        <ListInput
          name="industriesAvoid"
          label="Industries to avoid"
          error={errors?.industriesAvoid}
          placeholder="Add an industry"
          defaultValue={initial.industriesAvoid}
          saved={saved}
        />
        <NumberField
          key={saveCount}
          name="companySize.min"
          label="Company size from"
          error={errors?.["companySize.min"]}
          defaultValue={shown.companySize.min}
        />
        <NumberField
          key={saveCount}
          name="companySize.max"
          label="Company size to"
          hint="Number of people."
          error={errors?.["companySize.max"]}
          defaultValue={shown.companySize.max}
        />
        <NumberField
          key={saveCount}
          name="scoreThreshold"
          label="Good fit from"
          hint="Scores at or above this count as a good fit. 0 to 100."
          error={errors?.scoreThreshold}
          defaultValue={shown.scoreThreshold}
        />
      </FormSection>

      <FormSection title="Home reminders" intro="When Home asks you to act on a quiet job.">
        <NumberField
          key={saveCount}
          name="attention.followUpDays"
          label="Follow up after"
          hint="Days without news on an applied job."
          error={errors?.["attention.followUpDays"]}
          defaultValue={shown.attention.followUpDays}
        />
        <NumberField
          key={saveCount}
          name="attention.savedDays"
          label="Apply or drop after"
          hint="Days a saved job can wait."
          error={errors?.["attention.savedDays"]}
          defaultValue={shown.attention.savedDays}
        />
      </FormSection>

      <Button ref={submitRef} type="submit" disabled={pending} className="self-start">
        Save preferences
      </Button>
    </form>
  );
}
