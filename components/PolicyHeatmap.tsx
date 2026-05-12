"use client";

import { useMemo, useState } from "react";
import type { ActionName, SolveData } from "@/lib/types";

const ACTION_COLORS: Record<ActionName, string> = {
  drive: "#10b981", // emerald
  sell: "#e11d48", // rose
  reduce: "#f59e0b", // amber
};

const ACTION_LABELS: Record<ActionName, string> = {
  drive: "Drive",
  sell: "Sell",
  reduce: "Reduce",
};

/**
 * Heatmap of optimal action across (age, fuel price) for a fixed
 * (mpg, econ) slice. The user can step through mpg / econ slices.
 */
export function PolicyHeatmap({ data }: { data: SolveData }) {
  const { policy, dims, grids } = data;
  const [mpgIdx, setMpgIdx] = useState(Math.floor(dims.nMpg / 2));
  const [econIdx, setEconIdx] = useState(Math.floor(dims.nEcon / 2));

  const slice = useMemo(() => {
    const grid: { action: ActionName; cell: number }[][] = [];
    for (let ia = 0; ia < dims.nAge; ia++) {
      const row: { action: ActionName; cell: number }[] = [];
      for (let ifu = 0; ifu < dims.nFuel; ifu++) {
        const s =
          ((ia * dims.nMpg + mpgIdx) * dims.nFuel + ifu) * dims.nEcon + econIdx;
        const action = data.summary.actions[policy[s] - 1];
        row.push({ action, cell: s });
      }
      grid.push(row);
    }
    return grid;
  }, [data, dims, policy, mpgIdx, econIdx]);

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-wider font-semibold text-approve-700">
            Policy heatmap
          </div>
          <h3 className="mt-1 font-display text-lg font-bold text-ink-900">
            Optimal action by{" "}
            <span className="gradient-text-purple">age × fuel price</span>
          </h3>
          <p className="mt-1 text-[12.5px] text-ink-500">
            Slice fixed at <span className="kbd">mpg = {grids.mpg[mpgIdx].toFixed(1)}</span>{" "}
            <span className="kbd">econ = {grids.econ[econIdx].toFixed(0)}</span>
          </p>
        </div>
        <Legend />
      </div>

      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <SliceControl
          label="Fuel economy"
          values={grids.mpg}
          unit="mpg"
          idx={mpgIdx}
          onChange={setMpgIdx}
        />
        <SliceControl
          label="Economy index"
          values={grids.econ}
          idx={econIdx}
          onChange={setEconIdx}
        />
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="text-[10.5px] font-semibold text-ink-500 px-2 py-1 text-right">
                age \ $/gal
              </th>
              {grids.fuel.map((f) => (
                <th
                  key={f}
                  className="text-[10.5px] font-semibold text-ink-500 px-2 py-1"
                >
                  ${f.toFixed(2)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((row, ia) => (
              <tr key={ia}>
                <td className="text-[10.5px] font-semibold text-ink-500 pr-2 py-1 text-right">
                  {grids.age[ia]} y
                </td>
                {row.map(({ action, cell }) => (
                  <td
                    key={cell}
                    className="text-center"
                    title={`state ${cell + 1} → ${ACTION_LABELS[action]}`}
                  >
                    <div
                      className="h-7 w-12 rounded-md grid place-items-center text-[10px] font-bold text-white shadow-sm"
                      style={{ background: ACTION_COLORS[action] }}
                    >
                      {ACTION_LABELS[action][0]}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {(Object.keys(ACTION_COLORS) as ActionName[]).map((a) => (
        <span
          key={a}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink-700"
        >
          <span
            className="h-3 w-3 rounded-sm"
            style={{ background: ACTION_COLORS[a] }}
          />
          {ACTION_LABELS[a]}
        </span>
      ))}
    </div>
  );
}

function SliceControl({
  label,
  values,
  idx,
  unit,
  onChange,
}: {
  label: string;
  values: number[];
  idx: number;
  unit?: string;
  onChange: (i: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold text-ink-600">{label}</span>
      <div className="flex items-center gap-1">
        {values.map((v, i) => (
          <button
            key={i}
            onClick={() => onChange(i)}
            className={`text-[11px] font-semibold rounded-md px-2 py-1 transition ${
              i === idx
                ? "bg-approve-600 text-white"
                : "bg-ink-100 text-ink-600 hover:bg-approve-100 hover:text-approve-700"
            }`}
          >
            {Number.isInteger(v) ? v : v.toFixed(1)}
            {unit && i === idx ? ` ${unit}` : ""}
          </button>
        ))}
      </div>
    </div>
  );
}
