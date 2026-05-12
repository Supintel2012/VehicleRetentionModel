# Vehicle Retention Model

Next.js web demo for the **Auto Drive-or-Sell™** decision framework (**ADOS 2026 v1c**): an interview-style wizard collects inputs, then runs a **Rapid Recursive®** sequential decision solve and visualizes the resulting policy and value surface.

> **This is a technology demonstration, not a forecast.** Contact **Supported Intelligence LLC** for licensing this model or adapting it to your needs: [support@supportedintelligence.com](mailto:support@supportedintelligence.com).

## Live demo

A working deployment is on **Vercel**: [https://vehicle-retention-model.vercel.app/](https://vehicle-retention-model.vercel.app/)

This build was pushed for the **[28th International Technical Conference on the Enhanced Safety of Vehicles (ESV)](https://tc.canada.ca/en/road-transportation/28th-international-technical-conference-enhanced-safety-vehicles-esv)** — co-hosted by Transport Canada and the National Highway Traffic Safety Administration, **May 12–15, 2026**, Toronto, Ontario.

Repository: [github.com/Supintel2012/VehicleRetentionModel](https://github.com/Supintel2012/VehicleRetentionModel)

## Features

- Guided **interview → review → solve** flow with progressive disclosure
- Client calls a **Next.js API route** that proxies to the RR Toolbox solver (keeps API keys off the browser)
- Charts: **policy heatmap** and **value surface** after a successful solve
- Built with **Next.js 15**, **React 19**, **Tailwind CSS**, **Framer Motion**

## Prerequisites

- **Node.js** 20+ (recommended; matches typical Next 15 setups)
- A running **RR Toolbox** (or compatible) HTTP API that exposes:

  `POST {RRTOOLBOX_API_URL}/vehicle-retention/solve`

  with the JSON body produced by this app’s wizard (see `lib/template.ts` and `buildSolveBody`).

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
| `RRTOOLBOX_API_URL` | Base URL of the toolbox API (no trailing slash), e.g. `http://localhost:8000` |
| `RRTOOLBOX_API_KEY` | `RRT-*` key with permission to call `/vehicle-retention/*` |

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
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

## Architecture

- **`app/page.tsx`** — Page shell and footer (legal / attribution copy).
- **`components/Wizard.tsx`** — Wizard UI, disclaimer near actions, charts after solve.
- **`lib/template.ts`** — Interview steps, defaults, and mapping to the solve payload.
- **`app/api/vehicle-retention/route.ts`** — **POST** proxy: forwards JSON to `{RRTOOLBOX_API_URL}/vehicle-retention/solve` and adds `Authorization` from `RRTOOLBOX_API_KEY`.

The browser only talks to **`/api/vehicle-retention`**; the server holds upstream URL and key.

## Deployment (e.g. Vercel)

1. Connect the GitHub repo and set root to this project.
2. Add **`RRTOOLBOX_API_URL`** and **`RRTOOLBOX_API_KEY`** in the hosting provider’s environment (Production / Preview as needed).
3. `npm run build` must succeed; ensure the toolbox URL is reachable from the serverless region you use.

## Attribution

Footer and UI copy credit **Anderson Economic Group LLC** (ADOS / Rapid Recursive®) and **Supported Intelligence LLC** (© 2026). Technical notes in the footer describe the vectorized Python port used with the demo.

## License

This repository is provided as a **demonstration**. Model rights, patents, and commercial use are governed by agreements with the rights holders; the README demo notice is not legal advice.
