import {
  AmmoraPortableLifecyclePlanner,
  getAmmoraV4ConfigAtBlock,
  giwaSepoliaAtomicLaunchDeployment,
  giwaSepoliaAtomicLaunchTargets,
  verifyAmmoraPortableDeploymentAtBlock,
} from "@ammora-protocol/sdk";
import { encodeAbiParameters, erc20Abi, formatEther, formatUnits, getAddress, keccak256, type Address, type Hex } from "viem";
import type { ConfigPlan } from "@/lib/types";
import { deriveConfigFromTemplate } from "@/lib/ammora/derive-config";
import { publicError } from "@/lib/ammora/errors";
import { deployment, ensureCore, gasCap, getClient, publicRpcUrl, readHead, v4Core } from "@/lib/ammora/rpc";
import { withTimeout } from "@/lib/ammora/timeout";

/** Hash published for template #6 in the Ammora launchpad guide, checked against the live read. */
export const GUIDE_TEMPLATE_HASH = "0x6048908774397e0691bb0e19f72dabb790eb0d892d6081d3622b39e7f738e667";
export const DEFAULT_TEMPLATE_ID = 6n;
export const DEFAULT_SALE_SUPPLY_RAW = 1_000_000_000_000n;
export const DEFAULT_QUOTE_THRESHOLD_RAW = 1_000_000_000_000n;

export function reviewHash(to: Address, value: bigint, data: Hex) {
  return keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "bytes" }],
      [BigInt(deployment.chain.id), to, value, data],
    ),
  );
}

export async function planOwnerConfig(input: {
  owner: Address;
  templateId?: bigint;
  saleSupplyRaw?: bigint;
  quoteThresholdRaw?: bigint;
  templateHash?: string;
  onStep?: (label: string) => void;
}): Promise<ConfigPlan> {
  const owner = getAddress(input.owner);
  const templateId = input.templateId ?? DEFAULT_TEMPLATE_ID;
  const saleSupply = input.saleSupplyRaw ?? DEFAULT_SALE_SUPPLY_RAW;
  const quoteThreshold = input.quoteThresholdRaw ?? DEFAULT_QUOTE_THRESHOLD_RAW;
  const step = async <T>(label: string, fn: () => Promise<T>) => {
    input.onStep?.(label);
    console.info("[create-config]", label);
    return withTimeout(label, fn);
  };

  console.info("[create-config] public RPC", new URL(publicRpcUrl).host);
  const { block } = await step("Checking the public GIWA Sepolia RPC", () => readHead());
  const template = await step(`Reading template Config #${templateId.toString()}`, async () => {
    await ensureCore(block.number);
    return getAmmoraV4ConfigAtBlock(getClient(), v4Core.configRegistry, templateId, block.number);
  });
  const client = getClient();
  if (!template.enabled) throw new Error(`Template Config #${templateId} is disabled.`);
  const expectedHash = input.templateHash?.trim() || (templateId === DEFAULT_TEMPLATE_ID ? GUIDE_TEMPLATE_HASH : "");
  if (expectedHash && template.configHash.toLowerCase() !== expectedHash.toLowerCase()) {
    throw new Error(`Template #${templateId} hash ${template.configHash} does not match ${expectedHash}.`);
  }

  const derived = deriveConfigFromTemplate(template, saleSupply, quoteThreshold);
  const config = {
    ...derived.config,
    partnerRecipient: owner,
    leftoverReceiver: owner,
    liquidityDistribution: { ...derived.config.liquidityDistribution, partner: owner },
  };
  const quoteDecimals = await step("Reading the quote token", () => client.readContract({
    address: config.quoteToken,
    abi: erc20Abi,
    functionName: "decimals",
    blockNumber: block.number,
  }));
  const context = await step("Verifying the reviewed GIWA deployment", () => verifyAmmoraPortableDeploymentAtBlock(client, giwaSepoliaAtomicLaunchDeployment, block.number));
  const maxFee = await gasCap(block.baseFeePerGas);
  const planner = new AmmoraPortableLifecyclePlanner(context, giwaSepoliaAtomicLaunchTargets);
  const plan = await step("Building the unsigned Config plan", () => planner.planConfigRegistration({
    account: owner,
    configOwner: owner,
    config,
    segments: derived.curve,
    gas: { maxFeePerGasNativeRaw: maxFee, safetyMarginBps: 2000n },
  }));
  const value = plan.transaction.value ?? 0n;
  const hash = reviewHash(plan.transaction.to, value, plan.transaction.data);
  const simulation = await step("Simulating the transaction", () => simulate(owner, plan.transaction.to, plan.transaction.data, value, maxFee));

  return {
    chainId: deployment.chain.id,
    registry: v4Core.configRegistry,
    templateId: templateId.toString(),
    templateHash: template.configHash,
    owner,
    recipients: {
      configOwner: owner,
      partnerRecipient: owner,
      liquidityPartner: owner,
      leftoverReceiver: owner,
    },
    saleSupplyRaw: saleSupply.toString(),
    saleSupply: formatUnits(saleSupply, config.tokenDecimals),
    quoteThresholdRaw: quoteThreshold.toString(),
    quoteThreshold: formatUnits(quoteThreshold, Number(quoteDecimals)),
    totalSupplyRaw: config.totalSupply.toString(),
    simulatedConfigId: plan.expectedConfigId.toString(),
    simulatedConfigHash: plan.simulatedConfigHash,
    reviewHash: hash,
    transaction: { to: plan.transaction.to, data: plan.transaction.data, value: value.toString() },
    simulation,
    note: "The simulated Config ID can move if someone else registers first. The receipt ID is the one to save.",
  };
}

async function simulate(owner: Address, to: Address, data: Hex, value: bigint, maxFee: bigint): Promise<ConfigPlan["simulation"]> {
  const client = getClient();
  try {
    await client.call({ account: owner, to, data, value });
    const gas = await client.estimateGas({ account: owner, to, data, value });
    const balance = await client.getBalance({ address: owner });
    const cost = gas * maxFee + value;
    if (balance < cost) {
      return {
        ok: false,
        message: `Not enough ETH for gas. This wallet has ${formatEther(balance)} ETH and the estimate needs about ${formatEther(cost)} ETH. Claim test ETH, then preview again.`,
      };
    }
    return { ok: true, message: `Simulation succeeded. Estimated gas ${gas.toString()}.` };
  } catch (error) {
    const message = publicError(error);
    if (/insufficient funds|exceeds the balance/i.test(message)) {
      return { ok: false, message: "Not enough ETH for gas. Claim test ETH from a faucet, then preview again." };
    }
    return { ok: false, message };
  }
}
