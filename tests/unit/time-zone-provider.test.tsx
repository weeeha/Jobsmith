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

  // The server cannot know what this browser accepts, so the first client
  // render must match what the server rendered; the fallback comes after mount.
  it("renders the given zone first and switches to the fallback after mount", () => {
    const seen: string[] = [];
    function Recorder() {
      seen.push(String(useTimeZone()));
      return null;
    }
    render(
      <TimeZoneProvider zone="Mars/Olympus">
        <Recorder />
      </TimeZoneProvider>,
    );
    expect(seen[0]).toBe("Mars/Olympus");
    expect(seen[seen.length - 1]).toBe("UTC");
  });
});
