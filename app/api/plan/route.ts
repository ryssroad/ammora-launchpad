import { NextResponse } from "next/server";
import { publicError } from "@/lib/ammora/errors";
import { planLaunch } from "@/lib/ammora/launch";
import { readReceipt } from "@/lib/ammora/receipts";
import { planMigration, planTrade } from "@/lib/ammora/trade";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = body.action;
    if (action === "launch") {
      return NextResponse.json(await planLaunch({
        name: String(body.name ?? ""),
        symbol: String(body.symbol ?? ""),
        metadataUri: String(body.metadataUri ?? ""),
        firstBuy: typeof body.firstBuy === "string" ? body.firstBuy : "",
        slippage: body.slippageBps,
        account: String(body.account ?? ""),
      }));
    }
    if (action === "trade") {
      const side = body.side === "sell" ? "sell" : body.side === "buy" ? "buy" : null;
      if (!side) throw new Error("Choose buy or sell.");
      return NextResponse.json(await planTrade({
        curve: String(body.curve ?? ""),
        side,
        amount: String(body.amount ?? ""),
        slippage: body.slippageBps,
        account: String(body.account ?? ""),
      }));
    }
    if (action === "migrate") {
      return NextResponse.json(await planMigration(String(body.curve ?? "")));
    }
    if (action === "receipt") {
      const kind = body.kind === "swap" || body.kind === "migrate" ? body.kind : "launch";
      return NextResponse.json(await readReceipt(String(body.hash ?? ""), kind));
    }
    throw new Error("Unknown plan action.");
  } catch (error) {
    return NextResponse.json({ error: publicError(error) }, { status: 400 });
  }
}
