// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocalTime } from "@/components/local-time";

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
