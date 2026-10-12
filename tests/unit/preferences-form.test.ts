import { describe, expect, it } from "vitest";
import { fieldErrorsByPath } from "@/lib/forms/state";
import { UNREADABLE_INPUT_VALUE } from "@/lib/forms/submit";
import { readPreferencesForm } from "@/lib/preferences/form";
import { DEFAULT_PREFERENCES, preferencesSchema } from "@/lib/preferences/schema";

function form(entries: [string, string][]): FormData {
  const formData = new FormData();
  for (const [name, value] of entries) formData.append(name, value);
  return formData;
}

describe("readPreferencesForm", () => {
  it("reads an empty form as empty lists, null numbers and restored defaults", () => {
    const raw = readPreferencesForm(new FormData());
    expect(raw).toEqual({
      v: 1,
      titles: [],
      seniority: [],
      locations: [],
      workModes: [],
      compFloor: null,
      compTarget: null,
      currency: null,
      mustHaves: [],
      dealbreakers: [],
      industriesAvoid: [],
      companySize: { min: null, max: null },
      scoreThreshold: undefined,
      attention: { followUpDays: undefined, savedDays: undefined },
    });
    expect(preferencesSchema.parse(raw)).toEqual(DEFAULT_PREFERENCES);
  });

  it("reads lists, work modes and seniority with getAll, in form order", () => {
    const raw = readPreferencesForm(
      form([
        ["titles", "Product Designer"],
        ["titles", "UX Lead"],
        ["workModes", "remote"],
        ["workModes", "hybrid"],
        ["seniority", "senior"],
        ["locations", "Rotterdam"],
        ["mustHaves", "Design systems"],
        ["dealbreakers", "On call"],
        ["industriesAvoid", "Gambling"],
      ]),
    );
    expect(raw).toMatchObject({
      titles: ["Product Designer", "UX Lead"],
      workModes: ["remote", "hybrid"],
      seniority: ["senior"],
      locations: ["Rotterdam"],
      mustHaves: ["Design systems"],
      dealbreakers: ["On call"],
      industriesAvoid: ["Gambling"],
    });
  });

  it("turns blank number boxes into null, or into undefined where a default applies", () => {
    const raw = readPreferencesForm(form([["compFloor", "  "], ["scoreThreshold", ""], ["attention.followUpDays", " "]]));
    expect(raw).toMatchObject({ compFloor: null, scoreThreshold: undefined, attention: { followUpDays: undefined } });
  });

  it("reads numbers, including the nested names", () => {
    const raw = readPreferencesForm(
      form([
        ["compFloor", "150"],
        ["compTarget", "200"],
        ["companySize.min", "50"],
        ["companySize.max", "500"],
        ["scoreThreshold", "60"],
        ["attention.followUpDays", "10"],
        ["attention.savedDays", "2"],
      ]),
    );
    expect(raw).toMatchObject({
      compFloor: 150,
      compTarget: 200,
      companySize: { min: 50, max: 500 },
      scoreThreshold: 60,
      attention: { followUpDays: 10, savedDays: 2 },
    });
  });

  it("upper-cases and trims the currency, blank is null", () => {
    expect(readPreferencesForm(form([["currency", " eur "]]))).toMatchObject({ currency: "EUR" });
    expect(readPreferencesForm(form([["currency", "  "]]))).toMatchObject({ currency: null });
  });

  it("reads an unreadable or non-numeric number as NaN, which the schema rejects with Enter a number.", () => {
    const raw = readPreferencesForm(
      form([
        ["compFloor", UNREADABLE_INPUT_VALUE],
        ["companySize.min", "12abc"],
        ["scoreThreshold", UNREADABLE_INPUT_VALUE],
        ["attention.savedDays", "x"],
      ]),
    );
    expect(raw).toMatchObject({ compFloor: Number.NaN, companySize: { min: Number.NaN }, scoreThreshold: Number.NaN });
    const result = preferencesSchema.safeParse(raw);
    if (result.success) throw new Error("expected rejection");
    expect(fieldErrorsByPath(result.error)).toEqual({
      compFloor: "Enter a number.",
      "companySize.min": "Enter a number.",
      scoreThreshold: "Enter a number.",
      "attention.savedDays": "Enter a number.",
    });
  });
});
