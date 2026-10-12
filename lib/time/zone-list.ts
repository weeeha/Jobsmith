// Labels, groups and order for the time zone picker in Settings. Pure strings:
// the zone names themselves come from lib/time/zone.ts.

export type TimeZoneItem = { value: string; label: string; group: string };

// City first, so typing "ams" finds Amsterdam: "Europe/Amsterdam" is
// "Amsterdam" and "America/Argentina/Buenos_Aires" is "Argentina / Buenos Aires".
export function timeZoneLabel(zone: string): string {
  const parts = zone.split("/");
  if (parts.length === 1) return zone.replaceAll("_", " ");
  return parts
    .slice(1)
    .map((part) => part.replaceAll("_", " "))
    .join(" / ");
}

export function timeZoneGroup(zone: string): string {
  if (zone === "UTC") return "UTC";
  const slash = zone.indexOf("/");
  return slash === -1 ? "Other" : zone.slice(0, slash);
}

function compareItems(a: TimeZoneItem, b: TimeZoneItem): number {
  if (a.group !== b.group) {
    if (a.group === "UTC") return -1;
    if (b.group === "UTC") return 1;
    return a.group.localeCompare(b.group, "en");
  }
  return a.label.localeCompare(b.label, "en");
}

// `extra` carries zones that must be selectable even when the list lacks them
// (the saved value, the device's zone); blanks and repeats are ignored.
export function timeZoneItems(zones: string[], extra: (string | null)[]): TimeZoneItem[] {
  const all = new Set(zones);
  for (const zone of extra) {
    if (zone !== null && zone !== "") all.add(zone);
  }
  return [...all]
    .map((zone) => ({ value: zone, label: timeZoneLabel(zone), group: timeZoneGroup(zone) }))
    .sort(compareItems);
}
