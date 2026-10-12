"use client";

import * as React from "react";

import { saveProfileAction } from "@/app/(app)/settings/actions";
import { StackedField } from "@/components/forms/stacked-field";
import { useAnnounce } from "@/components/live-announcer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/lib/forms/state";
import { submitViaTransition } from "@/lib/forms/submit";
import { canonicalTimeZone } from "@/lib/time/zone";
import { timeZoneItems, type TimeZoneItem } from "@/lib/time/zone-list";

interface ProfileSectionProps {
  profile: { headline: string | null; resumeMd: string | null; timezone: string };
  timeZones: TimeZoneItem[];
}

export function ProfileSection({ profile, timeZones }: ProfileSectionProps) {
  const headingId = React.useId();
  const announce = useAnnounce();
  const [state, formAction, pending] = React.useActionState<FormState, FormData>(saveProfileAction, undefined);
  // A snapshot, not a live read: a save revalidates the page and hands this
  // component new props, and a changed defaultValue on a mounted uncontrolled
  // field makes Base UI warn.
  const [initial] = React.useState(profile);
  const [zone, setZone] = React.useState(profile.timezone);
  const [deviceZone, setDeviceZone] = React.useState<string | null>(null);
  const [addedZone, setAddedZone] = React.useState<string | null>(null);
  const submitRef = React.useRef<HTMLButtonElement>(null);
  const zoneRef = React.useRef<HTMLButtonElement>(null);
  const refocusZone = React.useRef(false);

  React.useEffect(() => {
    // The browser's zone is only known on the client, so it is read after
    // mount (the server render and the first client render show no button).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDeviceZone(canonicalTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone));
  }, []);

  React.useEffect(() => {
    if (state?.ok) {
      announce("Profile saved.");
    } else if (state?.ok === false) {
      // The Save button is disabled while the request runs, and Chromium
      // drops focus from a disabled button; this form stays mounted on a
      // failure, so focus goes back to it.
      submitRef.current?.focus();
    }
  }, [state, announce]);

  React.useEffect(() => {
    // Choosing the device zone removes the button that was just pressed, so
    // focus moves to the picker that now shows the choice.
    if (refocusZone.current) {
      refocusZone.current = false;
      zoneRef.current?.focus();
    }
  }, [zone]);

  const items = React.useMemo(
    () =>
      addedZone && !timeZones.some((item) => item.value === addedZone)
        ? timeZoneItems(
            timeZones.map((item) => item.value),
            [addedZone],
          )
        : timeZones,
    [timeZones, addedZone],
  );
  const groups = React.useMemo(() => {
    const byGroup = new Map<string, TimeZoneItem[]>();
    for (const item of items) byGroup.set(item.group, [...(byGroup.get(item.group) ?? []), item]);
    return [...byGroup];
  }, [items]);

  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined;
  const offerDeviceZone = deviceZone !== null && deviceZone !== zone;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 id={headingId} className="text-base font-semibold text-foreground">
          Profile
        </h2>
        <p className="text-sm text-muted-foreground">
          Your resume is used only to score how well jobs fit. It never leaves through the bridge.
        </p>
      </div>

      <form onSubmit={(event) => submitViaTransition(event, formAction)} className="flex max-w-2xl flex-col gap-4">
        {state?.ok === false ? (
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        ) : null}

        <StackedField
          label="Headline"
          hint="A short line about you, for example: Product designer, design systems."
          error={fieldErrors?.headline}
        >
          {(id, describedBy) => (
            <Input
              id={id}
              name="headline"
              defaultValue={initial.headline ?? ""}
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.headline)}
            />
          )}
        </StackedField>

        <StackedField label="Resume" hint="Markdown. Paste your resume text here." error={fieldErrors?.resumeMd}>
          {(id, describedBy) => (
            <Textarea
              id={id}
              name="resumeMd"
              rows={12}
              className="min-h-64"
              defaultValue={initial.resumeMd ?? ""}
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.resumeMd)}
            />
          )}
        </StackedField>

        <StackedField
          label="Time zone"
          hint="Dates and times across Jobsmith use this zone."
          error={fieldErrors?.timezone}
        >
          {(id, describedBy) => (
            <Select
              id={id}
              name="timezone"
              value={zone}
              onValueChange={(next) => {
                if (next) setZone(next);
              }}
              items={items}
            >
              <SelectTrigger
                ref={zoneRef}
                className="w-full"
                aria-describedby={describedBy}
                aria-invalid={Boolean(fieldErrors?.timezone)}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {groups.map(([group, entries]) => (
                  <SelectGroup key={group}>
                    <SelectLabel>{group}</SelectLabel>
                    {entries.map((entry) => (
                      <SelectItem key={entry.value} value={entry.value}>
                        {entry.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          )}
        </StackedField>

        {offerDeviceZone ? (
          <Button
            type="button"
            variant="link"
            className="self-start px-0"
            onClick={() => {
              refocusZone.current = true;
              setAddedZone(deviceZone);
              setZone(deviceZone);
            }}
          >
            Use this device&apos;s time zone ({deviceZone})
          </Button>
        ) : null}

        <Button ref={submitRef} type="submit" disabled={pending} className="self-start">
          Save profile
        </Button>
      </form>
    </section>
  );
}
