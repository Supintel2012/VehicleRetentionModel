"use client";

import { useId, useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { fittedAxis, niceTicks } from "@/lib/chart-scale";

/**
 * Interactive charts on Recharts: a crosshair that snaps to the nearest x
 * position and one tooltip listing every series there, reachable with the
 * pointer or with the keyboard (Tab to the chart, then the arrow keys step
 * through the positions). Every value is also in a table beside the chart, so
 * the tooltip adds a reading and never gates one. Marks are thin, the grid is
 * recessive, and the text wears the page's text colours, never the series
 * colour. Animation is off: the page respects reduced-motion settings and
 * prints the chart as it stands.
 */

const AXIS = "#94a3b8";
const GRID = "#e2e8f0";
const TEXT = "#475569";
const INK = "#0f172a";
const CURSOR = "#64748b";
const FONT = 12;

export interface ChartSeries {
  label: string;
  /** One value per x position; null is a gap (no vehicles at that age). */
  values: (number | null)[];
  color: string;
}

export interface LineChartSeries extends ChartSeries {
  dashed?: boolean;
  width?: number;
}

export interface BarChartSeries extends ChartSeries {
  style?: "solid" | "hatched";
}

type Row = Record<string, number | string | null>;

function rowsOf(categories: string[], series: ChartSeries[]): Row[] {
  return categories.map((category, i) => {
    const row: Row = { x: category };
    series.forEach((s, k) => {
      row[`s${k}`] = s.values[i] ?? null;
    });
    return row;
  });
}

/** The readout: values lead, the series name follows, keyed by a short stroke of the series colour. */
function Readout({
  active,
  label,
  rows,
  series,
  format,
  xLabel,
  missing,
}: Pick<TooltipContentProps<number, string>, "active" | "label"> & {
  rows: Row[];
  series: ChartSeries[];
  format: (value: number) => string;
  xLabel: string;
  missing: string;
}) {
  if (!active || label === undefined) return null;
  const row = rows.find((r) => r.x === label);
  if (!row) return null;
  return (
    <div className="rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm shadow-card" role="status">
      <p className="mb-1 font-semibold text-slate-900">
        {xLabel} {String(label)}
      </p>
      <ul className="space-y-0.5">
        {series.map((s, k) => {
          const value = row[`s${k}`];
          return (
            <li key={s.label} className="flex items-center gap-2 whitespace-nowrap">
              <svg width="16" height="6" aria-hidden className="shrink-0">
                <line x1="0" y1="3" x2="16" y2="3" stroke={s.color} strokeWidth="3" />
              </svg>
              <span className="font-semibold tabular-nums text-slate-900">{typeof value === "number" ? format(value) : missing}</span>
              <span className="text-slate-600">{s.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Lines over an ordered axis (vehicle ages or years). The value axis is either
 * given (`yDomain`) or fitted to the data: at least `minSpan` wide, never
 * below `floor`, with no repeated tick labels.
 */
export function SeriesLineChart({
  categories,
  series,
  format,
  yLabel,
  xLabel,
  yDomain,
  minSpan,
  floor,
  height = 280,
  missing = "no vehicles",
}: {
  categories: string[];
  series: LineChartSeries[];
  format: (value: number) => string;
  yLabel: string;
  xLabel: string;
  yDomain?: [number, number];
  minSpan?: number;
  floor?: number;
  height?: number;
  /** What the readout says for a gap. */
  missing?: string;
}) {
  const rows = useMemo(() => rowsOf(categories, series), [categories, series]);
  const axis = useMemo(() => {
    if (yDomain) return { lo: yDomain[0], hi: yDomain[1], ticks: niceTicks(yDomain[0], yDomain[1], 4) };
    const values = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
    return fittedAxis(values, format, { minSpan, floor });
  }, [series, format, yDomain, minSpan, floor]);
  return (
    <div className="w-full min-w-0">
      <p className="mb-1 text-xs text-slate-600">{yLabel}</p>
      <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 640, height }}>
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 24, left: 4 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="x"
            stroke={AXIS}
            tick={{ fill: TEXT, fontSize: FONT }}
            tickLine={false}
            label={{ value: xLabel, position: "insideBottom", offset: -14, fill: TEXT, fontSize: FONT }}
          />
          <YAxis
            domain={[axis.lo, axis.hi]}
            ticks={axis.ticks}
            tickFormatter={format}
            stroke={AXIS}
            tick={{ fill: TEXT, fontSize: FONT }}
            tickLine={false}
            axisLine={false}
            width={52}
          />
          <Tooltip
            cursor={{ stroke: CURSOR, strokeDasharray: "3 3" }}
            isAnimationActive={false}
            content={(props) => <Readout {...props} rows={rows} series={series} format={format} xLabel={xLabel} missing={missing} />}
          />
          {series.map((s, k) => (
            <Line
              key={s.label}
              dataKey={`s${k}`}
              name={s.label}
              type="linear"
              stroke={s.color}
              strokeWidth={s.width ?? 2}
              strokeDasharray={s.dashed ? "6 4" : undefined}
              dot={{ r: 3, fill: "#fff", stroke: s.color, strokeWidth: 1.5 }}
              activeDot={{ r: 6, fill: s.color, stroke: "#fff", strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-1 text-xs text-slate-500">Point at an age or year for every value there, or press Tab to the chart and use the arrow keys.</p>
    </div>
  );
}

/** Grouped vertical bars over categories; values are shares, so the axis runs 0 to `yMax`. */
export function SeriesBarChart({
  categories,
  series,
  format,
  yLabel,
  xLabel,
  yMax = 1,
  height = 260,
  missing = "no vehicles",
}: {
  categories: string[];
  series: BarChartSeries[];
  format: (value: number) => string;
  yLabel: string;
  xLabel: string;
  yMax?: number;
  height?: number;
  missing?: string;
}) {
  const rows = useMemo(() => rowsOf(categories, series), [categories, series]);
  const base = useId().replace(/:/g, "");
  const ticks = useMemo(() => niceTicks(0, yMax, 4), [yMax]);
  return (
    <div className="w-full min-w-0">
      <p className="mb-1 text-xs text-slate-600">{yLabel}</p>
      <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 640, height }}>
        <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 24, left: 4 }} barCategoryGap="22%" barGap={2}>
          <defs>
            {series.map((s, k) => (
              <pattern key={k} id={`${base}-h${k}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="#ffffff" />
                <line x1="0" y1="0" x2="0" y2="6" stroke={s.color} strokeWidth="2.5" />
              </pattern>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="x"
            stroke={AXIS}
            tick={{ fill: TEXT, fontSize: FONT }}
            tickLine={false}
            label={{ value: xLabel, position: "insideBottom", offset: -14, fill: TEXT, fontSize: FONT }}
          />
          <YAxis
            domain={[0, yMax]}
            ticks={ticks}
            tickFormatter={format}
            stroke={AXIS}
            tick={{ fill: TEXT, fontSize: FONT }}
            tickLine={false}
            axisLine={false}
            width={52}
          />
          <Tooltip
            cursor={{ fill: "rgba(148, 163, 184, 0.15)" }}
            isAnimationActive={false}
            content={(props) => <Readout {...props} rows={rows} series={series} format={format} xLabel={xLabel} missing={missing} />}
          />
          {series.map((s, k) => (
            <Bar
              key={s.label}
              dataKey={`s${k}`}
              name={s.label}
              fill={s.style === "hatched" ? `url(#${base}-h${k})` : s.color}
              stroke={s.color}
              strokeWidth={1}
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
              activeBar={{ stroke: INK, strokeWidth: 1.5 }}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-1 text-xs text-slate-500">Point at a bar for every value at that age, or press Tab to the chart and use the arrow keys.</p>
    </div>
  );
}
