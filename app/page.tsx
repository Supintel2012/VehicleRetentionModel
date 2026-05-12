import { Wizard } from "@/components/Wizard";

export default function Page() {
  return (
    <main className="min-h-screen">
      <div className="dot-bg absolute inset-0 -z-10" aria-hidden />
      <div className="max-w-6xl mx-auto px-5 py-10 md:py-14">
        <Wizard />
        <Footer />
      </div>
    </main>
  );
}

function Footer() {
  return (
    <footer className="mt-12 pt-6 border-t border-ink-200 text-[11px] text-ink-500 leading-relaxed space-y-3">
      <p className="text-ink-600">
        This is a technology demonstration, not a forecast. Contact Supported
        Intelligence LLC for information on licensing this model or adapting it to
        your specific needs:{" "}
        <a
          href="mailto:support@supportedintelligence.com"
          className="text-approve-700 underline underline-offset-2 hover:text-approve-900"
        >
          support@supportedintelligence.com
        </a>
      </p>
      <div>
        © 2015, 2017, 2018, 2021, 2026 Anderson Economic Group LLC. Auto
        Drive-or-Sell™ decision model · ADOS 2026 v1c.
      </div>
      <div>
        Rapid Recursive® technology, © 2026 Supported Intelligence LLC, patented
        in US (9,798,700 and 10,460,249 and 10,546,248); Japan (6284472); and Korea
        (10-2082522).
      </div>
      <div>
        Vectorized Python port with sparse Kronecker-product transitions and
        broadcast reward construction. Solves the default 880-state problem in
        ~300 ms on commodity hardware.
      </div>
    </footer>
  );
}
