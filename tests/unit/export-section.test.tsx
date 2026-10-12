// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ExportSection } from "@/components/settings/export-section";

describe("ExportSection", () => {
  it("is a section named Export my data with the copy and a download link", () => {
    render(<ExportSection />);
    const section = screen.getByRole("region", { name: "Export my data" });
    expect(within(section).getByRole("heading", { level: 2, name: "Export my data" })).not.toBeNull();
    expect(
      within(section).getByText(
        "Download everything you saved in Jobsmith as one JSON file. Passwords, sign-in sessions and token secrets are left out.",
      ),
    ).not.toBeNull();
    const link = within(section).getByRole("link", { name: "Download JSON" });
    expect(link.getAttribute("href")).toBe("/settings/export");
    // Present and empty: the server's file name (dated in the profile zone) wins.
    expect(link.getAttribute("download")).toBe("");
  });
});
