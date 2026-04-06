import { describe, it, expect } from "vitest";
import { checkRateLimit } from "../rate-limit";

describe("checkRateLimit", () => {
  const config = { name: "test-limiter", maxRequests: 3, windowSeconds: 60 };

  it("allows requests under the limit", () => {
    const userId = `user-${Date.now()}-1`;
    const r1 = checkRateLimit(userId, config);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = checkRateLimit(userId, config);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);
  });

  it("blocks requests over the limit", () => {
    const userId = `user-${Date.now()}-2`;
    checkRateLimit(userId, config);
    checkRateLimit(userId, config);
    checkRateLimit(userId, config);

    const r4 = checkRateLimit(userId, config);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
    expect(r4.resetAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("isolates different users", () => {
    const userA = `user-${Date.now()}-a`;
    const userB = `user-${Date.now()}-b`;

    checkRateLimit(userA, config);
    checkRateLimit(userA, config);
    checkRateLimit(userA, config);

    const rB = checkRateLimit(userB, config);
    expect(rB.allowed).toBe(true);
    expect(rB.remaining).toBe(2);
  });

  it("isolates different limiters", () => {
    const userId = `user-${Date.now()}-3`;
    const config2 = { name: "other-limiter", maxRequests: 2, windowSeconds: 60 };

    checkRateLimit(userId, config);
    checkRateLimit(userId, config);
    checkRateLimit(userId, config);

    const r = checkRateLimit(userId, config2);
    expect(r.allowed).toBe(true);
  });
});
