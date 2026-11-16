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
import { isGiwaRateLimit } from "./errors";

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

export const giwaRpcTransport: ReturnType<typeof http> = (config) => {
  const transport = http(publicRpcUrl, {
    timeout: 12_000,
    retryCount: 1,
    retryDelay: 300,
    batch: { batchSize: 30, wait: 0 },
  })(config);
  const request: typeof transport.request = async (args, options) => {
    try {
      return await transport.request(args, options);
    } catch (error) {
      const isRead = /^eth_(get[A-Z][a-zA-Z]*|call|blockNumber|chainId|estimateGas|feeHistory|gasPrice|maxPriorityFeePerGas)$/.test(args.method);
      if (!isRead || !isGiwaRateLimit(error)) throw error;

      // GIWA uses -32016, which viem does not retry. Stagger concurrent retries.
      await new Promise((resolve) => setTimeout(resolve, 1_000 + Math.random() * 400));
      return transport.request(args, { ...options, retryCount: 0 });
    }
  };
  return { ...transport, request };
};

export function getClient() {
  client ??= createPublicClient({ chain: giwaChain, transport: giwaRpcTransport });
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
  const client = getClient();
  const [, finalized] = await Promise.all([
    ensureChain(),
    resolveAmmoraFinalizedHead([client], giwaSepoliaAutoRoute.finality),
  ]);
  const [latest, block] = await Promise.all([
    client.getBlockNumber(),
    client.getBlock({ blockNumber: finalized }),
  ]);
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
