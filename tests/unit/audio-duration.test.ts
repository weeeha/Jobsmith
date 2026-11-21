import { describe, expect, it } from "vitest";
import { encodeMp3 } from "@/lib/audio/encode";
import { mp3DurationMs, pcmDurationMs, wavDurationMs } from "@/lib/audio/duration";
import { wrapPcmAsWav } from "@/lib/audio/wav";
import { sinePcm } from "../helpers/audio";

describe("mp3DurationMs", () => {
  it("skips an ID3v2 header and returns null when no frame is found", () => {
    const mp3 = encodeMp3(sinePcm(0.5, 24_000), 24_000);
    const plain = mp3DurationMs(mp3) as number;
    const tagBody = 40;
    const tagged = new Uint8Array(10 + tagBody + mp3.length);
    tagged.set([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, tagBody], 0); // "ID3", v2.4, syncsafe size 40
    tagged.set(mp3, 10 + tagBody);
    expect(mp3DurationMs(tagged)).toBe(plain);

    expect(mp3DurationMs(new Uint8Array(0))).toBeNull();
    expect(mp3DurationMs(new Uint8Array(2000).fill(7))).toBeNull();
    expect(mp3DurationMs(tagged.slice(0, 10 + tagBody))).toBeNull();
  });

  it("returns null for a file that is only an ID3 tag with nothing after it", () => {
    const only = new Uint8Array(10);
    only.set([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0]);
    expect(mp3DurationMs(only)).toBeNull();
  });
});

describe("wavDurationMs and pcmDurationMs", () => {
  it("agree on the fixture: 24000 samples at 24 kHz is 1000 ms", () => {
    const pcm = sinePcm(1, 24_000);
    expect(pcm.length).toBe(24_000);
    expect(wavDurationMs(wrapPcmAsWav(pcm, 24_000))).toBe(1000);
    expect(pcmDurationMs(pcm.length * 2, 24_000)).toBe(1000);
  });

  it("wavDurationMs is null for a file that is not a WAV", () => {
    expect(wavDurationMs(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});
