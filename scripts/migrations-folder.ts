import fs from "node:fs";
import path from "node:path";

/**
 * The bundled command sits in commands/ with a copy of the migrations beside
 * it (commands/migrations). From source, scripts/ has no such folder, so the
 * repository's own lib/db/migrations is used.
 */
export function resolveMigrationsFolder(
  dir: string,
  exists: (p: string) => boolean = fs.existsSync,
): string {
  const beside = path.resolve(dir, "migrations");
  return exists(beside) ? beside : path.resolve(dir, "../lib/db/migrations");
}
