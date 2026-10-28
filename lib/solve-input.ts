/**
 * Whitelist and range checks for the body the wizard posts to
 * /api/vehicle-retention.
 *
 * Only the five cost assumptions the wizard collects and the optional
 * query_state lookup are accepted. Anything else (grid sizes, transition
 * probabilities, return_full_arrays, ...) is rejected rather than forwarded:
 * every run is billed to this server's RR Toolbox key, and grid sizes grow
 * the engine's dense A×S×S transition matrices quadratically.
 */

export interface QueryState {
  age: number;
  fuel_economy: number;
  fuel_price: number;
  econ_condition: number;
}

/** ADOS 2026 v1c parameters this demo lets a visitor change. */
export interface SolveParameters {
  StdMiles?: number;
  ReducedMiles?: number;
  PriceNewCar?: number;
  FixedCost?: number;
  /** Annual discount rate as a fraction (0.05 = 5%). */
  d?: number;
  query_state?: QueryState;
}

interface Limit {
  label: string;
  min: number;
  max: number;
  format: (value: number) => string;
}

const number = (value: number) => value.toLocaleString("en-US");
const miles = (value: number) => `${number(value)} miles`;
const dollars = (value: number) => `$${number(value)}`;
const percent = (value: number) => `${Math.round(value * 100)}%`;

export const PARAMETER_LIMITS = {
  StdMiles: { label: "Annual miles if you drive normally", min: 5_000, max: 30_000, format: miles },
  ReducedMiles: { label: "Annual miles if you cut back", min: 2_000, max: 15_000, format: miles },
  PriceNewCar: { label: "Replacement vehicle price", min: 20_000, max: 80_000, format: dollars },
  FixedCost: { label: "Annual insurance + property tax", min: 1_000, max: 6_000, format: dollars },
  // Floor above 0: with the engine's growth rate g = 0, beta = (1 + g) / (1 + d) is 1 at d = 0,
  // and policy iteration then runs to its iteration cap (over a minute) and returns no usable result.
  d: { label: "Annual discount rate", min: 0.01, max: 0.15, format: percent },
} satisfies Record<Exclude<keyof SolveParameters, "query_state">, Limit>;

export const QUERY_STATE_LIMITS = {
  age: { label: "Vehicle age", min: 0, max: 10, format: (v: number) => `${v} years` },
  fuel_economy: { label: "Fuel economy", min: 26, max: 32, format: (v: number) => `${v} mpg` },
  fuel_price: { label: "Fuel price", min: 4, max: 6, format: (v: number) => `$${v.toFixed(2)} per gallon` },
  econ_condition: { label: "Economic conditions index", min: 90, max: 120, format: String },
} satisfies Record<keyof QueryState, Limit>;

/** A request the route rejects before calling the RR Toolbox. The message is safe to show. */
export class SolveInputError extends Error {
  name = "SolveInputError";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Key names are echoed back to help a caller fix the request; keep them short and printable. */
function displayKey(key: string): string {
  const printable = key.replace(/[^\x20-\x7e]/g, "?");
  return printable.length > 40 ? `${printable.slice(0, 40)}…` : printable;
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: readonly string[], scope: string) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new SolveInputError(`"${displayKey(key)}" is not ${scope} this demo accepts.`);
    }
  }
}

function checkedNumber(value: unknown, limit: Limit): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SolveInputError(`${limit.label} must be a number.`);
  }
  if (value < limit.min || value > limit.max) {
    throw new SolveInputError(
      `${limit.label} must be between ${limit.format(limit.min)} and ${limit.format(limit.max)}.`,
    );
  }
  return value;
}

/**
 * Validate a parsed JSON body and return a fresh parameter object holding only
 * whitelisted keys. Throws SolveInputError with a plain-language message.
 */
export function parseSolveRequest(body: unknown): SolveParameters {
  if (!isPlainObject(body)) throw new SolveInputError("The request body must be a JSON object.");
  const parameterKeys = Object.keys(PARAMETER_LIMITS) as (keyof typeof PARAMETER_LIMITS)[];
  rejectUnknownKeys(body, [...parameterKeys, "query_state"], "an input");

  const parameters: SolveParameters = {};
  for (const key of parameterKeys) {
    if (body[key] !== undefined) parameters[key] = checkedNumber(body[key], PARAMETER_LIMITS[key]);
  }

  if (body.query_state !== undefined) {
    const query = body.query_state;
    if (!isPlainObject(query)) {
      throw new SolveInputError("The vehicle state must include age, fuel economy, fuel price and economic index.");
    }
    const stateKeys = Object.keys(QUERY_STATE_LIMITS) as (keyof QueryState)[];
    rejectUnknownKeys(query, stateKeys, "a vehicle-state field");
    const state = {} as QueryState;
    for (const key of stateKeys) {
      if (query[key] === undefined) throw new SolveInputError(`${QUERY_STATE_LIMITS[key].label} is required.`);
      state[key] = checkedNumber(query[key], QUERY_STATE_LIMITS[key]);
    }
    parameters.query_state = state;
  }
  return parameters;
}
