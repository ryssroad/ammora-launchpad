import { NextResponse } from "next/server";
import { publicError } from "@/lib/ammora/errors";
import { listLaunches } from "@/lib/ammora/feed";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await listLaunches());
  } catch (error) {
    return NextResponse.json({ error: publicError(error) }, { status: 500 });
  }
}
