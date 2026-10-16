// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { TimeZoneField, filterZones } from "@/components/settings/time-zone-field";

const ZONES = [
  "UTC",
  "America/New_York",
  "America/Nome",
  "America/Chicago",
  "Europe/Berlin",
  "Europe/London",
  ...Array.from({ length: 12 }, (_, i) => `Etc/Test${i}`),
];

describe("filterZones", () => {
  it("matches by case-insensitive substring", () => {
    expect(filterZones(ZONES, "new_y")).toEqual(["America/New_York"]);
    expect(filterZones(ZONES, "EUROPE")).toEqual(["Europe/Berlin", "Europe/London"]);
  });

  it("returns at most 8 suggestions", () => {
    expect(filterZones(ZONES, "etc/")).toHaveLength(8);
    expect(filterZones(ZONES, "")).toHaveLength(8);
  });

  it("returns nothing for an unknown zone", () => {
    expect(filterZones(ZONES, "Mars")).toEqual([]);
  });
});

describe("TimeZoneField", () => {
  function setup() {
    render(
      <form aria-label="f">
        <label htmlFor="tz">Time zone</label>
        <TimeZoneField id="tz" name="timezone" zones={ZONES} defaultValue="UTC" />
      </form>,
    );
    return screen.getByLabelText("Time zone") as HTMLInputElement;
  }

  it("submits the typed text under its name, even when it is not a listed zone", async () => {
    const input = setup();
    await act(async () => {
      fireEvent.change(input, { target: { value: "Mars/Olympus" } });
    });
    const data = new FormData(screen.getByRole("form", { name: "f" }) as HTMLFormElement);
    expect(data.get("timezone")).toBe("Mars/Olympus");
  });

  it("shows filtered suggestions and fills the input when one is clicked", async () => {
    const input = setup();
    await act(async () => {
      fireEvent.change(input, { target: { value: "america/n" } });
      // jsdom's change event alone does not open the popup the way typing does.
      fireEvent.keyDown(input, { key: "ArrowDown" });
    });
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["America/New_York", "America/Nome"]);
    await act(async () => {
      fireEvent.click(options[1]);
    });
    expect(input.value).toBe("America/Nome");
    const data = new FormData(screen.getByRole("form", { name: "f" }) as HTMLFormElement);
    expect(data.get("timezone")).toBe("America/Nome");
  });
});
