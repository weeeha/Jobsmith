import { describe, expect, it } from "vitest";
import { pickQuickFire, seedFromId } from "@/lib/prep/quick-fire";
import { QUICK_FIRE_COUNT, QUICK_FIRE_SECONDS } from "@/lib/prep/values";

const list = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("quick-fire picker", () => {
  it("pickQuickFire returns the same order for the same seed", () => {
    expect(pickQuickFire(list(30), 42)).toEqual(pickQuickFire(list(30), 42));
  });

  it("pickQuickFire never repeats an item and returns min(count, length) items", () => {
    const picked = pickQuickFire(list(30), 7);
    expect(picked).toHaveLength(10);
    expect(new Set(picked).size).toBe(10);
    expect(pickQuickFire(list(4), 7)).toHaveLength(4);
    expect(pickQuickFire(list(30), 7, 12)).toHaveLength(12);
    expect(pickQuickFire([], 7)).toEqual([]);
  });

  it("does not change the list it is given", () => {
    const items = list(15);
    pickQuickFire(items, 3);
    expect(items).toEqual(list(15));
  });

  it("different seeds give different orders for a 30-item list", () => {
    const orders = new Set([1, 2, 3, 4, 5].map((seed) => pickQuickFire(list(30), seed).join(",")));
    expect(orders.size).toBeGreaterThan(1);
  });

  it("seedFromId is a stable unsigned integer for a uuid", () => {
    const id = "3f2b8c1e-5d4a-4e6f-9a7b-0c1d2e3f4a5b";
    const seed = seedFromId(id);
    expect(seedFromId(id)).toBe(seed);
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 32);
    expect(seedFromId("00000000-0000-4000-8000-000000000000")).not.toBe(seed);
  });

  it("QUICK_FIRE_COUNT is 10 and QUICK_FIRE_SECONDS is 5", () => {
    expect(QUICK_FIRE_COUNT).toBe(10);
    expect(QUICK_FIRE_SECONDS).toBe(5);
  });
});
