/**
 * Types for the Auto Drive-or-Sell™ (ADOS 2026 v1c) analyst demo: the
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
  /** Request-body key the value maps to ("query_state.<key>" and "d.scaled_pct" are mapped specially). */
  paramKey?: string;
  /** Grid levels for a select field. */
  options?: FieldOption[];
  /** Range the field accepts (for a select, its first and last level). */
  min?: number;
  max?: number;
  /** Input step (for a select, the spacing between levels). */
  step?: number;
  unit?: string;
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
