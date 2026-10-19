// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CardFitChips } from "@/components/fit/fit-chips";

beforeEach(() => {
  cleanup();
});

describe("CardFitChips", () => {
  it("shows the number and gives screen readers the band word", () => {
    render(<CardFitChips fit={{ score: 86, band: "good", scoring: false, failed: [] }} />);
    const chip = screen.getByText("86");
    expect(chip.closest("[data-band]")?.getAttribute("data-band")).toBe("good");
    expect(chip.closest("[data-band]")?.textContent).toBe("Fit 86, Good fit");
  });

  it("names a single failed filter and counts several", () => {
    const { rerender } = render(<CardFitChips fit={{ score: 72, band: "good", scoring: false, failed: ["location"] }} />);
    expect(screen.getByText("Fails location")).toBeTruthy();
    rerender(<CardFitChips fit={{ score: 72, band: "good", scoring: false, failed: ["location", "pay"] }} />);
    expect(screen.getByText("Fails 2 filters")).toBeTruthy();
  });

  it("shows Scoring in place of the score", () => {
    render(<CardFitChips fit={{ score: null, band: null, scoring: true, failed: [] }} />);
    expect(screen.getByText("Scoring")).toBeTruthy();
  });

  it("renders nothing without a score, a run or a failure", () => {
    const { container } = render(<CardFitChips fit={{ score: null, band: null, scoring: false, failed: [] }} />);
    expect(container.textContent).toBe("");
  });
});
