import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { createLatestRunner } from "./latest.ts";
import {
  baselineRequest,
  baselineState,
  fallbackRequest,
  requestKey,
  resultsView,
  sameBaseline,
  solveStatus,
  type Answered,
  type Body,
} from "./solve-plan.ts";
import { buildRunBody, defaultAnswers, type Answers } from "./template.ts";

beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
afterEach(() => mock.timers.reset());

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const answers = defaultAnswers();

test("request keys ignore key order, and two requests share a baseline when only the price change differs", () => {
  assert.equal(requestKey({ b: 1, a: { d: 2, c: [1, 2] } }), requestKey({ a: { c: [1, 2], d: 2 }, b: 1 }));
  assert.notEqual(requestKey({ a: [1, 2] }), requestKey({ a: [2, 1] }));
  assert.equal(sameBaseline(buildRunBody(answers, 1_000), buildRunBody(answers, -250)), true);
  assert.equal(sameBaseline(buildRunBody(answers, 1_000), buildRunBody(answers, 0)), true);
  assert.equal(sameBaseline(buildRunBody(answers, 1_000), buildRunBody({ ...answers, std_miles: 20_000 }, 1_000)), false);
});

test("after an engine without cohort output answers, a price change reuses the answered request", () => {
  const first = buildRunBody(answers, 1_000);
  const old: Answered = { body: first, hasCohorts: false };
  assert.equal(baselineRequest(answers, 1_750, old), first, "same baseline: no new baseline solve");
  assert.equal(baselineRequest(answers, 0, old), first);
  const changed = { ...answers, fixed_cost: 3_000 };
  assert.deepEqual(baselineRequest(changed, 1_750, old), buildRunBody(changed, 1_750), "new owner profile: a new solve");
  assert.deepEqual(baselineRequest(answers, 1_000, null), first, "before any answer the request asks for the cohort output");
});

test("with the cohort engine, each price change is a new request, except $0, which the answered request serves", () => {
  const first = buildRunBody(answers, 1_000);
  const cohorts: Answered = { body: first, hasCohorts: true };
  assert.deepEqual(baselineRequest(answers, 1_250, cohorts), buildRunBody(answers, 1_250));
  assert.equal(baselineRequest(answers, 0, cohorts), first);
});

test("the plain solve at the new price is asked for only on the scenario tab, without cohort output, at a non-zero change", () => {
  const body = buildRunBody(answers, 1_000);
  const old: Answered = { body, hasCohorts: false };
  assert.deepEqual(fallbackRequest(body, 1_250, old, true), { StdMiles: 15_000, ReducedMiles: 8_000, FixedCost: 2_500, d: 0.05, PriceNewCar: 44_250 });
  assert.equal(fallbackRequest(body, 1_250, old, false), null, "another tab");
  assert.equal(fallbackRequest(body, 0, old, true), null, "no price change");
  assert.equal(fallbackRequest(body, 1_250, { body, hasCohorts: true }, true), null, "the cohort output answers the scenario");
  assert.equal(fallbackRequest(body, 1_250, null, true), null, "not known yet");
  const dear = buildRunBody({ ...answers, new_car_price: 80_000 }, 1_000);
  assert.equal(fallbackRequest(dear, 1_000, { body: dear, hasCohorts: false }, true), null, "a price the route would refuse");
});

interface Run {
  body: Body;
  hasCohorts: boolean;
}

test("the other tabs keep the last answer while only the price change differs, also while it is solved or after it failed", () => {
  const last: Run = { body: buildRunBody(answers, 1_000), hasCohorts: true };
  const failed = { run: null, lastGood: last, error: "The RR Toolbox is not responding.", busy: false };
  const kept = baselineState<Run, typeof failed>(failed, buildRunBody(answers, 1_250));
  assert.deepEqual(kept, { run: last, lastGood: last, error: null, busy: false });
  const solving = { run: last, lastGood: last, error: null, busy: true };
  assert.equal(baselineState<Run, typeof solving>(solving, buildRunBody(answers, 1_250)).busy, false);
  const newProfile = buildRunBody({ ...answers, std_miles: 20_000 }, 1_250);
  assert.equal(baselineState<Run, typeof failed>(failed, newProfile), failed, "new inputs: the failure is shown");
  const none = { run: null, lastGood: null, error: null, busy: true };
  assert.equal(baselineState<Run, typeof none>(none, buildRunBody(answers, 1_000)), none);
});

