"use client";

import { useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";
import { fittedAxis, niceTicks } from "@/lib/chart-scale";

/**
 * Small hand-drawn SVG charts. Each is laid out at the measured pixel width of
 * its container, so text stays at a readable size from phone to desktop; when
 * the container narrows without a re-measure (a printed page) the drawing
 * shrinks to fit through its viewBox, and it is never enlarged. Each is
 * paired with a table of the same numbers on the page.
 */

const AXIS = "#94a3b8";
const GRID = "#e2e8f0";
const TEXT = "#475569";

/** The element's width in pixels, or null before it has been measured (nothing is drawn until then). */
export function useMeasuredWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const measured = Math.floor(element.getBoundingClientRect().width);
      // A hidden tab measures 0; keep the last width until it is shown again.
      if (measured > 0) setWidth(Math.max(240, measured));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export type SeriesStyle = "solid" | "hatched";

export interface BarSeries {
  label: string;
  values: (number | null)[];
  color: string;
  style: SeriesStyle;
}

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
 * Grouped vertical bars over categories (vehicle ages). Values are shares
 * (0-1); a null value is drawn as a short dash on the axis ("no vehicles").
 */
export function GroupedBarChart({
  categories,
  series,
  yMax = 1,
  yLabel,
  xLabel,
  format,
  height = 260,
  labelledBy,
}: {
  categories: string[];
  series: BarSeries[];
  yMax?: number;
  yLabel: string;
  xLabel: string;
  format: (value: number) => string;
  height?: number;
  labelledBy: string;
}) {
  const [ref, measured] = useMeasuredWidth<HTMLDivElement>();
  const base = useId().replace(/:/g, "");
  const width = measured ?? 0;
  const margin = { top: 30, right: 8, bottom: 44, left: 44 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const groupW = plotW / categories.length;
  const barW = Math.max(3, (groupW * 0.78) / series.length);
  const y = (v: number) => margin.top + plotH - (v / yMax) * plotH;
  const ticks = niceTicks(0, yMax, 4);
  const showValues = barW >= 26;

  if (measured === null) return <div ref={ref} className="w-full min-w-0 overflow-hidden" style={{ height }} />;
  return (
    <div ref={ref} className="w-full min-w-0">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={labelledBy}
        className="block h-auto max-w-full tabular-nums"
      >
        <defs>
          {series.map((s, i) => (
            <Hatch key={i} id={`${base}-h${i}`} color={s.color} />
          ))}
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={margin.left} x2={width - margin.right} y1={y(t)} y2={y(t)} stroke={GRID} />
            <text x={margin.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize="12" fill={TEXT}>
              {format(t)}
            </text>
          </g>
        ))}
        <text x={0} y={12} fontSize="12" fill={TEXT}>
          {yLabel}
        </text>
        {categories.map((category, c) => {
          const groupX = margin.left + c * groupW + (groupW - barW * series.length) / 2;
          return (
            <g key={category}>
              {series.map((s, i) => {
                const value = s.values[c];
                const x = groupX + i * barW;
                if (value === null || value === undefined) {
                  return <line key={i} x1={x + 1} x2={x + barW - 1} y1={y(0) - 1.5} y2={y(0) - 1.5} stroke={AXIS} strokeWidth="2" />;
                }
                const top = y(Math.max(0, Math.min(value, yMax)));
                return (
                  <g key={i}>
                    <rect
                      x={x + 0.5}
                      y={top}
                      width={Math.max(1, barW - 1.5)}
                      height={Math.max(0, y(0) - top)}
                      fill={s.style === "solid" ? s.color : `url(#${base}-h${i})`}
                      stroke={value > 0 ? s.color : "none"}
                      strokeWidth="1"
                    />
                    {showValues && value > 0 && (
                      <text x={x + barW / 2} y={top - 4} textAnchor="middle" fontSize="11" fill="#0f172a">
                        {format(value)}
                      </text>
                    )}
                  </g>
                );
              })}
              <text x={margin.left + c * groupW + groupW / 2} y={y(0) + 16} textAnchor="middle" fontSize="12" fill={TEXT}>
                {category}
              </text>
            </g>
          );
        })}
        <line x1={margin.left} x2={width - margin.right} y1={y(0)} y2={y(0)} stroke={AXIS} />
        <text x={margin.left + plotW / 2} y={height - 6} textAnchor="middle" fontSize="12" fill={TEXT}>
          {xLabel}
        </text>
      </svg>
    </div>
  );
}

export interface LineSeries {
  label: string;
  values: number[];
  color: string;
  dashed?: boolean;
  marker: "circle" | "square";
}

/**
 * Lines over years 1..n. The value axis is fitted to the data (see
 * fittedAxis): at least `minSpan` wide, never below `floor`, with no repeated
 * tick labels.
 */
export function LineChart({
  years,
  series,
  format,
  yLabel,
  minSpan,
  floor,
  height = 260,
  labelledBy,
}: {
  years: number[];
  series: LineSeries[];
  format: (value: number) => string;
  yLabel: string;
  minSpan?: number;
  floor?: number;
  height?: number;
  labelledBy: string;
}) {
  const [ref, measured] = useMeasuredWidth<HTMLDivElement>();
  const width = measured ?? 0;
  const margin = { top: 30, right: 16, bottom: 40, left: 56 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const { lo, hi, ticks } = fittedAxis(
    series.flatMap((s) => s.values),
    format,
    { minSpan, floor },
  );
  const x = (i: number) => margin.left + (years.length === 1 ? plotW / 2 : (i / (years.length - 1)) * plotW);
  const y = (v: number) => margin.top + plotH - ((v - lo) / (hi - lo)) * plotH;

  if (measured === null) return <div ref={ref} className="w-full min-w-0 overflow-hidden" style={{ height }} />;
  return (
    <div ref={ref} className="w-full min-w-0">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={labelledBy}
        className="block h-auto max-w-full tabular-nums"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={margin.left} x2={width - margin.right} y1={y(t)} y2={y(t)} stroke={GRID} />
            <text x={margin.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize="12" fill={TEXT}>
              {format(t)}
            </text>
          </g>
        ))}
        <text x={0} y={12} fontSize="12" fill={TEXT}>
          {yLabel}
        </text>
        {years.map((year, i) => (
          <text key={year} x={x(i)} y={margin.top + plotH + 16} textAnchor="middle" fontSize="12" fill={TEXT}>
            {year}
          </text>
        ))}
        <text x={margin.left + plotW / 2} y={height - 6} textAnchor="middle" fontSize="12" fill={TEXT}>
          Year
        </text>
        <line x1={margin.left} x2={width - margin.right} y1={margin.top + plotH} y2={margin.top + plotH} stroke={AXIS} />
        {series.map((s) => (
          <g key={s.label}>
            <polyline
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth="2.5"
              strokeDasharray={s.dashed ? "6 4" : undefined}
            />
            {s.values.map((v, i) =>
              s.marker === "square" ? (
                <rect key={i} x={x(i) - 3.5} y={y(v) - 3.5} width="7" height="7" fill={s.color} />
              ) : (
                <circle key={i} cx={x(i)} cy={y(v)} r="3.5" fill="#fff" stroke={s.color} strokeWidth="2" />
              ),
            )}
          </g>
        ))}
      </svg>
    </div>
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
