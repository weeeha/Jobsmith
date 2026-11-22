import { TOKEN_PATTERN } from "@/lib/bridge/wire";
import { configPath, readCredentials, readSavedCredentials, secretFileProblem } from "../config";
import { runRelay } from "../relay";
import type { CliIo } from "../io";

export async function runMcp(io: CliIo, command: { allowEnvToken: boolean }): Promise<number> {
  // Checked before any file is read: a token in the environment of a
  // process an MCP client started can leak into every tool it spawns.
  const envToken = io.env.JOBSMITH_TOKEN;
  if (envToken !== undefined && envToken !== "" && !command.allowEnvToken) {
    io.stderr(
      "JOBSMITH_TOKEN is set. This command uses the token saved by jobsmith login. Start it with --allow-env-token to use the environment's token.\n",
    );
    return 2;
  }

  const file = configPath(io.env, io.homedir);
  const problem = await secretFileProblem(file, process.platform);
  if (problem) {
    io.stderr(`${problem}\n`);
    return 2;
  }

  const creds = command.allowEnvToken ? await readCredentials(io) : await readSavedCredentials(io);
  if (!creds) {
    io.stderr("Not logged in. Run jobsmith login first.\n");
    return 1;
  }
  if (!TOKEN_PATTERN.test(creds.token)) {
    io.stderr("That does not look like a Jobsmith token. Run jobsmith login.\n");
    return 1;
  }
  if (!io.stdin) {
    io.stderr("Standard input is not available.\n");
    return 1;
  }
  return runRelay({ ...io, stdin: io.stdin }, creds);
}
