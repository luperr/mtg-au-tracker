import { describe, it, expect } from "vitest";
import { getClientIp } from "./request.js";
import type { NextRequest } from "next/server";

/** Minimal mock that satisfies getClientIp's usage of req.headers.get() */
function mockReq(headers: Record<string, string>): NextRequest {
  return {
    headers: {
      get(name: string) {
        return headers[name] ?? null;
      },
    },
  } as unknown as NextRequest;
}

describe("getClientIp", () => {
  it("extracts IP from x-forwarded-for", () => {
    expect(getClientIp(mockReq({ "x-forwarded-for": "1.2.3.4" }))).toBe("1.2.3.4");
  });

  it("takes the first IP when x-forwarded-for has multiple", () => {
    expect(getClientIp(mockReq({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.10.11.12" }))).toBe("1.2.3.4");
  });

  it("trims whitespace from x-forwarded-for", () => {
    expect(getClientIp(mockReq({ "x-forwarded-for": "  1.2.3.4  , 5.6.7.8" }))).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip when x-forwarded-for is missing", () => {
    expect(getClientIp(mockReq({ "x-real-ip": "10.0.0.1" }))).toBe("10.0.0.1");
  });

  it("prefers x-forwarded-for over x-real-ip", () => {
    expect(getClientIp(mockReq({
      "x-forwarded-for": "1.2.3.4",
      "x-real-ip": "10.0.0.1",
    }))).toBe("1.2.3.4");
  });

  it('returns "unknown" when no headers are present', () => {
    expect(getClientIp(mockReq({}))).toBe("unknown");
  });
});
