import { htmlToMarkdown, decodeIfEncoded } from "./html";

export type JsonLdPosting = {
  companyName: string | null;
  roleTitle: string | null;
  location: string | null;
  workMode: "remote" | null;
  bodyMd: string | null;
};

function textOf(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object" && "name" in value && typeof (value as { name: unknown }).name === "string") {
    return (value as { name: string }).name.trim() || null;
  }
  return null;
}

function locationOf(value: unknown): string | null {
  const places = Array.isArray(value) ? value : value ? [value] : [];
  const labels: string[] = [];
  for (const place of places) {
    const address = (place as { address?: unknown })?.address;
    if (typeof address === "string") {
      labels.push(address.trim());
      continue;
    }
    if (address && typeof address === "object") {
      const a = address as Record<string, unknown>;
      const parts = [textOf(a.addressLocality), textOf(a.addressRegion), textOf(a.addressCountry)].filter((p): p is string => Boolean(p));
      const unique = parts.filter((p, i) => parts.indexOf(p) === i);
      if (unique.length > 0) labels.push(unique.join(", "));
    }
  }
  const unique = labels.filter((l, i) => l && labels.indexOf(l) === i);
  return unique.length > 0 ? unique.join("; ") : null;
}

function isJobPosting(node: unknown): node is Record<string, unknown> {
  if (!node || typeof node !== "object") return false;
  const type = (node as { "@type"?: unknown })["@type"];
  return type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
}

function* walk(node: unknown): Generator<unknown> {
  if (Array.isArray(node)) {
    for (const item of node) yield* walk(item);
    return;
  }
  if (node && typeof node === "object") {
    yield node;
    const graph = (node as { "@graph"?: unknown })["@graph"];
    if (graph) yield* walk(graph);
  }
}

export function jobPostingFromJsonLd(document: Document): JsonLdPosting | null {
  for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    let data: unknown;
    try {
      data = JSON.parse(script.textContent ?? "");
    } catch {
      continue;
    }
    for (const node of walk(data)) {
      if (!isJobPosting(node)) continue;
      const description = typeof node.description === "string" ? htmlToMarkdown(decodeIfEncoded(node.description)) : null;
      return {
        companyName: textOf(node.hiringOrganization),
        roleTitle: textOf(node.title),
        location: locationOf(node.jobLocation),
        workMode: node.jobLocationType === "TELECOMMUTE" ? "remote" : null,
        bodyMd: description,
      };
    }
  }
  return null;
}
