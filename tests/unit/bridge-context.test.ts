import { describe, expect, it } from "vitest";
import { buildContextDocument } from "@/lib/bridge/context";
import type { ContextLibrary, ContextPrep } from "@/lib/bridge/context-prep";
import type { JobView } from "@/lib/pipeline/read";
import type { OpportunityRow, CompanyRow, StageRow, LinkedPerson, PersonRow, ArtifactMeta } from "@/lib/db/scoped";

function opportunityRow(partial: Partial<OpportunityRow>): OpportunityRow {
  return {
    id: "o1",
    userId: "u1",
    companyId: "c1",
    slug: "acme-designer",
    roleTitle: "Product Designer",
    location: null,
    workMode: null,
    source: "manual",
    sourceUrl: null,
    postingMd: null,
    postingCapturedAt: null,
    compMin: null,
    compMax: null,
    compCurrency: null,
    compNote: null,
    myAsk: null,
    fitScore: null,
    fit: null,
    fitStatus: "none",
    needsReview: false,
    currentStageId: "s1",
    status: "active",
    closedReason: null,
    closedAt: null,
    closedStageId: null,
    nextAction: null,
    nextActionAt: null,
    dedupeHash: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...partial,
  } as OpportunityRow;
}

function companyRow(partial: Partial<CompanyRow>): CompanyRow {
  return {
    id: "c1",
    userId: "u1",
    name: "Acme Robotics",
    nameKey: "acmerobotics",
    domain: null,
    careersUrl: null,
    atsKind: null,
    atsOrg: null,
    size: null,
    industry: null,
    hq: null,
    notesMd: null,
    tracked: false,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...partial,
  } as CompanyRow;
}

function stageRow(partial: Partial<StageRow> & Pick<StageRow, "id" | "kind" | "label" | "position">): StageRow {
  return {
    userId: "u1",
    opportunityId: "o1",
    status: "upcoming",
    scheduledAt: null,
    format: null,
    enteredAt: null,
    completedAt: null,
    outcomeMd: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...partial,
  } as StageRow;
}

function personRow(partial: Partial<PersonRow> & Pick<PersonRow, "id" | "name">): PersonRow {
  return {
    userId: "u1",
    companyId: "c1",
    title: null,
    linkedinUrl: null,
    email: null,
    notesMd: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...partial,
  } as PersonRow;
}

function linkedPerson(partial: Partial<LinkedPerson> & { person: PersonRow }): LinkedPerson {
  return { linkId: partial.person.id, role: "other", stageId: null, ...partial };
}

function artifactMeta(partial: Partial<ArtifactMeta> & { key: string; kind: ArtifactMeta["kind"] }): ArtifactMeta {
  return {
    id: partial.key,
    title: partial.key,
    stageId: null,
    opportunityId: null,
    companyId: null,
    version: 1,
    contentHash: "h",
    sourceHash: "h",
    origin: "pushed",
    editedAt: null,
    sentAt: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    ...partial,
  } as ArtifactMeta;
}

const generatedAt = new Date("2026-09-23T18:00:00.000Z");
const EMPTY_PREP: ContextPrep = { banks: [] };
const EMPTY_LIBRARY: ContextLibrary = { items: [] };
const TAIL = ["## Prep", "", "No question banks parsed yet.", "", "## Library", "", "No library items yet.", ""];

