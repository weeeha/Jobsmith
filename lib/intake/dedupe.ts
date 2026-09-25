import { createHash } from "node:crypto";
import { companyNameKey } from "@/lib/companies/name-key";

export type DedupeParts = { companyName: string; roleTitle: string; location?: string | null };

export function normalizeForDedupe(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function dedupeBasis(parts: DedupeParts): string {
  return [companyNameKey(parts.companyName), normalizeForDedupe(parts.roleTitle), normalizeForDedupe(parts.location)].join("|");
}

export function dedupeHash(parts: DedupeParts): string {
  return createHash("sha256").update(dedupeBasis(parts), "utf8").digest("hex");
}
