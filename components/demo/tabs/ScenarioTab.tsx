"use client";

import { useId, useState, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import {
  compareGrids,
  compareScenario,
  describeSwitches,
  ENGINE_DEFAULT_PRICE,
  parseElasticity,
  shockedPriceBody,
  staticPercentChange,
  type SwitchGroup,
} from "@/lib/scenario";
import { decimal, dollars, percent, signedDollars, signedPercent } from "@/lib/format";
import { resultsView } from "@/lib/solve-plan";
import type { ChangedState, SolveData } from "@/lib/types";
import { ChangeBars, ChartLegend, GroupedBarChart, LineChart } from "../charts";
import { RETRYING, viewOf, type RunView } from "../run";
import type { SolveState } from "../useSolve";
import { ErrorNotice, LoadingNotice, Notice, SectionHeading, SourceLine, Stat, SubHeading } from "../ui";

export const PRICE_STEP = 250;
export const PRICE_LIMIT = 3_000;
export const DEFAULT_PRICE_CHANGE = 1_000;

const BASELINE = "#475569";
const SCENARIO = "#1e3a8a";

function PriceControl({ delta, basePrice, onChange }: { delta: number; basePrice: number; onChange: (delta: number) => void }) {
  const id = useId();
  const clamp = (x: number) => Math.max(-PRICE_LIMIT, Math.min(PRICE_LIMIT, x));
  const text = `${signedDollars(delta)} (${dollars(basePrice)} to ${dollars(basePrice + delta)})`;
  return (
    <div className="panel space-y-3 p-4">
      <label htmlFor={id} className="block text-sm font-semibold text-slate-900">
        Change in the new-vehicle price
      </label>
      <p className="text-2xl font-semibold tracking-tight text-slate-900" aria-hidden>
        {signedDollars(delta)}{" "}
        <span className="text-base font-normal text-slate-600">
          ({dollars(basePrice)} to {dollars(basePrice + delta)})
        </span>
      </p>
      <div className="no-print flex items-center gap-3">
        <button type="button" className="btn btn-secondary px-2" aria-label="Lower the price change by $250" onClick={() => onChange(clamp(delta - PRICE_STEP))} disabled={delta <= -PRICE_LIMIT}>
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <input
          id={id}
          type="range"
          min={-PRICE_LIMIT}
          max={PRICE_LIMIT}
          step={PRICE_STEP}
          value={delta}
          aria-valuetext={text}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-2 w-full cursor-pointer accent-accent-700"
        />
        <button type="button" className="btn btn-secondary px-2" aria-label="Raise the price change by $250" onClick={() => onChange(clamp(delta + PRICE_STEP))} disabled={delta >= PRICE_LIMIT}>
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="no-print flex justify-between text-xs text-slate-500">
        <span>{signedDollars(-PRICE_LIMIT)}</span>
        <span>$0</span>
        <span>{signedDollars(PRICE_LIMIT)}</span>
      </div>
      <p className="text-sm leading-snug text-slate-600">
        For example, a regulatory cost passed through to the price. The model is solved at the baseline price and again at the new
        price; the figures compare the two.
      </p>
    </div>
  );
}

function SwitchList({
  changed,
  count,
  truncated = false,
  total,
  topAge,
}: {
  changed: ChangedState[];
  /** All switching states; more than `changed` lists when the service cut the list short. */
  count: number;
  truncated?: boolean;
  total: number;
  topAge: number;
}) {
  const groups: SwitchGroup[] = describeSwitches(changed);
  return (
    <section aria-labelledby="switch-title" className="space-y-2">
      <SubHeading id="switch-title">States whose decision switches</SubHeading>
      {count === 0 ? (
        <p className="text-sm text-slate-700">No state switches its best action at this price change: the replacement rule is unchanged on this grid.</p>
      ) : (
        <>
          <p className="keep-with-next text-sm text-slate-700">
            {count} of {total} states switch. Every other state keeps its best action.
            {truncated && ` The RR Toolbox listed the first ${changed.length} of them; they are described below.`}
          </p>
          <ul className="space-y-1.5 text-sm text-slate-800">
            {groups.map((group) => (
              <li key={`${group.age}-${group.econ}-${group.from}-${group.to}`} className="keep-together rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="font-semibold">
                  Age {group.age}
                  {group.age >= topAge ? " or older" : ""}, economic index {group.econ}:
                </span>{" "}
                switches {group.change} for vehicles at {group.where} a gallon.
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/**
 * The analyst's elasticity. A valid entry is used as it is typed (the static
 * calculation needs no solve); while the text is not a valid number the last
 * valid value stays in use, and the field says so when it is left.
 */
function ElasticityField({ text, value, onChange }: { text: string; value: number; onChange: (text: string) => void }) {
  const id = useId();
  const [left, setLeft] = useState(false);
  const parsed = parseElasticity(text);
  const error = left && !parsed.ok ? `${parsed.message} Still using ${decimal(value, 2)}.` : null;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        Elasticity of new-vehicle purchases with respect to price
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className="field-input max-w-[10rem]"
        value={text}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
        onChange={(event) => {
          setLeft(false);
          onChange(event.target.value);
        }}
        onBlur={() => setLeft(true)}
      />
      <p id={`${id}-help`} className="text-xs text-slate-600">
        Illustrative; enter the elasticity used in your analysis.
      </p>
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function StaticComparison({
  elasticityText,
  elasticity,
  onElasticity,
  delta,
  basePrice,
  model,
  statesChanged,
  total,
}: {
  elasticityText: string;
  /** The last valid elasticity entered. */
  elasticity: number;
  onElasticity: (text: string) => void;
  delta: number;
  basePrice: number;
  /** Percent changes from the model, or null when the cohort output is missing. */
  model: { firstYear: number | null; steadyState: number | null; cumulative: number | null; years: number } | null;
  statesChanged: number | null;
  total: number;
}) {
  const staticPct = staticPercentChange(elasticity, delta, basePrice);
  return (
    <section aria-labelledby="static-title" className="panel keep-together space-y-4 p-4">
      <div className="space-y-1">
        <h3 id="static-title" className="text-base font-semibold text-slate-900">
          Static price-elasticity comparison
        </h3>
        <p className="text-sm leading-snug text-slate-600">
          A static price-elasticity approach applies one elasticity to the percent change in price.
        </p>
      </div>
      <ElasticityField text={elasticityText} value={elasticity} onChange={onElasticity} />
      <p className="rounded-md bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-800">
        Change in new-vehicle purchases = elasticity × (price change ÷ price)
        <br />= {decimal(elasticity, 2)} × ({dollars(delta)} ÷ {dollars(basePrice)}) ={" "}
        <span className="font-semibold">{signedPercent(staticPct)}</span>
      </p>
      <div className="space-y-2">
        <p id="change-bars-title" className="text-sm font-semibold text-slate-900">
          Percent change in purchases at {signedDollars(delta)}
        </p>
        <ChangeBars
          labelledBy="change-bars-title"
          format={(v) => signedPercent(v)}
          rows={[
            { label: "Static approach (entered elasticity)", value: staticPct, tone: "static" },
            ...(model
              ? [
                  { label: "ADOS, first year", value: model.firstYear, tone: "model" as const },
                  { label: "ADOS, steady state", value: model.steadyState, tone: "model" as const },
                  { label: `ADOS, ${model.years}-year cumulative`, value: model.cumulative, tone: "model" as const },
                ]
              : []),
          ]}
        />
        {!model && (
          <p className="text-sm leading-relaxed text-slate-700">
            The ADOS percent changes are fleet-weighted figures; they need the RR Toolbox cohort output, which the engine that
            answered this run did not return.
          </p>
        )}
        <p className="text-sm leading-relaxed text-slate-700">
          The ADOS figures are first-owner replacement purchases only: an owner trading in a vehicle and buying a new one. The
          model has no other buyers and no scrappage. On this coarse, uncalibrated grid the response is lumpy: a price change moves
          only the states whose decision switches{statesChanged === null ? "" : ` (${statesChanged} of ${total} here)`}, so the
          figures do not scale smoothly with the size of the change.
        </p>
      </div>
    </section>
  );
}

interface Parts {
  left: ReactNode;
  right?: ReactNode;
  bottom?: ReactNode;
}

function dim(busy: boolean, node: ReactNode): ReactNode {
  return (
    <div aria-busy={busy} className={busy ? "opacity-60 transition-opacity" : "transition-opacity"}>
      {node}
    </div>
  );
}

function ageCategories(data: SolveData): string[] {
  return data.grids.age.map((age, i) => (i === data.dims.nAge - 1 ? `${age}+` : String(age)));
}

/** The comparison read from the engine's own price-shock block. `delta` is the change now set on the control. */
function cohortParts(
  view: RunView,
  delta: number,
  elasticityText: string,
  elasticity: number,
  onElasticity: (t: string) => void,
  busy: boolean,
): Parts {
  const { data, attribution } = view;
  const cohorts = data.cohorts;
  const shock = cohorts?.price_shock;
  const comparison = cohorts ? compareScenario(cohorts, elasticity) : null;
  if (!cohorts || !shock || !comparison) return { left: <LoadingNotice>Solving the scenario…</LoadingNotice> };
  const years = comparison.projectionYears;
  const topAge = data.grids.age[data.dims.nAge - 1];
  const updating = busy && comparison.deltaPrice !== delta;
  const baselinePath = cohorts.projection.replacement_rate.slice(0, years);
  // Selling never best at either price: both paths are zero, and a sentence says so instead of a chart.
  const nothingToDraw = baselinePath.every((v) => v === 0) && shock.projection.replacement_rate.every((v) => v === 0);
  const left = (
    <div className="space-y-4">
      <p className="text-sm text-slate-600" aria-live="polite">
        {updating && <span className="font-semibold text-slate-900">Solving for {signedDollars(delta)}; still showing the previous results. </span>}
        Results for a {signedDollars(comparison.deltaPrice)} change, from {dollars(comparison.basePrice)} to {dollars(shock.price_new_car)} (
        {signedPercent(comparison.priceChangePct)}).
      </p>
      <div className="panel overflow-x-auto p-4">
        <table className="data-table">
          <caption className="mb-2 text-left text-sm font-semibold text-slate-900">Replacements per vehicle, baseline and scenario</caption>
          <thead>
            <tr>
              <th scope="col">Measure</th>
              <th scope="col" className="num">Baseline</th>
              <th scope="col" className="num">Scenario</th>
              <th scope="col" className="num">Change</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className="font-medium">Annual replacement rate, steady state</th>
              <td className="num">{percent(comparison.baselineRate, 2)}</td>
              <td className="num">{percent(comparison.scenarioRate, 2)}</td>
              <td className="num font-semibold">{signedPercent(comparison.steadyStatePct)}</td>
            </tr>
            <tr>
              <th scope="row" className="font-medium">Replacement rate in the first year</th>
              <td className="num">{percent(comparison.baselineRate, 2)}</td>
              <td className="num">{percent(comparison.firstYearRate, 2)}</td>
              <td className="num font-semibold">{signedPercent(comparison.firstYearPct)}</td>
            </tr>
            <tr>
              <th scope="row" className="font-medium">Replacements per vehicle over {years} years</th>
              <td className="num">{shock.baseline_cumulative.toFixed(3)}</td>
              <td className="num">{shock.projection.cumulative.toFixed(3)}</td>
              <td className="num font-semibold">{signedPercent(comparison.cumulativePct)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-sm leading-snug text-slate-600">
          Both paths start from the baseline steady-state fleet, so the first year shows the change in decisions before the fleet adjusts.
        </p>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-900">Implied elasticity of replacements with respect to the new-vehicle price</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label="Steady state" value={decimal(comparison.elasticity.steadyState)} />
          <Stat label="First year" value={decimal(comparison.elasticity.firstYear)} />
          <Stat label={`${years}-year cumulative`} value={decimal(comparison.elasticity.cumulative)} />
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Percent change in replacements divided by the percent change in price ({signedPercent(comparison.priceChangePct)}).
        </p>
      </div>
    </div>
  );
  const right = (
    <StaticComparison
      elasticityText={elasticityText}
      elasticity={elasticity}
      onElasticity={onElasticity}
      delta={comparison.deltaPrice}
      basePrice={comparison.basePrice}
      model={{ firstYear: comparison.firstYearPct, steadyState: comparison.steadyStatePct, cumulative: comparison.cumulativePct, years }}
      statesChanged={shock.states_changed}
      total={data.summary.S}
    />
  );
  const bottom = (
    <div className="space-y-6">
      <figure className="panel min-w-0 p-4">
        <figcaption id="path-title" className="mb-3 space-y-2">
          <span className="block text-sm font-semibold text-slate-900">Replacement rate by year, baseline and scenario</span>
          {!nothingToDraw && (
            <ChartLegend
              items={[
                { label: `Baseline (${dollars(comparison.basePrice)})`, color: BASELINE, line: "dashed", marker: "circle" },
                { label: `Scenario (${dollars(shock.price_new_car)})`, color: SCENARIO, line: "solid", marker: "square" },
              ]}
            />
          )}
        </figcaption>
        {nothingToDraw ? (
          <p className="text-sm leading-relaxed text-slate-700">
            The replacement rate is 0.00% in every year at both prices: selling is never the best action on this grid, so there is
            no path to draw.
          </p>
        ) : (
          <>
            {/* Capped width: a printed page then scales the drawing only a little, so its labels stay legible. */}
            <div className="chart-box max-w-3xl">
              <LineChart
                labelledBy="path-title"
                years={shock.projection.years}
                series={[
                  { label: "Baseline", values: baselinePath, color: BASELINE, dashed: true, marker: "circle" },
                  { label: "Scenario", values: shock.projection.replacement_rate, color: SCENARIO, marker: "square" },
                ]}
                format={(v) => percent(v, 2)}
                yLabel="Share of vehicles replaced"
                minSpan={0.005}
                floor={0}
              />
            </div>
            <p className="mt-2 text-sm text-slate-600">The vertical axis is fitted to the two paths and does not start at zero.</p>
          </>
        )}
        <details className="mt-3 text-sm text-slate-700">
          <summary className="cursor-pointer font-medium text-slate-800">Yearly figures</summary>
          <table className="data-table mt-2 max-w-md">
            <thead>
              <tr>
                <th scope="col">Year</th>
                <th scope="col" className="num">Baseline</th>
                <th scope="col" className="num">Scenario</th>
              </tr>
            </thead>
            <tbody>
              {shock.projection.years.map((year, i) => (
                <tr key={year}>
                  <th scope="row" className="font-medium">{year}</th>
                  <td className="num">{percent(cohorts.projection.replacement_rate[i], 2)}</td>
                  <td className="num">{percent(shock.projection.replacement_rate[i], 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </figure>
      <SwitchList
        changed={shock.changed_states}
        count={shock.states_changed}
        truncated={shock.changed_states_truncated === true}
        total={data.summary.S}
        topAge={topAge}
      />
      <SourceLine attribution={attribution} />
    </div>
  );
  return { left: dim(busy, left), right: dim(busy, right), bottom: dim(busy, bottom) };
}

/** Engines without cohort output: a second, plain solve at the new price, compared state by state. */
function gridParts(
  view: RunView,
  fallback: SolveState,
  delta: number,
  elasticityText: string,
  elasticity: number,
  onElasticity: (t: string) => void,
  onReset: () => void,
  busy: boolean,
): Parts {
  const { data: baseline, attribution, body } = view;
  const plan = shockedPriceBody(body, delta);
  if (!plan.ok) return { left: <Notice tone="caution">{plan.message}</Notice> };
  const basePrice = typeof body.PriceNewCar === "number" ? body.PriceNewCar : ENGINE_DEFAULT_PRICE;
  const intro = (
    <Notice>
      The engine that answered this run did not return the RR Toolbox cohort output, so this view is a grid-level comparison: a second
      solve at the new price, compared state by state. Every state is counted once; these are not shares of vehicles.
    </Notice>
  );
  const shocked = viewOf(fallback);
  const staticPanel = (statesChanged: number | null) => (
    <StaticComparison
      elasticityText={elasticityText}
      elasticity={elasticity}
      onElasticity={onElasticity}
      delta={delta}
      basePrice={basePrice}
      model={null}
      statesChanged={statesChanged}
      total={baseline.summary.S}
    />
  );
  const fallbackShown = resultsView(fallback);
  if (fallbackShown === "retrying") {
    return { left: <div className="space-y-4">{intro}<LoadingNotice>{RETRYING}</LoadingNotice></div>, right: staticPanel(null) };
  }
  if (fallbackShown === "error" && fallback.error) {
    return { left: <div className="space-y-4">{intro}<ErrorNotice message={fallback.error} onRetry={fallback.retry} onReset={onReset} /></div>, right: staticPanel(null) };
  }
  if (!shocked) {
    return { left: <div className="space-y-4">{intro}<LoadingNotice>Solving the model at the new price…</LoadingNotice></div>, right: staticPanel(null) };
  }
  const grid = compareGrids(baseline, shocked.data);
  if (!grid) {
    return { left: <div className="space-y-4">{intro}<Notice tone="caution">The two solves are on different grids and cannot be compared state by state.</Notice></div> };
  }
  const categories = ageCategories(baseline);
  const left = (
    <div className="space-y-4">
      {intro}
      <figure className="panel min-w-0 p-4">
        <figcaption id="fallback-chart-title" className="mb-3 space-y-2">
          <span className="block text-sm font-semibold text-slate-900">Equal-weight grid share of sell states, by vehicle age</span>
          <ChartLegend
            items={[
              { label: `Baseline (${dollars(basePrice)})`, color: BASELINE, style: "hatched" },
              { label: `Scenario (${dollars(basePrice + delta)})`, color: SCENARIO },
            ]}
          />
        </figcaption>
        <GroupedBarChart
          labelledBy="fallback-chart-title"
          categories={categories}
          series={[
            { label: "Baseline", values: grid.shares.map((s) => s.baseline), color: BASELINE, style: "hatched" },
            { label: "Scenario", values: grid.shares.map((s) => s.scenario), color: SCENARIO, style: "solid" },
          ]}
          yLabel="Share of the states at that age"
          xLabel="Vehicle age (years)"
          format={(v) => percent(v, 0)}
        />
        <table className="data-table mt-4">
          <caption className="mb-1 text-left text-sm font-semibold text-slate-900">Sell states by vehicle age (ages with none are left out)</caption>
          <thead>
            <tr>
              <th scope="col">Vehicle age</th>
              <th scope="col" className="num">Baseline</th>
              <th scope="col" className="num">Scenario</th>
            </tr>
          </thead>
          <tbody>
            {grid.shares.map((s, i) =>
              s.baselineStates > 0 || s.scenarioStates > 0 ? (
                <tr key={s.age}>
                  <th scope="row" className="font-medium">{categories[i]}</th>
                  <td className="num">
                    {s.baselineStates} of {s.states}
                  </td>
                  <td className="num">
                    {s.scenarioStates} of {s.states}
                  </td>
                </tr>
              ) : null,
            )}
          </tbody>
        </table>
      </figure>
    </div>
  );
  const bottom = (
    <div className="space-y-6">
      <SwitchList
        changed={grid.changed}
        count={grid.changed.length}
        total={baseline.summary.S}
        topAge={baseline.grids.age[baseline.dims.nAge - 1]}
      />
      <SourceLine attribution={attribution} />
    </div>
  );
  const pending = busy || fallback.busy;
  return { left: dim(pending, left), right: dim(pending, staticPanel(grid.changed.length)), bottom: dim(pending, bottom) };
}

export function ScenarioTab({
  state,
  fallback,
  delta,
  onDelta,
  basePrice,
  elasticityText,
  elasticity,
  onElasticity,
  onReset,
}: {
  state: SolveState;
  fallback: SolveState;
  delta: number;
  onDelta: (delta: number) => void;
  /** The new-vehicle price set in the panel. */
  basePrice: number;
  /** The elasticity field's text, and the last valid value entered in it. */
  elasticityText: string;
  elasticity: number;
  onElasticity: (text: string) => void;
  onReset: () => void;
}) {
  const view = viewOf(state);
  const shown = resultsView(state);
  let parts: Parts;
  if (delta === 0) parts = { left: <Notice>Set a price change other than $0 to compare the baseline with a scenario.</Notice> };
  else if (shown === "retrying") parts = { left: <LoadingNotice>{RETRYING}</LoadingNotice> };
  else if (shown === "error" && state.error) parts = { left: <ErrorNotice message={state.error} onRetry={state.retry} onReset={onReset} /> };
  else if (!view) parts = { left: <LoadingNotice /> };
  else if (view.data.cohorts) parts = cohortParts(view, delta, elasticityText, elasticity, onElasticity, state.busy);
  else parts = gridParts(view, fallback, delta, elasticityText, elasticity, onElasticity, onReset, state.busy);

  return (
    <div className="space-y-5">
      <SectionHeading eyebrow="Regulatory cost scenario">How a change in the new-vehicle price moves replacement</SectionHeading>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5" data-print-full>
        <div className="min-w-0 space-y-4 xl:col-span-3">
          <PriceControl delta={delta} basePrice={basePrice} onChange={onDelta} />
          {parts.left}
        </div>
        {parts.right && <div className="min-w-0 xl:col-span-2">{parts.right}</div>}
      </div>
      {parts.bottom}
    </div>
  );
}
