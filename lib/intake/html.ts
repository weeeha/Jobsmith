import TurndownService from "turndown";
import { parseHTML } from "linkedom";
import { MAX_ARTICLE_HTML } from "./values";

function turndown(): TurndownService {
  const service = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "_",
    strongDelimiter: "**",
  });
  // "svg" is a valid tag name at runtime but @types/turndown narrows its
  // Filter type to `keyof HTMLElementTagNameMap`, which the DOM lib defines
  // without "svg" (it lives in SVGElementTagNameMap instead); the cast below
  // only satisfies that overly narrow ambient type, it changes no behavior.
  service.remove([
    "script",
    "style",
    "noscript",
    "iframe",
    "form",
    "button",
    "svg",
    "picture",
    "video",
    "audio",
    "canvas",
    "input",
    "select",
    "textarea",
    "template",
  ] as TurndownService.TagName[]);
  // turndown 7.2.4 ships a built-in default rule for "img" (one of the
  // handful of tags with a first-class commonmark rule), and that default
  // rule is checked before the .remove() list above, so .remove(["img"])
  // alone has no effect: an <img> would still turn into markdown image
  // syntax. This explicit rule replaces it with nothing, actually dropping
  // it (verified: without this rule, "<img src=x>" survives as "![](x)").
  service.addRule("img", { filter: "img", replacement: () => "" });
  return service;
}

export function tidyMarkdown(markdown: string): string {
  return markdown
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/^(\s*)-\s{2,}/gm, "$1- ")
    .replace(/^(\s*\d+\.)\s{2,}/gm, "$1 ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function htmlToMarkdown(html: string): string {
  return tidyMarkdown(turndown().turndown(html.slice(0, MAX_ARTICLE_HTML)));
}

export function decodeIfEncoded(html: string): string {
  if (/<[a-z!/]/i.test(html) || !/&lt;/i.test(html)) return html;
  const { document } = parseHTML("<!doctype html><html><body><div id=x></div></body></html>");
  const div = document.getElementById("x")!;
  div.innerHTML = html;
  return div.textContent ?? "";
}
