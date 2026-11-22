import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = path.join(process.cwd(), "scripts/image-smoke.mjs");
const placeholders = JSON.parse(
  (await import("node:fs")).readFileSync(path.join(process.cwd(), "scripts/image-placeholders.json"), "utf8"),
) as { secret: string };

function run(...args: string[]) {
  return spawnSync("node", [script, ...args], { encoding: "utf8" });
}

const dirs: string[] = [];
const servers: http.Server[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  for (const s of servers.splice(0)) s.close();
});
function tmp(): string {
  const d = mkdtempSync(path.join(tmpdir(), "smoke-"));
  dirs.push(d);
  return d;
}

describe("image-smoke placeholders", () => {
  it("finds build.invalid in a planted file and names it", () => {
    const d = tmp();
    writeFileSync(path.join(d, "planted"), "postgres://x@build.invalid:5432/x");
    writeFileSync(path.join(d, "clean"), "nothing here");
    const r = run("placeholders", d);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain(path.join(d, "planted"));
    expect(r.stdout).not.toContain(path.join(d, "clean"));
  });

  it("finds the placeholder secret", () => {
    const d = tmp();
    writeFileSync(path.join(d, "secret.txt"), `x=${placeholders.secret}`);
    const r = run("placeholders", d);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("secret.txt");
  });

  it("returns clean for a folder without either", () => {
    const d = tmp();
    writeFileSync(path.join(d, "a.txt"), "hello");
    expect(run("placeholders", d).status).toBe(0);
  });
});

async function serve(handler: http.RequestListener): Promise<string> {
  const s = http.createServer(handler);
  servers.push(s);
  await new Promise<void>((ok) => s.listen(0, "127.0.0.1", ok));
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
}

const runAsync = (...args: string[]) =>
  new Promise<{ status: number | null; stderr: string; stdout: string }>((ok) => {
    import("node:child_process").then(({ execFile }) => {
      execFile("node", [script, ...args], (err, stdout, stderr) =>
        ok({ status: err ? ((err as { code?: number }).code ?? 1) : 0, stdout, stderr }),
      );
    });
  });

describe("image-smoke routes", () => {
  it("reports the row id of a route that redirects to /login", async () => {
    const base = await serve((req, res) => {
      if (req.url === "/setup") {
        res.writeHead(302, { Location: "/login?next=/setup" });
      } else if (req.url === "/api/auth/sign-in/email") {
        res.writeHead(405);
      } else {
        res.writeHead(200);
      }
      res.end();
    });
    const r = await runAsync("routes", base);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/row auth: GET \/setup/);
    expect(r.stderr).not.toContain("/api/auth/sign-in/email");
  });

  it("passes 200, 401, 403, 404 and 405", async () => {
    const codes = [200, 401, 403, 404, 405];
    let i = 0;
    const base = await serve((_req, res) => {
      res.writeHead(codes[i++ % codes.length]);
      res.end();
    });
    const r = await runAsync("routes", base);
    expect(r.status).toBe(0);
  });
});

describe("image-smoke size", () => {
  it("fails over the budget and passes under it", () => {
    const d = tmp();
    const f = path.join(d, "image.bin");
    writeFileSync(f, Buffer.alloc(2048));
    expect(run("size", f, "1024").status).toBe(1);
    expect(run("size", f, "4096").status).toBe(0);
  });
});
