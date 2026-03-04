/**
 * Currency conversion utilities.
 * MVP uses a static rate from env; future version will pull live rates.
 */

const DEFAULT_AUD_USD_RATE = 0.65;

export function getAudUsdRate(): number {
  const envRate = process.env.AUD_USD_RATE;
  if (envRate) {
    const parsed = parseFloat(envRate);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_AUD_USD_RATE;
}

/** Convert USD to AUD */
export function usdToAud(usd: number): number {
  return usd / getAudUsdRate();
}

/** Convert AUD to USD */
export function audToUsd(aud: number): number {
  return aud * getAudUsdRate();
}

/** Format a price for display */
export function formatAud(price: number): string {
  return `A$${price.toFixed(2)}`;
}

export function formatUsd(price: number): string {
  return `US$${price.toFixed(2)}`;
}
