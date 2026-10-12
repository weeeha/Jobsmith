// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimeZoneProvider, useTimeZone } from "@/components/time-zone-provider";

function Probe() {
  return <p data-testid="zone">{String(useTimeZone())}</p>;
}

describe("TimeZoneProvider", () => {
  it("gives null outside a provider", () => {
    render(<Probe />);
    expect(screen.getByTestId("zone").textContent).toBe("null");
  });

  it("gives the zone to children", () => {
    render(
      <TimeZoneProvider zone="Asia/Tokyo">
        <Probe />
      </TimeZoneProvider>,
    );
    expect(screen.getByTestId("zone").textContent).toBe("Asia/Tokyo");
  });

  it("lets an inner provider win", () => {
    render(
      <TimeZoneProvider zone="Asia/Tokyo">
        <TimeZoneProvider zone="Europe/Amsterdam">
          <Probe />
        </TimeZoneProvider>
      </TimeZoneProvider>,
    );
    expect(screen.getByTestId("zone").textContent).toBe("Europe/Amsterdam");
  });

  // A saved zone can be newer than this browser's time zone data.
  it("gives UTC for a zone this browser does not know", () => {
    render(
      <TimeZoneProvider zone="Mars/Olympus">
        <Probe />
      </TimeZoneProvider>,
    );
    expect(screen.getByTestId("zone").textContent).toBe("UTC");
  });
});
