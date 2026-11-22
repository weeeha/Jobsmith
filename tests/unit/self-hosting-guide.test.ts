import { describe, expect, it } from "vitest";
import { readRepoFile, tableNames } from "../helpers/env-inventory";

const guide = readRepoFile("docs/self-hosting.md");
// HTML comments (the table markers) carry "<!" and are not prose.
const prose = guide.replace(/<!--[\s\S]*?-->/g, "");

describe("self-hosting guide", () => {
  it("contains the crontab line verbatim", () => {
    expect(guide).toContain("15 3 * * * cd /opt/jobsmith && ./backup.sh >> backups/backup.log 2>&1");
  });

  it("contains each docker compose command that exists on this branch", () => {
    for (const command of [
      "docker compose --profile proxy up -d",
      "docker compose run --rm app seed",
      "docker compose restart app",
      "docker compose pull && docker compose up -d",
      "./restore.sh backups/db-<ts>.dump backups/storage-<ts>.tar.gz",
    ]) {
      expect(guide, command).toContain(command);
    }
  });

  it("does not document the scheduler service, packs commands or the runner as working", () => {
    expect(guide).not.toContain("restart app scheduler");
    expect(guide).not.toContain("run --rm app packs-check");
    expect(guide).not.toContain("seed --pack");
    expect(guide).not.toContain("systemctl --user");
    expect(guide).not.toContain("launchctl");
  });

  it("keeps the env table between its markers", () => {
    expect(tableNames(guide, "env-table").has("DATABASE_URL")).toBe(true);
    expect(tableNames(guide, "env-table-extra").has("POSTGRES_PASSWORD")).toBe(true);
  });

  it("tells the operator to chmod 600 .env and to copy backups off the machine, encrypted", () => {
    expect(guide).toContain("chmod 600 .env");
    expect(guide).toMatch(/Copy `backups\/` to another machine[^.]*, and encrypt the copies/);
  });

  it("names no personal address and uses example.com style hosts only", () => {
    const emails = prose.match(/[\w.+-]+@[\w.-]+/g) ?? [];
    expect(emails.filter((e) => !e.endsWith("@example.com"))).toEqual([]);
    const allowed = new Set(["github.com", "localhost", "127.0.0.1", "tts.internal"]);
    const hosts = [...prose.matchAll(/https?:\/\/([^\s/:`<>)]+)/g)].map((m) => m[1]);
    const bad = hosts.filter((h) => !allowed.has(h) && !h.endsWith("example.com") && !h.startsWith("<your"));
    expect(bad).toEqual([]);
  });

  it("has no em dash, no en dash and no exclamation mark", () => {
    expect(prose).not.toMatch(/[–—]/);
    expect(prose).not.toContain("!");
    expect(guide).not.toMatch(/[–—]/);
  });
});
