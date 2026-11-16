import {
  giwaSepoliaAutoRoute,
  giwaSepoliaAutoRouteDeployment,
  resolveAmmoraFinalizedHead,
  verifyAmmoraV4CoreAtBlock,
} from "@ammora-protocol/sdk";
import {
  createPublicClient,
  defineChain,
  http,
  type PublicClient,
} from "viem";
import { publicChain } from "@/lib/chain";

export const deployment = giwaSepoliaAutoRouteDeployment;

const catalogChain = deployment.chain;
if (catalogChain.id !== publicChain.id || catalogChain.rpcUrls[0] !== publicChain.rpcUrl) {
  throw new Error("The SDK GIWA catalog does not match this app's public chain parameters.");
}
if (catalogChain.blockExplorerUrl !== publicChain.explorerUrl) {
  throw new Error("The SDK GIWA catalog explorer does not match this app's public chain parameters.");
}
if (deployment.contracts.launch.protocolVersion !== 4) {
  throw new Error("This app requires the V4 launch deployment from the SDK catalog.");
}

export const v4Core = {
  configRegistry: deployment.contracts.launch.configRegistry,
  launchFactory: deployment.contracts.launch.factory,
  graduationAdapter: deployment.contracts.launch.graduationAdapter,
  feePolicy: deployment.contracts.launch.feePolicy,
} as const;

const rpcUrl = process.env.AMMORA_RPC_URL?.trim() || catalogChain.rpcUrls[0];

export const giwaChain = defineChain({
  id: catalogChain.id,
  name: catalogChain.name,
  nativeCurrency: catalogChain.nativeCurrency,
  rpcUrls: { default: { http: [rpcUrl] } },
  blockExplorers: catalogChain.blockExplorerUrl
    ? { default: { name: "GIWA Explorer", url: catalogChain.blockExplorerUrl } }
    : undefined,
});

/** Public JSON-RPC. Reads never go through the connected wallet. */
export const publicRpcUrl = rpcUrl;

let client: PublicClient | null = null;
let chainCheck: Promise<void> | null = null;

export function getClient() {
  client ??= createPublicClient({
    chain: giwaChain,
    transport: http(publicRpcUrl, { timeout: 12_000, retryCount: 0 }),
  });
  return client;
}

export function ensureChain() {
  chainCheck ??= (async () => {
    const id = await getClient().getChainId();
    if (id !== catalogChain.id) throw new Error(`RPC returned chain ${id}, not GIWA Sepolia ${catalogChain.id}.`);
  })().catch((error: unknown) => {
    chainCheck = null;
    throw error;
  });
  return chainCheck;
}

const coreChecks = new Map<string, Promise<void>>();

export function ensureCore(blockNumber: bigint) {
  const key = blockNumber.toString();
  let pending = coreChecks.get(key);
  if (!pending) {
    pending = verifyAmmoraV4CoreAtBlock(getClient(), v4Core, blockNumber).then(() => undefined).catch((error: unknown) => {
      coreChecks.delete(key);
      throw error;
    });
    coreChecks.set(key, pending);
    if (coreChecks.size > 8) {
      const oldest = coreChecks.keys().next().value;
      if (oldest) coreChecks.delete(oldest);
    }
  }
  return pending;
}

export async function readHead() {
  await ensureChain();
  const finalized = await resolveAmmoraFinalizedHead([getClient()], giwaSepoliaAutoRoute.finality);
  const latest = await getClient().getBlockNumber();
  const block = await getClient().getBlock({ blockNumber: finalized });
  return { finalized, latest, block };
}

export async function gasCap(baseFeePerGas: bigint | null) {
  const override = process.env.AMMORA_MAX_FEE_PER_GAS?.trim();
  if (override) {
    if (!/^\d+$/.test(override) || BigInt(override) <= 0n) {
      throw new Error("AMMORA_MAX_FEE_PER_GAS must be a positive integer in wei.");
    }
    return BigInt(override);
  }
  const base = baseFeePerGas ?? 0n;
  const cap = base * 2n + 150_000_000n;
  return cap < 150_000_000n ? 150_000_000n : cap;
}
