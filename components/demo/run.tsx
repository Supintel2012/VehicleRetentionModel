"use client";

import type { ReactNode } from "react";
import clsx from "clsx";
import { resultsView } from "@/lib/solve-plan";
import type { SolveData } from "@/lib/types";
import type { SolveState } from "./useSolve";
import { ErrorNotice, LoadingNotice } from "./ui";

/** One solved run as the tabs read it. */
export interface RunView {
  data: SolveData;
  attribution: string;
  warnings: string[];
  /** The request it answers. */
  body: Record<string, unknown>;
}

/** Shown while a solve runs after a failed one (Try again, or a change of inputs). */
export const RETRYING = "Solving the model again…";

export function viewOf(state: SolveState): RunView | null {
  if (!state.run) return null;
  const { response, body } = state.run;
  return { data: response.data, attribution: response.attribution, warnings: response.warnings, body };
}

/**
 * Results area of a tab: a loading notice before the first answer, the error
 * when the latest solve failed (replaced by a progress notice as soon as a new
 * attempt starts), otherwise the results, dimmed and marked busy while newer
 * inputs are being solved.
 */
export function WithRun({
  state,
  onReset,
  loading,
  children,
}: {
  state: SolveState;
  onReset?: () => void;
  loading?: ReactNode;
  children: (view: RunView) => ReactNode;
}) {
  const view = viewOf(state);
  const shown = resultsView(state);
  if (shown === "retrying") return <LoadingNotice>{RETRYING}</LoadingNotice>;
  if (shown === "error" && state.error) return <ErrorNotice message={state.error} onRetry={state.retry} onReset={onReset} />;
  if (!view) return <LoadingNotice>{loading}</LoadingNotice>;
  return (
    <div aria-busy={state.busy} className={clsx("transition-opacity", state.busy && "opacity-60")}>
      {children(view)}
    </div>
  );
}
