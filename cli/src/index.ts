import os from "node:os";
import { run } from "./main";
import { readLineOrEmpty } from "./read-secret";
import type { CliIo } from "./io";

function readSecret(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    if (!process.stdin.isTTY) {
      readLineOrEmpty(process.stdin).then(resolve);
      return;
    }
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    let value = "";
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
    };
    function onData(chunk: string) {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u0003") {
          cleanup();
          process.stdout.write("\n");
          process.exit(130);
        }
        if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += char;
      }
    }
    process.stdin.on("data", onData);
  });
}

const io: CliIo = {
  fetch: globalThis.fetch,
  env: process.env,
  cwd: process.cwd(),
  homedir: os.homedir(),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  readSecret,
};

process.exitCode = await run(process.argv.slice(2), io);
