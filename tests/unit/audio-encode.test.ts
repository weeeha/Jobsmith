import { describe, expect, it } from "vitest";
import { encodeMp3 } from "@/lib/audio/encode";
import { mp3DurationMs } from "@/lib/audio/duration";
import { sinePcm } from "../helpers/audio";

describe("encodeMp3", () => {
  const mp3 = encodeMp3(sinePcm(1, 24_000), 24_000);

  it("returns frames that start with a sync word and total 6000 to 10000 bytes for one second", () => {
    expect(mp3[0]).toBe(0xff);
    expect(mp3[1] & 0xe0).toBe(0xe0);
    expect(mp3.length).toBeGreaterThanOrEqual(6_000);
    expect(mp3.length).toBeLessThanOrEqual(10_000);
  });

  it("mp3DurationMs of the encoded fixture is within 60 ms of 1000", () => {
    const ms = mp3DurationMs(mp3);
    expect(ms).not.toBeNull();
    expect(Math.abs((ms as number) - 1000)).toBeLessThanOrEqual(60);
  });

  it("encodes at 44.1 kHz too", () => {
    const ms = mp3DurationMs(encodeMp3(sinePcm(1, 44_100), 44_100));
    expect(Math.abs((ms as number) - 1000)).toBeLessThanOrEqual(60);
  });
});
