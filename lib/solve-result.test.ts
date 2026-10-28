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
