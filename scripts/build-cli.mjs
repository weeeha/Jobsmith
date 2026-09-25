import * as esbuild from "esbuild";
import { chmod } from "node:fs/promises";

await esbuild.build({
  entryPoints: ["cli/src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "cli/dist/jobsmith.mjs",
  banner: { js: "#!/usr/bin/env node" },
  tsconfig: "tsconfig.json",
});

// esbuild's own output does not carry the execute bit; the shebang banner
// above is useless for a direct `./cli/dist/jobsmith.mjs` invocation (and
// for cli/package.json's own `bin` entry once installed) without it.
await chmod("cli/dist/jobsmith.mjs", 0o755);

console.log("Built cli/dist/jobsmith.mjs");
