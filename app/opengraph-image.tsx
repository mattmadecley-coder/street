import { ImageResponse } from "next/og";

export const alt = "Street — independent streetwear discovery";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 78px",
          background: "#f4f3ee",
          color: "#101010",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 54, fontWeight: 900, letterSpacing: "-0.12em" }}>STREET</div>
          <div style={{ display: "flex", fontSize: 18, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" }}>
            Independent labels. One search.
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 980 }}>
          <div style={{ display: "flex", fontSize: 94, fontWeight: 800, lineHeight: .9, letterSpacing: "-0.075em" }}>
            Find streetwear beyond the usual names.
          </div>
          <div style={{ display: "flex", marginTop: 34, fontSize: 25, lineHeight: 1.35, color: "rgba(16,16,16,.66)" }}>
            Search products, colors, styles, and brands across independent streetwear stores.
          </div>
        </div>
        <div style={{ display: "flex", width: "100%", height: 2, background: "#101010" }} />
      </div>
    ),
    size,
  );
}
