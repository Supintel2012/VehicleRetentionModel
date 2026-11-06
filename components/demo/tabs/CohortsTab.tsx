"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import clsx from "clsx";
import { RotateCcw } from "lucide-react";
import { decimal, dollars, percent, signedDollars, signedPercent } from "@/lib/format";
import {
  compareMarket,
  firstReplacementAge,
  mixError,
  mixTotal,
  orderBySlowest,
  parseSharePercent,
  SALVAGE_FRACTION,
  VEHICLE_CLASSES,
  type MarketMix,
} from "@/lib/market";
import { MARKET_FLEET_PROMPT } from "@/lib/prompts";
import { resultsView } from "@/lib/solve-plan";
import type { MarketClass, MarketSolveData, VehicleClassTag } from "@/lib/types";
import { ChartLegend, LineChart } from "../charts";
import { RETRYING } from "../run";
import type { MarketState } from "../useSolve";
import { ActionLegend, CopyButton, ErrorNotice, LoadingNotice, Notice, SectionHeading, SourceLine, Stat } from "../ui";
import { PriceControl } from "./ScenarioTab";

/**
 * Buyer cohorts: the screen for the November 2026 NHTSA agenda's demonstration,
 * in its order. (1) The inputs of the seven cohorts and their market mix, (2)
 * the discrete choices, (3) the internal logic of one market call, (4) the
 * results at the inputs shown, (5) the software platform and licensing.
 *
 * One request serves the whole screen: market_shares with cohorts: true and,
 * for a non-zero price change, price_shock (lib/market.ts buildMarketBody).
 * Every figure is read from that response.
 */

/** One colour per cohort from the Supported Intelligence chart palette, plus the market in slate. */
const COHORT_COLORS: Record<VehicleClassTag, string> = {
  ECO: "#00b4d8",
  ENT: "#81b29a",
  MID: "#3d5a80",
  PKP: "#ee6c4d",
  LUX: "#6a4c93",
  LSUV: "#f6bd60",
  EXO: "#293241",
};
const MARKET_COLOR = "#0f172a";
const UNIFORM = "#98c1d9";
const STATIONARY = "#6a4c93";

function ageCategories(data: MarketSolveData): string[] {
  return data.grids.age.map((age, i) => (i === data.dims.nAge - 1 ? `${age}+` : String(age)));
}

