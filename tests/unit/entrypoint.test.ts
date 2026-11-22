import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const SCRIPT = path.resolve(__dirname, "../../docker-entrypoint.sh");
const ALL_BUNDLES = ["serve-check", "migrate", "seed", "scheduler", "tick", "feed-scan", "packs-check", "import-applications"];

let work: string;
let log: string;

// A stub `node` that appends its arguments to a log; it fails when the first
// argument is listed in FAIL_ON.
function stubNode(): string {
  const bin = path.join(work, "bin");
  mkdirSync(bin, { recursive: true });
  const file = path.join(bin, "node");
  writeFileSync(
    file,
    `#!/bin/sh\necho "$*" >> "${log}"\ncase " $FAIL_ON " in *" $1 "*) exit 1;; esac\nexit 0\n`,
  );
  chmodSync(file, 0o755);
  return bin;
}

function bundles(names: string[]) {
  mkdirSync(path.join(work, "commands"), { recursive: true });
  for (const name of names) writeFileSync(path.join(work, "commands", `${name}.mjs`), "");
}

function run(args: string[], env: Record<string, string> = {}) {
  const bin = stubNode();
  const result = spawnSync("sh", [SCRIPT, ...args], {
    cwd: work,
    env: { PATH: `${bin}:/usr/bin:/bin`, ...env } as unknown as NodeJS.ProcessEnv,
    encoding: "utf8",
  });
  const calls = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean) : [];
  return { ...result, calls };
}

beforeEach(() => {
  work = mkdtempSync(path.join(os.tmpdir(), "entrypoint-"));
  log = path.join(work, "calls.log");
  bundles(ALL_BUNDLES);
});
afterEach(() => rmSync(work, { recursive: true, force: true }));

describe("docker-entrypoint.sh", () => {
  it("no arguments runs serve-check, then migrate, then server.js, in that order", () => {
    const r = run([]);
    expect(r.status).toBe(0);
    expect(r.calls).toEqual(["commands/serve-check.mjs", "commands/migrate.mjs", "server.js"]);
  });

  it("MIGRATE_ON_START=false skips migrate", () => {
    const r = run(["serve"], { MIGRATE_ON_START: "false" });
    expect(r.status).toBe(0);
    expect(r.calls).toEqual(["commands/serve-check.mjs", "server.js"]);
  });

  it("a failing serve-check stops before migrate and server.js, and the script exits 1", () => {
    const r = run([], { FAIL_ON: "commands/serve-check.mjs" });
    expect(r.status).toBe(1);
    expect(r.calls).toEqual(["commands/serve-check.mjs"]);
  });

  it("seed passes its arguments: seed --pack data runs commands/seed.mjs --pack data", () => {
    const r = run(["seed", "--pack", "data"]);
    expect(r.status).toBe(0);
    expect(r.calls).toEqual(["commands/seed.mjs --pack data"]);
  });

  it("packs-check, tick, scheduler, feed-scan and import-applications dispatch to their bundles with their arguments", () => {
    const cases: Array<[string[], string]> = [
      [["packs-check", "a.json"], "commands/packs-check.mjs a.json"],
      [["tick"], "commands/tick.mjs"],
      [["scheduler"], "commands/scheduler.mjs"],
      [["feed-scan"], "commands/feed-scan.mjs"],
      [["import-applications", "x.md", "--email", "a@b.c", "--dry-run"], "commands/import-applications.mjs x.md --email a@b.c --dry-run"],
      [["migrate"], "commands/migrate.mjs"],
    ];
    for (const [args, expected] of cases) {
      rmSync(log, { force: true });
      const r = run(args);
      expect(r.status).toBe(0);
      expect(r.calls).toEqual([expected]);
    }
  });

  it("an unknown command prints the command list and exits 64", () => {
    const r = run(["bogus"]);
    expect(r.status).toBe(64);
    expect(r.stderr).toContain("Unknown command: bogus");
    for (const name of ["serve", "migrate", "seed", "scheduler", "tick", "feed-scan", "packs-check", "import-applications"]) {
      expect(r.stderr).toContain(name);
    }
    expect(r.calls).toEqual([]);
  });

  it("a command whose bundle file is absent prints '<name> is not available in this build' and exits 64", () => {
    rmSync(path.join(work, "commands", "feed-scan.mjs"));
    const r = run(["feed-scan"]);
    expect(r.status).toBe(64);
    expect(r.stderr).toContain("feed-scan is not available in this build");
    expect(r.calls).toEqual([]);
  });
});
