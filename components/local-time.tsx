"use client";

import * as React from "react";

import { useTimeZone } from "@/components/time-zone-provider";
import { formatLocalInputValue, wallClockIn, zonedDateKey } from "@/lib/time/zone";

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
  const zone = useTimeZone();

  // Server render and the first client render both take this branch, so they
  // produce identical HTML and there is no hydration mismatch to suppress.
  // Only after mount does the effect below flip this to the localized text,
  // which is then an ordinary client-side update, not a hydration diff.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    // The formatted value needs Intl.DateTimeFormat's runtime locale/zone,
    // which is only known client-side; there is no server-renderable way to
    // know it before this effect runs. Same pattern, same justification, as
    // hooks/use-mobile.ts's initial setIsMobile call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // With a profile zone the fallback is already in that zone; without one it
  // stays UTC text, labelled as such.
  const fallback = zone
    ? mode === "datetime"
      ? formatLocalInputValue(wallClockIn(date, zone)).replace("T", " ")
      : zonedDateKey(date, zone)
    : mode === "datetime"
      ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
      : iso.slice(0, 10);
  const options = mode === "datetime" ? DATETIME_OPTIONS : DATE_OPTIONS;
  const formatted = mounted
    ? new Intl.DateTimeFormat(undefined, { ...options, timeZone: zone ?? undefined }).format(date)
    : fallback;

  return <time dateTime={iso}>{formatted}</time>;
}
