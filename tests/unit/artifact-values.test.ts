import { describe, expect, it } from "vitest";
import { warningMessage } from "@/lib/artifacts/values";

describe("warningMessage", () => {
  it("unknown_kind names the key and the unrecognized kind", () => {
    expect(warningMessage("unknown_kind", "mystery", { kind: "resume" })).toBe(
      'mystery: unknown kind "resume", stored as other.',
    );
  });

  it("stage_not_found names the key and the unmatched stage text", () => {
    expect(warningMessage("stage_not_found", "call-card", { stage: "Onsite" })).toBe(
      'call-card: no stage matches "Onsite", stored without a stage.',
    );
  });

  it("stage_ignored names the key and the ignored stage text", () => {
    expect(warningMessage("stage_ignored", "recon", { stage: "Saved" })).toBe(
      'recon: documents shared with the whole company have no stage, so "Saved" was ignored.',
    );
  });

  it("company_scope_not_allowed names only the key", () => {
    expect(warningMessage("company_scope_not_allowed", "cv", {})).toBe(
      "cv: only research, fit briefs and people notes can be shared with the whole company, so it was stored for this job.",
    );
  });

  it("sent_locked names the key and the sent version number", () => {
    expect(warningMessage("sent_locked", "cv", { version: 3 })).toBe(
      "cv: version 3 was sent, so its title, kind and stage stay as they were.",
    );
  });
});
