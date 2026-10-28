/**
 * Number formatting for the page. Negative numbers use the minus sign
 * (U+2212), which has the width of a digit in Inter's tabular figures; a
 * hyphen there would read as a dash. Every function returns "–" for a
 * missing value.
 */

const MISSING = "–";
export const MINUS = "\u2212";

/** A share as a percent: "14.4%", "−0.25%"; a value that rounds to zero is "0.0%", never "−0.0%". */
export function percent(share: number | null | undefined, digits = 1): string {
  if (share === null || share === undefined || !Number.isFinite(share)) return MISSING;
  const text = Math.abs(share * 100).toFixed(digits);
  if (Number(text) === 0) return `${text}%`;
  return `${share < 0 ? MINUS : ""}${text}%`;
}

/** A percent change already in percent units, with its sign: "+0.52%", "−0.11%", "0.00%". */
export function signedPercent(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return MISSING;
  const text = Math.abs(value).toFixed(digits);
  if (Number(text) === 0) return `${text}%`;
  return `${value < 0 ? MINUS : "+"}${text}%`;
}

export function decimal(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return MISSING;
  const text = Math.abs(value).toFixed(digits);
  if (Number(text) === 0) return text;
  return value < 0 ? `${MINUS}${text}` : text;
}

export function dollars(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return MISSING;
  const text = Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${value < 0 ? MINUS : ""}$${text}`;
}

/** "+$1,000", "−$250", "$0". */
export function signedDollars(value: number): string {
  if (value === 0) return "$0";
  return `${value < 0 ? MINUS : "+"}${dollars(Math.abs(value))}`;
}

export function integer(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return MISSING;
  return Math.round(value).toLocaleString("en-US");
}
