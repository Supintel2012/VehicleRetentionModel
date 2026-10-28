"use client";

import { DEFAULT_GRID } from "@/lib/template";
import { parameterRows, resolveParameters, yearlyValueTerms, type Provenance } from "@/lib/method";
import { dollars } from "@/lib/format";
import type { SolveData } from "@/lib/types";
import { viewOf } from "../run";
import type { SolveState } from "../useSolve";
import { SectionHeading, SourceLine, SubHeading } from "../ui";

/**
 * The last entry is cited as the ADOS reference model's own header cites it
 * ("Anderson, Johnson, McManus, 'Recursive Damages,' paper presented at
 * ASSA/NAFE, Jan 2015 Boston MA"), without initials it does not give.
 */
const REFERENCES = [
  "Bellman, R. (1957). Dynamic Programming. Princeton University Press.",
  "Stokey, N. L., Lucas, R. E., & Prescott, E. C. (1989). Recursive Methods in Economic Dynamics. Harvard University Press.",
  "Anderson, P. L. (2013). The Economics of Business Valuation. Stanford University Press.",
  "Anderson, Johnson & McManus (2015). \u201cRecursive Damages.\u201d Paper presented at ASSA/NAFE, January 2015, Boston, MA.",
];

const pct = (x: number) => `${Number((x * 100).toFixed(2))}%`;

type Grids = Pick<SolveData["grids"], "age" | "mpg" | "fuel" | "econ">;

function ProvenanceTag({ provenance }: { provenance: Provenance }) {
  return (
    <span
      className={
        provenance === "Assumed"
          ? "rounded border border-accent-200 bg-accent-50 px-1.5 py-0.5 text-xs font-semibold text-accent-700"
          : "rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-xs font-semibold text-slate-700"
      }
    >
      {provenance}
    </span>
  );
}

