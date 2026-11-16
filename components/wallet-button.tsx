"use client";

import { useEffect, useState } from "react";
import { parseEther } from "viem";
import { giwaSepolia } from "@/lib/chain";
import { formatRaw, shortAddress } from "@/lib/format";
import { useGiwa } from "@/components/giwa-wallet";

export function WalletButton() {
  const [mounted, setMounted] = useState(false);
  const { address, chainId, balance, pending, hasProvider, connect, disconnect } = useGiwa();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-10 w-36" />;

  if (!address) {
    return (
      <div className="text-right">
        <button
          className="btn btn-gold"
          disabled={pending || !hasProvider}
          onClick={() => {
            setError(null);
            void connect().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not connect."));
          }}
        >
          {pending ? "Connecting…" : hasProvider ? "Connect wallet" : "No wallet found"}
        </button>
        {error ? <p className="mt-1 max-w-56 text-xs text-danger">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {chainId !== giwaSepolia.id ? (
        <button className="btn btn-gold" onClick={() => { setError(null); void connect().catch((reason: Error) => setError(reason.message)); }}>
          Add GIWA Sepolia
        </button>
      ) : (
        <span className="pill">{balance ? `${formatRaw(parseEther(balance), 18, 4)} ETH` : "ETH"}</span>
      )}
      {error ? <p role="alert" className="max-w-56 text-xs text-danger">{error}</p> : null}
      <button className="btn btn-ghost" title="Disconnect wallet" onClick={disconnect}>
        {shortAddress(address)}
      </button>
    </div>
  );
}
