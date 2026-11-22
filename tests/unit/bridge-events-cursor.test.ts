import { describe, expect, it } from "vitest";
import { encodeCursor, decodeCursor } from "@/lib/bridge/events";

const ID = "3f2b8c1e-7a4d-4e0b-9c55-1d2e3f4a5b6c";

describe("events cursor", () => {
  it("round-trips a created time and an id", () => {
    const at = new Date("2026-11-20T10:11:12.345Z");
    const cursor = encodeCursor(at, ID);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(cursor)).toEqual({ createdAt: at, id: ID });
  });

  it("returns null for text that is not base64url, for a missing separator and for a bad date", () => {
    expect(decodeCursor("not base64url!")).toBeNull();
    expect(decodeCursor("")).toBeNull();
    expect(decodeCursor(Buffer.from(`2026-11-20T10:11:12.345Z${ID}`).toString("base64url"))).toBeNull();
    expect(decodeCursor(Buffer.from(`yesterday|${ID}`).toString("base64url"))).toBeNull();
    expect(decodeCursor(Buffer.from("2026-11-20T10:11:12.345Z|not-a-uuid").toString("base64url"))).toBeNull();
  });
});