describe("buildContextDocument, a rich fixture", () => {
  const stageDone = stageRow({
    id: "s0",
    kind: "saved",
    label: "Saved",
    position: 0,
    status: "done",
    completedAt: new Date("2026-09-01T10:00:00.000Z"),
  });
  const stageCurrent = stageRow({
    id: "s1",
    kind: "recruiter_screen",
    label: "Recruiter | screen",
    position: 1,
    status: "scheduled",
    scheduledAt: new Date("2026-09-10T15:00:00.000Z"),
  });
  const view: JobView = {
    opportunity: opportunityRow({
      postingMd: "See the ```js\nconst x = 1;\n``` snippet inline.",
      postingCapturedAt: new Date("2026-08-20T09:00:00.000Z"),
    }),
    company: companyRow({
      // Plants a resume-shaped sentence in a field the template never
      // reads, so a careless implementation that spreads the whole company
      // row into the document would be caught here.
      notesMd: "Managed a resume-writing team of six across two offices.",
    }),
    stages: [stageDone, stageCurrent],
    currentStage: stageCurrent,
    people: [
      linkedPerson({
        role: "recruiter",
        stageId: "s1",
        person: personRow({
          id: "p1",
          name: "Priya Raman",
          title: "Recruiter",
          linkedinUrl: "https://linkedin.com/in/priya",
          email: "priya@example-mail.test",
          notesMd: "Prefers async updates.\nFollow up Friday.",
        }),
      }),
      linkedPerson({
        role: "hiring_manager",
        person: personRow({ id: "p2", name: "Sam Okafor" }),
      }),
    ],
    events: [],
    documents: [artifactMeta({ key: "cv", kind: "cv", version: 2, updatedAt: new Date("2026-09-05T12:00:00.000Z") })],
  };
  const companyDocuments = [
    artifactMeta({ key: "recon", kind: "research", updatedAt: new Date("2026-09-02T08:00:00.000Z") }),
  ];

  const doc = buildContextDocument({ view, companyDocuments, generatedAt, prep: EMPTY_PREP, library: EMPTY_LIBRARY });

  it("matches the exact expected document", () => {
    expect(doc).toBe(
      [
        "---",
        "jobsmith: context/v1",
        'slug: "acme-designer"',
        'company: "Acme Robotics"',
        'role: "Product Designer"',
        "status: active",
        'current_stage: "Recruiter | screen"',
        "current_stage_kind: recruiter_screen",
        "generated: 2026-09-23T18:00:00.000Z",
        "---",
        "",
        "# Product Designer at Acme Robotics",
        "",
        "## Posting",
        "",
        "Captured 2026-08-20T09:00:00.000Z.",
        "",
        "````markdown",
        "See the ```js",
        "const x = 1;",
        "``` snippet inline.",
        "````",
        "",
        "## Stages",
        "",
        "| # | Kind | Label | Status | Date | People |",
        "|---|---|---|---|---|---|",
        "| 1 | saved | Saved | done | 2026-09-01T10:00:00.000Z |  |",
        "| 2 | recruiter_screen | Recruiter \\| screen | current | 2026-09-10T15:00:00.000Z | Priya Raman |",
        "",
        "## People",
        "",
        "- Priya Raman, Recruiter. Role: Recruiter. Stage: Recruiter | screen. LinkedIn: https://linkedin.com/in/priya.",
        "  Notes:",
        "  Prefers async updates.",
        "  Follow up Friday.",
        "- Sam Okafor. Role: Hiring manager.",
        "",
        "## Preferences",
        "",
        "No preferences saved yet.",
        "",
        "## Artifacts",
        "",
        "| Key | Kind | Scope | Stage | Version | Updated |",
        "|---|---|---|---|---|---|",
        "| cv | cv | job |  | 2 | 2026-09-05T12:00:00.000Z |",
        "| recon | research | company |  | 1 | 2026-09-02T08:00:00.000Z |",
        "",
        ...TAIL,
      ].join("\n"),
    );
  });

  it("never includes the company's internal notes or a person's email address", () => {
    expect(doc).not.toContain("resume-writing team");
    expect(doc).not.toContain("priya@example-mail.test");
  });

  it("the fence is one backtick longer than the longest run already inside the posting", () => {
    // The posting's own longest run is three backticks; the fence used to
    // wrap it is four, so the posting's own ``` never closes the block early.
    expect(doc).toContain("````markdown");
    expect(doc).toContain("````\n");
  });
});

describe("buildContextDocument, a bare fixture", () => {
  const stage = stageRow({ id: "s0", kind: "saved", label: "Saved", position: 0, status: "upcoming" });
  const view: JobView = {
    opportunity: opportunityRow({ slug: "bare-job", roleTitle: "Engineer", status: "closed" }),
    company: companyRow({ name: "Bare Co" }),
    stages: [stage],
    currentStage: stage,
    people: [],
    events: [],
    documents: [],
  };

  const doc = buildContextDocument({ view, companyDocuments: [], generatedAt, prep: EMPTY_PREP, library: EMPTY_LIBRARY });

  it("falls back to the fixed sentence in Posting, People and Artifacts, and still emits the Stages table", () => {
    expect(doc).toBe(
      [
        "---",
        "jobsmith: context/v1",
        'slug: "bare-job"',
        'company: "Bare Co"',
        'role: "Engineer"',
        "status: closed",
        'current_stage: "Saved"',
        "current_stage_kind: saved",
        "generated: 2026-09-23T18:00:00.000Z",
        "---",
        "",
        "# Engineer at Bare Co",
        "",
        "## Posting",
        "",
        "No posting text saved.",
        "",
        "## Stages",
        "",
        "| # | Kind | Label | Status | Date | People |",
        "|---|---|---|---|---|---|",
        "| 1 | saved | Saved | current |  |  |",
        "",
        "## People",
        "",
        "No people linked to this job.",
        "",
        "## Preferences",
        "",
        "No preferences saved yet.",
        "",
        "## Artifacts",
        "",
        "No artifacts yet.",
        "",
        ...TAIL,
      ].join("\n"),
    );
  });
});

