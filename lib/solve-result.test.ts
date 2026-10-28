import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  adaptSolveData,
  adaptToolResult,
  buildStateLabels,
  SolveProtocolError,
  SolveToolError,
} from "./solve-result.ts";

/** Live RR Toolbox MCP response at engine defaults (see the fixture's "source"). */
const fixture = JSON.parse(readFileSync(new URL("./fixtures/ados-default-run.json", import.meta.url), "utf8"));
const columns: string[] = fixture.state_table_columns;
/** The engine's own state_table, as the live API returned it. */
const liveStateTable: Record<string, number>[] = fixture.state_table_rows.map((row: number[]) =>
  Object.fromEntries(columns.map((column, i) => [column, row[i]])),
);

/** Today's API: the full engine output, state_table included. */
function currentEnvelope() {
  const envelope = structuredClone(fixture.envelope);
  envelope.raw.data.state_table = structuredClone(liveStateTable);
  return envelope;
}

/** The upcoming API change: no state_table and value rounded to cents. */
function compactEnvelope() {
  const envelope = structuredClone(fixture.envelope);
  envelope.raw.data.value = envelope.raw.data.value.map((v: number) => Math.round(v * 100) / 100);
  return envelope;
}

type EngineData = ReturnType<typeof compactEnvelope>["raw"]["data"];

/** fastapi-mcp returns the envelope as indented JSON text, with no structuredContent. */
function asText(envelope: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(envelope, null, 2) }] };
}

function protocolError(fn: () => unknown, detail: RegExp) {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof SolveProtocolError, `expected SolveProtocolError, got ${String(error)}`);
    assert.match(error.message, detail);
    return true;
  });
}

test("without state_table, coordinates are rebuilt for every state and equal the engine's own table", () => {
  const { data } = adaptToolResult(asText(compactEnvelope()));
  assert.equal(data.state_table.length, 880);
  assert.deepEqual(data.state_table, liveStateTable);
});

test("rebuilt coordinates follow the engine index order (age slowest, economic index fastest)", () => {
  const { data } = adaptToolResult(asText(compactEnvelope()));
  const row = (id: number) => data.state_table[id - 1];
  const expected = [
    // state_id, age, mpg, fuel $/gal, econ index, age_idx, mpg_idx, fuel_idx, econ_idx
    [1, 0, 26, 4.0, 90, 0, 0, 0, 0],
    [2, 0, 26, 4.0, 100, 0, 0, 0, 1],
    [5, 0, 26, 4.5, 90, 0, 0, 1, 0],
    [21, 0, 28, 4.0, 90, 0, 1, 0, 0],
    [81, 1, 26, 4.0, 90, 1, 0, 0, 0],
    [431, 5, 28, 5.0, 110, 5, 1, 2, 2],
    [593, 7, 28, 5.5, 90, 7, 1, 3, 0],
    [880, 10, 32, 6.0, 120, 10, 3, 4, 3],
  ];
  for (const [id, age, mpg, fuel, econ, ia, im, ifu, ie] of expected) {
    assert.deepEqual(row(id), {
      state_id: id, age, fuel_economy: mpg, fuel_price: fuel, econ_condition: econ,
      age_idx: ia, mpg_idx: im, fuel_idx: ifu, econ_idx: ie,
    }, `state ${id}`);
  }
  // The heatmap reads policy[s] with the same formula: state 593 (the sample answers' cell) sells.
  assert.equal(data.summary.actions[data.policy[592] - 1], "sell");
  assert.equal(data.state_labels[592], "Age7_mpg28_price55_y90");
});

test("with state_table present (today's API) the result is accepted and matches the rebuild", () => {
  const current = adaptToolResult(asText(currentEnvelope())).data;
  const compact = adaptToolResult(asText(compactEnvelope())).data;
  assert.deepEqual(current.state_table, liveStateTable);
  assert.deepEqual(current.state_table, compact.state_table);
  assert.deepEqual(current.value, fixture.envelope.raw.data.value);
  assert.deepEqual(compact.value, fixture.envelope.raw.data.value.map((v: number) => Math.round(v * 100) / 100));
});

