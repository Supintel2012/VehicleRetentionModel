"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { dimensionSentence, sliceAgeByEcon, sliceAgeByMpg, sliceSentence } from "@/lib/policy";
import { ageLabel, type Answers } from "@/lib/template";
import type { ActionName, SolveData } from "@/lib/types";
import { WithRun } from "../run";
import type { SolveState } from "../useSolve";
import { ACTION_TEXT, ActionLegend, Notice, SectionHeading, Segmented, SourceLine } from "../ui";

type View = "econ" | "mpg";

function indexOrMiddle(values: number[], value: number): number {
  const i = values.indexOf(value);
  return i >= 0 ? i : Math.floor(values.length / 2);
}

function Heatmap({
  data,
  view,
  fixedIdx,
  fuelIdx,
  outline,
}: {
  data: SolveData;
  view: View;
  fixedIdx: number;
  fuelIdx: number;
  /** Row and column of the inspected vehicle, when it lies in this slice. */
  outline: { row: number; col: number } | null;
}) {
  const grid = view === "econ" ? sliceAgeByEcon(data, fixedIdx, fuelIdx) : sliceAgeByMpg(data, fixedIdx, fuelIdx);
  const columns = view === "econ" ? data.grids.econ.map((e) => `Index ${e}`) : data.grids.mpg.map((m) => `${m} mpg`);
  const topAge = data.grids.age[data.dims.nAge - 1];
  const fuel = `$${data.grids.fuel[fuelIdx].toFixed(2)} a gallon`;
  const caption =
    view === "econ"
      ? `Best action by vehicle age (rows) and economic index (columns), at ${data.grids.mpg[fixedIdx]} mpg and ${fuel}`
      : `Best action by vehicle age (rows) and fuel economy (columns), at economic index ${data.grids.econ[fixedIdx]} and ${fuel}`;
  return (
    <table className="w-full max-w-2xl table-fixed border-separate border-spacing-1">
      <caption className="mb-2 text-left text-sm font-medium text-slate-700">{caption}</caption>
      <thead>
        <tr>
          <th scope="col" className="w-24 pb-1 text-left text-xs font-semibold text-slate-600 sm:w-28">
            Vehicle age
          </th>
          {columns.map((label) => (
            <th key={label} scope="col" className="pb-1 text-center text-xs font-semibold text-slate-600">
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {grid.map((row, ia) => (
          <tr key={ia}>
            <th scope="row" className="pr-1 text-left text-xs font-medium text-slate-700">
              {ageLabel(data.grids.age[ia], topAge)}
            </th>
            {row.map((action: ActionName, c) => {
              const selected = outline !== null && outline.row === ia && outline.col === c;
              return (
                <td key={c} className="p-0">
                  <div
                    className={clsx(
                      `cue-${action}`,
                      "flex h-7 items-center justify-center rounded-sm text-xs font-bold sm:h-8",
                      selected && "outline outline-[3px] outline-offset-1 outline-slate-900",
                    )}
                  >
                    <span aria-hidden>{ACTION_TEXT[action].letter}</span>
                    <span className="visually-hidden">
                      {ACTION_TEXT[action].name}
                      {selected ? " (vehicle to inspect)" : ""}
                    </span>
                  </div>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PolicyMapTab({ state, answers, onReset }: { state: SolveState; answers: Answers; onReset: () => void }) {
  const [view, setView] = useState<View>("econ");
  const [mpg, setMpg] = useState(answers.vehicle_mpg);
  const [econ, setEcon] = useState(answers.econ_now);
  const [fuel, setFuel] = useState(answers.fuel_price_now);

  // The slice follows the vehicle to inspect whenever that changes.
  useEffect(() => {
    setMpg(answers.vehicle_mpg);
    setEcon(answers.econ_now);
    setFuel(answers.fuel_price_now);
  }, [answers.vehicle_mpg, answers.econ_now, answers.fuel_price_now]);

  return (
    <div className="space-y-5">
      <SectionHeading eyebrow="Policy map">Best action by vehicle age and conditions</SectionHeading>
      <p className="max-w-3xl text-[15px] leading-relaxed text-slate-700">
        Each cell is the model&apos;s best action for a vehicle of that age under the conditions shown. The first view puts vehicle
        age against the economic index; the second puts it against fuel economy. The sentences under the map say, from this solve,
        which conditions change the age at which replacement starts.
      </p>
      <WithRun state={state} onReset={onReset}>
        {({ data, attribution }) => {
          const mpgIdx = indexOrMiddle(data.grids.mpg, mpg);
          const econIdx = indexOrMiddle(data.grids.econ, econ);
          const fuelIdx = indexOrMiddle(data.grids.fuel, fuel);
          const fixedIdx = view === "econ" ? mpgIdx : econIdx;
          const q = data.query_state?.matched;
          let outline: { row: number; col: number } | null = null;
          if (q && q.fuel_price === data.grids.fuel[fuelIdx]) {
            const row = data.grids.age.indexOf(q.age);
            if (view === "econ" && q.fuel_economy === data.grids.mpg[mpgIdx]) outline = { row, col: data.grids.econ.indexOf(q.econ_condition) };
            if (view === "mpg" && q.econ_condition === data.grids.econ[econIdx]) outline = { row, col: data.grids.mpg.indexOf(q.fuel_economy) };
          }
          return (
            <div className="space-y-5">
              <div className="no-print flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end md:gap-6">
                <Segmented
                  legend="View"
                  name="map-view"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: "econ", label: "Age × economic index" },
                    { value: "mpg", label: "Age × fuel economy" },
                  ]}
                />
                {view === "econ" ? (
                  <Segmented
                    legend="Fuel economy"
                    name="map-mpg"
                    value={data.grids.mpg[mpgIdx]}
                    onChange={setMpg}
                    options={data.grids.mpg.map((m) => ({ value: m, label: `${m} mpg` }))}
                  />
                ) : (
                  <Segmented
                    legend="Economic index"
                    name="map-econ"
                    value={data.grids.econ[econIdx]}
                    onChange={setEcon}
                    options={data.grids.econ.map((e) => ({ value: e, label: String(e) }))}
                  />
                )}
                <Segmented
                  legend="Fuel price (per gallon)"
                  name="map-fuel"
                  value={data.grids.fuel[fuelIdx]}
                  onChange={setFuel}
                  options={data.grids.fuel.map((f) => ({ value: f, label: `$${f.toFixed(2)}` }))}
                />
              </div>
              <div className="panel p-4">
                <Heatmap data={data} view={view} fixedIdx={fixedIdx} fuelIdx={fuelIdx} outline={outline} />
                <div className="mt-4 border-t border-slate-200 pt-3">
                  <ActionLegend />
                  <p className="mt-2 text-xs text-slate-500">
                    Sell cells are hatched and reduce cells dotted, so the map reads without color. The outlined cell is the
                    vehicle to inspect{outline ? "" : " (not in this slice)"}.
                  </p>
                </div>
              </div>
              <div className="space-y-2 text-[15px] leading-relaxed text-slate-800">
                <p>{sliceSentence(data, view, fixedIdx, fuelIdx)}</p>
                <Notice>{dimensionSentence(data)}</Notice>
              </div>
              <SourceLine attribution={attribution} />
            </div>
          );
        }}
      </WithRun>
    </div>
  );
}
