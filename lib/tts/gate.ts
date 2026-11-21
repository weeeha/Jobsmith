// The duration gate of spec 5.5: a clip that is far too fast, too slow, too
// short or too long was probably cut off or padded by the provider.
export const IDEAL_CPS = 13;
export const GATE_CPS_MIN = 5;
export const GATE_CPS_MAX = 18;
export const GATE_SHORT_MIN_MS = 500;
export const GATE_SHORT_MAX_MS = 30_000;
export const GATE_LONG_TEXT_CHARS = 120;

// A null duration means it could not be read: the gate is skipped.
export function passesGate(textChars: number, durationMs: number | null): boolean {
  if (durationMs === null) return true;
  if (textChars >= GATE_LONG_TEXT_CHARS) {
    if (durationMs <= 0) return false;
    const cps = textChars / (durationMs / 1000);
    return cps >= GATE_CPS_MIN && cps <= GATE_CPS_MAX;
  }
  return durationMs >= GATE_SHORT_MIN_MS && durationMs <= GATE_SHORT_MAX_MS;
}
