import { describe, expect, it } from "vitest";
import { audioStatusFor, audioStatusText } from "@/lib/prep/audio-status";

describe("audioStatusText", () => {
  it("maps each state to the spec's text", () => {
    expect(audioStatusText({ state: "ready" })).toBe("Audio ready");
    expect(audioStatusText({ state: "partial", done: 61, total: 96 })).toBe("Audio: 61 of 96 clips");
    expect(audioStatusText({ state: "browser" })).toBe("Browser voice");
    expect(audioStatusText({ state: "preparing" })).toBe("Preparing audio");
    expect(audioStatusText({ state: "paused" })).toBe("Paused, trying again in a minute");
  });

  it("takes the live counts from the arguments when given", () => {
    expect(audioStatusText({ state: "partial", done: 1, total: 2 }, 61, 96)).toBe("Audio: 61 of 96 clips");
    expect(audioStatusText({ state: "preparing" }, 61, 96)).toBe("Audio: 61 of 96 clips");
  });

  it("never uses an exclamation mark or an em dash", () => {
    for (const state of ["ready", "browser", "preparing", "paused"] as const) {
      expect(audioStatusText({ state })).not.toMatch(/[!—]/);
    }
  });
});

describe("audioStatusFor", () => {
  it("TTS off with no done clips is browser", () => {
    expect(audioStatusFor({ total: 10, done: 0 }, false)).toEqual({ state: "browser" });
  });

  it("TTS off with clips from the CLI path is partial or ready by the plan", () => {
    expect(audioStatusFor({ total: 10, done: 4 }, false)).toEqual({ state: "partial", done: 4, total: 10 });
    expect(audioStatusFor({ total: 10, done: 10 }, false)).toEqual({ state: "ready" });
  });

  it("TTS on with nothing done is partial 0 of total; everything done is ready", () => {
    expect(audioStatusFor({ total: 10, done: 0 }, true)).toEqual({ state: "partial", done: 0, total: 10 });
    expect(audioStatusFor({ total: 10, done: 10 }, true)).toEqual({ state: "ready" });
  });

  it("a bank with nothing to speak is browser", () => {
    expect(audioStatusFor({ total: 0, done: 0 }, true)).toEqual({ state: "browser" });
  });
});
