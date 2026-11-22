import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("scripts/migrate.ts", () => {
  it("a failed migration exits 1 and prints a [migrate] line", () => {
    const run = spawnSync("pnpm", ["exec", "tsx", "scripts/migrate.ts"], {
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: "postgres://u:p@127.0.0.1:1/none",
        DATABASE_URL_UNPOOLED: undefined,
      },
    });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("[migrate]");
  }, 60_000);
});
