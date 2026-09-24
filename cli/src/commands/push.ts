import path from "node:path";
import type { WirePushResponse } from "@/lib/bridge/wire";
import { bridgeRequest, extractServerMessage, parseJson } from "../http";
import { collectPacket } from "../collect";
import { batchArtifacts } from "../batch";
import { formatPushReport } from "../output";
import type { CliIo } from "../io";

export async function runPush(
  io: CliIo,
  creds: { url: string; token: string },
  command: { slug: string; dir: string | null; prefix: string | null; dryRun: boolean },
): Promise<number> {
  const dir = path.resolve(io.cwd, command.dir ?? ".");
  const prefix = command.prefix ?? command.slug;

  const collected = await collectPacket({ dir, prefix });
  if (!collected.ok) {
    io.stderr(`${collected.message}\n`);
    return 1;
  }

  for (const note of collected.value.notes) {
    io.stdout(`${note}\n`);
  }

  const batches = batchArtifacts(collected.value.items);
  if (batches.length === 0) {
    // Every file on disk was individually skipped, which the notes above
    // already explained: a real, reportable outcome, not an error, since
    // collectPacket already confirmed at least one <prefix>-*.md file
    // existed on disk.
    io.stdout(formatPushReport([], command.dryRun));
    return 0;
  }

  const responses: WirePushResponse[] = [];
  for (const batch of batches) {
    const query = command.dryRun ? "?dry_run=true" : "";
    const response = await bridgeRequest(
      io,
      creds,
      "PUT",
      `/api/bridge/opportunities/${encodeURIComponent(command.slug)}/artifacts${query}`,
      { artifacts: batch },
    );
    if (!response.ok) {
      // Stop immediately: do not send the remaining batches.
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
    const parsed = parseJson(response.text);
    if (!parsed.ok) {
      io.stderr("Error: the server sent a reply the CLI could not read.\n");
      return 1;
    }
    responses.push(parsed.value as WirePushResponse);
  }

  io.stdout(formatPushReport(responses, command.dryRun));
  return 0;
}
