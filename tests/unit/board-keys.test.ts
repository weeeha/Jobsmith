import { describe, expect, it } from "vitest";
import { keyToAction } from "@/lib/board/keys";
import { STAGE_KINDS } from "@/lib/pipeline/kinds";

describe("keyToAction", () => {
  it("maps 1 through 7 to the seven kinds in column order", () => {
    ["1", "2", "3", "4", "5", "6", "7"].forEach((key, index) => {
      expect(keyToAction(key)).toEqual({ type: "move", kind: STAGE_KINDS[index].kind });
    });
  });

  it("maps c and C to close", () => {
    expect(keyToAction("c")).toEqual({ type: "close" });
    expect(keyToAction("C")).toEqual({ type: "close" });
  });

  it("returns null for 0, 8 and other keys", () => {
    expect(keyToAction("0")).toBeNull();
    expect(keyToAction("8")).toBeNull();
    expect(keyToAction("Enter")).toBeNull();
    expect(keyToAction(" ")).toBeNull();
  });

  it("returns null for a multi-character string", () => {
    expect(keyToAction("10")).toBeNull();
  });
});
