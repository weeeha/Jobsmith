import { describe, expect, it } from "vitest";
import { GATE_CPS_MAX, GATE_CPS_MIN, IDEAL_CPS, passesGate } from "@/lib/tts/gate";
import { STRICT_INSTRUCTION, TTS_STYLE_ID } from "@/lib/tts/driver";

describe("passesGate", () => {
  it("text of 120 characters or more passes between 5 and 18 characters per second", () => {
    expect(passesGate(120, 24_000)).toBe(true); // 5.0 cps
    expect(passesGate(120, 24_100)).toBe(false);
    expect(passesGate(120, 6_667)).toBe(true); // just under 18.0 cps
    expect(passesGate(120, 6_600)).toBe(false);
    expect(passesGate(400, 400_000 / 13)).toBe(true);
  });

  it("shorter text passes between 0.5 and 30 seconds", () => {
    expect(passesGate(10, 500)).toBe(true);
    expect(passesGate(10, 499)).toBe(false);
    expect(passesGate(10, 30_000)).toBe(true);
    expect(passesGate(10, 30_001)).toBe(false);
    expect(passesGate(119, 500)).toBe(true);
  });

  it("a null duration skips the gate and passes", () => {
    expect(passesGate(10, null)).toBe(true);
    expect(passesGate(500, null)).toBe(true);
  });

  it("a zero duration for long text fails instead of dividing by zero", () => {
    expect(passesGate(200, 0)).toBe(false);
  });

  it("IDEAL_CPS is 13 and the strict instruction is 'Read every sentence to the end'", () => {
    expect(IDEAL_CPS).toBe(13);
    expect(GATE_CPS_MIN).toBe(5);
    expect(GATE_CPS_MAX).toBe(18);
    expect(STRICT_INSTRUCTION).toBe("Read every sentence to the end");
    expect(TTS_STYLE_ID).toBe("v1");
  });
});
