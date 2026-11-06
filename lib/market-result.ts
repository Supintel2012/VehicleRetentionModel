import type {
  ActionName,
  ChangedState,
  ClassFleet,
  ClassShockResult,
  MarketClass,
  MarketFleet,
  MarketShock,
  MarketShockClassRow,
  MarketSolveData,
  SolveData,
  VehicleClassTag,
} from "./types.ts";
import type { MarketSolveParameters } from "./solve-input.ts";
import { classRow, SALVAGE_FRACTION, VEHICLE_CLASS_TAGS } from "./market.ts";
import {
  ACTIONS,
  actionName,
  buildStateTable,
  fail,
  finite,
  finiteArray,
  finiteOrNull,
  isRecord,
  listOf,
  parseProjection,
  positiveInteger,
  record,
  share,
  shareOrNull,
} from "./solve-result.ts";

/**
 * Adapter for a market run (`market_shares` with `cohorts: true`): one call
 * that solves every buyer cohort and returns each cohort's fleet output under
 * `raw.data.vehicle_classes[tag].cohorts` and the market-weighted figures
 * under `raw.data.aggregate.cohorts`.
 *
 * The MCP result leaves out the cohort policies, so a cohort's fleet block
 * cannot be checked against its policy the way a single run's is. What can be
 * checked is: every share, hazard and rate is a share; every array has one
 * entry per age; the market figures are the share-weighted sums of the cohort
 * figures the engine documents (rate, fleet by age, sell signals, projection,
 * the shocked rate); the per-cohort rows of the market block agree with the
 * cohort blocks; and each cohort's echoed row (PriceNewCar, EnjoyBase,
 * StdMiles, d, SalvageFraction) is the row the page's cohort table shows
 * (lib/market.ts). A result that fails any of these is refused rather than
 * drawn.
 */

/** Slack for rounded figures: the service rounds fleet arrays to six significant figures. */
const ROUNDING = 1e-5;
const MAX_PARAMS = 80;

type Grids = SolveData["grids"];
type Dims = SolveData["dims"];

function tagOf(value: string, field: string): VehicleClassTag {
  return (VEHICLE_CLASS_TAGS as readonly string[]).includes(value) ? (value as VehicleClassTag) : fail(`${field} is not a vehicle class`);
}

function close(a: number, b: number): boolean {
  return Math.abs(a - b) <= ROUNDING * Math.max(1, Math.abs(b));
}

function parseChangedRows(value: unknown, grids: Grids, dims: Dims, field: string): ChangedState[] {
  if (!Array.isArray(value)) fail(`${field} is not a list`);
  const rows = buildStateTable(grids, dims);
  const seen = new Set<number>();
  return value.map((entry, i) => {
    const item = record(entry);
    const id = item.state_id;
    if (!Number.isInteger(id) || (id as number) < 1 || (id as number) > rows.length || seen.has(id as number)) {
      fail(`${field}[${i}].state_id is not a distinct state of this grid`);
    }
    seen.add(id as number);
    const row = rows[(id as number) - 1];
    for (const key of ["age", "fuel_economy", "fuel_price", "econ_condition"] as const) {
      if (item[key] !== row[key]) fail(`${field}[${i}].${key} disagrees with state ${row.state_id}`);
    }
    const from = actionName(item.from, `${field}[${i}].from`);
    const to = actionName(item.to, `${field}[${i}].to`);
    if (from === to) fail(`${field}[${i}] does not change action`);
    return { state_id: row.state_id, age: row.age, fuel_economy: row.fuel_economy, fuel_price: row.fuel_price, econ_condition: row.econ_condition, from, to };
  });
}

