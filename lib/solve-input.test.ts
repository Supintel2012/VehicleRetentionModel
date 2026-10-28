import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSolveBody, VEHICLE_RETENTION_TEMPLATE } from "./template.ts";
import { parseSolveRequest, SolveInputError } from "./solve-input.ts";

const template = VEHICLE_RETENTION_TEMPLATE;

function defaultAnswers() {
  const answers: Record<string, string | number | boolean> = {};
  for (const step of template.steps) {
    for (const q of step.questions) if (q.default !== undefined) answers[q.id] = q.default;
  }
  return answers;
}

function rejects(body: unknown, message: RegExp) {
  assert.throws(() => parseSolveRequest(body), (error: unknown) => {
    assert.ok(error instanceof SolveInputError, "expected SolveInputError");
    assert.match(error.message, message);
    return true;
  });
}

test("the panel's default values pass and map to exactly the expected parameters", () => {
  assert.deepEqual(parseSolveRequest(buildSolveBody(template, defaultAnswers())), {
    StdMiles: 15_000,
    ReducedMiles: 12_000,
    PriceNewCar: 43_000,
    FixedCost: 2_500,
    d: 0.05,
    query_state: { age: 5, fuel_economy: 28, fuel_price: 5.5, econ_condition: 100 },
  });
});

test("the wizard's sample answers pass, including an off-grid economic index", () => {
  assert.deepEqual(parseSolveRequest(buildSolveBody(template, template.sample_answers)), {
    StdMiles: 15_000,
    ReducedMiles: 12_000,
    PriceNewCar: 43_000,
    FixedCost: 2_500,
    d: 0.05,
    query_state: { age: 7, fuel_economy: 28, fuel_price: 5.5, econ_condition: 95 },
  });
});

test("an empty body runs the engine defaults; cleared cost fields are simply omitted", () => {
  assert.deepEqual(parseSolveRequest({}), {});
  const answers = { ...defaultAnswers(), reduced_miles: "", new_car_price: "" };
  const parsed = parseSolveRequest(buildSolveBody(template, answers));
  assert.equal("ReducedMiles" in parsed, false);
  assert.equal("PriceNewCar" in parsed, false);
  assert.equal(parsed.StdMiles, 15_000);
});

test("every slider and number range the wizard offers is accepted at both ends and rejected just outside", () => {
  // Each end of a mileage range is tried with the other mileage at the end that keeps reduced below standard.
  const partner: Record<string, Record<string, number>> = { std_miles: { reduced_miles: 2_000 }, reduced_miles: { std_miles: 30_000 } };
  for (const step of template.steps) {
    for (const q of step.questions) {
      const { id, min, max, paramKey } = q;
      if (!paramKey || min === undefined || max === undefined) continue;
      const increment = q.step ?? 1;
      const body = (value: number) => buildSolveBody(template, { ...defaultAnswers(), ...partner[id], [id]: value });
      assert.doesNotThrow(() => parseSolveRequest(body(min)), `${id} = min`);
      assert.doesNotThrow(() => parseSolveRequest(body(max)), `${id} = max`);
      assert.throws(() => parseSolveRequest(body(min - increment)), /must be between/, `${id} below min`);
      assert.throws(() => parseSolveRequest(body(max + increment)), /must be between/, `${id} above max`);
    }
  }
});

