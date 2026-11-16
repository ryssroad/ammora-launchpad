import { ImageResponse } from "next/og";
import { brand } from "@/lib/brand";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f4cb7a",
          color: "#805414",
          fontSize: 18,
          fontWeight: 700,
        }}
      >
        {brand.name.slice(0, 1)}
      </div>
    ),
    { ...size },
  );
}
