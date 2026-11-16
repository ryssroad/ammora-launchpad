import { defineChain } from "viem";

/**
 * Public GIWA Sepolia parameters. The server checks these against the SDK's
 * built-in catalog before it plans a transaction. Contract addresses are not
 * listed here; they come from that catalog.
 */
export const publicChain = {
  id: 91342,
  name: "GIWA Sepolia",
  rpcUrl: "https://sepolia-rpc.giwa.io",
  explorerUrl: "https://sepolia-explorer.giwa.io",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
} as const;

export const giwaSepolia = defineChain({
  id: publicChain.id,
  name: publicChain.name,
  nativeCurrency: publicChain.nativeCurrency,
  rpcUrls: { default: { http: [publicChain.rpcUrl] } },
  blockExplorers: {
    default: { name: "GIWA Explorer", url: publicChain.explorerUrl },
  },
});

export function explorerAddress(address: string) {
  return `${publicChain.explorerUrl}/address/${address}`;
}

export function explorerTx(hash: string) {
  return `${publicChain.explorerUrl}/tx/${hash}`;
}
