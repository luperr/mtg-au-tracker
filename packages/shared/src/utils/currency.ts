/**
 * Fetches the live USD→AUD exchange rate from the Frankfurter API.
 * https://www.frankfurter.app/ — free, no API key, sourced from the ECB.
 *
 * Falls back to AUD_USD_RATE env var (default 0.65) if the fetch fails.
 *
 * @param fetchOptions - Optional RequestInit passed to fetch. Callers can use
 *   this for framework-specific caching (e.g. Next.js `next: { revalidate }`).
 */

const FRANKFURTER_URL = "https://api.frankfurter.app/latest?from=USD&to=AUD";
const FALLBACK_RATE = parseFloat(process.env.AUD_USD_RATE ?? "0.65");

interface FrankfurterResponse {
  rates: { AUD: number };
}

export async function getAudPerUsd(fetchOptions?: RequestInit): Promise<number> {
  try {
    const res = await fetch(FRANKFURTER_URL, fetchOptions);
    if (!res.ok) return FALLBACK_RATE;
    const data = (await res.json()) as FrankfurterResponse;
    const rate = data?.rates?.AUD;
    if (typeof rate !== "number" || rate <= 0) return FALLBACK_RATE;
    return rate;
  } catch {
    return FALLBACK_RATE;
  }
}
