// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { LocalDateTimeInput } from "@/components/local-datetime-input";
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
});
