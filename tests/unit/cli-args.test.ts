import { describe, expect, it } from "vitest";
import { parseCommand, USAGE } from "@/cli/src/args";

describe("parseCommand", () => {
  it("parses login with a URL, stripping exactly one trailing slash", () => {
    expect(parseCommand(["login", "--url", "http://localhost:3000/"])).toEqual({
      ok: true,
      command: { name: "login", url: "http://localhost:3000" },
    });
  });

  it("login without --url is a usage error", () => {
    expect(parseCommand(["login"])).toEqual({ ok: false, message: USAGE });
  });

  it("login with a URL missing http:// or https:// gets its own specific message, not the usage block", () => {
    expect(parseCommand(["login", "--url", "ftp://x"])).toEqual({
      ok: false,
      message: "Enter a URL that starts with http:// or https://.",
    });
  });

  it("parses list", () => {
    expect(parseCommand(["list"])).toEqual({ ok: true, command: { name: "list" } });
  });

  it("parses pull with and without --out", () => {
    expect(parseCommand(["pull", "acme-designer"])).toEqual({
      ok: true,
      command: { name: "pull", slug: "acme-designer", out: null },
    });
    expect(parseCommand(["pull", "acme-designer", "--out", "./here"])).toEqual({
      ok: true,
      command: { name: "pull", slug: "acme-designer", out: "./here" },
    });
  });

  it("pull without a slug is a usage error", () => {
    expect(parseCommand(["pull"])).toEqual({ ok: false, message: USAGE });
  });

  it("parses push with every option set", () => {
    expect(parseCommand(["push", "acme-designer", "--dir", "./packet", "--prefix", "nwl", "--dry-run"])).toEqual({
      ok: true,
      command: { name: "push", slug: "acme-designer", dir: "./packet", prefix: "nwl", dryRun: true },
    });
  });

  it("parses push with only a slug, defaulting every option", () => {
    expect(parseCommand(["push", "acme-designer"])).toEqual({
      ok: true,
      command: { name: "push", slug: "acme-designer", dir: null, prefix: null, dryRun: false },
    });
  });

  it("push without a slug is a usage error", () => {
    expect(parseCommand(["push"])).toEqual({ ok: false, message: USAGE });
  });

  it("an unknown command name is a usage error", () => {
    expect(parseCommand(["frobnicate"])).toEqual({ ok: false, message: USAGE });
  });

  it("an unrecognized flag is a usage error", () => {
    expect(parseCommand(["list", "--bogus"])).toEqual({ ok: false, message: USAGE });
  });

  it("--help wins over everything else, regardless of position", () => {
    expect(parseCommand(["--help"])).toEqual({ ok: true, command: { name: "help" } });
    expect(parseCommand(["push", "--help"])).toEqual({ ok: true, command: { name: "help" } });
    expect(parseCommand(["help"])).toEqual({ ok: true, command: { name: "help" } });
  });

  it("--version and the bare word both report the version command", () => {
    expect(parseCommand(["--version"])).toEqual({ ok: true, command: { name: "version" } });
    expect(parseCommand(["version"])).toEqual({ ok: true, command: { name: "version" } });
  });

  it("no arguments at all is a usage error", () => {
    expect(parseCommand([])).toEqual({ ok: false, message: USAGE });
  });
});
