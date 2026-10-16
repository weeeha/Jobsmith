import { describe, expect, it } from "vitest";
import type { HardFilterCheck } from "@/lib/fit/hard-filters";
import {
  boardFailedChip,
  cardFailedChip,
  failedBoxHeading,
  failedFilterLine,
  filterDetail,
  filtersFootnote,
  scoreChipText,
  FILTER_ROW_LABELS,
  FILTER_OUTCOME_WORDS,
} from "@/lib/fit/messages";

const check = (over: Partial<HardFilterCheck> & Pick<HardFilterCheck, "filter" | "outcome">): HardFilterCheck => ({
  reason: null,
  value: null,
  wanted: null,
  ...over,
});

describe("filterDetail", () => {
  it("writes the drafts' four lines word for word", () => {
    expect(filterDetail(check({ filter: "title", outcome: "passes", value: "Design Lead", wanted: "Design lead" }))).toBe(
      "Design lead matches.",
    );
    expect(filterDetail(check({ filter: "location", outcome: "fails", value: "Berlin, Germany" }))).toBe(
      "Berlin, Germany is not in your locations.",
    );
    expect(filterDetail(check({ filter: "work_mode", outcome: "passes", value: "hybrid" }))).toBe("Hybrid is one of yours.");
    expect(filterDetail(check({ filter: "pay", outcome: "not_checked", reason: "missing" }))).toBe(
      "The posting states no pay range.",
    );
  });

  it("starts a lower-case keyword with a capital, as a sentence does", () => {
    expect(filterDetail(check({ filter: "title", outcome: "passes", wanted: "product designer" }))).toBe("Product designer matches.");
  });

  it.each([
    [check({ filter: "title", outcome: "fails", value: "Staff Engineer" }), "Staff Engineer has none of your title keywords."],
    [check({ filter: "title", outcome: "not_checked", reason: "missing" }), "The posting states no title."],
    [check({ filter: "title", outcome: "not_set" }), "No title keywords set."],
    [check({ filter: "location", outcome: "passes", value: "Rotterdam, Netherlands" }), "Rotterdam, Netherlands is in your locations."],
    [check({ filter: "location", outcome: "not_checked", reason: "missing" }), "The posting states no location."],
    [check({ filter: "location", outcome: "not_checked", reason: "remote" }), "The job is remote, so location does not apply."],
    [check({ filter: "location", outcome: "not_set" }), "No locations set."],
    [check({ filter: "work_mode", outcome: "fails", value: "onsite" }), "On site is not one of yours."],
    [check({ filter: "work_mode", outcome: "not_checked", reason: "missing" }), "The posting states no work mode."],
    [check({ filter: "work_mode", outcome: "not_set" }), "No work modes set."],
    [check({ filter: "pay", outcome: "passes" }), "The top of the range meets your floor."],
    [check({ filter: "pay", outcome: "fails" }), "The top of the range is below your floor."],
    [check({ filter: "pay", outcome: "not_checked", reason: "other_currency", value: "EUR", wanted: "USD" }), "The posting pays in EUR and your floor is in USD."],
    [check({ filter: "pay", outcome: "not_set" }), "No pay floor set."],
  ])("writes %o as %s", (input, expected) => {
    expect(filterDetail(input)).toBe(expected);
  });
});

describe("fit card and board lines", () => {
  it("labels the test box rows and outcomes as drawn", () => {
    expect(FILTER_ROW_LABELS).toEqual({ title: "Title keywords", location: "Locations", work_mode: "Work modes", pay: "Pay floor" });
    expect(FILTER_OUTCOME_WORDS).toEqual({ passes: "Passes", fails: "Fails", not_checked: "Not checked", not_set: "Not checked" });
  });

  it("writes a failure line with the filter's name first", () => {
    expect(failedFilterLine(check({ filter: "location", outcome: "fails", value: "Berlin, Germany" }))).toBe(
      "Location: Berlin, Germany is not in your locations.",
    );
    expect(failedFilterLine(check({ filter: "work_mode", outcome: "fails", value: "onsite" }))).toBe(
      "Work mode: On site is not one of yours.",
    );
  });

  it("counts failures on the card and in its box", () => {
    expect(cardFailedChip(1)).toBe("Fails 1 filter");
    expect(cardFailedChip(2)).toBe("Fails 2 filters");
    expect(failedBoxHeading(1)).toBe("Fails a hard filter");
    expect(failedBoxHeading(3)).toBe("Fails 3 hard filters");
  });

  it("names a single failed filter on a board card and counts several", () => {
    expect(boardFailedChip(["location"])).toBe("Fails location");
    expect(boardFailedChip(["work_mode"])).toBe("Fails work mode");
    expect(boardFailedChip(["title", "pay"])).toBe("Fails 2 filters");
  });

  it("joins the score and the band word with a middle dot", () => {
    expect(scoreChipText(82, "good")).toBe("82 · Good fit");
    expect(scoreChipText(64, "mixed")).toBe("64 · Mixed");
    expect(scoreChipText(12, "weak")).toBe("12 · Weak fit");
  });
});

describe("filtersFootnote", () => {
  const set = (filter: HardFilterCheck["filter"], outcome: HardFilterCheck["outcome"]) => check({ filter, outcome });

  it("says the job passes when nothing failed", () => {
    expect(filtersFootnote([set("title", "passes"), set("location", "not_set"), set("work_mode", "passes"), set("pay", "not_set")])).toBe(
      "Passes your hard filters.",
    );
  });

  it("adds what could not be checked", () => {
    expect(
      filtersFootnote([set("title", "passes"), set("location", "not_checked"), set("work_mode", "not_set"), set("pay", "not_checked")]),
    ).toBe("Passes your hard filters. Not checked: locations, pay floor.");
  });

  it("says when no filter is set", () => {
    expect(filtersFootnote([set("title", "not_set"), set("location", "not_set"), set("work_mode", "not_set"), set("pay", "not_set")])).toBe(
      "No hard filters set.",
    );
  });

  it("has nothing to say when a filter failed, because the box says it", () => {
    expect(filtersFootnote([set("title", "fails"), set("location", "passes"), set("work_mode", "not_set"), set("pay", "not_set")])).toBeNull();
  });
});
