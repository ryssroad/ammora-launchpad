import { erc20Abi, getAddress, type Address } from "viem";
import { getAmmoraV4ConfigAtBlock } from "@ammora-protocol/sdk";
import { publicChain } from "@/lib/chain";
import type { ConfigInfo, ConfigSource } from "@/lib/types";
import { configIdFromEnv, parsePositiveInt } from "@/lib/ammora/errors";
import { deployment, ensureCore, getClient, readHead, v4Core } from "@/lib/ammora/rpc";

/** Reviewed public template from the Ammora launchpad guide. Creators can launch on it before owning a Config. */
export const PUBLIC_TEMPLATE_CONFIG_ID = 6n;

const cache = new Map<string, { at: number; value: ConfigInfo }>();

/**
 * A custom server CONFIG_ID wins for every visitor.
 * Template #6 (or an unset env) lets this browser pass a Config it just created.
 */
export function resolveActiveConfigId(requested?: string | null): { id: bigint; source: ConfigSource } {
  const envRaw = process.env.CONFIG_ID?.trim() || process.env.NEXT_PUBLIC_CONFIG_ID?.trim() || "";
  const envId = envRaw ? parsePositiveInt(envRaw, "CONFIG_ID") : null;
  const localRaw = requested?.trim() || "";
  const localId = /^[1-9]\d*$/.test(localRaw) ? BigInt(localRaw) : null;
  if (envId !== null && envId !== PUBLIC_TEMPLATE_CONFIG_ID) return { id: envId, source: "env" };
  if (localId !== null && localId !== PUBLIC_TEMPLATE_CONFIG_ID) return { id: localId, source: "local" };
  return { id: PUBLIC_TEMPLATE_CONFIG_ID, source: "template" };
}

export async function readActiveConfig(requested?: string | null): Promise<ConfigInfo> {
  const resolved = resolveActiveConfigId(requested);
  const info = await readConfig(resolved.id);
  return { ...info, source: resolved.source, usingPublicTemplate: resolved.source === "template" };
}

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

  const value = {
    configId: snapshot.configId.toString(),
    configHash: snapshot.configHash,
    enabled: snapshot.enabled,
    usingPublicTemplate: snapshot.configId === PUBLIC_TEMPLATE_CONFIG_ID,
    source: snapshot.configId === PUBLIC_TEMPLATE_CONFIG_ID ? "template" as const : "env" as const,
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
