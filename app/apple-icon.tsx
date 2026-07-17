import { ImageResponse } from "next/og";

export const size        = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        background:     "#0A0A0C",
        width:          "100%",
        height:         "100%",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        fontSize:       120,
        fontWeight:     600,
        color:          "#E7E7EA",
      }}
    >
      S
    </div>,
    { ...size },
  );
}
