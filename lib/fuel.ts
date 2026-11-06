import type { ActionName, SolveData } from "./types.ts";
import { ACTIONS, stateIndex } from "./solve-result.ts";
import { ENGINE_DEFAULT_FUEL, FUEL_SPAN, GRID_LIMITS } from "./solve-input.ts";

/**
 * The fuel price scenario: the whole fuel-price grid shifted up by a chosen
 * amount, solved again with the same owner profile, and compared with the
 * baseline state by state. Fuel price is a state of the model, so the engine
 * needs no new input: raising FuelMin and FuelMax together moves every level
 * the owner can face while keeping the seven levels $0.50 apart.
 *
 * The question this answers is where the third choice, reducing mileage,
 * appears. At the engine's calibration it never does, at any fuel price on
 * the grid: enjoyment of about $4.00 a mile outweighs fuel at $0.20 a mile.
 * It appears once the taper of enjoyment above 12,000 miles a year is a
 * little steeper (the panel's taper field), and then first at the highest
 * fuel prices, as a fuel shock should show.
 */

export const FUEL_STEP = 0.5;
/** Largest rise the control offers; FuelMax then reaches $11.00, inside the route's limits. */
export const FUEL_RISE_LIMIT = 4;
export const DEFAULT_FUEL_RISE = 2;
/** The panel's taper (percent) at which reducing mileage first appears at otherwise-default inputs (74 of 1,232 states). */
export const TAPER_TO_SHOW_REDUCE = 35;

/** The owner-profile inputs carried from the baseline request into the scenario solve. */
const PROFILE_KEYS = ["StdMiles", "ReducedMiles", "PriceNewCar", "FixedCost", "d", "DecayFraction", "projection_years"] as const;

/**
 * Body for the solve on the shifted grid, from the baseline body: the same
 * owner profile, the fleet output, no vehicle lookup (its fuel price would be
 * off the new grid) and no price shock. Refused when the shifted grid is
 * outside the range the route accepts.
 */
export function fuelShockBody(
  baseBody: Record<string, unknown>,
  rise: number,
): { ok: true; body: Record<string, unknown> } | { ok: false; message: string } {
  const min = ENGINE_DEFAULT_FUEL.FuelMin + rise;
  const max = min + FUEL_SPAN;
  if (rise < 0 || max > GRID_LIMITS.FuelMax.max) {
    return { ok: false, message: `The fuel-price grid after the rise ($${min.toFixed(2)} to $${max.toFixed(2)}) is outside the range this demo solves.` };
  }
  const body: Record<string, unknown> = {};
  for (const key of PROFILE_KEYS) if (baseBody[key] !== undefined) body[key] = baseBody[key];
  body.FuelMin = min;
  body.FuelMax = max;
  body.cohorts = true;
  return { ok: true, body };
}

export interface ActionsAtFuel {
  fuel: number;
  counts: Record<ActionName, number>;
  /** Grid states at this fuel price (age × fuel economy × economic index). */
  states: number;
}

/** The best-action counts at each fuel-price level, every state weighted equally. */
export function actionsByFuel(data: Pick<SolveData, "policy" | "dims" | "grids">): ActionsAtFuel[] {
  const { nAge, nMpg, nEcon } = data.dims;
  return data.grids.fuel.map((fuel, ifu) => {
    const counts: Record<ActionName, number> = { drive: 0, sell: 0, reduce: 0 };
    for (let ia = 0; ia < nAge; ia++) {
      for (let im = 0; im < nMpg; im++) {
        for (let ie = 0; ie < nEcon; ie++) counts[ACTIONS[data.policy[stateIndex(data.dims, ia, im, ifu, ie)] - 1]]++;
      }
    }
    return { fuel, counts, states: nAge * nMpg * nEcon };
  });
}

export interface FuelComparison {
  /** Dollars a gallon added to every level of the grid. */
  rise: number;
  baseline: { counts: Record<ActionName, number>; byFuel: ActionsAtFuel[]; rate: number | null; holdingYears: number | null };
  scenario: { counts: Record<ActionName, number>; byFuel: ActionsAtFuel[]; rate: number | null; holdingYears: number | null };
  /** Every fuel price on either grid, ascending; the bar chart's categories. */
  prices: number[];
  /** Percent change in the steady-state replacement rate, or null without the fleet output. */
  ratePct: number | null;
}

function fleetOf(data: SolveData): { rate: number | null; holdingYears: number | null } {
  return { rate: data.cohorts?.annual_replacement_rate ?? null, holdingYears: data.cohorts?.mean_holding_years ?? null };
}

/** Baseline against the shifted grid; null when the two runs are not the same size or the shift is not a shift. */
export function compareFuel(baseline: SolveData, scenario: SolveData): FuelComparison | null {
  const sameShape =
    baseline.policy.length === scenario.policy.length &&
    (["age", "mpg", "econ"] as const).every(
      (key) => baseline.grids[key].length === scenario.grids[key].length && baseline.grids[key].every((v, i) => v === scenario.grids[key][i]),
    ) &&
    baseline.grids.fuel.length === scenario.grids.fuel.length;
  if (!sameShape) return null;
  const rise = scenario.grids.fuel[0] - baseline.grids.fuel[0];
  if (rise < 0 || baseline.grids.fuel.some((v, i) => Math.abs(scenario.grids.fuel[i] - v - rise) > 1e-9)) return null;
  const base = fleetOf(baseline);
  const after = fleetOf(scenario);
  const prices = [...new Set([...baseline.grids.fuel, ...scenario.grids.fuel])].sort((a, b) => a - b);
  return {
    rise,
    baseline: { counts: baseline.summary.decision_breakdown, byFuel: actionsByFuel(baseline), ...base },
    scenario: { counts: scenario.summary.decision_breakdown, byFuel: actionsByFuel(scenario), ...after },
    prices,
    ratePct: base.rate !== null && after.rate !== null && base.rate > 0 ? (after.rate / base.rate - 1) * 100 : null,
  };
}

/** One series over `prices`: the count of `action` states at each price, null where the grid has no such level. */
export function seriesOverPrices(byFuel: ActionsAtFuel[], prices: number[], action: ActionName): (number | null)[] {
  return prices.map((price) => byFuel.find((entry) => Math.abs(entry.fuel - price) < 1e-9)?.counts[action] ?? null);
}
