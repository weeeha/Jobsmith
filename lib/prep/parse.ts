import { classifyLabel } from "./labels";
import { questionKey } from "./question-key";
import { WARNING_MARKER } from "./values";

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

const QUESTION_LINE = /^### (\d+)\. (.*)$/;
const BOLD_LABEL = /^\*\*([^*]+?)(:?)\*\*(:?)\s*(.*)$/;
const ITALIC_LABEL = /^\*([^*]+?):\*\s*(.*)$/;
const INCLUDE_LINE = /^\{\{include\s+(\S+)\s+(\d+)(?:\s+(\S+))?\}\}\s*$/;

const OPEN_QUOTES = new Set(["\u201C", "\u2018"]);
const CLOSE_QUOTES = new Set(["\u201D", "\u2019"]);
const QUOTE_CHARS = /^["\u201C\u201D\u2018\u2019]+|["\u201C\u201D\u2018\u2019]+$/g;

type Slot = "spine" | "last_line" | "guard" | null;
type OpenBlock = { label: string; spoken: boolean; slot: Slot; lines: string[] };
type OpenQuestion = Omit<ParsedQuestion, "spine" | "lastLine" | "guard" | "hasAnswer" | "blocks"> & {
  slots: { spine: string | null; lastLine: string | null; guard: string | null };
};

function insideOpenQuote(text: string, index: number): boolean {
  const before = text.slice(0, index);
  const straight = (before.match(/"/g) ?? []).length;
  let curly = 0;
  for (const ch of before) {
    if (OPEN_QUOTES.has(ch)) curly += 1;
    else if (CLOSE_QUOTES.has(ch)) curly -= 1;
  }
  return straight % 2 === 1 || curly > 0;
}

function cleanQuestionText(raw: string): { text: string; unfilled: boolean; markerInsideQuote: boolean } {
  let text = raw;
  const at = text.indexOf(WARNING_MARKER);
  const unfilled = at !== -1;
  let markerInsideQuote = false;
  if (unfilled) {
    if (insideOpenQuote(text, at)) {
      markerInsideQuote = true;
      text = text.split(WARNING_MARKER).join("");
    } else {
      text = text.slice(0, at);
    }
  }
  const paren = text.indexOf(" (");
  if (paren !== -1) text = text.slice(0, paren);
  text = text.trim().replace(QUOTE_CHARS, "").replace(/\s+/g, " ").trim();
  return { text, unfilled, markerInsideQuote };
}

// A tolerant, pure reader for the owner's question files (spec 5.1). It never
// throws: anything it does not understand becomes a note block or a warning.
export function parseQuestionBank(
  bodyMd: string,
  options: { resolveInclude?: IncludeResolver } = {},
): ParseResult {
  const lines = bodyMd.replace(/\r\n?/g, "\n").split("\n");
  const questions: ParsedQuestion[] = [];
  const warnings: ParseWarning[] = [];

  let section: string | null = null;
  let current: { q: OpenQuestion; blocks: ParsedBlock[] } | null = null;
  let block: OpenBlock | null = null;
  let ignoring = false;

  const warn = (code: ParseWarning["code"], line: number, message: string) => {
    warnings.push({ code, line, question: current ? current.q.number : null, message });
  };

  const finishBlock = () => {
    if (!current || !block) {
      block = null;
      return;
    }
    const text = block.lines.join("\n").trim();
    if (block.spoken) {
      if (text !== "") current.blocks.push({ label: block.label, spoken: true, text });
    } else {
      current.blocks.push({ label: block.label, spoken: false, text });
      if (block.slot && text !== "") {
        const slots = current.q.slots;
        if (block.slot === "spine" && slots.spine === null) slots.spine = text;
        if (block.slot === "last_line" && slots.lastLine === null) slots.lastLine = text;
        if (block.slot === "guard" && slots.guard === null) slots.guard = text;
      }
    }
    block = null;
  };

  const finishQuestion = () => {
    finishBlock();
    if (!current) return;
    const { slots, ...rest } = current.q;
    questions.push({
      ...rest,
      blocks: current.blocks,
      spine: slots.spine,
      lastLine: slots.lastLine,
      guard: slots.guard,
      hasAnswer: current.blocks.some((b) => b.spoken),
    });
    current = null;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const line = lines[i].trimEnd();

    const heading = QUESTION_LINE.exec(line);
    if (heading) {
      const cleaned = cleanQuestionText(heading[2]);
      if (cleaned.text !== "") {
        finishQuestion();
        ignoring = false;
        const number = Number(heading[1]);
        current = {
          q: {
            section,
            number,
            position: questions.length,
            question: cleaned.text,
            questionKey: questionKey(cleaned.text),
            unfilled: cleaned.unfilled,
            unresolvedIncludes: 0,
            slots: { spine: null, lastLine: null, guard: null },
          },
          blocks: [],
        };
        if (cleaned.markerInsideQuote) {
          warn(
            "marker_inside_quote",
            lineNo,
            `The warning marker sits inside the quotes of question ${number}; the question text was kept.`,
          );
        }
        continue;
      }
    }
    if (line.startsWith("### ")) {
      finishQuestion();
      ignoring = false;
      continue;
    }
    if (line.startsWith("## ")) {
      finishQuestion();
      ignoring = false;
      section = line.slice(3).trim() || null;
      continue;
    }
    if (line.startsWith("# ")) continue;
    if (line.startsWith("#### ")) {
      finishBlock();
      ignoring = true;
      continue;
    }
    if (line.trim() === "---") {
      finishBlock();
      continue;
    }
    if (!current) continue;

    const bold = BOLD_LABEL.exec(line);
    const italic = bold ? null : ITALIC_LABEL.exec(line);
    if (bold || italic) {
      finishBlock();
      ignoring = false;
      const rawLabel = bold ? bold[1] : italic![1];
      const rest = bold ? bold[4] : italic![2];
      const cls = classifyLabel(rawLabel, bold ? "bold" : "italic");
      if (cls.kind === "unknown") {
        warn("unknown_label", lineNo, `Unknown label "${cls.label}" in question ${current.q.number}; read as a note, not speech.`);
      }
      block = {
        label: cls.label,
        spoken: cls.kind === "spoken",
        slot: cls.kind === "note" ? cls.slot : null,
        lines: [rest],
      };
      continue;
    }

    const include = INCLUDE_LINE.exec(line);
    if (include) {
      finishBlock();
      ignoring = false;
      const file = include[1];
      const number = Number(include[2]);
      const resolved = options.resolveInclude ? options.resolveInclude(file, number) : null;
      if (resolved) {
        for (const b of resolved) {
          if (b.spoken && b.text.trim() !== "") current.blocks.push({ label: b.label, spoken: true, text: b.text });
        }
      } else {
        current.blocks.push({
          label: "",
          spoken: false,
          text: `Includes question ${number} of ${file}, not found here`,
        });
        current.q.unresolvedIncludes += 1;
        warn("unresolved_include", lineNo, `Question ${number} of ${file} was not found, so it is not read.`);
      }
      continue;
    }

    if (ignoring) continue;
    if (block) {
      block.lines.push(line);
    } else if (line.trim() !== "") {
      block = { label: "", spoken: false, slot: null, lines: [line] };
    }
  }
  finishQuestion();

  return { questions, warnings };
}
