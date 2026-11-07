"use client";

import { useId } from "react";
import { Minus, Plus } from "lucide-react";
import { percent, signedPercent } from "@/lib/format";
import { compareFuel, DEFAULT_FUEL_RISE, FUEL_RISE_LIMIT, FUEL_STEP, seriesOverPrices, TAPER_TO_SHOW_REDUCE, type FuelComparison } from "@/lib/fuel";
import { resultsView } from "@/lib/solve-plan";
import { ENGINE_DEFAULT_FUEL, FUEL_SPAN } from "@/lib/solve-input";
import type { ActionName } from "@/lib/types";
import { ChartLegend } from "../charts";
import { SeriesBarChart } from "../charts-interactive";
import { RETRYING, viewOf } from "../run";
import type { SolveState } from "../useSolve";
import { ACTION_TEXT, ActionChip, ErrorNotice, LoadingNotice, Notice, SectionHeading, SourceLine, Stat, SubHeading } from "../ui";

export { DEFAULT_FUEL_RISE };

const BASELINE = "#475569";
const SCENARIO = "#eb6834";
const dollars = (x: number) => `$${x.toFixed(2)}`;

function FuelControl({ rise, onChange }: { rise: number; onChange: (rise: number) => void }) {
  const id = useId();
  const clamp = (x: number) => Math.max(0, Math.min(FUEL_RISE_LIMIT, Math.round(x / FUEL_STEP) * FUEL_STEP));
  const min = ENGINE_DEFAULT_FUEL.FuelMin + rise;
  const max = min + FUEL_SPAN;
  const text = `+${dollars(rise)} a gallon: the grid runs ${dollars(min)} to ${dollars(max)} instead of ${dollars(ENGINE_DEFAULT_FUEL.FuelMin)} to ${dollars(ENGINE_DEFAULT_FUEL.FuelMax)}`;
  return (
    <div className="panel space-y-3 p-4">
      <label htmlFor={id} className="block text-sm font-semibold text-slate-900">
        Rise in fuel prices
      </label>
      <p className="text-2xl font-semibold tracking-tight text-slate-900" aria-hidden>
        +{dollars(rise)} <span className="text-base font-normal text-slate-600">a gallon ({dollars(min)} to {dollars(max)})</span>
      </p>
      <div className="no-print flex items-center gap-3">
        <button type="button" className="btn btn-secondary px-2" aria-label="Lower the rise by 50 cents" onClick={() => onChange(clamp(rise - FUEL_STEP))} disabled={rise <= 0}>
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <input
          id={id}
          type="range"
          min={0}
          max={FUEL_RISE_LIMIT}
          step={FUEL_STEP}
          value={rise}
          aria-valuetext={text}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-2 w-full cursor-pointer accent-accent-700"
        />
        <button type="button" className="btn btn-secondary px-2" aria-label="Raise the rise by 50 cents" onClick={() => onChange(clamp(rise + FUEL_STEP))} disabled={rise >= FUEL_RISE_LIMIT}>
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="no-print flex justify-between text-xs text-slate-500">
        <span>$0.00</span>
        <span>+{dollars(FUEL_RISE_LIMIT / 2)}</span>
        <span>+{dollars(FUEL_RISE_LIMIT)}</span>
      </div>
      <p className="text-sm leading-snug text-slate-600">
        Fuel price is a state of the model, so a shock moves the whole range an owner can face. Every level of the grid rises by this
        amount; the chance of a move up or down each year is unchanged. The model is solved on the new grid and compared with the
        baseline.
      </p>
    </div>
  );
}

