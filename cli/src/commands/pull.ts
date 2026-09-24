import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { bridgeRequest } from "../http";
import type { CliIo } from "../io";

// The same extraction as list and push use: try to read the server's own
// error message out of the body, and fall back to the raw text when the
// shape is not what is expected, so a response this CLI did not anticipate
// (an upstream proxy's own HTML error page, for example) still prints
// something rather than throwing out of the command.
function extractServerMessage(text: string): string {
  try {
    const parsed = JSON.parse(text) as { error?: { message?: unknown } };
    if (typeof parsed.error?.message === "string") {
      return parsed.error.message;
    }
    return text;
  } catch {
    return text;
  }
}

export async function runPull(
  io: CliIo,
  creds: { url: string; token: string },
  command: { slug: string; out: string | null },
): Promise<number> {
  const response = await bridgeRequest(io, creds, "GET", `/api/bridge/opportunities/${command.slug}/context`);
  if (!response.ok) {
    io.stderr(`Could not reach ${creds.url}: ${response.message}.\n`);
    return 1;
  }
  if (response.status === 401) {
    io.stderr("The server refused the token. Create a new one in Settings and run jobsmith login.\n");
    return 1;
  }
  if (response.status !== 200) {
    const message = extractServerMessage(response.text);
    io.stderr(`Error: ${message}\n`);
    return 1;
  }

  const outDir = path.resolve(io.cwd, command.out ?? ".");
  await mkdir(outDir, { recursive: true });
  const filePath = path.join(outDir, `${command.slug}-context.md`);
  await writeFile(filePath, response.text, "utf8");
  io.stdout(`Wrote ${filePath}.\n`);
  return 0;
}
