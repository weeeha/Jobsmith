"use client";

import * as React from "react";

import { usableTimeZone } from "@/lib/time/zone";

// null means "no provider": time components then keep the browser's own zone,
// which is what pages outside the signed-in layout and unit tests get.
const TimeZoneContext = React.createContext<string | null>(null);

// A saved zone can be newer than this browser's time zone data, and Intl throws
// for a name it does not know. Every consumer formats through Intl, so the
// zone is checked here and UTC is used when the browser rejects it. The check
// runs after mount: the server rendered with the given zone, and the first
// client render has to match it.
export function TimeZoneProvider({ zone, children }: { zone: string; children: React.ReactNode }) {
  // The checked zone is stored with the zone it was checked for, so a changed
  // prop is used as given at once instead of showing the previous zone.
  const [checked, setChecked] = React.useState<{ for: string; zone: string } | null>(null);
  const usable = checked !== null && checked.for === zone ? checked.zone : zone;
  React.useEffect(() => {
    // Whether this browser knows the zone is only known client-side, after
    // hydration; same justification as LocalTime's mounted flag.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChecked({ for: zone, zone: usableTimeZone(zone) });
  }, [zone]);
  return <TimeZoneContext.Provider value={usable}>{children}</TimeZoneContext.Provider>;
}

export function useTimeZone(): string | null {
  return React.useContext(TimeZoneContext);
}
