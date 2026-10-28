import { shockedPriceBody } from "./scenario.ts";
import { buildRunBody, type Answers } from "./template.ts";

/**
 * Which solves the page asks for, and which answer each tab shows.
 *
 * One request serves every tab: the panel's values with `cohorts: true` and,
 * for a non-zero price change, `price_shock`. Only
 * `data.cohorts.price_shock` depends on the price change; the policy, the
 * fleet shares and the baseline replacement rate do not. So:
 *
 * - An engine without the cohort output ignores `price_shock`. Once such an
 *   engine has answered, a request that differs from the answered one only in
 *   the price change is already answered: the page keeps that request, and a
 *   price change costs one solve (the plain solve at the new price) instead of
 *   two. At a $0 change the scenario tab shows no comparison, so the answered
 *   request serves every tab whatever the engine.
 * - The tabs other than the scenario keep the last answered run while the
 *   current request differs from it only in the price change, also when that
 *   request is still being solved or has failed: their figures are the same,
 *   so a failure while the price is being moved stays on the scenario tab.
 */

export type Body = Record<string, unknown>;

/** Request keys that only shape `data.cohorts.price_shock`. */
const SCENARIO_ONLY_KEYS: readonly string[] = ["price_shock"];

/** JSON with object keys in sorted order, so equal requests give equal keys. */
export function requestKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(requestKey).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${requestKey(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function baselineOnly(body: Body): Body {
  return Object.fromEntries(Object.entries(body).filter(([key]) => !SCENARIO_ONLY_KEYS.includes(key)));
}

/** True when two requests ask for the same baseline solve (they may differ in the price change). */
export function sameBaseline(a: Body, b: Body): boolean {
  return requestKey(baselineOnly(a)) === requestKey(baselineOnly(b));
}

/** The last answered run, as the plan needs it. */
export interface Answered {
  body: Body;
  /** The answer carried `data.cohorts`. */
  hasCohorts: boolean;
}

/** The page's main request for these values and this price change. */
export function baselineRequest(answers: Answers, delta: number, answered: Answered | null): Body {
  const next = buildRunBody(answers, delta);
  if (answered && (!answered.hasCohorts || delta === 0) && sameBaseline(next, answered.body)) return answered.body;
  return next;
}

/**
 * The second, plain solve at the new price: only when the last answer had no
 * cohort output, the scenario tab is open and the price change is not zero.
 * Built from the current main request, so it runs beside a baseline re-solve
 * rather than after it.
 */
export function fallbackRequest(baseline: Body, delta: number, answered: Answered | null, scenarioOpen: boolean): Body | null {
  if (!scenarioOpen || delta === 0 || !answered || answered.hasCohorts) return null;
  const plan = shockedPriceBody(baseline, delta);
  return plan.ok ? plan.body : null;
}

/** The parts of a solve's state the tabs read. */
export interface RunState<R extends { body: Body }> {
  /** The answer shown: the latest one, or the previous one while newer inputs are solved; null after a failure. */
  run: R | null;
  /** The last answer received, kept through later failures. */
  lastGood: R | null;
  error: string | null;
  busy: boolean;
}

/**
 * What the tabs other than the scenario show: the last answer, current and
 * not pending, whenever the request differs from it only in the price change.
 */
export function baselineState<R extends { body: Body }, S extends RunState<R>>(state: S, body: Body): S {
  const last = state.lastGood;
  if (last && sameBaseline(last.body, body)) return { ...state, run: last, error: null, busy: false };
  return state;
}

export type SolveStatus = "solving" | "solved" | "error" | "idle";

type StatusInput = { busy: boolean; error: string | null; run: unknown };

/**
 * The status line for the solves behind the shown tab: a solve in progress is
 * reported even when an earlier one failed (a retry), then any failure, and
 * "solved" only when every solve has an answer.
 */
export function solveStatus(...states: StatusInput[]): SolveStatus {
  if (states.some((s) => s.busy)) return "solving";
  if (states.some((s) => s.error)) return "error";
  return states.length > 0 && states.every((s) => s.run) ? "solved" : "idle";
}

export type ResultsView = "loading" | "retrying" | "error" | "results";

/** What a results area shows: after a failure, a new attempt replaces the error with a progress notice. */
export function resultsView(state: { busy: boolean; error: string | null; run: unknown }): ResultsView {
  if (state.error) return state.busy ? "retrying" : "error";
  return state.run ? "results" : "loading";
}
