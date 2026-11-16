import { formatUnits, parseUnits } from "viem";
import { readConfig } from "../lib/ammora/config.js";
import { readLaunchCard } from "../lib/ammora/curve.js";
import { DATA_API_URL, listLaunches } from "../lib/ammora/feed.js";
import { planLaunch } from "../lib/ammora/launch.js";
import { ensureChain, readHead } from "../lib/ammora/rpc.js";
import { quoteTrade } from "../lib/ammora/trade.js";

async function main() {
await ensureChain();
const head = await readHead();
const config = await readConfig(6n);
if (!config.enabled) throw new Error("Public template Config #6 is disabled.");
const feed = await listLaunches();
const sample = feed.launches[0];
if (!sample) throw new Error("No launch was readable from the factory or Data API.");
const card = await readLaunchCard(sample.curve as `0x${string}`, head.finalized, sample.metadataUri);
let quote: unknown = null;
if (card.status === 1) {
  quote = await quoteTrade({ curve: card.curve, side: "buy", amount: formatUnits(parseUnits("0.0001", card.quoteDecimals), card.quoteDecimals), slippage: 100 });
}
const plan = await planLaunch({
  name: "GiwaMoon Probe",
  symbol: "PROBE",
  metadataUri: "https://giwamoon.xyz/api/metadata?name=GiwaMoon%20Probe&symbol=PROBE",
  account: "0x0000000000000000000000000000000000000001",
});

console.log(JSON.stringify({
  chainId: config.chain.id,
  finalizedBlock: head.finalized.toString(),
  config: {
    id: config.configId,
    hash: config.configHash,
    enabled: config.enabled,
    tokenDecimals: config.tokenDecimals,
    quote: config.quoteSymbol,
    poolCreationFeeWei: config.poolCreationFeeWei,
    slot: config.deploymentSlot,
  },
  feed: { source: feed.source, warning: feed.warning, count: feed.launches.length, dataApi: DATA_API_URL },
  sample: { token: card.token, symbol: card.symbol, status: card.statusLabel, progressBps: card.progressBps },
  quote,
  unsignedLaunch: { to: plan.transaction.to, value: plan.transaction.value, summary: plan.summary[0] },
}, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
