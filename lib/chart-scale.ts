/**
 * Axis scales for the page's hand-drawn SVG charts.
 */

/** Round tick values (steps of 1, 2, 2.5 or 5 times a power of ten) from `min` to `max`. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => span / s <= count) ?? 10 * power;
  const first = Math.floor(min / step);
  const ticks: number[] = [];
  // Each tick from its index (no accumulated rounding), rounded to 12 decimals, and never negative zero.
  for (let i = first; i * step <= max + step * 1e-9; i++) ticks.push(Number((i * step).toFixed(12)) || 0);
  return ticks;
}

export interface FittedAxis {
  lo: number;
  hi: number;
  ticks: number[];
}

/**
 * A value axis fitted to the data, for a chart that need not start at zero.
 * The range is padded by a quarter of the data's span and is never narrower
 * than `minSpan` (flat data gets a band around its value rather than a
 * near-zero range), never goes below `floor`, and its ticks never repeat a
 * label once formatted.
 */
export function fittedAxis(
  values: readonly number[],
  format: (value: number) => string,
  { minSpan = 0, floor, count = 4 }: { minSpan?: number; floor?: number; count?: number } = {},
): FittedAxis {
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const span = hi - lo;
  if (span < minSpan) {
    const middle = (hi + lo) / 2;
    lo = middle - minSpan / 2;
    hi = middle + minSpan / 2;
  } else {
    const pad = Math.max(span * 0.25, Math.abs(hi) * 0.002, 1e-9);
    lo -= pad;
    hi += pad;
  }
  if (floor !== undefined && lo < floor) {
    hi = Math.max(hi + (floor - lo), floor + minSpan);
    lo = floor;
  }
  for (let n = count; n >= 2; n--) {
    const ticks = niceTicks(lo, hi, n).filter((t) => t >= lo - 1e-12 && t <= hi + 1e-12);
    const labels = ticks.map(format);
    if (new Set(labels).size === labels.length) return { lo, hi, ticks };
  }
  const seen = new Set<string>();
  const ticks = niceTicks(lo, hi, 2).filter((t) => {
    const label = format(t);
    if (t < lo - 1e-12 || t > hi + 1e-12 || seen.has(label)) return false;
    seen.add(label);
    return true;
  });
  return { lo, hi, ticks };
}
