// Time zone math with Intl only (no date library). The runtime's own zone is
// never read here, so results are the same under any TZ setting.

export type WallClock = { year: number; month: number; day: number; hour: number; minute: number };

const DAY_MS = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();
function buildFormatter(zone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// A zone this engine rejects reads as UTC instead of throwing: the page keeps
// the saved zone for its first render (so it matches the server), and an old
// browser must survive that one render before the fallback zone arrives.
function formatterFor(zone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(zone);
  if (!formatter) {
    try {
      formatter = buildFormatter(zone);
    } catch {
      formatter = buildFormatter("UTC");
    }
    formatters.set(zone, formatter);
  }
  return formatter;
}

function partsIn(instant: Date, zone: string) {
  const out: Record<string, number> = {};
  for (const part of formatterFor(zone).formatToParts(instant)) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return out as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

export function wallClockIn(instant: Date, zone: string): WallClock {
  const p = partsIn(instant, zone);
  return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute };
}

// Offset of `zone` from UTC at `ms`, in milliseconds (positive east of Greenwich).
function offsetAt(ms: number, zone: string): number {
  const whole = Math.floor(ms / 1000) * 1000;
  const p = partsIn(new Date(whole), zone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - whole;
}

function sameWall(a: WallClock, b: WallClock): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day && a.hour === b.hour && a.minute === b.minute;
}

// Wall-clock time in `zone` to an instant. A time that occurs twice (clocks
// go back) resolves to the earlier instant; a time that never occurs (clocks
// go forward) moves later by the length of the gap.
export function instantFromWallClock(wall: WallClock, zone: string): Date {
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  // The offsets a day before and a day after bracket any change that could
  // touch this wall time, so each candidate is one possible reading of it.
  const before = offsetAt(asUtc - DAY_MS, zone);
  const after = offsetAt(asUtc + DAY_MS, zone);
  const candidates = [...new Set([asUtc - before, asUtc - after])].sort((x, y) => x - y);
  const valid = candidates.filter((ms) => sameWall(wallClockIn(new Date(ms), zone), wall));
  if (valid.length > 0) return new Date(valid[0]);
  return new Date(asUtc - before);
}

// "YYYY-MM-DDTHH:mm", and only real calendar dates. Some pickers and scripts
// hand back ":ss" or ":ss.sss" as well; the seconds are accepted and ignored,
// since the app works in whole minutes.
export function parseLocalInputValue(value: string): WallClock | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1, 6).map(Number);
  const seconds = match[6] === undefined ? 0 : Number(match[6]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || seconds > 59) return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1) return null;
  return { year, month, day, hour, minute };
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

export function formatLocalInputValue(wall: WallClock): string {
  return `${pad(wall.year, 4)}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}`;
}

// The first instant of the calendar day that contains `instant`. When
// midnight does not exist (some zones skip it when clocks go forward), this is
// the first moment that does.
export function startOfDayIn(instant: Date, zone: string): Date {
  const w = wallClockIn(instant, zone);
  return instantFromWallClock({ ...w, hour: 0, minute: 0 }, zone);
}

// Whole calendar days from the date of `earlier` to the date of `later`, both
// read in `zone`. Two instants two hours apart across local midnight are 1 day.
export function calendarDaysBetween(earlier: Date, later: Date, zone: string): number {
  const a = wallClockIn(earlier, zone);
  const b = wallClockIn(later, zone);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / DAY_MS);
}

// The wall clock `hour:minute`, `days` calendar days after the date of
// `instant` in `zone`. Calendar days, so a 23 or 25 hour day does not shift it.
export function atTimeDaysLater(instant: Date, zone: string, days: number, hour: number, minute: number): Date {
  const w = wallClockIn(instant, zone);
  const d = new Date(Date.UTC(w.year, w.month - 1, w.day + days));
  return instantFromWallClock(
    { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour, minute },
    zone,
  );
}

// "YYYY-MM-DD" in the zone.
export function zonedDateKey(instant: Date, zone: string): string {
  const w = wallClockIn(instant, zone);
  return `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}`;
}

// Every name the tz database treats as UTC. Engines disagree on the spelling
// they report for these (Node says "UTC", WebKit says "Etc/UTC"), so they are
// folded here and not left to Intl.
const UTC_ALIASES = new Set([
  "utc", "etc/utc", "etc/uct", "uct", "etc/universal", "universal", "etc/zulu", "zulu",
  "etc/gmt", "gmt", "etc/gmt0", "gmt0", "etc/gmt+0", "etc/gmt-0", "gmt+0", "gmt-0", "etc/greenwich", "greenwich",
]);

// The name Intl itself uses for `zone`, or null when it is not a zone. Every
// spelling of UTC comes back as "UTC" on every engine; other names are
// whatever the running engine reports, so two engines can differ for them
// (Asia/Calcutta and Asia/Kolkata): compare names that were both canonicalized
// by the same engine.
export function canonicalTimeZone(zone: string): string | null {
  if (zone.length === 0 || zone.length > 64) return null;
  if (UTC_ALIASES.has(zone.toLowerCase())) return "UTC";
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

// `zone` when this engine knows it, otherwise "UTC". A saved zone can be newer
// than an old browser's time zone data, and Intl then throws a RangeError.
export function usableTimeZone(zone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return "UTC";
  }
}

// Node lists no "UTC" entry, so it is added first.
export function listTimeZones(): string[] {
  const zones = Intl.supportedValuesOf("timeZone");
  return zones.includes("UTC") ? zones : ["UTC", ...zones];
}
