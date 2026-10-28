import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { adaptSolveData } from "./solve-result.ts";
import { buildRunBody, defaultAnswers } from "./template.ts";
import { parseSolveRequest } from "./solve-input.ts";
import {
  compareGrids,
  compareScenario,
  describeSwitches,
  parseElasticity,
  shockedPriceBody,
  staticPercentChange,
} from "./scenario.ts";
import type { CohortsData } from "./types.ts";

/** Engine output at the defaults with cohorts and a +$1,000 shock (see the fixture's "source"). */
const fixture = JSON.parse(readFileSync(new URL("./fixtures/ados-cohorts-run.json", import.meta.url), "utf8"));
const data = adaptSolveData(fixture.data);
const cohorts = data.cohorts as CohortsData;

function withShock(shock: unknown): CohortsData {
  const raw = structuredClone(fixture.data);
  raw.cohorts.price_shock = shock;
  return adaptSolveData(raw).cohorts as CohortsData;
}

const close = (actual: number | null, expected: number, digits = 4) => {
  assert.ok(actual !== null, "expected a number");
  assert.equal(Number(actual.toFixed(digits)), expected);
};

test("the static approach: percent change = elasticity × price change / price × 100", () => {
  close(staticPercentChange(-1, 1_000, 43_000), -2.3256);
  close(staticPercentChange(-1, -1_000, 43_000), 2.3256);
  close(staticPercentChange(-0.5, 3_000, 30_000), -5);
  assert.equal(staticPercentChange(0, 1_000, 43_000), 0);
});

test("the +$1,000 comparison reads the engine's figures and derives percent changes from its rates", () => {
  const c = compareScenario(cohorts, -1);
  assert.ok(c);
  assert.equal(c.deltaPrice, 1_000);
  assert.equal(c.basePrice, 43_000);
  close(c.priceChangePct, 2.3256);
  close(c.baselineRate, 0.1439);
  close(c.scenarioRate, 0.1438);
  close(c.steadyStatePct, -0.1067);
  close(c.firstYearPct, -0.721, 3);
  close(c.cumulativePct, -0.1454);
  close(c.elasticity.steadyState, -0.046, 3);
  close(c.elasticity.firstYear, -0.31, 3);
  close(c.elasticity.cumulative, -0.063, 3);
  assert.equal(c.projectionYears, 10);
  close(c.staticPct, -2.3256);
  // Each derived percent change is the engine's elasticity times the price change.
  for (const [pct, elasticity] of [
    [c.steadyStatePct, c.elasticity.steadyState],
    [c.firstYearPct, c.elasticity.firstYear],
    [c.cumulativePct, c.elasticity.cumulative],
  ] as const) {
    assert.ok(Math.abs((pct as number) - (elasticity as number) * c.priceChangePct) < 1e-9);
  }
});

test("the -$1,000 comparison has the opposite sign, and the static figure follows the entered elasticity", () => {
  const c = compareScenario(withShock(fixture.price_shock_minus_1000), -0.5);
  assert.ok(c);
  assert.equal(c.deltaPrice, -1_000);
  assert.equal(c.basePrice, 43_000);
  close(c.steadyStatePct, 0.518, 3);
  close(c.elasticity.steadyState, -0.2227);
  close(c.elasticity.firstYear, -1.4857);
  close(c.staticPct, 1.1628);
  assert.ok((c.firstYearPct as number) > 0);
});

test("without a price-shock block there is no comparison", () => {
  const raw = structuredClone(fixture.data);
  delete raw.cohorts.price_shock;
  assert.equal(compareScenario(adaptSolveData(raw).cohorts as CohortsData, -1), null);
});

test("the elasticity field accepts finite numbers from -10 to 10, including a typographic minus", () => {
  assert.deepEqual(parseElasticity("-1.0"), { ok: true, value: -1 });
  assert.deepEqual(parseElasticity(" −1.2 "), { ok: true, value: -1.2 });
  assert.deepEqual(parseElasticity(".5"), { ok: true, value: 0.5 });
  assert.deepEqual(parseElasticity("-10"), { ok: true, value: -10 });
  for (const text of ["", "-", "abc", "1e3", "--1", "Infinity", "NaN", "1,5"]) {
    assert.deepEqual(parseElasticity(text), { ok: false, message: "Enter a number, for example -1.0." }, text);
  }
  assert.deepEqual(parseElasticity("-10.5"), { ok: false, message: "Enter a value between -10 and 10." });
});

