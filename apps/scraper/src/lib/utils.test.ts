import { describe, it, expect, vi, afterEach } from "vitest";
import { todayISO, matchRate } from "./utils.js";

describe("todayISO", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a YYYY-MM-DD string", () => {
    const result = todayISO();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns the correct date for a known timestamp", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-13T10:30:00Z"));
    expect(todayISO()).toBe("2026-04-13");
  });

  it("handles midnight UTC edge case", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    expect(todayISO()).toBe("2026-01-01");
  });
});

describe("matchRate", () => {
  it("returns 0 when total is 0", () => {
    expect(matchRate(0, 0)).toBe(0);
  });

  it("returns 100 for a perfect match", () => {
    expect(matchRate(50, 50)).toBe(100);
  });

  it("returns 0 when nothing matched", () => {
    expect(matchRate(0, 100)).toBe(0);
  });

  it("rounds to one decimal place", () => {
    expect(matchRate(1, 3)).toBe(33.3);
    expect(matchRate(2, 3)).toBe(66.7);
  });

  it("handles typical scraper values", () => {
    expect(matchRate(4500, 5000)).toBe(90);
    expect(matchRate(142, 150)).toBe(94.7);
  });
});
