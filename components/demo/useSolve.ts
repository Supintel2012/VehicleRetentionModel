"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SOLVE_FALLBACK_MESSAGE, SolveRequestError, solveVehicleRetention } from "@/lib/client";
import { createLatestRunner, type LatestRunner } from "@/lib/latest";
import { requestKey, type RunState } from "@/lib/solve-plan";
import type { SolveResponse } from "@/lib/types";

/** Wait after the last change before solving; a burst of slider or keyboard steps costs one request. */
export const SOLVE_DEBOUNCE_MS = 350;

type Body = Record<string, unknown>;

export interface SolvedRun {
  response: SolveResponse;
  /** The request this response answers. */
  body: Body;
}

export interface SolveState extends RunState<SolvedRun> {
  /** Plain-language message when the latest request failed (run is then null). */
  error: string | null;
  /** A request for newer inputs is waiting or in flight. */
  busy: boolean;
  retry: () => void;
}

/**
 * Solve `body` whenever it changes (debounced, latest wins). The first solve
 * starts at once, and a request answered before is answered again from memory.
 * `null` stops solving; the last answer is kept but callers show it only for
 * the request it answers.
 */
export function useLatestSolve(body: Body | null): SolveState {
  const key = body === null ? null : requestKey(body);
  const [state, setState] = useState<Omit<SolveState, "retry">>({ run: null, lastGood: null, error: null, busy: body !== null });
  const runner = useRef<LatestRunner<Body> | null>(null);
  const started = useRef(false);

  useEffect(() => {
    const current = createLatestRunner<Body, SolveResponse>({
      delayMs: SOLVE_DEBOUNCE_MS,
      run: (request, signal) => solveVehicleRetention(request, { signal }),
      cacheKey: requestKey,
      onPending: () => setState((s) => (s.busy ? s : { ...s, busy: true })),
      onResult: (response, request) => {
        const run = { response, body: request };
        setState({ run, lastGood: run, error: null, busy: false });
      },
      // A failed solve clears the shown result: figures for older inputs are not left on screen as if current.
      onError: (error) =>
        setState((s) => ({
          run: null,
          lastGood: s.lastGood,
          busy: false,
          error: error instanceof SolveRequestError ? error.message : SOLVE_FALLBACK_MESSAGE,
        })),
    });
    runner.current = current;
    started.current = false;
    return () => current.cancel();
  }, []);

  useEffect(() => {
    if (key === null) {
      runner.current?.cancel();
      setState((s) => ({ ...s, error: null, busy: false }));
      return;
    }
    runner.current?.schedule(JSON.parse(key) as Body, { immediate: !started.current });
    started.current = true;
  }, [key]);

  const retry = useCallback(() => {
    if (key !== null) runner.current?.schedule(JSON.parse(key) as Body, { immediate: true });
  }, [key]);

  return { ...state, retry };
}
