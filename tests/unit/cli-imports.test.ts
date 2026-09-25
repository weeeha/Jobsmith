import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

async function listTsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listTsFiles(full)));
    } else if (entry.name.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

describe("cli/src import rule", () => {
  it("imports only node: builtins, relative files, or @/lib/bridge/wire", async () => {
    const root = path.resolve(import.meta.dirname, "../../cli/src");
    const files = await listTsFiles(root);
    // A folder that exists but is somehow empty would make every assertion
    // below vacuously pass; failing loudly here means a future refactor
    // that empties or renames cli/src cannot silently defeat this test.
    expect(files.length).toBeGreaterThan(0);

    const importLine = /import\s+(?:type\s+)?[\s\S]*?\sfrom\s+["']([^"']+)["']/g;
    const offenders: string[] = [];
    for (const file of files) {
      const text = await readFile(file, "utf8");
      for (const match of text.matchAll(importLine)) {
        const spec = match[1]!;
        const allowed = spec.startsWith("node:") || spec.startsWith(".") || spec === "@/lib/bridge/wire";
        if (!allowed) {
          offenders.push(`${path.relative(root, file)}: "${spec}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
