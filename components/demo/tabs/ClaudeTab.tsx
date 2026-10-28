"use client";

import type { ReactNode } from "react";
import { ExternalLink, Plug } from "lucide-react";
import { examplePrompts } from "@/lib/prompts";
import { CONNECTOR_URL, CONTACT_EMAIL, MCP_PAGE_URL } from "@/lib/site";
import { CopyButton, SectionHeading, SubHeading } from "../ui";

function Step({ number, children }: { number: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-50 text-sm font-semibold text-accent-700">
        {number}
      </span>
      <div className="pt-0.5 text-[15px] leading-relaxed text-slate-700">{children}</div>
    </li>
  );
}

function ConnectorUrl({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-md border border-slate-300 bg-slate-50 py-1 pl-3 pr-1 font-mono text-sm text-slate-900">
      {!compact && <Plug className="h-4 w-4 shrink-0 text-accent-700" aria-hidden />}
      <span className="break-all">{CONNECTOR_URL}</span>
      <CopyButton text={CONNECTOR_URL} label="Copy the connector URL" className="py-1" />
    </span>
  );
}

/** `hasCohorts`: whether the run answering this page carried the RR Toolbox cohort output (null before any answer). */
export function ClaudeTab({ hasCohorts }: { hasCohorts: boolean | null }) {
  const steps: ReactNode[] = [
    <>
      Open <strong className="text-slate-900">Settings → Connectors</strong> on claude.ai or in the Claude desktop app.
    </>,
    <>
      Click <strong className="text-slate-900">Customize</strong> to go to the Connectors page, click{" "}
      <strong className="text-slate-900">+</strong>, then <strong className="text-slate-900">Add custom connector</strong>.
    </>,
    <>
      Name it <code className="rounded bg-slate-100 px-1 py-0.5 text-[14px]">Rapid Recursive Toolbox</code> and paste the server URL:{" "}
      <ConnectorUrl compact />
    </>,
    <>
      Click <strong className="text-slate-900">Add</strong> and sign in with your Supported Intelligence login when prompted. Your RR
      Toolbox key is linked automatically.
    </>,
    <>
      Set the tool permissions. <strong className="text-slate-900">Always allow</strong> is the recommended setting: the Rapid Recursive
      Toolbox tools are read-only, with no write capabilities.
    </>,
    <>
      In a chat, check that it is on: click <strong className="text-slate-900">+</strong>, then{" "}
      <strong className="text-slate-900">Connectors → Rapid Recursive Toolbox</strong>, and turn it on if it is off.
    </>,
    <>
      Ask Claude to <em>use the Rapid Recursive Toolbox</em>, for example with one of the prompts below.
    </>,
  ];

  return (
    <div className="space-y-8">
      <SectionHeading eyebrow="Use it in Claude">Run the same model from a Claude conversation</SectionHeading>
      <p className="max-w-3xl text-[15px] leading-relaxed text-slate-700">
        The Rapid Recursive Toolbox is available to Claude as a connector. An analyst can ask for runs of this model in plain
        language; the connector runs the same RR Toolbox model that answers this page.
      </p>

      <section aria-labelledby="connector-title" className="space-y-3">
        <SubHeading id="connector-title">Connector URL</SubHeading>
        <ConnectorUrl />
      </section>

      <section aria-labelledby="setup-title" className="max-w-3xl space-y-3">
        <SubHeading id="setup-title">Set it up in Claude (claude.ai or the desktop app)</SubHeading>
        <ol className="space-y-3">
          {steps.map((step, i) => (
            <Step key={i} number={i + 1}>
              {step}
            </Step>
          ))}
        </ol>
        <p className="text-sm leading-relaxed text-slate-600">
          Works on every plan, including Free (limited to one custom connector). On Team or Enterprise plans, an organization owner
          adds the connector first under Organization connectors, then each member clicks Connect.
        </p>
      </section>

      <section aria-labelledby="prompts-title" className="space-y-3">
        <SubHeading id="prompts-title">Example prompts for a policy analyst</SubHeading>
        <ul className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          {examplePrompts(hasCohorts).map((example) => (
            <li key={example.title} className="panel keep-together flex flex-col gap-3 p-4">
              <p className="font-semibold text-slate-900">{example.title}</p>
              <p className="flex-1 text-sm leading-relaxed text-slate-700">{example.prompt}</p>
              <div>
                <CopyButton text={example.prompt} label={`Copy the prompt: ${example.title}`} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="license-title" className="max-w-3xl space-y-2 text-[15px] leading-relaxed text-slate-700">
        <SubHeading id="license-title">Access and licensing</SubHeading>
        <p>
          Setup steps for other clients, such as ChatGPT, Microsoft 365 Copilot and Claude Code, are on{" "}
          <a href={MCP_PAGE_URL} className="link inline-flex items-center gap-1" target="_blank" rel="noopener noreferrer">
            supportedintelligence.com/mcp
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
          .
        </p>
        <p className="font-medium text-slate-900">
          Running the model with your own inputs requires a Supported Intelligence license. Contact{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="link">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </section>
    </div>
  );
}
