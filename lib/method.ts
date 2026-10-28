/**
 * The parameter table and the yearly-value description on the Method tab.
 *
 * Values come from the engine's `params` echo when the response has one.
 * Otherwise the five panel inputs come from the request and every other
 * value is the ADOS 2026 v1c default (RRToolbox templates/AutoDriveOrSell.py,
 * ModelInputs), and the page says so. No value is calibrated.
 */

/** ADOS 2026 v1c defaults (ModelInputs in the RR Toolbox engine). */
export const ADOS_DEFAULTS = {
  StdMiles: 15_000,
  ReducedMiles: 8_000,
  MilesThreshold: 12_000,
  DecayFraction: 0.25,
  RepairBase: 0.03,
  RepairGrowth: 0.15,
  FixedCost: 2_500,
  PriceNewCar: 43_000,
  TransactionCostFrac: 0.06,
  FinancingCost: 2_400,
  SalvageFraction: 0.12,
  EnjoyBase: 4,
  EnjoyHalfLife: 6,
  p_fuel_down: 0.25,
  p_fuel_stay: 0.5,
  p_fuel_up: 0.25,
  p_econ_down: 0.2,
  p_econ_stay: 0.6,
  p_econ_up: 0.2,
  p_mpg_down: 0.1,
  p_mpg_stay: 0.85,
  p_mpg_up: 0.05,
  g: 0,
  d: 0.05,
} as const;

export type ParameterKey = keyof typeof ADOS_DEFAULTS;
export type ParameterValues = Record<ParameterKey, number>;

/** The inputs the assumptions panel sets. */
export const PANEL_KEYS = ["StdMiles", "ReducedMiles", "PriceNewCar", "FixedCost", "d"] as const satisfies readonly ParameterKey[];

export interface ResolvedParameters {
  values: ParameterValues;
  /** True when the values are the engine's own echo of the run. */
  echoed: boolean;
}

export function resolveParameters(
  params: Record<string, number> | undefined,
  request: Record<string, unknown>,
): ResolvedParameters {
  const values: ParameterValues = { ...ADOS_DEFAULTS };
  const keys = Object.keys(ADOS_DEFAULTS) as ParameterKey[];
  if (params) {
    for (const key of keys) if (typeof params[key] === "number") values[key] = params[key];
    return { values, echoed: true };
  }
  for (const key of PANEL_KEYS) {
    const sent = request[key];
    if (typeof sent === "number" && Number.isFinite(sent)) values[key] = sent;
  }
  return { values, echoed: false };
}

export type Provenance = "Assumed" | "Illustrative";

export interface ParameterRow {
  label: string;
  value: string;
  unit: string;
  /** Assumed: set in the panel for this demonstration. Illustrative: an ADOS 2026 v1c default. */
  provenance: Provenance;
}