test("fallback: the shocked plain solve keeps the owner profile, moves the price, and drops the lookup and cohort switches", () => {
  const body = buildRunBody(defaultAnswers(), 1_000);
  assert.deepEqual(shockedPriceBody(body, 1_000), {
    ok: true,
    body: { StdMiles: 15_000, ReducedMiles: 8_000, FixedCost: 2_500, d: 0.05, PriceNewCar: 44_000 },
  });
  assert.deepEqual(shockedPriceBody({}, -3_000), { ok: true, body: { PriceNewCar: 40_000 } });
  assert.deepEqual(shockedPriceBody({ PriceNewCar: 20_000 }, -250), {
    ok: false,
    message: "The new-vehicle price after the change ($19,750) is outside the $20,000 to $80,000 range this demo solves.",
  });
  assert.equal(shockedPriceBody({ PriceNewCar: 79_000 }, 1_000).ok, true);
  assert.equal(shockedPriceBody({ PriceNewCar: 79_000 }, 1_250).ok, false);
});

test("fallback: comparing two plain solves finds the same switching states as the engine's own comparison", () => {
  const plain = structuredClone(fixture.data);
  delete plain.cohorts;
  delete plain.params;
  const baseline = adaptSolveData(plain);
  const shockedRaw = structuredClone(plain);
  shockedRaw.policy = fixture.plain_policy_at_44000;
  delete shockedRaw.summary.decision_breakdown;
  const shocked = adaptSolveData(shockedRaw);

  const grid = compareGrids(baseline, shocked);
  assert.ok(grid);
  assert.deepEqual(grid.changed, cohorts.price_shock?.changed_states);
  assert.deepEqual(grid.shares[5], { age: 5, baseline: 0.35, scenario: 0.3125, baselineStates: 28, scenarioStates: 25, states: 80 });
  assert.deepEqual(
    grid.shares.filter((s) => s.age !== 5).map((s) => s.baseline === s.scenario),
    Array(10).fill(true),
  );
  assert.deepEqual(compareGrids(baseline, baseline)?.changed, []);

  const otherGrid = structuredClone(shocked);
  otherGrid.grids.fuel = [3, 4, 5, 6, 7];
  assert.equal(compareGrids(baseline, otherGrid), null);
});

test("switching states are described in words, grouped by age, economic index and direction", () => {
  assert.deepEqual(describeSwitches(cohorts.price_shock?.changed_states ?? []), [
    {
      age: 5,
      econ: 110,
      from: "sell",
      to: "drive",
      cells: [{ mpg: 26, fuel: [4] }, { mpg: 28, fuel: [5, 5.5] }],
      where: "26 mpg with fuel at $4.00 and 28 mpg with fuel at $5.00 or $5.50",
      change: "from sell (trade in and buy new) to drive (keep driving)",
    },
  ]);
  const minus = describeSwitches(fixture.price_shock_minus_1000.changed_states);
  assert.equal(minus.length, 1);
  assert.equal(minus[0].where, "28 mpg with fuel at $4.50 and 30 mpg with fuel at $5.50 or $6.00");
  assert.equal(minus[0].change, "from drive (keep driving) to sell (trade in and buy new)");
  assert.deepEqual(describeSwitches([]), []);
});

test("the page's request asks for cohorts and a 10-year projection, adds the price change only when it is not zero, and validates", () => {
  const withShock = buildRunBody(defaultAnswers(), -250);
  assert.equal(withShock.cohorts, true);
  assert.equal(withShock.projection_years, 10);
  assert.equal(withShock.price_shock, -250);
  assert.doesNotThrow(() => parseSolveRequest(withShock));
  const without = buildRunBody(defaultAnswers(), 0);
  assert.equal("price_shock" in without, false);
  assert.deepEqual(parseSolveRequest(without).query_state, { age: 5, fuel_economy: 28, fuel_price: 5.5, econ_condition: 100 });
});
