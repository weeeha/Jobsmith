// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { LocalDateTimeInput } from "@/components/local-datetime-input";
import { TimeZoneProvider } from "@/components/time-zone-provider";
import { toInstant } from "@/lib/time/local";

describe("LocalDateTimeInput", () => {
  it("seeds the visible field from an ISO defaultValue", () => {
    const iso = new Date("2026-10-01T09:30").toISOString();
    render(<LocalDateTimeInput id="when" name="scheduledAt" defaultValue={iso} />);
    const visible = document.getElementById("when") as HTMLInputElement;
    expect(visible.value).toBe("2026-10-01T09:30");
  });

  it("starts both fields empty when defaultValue is null", () => {
    render(<LocalDateTimeInput id="when" name="scheduledAt" defaultValue={null} />);
    const visible = document.getElementById("when") as HTMLInputElement;
    const hidden = document.querySelector('input[name="scheduledAt"]') as HTMLInputElement;
    expect(visible.value).toBe("");
    expect(hidden.value).toBe("");
  });

  it("keeps the hidden ISO input in step with the visible field", () => {
    render(<LocalDateTimeInput id="when" name="scheduledAt" defaultValue={null} />);
    const visible = document.getElementById("when") as HTMLInputElement;
    fireEvent.change(visible, { target: { value: "2026-11-05T14:00" } });
    const hidden = document.querySelector('input[name="scheduledAt"]') as HTMLInputElement;
    expect(hidden.value).toBe(toInstant("2026-11-05T14:00"));
  });

  it("the hidden input carries the given name and the visible one does not", () => {
    render(<LocalDateTimeInput id="when" name="scheduledAt" defaultValue={null} />);
    const visible = document.getElementById("when") as HTMLInputElement;
    expect(visible.name).toBe("");
  });

  // A closed job's stage sheet shows this field read-only, so a viewer
  // can see a past interview's date without being able to change it.
  it("disables the visible field when disabled is true", () => {
    const iso = new Date("2026-10-01T09:30").toISOString();
    render(<LocalDateTimeInput id="when" name="scheduledAt" defaultValue={iso} disabled />);
    const visible = document.getElementById("when") as HTMLInputElement;
    expect(visible.disabled).toBe(true);
  });

  it("leaves the visible field enabled when disabled is left unset", () => {
    render(<LocalDateTimeInput id="when" name="scheduledAt" defaultValue={null} />);
    const visible = document.getElementById("when") as HTMLInputElement;
    expect(visible.disabled).toBe(false);
  });
});

describe("LocalDateTimeInput inside a TimeZoneProvider", () => {
  it("seeds the visible field from the instant in the profile zone", () => {
    render(
      <TimeZoneProvider zone="America/New_York">
        <LocalDateTimeInput id="when" name="scheduledAt" defaultValue="2026-10-01T13:30:00.000Z" />
      </TimeZoneProvider>,
    );
    expect((document.getElementById("when") as HTMLInputElement).value).toBe("2026-10-01T09:30");
  });

  it("converts a typed value as wall-clock time in the profile zone", () => {
    render(
      <TimeZoneProvider zone="Asia/Tokyo">
        <LocalDateTimeInput id="when" name="scheduledAt" defaultValue={null} />
      </TimeZoneProvider>,
    );
    fireEvent.change(document.getElementById("when") as HTMLInputElement, { target: { value: "2026-11-05T14:00" } });
    expect((document.querySelector('input[name="scheduledAt"]') as HTMLInputElement).value).toBe("2026-11-05T05:00:00.000Z");
  });

  it("moves a time that daylight saving skips to the later instant", () => {
    render(
      <TimeZoneProvider zone="America/New_York">
        <LocalDateTimeInput id="when" name="scheduledAt" defaultValue={null} />
      </TimeZoneProvider>,
    );
    fireEvent.change(document.getElementById("when") as HTMLInputElement, { target: { value: "2026-03-08T02:30" } });
    expect((document.querySelector('input[name="scheduledAt"]') as HTMLInputElement).value).toBe("2026-03-08T07:30:00.000Z");
  });

  it("leaves the hidden value empty while the typed value is incomplete", () => {
    render(
      <TimeZoneProvider zone="Asia/Tokyo">
        <LocalDateTimeInput id="when" name="scheduledAt" defaultValue={null} />
      </TimeZoneProvider>,
    );
    fireEvent.change(document.getElementById("when") as HTMLInputElement, { target: { value: "" } });
    expect((document.querySelector('input[name="scheduledAt"]') as HTMLInputElement).value).toBe("");
  });
});
