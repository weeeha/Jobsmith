import { describe, expect, it } from "vitest";
import { personInputSchema } from "@/lib/people";

const VALID = { name: "Priya Raman", role: "recruiter" as const };

function firstMessage(input: unknown): string {
  const result = personInputSchema.safeParse(input);
  if (result.success) throw new Error("expected validation to fail");
  return result.error.issues[0]!.message;
}

describe("personInputSchema plain messages", () => {
  it("gives a plain message for a blank name", () => {
    expect(firstMessage({ ...VALID, name: "" })).toBe("Enter a name.");
  });

  it("gives a plain message for a blank title", () => {
    expect(firstMessage({ ...VALID, title: "" })).toBe("Enter a title.");
  });

  it("gives a plain message for a bad LinkedIn link", () => {
    expect(firstMessage({ ...VALID, linkedinUrl: "not a url" })).toBe(
      "Enter a link that starts with http or https.",
    );
  });

  it("gives a plain message for a bad email address", () => {
    expect(firstMessage({ ...VALID, email: "not an email" })).toBe("Enter a real email address.");
  });

  it("gives a plain message for an unknown role", () => {
    expect(firstMessage({ ...VALID, role: "astronaut" })).toBe("Choose a role.");
  });

  it("gives a plain message for a malformed stage id", () => {
    expect(firstMessage({ ...VALID, stageId: "not-a-uuid" })).toBe("Choose a valid stage.");
  });

  it("still allows clearing the optional fields with null", () => {
    expect(
      personInputSchema.safeParse({ ...VALID, title: null, linkedinUrl: null, email: null, notesMd: null, stageId: null })
        .success,
    ).toBe(true);
  });
});
