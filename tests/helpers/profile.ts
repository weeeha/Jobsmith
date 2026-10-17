import fs from "node:fs";
import path from "node:path";
import type { Scoped } from "@/lib/db/scoped";

export function readResumeFixture(): string {
  return fs.readFileSync(path.join(process.cwd(), "tests/fixtures/fit/resume.md"), "utf-8");
}

/**
 * Writes the caller's profile row. Left out, the resume is the fictional
 * fixture and the zone is UTC; pass `resumeMd: null` for a profile with no
 * resume. `preferences` is stored as given, so a test can seed data that no
 * longer parses.
 */
export async function seedProfile(
  s: Scoped,
  values: { headline?: string | null; resumeMd?: string | null; timezone?: string; preferences?: unknown } = {},
): Promise<void> {
  await s.profile.upsert({
    headline: values.headline ?? null,
    resumeMd: values.resumeMd === undefined ? readResumeFixture() : values.resumeMd,
    timezone: values.timezone ?? "UTC",
    preferences: values.preferences ?? {},
  });
}