/** A cohort's share of vehicles, typed as a percent and used when the field is left or Enter is pressed. */
function ShareField({ tag, value, onCommit }: { tag: VehicleClassTag; value: number; onCommit: (value: number) => void }) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDraft((current) => {
      const parsed = parseSharePercent(current);
      return "value" in parsed && parsed.value === value ? current : String(value);
    });
    setError(null);
  }, [value]);
  function commit() {
    const parsed = parseSharePercent(draft);
    if ("error" in parsed) {
      setError(`${parsed.error} Still using ${value}%.`);
      return;
    }
    setDraft(String(parsed.value));
    setError(null);
    if (parsed.value !== value) onCommit(parsed.value);
  }
  return (
    // Positioned, so the hidden label is laid out inside the scrolling table and never widens the page.
    <div className="relative space-y-1">
      <label htmlFor={id} className="visually-hidden">
        {tag} share of vehicles, percent
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          className="field-input w-24 pr-7 text-right tabular-nums"
          value={draft}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            } else if (event.key === "Escape") {
              setDraft(String(value));
              setError(null);
            }
          }}
          onBlur={commit}
        />
        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-slate-500">%</span>
      </div>
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function CohortInputs({ mix, onMix, onResetMix }: { mix: MarketMix; onMix: (tag: VehicleClassTag, value: number) => void; onResetMix: () => void }) {
  const problem = mixError(mix);
  return (
    <div className="panel overflow-x-auto p-4">
      <table className="data-table">
        <caption className="mb-2 text-left text-sm font-semibold text-slate-900">
          The seven cohorts, as calibrated for 2026, and their shares of the vehicles on the road
        </caption>
        <thead>
          <tr>
            <th scope="col">Cohort</th>
            <th scope="col">Vehicles</th>
            <th scope="col" className="num">New-vehicle price</th>
            <th scope="col" className="num">Enjoyment, $ a mile</th>
            <th scope="col" className="num">Standard miles a year</th>
            <th scope="col" className="num">Discount rate</th>
            <th scope="col" className="num">Trade-in value when new</th>
            <th scope="col" className="num">Share of vehicles</th>
          </tr>
        </thead>
        <tbody>
          {VEHICLE_CLASSES.map((row) => (
            <tr key={row.tag}>
              <th scope="row" className="whitespace-nowrap font-semibold">
                <span className="mr-2 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: COHORT_COLORS[row.tag] }} aria-hidden />
                {row.tag}
              </th>
              <td>{row.name}</td>
              <td className="num">{dollars(row.PriceNewCar)}</td>
              <td className="num">{dollars(row.EnjoyBase, 2)}</td>
              <td className="num">{row.StdMiles.toLocaleString("en-US")}</td>
              <td className="num">{percent(row.d, 0)}</td>
              <td className="num">{dollars(row.PriceNewCar * SALVAGE_FRACTION)}</td>
              <td className="num no-print">
                <ShareField tag={row.tag} value={mix[row.tag]} onCommit={(value) => onMix(row.tag, value)} />
              </td>
              <td className="num print-only">{mix[row.tag]}%</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={7} className="text-right font-medium">
              Total
            </th>
            <td className={clsx("num font-semibold", problem && "text-red-700")}>{mixTotal(mix).toFixed(1)}%</td>
          </tr>
        </tfoot>
      </table>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm leading-snug text-slate-600">
          The price, enjoyment, mileage and discount rate of each cohort come from the ADOS 2026 calibration (ADOS2026main2e.m §1) and
          are fixed on this screen. The shares are the model&apos;s 2026 US light-vehicle mix; change them to describe another market.
          Every other input is the engine&apos;s default, shared by all seven cohorts.
        </p>
        <button type="button" className="btn btn-secondary no-print" onClick={onResetMix}>
          <RotateCcw className="h-4 w-4" aria-hidden />
          Reset to the 2026 mix
        </button>
      </div>
      {problem && (
        <p role="alert" className="mt-2 text-sm font-medium text-red-700">
          {problem} The results below are for the last mix that did.
        </p>
      )}
    </div>
  );
}

function Logic({ method }: { method: string | null }) {
  return (
    <div className="max-w-3xl space-y-3 text-[15px] leading-relaxed text-slate-700">
      <p>
        The Rapid Recursive Toolbox builds one transition structure for the whole market and one reward table per cohort. It solves
        each cohort&apos;s decision problem on its own, so a cohort&apos;s rule never depends on another cohort or on the shares.
      </p>
      <p>
        The shares come in afterwards. The Toolbox runs each solved rule forward as a fleet of that cohort&apos;s vehicles until the
        fleet settles, then weights the seven fleets by their shares of vehicles on the road. The market replacement rate is the
        share-weighted sum of the cohort rates, the market holding period is one divided by that rate, and the share of
        vehicles replaced at a given age counts the vehicles sold at that age across all seven fleets over the vehicles at that age.
      </p>
      <p>
        Before this release an analyst had to make seven calls, one per cohort, and weight the results by hand; the market call
        returned the value functions only. One call with the market mix and the fleet output now returns every cohort&apos;s fleet
        figures and the market figures together, and the seven cohort blocks are the same figures the seven separate calls give.
      </p>
      {method && (
        <details className="text-sm text-slate-700">
          <summary className="cursor-pointer font-medium text-slate-800">The method, as the RR Toolbox states it with this run</summary>
          <p className="mt-2 rounded-sm bg-slate-50 px-3 py-2 leading-relaxed">{method}</p>
        </details>
      )}
    </div>
  );
}

function CohortTable({ data, hasShock }: { data: MarketSolveData; hasShock: boolean }) {
  const topAge = data.grids.age[data.dims.nAge - 1];
  const rows = orderBySlowest(
    data.classes.map((c) => ({ tag: c.tag, share: c.share, rate: c.fleet.annual_replacement_rate, holdingYears: c.fleet.mean_holding_years })),
  );
  const byTag = Object.fromEntries(data.classes.map((c) => [c.tag, c])) as Record<VehicleClassTag, MarketClass>;
  const age = (a: number | null) => (a === null ? "Never" : a >= topAge ? `${a} or older` : String(a));
  return (
    <div className="panel overflow-x-auto p-4">
      <table className="data-table">
        <caption className="mb-2 text-left text-sm font-semibold text-slate-900">Each cohort&apos;s fleet, slowest replacement first</caption>
        <thead>
          <tr>
            <th scope="col">Cohort</th>
            <th scope="col" className="num">Share</th>
            <th scope="col" className="num">Replaced each year</th>
            <th scope="col" className="num">Average holding period</th>
            <th scope="col" className="num">Replacement starts at age</th>
            <th scope="col" className="num">Drive / sell / reduce states</th>
            {hasShock && <th scope="col" className="num">Own elasticity</th>}
            {hasShock && <th scope="col" className="num">States that switch</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const c = byTag[row.tag];
            const shock = c.fleet.price_shock;
            const own = shock ? (shock.delta_price / (shock.price_new_car - shock.delta_price)) * 100 : null;
            return (
              <tr key={row.tag}>
                <th scope="row" className="whitespace-nowrap font-semibold">
                  <span className="mr-2 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: COHORT_COLORS[row.tag] }} aria-hidden />
                  {row.tag}
                </th>
                <td className="num">{percent(row.share, 0)}</td>
                <td className="num">{percent(row.rate, 2)}</td>
                <td className="num whitespace-nowrap">{row.holdingYears === null ? "–" : `${row.holdingYears.toFixed(2)} years`}</td>
                <td className="num whitespace-nowrap">{age(firstReplacementAge(c.fleet.ages, c.fleet.replacement_hazard))}</td>
                <td className="num whitespace-nowrap">
                  {c.decision_breakdown.drive} / {c.decision_breakdown.sell} / {c.decision_breakdown.reduce}
                </td>
                {hasShock && (
                  <td className="num whitespace-nowrap">
                    {shock ? decimal(shock.implied_elasticity, 2) : "–"}
                    {shock && own !== null && <span className="block text-xs text-slate-500">at {signedPercent(own, 1)} of its price</span>}
                  </td>
                )}
                {hasShock && <td className="num">{shock ? shock.states_changed : "–"}</td>}
              </tr>
            );
          })}
          <tr className="border-t-2 border-slate-300">
            <th scope="row" className="whitespace-nowrap font-semibold">
              Market
            </th>
            <td className="num">100%</td>
            <td className="num font-semibold">{percent(data.market.annual_replacement_rate, 2)}</td>
            <td className="num whitespace-nowrap font-semibold">
              {data.market.mean_holding_years === null ? "–" : `${data.market.mean_holding_years.toFixed(2)} years`}
            </td>
            <td className="num whitespace-nowrap">{age(firstReplacementAge(data.market.ages, data.market.replacement_hazard))}</td>
            <td className="num text-slate-500">no single rule</td>
            {hasShock && (
              <td className="num whitespace-nowrap font-semibold">
                {decimal(data.market.price_shock?.implied_elasticity, 2)}
                {data.market.price_shock && (
                  <span className="block text-xs font-normal text-slate-500">at {signedPercent(data.market.price_shock.price_change_pct, 1)}, share-weighted</span>
                )}
              </td>
            )}
            {hasShock && <td className="num font-semibold">{data.market.price_shock?.states_changed ?? "–"}</td>}
          </tr>
        </tbody>
      </table>
      <p className="mt-3 text-sm leading-snug text-slate-600">
        &ldquo;Replaced each year&rdquo; is the steady-state annual replacement rate of the cohort&apos;s own fleet: new-vehicle purchases
        per vehicle on the road. The state counts weight every grid cell equally and are not shares of vehicles. A dollar price change
        is a different percent of each cohort&apos;s price, so each cohort&apos;s elasticity is quoted against its own percent change and
        the market&apos;s against the share-weighted one.
      </p>
    </div>
  );
}

function HazardChart({ data }: { data: MarketSolveData }) {
  const categories = ageCategories(data);
  const years = data.grids.age;
  return (
    <figure className="panel min-w-0 p-4">
      <figcaption id="cohort-hazard-title" className="mb-3 space-y-2">
        <span className="block text-sm font-semibold text-slate-900">Share of vehicles replaced at each age, by cohort and for the market</span>
        <ChartLegend
          items={[
            ...data.classes.map((c) => ({ label: `${c.tag} (${percent(c.share, 0)})`, color: COHORT_COLORS[c.tag], line: "solid" as const, marker: "circle" as const })),
            { label: "Market (share-weighted)", color: MARKET_COLOR, line: "dashed", marker: "square" },
          ]}
        />
      </figcaption>
      <LineChart
        labelledBy="cohort-hazard-title"
        years={years}
        categories={categories}
        xLabel="Vehicle age (years)"
        series={[
          ...data.classes.map((c) => ({ label: c.tag, values: c.fleet.replacement_hazard, color: COHORT_COLORS[c.tag], marker: "none" as const, width: 2 })),
          { label: "Market", values: data.market.replacement_hazard, color: MARKET_COLOR, dashed: true, marker: "square", width: 3 },
        ]}
        format={(v) => percent(v, 0)}
        yLabel="Share of the vehicles at that age"
        minSpan={1}
        floor={0}
        height={300}
      />
      <p className="mt-2 text-sm leading-snug text-slate-600">
        A gap in a line is an age the cohort&apos;s steady-state fleet never reaches. The top age stands for that age or older, so a cohort
        that keeps vehicles past it accumulates there.
      </p>
    </figure>
  );
}

function SellSignalChart({ data }: { data: MarketSolveData }) {
  const categories = ageCategories(data);
  const stationary = data.market.stationary_share_sell;
  return (
    <figure className="panel min-w-0 p-4">
      <figcaption id="sell-signal-title" className="mb-3 space-y-2">
        <span className="block text-sm font-semibold text-slate-900">Three readings of the market&apos;s sell signal by age</span>
        <ChartLegend
          items={[
            { label: "Grid cells that sell, every cell weighted equally", color: UNIFORM, line: "solid", marker: "circle" },
            ...(stationary ? [{ label: "Cells weighted by the long-run mix of fuel prices, economy and fuel economy", color: STATIONARY, line: "solid" as const, marker: "circle" as const }] : []),
            { label: "Vehicles replaced, fleet-weighted", color: MARKET_COLOR, line: "dashed", marker: "square" },
          ]}
        />
      </figcaption>
      <LineChart
        labelledBy="sell-signal-title"
        years={data.grids.age}
        categories={categories}
        xLabel="Vehicle age (years)"
        series={[
          { label: "Equal weight", values: data.market.grid_share_sell, color: UNIFORM, marker: "circle" },
          ...(stationary ? [{ label: "Long-run conditions", values: stationary, color: STATIONARY, marker: "circle" as const }] : []),
          { label: "Fleet-weighted", values: data.market.replacement_hazard, color: MARKET_COLOR, dashed: true, marker: "square", width: 3 },
        ]}
        format={(v) => percent(v, 0)}
        yLabel="Share at that age"
        minSpan={1}
        floor={0}
      />
      <p className="mt-2 text-sm leading-snug text-slate-600">
        The first two are the aggregate sell signals of the ADOS 2026 MATLAB report (uniform and stationary weights), share-weighted
        across the cohorts. The third weights each state by the vehicles that actually sit in it under the solved rule; the gap at
        the older ages is selection: the vehicles that survive to those ages are the ones whose conditions favour keeping them.
      </p>
    </figure>
  );
}

function ShockPanel({ data }: { data: MarketSolveData }) {
  const shock = data.market.price_shock;
  if (!shock) return null;
  const c = compareMarket(data.market.annual_replacement_rate, shock);
  const years = c.projectionYears;
  return (
    <div className="panel overflow-x-auto p-4">
      <table className="data-table">
        <caption className="mb-2 text-left text-sm font-semibold text-slate-900">
          The market at {signedDollars(c.deltaPrice)} on every cohort&apos;s new-vehicle price ({signedPercent(c.priceChangePct, 2)}, share-weighted)
        </caption>
        <thead>
          <tr>
            <th scope="col">Measure</th>
            <th scope="col" className="num">Baseline</th>
            <th scope="col" className="num">Scenario</th>
            <th scope="col" className="num">Change</th>
            <th scope="col" className="num">Elasticity</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row" className="font-medium">Annual replacement rate, steady state</th>
            <td className="num">{percent(c.baselineRate, 2)}</td>
            <td className="num">{percent(c.scenarioRate, 2)}</td>
            <td className="num font-semibold">{signedPercent(c.steadyStatePct)}</td>
            <td className="num font-semibold">{decimal(c.elasticity.steadyState)}</td>
          </tr>
          <tr>
            <th scope="row" className="font-medium">Replacement rate in the first year</th>
            <td className="num">{percent(c.baselineRate, 2)}</td>
            <td className="num">{percent(c.firstYearRate, 2)}</td>
            <td className="num font-semibold">{signedPercent(c.firstYearPct)}</td>
            <td className="num font-semibold">{decimal(c.elasticity.firstYear)}</td>
          </tr>
          <tr>
            <th scope="row" className="font-medium">Replacements per vehicle over {years} years</th>
            <td className="num">{shock.baseline_cumulative.toFixed(3)}</td>
            <td className="num">{shock.projection.cumulative.toFixed(3)}</td>
            <td className="num font-semibold">{signedPercent(c.cumulativePct)}</td>
            <td className="num font-semibold">{decimal(c.elasticity.cumulative)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-3 text-sm leading-snug text-slate-600">
        Each elasticity is the percent change in purchases divided by the share-weighted percent change in price. The first year starts
        from today&apos;s fleet, so it shows the change in decisions before the fleets adjust. {shock.states_changed} of the{" "}
        {(data.dims.nAge * data.dims.nMpg * data.dims.nFuel * data.dims.nEcon * data.classes.length).toLocaleString("en-US")} cohort-states
        switch action at the new prices; the response is lumpy because it comes from those switches alone.
      </p>
    </div>
  );
}

function Results({ data, attribution, busy }: { data: MarketSolveData; attribution: string; busy: boolean }) {
  const market = data.market;
  const shock = market.price_shock;
  return (
    <div aria-busy={busy} className={clsx("space-y-5 transition-opacity", busy && "opacity-60")}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Market replacement rate" value={percent(market.annual_replacement_rate, 2)} detail="New-vehicle purchases a year per vehicle on the road, share-weighted across the cohorts." />
        <Stat
          label="Market holding period"
          value={market.mean_holding_years === null ? "–" : `${market.mean_holding_years.toFixed(2)} years`}
          detail="One divided by the market replacement rate."
        />
        <Stat
          label="Slowest and fastest cohorts"
          value={(() => {
            const rows = orderBySlowest(data.classes.map((c) => ({ tag: c.tag, share: c.share, rate: c.fleet.annual_replacement_rate, holdingYears: c.fleet.mean_holding_years })));
            return `${rows[0].tag} · ${rows[rows.length - 1].tag}`;
          })()}
          detail={(() => {
            const rows = orderBySlowest(data.classes.map((c) => ({ tag: c.tag, share: c.share, rate: c.fleet.annual_replacement_rate, holdingYears: c.fleet.mean_holding_years })));
            const slow = rows[0];
            const fast = rows[rows.length - 1];
            return `${slow.tag} holds for ${slow.holdingYears?.toFixed(1) ?? "–"} years, ${fast.tag} for ${fast.holdingYears?.toFixed(1) ?? "–"}.`;
          })()}
        />
        {shock ? (
          <Stat
            label={`Market elasticity at ${signedDollars(shock.delta_price)}`}
            value={decimal(shock.implied_elasticity, 2)}
            detail={`Steady state, against a share-weighted ${signedPercent(shock.price_change_pct, 2)} price change.`}
          />
        ) : (
          <Stat label="Price change" value="$0" detail="Set a change other than $0 above to compare the market at two prices." />
        )}
      </div>
      <HazardChart data={data} />
      <CohortTable data={data} hasShock={Boolean(shock)} />
      <SellSignalChart data={data} />
      <ShockPanel data={data} />
      {market.caveats.length > 0 && (
        <Notice tone="caution">
          <p className="font-semibold text-slate-900">Caveats returned with these figures</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {market.caveats.map((caveat) => (
              <li key={caveat}>{caveat}</li>
            ))}
          </ul>
        </Notice>
      )}
      <SourceLine attribution={attribution} />
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`cohort-step-${number}`} className="space-y-3">
      <h3 id={`cohort-step-${number}`} className="flex items-baseline gap-3 text-lg font-bold tracking-tight text-slate-900">
        <span className="text-primary-700 tabular-nums">{number}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

export function CohortsTab({
  state,
  mix,
  onMix,
  onResetMix,
  delta,
  onDelta,
  onShowClaude,
}: {
  state: MarketState;
  mix: MarketMix;
  onMix: (tag: VehicleClassTag, value: number) => void;
  onResetMix: () => void;
  delta: number;
  onDelta: (delta: number) => void;
  onShowClaude: () => void;
}) {
  const shown = resultsView(state);
  const run = state.run;
  let results: ReactNode;
  if (shown === "retrying") results = <LoadingNotice>{RETRYING}</LoadingNotice>;
  else if (shown === "error" && state.error) results = <ErrorNotice message={state.error} onRetry={state.retry} onReset={onResetMix} />;
  else if (!run) results = <LoadingNotice>Solving all seven cohorts with the Rapid Recursive® Toolbox…</LoadingNotice>;
  else results = <Results data={run.response.data} attribution={run.response.attribution} busy={state.busy} />;

  return (
    <div className="space-y-8">
      <SectionHeading eyebrow="Buyer cohorts">Seven buyer cohorts, one market, one call</SectionHeading>
      <p className="max-w-3xl text-[15px] leading-relaxed text-slate-700">
        The 2026 model solves the drive-or-sell decision for seven representative buyer cohorts, from economy cars to exotics. Each
        cohort has its own new-vehicle price, driving enjoyment, standard mileage and discount rate; all seven face the same fuel
        prices, economic conditions and fuel-economy changes. The Rapid Recursive® Toolbox solves them together and weights the fleet
        figures by each cohort&apos;s share of the vehicles on the road, so a regulator can read the market&apos;s replacement timing and
        each cohort&apos;s part in it from one run.
      </p>

      <Step number={1} title="Inputs for the cohorts">
        <CohortInputs mix={mix} onMix={onMix} onResetMix={onResetMix} />
        <div className="max-w-xl">
          <PriceControl
            delta={delta}
            onChange={onDelta}
            note="Added to every cohort's new-vehicle price, for example a regulatory cost passed through. The same change is a smaller percent of a pricier vehicle, and the figures say so."
          />
        </div>
      </Step>

      <Step number={2} title="The discrete choices">
        <p className="max-w-3xl text-[15px] leading-relaxed text-slate-700">
          Each year an owner in every cohort chooses one of three actions. The model gives one best action for every state of the
          grid, with no probability of choosing another; replacement timing comes from where the fleet sits on that grid.
        </p>
        <ActionLegend />
      </Step>

      <Step number={3} title="Internal logic">
        <Logic method={run?.response.data.market.method ?? null} />
      </Step>

      <Step number={4} title="Results at these inputs">{results}</Step>

      <Step number={5} title="Software platform and licensing">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="panel keep-together flex flex-col gap-3 p-4">
            <p className="font-semibold text-slate-900">The same call from a Claude conversation</p>
            <p className="flex-1 text-sm leading-relaxed text-slate-700">{MARKET_FLEET_PROMPT.prompt}</p>
            <div className="no-print flex flex-wrap gap-2">
              <CopyButton text={MARKET_FLEET_PROMPT.prompt} label="Copy the market prompt" />
              <button type="button" className="btn btn-secondary" onClick={onShowClaude}>
                How to connect the Toolbox
              </button>
            </div>
          </div>
          <div className="max-w-xl space-y-2 text-[15px] leading-relaxed text-slate-700">
            <p>
              The Rapid Recursive® Toolbox is Supported Intelligence&apos;s platform for sequential decision models. The ADOS 2026 model
              runs there as the AutoDriveOrSell template, available through the Toolbox API and as a connector for Claude, ChatGPT,
              Microsoft 365 Copilot and Claude Code.
            </p>
            <p className="font-medium text-slate-900">
              Running the model with your own cohorts, inputs or data requires a Supported Intelligence license.
            </p>
          </div>
        </div>
      </Step>
    </div>
  );
}
