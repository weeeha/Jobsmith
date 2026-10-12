// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/(app)/jobs/[slug]/actions", () => ({ setNextActionAction: vi.fn(), completeNextActionAction: vi.fn() }));

import { NextActionBar } from "@/components/job/next-action-bar";

const BASE = { id: "00000000-0000-4000-8000-0000000000a1", roleTitle: "Product Designer" };

describe("NextActionBar: the focus marker", () => {
  it("marks Add when there is no next action", () => {
    render(<NextActionBar opportunity={{ ...BASE, nextAction: null, nextActionAt: null }} />);
    expect(screen.getByRole("button", { name: "Add" }).hasAttribute("data-next-action-trigger")).toBe(true);
    expect(document.querySelectorAll("[data-next-action-trigger]")).toHaveLength(1);
  });

  it("marks Edit, and only Edit, when there is one", () => {
    render(<NextActionBar opportunity={{ ...BASE, nextAction: "Send the portfolio", nextActionAt: null }} />);
    expect(screen.getByRole("button", { name: "Edit" }).hasAttribute("data-next-action-trigger")).toBe(true);
    expect(screen.getByRole("button", { name: "Done" }).hasAttribute("data-next-action-trigger")).toBe(false);
    expect(document.querySelectorAll("[data-next-action-trigger]")).toHaveLength(1);
  });
});
