import type { ArtifactKind } from "./kinds";
import type { ArtifactOrigin } from "./values";

export type VersionState = {
  id: string;
  version: number;
  kind: ArtifactKind;
  title: string;
  stageId: string | null;
  contentHash: string;
  sourceHash: string | null;
  origin: ArtifactOrigin;
  editedAt: Date | null;
  sentAt: Date | null;
};

export type UpsertIntent = {
  origin: ArtifactOrigin;
  kind: ArtifactKind;
  title: string;
  stageId: string | null;
  bodyMd: string;
  hash: string;
  // Only meaningful for a manual edit: the version the editor had open when
  // the save started. Omitted (or matching the latest version) means the
  // in-place rules below apply as before.
  baseVersion?: number;
};

export type NewVersion = {
  version: number;
  kind: ArtifactKind;
  title: string;
  stageId: string | null;
  bodyMd: string;
  contentHash: string;
  sourceHash: string | null;
  origin: ArtifactOrigin;
  editedAt: Date | null;
};

export type MetaPatch = { kind?: ArtifactKind; title?: string; stageId?: string | null };

export type UpsertPlan =
  | { status: "created" | "versioned"; insert: NewVersion }
  | { status: "edited"; id: string; patch: { bodyMd: string; contentHash: string; editedAt: Date } }
  | { status: "updated"; id: string; patch: MetaPatch }
  | { status: "unchanged"; warning: "sent_locked" | null };

function newVersionFromIntent(version: number, intent: UpsertIntent): NewVersion {
  return {
    version,
    kind: intent.kind,
    title: intent.title,
    stageId: intent.stageId,
    bodyMd: intent.bodyMd,
    contentHash: intent.hash,
    sourceHash: intent.hash,
    origin: intent.origin,
    editedAt: null,
  };
}

// Reached only when the body content is unchanged: the intent carries no new
// body, so the only possible outcome is a metadata-only patch (or nothing).
function planMetaPatch(latest: VersionState, intent: UpsertIntent): UpsertPlan {
  const patch: MetaPatch = {};
  if (intent.kind !== latest.kind) patch.kind = intent.kind;
  if (intent.title !== latest.title) patch.title = intent.title;
  if (intent.stageId !== latest.stageId) patch.stageId = intent.stageId;

  if (Object.keys(patch).length === 0) {
    return { status: "unchanged", warning: null };
  }
  if (latest.sentAt) {
    return { status: "unchanged", warning: "sent_locked" };
  }
  return { status: "updated", id: latest.id, patch };
}

export function planUpsert(versions: VersionState[], intent: UpsertIntent, now: Date): UpsertPlan {
  if (versions.length === 0) {
    return {
      status: "created",
      insert: {
        version: 1,
        kind: intent.kind,
        title: intent.title,
        stageId: intent.stageId,
        bodyMd: intent.bodyMd,
        contentHash: intent.hash,
        sourceHash: intent.origin === "manual" ? null : intent.hash,
        origin: intent.origin,
        editedAt: intent.origin === "manual" ? now : null,
      },
    };
  }

  const latest = versions[versions.length - 1];

  if (intent.origin === "pushed" || intent.origin === "generated") {
    let reference: VersionState | null = null;
    for (let i = versions.length - 1; i >= 0; i--) {
      if (versions[i].origin === "pushed" || versions[i].origin === "generated") {
        reference = versions[i];
        break;
      }
    }
    const unchanged = intent.hash === reference?.sourceHash || intent.hash === latest.contentHash;
    if (unchanged) return planMetaPatch(latest, intent);
    return { status: "versioned", insert: newVersionFromIntent(latest.version + 1, intent) };
  }

  if (intent.origin === "pasted") {
    const unchanged = intent.hash === latest.contentHash;
    if (unchanged) return planMetaPatch(latest, intent);
    return { status: "versioned", insert: newVersionFromIntent(latest.version + 1, intent) };
  }

  // intent.origin === "manual": the in-app editor never changes kind, title
  // or stage, so an unchanged body always means nothing changed at all - no
  // metadata patch to consider.
  if (intent.hash === latest.contentHash) {
    return { status: "unchanged", warning: null };
  }
  // A save whose base version is no longer the latest never overwrites what
  // the editor did not see: it forks a new version instead, the same way a
  // sent latest already does.
  const staleBase = intent.baseVersion !== undefined && intent.baseVersion !== latest.version;
  if (latest.sentAt || staleBase) {
    return {
      status: "versioned",
      insert: {
        version: latest.version + 1,
        kind: latest.kind,
        title: latest.title,
        stageId: latest.stageId,
        bodyMd: intent.bodyMd,
        contentHash: intent.hash,
        sourceHash: null,
        origin: "manual",
        editedAt: now,
      },
    };
  }
  return {
    status: "edited",
    id: latest.id,
    patch: { bodyMd: intent.bodyMd, contentHash: intent.hash, editedAt: now },
  };
}

export function versionNotice(versions: Pick<VersionState, "version" | "origin" | "editedAt">[], version: number): string | null {
  const entry = versions.find((v) => v.version === version);
  if (!entry) return null;
  if (entry.origin !== "pushed" && entry.origin !== "generated") return null;

  const previous = versions.find((v) => v.version === version - 1);
  if (!previous || !previous.editedAt) return null;

  return `Pushed after you edited version ${previous.version}.`;
}
