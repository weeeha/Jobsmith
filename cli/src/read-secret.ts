import { createInterface } from "node:readline";

// Standard input redirected from something that closes without ever writing
// a line (`jobsmith login --url X < /dev/null`) never fires readline's
// "line" event: it fires "close" instead, so waiting on "line" alone left
// this promise unsettled forever. Resolving "" on close mirrors what a
// human pasting nothing and pressing enter would send.
export function readLineOrEmpty(input: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input });
    let settled = false;
    rl.once("line", (line) => {
      settled = true;
      rl.close();
      resolve(line);
    });
    rl.once("close", () => {
      if (!settled) {
        resolve("");
      }
    });
  });
}
