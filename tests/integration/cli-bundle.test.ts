import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as esbuild from "esbuild";

const execFileAsync = promisify(execFile);

describe("CLI bundle", () => {
  it(
    "builds one ESM file with the real build options, importing nothing from node_modules, and runs under plain Node",
    async () => {
      const outDir = await mkdtemp(path.join(os.tmpdir(), "jobsmith-bundle-test-"));
      const outfile = path.join(outDir, "jobsmith.mjs");
      const repoRoot = path.resolve(import.meta.dirname, "../..");

      const result = await esbuild.build({
        entryPoints: [path.join(repoRoot, "cli/src/index.ts")],
        bundle: true,
        platform: "node",
        target: "node20",
        format: "esm",
        outfile,
        banner: { js: "#!/usr/bin/env node" },
        tsconfig: path.join(repoRoot, "tsconfig.json"),
        metafile: true,
      });

      // No runtime dependencies means every input the bundle
      // actually pulled in is either the CLI's own source or the one leaf
      // module it is allowed to import; nothing from node_modules.
      for (const input of Object.keys(result.metafile!.inputs)) {
        expect(input.includes("node_modules"), input).toBe(false);
      }

      const { stdout } = await execFileAsync(process.execPath, [outfile, "--version"]);
      expect(stdout.trim()).toBe("0.1.0");
    },
    30_000,
  );
});