describe("buildContextDocument, Prep and Library sections", () => {
  const stage = stageRow({ id: "s0", kind: "saved", label: "Saved", position: 0, status: "upcoming" });
  const view: JobView = {
    opportunity: opportunityRow({ slug: "bare-job", roleTitle: "Engineer" }),
    company: companyRow({ name: "Bare Co" }),
    stages: [stage],
    currentStage: stage,
    people: [],
    events: [],
    documents: [],
  };
  const prep: ContextPrep = {
    banks: [
      {
        key: "answers-full",
        title: "Full answers",
        questions: [
          { number: 1, section: "Motivation", question: "Tell me about yourself", level: "solid", lastDrilledAt: new Date("2026-11-19T22:30:00.000Z") },
          { number: 3, section: null, question: "Walk me through\na project | any", level: null, lastDrilledAt: null },
          { number: 4, section: "Craft", question: "Why this team?", level: "shaky", lastDrilledAt: null },
        ],
      },
      { key: "answers-short", title: "Short answers", questions: [{ number: 1, section: null, question: "Why now", level: "okay", lastDrilledAt: null }] },
    ],
  };
  const library: ContextLibrary = {
    items: [
      { title: "Tell me about yourself", kind: "answer", tags: ["opener", "story"] },
      { title: "A shop owner who kept orders\non paper", kind: "story", tags: [] },
    ],
  };
  const doc = buildContextDocument({ view, companyDocuments: [], generatedAt, prep, library });
  const section = (name: string) => doc.slice(doc.indexOf(`## ${name}\n`));

  it("adds ## Prep after ## Artifacts and ## Library after it", () => {
    expect(doc.indexOf("## Artifacts")).toBeLessThan(doc.indexOf("## Prep"));
    expect(doc.indexOf("## Prep")).toBeLessThan(doc.indexOf("## Library"));
  });

  it("groups one line per question under a heading per bank with its title and key", () => {
    expect(section("Prep").split("## Library")[0]).toBe(
      [
        "## Prep",
        "",
        "### Full answers (answers-full)",
        "",
        "- 1. Tell me about yourself. Section: Motivation. Mark: solid. Last drilled: 2026-11-19.",
        "- 3. Walk me through a project | any. Mark: none. Last drilled: never.",
        "- 4. Why this team? Section: Craft. Mark: shaky. Last drilled: never.",
        "",
        "### Short answers (answers-short)",
        "",
        "- 1. Why now. Mark: okay. Last drilled: never.",
        "",
        "",
      ].join("\n"),
    );
  });

  it("lists ## Library with title, kind and tags, 'Tags: none' for no tags", () => {
    expect(section("Library")).toBe(
      [
        "## Library",
        "",
        "- Tell me about yourself (answer). Tags: opener, story.",
        "- A shop owner who kept orders on paper (story). Tags: none.",
        "",
      ].join("\n"),
    );
  });

  it("prints the fallback lines when there are no banks or no items", () => {
    const bare = buildContextDocument({ view, companyDocuments: [], generatedAt, prep: EMPTY_PREP, library: EMPTY_LIBRARY });
    expect(bare).toContain("## Prep\n\nNo question banks parsed yet.\n");
    expect(bare).toContain("## Library\n\nNo library items yet.\n");
  });

  it("keeps the context/v1 frontmatter and every earlier section unchanged", () => {
    const bare = buildContextDocument({ view, companyDocuments: [], generatedAt, prep: EMPTY_PREP, library: EMPTY_LIBRARY });
    expect(doc.startsWith("---\njobsmith: context/v1\n")).toBe(true);
    expect(doc.slice(0, doc.indexOf("## Prep"))).toBe(bare.slice(0, bare.indexOf("## Prep")));
  });

  it("carries no answer text, audio or recording reference", () => {
    expect(doc).not.toMatch(/audio|recording|asset/i);
  });
});