test("a state_table that disagrees with grids and dims is rejected rather than silently trusted", () => {
  const swapped = currentEnvelope();
  const table = swapped.raw.data.state_table;
  [table[0], table[1]] = [table[1], table[0]];
  protocolError(() => adaptToolResult(asText(swapped)), /state_table row 1 disagrees/);

  const shifted = currentEnvelope();
  shifted.raw.data.state_table[592].fuel_price = 5.0;
  protocolError(() => adaptToolResult(asText(shifted)), /row 593 disagrees with grids and dims at fuel_price/);

  const short = currentEnvelope();
  short.raw.data.state_table.pop();
  protocolError(() => adaptToolResult(asText(short)), /state_table does not have 880 rows/);
});

test("labels are rebuilt in the engine's format when state_labels is also omitted", () => {
  const envelope = compactEnvelope();
  delete envelope.raw.data.state_labels;
  const { data } = adaptToolResult(asText(envelope));
  assert.deepEqual(data.state_labels, fixture.envelope.raw.data.state_labels);
  // Python round() sends halves to the even neighbour; a 26.5 mpg grid point labels as 26.
  assert.deepEqual(
    buildStateLabels([{ ...data.state_table[0], fuel_economy: 26.5 }, { ...data.state_table[0], fuel_economy: 27.5 }]),
    ["Age0_mpg26_price40_y90", "Age0_mpg28_price40_y90"],
  );
});

test("summary, policy and attribution pass through; the breakdown is checked against the policy", () => {
  const { data, attribution, warnings } = adaptToolResult(asText(compactEnvelope()));
  assert.equal(attribution, fixture.envelope.attribution);
  assert.match(attribution, /Rapid Recursive® Toolbox/);
  assert.deepEqual(warnings, []);
  assert.deepEqual(data.summary.decision_breakdown, { drive: 472, sell: 408, reduce: 0 });
  assert.equal(data.summary.S, 880);
  assert.equal(data.summary.iterations, 6);
  assert.equal(data.summary.beta, 0.9523809523809523);
  assert.deepEqual(data.dims, { nAge: 11, nMpg: 4, nFuel: 5, nEcon: 4 });
  assert.deepEqual(data.policy, fixture.envelope.raw.data.policy);
  assert.equal("query_state" in data, false);

  const lying = compactEnvelope();
  lying.raw.data.summary.decision_breakdown = { drive: 880, sell: 0, reduce: 0 };
  protocolError(() => adaptToolResult(asText(lying)), /decision_breakdown disagrees/);
});

test("structuredContent is read when it is the run envelope, in preference to text", () => {
  const { data } = adaptToolResult({ structuredContent: compactEnvelope(), content: [{ type: "text", text: "not json" }] });
  assert.equal(data.policy.length, 880);
});

test("with MCP Apps on, the view-model in structuredContent is skipped and the envelope is read from the text", () => {
  // RR Toolbox app/mcp/apps.py: structuredContent becomes the card's view-model (no `raw`) and
  // the text keeps the envelope, compacted to step C2 (state_table left out) for a large run.
  const text = { ...compactEnvelope(), omitted_for_size: { paths: ["raw.data.state_table"], note: "Left out for size." } };
  const viewModel = {
    kind: "rr.model_result",
    v: 1,
    tool: "run_decision_model",
    model_name: "AutoDriveOrSell",
    family: "policy_vector",
    summary: "Model AutoDriveOrSell solved successfully. Optimal action over 880 states: Drive in 472 ...",
    policy: { state_count: 880, actions: ["drive", "sell", "reduce"], breakdown: [472, 408, 0] },
    warnings: [],
    attribution: fixture.envelope.attribution,
  };
  const { data, attribution } = adaptToolResult({ structuredContent: viewModel, ...asText(text) });
  assert.equal(data.state_table.length, 880);
  assert.deepEqual(data.state_table, liveStateTable);
  assert.deepEqual(data.summary.decision_breakdown, { drive: 472, sell: 408, reduce: 0 });
  assert.equal(attribution, fixture.envelope.attribution);

  protocolError(() => adaptToolResult({ structuredContent: viewModel, content: [] }), /no run envelope/);
});

