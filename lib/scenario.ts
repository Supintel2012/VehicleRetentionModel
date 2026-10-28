import type { ActionName, ChangedState, CohortsData, SolveData } from "./types.ts";
import { ACTIONS } from "./solve-result.ts";
import { gridShareByAge } from "./policy.ts";
import { PARAMETER_LIMITS } from "./solve-input.ts";

/**
 * The regulatory cost scenario: the RR Toolbox's price-shock comparison set
 * beside a static price-elasticity calculation, and the grid-level fallback
 * used when the engine returns no cohort output.
 *
 * Every ADOS figure is read or derived from the response; the only input of
 * the static calculation is the elasticity the analyst enters.
 */

/** Engine default for PriceNewCar, used only when a request leaves the price out. */
export const ENGINE_DEFAULT_PRICE = 43_000;

/** Static price-elasticity approach: percent change in purchases = elasticity × (price change / price) × 100. */
export function staticPercentChange(elasticity: number, deltaPrice: number, basePrice: number): number {
  return elasticity * (deltaPrice / basePrice) * 100;
}

function percentChange(scenario: number, baseline: number): number | null {
  return baseline > 0 ? (scenario / baseline - 1) * 100 : null;
}

export interface ScenarioComparison {
  deltaPrice: number;
  basePrice: number;
  /** Price change as a percent of the baseline price. */
  priceChangePct: number;
  baselineRate: number;
  scenarioRate: number;
  firstYearRate: number;
  /** Percent changes in replacements: steady state, first year, and over the projection. */
  steadyStatePct: number | null;
  firstYearPct: number | null;
  cumulativePct: number | null;
  projectionYears: number;
  elasticity: { steadyState: number | null; firstYear: number | null; cumulative: number | null };
  /** The static approach's percent change in new-vehicle purchases at the entered elasticity. */
  staticPct: number;
}

/** Baseline vs price-shock figures, read from the cohort block, with the static calculation beside them. */
export function compareScenario(cohorts: CohortsData, staticElasticity: number): ScenarioComparison | null {
  const shock = cohorts.price_shock;
  if (!shock) return null;
  const basePrice = shock.price_new_car - shock.delta_price;
  const baselineRate = cohorts.annual_replacement_rate;
  return {
    deltaPrice: shock.delta_price,
    basePrice,
    priceChangePct: (shock.delta_price / basePrice) * 100,
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
    staticPct: staticPercentChange(staticElasticity, shock.delta_price, basePrice),
  };
}

export const ELASTICITY_LIMITS = { min: -10, max: 10 } as const;

export type Parsed = { ok: true; value: number } | { ok: false; message: string };

/** The elasticity field: a finite number from -10 to 10 ("-1", "-0.8", "−1.2" with a minus sign). */
export function parseElasticity(text: string): Parsed {
  const normalized = text.trim().replace(/−/g, "-");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(normalized)) return { ok: false, message: "Enter a number, for example -1.0." };
  const value = Number(normalized);
  if (value < ELASTICITY_LIMITS.min || value > ELASTICITY_LIMITS.max) {
    return { ok: false, message: `Enter a value between ${ELASTICITY_LIMITS.min} and ${ELASTICITY_LIMITS.max}.` };
  }
  return { ok: true, value };
}

// ── Grid-level fallback (engine without cohort output) ──────────────────────

/**
 * Body for the plain solve at the shocked price, from the baseline body: the
 * same owner profile at PriceNewCar + delta, without the vehicle lookup or the
 * cohort switches. Refused when the shocked price is outside the range the
 * route accepts.
 */
export function shockedPriceBody(
  baseBody: Record<string, unknown>,
  deltaPrice: number,
): { ok: true; body: Record<string, unknown> } | { ok: false; message: string } {
  const basePrice = typeof baseBody.PriceNewCar === "number" ? baseBody.PriceNewCar : ENGINE_DEFAULT_PRICE;
  const price = basePrice + deltaPrice;
  const { min, max } = PARAMETER_LIMITS.PriceNewCar;
  if (price < min || price > max) {
    return {
      ok: false,
      message: `The new-vehicle price after the change ($${price.toLocaleString("en-US")}) is outside the $${min.toLocaleString("en-US")} to $${max.toLocaleString("en-US")} range this demo solves.`,
    };
  }
  const body: Record<string, unknown> = {};
  for (const key of ["StdMiles", "ReducedMiles", "FixedCost", "d"] as const) {
    if (baseBody[key] !== undefined) body[key] = baseBody[key];
  }
  body.PriceNewCar = price;
  return { ok: true, body };
}

