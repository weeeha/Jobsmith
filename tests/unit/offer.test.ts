// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast }));

import { NEXT_ACTION_OFFER_MS, offerNextAction } from "@/components/next-action/offer";

describe("offerNextAction", () => {
  beforeEach(() => {
    toast.mockReset();
  });

  it("shows one toast that names the job, with a Set next action button and a ten second life", () => {
    const open = vi.fn();
    offerNextAction({ roleTitle: "Product Designer", companyName: "Northwind Traders" }, open);
    expect(NEXT_ACTION_OFFER_MS).toBe(10_000);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith("What is next for Product Designer at Northwind Traders?", {
      action: { label: "Set next action", onClick: expect.any(Function) },
      duration: 10_000,
    });
  });

  it("does not open the dialog by itself", () => {
    const open = vi.fn();
    offerNextAction({ roleTitle: "Product Designer", companyName: "Northwind Traders" }, open);
    expect(open).not.toHaveBeenCalled();
  });

  it("opens the dialog when the toast button is clicked", () => {
    const open = vi.fn();
    offerNextAction({ roleTitle: "Product Designer", companyName: "Northwind Traders" }, open);
    const options = toast.mock.calls[0][1] as { action: { onClick: () => void } };
    options.action.onClick();
    expect(open).toHaveBeenCalledTimes(1);
  });

  // Sonner returns focus to whatever had it before the toast once focus
  // leaves the toaster. If the dialog took focus first, that return would
  // pull focus out of the dialog and back to the page behind it.
  it("lets focus leave the toast button before the dialog opens", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();
    let focusedWhenOpened: Element | null = null;
    const open = vi.fn(() => {
      focusedWhenOpened = document.activeElement;
    });
    offerNextAction({ roleTitle: "Product Designer", companyName: "Northwind Traders" }, open);
    const options = toast.mock.calls[0][1] as { action: { onClick: () => void } };
    options.action.onClick();
    expect(focusedWhenOpened).not.toBe(button);
    button.remove();
  });
});
