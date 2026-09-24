import { describe, expect, it } from "vitest";
import { BRIDGE_ERRORS } from "@/lib/bridge/errors";

const requestId = "req-test-1";

describe("BRIDGE_ERRORS", () => {
  it("unauthorized is 401 with a fixed message", () => {
    expect(BRIDGE_ERRORS.unauthorized.status).toBe(401);
    expect(BRIDGE_ERRORS.unauthorized.message({ requestId })).toBe("Missing, unknown or revoked token.");
  });

  it("rate_limited is 429 and reports the given seconds", () => {
    expect(BRIDGE_ERRORS.rate_limited.status).toBe(429);
    expect(BRIDGE_ERRORS.rate_limited.message({ requestId, seconds: 42 })).toBe(
      "Too many requests. Try again in 42 seconds.",
    );
  });

  it("not_found is 404 and names the slug", () => {
    expect(BRIDGE_ERRORS.not_found.status).toBe(404);
    expect(BRIDGE_ERRORS.not_found.message({ requestId, slug: "acme-designer" })).toBe(
      "No job with the slug acme-designer.",
    );
  });

  it("invalid_query and invalid_payload are 400 and pass the given text straight through", () => {
    expect(BRIDGE_ERRORS.invalid_query.status).toBe(400);
    expect(BRIDGE_ERRORS.invalid_query.message({ requestId, text: "status must be active, closed or all." })).toBe(
      "status must be active, closed or all.",
    );
    expect(BRIDGE_ERRORS.invalid_payload.status).toBe(400);
    expect(BRIDGE_ERRORS.invalid_payload.message({ requestId, text: "key: key must be a string." })).toBe(
      "key: key must be a string.",
    );
  });

  it("invalid_json is 400 with a fixed message", () => {
    expect(BRIDGE_ERRORS.invalid_json.status).toBe(400);
    expect(BRIDGE_ERRORS.invalid_json.message({ requestId })).toBe("The request body is not valid JSON.");
  });

  it("duplicate_key is 400 and names the key", () => {
    expect(BRIDGE_ERRORS.duplicate_key.status).toBe(400);
    expect(BRIDGE_ERRORS.duplicate_key.message({ requestId, key: "cv" })).toBe(
      "The key cv appears more than once in this push.",
    );
  });

  it("payload_too_large, too_many_artifacts and artifact_too_large are all 413", () => {
    expect(BRIDGE_ERRORS.payload_too_large.status).toBe(413);
    expect(BRIDGE_ERRORS.payload_too_large.message({ requestId })).toBe(
      "The request is larger than 4 MB. Push fewer files at a time.",
    );
    expect(BRIDGE_ERRORS.too_many_artifacts.status).toBe(413);
    expect(BRIDGE_ERRORS.too_many_artifacts.message({ requestId })).toBe("A push holds at most 50 documents.");
    expect(BRIDGE_ERRORS.artifact_too_large.status).toBe(413);
    expect(BRIDGE_ERRORS.artifact_too_large.message({ requestId, key: "cover-letter" })).toBe(
      "cover-letter is larger than 1 MB.",
    );
  });

  it("server_error is 500 and reports the request id, nothing else", () => {
    expect(BRIDGE_ERRORS.server_error.status).toBe(500);
    expect(BRIDGE_ERRORS.server_error.message({ requestId: "abc-123" })).toBe(
      "Something went wrong on the server. Request id abc-123.",
    );
  });
});
