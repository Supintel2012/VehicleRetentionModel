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
        This is a technology demonstration, not a forecast. Inputs are
        illustrative and are not intended to represent any specific cohort of
        buyers or time period. Contact Supported Intelligence LLC for information
        on licensing the model for use with specific inputs.
      </p>
      <div>
        © 2015, 2017, 2018, 2021, 2026 Anderson Economic Group LLC. Auto
        Drive-or-Sell™ decision model · ADOS 2026 v1c. Uses Rapid Recursive®
        technology, multiple patents.
      </div>
      <div>
        Vectorized Python port with sparse Kronecker-product transitions and
        broadcast reward construction. Solves the default 880-state problem in
        ~300 ms on commodity hardware.
      </div>
      <p className="text-ink-600 pt-1 border-t border-ink-200">
        © 2026 Supported Intelligence LLC
      </p>
    </footer>
  );
}
