import {
  AmmoraV4LaunchCurveClient,
  ammoraLaunchPoolV4Abi,
  minOutFromSlippage,
  planERC20Approvals,
} from "@ammora-protocol/sdk";
import { BaseError, ContractFunctionRevertedError, erc20Abi, formatUnits, parseUnits, type Address, type Hex } from "viem";
import type { PlanView, QuoteView, TxJson } from "@/lib/types";
import { describeFill, readLaunchCard } from "@/lib/ammora/curve";
import { asAddress } from "@/lib/ammora/config";
import { slippageBps } from "@/lib/ammora/errors";
import { getClient, readHead, v4Core } from "@/lib/ammora/rpc";

function txJson(tx: { to: Address; data: Hex; value?: bigint }): TxJson {
  return { to: tx.to, data: tx.data, value: (tx.value ?? 0n).toString() };
}

export async function quoteTrade(input: { curve: string; side: "buy" | "sell"; amount: string; slippage?: unknown }): Promise<QuoteView> {
  const { finalized } = await readHead();
  const curve = asAddress(input.curve, "Curve");
  const card = await readLaunchCard(curve, finalized);
  if (card.status !== 1) {
    throw new Error(`This curve is ${card.statusLabel.toLowerCase()}, so it is not trading.`);
  }
  const decimals = input.side === "sell" ? card.decimals : card.quoteDecimals;
  const amountIn = parseAmount(input.amount, decimals);
  const sdk = new AmmoraV4LaunchCurveClient(getClient(), curve, {
    launchFactory: v4Core.launchFactory,
    feePolicy: v4Core.feePolicy,
  });
  const baseForQuote = input.side === "sell";
  const quote = await sdk.quoteExactInputAtBlock(amountIn, baseForQuote, finalized);
  const described = describeFill(quote, baseForQuote);
  const bps = slippageBps(input.slippage ?? 100);
  const minimum = described.executable ? minOutFromSlippage(quote.amountOut, BigInt(bps)) : 0n;
  return viewFromQuote({
    side: input.side,
    quote,
    minimum,
    described,
    card,
    block: finalized.toString(),
  });
}

function viewFromQuote(input: {
  side: "buy" | "sell";
  quote: { amountIn: bigint; amountOut: bigint; amountLeft: bigint; fee: bigint; asOfBlock: bigint };
  minimum: bigint;
  described: ReturnType<typeof describeFill>;
  card: { decimals: number; quoteDecimals: number; quoteSymbol: string; symbol: string };
  block: string;
}): QuoteView {
  const inputDecimals = input.side === "sell" ? input.card.decimals : input.card.quoteDecimals;
  const outputDecimals = input.side === "sell" ? input.card.quoteDecimals : input.card.decimals;
  return {
    side: input.side,
    amountInRaw: input.quote.amountIn.toString(),
    amountOutRaw: input.quote.amountOut.toString(),
    amountLeftRaw: input.quote.amountLeft.toString(),
    feeRaw: input.quote.fee.toString(),
    minimumAmountOutRaw: input.minimum.toString(),
    amountIn: formatUnits(input.quote.amountIn, inputDecimals),
    amountOut: formatUnits(input.quote.amountOut, outputDecimals),
    amountLeft: formatUnits(input.quote.amountLeft, inputDecimals),
    fee: formatUnits(input.quote.fee, inputDecimals),
    minimumAmountOut: formatUnits(input.minimum, outputDecimals),
    fillKind: input.described.fill.kind,
    allowPartialFill: input.described.fill.allowPartialFill,
    executable: input.described.executable && input.minimum > 0n,
    message: input.minimum === 0n && input.described.executable
      ? "Minimum output rounds to zero. Raise the amount or lower slippage."
      : input.described.message,
    tokenDecimals: input.card.decimals,
    quoteDecimals: input.card.quoteDecimals,
    quoteSymbol: input.card.quoteSymbol,
    symbol: input.card.symbol,
    asOfBlock: input.block,
  };
}

