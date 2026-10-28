"use client";

import clsx from "clsx";
import { gridShareByAge } from "@/lib/policy";
import { percent } from "@/lib/format";
import type { SolveData } from "@/lib/types";
import { ChartLegend, GroupedBarChart } from "../charts";
import { WithRun } from "../run";
import type { SolveState } from "../useSolve";
import { Notice, SectionHeading, SourceLine, SubHeading } from "../ui";

const FLEET = "#1e3a8a";
const GRID_SHARE = "#475569";
const DISTRIBUTION = "#64748b";

function ageCategories(data: SolveData): string[] {
  return data.grids.age.map((age, i) => (i === data.dims.nAge - 1 ? `${age}+` : String(age)));
}

/** "age 9", "ages 8 to 10 or older" (the top age stands for that age or older). */
function agesText(ages: number[], topAge: number): string {
  const last = ages[ages.length - 1];
  const older = last === topAge ? " or older" : "";
  return ages.length === 1 ? `age ${last}${older}` : `ages ${ages[0]} to ${last}${older}`;
}

/** Smallest of 0.1, 0.2, 0.25, 0.5, 1 that holds the largest share. */
function shareAxisMax(values: number[]): number {
  const top = Math.max(...values, 0);
  return [0.1, 0.2, 0.25, 0.5, 1].find((m) => top <= m) ?? 1;
}

function Explanation({ cohorts }: { cohorts: boolean }) {
  return (
    <section aria-labelledby="reading-title" className="max-w-3xl space-y-2 text-[15px] leading-relaxed text-slate-700">
      <SubHeading id="reading-title">How to read these figures</SubHeading>
      <p>
        The model gives one best action for each state (vehicle age, fuel economy, fuel price and economic index). It does not give
        a probability of choosing each action, so within a single state the answer is either replace or keep.
      </p>
      <p>
        <span className="font-semibold text-slate-900">Equal-weight grid share</span> counts the states at each age in which selling
        is the best action, every state counted once. It is not a share of vehicles: real vehicles are not spread evenly over fuel
        prices and economic conditions.
      </p>
      {cohorts ? (
        <p>
          <span className="font-semibold text-slate-900">Fleet-weighted replacement share</span> comes from running the model&apos;s own
          Markov chain forward under that best-action rule until the fleet settles into a steady state. Each state then counts in
          proportion to the vehicles in it, and the figure is the share of the vehicles at each age that are replaced in a year.
        </p>
      ) : (
        <p>Fleet-weighted figures need the RR Toolbox cohort output, which the engine that answered this run did not return.</p>
      )}
    </section>
  );
}

/** The heading says what the figures are: a share of vehicles only when the fleet-weighted output is there. */
function headingFor(state: SolveState): string {
  const data = state.run?.response.data;
  if (!data) return "Replacement by vehicle age";
  return data.cohorts ? "Share of each age cohort that replaces its vehicle" : "Share of grid states at each age where selling is best";
}

