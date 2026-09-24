import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import type { CliIo } from "./io";

export function configPath(env: CliIo["env"], homedir: string): string {
  const base =
    env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.trim() !== "" ? env.XDG_CONFIG_HOME : path.join(homedir, ".config");
  return path.join(base, "jobsmith", "config.json");
}

async function readConfigFile(io: CliIo): Promise<{ url: string; token: string } | null> {
  try {
    const text = await readFile(configPath(io.env, io.homedir), "utf8");
    const data = JSON.parse(text) as { url?: unknown; token?: unknown };
    if (typeof data.url === "string" && typeof data.token === "string") {
      return { url: data.url, token: data.token };
    }
    return null;
  } catch {
    // Missing file, unreadable file, or malformed JSON: all three mean
    // "nothing usable on disk," which readCredentials treats the same as
    // an env override that supplies both fields on its own.
    return null;
  }
}

export async function readCredentials(io: CliIo): Promise<{ url: string; token: string } | null> {
  const fromFile = await readConfigFile(io);
  const url = io.env.JOBSMITH_URL ?? fromFile?.url;
  const token = io.env.JOBSMITH_TOKEN ?? fromFile?.token;
  if (!url || !token) {
    return null;
  }
  return { url, token };
}

export async function writeCredentials(io: CliIo, creds: { url: string; token: string }): Promise<string> {
  const file = configPath(io.env, io.homedir);
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, JSON.stringify({ url: creds.url, token: creds.token }), { mode: 0o600 });
  // writeFile's mode option only takes effect when this call creates the
  // file; re-running login against an existing file would otherwise leave
  // that file's mode exactly as it already was.
  await chmod(file, 0o600);
  return file;
}