test("a result without a non-empty attribution is refused", () => {
  for (const attribution of [undefined, "", "   ", 42]) {
    const envelope = compactEnvelope();
    envelope.attribution = attribution;
    protocolError(() => adaptToolResult(asText(envelope)), /no attribution/);
  }
});

test("warnings are passed through as strings, at most 20", () => {
  const envelope = compactEnvelope();
  envelope.warnings = ["Fuel price snapped to $5.50.", { message: "Econ index snapped to 90." }, { code: 7 }, "", ...Array(30).fill("x")];
  const { warnings } = adaptToolResult(asText(envelope));
  assert.equal(warnings.length, 20);
  assert.deepEqual(warnings.slice(0, 3), ["Fuel price snapped to $5.50.", "Econ index snapped to 90.", "x"]);
});

test("query_state is kept when it agrees with the policy and the grid", () => {
  const envelope = compactEnvelope();
  envelope.raw.data.query_state = {
    state_id: 593,
    label: "Age7_mpg28_price55_y90",
    matched: { age: 7, fuel_economy: 28, fuel_price: 5.5, econ_condition: 90 },
    recommended_action: "sell",
    recommended_action_index: 2,
    value: 327347.55,
  };
  assert.deepEqual(adaptToolResult(asText(envelope)).data.query_state, envelope.raw.data.query_state);

  envelope.raw.data.query_state.recommended_action = "drive";
  envelope.raw.data.query_state.recommended_action_index = 1;
  protocolError(() => adaptToolResult(asText(envelope)), /recommendation disagrees with the policy/);

  envelope.raw.data.query_state = { ...envelope.raw.data.query_state, recommended_action: "sell", recommended_action_index: 2, matched: { age: 7, fuel_economy: 28, fuel_price: 5.5, econ_condition: 95 } };
  protocolError(() => adaptToolResult(asText(envelope)), /matched\.econ_condition disagrees with state 593/);
});

test("malformed engine output is refused", () => {
  const mutate = (change: (data: EngineData) => void) => {
    const envelope = compactEnvelope();
    change(envelope.raw.data);
    return () => adaptToolResult(asText(envelope));
  };
  protocolError(mutate((d) => d.policy.pop()), /policy does not have 880 entries/);
  protocolError(mutate((d) => (d.policy[0] = 0)), /policy\[0\] is not a 1-based action index/);
  protocolError(mutate((d) => (d.policy[3] = 4)), /policy\[3\]/);
  protocolError(mutate((d) => (d.value[10] = null)), /value\[10\] is not a finite number/);
  protocolError(mutate((d) => (d.summary.actions = ["sell", "drive", "reduce"])), /summary\.actions/);
  protocolError(mutate((d) => (d.dims.nAge = 10)), /grids\.age does not have 10 entries/);
  protocolError(mutate((d) => (d.summary.S = 881)), /summary\.S does not equal the 880 states/);
  protocolError(mutate((d) => d.grids.fuel.pop()), /grids\.fuel does not have 5 entries/);
  protocolError(mutate((d) => delete d.summary.solve_ms), /summary\.solve_ms/);
  protocolError(mutate((d) => (d.state_labels = d.state_labels.slice(1))), /state_labels is not a list of 880 strings/);
  protocolError(() => adaptSolveData(undefined), /dims\.nAge/);

  const failed = compactEnvelope();
  failed.raw.status = "error";
  protocolError(() => adaptToolResult(asText(failed)), /raw\.status is not success/);
  protocolError(() => adaptToolResult({ content: [{ type: "text", text: "<html>502 Bad Gateway</html>" }] }), /not JSON/);
  protocolError(() => adaptToolResult({ content: [] }), /no run envelope in structuredContent or text content/);
});

