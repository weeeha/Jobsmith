import { describe, expect, it } from "vitest";
import { planUpsert, versionNotice, type UpsertIntent, type VersionState } from "@/lib/artifacts/plan";

const NOW = new Date("2026-09-19T12:00:00.000Z");

function version(partial: Partial<VersionState> & { version: number; contentHash: string }): VersionState {
  return {
    id: `v${partial.version}`,
    kind: "cv",
    title: "CV",
    stageId: null,
    sourceHash: null,
    origin: "pushed",
    editedAt: null,
    sentAt: null,
    ...partial,
  };
}

function intent(partial: Partial<UpsertIntent> & { origin: UpsertIntent["origin"]; hash: string }): UpsertIntent {
  return {
    kind: "cv",
    title: "CV",
    stageId: null,
    bodyMd: "# CV",
    ...partial,
  };
}

describe("planUpsert", () => {
  it.each(["pushed", "pasted", "manual", "generated"] as const)(
    "creates version 1 with no existing versions, origin %s",
    (origin) => {
      const plan = planUpsert([], intent({ origin, hash: "H1" }), NOW);
      expect(plan).toEqual({
        status: "created",
        insert: {
          version: 1,
          kind: "cv",
          title: "CV",
          stageId: null,
          bodyMd: "# CV",
          contentHash: "H1",
          sourceHash: origin === "manual" ? null : "H1",
          origin,
          editedAt: origin === "manual" ? NOW : null,
        },
      });
    },
  );

  it("rule 3: the same push after an in-place manual edit is unchanged and keeps the edit", () => {
    // v1 was pushed (sourceHash H1), then hand-edited in place: origin and
    // sourceHash stay as they were, only contentHash and editedAt change:
    // exactly what an in-place edit produces when the body is later hand-edited again.
    const edited = version({ version: 1, contentHash: "H2", sourceHash: "H1", origin: "pushed", editedAt: NOW });
    const plan = planUpsert([edited], intent({ origin: "pushed", hash: "H1" }), NOW);
    expect(plan).toEqual({ status: "unchanged", warning: null });
  });

  it("pushed after an edit versions, and versionNotice names the edited version", () => {
    const edited = version({ version: 1, contentHash: "H1", sourceHash: "H1", origin: "pushed", editedAt: NOW });
    const plan = planUpsert([edited], intent({ origin: "pushed", hash: "H3", bodyMd: "# v3" }), NOW);
    expect(plan).toEqual({
      status: "versioned",
      insert: { version: 2, kind: "cv", title: "CV", stageId: null, bodyMd: "# v3", contentHash: "H3", sourceHash: "H3", origin: "pushed", editedAt: null },
    });
    const v2 = version({ version: 2, contentHash: "H3", sourceHash: "H3", origin: "pushed" });
    expect(versionNotice([edited, v2], 2)).toBe("Pushed after you edited version 1.");
    expect(versionNotice([edited, v2], 1)).toBeNull();
  });

  it("a push matching only a pasted v1's content is unchanged", () => {
    const pasted = version({ version: 1, contentHash: "H1", sourceHash: "H1", origin: "pasted" });
    const plan = planUpsert([pasted], intent({ origin: "pushed", hash: "H1" }), NOW);
    expect(plan).toEqual({ status: "unchanged", warning: null });
  });

  it("a push matching an earlier push's sourceHash is unchanged even with a paste on top", () => {
    // The "reference" for a pushed/generated origin is the newest PUSHED OR
    // GENERATED version, not simply the latest version; this fails if that
    // lookup is implemented as "just check versions[versions.length - 1]".
    const pushedV1 = version({ version: 1, contentHash: "H1", sourceHash: "H1", origin: "pushed" });
    const pastedV2 = version({ version: 2, contentHash: "H2", sourceHash: "H2", origin: "pasted" });
    const plan = planUpsert([pushedV1, pastedV2], intent({ origin: "pushed", hash: "H1" }), NOW);
    expect(plan).toEqual({ status: "unchanged", warning: null });
  });

  it("pushed B over pushed A, then pasting B is unchanged", () => {
    const a = version({ version: 1, contentHash: "HA", sourceHash: "HA", origin: "pushed" });
    const b = version({ version: 2, contentHash: "HB", sourceHash: "HB", origin: "pushed" });
    const plan = planUpsert([a, b], intent({ origin: "pasted", hash: "HB", bodyMd: "# B" }), NOW);
    expect(plan).toEqual({ status: "unchanged", warning: null });
  });

  it("pasting content equal to an older version, but not the latest, still versions", () => {
    // This fails if "unchanged" were checked against ANY prior version's
    // content instead of only the latest one, as rule 3 requires.
    const a = version({ version: 1, contentHash: "HA", sourceHash: "HA", origin: "pasted" });
    const b = version({ version: 2, contentHash: "HB", sourceHash: "HB", origin: "pasted" });
    const plan = planUpsert([a, b], intent({ origin: "pasted", hash: "HA", bodyMd: "# A" }), NOW);
    expect(plan).toEqual({
      status: "versioned",
      insert: { version: 3, kind: "cv", title: "CV", stageId: null, bodyMd: "# A", contentHash: "HA", sourceHash: "HA", origin: "pasted", editedAt: null },
    });
  });

  it("a push over a sent latest versions, using the push's own metadata", () => {
    const sent = version({ version: 1, contentHash: "H1", sourceHash: "H1", origin: "pushed", sentAt: NOW });
    const plan = planUpsert([sent], intent({ origin: "pushed", hash: "H2", bodyMd: "# v2", title: "CV v2", stageId: "stage-1" }), NOW);
    expect(plan).toEqual({
      status: "versioned",
      insert: { version: 2, kind: "cv", title: "CV v2", stageId: "stage-1", bodyMd: "# v2", contentHash: "H2", sourceHash: "H2", origin: "pushed", editedAt: null },
    });
  });

  it("manual edit in place", () => {
    const v1 = version({ version: 1, contentHash: "H1", origin: "manual" });
    const plan = planUpsert([v1], intent({ origin: "manual", hash: "H2", bodyMd: "# edited" }), NOW);
    expect(plan).toEqual({ status: "edited", id: "v1", patch: { bodyMd: "# edited", contentHash: "H2", editedAt: NOW } });
  });

  it("manual edit on a sent latest versions and copies the LATEST version's own metadata, not the intent's", () => {
    const sent = version({ version: 1, contentHash: "H1", origin: "pushed", kind: "cv", title: "Kept title", stageId: "stage-1", sentAt: NOW });
    const plan = planUpsert(
      [sent],
      intent({ origin: "manual", hash: "H2", bodyMd: "# edited", kind: "cover_letter", title: "Ignored", stageId: "stage-9" }),
      NOW,
    );
    expect(plan).toEqual({
      status: "versioned",
      insert: { version: 2, kind: "cv", title: "Kept title", stageId: "stage-1", bodyMd: "# edited", contentHash: "H2", sourceHash: null, origin: "manual", editedAt: NOW },
    });
  });

  it("manual edit with an unchanged body is unchanged, with no metadata patch check", () => {
    const v1 = version({ version: 1, contentHash: "H1", origin: "manual" });
    const plan = planUpsert([v1], intent({ origin: "manual", hash: "H1" }), NOW);
    expect(plan).toEqual({ status: "unchanged", warning: null });
  });

  it("a manual edit whose base version matches the latest still edits in place", () => {
    const v1 = version({ version: 1, contentHash: "H1", origin: "manual" });
    const plan = planUpsert([v1], intent({ origin: "manual", hash: "H2", bodyMd: "# edited", baseVersion: 1 }), NOW);
    expect(plan).toEqual({ status: "edited", id: "v1", patch: { bodyMd: "# edited", contentHash: "H2", editedAt: NOW } });
  });

  it("a manual edit with no base version given edits in place, same as before base versions existed", () => {
    const v1 = version({ version: 1, contentHash: "H1", origin: "manual" });
    const plan = planUpsert([v1], intent({ origin: "manual", hash: "H2", bodyMd: "# edited" }), NOW);
    expect(plan).toEqual({ status: "edited", id: "v1", patch: { bodyMd: "# edited", contentHash: "H2", editedAt: NOW } });
  });

  it("a manual edit whose base version is behind the latest forks a new version instead of overwriting it", () => {
    // The editor opened version 1; a push landed version 2 while it was
    // open; the edit must never touch version 2 in place.
    const v2 = version({ version: 2, contentHash: "H2", origin: "pushed", kind: "cv", title: "Kept title", stageId: "stage-1" });
    const plan = planUpsert([v2], intent({ origin: "manual", hash: "H3", bodyMd: "# edited from the stale draft", baseVersion: 1 }), NOW);
    expect(plan).toEqual({
      status: "versioned",
      insert: {
        version: 3,
        kind: "cv",
        title: "Kept title",
        stageId: "stage-1",
        bodyMd: "# edited from the stale draft",
        contentHash: "H3",
        sourceHash: null,
        origin: "manual",
        editedAt: NOW,
      },
    });
  });

  it("a manual edit whose base version is stale but the text already matches the latest is unchanged, not versioned", () => {
    const v2 = version({ version: 2, contentHash: "H2", origin: "pushed" });
    const plan = planUpsert([v2], intent({ origin: "manual", hash: "H2", baseVersion: 1 }), NOW);
    expect(plan).toEqual({ status: "unchanged", warning: null });
  });

  it("a title-only change through a push, unchanged body, is updated", () => {
    const v1 = version({ version: 1, contentHash: "H1", sourceHash: "H1", origin: "pushed", title: "Old" });
    const plan = planUpsert([v1], intent({ origin: "pushed", hash: "H1", title: "New" }), NOW);
    expect(plan).toEqual({ status: "updated", id: "v1", patch: { title: "New" } });
  });

  it("a stage-only change through a paste, unchanged body, is updated", () => {
    const v1 = version({ version: 1, contentHash: "H1", sourceHash: "H1", origin: "pasted", stageId: null });
    const plan = planUpsert([v1], intent({ origin: "pasted", hash: "H1", stageId: "stage-2" }), NOW);
    expect(plan).toEqual({ status: "updated", id: "v1", patch: { stageId: "stage-2" } });
  });

  it("an unchanged body with no metadata difference is unchanged, warning null", () => {
    const v1 = version({ version: 1, contentHash: "H1", sourceHash: "H1", origin: "pushed" });
    const plan = planUpsert([v1], intent({ origin: "pushed", hash: "H1" }), NOW);
    expect(plan).toEqual({ status: "unchanged", warning: null });
  });

  it("a metadata change on a sent latest is unchanged with sent_locked, not updated", () => {
    const sent = version({ version: 1, contentHash: "H1", sourceHash: "H1", origin: "pushed", title: "Old", sentAt: NOW });
    const plan = planUpsert([sent], intent({ origin: "pushed", hash: "H1", title: "New" }), NOW);
    expect(plan).toEqual({ status: "unchanged", warning: "sent_locked" });
  });

  it("version numbering after a gap is latest.version + 1, not array length + 1", () => {
    const v1 = version({ version: 1, contentHash: "H1", sourceHash: "H1", origin: "pushed" });
    const v5 = version({ version: 5, contentHash: "H5", sourceHash: "H5", origin: "pushed" });
    const plan = planUpsert([v1, v5], intent({ origin: "pushed", hash: "H6", bodyMd: "# v6" }), NOW);
    expect(plan.status).toBe("versioned");
    expect((plan as { insert: { version: number } }).insert.version).toBe(6);
  });

  it("a new version never carries sentAt (the type has no such field to copy)", () => {
    const sent = version({ version: 1, contentHash: "H1", sourceHash: "H1", origin: "pushed", sentAt: NOW });
    const plan = planUpsert([sent], intent({ origin: "pushed", hash: "H2" }), NOW);
    expect(plan.status).toBe("versioned");
    expect(plan).not.toHaveProperty("insert.sentAt");
  });
});

describe("versionNotice", () => {
  it("is null for a version with no previous version", () => {
    const v1 = version({ version: 1, contentHash: "H1", origin: "pushed" });
    expect(versionNotice([v1], 1)).toBeNull();
  });

  it("is null when the previous version was never edited", () => {
    const v1 = version({ version: 1, contentHash: "H1", origin: "pushed" });
    const v2 = version({ version: 2, contentHash: "H2", origin: "pushed" });
    expect(versionNotice([v1, v2], 2)).toBeNull();
  });

  it("is null for a pasted or manual version even if the previous one was edited", () => {
    const v1 = version({ version: 1, contentHash: "H1", origin: "pushed", editedAt: NOW });
    const v2 = version({ version: 2, contentHash: "H2", origin: "pasted" });
    expect(versionNotice([v1, v2], 2)).toBeNull();
  });

  it("names the edited version for a generated origin too", () => {
    const v1 = version({ version: 1, contentHash: "H1", origin: "generated", editedAt: NOW });
    const v2 = version({ version: 2, contentHash: "H2", origin: "generated" });
    expect(versionNotice([v1, v2], 2)).toBe("Pushed after you edited version 1.");
  });
});
