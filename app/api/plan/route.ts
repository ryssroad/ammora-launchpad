import { getAddress } from "viem";
import { NextResponse } from "next/server";
import { planOwnerConfig } from "@/lib/ammora/create-config";
import { publicError } from "@/lib/ammora/errors";
import { planLaunch } from "@/lib/ammora/launch";
import { readCreatedConfig, readReceipt } from "@/lib/ammora/receipts";
import { stepOf } from "@/lib/ammora/timeout";
import { planMigration, planTrade } from "@/lib/ammora/trade";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function configPlanStream(account: string) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      let step = "Preview Config";
      try {
        const plan = await planOwnerConfig({
          owner: getAddress(account),
          onStep: (label) => {
            step = label;
            send({ type: "step", label });
          },
        });
        send({ type: "result", plan });
      } catch (error) {
        const message = publicError(error);
        const failedStep = stepOf(error) === "Preview Config" ? step : stepOf(error);
        console.error("[create-config]", failedStep, error);
        send({ type: "error", step: failedStep, message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

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
        localConfigId: typeof body.localConfigId === "string" ? body.localConfigId : null,
      }));
    }
    if (action === "create-config") {
      return configPlanStream(String(body.account ?? ""));
    }
    if (action === "config-receipt") {
      return NextResponse.json(await readCreatedConfig(String(body.hash ?? ""), String(body.account ?? "")));
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
      return NextResponse.json(await planMigration(String(body.curve ?? ""), String(body.account ?? "")));
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
