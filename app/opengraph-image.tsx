import { ImageResponse } from "next/og";
import { brand } from "@/lib/brand";

export const alt = brand.name;
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
          padding: 72,
          background: "#110e0c",
          color: "#f4efe6",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, letterSpacing: 4, color: "#e4b56a" }}>
          GIWA SEPOLIA
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 108, lineHeight: 1 }}>{brand.name}</div>
          <div style={{ fontSize: 32, color: "#e7c7a4", maxWidth: 820 }}>{brand.tagline}</div>
        </div>
        <div style={{ display: "flex", fontSize: 24, color: "#b4aa9c" }}>
          {brand.builtWith} · Testnet only, pre-audit software
        </div>
      </div>
    ),
    { ...size },
  );
}
