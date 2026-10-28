import assert from "node:assert/strict";
import { test } from "node:test";
import { decimal, MINUS, percent, signedPercent } from "./format.ts";

test("percent writes negatives with the minus sign and never shows a negative zero", () => {
  assert.equal(percent(0.14391, 2), "14.39%");
  assert.equal(percent(-0.0025, 2), `${MINUS}0.25%`);
  assert.equal(percent(-0, 2), "0.00%");
  assert.equal(percent(-0.00001, 2), "0.00%");
  assert.equal(percent(-1e-12, 1), "0.0%");
  assert.equal(percent(null), "–");
  assert.equal(percent(Number.NaN), "–");
});

test("signed figures keep their conventions", () => {
  assert.equal(signedPercent(-0.106), `${MINUS}0.11%`);
  assert.equal(signedPercent(0.0001), "0.00%");
  assert.equal(decimal(-0.0459, 4), `${MINUS}0.0459`);
  assert.equal(decimal(-0.00001), "0.000");
});
