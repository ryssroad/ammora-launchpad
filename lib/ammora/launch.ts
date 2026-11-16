import {
  AmmoraPortableLaunchPlanner,
  AmmoraPortableLifecyclePlanner,
  classifyAmmoraV4ExactInputFill,
  giwaSepoliaAtomicLaunchDeployment,
  giwaSepoliaAtomicLaunchTargets,
  minOutFromSlippage,
  verifyAmmoraPortableDeploymentAtBlock,
  type AmmoraPortablePlanningContext,
} from "@ammora-protocol/sdk";
import { formatUnits, getAddress, type Address, type Hex } from "viem";
import type { PlanView, QuoteView, TxJson } from "@/lib/types";
import { readActiveConfig, readConfigSnapshot } from "@/lib/ammora/config";
import { quoteFreshCurve } from "@/lib/ammora/curve";
import { publicError, slippageBps } from "@/lib/ammora/errors";
import { gasCap, getClient, readHead } from "@/lib/ammora/rpc";
import { parseAmount } from "@/lib/ammora/trade";

function txJson(tx: { to: Address; data: Hex; value?: bigint }): TxJson {
  return { to: tx.to, data: tx.data, value: (tx.value ?? 0n).toString() };
}

let portable: { block: bigint; context: AmmoraPortablePlanningContext } | null = null;

async function contextAt(blockNumber: bigint) {
  if (portable?.block === blockNumber) return portable.context;
  const context = await verifyAmmoraPortableDeploymentAtBlock(
    getClient(),
    giwaSepoliaAtomicLaunchDeployment,
    blockNumber,
  );
  portable = { block: blockNumber, context };
  return context;
}

function assertMetadata(name: string, symbol: string, metadataUri: string) {
  const cleanName = name.trim();
  const cleanSymbol = symbol.trim();
  if (cleanName.length < 1 || cleanName.length > 32) throw new Error("Name must be 1–32 characters.");
  if (!/^[A-Za-z0-9]{1,10}$/.test(cleanSymbol)) throw new Error("Ticker must be 1–10 letters or numbers.");
  if (metadataUri.length < 8 || new TextEncoder().encode(metadataUri).length > 2048) throw new Error("Metadata URI is missing or too long.");
  if (!metadataUri.startsWith("https://") && !metadataUri.startsWith("data:application/json")) {
    throw new Error("Metadata must be an https URL or a data:application/json URI.");
  }
  return { name: cleanName, symbol: cleanSymbol, metadataUri };
}

export async function quoteFirstBuy(amount: string, slippage?: unknown, localConfigId?: string | null): Promise<QuoteView> {
  const { finalized, block } = await readHead();
  const info = await readActiveConfig(localConfigId);
  if (!info.enabled) throw new Error(`Config #${info.configId} is disabled.`);
  const snapshot = await readConfigSnapshot(BigInt(info.configId), finalized);
  const amountIn = parseAmount(amount, info.quoteDecimals);
  const quote = quoteFreshCurve(snapshot.config, snapshot.segments, amountIn, block.timestamp);
  const described = classifyAmmoraV4ExactInputFill(quote, false);
  if (described.kind !== "full") {
    throw new Error("First buy must fill in full. Lower the amount so creation does not land on graduation.");
  }
  const bps = slippageBps(slippage ?? 100);
  const minimum = minOutFromSlippage(quote.amountOut, BigInt(bps));
  if (minimum <= 0n) throw new Error("Minimum output rounds to zero. Raise the first buy or lower slippage.");
  return {
    side: "buy",
    amountInRaw: quote.amountIn.toString(),
    amountOutRaw: quote.amountOut.toString(),
    amountLeftRaw: quote.amountLeft.toString(),
    feeRaw: quote.fee.toString(),
    minimumAmountOutRaw: minimum.toString(),
    amountIn: formatUnits(quote.amountIn, info.quoteDecimals),
    amountOut: formatUnits(quote.amountOut, info.tokenDecimals),
    amountLeft: formatUnits(quote.amountLeft, info.quoteDecimals),
    fee: formatUnits(quote.fee, info.quoteDecimals),
    minimumAmountOut: formatUnits(minimum, info.tokenDecimals),
    fillKind: described.kind,
    allowPartialFill: false,
    executable: true,
    message: "Pre-launch estimate from the live Config curve. The signed plan is simulated again.",
    tokenDecimals: info.tokenDecimals,
    quoteDecimals: info.quoteDecimals,
    quoteSymbol: info.quoteSymbol,
    symbol: "tokens",
    asOfBlock: finalized.toString(),
  };
}

