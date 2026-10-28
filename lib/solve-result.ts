import type {
  ActionName,
  ChangedState,
  CohortProjection,
  CohortsData,
  PriceShockResult,
  QueryStateResult,
  SolveData,
  SolveSummary,
  StateRow,
} from "./types.ts";
import type { SolveParameters } from "./solve-input.ts";

/**
 * Adapter from an RR Toolbox MCP `run_decision_model` result to the
 * SolveResponse shape the wizard renders.
 *
 * The run envelope (`raw.data` is the ADOS 2026 v1c engine output) arrives as
 * JSON text. structuredContent is used only when it is that envelope: with MCP
 * Apps enabled the RR Toolbox puts a display view-model there instead (no
 * `raw`) and keeps the envelope in the text. MCP results may omit
 * `raw.data.state_table` (and round `value`), so state coordinates are always
 * rebuilt from `grids` + `dims` with the engine's index formula. When the
 * table is present it must agree with that rebuild, which also proves the
 * formula the policy heatmap relies on.
 *
 * Newer engines also return `actionlabels`, `policy_index_base`, a `params`
 * echo of the inputs they used and, when asked with `cohorts: true`, a
 * `cohorts` block of fleet figures. Each is optional (an engine without them
 * is still read), but when present it is checked: the labels and index base
 * must match the policy encoding, the echo must agree with the request, and
 * the cohort block must belong to this policy (its equal-weight sell shares
 * and its switching states are re-derived from the policy).
 */

/** Engine action order; the engine's policy array is 1-based into this list. */
export const ACTIONS: readonly ActionName[] = ["drive", "sell", "reduce"];

/**
 * Slack for shares: MCP compaction may round figures, and a share reported to
 * two decimals (0.09 for 7/80) is within half a cent of the exact value.
 */
const SHARE_TOLERANCE = 0.005;
/** At most this many echoed parameters are kept (the v1c engine echoes about 40). */
const MAX_PARAMS = 80;
/** Echoed inputs compared with the request; the engine stores them as floats. */
const ECHOED_INPUTS = ["StdMiles", "ReducedMiles", "PriceNewCar", "FixedCost", "d", "projection_years"] as const;

/** The tool ran but reported an error. The detail is for server logs only. */
export class SolveToolError extends Error {
  name = "SolveToolError";
  /** HTTP status of the RR Toolbox endpoint behind the tool, when the error names one. */
  readonly upstreamStatus: number | null;

  constructor(detail: string) {
    super(detail);
    const status = /status code:?\s*(\d{3})\b/i.exec(detail);
    this.upstreamStatus = status ? Number(status[1]) : null;
  }
}

/** The result does not have the shape this page needs. The detail is for server logs only. */
export class SolveProtocolError extends Error {
  name = "SolveProtocolError";
}

export interface AdaptedSolve {
  data: SolveData;
  attribution: string;
  warnings: string[];
}

type Dims = SolveData["dims"];
type Grids = SolveData["grids"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function fail(detail: string): never {
  throw new SolveProtocolError(detail);
}

function finite(value: unknown, field: string): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fail(`${field} is not a finite number`);
}

function positiveInteger(value: unknown, field: string): number {
  return Number.isInteger(value) && (value as number) > 0 ? (value as number) : fail(`${field} is not a positive integer`);
}

function finiteArray(value: unknown, length: number, field: string): number[] {
  if (!Array.isArray(value) || value.length !== length) fail(`${field} does not have ${length} entries`);
  return value.map((entry, i) => finite(entry, `${field}[${i}]`));
}

function finiteOrNull(value: unknown, field: string): number | null {
  return value === null ? null : finite(value, field);
}

function share(value: unknown, field: string): number {
  const x = finite(value, field);
  return x >= -SHARE_TOLERANCE && x <= 1 + SHARE_TOLERANCE ? x : fail(`${field} is not a share between 0 and 1`);
}

function shareOrNull(value: unknown, field: string): number | null {
  return value === null ? null : share(value, field);
}

function listOf<T>(value: unknown, length: number, field: string, item: (entry: unknown, field: string) => T): T[] {
  if (!Array.isArray(value) || value.length !== length) fail(`${field} does not have ${length} entries`);
  return value.map((entry, i) => item(entry, `${field}[${i}]`));
}

