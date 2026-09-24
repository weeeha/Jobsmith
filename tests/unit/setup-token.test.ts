import { describe, expect, it } from "vitest";
import { checkSetupToken } from "@/lib/auth/setup-token";

const TOKEN = "correct-horse-battery-staple";

describe("checkSetupToken", () => {
  it("returns ok when the provided token matches the configured one", () => {
    expect(
      checkSetupToken({ configured: TOKEN, provided: TOKEN, production: false }),
    ).toBe("ok");
  });

  it("returns ok when configured and matching, in production too", () => {
    expect(
      checkSetupToken({ configured: TOKEN, provided: TOKEN, production: true }),
    ).toBe("ok");
  });

  it("returns mismatch when the provided token is wrong but the same length", () => {
    const wrong = "x".repeat(TOKEN.length);
    expect(
      checkSetupToken({ configured: TOKEN, provided: wrong, production: false }),
    ).toBe("mismatch");
  });

  it("returns mismatch when the provided token has a different length", () => {
    expect(
      checkSetupToken({ configured: TOKEN, provided: "short", production: false }),
    ).toBe("mismatch");
    expect(
      checkSetupToken({
        configured: TOKEN,
        provided: TOKEN + "-and-then-some-more",
        production: false,
      }),
    ).toBe("mismatch");
  });

  it("returns mismatch when configured but nothing was provided", () => {
    expect(
      checkSetupToken({ configured: TOKEN, provided: undefined, production: false }),
    ).toBe("mismatch");
  });

  it("returns missing-config when nothing is configured and this is production", () => {
    expect(
      checkSetupToken({ configured: undefined, provided: undefined, production: true }),
    ).toBe("missing-config");
    // A stray provided value with nothing configured is still missing-config,
    // not ok: there is nothing correct to match against.
    expect(
      checkSetupToken({ configured: undefined, provided: TOKEN, production: true }),
    ).toBe("missing-config");
  });

  it("returns not-required when nothing is configured outside production", () => {
    expect(
      checkSetupToken({ configured: undefined, provided: undefined, production: false }),
    ).toBe("not-required");
    expect(
      checkSetupToken({ configured: undefined, provided: TOKEN, production: false }),
    ).toBe("not-required");
  });
});
