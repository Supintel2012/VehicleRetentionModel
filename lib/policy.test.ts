import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  actionAt,
  ageText,
  dimensionEffects,
  dimensionSentence,
  econRuleText,
  gridShareByAge,
  replacementAgeIndex,
  replacementRuleByEcon,
  sliceAgeByEcon,
  sliceAgeByMpg,
  sliceSentence,
  type PolicyGrid,
} from "./policy.ts";
import { adaptSolveData, stateIndex } from "./solve-result.ts";

/** Engine output at the defaults with cohorts (see the fixture's "source"). */
const fixture = JSON.parse(readFileSync(new URL("./fixtures/ados-cohorts-run.json", import.meta.url), "utf8"));
const data = adaptSolveData(fixture.data);

// Grid indices: mpg 26/28/30/32 -> 0..3, fuel $4.00..$6.00 -> 0..4, econ 90..120 -> 0..3.
const MPG28 = 1;
const FUEL4 = 0;
const FUEL550 = 3;

/** A policy built from a rule on (age, mpg, fuel, econ) indices, on the default grid. */
function synthetic(rule: (ia: number, im: number, ifu: number, ie: number) => 1 | 2 | 3): PolicyGrid {
  const policy: number[] = [];
  for (let ia = 0; ia < 11; ia++)
    for (let im = 0; im < 4; im++)
      for (let ifu = 0; ifu < 5; ifu++) for (let ie = 0; ie < 4; ie++) policy.push(rule(ia, im, ifu, ie));
  return { policy, dims: data.dims, grids: data.grids };
}

test("slices read the policy with the engine's index order", () => {
  const byEcon = sliceAgeByEcon(data, MPG28, FUEL550);
  assert.equal(byEcon.length, 11);
  assert.equal(byEcon[0].length, 4);
  // Column = economic index 90, 100, 110, 120; at 28 mpg and $5.50 replacement starts at 7, 6, 5, 5.
  assert.deepEqual(byEcon.map((row) => row.map((a) => a[0]).join("")), [
    "dddd", "dddd", "dddd", "dddd", "dddd", "ddss", "dsss", "ssss", "ssss", "ssss", "ssss",
  ]);
  const byMpg = sliceAgeByMpg(data, 2, FUEL550); // economic index 110
  assert.deepEqual(byMpg.map((row) => row.map((a) => a[0]).join("")).slice(4, 8), ["dddd", "ssdd", "ssss", "ssss"]);
  // Every cell agrees with the flat policy at stateIndex.
  for (let ia = 0; ia < 11; ia++) {
    for (let ie = 0; ie < 4; ie++) {
      const s = stateIndex(data.dims, ia, MPG28, FUEL550, ie);
      assert.equal(byEcon[ia][ie], data.summary.actions[data.policy[s] - 1]);
      assert.equal(actionAt(data, ia, MPG28, FUEL550, ie), byEcon[ia][ie]);
    }
  }
});

test("the replacement rule by economic index is read from the policy (7 / 6 / 5-6 / 5 at the defaults)", () => {
  assert.deepEqual(replacementRuleByEcon(data), [
    { econ: 90, youngest: 7, oldest: 7, neverSells: 0, combinations: 20 },
    { econ: 100, youngest: 6, oldest: 6, neverSells: 0, combinations: 20 },
    { econ: 110, youngest: 5, oldest: 6, neverSells: 0, combinations: 20 },
    { econ: 120, youngest: 5, oldest: 5, neverSells: 0, combinations: 20 },
  ]);
  const [r90, , r110] = replacementRuleByEcon(data);
  assert.equal(econRuleText(r90, 10), "replaced from age 7");
  assert.equal(econRuleText(r110, 10), "replaced from age 5 or 6, depending on fuel economy and fuel price");
  assert.equal(econRuleText({ econ: 90, youngest: null, oldest: null, neverSells: 20, combinations: 20 }, 10), "never replaced on this grid");
  assert.equal(
    econRuleText({ econ: 90, youngest: 9, oldest: 10, neverSells: 3, combinations: 20 }, 10),
    "replaced from age 9 or 10 or older, depending on fuel economy and fuel price; never replaced in 3 of 20 fuel-economy and fuel-price combinations",
  );
  assert.equal(replacementAgeIndex(data, MPG28, FUEL4, 2), 6);
  assert.equal(replacementAgeIndex(data, MPG28, FUEL550, 2), 5);
});

