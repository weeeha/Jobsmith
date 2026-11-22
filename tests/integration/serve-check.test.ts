import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { makeTestDb } from "../helpers/db";
import { serveCheck } from "../../scripts/serve-check";
import { aheadMessage, knownMigrationCount } from "@/lib/health/schema";

let handle: Awaited<ReturnType<typeof makeTestDb>>;
let lines: string[];
const log = (line: string) => lines.push(line);

beforeEach(async () => {
  handle = await makeTestDb();
  lines = [];
});
afterEach(() => handle.close());

describe("serve-check", () => {
  it("exits ok when applied equals known", async () => {
    expect(await serveCheck(handle.db, { log })).toBe(0);
    expect(lines).toEqual([]);
  });

  it("goes on when the database is not migrated yet", async () => {
    await handle.db.execute(sql`delete from drizzle.__drizzle_migrations`);
    expect(await serveCheck(handle.db, { log })).toBe(0);
  });

  it("prints the schema-newer message and fails when applied is higher", async () => {
    await handle.db.execute(
      sql`insert into drizzle.__drizzle_migrations (hash, created_at) values ('extra', 9999999999999)`,
    );
    expect(await serveCheck(handle.db, { log })).toBe(1);
    const known = knownMigrationCount();
    expect(lines).toEqual([aheadMessage(known + 1, known)]);
  });

  it("prints a PackError line and fails when the pack loader throws a PackError", async () => {
    const loadPacks = async () => {
      throw Object.assign(new Error("packs/bad.json: schema mismatch"), { name: "PackError" });
    };
    expect(await serveCheck(handle.db, { log, loadPacks })).toBe(1);
    expect(lines).toEqual(["PackError: packs/bad.json: schema mismatch"]);
  });

  it("lets a non-pack error through", async () => {
    const loadPacks = async () => {
      throw new Error("disk gone");
    };
    await expect(serveCheck(handle.db, { log, loadPacks })).rejects.toThrow("disk gone");
  });
});
