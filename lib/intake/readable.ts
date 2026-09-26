import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import { htmlToMarkdown } from "./html";
import { jobPostingFromJsonLd, type JsonLdPosting } from "./json-ld";
import { visibleTextLength } from "./text";
import { MIN_POSTING_TEXT, MAX_POSTING_CHARS } from "./values";

export type ReadablePage = { bodyMd: string; textLength: number; jsonLd: JsonLdPosting | null };

export function readablePage(html: string): ReadablePage {
  const { document } = parseHTML(html);
  // JSON-LD first: Readability strips every <script> as part of its own
  // cleanup, so reading it afterward would always find nothing.
  const jsonLd = jobPostingFromJsonLd(document as unknown as Document);
  const article = new Readability(document as unknown as Document, { charThreshold: 200 }).parse();
  const fallbackHtml = (document as unknown as Document).body?.innerHTML ?? "";
  const articleMd = htmlToMarkdown(article?.content ?? fallbackHtml);
  const preferJsonLd = jsonLd?.bodyMd && visibleTextLength(jsonLd.bodyMd) >= MIN_POSTING_TEXT;
  const bodyMd = (preferJsonLd ? jsonLd!.bodyMd! : articleMd).slice(0, MAX_POSTING_CHARS);
  return { bodyMd, textLength: visibleTextLength(bodyMd), jsonLd };
}
