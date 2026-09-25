import { describe, expect, it } from "vitest";
import { formatList, formatPushReport } from "@/cli/src/output";
import type { WireOpportunity, WirePushResponse } from "@/lib/bridge/wire";

describe("formatList", () => {
  it("prints the fixed empty line for no active jobs", () => {
    expect(formatList([])).toBe("No active jobs.\n");
  });

  it("pads the slug and role-at-company columns to the widest value in the list", () => {
    const items: WireOpportunity[] = [
      {
        slug: "acme-designer",
        company: "Acme Robotics",
        role: "Product Designer",
        status: "active",
        stage: { kind: "saved", label: "Saved" },
      },
      {
        slug: "nwl-pm",
        company: "Northwind Labs",
        role: "PM",
        status: "active",
        stage: { kind: "recruiter_screen", label: "Recruiter screen" },
      },
    ];
    expect(formatList(items)).toBe(
      "acme-designer  Product Designer at Acme Robotics  Saved\n" +
        "nwl-pm         PM at Northwind Labs               Recruiter screen\n",
    );
  });
});

describe("formatPushReport", () => {
  it("reports a version number for created and versioned rows, none for updated or unchanged, then warnings, then the summary", () => {
    const responses: WirePushResponse[] = [
      {
        dryRun: false,
        requestId: "r1",
        results: [
          { key: "cv", scope: "opportunity", status: "created", version: 1 },
          { key: "cover-letter", scope: "opportunity", status: "versioned", version: 2 },
          { key: "recon", scope: "company", status: "updated", version: 3 },
          { key: "glossary", scope: "opportunity", status: "unchanged", version: 1 },
        ],
        warnings: [
          {
            key: "debrief-round2",
            code: "stage_not_found",
            message: 'debrief-round2: no stage matches "Final loop", stored without a stage.',
          },
        ],
      },
    ];
    expect(formatPushReport(responses, false)).toBe(
      "  created    cv (version 1)\n" +
        "  versioned  cover-letter (version 2)\n" +
        "  updated    recon\n" +
        "  unchanged  glossary\n" +
        'Warning: debrief-round2: no stage matches "Final loop", stored without a stage.\n' +
        "1 created, 1 versioned, 1 updated, 1 unchanged.\n",
    );
  });

  it("prepends the dry-run line and combines totals across several batch responses", () => {
    const responses: WirePushResponse[] = [
      { dryRun: true, requestId: "r1", results: [{ key: "a", scope: "opportunity", status: "created", version: 1 }], warnings: [] },
      { dryRun: true, requestId: "r2", results: [{ key: "b", scope: "opportunity", status: "created", version: 1 }], warnings: [] },
    ];
    expect(formatPushReport(responses, true)).toBe(
      "Dry run: nothing was saved.\n" +
        "  created    a (version 1)\n" +
        "  created    b (version 1)\n" +
        "2 created, 0 versioned, 0 updated, 0 unchanged.\n",
    );
  });

  it("prints no warning line at all when there are none", () => {
    const responses: WirePushResponse[] = [
      { dryRun: false, requestId: "r1", results: [{ key: "cv", scope: "opportunity", status: "unchanged", version: 1 }], warnings: [] },
    ];
    expect(formatPushReport(responses, false)).toBe("  unchanged  cv\n0 created, 0 versioned, 0 updated, 1 unchanged.\n");
  });
});
