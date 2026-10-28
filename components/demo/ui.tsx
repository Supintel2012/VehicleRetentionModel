"use client";

import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { AlertTriangle, Check, Copy, Loader2, RotateCcw } from "lucide-react";
import type { ActionName } from "@/lib/types";

export const ACTION_TEXT: Record<ActionName, { letter: string; name: string; meaning: string }> = {
  drive: { letter: "D", name: "Drive", meaning: "keep the vehicle and drive the standard miles" },
  sell: { letter: "S", name: "Sell", meaning: "trade it in and buy a new vehicle" },
  reduce: { letter: "R", name: "Reduce", meaning: "keep the vehicle and drive fewer miles" },
};

/** Letter on the action's color and pattern: readable without color. */
export function ActionChip({ action, className }: { action: ActionName; className?: string }) {
  return (
    <span
      className={clsx(`cue-${action}`, "inline-flex h-6 min-w-6 items-center justify-center rounded px-1 text-xs font-bold", className)}
      aria-hidden
    >
      {ACTION_TEXT[action].letter}
    </span>
  );
}

export function ActionLegend({ actions = ["drive", "sell", "reduce"] }: { actions?: ActionName[] }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-700" aria-label="Legend">
      {actions.map((action) => (
        <li key={action} className="flex items-center gap-2">
          <ActionChip action={action} />
          <span>
            <span className="font-semibold text-slate-900">{ACTION_TEXT[action].name}</span>: {ACTION_TEXT[action].meaning}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SectionHeading({ id, children, eyebrow }: { id?: string; children: ReactNode; eyebrow?: string }) {
  return (
    <div className="space-y-1">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2 id={id} className="text-xl font-semibold leading-snug text-slate-900 sm:text-2xl">
        {children}
      </h2>
    </div>
  );
}

export function SubHeading({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h3 id={id} className="text-base font-semibold text-slate-900">
      {children}
    </h3>
  );
}

export function Stat({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className="panel keep-together flex flex-col gap-1 p-4">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="text-2xl font-semibold tracking-tight tabular-nums text-slate-900">{value}</p>
      {detail && <p className="text-sm leading-snug text-slate-600">{detail}</p>}
    </div>
  );
}

/** The RR Toolbox provenance line, verbatim, under each set of results. */
export function SourceLine({ attribution }: { attribution: string }) {
  return <p className="text-xs leading-relaxed text-slate-500">{attribution}</p>;
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "caution" }) {
  return (
    <div
      className={clsx(
        "rounded-md border-l-4 px-4 py-3 text-sm leading-relaxed",
        tone === "caution" ? "border-amber-500 bg-amber-50 text-slate-800" : "border-accent-600 bg-accent-50 text-slate-800",
      )}
    >
      {children}
    </div>
  );
}

export function LoadingNotice({ children = "Solving the model with the Rapid Recursive® Toolbox…" }: { children?: ReactNode }) {
  return (
    <div className="panel flex items-center gap-3 p-6 text-sm text-slate-600" role="status">
      <Loader2 className="h-5 w-5 animate-spin text-accent-700 motion-reduce:animate-none" aria-hidden />
      {children}
    </div>
  );
}

export function ErrorNotice({ message, onRetry, onReset }: { message: string; onRetry: () => void; onReset?: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-5" role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden />
        <div className="space-y-3">
          <p className="font-semibold text-red-900">The model could not be solved.</p>
          <p className="text-sm text-red-900">{message}</p>
          <div className="no-print flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={onRetry}>
              <RotateCcw className="h-4 w-4" aria-hidden />
              Try again
            </button>
            {onReset && (
              <button type="button" className="btn btn-secondary" onClick={onReset}>
                Reset to defaults
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2_000);
  }
  return (
    <button type="button" onClick={copy} className={clsx("btn btn-secondary no-print", className)} aria-label={label}>
      {state === "copied" ? <Check className="h-4 w-4 text-green-700" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Copy failed: select and copy" : "Copy"}</span>
    </button>
  );
}

/** A radio group drawn as segmented buttons. */
export function Segmented<T extends string | number>({
  legend,
  options,
  value,
  onChange,
  name,
}: {
  legend: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  name: string;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-sm font-medium text-slate-700">{legend}</legend>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => {
          const id = `${name}-${option.value}`;
          const checked = option.value === value;
          return (
            <label
              key={id}
              htmlFor={id}
              className={clsx(
                "cursor-pointer rounded-md border px-2.5 py-1 text-sm font-medium transition-colors",
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-600",
                checked ? "border-accent-700 bg-accent-700 text-white" : "border-slate-300 bg-white text-slate-800 hover:border-slate-400",
              )}
            >
              <input
                id={id}
                type="radio"
                name={name}
                className="sr-only"
                checked={checked}
                onChange={() => onChange(option.value)}
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
