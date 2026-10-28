import type { ActionName, SolveData } from "./types.ts";
import { ACTIONS, stateIndex } from "./solve-result.ts";

/**
 * Readings of the solved policy for the policy map and the headline figures.
 * Everything here is computed from `policy`, `dims` and `grids` of one solve;
 * no figure is assumed.
 *
 * "Replacement age" is the youngest age at which selling (trade in and buy a
 * new vehicle) is the optimal action for a given fuel economy, fuel price and
 * economic index; null when selling is never optimal at those conditions.
 */

export type PolicyGrid = Pick<SolveData, "policy" | "dims" | "grids">;
/** The three conditions other than age. */
export type Dimension = "econ" | "mpg" | "fuel";

const SELL = ACTIONS.indexOf("sell") + 1;

export function actionAt(data: PolicyGrid, ia: number, im: number, ifu: number, ie: number): ActionName {
  return ACTIONS[data.policy[stateIndex(data.dims, ia, im, ifu, ie)] - 1];
}

/** Rows are ages, columns economic-index levels, at one fuel economy and fuel price. */
export function sliceAgeByEcon(data: PolicyGrid, mpgIdx: number, fuelIdx: number): ActionName[][] {
  return data.grids.age.map((_, ia) => data.grids.econ.map((__, ie) => actionAt(data, ia, mpgIdx, fuelIdx, ie)));
}

/** Rows are ages, columns fuel-economy levels, at one economic index and fuel price. */
export function sliceAgeByMpg(data: PolicyGrid, econIdx: number, fuelIdx: number): ActionName[][] {
  return data.grids.age.map((_, ia) => data.grids.mpg.map((__, im) => actionAt(data, ia, im, fuelIdx, econIdx)));
}

/** Index of the youngest age at which selling is optimal, or null. */
export function replacementAgeIndex(data: PolicyGrid, im: number, ifu: number, ie: number): number | null {
  for (let ia = 0; ia < data.dims.nAge; ia++) {
    if (data.policy[stateIndex(data.dims, ia, im, ifu, ie)] === SELL) return ia;
  }
  return null;
}

/** "age 7", or "age 10 or older" for the top age, which stands for that age or older. */
export function ageText(data: PolicyGrid, ia: number): string {
  const age = data.grids.age[ia];
  return ia === data.dims.nAge - 1 ? `age ${age} or older` : `age ${age}`;
}

export interface EconRule {
  econ: number;
  /** Youngest and oldest replacement age over the fuel-economy × fuel-price combinations that sell. */
  youngest: number | null;
  oldest: number | null;
  /** Combinations at this index where selling is never optimal. */
  neverSells: number;
  combinations: number;
}

/** For each economic-index level, the range of replacement ages over fuel economy × fuel price. */
export function replacementRuleByEcon(data: PolicyGrid): EconRule[] {
  const { nMpg, nFuel } = data.dims;
  return data.grids.econ.map((econ, ie) => {
    const ages: number[] = [];
    let neverSells = 0;
    for (let im = 0; im < nMpg; im++) {
      for (let ifu = 0; ifu < nFuel; ifu++) {
        const ia = replacementAgeIndex(data, im, ifu, ie);
        if (ia === null) neverSells++;
        else ages.push(ia);
      }
    }
    return {
      econ,
      youngest: ages.length ? data.grids.age[Math.min(...ages)] : null,
      oldest: ages.length ? data.grids.age[Math.max(...ages)] : null,
      neverSells,
      combinations: nMpg * nFuel,
    };
  });
}

/** Plain text for one economic-index rule, e.g. "replaced from age 5 or 6, depending on fuel economy and fuel price". */
export function econRuleText(rule: EconRule, topAge: number): string {
  const age = (a: number) => (a >= topAge ? `${a} or older` : String(a));
  if (rule.youngest === null || rule.oldest === null) return "never replaced on this grid";
  const range = rule.youngest === rule.oldest ? `from age ${age(rule.youngest)}` : `from age ${age(rule.youngest)} or ${age(rule.oldest)}, depending on fuel economy and fuel price`;
  if (!rule.neverSells) return `replaced ${range}`;
  return `replaced ${range}; never replaced in ${rule.neverSells} of ${rule.combinations} fuel-economy and fuel-price combinations`;
}

export interface DimensionEffect {
  dimension: Dimension;
  /** Combinations of the other two conditions in which the replacement age differs across this condition's levels. */
  changed: number;
  combinations: number;
}

const DIMENSION_ORDER: readonly Dimension[] = ["econ", "mpg", "fuel"];

function levels(data: PolicyGrid, dimension: Dimension): number {
  return { econ: data.dims.nEcon, mpg: data.dims.nMpg, fuel: data.dims.nFuel }[dimension];
}

/**
 * How often each condition changes the replacement age: for every combination
 * of the other two conditions, does the replacement age differ across this
 * condition's levels? A combination that never sells at one level and sells at
 * another counts as changed. Conditions with a single level are left out.
 */
