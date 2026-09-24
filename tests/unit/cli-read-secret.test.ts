import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import { readLineOrEmpty } from "@/cli/src/read-secret";

describe("readLineOrEmpty", () => {
  it("resolves with the first line written to the stream", async () => {
    const input = new Readable({ read() {} });
    const promise = readLineOrEmpty(input);
    input.push("jsm_token-value\n");
    expect(await promise).toBe("jsm_token-value");
  });

  it("resolves to an empty string when the stream closes with no line, instead of hanging", async () => {
    const input = new Readable({ read() {} });
    const promise = readLineOrEmpty(input);
    input.push(null); // end the stream with nothing ever written, e.g. `< /dev/null`
    expect(await promise).toBe("");
  },
  // Short on purpose: before the close-listener fix this promise never
  // settles, so this test's own failure mode is a timeout, not an assertion.
  2000);
});
