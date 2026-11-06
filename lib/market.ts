import type { MarketShock, VehicleClassTag } from "./types.ts";

/**
 * The seven buyer cohorts of ADOS 2026 (vehicle classes in the RR Toolbox
 * engine), their calibrated inputs and the 2026 market mix, as the engine
 * carries them (RRToolbox templates/AutoDriveOrSell.py VEHICLE_CLASSES and
 * MARKET_SHARES_2026, copied from ADOS2026main2e.m §1 and §13). The page
 * never changes a cohort's inputs: the market screen varies the mix and the
 * new-vehicle price change only, so the figures stay comparable with the
 * MATLAB reference run.
 */

export const VEHICLE_CLASS_TAGS = ["ECO", "ENT", "MID", "PKP", "LUX", "LSUV", "EXO"] as const satisfies readonly VehicleClassTag[];

export interface VehicleClassRow {
  tag: VehicleClassTag;
  /** ADOS2026main2e.m §13 cohortDescs. */
  name: string;
  PriceNewCar: number;
  EnjoyBase: number;
  StdMiles: number;
  d: number;
}

export const VEHICLE_CLASSES: readonly VehicleClassRow[] = [
  { tag: "ECO", name: "Economy cars (compact and subcompact)", PriceNewCar: 28_000, EnjoyBase: 3.0, StdMiles: 12_000, d: 0.05 },
  { tag: "ENT", name: "Entry-level (small sedans and crossovers)", PriceNewCar: 35_000, EnjoyBase: 3.5, StdMiles: 13_000, d: 0.05 },
  { tag: "MID", name: "Midsize cars and crossovers", PriceNewCar: 43_000, EnjoyBase: 4.0, StdMiles: 15_000, d: 0.05 },
  { tag: "PKP", name: "Pickup trucks (light-duty)", PriceNewCar: 52_000, EnjoyBase: 4.25, StdMiles: 16_000, d: 0.06 },
  { tag: "LUX", name: "Luxury cars and SUVs", PriceNewCar: 72_000, EnjoyBase: 5.0, StdMiles: 15_000, d: 0.06 },
  { tag: "LSUV", name: "Luxury SUVs and large crossovers", PriceNewCar: 85_000, EnjoyBase: 5.25, StdMiles: 14_000, d: 0.06 },
  { tag: "EXO", name: "Exotic and premium performance", PriceNewCar: 120_000, EnjoyBase: 6.5, StdMiles: 12_000, d: 0.07 },
];

/** Approximate 2026 US light-vehicle mix (ADOS2026main2e.m §1), in percent of vehicles. */
export const MARKET_MIX_2026: Readonly<Record<VehicleClassTag, number>> = {
  ECO: 12,
  ENT: 18,
  MID: 25,
  PKP: 22,
  LUX: 10,
  LSUV: 9,
  EXO: 4,
};

/** Trade-in value of a new vehicle, as a share of its price (the engine's SalvageFraction default). */
export const SALVAGE_FRACTION = 0.12;

export type MarketMix = Record<VehicleClassTag, number>;

export function classRow(tag: VehicleClassTag): VehicleClassRow {
  return VEHICLE_CLASSES.find((row) => row.tag === tag) as VehicleClassRow;
}

export function defaultMix(): MarketMix {
  return { ...MARKET_MIX_2026 };
}

/** Percent shares are kept to one decimal, so a mix is whole when its tenths add up to 1,000. */
export function mixTotal(mix: MarketMix): number {
  return VEHICLE_CLASS_TAGS.reduce((sum, tag) => sum + Math.round(mix[tag] * 10), 0) / 10;
}

export function mixIsComplete(mix: MarketMix): boolean {
  return Math.abs(mixTotal(mix) - 100) < 1e-9;
}

/** What is wrong with a mix that cannot be solved, or null. */
export function mixError(mix: MarketMix): string | null {
  const total = mixTotal(mix);
  if (Math.abs(total - 100) < 1e-9) return null;
  const gap = Math.round((100 - total) * 10) / 10;
  return gap > 0
    ? `The shares add up to ${total.toFixed(1)}%; add ${gap.toFixed(1)} points to reach 100%.`
    : `The shares add up to ${total.toFixed(1)}%; remove ${(-gap).toFixed(1)} points to reach 100%.`;
}

