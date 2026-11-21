import { parseQuestionBank, type IncludeResolver, type ParsedBlock } from "./parse";

function stripMd(fileName: string): string {
  return fileName.replace(/\.md$/i, "").toLowerCase();
}

// An include names a file; a document is found by its key. The owner's files
// carry a company prefix ("nwt-curveballs.md"), the keys may not, and the
// other way round, so a match is the exact key or a "-" suffix either way.
export function includeMatches(fileName: string, key: string): boolean {
  const name = stripMd(fileName);
  const k = key.toLowerCase();
  return name === k || name.endsWith(`-${k}`) || k.endsWith(`-${name}`);
}

export function makeIncludeResolver(docs: { key: string; bodyMd: string }[]): IncludeResolver {
  const parsed = new Map<string, ReturnType<typeof parseQuestionBank>>();

  function find(file: string) {
    const name = stripMd(file);
    const exact = docs.find((d) => d.key.toLowerCase() === name);
    return exact ?? docs.find((d) => includeMatches(file, d.key));
  }

  return (file, number): ParsedBlock[] | null => {
    const doc = find(file);
    if (!doc) return null;
    let result = parsed.get(doc.key);
    if (!result) {
      // Depth one: an included question never resolves includes of its own.
      result = parseQuestionBank(doc.bodyMd);
      parsed.set(doc.key, result);
    }
    const question = result.questions.find((q) => q.number === number);
    if (!question) return null;
    return question.blocks.filter((b) => b.spoken);
  };
}
