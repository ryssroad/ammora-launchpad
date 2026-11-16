import { NextResponse } from "next/server";
import { readActiveConfig } from "@/lib/ammora/config";
import { publicError } from "@/lib/ammora/errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    return NextResponse.json(await readActiveConfig(id));
  } catch (error) {
    return NextResponse.json({ error: publicError(error) }, { status: 500 });
  }
}
