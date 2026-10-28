import type {
  ActionName,
  QueryStateResult,
  SolveData,
  SolveSummary,
  StateRow,
} from "./types.ts";

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
 */

/** Engine action order; the engine's policy array is 1-based into this list. */
export const ACTIONS: readonly ActionName[] = ["drive", "sell", "reduce"];

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
  };
}

/** Parse a `run_decision_model` tool result. Throws SolveToolError or SolveProtocolError. */
export function adaptToolResult(result: unknown): AdaptedSolve {
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
  return {
    data: adaptSolveData(raw.data),
    attribution: envelope.attribution.trim().slice(0, 2000),
    warnings,
  };
}
