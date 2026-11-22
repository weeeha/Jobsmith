import { describe, expect, it } from "vitest";
import { defaultPair, formatCompareHref, parseCompareQuery, resolvePair } from "@/lib/compare/pair";
import type { VersionState } from "@/lib/artifacts/plan";

type V = Pick<VersionState, "version" | "origin" | "editedAt">;
const v = (version: number, origin: V["origin"] = "pushed", edited = false): V => ({
  version,
  origin,
  editedAt: edited ? new Date("2026-09-19T12:00:00Z") : null,
});

describe("defaultPair", () => {
  it("b is the latest and a the one before", () => {
    expect(defaultPair([v(1), v(2), v(3)])).toEqual({ a: 2, b: 3 });
  });
  it("when b carries the notice for N, a is N", () => {
    expect(defaultPair([v(1), v(2), v(3)], (_vs, ver) => (ver === 3 ? 1 : null))).toEqual({ a: 1, b: 3 });
  });
  it("uses the edited-base rule by default", () => {
    expect(defaultPair([v(1), v(2, "pushed", true), v(3)])).toEqual({ a: 2, b: 3 });
  });
  it("one version returns null", () => {
    expect(defaultPair([v(1)])).toBeNull();
    expect(defaultPair([])).toBeNull();
  });
});

describe("parseCompareQuery", () => {
  it("parses doc refs", () => {
    expect(parseCompareQuery({ doc: "job:cv" }).doc).toEqual({ scope: "opportunity", key: "cv" });
    expect(parseCompareQuery({ doc: "company:recon" }).doc).toEqual({ scope: "company", key: "recon" });
    expect(parseCompareQuery({ doc: "x:cv" }).doc).toBeNull();
    expect(parseCompareQuery({ doc: "job:a/b" }).doc).toBeNull();
    expect(parseCompareQuery({}).doc).toBeNull();
  });
  it("a and b must be integers of 1 or more", () => {
    expect(parseCompareQuery({ a: "3", b: "4" })).toMatchObject({ a: 3, b: 4 });
    for (const bad of ["1.5", "0", "-2", "x", "", "1e2"]) {
      expect(parseCompareQuery({ a: bad, b: bad })).toMatchObject({ a: null, b: null });
    }
  });
  it("view must be split or inline", () => {
    expect(parseCompareQuery({ view: "split" }).view).toBe("split");
    expect(parseCompareQuery({ view: "inline" }).view).toBe("inline");
    expect(parseCompareQuery({ view: "grid" }).view).toBeNull();
  });
});

describe("resolvePair", () => {
  const vs = [v(1), v(2), v(3)];
  it("a version that does not exist resolves the whole pair to null", () => {
    expect(resolvePair(vs, { a: 1, b: 9 })).toBeNull();
    expect(resolvePair(vs, { a: 9, b: 3 })).toBeNull();
  });
  it("known versions resolve and missing ones fall back to the default", () => {
    expect(resolvePair(vs, { a: 1, b: 3 })).toEqual({ a: 1, b: 3 });
    expect(resolvePair(vs, { a: null, b: null })).toEqual({ a: 2, b: 3 });
  });
});

describe("formatCompareHref", () => {
  it("builds a job href", () => {
    expect(
      formatCompareHref("/jobs/acme/compare", { doc: { scope: "opportunity", key: "cv" }, a: 3, b: 4, view: "inline" }),
    ).toBe("/jobs/acme/compare?doc=job:cv&a=3&b=4&view=inline");
  });
  it("uses the bare key for companies", () => {
    expect(formatCompareHref("/companies/c1/compare", { doc: { scope: "company", key: "recon" } })).toBe(
      "/companies/c1/compare?doc=recon",
    );
  });
});
