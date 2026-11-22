import { mkdir, readFile, writeFile, chmod, stat } from "node:fs/promises";
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

// The pair saved by jobsmith login and nothing else: JOBSMITH_URL and
// JOBSMITH_TOKEN are never consulted, so an environment value cannot be
// combined with, or stand in for, what is on disk.
export async function readSavedCredentials(io: CliIo): Promise<{ url: string; token: string } | null> {
  const fromFile = await readConfigFile(io);
  if (!fromFile || !fromFile.url || !fromFile.token) {
    return null;
  }
  return { url: fromFile.url.replace(/\/+$/, ""), token: fromFile.token };
}

// null when the file is fine, missing, unreadable to stat, or the platform
// has no POSIX modes; otherwise the sentence to print before refusing.
export async function secretFileProblem(file: string, platform: string): Promise<string | null> {
  if (platform === "win32") {
    return null;
  }
  try {
    const { mode } = await stat(file);
    if ((mode & 0o077) !== 0) {
      return `${file} can be read by other users. Run chmod 600 ${file} and start again.`;
    }
    return null;
  } catch {
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
  // JOBSMITH_URL is not run through the same stripping the login command
  // applies to --url, and a config file can predate this fix or be edited
  // by hand, so a trailing slash is removed here regardless of where the
  // url came from. Left in, it turns every bridge path into //api/bridge/...
  return { url: url.replace(/\/+$/, ""), token };
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