function parseClassShock(value: unknown, grids: Grids, dims: Dims, field: string): ClassShockResult {
  const shock = record(value);
  const delta = finite(shock.delta_price, `${field}.delta_price`);
  if (delta === 0) fail(`${field}.delta_price is zero`);
  const price = finite(shock.price_new_car, `${field}.price_new_car`);
  if (price <= 0 || price - delta <= 0) fail(`${field}.price_new_car or the baseline price it implies is not positive`);
  const changed = parseChangedRows(shock.changed_states, grids, dims, `${field}.changed_states`);
  const truncated = shock.changed_states_truncated === true;
  const count = shock.states_changed;
  if (!Number.isInteger(count) || (count as number) < 0 || (count as number) > dims.nAge * dims.nMpg * dims.nFuel * dims.nEcon) {
    fail(`${field}.states_changed is not a count of states`);
  }
  if (truncated ? (count as number) <= changed.length : count !== changed.length) fail(`${field}.states_changed does not count changed_states`);
  return {
    delta_price: delta,
    price_new_car: price,
    annual_replacement_rate: share(shock.annual_replacement_rate, `${field}.annual_replacement_rate`),
    change_pct: finiteOrNull(shock.change_pct, `${field}.change_pct`),
    implied_elasticity: finiteOrNull(shock.implied_elasticity, `${field}.implied_elasticity`),
    first_year_rate: share(shock.first_year_rate, `${field}.first_year_rate`),
    first_year_elasticity: finiteOrNull(shock.first_year_elasticity, `${field}.first_year_elasticity`),
    projection: parseProjection(shock.projection, `${field}.projection`),
    baseline_cumulative: finite(shock.baseline_cumulative, `${field}.baseline_cumulative`),
    cumulative_elasticity: finiteOrNull(shock.cumulative_elasticity, `${field}.cumulative_elasticity`),
    fleet_share: listOf(shock.fleet_share, dims.nAge, `${field}.fleet_share`, share),
    replacement_hazard: listOf(shock.replacement_hazard, dims.nAge, `${field}.replacement_hazard`, shareOrNull),
    states_changed: count as number,
    changed_states: changed,
    ...(truncated ? { changed_states_truncated: true } : {}),
  };
}

function caveatsOf(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((c) => typeof c !== "string")) fail(`${field} is not a list of strings`);
  return (value as string[]).slice(0, 20).map((c) => c.slice(0, 2000));
}

function stationaryOf(value: unknown, nAge: number, field: string): number[] | null {
  return value === null ? null : listOf(value, nAge, field, share);
}

function parseClassFleet(value: unknown, grids: Grids, dims: Dims, field: string): ClassFleet {
  const fleet = record(value);
  const ages = finiteArray(fleet.ages, dims.nAge, `${field}.ages`);
  if (ages.some((age, i) => age !== grids.age[i])) fail(`${field}.ages disagrees with grids.age`);
  const fleetShare = listOf(fleet.fleet_share, dims.nAge, `${field}.fleet_share`, share);
  if (!close(fleetShare.reduce((sum, x) => sum + x, 0), 1)) fail(`${field}.fleet_share does not sum to 1`);
  const holding = fleet.mean_holding_years;
  if (holding !== null && !(typeof holding === "number" && Number.isFinite(holding) && holding > 0)) {
    fail(`${field}.mean_holding_years is not a positive number or null`);
  }
  return {
    ages,
    fleet_share: fleetShare,
    replacement_hazard: listOf(fleet.replacement_hazard, dims.nAge, `${field}.replacement_hazard`, shareOrNull),
    grid_share_sell: listOf(fleet.grid_share_sell, dims.nAge, `${field}.grid_share_sell`, share),
    stationary_share_sell: stationaryOf(fleet.stationary_share_sell, dims.nAge, `${field}.stationary_share_sell`),
    annual_replacement_rate: share(fleet.annual_replacement_rate, `${field}.annual_replacement_rate`),
    mean_holding_years: holding as number | null,
    projection: parseProjection(fleet.projection, `${field}.projection`),
    ...(fleet.price_shock !== undefined && fleet.price_shock !== null
      ? { price_shock: parseClassShock(fleet.price_shock, grids, dims, `${field}.price_shock`) }
      : {}),
    caveats: caveatsOf(fleet.caveats, `${field}.caveats`),
  };
}

