// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { LocalTime } from "@/components/local-time";
import { TimeZoneProvider } from "@/components/time-zone-provider";

const ISO = "2026-10-01T09:30:00.000Z";

describe("LocalTime", () => {
  it("shows the Intl-formatted date, in date mode", () => {
    render(<LocalTime value={ISO} />);
    const expected = new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(ISO));
    const el = screen.getByText(expected);
    expect(el.tagName).toBe("TIME");
    expect(el.getAttribute("dateTime")).toBe(ISO);
  });

  it("shows the Intl-formatted date and time, in datetime mode", () => {
    render(<LocalTime value={ISO} mode="datetime" />);
    const expected = new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(ISO));
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it("accepts a Date value directly", () => {
    render(<LocalTime value={new Date(ISO)} />);
    const expected = new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(ISO));
    expect(screen.getByText(expected)).toBeTruthy();
  });
});

describe("LocalTime inside a TimeZoneProvider", () => {
  const LATE = "2026-10-01T20:30:00.000Z";

  it.each(["Asia/Tokyo", "Pacific/Honolulu"])("formats the date in %s", (zone) => {
    render(
      <TimeZoneProvider zone={zone}>
        <LocalTime value={LATE} />
      </TimeZoneProvider>,
    );
    const expected = new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: zone,
    }).format(new Date(LATE));
    expect(screen.getByText(expected).tagName).toBe("TIME");
  });

  it("rolls the date over in Tokyo", () => {
    render(
      <TimeZoneProvider zone="Asia/Tokyo">
        <LocalTime value={LATE} />
      </TimeZoneProvider>,
    );
    const inUtc = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(
      new Date(LATE),
    );
    expect(screen.queryByText(inUtc)).toBeNull();
  });

  it("formats date and time in the zone, in datetime mode", () => {
    render(
      <TimeZoneProvider zone="America/New_York">
        <LocalTime value={LATE} mode="datetime" />
      </TimeZoneProvider>,
    );
    const expected = new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
    }).format(new Date(LATE));
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it("renders the server text in the zone before mount", () => {
    const html = renderToString(
      <TimeZoneProvider zone="Asia/Tokyo">
        <LocalTime value={LATE} />
        <LocalTime value={LATE} mode="datetime" />
      </TimeZoneProvider>,
    );
    expect(html).toContain(">2026-10-02<");
    expect(html).toContain(">2026-10-02 05:30<");
  });

  it("keeps the UTC server text without a provider", () => {
    const html = renderToString(<LocalTime value={LATE} mode="datetime" />);
    expect(html).toContain(">2026-10-01 20:30 UTC<");
  });
});
