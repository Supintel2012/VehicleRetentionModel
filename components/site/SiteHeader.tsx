import { Info } from "lucide-react";
import { CONTACT_EMAIL, DISCLAIMER } from "@/lib/site";
import { PrintButton } from "./PrintButton";

function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="h-9 w-9 shrink-0" aria-hidden>
      <rect width="32" height="32" rx="6" fill="#1e3a8a" />
      <rect x="6" y="6" width="9" height="9" rx="1.5" fill="#fff" />
      <rect x="17" y="6" width="9" height="9" rx="1.5" fill="#fff" />
      <rect x="6" y="17" width="9" height="9" rx="1.5" fill="#fff" />
      <rect x="17" y="17" width="9" height="9" rx="1.5" fill="#f59e0b" />
    </svg>
  );
}

export function SiteHeader() {
  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Mark />
            <div className="min-w-0">
              <h1 className="text-base font-semibold leading-snug text-slate-900 sm:text-lg">
                <span className="block sm:inline">Auto Drive-or-Sell™</span>{" "}
                <span className="hidden text-slate-400 sm:inline" aria-hidden>
                  {" · "}
                </span>
                <span className="whitespace-nowrap">
                  ADOS 2026 v1c <span className="text-slate-400" aria-hidden>·</span> Rapid Recursive®
                </span>
              </h1>
              <p className="text-sm text-slate-600">Anderson Economic Group LLC with Supported Intelligence LLC</p>
            </div>
          </div>
          <div className="hidden shrink-0 sm:block">
            <PrintButton />
          </div>
        </div>
      </header>
      <div role="note" aria-label="Demonstration notice" className="border-b border-slate-200 bg-slate-100">
        <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-3 sm:px-6">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-accent-700" aria-hidden />
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