function parseParams(value: unknown, field: string): Record<string, number> {
  if (!isRecord(value)) fail(`${field} is not an object`);
  const entries = Object.entries(value)
    .filter(([key, entry]) => /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key) && typeof entry === "number" && Number.isFinite(entry))
    .slice(0, MAX_PARAMS);
  return Object.fromEntries(entries) as Record<string, number>;
}

function parseClass(tag: VehicleClassTag, value: unknown, shareOfMarket: number, grids: Grids, dims: Dims, S: number): MarketClass {
  const field = `vehicle_classes.${tag}`;
  const entry = record(value);
  const summary = record(entry.summary);
  const breakdown = record(summary.decision_breakdown);
  const counts = Object.fromEntries(
    ACTIONS.map((action) => [action, positiveIntegerOrZero(breakdown[action], `${field}.summary.decision_breakdown.${action}`)]),
  ) as Record<ActionName, number>;
  if (ACTIONS.reduce((sum, action) => sum + counts[action], 0) !== S) fail(`${field}.summary.decision_breakdown does not count ${S} states`);
  const iterations = summary.iterations;
  if (!Number.isInteger(iterations) || (iterations as number) < 0) fail(`${field}.summary.iterations is not an integer`);
  const params = parseParams(entry.params, `${field}.params`);
  checkClassRow(tag, params, `${field}.params`);
  return {
    tag,
    share: shareOfMarket,
    decision_breakdown: counts,
    iterations: iterations as number,
    params,
    fleet: parseClassFleet(entry.cohorts, grids, dims, `${field}.cohorts`),
  };
}

/** The inputs the page's cohort table shows must be the ones the engine solved on. */
const CLASS_ROW_INPUTS = ["PriceNewCar", "EnjoyBase", "StdMiles", "d"] as const;

function checkClassRow(tag: VehicleClassTag, params: Record<string, number>, field: string): void {
  const row = classRow(tag);
  for (const key of CLASS_ROW_INPUTS) {
    if (params[key] !== row[key]) fail(`${field}.${key} is not the ${tag} row the page shows (${row[key]})`);
  }
  if (params.SalvageFraction !== SALVAGE_FRACTION) fail(`${field}.SalvageFraction is not the trade-in share the page shows (${SALVAGE_FRACTION})`);
}

function positiveIntegerOrZero(value: unknown, field: string): number {
  return Number.isInteger(value) && (value as number) >= 0 ? (value as number) : fail(`${field} is not a count`);
}

function weighted(classes: MarketClass[], pick: (c: MarketClass) => number): number {
  return classes.reduce((sum, c) => sum + c.share * pick(c), 0);
}

function checkWeightedList(got: (number | null)[], classes: MarketClass[], pick: (c: MarketClass) => (number | null)[], field: string) {
  got.forEach((value, i) => {
    if (value === null) return;
    const expected = weighted(classes, (c) => pick(c)[i] ?? 0);
    if (!close(value, expected)) fail(`${field}[${i}] is not the share-weighted sum of the cohorts`);
  });
}

