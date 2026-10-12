import { describe, expect, it } from "vitest";
import { fieldErrorsFromZod } from "@/lib/forms/state";
import { HEADLINE_MAX, RESUME_MAX, profileFormSchema, readProfileForm } from "@/lib/profile/schema";

function parse(values: { headline?: string; resumeMd?: string; timezone?: string }) {
  const formData = new FormData();
  formData.set("headline", values.headline ?? "");
  formData.set("resumeMd", values.resumeMd ?? "");
  formData.set("timezone", values.timezone ?? "UTC");
  return profileFormSchema.safeParse(readProfileForm(formData));
}

function errors(values: Parameters<typeof parse>[0]): Record<string, string> {
  const result = parse(values);
  if (result.success) throw new Error("expected the profile to be rejected");
  return fieldErrorsFromZod(result.error);
}

describe("profileFormSchema", () => {
  it("trims the headline and stores a blank one as null", () => {
    expect(parse({ headline: "  Product designer  " })).toMatchObject({ success: true, data: { headline: "Product designer" } });
    expect(parse({ headline: "   " })).toMatchObject({ success: true, data: { headline: null } });
  });

  it("allows a 200 character headline and rejects 201", () => {
    expect(parse({ headline: "x".repeat(HEADLINE_MAX) }).success).toBe(true);
    expect(errors({ headline: "x".repeat(HEADLINE_MAX + 1) })).toEqual({ headline: "Keep the headline under 200 characters." });
  });

  it("normalizes line endings in the resume to LF and keeps the rest as typed", () => {
    expect(parse({ resumeMd: "# Resume\r\n\r\n- One\r- Two\n" })).toMatchObject({
      success: true,
      data: { resumeMd: "# Resume\n\n- One\n- Two\n" },
    });
  });

  it("stores a blank resume as null", () => {
    expect(parse({ resumeMd: " \r\n  " })).toMatchObject({ success: true, data: { resumeMd: null } });
  });

  it("allows a 50,000 character resume and rejects 50,001", () => {
    expect(parse({ resumeMd: "x".repeat(RESUME_MAX) }).success).toBe(true);
    expect(errors({ resumeMd: "x".repeat(RESUME_MAX + 1) })).toEqual({ resumeMd: "Keep the resume under 50,000 characters." });
  });

  it("stores the canonical zone name", () => {
    expect(parse({ timezone: "Etc/UTC" })).toMatchObject({ success: true, data: { timezone: "UTC" } });
    expect(parse({ timezone: "europe/amsterdam" })).toMatchObject({ success: true, data: { timezone: "Europe/Amsterdam" } });
  });

  it("rejects a zone that does not exist, and a missing one", () => {
    expect(errors({ timezone: "Mars/Olympus" })).toEqual({ timezone: "Choose a time zone from the list." });
    expect(errors({ timezone: "" })).toEqual({ timezone: "Choose a time zone from the list." });
    const result = profileFormSchema.safeParse(readProfileForm(new FormData()));
    expect(result.success).toBe(false);
  });
});
