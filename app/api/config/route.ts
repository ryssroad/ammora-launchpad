import { NextResponse } from "next/server";
import { readConfig } from "@/lib/ammora/config";
import { publicError } from "@/lib/ammora/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await readConfig());
  } catch (error) {
    return NextResponse.json({ error: publicError(error) }, { status: 500 });
  }
}
