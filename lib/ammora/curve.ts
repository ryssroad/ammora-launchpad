import {
  AMMORA_FEE_POLICY_VERSION,
  AmmoraV4LaunchCurveClient,
  ammoraLaunchFactoryV4Abi,
  type AmmoraV4Config,
  type AmmoraV4ExactInputQuote,
  type AmmoraV4Segment,
  classifyAmmoraV4ExactInputFill,
  quoteALCSegmentedExactInput,
} from "@ammora-protocol/sdk";
import { erc20Abi, getAddress, zeroAddress, type Address } from "viem";
import { readMetadata } from "@/lib/metadata";
import type { LaunchCard } from "@/lib/types";
import { ensureCore, getClient, v4Core } from "@/lib/ammora/rpc";

const lookupAbi = [
  {
    type: "function",
    name: "tokenForCurve",
    stateMutability: "view",
    inputs: [{ name: "curve", type: "address" }],
    outputs: [{ name: "token", type: "address" }],
  },
  {
    type: "function",
    name: "curveForToken",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "curve", type: "address" }],
  },
] as const;

const statusLabels: Record<number, string> = {
  0: "Not started",
  1: "Pre-graduation",
  2: "Ready to migrate",
  3: "Graduated",
};

export function curveStatusLabel(status: number) {
  return statusLabels[status] ?? `Status ${status}`;
}

export async function resolveLaunch(address: Address, blockNumber: bigint) {
  const client = getClient();
  const factory = v4Core.launchFactory;
  const tokenForCurve = await client.readContract({
    address: factory,
    abi: lookupAbi,
    functionName: "tokenForCurve",
    args: [address],
    blockNumber,
  });
  if (tokenForCurve !== zeroAddress) {
    return { curve: address, token: getAddress(tokenForCurve) };
  }
  const curveForToken = await client.readContract({
    address: factory,
    abi: lookupAbi,
    functionName: "curveForToken",
    args: [address],
    blockNumber,
  });
  if (curveForToken !== zeroAddress) {
    return { curve: getAddress(curveForToken), token: address };
  }
  throw new Error("That address is not a token or curve from the reviewed launch factory.");
}

export async function readLaunchCard(
  address: Address,
  blockNumber: bigint,
  metadataUri = "",
  creatorHint?: Address,
): Promise<LaunchCard> {
  await ensureCore(blockNumber);
  const client = getClient();
  const { curve, token } = await resolveLaunch(address, blockNumber);
  const sdk = new AmmoraV4LaunchCurveClient(client, curve, {
    launchFactory: v4Core.launchFactory,
    feePolicy: v4Core.feePolicy,
  });
  const state = await sdk.getStateAtBlock(blockNumber);
  const factoryToken = await client.readContract({
    address: v4Core.launchFactory,
    abi: ammoraLaunchFactoryV4Abi,
    functionName: "tokenForCurve",
    args: [curve],
    blockNumber,
  });
  if (
    factoryToken === zeroAddress ||
    factoryToken.toLowerCase() !== state.baseToken.toLowerCase() ||
    state.feePolicy.toLowerCase() !== v4Core.feePolicy.toLowerCase() ||
    state.feePolicyVersion !== AMMORA_FEE_POLICY_VERSION
  ) {
    throw new Error("Curve is not bound to the reviewed V4 factory and fee policy.");
  }

  const [name, symbol, decimals, quoteSymbol, quoteDecimals, progress] = await Promise.all([
    client.readContract({ address: token, abi: erc20Abi, functionName: "name", blockNumber }).catch(() => "Token"),
    client.readContract({ address: token, abi: erc20Abi, functionName: "symbol", blockNumber }).catch(() => "TOKEN"),
    client.readContract({ address: token, abi: erc20Abi, functionName: "decimals", blockNumber }),
    client.readContract({ address: state.quoteToken, abi: erc20Abi, functionName: "symbol", blockNumber }),
    client.readContract({ address: state.quoteToken, abi: erc20Abi, functionName: "decimals", blockNumber }),
    sdk.getMigrationProgressAtBlock(blockNumber),
  ]);
  const metadata = readMetadata(metadataUri);
  const canonical = state.canonicalPool === zeroAddress ? null : getAddress(state.canonicalPool);
  const progressBps = state.status === 2 || state.status === 3 ? 10_000 : progress.progressBps;

  return {
    token: getAddress(token),
    curve,
    creator: getAddress(creatorHint ?? state.creator),
    name: metadata?.name || name,
    symbol: metadata?.symbol || symbol,
    decimals: Number(decimals),
    metadataUri,
    image: metadata?.image ?? null,
    status: state.status,
    statusLabel: curveStatusLabel(state.status),
    progressBps,
    quoteReserve: state.quoteReserve.toString(),
    quoteThreshold: state.migrationQuoteThreshold.toString(),
    quoteToken: getAddress(state.quoteToken),
    quoteSymbol,
    quoteDecimals: Number(quoteDecimals),
    canonicalPool: canonical,
    configId: state.configId.toString(),
  };
}