function parseMarketShock(value: unknown, classes: MarketClass[], baselineRate: number, dims: Dims): MarketShock {
  const field = "aggregate.cohorts.price_shock";
  const shock = record(value);
  const delta = finite(shock.delta_price, `${field}.delta_price`);
  if (delta === 0) fail(`${field}.delta_price is zero`);
  const byClass = record(shock.by_class);
  const rows = {} as Record<VehicleClassTag, MarketShockClassRow>;
  for (const c of classes) {
    const row = record(byClass[c.tag]);
    const own = c.fleet.price_shock;
    if (!own) fail(`${field}.by_class.${c.tag} has no cohort comparison to agree with`);
    const parsed: MarketShockClassRow = {
      share: share(row.share, `${field}.by_class.${c.tag}.share`),
      price_new_car: finite(row.price_new_car, `${field}.by_class.${c.tag}.price_new_car`),
      annual_replacement_rate: share(row.annual_replacement_rate, `${field}.by_class.${c.tag}.annual_replacement_rate`),
      change_pct: finiteOrNull(row.change_pct, `${field}.by_class.${c.tag}.change_pct`),
      implied_elasticity: finiteOrNull(row.implied_elasticity, `${field}.by_class.${c.tag}.implied_elasticity`),
      states_changed: positiveIntegerOrZero(row.states_changed, `${field}.by_class.${c.tag}.states_changed`),
    };
    if (
      !close(parsed.share, c.share) ||
      parsed.price_new_car !== own.price_new_car ||
      parsed.annual_replacement_rate !== own.annual_replacement_rate ||
      parsed.states_changed !== own.states_changed ||
      own.delta_price !== delta
    ) {
      fail(`${field}.by_class.${c.tag} disagrees with the cohort's own comparison`);
    }
    rows[c.tag] = parsed;
  }
  const rate = share(shock.annual_replacement_rate, `${field}.annual_replacement_rate`);
  if (!close(rate, weighted(classes, (c) => c.fleet.price_shock?.annual_replacement_rate ?? 0))) {
    fail(`${field}.annual_replacement_rate is not the share-weighted sum of the cohorts`);
  }
  const priceChangePct = finite(shock.price_change_pct, `${field}.price_change_pct`);
  const expectedPct = weighted(classes, (c) => (delta / ((c.fleet.price_shock?.price_new_car ?? 0) - delta)) * 100);
  if (!close(priceChangePct, expectedPct)) fail(`${field}.price_change_pct is not the share-weighted percent price change`);
  const changePct = finiteOrNull(shock.change_pct, `${field}.change_pct`);
  if (changePct !== null && baselineRate > 0 && !close(changePct, (rate / baselineRate - 1) * 100)) {
    fail(`${field}.change_pct does not compare the shocked rate with the baseline`);
  }
  const statesChanged = positiveIntegerOrZero(shock.states_changed, `${field}.states_changed`);
  if (statesChanged !== classes.reduce((sum, c) => sum + (c.fleet.price_shock?.states_changed ?? 0), 0)) {
    fail(`${field}.states_changed is not the sum over the cohorts`);
  }
  const fleetShare = listOf(shock.fleet_share, dims.nAge, `${field}.fleet_share`, share);
  checkWeightedList(fleetShare, classes, (c) => c.fleet.price_shock?.fleet_share ?? [], `${field}.fleet_share`);
  return {
    delta_price: delta,
    price_change_pct: priceChangePct,
    annual_replacement_rate: rate,
    change_pct: changePct,
    implied_elasticity: finiteOrNull(shock.implied_elasticity, `${field}.implied_elasticity`),
    first_year_rate: share(shock.first_year_rate, `${field}.first_year_rate`),
    first_year_elasticity: finiteOrNull(shock.first_year_elasticity, `${field}.first_year_elasticity`),
    projection: parseProjection(shock.projection, `${field}.projection`),
    baseline_cumulative: finite(shock.baseline_cumulative, `${field}.baseline_cumulative`),
    cumulative_elasticity: finiteOrNull(shock.cumulative_elasticity, `${field}.cumulative_elasticity`),
    fleet_share: fleetShare,
    replacement_hazard: listOf(shock.replacement_hazard, dims.nAge, `${field}.replacement_hazard`, shareOrNull),
    states_changed: statesChanged,
    by_class: rows,
  };
}

