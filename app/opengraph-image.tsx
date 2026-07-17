import { ImageResponse } from "next/og";

export const size        = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    <div
      style={{
        background:    "#0A0A0C",
        width:         "100%",
        height:        "100%",
        display:       "flex",
        flexDirection: "column",
        padding:       "64px 80px",
        position:      "relative",
      }}
    >
      {/* Accent glow — surface-plot aesthetic */}
      <div
        style={{
          position:   "absolute",
          right:      0,
          top:        0,
          width:      "60%",
          height:     "100%",
          background: "radial-gradient(ellipse at 65% 50%, rgba(59,130,246,0.20) 0%, rgba(59,130,246,0.07) 40%, transparent 70%)",
          display:    "flex",
        }}
      />
      {/* Horizontal grid lines */}
      <div
        style={{
          position:       "absolute",
          right:          "80px",
          top:            "80px",
          bottom:         "80px",
          width:          "52%",
          display:        "flex",
          flexDirection:  "column",
          justifyContent: "space-between",
          opacity:        0.10,
        }}
      >
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div key={i} style={{ width: "100%", height: "1px", background: "#3b82f6", display: "flex" }} />
        ))}
      </div>

      {/* Wordmark */}
      <div
        style={{
          fontSize:      "13px",
          fontWeight:    400,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color:         "#8a8a93",
          display:       "flex",
          marginBottom:  "auto",
        }}
      >
        SKEWLAB
      </div>

      {/* Headline + descriptor */}
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <div
          style={{
            fontSize:      "56px",
            fontWeight:    400,
            color:         "#E7E7EA",
            textTransform: "uppercase",
            letterSpacing: "0.03em",
            lineHeight:    "1.1",
            display:       "flex",
          }}
        >
          Options Analytics
        </div>
        <div
          style={{
            fontSize:      "20px",
            fontWeight:    400,
            color:         "#8a8a93",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            display:       "flex",
          }}
        >
          Hand-written pricing · The volatility risk premium, measured.
        </div>
        <div style={{ width: "48px", height: "2px", background: "#3b82f6", display: "flex", marginTop: "4px" }} />
      </div>
    </div>,
    { ...size },
  );
}
