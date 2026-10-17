import { describe, expect, it } from "vitest";
import { profileFromForm, profileInputSchema, timeZoneOptions } from "@/lib/profile";
import { fieldErrorsFromZod } from "@/lib/forms/state";

describe("profileInputSchema", () => {
  it("trims the headline and turns blanks into cleared fields", () => {
    const parsed = profileInputSchema.parse({ headline: "  ", timezone: "America/New_York", resumeMd: "\n \n" });
    expect(parsed).toEqual({ headline: null, timezone: "America/New_York", resumeMd: null });
  });

  it("keeps the resume as written, including its leading whitespace", () => {
    const parsed = profileInputSchema.parse({ headline: "Designer", timezone: "UTC", resumeMd: "  # Demo User\n" });
    expect(parsed.resumeMd).toBe("  # Demo User\n");
  });

  it("rejects an unknown zone, a long headline and a long resume", () => {
    const bad = profileInputSchema.safeParse({
      headline: "x".repeat(201),
      timezone: "Mars/Olympus",
      resumeMd: "x".repeat(100_001),
    });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      const errors = fieldErrorsFromZod(bad.error);
      expect(errors.headline).toBe("Keep the headline under 200 characters.");
      expect(errors.timezone).toBe("Pick a time zone from the list, like America/New_York.");
      expect(errors.resumeMd).toBe("Keep the resume under 100,000 characters.");
    }
  });
});

describe("profileFromForm", () => {
  it("reads the three fields and treats a missing one as blank", () => {
    const form = new FormData();
    form.set("headline", "Designer");
    form.set("timezone", "UTC");
    expect(profileFromForm(form)).toEqual({ headline: "Designer", timezone: "UTC", resumeMd: "" });
  });
});

describe("timeZoneOptions", () => {
  it("lists UTC and real zones", () => {
    const zones = timeZoneOptions();
    expect(zones).toContain("UTC");
    expect(zones).toContain("America/New_York");
  });
});
