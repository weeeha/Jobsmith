import type { Db } from "../client";
import { profileQueries } from "./profile";
import { companyQueries } from "./company";
import { opportunityQueries } from "./opportunity";
import { stageQueries } from "./stage";
import { personQueries } from "./person";
import { opportunityPersonQueries } from "./opportunity-person";
import { eventQueries } from "./event";
import { getDb } from "../client";

export * from "./strip";
export * from "./profile";
export * from "./company";
export * from "./opportunity";
export * from "./stage";
export * from "./person";
export * from "./opportunity-person";
export * from "./event";

export function scoped(db: Db, userId: string) {
  return {
    userId,
    async transaction<T>(fn: (tx: Scoped) => Promise<T>): Promise<T> {
      return db.transaction((tx) => fn(scoped(tx, userId)));
    },
    profile: profileQueries(db, userId),
    company: companyQueries(db, userId),
    opportunity: opportunityQueries(db, userId),
    stage: stageQueries(db, userId),
    person: personQueries(db, userId),
    opportunityPerson: opportunityPersonQueries(db, userId),
    event: eventQueries(db, userId),
  };
}

export type Scoped = ReturnType<typeof scoped>;

export function scopedFor(userId: string): Scoped {
  return scoped(getDb(), userId);
}