function textOf(tool: Record<string, unknown>): string | undefined {
  if (!Array.isArray(tool.content)) return undefined;
  const parts = tool.content
    .map((item) => record(item))
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text as string);
  return parts.length ? parts.join("\n") : undefined;
}

/** Engine index formula: age slowest, economic index fastest (0-based). */
export function stateIndex(dims: Dims, ia: number, im: number, ifu: number, ie: number): number {
  return ((ia * dims.nMpg + im) * dims.nFuel + ifu) * dims.nEcon + ie;
}

export function buildStateTable(grids: Grids, dims: Dims): StateRow[] {
  const rows: StateRow[] = [];
  for (let ia = 0; ia < dims.nAge; ia++) {
    for (let im = 0; im < dims.nMpg; im++) {
      for (let ifu = 0; ifu < dims.nFuel; ifu++) {
        for (let ie = 0; ie < dims.nEcon; ie++) {
          rows.push({
            state_id: stateIndex(dims, ia, im, ifu, ie) + 1,
            age: grids.age[ia],
            fuel_economy: grids.mpg[im],
            fuel_price: grids.fuel[ifu],
            econ_condition: grids.econ[ie],
            age_idx: ia,
            mpg_idx: im,
            fuel_idx: ifu,
            econ_idx: ie,
          });
        }
      }
    }
  }
  return rows;
}

/** Python's round(): halves go to the even neighbour, so rebuilt labels match the engine's. */
function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** Labels in the engine's format, e.g. "Age7_mpg28_price55_y90". */
export function buildStateLabels(rows: StateRow[]): string[] {
  return rows.map(
    (row) =>
      `Age${Math.trunc(row.age)}_mpg${roundHalfEven(row.fuel_economy)}_` +
      `price${roundHalfEven(row.fuel_price * 10)}_y${roundHalfEven(row.econ_condition)}`,
  );
}

const ROW_KEYS = [
  "state_id",
  "age",
  "fuel_economy",
  "fuel_price",
  "econ_condition",
  "age_idx",
  "mpg_idx",
  "fuel_idx",
  "econ_idx",
] as const satisfies readonly (keyof StateRow)[];

function checkStateTable(value: unknown, rebuilt: StateRow[]) {
  if (!Array.isArray(value) || value.length !== rebuilt.length) {
    fail(`state_table does not have ${rebuilt.length} rows`);
  }
  value.forEach((entry, i) => {
    const row = record(entry);
    for (const key of ROW_KEYS) {
      if (row[key] !== rebuilt[i][key]) fail(`state_table row ${i + 1} disagrees with grids and dims at ${key}`);
    }
  });
}

function parseQueryState(value: unknown, rows: StateRow[], policy: number[]): QueryStateResult {
  const query = record(value);
  const stateId = query.state_id;
  if (!Number.isInteger(stateId) || (stateId as number) < 1 || (stateId as number) > rows.length) {
    fail("query_state.state_id is not a state of this grid");
  }
  const row = rows[(stateId as number) - 1];
  const actionIndex = query.recommended_action_index;
  if (actionIndex !== policy[row.state_id - 1] || query.recommended_action !== ACTIONS[(actionIndex as number) - 1]) {
    fail("query_state recommendation disagrees with the policy");
  }
  const matched = record(query.matched);
  const coordinates = {
    age: finite(matched.age, "query_state.matched.age"),
    fuel_economy: finite(matched.fuel_economy, "query_state.matched.fuel_economy"),
    fuel_price: finite(matched.fuel_price, "query_state.matched.fuel_price"),
    econ_condition: finite(matched.econ_condition, "query_state.matched.econ_condition"),
  };
  for (const key of Object.keys(coordinates) as (keyof typeof coordinates)[]) {
    if (coordinates[key] !== row[key]) fail(`query_state.matched.${key} disagrees with state ${row.state_id}`);
  }
  if (typeof query.label !== "string") fail("query_state.label is not a string");
  return {
    state_id: row.state_id,
    label: query.label,
    matched: coordinates,
    recommended_action: ACTIONS[(actionIndex as number) - 1],
    recommended_action_index: actionIndex as number,
    value: finite(query.value, "query_state.value"),
  };
}