const money = (x: number, digits = 0) =>
  `$${x.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const count = (x: number) => x.toLocaleString("en-US");
const pct = (x: number) => `${Number((x * 100).toFixed(2))}%`;

interface RowSpec {
  keys: ParameterKey[];
  label: string;
  unit: string;
  format: (values: number[]) => string;
}

const ROWS: RowSpec[] = [
  { keys: ["StdMiles"], label: "Standard annual miles", unit: "miles a year", format: ([x]) => count(x) },
  { keys: ["ReducedMiles"], label: "Reduced annual miles", unit: "miles a year", format: ([x]) => count(x) },
  { keys: ["EnjoyBase"], label: "Driving enjoyment of a new vehicle", unit: "$ a mile", format: ([x]) => money(x, 2) },
  { keys: ["EnjoyHalfLife"], label: "Age at which enjoyment per mile has halved", unit: "years", format: ([x]) => count(x) },
  { keys: ["MilesThreshold"], label: "Mileage above which enjoyment per mile tapers", unit: "miles a year", format: ([x]) => count(x) },
  { keys: ["DecayFraction"], label: "Largest taper of enjoyment per mile", unit: "share", format: ([x]) => pct(x) },
  { keys: ["RepairBase"], label: "Repair cost of a new vehicle", unit: "$ a mile", format: ([x]) => money(x, 2) },
  { keys: ["RepairGrowth"], label: "Growth of repair cost per year of age", unit: "a year", format: ([x]) => pct(x) },
  { keys: ["FixedCost"], label: "Insurance and property tax", unit: "$ a year", format: ([x]) => money(x) },
  { keys: ["PriceNewCar"], label: "New-vehicle price", unit: "$", format: ([x]) => money(x) },
  { keys: ["TransactionCostFrac"], label: "Transaction cost of a purchase", unit: "share of price", format: ([x]) => pct(x) },
  { keys: ["FinancingCost"], label: "Financing cost of a purchase", unit: "$", format: ([x]) => money(x) },
  { keys: ["SalvageFraction"], label: "Trade-in value of a new vehicle", unit: "share of price", format: ([x]) => pct(x) },
  {
    keys: ["p_fuel_down", "p_fuel_stay", "p_fuel_up"],
    label: "Fuel price next year: one level down / same / one level up",
    unit: "probability",
    format: (xs) => xs.map(pct).join(" / "),
  },
  {
    keys: ["p_econ_down", "p_econ_stay", "p_econ_up"],
    label: "Economic index next year: one level down / same / one level up",
    unit: "probability",
    format: (xs) => xs.map(pct).join(" / "),
  },
  {
    keys: ["p_mpg_down", "p_mpg_stay", "p_mpg_up"],
    label: "Fuel economy of a kept vehicle next year: one level down / same / one level up",
    unit: "probability",
    format: (xs) => xs.map(pct).join(" / "),
  },
  { keys: ["d"], label: "Annual discount rate", unit: "a year", format: ([x]) => pct(x) },
  { keys: ["g"], label: "Growth rate in the discount factor", unit: "a year", format: ([x]) => pct(x) },
];

export function parameterRows(values: ParameterValues): ParameterRow[] {
  return ROWS.map((row) => ({
    label: row.label,
    value: row.format(row.keys.map((key) => values[key])),
    unit: row.unit,
    provenance: row.keys.every((key) => (PANEL_KEYS as readonly string[]).includes(key)) ? "Assumed" : "Illustrative",
  }));
}

/**
 * Multiplier on enjoyment per mile at an annual mileage (the engine's
 * _mileage_enjoyment_decay): 1 up to the threshold, then a logistic taper
 * toward 1 - decayFraction that is half way there at the standard mileage.
 */
export function enjoymentTaper(miles: number, stdMiles: number, threshold: number, decayFraction: number): number {
  const fraction = Math.min(Math.max(decayFraction, 0), 1);
  if (fraction === 0 || miles <= threshold) return 1;
  let span = stdMiles - threshold;
  if (span <= 0) span = threshold > 0 ? threshold : stdMiles;
  const k = Math.log(3) / span;
  const logistic = 2 / (1 + Math.exp(-k * (miles - threshold))) - 1;
  return 1 - fraction * logistic;
}

export interface YearlyValueTerms {
  /** Mean of the economic-index grid: the index at which enjoyment and purchase cost are unscaled. */
  econMean: number;
  topAge: number;
  topMpg: number;
  /** Enjoyment multiplier at the standard and at the reduced mileage. */
  stdTaper: number;
  reducedTaper: number;
  /** Depreciation charged in every year the vehicle is kept. */
  depreciation: number;
  /** Trade-in value at age 0 (it falls in a straight line to 0 at the top age). */
  tradeInNew: number;
  /** Price plus transaction and financing cost of the new vehicle, at the mean economic index. */
  purchaseCost: number;
}

export function yearlyValueTerms(values: ParameterValues, grids: { age: number[]; mpg: number[]; econ: number[] }): YearlyValueTerms {
  const topAge = Math.max(...grids.age);
  return {
    econMean: grids.econ.reduce((sum, x) => sum + x, 0) / grids.econ.length,
    topAge,
    topMpg: Math.max(...grids.mpg),
    stdTaper: enjoymentTaper(values.StdMiles, values.StdMiles, values.MilesThreshold, values.DecayFraction),
    reducedTaper: enjoymentTaper(values.ReducedMiles, values.StdMiles, values.MilesThreshold, values.DecayFraction),
    depreciation: (values.PriceNewCar * (1 - values.SalvageFraction)) / topAge,
    tradeInNew: values.PriceNewCar * values.SalvageFraction,
    purchaseCost: values.PriceNewCar * (1 + values.TransactionCostFrac) + values.FinancingCost,
  };
}
