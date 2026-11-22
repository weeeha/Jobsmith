import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repo = resolve(__dirname, "../..");

// A fake `docker` that logs its arguments one call per line, writes a byte to
// the file its command would write, and fails when FAIL names the step.
const STUB = `#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
args=" $* "
case "$args" in
  *" pg_dump "*)
    [ "\${FAIL:-}" = dump ] && exit 3
    printf 'D'; exit 0;;
  *" pg_restore --list"*)
    cat > /dev/null
    [ "\${FAIL:-}" = list ] && exit 1
    exit 0;;
  *" pg_restore "*)
    cat > /dev/null; exit 0;;
  *" czf "*)
    [ "\${FAIL:-}" = tar ] && exit 4
    host=""; name=""; prev=""
    for a in "$@"; do
      [ "$prev" = "-v" ] && case "$a" in *:/backup) host="\${a%:/backup}";; esac
      [ "$prev" = czf ] && name="\${a#/backup/}"
      prev="$a"
    done
    printf 'T' > "$host/$name"; exit 0;;
esac
exit 0
`;

let work: string;
let bin: string;
let log: string;
let deploy: string;

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "js-backup-"));
  bin = join(work, "bin");
  deploy = join(work, "deploy");
  log = join(work, "docker.log");
  mkdirSync(bin);
  mkdirSync(deploy);
  writeFileSync(join(bin, "docker"), STUB);
  chmodSync(join(bin, "docker"), 0o755);
  writeFileSync(log, "");
  for (const s of ["backup.sh", "restore.sh"]) {
    writeFileSync(join(deploy, s), readFileSync(join(repo, "deploy", s)));
    chmodSync(join(deploy, s), 0o755);
  }
});

afterEach(() => rmSync(work, { recursive: true, force: true }));

function run(script: string, args: string[] = [], env: Record<string, string> = {}) {
  return spawnSync("bash", [join(deploy, script), ...args], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, STUB_LOG: log, ...env },
    encoding: "utf8",
  });
}
const calls = () => readFileSync(log, "utf8").split("\n").filter(Boolean);
const backups = () => (existsSync(join(deploy, "backups")) ? readdirSync(join(deploy, "backups")).sort() : []);

function seedOld(name: string, daysAgo: number) {
  mkdirSync(join(deploy, "backups"), { recursive: true });
  const p = join(deploy, "backups", name);
  writeFileSync(p, "old");
  const t = new Date(Date.now() - daysAgo * 86400_000);
  utimesSync(p, t, t);
}

describe("backup.sh", () => {
  it("runs pg_dump -Fc through docker compose exec -T postgres, then tars the storage volume through a throwaway run of the app image", () => {
    const r = run("backup.sh");
    expect(r.status).toBe(0);
    const c = calls();
    expect(c[0]).toBe("compose exec -T postgres pg_dump -U jobsmith -Fc jobsmith");
    expect(c[1]).toMatch(/^compose run --rm --no-deps --entrypoint tar -v .+\/backups:\/backup app czf \/backup\/storage-\d{8}T\d{6}Z\.tar\.gz -C \/data \.$/);
  });

  it("writes both files with mode 600 under UTC timestamps", () => {
    expect(run("backup.sh").status).toBe(0);
    const names = backups();
    expect(names).toHaveLength(2);
    expect(names[0]).toMatch(/^db-\d{8}T\d{6}Z\.dump$/);
    expect(names[1]).toMatch(/^storage-\d{8}T\d{6}Z\.tar\.gz$/);
    for (const n of names) expect(statSync(join(deploy, "backups", n)).mode & 0o777).toBe(0o600);
  });

  it("deletes files older than KEEP_DAYS only after both succeed", () => {
    seedOld("db-20200101T000000Z.dump", 15);
    seedOld("storage-20200101T000000Z.tar.gz", 15);
    seedOld("db-20200102T000000Z.dump", 13);
    expect(run("backup.sh").status).toBe(0);
    const names = backups();
    expect(names).not.toContain("db-20200101T000000Z.dump");
    expect(names).not.toContain("storage-20200101T000000Z.tar.gz");
    expect(names).toContain("db-20200102T000000Z.dump");
    expect(names).toHaveLength(3);
  });

  it("honours KEEP_DAYS from the environment", () => {
    seedOld("db-20200101T000000Z.dump", 3);
    expect(run("backup.sh", [], { KEEP_DAYS: "2" }).status).toBe(0);
    expect(backups()).not.toContain("db-20200101T000000Z.dump");
  });

  it("a failing pg_dump exits non-zero, leaves no new files and keeps every older backup", () => {
    seedOld("db-20200101T000000Z.dump", 30);
    seedOld("storage-20200101T000000Z.tar.gz", 30);
    const r = run("backup.sh", [], { FAIL: "dump" });
    expect(r.status).not.toBe(0);
    expect(backups()).toEqual(["db-20200101T000000Z.dump", "storage-20200101T000000Z.tar.gz"]);
    expect(calls().some((l) => l.includes("czf"))).toBe(false);
  });

  it("a failing tar removes the new dump too and keeps every older backup", () => {
    seedOld("db-20200101T000000Z.dump", 30);
    seedOld("storage-20200101T000000Z.tar.gz", 30);
    const r = run("backup.sh", [], { FAIL: "tar" });
    expect(r.status).not.toBe(0);
    expect(backups()).toEqual(["db-20200101T000000Z.dump", "storage-20200101T000000Z.tar.gz"]);
  });

  it("the dump comes before the files", () => {
    run("backup.sh");
    const c = calls();
    const dump = c.findIndex((l) => l.includes("pg_dump"));
    const tar = c.findIndex((l) => l.includes("czf"));
    expect(dump).toBeGreaterThanOrEqual(0);
    expect(dump).toBeLessThan(tar);
  });
});

