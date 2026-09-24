import { parseArgs } from "node:util";

export type Command =
  | { name: "login"; url: string }
  | { name: "list" }
  | { name: "pull"; slug: string; out: string | null }
  | { name: "push"; slug: string; dir: string | null; prefix: string | null; dryRun: boolean }
  | { name: "help" }
  | { name: "version" };

export const USAGE = `Usage: jobsmith <command> [options]

  login --url <base-url>          Save the Jobsmith URL and a token (read from standard input)
  list                            List active jobs and their slugs
  pull <slug> [--out <dir>]       Write <slug>-context.md
  push <slug> [--dir <dir>] [--prefix <file-prefix>] [--dry-run]
                                  Push <prefix>-*.md files as documents
`;

export function parseCommand(argv: string[]): { ok: true; command: Command } | { ok: false; message: string } {
  try {
    // strict defaults to true: an unrecognized flag or, since
    // allowPositionals is set, anything else out of shape throws here
    // rather than being silently accepted. The parse, and everything that
    // reads its result, stays inside this try: declaring `parsed` with an
    // explicit ReturnType<typeof parseArgs> annotation ahead of the call
    // would resolve that generic against its bare constraint instead of
    // this specific options shape, widening every option back to
    // `string | boolean | (string | boolean)[]` and defeating the
    // per-option typing this whole function relies on.
    const { positionals, values } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        url: { type: "string" },
        out: { type: "string" },
        dir: { type: "string" },
        prefix: { type: "string" },
        "dry-run": { type: "boolean" },
        help: { type: "boolean" },
        version: { type: "boolean" },
      },
    });

    if (values.help) {
      return { ok: true, command: { name: "help" } };
    }
    if (values.version) {
      return { ok: true, command: { name: "version" } };
    }

    const [name, ...rest] = positionals;

    switch (name) {
      case "help":
        return { ok: true, command: { name: "help" } };
      case "version":
        return { ok: true, command: { name: "version" } };
      case "login": {
        if (!values.url) {
          return { ok: false, message: USAGE };
        }
        if (!/^https?:\/\//.test(values.url)) {
          return { ok: false, message: "Enter a URL that starts with http:// or https://." };
        }
        return { ok: true, command: { name: "login", url: values.url.replace(/\/$/, "") } };
      }
      case "list":
        return { ok: true, command: { name: "list" } };
      case "pull": {
        const slug = rest[0];
        if (!slug) {
          return { ok: false, message: USAGE };
        }
        return { ok: true, command: { name: "pull", slug, out: values.out ?? null } };
      }
      case "push": {
        const slug = rest[0];
        if (!slug) {
          return { ok: false, message: USAGE };
        }
        return {
          ok: true,
          command: {
            name: "push",
            slug,
            dir: values.dir ?? null,
            prefix: values.prefix ?? null,
            dryRun: values["dry-run"] ?? false,
          },
        };
      }
      default:
        return { ok: false, message: USAGE };
    }
  } catch {
    return { ok: false, message: USAGE };
  }
}
