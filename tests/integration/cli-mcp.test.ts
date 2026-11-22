import { describe, expect, it } from "vitest";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import type { Db } from "@/lib/db/client";
import type { BridgeDeps } from "@/lib/bridge/handlers";
import { bridgeFetch } from "../helpers/bridge-fetch";
import { createApiToken } from "@/lib/auth/api-token";
import { run } from "@/cli/src/main";
import { configPath } from "@/cli/src/config";
import type { CliIo } from "@/cli/src/io";

function deps(db: Db): BridgeDeps {
  let counter = 0;
  return { db, now: () => new Date(), revalidate: () => {}, requestId: () => `req-${++counter}` };
}

async function seedToken(db: Db, email: string): Promise<string> {
  const user = await createTestUser(db, email);
  const created = await createApiToken(scoped(db, user.id), "Test");
  if (!created.ok) throw new Error("token setup failed");
  return created.data.token;
}

async function home(config?: { url: string; token: string }, mode = 0o600) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "jobsmith-mcp-home-"));
  const env = { XDG_CONFIG_HOME: path.join(dir, "config") };
  if (config) {
    const file = configPath(env, dir);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(config));
    await chmod(file, mode);
  }
  return { dir, env, file: configPath(env, dir) };
}

function stdinOf(...lines: string[]): AsyncIterable<string> {
  return (async function* () {
    yield lines.map((l) => l + "\n").join("");
  })();
}

function buildIo(db: Db, h: { dir: string; env: Record<string, string> }, extra: Partial<CliIo> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIo = {
    fetch: bridgeFetch(deps(db)),
    env: h.env,
    cwd: "/",
    homedir: h.dir,
    stdout: (t) => out.push(t),
    stderr: (t) => err.push(t),
    readSecret: async () => "",
    ...extra,
  };
  return { io, out, err };
}

const initialize = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } },
});
const list = JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" });

describe("jobsmith mcp", () => {
  it("exits 2 with the Contract message when JOBSMITH_TOKEN is set and --allow-env-token is absent", async () => {
    const { db, close } = await makeTestDb();
    try {
      const token = await seedToken(db, "mcp1@example.com");
      const h = await home({ url: "http://test.local", token });
      const { io, err } = buildIo(db, { ...h, env: { ...h.env, JOBSMITH_TOKEN: token } }, { stdin: stdinOf(initialize) });
      expect(await run(["mcp"], io)).toBe(2);
      expect(err.join("")).toBe(
        "JOBSMITH_TOKEN is set. This command uses the token saved by jobsmith login. Start it with --allow-env-token to use the environment's token.\n",
      );
    } finally {
      await close();
    }
  });

  it("with --allow-env-token it uses the environment's token", async () => {
    const { db, close } = await makeTestDb();
    try {
      const token = await seedToken(db, "mcp2@example.com");
      const h = await home();
      const { io, out } = buildIo(
        db,
        { ...h, env: { ...h.env, JOBSMITH_TOKEN: token, JOBSMITH_URL: "http://test.local" } },
        { stdin: stdinOf(initialize) },
      );
      expect(await run(["mcp", "--allow-env-token"], io)).toBe(0);
      expect(JSON.parse(out[0]!).result.serverInfo).toBeDefined();
    } finally {
      await close();
    }
  });

  it("exits 2 naming chmod 600 for a group-readable config.json, on linux and darwin", async () => {
    const { db, close } = await makeTestDb();
    try {
      const token = await seedToken(db, "mcp3@example.com");
      const h = await home({ url: "http://test.local", token }, 0o640);
      const { io, err } = buildIo(db, h, { stdin: stdinOf(initialize) });
      expect(await run(["mcp"], io)).toBe(2);
      expect(err.join("")).toContain(`chmod 600 ${h.file}`);
    } finally {
      await close();
    }
  });

  it("exits 1 'Not logged in. Run jobsmith login first.' with no saved login", async () => {
    const { db, close } = await makeTestDb();
    try {
      const h = await home();
      const { io, err } = buildIo(db, h, { stdin: stdinOf(initialize) });
      expect(await run(["mcp"], io)).toBe(1);
      expect(err.join("")).toBe("Not logged in. Run jobsmith login first.\n");
    } finally {
      await close();
    }
  });

  it("relays initialize and tools/list to the real endpoint and prints the tool names", async () => {
    const { db, close } = await makeTestDb();
    try {
      const token = await seedToken(db, "mcp5@example.com");
      const h = await home({ url: "http://test.local", token });
      const { io, out, err } = buildIo(db, h, {
        stdin: stdinOf(initialize, JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }), list),
      });
      expect(await run(["mcp"], io)).toBe(0);
      expect(err).toEqual([]);
      const replies = out.map((l) => JSON.parse(l) as { id: number; result: { tools?: { name: string }[] } });
      expect(replies).toHaveLength(2);
      const names = replies.find((r) => r.id === 2)!.result.tools!.map((t) => t.name);
      expect(names).toEqual(expect.arrayContaining(["list_jobs", "get_job", "write_document"]));
    } finally {
      await close();
    }
  });
});
