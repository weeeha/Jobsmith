import { describe, expect, it } from "vitest";
import { parseWav, wrapPcmAsWav } from "@/lib/audio/wav";
import { sinePcm } from "../helpers/audio";
import { expectFail, expectOk } from "../helpers/result";

function ascii(bytes: Uint8Array, at: number, length: number): string {
  return String.fromCharCode(...bytes.slice(at, at + length));
}

describe("wrapPcmAsWav", () => {
  it("writes a 44-byte RIFF header with the sample rate and data length", () => {
    const pcm = sinePcm(0.1, 24_000);
    const wav = wrapPcmAsWav(pcm, 24_000);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(wav.length).toBe(44 + pcm.length * 2);
    expect(ascii(wav, 0, 4)).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(wav.length - 8);
    expect(ascii(wav, 8, 4)).toBe("WAVE");
    expect(ascii(wav, 12, 4)).toBe("fmt ");
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(24_000);
    expect(view.getUint32(28, true)).toBe(48_000); // byte rate
    expect(view.getUint16(34, true)).toBe(16);
    expect(ascii(wav, 36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(pcm.length * 2);
  });
});

describe("parseWav", () => {
  it("reads back the samples and the rate of a wrapped fixture", () => {
    const pcm = sinePcm(0.05, 16_000);
    const parsed = expectOk(parseWav(wrapPcmAsWav(pcm, 16_000)));
    expect(parsed.sampleRate).toBe(16_000);
    expect(Array.from(parsed.pcm)).toEqual(Array.from(pcm));
  });

  it("averages a stereo file to mono", () => {
    const wav = wrapPcmAsWav(new Int16Array([1000, 3000, -200, 400]), 8_000);
    const view = new DataView(wav.buffer);
    view.setUint16(22, 2, true); // channels
    view.setUint32(28, 8_000 * 2 * 2, true);
    view.setUint16(32, 4, true);
    const parsed = expectOk(parseWav(wav));
    expect(Array.from(parsed.pcm)).toEqual([2000, 100]);
  });

  it("accepts a streaming header whose data size is 0xFFFFFFFF", () => {
    const pcm = sinePcm(0.02, 8_000);
    const wav = wrapPcmAsWav(pcm, 8_000);
    new DataView(wav.buffer).setUint32(40, 0xffffffff, true);
    expect(expectOk(parseWav(wav)).pcm.length).toBe(pcm.length);
  });

  it("rejects a non-PCM or truncated file with tts_bad_output", () => {
    const good = wrapPcmAsWav(sinePcm(0.05, 8_000), 8_000);
    expectFail(parseWav(new Uint8Array([1, 2, 3])), "tts_bad_output");
    expectFail(parseWav(new TextEncoder().encode("not a wav file at all, just text, long enough")), "tts_bad_output");
    expectFail(parseWav(good.slice(0, good.length - 100)), "tts_bad_output");
    const float = good.slice();
    new DataView(float.buffer).setUint16(20, 3, true); // IEEE float
    expectFail(parseWav(float), "tts_bad_output");
    const eight = good.slice();
    new DataView(eight.buffer).setUint16(34, 8, true);
    expectFail(parseWav(eight), "tts_bad_output");
  });
});
