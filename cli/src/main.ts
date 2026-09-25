import { parseCommand, USAGE } from "./args";
import { CLI_VERSION } from "./version";
import { readCredentials } from "./config";
import { runLogin } from "./commands/login";
import { runList } from "./commands/list";
import { runPull } from "./commands/pull";
import { runPush } from "./commands/push";
import type { CliIo } from "./io";

export async function run(argv: string[], io: CliIo): Promise<number> {
  const parsed = parseCommand(argv);
  if (!parsed.ok) {
    io.stderr(`${parsed.message}\n`);
    return 2;
  }
  const command = parsed.command;

  switch (command.name) {
    case "help":
      io.stdout(USAGE);
      return 0;
    case "version":
      io.stdout(`${CLI_VERSION}\n`);
      return 0;
    case "login":
      return runLogin(io, command);
    case "list": {
      const creds = await readCredentials(io);
      if (!creds) {
        io.stderr("Not logged in. Run jobsmith login first.\n");
        return 1;
      }
      return runList(io, creds);
    }
    case "pull": {
      const creds = await readCredentials(io);
      if (!creds) {
        io.stderr("Not logged in. Run jobsmith login first.\n");
        return 1;
      }
      return runPull(io, creds, command);
    }
    case "push": {
      const creds = await readCredentials(io);
      if (!creds) {
        io.stderr("Not logged in. Run jobsmith login first.\n");
        return 1;
      }
      return runPush(io, creds, command);
    }
  }
}
