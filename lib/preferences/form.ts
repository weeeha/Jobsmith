// FormData from the Preferences page to the shape preferencesInputSchema
// checks. Lists and toggles arrive as repeated fields with the same name.

function strings(formData: FormData, name: string): string[] {
  return formData.getAll(name).filter((v): v is string => typeof v === "string");
}

// Blank means "no figure" (null). Anything else is parsed after dropping
// grouping separators ("2,000", "120 000"), and text that is not a number
// stays NaN so the schema rejects it instead of reading it as blank.
function numberOrNull(formData: FormData, name: string): number | null {
  const value = formData.get(name);
  if (typeof value !== "string" || value.trim() === "") return null;
  const cleaned = value.replace(/[\s,]/g, "");
  return cleaned === "" ? Number.NaN : Number(cleaned);
}

export function preferencesFromForm(formData: FormData) {
  const currency = formData.get("currency");
  return {
    titles: strings(formData, "titles"),
    seniority: strings(formData, "seniority"),
    locations: strings(formData, "locations"),
    workModes: strings(formData, "workModes"),
    compFloor: numberOrNull(formData, "compFloor"),
    compTarget: numberOrNull(formData, "compTarget"),
    currency: typeof currency === "string" ? currency : "",
    mustHaves: strings(formData, "mustHaves"),
    dealbreakers: strings(formData, "dealbreakers"),
    industriesAvoid: strings(formData, "industriesAvoid"),
    sizeMin: numberOrNull(formData, "sizeMin"),
    sizeMax: numberOrNull(formData, "sizeMax"),
    scoreThreshold: numberOrNull(formData, "scoreThreshold"),
    followUpDays: numberOrNull(formData, "followUpDays"),
    savedDays: numberOrNull(formData, "savedDays"),
  };
}
