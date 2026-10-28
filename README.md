# Vehicle Retention Model

Next.js analyst demo for the **Auto Drive-or-Sell™** decision model (**ADOS 2026 v1c**, Anderson Economic Group LLC with Supported Intelligence LLC). It runs the **Rapid Recursive®** sequential decision model through the RR Toolbox and asks one policy question: *when the price of a new vehicle changes, how does the timing of vehicle replacement change?*

> **This is a technology demonstration, not a forecast.** Contact **Supported Intelligence LLC** for licensing this model or adapting it to your needs: [support@supportedintelligence.com](mailto:support@supportedintelligence.com).

## Live demo

A working deployment is on **Vercel**: [https://vehicle-retention-model.vercel.app/](https://vehicle-retention-model.vercel.app/)

This build was pushed for the **[28th International Technical Conference on the Enhanced Safety of Vehicles (ESV)](https://tc.canada.ca/en/road-transportation/28th-international-technical-conference-enhanced-safety-vehicles-esv)** — co-hosted by Transport Canada and the National Highway Traffic Safety Administration, **May 12–15, 2026**, Toronto, Ontario.

Repository: [github.com/Supintel2012/VehicleRetentionModel](https://github.com/Supintel2012/VehicleRetentionModel)

## Screens

A persistent assumptions panel (owner profile: standard and reduced miles, new-vehicle price, insurance and property tax, discount rate 1–15%; a vehicle to inspect, chosen from the grid levels; reset to defaults) drives six tabs. A typed value is used when the field is left or Enter is pressed (Escape restores the value in use), and reduced miles must stay below standard miles. Each tab is deep-linkable as `?tab=<id>` or `#<id>` and the tab list is keyboard navigable (arrow keys, Home, End).

| Tab | `id` | Shows |
|-----|------|-------|
| 1 The question | `question` | The policy question, the model in plain words, the three choices (drive, sell, reduce), headline figures from the current solve (replacement rule by economic index; annual replacement rate and average holding period when the cohort output is present; best-action counts) and the recommendation for the inspected vehicle |
| 2 Policy map | `policy-map` | Best action by vehicle age × economic index (or × fuel economy) for a chosen slice, inspected state outlined, letter and pattern cues, and a computed sentence on which conditions change the replacement age |
| 3 Replacement by age | `replacement` | Fleet-weighted replacement share by age next to the equal-weight grid share, and the steady-state fleet by age (equal-weight share only, labelled, when the engine returns no cohort output) |
| 4 Regulatory cost scenario | `scenario` | A new-vehicle price change (−$3,000 to +$3,000 in $250 steps): baseline vs scenario replacement rates, implied elasticities (steady state, first year, 10-year cumulative), the 10-year path, the states that switch, and a static price-elasticity calculation with an elasticity the analyst enters. Without cohort output it falls back to a second plain solve at the new price and a state-by-state comparison |
| 5 Method and assumptions | `method` | States, choices, transitions, the yearly value, the parameter table with provenance tags, limitations, references and the run's RR Toolbox attribution |
| 6 Use it in Claude | `claude` | The connector URL, setup steps, example prompts and licensing contact. The fleet-weighted example prompt is offered only when the engine answering the page returned the cohort output; otherwise an equal-weight prompt takes its place |

The fleet-weighted figures (replacement share by age, annual replacement rate, holding period, the scenario's rates and elasticities) need an RR Toolbox whose AutoDriveOrSell engine returns the `cohorts` output (RRToolbox 60ac78e or later). Against an older engine the page shows the equal-weight and grid-level views only, labelled as such.

Every figure on the page comes from the solve response or from a labelled input; values are illustrative and uncalibrated. The panel's defaults are the engine's own ADOS 2026 v1c defaults. Charts are hand-drawn SVG, each with a table of the same numbers. The page prints one screen at a time as a leave-behind (controls are dropped and the inputs listed), works at 390 px wide, and respects reduced-motion settings.

Built with **Next.js 15**, **React 19** and **Tailwind CSS**; Inter is loaded with `next/font`.

## Prerequisites

- **Node.js** 22.6+ (`npm test` uses `--experimental-strip-types`; the app itself runs on Node 20+)
- An **RR Toolbox** API key (`RRT-…`) whose account may run `AutoDriveOrSell` through the MCP tool `run_decision_model` at `https://api.rapidrecursive.com/mcp`

## Quick start

```bash
git clone https://github.com/Supintel2012/VehicleRetentionModel.git
cd VehicleRetentionModel
npm install
```

Create a local env file (never commit real secrets):

```bash
cp .env.example .env.local
```

Edit **`.env.local`**:

| Variable | Purpose |
|----------|---------|
| `RRTOOLBOX_API_KEY` | Required. Server-only RR Toolbox key, sent as `Authorization: Bearer …` to the MCP endpoint. Never prefix it with `NEXT_PUBLIC_`. |
| `RRTOOLBOX_MCP_URL` | Optional. MCP endpoint; defaults to `https://api.rapidrecursive.com/mcp`. Must be `https` (plain `http` only for `localhost`). |

Without `RRTOOLBOX_API_KEY` the page still loads, and **Solve** reports that the solver is not set up.

Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The model is solved on load and again shortly after each change in the assumptions panel or the scenario's price control.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Run production server (after `build`) |
| `npm run lint` | ESLint 9 with `eslint-config-next` (`eslint.config.mjs`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit and MCP-client tests (`node --test`, `lib/*.test.ts`) |

## Architecture

- **`app/page.tsx`**, **`components/site/`** — Page shell: header, the required demonstration notice, footer credits.
- **`components/demo/DemoApp.tsx`**, **`lib/solve-plan.ts`** — Assumptions panel, tab list and tab panels; one solve request serves every tab. Only the scenario's comparison depends on the price change, so the other tabs keep the last answer while only the price differs from it (also when a scenario solve fails: the error then shows on the scenario tab only). Against an engine without the cohort output, which ignores `price_shock`, a price change reuses the answered baseline request and costs one solve, the plain solve at the new price.
- **`components/demo/useSolve.ts`**, **`lib/latest.ts`** — Debounced (350 ms), latest-wins solving: a newer change aborts the request in flight and an older answer is never shown over a newer one, so a burst of slider steps costs one solve. Answers are remembered for the page session (the last 16 requests; the engine is deterministic), so coming back to a tab or to an earlier price change costs no solve. Together these keep a presenter well inside the route's rate limit.
- **`components/demo/tabs/`**, **`components/demo/charts.tsx`** — The six tabs and the SVG charts.
- **`lib/template.ts`** — Assumption fields, defaults and grid levels, and the request bodies (`buildSolveBody`, `buildRunBody`).
- **`lib/policy.ts`**, **`lib/scenario.ts`**, **`lib/method.ts`**, **`lib/format.ts`**, **`lib/fields.ts`**, **`lib/chart-scale.ts`**, **`lib/prompts.ts`** — Pure functions behind the screens: policy slices, the replacement rule, the "which conditions matter" sentence, equal-weight shares, the scenario and static-elasticity comparison, the grid-level fallback, the parameter table, number fields, chart axes and the example prompts.
- **`app/api/vehicle-retention/route.ts`** — **POST** solve route (Node runtime, 60 s limit). It wires the pieces below together.
- **`lib/solve-handler.ts`** — Same-origin check, body size cap, validation, configuration check, per-IP rate limit (about 20 solves per minute per server instance, keyed on the right-most `X-Forwarded-For` hop), then the MCP call.
- **`lib/solve-input.ts`** — Whitelist: only `StdMiles`, `ReducedMiles`, `PriceNewCar`, `FixedCost`, `d` and `query_state` within the panel's ranges, plus the cohort switches `cohorts` (boolean), `price_shock` (whole dollars, −3,000 to 3,000) and `projection_years` (whole years, 1 to 20). Unknown keys (grid sizes, probabilities, `fleet_age_distribution`, …) are rejected with a 400, never forwarded. `ReducedMiles` must be below `StdMiles` (a mileage left out counts as the engine default, 15,000 or 8,000), because the page describes the third action as driving fewer miles. The discount rate `d` must be at least 1%: at 0 the engine's discount factor is 1 and its policy iteration does not converge. An engine without the cohort output ignores the three switches.
- **`lib/rr-toolbox.ts`** — MCP client: `run_decision_model` with `{ model_name: "AutoDriveOrSell", parameters }` over Streamable HTTP, Bearer key, redirects refused, 40 s tool timeout inside a 45 s budget. Each solve ends its MCP session with an HTTP `DELETE` (waiting at most 2 s), so no session is left open on the RR Toolbox server.
- **`lib/solve-result.ts`** — Maps the MCP result to the `SolveResponse` in `lib/types.ts`, requires the RR Toolbox attribution, passes warnings through, and rebuilds state coordinates from `grids` and `dims` when `state_table` is omitted. It reads the run envelope from the JSON text, or from `structuredContent` only when that holds the envelope (with MCP Apps on, it holds a display view-model instead). The optional `cohorts` block, `params` echo, `actionlabels` and `policy_index_base` are checked when present: the cohort block must agree with the policy (its equal-weight sell shares and switching states are re-derived), and the echo and the price-shock comparison must match the request. `price_shock.states_changed` must count `changed_states`, unless the service lists only the first switching states and says so with `changed_states_truncated: true` (the count then stays the full count). The RR Toolbox API's compaction lists at most 50; inside the panel's ranges up to 78 states switch, and `lib/fixtures/ados-truncated-switches-run.json` (a real 78-state run cut to 50 rows by that compaction) keeps the flag's name under test.
- **`lib/solve-errors.ts`** — Reason codes (`not_configured`, `unauthorized`, `rate_limited`, `timeout`, `unreachable`, `tool_error`, `invalid_input`, `protocol_error`), each with one fixed message. Responses never include upstream URLs, hosts, IPs or bodies; detail goes to the server log with the key redacted.

The browser only talks to **`/api/vehicle-retention`**; the server holds the MCP endpoint and key.

## Deployment (e.g. Vercel)

1. Connect the GitHub repo and set root to this project.
2. Add **`RRTOOLBOX_API_KEY`** in the hosting provider’s environment (Production and Preview as needed). Set **`RRTOOLBOX_MCP_URL`** only to use a different endpoint.
3. Redeploy after changing environment variables: the route reads them at request time, but Vercel applies changes only to new deployments.
4. `npm run build` must succeed (it also runs ESLint and the type check).

**Self-hosting with `npm run start`:** put the server behind a reverse proxy that sets or appends `X-Forwarded-For` (for nginx, `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`). `next start` keeps a client-supplied `X-Forwarded-For`, so without such a proxy each client chooses its own rate-limit key and the limit is advisory only. Vercel replaces the header with the client's address, so no extra setup is needed there.

## Attribution

Footer and UI copy credit **Anderson Economic Group LLC** (ADOS) and **Supported Intelligence LLC** with **Rapid Recursive®** patent references (see footer for numbers). The RR Toolbox attribution line returned with each solve is shown verbatim under the results and in the footer.

Test fixtures: `lib/fixtures/ados-default-run.json` is a live RR Toolbox MCP response at the engine defaults; `lib/fixtures/ados-cohorts-run.json` is engine output with `cohorts: true` and a +$1,000 price shock, compacted the way the MCP compacts it (its `source` field says how it was made).

## License

This repository is provided as a **demonstration**. Model rights, patents, and commercial use are governed by agreements with the rights holders; the README demo notice is not legal advice.