export async function planLaunch(input: {
  name: string;
  symbol: string;
  metadataUri: string;
  firstBuy?: string;
  slippage?: unknown;
  account: string;
  localConfigId?: string | null;
}): Promise<PlanView> {
  const meta = assertMetadata(input.name, input.symbol, input.metadataUri);
  const account = getAddress(input.account);
  const { block } = await readHead();
  const info = await readActiveConfig(input.localConfigId);
  const configId = BigInt(info.configId);
  if (!info.enabled) throw new Error(`Config #${info.configId} is disabled.`);
  const snapshot = await readConfigSnapshot(configId, block.number);
  if (snapshot.config.tokenDecimals !== info.tokenDecimals) {
    throw new Error("Token decimals changed between reads. Prepare the launch again.");
  }
  const context = await contextAt(block.number);
  const gas = { maxFeePerGasNativeRaw: await gasCap(block.baseFeePerGas), safetyMarginBps: 2000n };
  const launch = {
    name: meta.name,
    symbol: meta.symbol,
    metadataURI: meta.metadataUri,
    creatorMetadataURI: meta.metadataUri,
    tokenDecimals: snapshot.config.tokenDecimals,
  };
  const firstBuy = input.firstBuy?.trim() ?? "";

  if (!firstBuy) {
    const planner = new AmmoraPortableLaunchPlanner(context);
    const plan = await planner.planCreate({
      account,
      configId,
      launch,
      expectedPoolCreationFeeNativeRaw: snapshot.config.poolCreationFee,
      gas,
    });
    return {
      status: "READY",
      action: "launch",
      summary: [
        `Create ${meta.name} (${meta.symbol}).`,
        `Launch fee: ${formatUnits(snapshot.config.poolCreationFee, 18)} ETH, plus network gas.`,
        "You become the token creator. No first buy is included.",
      ],
      transaction: txJson(plan.transaction),
      approvalTransactions: [],
      replanAfterApproval: false,
      quote: null,
      predictedToken: plan.predictedToken,
      predictedCurve: plan.predictedCurve,
    };
  }

  const quote = await quoteFirstBuy(firstBuy, input.slippage, input.localConfigId);
  const targets = giwaSepoliaAtomicLaunchTargets;
  const planner = new AmmoraPortableLifecyclePlanner(context, targets);
  try {
    const plan = await planner.planExistingConfigAtomicFirstBuy({
      account,
      configId,
      expectedConfigHash: snapshot.configHash as Hex,
      launch,
      firstBuys: [
        {
          includedQuoteAmountRaw: BigInt(quote.amountInRaw),
          minimumBaseAmountOutRaw: BigInt(quote.minimumAmountOutRaw),
          allowPartialFill: false,
          recipient: account,
        },
      ],
      deadline: block.timestamp + 20n * 60n,
      allowancePolicy: "prepare-approval",
      gas,
    });
    const approval = plan.status === "APPROVAL_REQUIRED";
    return {
      status: plan.status,
      action: "launch",
      summary: approval
        ? [
            `Approve ${quote.amountIn} ${info.quoteSymbol} to the reviewed first-buy helper.`,
            "No token is created by this approval. Prepare the launch again after it confirms.",
          ]
        : [
            `Create ${meta.name} (${meta.symbol}) and buy about ${quote.amountOut} tokens.`,
            `Minimum ${quote.minimumAmountOut} tokens. Spends ${quote.amountIn} ${info.quoteSymbol}, plus ETH for gas.`,
            `Launch fee: ${formatUnits(snapshot.config.poolCreationFee, 18)} ETH.`
              ],
      transaction: txJson(plan.transaction),
      approvalTransactions: [],
      replanAfterApproval: approval,
      quote: approval ? null : quote,
      predictedToken: plan.status === "READY" ? plan.predictedToken : null,
      predictedCurve: plan.status === "READY" ? plan.predictedCurve : null,
    };
  } catch (error) {
    const message = publicError(error);
    if (message.toLowerCase().includes("quote balance")) {
      throw new Error(
        `The wallet needs at least ${quote.amountIn} ${info.quoteSymbol} for the first buy. ETH only pays gas. Wrap ETH, then prepare the launch again.`,
      );
    }
    throw new Error(message);
  }
}