describe("restore.sh", () => {
  function files() {
    const dump = join(work, "db.dump");
    const tar = join(work, "storage.tar.gz");
    writeFileSync(dump, "D");
    writeFileSync(tar, "T");
    return [dump, tar];
  }

  it("refuses a dump that fails pg_restore --list before stopping anything", () => {
    const r = run("restore.sh", files(), { FAIL: "list" });
    expect(r.status).toBe(1);
    const c = calls();
    expect(c.some((l) => l.includes("pg_restore --list"))).toBe(true);
    expect(c.some((l) => l.includes(" stop"))).toBe(false);
  });

  it("stops app, runs pg_restore --clean --if-exists --no-owner, replaces the volume contents, starts it and waits for health", () => {
    const [dump, tar] = files();
    const r = run("restore.sh", [dump, tar]);
    expect(r.status).toBe(0);
    const c = calls();
    const idx = (s: string) => c.findIndex((l) => l.includes(s));
    expect(c[idx("pg_restore --list")]).toBeDefined();
    expect(c[idx(" stop")]).toBe("compose stop app");
    expect(idx("pg_restore --list")).toBeLessThan(idx(" stop"));
    expect(idx(" stop")).toBeLessThan(idx("--clean --if-exists --no-owner"));
    expect(c[idx("--clean --if-exists --no-owner")]).toBe(
      "compose exec -T postgres pg_restore -U jobsmith -d jobsmith --clean --if-exists --no-owner",
    );
    expect(idx("--clean")).toBeLessThan(idx("find /data"));
    const vol = c[idx("find /data")];
    expect(vol).toContain(`-v ${tar}:/restore/storage.tgz:ro`);
    expect(vol).toContain("find /data -mindepth 1 -delete && tar xzf /restore/storage.tgz -C /data");
    expect(c[c.length - 1]).toBe("compose up -d --wait app");
    expect(c.join("\n")).not.toContain("scheduler");
  });

  it("restore with a missing argument prints usage and exits 64", () => {
    const r = run("restore.sh", ["only-one"]);
    expect(r.status).toBe(64);
    expect(r.stderr).toContain("usage:");
    expect(calls()).toEqual([]);
  });
});

describe("script files", () => {
  it("are executable", () => {
    for (const s of ["backup.sh", "restore.sh"]) expect(statSync(join(repo, "deploy", s)).mode & 0o111).not.toBe(0);
  });
  it("pass bash -n", () => {
    for (const s of ["backup.sh", "restore.sh"]) execFileSync("bash", ["-n", join(repo, "deploy", s)]);
  });
});
