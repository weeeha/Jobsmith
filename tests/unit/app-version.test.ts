import { describe, expect, it } from "vitest";
import pkg from "../../package.json";
import { APP_VERSION } from "@/lib/app-version";

describe("APP_VERSION", () => {
  it("equals package.json's version", () => {
    expect(APP_VERSION).toBe(pkg.version);
  });
});
