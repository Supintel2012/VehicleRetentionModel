import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

/**
 * Plus Jakarta Sans, the Supported Intelligence site's face, served from this
 * app (the same variable files the site uses; SIL Open Font License).
 */
const jakarta = localFont({
  src: [
    { path: "../public/fonts/PlusJakartaSans-Variable-Latin.woff2", weight: "200 800", style: "normal" },
    { path: "../public/fonts/PlusJakartaSans-Variable-Italic-Latin.woff2", weight: "200 800", style: "italic" },
  ],
  display: "swap",
  variable: "--font-jakarta",
});

const TITLE = "Auto Drive-or-Sell™ buyer-cohort model · Rapid Recursive®";
const DESCRIPTION =
  "ADOS 2026, a sequential decision model of when vehicle owners keep driving, cut back or replace their vehicle, " +
  "solved for seven buyer cohorts and the market they make up, and how a change in the new-vehicle price shifts " +
  "replacement timing. Anderson Economic Group LLC with Supported Intelligence LLC. A technology demonstration, not a forecast.";

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
    siteName: "Auto Drive-or-Sell™ · ADOS 2026",
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#3d5a80",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
