import type { ArtifactKind } from "@/lib/artifacts/kinds";
import type { StageKind } from "@/lib/pipeline/kinds";
import type { StageFormat } from "@/lib/pipeline/values";
import { addZonedDays } from "@/lib/time/zone";

// Home's attention list (spec 5.8): one pure function over the active jobs,
// their scheduled stages and the current time. Order across kinds is fixed;
// order inside a kind is by its own date, oldest or soonest first.

export const ATTENTION_KINDS = ["interview", "due", "follow_up", "saved", "passed"] as const;
export type AttentionKind = (typeof ATTENTION_KINDS)[number];

export const INTERVIEW_WINDOW_HOURS = 72;
// The research an interview needs, as opposed to the fit brief written before
// applying. A job counts as researched when it or its company has one of these.
export const INTERVIEW_RESEARCH_KINDS = ["research", "people_notes"] as const satisfies readonly ArtifactKind[];
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type AttentionJob = {
  id: string;
  slug: string;
  roleTitle: string;
  companyName: string;
  nextAction: string | null;
  nextActionAt: Date | null;
  stage: { kind: StageKind; label: string; enteredAt: Date | null };
  lastEventAt: Date | null;
  researched: boolean;
};

export type AttentionStage = {
  id: string;
  opportunityId: string;
  kind: StageKind;
  label: string;
  scheduledAt: Date;
  format: StageFormat | null;
};

export type AttentionInput = {
  now: Date;
  timeZone: string;
  followUpDays: number;
  savedDays: number;
  jobs: AttentionJob[];
  scheduled: AttentionStage[];
};

export type AttentionJobRef = Pick<AttentionJob, "id" | "slug" | "roleTitle" | "companyName" | "nextAction">;
type StageRef = { id: string; label: string; scheduledAt: Date; format: StageFormat | null };

export type AttentionItem =
  | { kind: "interview"; job: AttentionJobRef; stage: StageRef; researched: boolean }
  | { kind: "due"; job: AttentionJobRef; nextAction: string; at: Date; overdue: boolean }
  | { kind: "follow_up"; job: AttentionJobRef; quietDays: number; appliedAt: Date | null }
  | { kind: "saved"; job: AttentionJobRef; days: number; savedAt: Date }
  | { kind: "passed"; job: AttentionJobRef; stage: StageRef };

function ref(job: AttentionJob): AttentionJobRef {
  return { id: job.id, slug: job.slug, roleTitle: job.roleTitle, companyName: job.companyName, nextAction: job.nextAction };
}

function wholeDays(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY);
}

/** A job whose next action date is still ahead was planned or snoozed, so the quiet-job rules leave it alone. */
function isSnoozed(job: AttentionJob, now: Date): boolean {
  return job.nextActionAt !== null && job.nextActionAt.getTime() > now.getTime();
}

const byTime = <T>(get: (item: T) => Date) => (a: T, b: T) => get(a).getTime() - get(b).getTime();

export function attentionItems(input: AttentionInput): AttentionItem[] {
  const { now, timeZone, jobs } = input;
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const windowEnd = now.getTime() + INTERVIEW_WINDOW_HOURS * HOUR;
  const startOfTomorrow = addZonedDays(now, 1, timeZone, 0).getTime();

  const scheduled = input.scheduled
    .filter((st) => byId.has(st.opportunityId))
    .sort(byTime((st) => st.scheduledAt));
  const stageRef = (st: AttentionStage): StageRef => ({ id: st.id, label: st.label, scheduledAt: st.scheduledAt, format: st.format });

  const interview: AttentionItem[] = scheduled
    .filter((st) => st.scheduledAt.getTime() >= now.getTime() && st.scheduledAt.getTime() <= windowEnd)
    .map((st) => {
      const job = byId.get(st.opportunityId)!;
      return { kind: "interview", job: ref(job), stage: stageRef(st), researched: job.researched };
    });

  const due: AttentionItem[] = jobs
    .filter((j) => j.nextAction !== null && j.nextActionAt !== null && j.nextActionAt.getTime() < startOfTomorrow)
    .sort(byTime((j) => j.nextActionAt!))
    .map((j) => ({
      kind: "due",
      job: ref(j),
      nextAction: j.nextAction!,
      at: j.nextActionAt!,
      overdue: j.nextActionAt!.getTime() < now.getTime(),
    }));

  const followUp: AttentionItem[] = jobs
    .filter((j) => j.stage.kind === "applied" && j.nextAction === null)
    .map((j) => ({ job: j, quietSince: j.lastEventAt ?? j.stage.enteredAt }))
    .filter((x): x is { job: AttentionJob; quietSince: Date } => x.quietSince !== null)
    .filter((x) => wholeDays(x.quietSince, now) >= input.followUpDays)
    .sort(byTime((x) => x.quietSince))
    .map((x) => ({ kind: "follow_up", job: ref(x.job), quietDays: wholeDays(x.quietSince, now), appliedAt: x.job.stage.enteredAt }));

  const saved: AttentionItem[] = jobs
    .filter((j) => j.stage.kind === "saved" && j.stage.enteredAt !== null && !isSnoozed(j, now))
    .filter((j) => wholeDays(j.stage.enteredAt!, now) >= input.savedDays)
    .sort(byTime((j) => j.stage.enteredAt!))
    .map((j) => ({ kind: "saved", job: ref(j), days: wholeDays(j.stage.enteredAt!, now), savedAt: j.stage.enteredAt! }));

  const passed: AttentionItem[] = scheduled
    .filter((st) => st.scheduledAt.getTime() < now.getTime() && !isSnoozed(byId.get(st.opportunityId)!, now))
    .map((st) => ({ kind: "passed", job: ref(byId.get(st.opportunityId)!), stage: stageRef(st) }));

  return [...interview, ...due, ...followUp, ...saved, ...passed];
}
