"use client";

import { useEffect, useRef, useState } from "react";
import { encodeFunctionData, parseEther, type Address } from "viem";
import { explorerAddress, explorerTx } from "@/lib/chain";
import { formatRaw, progressPercent, shortAddress, statusTone } from "@/lib/format";
import type { LaunchCard, PlanView, QuoteView, ReceiptView } from "@/lib/types";
import { useGiwa } from "@/components/giwa-wallet";

export function TokenModal({ launch: initialLaunch, onClose }: { launch: LaunchCard; onClose: () => void }) {
  const [launch, setLaunch] = useState(initialLaunch);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState("1");
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [plan, setPlan] = useState<PlanView | null>(null);
  const [wrapAmount, setWrapAmount] = useState("0.001");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [receiptSide, setReceiptSide] = useState<"buy" | "sell">("buy");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [receipt, setReceipt] = useState<ReceiptView | null>(null);

  const { address, chainId, sendAll, readBalance } = useGiwa();
  const [planKey, setPlanKey] = useState("");
  const formKey = JSON.stringify([address, chainId, amount, side, slippage, launch.curve]);
  const currentPlan = planKey === formKey ? plan : null;
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setPlan(null); }, [formKey]);
  const trading = launch.status === 1;
  const slippageBps = Math.round(Number(slippage) * 100);
  const [quoteBalance, setQuoteBalance] = useState<bigint | null>(null);
  const [tokenBalance, setTokenBalance] = useState<bigint | null>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Tab") {
        const items = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled)');
        if (items?.length) {
          const first = items[0], last = items[items.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      }
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [quoteValue, tokenValue] = await Promise.all([
        readBalance(launch.quoteToken as Address),
        readBalance(launch.token as Address),
      ]);
      if (!cancelled) {
        setQuoteBalance(quoteValue);
        setTokenBalance(tokenValue);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, launch.quoteToken, launch.token, readBalance, refreshVersion]);

  useEffect(() => {
    const controller = new AbortController();
    setQuote(null);
    if (!trading || !amount.trim()) {
      setQuote(null);
      return;
    }
    const handle = setTimeout(() => {
      void fetch("/api/quote", {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ curve: launch.curve, side, amount, slippageBps: Number.isInteger(slippageBps) ? slippageBps : 100 }),
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
    }, 350);
    return () => { clearTimeout(handle); controller.abort(); };
  }, [amount, side, slippageBps, launch.curve, trading]);

  async function prepare(action: "trade" | "migrate") {
    setError(null);
    setPlan(null);
    setReceipt(null);
    if (!address) {
      setError("Connect a wallet to prepare a transaction.");
      return;
    }
    setBusy("Checking your transaction…");
    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          curve: launch.curve,
          side,
          amount,
          slippageBps,
          account: address,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not prepare the transaction.");
      setPlanKey(formKey);
      setPlan(body as PlanView);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not prepare the transaction.");
    } finally {
      setBusy(null);
    }
  }

  async function sign() {
    if (!currentPlan) return;
    const plan = currentPlan;
    setPlan(null);
    setBusy("Waiting for the wallet…");
    setError(null);
    try {
      const txs = [...plan.approvalTransactions, plan.transaction];
      const sent = await sendAll(txs, setHash);
      setHash(sent);
      setRefreshVersion((value) => value + 1);
      void fetch(`/api/launches/${launch.token}`).then(async (response) => {
        if (response.ok) setLaunch(await response.json() as LaunchCard);
      }).catch(() => { /* Keep the last verified card if the public RPC is unavailable. */ });
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "receipt", kind: plan.action === "migrate" ? "migrate" : "swap", hash: sent }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error("Transaction confirmed. Details are temporarily unavailable; check the explorer.");
      setReceiptSide(side);
      setReceipt(body as ReceiptView);
      setRefreshVersion((value) => value + 1);
      setPlan(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The wallet request failed.");
    } finally {
      setBusy(null);
    }
  }

  async function wrap() {
    setError(null);
    setBusy("Wrapping ETH to the quote token…");
    try {
      if (launch.quoteSymbol !== "WETH") throw new Error(`Buys spend ${launch.quoteSymbol}. This form only wraps ETH when the quote token is WETH.`);
      if (parseEther(wrapAmount) <= 0n) throw new Error("Enter a positive amount to wrap.");
      const sent = await sendAll([
        {
          to: launch.quoteToken,
          data: encodeFunctionData({
            abi: [{ type: "function", name: "deposit", stateMutability: "payable", inputs: [], outputs: [] }],
            functionName: "deposit",
          }),
          value: parseEther(wrapAmount).toString(),
        },
      ]);
      setHash(sent);
      setQuoteBalance(await readBalance(launch.quoteToken as Address));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Wrap failed.");
    } finally {
      setBusy(null);
    }
  }

  const inputSymbol = side === "buy" ? launch.quoteSymbol : launch.symbol;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="token-title"
        className="panel max-h-[92vh] w-full max-w-xl overflow-auto p-5 sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs tracking-[0.16em] text-gold uppercase">{launch.symbol}</p>
            <h3 id="token-title" className="mt-1 font-display text-3xl">{launch.name}</h3>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={`pill ${statusTone(launch.status)}`}>{launch.statusLabel}</span>
          <a className="text-sm text-gold underline" href={explorerAddress(launch.token)} target="_blank" rel="noreferrer">Token</a>
          <a className="text-sm text-gold underline" href={explorerAddress(launch.curve)} target="_blank" rel="noreferrer">Curve</a>
          {launch.canonicalPool ? (
            <a className="text-sm text-gold underline" href={explorerAddress(launch.canonicalPool)} target="_blank" rel="noreferrer">Pool</a>
          ) : null}
        </div>
        <div className="mt-4 bar">
          <span style={{ width: `${progressPercent(launch.progressBps)}%` }} />
        </div>
        <p className="mt-2 text-sm text-muted">
          {progressPercent(launch.progressBps).toFixed(2)}% raised · creator {shortAddress(launch.creator)}
        </p>

        {launch.status === 2 ? (
          <div className="mt-4">
            <p className="text-sm leading-6 text-muted">The curve is full. Migration is a separate transaction and does not buy more tokens.</p>
            <button className="btn btn-gold mt-3" disabled={Boolean(busy)} onClick={() => void prepare("migrate")}>Prepare migration</button>
          </div>
        ) : null}
        {launch.status === 3 ? (
          <p className="mt-4 text-sm leading-6 text-muted">
            This token has graduated. Curve buys and sells are closed. The canonical pool is {launch.canonicalPool}.
          </p>
        ) : null}
        {launch.status === 0 ? <p className="mt-4 text-sm text-muted">Trading has not started on this curve.</p> : null}

        {trading ? (
          <fieldset disabled={Boolean(busy)} className="mt-5 grid min-w-0 gap-3">
            <div className="flex gap-2">
              {(["buy", "sell"] as const).map((choice) => (
                <button key={choice} className={side === choice ? "btn btn-gold" : "btn btn-ghost"} onClick={() => { setSide(choice); setPlan(null); }}>
                  {choice === "buy" ? "Buy" : "Sell"}
                </button>
              ))}
            </div>
            <label className="grid gap-1 text-sm text-muted">
              Amount ({inputSymbol})
              <input className="field" value={amount} onChange={(event) => { setAmount(event.target.value); setPlan(null); }} inputMode="decimal" />
            </label>
            <label className="grid gap-1 text-sm text-muted">
              Slippage %
              <input className="field" value={slippage} onChange={(event) => { setSlippage(event.target.value); setPlan(null); }} inputMode="decimal" />
            </label>
            {quote ? (
              <p className="text-sm leading-6 text-muted">
                Expected {formatRaw(quote.amountOutRaw, side === "buy" ? quote.tokenDecimals : quote.quoteDecimals)} {side === "buy" ? launch.symbol : launch.quoteSymbol}.
                Minimum {formatRaw(quote.minimumAmountOutRaw, side === "buy" ? quote.tokenDecimals : quote.quoteDecimals)}. {quote.fillKind !== "full" ? quote.message : null}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 text-xs text-muted">
              <span>Wallet {launch.quoteSymbol}: {quoteBalance !== null ? formatRaw(quoteBalance, launch.quoteDecimals, 4) : "—"}</span>
              <span>{launch.symbol}: {tokenBalance !== null ? formatRaw(tokenBalance, launch.decimals, 4) : "—"}</span>
            </div>
            {launch.quoteSymbol === "WETH" ? (
              <div className="rounded-2xl border border-line p-3">
                <p className="text-sm text-muted">ETH pays gas. Buys spend WETH. Wrap only the amount you want to trade.</p>
                <div className="mt-2 flex gap-2">
                  <input className="field" aria-label="ETH to wrap" value={wrapAmount} onChange={(event) => setWrapAmount(event.target.value)} inputMode="decimal" />
                  <button className="btn btn-ghost shrink-0" disabled={Boolean(busy)} onClick={() => void wrap()}>Wrap ETH</button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">Buys spend {launch.quoteSymbol}. ETH is only for gas.</p>
            )}
            <button className="btn btn-gold" disabled={Boolean(busy)} onClick={() => void prepare("trade")}>Review {side}</button>
          </fieldset>
        ) : null}

        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        {busy ? <p className="mt-3 text-sm text-muted">{busy}</p> : null}
        {currentPlan ? (
          <div className="mt-4">
            <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-muted">
              {currentPlan.summary.map((line) => <li key={line}>{line}</li>)}
            </ul>
            <button className="btn btn-gold mt-3" disabled={Boolean(busy)} onClick={() => void sign()}>Confirm in wallet</button>
          </div>
        ) : null}
        {hash ? (
          <p className="mt-4 text-sm">
            <a className="text-gold underline" href={explorerTx(hash)} target="_blank" rel="noreferrer">View transaction</a>
            {receipt?.canonicalPool ? ` · pool ${shortAddress(receipt.canonicalPool)}` : null}
            {receipt?.amountOut ? ` · received ${formatRaw(receipt.amountOut, receiptSide === "buy" ? launch.decimals : launch.quoteDecimals)}` : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}
