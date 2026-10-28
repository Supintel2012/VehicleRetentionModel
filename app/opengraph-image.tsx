import { ImageResponse } from "next/og";

export const alt = "Auto Drive-or-Sell™ vehicle retention model · Rapid Recursive®";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social preview card, rendered at build time. */
export default function OpenGraphImage() {
  const cells = ["#ffffff", "#ffffff", "#ffffff", "#f59e0b"];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#f8fafc", color: "#0f172a" }}>
        <div style={{ width: 28, background: "#1e3a8a", display: "flex" }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 80px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ width: 72, height: 72, borderRadius: 12, background: "#1e3a8a", display: "flex", flexWrap: "wrap", padding: 12, gap: 6 }}>
              {cells.map((fill, i) => (
                <div key={i} style={{ width: 21, height: 21, borderRadius: 3, background: fill }} />
              ))}
            </div>
            <div style={{ fontSize: 30, color: "#475569" }}>ADOS 2026 v1c · Rapid Recursive®</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1 }}>Auto Drive-or-Sell™ vehicle retention model</div>
            <div style={{ fontSize: 32, color: "#334155", lineHeight: 1.35 }}>
              When the price of a new vehicle changes, how does the timing of vehicle replacement change?
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 24, color: "#475569" }}>
            <div>Anderson Economic Group LLC with Supported Intelligence LLC</div>
            <div>This is a technology demonstration, not a forecast.</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
