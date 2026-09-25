import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { bridgeRequest, extractServerMessage } from "../http";
import type { CliIo } from "../io";

export async function runPull(
  io: CliIo,
  creds: { url: string; token: string },
  command: { slug: string; out: string | null },
): Promise<number> {
  const response = await bridgeRequest(
    io,
    creds,
    "GET",
    `/api/bridge/opportunities/${encodeURIComponent(command.slug)}/context`,
  );
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
