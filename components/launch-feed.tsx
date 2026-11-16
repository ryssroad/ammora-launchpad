"use client";

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
  }, []);

  async function openAddress() {
    setLookupError(null);
    const response = await fetch(`/api/launches/${lookup.trim()}`);
    const body = await response.json();
    if (!response.ok) {
      setLookupError(body.error || "That address could not be read.");
      return;
    }
    setSelected(body as LaunchCard);
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
        {feed?.source === "data-api"
          ? "Indexed by the Ammora Data API for GIWA Sepolia."
          : "On-chain reads from the reviewed launch factory."}
      </p>
      {feed?.warning ? <p className="mt-3 text-sm text-clay">{feed.warning}</p> : null}
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      <div className="mt-4 flex gap-2">
        <input
          className="field"
          value={lookup}
          onChange={(event) => setLookup(event.target.value)}
          placeholder="Open a token or curve address"
        />
        <button className="btn btn-ghost shrink-0" onClick={() => void openAddress()}>
          Open
        </button>
      </div>
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
              <div className="flex items-center gap-3">
                {launch.image ? (
                  // User-provided token art from arbitrary https hosts.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={launch.image} alt="" className="h-11 w-11 rounded-full object-cover" />
                ) : (
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-paper font-display text-gold">
                    {launch.symbol.slice(0, 1)}
                  </span>
                )}
                <div>
                  <p className="font-medium">{launch.name}</p>
                  <p className="text-sm text-muted">{launch.symbol}</p>
                </div>
              </div>
              <span className={`pill ${statusTone(launch.status)}`}>{launch.statusLabel}</span>
            </div>
            <div className="mt-3 bar">
              <span style={{ width: `${progressPercent(launch.progressBps)}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted">
              {progressPercent(launch.progressBps).toFixed(2)}% of the quote threshold ·{" "}
              {formatRaw(launch.quoteReserve, launch.quoteDecimals, 4)} / {formatRaw(launch.quoteThreshold, launch.quoteDecimals, 4)} {launch.quoteSymbol}
            </p>
          </button>
        ))}
        {feed && feed.launches.length === 0 ? (
          <p className="text-sm text-muted">No recent launches were readable at the confirmed head.</p>
        ) : null}
      </div>
      {selected ? <TokenModal launch={selected} onClose={() => setSelected(null)} /> : null}
    </section>
  );
}
