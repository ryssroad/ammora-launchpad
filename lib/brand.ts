/**
 * Product branding. Change the name, URL, or copy here only.
 * GiwaMoon is an independent testnet app. It is not an official Ammora site.
 */
export const brand = {
  name: "GiwaMoon",
  url: "https://giwamoon.xyz",
  tagline: "A GIWA Sepolia testnet launchpad for creating tokens and trading their bonding curves.",
  description:
    "GiwaMoon is a GIWA Sepolia testnet launchpad for creating tokens and trading their bonding curves. Built with the Ammora SDK. Testnet only, pre-audit software.",
  builtWith: "Built with the Ammora SDK. Not an official Ammora site.",
  testnetNotice:
    "Testnet only, pre-audit software. GIWA Sepolia only — do not use real funds.",
  faucets: [
    { label: "GIWA faucet", href: "https://faucet.giwa.io" },
    { label: "Nodit faucet", href: "https://faucet.lambda256.io/giwa-sepolia" },
  ],
  guides: {
    launchpad: "https://docs.ammora.org/ai/launchpad.md",
    sdk: "https://www.npmjs.com/package/@ammora-protocol/sdk",
    chain: "https://docs.giwa.io/giwa-chain/en/get-started/connect-to-giwa",
  },
} as const;
