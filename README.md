# Vehicle Retention Model

Next.js web demo for the **Auto Drive-or-Sell™** decision framework (**ADOS 2026 v1c**): an interview-style wizard collects inputs, then runs a **Rapid Recursive®** sequential decision solve and visualizes the resulting policy and value surface.

> **This is a technology demonstration, not a forecast.** Contact **Supported Intelligence LLC** for licensing this model or adapting it to your needs: [support@supportedintelligence.com](mailto:support@supportedintelligence.com).

## Live demo

A working deployment is on **Vercel**: [https://vehicle-retention-model.vercel.app/](https://vehicle-retention-model.vercel.app/)

This build was pushed for the **[28th International Technical Conference on the Enhanced Safety of Vehicles (ESV)](https://tc.canada.ca/en/road-transportation/28th-international-technical-conference-enhanced-safety-vehicles-esv)** — co-hosted by Transport Canada and the National Highway Traffic Safety Administration, **May 12–15, 2026**, Toronto, Ontario.

Repository: [github.com/Supintel2012/VehicleRetentionModel](https://github.com/Supintel2012/VehicleRetentionModel)

## Features

- Guided **interview → review → solve** flow with progressive disclosure
- Client calls a **Next.js API route** that runs the RR Toolbox `AutoDriveOrSell` model over MCP (the API key stays on the server)
- Charts: **policy heatmap** and **value surface** after a successful solve
- Built with **Next.js 15**, **React 19**, **Tailwind CSS**, **Framer Motion**

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

Open [http://localhost:3000](http://localhost:3000). Use **Run sample answers** to populate the wizard, then **Review** → **Solve**.

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

- **`app/page.tsx`** — Page shell and footer (legal / attribution copy).
- **`components/Wizard.tsx`** — Wizard UI, disclaimer near actions, charts after solve.
- **`lib/template.ts`** — Interview steps, defaults, and mapping to the solve payload.
- **`app/api/vehicle-retention/route.ts`** — **POST** solve route (Node runtime, 60 s limit). It wires the pieces below together.
- **`lib/solve-handler.ts`** — Same-origin check, body size cap, validation, configuration check, per-IP rate limit (about 20 solves per minute per server instance, keyed on the right-most `X-Forwarded-For` hop), then the MCP call.
- **`lib/solve-input.ts`** — Whitelist: only `StdMiles`, `ReducedMiles`, `PriceNewCar`, `FixedCost`, `d` and `query_state` within the wizard's ranges. Unknown keys (grid sizes, probabilities, …) are rejected with a 400, never forwarded. The discount rate `d` must be at least 1%: at 0 the engine's discount factor is 1 and its policy iteration does not converge.
- **`lib/rr-toolbox.ts`** — MCP client: `run_decision_model` with `{ model_name: "AutoDriveOrSell", parameters }` over Streamable HTTP, Bearer key, redirects refused, 40 s tool timeout inside a 45 s budget. Each solve ends its MCP session with an HTTP `DELETE` (waiting at most 2 s), so no session is left open on the RR Toolbox server.
- **`lib/solve-result.ts`** — Maps the MCP result to the `SolveResponse` in `lib/types.ts`, requires the RR Toolbox attribution, passes warnings through, and rebuilds state coordinates from `grids` and `dims` when `state_table` is omitted. It reads the run envelope from the JSON text, or from `structuredContent` only when that holds the envelope (with MCP Apps on, it holds a display view-model instead).
- **`lib/solve-errors.ts`** — Reason codes (`not_configured`, `unauthorized`, `rate_limited`, `timeout`, `unreachable`, `tool_error`, `invalid_input`, `protocol_error`), each with one fixed message. Responses never include upstream URLs, hosts, IPs or bodies; detail goes to the server log with the key redacted.

The browser only talks to **`/api/vehicle-retention`**; the server holds the MCP endpoint and key.

## Deployment (e.g. Vercel)

1. Connect the GitHub repo and set root to this project.
2. Add **`RRTOOLBOX_API_KEY`** in the hosting provider’s environment (Production and Preview as needed). Set **`RRTOOLBOX_MCP_URL`** only to use a different endpoint.
3. Redeploy after changing environment variables: the route reads them at request time, but Vercel applies changes only to new deployments.
4. `npm run build` must succeed (it also runs ESLint and the type check).

**Self-hosting with `npm run start`:** put the server behind a reverse proxy that sets or appends `X-Forwarded-For` (for nginx, `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`). `next start` keeps a client-supplied `X-Forwarded-For`, so without such a proxy each client chooses its own rate-limit key and the limit is advisory only. Vercel replaces the header with the client's address, so no extra setup is needed there.

## Attribution

Footer and UI copy credit **Anderson Economic Group LLC** (ADOS), **Supported Intelligence LLC** with **Rapid Recursive®** patent references (see footer for numbers), and the vectorized Python port note.

## License

This repository is provided as a **demonstration**. Model rights, patents, and commercial use are governed by agreements with the rights holders; the README demo notice is not legal advice.
