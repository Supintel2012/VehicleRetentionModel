"use client";

import { useMemo, useState } from "react";
import type { SolveData } from "@/lib/types";

/**
 * SVG visualization of the value function across (age, fuel price) for a
 * fixed (mpg, econ) slice. Each cell is colour-shaded by its value, with
 * the numeric value displayed for inspection.
 */
export function ValueSurface({ data }: { data: SolveData }) {
  const { value, dims, grids } = data;
  const [mpgIdx, setMpgIdx] = useState(Math.floor(dims.nMpg / 2));
  const [econIdx, setEconIdx] = useState(Math.floor(dims.nEcon / 2));

  const { matrix, vMin, vMax } = useMemo(() => {
    const m: number[][] = [];
    let vMin = Infinity;
    let vMax = -Infinity;
    for (let ia = 0; ia < dims.nAge; ia++) {
      const row: number[] = [];
      for (let ifu = 0; ifu < dims.nFuel; ifu++) {
        const s =
          ((ia * dims.nMpg + mpgIdx) * dims.nFuel + ifu) * dims.nEcon + econIdx;
        const v = value[s];
        if (v < vMin) vMin = v;
        if (v > vMax) vMax = v;
        row.push(v);
      }
      m.push(row);
    }
    return { matrix: m, vMin, vMax };
  }, [value, dims, mpgIdx, econIdx]);

  const range = vMax - vMin || 1;

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-wider font-semibold text-approve-700">
            Value function
          </div>
          <h3 className="mt-1 font-display text-lg font-bold text-ink-900">
            Expected{" "}
            <span className="gradient-text-coral">discounted value</span> per
            state
          </h3>
          <p className="mt-1 text-[12.5px] text-ink-500">
            Slice fixed at <span className="kbd">mpg = {grids.mpg[mpgIdx].toFixed(1)}</span>{" "}
            <span className="kbd">econ = {grids.econ[econIdx].toFixed(0)}</span>{" "}
            · range <span className="kbd">${formatK(vMin)} → ${formatK(vMax)}</span>
          </p>
        </div>
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
            {matrix.map((row, ia) => (
              <tr key={ia}>
                <td className="text-[10.5px] font-semibold text-ink-500 pr-2 py-1 text-right">
                  {grids.age[ia]} y
                </td>
                {row.map((v, ifu) => {
                  const t = (v - vMin) / range;
                  return (
                    <td key={ifu} className="text-center">
                      <div
                        className="h-7 w-16 rounded-md grid place-items-center text-[10px] font-semibold text-white shadow-sm"
                        style={{ background: heatColor(t) }}
                      >
                        ${formatK(v)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
                ? "bg-si-500 text-white"
                : "bg-ink-100 text-ink-600 hover:bg-si-100 hover:text-si-700"
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

/** Linearly interpolate from a cool purple to a warm coral as t goes 0→1. */
function heatColor(t: number): string {
  const clamp = Math.max(0, Math.min(1, t));
  const r = Math.round(91 + (224 - 91) * clamp);
  const g = Math.round(60 + (117 - 60) * clamp);
  const b = Math.round(234 + (85 - 234) * clamp);
  return `rgb(${r}, ${g}, ${b})`;
}

function formatK(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return v.toFixed(0);
}
