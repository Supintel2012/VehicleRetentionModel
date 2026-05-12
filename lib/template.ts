import type { Template } from "./types";

/**
 * Vehicle Retention wizard template.
 *
 * Maps interview answers onto ADOS 2026 v1c parameters. The "your vehicle"
 * step also drives the post-solve `query_state` lookup, so the user gets a
 * recommended action for their specific (age, mpg, fuel price, econ) point.
 */
export const VEHICLE_RETENTION_TEMPLATE: Template = {
  slug: "vehicle_retention",
  name: "Vehicle Retention Model",
  category: "ADOS 2026 v1c · Auto Drive-or-Sell™",
  summary:
    "Rapid Recursive® sequential decision model for drive, sell, or reduce choices across new-vehicle costs, fuel economy, fuel prices, and economic conditions (ADOS 2026 v1c).",
  horizon: "Sequential vehicle retention (infinite horizon)",
  default_state_count: 880,
  steps: [
    {
      id: "vehicle",
      title: "Your vehicle",
      intro: "Tell us about the car you're deciding what to do with.",
      questions: [
        {
          id: "vehicle_age",
          type: "scale",
          prompt: "How old is the vehicle?",
          help: "0 = brand new, 10 = oldest on the default grid.",
          min: 0,
          max: 10,
          default: 5,
          unit: "years",
          required: true,
          paramKey: "query_state.age",
        },
        {
          id: "vehicle_mpg",
          type: "number",
          prompt: "What's its real-world fuel economy?",
          help: "Average mpg across your typical driving.",
          min: 26,
          max: 32,
          step: 0.5,
          default: 28,
          unit: "mpg",
          required: true,
          paramKey: "query_state.fuel_economy",
        },
      ],
    },
    {
      id: "market",
      title: "Market conditions",
      intro: "Where fuel prices and the broader economy currently sit.",
      questions: [
        {
          id: "fuel_price_now",
          type: "number",
          prompt: "What's gas costing right now?",
          min: 4.0,
          max: 6.0,
          step: 0.1,
          default: 5.5,
          unit: "$/gal",
          required: true,
          paramKey: "query_state.fuel_price",
        },
        {
          id: "econ_now",
          type: "scale",
          prompt: "Economic conditions index",
          help: "100 = normal · <100 weakening · >100 strong.",
          min: 90,
          max: 120,
          default: 100,
          required: true,
          paramKey: "query_state.econ_condition",
        },
      ],
    },
    {
      id: "assumptions",
      title: "Cost assumptions",
      intro:
        "Override the ADOS 2026 v1c defaults if your situation is different. Skip if you trust the defaults.",
      questions: [
        {
          id: "std_miles",
          type: "number",
          prompt: "Annual miles if you drive normally",
          min: 5000,
          max: 30000,
          step: 500,
          default: 15000,
          unit: "mi/yr",
          paramKey: "StdMiles",
        },
        {
          id: "reduced_miles",
          type: "number",
          prompt: "Annual miles if you cut back",
          min: 2000,
          max: 15000,
          step: 500,
          default: 12000,
          unit: "mi/yr",
          paramKey: "ReducedMiles",
        },
        {
          id: "new_car_price",
          type: "currency",
          prompt: "Replacement vehicle sticker price",
          min: 20000,
          max: 80000,
          step: 1000,
          default: 43000,
          unit: "$",
          paramKey: "PriceNewCar",
        },
        {
          id: "fixed_cost",
          type: "currency",
          prompt: "Annual insurance + property tax",
          min: 1000,
          max: 6000,
          step: 100,
          default: 2500,
          unit: "$/yr",
          paramKey: "FixedCost",
        },
        {
          id: "discount_rate",
          type: "scale",
          prompt: "Annual discount rate (×100)",
          help: "5 means a 5% personal discount rate.",
          min: 0,
          max: 15,
          default: 5,
          paramKey: "d.scaled_pct",
        },
      ],
    },
  ],
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

/** Build the JSON request body the proxy will forward to the API. */
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
