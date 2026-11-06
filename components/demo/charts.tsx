"use client";

import { useId } from "react";
import clsx from "clsx";

/**
 * The chart chrome drawn by hand: the legend above each chart and the
 * percent-change bars of the scenario screen. The line and bar charts
 * themselves are in charts-interactive.tsx.
 */

export type SeriesStyle = "solid" | "hatched";

function Swatch({ color, style, patternId }: { color: string; style: SeriesStyle; patternId: string }) {
  return (
    <svg width="18" height="12" aria-hidden className="shrink-0">
      <rect x="0.5" y="0.5" width="17" height="11" fill={style === "solid" ? color : `url(#${patternId})`} stroke={color} />
    </svg>
  );
}

function Hatch({ id, color }: { id: string; color: string }) {
  return (
    <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" fill="#ffffff" />
      <line x1="0" y1="0" x2="0" y2="6" stroke={color} strokeWidth="2.5" />
    </pattern>
  );
}

export function ChartLegend({ items }: { items: { label: string; color: string; style?: SeriesStyle; line?: "solid" | "dashed"; marker?: "circle" | "square" }[] }) {
  const base = useId().replace(/:/g, "");
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-slate-700" aria-hidden>
      {items.map((item, i) => (
        <li key={item.label} className="flex items-center gap-2">
          {item.line ? (
            <svg width="28" height="12" className="shrink-0">
              <line x1="1" y1="6" x2="27" y2="6" stroke={item.color} strokeWidth="2.5" strokeDasharray={item.line === "dashed" ? "5 3" : undefined} />
              {item.marker === "square" ? <rect x="10.5" y="2.5" width="7" height="7" fill={item.color} /> : <circle cx="14" cy="6" r="3.5" fill="#fff" stroke={item.color} strokeWidth="2" />}
            </svg>
          ) : (
            <>
              <svg width="0" height="0" className="absolute">
                <defs>
                  <Hatch id={`${base}-${i}`} color={item.color} />
                </defs>
              </svg>
              <Swatch color={item.color} style={item.style ?? "solid"} patternId={`${base}-${i}`} />
            </>
          )}
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Horizontal bars around zero for a few percent changes, each labelled above
 * its bar with the value written out; assistive technology reads the labels
 * and values, and the bars are decorative.
 */
export function ChangeBars({
  rows,
  format,
  labelledBy,
}: {
  rows: { label: string; value: number | null; tone: "model" | "static" }[];
  format: (value: number | null) => string;
  labelledBy: string;
}) {
  const span = Math.max(...rows.map((r) => Math.abs(r.value ?? 0)), 1e-9) * 1.05;
  return (
    <div role="group" aria-labelledby={labelledBy} className="space-y-3">
      {rows.map((row) => {
        const share = row.value === null ? 0 : Math.abs(row.value) / span / 2;
        const negative = (row.value ?? 0) < 0;
        return (
          <div key={row.label} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm leading-tight text-slate-700">{row.label}</span>
              <span className="text-sm font-semibold tabular-nums text-slate-900">{format(row.value)}</span>
            </div>
            <div className="relative h-4 rounded-sm bg-slate-100" aria-hidden>
              <div className="absolute inset-y-0 left-1/2 w-px bg-slate-500" />
              {row.value !== null && (
                <div
                  className={clsx(
                    "absolute inset-y-0.5",
                    row.tone === "model" ? "bg-accent-700" : "border border-slate-500 bg-[repeating-linear-gradient(135deg,#64748b_0_2px,#ffffff_2px_6px)]",
                  )}
                  style={negative ? { right: "50%", width: `${share * 100}%` } : { left: "50%", width: `${share * 100}%` }}
                />
              )}
            </div>
          </div>
        );
      })}
      <div className="flex justify-between text-xs text-slate-500" aria-hidden>
        <span>Fewer purchases</span>
        <span>0</span>
        <span>More purchases</span>
      </div>
    </div>
  );
}
