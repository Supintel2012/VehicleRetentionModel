import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vehicle Retention Model",
  description:
    "Auto Drive-or-Sell™ decision MDP — ADOS 2026 v1c, with sparse Kronecker-product transitions and vectorized rewards.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
