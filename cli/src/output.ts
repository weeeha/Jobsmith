import type { WireOpportunity, WirePushResponse, WireStatus } from "@/lib/bridge/wire";

export function formatList(items: WireOpportunity[]): string {
  if (items.length === 0) {
    return "No active jobs.\n";
  }
  const rows = items.map((item) => ({
    slug: item.slug,
    roleAtCompany: `${item.role} at ${item.company}`,
    stage: item.stage.label,
  }));
  const slugWidth = Math.max(...rows.map((r) => r.slug.length));
  const roleWidth = Math.max(...rows.map((r) => r.roleAtCompany.length));
  return rows.map((r) => `${r.slug.padEnd(slugWidth)}  ${r.roleAtCompany.padEnd(roleWidth)}  ${r.stage}\n`).join("");
}

// "unchanged" and "versioned" are both exactly 9 characters, the longest of
// the four status words, so every row pads to 9: that is this column's
// natural width, not an arbitrary number.
const STATUS_WORDS: Record<WireStatus, string> = {
  created: "created",
  versioned: "versioned",
  updated: "updated",
  unchanged: "unchanged",
};

export function formatPushReport(responses: WirePushResponse[], dryRun: boolean): string {
  const lines: string[] = [];
  if (dryRun) {
    lines.push("Dry run: nothing was saved.");
  }
  const counts: Record<WireStatus, number> = { created: 0, versioned: 0, updated: 0, unchanged: 0 };
  for (const response of responses) {
    for (const result of response.results) {
      const word = STATUS_WORDS[result.status];
      const suffix = result.status === "created" || result.status === "versioned" ? ` (version ${result.version})` : "";
      lines.push(`  ${word.padEnd(9)}  ${result.key}${suffix}`);
      counts[result.status]++;
    }
  }
  for (const response of responses) {
    for (const warning of response.warnings) {
      lines.push(`Warning: ${warning.message}`);
    }
  }
  lines.push(
    `${counts.created} created, ${counts.versioned} versioned, ${counts.updated} updated, ${counts.unchanged} unchanged.`,
  );
  return lines.map((line) => `${line}\n`).join("");
}
