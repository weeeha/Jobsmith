import { describe, expect, it } from "vitest";
import { IMPLEMENTED_METHODS, MCP_PATH_BRANCH, MCP_SUPPORTED_VERSIONS } from "@/lib/mcp/protocol";
import { MCP_PROTOCOL_BASELINE } from "@/lib/bridge/wire";

describe("mcp protocol facts", () => {
  it("supports the baseline revision", () => {
    expect(MCP_SUPPORTED_VERSIONS).toContain(MCP_PROTOCOL_BASELINE);
  });

  it("lists exactly the eight milestone 30 methods", () => {
    expect([...IMPLEMENTED_METHODS].sort()).toEqual(
      [
        "initialize",
        "notifications/initialized",
        "ping",
        "tools/list",
        "tools/call",
        "resources/list",
        "resources/templates/list",
        "resources/read",
      ].sort(),
    );
  });

  it("records a branch the code can follow", () => {
    expect(["sdk", "rpc"]).toContain(MCP_PATH_BRANCH);
  });
});
