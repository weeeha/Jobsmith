import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { configPath, readCredentials, writeCredentials } from "@/cli/src/config";
import type { CliIo } from "@/cli/src/io";

function testIo(overrides: Partial<CliIo> = {}): CliIo {
  return {
    fetch: globalThis.fetch,
    env: {},
    cwd: "/",
    homedir: "/home/test",
    stdout: () => {},
    stderr: () => {},
    readSecret: async () => "",
    ...overrides,
  };
}

// Every test below that needs a real filesystem home creates its own
// temporary directory under the OS temp dir (never the real home
// directory) and registers it here so afterEach can remove it, whether the
// test passed, failed, or threw partway through.
const tempDirs: string[] = [];

async function makeTempHome(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "jobsmith-cli-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("configPath", () => {
  it("uses <homedir>/.config/jobsmith/config.json by default", () => {
    expect(configPath({}, "/home/demo")).toBe(path.join("/home/demo", ".config", "jobsmith", "config.json"));
  });

  it("uses XDG_CONFIG_HOME when it is set", () => {
    expect(configPath({ XDG_CONFIG_HOME: "/custom/config" }, "/home/demo")).toBe(
      path.join("/custom/config", "jobsmith", "config.json"),
    );
  });
});

describe("writeCredentials / readCredentials", () => {
  it("writes the directory as 0700 and the file as 0600, and reads the same values back", async () => {
    const home = await makeTempHome();
    const io = testIo({ homedir: home });

    const file = await writeCredentials(io, { url: "http://localhost:3000", token: "placeholder-token" });
    expect(file).toBe(configPath({}, home));

    expect((await stat(path.dirname(file))).mode & 0o777).toBe(0o700);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ url: "http://localhost:3000", token: "placeholder-token" });
    expect(await readCredentials(io)).toEqual({ url: "http://localhost:3000", token: "placeholder-token" });
  });

  it("returns null when there is no config file and no env override", async () => {
    const home = await makeTempHome();
    expect(await readCredentials(testIo({ homedir: home }))).toBeNull();
  });

  it("JOBSMITH_URL and JOBSMITH_TOKEN each independently override the file", async () => {
    const home = await makeTempHome();
    const io = testIo({ homedir: home });
    await writeCredentials(io, { url: "http://file-url.example", token: "placeholder-file-token" });

    expect(
      await readCredentials(testIo({ env: { JOBSMITH_URL: "http://env-url.example" }, homedir: home })),
    ).toEqual({ url: "http://env-url.example", token: "placeholder-file-token" });

    expect(
      await readCredentials(
        testIo({ env: { JOBSMITH_URL: "http://env-url.example", JOBSMITH_TOKEN: "placeholder-env-token" }, homedir: home }),
      ),
    ).toEqual({ url: "http://env-url.example", token: "placeholder-env-token" });
  });
});
