import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ADOS_DEFAULTS, enjoymentTaper, PANEL_KEYS, parameterRows, resolveParameters, yearlyValueTerms } from "./method.ts";
import { buildSolveBody, defaultAnswers, VEHICLE_RETENTION_TEMPLATE } from "./template.ts";
import { adaptSolveData } from "./solve-result.ts";
import { decimal, dollars, MINUS, percent, signedDollars, signedPercent } from "./format.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/ados-cohorts-run.json", import.meta.url), "utf8"));
const data = adaptSolveData(fixture.data);

test("the ADOS 2026 v1c defaults written here match the engine's own params echo", () => {
  for (const [key, value] of Object.entries(ADOS_DEFAULTS)) {
    assert.equal(data.params?.[key], value, key);
  }
});

test("the panel's defaults are the engine's own defaults except reduced miles, which is AEG's 12,000", () => {
  const body = buildSolveBody(VEHICLE_RETENTION_TEMPLATE, defaultAnswers());
  for (const key of PANEL_KEYS) {
    assert.equal(body[key], key === "ReducedMiles" ? 12_000 : ADOS_DEFAULTS[key], key);
  }
  assert.equal(ADOS_DEFAULTS.ReducedMiles, 8_000, "the engine's own default, stated on the panel");
});

test("values come from the echo when present; otherwise the panel inputs from the request and defaults for the rest", () => {
  const echoed = resolveParameters({ ...data.params, ReducedMiles: 12_000 }, { ReducedMiles: 99 });
  assert.equal(echoed.echoed, true);
  assert.equal(echoed.values.ReducedMiles, 12_000, "the echo wins over the request");

  const fallback = resolveParameters(undefined, { StdMiles: 20_000, ReducedMiles: 12_000, d: 0.07, EnjoyBase: 9 });
  assert.equal(fallback.echoed, false);
  assert.equal(fallback.values.StdMiles, 20_000);
  assert.equal(fallback.values.ReducedMiles, 12_000);
  assert.equal(fallback.values.d, 0.07);
  assert.equal(fallback.values.EnjoyBase, 4, "only the panel's inputs are taken from the request");
  assert.equal(fallback.values.PriceNewCar, 43_000);
});

test("the parameter table tags the panel's inputs Assumed and the engine defaults Illustrative", () => {
  const rows = parameterRows(resolveParameters(undefined, { ReducedMiles: 12_000 }).values);
  const byLabel = Object.fromEntries(rows.map((row) => [row.label, row]));
  assert.deepEqual(byLabel["Reduced annual miles"], { label: "Reduced annual miles", value: "12,000", unit: "miles a year", provenance: "Assumed" });
  assert.deepEqual(byLabel["New-vehicle price"], { label: "New-vehicle price", value: "$43,000", unit: "$", provenance: "Assumed" });
  assert.equal(byLabel["Annual discount rate"].value, "5%");
  assert.equal(byLabel["Driving enjoyment of a new vehicle"].value, "$4.00");
  assert.equal(byLabel["Driving enjoyment of a new vehicle"].provenance, "Illustrative");
  assert.equal(byLabel["Fuel price next year: one level down / same / one level up"].value, "25% / 50% / 25%");
  assert.equal(byLabel["Fuel economy of a kept vehicle next year: one level down / same / one level up"].value, "10% / 85% / 5%");
  assert.equal(byLabel["Growth of repair cost per year of age"].value, "15%");
  assert.deepEqual(
    rows.filter((row) => row.provenance === "Assumed").map((row) => row.label),
    ["Standard annual miles", "Reduced annual miles", "Insurance and property tax", "New-vehicle price", "Annual discount rate"],
  );
});

test("the mileage taper follows the engine: none up to 12,000 miles, 87.5% of base enjoyment at the standard 15,000", () => {
  assert.equal(enjoymentTaper(12_000, 15_000, 12_000, 0.25), 1);
  assert.equal(enjoymentTaper(8_000, 15_000, 12_000, 0.25), 1);
  assert.ok(Math.abs(enjoymentTaper(15_000, 15_000, 12_000, 0.25) - 0.875) < 1e-12);
  assert.ok(enjoymentTaper(30_000, 15_000, 12_000, 0.25) > 0.75);
  assert.equal(enjoymentTaper(20_000, 15_000, 12_000, 0), 1);
});

test("the yearly-value terms are computed from the parameters and the grid", () => {
  const terms = yearlyValueTerms(resolveParameters(data.params, {}).values, data.grids);
  assert.equal(terms.econMean, 105);
  assert.equal(terms.topAge, 10);
  assert.equal(terms.topMpg, 32);
  assert.ok(Math.abs(terms.depreciation - 3_784) < 1e-9);
  assert.ok(Math.abs(terms.tradeInNew - 5_160) < 1e-9);
  assert.ok(Math.abs(terms.purchaseCost - 47_980) < 1e-9);
  assert.ok(Math.abs(terms.stdTaper - 0.875) < 1e-12);
  assert.equal(terms.reducedTaper, 1);
});

test("formatting: signs (a true minus sign), missing values and negative zero", () => {
  assert.equal(MINUS, "\u2212");
  assert.equal(percent(0.14391002, 2), "14.39%");
  assert.equal(percent(null), "–");
  assert.equal(signedPercent(-0.10671), `${MINUS}0.11%`);
  assert.equal(signedPercent(0.518), "+0.52%");
  assert.equal(signedPercent(-0.0001), "0.00%");
  assert.equal(decimal(-0.0458859), `${MINUS}0.046`);
  assert.equal(decimal(0.31), "0.310");
  assert.equal(decimal(-0.0001), "0.000");
  assert.equal(dollars(43_000), "$43,000");
  assert.equal(dollars(-250), `${MINUS}$250`);
  assert.equal(signedDollars(1_000), "+$1,000");
  assert.equal(signedDollars(-3_000), `${MINUS}$3,000`);
  assert.equal(signedDollars(0), "$0");
});