function CountsTable({ c }: { c: FuelComparison }) {
  const actions: ActionName[] = ["drive", "sell", "reduce"];
  return (
    <div className="panel overflow-x-auto p-4">
      <table className="data-table">
        <caption className="mb-2 text-left text-sm font-semibold text-slate-900">Best action by fuel price, counted over the grid states at that price</caption>
        <thead>
          <tr>
            <th scope="col">Fuel price</th>
            <th scope="col" className="num">Baseline: drive / sell / reduce</th>
            <th scope="col" className="num">Scenario: drive / sell / reduce</th>
          </tr>
        </thead>
        <tbody>
          {c.prices.map((price) => {
            const b = c.baseline.byFuel.find((e) => Math.abs(e.fuel - price) < 1e-9);
            const s = c.scenario.byFuel.find((e) => Math.abs(e.fuel - price) < 1e-9);
            const cell = (e?: { counts: Record<ActionName, number> }) => (e ? actions.map((a) => e.counts[a]).join(" / ") : "–");
            return (
              <tr key={price}>
                <th scope="row" className="whitespace-nowrap font-medium">{dollars(price)}</th>
                <td className="num whitespace-nowrap">{cell(b)}</td>
                <td className="num whitespace-nowrap">{cell(s)}</td>
              </tr>
            );
          })}
          <tr className="border-t-2 border-slate-300">
            <th scope="row" className="font-semibold">All states</th>
            <td className="num whitespace-nowrap font-semibold">{actions.map((a) => c.baseline.counts[a]).join(" / ")}</td>
            <td className="num whitespace-nowrap font-semibold">{actions.map((a) => c.scenario.counts[a]).join(" / ")}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-sm leading-snug text-slate-600">
        A dash is a price that one grid does not reach. Each state is counted once, whatever share of vehicles it holds.
      </p>
    </div>
  );
}

