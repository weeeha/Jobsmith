import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// The MCP layer reads through Scoped helpers and writes only through the shared
// push path (applyPush, createRequest, ...). It never touches the schema or the
// database client, and never calls a scoped insert, update or delete itself.
const IMPORT_RULES: [RegExp, string][] = [
  [/from\s+["'](?:@\/|(?:\.\.?\/)+)lib\/db\/schema["']|from\s+["'](?:@\/|(?:\.\.?\/)+)db\/schema["']/, "imports the schema"],
  [/from\s+["']drizzle-orm(?:\/[^"']*)?["']/, "imports drizzle-orm"],
  [/from\s+["'](?:@\/|(?:\.\.?\/)+)lib\/db\/client["']|from\s+["'](?:@\/|(?:\.\.?\/)+)db\/client["']/, "imports the db client"],
];
const SCOPED_WRITE = /\b(?:ctx\.s|ctx\.tx|s|tx)\.[A-Za-z]+\.(?:insert|update|delete|upsert)[A-Za-z]*\s*\(/;

export function findViolations(source: string): string[] {
  const out: string[] = [];
  source.split("\n").forEach((line, i) => {
    for (const [re, what] of IMPORT_RULES) if (re.test(line)) out.push(`line ${i + 1}: ${what}`);
    if (SCOPED_WRITE.test(line)) out.push(`line ${i + 1}: scoped write`);
  });
  return out;
}

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? tsFiles(p) : p.endsWith(".ts") ? [p] : [];
  });
}

describe("mcp static no-write rule", () => {
  it("flags an import of @/lib/db/schema, of drizzle-orm and of @/lib/db/client", () => {
    expect(findViolations(`import { artifact } from "@/lib/db/schema";`)).toHaveLength(1);
    expect(findViolations(`import { eq } from "drizzle-orm";`)).toHaveLength(1);
    expect(findViolations(`import { getDb } from "@/lib/db/client";`)).toHaveLength(1);
  });

  it("flags s.artifact.insert(, tx.stage.update( and ctx.s.event.delete( as scoped writes", () => {
    expect(findViolations("await s.artifact.insert({});")).toHaveLength(1);
    expect(findViolations("await tx.stage.update(id, {});")).toHaveLength(1);
    expect(findViolations("await ctx.s.event.delete(id);")).toHaveLength(1);
  });

  it("passes a file that only reads through s.opportunity.listSummaries(", () => {
    expect(findViolations(`import type { Scoped } from "@/lib/db/scoped";\nconst rows = await s.opportunity.listSummaries(now);`)).toEqual([]);
  });

  it("no file under lib/mcp has a violation", () => {
    const files = tsFiles(path.join(process.cwd(), "lib/mcp"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect({ f, v: findViolations(readFileSync(f, "utf8")) }).toEqual({ f, v: [] });
  });
});