function parseProjection(value: unknown, field: string): CohortProjection {
  const projection = record(value);
  if (typeof projection.start !== "string") fail(`${field}.start is not a string`);
  if (
    !Array.isArray(projection.years) ||
    projection.years.length === 0 ||
    projection.years.some((year, i) => year !== i + 1)
  ) {
    fail(`${field}.years is not 1, 2, ..., n`);
  }
  const years = projection.years as number[];
  return {
    start: projection.start,
    years: [...years],
    replacement_rate: listOf(projection.replacement_rate, years.length, `${field}.replacement_rate`, share),
    cumulative: finite(projection.cumulative, `${field}.cumulative`),
  };
}

function actionName(value: unknown, field: string): ActionName {
  return ACTIONS.includes(value as ActionName) ? (value as ActionName) : fail(`${field} is not an action name`);
}

function parseChangedStates(value: unknown, rows: StateRow[], policy: number[]): ChangedState[] {
  if (!Array.isArray(value)) fail("cohorts.price_shock.changed_states is not a list");
  const seen = new Set<number>();
  return value.map((entry, i) => {
    const field = `cohorts.price_shock.changed_states[${i}]`;
    const item = record(entry);
    const id = item.state_id;
    if (!Number.isInteger(id) || (id as number) < 1 || (id as number) > rows.length || seen.has(id as number)) {
      fail(`${field}.state_id is not a distinct state of this grid`);
    }
    seen.add(id as number);
    const row = rows[(id as number) - 1];
    for (const key of ["age", "fuel_economy", "fuel_price", "econ_condition"] as const) {
      if (item[key] !== row[key]) fail(`${field}.${key} disagrees with state ${row.state_id}`);
    }
    const from = actionName(item.from, `${field}.from`);
    const to = actionName(item.to, `${field}.to`);
    if (from !== ACTIONS[policy[row.state_id - 1] - 1]) fail(`${field}.from disagrees with the policy`);
    if (from === to) fail(`${field} does not change action`);
    return { state_id: row.state_id, age: row.age, fuel_economy: row.fuel_economy, fuel_price: row.fuel_price, econ_condition: row.econ_condition, from, to };
  });
}

function parsePriceShock(value: unknown, nAge: number, rows: StateRow[], policy: number[]): PriceShockResult {
  const shock = record(value);
  const field = "cohorts.price_shock";
  const delta = finite(shock.delta_price, `${field}.delta_price`);
  if (delta === 0) fail(`${field}.delta_price is zero`);
  const price = finite(shock.price_new_car, `${field}.price_new_car`);
  if (price <= 0 || price - delta <= 0) fail(`${field}.price_new_car or the baseline price it implies is not positive`);
  const changed = parseChangedStates(shock.changed_states, rows, policy);
  // A compaction may list only the first switching states; it must then say so
  // (changed_states_truncated: true) and keep the full count in states_changed.
  const truncated = shock.changed_states_truncated === true;
  const count = shock.states_changed;
  if (!Number.isInteger(count) || (count as number) > rows.length) fail(`${field}.states_changed is not a count of states`);
  if (truncated ? (count as number) <= changed.length : count !== changed.length) {
    fail(`${field}.states_changed does not count changed_states`);
  }
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
    replacement_hazard: listOf(shock.replacement_hazard, nAge, `${field}.replacement_hazard`, shareOrNull),
    states_changed: count as number,
    changed_states: changed,
    ...(truncated ? { changed_states_truncated: true } : {}),
  };
}

/** Share of each age's grid states where the policy sells, every state weighted equally. */
export function equalWeightSellShare(policy: readonly number[], dims: Dims): number[] {
  const perAge = dims.nMpg * dims.nFuel * dims.nEcon;
  const sell = ACTIONS.indexOf("sell") + 1;
  return Array.from({ length: dims.nAge }, (_, ia) => {
    let count = 0;
    for (let s = ia * perAge; s < (ia + 1) * perAge; s++) if (policy[s] === sell) count++;
    return count / perAge;
  });
}

