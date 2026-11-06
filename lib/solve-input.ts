/**
 * Whitelist and range checks for the body the page posts to
 * /api/vehicle-retention.
 *
 * Only the five cost assumptions the page collects, the optional query_state
 * lookup and the three fleet-output switches (cohorts, price_shock,
 * projection_years) are accepted. Anything else (grid sizes, transition
 * probabilities, return_full_arrays, fleet_age_distribution, ...) is rejected
 * rather than forwarded: every run is billed to this server's RR Toolbox key,
 * and grid sizes grow the engine's dense A×S×S transition matrices
 * quadratically. An engine without the fleet output ignores the three
 * switches, so they are safe to send to it.
 *
 * Reduced miles must be below standard miles: the page describes the third
 * action as keeping the vehicle and driving fewer miles, which is only true
 * then.
 *
 * A market request (market_shares) is the other shape: the mix of buyer
 * cohorts, the fleet switches and nothing else. The engine supplies each
 * cohort's inputs and refuses PriceNewCar, StdMiles and d beside
 * market_shares; this demo also leaves FixedCost and ReducedMiles at the
 * engine's defaults there, so the cohort table on the page is the calibration
 * as published.
 */

import type { VehicleClassTag } from "./types.ts";

export interface QueryState {
  age: number;
  fuel_economy: number;
  fuel_price: number;
  econ_condition: number;
}

/** ADOS 2026 parameters this demo lets a visitor change. */
export interface SolveParameters {
  StdMiles?: number;
  ReducedMiles?: number;
  PriceNewCar?: number;
  FixedCost?: number;
  /** Annual discount rate as a fraction (0.05 = 5%). */
  d?: number;
  query_state?: QueryState;
  /** Ask for the fleet figures (data.cohorts) computed from the solved policy. */
  cohorts?: boolean;
  /** Whole dollars added to PriceNewCar for the comparison solve inside data.cohorts. */
  price_shock?: number;
  /** Whole years in the cohort projection. */
  projection_years?: number;
}

/** A market run: every named cohort at its calibrated inputs, weighted by shares of vehicles on the road. */
export interface MarketSolveParameters {
  market_shares: Partial<Record<VehicleClassTag, number>>;
  cohorts?: boolean;
  price_shock?: number;
  projection_years?: number;
}

export type AnySolveParameters = SolveParameters | MarketSolveParameters;

export function isMarketParameters(parameters: AnySolveParameters): parameters is MarketSolveParameters {
  return "market_shares" in parameters;
}

export const VEHICLE_CLASS_TAGS: readonly VehicleClassTag[] = ["ECO", "ENT", "MID", "PKP", "LUX", "LSUV", "EXO"];
/** The engine's own tolerance on the sum of the shares. */
const SHARE_SUM_TOLERANCE = 1e-6;

type CostParameter = "StdMiles" | "ReducedMiles" | "PriceNewCar" | "FixedCost" | "d";

interface Limit {
  label: string;
  min: number;
  max: number;
  format: (value: number) => string;
  /** Accept whole numbers only, with this unit in the message ("a whole number of <unit>"). */
  wholeUnit?: string;
}

const number = (value: number) => value.toLocaleString("en-US");
const miles = (value: number) => `${number(value)} miles`;
const dollars = (value: number) => `$${number(value)}`;
const percent = (value: number) => `${Math.round(value * 100)}%`;
const signedDollars = (value: number) => `${value < 0 ? "-" : ""}$${number(Math.abs(value))}`;
const years = (value: number) => `${value} ${value === 1 ? "year" : "years"}`;

export const PARAMETER_LIMITS = {
  StdMiles: { label: "Annual miles if you drive normally", min: 5_000, max: 30_000, format: miles },
  ReducedMiles: { label: "Annual miles if you cut back", min: 2_000, max: 15_000, format: miles },
  PriceNewCar: { label: "Replacement vehicle price", min: 20_000, max: 80_000, format: dollars },
  FixedCost: { label: "Annual insurance + property tax", min: 1_000, max: 6_000, format: dollars },
  // Floor above 0: with the engine's growth rate g = 0, beta = (1 + g) / (1 + d) is 1 at d = 0,
  // and policy iteration then runs to its iteration cap (over a minute) and returns no usable result.
  d: { label: "Annual discount rate", min: 0.01, max: 0.15, format: percent },
} satisfies Record<CostParameter, Limit>;

/**
 * Fleet-output switches. The page moves the price in $250 steps; whole dollars
 * are required because a shock too small to change PriceNewCar in floating
 * point makes the engine refuse the run. The projection is capped at 20 years
 * (the engine allows 50): the page shows 10.
 */
/**
 * ADOS 2026 defaults for the two mileages (v2d sheet), used to compare them when a
 * request leaves one out (the engine then uses its default).
 */
