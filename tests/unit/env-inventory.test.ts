import { describe, expect, it } from "vitest";
import {
  APP_VARIABLES,
  BUILD_VARIABLES,
  COMPOSE_VARIABLES,
  EXTRA_SINCE_SPEC,
  NOT_OPERATOR,
} from "../fixtures/env-inventory";
import {
  envExampleNames,
  existingParserModules,
  readRepoFile,
  tableNames,
  undocumentedNames,
} from "../helpers/env-inventory";

const KNOWN = new Set<string>([
  ...APP_VARIABLES,
  ...COMPOSE_VARIABLES,
  ...BUILD_VARIABLES,
  ...EXTRA_SINCE_SPEC,
]);

async function parserNames(): Promise<string[]> {
  const names: string[] = [];
  for (const file of existingParserModules()) {
    const mod = (await import(/* @vite-ignore */ `@/${file.replace(/\.ts$/, "")}`)) as { ENV_NAMES?: readonly string[] };
    expect(mod.ENV_NAMES, `${file} exports ENV_NAMES`).toBeDefined();
    names.push(...(mod.ENV_NAMES ?? []));
  }
  return names;
}

describe("environment inventory", () => {
  it("the fixture holds 60 distinct names in spec 5.11 order", () => {
    expect(APP_VARIABLES.length).toBe(60);
    expect(new Set(APP_VARIABLES).size).toBe(60);
    expect(APP_VARIABLES[0]).toBe("DATABASE_URL");
    expect(APP_VARIABLES[APP_VARIABLES.length - 1]).toBe("TICK_INTERVAL_MINUTES");
  });

  it("every ENV_NAMES entry of an existing parser module is in .env.example", async () => {
    const documented = envExampleNames(readRepoFile(".env.example"));
    const names = await parserNames();
    expect(names.length).toBeGreaterThan(0);
    expect(undocumentedNames(names, documented)).toEqual([]);
  });

  it("every ENV_NAMES entry is in the self-hosting table", async () => {
    const documented = tableNames(readRepoFile("docs/self-hosting.md"));
    expect(undocumentedNames(await parserNames(), documented)).toEqual([]);
  });

  it("every ENV_NAMES entry is one of the 60, the compose names, the build names or EXTRA_SINCE_SPEC", async () => {
    expect(undocumentedNames(await parserNames(), KNOWN)).toEqual([]);
  });

  it("the self-hosting table lists exactly the 60 names plus DEMO_MODE, and a second block lists the compose and build names", () => {
    const doc = readRepoFile("docs/self-hosting.md");
    expect([...tableNames(doc)].sort()).toEqual([...APP_VARIABLES, ...EXTRA_SINCE_SPEC].sort());
    expect([...tableNames(doc, "env-table-extra")].sort()).toEqual(
      [...COMPOSE_VARIABLES, ...BUILD_VARIABLES].sort(),
    );
  });

  it("a planted unknown name is caught", async () => {
    // The same call on the real union returns nothing, so the planted name is
    // the only thing that can make it report.
    expect(undocumentedNames(await parserNames(), KNOWN)).toEqual([]);
    expect(undocumentedNames(["PLANTED_UNKNOWN_NAME"], new Set(APP_VARIABLES))).toEqual([
      "PLANTED_UNKNOWN_NAME",
    ]);
  });

  it("a name read through process.env or source. in a parser file but missing from its ENV_NAMES is caught", async () => {
    const skip = new Set<string>(NOT_OPERATOR);
    for (const file of ["lib/env.ts", "lib/ai/config.ts", "lib/auth/policy.ts"]) {
      const mod = (await import(/* @vite-ignore */ `@/${file.replace(/\.ts$/, "")}`)) as { ENV_NAMES: readonly string[] };
      const read = new Set<string>();
      for (const match of readRepoFile(file).matchAll(/(?:process\.env|source)\.([A-Z][A-Z0-9_]{2,})/g)) {
        if (!skip.has(match[1])) read.add(match[1]);
      }
      expect(read.size, `${file} scan finds names`).toBeGreaterThan(0);
      expect(undocumentedNames([...read], new Set(mod.ENV_NAMES)), file).toEqual([]);
    }
    // Planted positive: a name read but absent from the list is reported.
    const planted = [..."source.PLANTED_READ_NAME".matchAll(/source\.([A-Z][A-Z0-9_]{2,})/g)].map((m) => m[1]);
    expect(undocumentedNames(planted, new Set(["DATABASE_URL"]))).toEqual(["PLANTED_READ_NAME"]);
  });
});
