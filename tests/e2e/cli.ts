import { spawn } from "node:child_process";
import path from "node:path";

export function runCli(
  args: string[],
  options: { configHome: string; input?: string },
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, XDG_CONFIG_HOME: options.configHome };
    // Never let a developer's own local login leak into a test run: every
    // spec that spawns the CLI expects to start from a clean, per-test
    // config directory it fully controls. Reflect.deleteProperty, not the
    // delete operator: JOBSMITH_URL/JOBSMITH_TOKEN are read at runtime
    // (cli/src/config.ts) but never declared on NodeJS.ProcessEnv, and env
    // has to keep exactly that type for the spawn() call below to resolve
    // the right overload.
    Reflect.deleteProperty(env, "JOBSMITH_URL");
    Reflect.deleteProperty(env, "JOBSMITH_TOKEN");

    const child = spawn(process.execPath, [path.join(process.cwd(), "cli/dist/jobsmith.mjs"), ...args], {
      env,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));

    if (options.input !== undefined) {
      child.stdin.write(options.input);
    }
    child.stdin.end();
  });
}

// Starts the command, writes each line to its standard input, then closes it
// and waits for the command to finish. For a relay such as `jobsmith mcp`,
// which answers on standard output as it reads.
export function runCliWithStdin(
  args: string[],
  options: { configHome: string; lines: string[] },
): Promise<{ code: number; stdout: string; stderr: string }> {
  return runCli(args, { configHome: options.configHome, input: options.lines.map((l) => `${l}\n`).join("") });
}
