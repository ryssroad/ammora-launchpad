import { AmmoraDataApiClient, type AmmoraLaunchSummary } from "@ammora-protocol/sdk";
import { getAddress, parseAbiItem, zeroAddress, type Address } from "viem";
import type { FeedResponse, LaunchCard } from "@/lib/types";
import { publicError } from "@/lib/ammora/errors";
import { readLaunchCard } from "@/lib/ammora/curve";
import { getClient, readHead, v4Core } from "@/lib/ammora/rpc";

export const DATA_API_URL = "https://ammora-giwa-sepolia-data.fly.dev";

const launchCreated = parseAbiItem(
  "event LaunchCreated(address indexed token, address indexed curve, address indexed creator, uint256 configId, bytes32 configHash, uint16 protocolVersion, string metadataURI)",
);

let cache: { at: number; value: FeedResponse } | null = null;

type BufferedResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

async function bufferedFetch(input: string, init?: RequestInit): Promise<BufferedResponse> {
  const response = await fetch(input, init);
  const text = await response.text();
  let parsed: unknown;
  let isJson = false;
  try {
    parsed = text ? JSON.parse(text) : null;
    isJson = true;
  } catch {
    isJson = false;
  }
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    json: async () => {
      if (!isJson) throw new Error(text || response.statusText || "Data API returned an empty response.");
      return parsed;
    },
    text: async () => text,
  };
}

async function fromDataApi(blockNumber: bigint): Promise<FeedResponse> {
  const data = new AmmoraDataApiClient(DATA_API_URL, bufferedFetch);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const page = await data.getLaunches({ chainId: 91_342n, signal: controller.signal });
    const items = [...page.items]
      .filter((item) => !item.blacklisted)
      .sort((a, b) => (BigInt(a.createdBlock) > BigInt(b.createdBlock) ? -1 : 1))
      .slice(0, 8);
    const launches = await enrich(items.map(summaryToSeed), blockNumber);
    return { source: "data-api", warning: null, launches };
  } finally {
    clearTimeout(timer);
  }
}

function summaryToSeed(item: AmmoraLaunchSummary) {
  return {
    token: getAddress(item.address),
    curve: getAddress(item.curveAddress),
    creator: getAddress(item.creatorAddress),
    metadataUri: item.metadataUri,
  };
}

async function fromFactoryLogs(latest: bigint, blockNumber: bigint): Promise<FeedResponse> {
  const client = getClient();
  const seeds: Array<{ token: Address; curve: Address; creator: Address; metadataUri: string; blockNumber: bigint }> = [];
  const span = 10_000n;
  for (let end = latest; end > latest - 40_000n && seeds.length < 8; end -= span) {
    const start = end > span ? end - span + 1n : 0n;
    const logs = await client.getLogs({
      address: v4Core.launchFactory,
      event: launchCreated,
      fromBlock: start,
      toBlock: end,
    });
    for (const log of logs.reverse()) {
      const token = log.args.token;
      const curve = log.args.curve;
      const creator = log.args.creator;
      if (!token || !curve || !creator || token === zeroAddress || curve === zeroAddress) continue;
      seeds.push({
        token: getAddress(token),
        curve: getAddress(curve),
        creator: getAddress(creator),
        metadataUri: log.args.metadataURI ?? "",
        blockNumber: log.blockNumber ?? end,
      });
      if (seeds.length >= 8) break;
    }
  }
  seeds.sort((a, b) => (a.blockNumber > b.blockNumber ? -1 : 1));
  const launches = await enrich(seeds, blockNumber);
  return {
    source: "factory-logs",
    warning: "The Ammora Data API did not respond. This list is recent LaunchCreated logs from the reviewed factory, not the indexer feed.",
    launches,
  };
}

async function enrich(
  seeds: Array<{ token: Address; curve: Address; creator: Address; metadataUri: string }>,
  blockNumber: bigint,
) {
  const launches: LaunchCard[] = [];
  for (const seed of seeds) {
    try {
      launches.push(await readLaunchCard(seed.curve, blockNumber, seed.metadataUri, seed.creator));
    } catch {
      // A brand-new launch can sit ahead of the confirmed head. Skip it rather than fail the page.
    }
  }
  return launches;
}

export async function listLaunches(): Promise<FeedResponse> {
  if (cache && Date.now() - cache.at < 20_000) return cache.value;
  const { finalized, latest } = await readHead();
  let value: FeedResponse;
  try {
    value = await fromDataApi(finalized);
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError" ? "The Data API timed out." : publicError(error);
    try {
      const fallback = await fromFactoryLogs(latest, finalized);
      fallback.warning = `${fallback.warning} (${reason})`;
      value = fallback;
    } catch (logsError) {
      throw new Error(`Launch feed is unavailable. Data API: ${publicError(error)} Factory logs: ${publicError(logsError)}`);
    }
  }
  cache = { at: Date.now(), value };
  return value;
}
