"use client";

import { isAddress } from "viem";
import { useEffect, useState } from "react";
import { formatRaw, progressPercent, statusTone } from "@/lib/format";
import type { FeedResponse, LaunchCard } from "@/lib/types";
import { TokenModal } from "@/components/token-modal";

export function LaunchFeed() {
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lookup, setLookup] = useState("");
  const [selected, setSelected] = useState<LaunchCard | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    void fetch("/api/launches")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load launches.");
        setFeed(body as FeedResponse);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load launches."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    window.addEventListener("launch-created", load);
    return () => window.removeEventListener("launch-created", load);
  }, []);

  async function openAddress() {
    setLookupError(null);
    if (!isAddress(lookup.trim())) { setLookupError("Enter a valid token address (0x…)."); return; }
    setLookingUp(true);
    try {
      const response = await fetch(`/api/launches/${lookup.trim()}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "That token could not be found.");
      setSelected(body as LaunchCard);
    } catch (reason) {
      setLookupError(reason instanceof Error ? reason.message : "Could not load this token. Try again.");
    } finally { setLookingUp(false); }
  }

  return (
    <section className="panel p-5 sm:p-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.18em] text-gold uppercase">Markets</p>
          <h2 className="mt-2 font-display text-3xl">Recent launches</h2>
        </div>
        <button className="btn btn-ghost" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted">
        Find a token you like. Open it to buy, sell, or follow its progress.
      </p>
      {feed?.warning ? <p className="mt-3 text-sm text-clay">Showing recent on-chain launches while the full list is unavailable.</p> : null}
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); void openAddress(); }}>
        <input
          className="field"
          value={lookup}
          onChange={(event) => { setLookup(event.target.value); setLookupError(null); }}
          aria-label="Token address"
          placeholder="Paste a token address…"
        />
        <button className="btn btn-ghost shrink-0" type="submit" disabled={lookingUp}>
          {lookingUp ? "Finding…" : "Find"}
        </button>
      </form>
      {lookupError ? <p className="mt-2 text-sm text-danger">{lookupError}</p> : null}

      <div className="mt-5 grid gap-3">
        {loading && !feed
          ? Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-2xl bg-card-2" />
            ))
          : null}
        {feed?.launches.map((launch) => (
          <button
            key={launch.curve}
            className="rounded-2xl border border-line bg-card-2 p-4 text-left transition hover:border-gold"
            onClick={() => setSelected(launch)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {launch.image ? (
                  // User-provided token art from arbitrary https hosts.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={launch.image} alt="" className="h-12 w-12 shrink-0 rounded-2xl object-cover" loading="lazy" referrerPolicy="no-referrer" />
                ) : (
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-paper font-display text-gold">
                    {launch.symbol.slice(0, 1)}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium">{launch.name}</p>
                  <p className="text-sm text-muted">{launch.symbol}</p>
                </div>
              </div>
              <span className={`pill shrink-0 ${statusTone(launch.status)}`}>{launch.statusLabel}</span>
            </div>
            <div className="mt-3 bar">
              <span style={{ width: `${progressPercent(launch.progressBps)}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted">
              {progressPercent(launch.progressBps).toFixed(2)}% to graduation ·{" "}
              {formatRaw(launch.quoteReserve, launch.quoteDecimals, 4)} / {formatRaw(launch.quoteThreshold, launch.quoteDecimals, 4)} {launch.quoteSymbol}
            </p>
          </button>
        ))}
        {feed && feed.launches.length === 0 ? (
          <p className="text-sm text-muted">No recent tokens yet. Yours could be next.</p>
        ) : null}
      </div>
      {selected ? <TokenModal launch={selected} onClose={() => setSelected(null)} /> : null}
    </section>
  );
}
