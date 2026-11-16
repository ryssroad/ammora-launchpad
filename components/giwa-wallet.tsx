"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  erc20Abi,
  formatEther,
  http,
  numberToHex,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { giwaSepolia } from "@/lib/chain";
import type { TxJson } from "@/lib/types";
import { walletError } from "@/lib/wallet-error";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

type GiwaWallet = {
  address: Address | null;
  chainId: number | null;
  balance: string | null;
  pending: boolean;
  hasProvider: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  ensureGiwaChain: () => Promise<void>;
  sendAll: (transactions: TxJson[], onSubmitted?: (hash: Hash) => void) => Promise<Hash>;
  readBalance: (token?: Address) => Promise<bigint | null>;
};

const GiwaContext = createContext<GiwaWallet | null>(null);

function ethereumProvider() {
  if (typeof window === "undefined") return null;
  return (window as Window & { ethereum?: EthereumProvider }).ethereum ?? null;
}

const publicClient = createPublicClient({
  chain: giwaSepolia,
  transport: http(giwaSepolia.rpcUrls.default.http[0]),
});

async function addOrSwitch(provider: EthereumProvider) {
  const chainId = numberToHex(giwaSepolia.id);
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? Number(error.code) : 0;
    if (code !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName: giwaSepolia.name,
          nativeCurrency: giwaSepolia.nativeCurrency,
          rpcUrls: [...giwaSepolia.rpcUrls.default.http],
          blockExplorerUrls: [giwaSepolia.blockExplorers.default.url],
        },
      ],
    });
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [hasProvider, setHasProvider] = useState(false);

  const refresh = useCallback(async (account?: Address) => {
    const provider = ethereumProvider();
    if (!provider) return;
    const accounts = account
      ? [account]
      : ((await provider.request({ method: "eth_accounts" })) as Address[]);
    const next = accounts[0] ?? null;
    const id = Number(await provider.request({ method: "eth_chainId" }));
    setAddress(next);
    setChainId(id);
    if (next && id === giwaSepolia.id) {
      const value = await publicClient.getBalance({ address: next }).catch(() => null);
      setBalance(value === null ? null : formatEther(value));
    } else {
      setBalance(null);
    }
  }, []);

  useEffect(() => {
    const provider = ethereumProvider();
    setHasProvider(Boolean(provider));
    if (!provider) return;
    void refresh().catch(() => setBalance(null));
    const onAccounts = (...args: unknown[]) => {
      const accounts = args[0] as Address[];
      void refresh(accounts[0]).catch(() => setBalance(null));
    };
    const onChain = () => {
      void refresh().catch(() => setBalance(null));
    };
    provider.on?.("accountsChanged", onAccounts);
    provider.on?.("chainChanged", onChain);
    return () => {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
    };
  }, [refresh]);

  const api = useMemo<GiwaWallet>(() => {
    return {
      address,
      chainId,
      balance,
      pending,
      hasProvider,
      connect: async () => {
        const provider = ethereumProvider();
        if (!provider) throw new Error("No injected wallet found. Install MetaMask or another browser wallet.");
        setPending(true);
        try {
          const accounts = (await provider.request({ method: "eth_requestAccounts" })) as Address[];
          await addOrSwitch(provider);
          await refresh(accounts[0]);
        } catch (error) {
          throw new Error(walletError(error));
        } finally {
          setPending(false);
        }
      },
      ensureGiwaChain: async () => {
        const provider = ethereumProvider();
        if (!provider) throw new Error("No injected wallet found. Install MetaMask or another browser wallet.");
        if (!address) throw new Error("Connect a wallet first.");
        try {
          await addOrSwitch(provider);
          await refresh(address);
        } catch (error) {
          throw new Error(walletError(error));
        }
      },
      disconnect: () => {
        setAddress(null);
        setBalance(null);
      },
      readBalance: async (token?: Address) => {
        if (!address || chainId !== giwaSepolia.id) return null;
        if (!token) return publicClient.getBalance({ address }).catch(() => null);
        return publicClient.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        }).catch(() => null);
      },
      sendAll: async (transactions: TxJson[], onSubmitted) => {
        const provider = ethereumProvider();
        if (!provider || !address) throw new Error("Connect a wallet first.");
        try {
          await addOrSwitch(provider);
          const wallet = createWalletClient({
            account: address,
            chain: giwaSepolia,
            transport: custom(provider),
          });
          let hash: Hash | null = null;
          for (const [index, tx] of transactions.entries()) {
          const accounts = await provider.request({ method: "eth_accounts" }) as Address[];
          if (accounts[0]?.toLowerCase() !== address.toLowerCase()) throw new Error("Your wallet account changed. Review the transaction again.");

            hash = await wallet.sendTransaction({
              account: address,
              chain: giwaSepolia,
              to: tx.to as Address,
              data: tx.data as Hex,
              value: BigInt(tx.value || "0"),
            });
            if (index === transactions.length - 1) onSubmitted?.(hash);
            const receipt = await publicClient.waitForTransactionReceipt({
              hash,
              confirmations: 1,
              timeout: 90_000,
            });
            if (receipt.status !== "success") throw new Error("The transaction reverted.");
          }
          if (!hash) throw new Error("Nothing to send.");
          await refresh(address).catch(() => setBalance(null));
          return hash;
        } catch (error) {
          throw new Error(walletError(error));
        }
      },
    };
  }, [address, balance, chainId, hasProvider, pending, refresh]);

  return <GiwaContext.Provider value={api}>{children}</GiwaContext.Provider>;
}

export function useGiwa() {
  const value = useContext(GiwaContext);
  if (!value) throw new Error("Wallet provider is missing.");
  return value;
}
