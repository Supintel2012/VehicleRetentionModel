import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildMarketBody,
  classRow,
  compareMarket,
  defaultMix,
  firstReplacementAge,
  marketShares,
  MARKET_MIX_2026,
  mixError,
  mixIsComplete,
  mixTotal,
  orderBySlowest,
  parseSharePercent,
  VEHICLE_CLASS_TAGS,
  VEHICLE_CLASSES,
} from "./market.ts";
import { parseMarketRequest } from "./solve-input.ts";

/** The engine's own class rows and 2026 shares (see the fixture's "source"). */
const fixture = JSON.parse(readFileSync(new URL("./fixtures/ados-market-fleet-run.json", import.meta.url), "utf8"));

test("the cohort rows are the engine's class rows, in its order", () => {
  const classes = fixture.envelope.raw.data.vehicle_classes;
  assert.deepEqual(Object.keys(classes), [...VEHICLE_CLASS_TAGS]);
  for (const row of VEHICLE_CLASSES) {
    const params = classes[row.tag].params;
    assert.equal(params.PriceNewCar, row.PriceNewCar, row.tag);
    assert.equal(params.EnjoyBase, row.EnjoyBase, row.tag);
    assert.equal(params.StdMiles, row.StdMiles, row.tag);
    assert.equal(params.d, row.d, row.tag);
  }
  assert.equal(classRow("LSUV").name, "Luxury SUVs and large crossovers");
});

test("the 2026 mix is the engine's calibration and adds up to 100", () => {
  assert.deepEqual(marketShares(defaultMix()), fixture.envelope.raw.data.aggregate.market_shares);
  assert.equal(mixTotal(MARKET_MIX_2026), 100);
  assert.equal(mixIsComplete(defaultMix()), true);
  assert.equal(mixError(defaultMix()), null);
});

test("a mix that does not add up says by how much, and tenths are exact", () => {
  const mix = { ...defaultMix(), EXO: 3.5 };
  assert.equal(mixTotal(mix), 99.5);
  assert.equal(mixError(mix), "The shares add up to 99.5%; add 0.5 points to reach 100%.");
  const over = { ...defaultMix(), ECO: 12.3 };
  assert.equal(mixError(over), "The shares add up to 100.3%; remove 0.3 points to reach 100%.");
  // Three tenths twice is not 0.6 in floating point; the total is still exact.
  assert.equal(mixTotal({ ...defaultMix(), ECO: 12.3, ENT: 17.7 }), 100);
});

test("a share is typed as a percent with at most one decimal", () => {
  assert.deepEqual(parseSharePercent("12"), { value: 12 });
  assert.deepEqual(parseSharePercent(" 12.34 % "), { value: 12.3 });
  assert.deepEqual(parseSharePercent("0"), { value: 0 });
  assert.deepEqual(parseSharePercent("100"), { value: 100 });
  for (const bad of ["", "abc", "-1", "101"]) assert.ok("error" in parseSharePercent(bad), bad);
});

test("the market body is the one request the route accepts for a market run", () => {
  const body = buildMarketBody(defaultMix(), 1_000);
  assert.deepEqual(body, { market_shares: MARKET_MIX_2026_SHARES, cohorts: true, projection_years: 10, price_shock: 1_000 });
  assert.deepEqual(parseMarketRequest(body), body);
  assert.equal("price_shock" in buildMarketBody(defaultMix(), 0), false);
  // Shares are sent as shares of 1 that add up within the engine's tolerance.
  const sent = buildMarketBody({ ...defaultMix(), ECO: 12.3, ENT: 17.7 }, 0).market_shares as Record<string, number>;
  assert.ok(Math.abs(Object.values(sent).reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

const MARKET_MIX_2026_SHARES = { ECO: 0.12, ENT: 0.18, MID: 0.25, PKP: 0.22, LUX: 0.1, LSUV: 0.09, EXO: 0.04 };

test("the market comparison reads the aggregate shock block", () => {
  const agg = fixture.envelope.raw.data.aggregate.cohorts;
  const c = compareMarket(agg.annual_replacement_rate, agg.price_shock);
  assert.equal(c.deltaPrice, 1_000);
  assert.ok(Math.abs(c.priceChangePct - 2.2254) < 5e-4);
  assert.equal(c.baselineRate, agg.annual_replacement_rate);
  assert.equal(c.scenarioRate, agg.price_shock.annual_replacement_rate);
  assert.ok(c.steadyStatePct !== null && c.steadyStatePct < 0);
  assert.ok(c.firstYearPct !== null && c.firstYearPct < c.steadyStatePct);
  assert.equal(c.projectionYears, 10);
  assert.ok(Math.abs((c.elasticity.steadyState ?? 0) - -0.283) < 5e-4);
});

test("first replacement age and the slowest-first ordering", () => {
  assert.equal(firstReplacementAge([0, 1, 2, 3], [0, null, 0.2, 1]), 2);
  assert.equal(firstReplacementAge([0, 1], [0, 0]), null);
  const rows = orderBySlowest([
    { tag: "ECO", share: 0.5, rate: 0.15, holdingYears: 6.7 },
    { tag: "EXO", share: 0.25, rate: 0.076, holdingYears: 13.2 },
    { tag: "MID", share: 0.25, rate: 0.15, holdingYears: 6.7 },
  ]);
  assert.deepEqual(rows.map((r) => r.tag), ["EXO", "ECO", "MID"]);
});
