// Calendar math in a named IANA zone (the profile's time zone), with no
// dependency: Intl gives the zone's wall clock for an instant, and the offset
// between that wall clock and UTC turns a wall-clock time back into an instant.

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

type WallClock = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function wallClock(instant: Date, timeZone: string): WallClock {
  const parts: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

/** Milliseconds the zone's wall clock is ahead of UTC at `instant`. */
function offsetAt(instant: Date, timeZone: string): number {
  const w = wallClock(instant, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

export function isTimeZone(value: string): boolean {
  if (value.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * The instant at which the zone's wall clock reads the given date and time.
 * Month is 1-based; an out-of-range day rolls over like Date.UTC does. The
 * offset is read twice because the first guess can sit on the other side of a
 * daylight saving change from the answer.
 */
export function zonedAt(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = offsetAt(new Date(guess), timeZone);
  const candidate = guess - first;
  const second = offsetAt(new Date(candidate), timeZone);
  return new Date(second === first ? candidate : guess - second);
}

/** Midnight at the start of the zone's calendar day that contains `instant`. */
export function zonedDayStart(instant: Date, timeZone: string): Date {
  const w = wallClock(instant, timeZone);
  return zonedAt(w.year, w.month, w.day, 0, 0, timeZone);
}

/** `hour`:00 in the zone, `days` calendar days after the day that contains `instant`. */
export function addZonedDays(instant: Date, days: number, timeZone: string, hour = 9): Date {
  const w = wallClock(instant, timeZone);
  return zonedAt(w.year, w.month, w.day + days, hour, 0, timeZone);
}
