import { describe, expect, it } from "vitest";
import { resolveMigrationsFolder } from "../../scripts/migrations-folder";
import { entryPoints } from "../../scripts/build-scripts.mjs";

describe("build-scripts", () => {
  it("lists the entry points that exist and skips the ones that do not", () => {
    const have = new Set(["./scripts/migrate.ts", "./scripts/seed.ts"].map((p) => p.replace("./", "")));
    const names = entryPoints((p) => have.has(String(p))).map((e) => e.name);
    expect(names).toEqual(["migrate", "seed"]);
  });

  it("never lists the scheduler commands", () => {
    const names = entryPoints(() => true).map((e) => e.name);
    expect(names).not.toContain("tick");
    expect(names).not.toContain("scheduler");
    expect(names).not.toContain("feed-scan");
  });

  it("migrate resolves migrations beside the bundle when present, else ../lib/db/migrations", () => {
    expect(resolveMigrationsFolder("/app/commands", () => true)).toBe("/app/commands/migrations");
    expect(resolveMigrationsFolder("/app/commands", () => false)).toBe("/app/lib/db/migrations");
  });
});
