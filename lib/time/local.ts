import { formatLocalInputValue, instantFromWallClock, parseLocalInputValue, wallClockIn } from "@/lib/time/zone";

/**
 * A `datetime-local` input's value ("2026-10-01T09:30") has no time zone
 * designator.
 *
 * With a `zone`, the value is wall-clock time in that zone (the profile
 * zone), converted by lib/time/zone.ts; an empty or unreadable value gives "".
 *
 * Without a zone, the Date constructor's ISO-8601 parsing treats a date-time
 * string with no zone as LOCAL time (only a date-only string parses as UTC),
 * which is exactly the browser's own zone that produced the input value, so
 * this is a plain parse, not a manual offset calculation.
 */
export function toInstant(localValue: string, zone?: string | null): string {
  if (localValue === "") return "";
  if (zone) {
    const wall = parseLocalInputValue(localValue);
    return wall ? instantFromWallClock(wall, zone).toISOString() : "";
  }
  return new Date(localValue).toISOString();
}

/** Zero-padded to two digits, e.g. 5 -> "05". */
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * The inverse of toInstant: an ISO instant back to a "YYYY-MM-DDTHH:MM"
 * value, in `zone` when given, otherwise in the runtime's own zone, read
 * through the local getters (getFullYear/getMonth/...), never the UTC ones.
 */
export function toLocalInputValue(iso: string, zone?: string | null): string {
  if (iso === "") return "";
  const date = new Date(iso);
  if (zone) return formatLocalInputValue(wallClockIn(date, zone));
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
