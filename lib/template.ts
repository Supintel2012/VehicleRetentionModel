import type { Field, FieldOption, Template } from "./types";

/**
 * The assumption fields of the analyst demo, and their mapping to the
 * solve request.
 *
 * "Owner profile" sets five ADOS 2026 v1c parameters; each default is the
 * engine's own default (ModelInputs), so "Reset to defaults" reproduces the
 * published default run. "Vehicle to inspect"
 * picks one state of the default grid for the `query_state` lookup; its
 * fields offer exactly the grid levels, so nothing is snapped silently. Every
 * range here must also pass lib/solve-input.ts (a test checks both ends).
 */

/** Levels of the engine's default state grid, which this page never changes. */
export const DEFAULT_GRID = {
  age: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  mpg: [26, 28, 30, 32],
  fuel: [4, 4.5, 5, 5.5, 6],
  econ: [90, 100, 110, 120],
} as const;

const options = (values: readonly number[], label: (value: number) => string): FieldOption[] =>
  values.map((value) => ({ value, label: label(value) }));

/** The top age level stands for that age or older. */
export function ageLabel(age: number, topAge: number = DEFAULT_GRID.age[DEFAULT_GRID.age.length - 1]): string {
  if (age >= topAge) return `${age} or older`;
  return `${age} ${age === 1 ? "year" : "years"}`;
}

const OWNER_FIELDS: Field[] = [
  {
    id: "std_miles",
    type: "number",
    prompt: "Standard annual miles",
    help: "Miles a year when the owner keeps driving as usual.",
    min: 5_000,
    max: 30_000,
    step: 500,
    default: 15_000,
    unit: "miles",
    paramKey: "StdMiles",
  },
  {
    id: "reduced_miles",
    type: "number",
    prompt: "Reduced annual miles",
    help: "Miles a year if the owner cuts back.",
    min: 2_000,
    max: 15_000,
    step: 500,
    // 12,000 at AEG's request (May 2026); the engine's own default is 8,000.
    default: 12_000,
    unit: "miles",
    paramKey: "ReducedMiles",
  },
  {
    id: "new_car_price",
    type: "number",
    prompt: "New-vehicle price",
    min: 20_000,
    max: 80_000,
    step: 1_000,
    default: 43_000,
    unit: "$",
    paramKey: "PriceNewCar",
  },
  {
    id: "fixed_cost",
    type: "number",
    prompt: "Insurance and property tax",
    help: "Per year.",
    min: 1_000,
    max: 6_000,
    step: 100,
    default: 2_500,
    unit: "$",
    paramKey: "FixedCost",
  },
  {
    id: "discount_rate",
    type: "number",
    prompt: "Annual discount rate",
    min: 1,
    max: 15,
    step: 0.5,
    default: 5,
    unit: "%",
    paramKey: "d.scaled_pct",
  },
];

const VEHICLE_FIELDS: Field[] = [
  {
    id: "vehicle_age",
    type: "select",
    prompt: "Vehicle age",
    options: options(DEFAULT_GRID.age, (age) => ageLabel(age)),
    min: 0,
    max: 10,
    step: 1,
    default: 5,
    paramKey: "query_state.age",
  },
  {
    id: "vehicle_mpg",
    type: "select",
    prompt: "Fuel economy",
    options: options(DEFAULT_GRID.mpg, (mpg) => `${mpg} mpg`),
    min: 26,
    max: 32,
    step: 2,
    default: 28,
    paramKey: "query_state.fuel_economy",
  },
  {
    id: "fuel_price_now",
    type: "select",
    prompt: "Fuel price",
    options: options(DEFAULT_GRID.fuel, (price) => `$${price.toFixed(2)} a gallon`),
    min: 4,
    max: 6,
    step: 0.5,
    default: 5.5,
    paramKey: "query_state.fuel_price",
  },
  {
    id: "econ_now",
    type: "select",
    prompt: "Economic index",
    help: "Higher values represent stronger economic conditions.",
    options: options(DEFAULT_GRID.econ, String),
    min: 90,
    max: 120,
    step: 10,
    default: 100,
    paramKey: "query_state.econ_condition",
  },
];

export const VEHICLE_RETENTION_TEMPLATE: Template = {
  name: "Auto Drive-or-Sell™ · ADOS 2026 v1c",
  steps: [
    { id: "owner", title: "Owner profile", questions: OWNER_FIELDS },
    {
      id: "vehicle",
      title: "Vehicle to inspect",
      intro: "One state of the model's grid, used for the recommendation and outlined on the policy map.",
      questions: VEHICLE_FIELDS,
    },
  ],
  // Worked example the route tests send. Its economic index (95) lies between
  // two grid levels on purpose: the engine matches it to the nearest level,
  // and a tie goes to the lower one (90).
  sample_answers: {
    vehicle_age: 7,
    vehicle_mpg: 28,
    fuel_price_now: 5.5,
    econ_now: 95,
    std_miles: 15000,
    reduced_miles: 12000,
    new_car_price: 43000,
    fixed_cost: 2500,
    discount_rate: 5,
  },
};

export type Answers = Record<string, number>;

/** Every field at its default value. */
export function defaultAnswers(template: Template = VEHICLE_RETENTION_TEMPLATE): Answers {
  const answers: Answers = {};
  for (const group of template.steps) {
    for (const field of group.questions) if (field.default !== undefined) answers[field.id] = field.default;
  }
  return answers;
}

/** Build the JSON request body for the solve route from the field values. */
export function buildSolveBody(
  template: Template,
  answers: Record<string, string | number | boolean>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const queryState: Record<string, number> = {};

  for (const step of template.steps) {
    for (const q of step.questions) {
      if (!q.paramKey) continue;
      const raw = answers[q.id];
      if (raw === undefined || raw === "") continue;
      const value = typeof raw === "string" ? Number(raw) : raw;

      if (q.paramKey === "d.scaled_pct" && typeof value === "number") {
        body.d = value / 100;
        continue;
      }
      if (q.paramKey.startsWith("query_state.")) {
        const key = q.paramKey.slice("query_state.".length);
        queryState[key] = Number(value);
        continue;
      }
      body[q.paramKey] = value;
    }
  }

  if (Object.keys(queryState).length === 4) {
    body.query_state = queryState;
  }
  return body;
}

/** Years in the cohort projection the page asks for; its cumulative elasticity covers these years. */
export const PROJECTION_YEARS = 10;

/**
 * The page's solve request: the panel's values plus the cohort output and,
 * for a non-zero price change, the price-shock comparison. One request serves
 * every tab.
 */
export function buildRunBody(answers: Answers, priceShock: number): Record<string, unknown> {
  return {
    ...buildSolveBody(VEHICLE_RETENTION_TEMPLATE, answers),
    cohorts: true,
    projection_years: PROJECTION_YEARS,
    ...(priceShock !== 0 ? { price_shock: priceShock } : {}),
  };
}
