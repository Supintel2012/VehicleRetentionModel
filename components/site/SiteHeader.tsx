import Image from "next/image";
import { Info } from "lucide-react";
import { CONTACT_EMAIL, DISCLAIMER } from "@/lib/site";
import { PrintButton } from "./PrintButton";

/**
 * The page's masthead in the Supported Intelligence site's manner: the SI
 * mark and name, the model's title, and the two firms behind it. Below it,
 * the notice Anderson Economic Group requires on every screen.
 */
export function SiteHeader() {
  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <a href="https://www.supportedintelligence.com" className="flex shrink-0 items-center gap-2.5 no-print-url" aria-label="Supported Intelligence">
              <Image
                src="/logos/supported-intelligence-logo-light.svg"
                alt=""
                width={44}
                height={44}
                priority
                className="h-11 w-11 rounded-md"
              />
              <span className="hidden text-sm font-semibold leading-tight text-slate-900 md:block">
                Supported
                <br />
                Intelligence
              </span>
            </a>
            <div className="hidden h-10 w-px bg-slate-200 md:block" aria-hidden />
            <div className="min-w-0">
              <h1 className="text-base font-bold leading-snug tracking-tight text-slate-900 sm:text-lg">
                Auto Drive-or-Sell™ buyer-cohort model
              </h1>
              <p className="text-sm text-slate-600">
                ADOS 2026 on the Rapid Recursive® Toolbox. Anderson Economic Group LLC with Supported Intelligence LLC.
              </p>
            </div>
          </div>
          <div className="hidden shrink-0 sm:block">
            <PrintButton />
          </div>
        </div>
      </header>
      <div role="note" aria-label="Demonstration notice" className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-3 sm:px-6">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-accent-600" aria-hidden />
          <p className="text-[15px] font-medium leading-relaxed text-slate-900">
            {DISCLAIMER}{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="link whitespace-nowrap">
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>
      </div>
    </>
  );
}
