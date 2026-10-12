import { afterEach, describe, expect, it, vi } from "vitest";
import { DrizzleQueryError } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { scoped } from "@/lib/db/scoped";
import { logExportError } from "@/lib/export/build";
import { GET } from "@/app/(app)/settings/export/route";
import { makeTestDb, createTestUser, seedOneOfEach } from "../helpers/db";
import { seedProfile } from "../helpers/profile";

// The route reads the session and scopes its queries by the signed-in user;
// both are stubbed, and scopedFor points at a real PGlite database through the
// real scoped(). `broken` makes the first query throw, to reach the error path.
const harness = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  user: null as { id: string } | null,
  broken: false,
}));

vi.mock("@/lib/auth/session", () => ({
  getUser: async () => harness.user,
}));

vi.mock("@/lib/db/scoped", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/scoped")>();
  return {
    ...actual,
    scopedFor: (userId: string) => {
      const real = actual.scoped(harness.db!, userId);
      if (!harness.broken) return real;
      return {
        ...real,
        dataExport: {
          ...real.dataExport,
          user: async () => {
            throw new Error("SECRET-QUERY-TEXT");
          },
        },
      };
    },
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  harness.broken = false;
  harness.user = null;
});

describe("GET /settings/export", () => {
  it("answers 401 with a JSON error when nobody is signed in", async () => {
    const response = await GET();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("downloads the user's data as a pretty JSON attachment named for the profile-zone date", async () => {
    const { db, close } = await makeTestDb();
    try {
      harness.db = db;
      const user = await createTestUser(db, "route-owner@example.com");
      harness.user = { id: user.id };
      const s = scoped(db, user.id);
      await seedProfile(s, { headline: "SECRET-HEADLINE", timezone: "Asia/Tokyo" });
      const ids = await seedOneOfEach(s);
      // 05:30 on 12 October in Tokyo, still 11 October in UTC.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-11T20:30:00.000Z"));
      const info = vi.spyOn(console, "info").mockImplementation(() => {});

      const response = await GET();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
      expect(response.headers.get("content-disposition")).toBe('attachment; filename="jobsmith-export-2026-10-12.json"');
      expect(response.headers.get("cache-control")).toBe("no-store");
      const text = await response.text();
      expect(text).toContain('\n  "format": "jobsmith-export/v1"');
      const body = JSON.parse(text);
      expect(body.format).toBe("jobsmith-export/v1");
      expect(body.exportedAt).toBe("2026-10-11T20:30:00.000Z");
      expect(body.profile.headline).toBe("SECRET-HEADLINE");
      expect(body.opportunities.map((row: { id: string }) => row.id)).toEqual([ids.opportunityId]);

      // One counts-and-timing line, never a body.
      expect(info).toHaveBeenCalledTimes(1);
      const [tag, line] = info.mock.calls[0] as [string, string];
      expect(tag).toBe("[export]");
      expect(Object.keys(JSON.parse(line)).sort()).toEqual(["ms", "requestId"]);
      expect(JSON.stringify(info.mock.calls)).not.toContain("SECRET");
    } finally {
      await close();
    }
  });

  it("answers 500 with a fixed error and logs the error name only", async () => {
    const { db, close } = await makeTestDb();
    try {
      harness.db = db;
      harness.user = { id: (await createTestUser(db, "route-broken@example.com")).id };
      harness.broken = true;
      const error = vi.spyOn(console, "error").mockImplementation(() => {});

      const response = await GET();

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "server_error" });
      expect(error).toHaveBeenCalledTimes(1);
      const [tag, line] = error.mock.calls[0] as [string, string];
      expect(tag).toBe("[export]");
      expect(JSON.parse(line)).toMatchObject({ error: "Error" });
      expect(JSON.stringify(error.mock.calls)).not.toContain("SECRET");
    } finally {
      await close();
    }
  });
});

describe("logExportError", () => {
  it("logs a Drizzle error by name, Postgres code and constraint, never the SQL or its parameters", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = Object.assign(new Error("SECRET-ROW"), { code: "57014", constraint: undefined });
    logExportError("req-1", new DrizzleQueryError('select "resume_md" -- SECRET-ROW', ["SECRET-ROW"], cause));
    const [tag, line] = error.mock.calls[0] as [string, string];
    expect(tag).toBe("[export]");
    expect(JSON.parse(line)).toEqual({ requestId: "req-1", error: "DrizzleQueryError", code: "57014" });
    expect(JSON.stringify(error.mock.calls)).not.toContain("SECRET");
  });

  it("logs a thrown non-error as UnknownError", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logExportError("req-2", "SECRET-ROW");
    const [, line] = error.mock.calls[0] as [string, string];
    expect(JSON.parse(line)).toEqual({ requestId: "req-2", error: "UnknownError" });
  });
});
