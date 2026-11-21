import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  STORAGE_KEY_PATTERN,
  newRecordingKey,
  newSegmentKey,
  userHash,
  userPrefix,
} from "@/lib/storage/keys";

const USER_ID = "user-abc-123";

describe("storage keys", () => {
  it("userHash is the first 16 hex characters of sha256 of the user id", () => {
    const expected = createHash("sha256").update(USER_ID).digest("hex").slice(0, 16);
    expect(userHash(USER_ID)).toBe(expected);
    expect(userHash(USER_ID)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("userPrefix is 'u/<hash>/'", () => {
    expect(userPrefix(USER_ID)).toBe(`u/${userHash(USER_ID)}/`);
  });

  it("newSegmentKey matches u/<16 hex>/tts/<32 hex>.mp3 and never contains the user id or any text", () => {
    const key = newSegmentKey(USER_ID, "mp3");
    expect(key).toMatch(/^u\/[0-9a-f]{16}\/tts\/[0-9a-f]{32}\.mp3$/);
    expect(key.startsWith(userPrefix(USER_ID))).toBe(true);
    expect(key).not.toContain(USER_ID);
    expect(newSegmentKey(USER_ID, "wav")).toMatch(/\.wav$/);
    expect(newSegmentKey(USER_ID, "ogg")).toMatch(/\.ogg$/);
  });

  it("newRecordingKey matches u/<16 hex>/rec/<32 hex>.webm", () => {
    expect(newRecordingKey(USER_ID, "webm")).toMatch(/^u\/[0-9a-f]{16}\/rec\/[0-9a-f]{32}\.webm$/);
    expect(newRecordingKey(USER_ID, "mp4")).toMatch(/\.mp4$/);
  });

  it("two calls never return the same key", () => {
    const keys = new Set(Array.from({ length: 200 }, () => newSegmentKey(USER_ID, "mp3")));
    expect(keys.size).toBe(200);
  });

  it("STORAGE_KEY_PATTERN rejects '../x', an absolute path, a missing prefix and an unknown extension", () => {
    const good = newSegmentKey(USER_ID, "mp3");
    expect(STORAGE_KEY_PATTERN.test(good)).toBe(true);
    expect(STORAGE_KEY_PATTERN.test(newRecordingKey(USER_ID, "webm"))).toBe(true);
    expect(STORAGE_KEY_PATTERN.test("../x")).toBe(false);
    expect(STORAGE_KEY_PATTERN.test(`/${good}`)).toBe(false);
    expect(STORAGE_KEY_PATTERN.test(`u/../../etc/${good}`)).toBe(false);
    expect(STORAGE_KEY_PATTERN.test(good.replace(/^u\/[0-9a-f]{16}\//, ""))).toBe(false);
    expect(STORAGE_KEY_PATTERN.test(good.replace(".mp3", ".exe"))).toBe(false);
    expect(STORAGE_KEY_PATTERN.test(`${good}\n`)).toBe(false);
  });
});
