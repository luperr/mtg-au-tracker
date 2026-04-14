import { describe, it, expect, vi, afterEach } from "vitest";
import { createRateLimiter } from "./rate-limit.js";

describe("createRateLimiter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the first request", () => {
    const limiter = createRateLimiter(3, 60_000);
    expect(limiter("1.2.3.4")).toBe(true);
  });

  it("allows requests up to the limit", () => {
    const limiter = createRateLimiter(3, 60_000);
    expect(limiter("1.2.3.4")).toBe(true);
    expect(limiter("1.2.3.4")).toBe(true);
    expect(limiter("1.2.3.4")).toBe(true);
  });

  it("blocks requests exceeding the limit", () => {
    const limiter = createRateLimiter(2, 60_000);
    expect(limiter("1.2.3.4")).toBe(true);
    expect(limiter("1.2.3.4")).toBe(true);
    expect(limiter("1.2.3.4")).toBe(false);
    expect(limiter("1.2.3.4")).toBe(false);
  });

  it("tracks different IPs independently", () => {
    const limiter = createRateLimiter(1, 60_000);
    expect(limiter("1.1.1.1")).toBe(true);
    expect(limiter("1.1.1.1")).toBe(false); // over limit
    expect(limiter("2.2.2.2")).toBe(true);  // different IP — fresh
  });

  it("resets after the window expires", () => {
    vi.useFakeTimers();
    const limiter = createRateLimiter(1, 1_000);

    expect(limiter("1.2.3.4")).toBe(true);
    expect(limiter("1.2.3.4")).toBe(false);

    // Advance past the 1-second window
    vi.advanceTimersByTime(1_001);

    expect(limiter("1.2.3.4")).toBe(true); // window reset
  });

  it("does not reset before the window expires", () => {
    vi.useFakeTimers();
    const limiter = createRateLimiter(1, 1_000);

    expect(limiter("1.2.3.4")).toBe(true);
    vi.advanceTimersByTime(500); // half the window
    expect(limiter("1.2.3.4")).toBe(false); // still within window
  });
});
