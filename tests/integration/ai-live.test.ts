import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseAiConfig } from "@/lib/ai/config";
import { driverFromConfig } from "@/lib/ai";
import { extractPosting } from "@/lib/ai/extract-posting";
import { scoreFit } from "@/lib/ai/score-fit";
import { textToMarkdown } from "@/lib/intake/text";
import { DEFAULT_PREFERENCES } from "@/lib/preferences/schema";
import { readResumeFixture } from "../helpers/profile";

const live = process.env.JOBSMITH_LIVE_AI === "1";

describe.skipIf(!live)("extractPosting (live)", () => {
  it("extracts company and role from the Northwind Traders fixture through the real configured driver", async () => {
    const parsed = parseAiConfig(process.env);
    if (!parsed.ok || !parsed.config || parsed.config.provider === "fake") {
      throw new Error("Set AI_PROVIDER (gateway or anthropic) and its key to run this test.");
    }
    const driver = driverFromConfig(parsed.config);
    const text = fs.readFileSync(path.join(process.cwd(), "tests/fixtures/intake/pasted-posting.txt"), "utf-8");

    const outcome = await extractPosting(driver, text, "plain", { userId: "live-test-user" });

    expect(outcome.status).toBe("extracted");
    expect(outcome.fields.companyName).toBe("Northwind Traders");
    expect(outcome.fields.roleTitle).toBe("Product Designer");
  });
});

describe.skipIf(!live)("scoreFit (live)", () => {
  it("scores the Northwind Traders posting against the resume fixture through the real configured driver", async () => {
    const parsed = parseAiConfig(process.env);
    if (!parsed.ok || !parsed.config || parsed.config.provider === "fake") {
      throw new Error("Set AI_PROVIDER (gateway or anthropic) and its key to run this test.");
    }
    const driver = driverFromConfig(parsed.config);
    const text = fs.readFileSync(path.join(process.cwd(), "tests/fixtures/intake/pasted-posting.txt"), "utf-8");

    const outcome = await scoreFit(
      driver,
      {
        posting: {
          roleTitle: "Product Designer",
          companyName: "Northwind Traders",
          location: null,
          workMode: null,
          compMin: null,
          compMax: null,
          compCurrency: null,
          bodyMd: textToMarkdown(text),
        },
        headline: null,
        resumeMd: readResumeFixture(),
        preferences: DEFAULT_PREFERENCES,
      },
      { userId: "live-test-user" },
    );

    expect(outcome.status).toBe("scored");
    expect(outcome.fit?.score).toBeGreaterThanOrEqual(0);
    expect(outcome.fit?.score).toBeLessThanOrEqual(100);
    expect(outcome.fit?.summary.length).toBeGreaterThan(0);
  });
});
