import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { adaptMarketSolveData, checkMarketAgainstRequest } from "./market-result.ts";
import { adaptToolResult, SolveProtocolError } from "./solve-result.ts";
import type { MarketSolveParameters } from "./solve-input.ts";
import { VEHICLE_CLASS_TAGS } from "./market.ts";

/** A market fleet run through the RR Toolbox API's MCP route (see the fixture's "source"). */
const fixture = JSON.parse(readFileSync(new URL("./fixtures/ados-market-fleet-run.json", import.meta.url), "utf8"));
const request: MarketSolveParameters = fixture.request;

function envelope() {
  return structuredClone(fixture.envelope);
}

function asText(value: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

function protocolError(fn: () => unknown, message: RegExp) {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof SolveProtocolError, `expected SolveProtocolError, got ${String(error)}`);
    assert.match(error.message, message);
    return true;
  });
}

test("a market fleet run is read with every cohort and the market block", () => {
  const { data, attribution, warnings } = adaptToolResult(asText(envelope()), request);
  assert.equal(data.kind, "market");
  assert.deepEqual(data.classes.map((c) => c.tag), [...VEHICLE_CLASS_TAGS]);
  assert.equal(data.dims.nAge, 11);
  const mid = data.classes[2];
  assert.equal(mid.tag, "MID");
  assert.equal(mid.share, 0.25);
  assert.deepEqual(mid.decision_breakdown, { drive: 661, sell: 571, reduce: 0 });
  assert.equal(mid.params.PriceNewCar, 43_000);
  // MID inside the market is the single MID run: the fleet figures the single-cohort fixture pins.
  assert.ok(Math.abs(mid.fleet.annual_replacement_rate - 0.14532) < 1e-5);
  assert.equal(mid.fleet.replacement_hazard[7], 1);
  assert.equal(mid.fleet.replacement_hazard[8], null);
  assert.ok(mid.fleet.stationary_share_sell && mid.fleet.stationary_share_sell[6] > mid.fleet.grid_share_sell[6] - 1e-6);
  assert.equal(mid.fleet.price_shock?.states_changed, 4);
  assert.equal(mid.fleet.price_shock?.changed_states.length, 4);
  const market = data.market;
  assert.ok(Math.abs(market.annual_replacement_rate - 0.137282) < 1e-6);
  assert.ok(market.mean_holding_years && Math.abs(market.mean_holding_years - 7.284) < 5e-4);
  assert.equal(market.replacement_hazard[9] !== null, true); // LSUV and EXO reach the top ages
  assert.equal(market.by_class.EXO.share, 0.04);
  assert.equal(market.price_shock?.states_changed, 34);
  assert.equal(market.price_shock?.by_class.PKP.states_changed, 11);
  assert.ok(Math.abs((market.price_shock?.price_change_pct ?? 0) - 2.2254) < 5e-4);
  assert.match(market.method, /share-weighted/);
  assert.ok(market.caveats.some((c) => c.startsWith("Market shares weight vehicles")));
  assert.match(attribution, /Rapid Recursive/);
  assert.ok(warnings.some((w) => w.startsWith("Market fleet figures")));
});

test("a truncated switch list per cohort is read with the full count", () => {
  const data = adaptMarketSolveData(envelope().raw.data);
  const pkp = data.classes.find((c) => c.tag === "PKP")!;
  assert.equal(pkp.fleet.price_shock?.states_changed, 11);
  assert.equal(pkp.fleet.price_shock?.changed_states.length, 10);
  assert.equal(pkp.fleet.price_shock?.changed_states_truncated, true);
});

test("the request must match the mix and the price change", () => {
  const data = adaptMarketSolveData(envelope().raw.data);
  assert.doesNotThrow(() => checkMarketAgainstRequest(data, request));
  protocolError(() => checkMarketAgainstRequest(data, { ...request, price_shock: 500 }), /different price change/);
  protocolError(() => checkMarketAgainstRequest(data, { ...request, market_shares: { ...request.market_shares, ECO: 0.13 } }), /share for ECO/);
  protocolError(() => checkMarketAgainstRequest(data, { market_shares: { MID: 1 }, cohorts: true, price_shock: 1000 }), /different set of cohorts/);
  protocolError(() => checkMarketAgainstRequest(data, { ...request, projection_years: 5 }), /years asked for/);
});

test("a single-cohort answer to a market request, and the reverse, are refused", () => {
  const single = JSON.parse(readFileSync(new URL("./fixtures/ados-cohorts-run.json", import.meta.url), "utf8"));
  const wrong = { ...envelope(), raw: { status: "success", data: single.data } };
  protocolError(() => adaptToolResult(asText(wrong), request), /single-cohort run answered a market request/);
  protocolError(() => adaptToolResult(asText(envelope())), /market run answered a single-cohort request/);
});

test("market figures that are not the share-weighted cohort figures are refused", () => {
  const e = envelope();
  e.raw.data.aggregate.cohorts.annual_replacement_rate = 0.2;
  e.raw.data.aggregate.cohorts.mean_holding_years = 5;
  protocolError(() => adaptMarketSolveData(e.raw.data), /annual_replacement_rate is not the share-weighted sum/);
  const f = envelope();
  f.raw.data.aggregate.cohorts.fleet_share[0] += 0.01;
  protocolError(() => adaptMarketSolveData(f.raw.data), /fleet_share\[0\] is not the share-weighted sum/);
  const g = envelope();
  g.raw.data.aggregate.cohorts.by_class.MID.annual_replacement_rate = 0.1;
  protocolError(() => adaptMarketSolveData(g.raw.data), /by_class.MID disagrees/);
  const h = envelope();
  h.raw.data.aggregate.cohorts.price_shock.states_changed = 33;
  protocolError(() => adaptMarketSolveData(h.raw.data), /states_changed is not the sum/);
  const i = envelope();
  i.raw.data.aggregate.market_shares.ECO = 0.2;
  protocolError(() => adaptMarketSolveData(i.raw.data), /market_shares do not sum to 1/);
});

test("a market run without the fleet output is refused: the page has nothing to draw", () => {
  const e = envelope();
  delete e.raw.data.aggregate.cohorts;
  protocolError(() => adaptMarketSolveData(e.raw.data), /aggregate.cohorts is missing/);
});

test("a cohort's switch rows must be states of the grid that change action", () => {
  const e = envelope();
  const rows = e.raw.data.vehicle_classes.MID.cohorts.price_shock.changed_states;
  rows[0].fuel_price = 9;
  protocolError(() => adaptMarketSolveData(e.raw.data), /changed_states\[0\].fuel_price disagrees/);
  const f = envelope();
  f.raw.data.vehicle_classes.MID.cohorts.price_shock.changed_states[1].to = "sell";
  protocolError(() => adaptMarketSolveData(f.raw.data), /does not change action/);
});
