"use client";

import { useEffect, useId, useState } from "react";
import clsx from "clsx";
import { ChevronDown, Loader2, RotateCcw } from "lucide-react";
import { formatFieldValue, inUseMessage, mileageError, parseFieldText } from "@/lib/fields";
import type { SolveStatus } from "@/lib/solve-plan";
import { ageLabel, VEHICLE_RETENTION_TEMPLATE, type Answers } from "@/lib/template";
import type { Field } from "@/lib/types";

const template = VEHICLE_RETENTION_TEMPLATE;

/**
 * A typed number, used when the field is left or Enter is pressed (Escape
 * restores the value in use). Nothing is solved while typing: "60000" passes
 * through "6000", and committing each keystroke would solve the model at an
 * input nobody entered. A value that cannot be used is reported, and the last
 * committed value stays in use.
 */
function NumberField({
  field,
  value,
  onCommit,
}: {
  field: Field;
  value: number;
  /** Use the value; returns why it cannot be used, or null. */
  onCommit: (value: number) => string | null;
}) {
  const id = useId();
  const [draft, setDraft] = useState(() => formatFieldValue(field, value));
  const [error, setError] = useState<string | null>(null);

  // A reset (or any outside change) replaces the text unless it already reads as that value.
  useEffect(() => {
    setDraft((current) => {
      const parsed = parseFieldText(field, current);
      return "value" in parsed && parsed.value === value ? current : formatFieldValue(field, value);
    });
    setError(null);
  }, [field, value]);

  function commit() {
    const parsed = parseFieldText(field, draft);
    if (!("value" in parsed)) {
      setError(inUseMessage(field, parsed.error, value));
      return;
    }
    const refused = parsed.value === value ? null : onCommit(parsed.value);
    if (refused) {
      setError(inUseMessage(field, refused, value));
      return;
    }
    setDraft(formatFieldValue(field, parsed.value));
    setError(null);
  }

  const describedBy = [field.help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {field.prompt}
      </label>
      <div className="relative">
        {field.unit === "$" && <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-slate-500">$</span>}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          className={clsx("field-input tabular-nums", field.unit === "$" && "pl-6", field.unit && field.unit !== "$" && "pr-16")}
          value={draft}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            } else if (event.key === "Escape") {
              setDraft(formatFieldValue(field, value));
              setError(null);
            }
          }}
          onBlur={commit}
        />
        {field.unit && field.unit !== "$" && (
          <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-slate-500">
            {field.unit === "%" ? "% a year" : field.unit}
          </span>
        )}
      </div>
      {field.help && (
        <p id={`${id}-help`} className="text-xs text-slate-500">
          {field.help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function SelectField({ field, value, onCommit }: { field: Field; value: number; onCommit: (value: number) => void }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {field.prompt}
      </label>
      <select
        id={id}
        className="field-input"
        value={value}
        aria-describedby={field.help ? `${id}-help` : undefined}
        onChange={(event) => onCommit(Number(event.target.value))}
      >
        {field.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {field.help && (
        <p id={`${id}-help`} className="text-xs text-slate-500">
          {field.help}
        </p>
      )}
    </div>
  );
}

/** One line per group, for the collapsed phone view and the printed page. */
export function assumptionSummary(answers: Answers): { owner: string; vehicle: string } {
  return {
    owner:
      `${answers.std_miles.toLocaleString("en-US")} standard miles, ${answers.reduced_miles.toLocaleString("en-US")} reduced; ` +
      `new vehicle $${answers.new_car_price.toLocaleString("en-US")}; insurance and tax $${answers.fixed_cost.toLocaleString("en-US")} a year; ` +
      `discount rate ${answers.discount_rate}%`,
    vehicle:
      `${ageLabel(answers.vehicle_age)}, ${answers.vehicle_mpg} mpg, fuel $${answers.fuel_price_now.toFixed(2)} a gallon, ` +
      `economic index ${answers.econ_now}`,
  };
}

export function AssumptionsPanel({
  answers,
  onChange,
  onReset,
  status,
}: {
  answers: Answers;
  onChange: (id: string, value: number) => void;
  onReset: () => void;
  status: SolveStatus;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const summary = assumptionSummary(answers);

  /** Use a typed value unless it breaks the mileage rule; returns the reason it was refused. */
  function commit(id: string, value: number): string | null {
    if (id === "std_miles" || id === "reduced_miles") {
      const refused = mileageError(id, { std_miles: answers.std_miles, reduced_miles: answers.reduced_miles, [id]: value });
      if (refused) return refused;
    }
    onChange(id, value);
    return null;
  }

  return (
    <aside aria-labelledby="assumptions-title" className="no-print lg:sticky lg:top-4 lg:self-start">
      <div className="panel p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="assumptions-title" className="text-base font-semibold text-slate-900">
            Assumptions
          </h2>
          <p className="flex items-center gap-1.5 text-xs text-slate-600" role="status" aria-live="polite">
            {status === "solving" && <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />}
            {status === "solving" ? "Solving…" : status === "solved" ? "Results are current" : status === "error" ? "Not solved" : ""}
          </p>
        </div>
        <div className="mt-2 lg:hidden">
          <p className="text-sm text-slate-700">{summary.owner}</p>
          <p className="mt-1 text-sm text-slate-700">Vehicle: {summary.vehicle}</p>
          <button
            type="button"
            className="btn btn-secondary mt-3 w-full"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((o) => !o)}
          >
            <ChevronDown className={clsx("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden />
            {open ? "Hide assumptions" : "Change assumptions"}
          </button>
        </div>
        <div id={bodyId} className={clsx("mt-4 space-y-5", open ? "block" : "hidden lg:block")}>
          {template.steps.map((group) => (
            <fieldset key={group.id} className="space-y-3">
              <legend className="eyebrow mb-1">{group.title}</legend>
              {group.intro && <p className="text-xs leading-snug text-slate-500">{group.intro}</p>}
              {group.questions.map((field) =>
                field.type === "select" ? (
                  <SelectField key={field.id} field={field} value={answers[field.id]} onCommit={(v) => onChange(field.id, v)} />
                ) : (
                  <NumberField key={field.id} field={field} value={answers[field.id]} onCommit={(v) => commit(field.id, v)} />
                ),
              )}
            </fieldset>
          ))}
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <button type="button" className="btn btn-secondary w-full" onClick={onReset}>
              <RotateCcw className="h-4 w-4" aria-hidden />
              Reset to defaults
            </button>
            <p className="text-xs leading-snug text-slate-500">
              The defaults are the ADOS 2026 v1c values, except reduced miles (12,000 here; the engine uses 8,000). All values are illustrative and uncalibrated. A typed value is used when
              you press Enter or leave the field, and the model is then solved again.
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