export async function planTrade(input: {
  curve: string;
  side: "buy" | "sell";
  amount: string;
  slippage?: unknown;
  account: string;
}): Promise<PlanView> {
  const { block } = await readHead();
  const curve = asAddress(input.curve, "Curve");
  const account = asAddress(input.account, "Account");
  const card = await readLaunchCard(curve, block.number);
  if (card.status !== 1) throw new Error("This token is no longer trading on the launch curve.");
  const decimals = input.side === "sell" ? card.decimals : card.quoteDecimals;
  const amountIn = parseAmount(input.amount, decimals);
  const inputSymbol = input.side === "sell" ? card.symbol : card.quoteSymbol;
  const balance = await getClient().readContract({
    address: asAddress(input.side === "sell" ? card.token : card.quoteToken, "Input token"),
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account],
  });
  if (balance < amountIn) {
    throw new Error(`You need ${formatUnits(amountIn - balance, decimals)} more ${inputSymbol} for this trade.`);
  }
  const sdk = new AmmoraV4LaunchCurveClient(getClient(), curve, {
    launchFactory: v4Core.launchFactory,
    feePolicy: v4Core.feePolicy,
  });
  const baseForQuote = input.side === "sell";
  const fresh = await sdk.quoteExactInputAtBlock(amountIn, baseForQuote, block.number);
  const described = describeFill(fresh, baseForQuote);
  if (!described.executable) throw new Error(described.message);
  const bps = slippageBps(input.slippage ?? 100);
  const plan = await sdk.planSwapExactInput({
    includedAmountIn: amountIn,
    baseForQuote,
    allowPartialFill: described.fill.allowPartialFill,
    slippageBps: bps,
    recipient: account,
    deadline: block.timestamp + 20n * 60n,
  });
  const actualFill = describeFill(plan.quote, baseForQuote);
  if (!actualFill.executable || plan.quote.minimumAmountOut === 0n) throw new Error(
    actualFill.executable ? "Minimum output rounds to zero. Raise the amount or lower slippage." : actualFill.message,
  );
  const approvals = await planERC20Approvals(getClient(), account, plan.approvalRequirements);
  const approvalTransactions = approvals.flatMap((item) => item.transactions.map(txJson));
  const minimum = plan.quote.minimumAmountOut;
  const outputDecimals = input.side === "sell" ? card.quoteDecimals : card.decimals;
  const outputSymbol = input.side === "sell" ? card.quoteSymbol : card.symbol;
  return {
    status: "READY",
    action: "trade",
    summary: [
      `You pay up to ${formatUnits(amountIn, decimals)} ${inputSymbol}.`,
      `Minimum received ${formatUnits(minimum, outputDecimals)} ${outputSymbol} (${(bps / 100).toString()}% slippage)`,
      approvalTransactions.length
        ? `Approve ${inputSymbol} for this curve, then the swap is signed separately.`
        : "No new token approval is required.",
      ...(actualFill.fill.kind === "full" ? [] : [actualFill.message]),
    ],
    transaction: txJson(plan.transaction),
    approvalTransactions,
    replanAfterApproval: false,
    quote: viewFromQuote({
      side: input.side,
      quote: plan.quote,
      minimum,
      described: actualFill,
      card,
      block: plan.quote.asOfBlock.toString(),
    }),
    predictedToken: null,
    predictedCurve: null,
  };
}

export async function planMigration(curveText: string, accountText: string): Promise<PlanView> {
  const curve = asAddress(curveText, "Curve");
  const account = asAddress(accountText, "Account");
  const { block } = await readHead();
  const card = await readLaunchCard(curve, block.number);
  if (card.status !== 2) throw new Error("Migration is only available once the curve is Ready to migrate.");
  const client = getClient();
  const sdk = new AmmoraV4LaunchCurveClient(client, curve, {
    launchFactory: v4Core.launchFactory,
    feePolicy: v4Core.feePolicy,
  });
  const plan = await sdk.planMigrateAtBlock(block.number);
  try {
    // Recheck execution against the latest state, since another wallet can migrate first.
    await client.simulateContract({
      address: plan.transaction.to,
      abi: ammoraLaunchPoolV4Abi,
      functionName: "migrate",
      account,
      blockTag: "latest",
    });
  } catch (error) {
    const revert = error instanceof BaseError
      ? error.walk((cause) => cause instanceof ContractFunctionRevertedError)
      : null;
    if (revert instanceof ContractFunctionRevertedError && revert.data?.errorName === "MigrationNotReady") {
      throw new Error("The contract rejected the migration (MigrationNotReady). No transaction was sent.");
    }
    throw error;
  }
  return {
    status: "READY",
    action: "migrate",
    summary: [
      "Permissionless migration. This does not buy tokens.",
      "It creates the post-graduation pool from the curve's confirmed state.",
      "Gas is paid in ETH.",
    ],
    transaction: txJson(plan.transaction),
    approvalTransactions: [],
    replanAfterApproval: false,
    quote: null,
    predictedToken: card.token,
    predictedCurve: card.curve,
  };
}

export function parseAmount(amount: string, decimals: number) {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error("Enter a positive decimal amount.");
  const fraction = trimmed.split(".")[1] ?? "";
  if (fraction.length > decimals) throw new Error(`Use at most ${decimals} decimal places.`);
  const value = parseUnits(trimmed, decimals);
  if (value <= 0n) throw new Error("Amount must be positive.");
  return value;
}
