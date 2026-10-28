import { CONTACT_EMAIL, DISCLAIMER } from "@/lib/site";

/**
 * Credits, trademarks and patents, the contact address and, once a run has
 * been answered, the RR Toolbox's provenance line for it, verbatim.
 */
export function SiteFooter({ attribution }: { attribution?: string | null }) {
  return (
    <footer className="mt-12 border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl space-y-2 px-4 py-6 text-xs leading-relaxed text-slate-600 sm:px-6">
        <p className="text-slate-700">
          {DISCLAIMER}{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="link">
            {CONTACT_EMAIL}
          </a>
        </p>
        <p>© 2015, 2017, 2018, 2021, 2026 Anderson Economic Group LLC. Auto Drive-or-Sell™ decision model · ADOS 2026 v1c.</p>
        <p>
          Rapid Recursive® technology, © 2026 Supported Intelligence LLC, patented in US (9,798,700 and 10,460,249 and
          10,546,248); Japan (6284472); and Korea (10-2082522).
        </p>
        <p>Results are computed by the Rapid Recursive® Toolbox&apos;s implementation of the ADOS 2026 v1c model.</p>
        {attribution && <p>{attribution}</p>}
      </div>
    </footer>
  );
}
