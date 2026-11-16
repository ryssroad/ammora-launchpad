import { NextResponse } from "next/server";
import { httpsUrl } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get("name")?.trim() ?? "";
  const symbol = url.searchParams.get("symbol")?.trim() ?? "";
  const description = url.searchParams.get("description")?.trim() ?? "";
  const image = httpsUrl(url.searchParams.get("image") ?? "");
  if (!name || !symbol) {
    return NextResponse.json({ error: "name and symbol are required." }, { status: 400 });
  }
  const doc: Record<string, string> = { name, symbol };
  if (description) doc.description = description.slice(0, 280);
  if (image) doc.image = image;
  return NextResponse.json(doc, {
    headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=300" },
  });
}
