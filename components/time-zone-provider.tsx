"use client";

import * as React from "react";

import { usableTimeZone } from "@/lib/time/zone";

// null means "no provider": time components then keep the browser's own zone,
// which is what pages outside the signed-in layout and unit tests get.
const TimeZoneContext = React.createContext<string | null>(null);

// A saved zone can be newer than this browser's time zone data, and Intl throws
// for a name it does not know. Every consumer formats through Intl, so the
// zone is checked once here and UTC is used when the browser rejects it.
export function TimeZoneProvider({ zone, children }: { zone: string; children: React.ReactNode }) {
  const usable = React.useMemo(() => usableTimeZone(zone), [zone]);
  return <TimeZoneContext.Provider value={usable}>{children}</TimeZoneContext.Provider>;
}

export function useTimeZone(): string | null {
  return React.useContext(TimeZoneContext);
}
