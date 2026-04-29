import { describe, it, expect } from "vitest";

// Test the issue classification logic from validate-stores.ts in isolation.
// These are the two silent failure modes we need to catch reliably.

type IssueCode = "ENDPOINT_404" | "FETCH_ERROR" | "EMPTY_COLLECTION" | "PARSER_REJECTS_ALL" | "LOW_SET_COVERAGE";

interface StoreResult {
  id: string;
  httpStatus: number | null;
  fetchError: string | null;
  totalProducts: number;
  mappedCards: number;
  skippedTokens: number;
  setNameCoverage: number | null;
  issues: IssueCode[];
}

// Mirrors the classification logic from validate-stores.ts
function classify(httpStatus: number | null, fetchError: string | null, totalProducts: number, mappedCards: number, setNameCoverage: number | null): IssueCode[] {
  const issues: IssueCode[] = [];

  if (fetchError) {
    issues.push("FETCH_ERROR");
    return issues;
  }

  if (httpStatus !== null && !isOk(httpStatus)) {
    issues.push("ENDPOINT_404");
    return issues;
  }

  if (totalProducts === 0) {
    issues.push("EMPTY_COLLECTION");
    return issues;
  }

  if (mappedCards === 0 && totalProducts > 0) {
    issues.push("PARSER_REJECTS_ALL");
  }

  if (setNameCoverage !== null && setNameCoverage < 0.5) {
    issues.push("LOW_SET_COVERAGE");
  }

  return issues;
}

function isOk(status: number): boolean {
  return status >= 200 && status < 300;
}

describe("validate-stores classification", () => {
  it("classifies 404 HTTP status as ENDPOINT_404", () => {
    const issues = classify(404, null, 0, 0, null);
    expect(issues).toContain("ENDPOINT_404");
  });

  it("classifies 0 products as EMPTY_COLLECTION (not PARSER_REJECTS_ALL)", () => {
    const issues = classify(200, null, 0, 0, null);
    expect(issues).toContain("EMPTY_COLLECTION");
    expect(issues).not.toContain("PARSER_REJECTS_ALL");
  });

  it("classifies products with 0 mapped cards as PARSER_REJECTS_ALL", () => {
    const issues = classify(200, null, 250, 0, null);
    expect(issues).toContain("PARSER_REJECTS_ALL");
    expect(issues).not.toContain("EMPTY_COLLECTION");
  });

  it("classifies fetch error as FETCH_ERROR (not ENDPOINT_404)", () => {
    const issues = classify(null, "AbortError: signal aborted", 0, 0, null);
    expect(issues).toContain("FETCH_ERROR");
    expect(issues).not.toContain("ENDPOINT_404");
  });

  it("returns no issues for healthy store", () => {
    const issues = classify(200, null, 250, 320, 0.85);
    expect(issues).toHaveLength(0);
  });

  it("flags low set name coverage below 50%", () => {
    const issues = classify(200, null, 100, 100, 0.3);
    expect(issues).toContain("LOW_SET_COVERAGE");
  });

  it("does not flag set coverage at exactly 50%", () => {
    const issues = classify(200, null, 100, 100, 0.5);
    expect(issues).not.toContain("LOW_SET_COVERAGE");
  });

  it("FETCH_ERROR short-circuits other checks", () => {
    // Even if totalProducts > 0 (shouldn't happen with an error, but defensively)
    const issues = classify(null, "network error", 250, 0, null);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toBe("FETCH_ERROR");
  });
});
