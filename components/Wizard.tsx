"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Car,
  CheckCircle2,
  Cpu,
  HelpCircle,
  Loader2,
  RotateCcw,
  Sparkles,
  Wand2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { solveVehicleRetention } from "@/lib/client";
import { VEHICLE_RETENTION_TEMPLATE, buildSolveBody } from "@/lib/template";
import type {
  ActionName,
  Question,
  Reveal,
  SolveData,
  WizardStep,
} from "@/lib/types";
import { PolicyHeatmap } from "./PolicyHeatmap";
import { ValueSurface } from "./ValueSurface";

type Answers = Record<string, string | number | boolean>;
type Phase = "interview" | "review" | "solving" | "solved";

const ACTION_COPY: Record<ActionName, { title: string; tone: string; verb: string }> = {
  drive: { title: "Drive", tone: "action-drive", verb: "Keep driving the vehicle as planned." },
  sell: { title: "Sell", tone: "action-sell", verb: "Sell now and replace with a newer vehicle." },
  reduce: { title: "Reduce", tone: "action-reduce", verb: "Cut back on miles to lower variable cost." },
};

const TECH_DEMO_DISCLAIMER =
  "This is a technology demonstration, not a forecast. <br />Inputs are illustrative and are not intended to represent any specific cohort of buyers or time period. <br />Contact Supported Intelligence LLC for information on licensing the model for use with specific inputs.";