function parseMarketFleet(value: unknown, classes: MarketClass[], grids: Grids, dims: Dims): MarketFleet {
  const field = "aggregate.cohorts";
  const fleet = record(value);
  const ages = finiteArray(fleet.ages, dims.nAge, `${field}.ages`);
  if (ages.some((age, i) => age !== grids.age[i])) fail(`${field}.ages disagrees with grids.age`);
  if (typeof fleet.method !== "string") fail(`${field}.method is not a string`);
  const rate = share(fleet.annual_replacement_rate, `${field}.annual_replacement_rate`);
  if (!close(rate, weighted(classes, (c) => c.fleet.annual_replacement_rate))) {
    fail(`${field}.annual_replacement_rate is not the share-weighted sum of the cohort rates`);
  }
  const holding = fleet.mean_holding_years;
  if (holding === null ? rate > 0 : !(typeof holding === "number" && Number.isFinite(holding) && close(holding, 1 / rate))) {
    fail(`${field}.mean_holding_years is not 1 / annual_replacement_rate`);
  }
  const byClassRaw = record(fleet.by_class);
  const byClass = {} as MarketFleet["by_class"];
  for (const c of classes) {
    const row = record(byClassRaw[c.tag]);
    const entry = {
      share: share(row.share, `${field}.by_class.${c.tag}.share`),
      annual_replacement_rate: share(row.annual_replacement_rate, `${field}.by_class.${c.tag}.annual_replacement_rate`),
      mean_holding_years: row.mean_holding_years === null ? null : finite(row.mean_holding_years, `${field}.by_class.${c.tag}.mean_holding_years`),
    };
    if (!close(entry.share, c.share) || entry.annual_replacement_rate !== c.fleet.annual_replacement_rate || entry.mean_holding_years !== c.fleet.mean_holding_years) {
      fail(`${field}.by_class.${c.tag} disagrees with the cohort's own fleet block`);
    }
    byClass[c.tag] = entry;
  }
  const fleetShare = listOf(fleet.fleet_share, dims.nAge, `${field}.fleet_share`, share);
  checkWeightedList(fleetShare, classes, (c) => c.fleet.fleet_share, `${field}.fleet_share`);
  const gridShare = listOf(fleet.grid_share_sell, dims.nAge, `${field}.grid_share_sell`, share);
  checkWeightedList(gridShare, classes, (c) => c.fleet.grid_share_sell, `${field}.grid_share_sell`);
  const stationary = stationaryOf(fleet.stationary_share_sell, dims.nAge, `${field}.stationary_share_sell`);
  if (stationary) {
    if (classes.some((c) => c.fleet.stationary_share_sell === null)) fail(`${field}.stationary_share_sell is given although a cohort lacks it`);
    checkWeightedList(stationary, classes, (c) => c.fleet.stationary_share_sell ?? [], `${field}.stationary_share_sell`);
  }
  const hazard = listOf(fleet.replacement_hazard, dims.nAge, `${field}.replacement_hazard`, shareOrNull);
  // Vehicles sold at an age over vehicles at that age, summed over the cohorts.
  hazard.forEach((value, i) => {
    const vehicles = weighted(classes, (c) => c.fleet.fleet_share[i]);
    if (value === null) {
      if (vehicles > ROUNDING) fail(`${field}.replacement_hazard[${i}] is missing although vehicles reach that age`);
      return;
    }
    const sold = weighted(classes, (c) => c.fleet.fleet_share[i] * (c.fleet.replacement_hazard[i] ?? 0));
    if (vehicles > ROUNDING && Math.abs(value - sold / vehicles) > 1e-3) fail(`${field}.replacement_hazard[${i}] is not the market hazard`);
  });
  const projection = parseProjection(fleet.projection, `${field}.projection`);
  checkWeightedList(projection.replacement_rate, classes, (c) => c.fleet.projection.replacement_rate, `${field}.projection.replacement_rate`);
  return {
    ages,
    method: (fleet.method as string).slice(0, 4000),
    fleet_share: fleetShare,
    replacement_hazard: hazard,
    grid_share_sell: gridShare,
    stationary_share_sell: stationary,
    annual_replacement_rate: rate,
    mean_holding_years: holding as number | null,
    by_class: byClass,
    projection,
    ...(fleet.price_shock !== undefined && fleet.price_shock !== null
      ? { price_shock: parseMarketShock(fleet.price_shock, classes, rate, dims) }
      : {}),
    caveats: caveatsOf(fleet.caveats, `${field}.caveats`),
  };
}

