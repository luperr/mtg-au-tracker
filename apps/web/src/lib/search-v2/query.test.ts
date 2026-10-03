import { describe, it, expect } from "vitest";
import { escapeLike } from "./query.js";

describe("escapeLike", () => {
  it("escapes LIKE metacharacters and the escape char itself", () => {
    expect(escapeLike("a_c")).toBe("a\\_c");
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("a\\b")).toBe("a\\\\b");
  });

  it("leaves ordinary card names alone", () => {
    expect(escapeLike("Jace, the Mind Sculptor")).toBe("Jace, the Mind Sculptor");
  });
});
