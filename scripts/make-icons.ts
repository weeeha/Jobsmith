// Renders the brand mark into the PWA icons with Playwright's Chromium.
// Outputs are committed; nothing runs at build time. Usage: pnpm icons
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = path.resolve(import.meta.dirname, "..");
const BACKGROUND = "#fafafa";
// The maskable safe zone is the central 80 percent; the mark stays inside it.
const MARK_SHARE = 0.6;

const mark = readFileSync(path.join(root, "public/brand/mark.svg"), "utf8");
const markUri = `data:image/svg+xml;base64,${Buffer.from(mark).toString("base64")}`;

const targets: { size: number; file: string }[] = [
  // app/apple-icon.png (180 px) is deliberately not rendered here: the existing
  // file is a light J on a dark tile, and a light-tile render looked different.
  { size: 192, file: "public/icons/icon-192.png" },
  { size: 512, file: "public/icons/icon-512.png" },
];

async function main(): Promise<void> {
  mkdirSync(path.join(root, "public/icons"), { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const { size, file } of targets) {
      const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
      const markSize = Math.round(size * MARK_SHARE);
      await page.setContent(
        `<style>html,body{margin:0;width:${size}px;height:${size}px;background:${BACKGROUND};display:grid;place-items:center}` +
          `img{width:${markSize}px;height:${markSize}px;display:block}</style><img src="${markUri}" alt="">`,
      );
      await page.waitForFunction(() => (document.querySelector("img") as HTMLImageElement).complete);
      const png = await page.screenshot({ type: "png", omitBackground: false });
      writeFileSync(path.join(root, file), png);
      await page.close();
      console.log(`wrote ${file} (${size}x${size})`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
