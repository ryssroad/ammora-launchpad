import { NextResponse } from "next/server";
import { publicError, slippageBps } from "@/lib/ammora/errors";
import { quoteFirstBuy } from "@/lib/ammora/launch";
import { quoteTrade } from "@/lib/ammora/trade";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      curve?: string;
      side?: "buy" | "sell";
      amount?: string;
      slippageBps?: number;
    };
    if (!body.amount) throw new Error("Enter an amount.");
    slippageBps(body.slippageBps ?? 100);
    if (!body.curve) return NextResponse.json(await quoteFirstBuy(body.amount, body.slippageBps));
    if (body.side !== "buy" && body.side !== "sell") throw new Error("Choose buy or sell.");
    return NextResponse.json(await quoteTrade({
      curve: body.curve,
      side: body.side,
      amount: body.amount,
      slippage: body.slippageBps,
    }));
  } catch (error) {
    return NextResponse.json({ error: publicError(error) }, { status: 400 });
  }
}
