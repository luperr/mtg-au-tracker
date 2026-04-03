import { describe, it, expect, vi, afterEach } from "vitest";
import { getAudPerUsd } from "./currency.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getAudPerUsd", () => {
  it("returns the AUD rate from the API on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rates: { AUD: 1.58 } }),
    }));

    const rate = await getAudPerUsd();
    expect(rate).toBe(1.58);
  });

  it("passes fetchOptions through to fetch", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rates: { AUD: 1.58 } }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await getAudPerUsd({ next: { revalidate: 3600 } } as RequestInit);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.frankfurter.app/latest?from=USD&to=AUD",
      { next: { revalidate: 3600 } }
    );
  });

  it("falls back to FALLBACK_RATE when response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    const rate = await getAudPerUsd();
    expect(rate).toBe(0.65);
  });

  it("falls back to FALLBACK_RATE when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    const rate = await getAudPerUsd();
    expect(rate).toBe(0.65);
  });

  it("falls back to FALLBACK_RATE when AUD rate is missing from response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rates: {} }),
    }));

    const rate = await getAudPerUsd();
    expect(rate).toBe(0.65);
  });

  it("falls back to FALLBACK_RATE when AUD rate is zero", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rates: { AUD: 0 } }),
    }));

    const rate = await getAudPerUsd();
    expect(rate).toBe(0.65);
  });
});
