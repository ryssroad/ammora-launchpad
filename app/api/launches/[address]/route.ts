import { NextResponse } from "next/server";
import { publicError } from "@/lib/ammora/errors";
import { readLaunchCard } from "@/lib/ammora/curve";
import { asAddress } from "@/lib/ammora/config";
import { readHead } from "@/lib/ammora/rpc";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ address: string }> }) {
  try {
    const { address } = await context.params;
    const { finalized } = await readHead();
    const card = await readLaunchCard(asAddress(address, "Address"), finalized);
    return NextResponse.json(card);
  } catch (error) {
    return NextResponse.json({ error: publicError(error) }, { status: 400 });
  }
}
