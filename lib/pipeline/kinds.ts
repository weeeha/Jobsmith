export const STAGE_KINDS = [
  { kind: "saved", columnTitle: "Saved", defaultLabel: "Saved" },
  { kind: "applied", columnTitle: "Applied", defaultLabel: "Applied" },
  { kind: "recruiter_screen", columnTitle: "Recruiter", defaultLabel: "Recruiter screen" },
  { kind: "hiring_manager", columnTitle: "Hiring manager", defaultLabel: "Hiring manager" },
  { kind: "portfolio_case", columnTitle: "Portfolio / case", defaultLabel: "Portfolio review" },
  { kind: "panel_final", columnTitle: "Panel / final", defaultLabel: "Panel" },
  { kind: "offer", columnTitle: "Offer", defaultLabel: "Offer" },
] as const satisfies readonly { kind: string; columnTitle: string; defaultLabel: string }[];

export type StageKind = (typeof STAGE_KINDS)[number]["kind"];
