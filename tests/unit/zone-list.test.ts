import { describe, expect, it } from "vitest";
import { timeZoneGroup, timeZoneItems, timeZoneLabel } from "@/lib/time/zone-list";

describe("timeZoneLabel", () => {
  it("puts the city first", () => {
    expect(timeZoneLabel("Europe/Amsterdam")).toBe("Amsterdam");
    expect(timeZoneLabel("America/New_York")).toBe("New York");
  });

  it("keeps a sub-region before the city", () => {
    expect(timeZoneLabel("America/Argentina/Buenos_Aires")).toBe("Argentina / Buenos Aires");
  });

  it("leaves UTC and slash-less names alone", () => {
    expect(timeZoneLabel("UTC")).toBe("UTC");
    expect(timeZoneLabel("CET")).toBe("CET");
  });
});

describe("timeZoneGroup", () => {
  it("is the first segment", () => {
    expect(timeZoneGroup("Europe/Amsterdam")).toBe("Europe");
    expect(timeZoneGroup("America/Argentina/Buenos_Aires")).toBe("America");
  });

  it("is UTC for UTC and Other when there is no slash", () => {
    expect(timeZoneGroup("UTC")).toBe("UTC");
    expect(timeZoneGroup("CET")).toBe("Other");
  });
});

describe("timeZoneItems", () => {
  const zones = ["Europe/Amsterdam", "Asia/Tokyo", "UTC", "Europe/Berlin", "America/New_York", "Africa/Cairo"];

  it("puts UTC first, then groups A to Z, then labels A to Z", () => {
    expect(timeZoneItems(zones, []).map((item) => item.value)).toEqual([
      "UTC",
      "Africa/Cairo",
      "America/New_York",
      "Asia/Tokyo",
      "Europe/Amsterdam",
      "Europe/Berlin",
    ]);
  });

  it("carries label and group on each item", () => {
    expect(timeZoneItems(["Europe/Amsterdam"], [])).toEqual([
      { value: "Europe/Amsterdam", label: "Amsterdam", group: "Europe" },
    ]);
  });

  it("adds an extra zone that is missing, once", () => {
    const items = timeZoneItems(zones, ["Asia/Kolkata", "Asia/Kolkata", null]);
    expect(items.filter((item) => item.value === "Asia/Kolkata")).toHaveLength(1);
    expect(items.map((item) => item.value).indexOf("Asia/Kolkata")).toBeLessThan(items.map((item) => item.value).indexOf("Asia/Tokyo"));
  });

  it("does not repeat an extra that is already listed", () => {
    expect(timeZoneItems(zones, ["Asia/Tokyo"])).toHaveLength(zones.length);
  });

  it("ignores blank extras", () => {
    expect(timeZoneItems(zones, [""])).toHaveLength(zones.length);
  });
});
