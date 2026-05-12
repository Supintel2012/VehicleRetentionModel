/**
 * Wizard + API types for the Vehicle Retention Model app.
 *
 * Adapted from the RR Toolbox enterprise wizard, with the Approveit /
 * routing / handoff types stripped out — this app only solves the MDP and
 * shows the resulting policy + value function.
 */

export type QuestionType =
  | "select"
  | "number"
  | "currency"
  | "scale"
  | "boolean";

export type Reveal =
  | { questionId: string; equals: string | number | boolean }
  | { questionId: string; in: (string | number)[] }
  | { questionId: string; gt: number }
  | { questionId: string; lt: number };

export interface QuestionOption {
  value: string;
  label: string;
  description?: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  prompt: string;
  help?: string;
  /** Maps the answer value into a parameter on the API request body. */
  paramKey?: string;
  options?: QuestionOption[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  default?: string | number | boolean;
  revealsIf?: Reveal;
  required?: boolean;
}

export interface WizardStep {
  id: string;
  title: string;
  intro?: string;
  questions: Question[];
}

export interface Template {
  slug: string;
  name: string;
  category: string;
  summary: string;
  horizon: string;
  steps: WizardStep[];
  /** Sample answers used by the "Run sample answers" button. */
  sample_answers: Record<string, string | number | boolean>;
  /** Default state count once the grid is built — for the live state panel. */
  default_state_count: number;
}

// ── API response shape (mirrors RRToolbox.templates.VehicleRetentionModel) ──

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
}

export interface SolveResponse {
  status: "success";
  data: SolveData;
}
