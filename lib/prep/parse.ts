export type ParsedBlock = { label: string; spoken: boolean; text: string };
export type ParseWarning = {
  code: "unknown_label" | "marker_inside_quote" | "unresolved_include";
  line: number;
  question: number | null;
  message: string;
};
export type ParsedQuestion = {
  section: string | null;
  number: number;
  position: number;
  question: string;
  questionKey: string;
  blocks: ParsedBlock[];
  spine: string | null;
  lastLine: string | null;
  guard: string | null;
  unfilled: boolean;
  hasAnswer: boolean;
  unresolvedIncludes: number;
};
export type IncludeResolver = (file: string, number: number) => ParsedBlock[] | null;
export type ParseResult = { questions: ParsedQuestion[]; warnings: ParseWarning[] };
