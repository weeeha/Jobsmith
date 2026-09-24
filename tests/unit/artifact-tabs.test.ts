import { describe, expect, it } from "vitest";
import {
  parseDocRef,
  formatDocRef,
  scopeOf,
  docsForTab,
  researchGroups,
  prepGroups,
  selectDoc,
  stagesWithArtifacts,
  type DocGroup,
} from "@/lib/artifacts/tabs";
import type { ArtifactMeta } from "@/lib/db/scoped";

function meta(partial: Partial<ArtifactMeta> & { key: string; kind: ArtifactMeta["kind"] }): ArtifactMeta {
  return {
    id: partial.key,
    title: partial.key,
    stageId: null,
    companyId: null,
    opportunityId: "o1",
    version: 1,
    contentHash: "h",
    sourceHash: "h",
    origin: "pushed",
    editedAt: null,
    sentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as ArtifactMeta;
}

describe("parseDocRef / formatDocRef / scopeOf", () => {
  it("parses a job ref", () => {
    expect(parseDocRef("job:cv")).toEqual({ scope: "opportunity", key: "cv" });
  });

  it("parses a company ref", () => {
    expect(parseDocRef("company:recon")).toEqual({ scope: "company", key: "recon" });
  });

  it("rejects an unknown prefix, a bad key, an array value, or undefined", () => {
    expect(parseDocRef("weird:cv")).toBeNull();
    expect(parseDocRef("job:Not Valid!")).toBeNull();
    expect(parseDocRef(["job:cv", "job:cover-letter"])).toBeNull();
    expect(parseDocRef(undefined)).toBeNull();
  });

  it("formatDocRef is the exact inverse of a valid parseDocRef", () => {
    expect(formatDocRef({ scope: "opportunity", key: "cv" })).toBe("job:cv");
    expect(formatDocRef({ scope: "company", key: "recon" })).toBe("company:recon");
  });

  it("scopeOf reads company scope from a null vs set companyId", () => {
    expect(scopeOf({ companyId: null })).toBe("opportunity");
    expect(scopeOf({ companyId: "c1" })).toBe("company");
  });
});

const jobDocs: ArtifactMeta[] = [
  meta({ key: "cv", kind: "cv", title: "CV" }),
  meta({ key: "fit-brief", kind: "fit_brief", title: "Fit brief" }),
  meta({ key: "hr-bank", kind: "question_bank", title: "HR bank", stageId: "s1" }),
  meta({ key: "unstaged-notes", kind: "debrief", title: "Notes" }),
  meta({ key: "ghost", kind: "glossary", title: "Ghost", stageId: "does-not-exist" }),
];
const companyDocs: ArtifactMeta[] = [meta({ key: "recon", kind: "research", title: "Recon", companyId: "c1" })];

describe("docsForTab", () => {
  it("filters to the given tab", () => {
    expect(docsForTab(jobDocs, "research").map((d) => d.key)).toEqual(["fit-brief"]);
  });

  it("sorts by kind registry order, then title, then key", () => {
    // question_bank, glossary, debrief in THAT registry order, not the
    // order the array happens to list them in.
    expect(docsForTab(jobDocs, "prep").map((d) => d.key)).toEqual(["hr-bank", "ghost", "unstaged-notes"]);
  });

  it("breaks a kind tie by title", () => {
    const twoCvs = [meta({ key: "cv-2", kind: "cv", title: "Zeta CV" }), meta({ key: "cv-1", kind: "cv", title: "Alpha CV" })];
    expect(docsForTab(twoCvs, "documents").map((d) => d.key)).toEqual(["cv-1", "cv-2"]);
  });
});

describe("researchGroups", () => {
  it("builds a job group then a company group, in that order", () => {
    const groups = researchGroups(jobDocs, companyDocs, "Northwind Labs");
    expect(groups).toEqual([
      { id: "job", heading: "This job", docs: [jobDocs[1]] },
      { id: "company", heading: "Shared with every job at Northwind Labs", docs: companyDocs },
    ] satisfies DocGroup[]);
  });

  it("drops an empty group entirely, rather than including it with no docs", () => {
    expect(researchGroups(jobDocs, [], "Northwind Labs").map((g) => g.id)).toEqual(["job"]);
    expect(researchGroups([], companyDocs, "Northwind Labs").map((g) => g.id)).toEqual(["company"]);
  });
});

describe("prepGroups", () => {
  const stages = [
    { id: "s1", label: "Recruiter screen", position: 1 },
    { id: "s0", label: "Saved", position: 0 },
  ];

  it("puts General first (including an unknown stageId), then stages by position", () => {
    const groups = prepGroups(jobDocs, stages);
    expect(groups.map((g) => ({ id: g.id, keys: g.docs.map((d) => d.key) }))).toEqual([
      { id: "general", keys: ["ghost", "unstaged-notes"] },
      { id: "s1", keys: ["hr-bank"] },
    ]);
  });

  it("drops a stage group with no prep docs (Saved has none here)", () => {
    expect(prepGroups(jobDocs, stages).some((g) => g.id === "s0")).toBe(false);
  });

  it("drops General too when every prep doc is staged", () => {
    const allStaged = [meta({ key: "hr-bank", kind: "question_bank", stageId: "s1" })];
    expect(prepGroups(allStaged, stages).map((g) => g.id)).toEqual(["s1"]);
  });
});

describe("selectDoc", () => {
  const groups = researchGroups(jobDocs, companyDocs, "Northwind Labs");

  it("returns the doc matching the ref when one is given", () => {
    expect(selectDoc(groups, { scope: "company", key: "recon" })?.key).toBe("recon");
  });

  it("falls back to the first doc when no ref is given", () => {
    expect(selectDoc(groups, null)?.key).toBe("fit-brief");
  });

  it("falls back to the first doc for a ref that matches nothing (a stale link)", () => {
    expect(selectDoc(groups, { scope: "opportunity", key: "no-such-key" })?.key).toBe("fit-brief");
  });

  it("returns null when there are no groups at all", () => {
    expect(selectDoc([], null)).toBeNull();
  });
});

describe("stagesWithArtifacts", () => {
  it("collects the stage id of every doc that has one, ignoring null", () => {
    expect(Array.from(stagesWithArtifacts(jobDocs)).sort()).toEqual(["does-not-exist", "s1"]);
  });

  it("returns an empty set for a doc list with no staged docs", () => {
    expect(stagesWithArtifacts([meta({ key: "cv", kind: "cv" })]).size).toBe(0);
  });
});
