# GiwaMoon

GiwaMoon is a one-page token launchpad for [GIWA Sepolia](https://docs.giwa.io/giwa-chain/en/get-started/connect-to-giwa) (chain id `91342`). It creates tokens and trades their pre-graduation bonding curves through the public Ammora SDK.

This is an independent testnet app. It is not an official Ammora site. The product name and canonical URL live in [`lib/brand.ts`](lib/brand.ts).

**Testnet only, pre-audit software.** Do not use real funds.

## How it uses the SDK

The app pins `@ammora-protocol/sdk@0.3.9` and reads addresses from the SDK's built-in GIWA catalog (`giwaSepoliaAutoRouteDeployment` and `giwaSepoliaAtomicLaunchDeployment`). It does not ship a handwritten contract list. Before a plan is shown, the server checks the RPC chain and calls `verifyAmmoraV4CoreAtBlock`. Launch plans also call `verifyAmmoraPortableDeploymentAtBlock` on the SDK's reviewed atomic GIWA manifest, which checks runtime code hashes.

| Action | SDK |
| --- | --- |
| Live Config (decimals, fee, quote token, hash) | `getAmmoraV4ConfigAtBlock` |
| Create a token on that Config | `AmmoraPortableLaunchPlanner.planCreate` |
| Create a token and buy in one transaction | `AmmoraPortableLifecyclePlanner.planExistingConfigAtomicFirstBuy` |
| First-buy estimate before the curve exists | `quoteALCSegmentedExactInput`, `classifyAmmoraV4ExactInputFill`, `minOutFromSlippage` |
| Curve quote, buy, and sell | `AmmoraV4LaunchCurveClient.quoteExactInputAtBlock` and `planSwapExactInput` |
| ERC-20 approval for a trade | `planERC20Approvals` |
| Graduation progress and migration | `getMigrationProgressAtBlock`, `planMigrateAtBlock` |
| Receipt identities | `parseAmmoraV4LaunchCreatedReceipt`, `parseAmmoraV4SwapReceipt`, `parseAmmoraV4MigratedReceipt` |
| Launch discovery | `AmmoraDataApiClient('https://ammora-giwa-sepolia-data.fly.dev').getLaunches({ chainId: 91342n })` |
| This deployment's own Config | `AmmoraPortableLifecyclePlanner.planConfigRegistration` in `npm run create-config` |

`ALCClient.planLaunchWithTokenConfigFromConfig` is the V3 helper named in the SDK README. On the current GIWA V4 registry it fails while decoding Config storage (`Position 2047 is out of bounds`). GiwaMoon uses the V4 portable planners instead, and still binds the live Config's decimals, pool-creation fee, and hash.

`createConfigAndPoolWithFirstBuy` registers a **new** Config on every call. A launchpad reuses one Config, so the form uses the existing-Config planner. The owner script creates that Config once.

Quotes and plans are unsigned. The browser sends them with the connected wallet. The site has no runtime secret.

If the Data API is down, the feed falls back to recent `LaunchCreated` logs on the catalog factory and says so on the page.

## Generated on-chain glyphs

The launch form generates a symmetric SVG glyph with a shuffle control. Its complete SVG is embedded as a base64 image in the JSON data URI, passed as both `metadataURI` and `creatorMetadataURI` to the existing Ammora V4 factory. No image host, IPFS service, API key, new contract, or image-generation service is needed. The original launch metadata is included in the factory event; the factory also exposes creator metadata via `creatorMetadataURI(curve)`. Creator metadata can subsequently be changed by its creator, so it is not an immutability guarantee.

The SDK limit remains 2,048 UTF-8 bytes. The client checks the complete encoded JSON size, and the server checks byte length too. Rendering only accepts HTTPS art or the exact inert SVG grammar generated here (no scripts, foreign objects, or external resources). Existing HTTPS images remain supported. Address lookups now read the factory metadata as well as token details.

Transaction reviews are bound to the form, account, network and launch settings. Editing those invalidates the review. Submitted launch hashes are displayed before receipt polling finishes, and an old launch plan cannot be resent after a receipt-read failure. Wallet signing and actual launch/trade receipts still need an end-to-end wallet QA pass.

## Setup

Node 22 or newer.

```bash
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:3000. Wallet connection uses viem and the injected provider (MetaMask or another browser wallet). The app asks the wallet to add GIWA Sepolia.

Test ETH for gas:

- https://faucet.giwa.io
- https://faucet.lambda256.io/giwa-sepolia

Buys spend WETH, not ETH. The token page can wrap a chosen amount of ETH into the Config's quote token.

### Environment

| Variable | Where | Purpose |
| --- | --- | --- |
| `CONFIG_ID` | Server, optional | Launch Config. Defaults to `6`, the reviewed public template, so the site works before you create one. Partner fees on that template go to its existing recipient. |
| `NEXT_PUBLIC_CONFIG_ID` | Optional | Used only when `CONFIG_ID` is unset. |
| `NEXT_PUBLIC_OWNER_ADDRESS` | Public, build-time | Owner wallet. Connecting it shows **Create my Config** and the Config fee notes. It is inlined into the client, so set it on Vercel before the build. |
| `AMMORA_PRIVATE_KEY` | Local `create-config` only | Throwaway testnet key. Never set this on Vercel and never prefix it with `NEXT_PUBLIC_`. |
| `AMMORA_ACCOUNT` | Local preview | Public address for a keyless Config preview. |
| `AMMORA_SEND` | Local | `0` previews. `1` sends, and only with `AMMORA_REVIEW_HASH`. |
| `AMMORA_REVIEW_HASH` | Local | Hash printed by the preview. |
| `SALE_SUPPLY_RAW`, `QUOTE_THRESHOLD_RAW` | Local | Raw integers. Defaults are the launchpad guide's example: `1000000000000` (1,000 tokens at 9 decimals, and 0.000001 WETH at 18 decimals). |
| `AMMORA_RPC_URL` | Optional | Overrides the catalog RPC. |

## Create your Config

The default template lets anyone launch, but its partner, LP, and leftover recipients are not yours. Create one Config and reuse it. Both paths use the same SDK plan: template #6, sale supply `1000000000000` (1,000 tokens), graduation threshold `1000000000000` (0.000001 WETH), and all four recipients set to the owner.

### In the browser

Public visitors do not see **Create my Config** or the note that partner fees on the public template do not come to them. They only see a short Config number.

The owner UI appears when either of these is true:

- The page is opened with `?admin` once. That browser stores the flag and keeps showing the owner tools afterward.
- The connected wallet equals `NEXT_PUBLIC_OWNER_ADDRESS`.

Then expand **Create my Config**.

1. Preview. Reads use the public GIWA HTTP RPC, not the wallet. Each step has a 20 second limit and the card lists the step in progress. The card shows the recipients, economics, simulated Config ID, and `reviewHash`. The server simulates the registration with `eth_call` and checks the wallet has enough ETH for gas. Retry if a step times out.
2. Simulate and sign. The wallet switches to GIWA Sepolia, the plan is built again, and MetaMask asks you to send it. A rejected signature sends nothing.
3. The receipt is parsed with `parseAmmoraV4ConfigCreatedReceipt`. Copy the Config ID. This browser stores it in `localStorage` and uses it for launches immediately. Other visitors still use the server `CONFIG_ID`.
4. Set `CONFIG_ID` in the Vercel environment to that ID and redeploy. A custom server Config takes priority over the browser value.

### From the command line

`npm run create-config` still works. It does not require a key for the preview.

```bash
# Keyless preview if AMMORA_ACCOUNT is a public address.
npm run create-config

# After you have read the printed recipients, economics, and reviewHash:
AMMORA_SEND=1 AMMORA_REVIEW_HASH=0x… npm run create-config
```

The signer must be the Config owner. The script prints a simulated Config ID, then the real ID from `parseAmmoraV4ConfigCreatedReceipt`. Put that ID in `CONFIG_ID`. Do not send the creation twice. Keep the private key out of Vercel either way.

The wallet that signs a launch becomes that token's creator. Config ownership does not make you the creator of every token.

## Deploy on Vercel

The app is a standard Next.js App Router project. Vercel detects it with no extra config.

1. Import the GitHub repository.
2. Framework preset: Next.js. Build command `npm run build`. No install override.
3. Do not add `AMMORA_PRIVATE_KEY`.
4. Optionally set `CONFIG_ID` to your confirmed Config. Leave it unset to keep public template `6`.
5. Deploy. `npm run build` and `npm run lint` should pass before you do.

### Custom domain on Cloudflare

The canonical URL is https://giwamoon.xyz (`brand.url`).

1. In the Vercel project, open **Settings → Domains** and add `giwamoon.xyz`. Add `www.giwamoon.xyz` as well if you want the www host. Set `giwamoon.xyz` as the primary domain so Vercel redirects the other host.
2. In Cloudflare DNS for `giwamoon.xyz`, set the proxy status to **DNS only** (grey cloud). Leave the orange-cloud proxy off. A proxied record prevents Vercel from issuing and serving the certificate.
3. For `www`, create a `CNAME` record pointing at `cname.vercel-dns.com`.
4. For the apex, Cloudflare can use either:
   - a `CNAME` (flattened) to `cname.vercel-dns.com`, still DNS only, or
   - an `A` record. Vercel's DNS docs use `76.76.21.21` as the example apex address. When you add the domain, Vercel shows the exact record to copy. Use that value if it differs.
5. Wait until Vercel reports the domain as valid and the certificate is ready. DNS changes can take a few minutes, and longer if an old record was cached.

Do not point the domain at a guessed IP. The records above are the ones Vercel documents for a project domain.

## Checks

```bash
npm run lint
npm test
npm run build
npm run verify-reads
```

`verify-reads` calls GIWA Sepolia and the Data API. It does not send a transaction. It prints the Config, one live curve quote when the curve is still trading, and an unsigned launch plan.

## SDK notes worth knowing

- Gas is ETH. The quote asset on this deployment is WETH. They are separate balances.
- An `APPROVAL_REQUIRED` plan is only the WETH approval. The token does not exist yet. After the approval confirms, prepare the same launch again and sign the `READY` transaction. Do not resend a launch that already has a successful receipt.
- Predicted token and curve addresses are not proof of creation. The receipt parsers are.
- Ordinary trades stay strict. Partial fill is enabled only when `classifyAmmoraV4ExactInputFill` returns `graduation-boundary`. A partial sell is rejected. `terminal-dust` is not sent.
- `Ready to migrate` means the curve is full. `planMigrateAtBlock` is a second, permissionless transaction.
- Graduated curves no longer quote swaps. The page shows the canonical pool.
- The public RPC is rate-limited. The server paces calls. A cold Data API on Fly has been returning HTTP 503; the factory-log fallback covers that.
- Empty Data API error bodies make `AmmoraDataApiClient` throw `Body is unusable` because it reads the body twice. GiwaMoon buffers the response before handing it to the client.
- Config creation and the atomic first buy both need a fresh confirmed block. The app uses `resolveAmmoraFinalizedHead` (12 confirmations on this catalog).
