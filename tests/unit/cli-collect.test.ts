import { describe, expect, it, afterEach } from "vitest";
import { mkdtemp, chmod, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { collectPacket } from "@/cli/src/collect";

// Every test below that touches the filesystem creates its own temporary
// path under the OS temp dir and registers it here, so afterEach removes it
// whether the test passed, failed, or threw partway through. A directory a
// test made unreadable is restored first, or rm cannot walk it to clean up.
const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempPaths.splice(0).map(async (p) => {
      await chmod(p, 0o700).catch(() => {});
      await rm(p, { recursive: true, force: true });
    }),
  );
});

describe("collectPacket, a missing or unreadable --dir", () => {
  it("reports the fixed no-files line for a directory that does not exist, not a stack trace", async () => {
    const dir = path.join(os.tmpdir(), `jobsmith-collect-missing-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const result = await collectPacket({ dir, prefix: "nwl" });
    expect(result).toEqual({ ok: false, message: `No nwl-*.md files in ${dir}.` });
  });

  it("reports a Could not read line for a --dir that exists but cannot be listed, not a stack trace", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "jobsmith-collect-"));
    tempPaths.push(dir);
    // Execute-only: a lookup of one known name (jobsmith.config.json, which
    // does not exist here) still resolves to a clean ENOENT, but listing
    // every entry the way collectPacket needs to needs the read bit too, so
    // this isolates readdir's own failure from the config-file read above it.
    await chmod(dir, 0o111);

    const result = await collectPacket({ dir, prefix: "nwl" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message.startsWith(`Could not read ${dir}: `)).toBe(true);
      expect(result.message.endsWith(".")).toBe(true);
    }
  });
});
