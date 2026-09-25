import { describe, expect, it } from "vitest";
import { pushBodySchema, firstIssue, toIncoming } from "@/lib/bridge/push-schema";

describe("pushBodySchema", () => {
  it("accepts a minimal valid artifact and ignores unknown fields", () => {
    const result = pushBodySchema.safeParse({
      artifacts: [{ key: "cv", kind: "cv", body_md: "# CV", extra: "ignored" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts every optional field", () => {
    const result = pushBodySchema.safeParse({
      artifacts: [
        { key: "recon", kind: "research", title: "Recon", scope: "company", stage: "Saved", body_md: "# Recon" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it.each([
    [null, "The body must be a JSON object."],
    [{ artifacts: "nope" }, "artifacts: artifacts must be a list."],
    [{ artifacts: [] }, "artifacts: artifacts must hold at least one document."],
    [{ artifacts: [{ key: 5, kind: "cv", body_md: "x" }] }, "artifacts.0.key: key must be a string."],
    [
      { artifacts: [{ key: "Not Valid!", kind: "cv", body_md: "x" }] },
      "artifacts.0.key: key must be 1 to 100 lowercase letters, digits, dots, dashes or underscores, starting with a letter or digit.",
    ],
    [{ artifacts: [{ key: "cv", kind: 5, body_md: "x" }] }, "artifacts.0.kind: kind must be a string."],
    [{ artifacts: [{ key: "cv", kind: "", body_md: "x" }] }, "artifacts.0.kind: kind must not be empty."],
    [{ artifacts: [{ key: "cv", kind: "cv", title: 5, body_md: "x" }] }, "artifacts.0.title: title must be a string."],
    [
      { artifacts: [{ key: "cv", kind: "cv", scope: "everyone", body_md: "x" }] },
      "artifacts.0.scope: scope must be opportunity or company.",
    ],
    [{ artifacts: [{ key: "cv", kind: "cv", stage: 5, body_md: "x" }] }, "artifacts.0.stage: stage must be a string."],
    [{ artifacts: [{ key: "cv", kind: "cv", body_md: 5 }] }, "artifacts.0.body_md: body_md must be a string."],
    [
      { artifacts: [{ key: "cv", kind: "cv", body_md: "   " }] },
      "artifacts.0.body_md: body_md must not be empty.",
    ],
  ])("rejects %o with firstIssue text %s", (input, message) => {
    const result = pushBodySchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(firstIssue(result.error)).toBe(message);
    }
  });
});

describe("firstIssue", () => {
  it("joins a nested path with dots", () => {
    const result = pushBodySchema.safeParse({ artifacts: [{ key: "cv", kind: "cv", body_md: "x" }, { key: 5, kind: "cv", body_md: "x" }] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(firstIssue(result.error)).toBe("artifacts.1.key: key must be a string.");
    }
  });

  it("reports a root-level failure with no path prefix", () => {
    const result = pushBodySchema.safeParse(null);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(firstIssue(result.error)).toBe("The body must be a JSON object.");
    }
  });
});

describe("toIncoming", () => {
  it("defaults scope to opportunity and stage to null when absent", () => {
    expect(toIncoming({ key: "cv", kind: "cv", body_md: "# CV" })).toEqual({
      key: "cv",
      kind: "cv",
      title: null,
      scope: "opportunity",
      stage: null,
      bodyMd: "# CV",
    });
  });

  it("turns a stage string into a ref and keeps a given scope and title", () => {
    expect(
      toIncoming({ key: "recon", kind: "research", title: "Recon", scope: "company", stage: "Saved", body_md: "# Recon" }),
    ).toEqual({
      key: "recon",
      kind: "research",
      title: "Recon",
      scope: "company",
      stage: { ref: "Saved" },
      bodyMd: "# Recon",
    });
  });

  it("turns a null title into null, not the string \"null\"", () => {
    expect(toIncoming({ key: "cv", kind: "cv", title: null, body_md: "# CV" }).title).toBeNull();
  });
});
