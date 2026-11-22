import { afterEach, describe, expect, it, vi } from "vitest";
import { DrizzleQueryError } from "drizzle-orm";
import { logBridgeError, logMcp } from "@/lib/bridge/log";

afterEach(() => vi.restoreAllMocks());

describe("logMcp", () => {
  it("prints one [mcp] line with request id, method, tool, code and ms, and nothing else", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logMcp({ requestId: "req-9", method: "tools/call", tool: "list_jobs", code: "ok", ms: 12 });
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith("[mcp]", "req-9", "tools/call", "list_jobs", "ok", "12ms");
  });

  it("prints a dash when there is no tool", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logMcp({ requestId: "req-9", method: "initialize", code: "ok", ms: 1 });
    expect(info).toHaveBeenCalledWith("[mcp]", "req-9", "initialize", "-", "ok", "1ms");
  });
});

describe("logBridgeError", () => {
  it("prints the constructor name and, for a DrizzleQueryError, only code and constraint", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    logBridgeError("req-1", new TypeError("secret body text"));
    expect(err).toHaveBeenLastCalledWith("[bridge]", "req-1", "TypeError");

    const drizzle = new DrizzleQueryError("insert into x values ($1)", ["secret body"], {
      name: "PostgresError",
      message: "dup",
      code: "23505",
      constraint: "x_key",
    } as Error & { code: string; constraint: string });
    logBridgeError("req-2", drizzle);
    expect(err).toHaveBeenLastCalledWith("[bridge]", "req-2", "DrizzleQueryError", { code: "23505", constraint: "x_key" });
    expect(JSON.stringify(err.mock.calls)).not.toContain("secret body");
  });
});