test("the dimension sentence counts how often each condition changes the replacement age", () => {
  assert.deepEqual(dimensionEffects(data), [
    { dimension: "econ", changed: 20, combinations: 20 },
    { dimension: "mpg", changed: 5, combinations: 20 },
    { dimension: "fuel", changed: 1, combinations: 16 },
  ]);
  assert.equal(
    dimensionSentence(data),
    "Across the grid, the economic index changes the age at which replacement starts in 20 of 20 combinations of fuel economy and fuel price; " +
      "fuel economy changes it in only 5 of 20 combinations of fuel price and economic index; " +
      "and fuel price changes it in only 1 of 16 combinations of fuel economy and economic index.",
  );
});

test("the dimension sentence orders conditions by how often they matter and handles corner cases", () => {
  // Selling from age 3 when fuel is $5.50 or more, otherwise from age 6: only fuel price matters.
  const fuelDriven = synthetic((ia, _im, ifu) => (ia >= (ifu >= 3 ? 3 : 6) ? 2 : 1));
  assert.equal(
    dimensionSentence(fuelDriven),
    "Across the grid, fuel price changes the age at which replacement starts in 16 of 16 combinations of fuel economy and economic index; " +
      "the economic index never changes it (0 of 20 combinations of fuel economy and fuel price); " +
      "and fuel economy never changes it (0 of 20 combinations of fuel price and economic index).",
  );
  assert.equal(
    dimensionSentence(synthetic(() => 1)),
    "Selling is never optimal on this grid, so no condition changes the age at which replacement starts.",
  );
  assert.equal(
    dimensionSentence(synthetic((ia) => (ia >= 4 ? 2 : 1))),
    "The age at which replacement starts is the same in every combination of fuel economy, fuel price and economic index.",
  );
  // Never selling at one level and selling at another counts as a change.
  const neverAt90 = synthetic((ia, _im, _ifu, ie) => (ie > 0 && ia >= 6 ? 2 : 1));
  assert.deepEqual(dimensionEffects(neverAt90)[0], { dimension: "econ", changed: 20, combinations: 20 });
});

test("the slice sentence names the replacement age at each column, grouped", () => {
  assert.equal(
    sliceSentence(data, "econ", MPG28, FUEL550),
    "At 28 mpg and $5.50 a gallon, replacement starts at age 7 at economic index 90, age 6 at 100, and age 5 at 110 and 120.",
  );
  assert.equal(
    sliceSentence(data, "econ", MPG28, FUEL4),
    "At 28 mpg and $4.00 a gallon, replacement starts at age 7 at economic index 90, age 6 at 100 and 110, and age 5 at 120.",
  );
  assert.equal(
    sliceSentence(data, "mpg", 2, FUEL550),
    "At economic index 110 and $5.50 a gallon, replacement starts at age 5 at 26 and 28 mpg and age 6 at 30 and 32 mpg.",
  );
  assert.equal(
    sliceSentence(data, "mpg", 1, FUEL550),
    "At economic index 100 and $5.50 a gallon, replacement starts at age 6 at every fuel-economy level.",
  );
  const neverAt90 = synthetic((ia, _im, _ifu, ie) => (ie > 0 && ia >= 6 ? 2 : 1));
  assert.equal(
    sliceSentence(neverAt90, "econ", MPG28, FUEL550),
    "At 28 mpg and $5.50 a gallon, replacement starts at age 6 at economic index 100, 110 and 120; selling is never optimal at economic index 90.",
  );
  assert.equal(
    sliceSentence(synthetic(() => 1), "mpg", 0, 0),
    "At economic index 90 and $4.00 a gallon, selling is not optimal at any fuel-economy level or age.",
  );
  const topOnly = synthetic((ia) => (ia === 10 ? 2 : 1));
  assert.equal(
    sliceSentence(topOnly, "econ", 0, 0),
    "At 26 mpg and $4.00 a gallon, replacement starts at age 10 or older at every economic-index level.",
  );
  assert.equal(ageText(data, 10), "age 10 or older");
  assert.equal(ageText(data, 3), "age 3");
});

test("equal-weight shares count sell states per age (28/80 and 60/80) and match the engine's grid_share_sell", () => {
  const shares = gridShareByAge(data);
  assert.deepEqual(shares[5], { age: 5, sellStates: 28, states: 80, share: 0.35 });
  assert.deepEqual(shares[6], { age: 6, sellStates: 60, states: 80, share: 0.75 });
  assert.deepEqual(shares.map((s) => s.sellStates), [0, 0, 0, 0, 0, 28, 60, 80, 80, 80, 80]);
  assert.equal(shares.reduce((sum, s) => sum + s.sellStates, 0), 408);
  assert.deepEqual(shares.map((s) => s.share), data.cohorts?.grid_share_sell);
});
