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
    "builds one ESM file with the real build options, importing only the MP3 encoder from node_modules, and runs under plain Node",
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

      // Every input the bundle pulled in is the repo's own source or the MP3
      // encoder: it is inlined, so installing the CLI still needs no packages.
      const vendored = Object.keys(result.metafile!.inputs).filter((input) => input.includes("node_modules"));
      expect(vendored.length).toBeGreaterThan(0);
      for (const input of vendored) {
        expect(input, input).toMatch(/node_modules\/@breezystack\/lamejs\//);
      }

      const { stdout } = await execFileAsync(process.execPath, [outfile, "--version"]);
      expect(stdout.trim()).toBe("0.1.0");
    },
    30_000,
  );
});
