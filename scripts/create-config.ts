import "dotenv/config";
import { getAddress, http, isAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient } from "viem";
import {
  DEFAULT_QUOTE_THRESHOLD_RAW,
  DEFAULT_SALE_SUPPLY_RAW,
  DEFAULT_TEMPLATE_ID,
  GUIDE_TEMPLATE_HASH,
  planOwnerConfig,
} from "../lib/ammora/create-config.js";
import { readCreatedConfig } from "../lib/ammora/receipts.js";
import { deployment, ensureChain, giwaChain } from "../lib/ammora/rpc.js";

function raw(name: string, fallback: bigint) {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`${name} must be a positive integer raw amount.`);
  return BigInt(value);
}

function ownerAccount(): { address: Address; key?: Hex } {
  const key = process.env.AMMORA_PRIVATE_KEY?.trim();
  if (key) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
      throw new Error("AMMORA_PRIVATE_KEY must be a 0x-prefixed 32-byte throwaway testnet key.");
    }
    return { address: privateKeyToAccount(key as Hex).address, key: key as Hex };
  }
  const account = process.env.AMMORA_ACCOUNT?.trim();
  if (!account || !isAddress(account)) {
    throw new Error("Set AMMORA_PRIVATE_KEY in .env for creation, or AMMORA_ACCOUNT for a keyless preview.");
  }
  return { address: getAddress(account) };
}

async function main() {
  const owner = ownerAccount();
  const send = process.env.AMMORA_SEND === "1";
  await ensureChain();
  const preview = await planOwnerConfig({
    owner: owner.address,
    templateId: raw("AMMORA_TEMPLATE_ID", DEFAULT_TEMPLATE_ID),
    saleSupplyRaw: raw("SALE_SUPPLY_RAW", DEFAULT_SALE_SUPPLY_RAW),
    quoteThresholdRaw: raw("QUOTE_THRESHOLD_RAW", DEFAULT_QUOTE_THRESHOLD_RAW),
    templateHash: process.env.AMMORA_TEMPLATE_HASH?.trim() || (raw("AMMORA_TEMPLATE_ID", DEFAULT_TEMPLATE_ID) === DEFAULT_TEMPLATE_ID ? GUIDE_TEMPLATE_HASH : ""),
  });
  console.log(JSON.stringify({ mode: send ? "SEND_REQUESTED" : "UNSIGNED_PREVIEW", ...preview }, null, 2));
  if (!send) {
    console.log("\nPreview only. The site can create this Config from the connected wallet. To send from the CLI, rerun with AMMORA_SEND=1 and AMMORA_REVIEW_HASH set to reviewHash.");
    return;
  }
  if (!preview.simulation.ok) throw new Error(preview.simulation.message);
  if (!owner.key) throw new Error("AMMORA_SEND=1 requires AMMORA_PRIVATE_KEY. The signer must be the Config owner.");
  const provided = process.env.AMMORA_REVIEW_HASH?.trim();
  if (!provided || provided.toLowerCase() !== preview.reviewHash.toLowerCase()) {
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
    to: preview.transaction.to as Address,
    data: preview.transaction.data as Hex,
    value: BigInt(preview.transaction.value),
    chain: giwaChain,
  });
  const created = await readCreatedConfig(txHash, owner.address);
  console.log(JSON.stringify({
    ...created,
    next: `Set CONFIG_ID=${created.configId} in the Vercel environment and redeploy.`,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
