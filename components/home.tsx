"use client";

import { brand } from "@/lib/brand";
import { publicChain } from "@/lib/chain";
import { CreateForm } from "@/components/create-form";
import { LaunchFeed } from "@/components/launch-feed";
import { WalletButton } from "@/components/wallet-button";

export function Home() {
  return (
    <>
      <div className="notice">
        <p className="shell py-2 text-center text-sm">{brand.testnetNotice}</p>
      </div>
      <header className="shell flex items-center justify-between gap-4 py-6">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full border border-gold/50 bg-card font-display text-xl text-gold" aria-hidden>
            {brand.name.slice(0, 1)}
          </span>
          <div>
            <p className="text-xs tracking-[0.16em] text-muted uppercase">{brand.builtWith}</p>
            <h1 className="font-display text-3xl leading-none sm:text-4xl">{brand.name}</h1>
          </div>
        </div>
        <WalletButton />
      </header>
      <main className="shell grid items-start gap-6 pb-16 lg:grid-cols-[minmax(0,430px)_minmax(0,1fr)]">
        <CreateForm />
        <LaunchFeed />
      </main>
      <footer className="shell flex flex-col gap-3 border-t border-line py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          {brand.name} on {publicChain.name}. {brand.builtWith}
        </p>
        <p className="flex flex-wrap gap-3">
          {brand.faucets.map((faucet) => (
            <a key={faucet.href} className="text-gold underline" href={faucet.href} target="_blank" rel="noreferrer">
              {faucet.label}
            </a>
          ))}
          <a className="underline" href={brand.guides.launchpad} target="_blank" rel="noreferrer">
            SDK launchpad guide
          </a>
        </p>
      </footer>
    </>
  );
}