export function Wizard() {
  const template = VEHICLE_RETENTION_TEMPLATE;
  const [answers, setAnswers] = useState<Answers>(seedDefaults(template.steps));
  const [stepIdx, setStepIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("interview");
  const [solveData, setSolveData] = useState<SolveData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentStep = template.steps[stepIdx];
  const visible = useMemo(
    () => currentStep.questions.filter((q) => isVisible(q.revealsIf, answers)),
    [currentStep, answers],
  );
  const stepIsValid = useMemo(
    () => visible.filter((q) => q.required).every((q) => isAnswered(answers[q.id])),
    [visible, answers],
  );

  function patch(id: string, value: Answers[string]) {
    setAnswers((a) => ({ ...a, [id]: value }));
  }
  function next() {
    if (stepIdx < template.steps.length - 1) setStepIdx((i) => i + 1);
    else setPhase("review");
  }
  function back() {
    if (phase === "review") setPhase("interview");
    else if (stepIdx > 0) setStepIdx((i) => i - 1);
  }
  function loadSample() {
    setAnswers({ ...template.sample_answers });
    setStepIdx(0);
    setPhase("interview");
    setSolveData(null);
    setError(null);
  }
  function reset() {
    setAnswers(seedDefaults(template.steps));
    setStepIdx(0);
    setPhase("interview");
    setSolveData(null);
    setError(null);
  }

  async function solve() {
    setPhase("solving");
    setError(null);
    try {
      const body = buildSolveBody(template, answers);
      const r = await solveVehicleRetention(body);
      setSolveData(r.data);
      setPhase("solved");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("review");
    }
  }

  return (
    <div className="space-y-6">
      <Header onSample={loadSample} onReset={reset} />
      <Stepper steps={template.steps} currentStep={stepIdx} phase={phase} />

      <div className="grid lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 space-y-4">
          <AnimatePresence mode="wait">
            {phase === "interview" && (
              <motion.div
                key={`step-${stepIdx}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                <StepCard
                  step={currentStep}
                  questions={visible}
                  answers={answers}
                  onChange={patch}
                />
              </motion.div>
            )}

            {(phase === "review" || phase === "solving" || phase === "solved") && (
              <motion.div
                key="review"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
              >
                <ReviewPanel
                  template={template}
                  answers={answers}
                  onEdit={(qid) => {
                    setPhase("interview");
                    const idx = template.steps.findIndex((s) =>
                      s.questions.some((q) => q.id === qid),
                    );
                    if (idx >= 0) setStepIdx(idx);
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {phase === "solved" && solveData && (
            <RecommendationCard data={solveData} />
          )}

          {phase === "interview" && (
            <NavBar
              onBack={stepIdx === 0 ? undefined : back}
              onNext={next}
              nextLabel={
                stepIdx === template.steps.length - 1
                  ? "Review answers"
                  : "Next step"
              }
              nextDisabled={!stepIsValid}
              nextIcon={<ArrowRight className="h-3.5 w-3.5" />}
            />
          )}

          {phase === "review" && (
            <NavBar
              onBack={back}
              onNext={solve}
              nextLabel="Solve · POST /vehicle-retention/solve"
              nextIcon={<Cpu className="h-3.5 w-3.5" />}
            />
          )}

          {phase === "solving" && (
            <div className="card p-4 flex items-center gap-2 text-ink-500 text-[13px]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Solving · POST <code className="font-mono">/vehicle-retention/solve</code>
            </div>
          )}

          {error && (
            <div className="card p-4 bg-rose-50 border-rose-200 text-rose-700 text-[13px]">
              {error}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 space-y-4">
          <LiveStatePanel answers={answers} solveData={solveData} />
        </div>
      </div>

      {phase === "solved" && solveData && (
        <div className="grid lg:grid-cols-2 gap-5">
          <PolicyHeatmap data={solveData} />
          <ValueSurface data={solveData} />
        </div>
      )}
    </div>
  );
}

// ── Header / stepper / navigation ───────────────────────────────────────────

function Header({ onSample, onReset }: { onSample: () => void; onReset: () => void }) {
  return (
    <div className="mt-0 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-center gap-2 text-[12px] text-ink-500">
          <Car className="h-3.5 w-3.5 shrink-0" />
          <span className="text-ink-900 font-semibold">
            ADOS 2026 v1c · Auto Drive-or-Sell™
          </span>
        </div>
        <div>
          <span className="chip chip-coral">
            <Sparkles className="h-3 w-3" />
            Interview-style guided UX · progressive disclosure
          </span>
          <h1 className="mt-2 font-display text-2xl md:text-3xl font-bold text-ink-900 leading-tight">
            Vehicle Retention Model ·{" "}
            <span className="gradient-text-purple">drive · sell · reduce</span>
          </h1>
          <p className="mt-1.5 text-ink-600 text-[14px] leading-relaxed max-w-2xl">
            Solve the 4-D Auto Drive-or-Sell™ decision MDP for your specific
            vehicle. Answers feed a live{" "}
            <code className="font-mono kbd">policy iteration</code> solve over
            sparse Kronecker-product transitions, and you get back the optimal
            action plus the full policy + value surface.
          </p>
        </div>
      </div>
      <div className="flex w-full shrink-0 flex-col items-end gap-2 lg:max-w-[min(100%,22rem)] xl:max-w-md">
        <p
          className="text-right text-[10px] leading-snug text-ink-500 sm:text-[11px]"
          role="note"
        >
          {TECH_DEMO_DISCLAIMER}
        </p>
        <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
          <button onClick={onSample} className="btn-primary !py-2 !px-3 !text-[12px]">
            <Wand2 className="h-3.5 w-3.5" />
            Run sample answers
          </button>
          <button onClick={onReset} className="btn-ghost !py-2 !px-3 !text-[12px]">
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

function Stepper({
  steps,
  currentStep,
  phase,
}: {
  steps: WizardStep[];
  currentStep: number;
  phase: Phase;
}) {
  const all = [
    ...steps.map((s, i) => ({ id: s.id, label: s.title, kind: "interview" as const, idx: i })),
    { id: "review", label: "Review", kind: "review" as const, idx: -1 },
    { id: "solve", label: "Solve", kind: "solve" as const, idx: -1 },
  ];
  return (
    <div className="card p-3">
      <div className={`grid grid-cols-2 md:grid-cols-${all.length} gap-1.5`}>
        {all.map((s) => {
          const done =
            (s.kind === "interview" &&
              (currentStep > s.idx || phase !== "interview")) ||
            (s.kind === "review" && (phase === "solving" || phase === "solved")) ||
            (s.kind === "solve" && phase === "solved");
          const active =
            (s.kind === "interview" && phase === "interview" && currentStep === s.idx) ||
            (s.kind === "review" && phase === "review") ||
            (s.kind === "solve" && phase === "solving");
          return (
            <div
              key={s.id}
              className={`relative rounded-md border px-2.5 py-2 transition ${
                done
                  ? "border-emerald-200 bg-emerald-50"
                  : active
                    ? "border-approve-300 bg-approve-50 ring-2 ring-approve-200"
                    : "border-ink-200 bg-white"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`h-4 w-4 rounded-full grid place-items-center text-[10px] font-bold ${
                    done
                      ? "bg-emerald-600 text-white"
                      : active
                        ? "bg-approve-600 text-white"
                        : "bg-ink-200 text-ink-500"
                  }`}
                >
                  {done ? "✓" : "·"}
                </span>
                <div className="text-[11px] font-semibold text-ink-900 truncate">
                  {s.label}
                </div>
              </div>
              {active && (
                <span className="absolute -bottom-0.5 left-2 right-2 h-0.5 rounded bg-approve-500 pulse-soft" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NavBar({
  onBack,
  onNext,
  nextLabel,
  nextIcon,
  nextDisabled,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel: string;
  nextIcon?: React.ReactNode;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        {onBack && (
          <button onClick={onBack} className="btn-ghost !py-2 !px-3 !text-[12.5px]">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
        )}
      </div>
      <button
        onClick={onNext}
        disabled={nextDisabled}
        className="btn-primary !py-2 !px-3 !text-[12.5px]"
      >
        {nextLabel}
        {nextIcon}
      </button>
    </div>
  );
}

// ── Step / question rendering ───────────────────────────────────────────────

function StepCard({
  step,
  questions,
  answers,
  onChange,
}: {
  step: WizardStep;
  questions: Question[];
  answers: Answers;
  onChange: (id: string, value: Answers[string]) => void;
}) {
  return (
    <div className="card p-5">
      <div className="text-[11px] uppercase tracking-wider font-semibold text-approve-700">
        Step · {step.title}
      </div>
      {step.intro && <div className="mt-1.5 text-[13px] text-ink-600">{step.intro}</div>}
      <div className="mt-4 space-y-4">
        {questions.map((q) => (
          <QuestionField
            key={q.id}
            q={q}
            value={answers[q.id]}
            onChange={(v) => onChange(q.id, v)}
          />
        ))}
      </div>
    </div>
  );
}

function QuestionField({
  q,
  value,
  onChange,
}: {
  q: Question;
  value: Answers[string] | undefined;
  onChange: (v: Answers[string]) => void;
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <label className="text-[13px] font-semibold text-ink-900 leading-snug">
          {q.prompt}
          {q.required && <span className="ml-1 text-rose-600">*</span>}
        </label>
        {q.help && (
          <span className="inline-flex items-center gap-1 text-[10.5px] text-ink-500">
            <HelpCircle className="h-3 w-3" />
            {q.help}
          </span>
        )}
      </div>
      <div className="mt-2">
        {q.type === "select" && q.options && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {q.options.map((o) => {
              const active = String(value ?? "") === o.value;
              return (
                <button
                  key={o.value}
                  onClick={() => onChange(o.value)}
                  className={`text-left rounded-md border px-3 py-2 transition ${
                    active
                      ? "border-approve-500 bg-approve-50 ring-1 ring-approve-300"
                      : "border-ink-200 bg-white hover:border-approve-300"
                  }`}
                >
                  <div className="text-[12.5px] font-semibold text-ink-900">
                    {o.label}
                  </div>
                  {o.description && (
                    <div className="text-[11px] text-ink-500 mt-0.5">{o.description}</div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {(q.type === "number" || q.type === "currency") && (
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={(value as number | undefined) ?? ""}
              min={q.min}
              max={q.max}
              step={q.step}
              onChange={(e) =>
                onChange(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="rounded-md border border-ink-200 bg-white px-3 py-2 text-[13px] text-ink-900 focus:border-approve-400 focus:ring-1 focus:ring-approve-300 outline-none w-40"
            />
            {q.unit && <span className="text-[11px] text-ink-500">{q.unit}</span>}
          </div>
        )}

        {q.type === "scale" && (
          <div className="flex items-center gap-3 max-w-md">
            <input
              type="range"
              min={q.min}
              max={q.max}
              step={q.step ?? 1}
              value={(value as number) ?? (q.default as number) ?? q.min ?? 0}
              onChange={(e) => onChange(Number(e.target.value))}
              className="flex-1 accent-approve-600"
            />
            <span className="text-[12px] font-mono font-semibold text-ink-900 w-14 text-right">
              {String(value ?? q.default ?? q.min ?? "")}
              {q.unit ? ` ${q.unit}` : ""}
            </span>
          </div>
        )}

        {q.type === "boolean" && (
          <div className="flex items-center gap-2">
            {[true, false].map((b) => {
              const active = value === b;
              return (
                <button
                  key={String(b)}
                  onClick={() => onChange(b)}
                  className={`text-[12px] font-semibold rounded-md border px-3 py-1.5 transition ${
                    active
                      ? "border-approve-500 bg-approve-50 ring-1 ring-approve-300 text-approve-700"
                      : "border-ink-200 bg-white text-ink-700 hover:border-approve-300"
                  }`}
                >
                  {b ? "Yes" : "No"}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Review / live state / recommendation ─────────────────────────────────────

function ReviewPanel({
  template,
  answers,
  onEdit,
}: {
  template: typeof VEHICLE_RETENTION_TEMPLATE;
  answers: Answers;
  onEdit: (questionId: string) => void;
}) {
  return (
    <div className="card p-5">
      <div className="text-[11px] uppercase tracking-wider font-semibold text-approve-700">
        Review answers
      </div>
      <h3 className="mt-1 font-display text-lg font-bold text-ink-900">
        Confirm before solving
      </h3>
      <p className="mt-1 text-[12.5px] text-ink-500">
        We&apos;ll POST these to{" "}
        <code className="font-mono kbd">/vehicle-retention/solve</code>.
      </p>
      <div className="mt-4 space-y-3">
        {template.steps.map((s) => (
          <div key={s.id}>
            <div className="text-[10.5px] uppercase tracking-wider font-semibold text-ink-500">
              {s.title}
            </div>
            <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-1">
              {s.questions
                .filter((q) => isVisible(q.revealsIf, answers))
                .map((q) => (
                  <button
                    key={q.id}
                    onClick={() => onEdit(q.id)}
                    className="text-left flex items-center justify-between gap-2 rounded-md border border-ink-200 bg-white hover:border-approve-300 px-3 py-1.5"
                  >
                    <span className="text-[12px] text-ink-600">{q.prompt}</span>
                    <span className="text-[12px] font-semibold text-ink-900">
                      {String(answers[q.id] ?? "—")}
                      {q.unit ? ` ${q.unit}` : ""}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LiveStatePanel({
  answers,
  solveData,
}: {
  answers: Answers;
  solveData: SolveData | null;
}) {
  return (
    <div className="card p-5">
      <div className="text-[11px] uppercase tracking-wider font-semibold text-si-600">
        Live state
      </div>
      <h3 className="mt-1 font-display text-lg font-bold text-ink-900">
        Your <span className="gradient-text-coral">vehicle snapshot</span>
      </h3>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
        <Stat label="Age" value={`${answers.vehicle_age ?? "—"} yrs`} />
        <Stat label="Fuel economy" value={`${answers.vehicle_mpg ?? "—"} mpg`} />
        <Stat label="Fuel price" value={`$${answers.fuel_price_now ?? "—"}/gal`} />
        <Stat label="Econ index" value={String(answers.econ_now ?? "—")} />
      </div>

      {solveData && (
        <div className="mt-4 pt-4 border-t border-ink-200 space-y-2 text-[12px]">
          <div className="flex items-center justify-between">
            <span className="text-ink-500">States solved</span>
            <span className="font-mono font-semibold text-ink-900">
              {solveData.summary.S}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-500">Discount factor β</span>
            <span className="font-mono font-semibold text-ink-900">
              {solveData.summary.beta.toFixed(6)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-500">Build P</span>
            <span className="font-mono font-semibold text-ink-900">
              {solveData.summary.build_p_ms.toFixed(1)} ms
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-500">Build R</span>
            <span className="font-mono font-semibold text-ink-900">
              {solveData.summary.build_r_ms.toFixed(2)} ms
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-500">Solve · {solveData.summary.iterations} iters</span>
            <span className="font-mono font-semibold text-ink-900">
              {solveData.summary.solve_ms.toFixed(0)} ms
            </span>
          </div>
          <div className="pt-2 border-t border-ink-100">
            <div className="text-[10.5px] uppercase tracking-wider font-semibold text-ink-500 mb-1">
              Decision breakdown
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {(Object.entries(solveData.summary.decision_breakdown) as [
                ActionName,
                number,
              ][]).map(([a, n]) => (
                <span
                  key={a}
                  className={`action-badge ${ACTION_COPY[a].tone}`}
                  title={`${n} states recommend ${a}`}
                >
                  {ACTION_COPY[a].title} · {n}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-ink-200 bg-white px-3 py-1.5">
      <div className="text-[10.5px] uppercase tracking-wider font-semibold text-ink-500">
        {label}
      </div>
      <div className="text-[13px] font-semibold text-ink-900">{value}</div>
    </div>
  );
}

function RecommendationCard({ data }: { data: SolveData }) {
  const q = data.query_state;
  if (!q) return null;
  const tone = ACTION_COPY[q.recommended_action];
  return (
    <div className="card p-5 shadow-lift">
      <div className="text-[11px] uppercase tracking-wider font-semibold text-emerald-700">
        Recommendation
      </div>
      <div className="mt-2 flex items-start gap-3">
        <div className={`action-badge ${tone.tone} action-pop !text-[13px] !px-4 !py-2`}>
          <CheckCircle2 className="h-4 w-4" />
          {tone.title}
        </div>
        <div className="flex-1">
          <div className="text-[14px] font-semibold text-ink-900">{tone.verb}</div>
          <div className="mt-1 text-[12px] text-ink-500">
            Matched state{" "}
            <code className="font-mono kbd">{q.label}</code> · expected
            discounted value{" "}
            <span className="font-mono font-semibold text-ink-900">
              ${q.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function seedDefaults(steps: WizardStep[]): Answers {
  const out: Answers = {};
  for (const s of steps) {
    for (const q of s.questions) {
      if (q.default !== undefined) out[q.id] = q.default;
    }
  }
  return out;
}

function isAnswered(v: Answers[string] | undefined): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  return true;
}

function isVisible(rule: Reveal | undefined, answers: Answers): boolean {
  if (!rule) return true;
  const v = answers[rule.questionId];
  if ("equals" in rule) return v === rule.equals;
  if ("in" in rule) return rule.in.includes(v as string | number);
  if ("gt" in rule) return typeof v === "number" && v > rule.gt;
  if ("lt" in rule) return typeof v === "number" && v < rule.lt;
  return true;
}