test("reduced miles must be below standard miles, with the engine default standing in for a mileage left out", () => {
  rejects(
    { StdMiles: 5_000, ReducedMiles: 15_000 },
    /^Annual miles if you cut back \(15,000 miles\) must be less than annual miles if you drive normally \(5,000 miles\)\.$/,
  );
  rejects({ StdMiles: 10_000, ReducedMiles: 10_000 }, /must be less than/);
  // Left out, a mileage is the engine default: standard 15,000, reduced 8,000.
  rejects({ ReducedMiles: 15_000 }, /\(15,000 miles\) must be less than annual miles if you drive normally \(15,000 miles\)/);
  rejects({ StdMiles: 8_000 }, /\(8,000 miles\) must be less than annual miles if you drive normally \(8,000 miles\)/);
  assert.deepEqual(parseSolveRequest({ StdMiles: 5_000, ReducedMiles: 4_500 }), { StdMiles: 5_000, ReducedMiles: 4_500 });
  assert.deepEqual(parseSolveRequest({ ReducedMiles: 14_500 }), { ReducedMiles: 14_500 });
  assert.deepEqual(parseSolveRequest({ StdMiles: 8_500 }), { StdMiles: 8_500 });
});

test("grid-size, probability and output keys are rejected, never forwarded", () => {
  for (const key of ["nAge", "AgeMax", "nFuel", "p_fuel_up", "return_full_arrays", "include_state_table", "EnjoyBase", "stdmiles"]) {
    rejects({ StdMiles: 15_000, [key]: 1 }, new RegExp(`"${key}" is not an input this demo accepts`));
  }
  rejects(JSON.parse('{"__proto__": {"nAge": 99}}'), /"__proto__" is not an input/);
  rejects(
    { query_state: { age: 5, fuel_economy: 28, fuel_price: 5, econ_condition: 100, mpg_idx: 2 } },
    /"mpg_idx" is not a vehicle-state field/,
  );
  rejects({ ["x".repeat(500)]: 1 }, /^"x{40}…" is not an input/);
});

test("out-of-range values get a plain-language message with the allowed range", () => {
  rejects({ StdMiles: 4_999 }, /^Annual miles if you drive normally must be between 5,000 miles and 30,000 miles\.$/);
  rejects({ ReducedMiles: 15_001 }, /^Annual miles if you cut back must be between 2,000 miles and 15,000 miles\.$/);
  rejects({ PriceNewCar: 80_001 }, /^Replacement vehicle price must be between \$20,000 and \$80,000\.$/);
  rejects({ FixedCost: 999 }, /^Annual insurance \+ property tax must be between \$1,000 and \$6,000\.$/);
  rejects({ d: 5 }, /^Annual discount rate must be between 1% and 15%\.$/);
  rejects({ d: -0.01 }, /discount rate/);
  const state = { age: 5, fuel_economy: 28, fuel_price: 5, econ_condition: 100 };
  rejects({ query_state: { ...state, age: 11 } }, /^Vehicle age must be between 0 years and 10 years\.$/);
  rejects({ query_state: { ...state, fuel_economy: 25.9 } }, /^Fuel economy must be between 26 mpg and 32 mpg\.$/);
  rejects({ query_state: { ...state, fuel_price: 6.01 } }, /^Fuel price must be between \$4\.00 per gallon and \$6\.00 per gallon\.$/);
  rejects({ query_state: { ...state, econ_condition: 89 } }, /^Economic conditions index must be between 90 and 120\.$/);
});

test("a zero discount rate is refused: beta = 1 never converges, so the solve would only time out", () => {
  for (const d of [0, 0.005, 0.0099]) rejects({ d }, /^Annual discount rate must be between 1% and 15%\.$/);
  assert.deepEqual(parseSolveRequest({ d: 0.01 }), { d: 0.01 });
  assert.equal(parseSolveRequest(buildSolveBody(template, { ...defaultAnswers(), discount_rate: 1 })).d, 0.01);
  assert.throws(() => parseSolveRequest(buildSolveBody(template, { ...defaultAnswers(), discount_rate: 0 })), SolveInputError);
});

test("values must be finite JSON numbers", () => {
  rejects(JSON.parse('{"StdMiles": 1e999}'), /^Annual miles if you drive normally must be a number\.$/);
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, "15000", null, true, [15_000], { value: 15_000 }]) {
    rejects({ StdMiles: value }, /must be a number/);
  }
  rejects({ query_state: { age: "5", fuel_economy: 28, fuel_price: 5, econ_condition: 100 } }, /^Vehicle age must be a number\.$/);
});

