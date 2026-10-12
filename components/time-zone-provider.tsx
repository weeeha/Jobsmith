"use client";

import * as React from "react";

// null means "no provider": time components then keep the browser's own zone,
// which is what pages outside the signed-in layout and unit tests get.
const TimeZoneContext = React.createContext<string | null>(null);

export function TimeZoneProvider({ zone, children }: { zone: string; children: React.ReactNode }) {
  return <TimeZoneContext.Provider value={zone}>{children}</TimeZoneContext.Provider>;
}

export function useTimeZone(): string | null {
  return React.useContext(TimeZoneContext);
}
