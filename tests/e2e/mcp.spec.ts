import { test, expect } from "@playwright/test";
import { scanForViolations } from "./axe";
import { login, uniqueName, addJobAndOpen } from "./session";
import { runCli, runCliWithStdin } from "./cli";
import { createToken } from "./token";
import { ORIGIN_WORDS } from "@/lib/artifacts/kinds";

const HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream" };

type Rpc = { result?: { serverInfo?: { name: string }; structuredContent?: Record<string, unknown>; content?: { text: string }[]; tools?: { name: string }[] } };

test("a token drives the MCP endpoint and jobsmith mcp: list, context, write, repeat", async ({ page, request }, testInfo) => {
  test.slow();
  await login(page);
  const company = uniqueName(testInfo, "Northwind Traders");
  const slug = await addJobAndOpen(page, company, "Design Lead");
  const origin = new URL(page.url()).origin;
  const token = await createToken(page, uniqueName(testInfo, "MCP"), testInfo);
  const auth = { ...HEADERS, authorization: `Bearer ${token}` };
  const url = "/api/bridge/mcp";
  let id = 0;
  const call = async (method: string, params: object): Promise<Rpc> => {
    const res = await request.post(url, { headers: auth, data: { jsonrpc: "2.0", id: ++id, method, params } });
    expect(res.status()).toBe(200);
    return (await res.json()) as Rpc;
  };
  const tool = (name: string, args: object) => call("tools/call", { name, arguments: args });
  const title = `CV for ${company}`;
  const write = { slug, key: "cv", kind: "cv", title, body_md: `# ${title}\n\nLed a design system.\n` };

  await test.step("initialize names the server jobsmith", async () => {
    const r = await call("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "e2e", version: "1" },
    });
    expect(r.result?.serverInfo?.name).toBe("jobsmith");
  });

  await test.step("list_jobs contains the slug", async () => {
    const r = await tool("list_jobs", {});
    const jobs = r.result?.structuredContent?.jobs as { slug: string }[];
    expect(jobs.map((j) => j.slug)).toContain(slug);
  });

  await test.step("get_job_context carries the context frontmatter", async () => {
    const r = await tool("get_job_context", { slug });
    expect(r.result?.content?.[0]?.text).toContain("jobsmith: context/v1");
  });

  await test.step("write_document creates version 1, a repeat is unchanged", async () => {
    const first = await tool("write_document", write);
    expect(first.result?.structuredContent).toMatchObject({ key: "cv", status: "created", version: 1 });
    const again = await tool("write_document", write);
    expect(again.result?.structuredContent).toMatchObject({ status: "unchanged", version: 1 });
  });

  await test.step("a foreign Origin is 403 and no token is 401", async () => {
    const body = { jsonrpc: "2.0", id: 99, method: "tools/list", params: {} };
    const evil = await request.post(url, { headers: { ...auth, origin: "https://evil.example" }, data: body });
    expect(evil.status()).toBe(403);
    const anon = await request.post(url, { headers: HEADERS, data: body });
    expect(anon.status()).toBe(401);
  });

  await test.step("jobsmith mcp relays one reply line per request and none for the notification", async () => {
    const configHome = testInfo.outputPath("cli-config");
    const login = await runCli(["login", "--url", origin], { configHome, input: `${token}\n` });
    expect(login.code).toBe(0);
    const lines = [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_jobs", arguments: {} } },
    ].map((m) => JSON.stringify(m));
    const result = await runCliWithStdin(["mcp"], { configHome, lines });
    expect(result.code).toBe(0);
    const replies = result.stdout.split("\n").filter(Boolean).map((l) => JSON.parse(l) as { id: number } & Rpc);
    expect(replies.map((r) => r.id).sort()).toEqual([1, 2, 3]);
    expect(replies.find((r) => r.id === 2)?.result?.tools?.map((t) => t.name)).toContain("write_document");
  });

  await test.step("the Documents tab shows the written document as pushed", async () => {
    await page.goto(`/jobs/${slug}?tab=documents`);
    await expect(page.getByRole("link", { name: title })).toBeVisible();
    await expect(page.getByText(ORIGIN_WORDS.pushed).first()).toBeVisible();
    await scanForViolations(page, "documents tab after an MCP write", testInfo);
  });
});
