import { ImageResponse } from "next/og";

export const alt = "Auto Drive-or-Sell™ buyer-cohort model · Rapid Recursive®";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social preview card, rendered at build time, in the Supported Intelligence palette. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#ffffff", color: "#0f172a" }}>
        <div style={{ width: 28, background: "#3d5a80", display: "flex" }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 80px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ width: 72, height: 72, borderRadius: 14, background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 34, height: 34, background: "#f6b618", transform: "rotate(45deg)", borderRadius: 6 }} />
            </div>
            <div style={{ fontSize: 30, color: "#475569" }}>Supported Intelligence · Rapid Recursive® Toolbox</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1 }}>Auto Drive-or-Sell™ buyer-cohort model</div>
            <div style={{ fontSize: 32, color: "#334155", lineHeight: 1.35 }}>
              Seven buyer cohorts, one market: when do owners replace their vehicles, and how does a price change move that?
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 24, color: "#475569" }}>
            <div>Anderson Economic Group LLC with Supported Intelligence LLC</div>
            <div style={{ color: "#c24a30" }}>This is a technology demonstration, not a forecast.</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
