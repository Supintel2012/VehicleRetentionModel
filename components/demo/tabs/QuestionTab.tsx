"use client";

import { econRuleText, replacementAgeIndex, replacementRuleByEcon } from "@/lib/policy";
import { percent } from "@/lib/format";
import type { ActionName, QueryStateResult, SolveData } from "@/lib/types";
import { WithRun } from "../run";
import type { SolveState } from "../useSolve";
import { ACTION_TEXT, ActionChip, Notice, SectionHeading, SourceLine, Stat, SubHeading } from "../ui";

export const POLICY_QUESTION = "When the price of a new vehicle changes, how does the timing of vehicle replacement change?";

const CHOICES: ActionName[] = ["drive", "sell", "reduce"];

function vehicleText(age: number, topAge: number): string {
  if (age === 0) return "a new vehicle (age 0)";
  if (age >= topAge) return `a vehicle ${topAge} or more years old`;
  return `a ${age}-year-old vehicle`;
}

function Recommendation({ data, query }: { data: SolveData; query: QueryStateResult }) {
  const { matched, recommended_action: action } = query;
  const topAge = data.grids.age[data.dims.nAge - 1];
  const im = data.grids.mpg.indexOf(matched.fuel_economy);
  const ifu = data.grids.fuel.indexOf(matched.fuel_price);
  const ie = data.grids.econ.indexOf(matched.econ_condition);
  const start = replacementAgeIndex(data, im, ifu, ie);
  return (
    <section aria-labelledby="recommendation-title" className="panel keep-together p-5">
      <p className="eyebrow">Vehicle to inspect</p>
      <h3 id="recommendation-title" className="mt-1 text-base font-semibold text-slate-900">
        The model&apos;s best action this year
      </h3>
      <p className="mt-2 text-[15px] leading-relaxed text-slate-700">
        For {vehicleText(matched.age, topAge)} at {matched.fuel_economy} mpg, with fuel at ${matched.fuel_price.toFixed(2)} a gallon
        and an economic index of {matched.econ_condition}:
      </p>
      <p className="mt-3 flex items-center gap-3">
        <ActionChip action={action} className="h-8 min-w-8 text-sm" />
        <span className="text-lg font-semibold text-slate-900">
          {ACTION_TEXT[action].name}: {ACTION_TEXT[action].meaning}.
        </span>
      </p>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        {start === null
          ? "At these fuel-economy, fuel-price and economic-index levels, selling is not optimal at any age on the grid."
          : `At these fuel-economy, fuel-price and economic-index levels, replacement starts at age ${data.grids.age[start]}${start === data.dims.nAge - 1 ? " or older" : ""}.`}{" "}
        Change the vehicle in the assumptions panel to inspect another state.
      </p>
    </section>
  );
}

export function QuestionTab({ state, onReset }: { state: SolveState; onReset: () => void }) {
  return (
    <div className="space-y-6">
      <SectionHeading eyebrow="The policy question">{POLICY_QUESTION}</SectionHeading>
      <p className="max-w-3xl text-[15px] leading-relaxed text-slate-700">
        This Rapid Recursive® sequential decision model represents the likely decision of typical consumers that regularly rely
        upon their vehicles, and are considering whether to sell their vehicle and buy a new one; reduce their usage; or continue
        driving their current vehicle. This method allows for a rich interplay between costs of new vehicles, fuel economy, fuel
        prices, and economic conditions. It also provides insight into how policy-related costs can affect buying decisions among
        many different cohorts of consumers.
      </p>

      <section aria-labelledby="choices-title" className="space-y-3">
        <SubHeading id="choices-title">The three choices an owner has each year</SubHeading>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {CHOICES.map((action) => (
            <li key={action} className="panel flex items-start gap-3 p-4">
              <ActionChip action={action} className="h-8 min-w-8 text-sm" />
              <span className="text-sm leading-snug text-slate-700">
                <span className="block font-semibold text-slate-900">{ACTION_TEXT[action].name}</span>
                {ACTION_TEXT[action].meaning[0].toUpperCase() + ACTION_TEXT[action].meaning.slice(1)}.
              </span>
            </li>
          ))}
        </ul>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
          Each year the owner compares the value of each choice now and in every later year, given how fuel prices, the economy and
          the vehicle itself may change. The result is a best action for every combination of vehicle age, fuel economy, fuel price
          and economic index.
        </p>
      </section>

      <WithRun state={state} onReset={onReset}>
        {({ data, attribution }) => {
          const rules = replacementRuleByEcon(data);
          const topAge = data.grids.age[data.dims.nAge - 1];
          const counts = data.summary.decision_breakdown;
          const cohorts = data.cohorts;
          return (
            <div className="space-y-6">
              <section aria-labelledby="headline-title" className="space-y-3">
                <SubHeading id="headline-title">Headline figures from this solve</SubHeading>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="panel keep-together p-4 md:col-span-2">
                    <p className="text-sm font-medium text-slate-600">Replacement rule by economic index</p>
                    <ul className="mt-2 space-y-1.5">
                      {rules.map((rule) => (
                        <li key={rule.econ} className="flex gap-3 text-[15px]">
                          <span className="w-20 shrink-0 font-semibold text-slate-900">Index {rule.econ}</span>
                          <span className="text-slate-700">{econRuleText(rule, topAge)}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs leading-snug text-slate-500">
                      The youngest age at which selling is optimal, over all fuel-economy and fuel-price levels.
                    </p>
                  </div>
                  {cohorts ? (
                    <>
                      <Stat
                        label="Annual replacement rate"
                        value={percent(cohorts.annual_replacement_rate, 2)}
                        detail="Share of vehicles replaced each year in the model's steady state, weighted by where vehicles are."
                      />
                      <Stat
                        label="Average holding period"
                        value={cohorts.mean_holding_years === null ? "–" : `${cohorts.mean_holding_years.toFixed(2)} years`}
                        detail="One divided by the annual replacement rate."
                      />
                    </>
                  ) : (
                    <div className="md:col-span-2">
                      <Notice>
                        The annual replacement rate and average holding period are fleet-weighted figures. They need the RR Toolbox
                        cohort output, which the engine that answered this run did not return.
                      </Notice>
                    </div>
                  )}
                  <div className="panel keep-together p-4 md:col-span-2 xl:col-span-4">
                    <p className="text-sm font-medium text-slate-600">Best action, counted over the {data.summary.S} grid states</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-2 text-[15px] text-slate-900">
                      {CHOICES.map((action) => (
                        <span key={action} className="flex items-center gap-2">
                          <ActionChip action={action} />
                          {ACTION_TEXT[action].name} <span className="font-semibold">{counts[action]}</span>
                        </span>
                      ))}
                    </p>
                    <p className="mt-2 text-xs leading-snug text-slate-500">
                      Each state is counted once, whatever share of vehicles it holds, so these counts are not shares of vehicles.
                      {counts.reduce === 0 ? " Reducing mileage is not optimal in any state of this run." : ""}
                    </p>
                  </div>
                </div>
              </section>
              {data.query_state && <Recommendation data={data} query={data.query_state} />}
              <SourceLine attribution={attribution} />
            </div>
          );
        }}
      </WithRun>
    </div>
  );
}