export interface GridComparison {
  changed: ChangedState[];
  shares: { age: number; baseline: number; scenario: number; baselineStates: number; scenarioStates: number; states: number }[];
}

/** States whose optimal action differs between two plain solves on the same grid, and equal-weight sell shares by age. */
export function compareGrids(baseline: SolveData, scenario: SolveData): GridComparison | null {
  const sameGrid =
    baseline.policy.length === scenario.policy.length &&
    (["age", "mpg", "fuel", "econ"] as const).every(
      (key) =>
        baseline.grids[key].length === scenario.grids[key].length &&
        baseline.grids[key].every((value, i) => value === scenario.grids[key][i]),
    );
  if (!sameGrid) return null;
  const changed: ChangedState[] = [];
  baseline.policy.forEach((action, s) => {
    if (action === scenario.policy[s]) return;
    const row = baseline.state_table[s];
    changed.push({
      state_id: row.state_id,
      age: row.age,
      fuel_economy: row.fuel_economy,
      fuel_price: row.fuel_price,
      econ_condition: row.econ_condition,
      from: ACTIONS[action - 1],
      to: ACTIONS[scenario.policy[s] - 1],
    });
  });
  const before = gridShareByAge(baseline);
  const after = gridShareByAge(scenario);
  return {
    changed,
    shares: before.map((b, i) => ({
      age: b.age,
      baseline: b.share,
      scenario: after[i].share,
      baselineStates: b.sellStates,
      scenarioStates: after[i].sellStates,
      states: b.states,
    })),
  };
}

// ── Switching states in words ───────────────────────────────────────────────

const ACTION_WORDS: Record<ActionName, string> = {
  drive: "keep driving",
  sell: "trade in and buy new",
  reduce: "drive fewer miles",
};

export interface SwitchGroup {
  age: number;
  econ: number;
  from: ActionName;
  to: ActionName;
  /** Fuel economy levels, each with the fuel prices at which the state switches. */
  cells: { mpg: number; fuel: number[] }[];
  /** e.g. "26 mpg with fuel at $4.00 and 28 mpg with fuel at $5.00 or $5.50" */
  where: string;
  /** e.g. "from sell (trade in and buy new) to drive (keep driving)" */
  change: string;
}

const dollars = (x: number) => `$${x.toFixed(2)}`;

function joinWords(items: string[], word = "and"): string {
  if (items.length <= 2) return items.join(` ${word} `);
  return `${items.slice(0, -1).join(", ")} ${word} ${items[items.length - 1]}`;
}

/** Switching states grouped by age, economic index and direction, in state order. */
export function describeSwitches(changed: ChangedState[]): SwitchGroup[] {
  const groups = new Map<string, SwitchGroup>();
  for (const state of changed) {
    const key = `${state.age}|${state.econ_condition}|${state.from}|${state.to}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        age: state.age,
        econ: state.econ_condition,
        from: state.from,
        to: state.to,
        cells: [],
        where: "",
        change: `from ${state.from} (${ACTION_WORDS[state.from]}) to ${state.to} (${ACTION_WORDS[state.to]})`,
      };
      groups.set(key, group);
    }
    const cell = group.cells.find((c) => c.mpg === state.fuel_economy);
    if (cell) cell.fuel.push(state.fuel_price);
    else group.cells.push({ mpg: state.fuel_economy, fuel: [state.fuel_price] });
  }
  for (const group of groups.values()) {
    group.where = joinWords(group.cells.map((c) => `${c.mpg} mpg with fuel at ${joinWords(c.fuel.map(dollars), "or")}`));
  }
  return [...groups.values()];
}
