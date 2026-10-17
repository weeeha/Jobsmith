import { describe, expect, it } from "vitest";
import { fitReadiness } from "@/lib/fit/readiness";

const READY = { aiOn: true, postingMd: "About the job", resumeMd: "# Resume" };

describe("fitReadiness", () => {
  it("is ready with AI on, a posting and a resume", () => {
    expect(fitReadiness(READY)).toBe("ready");
  });

  it("checks AI first, then the posting, then the resume", () => {
    expect(fitReadiness({ aiOn: false, postingMd: null, resumeMd: null })).toBe("ai_off");
    expect(fitReadiness({ aiOn: true, postingMd: null, resumeMd: null })).toBe("no_posting");
    expect(fitReadiness({ aiOn: true, postingMd: "About the job", resumeMd: null })).toBe("no_resume");
  });

  it("treats blank text as missing", () => {
    expect(fitReadiness({ ...READY, postingMd: "  \n " })).toBe("no_posting");
    expect(fitReadiness({ ...READY, resumeMd: "" })).toBe("no_resume");
  });
});
