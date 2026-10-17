import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  parsePreferences,
  preferencesInputSchema,
  toPreferencesDocument,
} from "@/lib/preferences/schema";
import { preferencesFromForm } from "@/lib/preferences/form";
import { fieldErrorsFromZod } from "@/lib/forms/state";

const validInput = {
  titles: ["Product designer"],
  seniority: ["senior"],
  locations: ["Remote"],
  workModes: ["remote"],
  compFloor: null,
  compTarget: null,
  currency: "usd",
  mustHaves: [],
  dealbreakers: [],
  industriesAvoid: [],
  sizeMin: null,
  sizeMax: null,
  scoreThreshold: 70,
  followUpDays: 7,
  savedDays: 3,
};

describe("parsePreferences", () => {
  it("returns the defaults for an empty, missing or malformed document", () => {
    expect(parsePreferences({})).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences("not an object")).toEqual(DEFAULT_PREFERENCES);
  });

  it("keeps every valid field when one field is invalid", () => {
    const parsed = parsePreferences({
      titles: ["Design lead"],
      scoreThreshold: 400,
      workModes: ["remote", "on the moon"],
      attention: { followUpDays: 10, savedDays: "three" },
    });
    expect(parsed.titles).toEqual(["Design lead"]);
    expect(parsed.scoreThreshold).toBe(70);
    expect(parsed.workModes).toEqual(["remote"]);
    expect(parsed.attention).toEqual({ followUpDays: 10, savedDays: 3 });
  });
});

describe("preferencesInputSchema", () => {
  it("normalizes lists: trims, drops blanks, removes case-insensitive duplicates", () => {
    const parsed = preferencesInputSchema.parse({
      ...validInput,
      titles: ["  Product designer ", "", "product DESIGNER", "Design lead"],
    });
    expect(parsed.titles).toEqual(["Product designer", "Design lead"]);
  });

  it("upper-cases the currency and rejects anything but three letters", () => {
    expect(preferencesInputSchema.parse(validInput).currency).toBe("USD");
    const bad = preferencesInputSchema.safeParse({ ...validInput, currency: "dollars" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(fieldErrorsFromZod(bad.error).currency).toBe("Use a three-letter currency code, like USD.");
  });

  it("rejects a target below the floor and a company size range that runs backwards", () => {
    const bad = preferencesInputSchema.safeParse({
      ...validInput,
      compFloor: 120_000,
      compTarget: 100_000,
      sizeMin: 500,
      sizeMax: 50,
    });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      const errors = fieldErrorsFromZod(bad.error);
      expect(errors.compTarget).toBe("The target can't be below the floor.");
      expect(errors.sizeMax).toBe("The largest size can't be below the smallest.");
    }
  });

  it("rejects numbers out of range, unreadable numbers and missing required numbers", () => {
    const bad = preferencesInputSchema.safeParse({
      ...validInput,
      scoreThreshold: 101,
      followUpDays: Number.NaN,
      savedDays: null,
    });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      const errors = fieldErrorsFromZod(bad.error);
      expect(errors.scoreThreshold).toBe("Enter a whole number from 0 to 100.");
      expect(errors.followUpDays).toBe("Enter a whole number of days from 1 to 60.");
      expect(errors.savedDays).toBe("Enter a whole number of days from 1 to 60.");
    }
  });

  it("caps a list at 20 entries of 80 characters", () => {
    const tooMany = preferencesInputSchema.safeParse({ ...validInput, mustHaves: Array.from({ length: 21 }, (_, i) => `Item ${i}`) });
    expect(tooMany.success).toBe(false);
    if (!tooMany.success) expect(fieldErrorsFromZod(tooMany.error).mustHaves).toBe("Keep it to 20 entries or fewer.");
    const tooLong = preferencesInputSchema.safeParse({ ...validInput, locations: ["x".repeat(81)] });
    expect(tooLong.success).toBe(false);
    if (!tooLong.success) expect(fieldErrorsFromZod(tooLong.error).locations).toBe("Keep each entry under 80 characters.");
  });

  it("rejects an unknown seniority or work mode", () => {
    const bad = preferencesInputSchema.safeParse({ ...validInput, seniority: ["intern"], workModes: ["anywhere"] });
    expect(bad.success).toBe(false);
  });
});

describe("toPreferencesDocument", () => {
  it("nests size and attention and stamps the version", () => {
    const doc = toPreferencesDocument(
      preferencesInputSchema.parse({ ...validInput, sizeMin: 50, sizeMax: 2000, followUpDays: 10, savedDays: 5 }),
    );
    expect(doc.version).toBe(1);
    expect(doc.companySize).toEqual({ min: 50, max: 2000 });
    expect(doc.attention).toEqual({ followUpDays: 10, savedDays: 5 });
    expect(parsePreferences(doc)).toEqual(doc);
  });
});

describe("preferencesFromForm", () => {
  it("reads repeated list fields, toggles and numbers with grouping separators", () => {
    const form = new FormData();
    form.append("titles", "Product designer");
    form.append("titles", "Design lead");
    form.append("workModes", "remote");
    form.append("seniority", "staff");
    form.set("compFloor", "");
    form.set("sizeMin", "50");
    form.set("sizeMax", "2,000");
    form.set("currency", "eur");
    form.set("scoreThreshold", "70");
    form.set("followUpDays", "7");
    form.set("savedDays", "3");
    const parsed = preferencesInputSchema.parse(preferencesFromForm(form));
    expect(parsed.titles).toEqual(["Product designer", "Design lead"]);
    expect(parsed.workModes).toEqual(["remote"]);
    expect(parsed.seniority).toEqual(["staff"]);
    expect(parsed.compFloor).toBeNull();
    expect(parsed.sizeMax).toBe(2000);
    expect(parsed.currency).toBe("EUR");
  });

  it("turns text in a number box into a rejected value, not a blank", () => {
    const form = new FormData();
    form.set("currency", "USD");
    form.set("scoreThreshold", "unreadable");
    form.set("followUpDays", "7");
    form.set("savedDays", "3");
    const parsed = preferencesInputSchema.safeParse(preferencesFromForm(form));
    expect(parsed.success).toBe(false);
  });
});
