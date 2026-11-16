import {
  parseAmmoraV4ConfigCreatedReceipt,
  parseAmmoraV4LaunchCreatedReceipt,
  parseAmmoraV4MigratedReceipt,
  parseAmmoraV4SwapReceipt,
} from "@ammora-protocol/sdk";
import { isHash, type Hash } from "viem";
import type { ReceiptView } from "@/lib/types";
import { getClient, v4Core } from "@/lib/ammora/rpc";

export async function readReceipt(hash: string, kind: "launch" | "swap" | "migrate"): Promise<ReceiptView> {
  if (!isHash(hash)) throw new Error("Transaction hash is not valid.");
  const receipt = await getClient().getTransactionReceipt({ hash: hash as Hash });
  if (receipt.status !== "success") throw new Error("The transaction reverted.");
  const base: ReceiptView = {
    hash,
    token: null,
    curve: null,
    configId: null,
    canonicalPool: null,
    amountOut: null,
  };
  if (kind === "launch") {
    const created = parseAmmoraV4LaunchCreatedReceipt(receipt, v4Core.launchFactory);
    base.token = created.token;
    base.curve = created.curve;
    base.configId = created.configId.toString();
    try {
      const swap = parseAmmoraV4SwapReceipt(receipt, created.curve);
      base.amountOut = swap.amountOut.toString();
    } catch {
      base.amountOut = null;
    }
    return base;
  }
  if (kind === "migrate") {
    const curve = receipt.to;
    if (!curve) throw new Error("Migration receipt has no curve address.");
    const migrated = parseAmmoraV4MigratedReceipt(receipt, curve);
    base.curve = curve;
    base.canonicalPool = migrated.canonicalPool;
    base.configId = migrated.configId.toString();
    return base;
  }
  const curve = receipt.to;
  if (!curve) throw new Error("Swap receipt has no curve address.");
  const swap = parseAmmoraV4SwapReceipt(receipt, curve);
  base.curve = curve;
  base.amountOut = swap.amountOut.toString();
  return base;
}

export async function readConfigReceipt(hash: Hash) {
  const receipt = await getClient().getTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Config creation reverted.");
  return parseAmmoraV4ConfigCreatedReceipt(receipt, v4Core.configRegistry);
}
