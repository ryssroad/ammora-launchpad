"use client";

import { useState } from "react";
import { explorerTx } from "@/lib/chain";
import { localConfigId, saveLocalConfigId } from "@/lib/local-config";
import { shortAddress } from "@/lib/format";
import type { ConfigPlan, CreatedConfig } from "@/lib/types";
import { walletError } from "@/lib/wallet-error";
import { useGiwa } from "@/components/giwa-wallet";

export function ConfigAdmin() {
  const { address, ensureGiwaChain, sendAll } = useGiwa();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<ConfigPlan | null>(null);
  const [created, setCreated] = useState<CreatedConfig | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function preview() {
    setError(null);
    setCreated(null);
    if (!address) {
      setError("Connect the owner wallet. That address becomes the Config owner and every fee recipient.");
      return;
    }
    setBusy("Preparing the same unsigned Config plan as npm run create-config…");
    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create-config", account: address }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not preview the Config.");
      setPlan(body as ConfigPlan);
    } catch (reason) {
      setPlan(null);
      setError(reason instanceof Error ? reason.message : "Could not preview the Config.");
    } finally {
      setBusy(null);
    }
  }

  async function sign() {
    if (!plan || !address) return;
    setError(null);
    setCopied(false);
    try {
      setBusy("Switching to GIWA Sepolia…");
      await ensureGiwaChain();
      setBusy("Simulating the Config registration…");
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create-config", account: address }),
      });
      const fresh = (await response.json()) as ConfigPlan & { error?: string };
      if (!response.ok) throw new Error(fresh.error || "Simulation failed.");
      setPlan(fresh);
      if (fresh.reviewHash.toLowerCase() !== plan.reviewHash.toLowerCase()) {
        setError("The plan changed. Review the new summary, then sign.");
        return;
      }
      if (!fresh.simulation.ok) {
        setError(fresh.simulation.message);
        return;
      }
      setBusy("Waiting for the wallet…");
      const hash = await sendAll([fresh.transaction]);
      setBusy("Reading the Config ID from the receipt…");
      const parsedResponse = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "config-receipt", hash, account: address }),
      });
      const parsed = await parsedResponse.json();
      if (!parsedResponse.ok) throw new Error(parsed.error || "The transaction was sent, but the Config ID could not be parsed yet.");
      const createdConfig = parsed as CreatedConfig;
      saveLocalConfigId(createdConfig.configId);
      setCreated(createdConfig);
      setPlan(null);
    } catch (reason) {
      setError(walletError(reason));
    } finally {
      setBusy(null);
    }
  }

  async function copy(id: string) {
    await navigator.clipboard.writeText(id);
    setCopied(true);
  }

  return (
    <section className="panel p-5 sm:p-6">
      <button className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span>
          <p className="text-xs tracking-[0.18em] text-gold uppercase">Owner</p>
          <h2 className="mt-2 font-display text-3xl">Create my Config</h2>
        </span>
        <span className="pill mt-2">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <div className="mt-4">
          <p className="text-sm leading-6 text-muted">
            Signs with the connected wallet. No private key is stored. Recipients match <code>npm run create-config</code>: owner, partner, LP, and leftover are all this address. Defaults are template #6, 1,000 tokens, and a 0.000001 WETH graduation threshold.
          </p>
          {!address ? <p className="mt-3 text-sm text-clay">Connect a wallet to preview.</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn btn-gold" disabled={Boolean(busy) || !address} onClick={() => void preview()}>
              Preview Config
            </button>
            {plan ? (
              <button className="btn btn-ghost" disabled={Boolean(busy) || !plan.simulation.ok} onClick={() => void sign()}>
                Simulate and sign
              </button>
            ) : null}
          </div>
          {busy ? <p className="mt-3 text-sm text-muted">{busy}</p> : null}
          {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
          {plan ? (
            <div className="mt-4 rounded-2xl border border-line bg-card-2 px-4 py-3 text-sm leading-6 text-muted">
              <p>Owner and all recipients: {shortAddress(plan.owner)}</p>
              <p>Sale supply {plan.saleSupply} tokens. Graduation threshold {plan.quoteThreshold} quote tokens.</p>
              <p>Template #{plan.templateId}. Simulated Config ID {plan.simulatedConfigId} (not final).</p>
              <p className="break-all">reviewHash {plan.reviewHash}</p>
              <p className={plan.simulation.ok ? "text-ok" : "text-danger"}>{plan.simulation.message}</p>
              <p>{plan.note}</p>
            </div>
          ) : null}
          {created ? (
            <div className="mt-4 rounded-2xl border border-gold/50 bg-card-2 px-4 py-4">
              <p className="text-xs tracking-[0.16em] text-gold uppercase">Config ID from the receipt</p>
              <p className="mt-2 font-display text-5xl">{created.configId}</p>
              <p className="mt-2 text-sm leading-6 text-clay">Set CONFIG_ID in Vercel env and redeploy.</p>
              <p className="text-sm text-muted">This browser will use Config #{created.configId} now. Other visitors keep the server CONFIG_ID until that redeploy. {localConfigId() === created.configId ? "Saved in this browser." : null}</p>
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                <button className="btn btn-gold" onClick={() => void copy(created.configId)}>{copied ? "Copied" : "Copy Config ID"}</button>
                <a className="btn btn-ghost" href={explorerTx(created.hash)} target="_blank" rel="noreferrer">View transaction</a>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
