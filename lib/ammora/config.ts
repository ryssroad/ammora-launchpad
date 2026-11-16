import { erc20Abi, getAddress, type Address } from "viem";
import { getAmmoraV4ConfigAtBlock } from "@ammora-protocol/sdk";
import { publicChain } from "@/lib/chain";
import type { ConfigInfo } from "@/lib/types";
import { configIdFromEnv } from "@/lib/ammora/errors";
import { deployment, ensureCore, getClient, readHead, v4Core } from "@/lib/ammora/rpc";

/** Reviewed public template from the Ammora launchpad guide. Creators can launch on it before owning a Config. */
export const PUBLIC_TEMPLATE_CONFIG_ID = 6n;

const cache = new Map<string, { at: number; value: ConfigInfo }>();

export async function readConfig(configId = configIdFromEnv()): Promise<ConfigInfo> {
  const key = configId.toString();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 15_000) return hit.value;

  const { finalized } = await readHead();
  await ensureCore(finalized);
  const client = getClient();
  const snapshot = await getAmmoraV4ConfigAtBlock(client, v4Core.configRegistry, configId, finalized);
  const quoteToken = getAddress(snapshot.config.quoteToken);
  const [quoteSymbol, quoteDecimals] = await Promise.all([
    client.readContract({ address: quoteToken, abi: erc20Abi, functionName: "symbol", blockNumber: finalized }),
    client.readContract({ address: quoteToken, abi: erc20Abi, functionName: "decimals", blockNumber: finalized }),
  ]);

  const value: ConfigInfo = {
    configId: snapshot.configId.toString(),
    configHash: snapshot.configHash,
    enabled: snapshot.enabled,
    usingPublicTemplate: snapshot.configId === PUBLIC_TEMPLATE_CONFIG_ID,
    tokenDecimals: snapshot.config.tokenDecimals,
    quoteToken,
    quoteSymbol,
    quoteDecimals: Number(quoteDecimals),
    poolCreationFeeWei: snapshot.config.poolCreationFee.toString(),
    partnerRecipient: getAddress(snapshot.config.partnerRecipient),
    owner: getAddress(snapshot.identity.owner),
    migrationQuoteThreshold: snapshot.config.migrationQuoteThreshold.toString(),
    chain: {
      id: publicChain.id,
      name: publicChain.name,
      rpcUrl: publicChain.rpcUrl,
      explorerUrl: publicChain.explorerUrl,
      nativeSymbol: publicChain.nativeCurrency.symbol,
    },
    deploymentSlot: deployment.slot,
  };
  cache.set(key, { at: Date.now(), value });
  return value;
}

export async function readConfigSnapshot(configId: bigint, blockNumber: bigint) {
  await ensureCore(blockNumber);
  return getAmmoraV4ConfigAtBlock(getClient(), v4Core.configRegistry, configId, blockNumber);
}

export function asAddress(value: string, label: string): Address {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`${label} must be an address.`);
  return getAddress(value);
}
