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

// Declared explicitly rather than as `ReturnType<typeof scoped>`. That
// inferred form is circular: `scoped`'s own `transaction` method takes a
// callback parameter typed `Scoped`, so inferring `scoped`'s return type
// requires already knowing `Scoped`. TypeScript does not always surface this
// as a hard circularity error; in some importing files it silently widens
// property access off a `Scoped`-typed value to `any` instead, which only
// shows up downstream as an unrelated `noImplicitAny` error (for example an
// array `.map()` callback losing its inferred parameter type), and whether a
// given file trips it depends on unrelated compilation-order effects. Writing
// the shape out by hand and annotating `scoped`'s return type with it removes
// the circularity: a named type that refers to itself inside one of its own
// method signatures (as `transaction` does here) is an ordinary recursive
// type, not a self-referential inference.
export type Scoped = {
  userId: string;
  transaction<T>(fn: (tx: Scoped) => Promise<T>): Promise<T>;
  profile: ReturnType<typeof profileQueries>;
  company: ReturnType<typeof companyQueries>;
  opportunity: ReturnType<typeof opportunityQueries>;
  stage: ReturnType<typeof stageQueries>;
  person: ReturnType<typeof personQueries>;
  opportunityPerson: ReturnType<typeof opportunityPersonQueries>;
  event: ReturnType<typeof eventQueries>;
};

export function scoped(db: Db, userId: string): Scoped {
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

export function scopedFor(userId: string): Scoped {
  return scoped(getDb(), userId);
}
