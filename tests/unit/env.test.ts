import { describe, expect, it } from "vitest";
import { parseEnv, EnvError } from "@/lib/env";

const validSource = {
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/jobsmith",
  BETTER_AUTH_SECRET: "x".repeat(32),
  APP_URL: "http://localhost:3000",
};

const withoutAppUrl = {
  DATABASE_URL: validSource.DATABASE_URL,
  BETTER_AUTH_SECRET: validSource.BETTER_AUTH_SECRET,
};

describe("parseEnv", () => {
  it("returns a validated Env for valid input", () => {
    const env = parseEnv(validSource);
    expect(env.DATABASE_URL).toBe(validSource.DATABASE_URL);
    expect(env.BETTER_AUTH_SECRET).toBe(validSource.BETTER_AUTH_SECRET);
    expect(env.APP_URL).toBe(validSource.APP_URL);
    expect(env.ALLOW_SIGNUP).toBe(false);
  });

  it("parses ALLOW_SIGNUP=true", () => {
    const env = parseEnv({ ...validSource, ALLOW_SIGNUP: "true" });
    expect(env.ALLOW_SIGNUP).toBe(true);
  });

  it("rejects a BETTER_AUTH_SECRET shorter than 32 characters", () => {
    expect(() =>
      parseEnv({ ...validSource, BETTER_AUTH_SECRET: "too-short" }),
    ).toThrow(EnvError);
  });

  it("throws an EnvError listing every missing variable by name", () => {
    expect.assertions(2);
    try {
      parseEnv({});
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError);
      const message = (error as EnvError).message;
      expect(message).toBe(
        "Invalid environment variables: DATABASE_URL, BETTER_AUTH_SECRET, APP_URL",
      );
    }
  });
});

describe("parseEnv: SETUP_TOKEN", () => {
  it("is undefined when not set", () => {
    const env = parseEnv(validSource);
    expect(env.SETUP_TOKEN).toBeUndefined();
  });

  it("accepts a token of at least 16 characters", () => {
    const env = parseEnv({ ...validSource, SETUP_TOKEN: "x".repeat(16) });
    expect(env.SETUP_TOKEN).toBe("x".repeat(16));
  });

  it("rejects a token shorter than 16 characters, naming it in the error", () => {
    expect.assertions(2);
    try {
      parseEnv({ ...validSource, SETUP_TOKEN: "short" });
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError);
      expect((error as EnvError).message).toBe("Invalid environment variables: SETUP_TOKEN");
    }
  });
});

describe("parseEnv: APP_URL falls back to Vercel system variables", () => {
  it("uses APP_URL when set, ignoring any Vercel variables", () => {
    const env = parseEnv({ ...validSource, VERCEL_URL: "some-preview.vercel.app" });
    expect(env.APP_URL).toBe(validSource.APP_URL);
  });

  it("falls back to VERCEL_PROJECT_PRODUCTION_URL when VERCEL_ENV is production", () => {
    const env = parseEnv({
      ...withoutAppUrl,
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "jobsmith.vercel.app",
    });
    expect(env.APP_URL).toBe("https://jobsmith.vercel.app");
  });

  it("does not use VERCEL_PROJECT_PRODUCTION_URL when VERCEL_ENV is not production", () => {
    const env = parseEnv({
      ...withoutAppUrl,
      VERCEL_ENV: "preview",
      VERCEL_PROJECT_PRODUCTION_URL: "jobsmith.vercel.app",
      VERCEL_BRANCH_URL: "jobsmith-git-feat-branch.vercel.app",
    });
    expect(env.APP_URL).toBe("https://jobsmith-git-feat-branch.vercel.app");
  });

  it("falls back to VERCEL_BRANCH_URL when a production URL is unavailable", () => {
    const env = parseEnv({
      ...withoutAppUrl,
      VERCEL_BRANCH_URL: "jobsmith-git-feat-branch.vercel.app",
      VERCEL_URL: "jobsmith-abc123.vercel.app",
    });
    expect(env.APP_URL).toBe("https://jobsmith-git-feat-branch.vercel.app");
  });

  it("falls back to VERCEL_URL when neither a production nor a branch URL is available", () => {
    const env = parseEnv({ ...withoutAppUrl, VERCEL_URL: "jobsmith-abc123.vercel.app" });
    expect(env.APP_URL).toBe("https://jobsmith-abc123.vercel.app");
  });

  it("reports APP_URL as missing when none of the sources are available", () => {
    expect.assertions(1);
    try {
      parseEnv(withoutAppUrl);
    } catch (error) {
      expect((error as EnvError).message).toBe("Invalid environment variables: APP_URL");
    }
  });

  it("reports APP_URL as missing when VERCEL_ENV is production but no production URL is set", () => {
    expect.assertions(1);
    try {
      parseEnv({ ...withoutAppUrl, VERCEL_ENV: "production" });
    } catch (error) {
      expect((error as EnvError).message).toBe("Invalid environment variables: APP_URL");
    }
  });
});

describe("parseEnv: TRUSTED_ORIGINS", () => {
  it("contains only APP_URL when no Vercel variables are set", () => {
    const env = parseEnv(validSource);
    expect(env.TRUSTED_ORIGINS).toEqual([validSource.APP_URL]);
  });

  it("includes APP_URL plus every present Vercel-derived origin, deduplicated", () => {
    const env = parseEnv({
      ...validSource,
      APP_URL: "https://custom-domain.example.com",
      VERCEL_URL: "jobsmith-abc123.vercel.app",
      VERCEL_BRANCH_URL: "jobsmith-git-feat-branch.vercel.app",
      VERCEL_PROJECT_PRODUCTION_URL: "jobsmith.vercel.app",
    });
    expect(env.TRUSTED_ORIGINS).toEqual([
      "https://custom-domain.example.com",
      "https://jobsmith-abc123.vercel.app",
      "https://jobsmith-git-feat-branch.vercel.app",
      "https://jobsmith.vercel.app",
    ]);
  });

  it("de-duplicates when APP_URL was itself derived from a Vercel variable", () => {
    const env = parseEnv({ ...withoutAppUrl, VERCEL_URL: "jobsmith-abc123.vercel.app" });
    expect(env.TRUSTED_ORIGINS).toEqual(["https://jobsmith-abc123.vercel.app"]);
  });
});

import { env } from "@/lib/env";

describe("env", () => {
  it("memoizes its result across calls", () => {
    process.env.DATABASE_URL = validSource.DATABASE_URL;
    process.env.BETTER_AUTH_SECRET = validSource.BETTER_AUTH_SECRET;
    process.env.APP_URL = validSource.APP_URL;
    expect(env()).toBe(env());
  });
});

describe("parseEnv: AI", () => {
  it("is null when AI_PROVIDER is unset", () => {
    const env = parseEnv(validSource);
    expect(env.AI).toBeNull();
  });

  it("parses AI_PROVIDER=fake into the fake config", () => {
    const env = parseEnv({ ...validSource, AI_PROVIDER: "fake" });
    expect(env.AI).toEqual({ provider: "fake", model: "fake-extractor" });
  });

  it("adds an invalid AI variable name to the same EnvError list as missing core variables", () => {
    expect.assertions(1);
    try {
      parseEnv({ AI_PROVIDER: "openai" });
    } catch (error) {
      expect((error as EnvError).message).toBe(
        "Invalid environment variables: DATABASE_URL, BETTER_AUTH_SECRET, APP_URL, AI_PROVIDER",
      );
    }
  });
});
