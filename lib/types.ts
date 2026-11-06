/**
 * Types for the Auto Drive-or-Sell™ (ADOS 2026) analyst demo: the
 * assumption fields the page offers, and the solve response the route
 * returns (mirroring RRToolbox.templates.AutoDriveOrSell).
 */

// ── Assumption fields ───────────────────────────────────────────────────────

export type FieldType = "number" | "select";

export interface FieldOption {
  value: number;
  label: string;
}

export interface Field {
  id: string;
  type: FieldType;
  prompt: string;
  help?: string;
  /** Request-body key the value maps to ("query_state.<key>" is a lookup field; a "<key>.scaled_pct" value is sent divided by 100). */
  paramKey?: string;
  /** Grid levels for a select field. */
  options?: FieldOption[];
  /** Range the field accepts (for a select, its first and last level). */
  min?: number;
  max?: number;
  /** Input step (for a select, the spacing between levels). */
  step?: number;
  unit?: string;
  /** Text after the input (defaults to the unit; "% a year" for a rate). */
  unitLabel?: string;
  default?: number;
}

export interface FieldGroup {
  id: string;
  title: string;
  intro?: string;
  questions: Field[];
}

export interface Template {
  name: string;
  /** Field groups, in panel order. */
  steps: FieldGroup[];
  /** Worked example used by the route tests (see template.ts). */
  sample_answers: Record<string, string | number | boolean>;
}

// ── API response shape (mirrors RRToolbox.templates.AutoDriveOrSell) ────────

export type ActionName = "drive" | "sell" | "reduce";

export interface StateRow {
  state_id: number;
  age: number;
  fuel_economy: number;
  fuel_price: number;
  econ_condition: number;
  age_idx: number;
  mpg_idx: number;
  fuel_idx: number;
  econ_idx: number;
}

export interface SolveSummary {
  S: number;
  A: number;
  beta: number;
  actions: ActionName[];
  iterations: number;
  calculation_time_s: number;
  build_p_ms: number;
  build_r_ms: number;
  solve_ms: number;
  decision_breakdown: Record<ActionName, number>;
}

export interface QueryStateResult {
  state_id: number;
  label: string;
  matched: {
    age: number;
    fuel_economy: number;
    fuel_price: number;
    econ_condition: number;
  };
  recommended_action: ActionName;
  recommended_action_index: number;
  value: number;
}

/** Purchases per vehicle in each projected year, from the model's own Markov chain. */
export interface CohortProjection {
  /** "steady_state", or "supplied" when a starting fleet was given. */
  start: string;
  years: number[];
  replacement_rate: number[];
  cumulative: number;
}

/** A state whose optimal action differs between the baseline and the price-shock solve. */
export interface ChangedState {
  state_id: number;
  age: number;
  fuel_economy: number;
  fuel_price: number;
  econ_condition: number;
  from: ActionName;
  to: ActionName;
}

/** The same fleet figures after re-solving at PriceNewCar + delta_price. */
export interface PriceShockResult {
  delta_price: number;
  price_new_car: number;
  annual_replacement_rate: number;
  /** Percent change in the steady-state replacement rate. */
  change_pct: number | null;
  implied_elasticity: number | null;
  first_year_rate: number;
  first_year_elasticity: number | null;
  projection: CohortProjection;
  baseline_cumulative: number;
  cumulative_elasticity: number | null;
  replacement_hazard: (number | null)[];
  /** Number of states whose best action switches (all of them, even when the list is cut short). */
  states_changed: number;
  changed_states: ChangedState[];
  /** Set when the service listed only the first of the switching states. */
  changed_states_truncated?: true;
}

/** Opt-in fleet output (`cohorts: true`) of the RR Toolbox engine. Older engines omit it. */
export interface CohortsData {
  ages: number[];
  /** Steady-state share of the fleet at each age (sums to 1). */
  fleet_share: number[];
  /** Share of the vehicles at each age that are replaced; null where no vehicles reach that age. */
  replacement_hazard: (number | null)[];
  /** Share of the grid states at each age where selling is optimal, every state weighted equally. */
  grid_share_sell: number[];
  annual_replacement_rate: number;
  mean_holding_years: number | null;
  projection: CohortProjection;
  price_shock?: PriceShockResult;
  caveats: string[];
}

export interface SolveData {
  /** Absent on a single-cohort run; "market" on a market run (MarketSolveData). */
  kind?: undefined;
  summary: SolveSummary;
  grids: { age: number[]; mpg: number[]; fuel: number[]; econ: number[] };
  dims: { nAge: number; nMpg: number; nFuel: number; nEcon: number };
  state_table: StateRow[];
  state_labels: string[];
  /** 1-indexed action numbers per state (1=drive, 2=sell, 3=reduce). */
  policy: number[];
  value: number[];
  query_state?: QueryStateResult;
  /** The numeric inputs the engine reports it used (engines that echo `params` only). */
  params?: Record<string, number>;
  cohorts?: CohortsData;
}