export function MethodTab({ state, requestBody }: { state: SolveState; requestBody: Record<string, unknown> }) {
  const view = viewOf(state);
  const data = view?.data;
  const grids: Grids = data?.grids ?? {
    age: [...DEFAULT_GRID.age],
    mpg: [...DEFAULT_GRID.mpg],
    fuel: [...DEFAULT_GRID.fuel],
    econ: [...DEFAULT_GRID.econ],
  };
  const { values, echoed } = resolveParameters(data?.params, view?.body ?? requestBody);
  const rows = parameterRows(values);
  const terms = yearlyValueTerms(values, grids);
  const S = grids.age.length * grids.mpg.length * grids.fuel.length * grids.econ.length;
  const reduceStates = data?.summary.decision_breakdown.reduce;
  const fuelLevels = grids.fuel.map((f) => `$${f.toFixed(2)}`).join(", ");

  return (
    <div className="space-y-8">
      <SectionHeading eyebrow="Method and assumptions">How the model works</SectionHeading>

      <section aria-labelledby="states-title" className="max-w-3xl space-y-2 text-[15px] leading-relaxed text-slate-700">
        <SubHeading id="states-title">States and choices</SubHeading>
        <p>
          The model describes one owner and one vehicle each year by four conditions: vehicle age ({grids.age[0]} to{" "}
          {grids.age[grids.age.length - 1]} years, the last level meaning that age or older), the vehicle&apos;s fuel economy (
          {grids.mpg.join(", ")} mpg), the fuel price ({fuelLevels} a gallon) and an economic index ({grids.econ.join(", ")}). That is{" "}
          {grids.age.length} × {grids.mpg.length} × {grids.fuel.length} × {grids.econ.length} = {S.toLocaleString("en-US")} states. In
          each state the owner can drive (keep the vehicle and drive the standard miles), sell (trade it in and buy a new vehicle) or
          reduce (keep the vehicle and drive fewer miles).
        </p>
      </section>

      <section aria-labelledby="dynamics-title" className="max-w-3xl space-y-2 text-[15px] leading-relaxed text-slate-700">
        <SubHeading id="dynamics-title">How conditions change from one year to the next</SubHeading>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Fuel price moves one level down, stays, or moves one level up with probabilities {pct(values.p_fuel_down)},{" "}
            {pct(values.p_fuel_stay)} and {pct(values.p_fuel_up)} (a random walk; at the lowest and highest levels the move off the
            grid stays put).
          </li>
          <li>
            The economic index follows the same kind of random walk with probabilities {pct(values.p_econ_down)},{" "}
            {pct(values.p_econ_stay)} and {pct(values.p_econ_up)}.
          </li>
          <li>
            A kept vehicle&apos;s fuel economy drifts down: one level down {pct(values.p_mpg_down)}, unchanged {pct(values.p_mpg_stay)},
            one level up {pct(values.p_mpg_up)}.
          </li>
          <li>A kept vehicle is one year older the next year (the top age stays at the top).</li>
          <li>
            Selling resets the state to a new vehicle: age {grids.age[0]} with the top fuel economy ({terms.topMpg} mpg). Fuel price and
            the economic index move as above whatever the owner does.
          </li>
        </ul>
      </section>

      <section aria-labelledby="value-title" className="max-w-3xl space-y-2 text-[15px] leading-relaxed text-slate-700">
        <SubHeading id="value-title">What goes into each year&apos;s value</SubHeading>
        <p>
          <span className="font-semibold text-slate-900">Driving or reducing:</span> driving enjoyment, minus fuel, repair and fixed costs
          and depreciation.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Enjoyment is {dollars(values.EnjoyBase, 2)} a mile for a new vehicle, declining with age (half that at age{" "}
            {values.EnjoyHalfLife}) and scaled by the economic index relative to the grid mean ({terms.econMean}). Above{" "}
            {values.MilesThreshold.toLocaleString("en-US")} miles a year enjoyment per mile tapers, by up to {pct(values.DecayFraction)}: at
            the standard {values.StdMiles.toLocaleString("en-US")} miles it is {pct(terms.stdTaper)} of the base, and at the reduced{" "}
            {values.ReducedMiles.toLocaleString("en-US")} miles {pct(terms.reducedTaper)}.
          </li>
          <li>Fuel cost is miles ÷ fuel economy × fuel price.</li>
          <li>
            Repair cost is {dollars(values.RepairBase, 2)} a mile for a new vehicle, growing {pct(values.RepairGrowth)} a year with age.
          </li>
          <li>Fixed cost (insurance and property tax) is {dollars(values.FixedCost)} a year.</li>
          <li>
            Depreciation is {dollars(terms.depreciation)} a year: the new-vehicle price less its trade-in value, spread over{" "}
            {terms.topAge} years.
          </li>
        </ul>
        <p>
          <span className="font-semibold text-slate-900">Selling:</span> the trade-in value of the current vehicle ({dollars(terms.tradeInNew)} at
          age 0, falling in a straight line to nothing at age {terms.topAge}) minus the cost of the new vehicle ({dollars(terms.purchaseCost)}:
          the price plus {pct(values.TransactionCostFrac)} transaction cost and {dollars(values.FinancingCost)} financing), with that cost
          scaled down when the economic index is above the grid mean and up when it is below.
        </p>
        <p>
          Future years are discounted at {pct(values.d)} a year over an unlimited horizon. The best action in each state is the one with the
          highest value this year plus the discounted expected value of the years that follow.
        </p>
      </section>

      <section aria-labelledby="params-title" className="space-y-2">
        <SubHeading id="params-title">Parameters</SubHeading>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
          All values are illustrative and uncalibrated: they have not been fitted to observed holding periods or sales.{" "}
          <span className="font-semibold">Assumed</span> marks a value set in the assumptions panel for this demonstration;{" "}
          <span className="font-semibold">Illustrative</span> marks an ADOS 2026 v1c default.{" "}
          {echoed
            ? "Values are the ones the engine reports it used for this run."
            : view
              ? "The engine that answered this run does not report the values it used; the panel's values are shown with the ADOS 2026 v1c defaults for the rest."
              : "No run has been answered yet; the panel's values are shown with the ADOS 2026 v1c defaults for the rest."}
        </p>
        {/* Phones: one block per parameter. Wider screens and print: the table. */}
        <ul className="panel divide-y divide-slate-100 px-4 py-1 sm:hidden">
          {rows.map((row) => (
            <li key={row.label} className="space-y-1 py-2.5">
              <p className="text-sm font-medium text-slate-800">{row.label}</p>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-700">
                <span className="font-semibold tabular-nums text-slate-900">{row.value}</span>
                <span>{row.unit}</span>
                <ProvenanceTag provenance={row.provenance} />
              </p>
            </li>
          ))}
        </ul>
        <div className="panel hidden overflow-x-auto p-4 sm:block">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Parameter</th>
                <th scope="col" className="num">Value</th>
                <th scope="col">Unit</th>
                <th scope="col">Provenance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="font-medium">{row.label}</th>
                  <td className="num whitespace-nowrap">{row.value}</td>
                  <td className="whitespace-nowrap">{row.unit}</td>
                  <td>
                    <ProvenanceTag provenance={row.provenance} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="limits-title" className="max-w-3xl space-y-2 text-[15px] leading-relaxed text-slate-700">
        <SubHeading id="limits-title">Limitations</SubHeading>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            The policy is deterministic on a coarse grid: each state has one best action, so small input changes move whole states
            from one action to another and responses are lumpy.
          </li>
          <li>
            Reducing mileage is dominated at the default inputs
            {reduceStates === undefined ? "" : `; in this run it is the best action in ${reduceStates} of ${data?.summary.S} states`}.
          </li>
          <li>
            Sell is a first-owner trade-in plus a new-vehicle purchase, not scrappage; the model has no used-vehicle owners and no
            other buyers.
          </li>
          <li>Gasoline vehicles only: fuel cost is per gallon at a fuel economy in miles per gallon, and there are no other powertrains.</li>
          <li>
            Driving enjoyment of {dollars(values.EnjoyBase, 2)} a mile sets the scale of every value, so model values are not welfare
            estimates and are not shown on this page.
          </li>
        </ul>
      </section>

      <section aria-labelledby="refs-title" className="max-w-3xl space-y-2 text-[15px] leading-relaxed text-slate-700">
        <SubHeading id="refs-title">References</SubHeading>
        <ul className="space-y-1.5">
          {REFERENCES.map((reference) => (
            <li key={reference}>{reference}</li>
          ))}
        </ul>
      </section>

      {view && (
        <section aria-labelledby="run-title" className="max-w-3xl space-y-2">
          <SubHeading id="run-title">This run</SubHeading>
          <SourceLine attribution={view.attribution} />
          {view.warnings.length > 0 && (
            <details className="text-sm text-slate-700">
              <summary className="cursor-pointer font-medium text-slate-800">Notes returned by the RR Toolbox with this run ({view.warnings.length})</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
                {view.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
    </div>
  );
}
