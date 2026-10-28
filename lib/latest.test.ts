import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { createLatestRunner } from "./latest.ts";

beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
afterEach(() => mock.timers.reset());

/** A run whose promises the test settles by hand. */
function controllable() {
  const calls: { input: string; signal: AbortSignal; resolve: (v: string) => void; reject: (e: unknown) => void }[] = [];
  const results: [string, string][] = [];
  const errors: [unknown, string][] = [];
  const pending: string[] = [];
  const runner = createLatestRunner<string, string>({
    delayMs: 350,
    run: (input, signal) =>
      new Promise((resolve, reject) => {
        calls.push({ input, signal, resolve, reject });
      }),
    onPending: (input) => pending.push(input),
    onResult: (output, input) => results.push([output, input]),
    onError: (error, input) => errors.push([error, input]),
  });
  return { runner, calls, results, errors, pending };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test("a burst of changes within the debounce costs one request, for the last input", async () => {
  const { runner, calls, pending } = controllable();
  runner.schedule("a");
  mock.timers.tick(200);
  runner.schedule("b");
  mock.timers.tick(349);
  runner.schedule("c");
  assert.equal(calls.length, 0, "nothing is sent while the input keeps changing");
  mock.timers.tick(350);
  assert.deepEqual(calls.map((c) => c.input), ["c"]);
  assert.deepEqual(pending, ["a", "b", "c"], "each change marks the shown result as about to be replaced");
});

test("a newer request aborts the one in flight, and the older answer is never shown over the newer one", async () => {
  const { runner, calls, results } = controllable();
  runner.schedule("old", { immediate: true });
  runner.schedule("new", { immediate: true });
  assert.equal(calls[0].signal.aborted, true, "the superseded request is aborted");
  assert.equal(calls[1].signal.aborted, false);
  calls[1].resolve("answer for new");
  calls[0].resolve("answer for old");
  await flush();
  assert.deepEqual(results, [["answer for new", "new"]]);
});

test("an older answer that arrives first is dropped once a newer change is waiting", async () => {
  const { runner, calls, results } = controllable();
  runner.schedule("first", { immediate: true });
  runner.schedule("second");
  calls[0].resolve("answer for first");
  await flush();
  assert.deepEqual(results, [], "the first answer is stale as soon as the second change is made");
  mock.timers.tick(350);
  calls[1].resolve("answer for second");
  await flush();
  assert.deepEqual(results, [["answer for second", "second"]]);
});

test("only the latest run's error is reported; a superseded run's error is dropped", async () => {
  const { runner, calls, errors } = controllable();
  runner.schedule("a", { immediate: true });
  runner.schedule("b", { immediate: true });
  calls[0].reject(new Error("stale failure"));
  calls[1].reject(new Error("current failure"));
  await flush();
  assert.equal(errors.length, 1);
  assert.equal((errors[0][0] as Error).message, "current failure");
  assert.equal(errors[0][1], "b");
});

test("a run that throws synchronously is reported as an error, and cancel drops everything", async () => {
  const errors: unknown[] = [];
  const thrower = createLatestRunner<string, string>({
    delayMs: 0,
    run: () => {
      throw new Error("bad body");
    },
    onResult: () => assert.fail("no result"),
    onError: (error) => errors.push(error),
  });
  thrower.schedule("x", { immediate: true });
  await flush();
  assert.equal((errors[0] as Error).message, "bad body");

  const { runner, calls, results } = controllable();
  runner.schedule("a", { immediate: true });
  runner.schedule("b");
  runner.cancel();
  mock.timers.tick(1_000);
  assert.equal(calls.length, 1, "the pending change is not sent after cancel");
  assert.equal(calls[0].signal.aborted, true);
  calls[0].resolve("late");
  await flush();
  assert.deepEqual(results, []);
});

/** A runner with the answer cache on, counting the requests it sends. */
function cached(cacheSize?: number) {
  const calls: { input: string; resolve: (v: string) => void; reject: (e: unknown) => void }[] = [];
  const results: [string, string][] = [];
  const pending: string[] = [];
  const runner = createLatestRunner<string, string>({
    delayMs: 350,
    run: (input) => new Promise((resolve, reject) => calls.push({ input, resolve, reject })),
    cacheKey: (input) => input,
    cacheSize,
    onPending: (input) => pending.push(input),
    onResult: (output, input) => results.push([output, input]),
    onError: () => undefined,
  });
  return { runner, calls, results, pending };
}

test("an input answered before is answered again at once, with no request and no pending state", async () => {
  const { runner, calls, results, pending } = cached();
  runner.schedule("a", { immediate: true });
  calls[0].resolve("answer a");
  await flush();
  runner.schedule("b", { immediate: true });
  calls[1].resolve("answer b");
  await flush();
  pending.length = 0;
  runner.schedule("a");
  assert.equal(calls.length, 2, "no third request");
  assert.deepEqual(pending, [], "a known answer is not marked as pending");
  assert.deepEqual(results.at(-1), ["answer a", "a"]);
});

test("a cached answer supersedes a request in flight, so the older request's answer is never shown", async () => {
  const { runner, calls, results } = cached();
  runner.schedule("a", { immediate: true });
  calls[0].resolve("answer a");
  await flush();
  runner.schedule("b", { immediate: true });
  runner.schedule("a");
  calls[1].resolve("answer b");
  await flush();
  assert.deepEqual(results, [["answer a", "a"], ["answer a", "a"]]);
});

test("failures are not cached, and the cache keeps only the most recently used answers", async () => {
  const { runner, calls } = cached(2);
  runner.schedule("x", { immediate: true });
  calls[0].reject(new Error("down"));
  await flush();
  runner.schedule("x", { immediate: true });
  assert.equal(calls.length, 2, "a failed input is sent again");
  calls[1].resolve("answer x");
  await flush();
  for (const input of ["y", "z"]) {
    runner.schedule(input, { immediate: true });
    calls.at(-1)?.resolve(`answer ${input}`);
    await flush();
  }
  runner.schedule("x", { immediate: true });
  assert.equal(calls.length, 5, "x was the least recently used of three answers and was dropped");
  runner.schedule("z", { immediate: true });
  assert.equal(calls.length, 5, "z is still cached");
});
