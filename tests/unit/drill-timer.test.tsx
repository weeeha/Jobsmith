// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DrillTimer } from "@/components/player/drill-timer";

afterEach(cleanup);

describe("DrillTimer", () => {
  it("is a timer with an accessible name that shows the time left as minutes and seconds", () => {
    render(<DrillTimer remaining={75} />);
    const timer = screen.getByRole("timer", { name: "Time to answer" });
    expect(timer.textContent).toBe("1:15");
  });

  it("rounds a fraction of a second up", () => {
    render(<DrillTimer remaining={7.5} />);
    expect(screen.getByRole("timer").textContent).toBe("0:08");
  });

  it("the timer itself is not a live region, so ticking is not read out", () => {
    render(<DrillTimer remaining={44} />);
    expect(screen.getByRole("timer").getAttribute("aria-live")).toBe("off");
  });

  it("announces politely at 30 and 10 seconds left and at no other time", () => {
    const { rerender } = render(<DrillTimer remaining={31} />);
    const status = () => screen.getByRole("status").textContent;
    expect(status()).toBe("");
    rerender(<DrillTimer remaining={30} />);
    expect(status()).toBe("30 seconds left.");
    rerender(<DrillTimer remaining={29} />);
    expect(status()).toBe("");
    rerender(<DrillTimer remaining={10} />);
    expect(status()).toBe("10 seconds left.");
    rerender(<DrillTimer remaining={9} />);
    expect(status()).toBe("");
  });
});
