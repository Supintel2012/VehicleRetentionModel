import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

const TITLE = "Auto Drive-or-Sell™ vehicle retention model · Rapid Recursive®";
const DESCRIPTION =
  "ADOS 2026 v1c, a sequential decision model of when vehicle owners keep driving, cut back or replace their vehicle, " +
  "and how a change in the new-vehicle price shifts replacement timing. Anderson Economic Group LLC with Supported " +
  "Intelligence LLC. A technology demonstration, not a forecast.";

/** Absolute URLs for social previews: Vercel's production host when deployed, localhost otherwise. */
function siteUrl(): URL {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return new URL(host ? `https://${host}` : "http://localhost:3000");
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Auto Drive-or-Sell™",
  openGraph: {
    type: "website",
    title: TITLE,
    description: DESCRIPTION,
    siteName: "Auto Drive-or-Sell™ · ADOS 2026 v1c",
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1e3a8a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
