import { expect } from "vitest";
import type { Result } from "@/lib/result";

export function expectOk<T>(result: Result<T, string>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`expected ok, got failure: ${result.code}: ${result.message}`);
  }
  return result.data;
}

export function expectFail<C extends string>(result: Result<unknown, C>, code: C): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.code).toBe(code);
  }
}
