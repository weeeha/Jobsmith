import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Writes the name, version, license identifier and license text of every
// production dependency, for the image's THIRD_PARTY_LICENSES.txt.
//   node scripts/licenses-collect.mjs [--out THIRD_PARTY_LICENSES.txt] [--input report.json]
// --input reads a saved `pnpm licenses list --prod --json` report instead of
// running pnpm (used by the tests).

const LICENSE_FILE = /^(licen[cs]e|copying|unlicen[cs]e)([-._].*)?$/i;

/** The report is { [license]: [{ name, versions, paths, license }] }. */
export function packagesOf(report) {
  const rows = [];
  for (const [group, entries] of Object.entries(report)) {
    for (const entry of entries) {
      entry.versions.forEach((version, i) => {
        rows.push({
          name: entry.name,
          version,
          license: entry.license ?? group,
          dir: entry.paths[i] ?? entry.paths[0],
        });
      });
    }
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

function licenseText(row) {
  let files;
  try {
    files = readdirSync(row.dir).filter((f) => LICENSE_FILE.test(f)).sort();
  } catch (error) {
    throw new Error(`Cannot read the license of ${row.name}@${row.version}: ${error.message}`);
  }
  if (files.length === 0) {
    // Some packages ship no license file. The declared identifier in their
    // package.json is the only text there is; without it the build fails.
    let declared;
    try {
      declared = JSON.parse(readFileSync(path.join(row.dir, "package.json"), "utf8")).license;
    } catch {
      declared = undefined;
    }
    if (typeof declared !== "string" || declared === "") {
      throw new Error(`Cannot read the license of ${row.name}@${row.version}: no license file in ${row.dir}`);
    }
    return `(No license file is shipped with this package; its package.json declares ${declared}.)`;
  }
  return files.map((f) => readFileSync(path.join(row.dir, f), "utf8").trim()).join("\n\n");
}

export function collectLicenses(report) {
  const rule = "=".repeat(72);
  return (
    packagesOf(report)
      .map((row) => `${rule}\n${row.name} ${row.version}\nLicense: ${row.license}\n${rule}\n\n${licenseText(row)}\n`)
      .join("\n")
  );
}

export function writeLicenses(report, out) {
  writeFileSync(out, collectLicenses(report));
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = arg("--input");
  const raw = input
    ? readFileSync(input, "utf8")
    : execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const out = arg("--out", "THIRD_PARTY_LICENSES.txt");
  try {
    writeLicenses(JSON.parse(raw), out);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  console.log(`Wrote ${out}`);
}