function parseCohorts(value: unknown, grids: Grids, dims: Dims, rows: StateRow[], policy: number[]): CohortsData {
  const cohorts = record(value);
  const ages = finiteArray(cohorts.ages, dims.nAge, "cohorts.ages");
  if (ages.some((age, i) => age !== grids.age[i])) fail("cohorts.ages disagrees with grids.age");

  const fleetShare = listOf(cohorts.fleet_share, dims.nAge, "cohorts.fleet_share", share);
  const total = fleetShare.reduce((sum, x) => sum + x, 0);
  if (Math.abs(total - 1) > SHARE_TOLERANCE * dims.nAge) fail("cohorts.fleet_share does not sum to 1");

  const gridShare = listOf(cohorts.grid_share_sell, dims.nAge, "cohorts.grid_share_sell", share);
  const expected = equalWeightSellShare(policy, dims);
  gridShare.forEach((x, i) => {
    if (Math.abs(x - expected[i]) > SHARE_TOLERANCE) fail(`cohorts.grid_share_sell[${i}] disagrees with the policy`);
  });

  const holding = cohorts.mean_holding_years;
  if (holding !== null && !(typeof holding === "number" && Number.isFinite(holding) && holding > 0)) {
    fail("cohorts.mean_holding_years is not a positive number or null");
  }
  if (!Array.isArray(cohorts.caveats) || cohorts.caveats.some((c) => typeof c !== "string")) {
    fail("cohorts.caveats is not a list of strings");
  }

  return {
    ages,
    fleet_share: fleetShare,
    replacement_hazard: listOf(cohorts.replacement_hazard, dims.nAge, "cohorts.replacement_hazard", shareOrNull),
    grid_share_sell: gridShare,
    annual_replacement_rate: share(cohorts.annual_replacement_rate, "cohorts.annual_replacement_rate"),
    mean_holding_years: holding as number | null,
    projection: parseProjection(cohorts.projection, "cohorts.projection"),
    ...(cohorts.price_shock !== undefined && cohorts.price_shock !== null
      ? { price_shock: parsePriceShock(cohorts.price_shock, dims.nAge, rows, policy) }
      : {}),
    caveats: (cohorts.caveats as string[]).slice(0, 20).map((c) => c.slice(0, 2000)),
  };
}

/** The numeric entries of the engine's `params` echo (flags and lists are left out). */
function parseParams(value: unknown): Record<string, number> {
  if (!isRecord(value)) fail("params is not an object");
  const entries = Object.entries(value)
    .filter(([key, entry]) => /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key) && typeof entry === "number" && Number.isFinite(entry))
    .slice(0, MAX_PARAMS);
  return Object.fromEntries(entries) as Record<string, number>;
}

/** Validate the engine output (`raw.data`) and map it to SolveData. */
export function adaptSolveData(value: unknown): SolveData {
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
  if (
    !Array.isArray(summary.actions) ||
    summary.actions.length !== ACTIONS.length ||
    summary.actions.some((action, i) => action !== ACTIONS[i]) ||
    summary.A !== ACTIONS.length
  ) {
    fail("summary.actions is not [drive, sell, reduce]");
  }

  if (!Array.isArray(data.policy) || data.policy.length !== S) fail(`policy does not have ${S} entries`);
  const policy = data.policy.map((action, i) =>
    Number.isInteger(action) && action >= 1 && action <= ACTIONS.length
      ? (action as number)
      : fail(`policy[${i}] is not a 1-based action index`),
  );
  if (data.actionlabels !== undefined && data.actionlabels !== null) {
    if (
      !Array.isArray(data.actionlabels) ||
      data.actionlabels.length !== ACTIONS.length ||
      data.actionlabels.some((label, i) => label !== ACTIONS[i])
    ) {
      fail("actionlabels is not [drive, sell, reduce]");
    }
  }
  if (data.policy_index_base !== undefined && data.policy_index_base !== null && data.policy_index_base !== 1) {
    fail("policy_index_base is not 1");
  }
  const breakdown = Object.fromEntries(
    ACTIONS.map((action, i) => [action, policy.filter((entry) => entry === i + 1).length]),
  ) as Record<ActionName, number>;
  if (summary.decision_breakdown !== undefined) {
    const reported = record(summary.decision_breakdown);
    if (ACTIONS.some((action) => reported[action] !== breakdown[action])) {
      fail("summary.decision_breakdown disagrees with the policy");
    }
  }

  const iterations = summary.iterations;
  if (!Number.isInteger(iterations) || (iterations as number) < 0) fail("summary.iterations is not an integer");
  const solveSummary: SolveSummary = {
    S,
    A: ACTIONS.length,
    beta: finite(summary.beta, "summary.beta"),
    actions: [...ACTIONS],
    iterations: iterations as number,
    calculation_time_s: finite(summary.calculation_time_s, "summary.calculation_time_s"),
    build_p_ms: finite(summary.build_p_ms, "summary.build_p_ms"),
    build_r_ms: finite(summary.build_r_ms, "summary.build_r_ms"),
    solve_ms: finite(summary.solve_ms, "summary.solve_ms"),
    decision_breakdown: breakdown,
  };

  const stateTable = buildStateTable(grids, dims);
  if (data.state_table !== undefined && data.state_table !== null) checkStateTable(data.state_table, stateTable);

  let stateLabels: string[];
  if (data.state_labels === undefined || data.state_labels === null) {
    stateLabels = buildStateLabels(stateTable);
  } else if (
    Array.isArray(data.state_labels) &&
    data.state_labels.length === S &&
    data.state_labels.every((label) => typeof label === "string")
  ) {
    stateLabels = data.state_labels as string[];
  } else {
    fail(`state_labels is not a list of ${S} strings`);
  }

  return {
    summary: solveSummary,
    grids,
    dims,
    state_table: stateTable,
    state_labels: stateLabels,
    policy,
    value: finiteArray(data.value, S, "value"),
    ...(data.query_state !== undefined && data.query_state !== null
      ? { query_state: parseQueryState(data.query_state, stateTable, policy) }
      : {}),
    ...(data.params !== undefined && data.params !== null ? { params: parseParams(data.params) } : {}),
    ...(data.cohorts !== undefined && data.cohorts !== null
      ? { cohorts: parseCohorts(data.cohorts, grids, dims, stateTable, policy) }
      : {}),
  };
}

