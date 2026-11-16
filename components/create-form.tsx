"use client";

import { useEffect, useState } from "react";
import { buildMetadataUri, httpsUrl } from "@/lib/metadata";
import { explorerTx } from "@/lib/chain";
import { formatRaw, shortAddress } from "@/lib/format";
import type { ConfigInfo, PlanView, QuoteView, ReceiptView } from "@/lib/types";
import { useGiwa } from "@/components/giwa-wallet";

export function CreateForm() {
  const { address, sendAll } = useGiwa();
  const [config, setConfig] = useState<ConfigInfo | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [image, setImage] = useState("");
  const [description, setDescription] = useState("");
  const [metadataOverride, setMetadataOverride] = useState("");
  const [firstBuy, setFirstBuy] = useState("");
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [plan, setPlan] = useState<PlanView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReceiptView | null>(null);

  useEffect(() => {
    void fetch("/api/config")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Config could not be read.");
        setConfig(body as ConfigInfo);
      })
      .catch((reason: unknown) => setConfigError(reason instanceof Error ? reason.message : "Config could not be read."));
  }, []);

  useEffect(() => {
    if (!firstBuy.trim() || !config) {
      setQuote(null);
      return;
    }
    const handle = setTimeout(() => {
      void fetch("/api/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: firstBuy, slippageBps: 100 }),
      })
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || "Quote failed.");
          setQuote(body as QuoteView);
          setError(null);
        })
        .catch((reason: unknown) => {
          setQuote(null);
          setError(reason instanceof Error ? reason.message : "Quote failed.");
        });
    }, 400);
    return () => clearTimeout(handle);
  }, [firstBuy, config]);

  async function prepare() {
    setError(null);
    setResult(null);
    setPlan(null);
    if (!address) {
      setError("Connect a wallet first. The connected account becomes the token creator.");
      return;
    }
    const imageUrl = image.trim() ? httpsUrl(image) : null;
    if (image.trim() && !imageUrl) {
      setError("Image URL must start with https://.");
      return;
    }
    const metadataUri = metadataOverride.trim() || buildMetadataUri({
      name: name.trim(),
      symbol: symbol.trim(),
      image: imageUrl ?? undefined,
      description: description.trim() || undefined,
    });
    setBusy("Preparing an unsigned plan…");
    try {
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
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not prepare the launch.");
      setPlan(body as PlanView);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not prepare the launch.");
    } finally {
      setBusy(null);
    }
  }

  async function sign() {
    if (!plan) return;
    setError(null);
    setBusy(plan.replanAfterApproval ? "Waiting for the approval…" : "Waiting for the wallet…");
    try {
      const hash = await sendAll([plan.transaction]);
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
        Name, ticker, and an image URL are enough. Metadata is stored in the transaction as JSON, so no IPFS key is required.
      </p>

      {config ? (
        <div className="mt-4 rounded-2xl border border-line bg-card-2 px-4 py-3 text-sm leading-6 text-muted">
          <p>
            Config #{config.configId}
            {config.enabled ? " · enabled" : " · disabled"} · {config.tokenDecimals} decimals · quote {config.quoteSymbol}
          </p>
          <p>
            Pool creation fee {formatRaw(config.poolCreationFeeWei, 18)} ETH. Partner fees go to {shortAddress(config.partnerRecipient)}.
          </p>
          {config.usingPublicTemplate ? (
            <p className="mt-1 text-clay">
              This is the public template Config, so partner fees do not come to you. Run <code>npm run create-config</code> and set CONFIG_ID to use your own.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-sm text-danger">{configError || "Reading the live Config…"}</p>
      )}

      <div className="mt-5 grid gap-3">
        <label className="grid gap-1 text-sm text-muted">
          Name
          <input className="field" value={name} maxLength={32} onChange={(event) => setName(event.target.value)} placeholder="Moon Sample" />
        </label>
        <label className="grid gap-1 text-sm text-muted">
          Ticker
          <input className="field uppercase" value={symbol} maxLength={10} onChange={(event) => setSymbol(event.target.value.toUpperCase())} placeholder="MOON" />
        </label>
        <label className="grid gap-1 text-sm text-muted">
          Image URL
          <input className="field" value={image} onChange={(event) => setImage(event.target.value)} placeholder="https://…" />
        </label>
        <label className="grid gap-1 text-sm text-muted">
          Short description
          <input className="field" value={description} maxLength={140} onChange={(event) => setDescription(event.target.value)} placeholder="Optional" />
        </label>
        <label className="grid gap-1 text-sm text-muted">
          First buy ({config?.quoteSymbol ?? "quote token"}, optional)
          <input className="field" value={firstBuy} onChange={(event) => setFirstBuy(event.target.value)} placeholder="0.0001" inputMode="decimal" />
        </label>
        <details className="text-sm text-muted">
          <summary className="cursor-pointer">Use your own metadata URI</summary>
          <input className="field mt-2" value={metadataOverride} onChange={(event) => setMetadataOverride(event.target.value)} placeholder="https://… or data:application/json,…" />
        </details>
      </div>

      {quote ? (
        <p className="mt-3 text-sm text-clay">
          Estimated first buy: {formatRaw(quote.amountOutRaw, quote.tokenDecimals)} tokens, minimum {formatRaw(quote.minimumAmountOutRaw, quote.tokenDecimals)} at 1% slippage.
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      {busy ? <p className="mt-3 text-sm text-muted">{busy}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn btn-gold" disabled={Boolean(busy) || !config?.enabled} onClick={() => void prepare()}>
          Prepare launch
        </button>
        {plan ? (
          <button className="btn btn-ghost" disabled={Boolean(busy)} onClick={() => void sign()}>
            {plan.replanAfterApproval ? "Sign approval" : "Sign and send"}
          </button>
        ) : null}
      </div>

      {plan ? (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm leading-6 text-muted">
          {plan.summary.map((line) => (
            <li key={line}>{line}</li>
          ))}
          {plan.predictedToken ? <li>Predicted token {shortAddress(plan.predictedToken)}</li> : null}
        </ul>
      ) : null}

      {result ? (
        <div className="mt-4 text-sm leading-6">
          <a className="text-gold underline" href={explorerTx(result.hash)} target="_blank" rel="noreferrer">
            View transaction
          </a>
          {result.token ? <p>Token {result.token}</p> : null}
          {result.curve ? <p>Curve {result.curve}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