export interface SolveResponse {
  status: "success";
  data: SolveData;
  /** Provenance line from the RR Toolbox; display it verbatim with results. */
  attribution: string;
  /** Service warnings about this run (may be empty). */
  warnings: string[];
}

/** Stable reason codes for a failed solve; each maps to one fixed user message. */
export type SolveFailureReason =
  | "not_configured"
  | "unauthorized"
  | "rate_limited"
  | "timeout"
  | "unreachable"
  | "tool_error"
  | "invalid_input"
  | "protocol_error";

export interface SolveErrorResponse {
  status: "error";
  reason: SolveFailureReason;
  /** Plain-language message, safe to show as is. Never carries upstream detail. */
  message: string;
}

// ── Market runs (market_shares with cohorts: one call for every buyer cohort) ─

export type VehicleClassTag = "ECO" | "ENT" | "MID" | "PKP" | "LUX" | "LSUV" | "EXO";

/** A cohort's price-shock comparison, as the engine returns it per class (no policy to check it against). */
export interface ClassShockResult {
  delta_price: number;
  price_new_car: number;
  annual_replacement_rate: number;
  change_pct: number | null;
  implied_elasticity: number | null;
  first_year_rate: number;
  first_year_elasticity: number | null;
  projection: CohortProjection;
  baseline_cumulative: number;
  cumulative_elasticity: number | null;
  /** The cohort's fleet by age at the shocked price. */
  fleet_share: number[];
  replacement_hazard: (number | null)[];
  states_changed: number;
  /** The first switching states; the service lists at most ten per cohort. */
  changed_states: ChangedState[];
  changed_states_truncated?: true;
}

/** One cohort's fleet output inside a market run (its own fleet_cohorts block). */
export interface ClassFleet {
  ages: number[];
  fleet_share: number[];
  replacement_hazard: (number | null)[];
  grid_share_sell: number[];
  /** Sell share by age with the conditions weighted by their long-run distribution under driving; null when undefined. */
  stationary_share_sell: number[] | null;
  annual_replacement_rate: number;
  mean_holding_years: number | null;
  projection: CohortProjection;
  price_shock?: ClassShockResult;
  caveats: string[];
}

export interface MarketClass {
  tag: VehicleClassTag;
  /** Share of vehicles on the road, as sent. */
  share: number;
  decision_breakdown: Record<ActionName, number>;
  iterations: number;
  /** The cohort row the engine solved (PriceNewCar, EnjoyBase, StdMiles, d among them). */
  params: Record<string, number>;
  fleet: ClassFleet;
}

export interface MarketShockClassRow {
  share: number;
  price_new_car: number;
  annual_replacement_rate: number;
  change_pct: number | null;
  implied_elasticity: number | null;
  states_changed: number;
}

/** The market-weighted price-shock comparison (aggregate.cohorts.price_shock). */
export interface MarketShock {
  delta_price: number;
  /** Share-weighted percent change in the new-vehicle price; the market elasticities divide by it. */
  price_change_pct: number;
  annual_replacement_rate: number;
  change_pct: number | null;
  implied_elasticity: number | null;
  first_year_rate: number;
  first_year_elasticity: number | null;
  projection: CohortProjection;
  baseline_cumulative: number;
  cumulative_elasticity: number | null;
  fleet_share: number[];
  replacement_hazard: (number | null)[];
  /** Switching states summed over the cohorts. */
  states_changed: number;
  by_class: Record<VehicleClassTag, MarketShockClassRow>;
}

/** The market-weighted fleet figures (aggregate.cohorts). */
export interface MarketFleet {
  ages: number[];
  method: string;
  fleet_share: number[];
  replacement_hazard: (number | null)[];
  grid_share_sell: number[];
  stationary_share_sell: number[] | null;
  annual_replacement_rate: number;
  mean_holding_years: number | null;
  by_class: Record<VehicleClassTag, { share: number; annual_replacement_rate: number; mean_holding_years: number | null }>;
  projection: CohortProjection;
  price_shock?: MarketShock;
  caveats: string[];
}

export interface MarketSolveData {
  kind: "market";
  grids: SolveData["grids"];
  dims: SolveData["dims"];
  /** The cohorts solved, in the engine's class order. */
  classes: MarketClass[];
  market: MarketFleet;
}

export interface MarketSolveResponse {
  status: "success";
  data: MarketSolveData;
  attribution: string;
  warnings: string[];
}
