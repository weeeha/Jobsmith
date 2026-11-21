import { describe, expect, it } from "vitest";
import { createFakeTtsDriver, silentMp3 } from "@/lib/tts/fake";
import { mp3DurationMs } from "@/lib/audio/duration";
import { expectFail, expectOk } from "../helpers/result";

const request = (text: string) => ({ text, voice: "Vivian", style: "default" as const, format: "mp3" as const });

describe("fake TTS driver", () => {
  it("returns audio/mpeg whose duration is within one frame of max(600, round(chars / 13 * 1000)) ms", async () => {
    const driver = createFakeTtsDriver();
    for (const text of ["Hi.", "x".repeat(130), "y".repeat(520)]) {
      const audio = expectOk(await driver.synthesize(request(text)));
      expect(audio.contentType).toBe("audio/mpeg");
      const expected = Math.max(600, Math.round((text.length / 13) * 1000));
      expect(Math.abs((mp3DurationMs(audio.audio) ?? 0) - expected)).toBeLessThanOrEqual(27);
    }
  });

  it("is deterministic for the same text", async () => {
    const driver = createFakeTtsDriver();
    const a = expectOk(await driver.synthesize(request("Same words here.")));
    const b = expectOk(await driver.synthesize(request("Same words here.")));
    expect(Array.from(a.audio)).toEqual(Array.from(b.audio));
  });

  it("a Fake wait line delays the answer through the injected sleep and is not counted in the duration", async () => {
    const waits: number[] = [];
    const driver = createFakeTtsDriver({ sleep: async (ms) => void waits.push(ms) });
    const plain = expectOk(await driver.synthesize(request("Hello there.")));
    const waited = expectOk(await driver.synthesize(request("Hello there.\nFake wait: 200")));
    expect(waits).toEqual([200]);
    expect(mp3DurationMs(waited.audio)).toBe(mp3DurationMs(plain.audio));
  });

  it("caps a Fake wait at 30 000 ms", async () => {
    const waits: number[] = [];
    const driver = createFakeTtsDriver({ sleep: async (ms) => void waits.push(ms) });
    await driver.synthesize(request("Fake wait: 999999"));
    expect(waits).toEqual([30_000]);
  });

  it("a Fake error line returns that error code", async () => {
    const driver = createFakeTtsDriver();
    expectFail(await driver.synthesize(request("Fake error: tts_rate_limited")), "tts_rate_limited");
    expectFail(await driver.synthesize(request("Words.\nFake error: tts_timeout")), "tts_timeout");
  });

  it("ignores a Fake error line naming an unknown code", async () => {
    const driver = createFakeTtsDriver();
    expect((await driver.synthesize(request("Fake error: nonsense"))).ok).toBe(true);
  });

  it("voices lists Vivian, Ryan and Aria and the name is fake", async () => {
    const driver = createFakeTtsDriver();
    expect(driver.name).toBe("fake");
    expect((await driver.voices()).map((v) => v.id)).toEqual(["Vivian", "Ryan", "Aria"]);
  });

  it("silentMp3 frames are 208 bytes: header FF FB 50 C0 then zeros", () => {
    const bytes = silentMp3(1000);
    expect(bytes.length % 208).toBe(0);
    expect(bytes.length / 208).toBe(Math.ceil(1000 / 26.122));
    expect(Array.from(bytes.subarray(0, 4))).toEqual([0xff, 0xfb, 0x50, 0xc0]);
    expect(bytes.subarray(4, 208).every((b) => b === 0)).toBe(true);
    expect(Array.from(bytes.subarray(208, 212))).toEqual([0xff, 0xfb, 0x50, 0xc0]);
  });
});
