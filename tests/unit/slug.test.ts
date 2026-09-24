import { describe, expect, it } from "vitest";
import { baseSlug, uniqueSlug } from "@/lib/pipeline/slug";

describe("baseSlug", () => {
  it("builds an ASCII kebab-case slug from company and role", () => {
    expect(baseSlug("Acme Robotics", "Senior Product Designer")).toBe(
      "acme-robotics-senior-product-designer",
    );
  });

  it("strips punctuation and accents", () => {
    expect(baseSlug("Café Kréme", "Barista Lead")).toBe("cafe-kreme-barista-lead");
  });

  it("caps the result at 60 characters with no trailing hyphen", () => {
    const slug = baseSlug("A".repeat(80), "Role");
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("falls back to job when there is nothing left to slugify", () => {
    expect(baseSlug("", "")).toBe("job");
    expect(baseSlug("!!!", "###")).toBe("job");
  });
});

describe("uniqueSlug", () => {
  it("returns the base slug unchanged when it is not taken", () => {
    expect(uniqueSlug("acme-designer", [])).toBe("acme-designer");
  });

  it("appends -2 when the base is taken", () => {
    expect(uniqueSlug("acme-designer", ["acme-designer"])).toBe("acme-designer-2");
  });

  it("keeps counting past multiple taken suffixes", () => {
    expect(uniqueSlug("acme-designer", ["acme-designer", "acme-designer-2"])).toBe(
      "acme-designer-3",
    );
  });
});
