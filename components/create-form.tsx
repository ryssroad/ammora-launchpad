"use client";

import { useEffect, useState } from "react";
import { buildMetadataUri } from "@/lib/metadata";
import { glyphImage, newGlyphSeed } from "@/lib/glyph";
import { explorerTx } from "@/lib/chain";
import { formatRaw, shortAddress } from "@/lib/format";
import { localConfigId } from "@/lib/local-config";
import type { PlanView, QuoteView, ReceiptView } from "@/lib/types";
import { useGiwa } from "@/components/giwa-wallet";
import { useLaunchConfig } from "@/components/use-launch-config";
import { useOwnerMode } from "@/components/use-owner";

export function CreateForm() {
  const { address, chainId, sendAll, connect } = useGiwa();
  const isOwner = useOwnerMode();
  const { config, error: configError } = useLaunchConfig();
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [glyphSeed, setGlyphSeed] = useState(21973);
  const [description, setDescription] = useState("");
  const [firstBuy, setFirstBuy] = useState("");
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [plan, setPlan] = useState<PlanView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReceiptView | null>(null);

  const [planKey, setPlanKey] = useState("");
  const formKey = JSON.stringify([name, symbol, glyphSeed, description, firstBuy, address, chainId, config?.configId]);
  const currentPlan = planKey === formKey ? plan : null;
  const image = glyphImage(glyphSeed);

  useEffect(() => { setPlan(null); }, [formKey]);
  useEffect(() => { setGlyphSeed(newGlyphSeed()); }, []);
  useEffect(() => {
    const controller = new AbortController();
    setQuote(null);
    if (!firstBuy.trim() || !config) {
      setQuote(null);
      return;
    }
    const handle = setTimeout(() => {
      void fetch("/api/quote", {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: firstBuy, slippageBps: 100, localConfigId: localConfigId() }),
      })
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || "Quote failed.");
          if (controller.signal.aborted) return;
          setQuote(body as QuoteView);
          setError(null);
        })
        .catch((reason: unknown) => {
          if (controller.signal.aborted) return;
          setQuote(null);
          setError(reason instanceof Error ? reason.message : "Quote failed.");
        });
    }, 400);
    return () => { clearTimeout(handle); controller.abort(); };
  }, [firstBuy, config]);

  async function prepare() {
    setError(null);
    setResult(null);
    setPlan(null);
    if (!address) {
      setError("Connect a wallet first. The connected account becomes the token creator.");
      return;
    }
    setBusy("Checking your launch…");
    try {
      const metadataUri = buildMetadataUri({ name: name.trim(), symbol: symbol.trim(), image, description: description.trim() || undefined });
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "launch",
          name,
          symbol,
          metadataUri,
          firstBuy,
          slippageBps: 100,
          account: address,
          localConfigId: localConfigId(),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not prepare the launch.");
      setPlanKey(formKey);
      setPlan(body as PlanView);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not prepare the launch.");
    } finally {
      setBusy(null);
    }
  }

  async function sign() {
    if (!currentPlan) return;
    const plan = currentPlan;
    setPlan(null);
    setError(null);
    setBusy(plan.replanAfterApproval ? "Waiting for the approval…" : "Waiting for the wallet…");
    try {
      const hash = await sendAll([plan.transaction], plan.replanAfterApproval ? undefined : (hash) => {
        setResult({ hash, token: null, curve: null, configId: null, canonicalPool: null, amountOut: null });
      });
      if (plan.replanAfterApproval) {
        setPlan(null);
        setBusy("Approval confirmed. Preparing the launch again…");
        await prepare();
        return;
      }
      setBusy("Reading the receipt…");
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "receipt", kind: "launch", hash }),
      });
      const body = await response.json();
      if (!response.ok) {
        setResult({ hash, token: null, curve: null, configId: null, canonicalPool: null, amountOut: null });
        throw new Error(body.error || "The transaction was sent, but the receipt could not be parsed yet.");
      }
      setResult(body as ReceiptView);
      window.dispatchEvent(new Event("launch-created"));
      setPlan(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The wallet request failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel p-5 sm:p-6">
      <p className="text-xs tracking-[0.18em] text-gold uppercase">Create</p>
      <h2 className="mt-2 font-display text-3xl">Launch a token</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Give your token a name and a glyph. Make it yours, then launch.
      </p>

      {config && !isOwner ? <p className="mt-4 text-xs text-muted">Launch fee {formatRaw(config.poolCreationFeeWei, 18)} ETH + network gas</p> : null}
      {config && isOwner ? (
        <div className="mt-4 rounded-2xl border border-line bg-card-2 px-4 py-3 text-sm leading-6 text-muted">
          <p>
            Config #{config.configId}
            {config.enabled ? " · enabled" : " · disabled"} · {config.tokenDecimals} decimals · quote {config.quoteSymbol}
          </p>
          <p>
            Pool creation fee {formatRaw(config.poolCreationFeeWei, 18)} ETH. Partner fees go to{" "}
            {address && config.partnerRecipient.toLowerCase() === address.toLowerCase() ? "your address" : shortAddress(config.partnerRecipient)}.
          </p>
          {config.source === "template" ? (
            <p className="mt-1 text-clay">
              This is the public template Config, so partner fees do not come to you. Create your own Config below, or run <code>npm run create-config</code>, then set CONFIG_ID.
            </p>
          ) : null}
          {config.source === "local" ? (
            <p className="mt-1 text-ok">
              This browser is using Config #{config.configId} created here. Launches from this browser use it immediately. Other visitors keep the server CONFIG_ID until you set CONFIG_ID in Vercel and redeploy.
            </p>
          ) : null}
          {config.source === "env" ? (
            <p className="mt-1 text-clay">
              This site is using Config #{config.configId} from the server environment. Partner fees go to{" "}
              {address && config.partnerRecipient.toLowerCase() === address.toLowerCase() ? "your address" : shortAddress(config.partnerRecipient)}.
            </p>
          ) : null}
        </div>
      ) : null}
      {config && !config.enabled ? <p role="alert" className="mt-4 text-sm text-danger">New launches are temporarily paused.</p> : null}
      {!config ? (
        <p className="mt-4 text-sm text-danger">{configError || "Loading launch settings…"}</p>
      ) : null}

      <fieldset disabled={Boolean(busy)} className="mt-5 grid min-w-0 gap-3">
        <label className="grid gap-1 text-sm text-muted">
          Name
          <input className="field" value={name} maxLength={32} onChange={(event) => setName(event.target.value)} placeholder="Moon Sample" />
        </label>
        <label className="grid gap-1 text-sm text-muted">
          Ticker
          <input className="field uppercase" value={symbol} maxLength={10} onChange={(event) => setSymbol(event.target.value.toUpperCase())} placeholder="MOON" />
        </label>
        <div className="glyph-picker">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="Your token glyph" width={96} height={96} className="rounded-2xl" />
          <div>
            <p className="text-sm font-medium">Your token’s glyph</p>
            <p className="mt-1 text-xs leading-5 text-muted">Saved with your token on-chain.</p>
            <button type="button" className="btn btn-ghost mt-2" onClick={() => setGlyphSeed(newGlyphSeed())}>Shuffle glyph</button>
          </div>
        </div>
        <label className="grid gap-1 text-sm text-muted">
          Short description
          <input className="field" value={description} maxLength={140} onChange={(event) => setDescription(event.target.value)} placeholder="Optional" />
        </label>
        <label className="grid gap-1 text-sm text-muted">
          First buy ({config?.quoteSymbol ?? "quote token"}, optional)
          <input className="field" value={firstBuy} onChange={(event) => setFirstBuy(event.target.value)} placeholder="Leave blank to skip" inputMode="decimal" />
        </label>
        {firstBuy ? <p className="text-xs leading-5 text-muted">You need {config?.quoteSymbol ?? "WETH"} for this purchase and ETH for gas. Leave blank to launch without buying.</p> : null}
      </fieldset>

      {quote ? (
        <p className="mt-3 text-sm text-clay">
          Estimated first buy: {formatRaw(quote.amountOutRaw, quote.tokenDecimals)} tokens, minimum {formatRaw(quote.minimumAmountOutRaw, quote.tokenDecimals)} at 1% slippage.
        </p>
      ) : null}
      {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
      {busy ? <p className="mt-3 text-sm text-muted">{busy}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn btn-gold" disabled={Boolean(busy) || !config?.enabled || Boolean(result)} onClick={() => { if (!address) void connect().catch((reason: Error) => setError(reason.message)); else void prepare(); }}>
          {address ? "Review launch" : "Connect wallet"}
        </button>
        {currentPlan ? (
          <button className="btn btn-ghost" disabled={Boolean(busy)} onClick={() => void sign()}>
            {currentPlan.replanAfterApproval ? "Approve first buy" : "Confirm launch"}
          </button>
        ) : null}
      </div>

      {currentPlan ? (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm leading-6 text-muted">
          {currentPlan.summary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}

      {result ? (
        <div className="mt-4 text-sm leading-6">
          <a className="text-gold underline" href={explorerTx(result.hash)} target="_blank" rel="noreferrer">
            View transaction
          </a>
          {result.token ? <p className="break-all">Your token is live: {result.token}</p> : <p>Transaction submitted. Check its status before starting another launch.</p>}
          <button className="btn btn-ghost mt-2" disabled={Boolean(busy)} onClick={() => { setResult(null); setPlan(null); setName(""); setSymbol(""); setDescription(""); setFirstBuy(""); setGlyphSeed(newGlyphSeed()); }}>Create another token</button>
        </div>
      ) : null}
    </section>
  );
}
