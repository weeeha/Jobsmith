function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function baseSlug(company: string, role: string): string {
  const combined = slugify(`${company} ${role}`);
  const trimmed = combined.slice(0, 60).replace(/-+$/g, "");
  return trimmed.length > 0 ? trimmed : "job";
}

export function uniqueSlug(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
