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
  React.useEffect(() => {
    // The formatted value needs Intl.DateTimeFormat's runtime locale/zone,
    // which is only known client-side; there is no server-renderable way to
    // know it before this effect runs. Same pattern, same justification, as
    // hooks/use-mobile.ts's initial setIsMobile call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const fallback = mode === "datetime" ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : iso.slice(0, 10);
  const formatted = mounted
    ? new Intl.DateTimeFormat(undefined, mode === "datetime" ? DATETIME_OPTIONS : DATE_OPTIONS).format(date)
    : fallback;

  return <time dateTime={iso}>{formatted}</time>;
}