export function feeContext(config: AmmoraV4Config, currentPoint: bigint, hasSwap: boolean) {
  const modes = ["static", "linear", "exponential"] as const;
  const mode = modes[config.feeSchedulerMode];
  if (!mode) throw new Error("Config fee scheduler mode is not supported.");
  return {
    schedule: {
      cliffFeeBps: BigInt(config.cliffFeeBps),
      numberOfPeriods: BigInt(config.feeNumberOfPeriods),
      periodFrequency: BigInt(config.feePeriodFrequency),
      reductionFactorBps: BigInt(config.feeReductionFactorBps),
      mode,
    },
    activationPoint: currentPoint,
    currentPoint,
    rateLimiterEnabled: config.rateLimiterEnabled,
    rateLimiter: {
      cliffFeeBps: BigInt(config.cliffFeeBps),
      feeIncrementBps: BigInt(config.rateLimiterFeeIncrementBps),
      maxLimiterDuration: BigInt(config.rateLimiterDuration),
      referenceAmount: config.rateLimiterReferenceAmount,
    },
    dynamicFeeBps: 0n,
    enableFirstSwapWithMinFee: config.enableFirstSwapWithMinFee,
    hasSwap,
    collectFeeMode:
      config.collectFeeMode === 1 ? ("outputToken" as const) : ("quoteToken" as const),
  };
}

export function quoteFreshCurve(
  config: AmmoraV4Config,
  segments: readonly AmmoraV4Segment[],
  amountIn: bigint,
  timestamp: bigint,
) {
  return quoteALCSegmentedExactInput(
    segments.map((segment) => ({ ...segment })),
    config.startSqrtPrice,
    amountIn,
    false,
    feeContext(config, timestamp, false),
  );
}

export function describeFill(quote: Pick<AmmoraV4ExactInputQuote, "amountIn" | "amountOut" | "amountLeft">, baseForQuote: boolean) {
  const fill = classifyAmmoraV4ExactInputFill(quote, baseForQuote);
  if (fill.kind === "terminal-dust") {
    return {
      fill,
      executable: false,
      message: "The remaining curve output is too small to trade. Wait for migration rather than sending a zero-output swap.",
    };
  }
  if (fill.kind === "partial") {
    return {
      fill,
      executable: false,
      message: "This order would only partially fill. Enter a smaller amount. Partial sells are not graduation.",
    };
  }
  if (fill.kind === "graduation-boundary") {
    return {
      fill,
      executable: true,
      message: "This buy reaches graduation. The curve consumes what it can and leaves the rest in your wallet. Migration is a separate transaction.",
    };
  }
  return { fill, executable: true, message: "Full fill at the confirmed block. The signed plan uses a fresh quote and your slippage." };
}
