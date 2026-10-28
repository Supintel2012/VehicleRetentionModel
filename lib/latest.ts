/**
 * Debounced, latest-wins request runner for the page's solves.
 *
 * `schedule(input)` waits `delayMs` for the input to settle (a slider being
 * dragged, a number being typed), then runs it. A newer schedule aborts the
 * request in flight and drops its answer, so an older response can never be
 * shown over a newer one, and a burst of changes costs one request.
 *
 * With `cacheKey`, answered inputs are remembered (the last `cacheSize`): an
 * input asked for again, such as a tab the presenter comes back to or a price
 * change set back to an earlier value, is answered at once with no request.
 * Only answers are kept; a failed input is run again when it is asked for.
 */

export interface LatestRunnerOptions<I, O> {
  delayMs: number;
  run: (input: I, signal: AbortSignal) => Promise<O>;
  /** Called on every schedule, before the wait: the shown result is about to be replaced. */
  onPending?: (input: I) => void;
  onResult: (output: O, input: I) => void;
  /** Errors of the latest run only; a superseded run's errors are dropped. */
  onError: (error: unknown, input: I) => void;
  /** Identity of an input for the answer cache; leave out to run every input. */
  cacheKey?: (input: I) => string;
  /** Answers kept, most recently used first (default 16). */
  cacheSize?: number;
}

export interface LatestRunner<I> {
  /** Run `input` after the delay (or at once with `immediate`), superseding anything earlier. */
  schedule(input: I, options?: { immediate?: boolean }): void;
  /** Drop the pending and in-flight runs (on unmount). */
  cancel(): void;
}

export function createLatestRunner<I, O>(options: LatestRunnerOptions<I, O>): LatestRunner<I> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let latest = 0;
  const cache = new Map<string, O>();
  const cacheSize = options.cacheSize ?? 16;

  function remember(key: string, output: O) {
    cache.delete(key);
    cache.set(key, output);
    while (cache.size > cacheSize) cache.delete(cache.keys().next().value as string);
  }

  function supersede() {
    latest++;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    controller?.abort();
    controller = undefined;
  }

  function start(input: I, id: number, key: string | undefined) {
    timer = undefined;
    const current = new AbortController();
    controller = current;
    let pending: Promise<O>;
    try {
      pending = options.run(input, current.signal);
    } catch (error) {
      pending = Promise.reject(error);
    }
    pending.then(
      (output) => {
        if (id !== latest || current.signal.aborted) return;
        if (key !== undefined) remember(key, output);
        options.onResult(output, input);
      },
      (error: unknown) => {
        if (id === latest && !current.signal.aborted) options.onError(error, input);
      },
    );
  }

  return {
    schedule(input, { immediate = false } = {}) {
      supersede();
      const id = latest;
      const key = options.cacheKey?.(input);
      const known = key === undefined ? undefined : cache.get(key);
      if (key !== undefined && known !== undefined) {
        remember(key, known);
        options.onResult(known, input);
        return;
      }
      options.onPending?.(input);
      if (immediate) start(input, id, key);
      else timer = setTimeout(() => start(input, id, key), options.delayMs);
    },
    cancel: supersede,
  };
}
