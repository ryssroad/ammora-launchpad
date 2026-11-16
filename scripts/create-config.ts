import "dotenv/config";
import {
  AmmoraPortableLifecyclePlanner,
  getAmmoraV4ConfigAtBlock,
  giwaSepoliaAtomicLaunchDeployment,
  giwaSepoliaAtomicLaunchTargets,
  verifyAmmoraPortableDeploymentAtBlock,
} from "@ammora-protocol/sdk";
import {
  createWalletClient,
  encodeAbiParameters,
  erc20Abi,
  formatUnits,
  getAddress,
  http,
  isAddress,
  keccak256,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { deriveConfigFromTemplate } from "./derive-config.js";
import { readConfigReceipt } from "../lib/ammora/receipts.js";
import { deployment, ensureChain, ensureCore, gasCap, getClient, giwaChain, readHead, v4Core } from "../lib/ammora/rpc.js";

const GUIDE_TEMPLATE_HASH = "0x6048908774397e0691bb0e19f72dabb790eb0d892d6081d3622b39e7f738e667";

function raw(name: string, fallback: string) {
  const value = process.env[name]?.trim() || fallback;
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`${name} must be a positive integer raw amount.`);
  return BigInt(value);
}

function ownerAccount(): { address: Address; key?: Hex } {
  const key = process.env.AMMORA_PRIVATE_KEY?.trim();
  if (key) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
      throw new Error("AMMORA_PRIVATE_KEY must be a 0x-prefixed 32-byte throwaway testnet key.");
    }
    const account = privateKeyToAccount(key as Hex);
    return { address: account.address, key: key as Hex };
  }
  const account = process.env.AMMORA_ACCOUNT?.trim();
  if (!account || !isAddress(account)) {
    throw new Error("Set AMMORA_PRIVATE_KEY in .env for creation, or AMMORA_ACCOUNT for a keyless preview.");
  }
  return { address: getAddress(account) };
}

function reviewHash(to: Address, value: bigint, data: Hex) {
  return keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "bytes" }],
      [BigInt(deployment.chain.id), to, value, data],
    ),
  );
}

async function main() {
const owner = ownerAccount();
const templateId = raw("AMMORA_TEMPLATE_ID", "6");
const saleSupply = raw("SALE_SUPPLY_RAW", "1000000000000");
const quoteThreshold = raw("QUOTE_THRESHOLD_RAW", "1000000000000");
const send = process.env.AMMORA_SEND === "1";

await ensureChain();
const { block } = await readHead();
await ensureCore(block.number);
const client = getClient();
const template = await getAmmoraV4ConfigAtBlock(client, v4Core.configRegistry, templateId, block.number);
if (!template.enabled) throw new Error(`Template Config #${templateId} is disabled.`);
const expectedHash = process.env.AMMORA_TEMPLATE_HASH?.trim() || (templateId === 6n ? GUIDE_TEMPLATE_HASH : "");
if (expectedHash && template.configHash.toLowerCase() !== expectedHash.toLowerCase()) {
  throw new Error(`Template #${templateId} hash ${template.configHash} does not match ${expectedHash}.`);
}

const derived = deriveConfigFromTemplate(template, saleSupply, quoteThreshold);
const config = {
  ...derived.config,
  partnerRecipient: owner.address,
  leftoverReceiver: owner.address,
  liquidityDistribution: { ...derived.config.liquidityDistribution, partner: owner.address },
};
const quoteDecimals = await client.readContract({
  address: config.quoteToken,
  abi: erc20Abi,
  functionName: "decimals",
  blockNumber: block.number,
});
const context = await verifyAmmoraPortableDeploymentAtBlock(client, giwaSepoliaAtomicLaunchDeployment, block.number);
const planner = new AmmoraPortableLifecyclePlanner(context, giwaSepoliaAtomicLaunchTargets);
const plan = await planner.planConfigRegistration({
  account: owner.address,
  configOwner: owner.address,
  config,
  segments: derived.curve,
  gas: { maxFeePerGasNativeRaw: await gasCap(block.baseFeePerGas), safetyMarginBps: 2000n },
});
const hash = reviewHash(plan.transaction.to, plan.transaction.value ?? 0n, plan.transaction.data);

const preview = {
  mode: send ? "SEND_REQUESTED" : "UNSIGNED_PREVIEW",
  chainId: deployment.chain.id,
  registry: v4Core.configRegistry,
  templateId: templateId.toString(),
  templateHash: template.configHash,
  owner: owner.address,
  recipients: {
    configOwner: owner.address,
    partnerRecipient: owner.address,
    liquidityPartner: owner.address,
    leftoverReceiver: owner.address,
  },
  saleSupplyRaw: saleSupply.toString(),
  saleSupply: formatUnits(saleSupply, config.tokenDecimals),
  quoteThresholdRaw: quoteThreshold.toString(),
  quoteThreshold: formatUnits(quoteThreshold, Number(quoteDecimals)),
  totalSupplyRaw: config.totalSupply.toString(),
  simulatedConfigId: plan.expectedConfigId.toString(),
  simulatedConfigHash: plan.simulatedConfigHash,
  reviewHash: hash,
  note: "The simulated Config ID can move if someone else registers first. Save the ID from the receipt, then set CONFIG_ID.",
};

console.log(JSON.stringify(preview, null, 2));
if (!send) {
  console.log("\nPreview only. To create this Config, rerun with AMMORA_SEND=1 and AMMORA_REVIEW_HASH set to reviewHash.");
  process.exit(0);
}

if (!owner.key) throw new Error("AMMORA_SEND=1 requires AMMORA_PRIVATE_KEY. The signer must be the Config owner.");
const provided = process.env.AMMORA_REVIEW_HASH?.trim();
if (!provided || provided.toLowerCase() !== hash.toLowerCase()) {
  throw new Error("reviewHash mismatch. Run the preview, review the recipients, then pass that exact AMMORA_REVIEW_HASH.");
}

const account = privateKeyToAccount(owner.key);
if (account.address.toLowerCase() !== owner.address.toLowerCase()) {
  throw new Error("Signer does not match the reviewed Config owner.");
}
const wallet = createWalletClient({
  account,
  chain: giwaChain,
  transport: http(process.env.AMMORA_RPC_URL?.trim() || deployment.chain.rpcUrls[0]),
});
const txHash = await wallet.sendTransaction({
  to: plan.transaction.to,
  data: plan.transaction.data,
  value: plan.transaction.value ?? 0n,
  chain: giwaChain,
});
const created = await readConfigReceipt(txHash);
const confirmed = await getAmmoraV4ConfigAtBlock(client, v4Core.configRegistry, created.configId, (await client.getTransactionReceipt({ hash: txHash })).blockNumber);
if (confirmed.identity.owner.toLowerCase() !== owner.address.toLowerCase()) {
  throw new Error("Receipt owner does not match the signing wallet. Do not rerun creation.");
}
console.log(JSON.stringify({
  hash: txHash,
  configId: created.configId.toString(),
  configHash: created.configHash,
  next: `Set CONFIG_ID=${created.configId.toString()} and redeploy, or set it on Vercel before the next deployment.`,
}, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