/**
 * Check a run against the request it answers: the engine's `params` echo (when
 * present) must hold the inputs that were sent, and a price-shock comparison
 * must be for the change that was asked for.
 */
export function checkAgainstRequest(data: SolveData, request: SolveParameters): void {
  if (data.params) {
    for (const key of ECHOED_INPUTS) {
      const sent = request[key];
      if (sent !== undefined && key in data.params && data.params[key] !== sent) {
        fail(`params.${key} disagrees with the request`);
      }
    }
  }
  const shock = data.cohorts?.price_shock;
  if (shock && shock.delta_price !== request.price_shock) fail("cohorts.price_shock is for a different price change");
  if (shock && request.PriceNewCar !== undefined && shock.price_new_car !== request.PriceNewCar + shock.delta_price) {
    fail("cohorts.price_shock.price_new_car is not the requested price plus the change");
  }
  if (data.cohorts && !shock && request.price_shock) fail("cohorts.price_shock is missing for the price change asked for");
}

/**
 * Parse a `run_decision_model` tool result. With `request`, also check the run
 * against it (checkAgainstRequest). Throws SolveToolError or SolveProtocolError.
 */
export function adaptToolResult(result: unknown, request?: SolveParameters): AdaptedSolve {
  const tool = record(result);
  if (tool.isError === true) throw new SolveToolError(textOf(tool) ?? "The tool reported an error without detail.");

  let value: unknown = tool.structuredContent;
  if (!isRecord(value) || !isRecord(value.raw)) {
    const text = textOf(tool);
    if (text === undefined) fail("The tool result has no run envelope in structuredContent or text content");
    try {
      value = JSON.parse(text);
    } catch {
      fail("The tool result text is not JSON");
    }
  }

  const envelope = record(value);
  if (typeof envelope.attribution !== "string" || !envelope.attribution.trim()) {
    fail("The tool result has no attribution");
  }
  const warnings = Array.isArray(envelope.warnings)
    ? envelope.warnings
        .map((item) => (typeof item === "string" ? item : record(item).message))
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .slice(0, 20)
        .map((item) => item.slice(0, 2000))
    : [];

  const raw = record(envelope.raw);
  if (raw.status !== "success") fail("raw.status is not success");
  const data = adaptSolveData(raw.data);
  if (request) checkAgainstRequest(data, request);
  return {
    data,
    attribution: envelope.attribution.trim().slice(0, 2000),
    warnings,
  };
}
