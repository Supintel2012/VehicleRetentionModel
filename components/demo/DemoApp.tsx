"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import clsx from "clsx";
import { signedDollars } from "@/lib/format";
import { parseElasticity } from "@/lib/scenario";
import { baselineRequest, baselineState, fallbackRequest, requestKey, solveStatus, type Answered } from "@/lib/solve-plan";
import { defaultAnswers, type Answers } from "@/lib/template";
import { SiteFooter } from "@/components/site/SiteFooter";
import { AssumptionsPanel, assumptionSummary } from "./AssumptionsPanel";
import { useLatestSolve, type SolvedRun, type SolveState } from "./useSolve";
import { useTabState } from "./useTab";
import { ClaudeTab } from "./tabs/ClaudeTab";
import { MethodTab } from "./tabs/MethodTab";
import { PolicyMapTab } from "./tabs/PolicyMapTab";
import { QuestionTab } from "./tabs/QuestionTab";
import { ReplacementTab } from "./tabs/ReplacementTab";
import { DEFAULT_PRICE_CHANGE, ScenarioTab } from "./tabs/ScenarioTab";

const TABS = [
  { id: "question", label: "The question" },
  { id: "policy-map", label: "Policy map" },
  { id: "replacement", label: "Replacement by age" },
  { id: "scenario", label: "Regulatory cost scenario" },
  { id: "method", label: "Method and assumptions" },
  { id: "claude", label: "Use it in Claude" },
] as const;

type TabId = (typeof TABS)[number]["id"];
const TAB_IDS: readonly TabId[] = TABS.map((t) => t.id);

const DEFAULT_ELASTICITY_TEXT = "-1.0";

function TabList({ selected, onSelect }: { selected: TabId; onSelect: (id: TabId) => void }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = TABS.length - 1;
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? index === last ? 0 : index + 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? index === 0 ? last : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    onSelect(TABS[next].id);
    refs.current[TABS[next].id]?.focus();
  }
  return (
    <div role="tablist" aria-label="Demonstration screens" className="no-print grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-6">
      {TABS.map((tab, index) => {
        const active = tab.id === selected;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[tab.id] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={active}
            aria-controls={`panel-${tab.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={clsx(
              "flex items-start gap-2 rounded-md border px-3 py-2 text-left text-sm font-medium leading-snug transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600",
              active ? "border-accent-700 bg-accent-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400",
            )}
          >
            <span className={clsx("tabular-nums", active ? "text-accent-100" : "text-slate-500")}>{index + 1}</span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * A printed screen shows what a collapsed <details> holds (the yearly figures,
 * the notes returned with a run): every closed one is opened for printing and
 * closed again afterwards.
 */
function useOpenDetailsForPrint() {
  useEffect(() => {
    let opened: HTMLDetailsElement[] = [];
    const before = () => {
      opened = [...document.querySelectorAll<HTMLDetailsElement>("details:not([open])")];
      for (const details of opened) details.open = true;
    };
    const after = () => {
      for (const details of opened) details.open = false;
      opened = [];
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
}

function answeredBy(run: SolvedRun | null): Answered | null {
  return run ? { body: run.body, hasCohorts: Boolean(run.response.data.cohorts) } : null;
}

export function DemoApp() {
  const [answers, setAnswers] = useState<Answers>(() => defaultAnswers());
  const [delta, setDelta] = useState(DEFAULT_PRICE_CHANGE);
  const [elasticityText, setElasticityText] = useState(DEFAULT_ELASTICITY_TEXT);
  const [elasticity, setElasticity] = useState(() => {
    const parsed = parseElasticity(DEFAULT_ELASTICITY_TEXT);
    return parsed.ok ? parsed.value : -1;
  });
  const [tab, selectTab] = useTabState(TAB_IDS, "question");
  useOpenDetailsForPrint();

  // The engine that last answered decides whether a price change needs a baseline solve (see lib/solve-plan.ts).
  const [answered, setAnswered] = useState<Answered | null>(null);
  const body = useMemo(() => baselineRequest(answers, delta, answered), [answers, delta, answered]);
  const main = useLatestSolve(body);
  const lastGood = main.lastGood;
  useEffect(() => setAnswered(answeredBy(lastGood)), [lastGood]);

  // Engines without cohort output: on the scenario tab, a second, plain solve at the shocked price.
  const shocked = useMemo(
    () => fallbackRequest(body, delta, main.error ? null : answered, tab === "scenario"),
    [body, delta, main.error, answered, tab],
  );
  const fallbackRaw = useLatestSolve(shocked);
  // Show the second solve only when it answers the current pairing; otherwise it is still pending.
  const fallback: SolveState = useMemo(() => {
    const matches = fallbackRaw.run !== null && shocked !== null && requestKey(fallbackRaw.run.body) === requestKey(shocked);
    return matches || fallbackRaw.error ? fallbackRaw : { ...fallbackRaw, run: null, busy: true };
  }, [fallbackRaw, shocked]);

  // Every tab but the scenario keeps the last answer while only the price change differs from it.
  const baseline = useMemo(() => baselineState(main, body), [main, body]);
  const shown = tab === "scenario" ? main : baseline;

  const onElasticity = useCallback((text: string) => {
    setElasticityText(text);
    const parsed = parseElasticity(text);
    if (parsed.ok) setElasticity(parsed.value);
  }, []);
  const onChange = useCallback((id: string, value: number) => setAnswers((a) => ({ ...a, [id]: value })), []);
  const onReset = useCallback(() => setAnswers(defaultAnswers()), []);
  const summary = assumptionSummary(answers);
  const current = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <>
      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[18.5rem_minmax(0,1fr)]" data-print-full>
          <AssumptionsPanel answers={answers} onChange={onChange} onReset={onReset} status={tab === "scenario" && shocked ? solveStatus(main, fallback) : solveStatus(shown)} />
          <div className="min-w-0 space-y-5">
            <TabList selected={tab} onSelect={selectTab} />
            <div className="print-only space-y-1 border-b border-slate-300 pb-3 text-sm text-slate-800">
              <p className="font-semibold">{current.label}</p>
              <p>Owner profile: {summary.owner}.</p>
              <p>Vehicle to inspect: {summary.vehicle}.</p>
              {tab === "scenario" && <p>New-vehicle price change: {signedDollars(delta)}.</p>}
            </div>
            {TABS.map((t) => (
              <section
                key={t.id}
                role="tabpanel"
                id={`panel-${t.id}`}
                aria-labelledby={`tab-${t.id}`}
                hidden={t.id !== tab}
                tabIndex={0}
                className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-600"
              >
                {t.id === "question" && <QuestionTab state={baseline} onReset={onReset} />}
                {t.id === "policy-map" && <PolicyMapTab state={baseline} answers={answers} onReset={onReset} />}
                {t.id === "replacement" && <ReplacementTab state={baseline} onReset={onReset} />}
                {t.id === "scenario" && (
                  <ScenarioTab
                    state={main}
                    fallback={fallback}
                    delta={delta}
                    onDelta={setDelta}
                    basePrice={answers.new_car_price}
                    elasticityText={elasticityText}
                    elasticity={elasticity}
                    onElasticity={onElasticity}
                    onReset={onReset}
                  />
                )}
                {t.id === "method" && <MethodTab state={baseline} requestBody={body} />}
                {t.id === "claude" && <ClaudeTab hasCohorts={answered ? answered.hasCohorts : null} />}
              </section>
            ))}
          </div>
        </div>
      </main>
      <SiteFooter attribution={lastGood?.response.attribution} />
    </>
  );
}
