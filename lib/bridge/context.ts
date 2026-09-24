import type { JobView } from "@/lib/pipeline/read";
import type { ArtifactMeta } from "@/lib/db/scoped";
import { kindInfo } from "@/lib/artifacts/kinds";
import { PERSON_ROLE_LABELS } from "@/lib/pipeline/labels";

export type ContextInput = { view: JobView; companyDocuments: ArtifactMeta[]; generatedAt: Date };

// Table cells are single-line and pipe-delimited, so any value placed inside
// one has its own pipes escaped and its line breaks collapsed to spaces.
function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r\n|\r|\n/g, " ");
}

// Picks a fence longer than the longest run of backticks already inside the
// text, so a posting that itself contains a fenced code block never closes
// the wrapping fence early. Plain text with no backticks gets the ordinary
// 3-backtick fence.
function fenceFor(text: string): string {
  const runs = text.match(/`+/g);
  const longestRun = runs ? Math.max(...runs.map((run) => run.length)) : 0;
  return "`".repeat(Math.max(longestRun + 1, 3));
}

export function buildContextDocument(input: ContextInput): string {
  const { view, companyDocuments, generatedAt } = input;
  const { opportunity, company, currentStage } = view;
  const lines: string[] = [];

  lines.push("---");
  lines.push("jobsmith: context/v1");
  lines.push(`slug: ${JSON.stringify(opportunity.slug)}`);
  lines.push(`company: ${JSON.stringify(company.name)}`);
  lines.push(`role: ${JSON.stringify(opportunity.roleTitle)}`);
  lines.push(`status: ${opportunity.status}`);
  lines.push(`current_stage: ${JSON.stringify(currentStage.label)}`);
  lines.push(`current_stage_kind: ${currentStage.kind}`);
  lines.push(`generated: ${generatedAt.toISOString()}`);
  lines.push("---");
  lines.push("");

  lines.push(`# ${opportunity.roleTitle} at ${company.name}`);
  lines.push("");

  lines.push("## Posting");
  lines.push("");
  if (opportunity.postingCapturedAt) {
    lines.push(`Captured ${opportunity.postingCapturedAt.toISOString()}.`);
    lines.push("");
  }
  if (opportunity.postingMd && opportunity.postingMd.length > 0) {
    const fence = fenceFor(opportunity.postingMd);
    lines.push(`${fence}markdown`);
    lines.push(opportunity.postingMd);
    lines.push(fence);
  } else {
    lines.push("No posting text saved.");
  }
  lines.push("");

  lines.push("## Stages");
  lines.push("");
  lines.push("| # | Kind | Label | Status | Date | People |");
  lines.push("|---|---|---|---|---|---|");
  for (const stage of view.stages) {
    const status = stage.id === currentStage.id ? "current" : stage.status;
    const date = stage.scheduledAt ?? stage.completedAt;
    const names = view.people
      .filter((link) => link.stageId === stage.id)
      .map((link) => link.person.name)
      .join(", ");
    lines.push(
      `| ${stage.position + 1} | ${stage.kind} | ${escapeCell(stage.label)} | ${status} | ${date ? date.toISOString() : ""} | ${escapeCell(names)} |`,
    );
  }
  lines.push("");

  lines.push("## People");
  lines.push("");
  if (view.people.length === 0) {
    lines.push("No people linked to this job.");
  } else {
    for (const link of view.people) {
      const person = link.person;
      let head = `- ${person.name}`;
      if (person.title) {
        head += `, ${person.title}`;
      }
      head += `. Role: ${PERSON_ROLE_LABELS[link.role]}.`;
      if (link.stageId) {
        const linkedStage = view.stages.find((stage) => stage.id === link.stageId);
        if (linkedStage) {
          head += ` Stage: ${linkedStage.label}.`;
        }
      }
      if (person.linkedinUrl) {
        head += ` LinkedIn: ${person.linkedinUrl}.`;
      }
      // A person's email never appears in this document: the CLI's context
      // file can end up copied into prompts and other places outside the
      // app, and email addresses do not belong there.
      lines.push(head);
      if (person.notesMd && person.notesMd.trim().length > 0) {
        lines.push("  Notes:");
        for (const noteLine of person.notesMd.split(/\r\n|\r|\n/)) {
          lines.push(`  ${noteLine}`);
        }
      }
    }
  }
  lines.push("");

  // Preferences has no input to read yet: it is a fixed placeholder section
  // until a later milestone adds real preference data.
  lines.push("## Preferences");
  lines.push("");
  lines.push("No preferences saved yet.");
  lines.push("");

  lines.push("## Artifacts");
  lines.push("");
  const rows: { doc: ArtifactMeta; scopeTag: "job" | "company" }[] = [
    ...[...view.documents].sort((a, b) => a.key.localeCompare(b.key)).map((doc) => ({ doc, scopeTag: "job" as const })),
    ...[...companyDocuments].sort((a, b) => a.key.localeCompare(b.key)).map((doc) => ({ doc, scopeTag: "company" as const })),
  ];
  if (rows.length === 0) {
    lines.push("No artifacts yet.");
  } else {
    lines.push("| Key | Kind | Scope | Stage | Version | Updated |");
    lines.push("|---|---|---|---|---|---|");
    for (const { doc, scopeTag } of rows) {
      const linkedStage = doc.stageId ? view.stages.find((stage) => stage.id === doc.stageId) : undefined;
      const stageLabel = linkedStage ? linkedStage.label : "";
      lines.push(
        `| ${escapeCell(doc.key)} | ${kindInfo(doc.kind).label} | ${scopeTag} | ${escapeCell(stageLabel)} | ${doc.version} | ${doc.updatedAt.toISOString()} |`,
      );
    }
  }
  lines.push("");

  return lines.join("\n");
}
