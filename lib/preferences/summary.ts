import { WORK_MODE_LABELS } from "@/lib/pipeline/labels";
import { SENIORITY_LEVELS, type Preferences, type Seniority } from "./schema";

const SENIORITY_LABELS = Object.fromEntries(SENIORITY_LEVELS.map((s) => [s.value, s.label])) as Record<Seniority, string>;

function companySizeLine({ min, max }: Preferences["companySize"]): string | null {
  if (min !== null && max !== null) return `Company size: ${min} to ${max} people`;
  if (min !== null) return `Company size: at least ${min} people`;
  if (max !== null) return `Company size: up to ${max} people`;
  return null;
}

function payLine(label: string, amount: number | null, currency: string): string | null {
  return amount === null ? null : `${label}: ${amount} ${currency}`;
}

/**
 * One line per set field, in a fixed order: what the scoring prompt says
 * about the preferences. The score threshold and the reminder days are
 * settings of the app itself, not preferences about a job, so they are left
 * out.
 */
export function preferencesSummaryLines(p: Preferences): string[] {
  const lines: (string | null)[] = [
    p.titles.length > 0 ? `Job titles: ${p.titles.join(", ")}` : null,
    p.seniority.length > 0 ? `Seniority: ${p.seniority.map((level) => SENIORITY_LABELS[level]).join(", ")}` : null,
    p.locations.length > 0 ? `Locations: ${p.locations.join(", ")}` : null,
    p.workModes.length > 0 ? `Work modes: ${p.workModes.map((mode) => WORK_MODE_LABELS[mode]).join(", ")}` : null,
    payLine("Pay floor", p.compFloor, p.currency),
    payLine("Pay target", p.compTarget, p.currency),
    p.mustHaves.length > 0 ? `Must-haves: ${p.mustHaves.join(", ")}` : null,
    p.dealbreakers.length > 0 ? `Dealbreakers: ${p.dealbreakers.join(", ")}` : null,
    p.industriesAvoid.length > 0 ? `Industries to avoid: ${p.industriesAvoid.join(", ")}` : null,
    companySizeLine(p.companySize),
  ];
  return lines.filter((line): line is string => line !== null);
}
