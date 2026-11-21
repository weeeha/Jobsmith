import { describe, expect, it } from "vitest";
import { audioUploadSchema, firstAudioIssue } from "@/lib/bridge/audio-schema";
import { BRIDGE_ERRORS } from "@/lib/bridge/errors";
import { MAX_AUDIO_SEGMENTS } from "@/lib/bridge/wire";

const good = { hash: "0123456789abcdef", contentType: "audio/mpeg", durationMs: 1200, base64: "AAAA" };

describe("audio upload schema", () => {
  it("accepts a segment with a 16 hex hash, a content type, a non-negative duration and base64", () => {
    expect(audioUploadSchema.safeParse({ segments: [good] }).success).toBe(true);
    expect(audioUploadSchema.safeParse({ segments: [{ ...good, durationMs: 0 }] }).success).toBe(true);
  });

  it("rejects a hash that is not 16 lowercase hex characters", () => {
    for (const hash of ["", "0123", "0123456789ABCDEF", "0123456789abcdeg", "0123456789abcdef0"]) {
      expect(audioUploadSchema.safeParse({ segments: [{ ...good, hash }] }).success).toBe(false);
    }
  });

  it("rejects a missing content type, a negative or fractional duration and a missing base64", () => {
    expect(audioUploadSchema.safeParse({ segments: [{ ...good, contentType: undefined }] }).success).toBe(false);
    expect(audioUploadSchema.safeParse({ segments: [{ ...good, durationMs: -1 }] }).success).toBe(false);
    expect(audioUploadSchema.safeParse({ segments: [{ ...good, durationMs: 1.5 }] }).success).toBe(false);
    expect(audioUploadSchema.safeParse({ segments: [{ ...good, base64: undefined }] }).success).toBe(false);
  });

  it("needs a non-empty list and names the first problem", () => {
    const empty = audioUploadSchema.safeParse({ segments: [] });
    expect(empty.success).toBe(false);
    const bad = audioUploadSchema.safeParse({ segments: [{ ...good, hash: "zz" }] });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(firstAudioIssue(bad.error)).toMatch(/^segments\.0\.hash: /);
  });
});

describe("audio caps", () => {
  it("a request holds at most 50 clips, with the fixed message", () => {
    expect(MAX_AUDIO_SEGMENTS).toBe(50);
    expect(BRIDGE_ERRORS.too_many_segments.status).toBe(413);
    expect(BRIDGE_ERRORS.too_many_segments.message({ requestId: "r" })).toBe("An audio upload holds at most 50 clips.");
  });
});