export function dimensionEffects(data: PolicyGrid): DimensionEffect[] {
  const effects: DimensionEffect[] = [];
  for (const dimension of DIMENSION_ORDER) {
    const n = levels(data, dimension);
    if (n < 2) continue;
    const [a, b] = DIMENSION_ORDER.filter((d) => d !== dimension);
    let changed = 0;
    for (let i = 0; i < levels(data, a); i++) {
      for (let j = 0; j < levels(data, b); j++) {
        const ages = new Set<number | null>();
        for (let k = 0; k < n; k++) {
          const at = { [a]: i, [b]: j, [dimension]: k } as Record<Dimension, number>;
          ages.add(replacementAgeIndex(data, at.mpg, at.fuel, at.econ));
        }
        if (ages.size > 1) changed++;
      }
    }
    effects.push({ dimension, changed, combinations: levels(data, a) * levels(data, b) });
  }
  return effects;
}

const NAMES: Record<Dimension, string> = { econ: "the economic index", mpg: "fuel economy", fuel: "fuel price" };
const OTHERS: Record<Dimension, string> = {
  econ: "fuel economy and fuel price",
  mpg: "fuel price and economic index",
  fuel: "fuel economy and economic index",
};

/** At most this share of combinations counts as "only" (the condition barely moves the replacement age). */
const BARELY = 0.25;

/**
 * One sentence on which conditions change the replacement age and which barely
 * do, ordered from the most to the least often (ties keep economic index, fuel
 * economy, fuel price).
 */
export function dimensionSentence(data: PolicyGrid): string {
  if (!data.policy.includes(SELL)) {
    return "Selling is never optimal on this grid, so no condition changes the age at which replacement starts.";
  }
  const effects = [...dimensionEffects(data)].sort((x, y) => y.changed / y.combinations - x.changed / x.combinations);
  if (effects.every((e) => e.changed === 0)) {
    return "The age at which replacement starts is the same in every combination of fuel economy, fuel price and economic index.";
  }
  const parts = effects.map((e, i) => {
    const name = NAMES[e.dimension];
    const count = `${e.changed} of ${e.combinations} combinations of ${OTHERS[e.dimension]}`;
    if (e.changed === 0) return `${name} never changes it (0 of ${e.combinations} combinations of ${OTHERS[e.dimension]})`;
    const only = e.changed / e.combinations <= BARELY ? "only " : "";
    return `${name} changes ${i === 0 ? "the age at which replacement starts" : "it"} in ${only}${count}`;
  });
  const last = parts.length > 1 ? `and ${parts.pop()}` : "";
  return `Across the grid, ${[...parts, ...(last ? [last] : [])].join("; ")}.`;
}

function joinWords(items: string[]): string {
  if (items.length <= 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * The replacement age at each column of a policy-map slice, grouped by age,
 * e.g. "At 28 mpg and $5.50 a gallon, replacement starts at age 7 at economic
 * index 90, age 6 at 100 and 110, and age 5 at 120."
 */
export function sliceSentence(data: PolicyGrid, view: "econ" | "mpg", fixedIdx: number, fuelIdx: number): string {
  const fuel = `$${data.grids.fuel[fuelIdx].toFixed(2)} a gallon`;
  const columns = view === "econ" ? data.grids.econ : data.grids.mpg;
  const lead = view === "econ" ? `At ${data.grids.mpg[fixedIdx]} mpg and ${fuel}` : `At economic index ${data.grids.econ[fixedIdx]} and ${fuel}`;
  const groups = new Map<number | null, number[]>();
  columns.forEach((value, c) => {
    const ia = view === "econ" ? replacementAgeIndex(data, fixedIdx, fuelIdx, c) : replacementAgeIndex(data, c, fuelIdx, fixedIdx);
    groups.set(ia, [...(groups.get(ia) ?? []), value]);
  });
  const levelText = (values: number[], first: boolean) =>
    view === "econ"
      ? `${first ? "economic index " : ""}${joinWords(values.map(String))}`
      : `${joinWords(values.map(String))} mpg`;
  const every = view === "econ" ? "every economic-index level" : "every fuel-economy level";
  const any = view === "econ" ? "any economic-index level" : "any fuel-economy level";
  const never = groups.get(null);
  groups.delete(null);
  if (groups.size === 0) return `${lead}, selling is not optimal at ${any} or age.`;
  if (groups.size === 1 && !never) return `${lead}, replacement starts at ${ageText(data, [...groups.keys()][0] as number)} at ${every}.`;
  const parts = [...groups.entries()].map(([ia, values], i) => `${ageText(data, ia as number)} at ${levelText(values, i === 0)}`);
  const last = parts.pop();
  const starts = parts.length ? `${parts.join(", ")}${parts.length > 1 ? "," : ""} and ${last}` : last;
  const tail = never ? `; selling is never optimal at ${levelText(never, true)}` : "";
  return `${lead}, replacement starts at ${starts}${tail}.`;
}

export interface AgeShare {
  age: number;
  sellStates: number;
  states: number;
  /** sellStates / states: every grid state at this age weighted equally; not a share of vehicles. */
  share: number;
}

/** Equal-weight count of the states at each age where selling is optimal. */
export function gridShareByAge(data: PolicyGrid): AgeShare[] {
  const perAge = data.dims.nMpg * data.dims.nFuel * data.dims.nEcon;
  return data.grids.age.map((age, ia) => {
    let sellStates = 0;
    for (let s = ia * perAge; s < (ia + 1) * perAge; s++) if (data.policy[s] === SELL) sellStates++;
    return { age, sellStates, states: perAge, share: sellStates / perAge };
  });
}
