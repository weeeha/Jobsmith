import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { makeTestDb } from "../helpers/db";
import type { Db } from "@/lib/db/client";
import pkg from "../../package.json";

let current: Db;
vi.mock("@/lib/db/client", () => ({ getDb: () => current }));

import { runHealth } from "@/lib/health/check";
import { knownMigrationCount } from "@/lib/health/schema";
import { healthResponse } from "@/lib/health";
import { GET } from "@/app/api/health/route";

let handle: Awaited<ReturnType<typeof makeTestDb>>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  handle = await makeTestDb();
  current = handle.db;
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await handle.close();
});

describe("health", () => {
  it("database up and schema current gives 200 and status ok", async () => {
    const { status, body } = await healthResponse();
    expect(status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks).toEqual({ database: "ok", schema: "current" });
  });

  it("an extra row in drizzle.__drizzle_migrations gives schema ahead, status down and 503", async () => {
    await handle.db.execute(
      sql`insert into drizzle.__drizzle_migrations (hash, created_at) values ('extra', 9999999999999)`,
    );
    const { status, body } = await healthResponse();
    expect(status).toBe(503);
    expect(body.status).toBe("down");
    expect(body.checks).toEqual({ database: "ok", schema: "ahead" });
  });

  it("a database that throws gives database down, status down and 503, without crashing", async () => {
    current = {
      transaction: async () => {
        throw Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" });
      },
      execute: async () => {
        throw new Error("unreachable");
      },
    } as unknown as Db;
    const { status, body } = await healthResponse();
    expect(status).toBe(503);
    expect(body.status).toBe("down");
    expect(body.checks.database).toBe("down");
  });

  it("the select 1 runs under a 1500 ms statement timeout", async () => {
    const executed: string[] = [];
    const original = handle.db.transaction.bind(handle.db);
    vi.spyOn(handle.db, "transaction").mockImplementation(((fn: (tx: Db) => Promise<unknown>) =>
      original(async (tx) => {
        const run = tx.execute.bind(tx);
        vi.spyOn(tx, "execute").mockImplementation(((query: Parameters<Db["execute"]>[0]) => {
          const chunks = (query as unknown as { queryChunks: unknown[] }).queryChunks;
          executed.push(
            chunks
              .map((c) => (c as { value?: string[] }).value?.join("") ?? "")
              .join(""),
          );
          return run(query);
        }) as Db["execute"]);
        return fn(tx as unknown as Db);
      })) as unknown as Db["transaction"]);
    await runHealth(handle.db, knownMigrationCount(), "x");
    expect(executed).toEqual(["set local statement_timeout = 1500", "select 1"]);
  });

  it("the body has exactly the keys status, version and checks; checks has exactly database and schema", async () => {
    const { body } = await healthResponse();
    expect(Object.keys(body).sort()).toEqual(["checks", "status", "version"]);
    expect(Object.keys(body.checks).sort()).toEqual(["database", "schema"]);
  });

  it("the route answers without a session and sets Cache-Control: no-store", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await response.json()).status).toBe("ok");
  });

  it("version comes from JOBSMITH_VERSION, else the package.json version", async () => {
    vi.stubEnv("JOBSMITH_VERSION", "");
    expect((await healthResponse()).body.version).toBe(pkg.version);
    vi.stubEnv("JOBSMITH_VERSION", "v0.9.0-rc.2");
    expect((await healthResponse()).body.version).toBe("v0.9.0-rc.2");
  });

  it("logs only failures", async () => {
    await healthResponse();
    expect(errorSpy).not.toHaveBeenCalled();
    await handle.db.execute(
      sql`insert into drizzle.__drizzle_migrations (hash, created_at) values ('extra', 9999999999999)`,
    );
    await healthResponse();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
