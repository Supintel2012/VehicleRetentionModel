import Image from "next/image";
import { CONTACT_EMAIL, DISCLAIMER, MCP_PAGE_URL, SI_ADDRESS, SI_SITE_URL, SI_TAGLINE } from "@/lib/site";

/**
 * The site's footer: the SI mark and tagline, where to find the firm, the
 * credits, trademarks and patents, the required notice and, once a run has
 * been answered, the RR Toolbox's provenance line for it, verbatim.
 */
export function SiteFooter({ attribution }: { attribution?: string | null }) {
  return (
    <footer className="mt-12 border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <div className="space-y-3">
            <Image src="/logos/supported-intelligence-logo-light.svg" alt="Supported Intelligence" width={56} height={56} className="h-14 w-14 rounded-md" />
            <p className="text-sm text-slate-600">{SI_TAGLINE}</p>
          </div>
          <div className="text-sm leading-relaxed text-slate-600">
            <p className="font-semibold text-slate-900">Supported Intelligence LLC</p>
            <address className="not-italic">
              {SI_ADDRESS.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </address>
            <p className="mt-2">
              <a href={`mailto:${CONTACT_EMAIL}`} className="link">
                {CONTACT_EMAIL}
              </a>
            </p>
          </div>
          <div className="text-sm leading-relaxed text-slate-600">
            <p className="font-semibold text-slate-900">Rapid Recursive® Toolbox</p>
            <p>
              The model answering this page runs on the RR Toolbox, available to Claude and other assistants as a connector.{" "}
              <a href={MCP_PAGE_URL} className="link" target="_blank" rel="noopener noreferrer">
                Setup for every client
              </a>
              {" · "}
              <a href={SI_SITE_URL} className="link" target="_blank" rel="noopener noreferrer">
                supportedintelligence.com
              </a>
            </p>
          </div>
        </div>
        <div className="mt-8 space-y-2 border-t border-slate-100 pt-6 text-xs leading-relaxed text-slate-600">
          <p className="text-slate-700">
            {DISCLAIMER}{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="link">
              {CONTACT_EMAIL}
            </a>
          </p>
          <p>© 2015, 2017, 2018, 2021, 2026 Anderson Economic Group LLC. Auto Drive-or-Sell™ decision model · ADOS 2026.</p>
          <p>
            Rapid Recursive® technology, © 2026 Supported Intelligence LLC, patented in US (9,798,700 and 10,460,249 and 10,546,248);
            Japan (6284472); and Korea (10-2082522).
          </p>
          <p>Results are computed by the Rapid Recursive® Toolbox&apos;s implementation of the ADOS 2026 model.</p>
          {attribution && <p>{attribution}</p>}
        </div>
      </div>
    </footer>
  );
}