test("a tool error carries the RR Toolbox status for classification but nothing else is parsed", () => {
  const text = 'Error calling run_decision_model. Status code: 403. Response: {"detail":"Requires read_write access (you have read)"}';
  assert.throws(() => adaptToolResult({ isError: true, content: [{ type: "text", text }] }), (error: unknown) => {
    assert.ok(error instanceof SolveToolError);
    assert.equal(error.upstreamStatus, 403);
    return true;
  });
  assert.throws(() => adaptToolResult({ isError: true, content: [] }), (error: unknown) => {
    assert.ok(error instanceof SolveToolError);
    assert.equal(error.upstreamStatus, null);
    return true;
  });
});

// ── Phase 2: the opt-in cohort block (RR Toolbox engine with fleet output) ─

/** Engine output with cohorts: true, price_shock: 1000 at the defaults, compacted like the MCP result. */
const cohortsFixture = JSON.parse(readFileSync(new URL("./fixtures/ados-cohorts-run.json", import.meta.url), "utf8"));

function cohortEnvelope() {
  return { ...structuredClone(fixture.envelope), raw: { status: "success", data: structuredClone(cohortsFixture.data) } };
}

const cohortRequest = { cohorts: true, price_shock: 1_000, projection_years: 10 };

test("a cohort block is read with the published default figures", () => {
  const { data } = adaptToolResult(asText(cohortEnvelope()), cohortRequest);
  const cohorts = data.cohorts;
  assert.ok(cohorts, "cohorts are kept");
  const round = (x: number | null, digits = 4) => (x === null ? null : Number(x.toFixed(digits)));
  assert.deepEqual(cohorts.replacement_hazard.map((x) => round(x)), [0, 0, 0, 0, 0, 0.2831, 0.6766, 1, null, null, null]);
  assert.deepEqual(cohorts.fleet_share.map((x) => round(x)), [0.1439, 0.1439, 0.1439, 0.1439, 0.1439, 0.1439, 0.1032, 0.0334, 0, 0, 0]);
  assert.deepEqual(cohorts.grid_share_sell, [0, 0, 0, 0, 0, 0.35, 0.75, 1, 1, 1, 1]);
  assert.equal(round(cohorts.annual_replacement_rate, 5), 0.14391);
  assert.equal(round(cohorts.mean_holding_years, 2), 6.95);
  assert.deepEqual(cohorts.projection.years, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(cohorts.caveats.length, 4);

  const shock = cohorts.price_shock;
  assert.ok(shock);
  assert.equal(shock.delta_price, 1_000);
  assert.equal(shock.price_new_car, 44_000);
  assert.equal(round(shock.annual_replacement_rate, 6), 0.143756);
  assert.equal(round(shock.implied_elasticity, 3), -0.046);
  assert.equal(round(shock.first_year_elasticity, 3), -0.31);
  assert.equal(round(shock.cumulative_elasticity, 3), -0.063);
  assert.equal(shock.states_changed, 3);
  assert.deepEqual(
    shock.changed_states.map((s) => [s.state_id, s.age, s.fuel_economy, s.fuel_price, s.econ_condition, s.from, s.to]),
    [
      [403, 5, 26, 4, 110, "sell", "drive"],
      [431, 5, 28, 5, 110, "sell", "drive"],
      [435, 5, 28, 5.5, 110, "sell", "drive"],
    ],
  );
  assert.equal(data.params?.PriceNewCar, 43_000);
  assert.equal(data.params?.ReducedMiles, 8_000);
  assert.equal("cohorts" in (data.params ?? {}), false, "flags are not numbers and are left out of params");
});

test("an engine without the cohort output (today's API) is still read, with no cohorts", () => {
  const { data } = adaptToolResult(asText(compactEnvelope()), cohortRequest);
  assert.equal("cohorts" in data, false);
  assert.equal("params" in data, false);
  assert.equal(data.policy.length, 880);
});

test("a cohort block that does not belong to this policy is refused", () => {
  const mutate = (change: (data: typeof cohortsFixture.data) => void, request: Record<string, unknown> = cohortRequest) => {
    const envelope = cohortEnvelope();
    change(envelope.raw.data);
    return () => adaptToolResult(asText(envelope), request);
  };
  protocolError(mutate((d) => (d.cohorts.grid_share_sell[5] = 0.5)), /grid_share_sell\[5\] disagrees with the policy/);
  // State 403 (age 5, 26 mpg, $4.00, index 110) sells; a policy that keeps it no longer matches the block.
  protocolError(mutate((d) => {
    d.policy[402] = 1;
    delete d.summary.decision_breakdown;
  }), /grid_share_sell\[5\] disagrees with the policy/);
  protocolError(mutate((d) => (d.cohorts.ages[0] = 1)), /cohorts\.ages disagrees with grids\.age/);
  protocolError(mutate((d) => d.cohorts.fleet_share.pop()), /fleet_share does not have 11 entries/);
  protocolError(mutate((d) => (d.cohorts.fleet_share[0] = 0.5)), /fleet_share does not sum to 1/);
  protocolError(mutate((d) => (d.cohorts.replacement_hazard[6] = 1.7)), /replacement_hazard\[6\] is not a share/);
  protocolError(mutate((d) => (d.cohorts.annual_replacement_rate = "0.14")), /annual_replacement_rate is not a finite number/);
  protocolError(mutate((d) => (d.cohorts.mean_holding_years = -1)), /mean_holding_years/);
  protocolError(mutate((d) => (d.cohorts.projection.years = [0, 1, 2])), /projection\.years is not 1, 2, \.\.\., n/);
  protocolError(mutate((d) => (d.cohorts.caveats = [1])), /caveats is not a list of strings/);

  const shock = (change: (s: typeof cohortsFixture.data.cohorts.price_shock) => void) => mutate((d) => change(d.cohorts.price_shock));
  protocolError(shock((s) => (s.changed_states[0].from = "drive")), /changed_states\[0\]\.from disagrees with the policy/);
  protocolError(shock((s) => (s.changed_states[0].to = "sell")), /changed_states\[0\] does not change action/);
  protocolError(shock((s) => (s.changed_states[1].fuel_price = 4.5)), /changed_states\[1\]\.fuel_price disagrees with state 431/);
  protocolError(shock((s) => (s.changed_states[2].state_id = 403)), /changed_states\[2\]\.state_id is not a distinct state/);
  protocolError(shock((s) => (s.changed_states[0].to = "park")), /changed_states\[0\]\.to is not an action name/);
  protocolError(shock((s) => (s.states_changed = 4)), /states_changed does not count changed_states/);
  protocolError(shock((s) => (s.states_changed = 2)), /states_changed does not count changed_states/);
  protocolError(shock((s) => (s.states_changed = 2.5)), /states_changed is not a count of states/);
  // A list cut short must be marked, and the count must then exceed the rows listed.
  protocolError(shock((s) => s.changed_states.pop()), /states_changed does not count changed_states/);
  protocolError(shock((s) => Object.assign(s, { changed_states_truncated: true })), /states_changed does not count changed_states/);
  protocolError(shock((s) => (s.delta_price = 0)), /delta_price is zero/);
  protocolError(shock((s) => (s.first_year_rate = null)), /first_year_rate is not a finite number/);
});

test("a switching-state list cut short by the service is accepted when it says so, with the full count kept", () => {
  const envelope = cohortEnvelope();
  const shock = envelope.raw.data.cohorts.price_shock;
  shock.changed_states = shock.changed_states.slice(0, 2);
  Object.assign(shock, { changed_states_truncated: true });
  const parsed = adaptToolResult(asText(envelope), cohortRequest).data.cohorts?.price_shock;
  assert.equal(parsed?.states_changed, 3);
  assert.equal(parsed?.changed_states.length, 2);
  assert.equal(parsed?.changed_states_truncated, true);
  const whole = adaptToolResult(asText(cohortEnvelope()), cohortRequest).data.cohorts?.price_shock;
  assert.equal(whole && "changed_states_truncated" in whole, false);
  // A compaction that always writes the flag sends false for a complete list.
  const complete = cohortEnvelope();
  Object.assign(complete.raw.data.cohorts.price_shock, { changed_states_truncated: false });
  const read = adaptToolResult(asText(complete), cohortRequest).data.cohorts?.price_shock;
  assert.equal(read?.changed_states.length, 3);
  assert.equal(read && "changed_states_truncated" in read, false);
});

/**
 * A real 60ac78e run with 78 switching states (the most found inside the page's ranges), compacted by the
 * RR Toolbox API's Phase 1c compaction: 50 rows listed, `changed_states_truncated: true`, the full count kept.
 * This is the shape the API sends for such a run; the flag's name is the contract between the two repos.
 */
const truncatedFixture = JSON.parse(readFileSync(new URL("./fixtures/ados-truncated-switches-run.json", import.meta.url), "utf8"));

test("a 78-state switch list cut to 50 rows by the RR Toolbox API is read with the full count", () => {
  const envelope = { ...structuredClone(fixture.envelope), raw: { status: "success", data: structuredClone(truncatedFixture.data) } };
  const shock = adaptToolResult(asText(envelope), truncatedFixture.request).data.cohorts?.price_shock;
  assert.equal(shock?.states_changed, 78);
  assert.equal(shock?.changed_states.length, 50);
  assert.equal(shock?.changed_states_truncated, true);
  assert.equal(shock?.delta_price, 3_000);
  // Without the flag the same list is a protocol error: a shortened list must say so.
  delete envelope.raw.data.cohorts.price_shock.changed_states_truncated;
  protocolError(() => adaptToolResult(asText(envelope), truncatedFixture.request), /states_changed does not count changed_states/);
});

test("the run is checked against the request: price change, price and echoed inputs", () => {
  const run = (request: Record<string, unknown>) => () => adaptToolResult(asText(cohortEnvelope()), request);
  protocolError(run({ ...cohortRequest, price_shock: -1_000 }), /cohorts\.price_shock is for a different price change/);
  protocolError(run({ ...cohortRequest, price_shock: undefined }), /different price change/);
  protocolError(run({ ...cohortRequest, PriceNewCar: 45_000 }), /params\.PriceNewCar disagrees with the request/);
  protocolError(run({ ...cohortRequest, ReducedMiles: 12_000 }), /params\.ReducedMiles disagrees with the request/);
  protocolError(run({ ...cohortRequest, projection_years: 5 }), /params\.projection_years disagrees/);
  assert.doesNotThrow(run({ ...cohortRequest, PriceNewCar: 43_000, ReducedMiles: 8_000, d: 0.05 }));

  const noShock = cohortEnvelope();
  delete noShock.raw.data.cohorts.price_shock;
  assert.doesNotThrow(() => adaptToolResult(asText(noShock), { cohorts: true }));
  protocolError(() => adaptToolResult(asText(noShock), cohortRequest), /price_shock is missing for the price change asked for/);

  const shiftedPrice = cohortEnvelope();
  shiftedPrice.raw.data.cohorts.price_shock.price_new_car = 44_500;
  protocolError(() => adaptToolResult(asText(shiftedPrice), { ...cohortRequest, PriceNewCar: 43_000 }), /not the requested price plus the change/);
});

test("actionlabels and policy_index_base must describe the policy encoding the page reads", () => {
  const relabelled = cohortEnvelope();
  relabelled.raw.data.actionlabels = ["sell", "drive", "reduce"];
  protocolError(() => adaptToolResult(asText(relabelled)), /actionlabels is not \[drive, sell, reduce\]/);
  const zeroBased = cohortEnvelope();
  zeroBased.raw.data.policy_index_base = 0;
  protocolError(() => adaptToolResult(asText(zeroBased)), /policy_index_base is not 1/);
});

test("a cohort block rounded to two decimals by a future compaction is still accepted", () => {
  const envelope = cohortEnvelope();
  const c = envelope.raw.data.cohorts;
  const r = (x: number | null) => (x === null ? null : Math.round(x * 100) / 100);
  c.fleet_share = c.fleet_share.map(r);
  c.grid_share_sell = c.grid_share_sell.map(r);
  c.replacement_hazard = c.replacement_hazard.map(r);
  assert.doesNotThrow(() => adaptToolResult(asText(envelope), cohortRequest));
});
