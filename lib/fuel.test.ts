import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { actionsByFuel, compareFuel, fuelShockBody, seriesOverPrices, TAPER_TO_SHOW_REDUCE } from "./fuel.ts";
import { parseSolveRequest } from "./solve-input.ts";
import { adaptSolveData } from "./solve-result.ts";
import { buildSolveBody, defaultAnswers, VEHICLE_RETENTION_TEMPLATE } from "./template.ts";
import type { SolveData } from "./types.ts";

/** Engine output at the v1c defaults with cohorts (see the fixture's "source"): fuel $4.00 to $6.00, five levels. */
const fixture = JSON.parse(readFileSync(new URL("./fixtures/ados-cohorts-run.json", import.meta.url), "utf8"));
const baseline = adaptSolveData(fixture.data);

/** The same run on a grid shifted up by `rise`, as a shifted solve would report it. */
function shifted(rise: number, edit?: (data: SolveData) => void): SolveData {
  const raw = structuredClone(fixture.data);
  raw.grids.fuel = raw.grids.fuel.map((f: number) => f + rise);
  raw.params.FuelMin += rise;
  raw.params.FuelMax += rise;
  delete raw.state_labels; // rebuilt from the shifted grid
  delete raw.cohorts.price_shock; // a scenario solve asks for no price shock, and its rows name the old grid
  const data = adaptSolveData(raw);
  edit?.(data);
  return data;
}

test("the scenario body carries the owner profile onto a shifted grid and nothing else", () => {
  const base = { ...buildSolveBody(VEHICLE_RETENTION_TEMPLATE, defaultAnswers()), cohorts: true, projection_years: 10, price_shock: 1000 };
  const plan = fuelShockBody(base, 2);
  assert.ok(plan.ok);
  assert.deepEqual(plan.body, {
    StdMiles: 15_000,
    ReducedMiles: 12_000,
    PriceNewCar: 43_000,
    FixedCost: 2_500,
    d: 0.05,
    DecayFraction: 0.25,
    projection_years: 10,
    FuelMin: 6,
    FuelMax: 9,
    cohorts: true,
  });
  // The route accepts it as a single-cohort request on a shifted grid.
  assert.deepEqual(parseSolveRequest(plan.body), plan.body);
  assert.equal(fuelShockBody(base, 0).ok, true);
  assert.equal(fuelShockBody(base, 4).ok, true);
  const tooHigh = fuelShockBody(base, 8.5);
  assert.ok(!tooHigh.ok && /outside the range/.test(tooHigh.message));
  const negative = fuelShockBody(base, -0.5);
  assert.ok(!negative.ok);
});

test("the panel's taper reaches the request as a fraction and the route bounds it", () => {
  const body = buildSolveBody(VEHICLE_RETENTION_TEMPLATE, { ...defaultAnswers(), decay_fraction: TAPER_TO_SHOW_REDUCE });
  assert.equal(body.DecayFraction, 0.35);
  assert.equal(parseSolveRequest({ DecayFraction: 0.6 }).DecayFraction, 0.6);
  assert.throws(() => parseSolveRequest({ DecayFraction: 0.61 }), /Largest taper of enjoyment per mile must be between 0% and 60%/);
  assert.throws(() => parseSolveRequest({ DecayFraction: -0.01 }), /taper/);
});

test("a shifted grid needs both bounds, the engine's span and the route's range", () => {
  assert.throws(() => parseSolveRequest({ FuelMin: 6 }), /both its lowest and highest price/);
  assert.throws(() => parseSolveRequest({ FuelMin: 6, FuelMax: 8 }), /must span \$3\.00 a gallon/);
  assert.throws(() => parseSolveRequest({ FuelMin: 13, FuelMax: 16 }), /Lowest fuel price on the grid must be between/);
  assert.throws(() => parseSolveRequest({ FuelMin: 3, FuelMax: 6 }), /Lowest fuel price/);
  assert.deepEqual(parseSolveRequest({ FuelMin: 8, FuelMax: 11 }), { FuelMin: 8, FuelMax: 11 });
  // The grid size itself is still refused: the state count must stay 1,232.
  assert.throws(() => parseSolveRequest({ FuelMin: 6, FuelMax: 9, nFuel: 9 }), /"nFuel" is not an input/);
});

test("best-action counts by fuel price add up to the run's totals", () => {
  const byFuel = actionsByFuel(baseline);
  assert.equal(byFuel.length, 5);
  assert.deepEqual(byFuel.map((e) => e.fuel), [4, 4.5, 5, 5.5, 6]);
  const perPrice = baseline.dims.nAge * baseline.dims.nMpg * baseline.dims.nEcon;
  for (const entry of byFuel) {
    assert.equal(entry.states, perPrice);
    assert.equal(entry.counts.drive + entry.counts.sell + entry.counts.reduce, perPrice);
  }
  const totals = byFuel.reduce(
    (sum, e) => ({ drive: sum.drive + e.counts.drive, sell: sum.sell + e.counts.sell, reduce: sum.reduce + e.counts.reduce }),
    { drive: 0, sell: 0, reduce: 0 },
  );
  assert.deepEqual(totals, baseline.summary.decision_breakdown);
  // At the defaults selling spreads over every fuel price and nothing reduces.
  assert.ok(byFuel.every((e) => e.counts.sell > 0 && e.counts.reduce === 0));
});

test("the comparison lines the two grids up by price and reads the fleet figures", () => {
  const scenario = shifted(2);
  const c = compareFuel(baseline, scenario);
  assert.ok(c);
  assert.equal(c.rise, 2);
  assert.deepEqual(c.prices, [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8]);
  assert.equal(c.baseline.rate, baseline.cohorts?.annual_replacement_rate);
  assert.equal(c.scenario.holdingYears, scenario.cohorts?.mean_holding_years);
  assert.equal(c.ratePct, 0); // the fixture solves the same policy at both prices
  // Series over the union of prices: null where a grid has no such level.
  const base = seriesOverPrices(c.baseline.byFuel, c.prices, "sell");
  assert.deepEqual(base.slice(5), [null, null, null, null]);
  assert.equal(base[0], c.baseline.byFuel[0].counts.sell);
  const after = seriesOverPrices(c.scenario.byFuel, c.prices, "sell");
  assert.deepEqual(after.slice(0, 4), [null, null, null, null]);
  assert.equal(after[4], c.scenario.byFuel[0].counts.sell);
});

test("a run on a grid that is not a plain shift, or of another size, is not compared", () => {
  assert.equal(compareFuel(baseline, shifted(-1)), null);
  const stretched = shifted(0, (data) => {
    data.grids.fuel[4] = 9;
  });
  assert.equal(compareFuel(baseline, stretched), null);
  const market = JSON.parse(readFileSync(new URL("./fixtures/ados-market-fleet-run.json", import.meta.url), "utf8"));
  const other = adaptSolveData({ ...fixture.data, grids: market.envelope.raw.data.grids, dims: market.envelope.raw.data.dims, policy: Array(1232).fill(1), value: Array(1232).fill(0), summary: { ...fixture.data.summary, S: 1232, decision_breakdown: { drive: 1232, sell: 0, reduce: 0 } }, state_labels: undefined, cohorts: undefined });
  assert.equal(compareFuel(baseline, other), null);
});