/** Validate a market run's `raw.data` and map it to MarketSolveData. */
export function adaptMarketSolveData(value: unknown): MarketSolveData {
  const data = record(value);
  const rawDims = record(data.dims);
  const dims: Dims = {
    nAge: positiveInteger(rawDims.nAge, "dims.nAge"),
    nMpg: positiveInteger(rawDims.nMpg, "dims.nMpg"),
    nFuel: positiveInteger(rawDims.nFuel, "dims.nFuel"),
    nEcon: positiveInteger(rawDims.nEcon, "dims.nEcon"),
  };
  const S = dims.nAge * dims.nMpg * dims.nFuel * dims.nEcon;
  const rawGrids = record(data.grids);
  const grids: Grids = {
    age: finiteArray(rawGrids.age, dims.nAge, "grids.age"),
    mpg: finiteArray(rawGrids.mpg, dims.nMpg, "grids.mpg"),
    fuel: finiteArray(rawGrids.fuel, dims.nFuel, "grids.fuel"),
    econ: finiteArray(rawGrids.econ, dims.nEcon, "grids.econ"),
  };
  const summary = record(data.summary);
  if (summary.S !== S) fail(`summary.S does not equal the ${S} states in dims`);

  const aggregate = record(data.aggregate);
  const sharesRaw = record(aggregate.market_shares);
  const classesRaw = record(data.vehicle_classes);
  const tags = Object.keys(classesRaw).map((tag) => tagOf(tag, "vehicle_classes"));
  if (tags.length === 0) fail("vehicle_classes is empty");
  if (Object.keys(sharesRaw).some((tag) => !tags.includes(tagOf(tag, "aggregate.market_shares")))) fail("aggregate.market_shares names a class that was not solved");
  const ordered = VEHICLE_CLASS_TAGS.filter((tag) => tags.includes(tag));
  if (ordered.length !== tags.length) fail("vehicle_classes repeats a class");
  const classes = ordered.map((tag) => parseClass(tag, classesRaw[tag], share(sharesRaw[tag], `aggregate.market_shares.${tag}`), grids, dims, S));
  const total = classes.reduce((sum, c) => sum + c.share, 0);
  if (!close(total, 1)) fail("aggregate.market_shares do not sum to 1");
  if (aggregate.cohorts === undefined || aggregate.cohorts === null) fail("aggregate.cohorts is missing: the run did not ask for the fleet output");
  const market = parseMarketFleet(aggregate.cohorts, classes, grids, dims);
  return { kind: "market", grids, dims, classes, market };
}

/** The run must answer the mix and the price change that were sent. */
export function checkMarketAgainstRequest(data: MarketSolveData, request: MarketSolveParameters): void {
  const sent = Object.entries(request.market_shares).filter(([, v]) => v !== undefined) as [VehicleClassTag, number][];
  if (sent.length !== data.classes.length) fail("the run solved a different set of cohorts than the request");
  for (const [tag, value] of sent) {
    const c = data.classes.find((entry) => entry.tag === tag);
    if (!c || !close(c.share, value)) fail(`the run's share for ${tag} disagrees with the request`);
  }
  const shock = data.market.price_shock;
  if (shock && shock.delta_price !== request.price_shock) fail("aggregate.cohorts.price_shock is for a different price change");
  if (!shock && request.price_shock) fail("aggregate.cohorts.price_shock is missing for the price change asked for");
  if (request.projection_years !== undefined && data.market.projection.years.length !== request.projection_years) {
    fail("aggregate.cohorts.projection is not over the years asked for");
  }
}
