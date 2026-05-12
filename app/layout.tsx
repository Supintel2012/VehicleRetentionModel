import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vehicle Retention Model",
  description:
    "Auto Drive-or-Sell™ — ADOS 2026 v1c. Rapid Recursive® sequential model for vehicle drive, sell, or reduce decisions.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