export const ENGINE_DEFAULT_MILES = { StdMiles: 15_000, ReducedMiles: 12_000 } as const;

export const COHORT_LIMITS = {
  price_shock: { label: "New-vehicle price change", min: -3_000, max: 3_000, format: signedDollars, wholeUnit: "dollars" },
  projection_years: { label: "Projection length", min: 1, max: 20, format: years, wholeUnit: "years" },
} satisfies Record<"price_shock" | "projection_years", Limit>;

export const QUERY_STATE_LIMITS = {
  age: { label: "Vehicle age", min: 0, max: 10, format: (v: number) => `${v} years` },
  fuel_economy: { label: "Fuel economy", min: 26, max: 32, format: (v: number) => `${v} mpg` },
  fuel_price: { label: "Fuel price", min: 4, max: 7, format: (v: number) => `$${v.toFixed(2)} per gallon` },
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
  if (limit.wholeUnit && !Number.isInteger(value)) {
    throw new SolveInputError(`${limit.label} must be a whole number of ${limit.wholeUnit}.`);
  }
  return value;
}

function parseFleetSwitches(body: Record<string, unknown>, parameters: SolveParameters | MarketSolveParameters) {
  if (body.cohorts !== undefined) {
    if (typeof body.cohorts !== "boolean") throw new SolveInputError("The cohort setting must be true or false.");
    parameters.cohorts = body.cohorts;
  }
  for (const key of Object.keys(COHORT_LIMITS) as (keyof typeof COHORT_LIMITS)[]) {
    if (body[key] !== undefined) parameters[key] = checkedNumber(body[key], COHORT_LIMITS[key]);
  }
}

/** A market request: the mix of cohorts and the fleet switches, nothing else. */
export function parseMarketRequest(body: unknown): MarketSolveParameters {
  if (!isPlainObject(body)) throw new SolveInputError("The request body must be a JSON object.");
  rejectUnknownKeys(body, ["market_shares", "cohorts", ...Object.keys(COHORT_LIMITS)], "an input of a market run");
  const mix = body.market_shares;
  if (!isPlainObject(mix)) throw new SolveInputError("The market mix must give each buyer cohort its share of vehicles.");
  rejectUnknownKeys(mix, VEHICLE_CLASS_TAGS, "a buyer cohort");
  const shares: Partial<Record<VehicleClassTag, number>> = {};
  let total = 0;
  for (const tag of VEHICLE_CLASS_TAGS) {
    const share = mix[tag];
    if (share === undefined) continue;
    if (typeof share !== "number" || !Number.isFinite(share) || share < 0 || share > 1) {
      throw new SolveInputError(`The ${tag} share must be a number from 0 to 1.`);
    }
    shares[tag] = share;
    total += share;
  }
  if (Object.keys(shares).length === 0) throw new SolveInputError("The market mix must name at least one buyer cohort.");
  if (Math.abs(total - 1) > SHARE_SUM_TOLERANCE) throw new SolveInputError("The cohort shares must add up to 1.");
  const parameters: MarketSolveParameters = { market_shares: shares };
  parseFleetSwitches(body, parameters);
  return parameters;
}

/** The route's entry point: a body with market_shares is a market run, anything else a single cohort's. */
export function parseRequest(body: unknown): AnySolveParameters {
  if (isPlainObject(body) && body.market_shares !== undefined) return parseMarketRequest(body);
  return parseSolveRequest(body);
}

/**
 * Validate a parsed JSON body for one cohort's run and return a fresh
 * parameter object holding only whitelisted keys. Throws SolveInputError with
 * a plain-language message.
 */
export function parseSolveRequest(body: unknown): SolveParameters {
  if (!isPlainObject(body)) throw new SolveInputError("The request body must be a JSON object.");
  const parameterKeys = Object.keys(PARAMETER_LIMITS) as CostParameter[];
  const cohortKeys = Object.keys(COHORT_LIMITS) as (keyof typeof COHORT_LIMITS)[];
  rejectUnknownKeys(body, [...parameterKeys, "query_state", "cohorts", ...cohortKeys], "an input");

  const parameters: SolveParameters = {};
  for (const key of parameterKeys) {
    if (body[key] !== undefined) parameters[key] = checkedNumber(body[key], PARAMETER_LIMITS[key]);
  }
  const std = parameters.StdMiles ?? ENGINE_DEFAULT_MILES.StdMiles;
  const reduced = parameters.ReducedMiles ?? ENGINE_DEFAULT_MILES.ReducedMiles;
  if (reduced >= std) {
    throw new SolveInputError(
      `${PARAMETER_LIMITS.ReducedMiles.label} (${miles(reduced)}) must be less than ${PARAMETER_LIMITS.StdMiles.label.toLowerCase()} (${miles(std)}).`,
    );
  }
  parseFleetSwitches(body, parameters);

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
