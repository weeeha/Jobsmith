"use client";

import * as React from "react";
import { toast } from "sonner";

import { saveProfileAction } from "@/app/(app)/settings/actions";
import { useAnnounce } from "@/components/live-announcer";
import { SettingsSection } from "@/components/settings/settings-section";
import { TimeZoneField } from "@/components/settings/time-zone-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { focusWasLost } from "@/lib/dom/focus";
import { submitViaTransition } from "@/lib/forms/submit";
import type { FormState } from "@/lib/forms/state";
import { messageFor } from "@/lib/pipeline/messages";

interface ProfileSectionProps {
  profile: { headline: string | null; timezone: string; resumeMd: string | null };
  timeZones: string[];
}

const HEADLINE_HINT = "One line, the way you would introduce yourself.";
const ZONE_HINT = "Home uses this zone to decide what is due today.";
const RESUME_HINT = "Markdown. Without it, jobs get no fit score and the fit card links here.";

async function saveSafely(prev: FormState, formData: FormData): Promise<FormState> {
  try {
    return await saveProfileAction(prev, formData);
  } catch (error) {
    // The action can reject before returning a state (network, server error).
    console.error("save profile failed", error);
    return { ok: false, code: "unexpected", message: messageFor("unexpected") };
  }
}

export function ProfileSection({ profile, timeZones }: ProfileSectionProps) {
  const [state, formAction, pending] = React.useActionState<FormState, FormData>(saveSafely, undefined);
  const announce = useAnnounce();
  const baseId = React.useId();
  const submitRef = React.useRef<HTMLButtonElement>(null);
  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined;
  // A rejected action with no field errors (server fault) still needs a message.
  const generalError = state?.ok === false && !fieldErrors ? state.message : undefined;

  React.useEffect(() => {
    if (state === undefined) return;
    if (state.ok) {
      toast.success("Profile saved.");
      announce("Profile saved.");
    } else {
      announce(fieldErrors ? "Check the highlighted fields." : state.message);
    }
    // The submit button is disabled while pending, which drops focus to
    // <body> on either outcome, so it comes back here after both.
    if (focusWasLost()) submitRef.current?.focus();
  }, [state, fieldErrors, announce]);

  const ids = {
    headline: `${baseId}-headline`,
    timezone: `${baseId}-timezone`,
    resume: `${baseId}-resume`,
  };
  // Error first, then hint, both announced with the control.
  const describe = (key: "headline" | "timezone" | "resume", error?: string) =>
    [error ? `${ids[key]}-error` : null, `${ids[key]}-hint`].filter(Boolean).join(" ");

  const headlineError = fieldErrors?.headline;
  const zoneError = fieldErrors?.timezone;
  const resumeError = fieldErrors?.resumeMd;

  return (
    <SettingsSection
      title="Profile"
      intro="Read by fit scoring and Home. Your resume goes to the model only inside a fit score request, and is never logged."
    >
      <form onSubmit={(event) => submitViaTransition(event, formAction)} noValidate className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.headline}>Headline</Label>
          <Input
            id={ids.headline}
            name="headline"
            defaultValue={profile.headline ?? ""}
            aria-invalid={Boolean(headlineError)}
            aria-describedby={describe("headline", headlineError)}
          />
          {headlineError ? <FieldError id={`${ids.headline}-error`}>{headlineError}</FieldError> : null}
          <Hint id={`${ids.headline}-hint`}>{HEADLINE_HINT}</Hint>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.timezone}>Time zone</Label>
          <TimeZoneField
            id={ids.timezone}
            name="timezone"
            zones={timeZones}
            defaultValue={profile.timezone}
            invalid={Boolean(zoneError)}
            describedBy={describe("timezone", zoneError)}
          />
          {zoneError ? <FieldError id={`${ids.timezone}-error`}>{zoneError}</FieldError> : null}
          <Hint id={`${ids.timezone}-hint`}>{ZONE_HINT}</Hint>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.resume}>Resume</Label>
          <Textarea
            id={ids.resume}
            name="resumeMd"
            rows={14}
            defaultValue={profile.resumeMd ?? ""}
            aria-invalid={Boolean(resumeError)}
            aria-describedby={describe("resume", resumeError)}
            className="font-mono"
          />
          {resumeError ? <FieldError id={`${ids.resume}-error`}>{resumeError}</FieldError> : null}
          <Hint id={`${ids.resume}-hint`}>{RESUME_HINT}</Hint>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button ref={submitRef} type="submit" disabled={pending}>
            Save profile
          </Button>
          {fieldErrors ? (
            <p role="alert" className="text-sm text-destructive">
              Check the highlighted fields.
            </p>
          ) : generalError ? (
            <p role="alert" className="text-sm text-destructive">
              {generalError}
            </p>
          ) : null}
        </div>
      </form>
    </SettingsSection>
  );
}

function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="break-words text-xs text-destructive">
      {children}
    </p>
  );
}

function Hint({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="text-xs text-muted-foreground">
      {children}
    </p>
  );
}