test("the status line reports a retry as solving, and every solve behind the tab must have an answer", () => {
  const ok = { busy: false, error: null, run: {} };
  const failed = { busy: false, error: "down", run: null };
  const retrying = { busy: true, error: "down", run: null };
  const first = { busy: true, error: null, run: null };
  assert.equal(solveStatus(retrying), "solving");
  assert.equal(solveStatus(failed), "error");
  assert.equal(solveStatus(ok), "solved");
  assert.equal(solveStatus({ busy: false, error: null, run: null }), "idle");
  assert.equal(solveStatus(ok, first), "solving");
  assert.equal(solveStatus(ok, failed), "error");
  assert.equal(solveStatus(ok, ok), "solved");
  assert.equal(resultsView(retrying), "retrying", "a new attempt replaces the error notice");
  assert.equal(resultsView(failed), "error");
  assert.equal(resultsView(first), "loading");
  assert.equal(resultsView({ busy: true, error: null, run: {} }), "results");
});

/**
 * The page's request loop with the real runner and plan, as DemoApp wires
 * them: one main and one fallback runner, each with the answer cache, a
 * request sent whenever a computed request changes, and the last answer fed
 * back into the plan. The fake engine answers at once.
 */
function presenter(engine: "cohorts" | "old") {
  const sent: Body[] = [];
  let answered: Answered | null = null;
  const runner = (onAnswer: (body: Body) => void) =>
    createLatestRunner<Body, Body>({
      delayMs: 350,
      cacheKey: requestKey,
      run: async (body) => {
        sent.push(body);
        return body;
      },
      onResult: (_out, body) => onAnswer(body),
      onError: () => assert.fail("the fake engine does not fail"),
    });
  const main = runner((body) => (answered = { body, hasCohorts: engine === "cohorts" && body.cohorts === true }));
  const fallback = runner(() => undefined);
  let mainKey: string | null = null;
  let fallbackKey: string | null = null;
  let current: { answers: Answers; delta: number; tab: string } = { answers, delta: 1_000, tab: "question" };

  async function show(next: Partial<typeof current>) {
    current = { ...current, ...next };
    // Re-render until nothing changes, as React does after each answer.
    for (let pass = 0; pass < 4; pass++) {
      const body = baselineRequest(current.answers, current.delta, answered);
      if (requestKey(body) !== mainKey) {
        mainKey = requestKey(body);
        main.schedule(body);
      }
      const shocked = fallbackRequest(body, current.delta, answered, current.tab === "scenario");
      const key = shocked ? requestKey(shocked) : null;
      if (key !== fallbackKey) {
        fallbackKey = key;
        if (shocked) fallback.schedule(shocked);
        else fallback.cancel();
      }
      mock.timers.tick(350);
      await flush();
    }
  }
  return { show, sent, current: () => current, answered: () => answered };
}

test("old engine: a price change costs one solve, a tab round trip none, and the baseline always matches the panel", async () => {
  const page = presenter("old");
  await page.show({ tab: "scenario" });
  assert.equal(page.sent.length, 2, "first load on the scenario tab: the baseline and the solve at the new price");
  // Twelve price changes, none of them $0 (which needs no comparison) and none repeated.
  for (const delta of [1_250, 1_500, 1_750, 2_000, 2_250, 2_500, 2_750, 3_000, 750, 500, 250, -250]) {
    const before: number = page.sent.length;
    await page.show({ delta });
    assert.equal(page.sent.length - before, 1, `price change ${delta}`);
    assert.equal(page.sent.at(-1)?.PriceNewCar, 43_000 + delta);
    assert.equal(sameBaseline(page.answered()!.body, buildRunBody(answers, delta)), true);
  }
  const afterSteps = page.sent.length;
  for (let trip = 0; trip < 3; trip++) {
    await page.show({ tab: "replacement" });
    await page.show({ tab: "scenario" });
  }
  await page.show({ delta: 1_000 });
  assert.equal(page.sent.length, afterSteps, "tab round trips and an earlier price change are answered from memory");
  assert.equal(page.sent.length, 14);
  await page.show({ answers: { ...answers, fixed_cost: 3_000 } });
  assert.equal(page.sent.length, 16, "a new owner profile on the scenario tab: the baseline and the new-price solve");
});

test("cohort engine: one solve per price change, none for a round trip, a $0 change or a price set back", async () => {
  const page = presenter("cohorts");
  await page.show({ tab: "scenario" });
  assert.equal(page.sent.length, 1);
  assert.equal(page.sent[0].price_shock, 1_000);
  for (const delta of [1_250, 1_500, 1_750]) await page.show({ delta });
  assert.equal(page.sent.length, 4);
  await page.show({ tab: "question" });
  await page.show({ tab: "scenario" });
  await page.show({ delta: 0 });
  await page.show({ delta: 1_250 });
  assert.equal(page.sent.length, 4);
  assert.equal(page.sent.every((body) => !("PriceNewCar" in body) || body.PriceNewCar === 43_000), true, "no second solve");
});
