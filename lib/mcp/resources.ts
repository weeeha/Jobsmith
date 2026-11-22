import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import type { ToolContext } from "./registry";
import { SLUG_PATTERN } from "@/lib/bridge/wire";
import { loadContextDocument } from "@/lib/bridge/context-load";
import { loadJobJson } from "@/lib/bridge/job-json";

export const RESOURCES_PAGE = 50;

// The document template (jobsmith://jobs/{slug}/documents/{key}{?scope,version})
// is left out: this branch has no document read route (no document-routes-ok).
export const RESOURCE_TEMPLATES: { uriTemplate: string; name: string; mimeType: string; description: string }[] = [
  {
    uriTemplate: "jobsmith://jobs/{slug}/context",
    name: "Job context",
    mimeType: "text/markdown",
    description: "The context document of a job: posting, stages, people, preferences, document index and open requests.",
  },
  {
    uriTemplate: "jobsmith://jobs/{slug}",
    name: "Job",
    mimeType: "application/json",
    description: "One job as job/v1 JSON: company, stages, people, fit, documents, prep counts and open requests.",
  },
];

export type ResourceResult<T> = { ok: true; value: T } | { ok: false; code: "not_found" | "invalid"; message: string };

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): number | null {
  if (!/^[A-Za-z0-9_-]+$/.test(cursor)) return null;
  const text = Buffer.from(cursor, "base64url").toString("utf8");
  if (!/^\d{1,9}$/.test(text)) return null;
  return Number(text);
}

export async function listResources(
  ctx: ToolContext,
  cursor: string | null,
): Promise<{ resources: { uri: string; name: string; mimeType: string }[]; nextCursor: string | null }> {
  let offset = 0;
  if (cursor !== null) {
    const decoded = decodeCursor(cursor);
    if (decoded === null) throw new McpError(ErrorCode.InvalidParams, "Invalid cursor.");
    offset = decoded;
  }
  const summaries = await ctx.s.opportunity.listSummaries("active");
  const newestFirst = [...summaries].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || a.slug.localeCompare(b.slug));
  const all = newestFirst.flatMap((j) => {
    const label = `${j.companyName}, ${j.roleTitle}`;
    return [
      { uri: `jobsmith://jobs/${j.slug}/context`, name: `${label} (context)`, mimeType: "text/markdown" },
      { uri: `jobsmith://jobs/${j.slug}`, name: `${label} (job/v1)`, mimeType: "application/json" },
    ];
  });
  const resources = all.slice(offset, offset + RESOURCES_PAGE);
  const next = offset + RESOURCES_PAGE;
  return { resources, nextCursor: next < all.length ? encodeCursor(next) : null };
}

const JOB_URI = /^jobsmith:\/\/jobs\/([^/?#]+)(\/context)?$/;

export async function readResource(
  ctx: ToolContext,
  uri: string,
): Promise<ResourceResult<{ uri: string; mimeType: string; text: string }>> {
  const m = JOB_URI.exec(uri);
  if (!m) return { ok: false, code: "invalid", message: "That is not a Jobsmith resource URI." };
  const slug = m[1]!;
  if (!SLUG_PATTERN.test(slug)) return { ok: false, code: "invalid", message: "The slug in the URI is not valid." };
  if (m[2]) {
    const doc = await loadContextDocument(ctx.s, slug, ctx.now);
    if (doc === null) return { ok: false, code: "not_found", message: `No job with the slug ${slug}.` };
    return { ok: true, value: { uri, mimeType: "text/markdown", text: doc } };
  }
  const job = await loadJobJson(ctx.s, slug, ctx.now);
  if (job === null) return { ok: false, code: "not_found", message: `No job with the slug ${slug}.` };
  return { ok: true, value: { uri, mimeType: "application/json", text: JSON.stringify(job) } };
}
