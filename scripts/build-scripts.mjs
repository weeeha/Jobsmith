import * as esbuild from "esbuild";
import { existsSync } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Commands in build order. A command is bundled only when its source exists,
// so a milestone that has not merged yet (packs, feed, hosted tick) is skipped
// without an edit here. tick, scheduler and feed-scan are added with the
// milestones that own them.
export const COMMANDS = {
  migrate: "scripts/migrate.ts",
  seed: "scripts/seed.ts",
  "packs-check": "scripts/packs-check.ts",
  "import-applications": "scripts/import-applications.ts",
  "serve-check": "scripts/serve-check.ts",
};

/** Pure: which commands to build, given a way to test for a file. */
export function entryPoints(exists = existsSync, root = ".") {
  return Object.entries(COMMANDS)
    .filter(([, source]) => exists(path.join(root, source)))
    .map(([name, source]) => ({ name, source }));
}

export async function buildScripts(root = ".") {
  const entries = entryPoints(existsSync, root);
  const outdir = path.join(root, "commands");
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  await esbuild.build({
    absWorkingDir: path.resolve(root),
    entryPoints: Object.fromEntries(entries.map((e) => [e.name, e.source])),
    outdir: "commands",
    outExtension: { ".js": ".mjs" },
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    tsconfig: "tsconfig.json",
    logLevel: "warning",
    // Bundled CommonJS dependencies call require(); give them one.
    banner: { js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);' },
  });
  // migrate.ts looks for migrations beside the bundle first.
  await cp(path.join(root, "lib/db/migrations"), path.join(outdir, "migrations"), { recursive: true });
  return entries.map((e) => e.name);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const built = await buildScripts();
  console.log(`Built commands/: ${built.join(", ")}`);
}