test("the body and the vehicle state must be objects, and the state must be complete", () => {
  for (const body of [null, [], "StdMiles=15000", 15_000, true]) rejects(body, /^The request body must be a JSON object\.$/);
  rejects({ query_state: [7, 28, 5.5, 95] }, /vehicle state must include/);
  rejects({ query_state: { age: 7, fuel_economy: 28, fuel_price: 5.5 } }, /^Economic conditions index is required\.$/);
});

// ── Phase 2: fleet-output switches ──────────────────────────────────────────

test("the cohort switches pass: cohorts true/false, a whole-dollar price change within ±$3,000, 1-20 projection years", () => {
  assert.deepEqual(parseSolveRequest({ cohorts: true, price_shock: 1_000, projection_years: 10 }), {
    cohorts: true,
    price_shock: 1_000,
    projection_years: 10,
  });
  assert.deepEqual(parseSolveRequest({ cohorts: false }), { cohorts: false });
  for (const price_shock of [-3_000, -250, 0, 250, 3_000]) {
    assert.deepEqual(parseSolveRequest({ price_shock }), { price_shock });
  }
  for (const projection_years of [1, 20]) assert.deepEqual(parseSolveRequest({ projection_years }), { projection_years });
});

test("the page's own request (defaults plus cohorts and a +$1,000 change) maps to exactly these parameters", () => {
  const body = { ...buildSolveBody(template, defaultAnswers()), cohorts: true, price_shock: 1_000, projection_years: 10 };
  assert.deepEqual(parseSolveRequest(body), {
    StdMiles: 15_000,
    ReducedMiles: 12_000,
    PriceNewCar: 43_000,
    FixedCost: 2_500,
    d: 0.05,
    query_state: { age: 5, fuel_economy: 28, fuel_price: 5.5, econ_condition: 100 },
    cohorts: true,
    price_shock: 1_000,
    projection_years: 10,
  });
});

test("price changes and projection lengths outside their ranges, or not whole, are refused", () => {
  rejects({ price_shock: 3_001 }, /^New-vehicle price change must be between -\$3,000 and \$3,000\.$/);
  rejects({ price_shock: -3_250 }, /^New-vehicle price change must be between -\$3,000 and \$3,000\.$/);
  rejects({ price_shock: 0.5 }, /^New-vehicle price change must be a whole number of dollars\.$/);
  rejects({ price_shock: 1e-12 }, /whole number of dollars/);
  rejects({ projection_years: 0 }, /^Projection length must be between 1 year and 20 years\.$/);
  rejects({ projection_years: 21 }, /^Projection length must be between 1 year and 20 years\.$/);
  rejects({ projection_years: 50 }, /between 1 year and 20 years/);
  rejects({ projection_years: 2.5 }, /^Projection length must be a whole number of years\.$/);
});

test("the cohort switches must have the right JSON types", () => {
  for (const cohorts of ["true", 1, 0, null, {}]) rejects({ cohorts }, /^The cohort setting must be true or false\.$/);
  for (const price_shock of ["1000", null, true, Number.NaN, Number.POSITIVE_INFINITY]) {
    rejects({ price_shock }, /^New-vehicle price change must be a number\.$/);
  }
  rejects({ projection_years: "10" }, /^Projection length must be a number\.$/);
});

test("the engine's other cohort input, a starting fleet, is still refused, as are output flags next to cohorts", () => {
  rejects({ cohorts: true, fleet_age_distribution: Array(11).fill(1 / 11) }, /"fleet_age_distribution" is not an input this demo accepts/);
  rejects({ cohorts: true, return_full_arrays: true }, /"return_full_arrays" is not an input/);
  rejects({ cohorts: true, Cohorts: true }, /"Cohorts" is not an input/);
});