export function FuelTab({
  baseline,
  scenario,
  rise,
  onRise,
  taperPct,
  onSetTaper,
  onReset,
}: {
  baseline: SolveState;
  scenario: SolveState;
  rise: number;
  onRise: (rise: number) => void;
  /** The panel's taper, in percent. */
  taperPct: number;
  onSetTaper: (pct: number) => void;
  onReset: () => void;
}) {
  const base = viewOf(baseline);
  const after = viewOf(scenario);
  const baseShown = resultsView(baseline);
  const afterShown = resultsView(scenario);
  let body: React.ReactNode;
  if (baseShown === "error" && baseline.error) body = <ErrorNotice message={baseline.error} onRetry={baseline.retry} onReset={onReset} />;
  else if (afterShown === "retrying") body = <LoadingNotice>{RETRYING}</LoadingNotice>;
  else if (afterShown === "error" && scenario.error) body = <ErrorNotice message={scenario.error} onRetry={scenario.retry} onReset={onReset} />;
  else if (!base || !after) body = <LoadingNotice>Solving the model on the higher fuel-price grid…</LoadingNotice>;
  else {
    const c = compareFuel(base.data, after.data);
    if (!c) body = <Notice tone="caution">The two solves are not on grids that differ only in the fuel-price shift, so they cannot be compared.</Notice>;
    else {
      const pending = baseline.busy || scenario.busy;
      const categories = c.prices.map(dollars);
      const reduceBase = c.baseline.counts.reduce;
      const reduceAfter = c.scenario.counts.reduce;
      const noReduce = reduceBase === 0 && reduceAfter === 0;
      body = (
        <div aria-busy={pending} className={pending ? "space-y-5 opacity-60 transition-opacity" : "space-y-5 transition-opacity"}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="States where reducing mileage is best"
              value={`${reduceBase} → ${reduceAfter}`}
              detail={`Of ${base.data.summary.S} grid states, baseline → scenario.`}
            />
            <Stat label="States where selling is best" value={`${c.baseline.counts.sell} → ${c.scenario.counts.sell}`} detail="Trade in and buy new, baseline → scenario." />
            <Stat
              label="Annual replacement rate"
              value={c.baseline.rate === null || c.scenario.rate === null ? "–" : `${percent(c.baseline.rate, 2)} → ${percent(c.scenario.rate, 2)}`}
              detail={c.ratePct === null ? "Needs the fleet output." : `${signedPercent(c.ratePct)} in the steady state, fleet-weighted.`}
            />
            <Stat
              label="Average holding period"
              value={c.baseline.holdingYears === null || c.scenario.holdingYears === null ? "–" : `${c.baseline.holdingYears.toFixed(2)} → ${c.scenario.holdingYears.toFixed(2)} years`}
              detail="One divided by the replacement rate."
            />
          </div>
          {noReduce && (
            <Notice tone="caution">
              <p className="font-semibold text-slate-900">No state reduces mileage at any fuel price on either grid.</p>
              {taperPct < TAPER_TO_SHOW_REDUCE ? (
                <>
                  <p className="mt-1">
                    At a taper of {taperPct}% the enjoyment of each mile, about $4.00 for this owner, outweighs fuel at well under $0.50 a mile, so a
                    fuel rise alone never makes cutting miles the best choice. The taper is the one input that can: at {TAPER_TO_SHOW_REDUCE}%
                    reducing appears, first at the highest fuel prices.
                  </p>
                  <button type="button" className="btn btn-primary no-print mt-3" onClick={() => onSetTaper(TAPER_TO_SHOW_REDUCE)}>
                    Set the taper to {TAPER_TO_SHOW_REDUCE}% and solve again
                  </button>
                </>
              ) : (
                <p className="mt-1">
                  The taper is already {taperPct}%, at or past the {TAPER_TO_SHOW_REDUCE}% where reducing appears at the engine&apos;s other defaults, so
                  another input on the panel is keeping it out: a higher standard or reduced mileage, or a lower fuel bill for this owner. Reset the
                  panel, or raise the taper further, to see it.
                </p>
              )}
            </Notice>
          )}
          <figure className="panel min-w-0 p-4">
            <figcaption id="fuel-reduce-title" className="mb-3 space-y-2">
              <span className="block text-sm font-semibold text-slate-900">States where reducing mileage is best, by fuel price</span>
              <ChartLegend
                items={[
                  { label: `Baseline grid (${dollars(base.data.grids.fuel[0])} to ${dollars(base.data.grids.fuel[base.data.dims.nFuel - 1])})`, color: BASELINE, style: "hatched" },
                  { label: `Scenario grid (${dollars(after.data.grids.fuel[0])} to ${dollars(after.data.grids.fuel[after.data.dims.nFuel - 1])})`, color: SCENARIO },
                ]}
              />
            </figcaption>
            <SeriesBarChart
              labelledBy="fuel-reduce-title"
              categories={categories}
              series={[
                { label: "Baseline", values: seriesOverPrices(c.baseline.byFuel, c.prices, "reduce"), color: BASELINE, style: "hatched" },
                { label: "Scenario", values: seriesOverPrices(c.scenario.byFuel, c.prices, "reduce"), color: SCENARIO, style: "solid" },
              ]}
              yMax={Math.max(8, ...c.baseline.byFuel.map((e) => e.counts.reduce), ...c.scenario.byFuel.map((e) => e.counts.reduce)) * 1.1}
              yLabel="Grid states at that price where reducing is best"
              xLabel="Fuel price (a gallon)"
              format={(v) => String(Math.round(v))}
              missing="not on this grid"
            />
            <p className="mt-2 text-sm leading-snug text-slate-600">
              Of the {base.data.dims.nAge * base.data.dims.nMpg * base.data.dims.nEcon} states at each fuel price. Where the grids overlap, the same price can
              give a different count: under the scenario the owner expects fuel to stay high, which changes the value of every choice.
            </p>
          </figure>
          <CountsTable c={c} />
          <section aria-labelledby="fuel-reading-title" className="max-w-3xl space-y-2 text-[15px] leading-relaxed text-slate-700">
            <SubHeading id="fuel-reading-title">How to read this</SubHeading>
            <p>
              Each year the owner picks one of three actions:{" "}
              {(["drive", "sell", "reduce"] as ActionName[]).map((a, i) => (
                <span key={a}>
                  <ActionChip action={a} className="mx-0.5" /> {ACTION_TEXT[a].name.toLowerCase()} ({ACTION_TEXT[a].meaning}){i < 2 ? ", " : "."}
                </span>
              ))}{" "}
              Reducing is driving at the panel&apos;s reduced mileage instead of the standard mileage, with the same transitions. It wins only
              where the enjoyment given up is smaller than the fuel and repair cost saved, so it is most attractive at the highest fuel prices
              and for owners whose enjoyment per mile tapers steeply above 12,000 miles a year.
            </p>
            <p>
              The replacement figures come from the fleet output of each solve: the steady state of the model&apos;s own chain under that grid&apos;s
              best-action rule. Dearer fuel makes an old, thirsty vehicle costlier to keep and a new, efficient one more valuable, so the
              replacement rate can rise even where no state reduces.
            </p>
          </section>
          <SourceLine attribution={after.attribution} />
        </div>
      );
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeading eyebrow="Fuel price scenario">How a rise in fuel prices moves the three choices</SectionHeading>
      <div className="max-w-xl">
        <FuelControl rise={rise} onChange={onRise} />
      </div>
      {body}
    </div>
  );
}