/** A typed percent share: a number from 0 to 100 with at most one decimal. */
export function parseSharePercent(text: string): { value: number } | { error: string } {
  const cleaned = text.replace(/[\s%]/g, "");
  const value = cleaned === "" ? Number.NaN : Number(cleaned);
  if (!Number.isFinite(value) || value < 0 || value > 100) return { error: "Enter a share from 0% to 100%." };
  return { value: Math.round(value * 10) / 10 };
}

/** The engine's market_shares input: shares of 1, in the engine's class order. */
export function marketShares(mix: MarketMix): Record<VehicleClassTag, number> {
  return Object.fromEntries(VEHICLE_CLASS_TAGS.map((tag) => [tag, Math.round(mix[tag] * 10) / 1000])) as Record<VehicleClassTag, number>;
}

/** Years in the market projection; the same horizon the single-cohort screens use. */
export const MARKET_PROJECTION_YEARS = 10;

/**
 * The market screen's one request: every cohort at its calibrated row, the
 * mix as shares of vehicles on the road, the fleet output for each cohort and
 * for the market and, for a non-zero price change, the comparison at the
 * shocked price. The cohort rows are not sent: the engine supplies them, and
 * refuses PriceNewCar, StdMiles and d beside market_shares.
 */
export function buildMarketBody(mix: MarketMix, priceShock: number): Record<string, unknown> {
  return {
    market_shares: marketShares(mix),
    cohorts: true,
    projection_years: MARKET_PROJECTION_YEARS,
    ...(priceShock !== 0 ? { price_shock: priceShock } : {}),
  };
}

/** Percent change in purchases, or null when the baseline replaces none. */
function percentChange(scenario: number, baseline: number): number | null {
  return baseline > 0 ? (scenario / baseline - 1) * 100 : null;
}

export interface MarketComparison {
  deltaPrice: number;
  /** Share-weighted percent change in the new-vehicle price. */
  priceChangePct: number;
  baselineRate: number;
  scenarioRate: number;
  firstYearRate: number;
  steadyStatePct: number | null;
  firstYearPct: number | null;
  cumulativePct: number | null;
  projectionYears: number;
  elasticity: { steadyState: number | null; firstYear: number | null; cumulative: number | null };
}

/** The market price-shock figures, read from the aggregate block. */
export function compareMarket(baselineRate: number, shock: MarketShock): MarketComparison {
  return {
    deltaPrice: shock.delta_price,
    priceChangePct: shock.price_change_pct,
    baselineRate,
    scenarioRate: shock.annual_replacement_rate,
    firstYearRate: shock.first_year_rate,
    steadyStatePct: shock.change_pct,
    firstYearPct: percentChange(shock.first_year_rate, baselineRate),
    cumulativePct: percentChange(shock.projection.cumulative, shock.baseline_cumulative),
    projectionYears: shock.projection.years.length,
    elasticity: {
      steadyState: shock.implied_elasticity,
      firstYear: shock.first_year_elasticity,
      cumulative: shock.cumulative_elasticity,
    },
  };
}

/**
 * The youngest age at which a cohort's fleet starts to replace vehicles (its
 * first positive replacement hazard), or null when it never does.
 */
export function firstReplacementAge(ages: readonly number[], hazard: readonly (number | null)[]): number | null {
  for (let i = 0; i < ages.length; i++) {
    const h = hazard[i];
    if (h !== null && h > 0) return ages[i];
  }
  return null;
}

/**
 * Cohorts ordered from the slowest to the fastest replacement, as the card's
 * preset lists them, with each cohort's share and holding period.
 */
export interface CohortRateRow {
  tag: VehicleClassTag;
  share: number;
  rate: number;
  holdingYears: number | null;
}

export function orderBySlowest(rows: CohortRateRow[]): CohortRateRow[] {
  return [...rows].sort((a, b) => a.rate - b.rate || VEHICLE_CLASS_TAGS.indexOf(a.tag) - VEHICLE_CLASS_TAGS.indexOf(b.tag));
}
