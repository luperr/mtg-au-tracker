/**
 * Fetches the live USD→AUD exchange rate from the Frankfurter API.
 * https://www.frankfurter.app/ — free, no API key, sourced from the ECB.
 *
 * Next.js caches the fetch automatically; the card detail page revalidates
 * hourly so this stays fresh without hammering the external API.
 *
 * Falls back to AUD_USD_RATE env var (default 0.65) if the fetch fails.
 */

const FALLBACK_RATE = parseFloat(process.env.AUD_USD_RATE ?? "0.65");

interface FrankfurterResponse {
  rates: { AUD: number };
}

export async function getAudPerUsd(): Promise<number> {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=AUD", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return FALLBACK_RATE;
    const data = (await res.json()) as FrankfurterResponse;
    const rate = data?.rates?.AUD;
    if (typeof rate !== "number" || rate <= 0) return FALLBACK_RATE;
    return rate;
  } catch {
    return FALLBACK_RATE;
  }
}
