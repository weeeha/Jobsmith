import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const live = process.env.JOBSMITH_LIVE_MCP === "1" && !!process.env.JOBSMITH_URL && !!process.env.JOBSMITH_TOKEN;

// Opt-in: talks to a real server with a real token through the MCP Inspector's
// command line mode. Confirm the flags with `npx @modelcontextprotocol/inspector --help`
// first. Run with JOBSMITH_LIVE_MCP=1, JOBSMITH_URL and JOBSMITH_TOKEN set.
describe.skipIf(!live)("the MCP Inspector against a live server", () => {
  it("tools/list names the tools", async () => {
    const { stdout } = await run(
      "npx",
      [
        "--no-install",
        "@modelcontextprotocol/inspector",
        "--cli",
        `${process.env.JOBSMITH_URL}/api/bridge/mcp`,
        "--transport",
        "http",
        "--header",
        `Authorization: Bearer ${process.env.JOBSMITH_TOKEN}`,
        "--method",
        "tools/list",
      ],
      { timeout: 60_000 },
    );
    for (const name of ["list_jobs", "get_job", "get_job_context", "get_profile", "write_document"]) {
      expect(stdout).toContain(name);
    }
  });
});