export function ReplacementTab({ state, onReset }: { state: SolveState; onReset: () => void }) {
  return (
    <div className="space-y-5">
      <SectionHeading eyebrow="Replacement by vehicle age">{headingFor(state)}</SectionHeading>
      <WithRun state={state} onReset={onReset}>
        {({ data, attribution }) => {
          const grid = gridShareByAge(data);
          const cohorts = data.cohorts;
          const categories = ageCategories(data);
          const emptyAges = cohorts ? cohorts.ages.filter((_, i) => cohorts.replacement_hazard[i] === null) : [];
          return (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-5" data-print-full>
                <figure className={clsx("panel min-w-0 p-4", cohorts ? "xl:col-span-3" : "xl:col-span-5")}>
                  <figcaption id="replacement-chart-title" className="mb-3 space-y-2">
                    <span className="block text-sm font-semibold text-slate-900">
                      {cohorts
                        ? "Replacement by vehicle age: fleet-weighted and equal-weight"
                        : "Equal-weight grid share of sell states, by vehicle age"}
                    </span>
                    <ChartLegend
                      items={[
                        ...(cohorts ? [{ label: "Fleet-weighted replacement share (steady state)", color: FLEET }] : []),
                        { label: "Equal-weight grid share (counts states, not vehicles)", color: GRID_SHARE, style: "hatched" as const },
                      ]}
                    />
                  </figcaption>
                  <GroupedBarChart
                    labelledBy="replacement-chart-title"
                    categories={categories}
                    series={[
                      ...(cohorts ? [{ label: "Fleet-weighted", values: cohorts.replacement_hazard, color: FLEET, style: "solid" as const }] : []),
                      { label: "Equal-weight", values: grid.map((g) => g.share), color: GRID_SHARE, style: "hatched" },
                    ]}
                    yLabel={cohorts ? "Share at that age (see legend)" : "Share of the states at that age"}
                    xLabel="Vehicle age (years)"
                    format={(v) => percent(v, 0)}
                  />
                  {emptyAges.length > 0 && (
                    <p className="mt-2 text-sm text-slate-600">
                      A dash on the axis means no vehicles reach that age in the steady state (
                      {agesText(emptyAges, data.grids.age[data.dims.nAge - 1])}).
                    </p>
                  )}
                </figure>
                {cohorts && (
                  <figure className="panel min-w-0 p-4 xl:col-span-2">
                    <figcaption id="fleet-chart-title" className="mb-3 space-y-2">
                      <span className="block text-sm font-semibold text-slate-900">Steady-state fleet by vehicle age</span>
                      <ChartLegend items={[{ label: "Share of all vehicles", color: DISTRIBUTION }]} />
                    </figcaption>
                    <GroupedBarChart
                      labelledBy="fleet-chart-title"
                      categories={categories}
                      series={[{ label: "Share of fleet", values: cohorts.fleet_share, color: DISTRIBUTION, style: "solid" }]}
                      yMax={shareAxisMax(cohorts.fleet_share)}
                      yLabel="Share of the fleet"
                      xLabel="Vehicle age (years)"
                      format={(v) => percent(v, 0)}
                    />
                  </figure>
                )}
              </div>

              <div className={clsx("panel overflow-x-auto p-4", !cohorts && "max-w-xl")}>
                <table className="data-table">
                  <caption className="mb-2 text-left text-sm font-semibold text-slate-900">Figures by vehicle age</caption>
                  <thead>
                    <tr>
                      <th scope="col">Vehicle age</th>
                      {cohorts && <th scope="col" className="num">Share of fleet</th>}
                      {cohorts && <th scope="col" className="num">Replaced in a year (fleet-weighted)</th>}
                      <th scope="col" className="num">Sell states (equal weight)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grid.map((g, i) => (
                      <tr key={g.age}>
                        <th scope="row" className="font-medium">{categories[i]}</th>
                        {cohorts && <td className="num">{percent(cohorts.fleet_share[i], 1)}</td>}
                        {cohorts && (
                          <td className="num whitespace-nowrap">
                            {cohorts.replacement_hazard[i] === null ? "No vehicles" : percent(cohorts.replacement_hazard[i], 1)}
                          </td>
                        )}
                        <td className="num whitespace-nowrap">
                          {percent(g.share, 0)}{" "}
                          <span className="block text-xs text-slate-500 sm:inline sm:text-sm">
                            ({g.sellStates} of {g.states})
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {cohorts && (
                  <p className="mt-3 text-sm text-slate-700">
                    Annual replacement rate across the fleet: <span className="font-semibold">{percent(cohorts.annual_replacement_rate, 2)}</span>
                    {cohorts.mean_holding_years !== null && (
                      <>
                        {" "}
                        (an average holding period of <span className="font-semibold">{cohorts.mean_holding_years.toFixed(2)} years</span>)
                      </>
                    )}
                    .
                  </p>
                )}
              </div>

              <Explanation cohorts={Boolean(cohorts)} />

              {cohorts && cohorts.caveats.length > 0 && (
                <Notice tone="caution">
                  <p className="font-semibold text-slate-900">Caveats returned with these figures</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {cohorts.caveats.map((caveat) => (
                      <li key={caveat}>{caveat}</li>
                    ))}
                  </ul>
                </Notice>
              )}
              <SourceLine attribution={attribution} />
            </div>
          );
        }}
      </WithRun>
    </div>
  );
}
