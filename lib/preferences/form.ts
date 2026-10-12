import { UNREADABLE_INPUT_VALUE } from "@/lib/forms/submit";

function strings(formData: FormData, name: string): string[] {
  return formData.getAll(name).filter((value): value is string => typeof value === "string");
}

// Blank is "no value". Anything that is not a plain number (including the
// stand-in for text the browser could not read) is NaN, which the schema
// rejects with its own message instead of treating it as blank.
function readNumber(formData: FormData, name: string): number | null {
  const value = formData.get(name);
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text === "") return null;
  if (text === UNREADABLE_INPUT_VALUE) return Number.NaN;
  return Number(text);
}

// Fields that have a default: blank means "restore the default".
function readNumberOrDefault(formData: FormData, name: string): number | undefined {
  return readNumber(formData, name) ?? undefined;
}

function readCurrency(formData: FormData): string | null {
  const value = formData.get("currency");
  if (typeof value !== "string") return null;
  const text = value.trim().toUpperCase();
  return text === "" ? null : text;
}

/**
 * The raw object the preferences schema parses. Field names in the DOM are
 * exactly these keys, dotted for the nested ones.
 */
export function readPreferencesForm(formData: FormData): Record<string, unknown> {
  return {
    v: 1,
    titles: strings(formData, "titles"),
    seniority: strings(formData, "seniority"),
    locations: strings(formData, "locations"),
    workModes: strings(formData, "workModes"),
    compFloor: readNumber(formData, "compFloor"),
    compTarget: readNumber(formData, "compTarget"),
    currency: readCurrency(formData),
    mustHaves: strings(formData, "mustHaves"),
    dealbreakers: strings(formData, "dealbreakers"),
    industriesAvoid: strings(formData, "industriesAvoid"),
    companySize: {
      min: readNumber(formData, "companySize.min"),
      max: readNumber(formData, "companySize.max"),
    },
    scoreThreshold: readNumberOrDefault(formData, "scoreThreshold"),
    attention: {
      followUpDays: readNumberOrDefault(formData, "attention.followUpDays"),
      savedDays: readNumberOrDefault(formData, "attention.savedDays"),
    },
  };
}
