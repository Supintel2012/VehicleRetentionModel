import assert from "node:assert/strict";
import { test } from "node:test";
import { fittedAxis, niceTicks } from "./chart-scale.ts";
import { percent } from "./format.ts";

const pct = (v: number) => percent(v, 2);

test("paths that are zero in every year get a readable axis from 0, with no repeated or negative labels", () => {
  const axis = fittedAxis(new Array(20).fill(0), pct, { minSpan: 0.005, floor: 0 });
  const labels = axis.ticks.map(pct);
  assert.equal(axis.lo, 0);
  assert.ok(axis.hi >= 0.005);
  assert.equal(new Set(labels).size, labels.length, labels.join(", "));
  assert.equal(labels.some((label) => label.startsWith("-") || label.startsWith("−")), false, labels.join(", "));
  assert.equal(labels[0], "0.00%");
});

test("a flat path at a non-zero rate gets a band around it, not a sliver of a basis point", () => {
  const axis = fittedAxis(new Array(10).fill(0.1439), pct, { minSpan: 0.005, floor: 0 });
  assert.ok(axis.hi - axis.lo >= 0.005 - 1e-12);
  assert.ok(axis.lo < 0.1439 && axis.hi > 0.1439);
  const labels = axis.ticks.map(pct);
  assert.equal(new Set(labels).size, labels.length, labels.join(", "));
  assert.ok(axis.ticks.length >= 2);
});

test("the default two paths are padded by a quarter of their span, every label distinct", () => {
  const values = [0.14391, 0.0993, 0.1301, 0.1452, 0.14391, 0.143756];
  const axis = fittedAxis(values, pct, { minSpan: 0.005, floor: 0 });
  const span = Math.max(...values) - Math.min(...values);
  assert.ok(Math.abs(axis.lo - (Math.min(...values) - span * 0.25)) < 1e-12);
  assert.ok(Math.abs(axis.hi - (Math.max(...values) + span * 0.25)) < 1e-12);
  const labels = axis.ticks.map(pct);
  assert.equal(new Set(labels).size, labels.length, labels.join(", "));
  assert.ok(axis.ticks.every((t) => t >= axis.lo && t <= axis.hi));
});

test("tick values are round, exactly zero at zero, and never negative zero", () => {
  assert.deepEqual(niceTicks(0, 1, 4), [0, 0.25, 0.5, 0.75, 1]);
  assert.deepEqual(niceTicks(-0.0021, 0.0042, 4), [-0.004, -0.002, 0, 0.002, 0.004]);
  const ticks = niceTicks(-0.3, 0.3, 6);
  assert.ok(ticks.includes(0), ticks.join(", "));
  assert.equal(ticks.some((t) => Object.is(t, -0)), false);
  assert.deepEqual(niceTicks(0.1, 0.3, 4), [0.1, 0.15, 0.2, 0.25, 0.3]);
});

test("without a minimum span, ticks finer than the labels' precision are thinned so no label repeats", () => {
  // A path between 0.100% and 0.102%: ticks every 0.001% would all read "0.10%".
  const axis = fittedAxis([0.001, 0.00102, 0.00101], pct);
  const labels = axis.ticks.map(pct);
  assert.ok(labels.length >= 1);
  assert.equal(new Set(labels).size, labels.length, labels.join(", "));
});
